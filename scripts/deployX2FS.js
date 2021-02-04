const { deployContract } = require("./helpers")
const { expandDecimals } = require("../test/shared/utilities")

async function main() {
  const token = await deployContract("X2FeeSplit", ["3X ETH/USD X2 FS", "X2FS", expandDecimals(100000, 18)])
  return { token }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
