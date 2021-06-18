const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadXvixFixtures, deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock, getBlockTime } = require("../shared/utilities")

use(solidity)

describe("GmxMigrator", function () {
  const { HashZero } = ethers.constants
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  const precision = 1000000

  let ammRouter = user2
  let xvix
  let uni
  let xlge
  let weth
  let xvixGmxIou
  let uniGmxIou
  let xlgeGmxIou

  const gmxPrice = 2 * precision
  const xvixPrice = 29.17 * precision
  const uniPrice = parseInt(682.27 * precision * 1.1)
  const xlgePrice = 22500 * precision

  let gmxMigrator

  beforeEach(async () => {
    const fixtures = await loadXvixFixtures(provider)

    xvix = fixtures.xvix
    uni = await deployContract("Token", [])
    xlge = await deployContract("Token", [])
    weth = await deployContract("WETH", [])

    gmxMigrator = await deployContract("GmxMigrator", [])

    xvixGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "XVIX GMX (IOU)", "XVIX:GMX:IOU"])
    uniGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "UNI GMX (IOU)", "UNI:GMX:IOU"])
    xlgeGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "XLGE GMX (IOU)", "XLGE:GMX:IOU"])

    await gmxMigrator.initialize(
      [
        ammRouter.address,
        xvix.address,
        uni.address,
        xlge.address,
        weth.address,

        xvixGmxIou.address,
        uniGmxIou.address,
        xlgeGmxIou.address
      ],
      xvixPrice,
      uniPrice,
      xlgePrice,
      gmxPrice
    )
  })

  it("inits", async () => {
    expect(await gmxMigrator.admin()).eq(wallet.address)
    expect(await gmxMigrator.approver()).eq(wallet.address)
    expect(await gmxMigrator.isInitialized()).eq(true)

    expect(await gmxMigrator.ammRouter()).eq(ammRouter.address)
    expect(await gmxMigrator.xvix()).eq(xvix.address)
    expect(await gmxMigrator.uni()).eq(uni.address)
    expect(await gmxMigrator.xlge()).eq(xlge.address)
    expect(await gmxMigrator.weth()).eq(weth.address)

    expect(await gmxMigrator.xvixGmxIou()).eq(xvixGmxIou.address)
    expect(await gmxMigrator.uniGmxIou()).eq(uniGmxIou.address)
    expect(await gmxMigrator.xlgeGmxIou()).eq(xlgeGmxIou.address)

    await expect(gmxMigrator.connect(user0).initialize(
      [
        ammRouter.address,
        xvix.address,
        uni.address,
        xlge.address,
        weth.address,

        xvixGmxIou.address,
        uniGmxIou.address,
        xlgeGmxIou.address
      ],
      xvixPrice,
      uniPrice,
      xlgePrice,
      gmxPrice
    )).to.be.revertedWith("GmxMigrator: forbidden")

    await expect(gmxMigrator.initialize(
      [
        ammRouter.address,
        xvix.address,
        uni.address,
        xlge.address,
        weth.address,

        xvixGmxIou.address,
        uniGmxIou.address,
        xlgeGmxIou.address
      ],
      xvixPrice,
      uniPrice,
      xlgePrice,
      gmxPrice
    )).to.be.revertedWith("GmxMigrator: already initialized")
  })

  it("setApprover", async () => {
    await expect(gmxMigrator.connect(user0).setApprover(user1.address))
      .to.be.revertedWith("GmxMigrator: forbidden")

    expect(await gmxMigrator.approver()).eq(wallet.address)
    await gmxMigrator.connect(wallet).setApprover(user1.address)

    expect(await gmxMigrator.approver()).eq(user1.address)

    await expect(gmxMigrator.connect(wallet).setApprover(user2.address))
      .to.be.revertedWith("GmxMigrator: forbidden")

    await gmxMigrator.connect(user1).setApprover(user2.address)

    expect(await gmxMigrator.approver()).eq(user2.address)
  })

  it("endMigration", async () => {
    await gmxMigrator.connect(wallet).setApprover(user0.address)
    await expect(gmxMigrator.connect(user0).endMigration())
      .to.be.revertedWith("GmxMigrator: forbidden")

    expect(await gmxMigrator.isMigrationActive()).eq(true)
    await gmxMigrator.connect(wallet).endMigration()
    expect(await gmxMigrator.isMigrationActive()).eq(false)
  })

  it("migrate xvix", async () => {
    await xvix.transfer(user1.address, expandDecimals(20, 18))
    expect(await xvix.balanceOf(user1.address)).eq("19900000000000000000")
    expect(await xvix.balanceOf(gmxMigrator.address)).eq(0)
    expect(await xvixGmxIou.balanceOf(user1.address)).eq(0)
    await xvix.connect(user1).approve(gmxMigrator.address, expandDecimals(20, 18))
    await gmxMigrator.connect(user1).migrate(xvix.address, "19900000000000000000")
    expect(await xvix.balanceOf(user1.address)).eq(0)
    expect(await xvix.balanceOf(gmxMigrator.address)).eq("19800500000000000000")
    expect(await xvixGmxIou.balanceOf(user1.address)).eq("290241500000000000000") // 19.9 * 29.17 / 2 => 290.2415
  })

  it("migrate xlge", async () => {
    await xlge.mint(user1.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(expandDecimals(5, 18))
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(0)
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq(0)
    await xlge.connect(user1).approve(gmxMigrator.address, expandDecimals(5, 18))
    await gmxMigrator.connect(user1).migrate(xlge.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(0)
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(expandDecimals(5, 18))
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq("56250000000000000000000") // 22500 * 5 / 2 => 56250
  })

  it("signalApprove", async () => {
    await gmxMigrator.connect(wallet).setApprover(user0.address)
    await xlge.mint(user1.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(expandDecimals(5, 18))
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(0)
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq(0)
    await xlge.connect(user1).approve(gmxMigrator.address, expandDecimals(5, 18))
    await gmxMigrator.connect(user1).migrate(xlge.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(0)
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(expandDecimals(5, 18))
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq("56250000000000000000000") // 22500 * 5 / 2 => 56250

    await expect(gmxMigrator.connect(user0).signalApprove(xlge.address, user2.address, expandDecimals(5, 18)))
      .to.be.revertedWith("GmxMigrator: forbidden")

    await gmxMigrator.connect(wallet).signalApprove(xlge.address, user2.address, expandDecimals(5, 18))
  })

  it("approve", async () => {
    await gmxMigrator.connect(wallet).setApprover(user0.address)
    await xlge.mint(user1.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(expandDecimals(5, 18))
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(0)
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq(0)
    await xlge.connect(user1).approve(gmxMigrator.address, expandDecimals(5, 18))
    await gmxMigrator.connect(user1).migrate(xlge.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(0)
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(expandDecimals(5, 18))
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq("56250000000000000000000") // 22500 * 5 / 2 => 56250

    await expect(gmxMigrator.connect(wallet).approve(xlge.address, user2.address, expandDecimals(5, 18)))
      .to.be.revertedWith("GmxMigrator: forbidden")

    await expect(gmxMigrator.connect(user0).approve(xlge.address, user2.address, expandDecimals(5, 18)))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await gmxMigrator.connect(wallet).signalApprove(xlge.address, user2.address, expandDecimals(5, 18))

    await expect(gmxMigrator.connect(user0).approve(xvix.address, user2.address, expandDecimals(5, 18)))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await expect(gmxMigrator.connect(user0).approve(xlge.address, user0.address, expandDecimals(5, 18)))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await expect(gmxMigrator.connect(user0).approve(xlge.address, user2.address, expandDecimals(6, 18)))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await expect(xlge.connect(user2).transferFrom(gmxMigrator.address, user1.address, expandDecimals(4, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await gmxMigrator.connect(user0).approve(xlge.address, user2.address, expandDecimals(5, 18))

    await expect(xlge.connect(user2).transferFrom(gmxMigrator.address, user1.address, expandDecimals(6, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    expect(await xlge.balanceOf(user1.address)).eq(0)
    await xlge.connect(user2).transferFrom(gmxMigrator.address, user1.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(expandDecimals(5, 18))
  })
})
