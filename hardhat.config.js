require("@nomiclabs/hardhat-etherscan")
require("@nomiclabs/hardhat-waffle")

const { KOVAN_URL, KOVAN_DEPLOY_KEY, ETHERSCAN_API_KEY } = require("./env.json")

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners()

  for (const account of accounts) {
    console.info(account.address)
  }
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
* @type import('hardhat/config').HardhatUserConfig
*/
module.exports = {
  networks: {
    hardhat: {},
    kovan: {
      url: KOVAN_URL,
      accounts: [KOVAN_DEPLOY_KEY]
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
  solidity: {
    version: "0.6.12",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
}
