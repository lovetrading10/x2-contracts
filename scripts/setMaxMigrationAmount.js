const { contractAt, sendTxn } = require("./helpers")

async function main() {
  const account = "0x30043aAbBCeBbD887437Ec4F0Cfe6d4c0eB5CC64"
  const shouldApprove = true
  const gasPriceGwei = "60"
  const gasPriceWei = ethers.utils.parseUnits(gasPriceGwei, 9)
  const migrationTokens = ["XVIX"]
  // const migrationTokens = ["XVIX", "XVIX_ETH", "XLGE"]

  const gmxMigrator = await contractAt("GmxMigrator", "0x2706AA4532721e6bCe2eA21c3Bb5bbb2146d1Ef1")
  const xvix = {
    name: "XVIX",
    contract: await contractAt("Token", "0x4bAE380B5D762D543d426331b8437926443ae9ec")
  }
  const xvixEth = {
    name: "XVIX_ETH",
    contract: await contractAt("Token", "0x619aAa52a10F196e521F823aeD4CdeA30D45D366")
  }
  const xlge = {
    name: "XLGE",
    contract: await contractAt("Token", "0xC278A41fC6cf7F488AEa2D0Ab321CC77128931D5")
  }
  const tokens = [xvix, xvixEth, xlge]

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!migrationTokens.includes(token.name)) {
      continue
    }
    const balance = await token.contract.balanceOf(account)
    console.log(`${account} ${token.name}: ${ethers.utils.formatUnits(balance, 18)}`)
  }

  if (shouldApprove) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (!migrationTokens.includes(token.name)) {
        continue
      }

      const balance = await token.contract.balanceOf(account)
      if (balance.eq(0)) { continue }

      const migratedAmount = await gmxMigrator.migratedAmounts(account, token.contract.address)
      const totalAmount = balance.add(migratedAmount)

      const message = `approve ${account} ${token.name}: ${ethers.utils.formatUnits(balance, 18)}, ${ethers.utils.formatUnits(totalAmount, 18)}`
      await sendTxn(gmxMigrator.setMaxMigrationAmount(account, token.contract.address, totalAmount, { gasPrice: gasPriceWei }), message)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
