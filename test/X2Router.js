const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadFixtures, deployContract } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime, mineBlock } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2Router", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let weth
  let factory
  let router
  let market
  let bullToken
  let bearToken
  let feeToken
  let feeReceiver

  beforeEach(async () => {
    const fixtures = await loadFixtures(provider, wallet)
    weth = fixtures.weth
    factory = fixtures.factory
    router = fixtures.router
    market = fixtures.market
    bullToken = fixtures.bullToken
    bearToken = fixtures.bearToken
    feeToken = fixtures.feeToken
    feeReceiver = fixtures.feeReceiver
  })

  it("inits", async () => {
    expect(await router.factory()).eq(factory.address)
    expect(await router.weth()).eq(weth.address)
  })

  it("deposit", async () => {
    const token0 = await deployContract("X2Token", [market.address, router.address, "X2:BULL"])
    await weth.connect(user0).deposit({ value: 100 })
    await weth.connect(user0).approve(router.address, 100)
    await expect(router.connect(user0).deposit(token0.address, 100, maxUint256))
      .to.be.revertedWith("X2Market: unsupported token")

    const token1 = await deployContract("X2Token", [user0.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).deposit(token1.address, 100, maxUint256))
      .to.be.revertedWith("X2Router: unsupported market")

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(100)
    await router.connect(user0).deposit(bullToken.address, 100, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(100)
    expect(await weth.balanceOf(user0.address)).eq(0)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    await weth.connect(user1).deposit({ value: 2000 })
    await weth.connect(user1).approve(router.address, 2000)

    expect(await weth.balanceOf(market.address)).eq(100)
    expect(await weth.balanceOf(user1.address)).eq(2000)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
    await router.connect(user1).deposit(bullToken.address, 2000, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(2100)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(1996) // 2000 - 4
    expect(await market.feeReserve()).eq(4)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(2100)
    expect(await market.feeReserve()).eq(4)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(4)
    expect(await weth.balanceOf(market.address)).eq(2096)
    expect(await market.feeReserve()).eq(0)

    expect(await weth.balanceOf(feeReceiver.address)).eq(4)
    expect(await weth.balanceOf(market.address)).eq(2096)
    expect(await market.feeReserve()).eq(0)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(4)
    expect(await weth.balanceOf(market.address)).eq(2096)
    expect(await market.feeReserve()).eq(0)
  })

  it("depositETH", async () => {
    const token0 = await deployContract("X2Token", [market.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).depositETH(token0.address, maxUint256, { value: 100 }))
      .to.be.revertedWith("X2Market: unsupported token")

    const token1 = await deployContract("X2Token", [user0.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).depositETH(token1.address, maxUint256, { value: 100 }))
      .to.be.revertedWith("X2Router: unsupported market")

    expect(await weth.balanceOf(market.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: 100 })
    expect(await weth.balanceOf(market.address)).eq(100)
    expect(await weth.balanceOf(user0.address)).eq(0)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await weth.balanceOf(market.address)).eq(100)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
    await router.connect(user1).depositETH(bullToken.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2100)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(1996) // 2000 - 4
    expect(await market.feeReserve()).eq(4)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(2100)
    expect(await market.feeReserve()).eq(4)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(4)
    expect(await weth.balanceOf(market.address)).eq(2096)
    expect(await market.feeReserve()).eq(0)
  })

  it("depositSupportingFeeSubsidy", async () => {
    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)
    await feeToken.transfer(user0.address, 1)
    await feeToken.connect(user0).approve(router.address, 1)

    const token0 = await deployContract("X2Token", [market.address, router.address, "X2:BULL"])
    await weth.connect(user0).deposit({ value: 2000 })
    await weth.connect(user0).approve(router.address, 2000)
    await expect(router.connect(user0).depositSupportingFeeSubsidy(token0.address, 2000, 1, maxUint256))
      .to.be.revertedWith("X2Market: unsupported token")

    const token1 = await deployContract("X2Token", [user0.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).depositSupportingFeeSubsidy(token1.address, 2000, 1, maxUint256))
      .to.be.revertedWith("X2Router: unsupported market")

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await feeToken.balanceOf(market.address)).eq(0)
    await router.connect(user0).depositSupportingFeeSubsidy(bullToken.address, 2000, 1, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(1997)
    expect(await feeToken.balanceOf(market.address)).eq(1)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await market.feeReserve()).eq(3)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(3)
    expect(await weth.balanceOf(market.address)).eq(1997)
    expect(await market.feeReserve()).eq(0)
  })

  it("depositETHSupportingFeeSubsidy", async () => {
    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)
    await feeToken.transfer(user0.address, 1)
    await feeToken.connect(user0).approve(router.address, 1)

    const token0 = await deployContract("X2Token", [market.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).depositETHSupportingFeeSubsidy(token0.address, 1, maxUint256, { value: 2000 }))
      .to.be.revertedWith("X2Market: unsupported token")

    const token1 = await deployContract("X2Token", [user0.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).depositETHSupportingFeeSubsidy(token1.address, 1, maxUint256, { value: 2000 }))
      .to.be.revertedWith("X2Router: unsupported market")

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await feeToken.balanceOf(market.address)).eq(0)
    await router.connect(user0).depositETHSupportingFeeSubsidy(bullToken.address, 1, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(1997)
    expect(await feeToken.balanceOf(market.address)).eq(1)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await market.feeReserve()).eq(3)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(3)
    expect(await weth.balanceOf(market.address)).eq(1997)
    expect(await market.feeReserve()).eq(0)
  })

  it("withdraw", async () => {
    const receiver0 = { address: "0xaf5a9b193686d46e17b5b0bd80a1fe293a14e543" }
    const receiver1 = { address: "0x81cc5fb4deace243e2aab3b838ae3add3a52cdc7" }

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    const token0 = await deployContract("X2Token", [market.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).withdraw(token0.address, 100, receiver0.address, maxUint256))
      .to.be.revertedWith("X2Market: unsupported token")

    const token1 = await deployContract("X2Token", [user0.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).withdraw(token1.address, 100, receiver0.address, maxUint256))
      .to.be.revertedWith("X2Router: unsupported market")

    await expect(router.connect(user0).withdraw(bullToken.address, 2000, receiver0.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 59 * 60)
    await mineBlock(provider)

    await expect(router.connect(user0).withdraw(bullToken.address, 2000, receiver0.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 2 * 60)
    await mineBlock(provider)

    await router.connect(user0).withdraw(bullToken.address, 2000, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await router.connect(user1).depositETH(bullToken.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    await expect(router.connect(user1).withdraw(bullToken.address, 5000, receiver1.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 59 * 60)
    await mineBlock(provider)

    await expect(router.connect(user1).withdraw(bullToken.address, 5000, receiver1.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 2 * 60)
    await mineBlock(provider)

    expect(await market.feeReserve()).eq(0)
    await router.connect(user1).withdraw(bullToken.address, 5000, receiver1.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(10)
    expect(await weth.balanceOf(receiver1.address)).eq(4990) // 5000 - 10
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(10)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(10)
    expect(await market.feeReserve()).eq(10)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(10)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
  })

  it("withdrawETH", async () => {
    const receiver0 = { address: "0x096b7f612187ca4d608309829fb07faf67ff2364" }
    const receiver1 = { address: "0x42b712f6740cd401f6a9af7ca50f7b67203907ae" }

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    const token0 = await deployContract("X2Token", [market.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).withdrawETH(token0.address, 100, receiver0.address, maxUint256))
      .to.be.revertedWith("X2Market: unsupported token")

    const token1 = await deployContract("X2Token", [user0.address, router.address, "X2:BULL"])
    await expect(router.connect(user0).withdrawETH(token1.address, 100, receiver0.address, maxUint256))
      .to.be.revertedWith("X2Router: unsupported market")

    await expect(router.connect(user0).withdrawETH(bullToken.address, 2000, receiver0.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 59 * 60)
    await mineBlock(provider)

    await expect(router.connect(user0).withdrawETH(bullToken.address, 2000, receiver0.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 2 * 60)
    await mineBlock(provider)

    await router.connect(user0).withdrawETH(bullToken.address, 2000, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await provider.getBalance(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await router.connect(user1).depositETH(bullToken.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await provider.getBalance(receiver1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    await expect(router.connect(user1).withdrawETH(bullToken.address, 5000, receiver1.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 59 * 60)
    await mineBlock(provider)

    await expect(router.connect(user1).withdrawETH(bullToken.address, 5000, receiver1.address, maxUint256))
      .to.be.revertedWith("X2Token: account not yet unlocked")

    await increaseTime(provider, 2 * 60)
    await mineBlock(provider)

    expect(await market.feeReserve()).eq(0)
    await router.connect(user1).withdrawETH(bullToken.address, 5000, receiver1.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(10)
    expect(await provider.getBalance(receiver1.address)).eq(4990) // 5000 - 10
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(10)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(10)
    expect(await market.feeReserve()).eq(10)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(10)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
  })
})
