const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadFixtures } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime, mineBlock } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2Market", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let weth
  let factory
  let router
  let priceFeed
  let market
  let bullToken
  let bearToken
  let feeReceiver

  beforeEach(async () => {
    const fixtures = await loadFixtures(provider, wallet)
    weth = fixtures.weth
    factory = fixtures.factory
    router = fixtures.router
    priceFeed = fixtures.priceFeed
    market = fixtures.market
    bullToken = fixtures.bullToken
    bearToken = fixtures.bearToken
    feeReceiver = fixtures.feeReceiver
  })

  it("inits", async () => {
    expect(await market.factory()).eq(factory.address)
    expect(await market.collateralToken()).eq(weth.address)
    expect(await market.priceFeed()).eq(priceFeed.address)
    expect(await market.multiplier()).eq(3)
    expect(await market.unlockDelay()).eq(60 * 60)
    expect(await market.maxProfitBasisPoints()).eq(9000)
    expect(await market.minDeltaBasisPoints()).eq(50)
    expect(await market.cachedDivisors(bullToken.address)).eq("100000000000000000000")
    expect(await market.cachedDivisors(bearToken.address)).eq("100000000000000000000")
    expect(await market.previousDivisors(bullToken.address)).eq("100000000000000000000")
    expect(await market.previousDivisors(bearToken.address)).eq("100000000000000000000")
  })

  it("latestPrice", async () => {
    expect(await market.latestPrice()).eq(toChainlinkPrice(1000))

    await priceFeed.setLatestAnswer(toChainlinkPrice(100))
    expect(await market.latestPrice()).eq(toChainlinkPrice(100))

    // if the price feed returns 0, then the last stored price will be used instead
    await priceFeed.setLatestAnswer(toChainlinkPrice(0))
    expect(await market.latestPrice()).eq(toChainlinkPrice(1000))

    await priceFeed.setLatestAnswer(toChainlinkPrice(2000))
    expect(await market.latestPrice()).eq(toChainlinkPrice(2000))

    await priceFeed.setLatestAnswer(toChainlinkPrice(10000))
    expect(await market.latestPrice()).eq(toChainlinkPrice(10000))

    await market.rebase()

    // if the price has not changed by 0.5% then the returned price should not change
    await priceFeed.setLatestAnswer(toChainlinkPrice(10049))
    expect(await market.latestPrice()).eq(toChainlinkPrice(10000))

    await priceFeed.setLatestAnswer(toChainlinkPrice(10051))
    expect(await market.latestPrice()).eq(toChainlinkPrice(10051))
  })

  it("distributeFees", async () => {
    await expect(market.distributeFees())
      .to.be.revertedWith("X2Market: empty feeReceiver")
  })

  it("deposit bullToken", async () => {
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    const tx = await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    await reportGasUsed(provider, tx, "depositETH gas used")

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
  })

  it("withdraw bullToken", async () => {
    const receiver = { address: "0xd4e0a14f14bef2131384f3abdb9984ea50cef442" }
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    expect(await provider.getBalance(receiver.address)).eq(0)

    await bullToken.connect(user0).approve(router.address, expandDecimals(10, 18))
    const tx = await router.connect(user0).withdrawETH(bullToken.address, expandDecimals(10, 18), receiver.address, maxUint256)
    await reportGasUsed(provider, tx, "withdrawETH gas used")

    expect(await provider.getBalance(receiver.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
  })

  it("deposit bearToken", async () => {
    expect(await bearToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bearToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })

    expect(await bearToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))
  })

  it("withdraw bearToken", async () => {
    const receiver = { address: "0x466a9e7bcd0edda08f82a940e7ae697dd2985533" }
    expect(await bearToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bearToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })

    expect(await bearToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await bearToken.connect(user0).approve(router.address, expandDecimals(10, 18))
    expect(await provider.getBalance(receiver.address)).eq(0)
    await router.connect(user0).withdrawETH(bearToken.address, expandDecimals(10, 18), receiver.address, maxUint256)
    expect(await provider.getBalance(receiver.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.totalSupply()).eq(0)
  })

  it("rebase without counterparty tokens", async () => {
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))

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
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))
  })

  it("uses a mark price", async () => {
    const receiver0 = { address: "0x88833a57e9d952b84b3fc8332699f335b767c4b4" }
    const receiver1 = { address: "0x964724b6e3d1d0fc94a36f918f1386cf7c4dd530" }
    const receiver2 = { address: "0xf576472aa0f7d40d31a605ead5ac520310f6f22a" }

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await priceFeed.setLatestAnswer(toChainlinkPrice(2000))
    await market.rebase()

    expect(await market.cachedDivisors(bullToken.address)).eq("100000000000000000000")
    expect(await market.cachedDivisors(bearToken.address)).eq("100000000000000000000")
    expect(await market.previousDivisors(bullToken.address)).eq("100000000000000000000")
    expect(await market.previousDivisors(bearToken.address)).eq("100000000000000000000")

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })

    await priceFeed.setLatestAnswer(toChainlinkPrice(2200))
    await market.rebase()

    // bears should pay bulls, but bulls do not get a profit yet
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(7, 18))

    await router.connect(user2).depositETH(bullToken.address, user2.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await bullToken.balanceOf(user2.address)).eq("7692307692307692307") // ~7.69

    await market.rebase()
    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(7, 18))
    expect(await bullToken.balanceOf(user2.address)).eq("7692307692307692307") // ~7.69

    await priceFeed.setLatestAnswer(toChainlinkPrice(2300))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(13, 18))
    expect(await bearToken.balanceOf(user1.address)).eq("6045454545454545457") // ~6.045
    expect(await bullToken.balanceOf(user2.address)).eq(expandDecimals(10, 18))

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(13, 18))
    expect(await bearToken.balanceOf(user1.address)).eq("6045454545454545457") // ~6.045
    expect(await bullToken.balanceOf(user2.address)).eq(expandDecimals(10, 18))

    expect(await bullToken.totalSupply()).eq("23000000000000000000")
    expect(await bearToken.totalSupply()).eq("6045454545454545457")

    expect(await market.interestReserve()).eq(0)
    expect(await provider.getBalance(receiver0.address)).eq(0)
    await bullToken.connect(user0).approve(router.address, expandDecimals(13, 18))
    await router.connect(user0).withdrawETH(bullToken.address, expandDecimals(13, 18), receiver0.address, maxUint256)
    expect(await provider.getBalance(receiver0.address)).eq(expandDecimals(13, 18))
    expect(await market.interestReserve()).eq("539525691699604742") // 0.539

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await bearToken.connect(user1).approve(router.address, "6045454545454545457")
    await router.connect(user1).withdrawETH(bearToken.address, "6045454545454545457", receiver1.address, maxUint256)
    expect(await provider.getBalance(receiver1.address)).eq("6045454545454545457")
    expect(await market.interestReserve()).eq("539525691699604742") // 0.539

    expect(await provider.getBalance(receiver2.address)).eq(0)
    await bullToken.connect(user2).approve(router.address, expandDecimals(10, 18))
    await router.connect(user2).withdrawETH(bullToken.address, expandDecimals(10, 18), receiver2.address, maxUint256)
    expect(await provider.getBalance(receiver2.address)).eq(expandDecimals(10, 18))
    expect(await market.interestReserve()).eq("954545454545454543") // 0.954

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    expect(await weth.balanceOf(market.address)).eq("954545454545454543") // 0.954

    await factory.setFeeReceiver(feeReceiver.address)
    await market.distributeInterest()

    expect(await weth.balanceOf(feeReceiver.address)).eq("954545454545454543") // 0.954
    expect(await weth.balanceOf(market.address)).eq(0)
  })

  it("rebase after price increases", async () => {
    const receiver0 = { address: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d" }
    const receiver1 = { address: "0x6b06c0ab70549118373f51265f05b1c0fa0873f7" }

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    // if a user knows about this incoming price update
    // the user can make a buy here
    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await market.rebase()

    let bullBalance = await bullToken.balanceOf(user0.address)
    let bearBalance = await bearToken.balanceOf(user1.address)
    // the larger of the divisors are used, so the bear balance decreases
    // while the bull balance does not increase yet
    expect(bullBalance).eq(expandDecimals(10, 18))
    expect(bearBalance).eq(expandDecimals(7, 18))

    let totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq(expandDecimals(17, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(7, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1101))
    await market.rebase()

    bullBalance = await bullToken.balanceOf(user0.address)
    bearBalance = await bearToken.balanceOf(user1.address)
    // there should be no change to the bull and bear balances as the price
    // has not moved by more than 0.5%
    expect(bullBalance).eq(expandDecimals(10, 18))
    expect(bearBalance).eq(expandDecimals(7, 18))
    totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq(expandDecimals(17, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(7, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1210))
    await market.rebase()

    await priceFeed.setLatestAnswer(toChainlinkPrice(1815))
    bullBalance = await bullToken.balanceOf(user0.address)
    bearBalance = await bearToken.balanceOf(user1.address)
    expect(bullBalance).eq("15100000000000000000")
    expect(bearBalance).eq("490000000000000000")
    totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq("15590000000000000000")
    expect(await bullToken.totalSupply()).eq("15100000000000000000")
    expect(await bearToken.totalSupply()).eq("490000000000000000")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    expect(await provider.getBalance(receiver1.address)).eq(0)

    await bullToken.connect(user0).approve(router.address, "15100000000000000000")
    await router.connect(user0).withdrawETH(bullToken.address, "15100000000000000000", receiver0.address, maxUint256)

    expect(await market.cachedDivisors(bullToken.address)).eq("51255766273705791901")
    expect(await market.cachedDivisors(bearToken.address)).eq("2040816326530612244897")

    await priceFeed.setLatestAnswer(toChainlinkPrice(2000))
    await market.rebase()

    expect(await market.cachedDivisors(bullToken.address)).eq("100000000000000000000")
    expect(await market.cachedDivisors(bearToken.address)).eq("2040816326530612244897")

    await bearToken.connect(user1).approve(router.address, "490000000000000000")
    await router.connect(user1).withdrawETH(bearToken.address, "490000000000000000", receiver1.address, maxUint256)

    expect(await provider.getBalance(receiver0.address)).eq("15100000000000000000")
    expect(await provider.getBalance(receiver1.address)).eq("490000000000000000")

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq("4410000000000000000")
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await priceFeed.setLatestAnswer(toChainlinkPrice(2200))
    await market.rebase()

    expect(await market.cachedDivisors(bullToken.address)).eq("100000000000000000000")
    expect(await market.cachedDivisors(bearToken.address)).eq("100000000000000000000")
  })

  it("rebase when profit exceeds max profit", async () => {
    const receiver0 = { address: "0xba58ac30a55bcf22042dcaa5a0b3fed51a2c9617" }
    const receiver1 = { address: "0x6338723180b802c5a5201f8ed12398eb7da31998" }

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await priceFeed.setLatestAnswer(toChainlinkPrice(1500))
    await market.rebase()

    await priceFeed.setLatestAnswer(toChainlinkPrice(1600))

    const bullBalance = await bullToken.balanceOf(user0.address)
    const bearBalance = await bearToken.balanceOf(user1.address)
    expect(bullBalance).eq(expandDecimals(19, 18))
    expect(bearBalance).eq("800000000000000002")

    const totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq("19800000000000000002")
    expect(await bullToken.totalSupply()).eq(expandDecimals(19, 18))
    expect(await bearToken.totalSupply()).eq("800000000000000002")

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(19, 18))
    expect(await bearToken.balanceOf(user1.address)).eq("800000000000000002")
    expect(await bullToken.totalSupply()).eq(expandDecimals(19, 18))
    expect(await bearToken.totalSupply()).eq("800000000000000002")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    expect(await provider.getBalance(receiver1.address)).eq(0)

    await bullToken.connect(user0).approve(router.address, expandDecimals(19, 18))
    await bearToken.connect(user1).approve(router.address, "800000000000000002")
    await router.connect(user0).withdrawETH(bullToken.address, expandDecimals(19, 18), receiver0.address, maxUint256)
    await router.connect(user1).withdrawETH(bearToken.address, "800000000000000002", receiver1.address, maxUint256)

    expect(await provider.getBalance(receiver0.address)).eq(expandDecimals(19, 18))
    expect(await provider.getBalance(receiver1.address)).eq("800000000000000002")

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq("199999999999999998")
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)
  })

  it("rebase after price decreases", async () => {
    const receiver0 = { address: "0xe81e77f84369ac8b69f5047ea80920d6b29dbb00" }
    const receiver1 = { address: "0x08475bbed6766735f3f359eb5e30a90b974aa997" }

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await priceFeed.setLatestAnswer(toChainlinkPrice(900))
    await market.rebase()
    await priceFeed.setLatestAnswer(toChainlinkPrice(810))

    const bullBalance = await bullToken.balanceOf(user0.address)
    const bearBalance = await bearToken.balanceOf(user1.address)
    expect(bullBalance).eq("4900000000000000000")
    expect(bearBalance).eq(expandDecimals(13, 18))

    const totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq("17900000000000000000")
    expect(await bullToken.totalSupply()).eq("4900000000000000000")
    expect(await bearToken.totalSupply()).eq(expandDecimals(13, 18))

    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("4900000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(13, 18))
    expect(await bullToken.totalSupply()).eq("4900000000000000000")
    expect(await bearToken.totalSupply()).eq(expandDecimals(13, 18))

    expect(await provider.getBalance(receiver0.address)).eq(0)
    expect(await provider.getBalance(receiver1.address)).eq(0)

    await bullToken.connect(user0).approve(router.address, "4900000000000000000")
    await bearToken.connect(user1).approve(router.address, expandDecimals(13, 18))
    await router.connect(user0).withdrawETH(bullToken.address, "4900000000000000000", receiver0.address, maxUint256)
    await router.connect(user1).withdrawETH(bearToken.address, expandDecimals(13, 18), receiver1.address, maxUint256)

    expect(await provider.getBalance(receiver0.address)).eq("4900000000000000000")
    expect(await provider.getBalance(receiver1.address)).eq(expandDecimals(13, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq("2100000000000000000")
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)
  })

  it("rebase after price increases then decreases", async () => {
    const receiver0 = { address: "0xfd54078badd5653571726c3370afb127351a6f26" }
    const receiver1 = { address: "0x2cc50293d5fe3d1d8aaa6461705232f5bd1beebe" }

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))
    await market.rebase()
    await priceFeed.setLatestAnswer(toChainlinkPrice(1210))

    const bullBalance = await bullToken.balanceOf(user0.address)
    const bearBalance = await bearToken.balanceOf(user1.address)
    expect(bullBalance).eq(expandDecimals(13, 18))
    expect(bearBalance).eq("4900000000000000000")
    expect(await bullToken.totalSupply()).eq(expandDecimals(13, 18))
    expect(await bearToken.totalSupply()).eq("4900000000000000000")

    const totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq("17900000000000000000")

    // bears will pay 2.1, 7 * 0.3, to bulls here
    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(13, 18))
    expect(await bearToken.balanceOf(user1.address)).eq("4900000000000000000")
    expect(await bullToken.totalSupply()).eq(expandDecimals(13, 18))
    expect(await bearToken.totalSupply()).eq("4900000000000000000")

    await priceFeed.setLatestAnswer(toChainlinkPrice(1089))

    // since the price decreases, bulls will pay bears 1.47, 4.9 * 0.3
    expect(await bullToken.balanceOf(user0.address)).eq("13630000000000000000") // 13.63, 13 + 2.1 - 1.47
    expect(await bearToken.balanceOf(user1.address)).eq("4900000000000000000") // 4.9
    expect(await bullToken.totalSupply()).eq("13630000000000000000")
    expect(await bearToken.totalSupply()).eq("4900000000000000000")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    expect(await provider.getBalance(receiver1.address)).eq(0)

    await bullToken.connect(user0).approve(router.address, "13630000000000000000")
    await bearToken.connect(user1).approve(router.address, "4900000000000000000")
    await router.connect(user0).withdrawETH(bullToken.address, "13630000000000000000", receiver0.address, maxUint256)
    await router.connect(user1).withdrawETH(bearToken.address, "4900000000000000000", receiver1.address, maxUint256)

    expect(await provider.getBalance(receiver0.address)).eq("13630000000000000000")
    expect(await provider.getBalance(receiver1.address)).eq("4900000000000000000")

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq("1470000000000000000") // 1.47, 20 - 13.63 - 4.9
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)
  })

  it("rebase after price decreases then increases", async () => {
    const receiver0 = { address: "0xc68bec3369a8cd466d69c826ec0df8ee82aae36d" }
    const receiver1 = { address: "0xa59c21476c0292730ed01435673d4edc4893232d" }

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    // bulls will pay 3, 10 * 0.3, to bears here
    await priceFeed.setLatestAnswer(toChainlinkPrice(900))
    await market.rebase()

    await priceFeed.setLatestAnswer(toChainlinkPrice(810))

    const bullBalance = await bullToken.balanceOf(user0.address)
    const bearBalance = await bearToken.balanceOf(user1.address)
    expect(bullBalance).eq("4900000000000000000")
    expect(bearBalance).eq(expandDecimals(13, 18))
    expect(await bullToken.totalSupply()).eq("4900000000000000000")
    expect(await bearToken.totalSupply()).eq(expandDecimals(13, 18))

    const totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq("17900000000000000000")

    // bulls will pay 2.1, 7 * 0.3, to bears here
    await market.rebase()

    expect(await bullToken.balanceOf(user0.address)).eq("4900000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(13, 18))
    expect(await bullToken.totalSupply()).eq("4900000000000000000")
    expect(await bearToken.totalSupply()).eq(expandDecimals(13, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(891))

    expect(await bullToken.balanceOf(user0.address)).eq("4900000000000000000")
    expect(await bearToken.balanceOf(user1.address)).eq("13630000000000000000") // 13 + 2.1 - 4.9 * 0.3
    expect(await bullToken.totalSupply()).eq("4900000000000000000")
    expect(await bearToken.totalSupply()).eq("13630000000000000000")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    expect(await provider.getBalance(receiver1.address)).eq(0)

    await bullToken.connect(user0).approve(router.address, "4900000000000000000")
    await bearToken.connect(user1).approve(router.address, "13630000000000000000")
    await router.connect(user0).withdrawETH(bullToken.address, "4900000000000000000", receiver0.address, maxUint256)
    await router.connect(user1).withdrawETH(bearToken.address, "13630000000000000000", receiver1.address, maxUint256)

    expect(await provider.getBalance(receiver0.address)).eq("4900000000000000000")
    expect(await provider.getBalance(receiver1.address)).eq("13630000000000000000")

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq("1470000000000000000")
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)
  })

  it("rebase after a bull deposits", async () => {
    const receiver0 = { address: "0x8625d69ff0a22f810baa09c8886fda943d5db944" }
    const receiver1 = { address: "0xc1d2e4487ff42a5971a9f4c47914d1ac0cb16617" }
    const receiver2 = { address: "0xb367b96bd9af396dc5281cfdcd9e9571f670832f" }

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    const bullBalance = await bullToken.balanceOf(user0.address)
    const bearBalance = await bearToken.balanceOf(user1.address)
    expect(bullBalance).eq(expandDecimals(10, 18))
    expect(bearBalance).eq(expandDecimals(7, 18))

    const totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq(expandDecimals(17, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(7, 18))

    await market.rebase()

    const tx = await router.connect(user2).depositETH(bullToken.address, user2.address, maxUint256, { value: expandDecimals(26, 18) })
    await reportGasUsed(provider, tx, "depositETH gas used")
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(46, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(7, 18))
    expect(await bullToken.balanceOf(user2.address)).eq("19999999999999999999") // 19.99...
    expect(await bullToken.totalSupply()).eq("29999999999999999999")
    expect(await bearToken.totalSupply()).eq(expandDecimals(7, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1210))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(13, 18))
    expect(await bearToken.balanceOf(user1.address)).eq("4900000000000000000") // 4.9, 7 - 2.1
    expect(await bullToken.balanceOf(user2.address)).eq(expandDecimals(26, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(39, 18))
    expect(await bearToken.totalSupply()).eq("4900000000000000000")

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    expect(await provider.getBalance(receiver0.address)).eq(0)
    expect(await provider.getBalance(receiver1.address)).eq(0)
    expect(await provider.getBalance(receiver2.address)).eq(0)

    await bullToken.connect(user0).approve(router.address, expandDecimals(13, 18))
    await bearToken.connect(user1).approve(router.address, "4900000000000000000")
    await bullToken.connect(user2).approve(router.address, expandDecimals(26, 18))
    await router.connect(user0).withdrawETH(bullToken.address, expandDecimals(13, 18), receiver0.address, maxUint256)
    await router.connect(user1).withdrawETH(bearToken.address, "4900000000000000000", receiver1.address, maxUint256)
    await router.connect(user2).withdrawETH(bullToken.address, expandDecimals(26, 18), receiver2.address, maxUint256)

    expect(await provider.getBalance(receiver0.address)).eq(expandDecimals(13, 18))
    expect(await provider.getBalance(receiver1.address)).eq("4900000000000000000")
    expect(await provider.getBalance(receiver2.address)).eq(expandDecimals(26, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user2.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq("2100000000000000000") // 2.1
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)
  })

  it("rebase after a withdraw", async () => {
    const receiver0 = { address: "0xf2fe819844f5293a81e2810b00c51d5ddcf4dd93" }
    const receiver1 = { address: "0x3187d3844eed9a4111f955a1ba8fa5ff9350298d" }
    const receiver2 = { address: "0x959ca489b093da9a4abd227e468b91cfdda174e4" }

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)

    await router.connect(user0).depositETH(bullToken.address, user0.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(10, 18))

    await router.connect(user1).depositETH(bearToken.address, user1.address, maxUint256, { value: expandDecimals(10, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(20, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(10, 18))

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    await priceFeed.setLatestAnswer(toChainlinkPrice(1100))

    const bullBalance = await bullToken.balanceOf(user0.address)
    const bearBalance = await bearToken.balanceOf(user1.address)
    expect(bullBalance).eq(expandDecimals(10, 18))
    expect(bearBalance).eq(expandDecimals(7, 18))

    const totalBalance = bullBalance.add(bearBalance)
    expect(totalBalance).eq(expandDecimals(17, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(10, 18))
    expect(await bearToken.totalSupply()).eq(expandDecimals(7, 18))

    await market.rebase()

    await router.connect(user2).depositETH(bullToken.address, user2.address, maxUint256, { value: expandDecimals(26, 18) })
    expect(await weth.balanceOf(market.address)).eq(expandDecimals(46, 18))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(10, 18))
    expect(await bearToken.balanceOf(user1.address)).eq(expandDecimals(7, 18))
    expect(await bullToken.balanceOf(user2.address)).eq("19999999999999999999") // 19.99...
    expect(await bullToken.totalSupply()).eq("29999999999999999999") // 29.99...
    expect(await bearToken.totalSupply()).eq(expandDecimals(7, 18))

    await priceFeed.setLatestAnswer(toChainlinkPrice(1210))

    expect(await bullToken.balanceOf(user0.address)).eq(expandDecimals(13, 18))
    expect(await bearToken.balanceOf(user1.address)).eq("4900000000000000000") // 4.9, 7 - 2.1
    expect(await bullToken.balanceOf(user2.address)).eq(expandDecimals(26, 18))
    expect(await bullToken.totalSupply()).eq(expandDecimals(39, 18))
    expect(await bearToken.totalSupply()).eq("4900000000000000000")

    await increaseTime(provider, 61 * 60)
    await mineBlock(provider)

    expect(await provider.getBalance(receiver2.address)).eq(0)
    await bullToken.connect(user2).approve(router.address, expandDecimals(26, 18))
    await router.connect(user2).withdrawETH(bullToken.address, expandDecimals(26, 18), receiver2.address, maxUint256)
    expect(await provider.getBalance(receiver2.address)).eq(expandDecimals(26, 18))
    expect(await bullToken.balanceOf(user2.address)).eq(0)

    await priceFeed.setLatestAnswer(toChainlinkPrice(1331))

    expect(await bullToken.balanceOf(user0.address)).eq("13700000000000000000") // 13.7, 1/3 * (7 * 0.3)
    expect(await bearToken.balanceOf(user1.address)).eq("3430000000000000000") // 3.43, 4.9 - 1.47
    expect(await bullToken.balanceOf(user2.address)).eq(0)
    expect(await bullToken.totalSupply()).eq("13700000000000000000")
    expect(await bearToken.totalSupply()).eq("3430000000000000000")

    expect(await provider.getBalance(receiver0.address)).eq(0)
    expect(await provider.getBalance(receiver1.address)).eq(0)

    await bullToken.connect(user0).approve(router.address, "13700000000000000000")
    await bearToken.connect(user1).approve(router.address, "3430000000000000000")
    await router.connect(user0).withdrawETH(bullToken.address, "13700000000000000000", receiver0.address, maxUint256)
    await router.connect(user1).withdrawETH(bearToken.address, "3430000000000000000", receiver1.address, maxUint256)

    expect(await provider.getBalance(receiver0.address)).eq("13700000000000000000")
    expect(await provider.getBalance(receiver1.address)).eq("3430000000000000000")

    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await bearToken.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user2.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq("2870000000000000000") // 2.87
    expect(await bullToken.totalSupply()).eq(0)
    expect(await bearToken.totalSupply()).eq(0)
  })
})
