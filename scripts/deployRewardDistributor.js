const { deployContract, contractAt, sendTxn } = require("./helpers")

async function main() {
  const distributor = await deployContract("X2RewardDistributor", [])
  return { distributor }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
