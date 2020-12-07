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
  const factory = await deployContract("X2Factory", [feeToken.address])
  const router = await deployContract("X2Router", [factory.address, weth.address])
  await factory.setRouter(router.address)

  const priceFeed = await deployContract("MockPriceFeed", [])
  await priceFeed.setLatestAnswer(toChainlinkPrice(1000))

  const tx = await factory.createMarket(
    "3X BULL ETH/USD",
    "3X BEAR ETH/USD",
    weth.address,
    priceFeed.address,
    3, // multiplier
    60 * 60, // unlockDelay of 1 hour
    9000 // maxProfitBasisPoints, 90%
  )
  // reportGasUsed(provider, tx, "createMarket gas used")

  const marketAddress = await factory.allMarkets(0)
  const market = await contractAt("X2Market", marketAddress)
  const bullToken = await contractAt("X2Token", await market.bullToken())
  const bearToken = await contractAt("X2Token", await market.bearToken())

  return { weth, feeToken, factory, router, priceFeed, market, bullToken, bearToken }
}

module.exports = {
  deployContract,
  contractAt,
  loadFixtures
}
