const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadETHFixtures, contractAt, deployContract } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, increaseTime, mineBlock } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2ETHFactory", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let factory
  let router
  let market
  let bullToken
  let bearToken
  let priceFeed
  let feeSplitToken

  beforeEach(async () => {
    const fixtures = await loadETHFixtures(provider)
    factory = fixtures.factory
    market = fixtures.market
    bullToken = fixtures.bullToken
    bearToken = fixtures.bearToken
    priceFeed = fixtures.priceFeed
    feeSplitToken = await deployContract("X2FeeSplit", ["X2 Fee Split", "X2FS", expandDecimals(50000, 18)])
  })

  // it("inits", async () => {
  //   expect(await factory.gov()).eq(wallet.address)
  // })
  //
  // it("marketsLength", async () => {
  //   expect(await factory.marketsLength()).eq(1)
  // })

  // it("setGov", async () => {
  //   expect(await factory.gov()).eq(wallet.address)
  //   await expect(factory.connect(user0).setGov(user0.address))
  //     .to.be.revertedWith("X2ETHFactory: forbidden")
  //
  //   await factory.setGov(user0.address)
  //   expect(await factory.gov()).eq(user0.address)
  //
  //   await factory.connect(user0).setGov(user1.address)
  //   expect(await factory.gov()).eq(user1.address)
  // })

  // it("setDistributor", async () => {
  //   expect(await factory.gov()).eq(wallet.address)
  //   await expect(factory.connect(user0).setDistributor(bullToken.address, user1.address, feeSplitToken.address))
  //     .to.be.revertedWith("X2ETHFactory: forbidden")
  //
  //   await factory.setGov(user0.address)
  //   expect(await factory.gov()).eq(user0.address)
  //
  //   expect(await bullToken.distributor()).eq(ethers.constants.AddressZero)
  //   await factory.connect(user0).setDistributor(bullToken.address, user1.address, feeSplitToken.address)
  //   expect(await bullToken.distributor()).eq(user1.address)
  // })

  // it("setFunding", async () => {
  //   expect(await factory.gov()).eq(wallet.address)
  //   await expect(factory.connect(user0).setFunding(market.address, 1000))
  //     .to.be.revertedWith("X2ETHFactory: forbidden")
  //
  //   await factory.setGov(user0.address)
  //   expect(await factory.gov()).eq(user0.address)
  //
  //   expect(await market.fundingDivisor()).eq(5000)
  //   await factory.connect(user0).setFunding(market.address, 1000)
  //   expect(await market.fundingDivisor()).eq(1000)
  // })

  // it("setAppOwner", async () => {
  //   expect(await factory.gov()).eq(wallet.address)
  //   await expect(factory.connect(user0).setAppOwner(user1.address))
  //     .to.be.revertedWith("X2ETHFactory: forbidden")
  //
  //   await factory.setGov(user0.address)
  //   expect(await factory.gov()).eq(user0.address)
  //
  //   expect(await factory.appOwner()).eq(ethers.constants.AddressZero)
  //   await factory.connect(user0).setAppOwner(user1.address)
  //   expect(await factory.appOwner()).eq(user1.address)
  // })

  // it("setAppFee", async () => {
  //   expect(await factory.gov()).eq(wallet.address)
  //   await expect(factory.connect(wallet).setAppFee(market.address, 10, user2.address))
  //     .to.be.revertedWith("X2ETHFactory: forbidden")
  //   await expect(factory.connect(user1).setAppFee(market.address, 10, user2.address))
  //     .to.be.revertedWith("X2ETHFactory: forbidden")
  //
  //   await factory.setAppOwner(user1.address)
  //   expect(await factory.appOwner()).eq(user1.address)
  //
  //   expect(await market.appFeeBasisPoints()).eq(10)
  //   expect(await market.appFeeReceiver()).eq(ethers.constants.AddressZero)
  //   await factory.connect(user1).setAppFee(market.address, 20, user2.address)
  //   expect(await market.appFeeBasisPoints()).eq(20)
  //   expect(await market.appFeeReceiver()).eq(user2.address)
  // })
  //
  // it("setFeeReceiver", async () => {
  //   expect(await factory.feeReceiver()).eq(ethers.constants.AddressZero)
  //   await expect(factory.connect(user0).setFeeReceiver(user1.address))
  //     .to.be.revertedWith("X2ETHFactory: forbidden")
  //
  //   await factory.setGov(user0.address)
  //   expect(await factory.gov()).eq(user0.address)
  //
  //   expect(await factory.feeReceiver()).eq(ethers.constants.AddressZero)
  //   await factory.connect(user0).setFeeReceiver(user1.address)
  //   expect(await factory.feeReceiver()).eq(user1.address)
  // })
  //
  // it("setInterestReceiver", async () => {
  //   expect(await factory.interestReceiver()).eq(ethers.constants.AddressZero)
  //   await expect(factory.connect(user0).setInterestReceiver(user2.address))
  //     .to.be.revertedWith("X2ETHFactory: forbidden")
  //
  //   await factory.setGov(user0.address)
  //   expect(await factory.gov()).eq(user0.address)
  //
  //   expect(await factory.interestReceiver()).eq(ethers.constants.AddressZero)
  //   await factory.connect(user0).setInterestReceiver(user2.address)
  //   expect(await factory.interestReceiver()).eq(user2.address)
  // })

  // it("setInfo", async () => {
  //   expect(await factory.gov()).eq(wallet.address)
  //   await expect(factory.connect(user0).setInfo(
  //     bullToken.address,
  //     "X2:BULL Token",
  //     "X2:BULL",
  //     bearToken.address,
  //     "X2:BEAR Token",
  //     "X2:BEAR"
  //   )).to.be.revertedWith("X2ETHFactory: forbidden")
  //
  //   await factory.setGov(user0.address)
  //   expect(await factory.gov()).eq(user0.address)
  //
  //   expect(await bullToken.name()).eq("X2")
  //   expect(await bullToken.symbol()).eq("X2")
  //   expect(await bearToken.name()).eq("X2")
  //   expect(await bearToken.symbol()).eq("X2")
  //   await factory.connect(user0).setInfo(
  //     bullToken.address,
  //     "X2:BULL Token",
  //     "X2:BULL",
  //     bearToken.address,
  //     "X2:BEAR Token",
  //     "X2:BEAR"
  //   )
  //   expect(await bullToken.name()).eq("X2:BULL Token")
  //   expect(await bullToken.symbol()).eq("X2:BULL")
  //   expect(await bearToken.name()).eq("X2:BEAR Token")
  //   expect(await bearToken.symbol()).eq("X2:BEAR")
  // })

  it("createMarket", async () => {
    const tx = await factory.createMarket(
      priceFeed.address,
      50000, // multiplierBasisPoints, 500%
      10000, // maxProfitBasisPoints, 100%
      1000, // fundingDivisor
      5, // appFeeBasisPoints
      user2.address
    )
    await reportGasUsed(provider, tx, "createMarket gas used")

    expect(await factory.marketsLength()).eq(2)

    const marketAddress = await factory.markets(1)
    const market = await contractAt("X2ETHMarket", marketAddress)
    const bullToken = await contractAt("X2Token", await market.bullToken())
    const bearToken = await contractAt("X2Token", await market.bearToken())

    expect(await market.factory()).eq(factory.address)
    expect(await market.priceFeed()).eq(priceFeed.address)
    expect(await market.multiplierBasisPoints()).eq(50000)
    expect(await market.maxProfitBasisPoints()).eq(10000)
    expect(await market.fundingDivisor()).eq(1000)
    expect(await market.appFeeBasisPoints()).eq(5)
    expect(await market.lastPrice()).eq(toChainlinkPrice(1000))

    expect(await bullToken.factory()).eq(factory.address)
    expect(await bullToken.market()).eq(market.address)
    expect(await bearToken.factory()).eq(factory.address)
    expect(await bearToken.market()).eq(market.address)

    await expect(market.initialize(
      factory.address,
      priceFeed.address,
      50000, // multiplierBasisPoints, 500%
      8000, // maxProfitBasisPoints, 80%
      2000, // fundingDivisor
      10 // appFeeBasisPoints
    )).to.be.reverted

    await expect(bullToken.initialize(factory.address, market.address))
      .to.be.revertedWith("X2Token: already initialized")

    await expect(bearToken.initialize(factory.address, market.address))
      .to.be.revertedWith("X2Token: already initialized")
  })
})
