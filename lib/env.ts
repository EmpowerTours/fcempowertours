// Central environment variable configuration
// Maps VITE_* variables to NEXT_PUBLIC_* for Railway compatibility

export const env = {
  // App URLs
  APP_URL: process.env.NEXT_PUBLIC_URL || process.env.VITE_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app',

  // Blockchain
  MONAD_RPC: process.env.NEXT_PUBLIC_MONAD_RPC || process.env.VITE_MONAD_RPC || 'https://rpc-testnet.monadinfra.com',
  CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || process.env.VITE_CHAIN_ID || '10143',

  // Pimlico (Account Abstraction - Current Bundler)
  PIMLICO_API_KEY: process.env.NEXT_PUBLIC_PIMLICO_API_KEY || process.env.VITE_PIMLICO_API_KEY || '',
  PIMLICO_BUNDLER_URL: process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL || process.env.VITE_PIMLICO_BUNDLER_URL || '',

  // FastLane (Monad-Optimized Bundler - Testing Alongside Pimlico)
  FASTLANE_BUNDLER_URL: process.env.NEXT_PUBLIC_FASTLANE_BUNDLER_URL || process.env.VITE_FASTLANE_BUNDLER_URL || 'https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz',
  FASTLANE_ENABLED: process.env.NEXT_PUBLIC_FASTLANE_ENABLED === 'true',

  // shMON Liquid Staking (FastLane) - ✅ DEPLOYED
  SHMON_ADDRESS: process.env.NEXT_PUBLIC_SHMON_ADDRESS || process.env.VITE_SHMON_ADDRESS || '0x3a98250F98Dd388C211206983453837C8365BDc1',

  // Shared ERC-4337
  ENTRYPOINT_ADDRESS: process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS || process.env.VITE_ENTRYPOINT_ADDRESS || '0x0000000071727De22E5E9d8BAf0edAc6f37da032',

  // Safe Account
  SAFE_ACCOUNT: process.env.NEXT_PUBLIC_SAFE_ACCOUNT || process.env.VITE_SAFE_ACCOUNT || '',

  // Contracts
  TOURS_TOKEN: process.env.NEXT_PUBLIC_TOURS_TOKEN || process.env.VITE_TOURS_TOKEN || '0xa123600c82E69cB311B0e068B06Bfa9F787699B7',
  NFT_ADDRESS: process.env.NEXT_PUBLIC_NFT_ADDRESS || process.env.VITE_NFT_ADDRESS || '',
  PASSPORT: process.env.NEXT_PUBLIC_PASSPORT || process.env.VITE_PASSPORT || '0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163',
  PASSPORT_NFT: process.env.NEXT_PUBLIC_PASSPORT_NFT || process.env.VITE_PASSPORT_NFT || '',
  YIELD_STRATEGY: process.env.NEXT_PUBLIC_YIELD_STRATEGY || process.env.VITE_YIELD_STRATEGY || '0x37aC86916Ae673bDFCc9c712057092E57b270f5f',
  ITINERARY_NFT: process.env.NEXT_PUBLIC_ITINERARY_NFT || process.env.VITE_ITINERARY_NFT || '',
  COUNTRY_COLLECTOR: process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR || process.env.VITE_COUNTRY_COLLECTOR || '',
  TANDA_POOL: process.env.NEXT_PUBLIC_TANDA_POOL || process.env.VITE_TANDA_POOL || '',
  MUSIC_BEAT_MATCH: process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH || process.env.VITE_MUSIC_BEAT_MATCH || '',

  // DEX
  WMON: process.env.NEXT_PUBLIC_WMON || process.env.VITE_WMON || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
  TOURS_WMON_POOL: process.env.NEXT_PUBLIC_TOURS_WMON_POOL || process.env.VITE_TOURS_WMON_POOL || '',
  DRAGON_ROUTER: process.env.NEXT_PUBLIC_DRAGON_ROUTER || process.env.VITE_DRAGON_ROUTER || '0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e',

  // External APIs
  NEYNAR_API_KEY: process.env.NEXT_PUBLIC_NEYNAR_API_KEY || process.env.VITE_NEYNAR_API_KEY || process.env.NEYNAR_API_KEY || '',
  PINATA_API_KEY: process.env.NEXT_PUBLIC_PINATA_API_KEY || process.env.VITE_PINATA_API_KEY || '',
  PINATA_GATEWAY: process.env.NEXT_PUBLIC_PINATA_GATEWAY || process.env.VITE_PINATA_GATEWAY || '',

  // Envio Indexer
  ENVIO_ENDPOINT: process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || process.env.VITE_ENVIO_ENDPOINT || '',

  // Privy
  PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '',
} as const;

export default env;
