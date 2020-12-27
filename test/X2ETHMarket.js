const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadETHFixtures, loadXvixFixtures, contractAt, deployContract } = require("./shared/fixtures")
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
  let xvix
  let floor
  let vault
  let distributor

  beforeEach(async () => {
    const fixtures = await loadETHFixtures(provider)
    weth = fixtures.weth
    factory = fixtures.factory
    router = fixtures.router
    priceFeed = fixtures.priceFeed
    market = fixtures.market
    bullToken = fixtures.bullToken
    bearToken = fixtures.bearToken

    const xvixFixtures = await loadXvixFixtures(provider)
    xvix = xvixFixtures.xvix
    floor = xvixFixtures.floor

    vault = await deployContract("BurnVault", [xvix.address, floor.address])
    distributor = await deployContract("X2Distributor", [vault.address])

    await xvix.createSafe(vault.address)
    await xvix.setTransferConfig(vault.address, 0, 0, 0, 0)

    await vault.setDistributor(distributor.address)
    await vault.addSender(bullToken.address)
    await vault.addSender(bearToken.address)

    await factory.setDistributor(bullToken.address, vault.address)
    await factory.setDistributor(bearToken.address, vault.address)
  })

  it("inits", async () => {
    expect(await market.factory()).eq(factory.address)
    expect(await market.priceFeed()).eq(priceFeed.address)
    expect(await market.multiplierBasisPoints()).eq(30000)
    expect(await market.maxProfitBasisPoints()).eq(9000)

    expect(await market.cachedBullDivisor()).eq("10000000000")
    expect(await market.cachedBearDivisor()).eq("10000000000")

    expect(await bullToken.market()).eq(market.address)
    expect(await bearToken.market()).eq(market.address)
  })

  it("gas usage", async () => {
    // first buy, this would have an extra cost to init the total supply
    // first buy for user0, would have an extra cost to init the user's balance
    const tx0 = await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx0, "tx0 buy gas used")
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    // second buy, lower cost to update the total supply
    // second buy for user0, lower cost to update the user's balance
    const tx1 = await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx1, "tx1 buy gas used")

    // user0 buys a bear to initialise the bear side
    const tx2 = await market.connect(user0).buy(bearToken.address, user0.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx2, "tx2 buy gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))

    // first buy for user1 after a price change
    // some costs for rebasing
    const tx3 = await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx3, "tx3 buy gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))

    // buy after two price changes
    // higher costs for checking two prices
    const tx4 = await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx4, "tx4 buy gas used")

    // first sell
    const tx5 = await market.connect(user0).sell(bullToken.address, expandDecimals(1, 18), user0.address)
    await reportGasUsed(provider, tx5, "tx5 sell gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1300))

    // sell after a price change
    // some cost for rebasing
    const tx6 = await market.connect(user1).sell(bearToken.address, expandDecimals(1, 18), user1.address)
    await reportGasUsed(provider, tx6, "tx6 sell gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1400))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1500))

    // sell after two price changes
    // higher costs for checking two prices
    const tx7 = await market.connect(user1).sell(bearToken.address, expandDecimals(1, 18), user1.address)
    await reportGasUsed(provider, tx7, "tx7 sell gas used")
  })

  it("buy", async () =>{
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
  })

  it("rebases", async () =>{
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000")
    expect(await bearToken.totalSupply()).eq("6999999999860000000")

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000")
    expect(await bearToken.totalSupply()).eq("6999999999860000000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1300))

    expect(await bullToken.balanceOf(user0.address)).eq("14909090907247603306")
    expect(await bullToken.totalSupply()).eq("14909090907247603306")
    expect(await bearToken.balanceOf(user1.address)).eq("3181818181673553719")
    expect(await bearToken.totalSupply()).eq("3181818181673553719")

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("14909090907247603306")
    expect(await bullToken.totalSupply()).eq("14909090907247603306")
    expect(await bearToken.balanceOf(user1.address)).eq("3181818181673553719")
    expect(await bearToken.totalSupply()).eq("3181818181673553719")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1300))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1400))

    expect(await bullToken.balanceOf(user0.address)).eq("16818181815200413223")
    expect(await bullToken.totalSupply()).eq("16818181815200413223")
    expect(await bearToken.balanceOf(user1.address)).eq("2447552447441195168")
    expect(await bearToken.totalSupply()).eq("2447552447441195168")
  })
})
