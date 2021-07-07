const { deployContract, contractAt } = require("./helpers")
const { bigNumberify, expandDecimals } = require("../test/shared/utilities")

async function main() {
  const { MaxUint256 } = ethers.constants
  const precision = 1000000

  const gmxMigrator = await deployContract("GmxMigrator", [2])
  const xvixGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "XVIX GMX (IOU)", "XVIX:GMX"])
  const uniGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "UNI GMX (IOU)", "UNI:GMX"])
  const xlgeGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "XLGE GMX (IOU)", "XLGE:GMX"])

  const xvix = { address: "0x4bAE380B5D762D543d426331b8437926443ae9ec" }
  const uni = { address: "0x619aAa52a10F196e521F823aeD4CdeA30D45D366" }
  const xlge = { address: "0xC278A41fC6cf7F488AEa2D0Ab321CC77128931D5" }
  const weth = { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" }

  const ammRouter = { address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" }
  const gmxPrice = bigNumberify(2 * precision)

  const signers = [
    "0x3D850Acfaa18c58b383fCA69d4d867Dc5Bb697c5", // Ben Simon
    "0x881690382102106b00a99E3dB86056D0fC71eee6", // Han Wen
    "0x2e5d207a4c0f7e7c52f6622dcc6eb44bc0fe1a13" // Krunal Amin
  ]

  const xvixPrice = bigNumberify(29.17 * precision)
  const uniPrice = bigNumberify(parseInt(682.27 * precision * 1.1))
  const xlgePrice = bigNumberify(22500 * precision)

  const whitelistedTokens = [xvix.address, uni.address, xlge.address]
  const iouTokens = [xvixGmxIou.address, uniGmxIou.address, xlgeGmxIou.address]
  const prices = [xvixPrice, uniPrice, xlgePrice]
  const caps = [MaxUint256, 0, MaxUint256]
  const lpTokens = [uni.address]
  const lpTokenAs = [xvix.address]
  const lpTokenBs = [weth.address]

  await gmxMigrator.initialize(
    ammRouter.address,
    gmxPrice,
    signers,
    whitelistedTokens,
    iouTokens,
    prices,
    caps,
    lpTokens,
    lpTokenAs,
    lpTokenBs
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
