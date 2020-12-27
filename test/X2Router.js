const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadFixtures, deployContract, contractAt } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2Router", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let weth
  let factory
  let router
  let market
  let priceFeed
  let bullToken
  let bearToken
  let feeToken
  let feeReceiver

  beforeEach(async () => {
    const fixtures = await loadFixtures(provider)
    weth = fixtures.weth
    factory = fixtures.factory
    router = fixtures.router
    market = fixtures.market
    priceFeed = fixtures.priceFeed
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
    const token0 = await deployContract("X2Token", [])
    await token0.initialize(factory.address, market.address)
    await weth.connect(user0).deposit({ value: 100 })
    await weth.connect(user0).approve(router.address, 100)
    await expect(router.connect(user0).deposit(token0.address, 100, 0, user0.address, maxUint256))
      .to.be.revertedWith("X2Market: unsupported token")

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(100)
    await router.connect(user0).deposit(bullToken.address, 100, 0, user0.address, maxUint256)
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
    await router.connect(user1).deposit(bullToken.address, 2000, 0, user2.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(2100)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user2.address)).eq(1996) // 2000 - 4
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
    await factory.createMarket(
      feeToken.address,
      priceFeed.address,
      30000, // multiplierBasisPoints, 300%
      9000, // maxProfitBasisPoints, 90%
      50 // minDeltaBasisPoints, 0.5%
    )
    const marketAddress1 = await factory.markets(1)
    const market1 = await contractAt("X2Market", marketAddress1)
    const bullToken1 = await contractAt("X2Token", await market1.bullToken())
    await expect(router.connect(user0).depositETH(bullToken1.address, 0, user0.address, maxUint256, { value: 100 }))
      .to.be.revertedWith("X2Router: mismatched collateral")

    const token0 = await deployContract("X2Token", [])
    token0.initialize(factory.address, market.address)
    await expect(router.connect(user0).depositETH(token0.address, 0, user0.address, maxUint256, { value: 100 }))
      .to.be.revertedWith("X2Market: unsupported token")

    expect(await weth.balanceOf(market.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 100 })
    expect(await weth.balanceOf(market.address)).eq(100)
    expect(await weth.balanceOf(user0.address)).eq(0)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await weth.balanceOf(market.address)).eq(100)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
    await router.connect(user1).depositETH(bullToken.address, 0, user2.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2100)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user2.address)).eq(1996) // 2000 - 4
    expect(await market.feeReserve()).eq(4)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(2100)
    expect(await market.feeReserve()).eq(4)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(4)
    expect(await weth.balanceOf(market.address)).eq(2096)
    expect(await market.feeReserve()).eq(0)
  })

  it("deposit with feeSubsidy", async () => {
    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)
    await feeToken.transfer(user0.address, 1)
    await feeToken.connect(user0).approve(router.address, 1)

    const token0 = await deployContract("X2Token", [])
    token0.initialize(factory.address, market.address)
    await weth.connect(user0).deposit({ value: 2000 })
    await weth.connect(user0).approve(router.address, 2000)
    await expect(router.connect(user0).deposit(token0.address, 2000, 1, user0.address, maxUint256))
      .to.be.revertedWith("X2Market: unsupported token")

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await feeToken.balanceOf(market.address)).eq(0)
    await router.connect(user0).deposit(bullToken.address, 2000, 1, user1.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(1997)
    expect(await feeToken.balanceOf(market.address)).eq(1)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await market.feeReserve()).eq(3)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(3)
    expect(await weth.balanceOf(market.address)).eq(1997)
    expect(await market.feeReserve()).eq(0)
  })

  it("depositETH with feeSubsidy", async () => {
    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)
    await feeToken.transfer(user0.address, 1)
    await feeToken.connect(user0).approve(router.address, 1)

    const token0 = await deployContract("X2Token", [])
    token0.initialize(factory.address, market.address)
    await expect(router.connect(user0).depositETH(token0.address, 1, user0.address, maxUint256, { value: 2000 }))
      .to.be.revertedWith("X2Market: unsupported token")

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    expect(await feeToken.balanceOf(market.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 1, user0.address, maxUint256, { value: 2000 })
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
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    await bullToken.connect(user0).approve(router.address, 2000)
    await router.connect(user0).withdraw(bullToken.address, 2000, 0, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await router.connect(user1).depositETH(bullToken.address, 0, user1.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await market.feeReserve()).eq(0)
    await bullToken.connect(user1).approve(router.address, 5000)
    await router.connect(user1).withdraw(bullToken.address, 5000, 0, receiver1.address, maxUint256)
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

  it("withdraw with feeSubsidy", async () => {
    const receiver0 = { address: "0xa43cf2374226776c585c164e07ca25ecce23eaa8" }
    const receiver1 = { address: "0x811ca1bb453f5386084a2546019bb7e71c55feda" }

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    await bullToken.connect(user0).approve(router.address, 2000)
    await router.connect(user0).withdraw(bullToken.address, 2000, 0, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await router.connect(user1).depositETH(bullToken.address, 0, user1.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await feeToken.transfer(user1.address, 1)
    await feeToken.connect(user1).approve(router.address, 1)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await market.feeReserve()).eq(0)
    await bullToken.connect(user1).approve(router.address, 5000)
    expect(await feeToken.balanceOf(market.address)).eq(0)
    await router.connect(user1).withdraw(bullToken.address, 5000, 1, receiver1.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(9)
    expect(await weth.balanceOf(receiver1.address)).eq(4991) // 5000 - 9
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(9)
    expect(await feeToken.balanceOf(market.address)).eq(1)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(9)
    expect(await market.feeReserve()).eq(9)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(9)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
  })

  it("withdrawETH", async () => {
    const receiver0 = { address: "0x096b7f612187ca4d608309829fb07faf67ff2364" }
    const receiver1 = { address: "0x42b712f6740cd401f6a9af7ca50f7b67203907ae" }

    await factory.createMarket(
      feeToken.address,
      priceFeed.address,
      30000, // multiplierBasisPoints, 300%
      9000, // maxProfitBasisPoints, 90%
      50 // minDeltaBasisPoints, 0.5%
    )

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    await bullToken.connect(user0).approve(router.address, 2000)
    await router.connect(user0).withdrawETH(bullToken.address, 2000, 0, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await provider.getBalance(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await bullToken.connect(user1).approve(router.address, 5000)
    await router.connect(user1).depositETH(bullToken.address, 0, user1.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await provider.getBalance(receiver1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await market.feeReserve()).eq(0)
    await router.connect(user1).withdrawETH(bullToken.address, 5000, 0, receiver1.address, maxUint256)
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

  it("withdrawETH with feeSubsidy", async () => {
    const receiver0 = { address: "0x372664cc97c9d0942c2739490f48705b2f834b0a" }
    const receiver1 = { address: "0xa0afaa285ce85974c3c881256cb7f225e3a1178a" }

    await factory.createMarket(
      feeToken.address,
      priceFeed.address,
      30000, // multiplierBasisPoints, 300%
      9000, // maxProfitBasisPoints, 90%
      50 // minDeltaBasisPoints, 0.5%
    )

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    await bullToken.connect(user0).approve(router.address, 2000)
    await router.connect(user0).withdrawETH(bullToken.address, 2000, 0, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await provider.getBalance(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await bullToken.connect(user1).approve(router.address, 5000)
    await router.connect(user1).depositETH(bullToken.address, 0, user1.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await provider.getBalance(receiver1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await feeToken.transfer(user1.address, 2)
    await feeToken.connect(user1).approve(router.address, 2)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await market.feeReserve()).eq(0)
    await router.connect(user1).withdrawETH(bullToken.address, 5000, 2, receiver1.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(8)
    expect(await provider.getBalance(receiver1.address)).eq(4992) // 5000 - 8
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(8)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(8)
    expect(await market.feeReserve()).eq(8)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(8)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
  })

  it("withdrawAll", async () => {
    const receiver0 = { address: "0xdac17f958d2ee523a2206206994597c13d831ec7" }
    const receiver1 = { address: "0xe894a24c5823d8339ea43be889d975db57d4eec2" }

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    await bullToken.connect(user0).approve(router.address, 2000)
    await router.connect(user0).withdrawAll(bullToken.address, 0, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await router.connect(user1).depositETH(bullToken.address, 0, user1.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await market.feeReserve()).eq(0)
    await bullToken.connect(user1).approve(router.address, 5000)
    await router.connect(user1).withdrawAll(bullToken.address, 0, receiver1.address, maxUint256)
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

  it("withdrawAll with feeSubsidy", async () => {
    const receiver0 = { address: "0x74ca1123bd038606baabd33f1d07260cbed7c34c" }
    const receiver1 = { address: "0x976b2f771331ab090363e4e7ca0da9f254983c16" }

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    await bullToken.connect(user0).approve(router.address, 2000)
    await router.connect(user0).withdrawAll(bullToken.address, 0, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await router.connect(user1).depositETH(bullToken.address, 0, user1.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await feeToken.transfer(user1.address, 3)
    await feeToken.connect(user1).approve(router.address, 3)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await market.feeReserve()).eq(0)
    await bullToken.connect(user1).approve(router.address, 5000)
    await router.connect(user1).withdrawAll(bullToken.address, 3, receiver1.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(7)
    expect(await weth.balanceOf(receiver1.address)).eq(4993) // 5000 - 7
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(7)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(7)
    expect(await market.feeReserve()).eq(7)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(7)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
  })

  it("withdrawAllETH", async () => {
    const receiver0 = { address: "0x88d8986ff52b01dd1527b705326709c9eb9871ca" }
    const receiver1 = { address: "0xa1e20cc111b2983b694cbb5cee73a33d6841574e" }

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    await bullToken.connect(user0).approve(router.address, 2000)
    await router.connect(user0).withdrawAllETH(bullToken.address, 0, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await provider.getBalance(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await router.connect(user1).depositETH(bullToken.address, 0, user1.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await provider.getBalance(receiver1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await market.feeReserve()).eq(0)
    await bullToken.connect(user1).approve(router.address, 5000)
    await router.connect(user1).withdrawAllETH(bullToken.address, 0, receiver1.address, maxUint256)
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

  it("withdrawAllETH with feeSubsidy", async () => {
    const receiver0 = { address: "0xb982fad15538647743b983f4aa5deaf8266e0d67" }
    const receiver1 = { address: "0x2a8614952d7c2f2c60ca26db4d989719e2a431de" }

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await bullToken.balanceOf(user0.address)).eq(0)
    await router.connect(user0).depositETH(bullToken.address, 0, user0.address, maxUint256, { value: 2000 })
    expect(await weth.balanceOf(market.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(2000)

    await bullToken.connect(user0).approve(router.address, 2000)
    await router.connect(user0).withdrawAllETH(bullToken.address, 0, receiver0.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await provider.getBalance(receiver0.address)).eq(2000)
    expect(await bullToken.balanceOf(user0.address)).eq(0)

    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await weth.balanceOf(user1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    await router.connect(user1).depositETH(bullToken.address, 0, user1.address, maxUint256, { value: 5000 })
    expect(await weth.balanceOf(market.address)).eq(5000)
    expect(await provider.getBalance(receiver1.address)).eq(0)
    expect(await bullToken.balanceOf(user1.address)).eq(5000)

    await feeToken.transfer(user1.address, 4)
    await feeToken.connect(user1).approve(router.address, 4)

    await factory.setFee(market.address, 20)
    await factory.setFeeReceiver(feeReceiver.address)

    expect(await market.feeReserve()).eq(0)
    await bullToken.connect(user1).approve(router.address, 5000)
    await router.connect(user1).withdrawAllETH(bullToken.address, 4, receiver1.address, maxUint256)
    expect(await weth.balanceOf(market.address)).eq(6)
    expect(await provider.getBalance(receiver1.address)).eq(4994) // 5000 - 6
    expect(await bullToken.balanceOf(user1.address)).eq(0)
    expect(await market.feeReserve()).eq(6)

    expect(await weth.balanceOf(feeReceiver.address)).eq(0)
    expect(await weth.balanceOf(market.address)).eq(6)
    expect(await market.feeReserve()).eq(6)
    await market.distributeFees()
    expect(await weth.balanceOf(feeReceiver.address)).eq(6)
    expect(await weth.balanceOf(market.address)).eq(0)
    expect(await market.feeReserve()).eq(0)
  })
})
