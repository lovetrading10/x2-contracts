const { deployContract } = require("./helpers")

async function main() {
  const weth = { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" }
  const xvixBurner = await deployContract("XvixBurner", [weth.address])
  return { xvixBurner }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
