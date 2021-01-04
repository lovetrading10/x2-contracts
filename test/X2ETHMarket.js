const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadETHFixtures, loadXvixFixtures, contractAt, deployContract } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime, mineBlock } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2ETHMarket", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let factory
  let router
  let priceFeed
  let market
  let bullToken
  let bearToken
  let xvix
  let floor
  let distributor
  let feeReceiver

  beforeEach(async () => {
    const fixtures = await loadETHFixtures(provider)
    factory = fixtures.factory
    router = fixtures.router
    priceFeed = fixtures.priceFeed
    market = fixtures.market
    bullToken = fixtures.bullToken
    bearToken = fixtures.bearToken
    feeReceiver = fixtures.feeReceiver

    const xvixFixtures = await loadXvixFixtures(provider)
    xvix = xvixFixtures.xvix
    floor = xvixFixtures.floor

    distributor = await deployContract("X2TimeDistributor", [])

    await factory.setDistributor(bullToken.address, distributor.address)
    await factory.setDistributor(bearToken.address, distributor.address)

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(2, 18) })
    await distributor.setETHPerInterval([bullToken.address, bearToken.address], ["10000000000000000", "10000000000000000"]) // 0.01 ETH per hour
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

  it("after 1 price increase", async () => {
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
  })

  it("after 2 price increases", async () => {
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))

    expect(await bullToken.balanceOf(user0.address)).eq("12999999998830000000") // increase by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("4000000000000000000") // decrease by ~6 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("12999999998830000000") // increase by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("4000000000000000000") // decrease by ~6 ETH
  })

  it("after 3 price increases", async () => {
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1050))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))

    expect(await bullToken.balanceOf(user0.address)).eq("12999999998830000000") // increase by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("4000000000000000000") // decrease by ~6 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("12999999998830000000") // increase by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("4000000000000000000") // decrease by ~6 ETH
  })

  it("after 1 price decrease", async () => {
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(900))

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000")
    expect(await bullToken.totalSupply()).eq("6999999999860000000")
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000")
    expect(await bullToken.totalSupply()).eq("6999999999860000000")
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))
  })

  it("after 2 price decreases", async () => {
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(900))
    await priceFeed.setLatestAnswer(toChainlinkPrice(800))

    expect(await bullToken.balanceOf(user0.address)).eq("4000000000000000000") // decrease by ~6 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("12999999998830000000") // increase by ~3 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("4000000000000000000") // decrease by ~6 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("12999999998830000000") // increase by ~3 ETH
  })

  it("after 3 price decreases", async () => {
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(950))
    await priceFeed.setLatestAnswer(toChainlinkPrice(900))
    await priceFeed.setLatestAnswer(toChainlinkPrice(800))

    expect(await bullToken.balanceOf(user0.address)).eq("4000000000000000000") // decrease by ~6 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("12999999998830000000") // increase by ~3 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("4000000000000000000") // decrease by ~6 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("12999999998830000000") // increase by ~3 ETH
  })

  it("after 1 price increase and 1 decrease", async () => {
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(900))

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH
  })

  it("sell", async () => {
    const receiver0 = { address: "0xb3971133a949d45d222ea49f21817ade07516214" }
    const receiver1 = { address: "0xdc64ba27c5788f6dab963055a1dbe8989ffba5ca" }

    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(900))

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await market.connect(user0).sell(bullToken.address, "6999999999860000000", receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("6999999999860000000")

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await market.connect(user1).sell(bearToken.address, "6999999999860000000", receiver1.address)
    expect(await provider.getBalance(receiver1.address)).eq("6999999999860000000")
  })

  it("sellAll", async () => {
    const receiver0 = { address: "0x1dbffbf7fa596050626f4b843a586ef6cb1f7973" }
    const receiver1 = { address: "0x4eeace20a47214e487e6352a0a8a601fff0ec768" }

    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(900))

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await market.connect(user0).sellAll(bullToken.address, receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("6999999999860000000")

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await market.connect(user1).sellAll(bearToken.address, receiver1.address)
    expect(await provider.getBalance(receiver1.address)).eq("6999999999860000000")
  })

  it("sellWithoutDistribution", async () => {
    const receiver0 = { address: "0x72c413e58c6a7f922e406bdc8396b98e04d0f7f4" }

    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(900))

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH

    await factory.setDistributor(bullToken.address, user3.address)
    await expect(market.connect(user0).sell(bullToken.address, "6999999999860000000", receiver0.address))
      .to.be.reverted

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await market.connect(user0).sellWithoutDistribution(bullToken.address, "6999999999860000000", receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("6999999999860000000")
  })

  it("costOf", async () => {
    const receiver0 = { address: "0x5331fff36bf2e91f1461d37ffd37bdcb3c6a4ebc" }

    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bullToken.costOf(user0.address)).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(900))

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH
    expect(await bullToken.costOf(user0.address)).eq(expandDecimals(10, 18))

    await market.connect(user0).sell(bullToken.address, "3500000000000000000", receiver0.address)
    expect(await bullToken.costOf(user0.address)).eq("4999999999900000000") // sold halve so cost should halve

    await market.connect(user0).sell(bullToken.address, "1000000000000000000", receiver0.address)
    expect(await bullToken.costOf(user0.address)).eq("3571428571300000000")

    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.costOf(user0.address)).eq("13571428571300000000")

    await market.connect(user0).sellAll(bullToken.address, receiver0.address)
    expect(await bullToken.costOf(user0.address)).eq(0)
  })

  it("distributeFees", async () => {
    await factory.setFee(market.address, 20)
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")
    expect(await bullToken.costOf(user0.address)).eq("9980000000000000000")

    expect(await market.feeReserve()).eq("20000000000000000") // 0.02, 10 * 0.2%

    await market.connect(user0).sellAll(bullToken.address, user0.address)
    expect(await market.feeReserve()).eq("39960000000000000")

    await factory.setFeeReceiver(feeReceiver.address)

    expect(await provider.getBalance(feeReceiver.address)).eq(0)
    await market.distributeFees()
    expect(await provider.getBalance(feeReceiver.address)).eq("39960000000000000")
    expect(await market.feeReserve()).eq(0)

    await market.distributeFees()
    expect(await provider.getBalance(feeReceiver.address)).eq("39960000000000000")
  })

  it("distributeInterest", async () => {
    await market.connect(user0).buy(bullToken.address, user0.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await market.connect(user1).buy(bearToken.address, user1.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(900))

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH
    expect(await market.interestReserve()).eq(0)

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("6999999999860000000") // decrease by ~3 ETH
    expect(await bearToken.balanceOf(user1.address)).eq("6999999999860000000") // increase by ~3 ETH
    expect(await market.interestReserve()).eq("1310000000")

    await market.connect(user0).sell(bullToken.address, "6999999999860000000", user0.address)
    expect(await market.interestReserve()).eq("1310000000")

    expect(await provider.getBalance(feeReceiver.address)).eq(0)
    await factory.setFeeReceiver(feeReceiver.address)
    await market.distributeInterest()
    expect(await provider.getBalance(feeReceiver.address)).eq("1310000000")
    expect(await market.interestReserve()).eq(0)

    await market.distributeInterest()
    expect(await provider.getBalance(feeReceiver.address)).eq("1310000000")
    expect(await market.interestReserve()).eq(0)

    // since the price is 900 currently, user1 has potential profits of 13 - 10, 3
    // if user1 sells early, then the amount is settled based on a price of 1100
    // so the user only receives 7 ETH
    // the excess ETH is stored in the interestReserve
    await market.connect(user1).sell(bearToken.address, "6999999999860000000", user1.address)
    expect(await market.interestReserve()).eq("5999999998970000000")

    await market.distributeInterest()
    expect(await provider.getBalance(feeReceiver.address)).eq("6000000000280000000")
    expect(await market.interestReserve()).eq(0)
  })
})
