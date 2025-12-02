import { defineChain } from 'viem';

/**
 * Monad Mainnet Chain Configuration
 *
 * Chain ID: 143
 * RPC: https://rpc.monad.xyz
 * Explorer: https://monadscan.com
 *
 * Key Protocol Addresses:
 * - WMON: 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
 * - EntryPoint v0.7: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
 */
export const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  network: 'monad-mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
      webSocket: ['wss://rpc.monad.xyz'],
    },
    public: {
      http: ['https://rpc.monad.xyz'],
      webSocket: ['wss://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monadscan',
      url: 'https://monadscan.com',
      apiUrl: 'https://api.monadscan.com/api',
    },
  },
  contracts: {
    // ERC-4337 EntryPoint v0.7 for Account Abstraction
    entryPoint: {
      address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    },
  },
  testnet: false,
});

/**
 * Mainnet Protocol Addresses (Pre-deployed)
 */
export const protocolAddresses = {
  // Wrapped MON token
  WMON: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as `0x${string}`,
  // ERC-4337 EntryPoint v0.7
  ENTRYPOINT: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as `0x${string}`,
} as const;

/**
 * EmpowerTours Mainnet Contract Addresses
 * Update these after deploying contracts to mainnet
 */
export const mainnetContracts = {
  // Core contracts - UPDATE AFTER DEPLOYMENT
  toursToken: '' as `0x${string}`,
  nft: '' as `0x${string}`,
  passport: '' as `0x${string}`,
  vault: '' as `0x${string}`,
  market: '' as `0x${string}`,

  // AMM contracts - UPDATE AFTER DEPLOYMENT
  toursWmonPool: '' as `0x${string}`,
  wmonUnwrapHelper: '' as `0x${string}`,

  // Yield & Strategy - UPDATE AFTER DEPLOYMENT
  yieldStrategy: '' as `0x${string}`,

  // Mini-app contracts - UPDATE AFTER DEPLOYMENT
  actionBasedDemandSignal: '' as `0x${string}`,
  itineraryNft: '' as `0x${string}`,
  musicBeatMatch: '' as `0x${string}`,
  countryCollector: '' as `0x${string}`,
  tandaPool: '' as `0x${string}`,

  // Safe Account - UPDATE AFTER DEPLOYMENT
  safeAccount: '' as `0x${string}`,
} as const;

/**
 * Combined addresses export for convenience
 */
export const mainnetAddresses = {
  ...protocolAddresses,
  ...mainnetContracts,
} as const;

/**
 * Pimlico Bundler URL for Mainnet (Chain ID: 143)
 * @param apiKey - Your Pimlico API key
 */
export const getPimlicoBundlerUrl = (apiKey: string): string =>
  `https://api.pimlico.io/v2/143/rpc?apikey=${apiKey}`;

/**
 * Check if a chain ID is Monad Mainnet
 */
export const isMonadMainnet = (chainId: number): boolean => chainId === 143;

/**
 * Check if a chain ID is Monad Testnet
 */
export const isMonadTestnet = (chainId: number): boolean => chainId === 10143;

/**
 * Check if a chain ID is any Monad network
 */
export const isMonadNetwork = (chainId: number): boolean =>
  isMonadMainnet(chainId) || isMonadTestnet(chainId);

export default monadMainnet;
