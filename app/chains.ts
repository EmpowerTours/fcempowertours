import { defineChain } from 'viem';

// Check if we're on mainnet based on chain ID
const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ID === '143';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
    },
    public: {
      http: ['https://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://monadscan.com' },
  },
  testnet: true,
});

export const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  network: 'monad',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
    },
    public: {
      http: ['https://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'MonadScan', url: 'https://monadscan.com' },
  },
  testnet: false,
});

// Active chain based on environment
export const activeChain = isMainnet ? monadMainnet : monadTestnet;

// Helper to get explorer URL
export function getExplorerUrl(txHash: string): string {
  return `${activeChain.blockExplorers.default.url}/tx/${txHash}`;
}

export function getAddressExplorerUrl(address: string): string {
  return `${activeChain.blockExplorers.default.url}/address/${address}`;
}
