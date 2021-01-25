const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadETHFixtures, loadXvixFixtures, contractAt, deployContract } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime, mineBlock, newWallet } = require("./shared/utilities")
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
  let rewardToken
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

    rewardToken = await deployContract("X2FeeSplit", ["3X ETH/USD X2 FS", "X2FS", expandDecimals(50000, 18)])
    distributor = await deployContract("X2RewardDistributor", [])

    await factory.setDistributor(bullToken.address, distributor.address, rewardToken.address)
    await factory.setDistributor(bearToken.address, distributor.address, rewardToken.address)

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(2, 18) })
    await distributor.setDistribution([bullToken.address, bearToken.address], ["10000000000000000", "10000000000000000"], [rewardToken.address, rewardToken.address]) // 0.01 ETH per hour
  })

  it("inits", async () => {
    expect(await market.factory()).eq(factory.address)
    expect(await market.priceFeed()).eq(priceFeed.address)
    expect(await market.multiplierBasisPoints()).eq(30000)
    expect(await market.maxProfitBasisPoints()).eq(9000)
    expect(await market.fundingDivisor()).eq(5000)
    expect(await market.appFeeBasisPoints()).eq(10)

    expect(await market.cachedBullDivisor()).eq("10000000000")
    expect(await market.cachedBearDivisor()).eq("10000000000")

    expect(await bullToken.market()).eq(market.address)
    expect(await bearToken.market()).eq(market.address)
  })

  it("gas usage", async () => {
    // first buy, this would have an extra cost to init the total supply
    // there would also have an additional cost to initialise the feeReserve
    // first buy for user0, would have an extra cost to init the user's balance
    const tx0 = await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx0, "tx0 buy gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    // second buy, lower cost to update the total supply
    // second buy for user0, lower cost to update the user's balance
    const tx1 = await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx1, "tx1 buy gas used")

    // user0 buys a bear to initialise the bear side
    const tx2 = await market.connect(user0).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx2, "tx2 buy gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))

    // first buy for user1 after a price change
    // some costs for rebasing
    const tx3 = await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx3, "tx3 buy gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1200))

    // buy after two price changes
    // higher costs for checking two prices
    const tx4 = await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx4, "tx4 buy gas used")

    await increaseTime(provider, 60 * 20)
    await mineBlock(provider)

    // first sell
    const tx5 = await market.connect(user0).sell(bullToken.address, expandDecimals(5, 29), user0.address, ethers.constants.AddressZero)
    await reportGasUsed(provider, tx5, "tx5 sell gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1300))

    // sell after a price change
    // some cost for rebasing
    const tx6 = await market.connect(user1).sell(bearToken.address, expandDecimals(5, 29), user1.address, ethers.constants.AddressZero)
    await reportGasUsed(provider, tx6, "tx6 sell gas used")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1400))
    await priceFeed.setLatestAnswer(toChainlinkPrice(1500))

    // sell after two price changes
    // higher costs for checking two prices
    const tx7 = await market.connect(user1).sell(bearToken.address, expandDecimals(5, 29), user1.address, ethers.constants.AddressZero)
    await reportGasUsed(provider, tx7, "tx7 sell gas used")
  })

  it("buy", async () =>{
    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
  })

  it("rebases", async () =>{
    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    await increaseTime(provider, 8 * 60) // 8 minutes
    await mineBlock(provider)

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    await increaseTime(provider, 3 * 60) // 3 minutes
    await mineBlock(provider)

    expect(await bullToken.balanceOf(user0.address)).eq("12973999998832340000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(900))

    expect(await bullToken.balanceOf(user0.address)).eq("9163454543696828264")
    expect(await bearToken.balanceOf(user1.address)).eq("10796545453367649586")
    expect(await bullToken.totalSupply()).eq("9163454543696828264")
    expect(await bearToken.totalSupply()).eq("10796545453367649586")
  })

  it("sell", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(true)
    expect(await bullToken.hasPendingPurchase(user1.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user0.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(true)

    expect(await bullToken.getPendingProfit(user0.address)).eq("2993999998832340000")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    expect(await market.interestReserve()).eq("0")
    await market.connect(user0).sell(bullToken.address, expandDecimals(5, 29), receiver0.address, ethers.constants.AddressZero)

    expect(await bullToken.balanceOf(user0.address)).eq("4990000000000000000")
    expect(await bullToken.totalSupply()).eq("6486999999416170000")
    expect(await provider.getBalance(receiver0.address)).eq("4980020000000000000")
    expect(await market.interestReserve()).eq("1497000000723550000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(true)
    expect(await bullToken.hasPendingPurchase(user1.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user0.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(true)

    expect(await bullToken.getPendingProfit(user0.address)).eq("1496999999416170000")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    await increaseTime(provider, 11 * 60)
    await mineBlock(provider)

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(false)
    expect(await bullToken.hasPendingPurchase(user1.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user0.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(false)

    expect(await bullToken.getPendingProfit(user0.address)).eq("0")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    expect(await bullToken.balanceOf(user0.address)).eq("6486999999416170000")
    await market.connect(user0).sell(bullToken.address, expandDecimals(1, 30), receiver0.address, ethers.constants.AddressZero)

    expect(await bullToken.balanceOf(user0.address)).eq("0")
    expect(await bullToken.totalSupply()).eq("0")
    expect(await provider.getBalance(receiver0.address)).eq("11454045999417337660")
    expect(await market.interestReserve()).eq("1497000000723550000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")
  })

  it("sell all", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(true)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(true)
    expect(await bullToken.getPendingProfit(user0.address)).eq("0")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(true)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(true)
    expect(await bullToken.getPendingProfit(user0.address)).eq("2993999998832340000")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    expect(await market.interestReserve()).eq("0")
    await market.connect(user0).sell(bullToken.address, expandDecimals(1, 30), receiver0.address, ethers.constants.AddressZero)

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(true)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(true)
    expect(await bullToken.getPendingProfit(user0.address)).eq("0")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    expect(await bullToken.balanceOf(user0.address)).eq("0")
    expect(await bullToken.totalSupply()).eq("0")
    expect(await provider.getBalance(receiver0.address)).eq("9960040000000000000")
    expect(await market.interestReserve()).eq("2994000000139720000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    await increaseTime(provider, 11 * 60)
    await mineBlock(provider)

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(false)
    expect(await bullToken.getPendingProfit(user0.address)).eq("0")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    expect(await bullToken.balanceOf(user0.address)).eq("0")
    expect(await bullToken.totalSupply()).eq("0")
    expect(await provider.getBalance(receiver0.address)).eq("9960040000000000000")
    expect(await market.interestReserve()).eq("2994000000139720000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")
  })

  it("sellWithoutDistribution", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await factory.setDistributor(bullToken.address, user3.address, user3.address)
    await expect(market.connect(user0).sell(bullToken.address, expandDecimals(1, 30), receiver0.address, ethers.constants.AddressZero))
      .to.be.reverted

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await market.connect(user0).sellWithoutDistribution(bullToken.address, expandDecimals(1, 30), receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("9960040000000000000")
  })

  it("costOf", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")
    expect(await bullToken.costOf(user0.address)).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    await market.connect(user0).sell(bullToken.address, expandDecimals(5, 29), receiver0.address, ethers.constants.AddressZero)
    expect(await bullToken.costOf(user0.address)).eq("4990000000000000000") // sold halve so cost should halve

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.costOf(user0.address)).eq("14970000000000000000")

    await market.connect(user0).sell(bullToken.address, expandDecimals(1, 30), receiver0.address, ethers.constants.AddressZero)
    expect(await bullToken.costOf(user0.address)).eq(0)
  })

  it("distributeFees", async () => {
    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")
    expect(await bullToken.costOf(user0.address)).eq("9980000000000000000")

    expect(await market.feeReserve()).eq("20000000000000000") // 0.02, 10 * 0.2%

    await market.connect(user0).sell(bullToken.address, expandDecimals(1, 30), user0.address, ethers.constants.AddressZero)
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
    const receiver0 = newWallet()
    const receiver1 = newWallet()
    const receiver2 = newWallet()

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    expect(await market.interestReserve()).eq("0")
    await market.connect(user0).sell(bullToken.address, expandDecimals(5, 29), receiver0.address, ethers.constants.AddressZero)

    expect(await bullToken.balanceOf(user0.address)).eq("4990000000000000000")
    expect(await bullToken.totalSupply()).eq("6486999999416170000")
    expect(await provider.getBalance(receiver0.address)).eq("4980020000000000000")
    expect(await market.interestReserve()).eq("1497000000723550000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    await factory.setInterestReceiver(receiver1.address)
    await factory.setFeeReceiver(receiver2.address)

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await market.distributeInterest()
    expect(await provider.getBalance(receiver1.address)).eq("1497000000723550000")
    expect(await market.interestReserve()).eq("0")

    expect(await provider.getBalance(receiver2.address)).eq(0)
    expect(await market.feeReserve()).eq("49980000000000000")
    await market.distributeFees()
    expect(await provider.getBalance(receiver2.address)).eq("49980000000000000")
    expect(await market.interestReserve()).eq("0")
    expect(await market.feeReserve()).eq("0")
  })

  it("distributeAppFees", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()
    const receiver2 = newWallet()
    const receiver3 = newWallet()
    const receiver4 = newWallet()

    await factory.setAppOwner(user3.address)
    await factory.connect(user3).setAppFee(market.address, 10)

    await market.connect(user0).buy(bullToken.address, receiver3.address, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9970000000000000000")
    expect(await bullToken.totalSupply()).eq("9970000000000000000")

    await market.connect(user1).buy(bearToken.address, receiver3.address, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9970000000000000000")
    expect(await bearToken.totalSupply()).eq("9970000000000000000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    expect(await bullToken.balanceOf(user0.address)).eq("9970000000000000000")
    expect(await bullToken.totalSupply()).eq("12960999998833510000")
    expect(await bearToken.balanceOf(user1.address)).eq("6978999999860420000")
    expect(await bearToken.totalSupply()).eq("6978999999860420000")

    expect(await market.interestReserve()).eq("0")
    await market.connect(user0).sell(bullToken.address, expandDecimals(5, 29), receiver0.address, receiver3.address)

    expect(await bullToken.balanceOf(user0.address)).eq("4985000000000000000")
    expect(await bullToken.totalSupply()).eq("6480499999416755000")
    expect(await provider.getBalance(receiver0.address)).eq("4970045000000000000")
    expect(await market.interestReserve()).eq("1495500000722825000")
    expect(await bearToken.balanceOf(user1.address)).eq("6978999999860420000")
    expect(await bearToken.totalSupply()).eq("6978999999860420000")

    await factory.setInterestReceiver(receiver1.address)
    await factory.setFeeReceiver(receiver2.address)

    expect(await market.feeReserve()).eq("49970000000000000")
    expect(await provider.getBalance(receiver1.address)).eq(0)
    await market.distributeInterest()
    expect(await provider.getBalance(receiver1.address)).eq("1495500000722825000")
    expect(await market.interestReserve()).eq("0")

    expect(await provider.getBalance(receiver2.address)).eq(0)
    expect(await market.feeReserve()).eq("49970000000000000")
    await market.distributeFees()
    expect(await provider.getBalance(receiver2.address)).eq("49970000000000000")
    expect(await market.interestReserve()).eq("0")
    expect(await market.feeReserve()).eq("0")

    expect(await provider.getBalance(receiver3.address)).eq(0)
    expect(await provider.getBalance(receiver4.address)).eq(0)
    expect(await market.appFeeReserve()).eq("24985000000000000")
    await market.distributeAppFees(receiver4.address)
    expect(await provider.getBalance(receiver3.address)).eq(0)
    expect(await provider.getBalance(receiver4.address)).eq(0)

    expect(await provider.getBalance(receiver3.address)).eq(0)
    expect(await provider.getBalance(receiver4.address)).eq(0)
    expect(await market.appFeeReserve()).eq("24985000000000000")
    await market.distributeAppFees(receiver3.address)
    expect(await provider.getBalance(receiver3.address)).eq("24985000000000000")
    expect(await provider.getBalance(receiver4.address)).eq(0)
    expect(await market.interestReserve()).eq("0")
    expect(await market.appFeeReserve()).eq("0")
    expect(await market.feeReserve()).eq("0")
  })

  it("flip", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()
    const receiver2 = newWallet()

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bearToken.balanceOf(user0.address)).eq("0")
    expect(await bullToken.totalSupply()).eq("12973999998832340000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("6985999999860280000")

    expect(await market.feeReserve()).eq("40000000000000000")
    await market.connect(user0).flip(bullToken.address, expandDecimals(5, 29), ethers.constants.AddressZero)
    expect(await market.feeReserve()).eq("49980000000000000")

    expect(await bullToken.balanceOf(user0.address)).eq("4990000000000000000")
    expect(await bearToken.balanceOf(user0.address)).eq("4980020000000000000")
    expect(await bullToken.totalSupply()).eq("6486999999416170000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("11966019999860280000")

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(true)
    expect(await bullToken.hasPendingPurchase(user1.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user0.address)).eq(true)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(true)

    expect(await bullToken.getPendingProfit(user0.address)).eq("1496999999416170000")
    expect(await bearToken.getPendingProfit(user0.address)).eq("0")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    await increaseTime(provider, 11 * 60)
    await mineBlock(provider)

    expect(await bullToken.hasPendingPurchase(user0.address)).eq(false)
    expect(await bullToken.hasPendingPurchase(user1.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user0.address)).eq(false)
    expect(await bearToken.hasPendingPurchase(user1.address)).eq(false)

    expect(await bullToken.getPendingProfit(user0.address)).eq("0")
    expect(await bearToken.getPendingProfit(user0.address)).eq("0")
    expect(await bearToken.getPendingProfit(user1.address)).eq("0")

    expect(await bullToken.balanceOf(user0.address)).eq("6486999999416170000")
    expect(await bearToken.balanceOf(user0.address)).eq("4980020000000000000")
    expect(await bullToken.totalSupply()).eq("6486999999416170000")
    expect(await bearToken.balanceOf(user1.address)).eq("6985999999860280000")
    expect(await bearToken.totalSupply()).eq("11966019999860280000")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    expect(await provider.getBalance(receiver1.address)).eq(0)
    expect(await provider.getBalance(receiver2.address)).eq(0)

    await market.connect(user0).sell(bullToken.address, expandDecimals(1, 30), receiver0.address, ethers.constants.AddressZero)
    await market.connect(user0).sell(bearToken.address, expandDecimals(1, 30), receiver1.address, ethers.constants.AddressZero)
    await market.connect(user1).sell(bearToken.address, expandDecimals(1, 30), receiver2.address, ethers.constants.AddressZero)

    expect(await provider.getBalance(receiver0.address)).eq("6474025999417337660")
    expect(await provider.getBalance(receiver1.address)).eq("4970059960000000000")
    expect(await provider.getBalance(receiver2.address)).eq("6972027999860559440")
  })

  it("bulls pay bears", async () => {
    const receiver0 = newWallet()

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await increaseTime(provider, 60 * 60 + 10)

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).sell(bearToken.address, expandDecimals(5, 29), receiver0.address, ethers.constants.AddressZero)

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq("4990000000000000000")
    expect(await bearToken.totalSupply()).eq("4990000000000000000")

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    expect(await bullToken.balanceOf(user0.address)).eq("9979002000009979002")
    expect(await bullToken.totalSupply()).eq("9979002000009979002")
    expect(await bearToken.balanceOf(user1.address)).eq("4990997999960072016")
    expect(await bearToken.totalSupply()).eq("4990997999960072016")

    await increaseTime(provider, 10 * 60 * 60 + 10)
    await mineBlock(provider)

    expect(await bullToken.balanceOf(user0.address)).eq("9969021999327489775")
    expect(await bullToken.totalSupply()).eq("9969021999327489775")
    expect(await bearToken.balanceOf(user1.address)).eq("5000977999876575862")
    expect(await bearToken.totalSupply()).eq("5000977999876575862")
  })

  it("bears pay bulls", async () => {
    const receiver0 = newWallet()

    await market.connect(user0).buy(bullToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user1).buy(bearToken.address, ethers.constants.AddressZero, { value: expandDecimals(10, 18) })
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await increaseTime(provider, 60 * 60 + 10)

    expect(await bullToken.balanceOf(user0.address)).eq("9980000000000000000")
    expect(await bullToken.totalSupply()).eq("9980000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await market.connect(user0).sell(bullToken.address, expandDecimals(5, 29), receiver0.address, ethers.constants.AddressZero)

    expect(await bullToken.balanceOf(user0.address)).eq("4990000000000000000")
    expect(await bullToken.totalSupply()).eq("4990000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq("9980000000000000000")
    expect(await bearToken.totalSupply()).eq("9980000000000000000")

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    expect(await bullToken.balanceOf(user0.address)).eq("4990997999960072016")
    expect(await bullToken.totalSupply()).eq("4990997999960072016")
    expect(await bearToken.balanceOf(user1.address)).eq("9979002000009979002")
    expect(await bearToken.totalSupply()).eq("9979002000009979002")

    await increaseTime(provider, 10 * 60 * 60 + 10)
    await mineBlock(provider)

    expect(await bullToken.balanceOf(user0.address)).eq("5000977999876575862")
    expect(await bullToken.totalSupply()).eq("5000977999876575862")
    expect(await bearToken.balanceOf(user1.address)).eq("9969021999327489775")
    expect(await bearToken.totalSupply()).eq("9969021999327489775")
  })
})
