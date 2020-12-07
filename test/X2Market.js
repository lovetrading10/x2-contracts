const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadFixtures } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime, mineBlock } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2Market", function () {
  const provider = waffle.provider
  const [wallet, user0, user1] = provider.getWallets()
  let weth
  let factory
  let router
  let priceFeed
  let market
  let bullToken
  let bearToken

  beforeEach(async () => {
    const fixtures = await loadFixtures(provider, wallet)
    weth = fixtures.weth
    factory = fixtures.factory
    router = fixtures.router
    priceFeed = fixtures.priceFeed
    market = fixtures.market
    bullToken = fixtures.bullToken
    bearToken = fixtures.bearToken
  })

  it("inits", async () => {
    expect(await market.factory()).eq(factory.address)
    expect(await market.router()).eq(router.address)
    expect(await market.collateralToken()).eq(weth.address)
    expect(await market.priceFeed()).eq(priceFeed.address)
    expect(await market.multiplier()).eq(3)
    expect(await market.unlockDelay()).eq(60 * 60)
    expect(await market.maxProfitBasisPoints()).eq(9000)
  })

  it("deposit bullToken", async () => {
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    const tx = await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx, "depositETH gas used")

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))
  })

  it("withdraw bullToken", async () => {
    const receiver = { address: "0xd4e0a14f14bef2131384f3abdb9984ea50cef442" }
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: expandDecimals(10, 18) })

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    expect(await provider.getBalance(receiver.address)).eq(0)

    const tx = await router.connect(user0).withdrawETH(bullToken.address, expandDecimals(10, 18), receiver.address, maxUint256)
    await reportGasUsed(provider, tx, "withdrawETH gas used")

    expect(await provider.getBalance(receiver.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
  })

  it("deposit bearToken", async () => {
    expect(await bearToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    await router.connect(user0).depositETH(bearToken.address, maxUint256, { value: expandDecimals(10, 18) })

    expect(await bearToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))
  })

  it("withdraw bearToken", async () => {
    const receiver = { address: "0x466a9e7bcd0edda08f82a940e7ae697dd2985533" }
    expect(await bearToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    await router.connect(user0).depositETH(bearToken.address, maxUint256, { value: expandDecimals(10, 18) })

    expect(await bearToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    expect(await provider.getBalance(receiver.address)).eq(0)
    await router.connect(user0).withdrawETH(bearToken.address, expandDecimals(10, 18), receiver.address, maxUint256)
    expect(await provider.getBalance(receiver.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
  })

  it("rebase without counterparty tokens", async () => {
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: expandDecimals(10, 18) })

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))
  })

  it("rebase without price change", async () => {
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
  })

  it("rebase after price change", async () => {
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    await router.connect(user0).depositETH(bullToken.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    const bullBalance = await bullToken.balanceOf(user0.address)
    const bearBalance = await bearToken.balanceOf(user1.address)
    expect(bullBalance).eq(expandDecimals(13, 18))
    expect(bearBalance).eq(expandDecimals(7, 18))

    const totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq(expandDecimals(20, 18))

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(13, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(7, 18))
  })
})
