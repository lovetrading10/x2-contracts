const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadXvixFixtures, deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock, getNetworkFee, reportGasUsed, newWallet } = require("../shared/utilities")

use(solidity)

describe("XvixBurner", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let xvix
  let floor
  let burner
  let weth
  let migrator

  beforeEach(async () => {
    const fixtures = await loadXvixFixtures(provider)
    xvix = fixtures.xvix
    floor = fixtures.floor
    migrator = user0

    weth = await deployContract("WETH", [])

    burner = await deployContract("XvixBurner", [migrator.address, weth.address])
  })

  it("inits", async () => {
    expect(await burner.migrator()).eq(migrator.address)
    expect(await burner.weth()).eq(weth.address)
    expect(await burner.admin()).eq(wallet.address)
  })

  it("burnXvix", async () => {
    await xvix.transfer(user0.address, expandDecimals(60000, 18))
    await xvix.connect(user0).approve(burner.address, expandDecimals(60000, 18))

    await expect(burner.burnXvix(xvix.address, floor.address, expandDecimals(50000, 18), 5))
      .to.be.revertedWith("Floor: refund amount is zero")

    await wallet.sendTransaction({ to: floor.address, value: expandDecimals(1000, 18) })

    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await xvix.balanceOf(user0.address)).eq("59700000000000000000000")
    expect(await xvix.balanceOf(burner.address)).eq(0)
    await burner.burnXvix(xvix.address, floor.address, expandDecimals(50000, 18), 5)
    expect(await weth.balanceOf(user0.address)).eq("461473200427111276527")
    expect(await xvix.balanceOf(user0.address)).eq("9700000000000000000000")
    expect(await xvix.balanceOf(burner.address)).eq(0)
  })
})
