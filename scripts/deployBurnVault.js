const { deployContract, contractAt, sendTxn } = require("./helpers")

async function main() {
  const xvix = await contractAt("XVIX", "0x4bAE380B5D762D543d426331b8437926443ae9ec")
  const floor = { address: "0x40ed3699c2ffe43939ecf2f3d11f633b522820ad" }
  const vault = await deployContract("BurnVault", [xvix.address, floor.address])
  await sendTxn(xvix.createSafe(vault.address), "xvix.createSafe")
  await sendTxn(xvix.setTransferConfig(vault.address, 0, 0, 0, 0), "xvix.setTransferConfig")

  return { vault }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
