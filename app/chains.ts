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
  contracts: {
    // Multicall3, at the canonical cross-chain address. Verified live on Monad mainnet
    // 2026-08-25: 7,619 bytes of code, and a 195-call batch returns in ~1.2s on the free
    // public RPC.
    //
    // viem only batches when the chain declares this. Without it, `client.multicall(...)`
    // silently degrades to one request per call — which is why reading five masters cost
    // ~30 sequential round trips and 2-6 seconds. The chain was never slow; we were queueing.
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
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
