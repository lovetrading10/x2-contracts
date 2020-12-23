const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadETHFixtures, contractAt } = require("./shared/fixtures")
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
    const fixtures = await loadETHFixtures(provider, wallet)
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
    expect(await market.priceFeed()).eq(priceFeed.address)
    expect(await market.multiplierBasisPoints()).eq(30000)
    expect(await market.maxProfitBasisPoints()).eq(9000)

    expect(await market.cachedBullDivisor()).eq("100000000000000000000")
    expect(await market.cachedBearDivisor()).eq("100000000000000000000")

    expect(await bullToken.market()).eq(market.address)
    expect(await bearToken.market()).eq(market.address)
  })

  it("gas usage", async () => {
    const tx0 = await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx0, "tx0 buy gas used")
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    const tx1 = await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx1, "tx1 buy gas used")

    const tx2 = await market.connect(user0).buy(bearToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx2, "tx2 buy gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))

    const tx3 = await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx3, "tx3 buy gas used")

    const tx4 = await market.connect(user0).sell(bullToken.address, expandDecimals(1, 18), user0.address)
    await reportGasUsed(provider, tx4, "tx4 sell gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1300))

    const tx5 = await market.connect(user1).sell(bearToken.address, expandDecimals(1, 18), user1.address)
    await reportGasUsed(provider, tx5, "tx5 sell gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1400))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1500))

    const tx6 = await market.connect(user1).sell(bearToken.address, expandDecimals(1, 18), user1.address)
    await reportGasUsed(provider, tx6, "tx6 sell gas used")
  })
})
