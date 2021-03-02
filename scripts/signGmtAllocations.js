const { getAllocations } = require("../data/allocations")
const { MAINNET_DEPLOY_KEY } = require("../env.json")

async function signAllocation(account, allocation, signer) {
    const message = ethers.utils.solidityKeccak256(
      ["string", "address", "uint256"],
      ["GmtSwap:GmtAllocation", account, allocation]
    )
    const bytes = ethers.utils.arrayify(message)
    return await signer.signMessage(bytes)
}

async function main() {
  const allocations = getAllocations()
  const signer = new ethers.Wallet(MAINNET_DEPLOY_KEY)
  const data = {}
  for (const account in allocations) {
    const amount = ethers.utils.parseEther(parseFloat(allocations[account]).toFixed(4))
    const sig = await signAllocation(account, amount.toString(), signer)
    data[account] = { amount: amount.toString(), sig }
  }
  console.info(JSON.stringify(data))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
