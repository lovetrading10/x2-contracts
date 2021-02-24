const { deployContract, contractAt, sendTxn } = require("./helpers")

async function main() {
  const gmtSwap = await contractAt("GmtSwap", "0xc6f72F7225162f20217eEEFc2FC2F12F5BC44b03")
  const gmtIou = await contractAt("GmtIou", "0x15928cC26CE757E08B7a0D2Aa5452AAF26e1ECD1")

  const xvix = await contractAt("XVIX", "0x4bAE380B5D762D543d426331b8437926443ae9ec")
  const gov = await contractAt("XVIX", "0x1110f0c468f49025294048b2aeb7621408ce7fbb")

  const uni = { address: "0x619aaa52a10f196e521f823aed4cdea30d45d366" }
  const xlge = { address: "0xc278a41fc6cf7f488aea2d0ab321cc77128931d5" }

  const weth = { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" }
  const dai = { address: "0x6b175474e89094c44da98b954eedeac495271d0f" }
  const wethDaiUni = { address: "0xa478c2975ab1ea89e8196811f51a7b7ade33eb11" }
  const wethXvixUni = { address: "0x619aaa52a10f196e521f823aed4cdea30d45d366" }

  const allocator = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const burnVault = { address: "0x780e9996Ec934cba0E2FC830C9b9f3e19F99ec3B" }

  const precision = 1000000
  const gmtPrice = 4.5 * precision
  const xlgePrice = 22500 * precision
  const minXvixPrice = 30 * precision
  const unlockTime = 1622505600 // 1 Jun 2021, 12:00 AM

  await sendTxn(gmtSwap.initialize(
    [
      xvix.address,
      uni.address,
      xlge.address,
      gmtIou.address,

      weth.address,
      dai.address,
      wethDaiUni.address,
      wethXvixUni.address,

      allocator.address,
      burnVault.address
    ],
    gmtPrice,
    xlgePrice,
    minXvixPrice,
    unlockTime
  ), "gmtSwap.initialize")

  await sendTxn(gov.setTransferConfig(gmtSwap.address, 0, 0, 0, 0), "gov.setTransferConfig")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
