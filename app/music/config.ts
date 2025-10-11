import { createConfig, http, cookieStorage, createStorage } from 'wagmi';
import { monadTestnet } from '../chains';
import { injected } from '@wagmi/connectors';

export function getConfig() {
  return createConfig({
    chains: [monadTestnet],
    connectors: [injected({ shimDisconnect: true })],
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [monadTestnet.id]: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
    },
  });
}
