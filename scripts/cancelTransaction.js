const { contractAt, sendTxn } = require("./helpers")

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const gasPriceGwei = "120"
  const gasPriceWei = ethers.utils.parseUnits(gasPriceGwei, 9)

  const tx = signer.sendTransaction({
    to: wallet.address
    value: 0,
    gasPrice: gasPriceWei
  })

  console.log("tx", tx.hash)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
