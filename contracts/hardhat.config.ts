import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";

// Load environment variables from parent directory
dotenv.config({ path: "../.env.local" });
dotenv.config({ path: "../.env" });

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://testnet.monad.xyz";
const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    monadTestnet: {
      url: MONAD_RPC,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 41454, // Monad testnet chain ID
    },
  },
  etherscan: {
    apiKey: {
      monadTestnet: "no-api-key-needed", // MonadScan doesn't require API key for verification
    },
    customChains: [
      {
        network: "monadTestnet",
        chainId: 41454,
        urls: {
          apiURL: "https://testnet.monad.xyz/api", // Replace with actual MonadScan API if available
          browserURL: "https://testnet.monad.xyz",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
