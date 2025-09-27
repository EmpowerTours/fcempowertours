import { createConfig, http, cookieStorage, createStorage } from 'wagmi';
import { defineChain } from 'viem';

// Define Monad testnet chain (adjust if needed from Monad docs)
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MONAD', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://testnet.monad.xyz/rpc'] },
  },
  // Add block explorers, testnet flag if needed
});

export function getConfig() {
  return createConfig({
    chains: [monadTestnet],
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
    transports: {
      [monadTestnet.id]: http(),
    },
  });
}
