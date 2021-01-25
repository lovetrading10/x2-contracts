const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadETHFixtures, contractAt, deployContract } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime,
  mineBlock, newWallet } = require("./shared/utilities")
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
  let feeSplitToken

  beforeEach(async () => {
    const fixtures = await loadETHFixtures(provider)
    bullToken = fixtures.bullToken
    bearToken = fixtures.bearToken
    router = fixtures.router
    priceFeed = fixtures.priceFeed
    market = fixtures.market
    factory = fixtures.factory
    feeSplitToken = await deployContract("X2FeeSplit", ["X2 Fee Split", "X2FS", expandDecimals(50000, 18)])
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

    await expect(token.connect(user1).setDistributor(user2.address, feeSplitToken.address))
      .to.be.revertedWith("X2Token: forbidden")

    expect(await token.distributor()).eq(ethers.constants.AddressZero)
    expect(await token.rewardToken()).eq(ethers.constants.AddressZero)

    await token.connect(user0).setDistributor(user2.address, feeSplitToken.address)
    expect(await token.distributor()).eq(user2.address)
    expect(await token.rewardToken()).eq(feeSplitToken.address)
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
    await expect(bullToken.connect(user0).transfer(user1.address, 70))
      .to.be.revertedWith("X2Token: holding time not yet passed")

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    await bullToken.connect(user0).transfer(user1.address, 70)

    expect(await bullToken.balanceOf(user0.address)).eq(30)
    expect(await bullToken.balanceOf(user1.address)).eq(70)

    await expect(market.connect(user0).sell(bullToken.address, expandDecimals(1, 31), receiver0.address, ethers.constants.AddressZero))
      .to.be.revertedWith("SafeMath: subtraction overflow")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await market.connect(user0).sell(bullToken.address, expandDecimals(1, 30), receiver0.address, ethers.constants.AddressZero)
    expect(await provider.getBalance(receiver0.address)).eq(30)

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await market.connect(user1).sell(bullToken.address, expandDecimals(1, 30), receiver1.address, ethers.constants.AddressZero)
    expect(await provider.getBalance(receiver1.address)).eq(70)
  })

  it("transferFrom", async () => {
    expect(await bullToken.totalSupply()).eq(0)
    await market.connect(user0).buy(bullToken.address, user0.address, { value: 100 })
    expect(await bullToken.balanceOf(user0.address)).eq(100)
    expect(await bullToken.totalSupply()).eq(100)

    await bullToken.connect(user0).approve(user2.address, 60)
    expect(await bullToken.allowance(user0.address, user2.address)).eq(60)
    await expect(bullToken.connect(user2).transferFrom(user0.address, user1.address, 20))
      .to.be.revertedWith("X2Token: holding time not yet passed")

    await increaseTime(provider, 11 * 60)
    await mineBlock(provider)

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
    const receiver0 = newWallet()
    const distributor = await deployContract("X2RewardDistributor", [])
    await factory.setDistributor(bullToken.address, distributor.address, feeSplitToken.address)
    await feeSplitToken.transfer(distributor.address, expandDecimals(41, 18))

    await distributor.setDistribution([bullToken.address], [expandDecimals(20, 18)], [feeSplitToken.address])

    expect(await bullToken.totalSupply()).eq(0)
    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: 1000000000000 })
    expect(await bullToken.balanceOf(user0.address)).eq(998000000000)
    expect(await bullToken.totalSupply()).eq(998000000000)

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    expect(await feeSplitToken.balanceOf(receiver0.address)).eq(0)
    await bullToken.connect(user0).claim(receiver0.address)
    expect(await feeSplitToken.balanceOf(receiver0.address)).eq("19999999999999999917")

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    await bullToken.connect(user0).claim(receiver0.address)
    expect(await feeSplitToken.balanceOf(receiver0.address)).eq("39999999999999999834")

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    await bullToken.connect(user0).claim(receiver0.address)
    expect(await feeSplitToken.balanceOf(receiver0.address)).eq("39999999999999999834")
  })

  it("rewards 2", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()
    const distributor = await deployContract("X2RewardDistributor", [])
    await factory.setDistributor(bullToken.address, distributor.address, feeSplitToken.address)
    await feeSplitToken.transfer(distributor.address, expandDecimals(41, 18))

    await distributor.setDistribution([bullToken.address], [expandDecimals(20, 18)], [feeSplitToken.address])

    expect(await bullToken.totalSupply()).eq(0)
    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(90, 18) })
    expect(await bullToken.balanceOf(user1.address)).eq("89820000000000000000")
    expect(await bullToken.totalSupply()).eq("99800000000000000000")

    await increaseTime(provider, 60 * 60 + 1)
    await mineBlock(provider)

    expect(await feeSplitToken.balanceOf(receiver0.address)).eq(0)
    await bullToken.connect(user0).claim(receiver0.address)
    expect(await feeSplitToken.balanceOf(receiver0.address)).eq("1999999999968000000")

    expect(await feeSplitToken.balanceOf(receiver1.address)).eq(0)
    await bullToken.connect(user1).claim(receiver1.address)
    expect(await feeSplitToken.balanceOf(receiver1.address)).eq("17999999999712000000")

    await bullToken.connect(user0).claim(receiver0.address)
    expect(await feeSplitToken.balanceOf(receiver0.address)).eq("1999999999968000000")

    await bullToken.connect(user1).claim(receiver1.address)
    expect(await feeSplitToken.balanceOf(receiver1.address)).eq("17999999999712000000")
  })
})
