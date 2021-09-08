const { contractAt, sendTxn } = require("./helpers")
const { MAINNET_URL, MAINNET_DEPLOY_KEY } = require("../env.json")

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(MAINNET_URL)
  const signer = new ethers.Wallet(MAINNET_DEPLOY_KEY, provider)
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const gasPriceGwei = "150"
  const gasPriceWei = ethers.utils.parseUnits(gasPriceGwei, 9)
  const nonce = 542

  const tx = await signer.sendTransaction({
    to: wallet.address,
    value: 0,
    gasPrice: gasPriceWei,
    nonce
  })

  console.log("tx", tx.hash)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
