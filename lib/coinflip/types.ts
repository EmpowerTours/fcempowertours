/**
 * Coinflip Prediction System Types
 * Agents bet EMPTOURS on predicting coinflip outcomes
 */

import { Address } from 'viem';

// AicoinflipMON contract on Monad
export const COINFLIP_CONTRACT = '0xfE2ff247FCF671A59e69F1608E0A2eEda05139b4' as Address;

// EMPTOURS token for betting
export const EMPTOURS_TOKEN = '0x8F2D9BaE2445Db65491b0a8E199f1487f9eA7777' as Address;

// Round duration in milliseconds (55 min betting + 5 min execution)
export const ROUND_DURATION_MS = 60 * 60 * 1000; // 1 hour
export const BETTING_WINDOW_MS = 55 * 60 * 1000; // 55 minutes
export const MIN_BET_AMOUNT = '10'; // 10 EMPTOURS minimum
export const MAX_BET_AMOUNT = '1000'; // 1000 EMPTOURS maximum

export type CoinflipPrediction = 'heads' | 'tails';

export interface CoinflipBet {
  id: string;
  roundId: string;
  agentAddress: string;
  agentName: string;
  prediction: CoinflipPrediction;
  amount: string; // EMPTOURS amount
  timestamp: number;
}

export interface CoinflipRound {
  id: string;
  status: 'open' | 'closed' | 'executing' | 'resolved';
  startedAt: number;
  closesAt: number;
  bets: CoinflipBet[];
  totalHeads: string; // Total EMPTOURS on heads
  totalTails: string; // Total EMPTOURS on tails
  result?: CoinflipPrediction;
  flipTxHash?: string;
  resolvedAt?: number;
}

export interface CoinflipPayout {
  agentAddress: string;
  agentName: string;
  betAmount: string;
  winnings: string;
  totalPayout: string;
}

export interface CoinflipRoundResult {
  roundId: string;
  result: CoinflipPrediction;
  flipTxHash: string;
  totalPool: string;
  headsBets: number;
  tailsBets: number;
  winners: CoinflipPayout[];
  losers: string[]; // addresses
}

// Redis keys
export const COINFLIP_REDIS_KEYS = {
  currentRound: 'coinflip:current',
  round: (id: string) => `coinflip:round:${id}`,
  roundHistory: 'coinflip:history',
  agentStats: (address: string) => `coinflip:stats:${address.toLowerCase()}`,
} as const;

// Rate limits
export const CoinflipRateLimits = {
  bet: {
    prefix: 'coinflip:bet',
    windowSeconds: 60,
    maxRequests: 5, // 5 bets per minute max
  },
  status: {
    prefix: 'coinflip:status',
    windowSeconds: 10,
    maxRequests: 30, // 30 status checks per 10 seconds
  },
} as const;
