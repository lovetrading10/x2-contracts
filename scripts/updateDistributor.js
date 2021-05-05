const { deployContract, contractAt, sendTxn } = require("./helpers")

async function main() {
  const tokenDecimals = 18
  const account = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const distributor = await contractAt("X2TimeDistributor", "0x7F98d265Ba2609c1534D12cF6b0976505Ad7F653")

  const xlgeFarm = await contractAt("Farm", "0x7c1cFFEA9E773186A5950Bb27CBf14b895b4025E")
  const uniFarm = await contractAt("Farm", "0x8A3d7A49ADa4FED00d83fA6827F46F83b62eF87F")
  const burnVaultV2 = await contractAt("BurnVault", "0x780e9996Ec934cba0E2FC830C9b9f3e19F99ec3B")
  const timeVaultV2 = await contractAt("TimeVault", "0x82147C5A7E850eA4E28155DF107F2590fD4ba327")

  const totalRewards = "2.41"
  const totalRewardsAmount = ethers.utils.parseUnits(totalRewards, tokenDecimals)
  const transferAmout = totalRewardsAmount.mul(9500).div(10000)
  console.log("transferAmout", ethers.utils.formatUnits(transferAmout, tokenDecimals))

  const hourlyRewards = totalRewardsAmount.div(168)

  const xlgeRewards = hourlyRewards.mul(3000).div(10000)
  const uniFarmRewards = hourlyRewards.mul(5000).div(10000)
  const burnVaultRewards = hourlyRewards.mul(1000).div(10000)
  const timeVaultRewards = hourlyRewards.mul(500).div(10000)

  console.log("rewards", xlgeRewards.toString(), uniFarmRewards.toString(), burnVaultRewards.toString(), timeVaultRewards.toString())

  await sendTxn(xlgeFarm.claim(account.address), "xlgeFarm.claim")
  await sendTxn(uniFarm.claim(account.address), "uniFarm.claim")
  await sendTxn(burnVaultV2.claim(account.address), "burnVaultV2.claim")
  await sendTxn(timeVaultV2.claim(account.address), "timeVaultV2.claim")

  await sendTxn(distributor.setDistribution([
    xlgeFarm.address,
    uniFarm.address,
    burnVaultV2.address,
    timeVaultV2.address
  ], [
    xlgeRewards,
    uniFarmRewards,
    burnVaultRewards,
    timeVaultRewards
  ]), "distributor.setDistribution")

  return { distributor }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
