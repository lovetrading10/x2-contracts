const { expandDecimals, reportGasUsed } = require("./utilities")
const { toChainlinkPrice } = require("./chainlink")

async function deployContract(name, args) {
  const contractFactory = await ethers.getContractFactory(name)
  return await contractFactory.deploy(...args)
}

async function contractAt(name, address) {
  const contractFactory = await ethers.getContractFactory(name)
  return await contractFactory.attach(address)
}

async function loadFixtures(provider, wallet) {
  const weth = await deployContract("WETH", [])
  const feeToken = await deployContract("X2Fee", [expandDecimals(1000, 18)])
  const feeReceiver = await deployContract("X2FeeReceiver", [])
  const factory = await deployContract("X2Factory", [feeToken.address, weth.address])
  const router = await deployContract("X2Router", [factory.address, weth.address])

  const priceFeed = await deployContract("MockPriceFeed", [])
  await priceFeed.setLatestAnswer(toChainlinkPrice(1000))

  const tx = await factory.createMarket(
    "X2:3XBULL:ETH/USD",
    "X2:3XBEAR:ETH/USD",
    weth.address,
    priceFeed.address,
    30000, // multiplierBasisPoints, 300%
    9000, // maxProfitBasisPoints, 90%
    50 // minDeltaBasisPoints, 0.5%
  )
  // reportGasUsed(provider, tx, "createMarket gas used")

  const marketAddress = await factory.markets(0)
  const market = await contractAt("X2Market", marketAddress)
  const bullToken = await contractAt("X2Token", await market.bullToken())
  const bearToken = await contractAt("X2Token", await market.bearToken())

  return { weth, feeToken, feeReceiver, factory, router, priceFeed, market, bullToken, bearToken }
}

async function loadETHFixtures(provider, wallet) {
  const weth = await deployContract("WETH", [])
  const feeReceiver = await deployContract("X2FeeReceiver", [])
  const factory = await deployContract("X2ETHFactory", [weth.address])

  const priceFeed = await deployContract("MockPriceFeed", [])
  await priceFeed.setLatestAnswer(toChainlinkPrice(1000))

  const tx = await factory.createETHMarket(
      "X2:3XBULL:ETH/USD",
      "X2:3XBEAR:ETH/USD",
      priceFeed.address,
      30000, // multiplierBasisPoints, 300%
      9000 // maxProfitBasisPoints, 90%
  )
  // reportGasUsed(provider, tx, "createETHMarket gas used")

  const marketAddress = await factory.markets(0)
  const market = await contractAt("X2ETHMarket", marketAddress)
  const bullToken = await contractAt("X2Token", await market.bullToken())
  const bearToken = await contractAt("X2Token", await market.bearToken())

  return { weth, feeReceiver, factory, priceFeed, market, bullToken, bearToken }
}

module.exports = {
  deployContract,
  contractAt,
  loadFixtures,
  loadETHFixtures
}
