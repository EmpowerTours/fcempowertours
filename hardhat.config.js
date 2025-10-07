require("@nomicfoundation/hardhat-verify");
require("@nomicfoundation/hardhat-sourcify");

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai"
    }
  },
  networks: {
    monadTestnet: {
      url: process.env.MONAD_TESTNET_RPC_URL || "https://rpc.testnet.monad.xyz",
      chainId: 10143
    }
  },
  sourcify: { enabled: true }
};
