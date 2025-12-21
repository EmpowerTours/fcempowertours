import { createPublicClient, http } from 'viem';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';

// Monad Testnet (Chain ID: 10143)
export const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { 
      name: 'MonadScan', 
      url: 'https://testnet.monadscan.com' 
    },
  },
  testnet: true,
};

// Public client for reading blockchain
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
});

// Pimlico client for Monad (CONFIRMED WORKING!)
export function createPimlicoClientForMonad() {
  const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  if (!apiKey) throw new Error('Missing PIMLICO_API_KEY');

  // Pimlico bundler URL for Monad Testnet
  const pimlicoUrl = `https://api.pimlico.io/v2/monad-testnet/rpc?apikey=${apiKey}`;

  return createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });
}
