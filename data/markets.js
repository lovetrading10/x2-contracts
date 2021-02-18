const MARKETS = {
  1: [
    {
      name: "3X ETH/USD",
      address: "0xc7B6bf0eDd3e8eE997A8E3232D86e7065F608abA",
      bullToken: "0xe4C7b6e8F95D70C4EFAaD04d783884b2E1e47b1E",
      bearToken: "0x2923a6d2F410F6e7A6E407c419487DB46BC58b7a",
      label: "ETH/USD",
      leverage: 3,
      note: {
        content: "Market creation sponsored by",
        url: "https://xvix.finance/",
        creator: "XVIX"
      }
    },
    {
      name: "5X ETH/USD",
      address: "0xC3750105d8396B00062677A6f2B99308a7E009A9",
      bullToken: "0x6d236158793a4Bdc70A11ff8c7F6B300BAC70939",
      bearToken: "0x8f04828E6a9A0721ebfaC5aBE702ceCb00F2ED9C",
      label: "ETH/USD",
      leverage: 5,
      priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      note: {
        content: "Market creation sponsored by",
        url: "https://t.me/WOO_kr0x",
        creator: "@WOO_kr0x"
      }
    },
    {
      name: "10X ETH/USD",
      address: "0xD8687ea896c622d2992De921CA2c3bD4f9eC4EE9",
      bullToken: "0xAB38a5e44D891ff6A3F4B5d54839f3ED13b48521",
      bearToken: "0x5191292e3dd6Be7fBDf30D736e2F24F879536305",
      label: "ETH/USD",
      leverage: 10,
      priceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      note: {
        content: "Market creation sponsored by",
        url: "https://t.me/JaguarFire13",
        creator: "@JaguarFire13"
      }
    },
    {
      name: "3X BTC/USD",
      address: "0x1D76D712f2A3c56A14A4724B152CaC790910e907",
      bullToken: "0xcAaBA7d5067A1Bc2fCA27d222810f32937F81631",
      bearToken: "0xF932D9Df422f7CDd900af81608A6D33E856296d1",
      label: "BTC/USD",
      leverage: 3,
      note: {
        content: "Market creation sponsored by",
        url: "https://www.unidex.finance/",
        creator: "UniDex"
      }
    },
    {
      name: "10X BTC/USD",
      address: "0xbc0007a2e627055430199fd6b381db2906bbdda9",
      bullToken: "0x199475d41f454114fa3dea16dcacfe8d29a204d4",
      bearToken: "0x62393829cc76c1e485117229bf17fd094719acca",
      label: "BTC/USD",
      leverage: 10,
      note: {
        content: "Market creation sponsored by",
        url: "https://t.me/JaguarFire13",
        creator: "@JaguarFire13"
      }
    },
    {
      name: "1X BTC/ETH",
      address: "0xeed8020c50eba0905d4e74e0b41f42cd965b35ed",
      bullToken: "0x24939c51a8ed8a6b57ce5a4ba536ab56ecdf7038",
      bearToken: "0x079937dece9bf91df3226c4749275f14f8c064b8",
      label: "BTC/ETH",
      leverage: 1,
      unit: "ETH",
      decimals: 4,
      divisor: 10000000000,
      note: {
        content: "Market creation sponsored by",
        url: "https://t.me/JaguarFire13",
        creator: "@JaguarFire13"
      }
    },
    {
      name: "10X BTC/ETH",
      address: "0xb81c9a36bbc837df8860d9635c1ab5239beeb7f4",
      bullToken: "0xbd682c6c154f2180c64d79a50f66f8582a2eced0",
      bearToken: "0xdb71eaa31bebd2f47706c102b447b26c40f7cddd",
      label: "BTC/ETH",
      leverage: 10,
      unit: "ETH",
      decimals: 4,
      divisor: 10000000000,
      note: {
        content: "Market creation sponsored by",
        url: "https://t.me/JaguarFire13",
        creator: "@JaguarFire13"
      }
    },
    {
      name: "10X XAU/USD",
      address: "0xf70c52b6ad73b14dda2858b949dbf3ba588445d0",
      bullToken: "0xa15e4bd6bf2accb922f32a36b21039b243dfb496",
      bearToken: "0x1f96883b77c6f0115cc566840a75a8214790fd3c",
      label: "XAU/USD",
      leverage: 10,
      note: {
        content: "Market creation sponsored by",
        url: "https://t.me/JaguarFire13",
        creator: "@JaguarFire13"
      }
    },
    {
      name: "3X XAG/USD",
      address: "0xD45D8FaABCEE335726ef1591AE0AEfA776f61C8E",
      bullToken: "0x6748DD446665f069E571E1E3a9ba64D5cbcffbC5",
      bearToken: "0x528285E23FaeeaB8737c45Ff2CEe32454c576558",
      label: "XAG/USD",
      leverage: 3,
      priceFeed: "0x379589227b15F1a12195D3f2d90bBc9F31f95235",
      aggregator: "0xF320E19B2ED82F1B226b006cD43FE600FEA56615",
      note: {
        content: "Market creation sponsored by",
        url: "https://www.unidex.finance/",
        creator: "UniDex"
      }
    },
    {
      name: "3X DOT/USD",
      address: "0xdAAc5e9f8d7e17A6deDa13f4ae06ee2Eef8B0787",
      bullToken: "0x27756fcABDdd9302EfE523F01186E0820f34f0DA",
      bearToken: "0x147889F43ef14c6748aCca104e6fE1e3BA321677",
      label: "DOT/USD",
      leverage: 3,
      note: {
        content: "Market creation sponsored by",
        url: "https://www.unidex.finance/",
        creator: "UniDex"
      }
    },
    {
      name: "3X LINK/USD",
      address: "0x69B232B3Fb4321f27Fd83a0b7597A4BE7f76f8d7",
      bullToken: "0xCAf13a5EAa2cC160C07924aaA334F6A6A5c4C2d8",
      bearToken: "0xCb2b7683151C3032B4080F4c93f3d815564Dd759",
      label: "LINK/USD",
      leverage: 3,
      note: {
        content: "Market creation sponsored by",
        url: "https://www.unidex.finance/",
        creator: "UniDex"
      }
    },
    {
      name: "3X SNX/USD",
      address: "0x96010e54dc491D6CD5ED509dF8C78DBE9a196699",
      bullToken: "0x1267FE7CB04fF8b612035e6AC5A996Eea31262f7",
      bearToken: "0x940DbCFbfA2053b38330aeF5AfF5d24C8d796Ecd",
      label: "SNX/USD",
      leverage: 3,
      note: {
        content: "Market creation sponsored by",
        url: "https://www.unidex.finance/",
        creator: "UniDex"
      }
    },
    {
      name: "3X YFI/USD",
      address: "0xD2A1E2F96F71DEea555Fc458E17c707Ff4E6F452",
      bullToken: "0x59877B052ce7Fd9E485149AF3dB3e455fa146Fa2",
      bearToken: "0xc5Fa177Ec67b93B7CcAB449ef54C56bCe051F295",
      label: "YFI/USD",
      leverage: 3,
      note: {
        content: "Market creation sponsored by",
        url: "https://www.unidex.finance/",
        creator: "UniDex"
      }
    },
    {
      name: "1X FAST GAS",
      address: "0x4532c9e6e698c814ffac9b8e8dac1d9acea114da",
      bullToken: "0x5cf79390443764d09ea4a1a3121fba6440c6bad0",
      bearToken: "0xdae4be3dcb04cdab9ed86b75a53dc06a58dcb83e",
      label: "FAST GAS",
      leverage: 1,
      unit: "GWEI",
      divisor: 10,
      decimals: 0,
      note: {
        content: "Market creation sponsored by",
        url: "https://www.unidex.finance/",
        creator: "UniDex"
      }
    },
    {
      name: "1X TSLA/USD",
      address: "0xfbF7BD6859bfb72C1A2001C4E74f9f7032995413",
      bullToken: "0x9F97091508Cbba14cA7231490d04620a677B5A0D",
      bearToken: "0x8Df57D15bE7d8bD19a1A1BEb9636Be1f6F18045B",
      label: "TSLA/USD",
      leverage: 1,
      priceFeed: "0x1ceDaaB50936881B3e449e47e40A2cDAF5576A4a",
      note: {
        content: "Market creation sponsored by",
        url: "https://www.unidex.finance/",
        creator: "UniDex"
      }
    },
    {
      name: "10X TSLA/USD",
      address: "0x00Bc04EcdCD9F95780137bF007B820c24E9291a2",
      bullToken: "0x714EEdA9cd059e7decC9F07c65f2175e677886fD",
      bearToken: "0xa06AeF1526D12f70D680Cb40934891C4A42f50ea",
      label: "TSLA/USD",
      leverage: 10,
      priceFeed: "0x1ceDaaB50936881B3e449e47e40A2cDAF5576A4a",
      note: {
        content: "Market creation sponsored by",
        url: "https://xvix.finance/",
        creator: "XVIX"
      }
    },
    {
      name: "10X EUR/USD",
      address: "0x1175b0031624a08b01eefad4263b6dad74b6f889",
      bullToken: "0xd381e03fdc92d007aa6d385bb841d9da5311b5b4",
      bearToken: "0x4bd39aa789fa855f10010b0401bf9a9bb9e5e5cc",
      label: "EUR/USD",
      decimals: 4,
      leverage: 10,
      note: {
        content: "Market creation sponsored by",
        url: "https://t.me/JaguarFire13",
        creator: "@JaguarFire13"
      }
    },
  ]
}

const CHAIN_IDS = [1]

const MARKETS_MAP = {}

for (let j = 0; j < CHAIN_IDS.length; j++) {
  const chainId = CHAIN_IDS[j]
  MARKETS_MAP[chainId] = {}
  for (let i = 0; i < MARKETS[chainId].length; i++) {
    const market = MARKETS[chainId][i]
    MARKETS_MAP[chainId][market.address] = market
  }
}

function getMarkets(chainId) {
  return MARKETS[chainId]
}

module.exports = { getMarkets }
