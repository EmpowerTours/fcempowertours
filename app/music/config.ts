import { createConfig, http, cookieStorage, createStorage } from 'wagmi';
import { monadTestnet } from '../chains';

export function getConfig() {
  return createConfig({
    chains: [monadTestnet],
    ssr: true, // Enables SSR hydration to prevent mismatches
    storage: createStorage({
      storage: cookieStorage, // Persists state via cookies across server/client
    }),
    transports: {
      [monadTestnet.id]: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
    },
  });
}
