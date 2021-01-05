const { expandDecimals } = require("../test/shared/utilities")
const { sendTxn, deployContract, contractAt } = require("./helpers")

async function createMarket({ factory, priceFeed, multiplierBasisPoints,
  maxProfitBasisPoints, bullName, bullSymbol, bearName, bearSymbol, label
}) {

  await sendTxn(factory.createMarket(
    priceFeed.address,
    multiplierBasisPoints,
    maxProfitBasisPoints
  ), label)

  const marketsLength = await factory.marketsLength()
  const marketAddress = await factory.markets(marketsLength.sub(1))
  const market = await contractAt("X2ETHMarket", marketAddress)

  await sendTxn(factory.setInfo(
    await market.bullToken(),
    bullName,
    bullSymbol,
    await market.bearToken(),
    bearName,
    bearSymbol
  ), `factory.setInfo ${bullName}, ${bullSymbol}, ${bearName}, ${bearSymbol}`)

  const bullToken = await contractAt("X2Token", await market.bullToken())
  const bearToken = await contractAt("X2Token", await market.bearToken())

  console.info("Deployed market: " + market.address,
    factory.address,
    priceFeed.address,
    multiplierBasisPoints,
    maxProfitBasisPoints
  )
  console.info("  bullToken: " + bullToken.address)
  console.info("  bearToken: " + bearToken.address)

  return { market, bullToken, bearToken }
}

async function main() {
  const factory = await deployContract("X2ETHFactory", [])
  const priceFeed = { address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" } // MAINNET
  // const priceFeed = { address: "0x9326BFA02ADD2366b30bacB125260Af641031331" } // KOVAN

  const { market, bullToken, bearToken } = await createMarket({
    factory,
    priceFeed,
    multiplierBasisPoints: 30000, // 3x, 300%
    maxProfitBasisPoints: 9000, // 90%
    bullName: "3X ETH/USD BULL",
    bullSymbol: "X2:BULL",
    bearName: "3X ETH/USD BEAR",
    bearSymbol: "X2:BEAR",
    label: "factory.createMarket 3X ETH/USD"
  })

  const distributor = await deployContract("X2TimeDistributor", [])
  await sendTxn(factory.setDistributor(bullToken.address, distributor.address), "factory.setDistributor(bullToken)")
  await sendTxn(factory.setDistributor(bearToken.address, distributor.address), "factory.setDistributor(bearToken)")
  await sendTxn(distributor.setDistribution([bullToken.address, bearToken.address], ["2000000000000000", "20000000000000000"]), "factory.setDistribution") // 0.002 and 0.02 ETH per hour

  // await sendTxn(factory.setFee(market.address, 20), "factory.setFee")
  // await sendTxn(factory.setFeeReceiver(feeReceiver.address), "factory.setFeeReceiver")

  return { factory, priceFeed, market, bullToken, bearToken }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
