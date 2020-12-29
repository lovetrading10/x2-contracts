const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadETHFixtures, contractAt, deployContract } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2Token", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let bullToken
  let bearToken
  let priceFeed
  let router
  let market
  let factory

  beforeEach(async () => {
    const fixtures = await loadETHFixtures(provider)
    bullToken = fixtures.bullToken
    bearToken = fixtures.bearToken
    router = fixtures.router
    priceFeed = fixtures.priceFeed
    market = fixtures.market
    factory = fixtures.factory
  })

  it("inits", async () => {
    const token = await deployContract("X2Token", [])
    await token.initialize(user0.address, user1.address)
    expect(await token.factory()).eq(user0.address)
    expect(await token.market()).eq(user1.address)

    await expect(token.initialize(user0.address, user1.address))
      .to.be.revertedWith("X2Token: already initialized")
  })

  it("setDistributor", async () => {
    const token = await deployContract("X2Token", [])
    await token.initialize(user0.address, user1.address)

    await expect(token.connect(user1).setDistributor(user2.address))
      .to.be.revertedWith("X2Token: forbidden")

    expect(await token.distributor()).eq(ethers.constants.AddressZero)

    await token.connect(user0).setDistributor(user2.address)
    expect(await token.distributor()).eq(user2.address)
  })

  it("setInfo", async () => {
    const token = await deployContract("X2Token", [])
    await token.initialize(user0.address, user1.address)

    await expect(token.connect(user1).setInfo("X2:BULL Token", "X2:BULL"))
      .to.be.revertedWith("X2Token: forbidden")

    expect(await token.name()).eq("X2")
    expect(await token.symbol()).eq("X2")

    await token.connect(user0).setInfo("X2:BULL Token", "X2:BULL")
    expect(await token.name()).eq("X2:BULL Token")
    expect(await token.symbol()).eq("X2:BULL")
  })

  it("mint", async () => {
    await expect(bullToken.mint(user0.address, 100, 10))
      .to.be.revertedWith("X2Token: forbidden")
  })

  it("burn", async () => {
    await expect(bullToken.burn(user0.address, 100, true))
      .to.be.revertedWith("X2Token: forbidden")
  })

  it("transfer", async () => {
    const receiver0 = { address: "0xfa18fb78c87962fad9ab85abac0acc57e7fd6556" }
    const receiver1 = { address: "0xf4db8792561d10bf9a0f735dc22422219f57e665" }

    await market.connect(user0).buy(bullToken.address, user0.address, { value: 100 })
    expect(await bullToken.balanceOf(user0.address)).eq(100)

    await priceFeed.setLatestAnswer(toChainlinkPrice(500))
    await bullToken.connect(user0).transfer(user1.address, 70)

    expect(await bullToken.balanceOf(user0.address)).eq(30)
    expect(await bullToken.balanceOf(user1.address)).eq(70)

    await expect(market.connect(user0).sell(bullToken.address, 31, receiver0.address))
      .to.be.revertedWith("SafeMath: subtraction overflow")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await market.connect(user0).sell(bullToken.address, 30, receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq(30)

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await market.connect(user1).sell(bullToken.address, 70, receiver1.address)
    expect(await provider.getBalance(receiver1.address)).eq(70)
  })

  it("transferFrom", async () => {
    expect(await bullToken.totalSupply()).eq(0)
    await market.connect(user0).buy(bullToken.address, user0.address, { value: 100 })
    expect(await bullToken.balanceOf(user0.address)).eq(100)
    expect(await bullToken.totalSupply()).eq(100)

    await bullToken.connect(user0).approve(user2.address, 60)
    expect(await bullToken.allowance(user0.address, user2.address)).eq(60)
    await bullToken.connect(user2).transferFrom(user0.address, user1.address, 20)
    expect(await bullToken.balanceOf(user0.address)).eq(80)
    expect(await bullToken.balanceOf(user1.address)).eq(20)
    expect(await bullToken.allowance(user0.address, user2.address)).eq(40)
    expect(await bullToken.totalSupply()).eq(100)

    await expect(bullToken.connect(user2).transferFrom(user0.address, user1.address, 41))
      .to.be.revertedWith("X2Token: transfer amount exceeds allowance")

    await priceFeed.setLatestAnswer(toChainlinkPrice(500))
    await bullToken.connect(user2).transferFrom(user0.address, user1.address, 40)

    expect(await bullToken.balanceOf(user0.address)).eq(40)
    expect(await bullToken.balanceOf(user1.address)).eq(60)
    expect(await bullToken.allowance(user0.address, user2.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(100)
  })

  it("rewards 1", async () => {
    const receiver0 = { address: "0xa5156f16207152f54c124f096298c7797ba4cc06" }
    const distributor = await deployContract("MockDistributor", [])
    await factory.setDistributor(bullToken.address, distributor.address)

    expect(await bullToken.totalSupply()).eq(0)
    await market.connect(user0).buy(bullToken.address, user0.address, { value: 100 })
    expect(await bullToken.balanceOf(user0.address)).eq(100)
    expect(await bullToken.totalSupply()).eq(100)

    await wallet.sendTransaction({ to: distributor.address, value: 500 })

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await bullToken.connect(user0).claim(receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq(500)

    await bullToken.connect(user0).claim(receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq(500)
  })

  it("rewards 2", async () => {
    const receiver0 = { address: "0xfcff3e453fb0b22a9548cda6cdef9eb3cc0a8026" }
    const receiver1 = { address: "0x0028732f7733e981a645c9bc1dc6998e2a02666d" }
    const distributor = await deployContract("MockDistributor", [])
    await factory.setDistributor(bullToken.address, distributor.address)

    expect(await bullToken.totalSupply()).eq(0)
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bullToken.address, user1.address, { value: expandDecimals(90, 18) })
    expect(await bullToken.balanceOf(user1.address)).eq(expandDecimals(90, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(100, 18))

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(500, 18) })

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await bullToken.connect(user0).claim(receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq(expandDecimals(50, 18))

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await bullToken.connect(user1).claim(receiver1.address)
    expect(await provider.getBalance(receiver1.address)).eq(expandDecimals(450, 18))

    await bullToken.connect(user0).claim(receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq(expandDecimals(50, 18))

    await bullToken.connect(user1).claim(receiver1.address)
    expect(await provider.getBalance(receiver1.address)).eq(expandDecimals(450, 18))
  })

  it("rewards after sell", async () => {
    const receiver0 = { address: "0x09a71a8ba59110da78650925d3436c6be2e38137" }
    const receiver1 = { address: "0xc75cd6531c82a562172cc15502605a3da60345ad" }
    const distributor = await deployContract("MockDistributor", [])
    await factory.setDistributor(bullToken.address, distributor.address)

    expect(await bullToken.totalSupply()).eq(0)
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bullToken.address, user1.address, { value: expandDecimals(90, 18) })
    expect(await bullToken.balanceOf(user1.address)).eq(expandDecimals(90, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(100, 18))

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(100, 18) })

    await market.connect(user1).sell(bullToken.address, expandDecimals(50, 18), user1.address)
    expect(await bullToken.balanceOf(user1.address)).eq(expandDecimals(40, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(50, 18))

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(500, 18) })

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await bullToken.connect(user0).claim(receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq(expandDecimals(110, 18)) // 10 + 10 / 50 * 500

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await bullToken.connect(user1).claim(receiver1.address)
    expect(await provider.getBalance(receiver1.address)).eq(expandDecimals(490, 18)) // 90 + 40 / 50 * 500
  })

  it("rewards after price change", async () => {
    const receiver0 = { address: "0x5a0460ea4b957aab698016516190e0cbc9b73000" }
    const receiver2 = { address: "0xaeb6056823c24ff7aff7b855394568c020598a48" }
    const distributor = await deployContract("MockDistributor", [])
    await factory.setDistributor(bullToken.address, distributor.address)

    expect(await bullToken.totalSupply()).eq(0)
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(900))
    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000")
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))

    await market.connect(user2).buy(bullToken.address, user2.address, { value: expandDecimals(7, 18) })
    expect(await bullToken.balanceOf(user2.address)).eq(expandDecimals(7, 18))
    expect(await bullToken.totalSupply()).eq("13999999999860000000")

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(100, 18) })

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await bullToken.connect(user0).claim(receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("49999999999000000000")

    expect(await provider.getBalance(receiver2.address)).eq(0)
    await bullToken.connect(user2).claim(receiver2.address)
    expect(await provider.getBalance(receiver2.address)).eq("49999999999999999999")
  })
})
