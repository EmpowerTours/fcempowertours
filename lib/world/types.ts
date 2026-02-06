import { Address } from 'viem';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Entry fee in MON to join the world */
export const WORLD_ENTRY_FEE = '1'; // 1 MON

/** Fee receiver address (platform Safe) */
export const WORLD_FEE_RECEIVER = (process.env.WORLD_FEE_RECEIVER ||
  '0xf3b9D123E7Ac8C36FC9b5AB32135c665956725bA') as Address;

/** TOURS utility token — the ecosystem token used across all contracts */
export const TOURS_TOKEN = (process.env.NEXT_PUBLIC_TOURS_TOKEN || '0x45b76a127167fD7FC7Ed264ad490144300eCfcBF') as Address;

/** EMPTOURS community token on nad.fun — the Agent World belief/community token */
export const EMPTOURS_TOKEN = (process.env.NEXT_PUBLIC_EMPTOURS_TOKEN || '0x8F2D9BaE2445Db65491b0a8E199f1487f9eA7777') as Address;

/** nad.fun contracts on Monad */
export const NADFUN_LENS = '0x8C29C83105c71ffadf4C87115A285f40b2052FD8' as Address;
export const NADFUN_ROUTER = '0xf8a52e45a0b2703F70f82B1A8D1fFD71d0E06e74' as Address;

// ============================================================================
// REDIS KEY PREFIXES
// ============================================================================

export const REDIS_KEYS = {
  /** Agent registry hash: world:agent:{address} */
  agent: (address: string) => `world:agent:${address.toLowerCase()}`,
  /** All agent addresses set */
  agentSet: 'world:agents',
  /** Leaderboard sorted set (by TOURS earned) */
  leaderboard: 'world:leaderboard',
  /** Chat messages list */
  chat: 'world:chat',
  /** Recent events list */
  events: 'world:events',
  /** Rate limit for world actions */
  rateAction: 'world:rate:action',
  /** Rate limit for world reads */
  rateRead: 'world:rate:read',
  /** Rate limit for world chat */
  rateChat: 'world:rate:chat',
  /** Agent movement intentions hash */
  agentMovements: 'world:agent-movements',
} as const;

// ============================================================================
// MOVEMENT TYPES
// ============================================================================

/** Valid zone targets in the 3D world */
export type WorldZoneTarget =
  | 'radio_tower'
  | 'lottery_booth'
  | 'coinflip_arena'
  | 'betting_desk'
  | 'moltbook_station'
  | 'monad_portal'
  | 'nft_gallery'
  | 'center';

/** Action types for agent movement */
export type AgentMovementAction = 'walk_to' | 'interact' | 'idle' | 'celebrate';

/** Movement intention submitted by an agent */
export interface AgentMovementIntention {
  agentId: string;
  agentName: string;
  action: AgentMovementAction;
  target: WorldZoneTarget | null;
  reason?: string;
  timestamp: number;
}

/** Zone positions in 3D space [x, y, z] */
export const ZONE_POSITIONS: Record<WorldZoneTarget, [number, number, number]> = {
  radio_tower: [0, 0, 0],
  lottery_booth: [-8, 0, 6],
  coinflip_arena: [-6, 0, -6],
  betting_desk: [-4, 0, -3],
  moltbook_station: [6, 0, 4],
  monad_portal: [8, 0, -6],
  nft_gallery: [5, 0, 3],
  center: [0, 0, 0],
};

/** Max chat messages to keep */
export const MAX_CHAT_MESSAGES = 500;

/** Max recent events to keep */
export const MAX_EVENTS = 100;

/** Envio cache TTL in seconds */
export const ENVIO_CACHE_TTL = 5;

// ============================================================================
// TYPES
// ============================================================================

/** Registered agent in the world */
export interface WorldAgent {
  address: string;
  name: string;
  description: string;
  entryTxHash: string;
  registeredAt: number;
  lastActionAt: number;
  totalActions: number;
  toursEarned: string;
}

