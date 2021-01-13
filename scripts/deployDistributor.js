const { deployContract, contractAt } = require("./helpers")

async function main() {
  // const distributor = await deployContract("X2TimeDistributor", [])
  const distributor = await contractAt("X2TimeDistributor", "0x4d268a7d4c16ceb5a606c173bd974984343fea13")
  const token = { address: "0x768Ca31d89Ee8f3cffcB8B73F217CC2ca052c068" }
  const factory = await contractAt("X2ETHFactory", "0x8087a341D32D445d9aC8aCc9c14F5781E04A26d2")
  await factory.setDistributor(token.address, distributor.address)
  await distributor.setDistribution([token.address], ["2000000000000000"])

  return { distributor }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
