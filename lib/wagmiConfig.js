import { createConfig, http, cookieStorage, createStorage } from 'wagmi';
import { defineChain } from 'viem';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MONAD', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL] } },
});

export const config = createConfig({
  chains: [monadTestnet],
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [monadTestnet.id]: http(),
  },
});
