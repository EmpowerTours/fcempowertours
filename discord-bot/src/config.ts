import dotenv from 'dotenv';
import { Chain } from 'viem';

dotenv.config();

// Custom chain definitions for Monad
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
      http: [process.env.MONAD_TESTNET_RPC || 'https://testnet-rpc.monad.xyz'],
    },
    public: {
      http: [process.env.MONAD_TESTNET_RPC || 'https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
  testnet: true,
};

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
      http: [process.env.MONAD_MAINNET_RPC || 'https://rpc.monad.xyz'],
    },
    public: {
      http: [process.env.MONAD_MAINNET_RPC || 'https://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://monadexplorer.com',
    },
  },
  testnet: false,
};

// WMON contract addresses
export const WMON_ADDRESSES = {
  mainnet: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as const,
  testnet: '' as const, // Not available on testnet yet
};

// Role tier configuration
export const ROLE_TIERS = {
  BRONZE: {
    name: 'TOURS Bronze',
    minBalance: 1000n,
    roleId: process.env.ROLE_BRONZE_ID || '',
  },
  SILVER: {
    name: 'TOURS Silver',
    minBalance: 10000n,
    roleId: process.env.ROLE_SILVER_ID || '',
  },
  GOLD: {
    name: 'TOURS Gold',
    minBalance: 100000n,
    roleId: process.env.ROLE_GOLD_ID || '',
  },
} as const;

// Configuration object
export const config = {
  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
  },

  // Blockchain
  blockchain: {
    network: (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet',
    toursTokenAddress: process.env.TOURS_TOKEN_ADDRESS as `0x${string}` || '0x0000000000000000000000000000000000000000',
    tipPoolPrivateKey: process.env.TIP_POOL_PRIVATE_KEY as `0x${string}` || '0x',
    claimContractAddress: process.env.CLAIM_CONTRACT_ADDRESS as `0x${string}` || '0x0000000000000000000000000000000000000000',
  },

  // Farcaster / Neynar
  farcaster: {
    neynarApiKey: process.env.NEYNAR_API_KEY || '',
    hubUrl: process.env.FARCASTER_HUB_URL || 'https://api.neynar.com',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'tours:',
  },

  // Role tiers
  roles: ROLE_TIERS,

  // Get active chain based on network
  getChain(): Chain {
    return this.blockchain.network === 'mainnet' ? monadMainnet : monadTestnet;
  },

  // Get chain ID
  getChainId(): number {
    return this.getChain().id;
  },

  // Get WMON address for current network
  getWmonAddress(): string {
    return this.blockchain.network === 'mainnet' ? WMON_ADDRESSES.mainnet : WMON_ADDRESSES.testnet;
  },

  // Get block explorer URL
  getExplorerUrl(txHash: string): string {
    const chain = this.getChain();
    return `${chain.blockExplorers?.default.url}/tx/${txHash}`;
  },

  // Get address explorer URL
  getAddressExplorerUrl(address: string): string {
    const chain = this.getChain();
    return `${chain.blockExplorers?.default.url}/address/${address}`;
  },

  // Validate required config
  validate(): void {
    const required = [
      ['DISCORD_TOKEN', this.discord.token],
      ['DISCORD_CLIENT_ID', this.discord.clientId],
      ['DISCORD_GUILD_ID', this.discord.guildId],
      ['TOURS_TOKEN_ADDRESS', this.blockchain.toursTokenAddress],
    ];

    const missing = required.filter(([_, value]) => !value || value === '0x0000000000000000000000000000000000000000');

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.map(([name]) => name).join(', ')}`);
    }
  },
};

export default config;
