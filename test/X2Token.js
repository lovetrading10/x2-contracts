const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadFixtures, contractAt } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime, mineBlock } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2Token", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let bullToken
  let priceFeed
  let router
  let market

  beforeEach(async () => {
    const fixtures = await loadFixtures(provider, wallet)
    bullToken = fixtures.bullToken
    router = fixtures.router
    priceFeed = fixtures.priceFeed
    market = fixtures.market
  })

  it("deposit", async () => {
    expect(await bullToken.unlockTimestamps(user0.address)).eq(0)

    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: 100 })
    expect(await bullToken.balanceOf(user0.address)).eq(100)

    expect(await bullToken.unlockTimestamps(user0.address)).gt(0)
  })

  it("withdraw", async () => {
    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: 100 })
    expect(await bullToken.balanceOf(user0.address)).eq(100)

    await expect(router.connect(user0).withdrawETH(bullToken.address, 100, user1.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 59 * 60)
    await mineBlock(provider)

    await expect(router.connect(user0).withdrawETH(bullToken.address, 100, user1.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 2 * 60)
    await mineBlock(provider)

    await router.connect(user0).withdrawETH(bullToken.address, 100, user1.address, maxUint256)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
  })

  it("mint", async () => {
    await expect(bullToken.mint(user0.address, 100))
      .to.be.revertedWith("X2Token: forbidden")
  })

  it("burn", async () => {
    await expect(bullToken.burn(user0.address, 100))
      .to.be.revertedWith("X2Token: forbidden")
  })

  it("transfer", async () => {
    const receiver0 = { address: "0xfa18fb78c87962fad9ab85abac0acc57e7fd6556" }
    const receiver1 = { address: "0xf4db8792561d10bf9a0f735dc22422219f57e665" }

    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: 100 })
    expect(await bullToken.balanceOf(user0.address)).eq(100)

    await expect(bullToken.connect(user0).transfer(user1.address, 100))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 59 * 60)
    await mineBlock(provider)

    await expect(bullToken.connect(user0).transfer(user1.address, 100))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 2 * 60)
    await mineBlock(provider)

    await priceFeed.setLatestAnswer(toChainlinkPrice(500))

    expect(await market.lastPrice()).eq(toChainlinkPrice(1000))
    await bullToken.connect(user0).transfer(user1.address, 70)
    // check that rebase is called, rebase updates lastPrice
    expect(await market.lastPrice()).eq(toChainlinkPrice(500))

    expect(await bullToken.balanceOf(user0.address)).eq(30)
    expect(await bullToken.balanceOf(user1.address)).eq(70)

    await expect(router.connect(user0).withdrawETH(bullToken.address, 31, user1.address, maxUint256))
      .to.be.revertedWith("SafeMath: subtraction overflow")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await router.connect(user0).withdrawETH(bullToken.address, 30, receiver0.address, maxUint256)
    expect(await provider.getBalance(receiver0.address)).eq(30)

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await router.connect(user1).withdrawETH(bullToken.address, 70, receiver1.address, maxUint256)
    expect(await provider.getBalance(receiver1.address)).eq(70)
  })

  it("transferFrom", async () => {
    expect(await bullToken.totalSupply()).eq(0)
    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: 100 })
    expect(await bullToken.balanceOf(user0.address)).eq(100)
    expect(await bullToken.totalSupply()).eq(100)

    await bullToken.connect(user0).approve(user2.address, 60)

    await expect(bullToken.connect(user2).transferFrom(user0.address, user1.address, 20))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 59 * 60)
    await mineBlock(provider)

    await expect(bullToken.connect(user2).transferFrom(user0.address, user1.address, 20))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 2 * 60)
    await mineBlock(provider)

    expect(await bullToken.allowance(user0.address, user2.address)).eq(60)
    await bullToken.connect(user2).transferFrom(user0.address, user1.address, 20)
    expect(await bullToken.balanceOf(user0.address)).eq(80)
    expect(await bullToken.balanceOf(user1.address)).eq(20)
    expect(await bullToken.allowance(user0.address, user2.address)).eq(40)
    expect(await bullToken.totalSupply()).eq(100)

    await expect(bullToken.connect(user2).transferFrom(user0.address, user1.address, 41))
      .to.be.revertedWith("X2Token: transfer amount exceeds allowance")

    await priceFeed.setLatestAnswer(toChainlinkPrice(500))

    expect(await market.lastPrice()).eq(toChainlinkPrice(1000))
    await bullToken.connect(user2).transferFrom(user0.address, user1.address, 40)
    // check that rebase is called, rebase updates lastPrice
    expect(await market.lastPrice()).eq(toChainlinkPrice(500))

    expect(await bullToken.balanceOf(user0.address)).eq(40)
    expect(await bullToken.balanceOf(user1.address)).eq(60)
    expect(await bullToken.allowance(user0.address, user2.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(100)
  })
})