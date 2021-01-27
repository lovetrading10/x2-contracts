const { deployContract, contractAt, sendTxn } = require("./helpers")

async function main() {
  // const distributor = await deployContract("X2TimeDistributor", [])
  const distributor = await contractAt("X2TimeDistributor", "0x7F98d265Ba2609c1534D12cF6b0976505Ad7F653")
  // const token = { address: "0x768Ca31d89Ee8f3cffcB8B73F217CC2ca052c068" }
  // const factory = await contractAt("X2ETHFactory", "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2")
  // await factory.setDistributor(token.address, distributor.address)

  const xlgeFarm = await contractAt("Farm", "0x7c1cFFEA9E773186A5950Bb27CBf14b895b4025E")
  const uniFarm = await contractAt("Farm", "0x8A3d7A49ADa4FED00d83fA6827F46F83b62eF87F")
  const burnVaultV2 = await contractAt("BurnVault", "0x780e9996Ec934cba0E2FC830C9b9f3e19F99ec3B")
  const timeVaultV2 = await contractAt("TimeVault", "0x82147C5A7E850eA4E28155DF107F2590fD4ba327")

  // await sendTxn(xlgeFarm.setDistributor(distributor.address), "xlgeFarm.setDistributor")
  // await sendTxn(uniFarm.setDistributor(distributor.address), "uniFarm.setDistributor")
  // await sendTxn(burnVaultV2.setDistributor(distributor.address), "burnVaultV2.setDistributor")
  // await sendTxn(timeVaultV2.setDistributor(distributor.address), "timeVaultV2.setDistributor")

  await distributor.setDistribution([
    xlgeFarm.address,
    uniFarm.address,
    burnVaultV2.address,
    timeVaultV2.address
  ], [
    "2159750000000000",
    "3599583333000000",
    "719916666700000",
    "359958333300000"
  ])

  return { distributor }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
