const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadXvixFixtures, deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock, getBlockTime } = require("../shared/utilities")

use(solidity)

async function signAllocation(account, allocation, signer) {
    const message = ethers.utils.solidityKeccak256(
      ["string", "address", "uint256"],
      ["GmtSwap:GmtAllocation", account, allocation]
    )
    const bytes = ethers.utils.arrayify(message)
    const signature = await signer.signMessage(bytes)
    return ethers.utils.splitSignature(signature)
}

describe("GmtSwap", function () {
  const { HashZero } = ethers.constants
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

  it("endSwap", async () => {
    expect(await gmtSwap.isSwapActive()).eq(true)
    await expect(gmtSwap.connect(user0).endSwap())
      .to.be.revertedWith("GmtSwap: forbidden")

    await gmtSwap.connect(wallet).endSwap()
    expect(await gmtSwap.isSwapActive()).eq(false)

    await expect(gmtSwap.connect(user0).swap(xvix.address, 100, 100, 1, HashZero, HashZero))
      .to.be.revertedWith("GmtSwap: swap is no longer active")
  })

  it("swap xvix", async () => {
    await xvix.transfer(user0.address, 1000)
    await xvix.connect(user0).approve(gmtSwap.address, 1000)

    await expect(gmtSwap.connect(user0).swap(
      xvix.address,
      0, // tokenAmount
      2000, // allocation
      1,
      HashZero,
      HashZero
    )).to.be.revertedWith("GmtSwap: invalid tokenAmount")

    await expect(gmtSwap.connect(user0).swap(
      xvix.address,
      100, // tokenAmount
      0, // allocation
      1,
      HashZero,
      HashZero
    )).to.be.revertedWith("GmtSwap: invalid gmtAllocation")

    const sig0 = await signAllocation(user0.address, 2000, user0)

    await expect(gmtSwap.connect(user0).swap(
      xvix.address,
      100, // tokenAmount
      2000, // allocation
      sig0.v,
      sig0.r,
      sig0.s
    )).to.be.revertedWith("GmtSwap: invalid signature")

    const sig1 = await signAllocation(user0.address, 2000, allocator)
    await expect(gmtSwap.connect(user0).swap(
      xvix.address,
      100, // tokenAmount
      2001, // allocation
      sig1.v,
      sig1.r,
      sig1.s
    )).to.be.revertedWith("GmtSwap: invalid signature")

    await expect(gmtSwap.connect(user1).swap(
      xvix.address,
      100, // tokenAmount
      2000, // allocation
      sig1.v,
      sig1.r,
      sig1.s
    )).to.be.revertedWith("GmtSwap: invalid signature")

    expect(await gmtIou.balanceOf(user0.address)).eq(0)
    expect(await xvix.balanceOf(gmtSwap.address)).eq(0)
    expect(await xvix.balanceOf(burnVault.address)).eq(0)
    expect(await burnVault.balanceOf(gmtSwap.address)).eq(0)

    await gmtSwap.connect(user0).swap(
      xvix.address,
      100, // tokenAmount
      2000, // allocation
      sig1.v,
      sig1.r,
      sig1.s
    )

    expect(await gmtIou.balanceOf(user0.address)).eq(1389) // 62.544039 * 100 / 4.5
    expect(await xvix.balanceOf(gmtSwap.address)).eq(0)
    expect(await xvix.balanceOf(burnVault.address)).eq(100)
    expect(await burnVault.balanceOf(gmtSwap.address)).eq(100)
  })

  it("swap uni", async () => {
    await uni.mint(user0.address, 1000)
    await uni.connect(user0).approve(gmtSwap.address, 1000)

    const sig = await signAllocation(user0.address, 2000, allocator)
    expect(await gmtIou.balanceOf(user0.address)).eq(0)
    expect(await uni.balanceOf(gmtSwap.address)).eq(0)

    await gmtSwap.connect(user0).swap(
      uni.address,
      10, // tokenAmount
      2000, // allocation
      sig.v,
      sig.r,
      sig.s
    )

    expect(await gmtIou.balanceOf(user0.address)).eq(1736) // 781.472057 * 10 / 4.5
    expect(await uni.balanceOf(gmtSwap.address)).eq(10)
  })

  it("swap xlge", async () => {
    await xlge.mint(user0.address, 1000)
    await xlge.connect(user0).approve(gmtSwap.address, 1000)

    const sig = await signAllocation(user0.address, 23000, allocator)
    expect(await gmtIou.balanceOf(user0.address)).eq(0)
    expect(await xlge.balanceOf(gmtSwap.address)).eq(0)

    await gmtSwap.connect(user0).swap(
      xlge.address,
      3, // tokenAmount
      23000, // allocation
      sig.v,
      sig.r,
      sig.s
    )

    expect(await gmtIou.balanceOf(user0.address)).eq(15000) // 22500 * 3 / 4.5
    expect(await xlge.balanceOf(gmtSwap.address)).eq(3)

    await gmtSwap.connect(user0).swap(
      xlge.address,
      3, // tokenAmount
      23000, // allocation
      sig.v,
      sig.r,
      sig.s
    )

    expect(await gmtIou.balanceOf(user0.address)).eq(23000)
    expect(await xlge.balanceOf(gmtSwap.address)).eq(5)
    expect(await xlge.balanceOf(user0.address)).eq(995)
  })
})
