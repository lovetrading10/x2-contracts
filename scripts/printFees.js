const { contractAt } = require("./helpers")
const { getMarkets } = require("../data/markets")

const CHAIN_ID = 1
const DUST_AMOUNT = "10000000000000000"

async function main() {
  const markets = getMarkets(CHAIN_ID)
  console.info(`Markets: ${markets.length}`)

  const filteredMarkets = []
  let totalFees = ethers.BigNumber.from(0)
  for (let i = 0; i < markets.length; i++) {
    const marketInfo = markets[i]
    const market = await contractAt("X2ETHMarket", marketInfo.address)
    const fees = await market.feeReserve()
    marketInfo.fees = fees
    console.info(`${marketInfo.name}: ${ethers.utils.formatEther(fees.toString())} ETH`)

    if (fees.gt(DUST_AMOUNT)) {
      totalFees = totalFees.add(fees)
      filteredMarkets.push(marketInfo)
    }
  }

  console.info("--------------")
  console.info(`Total Fees: ${ethers.utils.formatEther(totalFees.toString())}`)
  for (let i = 0; i < filteredMarkets.length; i++) {
    const marketInfo = filteredMarkets[i]
    console.info(`${marketInfo.name}: ${ethers.utils.formatEther(marketInfo.fees.toString())} ETH`)
  }

  console.info("--------------")
  console.info(filteredMarkets.map(m => m.address).join(","))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
