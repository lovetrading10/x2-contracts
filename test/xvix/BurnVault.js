const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadXvixFixtures, deployContract } = require("../shared/fixtures")
const { expandDecimals, increaseTime, mineBlock, getNetworkFee } = require("../shared/utilities")

use(solidity)

describe("BurnVault", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let xvix
  let floor
  let vault

  beforeEach(async () => {
    const fixtures = await loadXvixFixtures(provider)
    xvix = fixtures.xvix
    floor = fixtures.floor
    vault = await deployContract("BurnVault", [xvix.address, floor.address])
    await xvix.createSafe(vault.address)
    await xvix.setTransferConfig(vault.address, 0, 0, 0, 0)
  })

  it("setGov", async () => {
    expect(await vault.gov()).eq(wallet.address)
    await expect(vault.connect(user0).setGov(user1.address))
      .to.be.revertedWith("BurnVault: forbidden")

    await vault.setGov(user0.address)
    expect(await vault.gov()).eq(user0.address)

    await vault.connect(user0).setGov(user1.address)
    expect(await vault.gov()).eq(user1.address)
  })

  it("setDistributor", async () => {
    expect(await vault.gov()).eq(wallet.address)
    await expect(vault.connect(user0).setDistributor(user1.address))
      .to.be.revertedWith("BurnVault: forbidden")

    await vault.setGov(user0.address)
    expect(await vault.gov()).eq(user0.address)

    expect(await vault.distributor()).eq(ethers.constants.AddressZero)
    await vault.connect(user0).setDistributor(user1.address)
    expect(await vault.distributor()).eq(user1.address)
  })

  it("addSender", async () => {
    expect(await vault.gov()).eq(wallet.address)
    await expect(vault.connect(user0).addSender(user1.address))
      .to.be.revertedWith("BurnVault: forbidden")

    await vault.setGov(user0.address)
    expect(await vault.gov()).eq(user0.address)

    expect(await vault.senders(user1.address)).eq(false)
    await vault.connect(user0).addSender(user1.address)
    expect(await vault.senders(user1.address)).eq(true)
  })

  it("removeSender", async () => {
    expect(await vault.gov()).eq(wallet.address)
    await expect(vault.connect(user0).addSender(user1.address))
      .to.be.revertedWith("BurnVault: forbidden")

    await vault.setGov(user0.address)
    expect(await vault.gov()).eq(user0.address)

    expect(await vault.senders(user1.address)).eq(false)
    await vault.connect(user0).addSender(user1.address)
    expect(await vault.senders(user1.address)).eq(true)

    await expect(vault.connect(wallet).removeSender(user1.address))
      .to.be.revertedWith("BurnVault: forbidden")

    await vault.connect(user0).removeSender(user1.address)
    expect(await vault.senders(user1.address)).eq(false)
  })

  it("deposit", async () => {
    await expect(vault.connect(user0).deposit(0))
      .to.be.revertedWith("BurnVault: insufficient amount")
    await expect(vault.connect(user0).deposit(100))
      .to.be.revertedWith("XVIX: transfer amount exceeds allowance")

    await xvix.connect(user0).approve(vault.address, 100)
    await expect(vault.connect(user0).deposit(100))
      .to.be.revertedWith("XVIX: subtraction amount exceeds balance")

    await xvix.transfer(user0.address, 1000)
    expect(await xvix.balanceOf(user0.address)).eq(995)

    await vault.connect(user0).deposit(100)

    expect(await xvix.balanceOf(user0.address)).eq(895)
    expect(await xvix.balanceOf(vault.address)).eq(100)
    expect(await vault.balanceOf(user0.address)).eq(100)
  })

  it("reduces burns", async () => {
    await xvix.transfer(user0.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user0.address)).eq(expandDecimals(199, 18))
    await xvix.transfer(user1.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(199, 18))

    await xvix.connect(user0).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user0).deposit(expandDecimals(199, 18))

    expect(await xvix.balanceOf(user0.address)).eq(0)
    expect(await vault.balanceOf(user0.address), expandDecimals(199, 18))
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))

    await increaseTime(provider, 20 * 60 * 60) // 20 hours
    await mineBlock(provider)
    await xvix.rebase()

    expect(await vault.balanceOf(user0.address)).eq("198801020059022923955")
    expect(await xvix.balanceOf(user1.address)).eq("198602437640331584234")
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))

    let burn0 = expandDecimals(199, 18).sub("198801020059022923955")
    let burn1 = expandDecimals(199, 18).sub("198602437640331584234")

    expect(burn0).eq("198979940977076045") // ~0.199 burnt
    expect(burn1).eq("397562359668415766") // ~0.398 burnt

    expect(await vault.totalSupply()).eq(await vault.balanceOf(user0.address))
    expect(await vault.toBurn()).eq(burn0)

    await xvix.transfer(user2.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user2.address)).eq(expandDecimals(199, 18))

    await xvix.connect(user2).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user2).deposit(expandDecimals(199, 18))
    expect(await xvix.balanceOf(user2.address)).eq(0)
    expect(await vault.balanceOf(user2.address), expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(398, 18))

    await increaseTime(provider, 20 * 60 * 60) // 20 hours
    await mineBlock(provider)
    await xvix.rebase()

    const balance0 = await vault.balanceOf(user0.address)
    const balance2 = await vault.balanceOf(user2.address)
    expect(balance0).eq("198602041229783759303")
    expect(balance2).eq("198800822012850649867")
    expect(await xvix.balanceOf(user1.address)).eq("198205670953088402916")
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(398, 18))

    burn0 = expandDecimals(199, 18).sub("198602041229783759303")
    burn1 = expandDecimals(199, 18).sub("198205670953088402916")
    let burn2 = expandDecimals(199, 18).sub("198800822012850649867")

    expect(burn0).eq("397958770216240697") // ~0.398 burnt
    expect(burn1).eq("794329046911597084") // ~0.794 burnt
    expect(burn2).eq("199177987149350133") // ~0.199 burnt

    expect(await vault.totalSupply()).eq(balance0.add(balance2))
    expect(await vault.toBurn()).eq(burn0.add(burn2))

    await vault.connect(user0).withdraw(user0.address, "198602041229783759303")
    expect(await vault.balanceOf(user0.address), "0")
    expect(await xvix.balanceOf(user0.address), "198602041229783759303")

    expect(await vault.totalSupply()).eq(balance2)
    expect(await vault.toBurn()).eq(burn0.add(burn2))
  })

  it("withdraw", async () => {
    await xvix.transfer(user0.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user0.address)).eq(expandDecimals(199, 18))
    await xvix.transfer(user1.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(199, 18))

    await xvix.connect(user0).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user0).deposit(expandDecimals(199, 18))

    expect(await xvix.balanceOf(user0.address)).eq(0)
    expect(await vault.balanceOf(user0.address), expandDecimals(199, 18))
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))

    await increaseTime(provider, 20 * 60 * 60) // 20 hours
    await mineBlock(provider)
    await xvix.rebase()

    expect(await vault.balanceOf(user0.address)).eq("198801020059022923955")
    expect(await xvix.balanceOf(user1.address)).eq("198602437640331584234")
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))

    let burn0 = expandDecimals(199, 18).sub("198801020059022923955")
    let burn1 = expandDecimals(199, 18).sub("198602437640331584234")

    expect(burn0).eq("198979940977076045") // ~0.199 burnt
    expect(burn1).eq("397562359668415766") // ~0.398 burnt

    expect(await vault.totalSupply()).eq(await vault.balanceOf(user0.address))
    expect(await vault.toBurn()).eq(burn0)

    await xvix.transfer(user2.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user2.address)).eq(expandDecimals(199, 18))

    await xvix.connect(user2).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user2).deposit(expandDecimals(199, 18))
    expect(await xvix.balanceOf(user2.address)).eq(0)
    expect(await vault.balanceOf(user2.address), expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(398, 18))

    await increaseTime(provider, 20 * 60 * 60) // 20 hours
    await mineBlock(provider)
    await xvix.rebase()

    const balance0 = await vault.balanceOf(user0.address)
    const balance2 = await vault.balanceOf(user2.address)
    expect(balance0).eq("198602041229783759303")
    expect(balance2).eq("198800822012850649867")
    expect(await xvix.balanceOf(user1.address)).eq("198205670953088402916")
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(398, 18))

    burn0 = expandDecimals(199, 18).sub("198602041229783759303")
    burn1 = expandDecimals(199, 18).sub("198205670953088402916")
    let burn2 = expandDecimals(199, 18).sub("198800822012850649867")

    expect(burn0).eq("397958770216240697") // ~0.398 burnt
    expect(burn1).eq("794329046911597084") // ~0.794 burnt
    expect(burn2).eq("199177987149350133") // ~0.199 burnt

    expect(await vault.totalSupply()).eq(balance0.add(balance2))
    expect(await vault.toBurn()).eq(burn0.add(burn2))

    await vault.connect(user0).withdraw(user0.address, "198602041229783759303")
    expect(await vault.balanceOf(user0.address), "0")
    expect(await xvix.balanceOf(user0.address), "198602041229783759303")

    expect(await vault.totalSupply()).eq(balance2)
    expect(await vault.toBurn()).eq(burn0.add(burn2))

    await vault.connect(user2).withdraw(user2.address, "198800822012850649867")
    expect(await vault.balanceOf(user2.address), "0")
    expect(await xvix.balanceOf(user2.address), "198800822012850649867")

    expect(await vault.totalSupply()).eq(0)
    expect(await vault.toBurn()).eq(burn0.add(burn2))
    expect(await xvix.balanceOf(vault.address)).eq(burn0.add(burn2))
  })

  it("distribute", async () => {
    await xvix.transfer(user0.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user0.address)).eq(expandDecimals(199, 18))
    await xvix.transfer(user1.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(199, 18))

    await xvix.connect(user0).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user0).deposit(expandDecimals(199, 18))

    expect(await xvix.balanceOf(user0.address)).eq(0)
    expect(await vault.balanceOf(user0.address), expandDecimals(199, 18))
    expect(await xvix.balanceOf(user1.address)).eq(expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))

    await increaseTime(provider, 20 * 60 * 60) // 20 hours
    await mineBlock(provider)
    await xvix.rebase()

    expect(await vault.balanceOf(user0.address)).eq("198801020059022923955")
    expect(await xvix.balanceOf(user1.address)).eq("198602437640331584234")
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(199, 18))

    let burn0 = expandDecimals(199, 18).sub("198801020059022923955")
    let burn1 = expandDecimals(199, 18).sub("198602437640331584234")

    expect(burn0).eq("198979940977076045") // ~0.199 burnt
    expect(burn1).eq("397562359668415766") // ~0.398 burnt

    expect(await vault.totalSupply()).eq(await vault.balanceOf(user0.address))
    expect(await vault.toBurn()).eq(burn0)

    await xvix.transfer(user2.address, expandDecimals(200, 18))
    expect(await xvix.balanceOf(user2.address)).eq(expandDecimals(199, 18))

    await xvix.connect(user2).approve(vault.address, expandDecimals(199, 18))
    await vault.connect(user2).deposit(expandDecimals(199, 18))
    expect(await xvix.balanceOf(user2.address)).eq(0)
    expect(await vault.balanceOf(user2.address), expandDecimals(199, 18))
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(398, 18))

    await increaseTime(provider, 20 * 60 * 60) // 20 hours
    await mineBlock(provider)
    await xvix.rebase()

    const balance0 = await vault.balanceOf(user0.address)
    const balance2 = await vault.balanceOf(user2.address)
    expect(balance0).eq("198602041229783759303")
    expect(balance2).eq("198800822012850649867")
    expect(await xvix.balanceOf(user1.address)).eq("198205670953088402916")
    expect(await xvix.balanceOf(vault.address)).eq(expandDecimals(398, 18))

    burn0 = expandDecimals(199, 18).sub("198602041229783759303")
    burn1 = expandDecimals(199, 18).sub("198205670953088402916")
    let burn2 = expandDecimals(199, 18).sub("198800822012850649867")

    expect(burn0).eq("397958770216240697") // ~0.398 burnt
    expect(burn1).eq("794329046911597084") // ~0.794 burnt
    expect(burn2).eq("199177987149350133") // ~0.199 burnt

    expect(await vault.totalSupply()).eq(balance0.add(balance2))
    expect(await vault.toBurn()).eq(burn0.add(burn2))

    await wallet.sendTransaction({ to: floor.address, value: expandDecimals(1000, 18) })
    const refundAmount = await floor.getRefundAmount(burn0.add(burn2))
    await expect(vault.distribute()).to.be.revertedWith("BurnVault: forbidden")
    const distributor = await deployContract("X2Distributor", [vault.address])
    await expect(distributor.distribute(user2.address, 0))
      .to.be.revertedWith("X2Distributor: forbidden")
    await vault.addSender(user2.address)
    await vault.setDistributor(distributor.address)
    const beforeBalance = await provider.getBalance(user2.address)
    const tx = await vault.connect(user2).distribute()
    const networkFee = await getNetworkFee(provider, tx)

    const receivedETH = (await provider.getBalance(user2.address)).sub(beforeBalance)
    expect(await vault.toBurn()).eq(0)
    expect(receivedETH.add(networkFee)).eq(refundAmount.div(2))

    await vault.connect(user0).withdraw(user0.address, "198602041229783759303")
    expect(await vault.balanceOf(user0.address), "0")
    expect(await xvix.balanceOf(user0.address), "198602041229783759303")

    await increaseTime(provider, 20 * 60 * 60) // 20 hours
    await mineBlock(provider)
    await xvix.rebase()

    expect(await vault.toBurn()).eq("199177666212822565") // ~0.199
  })
})
