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
      9000, // maxProfitBasisPoints, 90%
      50 // minDeltaBasisPoints, 0.5%
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
    expect(await market.minDeltaBasisPoints()).eq(50)

    expect(await market.cachedDivisors(bullToken.address)).eq("100000000000000000000")
    expect(await market.cachedDivisors(bearToken.address)).eq("100000000000000000000")

    expect(await bullToken.market()).eq(market.address)
    expect(await bearToken.market()).eq(market.address)
  })

  it("deposit", async () => {
    const tx = await market.deposit(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx, "deposit")
  })

})
