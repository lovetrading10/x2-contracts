const { expandDecimals } = require("./utilities")
const { toChainlinkPrice } = require("./chainlink")

async function deployContract(name, args) {
  const contractFactory = await ethers.getContractFactory(name)
  return await contractFactory.deploy(...args)
}

async function contractAt(name, address) {
  const contractFactory = await ethers.getContractFactory(name)
  return await contractFactory.attach(address)
}

async function loadETHFixtures(provider) {
  const feeReceiver = await deployContract("X2FeeReceiver", [])
  const factory = await deployContract("X2ETHFactory", [])

  const priceFeed = await deployContract("MockPriceFeed", [])
  await priceFeed.setLatestAnswer(toChainlinkPrice(1000))

  await factory.createMarket(
      priceFeed.address,
      30000, // multiplierBasisPoints, 300%
      9000, // maxProfitBasisPoints, 90%
      5000, // fundingDivisor
      10, // appFeeBasisPoints, 0.1%
      ethers.constants.AddressZero
  )

  const marketAddress = await factory.markets(0)
  const market = await contractAt("X2ETHMarket", marketAddress)
  const bullToken = await contractAt("X2Token", await market.bullToken())
  const bearToken = await contractAt("X2Token", await market.bearToken())

  return { feeReceiver, factory, priceFeed, market, bullToken, bearToken }
}

async function loadXvixFixtures(provider) {
  const govHandoverTime = 1 // for testing convenience use a govHandoverTime that has already passed
  const initialSupply = expandDecimals(1000, 18)
  const maxSupply = expandDecimals(2000, 18)
  const xvix = await deployContract("XVIX", [initialSupply, maxSupply, govHandoverTime])
  const floor = await deployContract("Floor", [xvix.address])
  await xvix.setFloor(floor.address)

  return { xvix, floor }
}

module.exports = {
  deployContract,
  contractAt,
  loadETHFixtures,
  loadXvixFixtures
}
