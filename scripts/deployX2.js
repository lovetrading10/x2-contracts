const { expandDecimals } = require("../test/shared/utilities")
const { sendTxn, deployContract, contractAt } = require("./helpers")

async function createMarket({ factory, bullSymbol, bearSymbol, weth, priceFeed,
  multiplier, unlockDelay, maxProfitBasisPoints, minDeltaBasisPoints, label
}) {

  await sendTxn(factory.createMarket(
    bullSymbol,
    bearSymbol,
    weth.address,
    priceFeed.address,
    multiplier,
    unlockDelay,
    maxProfitBasisPoints,
    minDeltaBasisPoints
  ), label)

  const marketsLength = await factory.marketsLength()
  const marketAddress = await factory.markets(marketsLength.sub(1))
  const market = await contractAt("X2Market", marketAddress)
  const bullToken = await contractAt("X2Token", await market.bullToken())
  const bearToken = await contractAt("X2Token", await market.bearToken())

  console.info("Deployed market: " + market.address,
    bullSymbol,
    bearSymbol,
    weth.address,
    priceFeed.address,
    multiplier,
    unlockDelay,
    maxProfitBasisPoints,
    minDeltaBasisPoints
  )
  console.info("  bullToken: " + bullToken.address)
  console.info("  bearToken: " + bearToken.address)

  return { market, bullToken, bearToken }
}

async function main() {
  // const weth = await contractAt("WETH", "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2") // MAINNET
  const weth = await contractAt("WETH", "0xd0a1e359811322d97991e03f863a0c30c2cf029c") // KOVAN

  const feeToken = await deployContract("X2Fee", [expandDecimals(1000, 18)])
  const feeReceiver = await deployContract("X2FeeReceiver", [])
  const factory = await deployContract("X2Factory", [feeToken.address])
  const router = await deployContract("X2Router", [factory.address, weth.address])
  await sendTxn(factory.setRouter(router.address), "factory.setRouter")

  const priceFeed = { address: "0x9326BFA02ADD2366b30bacB125260Af641031331" }

  const { market, bullToken, bearToken } = await createMarket({
    factory,
    bullSymbol: "X2:3XBULL:ETH/USD",
    bearSymbol: "X2:3XBEAR:ETH/USD",
    weth,
    priceFeed,
    multiplier: 3,
    unlockDelay: 10 * 60, // 10 minutes
    maxProfitBasisPoints: 9000, // 90%
    minDeltaBasisPoints: 50 // 0.5%
  })

  await sendTxn(factory.setFee(market.address, 20), "factory.setFee")
  await sendTxn(factory.setFeeReceiver(feeReceiver.address), "factory.setFeeReceiver")

  return { weth, feeToken, feeReceiver, factory, router, priceFeed, market, bullToken, bearToken }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
