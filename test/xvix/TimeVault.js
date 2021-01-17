const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadXvixFixtures, deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock,
  reportGasUsed, getBlockTime, newWallet } = require("../shared/utilities")

use(solidity)

describe("TimeVault", function () {
  const distributor = { address: "0x92e235D65A9E3c5231688e70dc3fF0c91d17cf8C" }
  const provider = waffle.provider
  const [wallet, user0, user1] = provider.getWallets()
  let xvix
  let vault

  beforeEach(async () => {
    const fixtures = await loadXvixFixtures(provider, wallet, distributor)
    xvix = fixtures.xvix
    vault = await deployContract("TimeVault", [xvix.address])
    await xvix.createSafe(vault.address)
    await xvix.setTransferConfig(vault.address, 0, 0, 0, 0)
  })

  it("inits", async () => {
    expect(await vault.token()).eq(xvix.address)
  })

  it("setGov", async () => {
    expect(await vault.gov()).eq(wallet.address)
    await expect(vault.connect(user0).setGov(user1.address))
      .to.be.revertedWith("TimeVault: forbidden")

    await vault.setGov(user0.address)
    expect(await vault.gov()).eq(user0.address)

    await vault.connect(user0).setGov(user1.address)
    expect(await vault.gov()).eq(user1.address)
  })

  it("setDistributor", async () => {
    expect(await vault.gov()).eq(wallet.address)
    await expect(vault.connect(user0).setDistributor(user1.address))
      .to.be.revertedWith("TimeVault: forbidden")

    await vault.setGov(user0.address)
    expect(await vault.distributor()).eq(ethers.constants.AddressZero)

    await vault.connect(user0).setDistributor(user1.address)
    expect(await vault.distributor()).eq(user1.address)
  })

  it("deposit", async () => {
    await expect(vault.connect(user0).deposit(0))
      .to.be.revertedWith("TimeVault: insufficient amount")
    await expect(vault.connect(user0).deposit(100))
      .to.be.revertedWith("XVIX: transfer amount exceeds allowance")

    await xvix.connect(user0).approve(vault.address, 100)
    await expect(vault.connect(user0).deposit(100))
      .to.be.revertedWith("XVIX: subtraction amount exceeds balance")

    await xvix.transfer(user0.address, 1000)
    expect(await xvix.balanceOf(user0.address)).eq(995)

    await xvix.connect(user0).approve(vault.address, 100)
    const tx = await vault.connect(user0).deposit(100)
    await reportGasUsed(provider, tx, "deposit gas used")
    expect(await xvix.balanceOf(user0.address)).eq(895)
    expect(await xvix.balanceOf(vault.address)).eq(100)
    expect(await vault.balanceOf(user0.address)).eq(100)
  })

  it("beginWithdrawal", async () => {
    await expect(vault.connect(user0).beginWithdrawal(0))
      .to.be.revertedWith("TimeVault: insufficient amount")

    await xvix.transfer(user0.address, 1000)
    expect(await xvix.balanceOf(user0.address)).eq(995)

    await xvix.connect(user0).approve(vault.address, 100)
    await vault.connect(user0).deposit(100)

    expect(await xvix.balanceOf(user0.address)).eq(895)
    expect(await xvix.balanceOf(vault.address)).eq(100)
    expect(await vault.balanceOf(user0.address)).eq(100)

    await expect(vault.connect(user0).beginWithdrawal(101))
      .to.be.revertedWith("TimeVault: insufficient balance")

    expect(await vault.withdrawalTimestamps(user0.address)).eq(0)
    expect(await vault.withdrawalAmounts(user0.address)).eq(0)
    const tx = await vault.connect(user0).beginWithdrawal(100)
    await reportGasUsed(provider, tx, "beginWithdrawal gas used")
    expect(await vault.withdrawalTimestamps(user0.address)).gt(0)
    expect(await vault.withdrawalAmounts(user0.address)).eq(100)
  })

  it("withdraw", async () => {
    await xvix.transfer(user0.address, expandDecimals(100, 18))
    expect(await xvix.balanceOf(user0.address)).eq("99500000000000000000")

    await xvix.connect(user0).approve(vault.address, expandDecimals(10, 18))
    await vault.connect(user0).deposit(expandDecimals(10, 18))

    expect(await xvix.balanceOf(user0.address)).eq("89500000000000000000")
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(10, 18))
    expect(await vault.balanceOf(user0.address)).eq(expandDecimals(10, 18))

    await expect(vault.connect(user0).withdraw(user1.address))
      .to.be.revertedWith("TimeVault: withdrawal not initiated")

    await vault.connect(user0).beginWithdrawal(expandDecimals(10, 18))

    await expect(vault.connect(user0).withdraw(user1.address))
      .to.be.revertedWith("TimeVault: withdrawal timing not reached")

    await increaseTime(provider, 7 * 24 * 60 * 60 - 10)
    await mineBlock(provider)

    await expect(vault.connect(user0).withdraw(user1.address))
      .to.be.revertedWith("TimeVault: withdrawal timing not reached")

    await increaseTime(provider, 20)
    await mineBlock(provider)

    expect(await xvix.balanceOf(user1.address)).eq(0)
    const tx = await vault.connect(user0).withdraw(user1.address)
    await reportGasUsed(provider, tx, "withdraw gas used")
    expect(await xvix.balanceOf(vault.address)).eq(0)
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(10, 18))
    expect(await vault.balanceOf(user1.address)).eq(0)
    expect(await vault.withdrawalTimestamps(user0.address)).eq(0)
    expect(await vault.withdrawalAmounts(user0.address)).eq(0)

    await expect(vault.connect(user0).withdraw(user1.address))
      .to.be.revertedWith("TimeVault: withdrawal not initiated")

    await expect(vault.connect(user0).beginWithdrawal(1))
      .to.be.revertedWith("TimeVault: insufficient balance")
  })

  it("withdrawalSlots", async () => {
    const delay = 7 * 24 * 60 * 60
    const windowSize = 48 * 60 * 60
    const time = await getBlockTime(provider)
    const slot = parseInt((time + delay) / windowSize)

    await xvix.transfer(user0.address, expandDecimals(100, 18))
    await xvix.connect(user0).approve(vault.address, expandDecimals(10, 18))
    await vault.connect(user0).deposit(expandDecimals(10, 18))

    await vault.connect(user0).beginWithdrawal(expandDecimals(10, 18))
    expect(await vault.withdrawalSlots(slot)).eq(expandDecimals(10, 18))

    await xvix.transfer(user1.address, expandDecimals(50, 18))
    await xvix.connect(user1).approve(vault.address, expandDecimals(5, 18))
    await vault.connect(user1).deposit(expandDecimals(5, 18))

    await vault.connect(user1).beginWithdrawal(expandDecimals(5, 18))
    expect(await vault.withdrawalSlots(slot)).eq(expandDecimals(15, 18))

    await increaseTime(provider, 8 * 24 * 60 * 60)
    await mineBlock(provider)

    await vault.connect(user0).withdraw(user0.address)
    expect(await vault.withdrawalSlots(slot)).eq(expandDecimals(5, 18))

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(vault.connect(user1).withdraw(user1.address))
      .to.be.revertedWith("TimeVault: withdrawal window already passed")

    const nextTime = await getBlockTime(provider)
    const nextSlot = parseInt((nextTime + delay) / windowSize)

    expect(await vault.withdrawalSlots(nextSlot)).eq(0)
    await vault.connect(user1).beginWithdrawal(expandDecimals(5, 18))
    expect(await vault.withdrawalSlots(slot)).eq(0)
    expect(await vault.withdrawalSlots(nextSlot)).eq(expandDecimals(5, 18))
  })

  it("withdrawWithoutDistribution", async () => {
    await xvix.transfer(user0.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user0.address)).eq(expandDecimals(199, 18))

    await xvix.connect(user0).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user0).deposit(expandDecimals(199, 18))

    expect(await xvix.balanceOf(user0.address)).eq(0)
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))
    expect(await vault.balanceOf(user0.address)).eq(expandDecimals(199, 18))

    await vault.setDistributor(user0.address)

    await vault.connect(user0).beginWithdrawal(expandDecimals(199, 18))

    await increaseTime(provider, 8 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(vault.connect(user0).withdraw(user0.address))
      .to.be.reverted

    await vault.connect(user0).withdrawWithoutDistribution(user0.address)
    expect(await xvix.balanceOf(user0.address)).eq(expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(0)
    expect(await vault.balanceOf(user0.address)).eq(0)
  })

  it("stake", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()
    const receiver2 = newWallet()
    const receiver3 = newWallet()
    const receiver4 = newWallet()
    const receiver5 = newWallet()
    const receiver6 = newWallet()
    const receiver7 = newWallet()
    const receiver8 = newWallet()

    await xvix.transfer(user0.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user0.address)).eq(expandDecimals(199, 18))
    await xvix.transfer(user1.address, expandDecimals(400, 18))
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(398, 18))

    await xvix.connect(user0).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user0).deposit(expandDecimals(199, 18))

    expect(await xvix.balanceOf(user0.address)).eq(0)
    expect(await vault.balanceOf(user0.address)).eq(expandDecimals(199, 18))
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(398, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))

    const distributor = await deployContract("X2TimeDistributor", [])
    await distributor.setDistribution([vault.address], ["100"])
    await vault.setDistributor(distributor.address)

    await increaseTime(provider, 1 * 60 * 60 + 10) // 1 hour
    await mineBlock(provider)
    await xvix.rebase()

    await wallet.sendTransaction({ to: distributor.address, value: 100 })

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await vault.connect(user0).claim(receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("99")

    await increaseTime(provider, 20 * 60 * 60 + 10) // 20 hours
    await mineBlock(provider)
    await xvix.rebase()

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(1, 18) })
    await xvix.connect(user1).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user1).deposit(expandDecimals(199, 18))

    expect(await vault.balanceOf(user0.address)).eq(expandDecimals(199, 18))
    expect(await vault.balanceOf(user1.address)).eq(expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(398, 18))

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await vault.connect(user0).claim(receiver1.address)
    expect(await provider.getBalance(receiver1.address)).eq("1999")

    expect(await provider.getBalance(receiver2.address)).eq(0)
    await vault.connect(user1).claim(receiver2.address)
    expect(await provider.getBalance(receiver2.address)).eq("0")

    await increaseTime(provider, 10 * 60 * 60 + 10) // 10 hours
    await mineBlock(provider)
    await xvix.rebase()

    expect(await provider.getBalance(receiver3.address)).eq(0)
    await vault.connect(user0).claim(receiver3.address)
    expect(await provider.getBalance(receiver3.address)).eq("499")

    expect(await provider.getBalance(receiver4.address)).eq(0)
    await vault.connect(user1).claim(receiver4.address)
    expect(await provider.getBalance(receiver4.address)).eq("499")

    await vault.connect(user0).beginWithdrawal(expandDecimals(199, 18))

    await increaseTime(provider, 8 * 24 * 60 * 60)
    await mineBlock(provider)

    await vault.connect(user0).withdraw(user0.address)

    expect(await xvix.balanceOf(user0.address)).eq(expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))
    expect(await vault.balanceOf(user0.address)).eq(0)
    expect(await vault.balanceOf(user1.address)).eq(expandDecimals(199, 18))

    expect(await provider.getBalance(receiver5.address)).eq(0)
    await vault.connect(user0).claim(receiver5.address)
    expect(await provider.getBalance(receiver5.address)).eq("9599")

    expect(await provider.getBalance(receiver6.address)).eq(0)
    await vault.connect(user1).claim(receiver6.address)
    expect(await provider.getBalance(receiver6.address)).eq("9599")

    await increaseTime(provider, 8 * 24 * 60 * 60)
    await mineBlock(provider)

    expect(await provider.getBalance(receiver7.address)).eq(0)
    await vault.connect(user0).claim(receiver7.address)
    expect(await provider.getBalance(receiver7.address)).eq("0")

    expect(await provider.getBalance(receiver8.address)).eq(0)
    await vault.connect(user1).claim(receiver8.address)
    expect(await provider.getBalance(receiver8.address)).eq("19199")
  })
})
