const { deployContract, contractAt, sendTxn } = require("./helpers")

async function main() {
  const xvixEthUni = { address: "0x619aAa52a10F196e521F823aeD4CdeA30D45D366" }
  const vault = await deployContract("Farm", [xvixEthUni.address])

  return { vault }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
