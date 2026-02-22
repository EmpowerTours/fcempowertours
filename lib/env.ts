// Central environment variable configuration for Next.js

// Determine chain (mainnet by default)
const chainId = process.env.NEXT_PUBLIC_CHAIN_ID || '143';
const isMainnet = chainId === '143';
const defaultRpc = 'https://rpc.monad.xyz';

export const env = {
  // App URLs
  APP_URL: process.env.NEXT_PUBLIC_URL || '',

  // Blockchain
  MONAD_RPC: process.env.NEXT_PUBLIC_MONAD_RPC || defaultRpc,
  MONAD_WS_RPC: process.env.MONAD_WS_RPC || 'wss://rpc.monad.xyz',
  CHAIN_ID: chainId,
  IS_MAINNET: isMainnet,

  // Pimlico (Account Abstraction)
  PIMLICO_API_KEY: process.env.NEXT_PUBLIC_PIMLICO_API_KEY || '',
  PIMLICO_BUNDLER_URL: process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL || '',

  // ERC-4337
  ENTRYPOINT_ADDRESS: process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS || '',

  // Safe Account
  SAFE_ACCOUNT: process.env.NEXT_PUBLIC_SAFE_ACCOUNT || '',

  // Tokens
  WMON: process.env.NEXT_PUBLIC_WMON || '',
  TOURS_TOKEN: process.env.NEXT_PUBLIC_TOURS_TOKEN || '',

  // Core Contracts
  TOURS_REWARD_MANAGER: process.env.NEXT_PUBLIC_TOURS_REWARD_MANAGER || '',
  LIVE_RADIO: process.env.NEXT_PUBLIC_LIVE_RADIO || '',
  MUSIC_SUBSCRIPTION: process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION || '',
  CLIMBING_LOCATIONS: process.env.NEXT_PUBLIC_CLIMBING_LOCATIONS || '',

  // NFTs
  NFT_ADDRESS: process.env.NEXT_PUBLIC_NFT_CONTRACT || '',
  PASSPORT_NFT: process.env.NEXT_PUBLIC_PASSPORT_NFT || '',

  // External APIs
  NEYNAR_API_KEY: process.env.NEXT_PUBLIC_NEYNAR_API_KEY || process.env.NEYNAR_API_KEY || '',
  PINATA_API_KEY: process.env.NEXT_PUBLIC_PINATA_API_KEY || '',
  PINATA_GATEWAY: process.env.NEXT_PUBLIC_PINATA_GATEWAY || '',

  // Envio Indexer
  ENVIO_ENDPOINT: process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '',
} as const;

export default env;
