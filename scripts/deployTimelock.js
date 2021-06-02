const { deployContract, contractAt } = require("./helpers")

async function main() {
  const buffer = 5 * 24 * 60 * 60
  await deployContract("Timelock", [buffer])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