/** Action types that agents can perform */
export type WorldActionType =
  | 'buy_music'
  | 'buy_art'
  | 'radio_queue_song'
  | 'radio_voice_note'
  | 'dao_vote_proposal'
  | 'dao_wrap'
  | 'dao_unwrap'
  | 'dao_delegate'
  | 'mint_passport'
  | 'tip_artist'
  | 'music_subscribe'
  | 'radio_claim_rewards'
  | 'create_climb'
  | 'purchase_climb'
  | 'lottery_buy'
  | 'lottery_draw';

/** Map of world action types to execute-delegated action names */
export const ACTION_MAP: Record<WorldActionType, string> = {
  buy_music: 'buy_music',
  buy_art: 'buy_art',
  radio_queue_song: 'radio_queue_song',
  radio_voice_note: 'radio_voice_note',
  dao_vote_proposal: 'dao_vote_proposal',
  dao_wrap: 'dao_wrap',
  dao_unwrap: 'dao_unwrap',
  dao_delegate: 'dao_delegate',
  mint_passport: 'mint_passport',
  tip_artist: 'radio_queue_song', // tip via queue with tip amount
  music_subscribe: 'music-subscribe',
  radio_claim_rewards: 'radio_claim_rewards',
  create_climb: 'create_climb',
  purchase_climb: 'purchase_climb',
  lottery_buy: 'daily_lottery_buy',
  lottery_draw: 'daily_lottery_draw',
};

/** Action request from an agent */
export interface WorldActionRequest {
  agentAddress: string;
  action: WorldActionType;
  params: Record<string, any>;
}

/** Chat message between agents */
export interface WorldChatMessage {
  id: string;
  from: string;
  fromName: string;
  message: string;
  timestamp: number;
}

/** World event log entry */
export interface WorldEvent {
  id: string;
  type: 'enter' | 'action' | 'chat' | 'achievement';
  agent: string;
  agentName: string;
  description: string;
  txHash?: string;
  timestamp: number;
}

/** Economy data from Envio */
export interface WorldEconomy {
  totalMusicNFTs: number;
  totalPassports: number;
  totalLicenses: number;
  totalUsers: number;
  recentSongs: Array<{
    tokenId: string;
    name: string;
    artist: string;
    price: string;
    image: string | null;
  }>;
  recentPassports: Array<{
    tokenId: string;
    country: string;
    owner: string;
  }>;
  radioActive: boolean;
}

/** Full world state response */
export interface WorldState {
  name: string;
  description: string;
  chain: {
    id: number;
    name: string;
    rpc: string;
  };
  agents: {
    total: number;
    active: number;
  };
  economy: WorldEconomy;
  tokens: {
    /** TOURS — ecosystem reward token earned by listeners and music buyers, used for DAO governance (vTOURS) */
    tours: {
      address: string;
      symbol: string;
      role: string;
    };
    /** EMPTOURS — community token on nad.fun bonding curve */
    emptours: {
      address: string;
      symbol: string;
      role: string;
      price: string;
      marketCap: string;
      graduated: boolean;
    } | null;
  };
  recentEvents: WorldEvent[];
  entryFee: string;
  availableActions: WorldActionType[];
  timestamp: number;
  /** Agent onboarding information */
  onboarding?: {
    faucet: string;
    faucetDescription: string;
    entryFeeReceiver: string;
    requiredToken: string;
    steps: string[];
    blenderRepo: string;
  };
  /** Featured announcements for agents */
  announcements?: Array<{
    title: string;
    message: string;
    priority: 'high' | 'normal';
    timestamp: number;
  }>;
}

/** Rate limit configs for world endpoints */
export const WorldRateLimits = {
  action: {
    prefix: 'world:action',
    windowSeconds: 60,
    maxRequests: 10,
  },
  read: {
    prefix: 'world:read',
    windowSeconds: 60,
    maxRequests: 30,
  },
  chat: {
    prefix: 'world:chat',
    windowSeconds: 60,
    maxRequests: 20,
  },
  enter: {
    prefix: 'world:enter',
    windowSeconds: 3600,
    maxRequests: 5,
  },
} as const;
