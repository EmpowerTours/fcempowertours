import { defineChain } from 'viem';

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

// Active chain — Monad Mainnet (Chain ID: 143)
export const activeChain = monadMainnet;

// Backwards compatibility alias (previously pointed to testnet, now mainnet)
export const monadTestnet = monadMainnet;

// Helper to get explorer URL
export function getExplorerUrl(txHash: string): string {
  return `${activeChain.blockExplorers.default.url}/tx/${txHash}`;
}

export function getAddressExplorerUrl(address: string): string {
  return `${activeChain.blockExplorers.default.url}/address/${address}`;
}
