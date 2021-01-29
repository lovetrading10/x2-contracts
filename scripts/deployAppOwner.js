const { deployContract } = require("./helpers")

async function main() {
  await deployContract("X2AppOwner", [])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
