const { sendTxn, deployContract, contractAt } = require("./helpers")

async function main() {
  const feeReceiver = await deployContract("MockFeeReceiver", [])
  const vault = await contractAt("BurnVault", "0x7D1c31E27b4b635fA15A91367d82C8bca9f51C26")
  // const factory = await contractAt("X2ETHFactory", "0xc3f9de2840776b9798c79d194dd07d76bd052046")
  // const market = await contractAt("X2ETHMarket", "0xEE973f48Faba51ee076B91809514aD6b929224dC")

  // await sendTxn(factory.setFeeReceiver(feeReceiver.address), "factory.setFeeReceiver")
  // await sendTxn(market.distributeInterest(), "market.distributeInterest")

  await sendTxn(vault.setDistributor(feeReceiver.address), "vault.setDistributor")
  // await sendTxn(vault.addSender("0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8"), "vault.addSender")
  await sendTxn(vault.distribute(), "vault.distribute")

  return { feeReceiver }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
