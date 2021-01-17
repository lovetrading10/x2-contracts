const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock, getNetworkFee, reportGasUsed, newWallet } = require("../shared/utilities")

use(solidity)

describe("Farm", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let weth
  let farm

  beforeEach(async () => {
    weth = await deployContract("WETH", [])
    farm = await deployContract("Farm", [weth.address])
    await weth.deposit({ value: expandDecimals(500, 18) })
  })

  it("setGov", async () => {
    expect(await farm.gov()).eq(wallet.address)
    await expect(farm.connect(user0).setGov(user1.address))
      .to.be.revertedWith("Farm: forbidden")

    await farm.setGov(user0.address)
    expect(await farm.gov()).eq(user0.address)

    await farm.connect(user0).setGov(user1.address)
    expect(await farm.gov()).eq(user1.address)
  })

  it("setDistributor", async () => {
    expect(await farm.gov()).eq(wallet.address)
    await expect(farm.connect(user0).setDistributor(user1.address))
      .to.be.revertedWith("Farm: forbidden")

    await farm.setGov(user0.address)
    expect(await farm.distributor()).eq(ethers.constants.AddressZero)

    await farm.connect(user0).setDistributor(user1.address)
    expect(await farm.distributor()).eq(user1.address)
  })

  it("deposit", async () => {
    await expect(farm.connect(user0).deposit(0))
      .to.be.revertedWith("Farm: insufficient amount")
    await expect(farm.connect(user0).deposit(100))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await weth.connect(user0).approve(farm.address, 100)
    await expect(farm.connect(user0).deposit(100))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await weth.transfer(user0.address, 1000)
    expect(await weth.balanceOf(user0.address)).eq(1000)

    const tx = await farm.connect(user0).deposit(100)
    await reportGasUsed(provider, tx, "deposit gas used")

    expect(await weth.balanceOf(user0.address)).eq(900)
    expect(await weth.balanceOf(farm.address)).eq(100)
    expect(await farm.balanceOf(user0.address)).eq(100)
  })

  it("withdraw", async () => {
    await expect(farm.connect(user0).deposit(0))
      .to.be.revertedWith("Farm: insufficient amount")
    await expect(farm.connect(user0).deposit(100))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await weth.connect(user0).approve(farm.address, 100)
    await expect(farm.connect(user0).deposit(100))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await weth.transfer(user0.address, 1000)
    expect(await weth.balanceOf(user0.address)).eq(1000)

    await farm.connect(user0).deposit(100)

    expect(await weth.balanceOf(user0.address)).eq(900)
    expect(await weth.balanceOf(farm.address)).eq(100)
    expect(await farm.balanceOf(user0.address)).eq(100)

    await expect(farm.connect(user0).withdraw(user0.address, 101))
      .to.be.revertedWith("Farm: insufficient balance")

    const tx = await farm.connect(user0).withdraw(user0.address, 100)
    await reportGasUsed(provider, tx, "withdraw gas used")

    expect(await weth.balanceOf(user0.address)).eq(1000)
    expect(await weth.balanceOf(farm.address)).eq(0)
    expect(await farm.balanceOf(user0.address)).eq(0)
  })

  it("stake", async () => {
    const receiver0 = newWallet()
    const receiver1 = newWallet()
    const receiver2 = newWallet()
    const receiver3 = newWallet()
    const receiver4 = newWallet()
    const receiver5 = newWallet()
    const receiver6 = newWallet()

    await weth.transfer(user0.address, expandDecimals(200, 18))
    expect(await weth.balanceOf(user0.address)).eq(expandDecimals(200, 18))

    await weth.transfer(user1.address, expandDecimals(200, 18))
    expect(await weth.balanceOf(user1.address)).eq(expandDecimals(200, 18))

    await weth.connect(user0).approve(farm.address, expandDecimals(200, 18))
    await farm.connect(user0).deposit(expandDecimals(200, 18))

    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await farm.balanceOf(user0.address)).eq(expandDecimals(200, 18))
    expect(await weth.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    expect(await weth.balanceOf(farm.address)).eq(expandDecimals(200, 18))

    const distributor = await deployContract("X2TimeDistributor", [])
    await distributor.setDistribution([farm.address], ["100"])
    await farm.setDistributor(distributor.address)

    await increaseTime(provider, 1 * 60 * 60 + 10) // 1 hour
    await mineBlock(provider)

    await wallet.sendTransaction({ to: distributor.address, value: 100 })

    expect(await provider.getBalance(receiver0.address)).eq(0)
    await farm.connect(user0).claim(receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("100")

    await increaseTime(provider, 20 * 60 * 60 + 10) // 20 hours
    await mineBlock(provider)

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(1, 18) })
    await weth.connect(user1).approve(farm.address, expandDecimals(200, 18))
    await farm.connect(user1).deposit(expandDecimals(200, 18))

    expect(await farm.balanceOf(user0.address)).eq(expandDecimals(200, 18))
    expect(await farm.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    expect(await weth.balanceOf(farm.address)).eq(expandDecimals(400, 18))

    expect(await provider.getBalance(receiver1.address)).eq(0)
    await farm.connect(user0).claim(receiver1.address)
    expect(await provider.getBalance(receiver1.address)).eq("2000")

    expect(await provider.getBalance(receiver2.address)).eq(0)
    await farm.connect(user1).claim(receiver2.address)
    expect(await provider.getBalance(receiver2.address)).eq("0")

    await increaseTime(provider, 10 * 60 * 60 + 10) // 10 hours
    await mineBlock(provider)

    expect(await provider.getBalance(receiver3.address)).eq(0)
    await farm.connect(user0).claim(receiver3.address)
    expect(await provider.getBalance(receiver3.address)).eq("500")

    expect(await provider.getBalance(receiver4.address)).eq(0)
    await farm.connect(user1).claim(receiver4.address)
    expect(await provider.getBalance(receiver4.address)).eq("500")

    await farm.connect(user0).withdraw(user0.address, expandDecimals(200, 18))

    await increaseTime(provider, 10 * 60 * 60 + 10) // 10 hours
    await mineBlock(provider)

    expect(await provider.getBalance(receiver5.address)).eq(0)
    await farm.connect(user0).claim(receiver5.address)
    expect(await provider.getBalance(receiver5.address)).eq("0")

    expect(await provider.getBalance(receiver6.address)).eq(0)
    await farm.connect(user1).claim(receiver6.address)
    expect(await provider.getBalance(receiver6.address)).eq("1000")
  })

  it("withdrawWithoutDistribution", async () => {
    await weth.transfer(user0.address, expandDecimals(200, 18))
    expect(await weth.balanceOf(user0.address)).eq(expandDecimals(200, 18))

    await weth.connect(user0).approve(farm.address, expandDecimals(200, 18))
    await farm.connect(user0).deposit(expandDecimals(200, 18))

    expect(await weth.balanceOf(user0.address)).eq(0)
    expect(await weth.balanceOf(farm.address)).eq(expandDecimals(200, 18))
    expect(await farm.balanceOf(user0.address)).eq(expandDecimals(200, 18))

    await farm.setDistributor(user0.address)

    await expect(farm.connect(user0).withdraw(user0.address, expandDecimals(200, 18)))
      .to.be.reverted

    await farm.connect(user0).withdrawWithoutDistribution(user0.address, expandDecimals(200, 18))
    expect(await weth.balanceOf(user0.address)).eq(expandDecimals(200, 18))
    expect(await weth.balanceOf(farm.address)).eq(0)
    expect(await farm.balanceOf(user0.address)).eq(0)
  })
})
