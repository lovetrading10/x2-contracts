const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadETHFixtures, contractAt, deployContract } = require("./shared/fixtures")
const { maxUint256, expandDecimals, reportGasUsed, getTxnBalances, increaseTime, mineBlock } = require("./shared/utilities")
const { toChainlinkPrice } = require("./shared/chainlink")

use(solidity)

describe("X2TimeDistributor", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let distributor

  beforeEach(async () => {
    distributor = await deployContract("X2TimeDistributor", [])
  })

  it("inits", async () => {
    expect(await distributor.gov()).eq(wallet.address)
  })

  it("setDistribution", async () => {
    await expect(distributor.connect(user1).setDistribution([user2.address, user3.address], [expandDecimals(1, 18), expandDecimals(2, 18)]))
      .to.be.revertedWith("X2TimeDistributor: forbidden")

    expect(await distributor.lastDistributionTime(user2.address)).eq(0)
    expect(await distributor.lastDistributionTime(user3.address)).eq(0)
    await distributor.setDistribution([user2.address, user3.address], [expandDecimals(1, 18), expandDecimals(2, 18)])
    expect(await distributor.ethPerInterval(user2.address)).eq(expandDecimals(1, 18))
    expect(await distributor.ethPerInterval(user3.address)).eq(expandDecimals(2, 18))
    expect(await distributor.lastDistributionTime(user2.address)).gt(0)
    expect(await distributor.lastDistributionTime(user3.address)).gt(0)
  })

  it("distribute", async () => {
    await distributor.setDistribution([user2.address, user3.address], [expandDecimals(1, 18), expandDecimals(2, 18)])
    await getTxnBalances(provider, user2, () => distributor.connect(user2).distribute(), (balance0, balance1, fee) => {
      expect(balance1).eq(balance0.sub(fee))
    })
    await getTxnBalances(provider, user3, () => distributor.connect(user3).distribute(), (balance0, balance1, fee) => {
      expect(balance1).eq(balance0.sub(fee))
    })

    await wallet.sendTransaction({ to: distributor.address, value: expandDecimals(20, 18) })

    await getTxnBalances(provider, user2, () => distributor.connect(user2).distribute(), (balance0, balance1, fee) => {
      expect(balance1).eq(balance0.sub(fee))
    })
    await getTxnBalances(provider, user3, () => distributor.connect(user3).distribute(), (balance0, balance1, fee) => {
      expect(balance1).eq(balance0.sub(fee))
    })

    await increaseTime(provider, 60 * 60 + 10)
    await mineBlock(provider)

    await getTxnBalances(provider, user2, () => distributor.connect(user2).distribute(), (balance0, balance1, fee) => {
      expect(balance1).eq(balance0.sub(fee).add(expandDecimals(1, 18)))
    })
    await getTxnBalances(provider, user3, () => distributor.connect(user3).distribute(), (balance0, balance1, fee) => {
      expect(balance1).eq(balance0.sub(fee).add(expandDecimals(2, 18)))
    })

    await increaseTime(provider, 3 * 60 * 60 + 10)
    await mineBlock(provider)

    await getTxnBalances(provider, user2, () => distributor.connect(user2).distribute(), (balance0, balance1, fee) => {
      expect(balance1).eq(balance0.sub(fee).add(expandDecimals(3, 18)))
    })
    await getTxnBalances(provider, user3, () => distributor.connect(user3).distribute(), (balance0, balance1, fee) => {
      expect(balance1).eq(balance0.sub(fee).add(expandDecimals(6, 18)))
    })

    await increaseTime(provider, 3 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(distributor.setDistribution([user2.address], [expandDecimals(2, 18)]))
      .to.be.revertedWith("X2TimeDistributor: pending distribution")

    expect(await distributor.ethPerInterval(user2.address)).eq(expandDecimals(1, 18))
    await distributor.connect(user2).distribute()
    await distributor.setDistribution([user2.address], [expandDecimals(2, 18)])
    expect(await distributor.ethPerInterval(user2.address)).eq(expandDecimals(2, 18))

    await expect(distributor.setDistribution([user3.address], [expandDecimals(3, 18)]))
      .to.be.revertedWith("X2TimeDistributor: pending distribution")

    expect(await distributor.ethPerInterval(user3.address)).eq(expandDecimals(2, 18))
    await distributor.connect(user3).distribute()
    await distributor.setDistribution([user3.address], [expandDecimals(3, 18)])
    expect(await distributor.ethPerInterval(user3.address)).eq(expandDecimals(3, 18))
  })
})
