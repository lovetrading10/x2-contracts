const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadXvixFixtures, deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock, getBlockTime } = require("../shared/utilities")

use(solidity)

describe("GmtSwap", function () {
  const provider = waffle.provider
  const [wallet, allocator, user0, user1, user2] = provider.getWallets()
  const precision = 1000000
  const gmtPrice = 4.5 * precision
  const xlgePrice = 22500 * precision
  const minXvixPrice = 30 * precision

  let xvix
  let floor
  let uni
  let xlge
  let gmtIou
  let weth
  let dai
  let wethDaiUni
  let wethXvixUni
  let burnVault

  let gmtSwap
  let unlockTime

  beforeEach(async () => {
    unlockTime = (await getBlockTime(provider)) + 1000

    const fixtures = await loadXvixFixtures(provider)
    xvix = fixtures.xvix
    floor = fixtures.floor

    uni = await deployContract("Token", [])
    xlge = await deployContract("Token", [])
    weth = await deployContract("WETH", [])
    dai = await deployContract("Token", [])
    wethDaiUni = await deployContract("Token", [])
    wethXvixUni = await deployContract("Token", [])
    burnVault = await deployContract("BurnVault", [xvix.address, floor.address])

    const wethDaiAssets = {
      weth: "49203986011996513058249", // ~49,203
      dai: "80108591639355012561055161" // ~80,108,591
    }
    await weth.mint(wallet.address, wethDaiAssets.weth)
    await weth.transfer(wethDaiUni.address, wethDaiAssets.weth)
    await dai.mint(wallet.address, wethDaiAssets.dai)
    await dai.transfer(wethDaiUni.address, wethDaiAssets.dai)

    const wethXvixAssets = {
      weth: "393666322461684764184", // ~389
      xvix: "10299071232416584721472" // ~10299
    }
    await weth.mint(wallet.address, wethXvixAssets.weth)
    await weth.transfer(wethXvixUni.address, wethXvixAssets.weth)
    await xvix.transfer(wethXvixUni.address, wethXvixAssets.xvix)
    await xvix.createSafe(wethXvixUni.address)
    await wethXvixUni.mint(wallet.address, "1640301247471379357536") // ~1640

    gmtSwap = await deployContract("GmtSwap", [])
    gmtIou = await deployContract("GmtIou", [gmtSwap.address])

    await xvix.createSafe(gmtSwap.address)
    await xvix.setTransferConfig(gmtSwap.address, 0, 0, 0, 0)

    await gmtSwap.initialize(
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
    )
  })

  it("inits", async () => {
    expect(await gmtSwap.gov()).eq(wallet.address)
    expect(await gmtSwap.isInitialized()).eq(true)

    expect(await gmtSwap.xvix()).eq(xvix.address)
    expect(await gmtSwap.uni()).eq(uni.address)
    expect(await gmtSwap.xlge()).eq(xlge.address)
    expect(await gmtSwap.gmtIou()).eq(gmtIou.address)

    expect(await gmtSwap.weth()).eq(weth.address)
    expect(await gmtSwap.dai()).eq(dai.address)
    expect(await gmtSwap.wethDaiUni()).eq(wethDaiUni.address)
    expect(await gmtSwap.wethXvixUni()).eq(wethXvixUni.address)

    expect(await gmtSwap.allocator()).eq(allocator.address)
    expect(await gmtSwap.burnVault()).eq(burnVault.address)

    expect(await gmtSwap.gmtPrice()).eq(gmtPrice)
    expect(await gmtSwap.xlgePrice()).eq(xlgePrice)
    expect(await gmtSwap.minXvixPrice()).eq(minXvixPrice)
    expect(await gmtSwap.unlockTime()).eq(unlockTime)

    await expect(gmtSwap.connect(user0).initialize(
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
    )).to.be.revertedWith("GmtSwap: forbidden")

    await expect(gmtSwap.initialize(
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
    )).to.be.revertedWith("GmtSwap: already initialized")
  })

  it("setGov", async () => {
    await expect(gmtSwap.connect(user0).setGov(user1.address))
      .to.be.revertedWith("GmtSwap: forbidden")

    expect(await gmtSwap.gov()).eq(wallet.address)
    await gmtSwap.connect(wallet).setGov(user1.address)

    expect(await gmtSwap.gov()).eq(user1.address)
  })

  it("extendUnlockTime", async () => {
    await expect(gmtSwap.connect(user0).extendUnlockTime(unlockTime - 100))
      .to.be.revertedWith("GmtSwap: forbidden")

    await expect(gmtSwap.connect(wallet).extendUnlockTime(unlockTime - 100))
      .to.be.revertedWith("GmtSwap: invalid unlockTime")

    await gmtSwap.extendUnlockTime(unlockTime + 100)
    expect(await gmtSwap.unlockTime()).eq(unlockTime + 100)
  })

  it("withdraw", async () => {
    await dai.mint(wallet.address, 500)
    expect(await dai.balanceOf(wallet.address)).eq(500)

    await dai.transfer(gmtSwap.address, 500)

    expect(await dai.balanceOf(wallet.address)).eq(0)
    await expect(gmtSwap.connect(user0).withdraw(dai.address, 500, wallet.address))
      .to.be.revertedWith("GmtSwap: forbidden")

    await expect(gmtSwap.connect(wallet).withdraw(dai.address, 300, wallet.address))
      .to.be.revertedWith("GmtSwap: unlockTime not yet passed")

    await increaseTime(provider, 1010)
    await mineBlock(provider)
    await gmtSwap.connect(wallet).withdraw(dai.address, 300, wallet.address)
    expect(await dai.balanceOf(wallet.address)).eq(300)
  })

  it("getEthPrice", async () => {
    expect(await gmtSwap.getEthPrice()).eq("1628091505") // 1628.091505
  })

  it("getXvixPrice", async () => {
    expect(await gmtSwap.getXvixPrice()).eq("62544039") // 62.544039
  })

  it("getUniPrice", async () => {
    expect(await gmtSwap.getUniPrice()).eq("781472057") // 781.472057
  })

  it("getTokenPrice", async () => {
    expect(await gmtSwap.getTokenPrice(xlge.address)).eq(xlgePrice)
    expect(await gmtSwap.getTokenPrice(xvix.address)).eq("62544039")
    expect(await gmtSwap.getTokenPrice(uni.address)).eq("781472057")
  })
})
