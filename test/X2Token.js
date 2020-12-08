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
  let router

  beforeEach(async () => {
    const fixtures = await loadFixtures(provider, wallet)
    bullToken = fixtures.bullToken
    router = fixtures.router
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

    await bullToken.connect(user0).transfer(user1.address, 70)

    expect(await bullToken.balanceOf(user0.address)).eq(30)
    expect(await bullToken.balanceOf(user1.address)).eq(70)
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

    await bullToken.connect(user2).transferFrom(user0.address, user1.address, 40)
    expect(await bullToken.balanceOf(user0.address)).eq(40)
    expect(await bullToken.balanceOf(user1.address)).eq(60)
    expect(await bullToken.allowance(user0.address, user2.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(100)
  })
})
