const { contractAt } = require("./helpers")

async function main() {
  const factory = await contractAt("X2ETHFactory", "0x9E372B445723e71117B59393aABa05aD3B54AD3f")
  const { index } = process.env
  const marketAddress = await factory.markets(index)
  const market = await contractAt("X2ETHMarket", marketAddress)
  const bullToken = await market.bullToken()
  const bearToken = await market.bearToken()
  const priceFeedAddress = await market.priceFeed()
  const priceFeed = await contractAt("MockPriceFeed", priceFeedAddress)
  const marketInfo = {
    index,
    name: (await priceFeed.description()).replace(" / ", "_"),
    address: marketAddress,
    bullToken,
    bearToken,
    priceFeed: {
      address: priceFeedAddress,
      aggregator: await priceFeed.aggregator()
    },
    leverage: (await market.multiplierBasisPoints()) / 10000,
    maxProfit: (await market.maxProfitBasisPoints()) / 100,
    fundingDivisor: (await market.fundingDivisor()).toNumber(),
    appFeeBasisPoints: (await market.appFeeBasisPoints()).toNumber()
  }
  if (marketInfo.maxProfit !== 90) {
    throw new Error("Unexpected maxProfit")
  }
  if (marketInfo.fundingDivisor !== 5000) {
    throw new Error("Unexpected fundingDivisor")
  }
  if (marketInfo.appFeeBasisPoints !== 10) {
    throw new Error("Unexpected appFeeBasisPoints")
  }
  console.info("marketInfo", marketInfo)
  console.info("--------------")
  console.info(`"${bullToken}" : {
    marketAddress: "${marketInfo.address}",
    marketName: "${marketInfo.name}",
    isBull: true
  },`)
  console.info(`"${bearToken}" : {
    marketAddress: "${marketInfo.address}",
    marketName: "${marketInfo.name}",
    isBull: false
  }`)
  console.info("--------------")
  console.info(`"${marketInfo.address}" : {
    name: "${marketInfo.name}",
    priceFeed: "${priceFeed.address}",
    aggregator: "${marketInfo.priceFeed.aggregator}"
  }`)
  console.info("--------------")
  console.info(`{
    name: "${marketInfo.leverage}X ${marketInfo.name.replace("_", "/")}",
    address: "${marketInfo.address}",
    bullToken: "${bullToken}",
    bearToken: "${bearToken}",
    label: "${marketInfo.name.replace("_", "/")}",
    leverage: ${marketInfo.leverage},
    priceFeed: "${priceFeed.address}"
  }`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
