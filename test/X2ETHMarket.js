const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadFixtures, contractAt } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime, mineBlock } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2ETHMarket", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
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

    await factory.createETHMarket(
      "X2:3XBULL:ETH/USD",
      "X2:3XBEAR:ETH/USD",
      priceFeed.address,
      30000, // multiplierBasisPoints, 300%
      9000 // maxProfitBasisPoints, 90%
    )

    const marketAddress = await factory.markets(1)
    market = await contractAt("X2ETHMarket", marketAddress)
    bullToken = await contractAt("X2Token", await market.bullToken())
    bearToken = await contractAt("X2Token", await market.bearToken())
  })

  it("inits", async () => {
    expect(await market.factory()).eq(factory.address)
    expect(await market.priceFeed()).eq(priceFeed.address)
    expect(await market.multiplierBasisPoints()).eq(30000)
    expect(await market.maxProfitBasisPoints()).eq(9000)

    expect(await market.previousBullDivisor()).eq("10000000000")
    expect(await market.previousBearDivisor()).eq("10000000000")
    expect(await market.cachedBullDivisor()).eq("10000000000")
    expect(await market.cachedBearDivisor()).eq("10000000000")

    expect(await bullToken.market()).eq(market.address)
    expect(await bearToken.market()).eq(market.address)
  })

  it("deposit", async () => {
    const tx0 = await market.connect(user0).deposit(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx0, "tx0 deposit gas used")
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    const tx1 = await market.connect(user0).deposit(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx1, "tx1 deposit gas used")

    const tx2 = await market.connect(user0).deposit(bearToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx2, "tx2 deposit gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))

    const tx3 = await market.connect(user1).deposit(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx3, "tx3 deposit gas used")
  })

})
