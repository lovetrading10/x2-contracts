const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { loadFixtures } = require("./shared/fixtures")
const { expandDecimals } = require("./shared/utilities")

use(solidity)

describe("X2Fee", function () {
  const provider = waffle.provider
  const [wallet] = provider.getWallets()
  let feeToken

  beforeEach(async () => {
    const fixtures = await loadFixtures(provider, wallet)
    feeToken = fixtures.feeToken
  })

  it("mints to creator", async () => {
    expect(await feeToken.balanceOf(wallet.address)).eq(expandDecimals(1000, 18))
  })
})
