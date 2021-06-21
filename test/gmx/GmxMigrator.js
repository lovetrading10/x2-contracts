const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadXvixFixtures, deployContract } = require("../shared/fixtures")
const { bigNumberify, expandDecimals, increaseTime, mineBlock, getBlockTime } = require("../shared/utilities")

use(solidity)

const { MaxUint256 } = ethers.constants

describe("GmxMigrator", function () {
  const { HashZero } = ethers.constants
  const provider = waffle.provider
  const [wallet, user0, user1, user2, signer0, signer1, signer2] = provider.getWallets()
  const precision = 1000000

  let ammRouter = user2
  let whitelistedTokens
  let iouTokens
  let prices
  let lpTokens
  let lpTokenAs
  let lpTokenBs

  let xvix
  let uni
  let xlge
  let weth
  let xvixGmxIou
  let uniGmxIou
  let xlgeGmxIou

  const gmxPrice = bigNumberify(2 * precision)
  const xvixPrice = bigNumberify(29.17 * precision)
  const uniPrice = bigNumberify(parseInt(682.27 * precision * 1.1))
  const xlgePrice = bigNumberify(22500 * precision)

  let gmxMigrator

  beforeEach(async () => {
    const fixtures = await loadXvixFixtures(provider)

    xvix = fixtures.xvix
    uni = await deployContract("Token", [])
    xlge = await deployContract("Token", [])
    weth = await deployContract("WETH", [])

    gmxMigrator = await deployContract("GmxMigrator", [2])

    xvixGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "XVIX GMX (IOU)", "XVIX:GMX"])
    uniGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "UNI GMX (IOU)", "UNI:GMX"])
    xlgeGmxIou = await deployContract("GmxIou", [gmxMigrator.address, "XLGE GMX (IOU)", "XLGE:GMX"])

    whitelistedTokens = [xvix.address, uni.address, xlge.address]
    iouTokens = [xvixGmxIou.address, uniGmxIou.address, xlgeGmxIou.address]
    prices = [xvixPrice, uniPrice, xlgePrice]
    caps = [MaxUint256, expandDecimals(3, 18), MaxUint256]

    lpTokens = [uni.address]
    lpTokenAs = [xvix.address]
    lpTokenBs = [weth.address]

    await gmxMigrator.initialize(
      ammRouter.address,
      gmxPrice,
      [signer0.address, signer1.address, signer2.address],
      whitelistedTokens,
      iouTokens,
      prices,
      caps,
      lpTokens,
      lpTokenAs,
      lpTokenBs
    )
  })

  it("inits", async () => {
    expect(await gmxMigrator.admin()).eq(wallet.address)
    expect(await gmxMigrator.signers(0)).eq(signer0.address)
    expect(await gmxMigrator.signers(1)).eq(signer1.address)
    expect(await gmxMigrator.signers(2)).eq(signer2.address)
    expect(await gmxMigrator.isSigner(signer0.address)).eq(true)
    expect(await gmxMigrator.isSigner(signer1.address)).eq(true)
    expect(await gmxMigrator.isSigner(signer2.address)).eq(true)
    expect(await gmxMigrator.isSigner(wallet.address)).eq(false)

    expect(await gmxMigrator.isInitialized()).eq(true)

    expect(await gmxMigrator.ammRouter()).eq(ammRouter.address)
    expect(await gmxMigrator.gmxPrice()).eq(gmxPrice)
    expect(await gmxMigrator.whitelistedTokens(xvix.address)).eq(true)
    expect(await gmxMigrator.whitelistedTokens(uni.address)).eq(true)
    expect(await gmxMigrator.whitelistedTokens(xlge.address)).eq(true)
    expect(await gmxMigrator.whitelistedTokens(weth.address)).eq(false)

    expect(await gmxMigrator.iouTokens(xvix.address)).eq(xvixGmxIou.address)
    expect(await gmxMigrator.iouTokens(uni.address)).eq(uniGmxIou.address)
    expect(await gmxMigrator.iouTokens(xlge.address)).eq(xlgeGmxIou.address)

    expect(await gmxMigrator.prices(xvix.address)).eq(xvixPrice)
    expect(await gmxMigrator.prices(uni.address)).eq(uniPrice)
    expect(await gmxMigrator.prices(xlge.address)).eq(xlgePrice)

    expect(await gmxMigrator.caps(xvix.address)).eq(MaxUint256)
    expect(await gmxMigrator.caps(uni.address)).eq(expandDecimals(3, 18))
    expect(await gmxMigrator.caps(xlge.address)).eq(MaxUint256)

    expect(await gmxMigrator.lpTokens(xvix.address)).eq(false)
    expect(await gmxMigrator.lpTokens(uni.address)).eq(true)
    expect(await gmxMigrator.lpTokens(xlge.address)).eq(false)

    expect(await gmxMigrator.lpTokenAs(uni.address)).eq(xvix.address)
    expect(await gmxMigrator.lpTokenBs(uni.address)).eq(weth.address)

    await expect(gmxMigrator.connect(user0).initialize(
      ammRouter.address,
      gmxPrice,
      [signer0.address, signer1.address, signer2.address],
      whitelistedTokens,
      iouTokens,
      prices,
      caps,
      lpTokens,
      lpTokenAs,
      lpTokenBs
    )).to.be.revertedWith("GmxMigrator: forbidden")
  })

  it("endMigration", async () => {
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
    expect(await gmxMigrator.tokenAmounts(xvix.address)).eq(0)
    await xvix.connect(user1).approve(gmxMigrator.address, expandDecimals(20, 18))
    await gmxMigrator.connect(user1).migrate(xvix.address, "19900000000000000000")
    expect(await xvix.balanceOf(user1.address)).eq(0)
    expect(await xvix.balanceOf(gmxMigrator.address)).eq("19800500000000000000")
    expect(await xvixGmxIou.balanceOf(user1.address)).eq("290241500000000000000") // 19.9 * 29.17 / 2 => 290.2415
    expect(await gmxMigrator.tokenAmounts(xvix.address)).eq("19900000000000000000")
  })

  it("migrate uni", async () => {
    await uni.mint(user1.address, expandDecimals(4, 18))
    await uni.connect(user1).approve(gmxMigrator.address, expandDecimals(4, 18))
    await expect(gmxMigrator.connect(user1).migrate(uni.address, expandDecimals(4, 18)))
      .to.be.revertedWith("GmxMigrator: token cap exceeded")
  })

  it("migrate xlge", async () => {
    await xlge.mint(user1.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(expandDecimals(5, 18))
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(0)
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq(0)
    expect(await gmxMigrator.tokenAmounts(xlge.address)).eq(0)
    await xlge.connect(user1).approve(gmxMigrator.address, expandDecimals(5, 18))
    await gmxMigrator.connect(user1).migrate(xlge.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(0)
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(expandDecimals(5, 18))
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq("56250000000000000000000") // 22500 * 5 / 2 => 56250
    expect(await gmxMigrator.tokenAmounts(xlge.address)).eq(expandDecimals(5, 18))
  })

  it("signalApprove", async () => {
    await expect(gmxMigrator.connect(user0).signalApprove(xlge.address, user2.address, expandDecimals(5, 18)))
      .to.be.revertedWith("GmxMigrator: forbidden")

    await gmxMigrator.connect(wallet).signalApprove(xlge.address, user2.address, expandDecimals(5, 18))
  })

  it("signApprove", async () => {
    await expect(gmxMigrator.connect(user0).signApprove(xlge.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: forbidden")

    await expect(gmxMigrator.connect(signer2).signApprove(xlge.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await gmxMigrator.connect(wallet).signalApprove(xlge.address, user2.address, expandDecimals(5, 18))

    await expect(gmxMigrator.connect(user0).signApprove(xlge.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: forbidden")

    await gmxMigrator.connect(signer2).signApprove(xlge.address, user2.address, expandDecimals(5, 18), 1)

    await expect(gmxMigrator.connect(signer2).signApprove(xlge.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: already signed")

    await gmxMigrator.connect(signer1).signApprove(xlge.address, user2.address, expandDecimals(5, 18), 1)
  })

  it("approve", async () => {
    await xlge.mint(user1.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(expandDecimals(5, 18))
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(0)
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq(0)
    await xlge.connect(user1).approve(gmxMigrator.address, expandDecimals(5, 18))
    await gmxMigrator.connect(user1).migrate(xlge.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(0)
    expect(await xlge.balanceOf(gmxMigrator.address)).eq(expandDecimals(5, 18))
    expect(await xlgeGmxIou.balanceOf(user1.address)).eq("56250000000000000000000") // 22500 * 5 / 2 => 56250

    await expect(gmxMigrator.connect(user0).approve(xlge.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: forbidden")

    await expect(gmxMigrator.connect(wallet).approve(xlge.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await gmxMigrator.connect(wallet).signalApprove(xlge.address, user2.address, expandDecimals(5, 18))

    await expect(gmxMigrator.connect(wallet).approve(xvix.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await expect(gmxMigrator.connect(wallet).approve(xlge.address, user0.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await expect(gmxMigrator.connect(wallet).approve(xlge.address, user2.address, expandDecimals(6, 18), 1))
      .to.be.revertedWith("GmxMigrator: action not signalled")

    await expect(gmxMigrator.connect(wallet).approve(xlge.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: action not authorized")

    await gmxMigrator.connect(signer0).signApprove(xlge.address, user2.address, expandDecimals(5, 18), 1)

    await expect(gmxMigrator.connect(wallet).approve(xlge.address, user2.address, expandDecimals(5, 18), 1))
      .to.be.revertedWith("GmxMigrator: insufficient authorization")

    await gmxMigrator.connect(signer2).signApprove(xlge.address, user2.address, expandDecimals(5, 18), 1)

    await expect(xlge.connect(user2).transferFrom(gmxMigrator.address, user1.address, expandDecimals(4, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    gmxMigrator.connect(wallet).approve(xlge.address, user2.address, expandDecimals(5, 18), 1)

    await expect(xlge.connect(user2).transferFrom(gmxMigrator.address, user1.address, expandDecimals(6, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    expect(await xlge.balanceOf(user1.address)).eq(0)
    await xlge.connect(user2).transferFrom(gmxMigrator.address, user1.address, expandDecimals(5, 18))
    expect(await xlge.balanceOf(user1.address)).eq(expandDecimals(5, 18))
  })
})
