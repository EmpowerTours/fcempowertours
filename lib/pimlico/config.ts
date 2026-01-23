import { createPublicClient, http, type Chain } from 'viem';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';

// Check if we're on mainnet based on chain ID
const isMainnet = process.env.NEXT_PUBLIC_CHAIN_ID === '143';

// Monad Testnet (Chain ID: 10143)
export const monadTestnet: Chain = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'MonadScan',
      url: 'https://monadscan.com'
    },
  },
  testnet: true,
};

// Monad Mainnet (Chain ID: 143)
export const monadMainnet: Chain = {
  id: 143,
  name: 'Monad',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'MonadScan',
      url: 'https://monadscan.com'
    },
  },
  testnet: false,
};

// Active chain based on environment
export const activeChain = isMainnet ? monadMainnet : monadTestnet;

// Default RPC URL for the active chain
const defaultRpcUrl = 'https://rpc.monad.xyz';

// Public client for reading blockchain
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || defaultRpcUrl),
});

// Get explorer URL for a transaction
export function getExplorerUrl(txHash: string): string {
  return `https://monadscan.com/tx/${txHash}`;
}

// Get explorer URL for an address
export function getAddressExplorerUrl(address: string): string {
  return `https://monadscan.com/address/${address}`;
}

// Pimlico client for Monad (CONFIRMED WORKING!)
export function createPimlicoClientForMonad() {
  const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  if (!apiKey) throw new Error('Missing PIMLICO_API_KEY');

  // Pimlico bundler URL - use mainnet or testnet based on environment
  const networkSlug = isMainnet ? '143' : 'monad-testnet';
  const pimlicoUrl = `https://api.pimlico.io/v2/${networkSlug}/rpc?apikey=${apiKey}`;

  return createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });
}

// Export network info for logging/debugging
export const networkInfo = {
  isMainnet,
  chainId: isMainnet ? 143 : 10143,
  chainName: isMainnet ? 'Monad' : 'Monad Testnet',
  explorerUrl: 'https://monadscan.com',
};
