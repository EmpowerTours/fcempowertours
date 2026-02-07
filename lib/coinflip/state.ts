/**
 * Coinflip Prediction System State Management
 * Handles round creation, betting, and resolution
 */

import { redis } from '@/lib/redis';
import {
  CoinflipRound,
  CoinflipBet,
  CoinflipPrediction,
  CoinflipPayout,
  CoinflipRoundResult,
  ConsolationPrize,
  COINFLIP_REDIS_KEYS,
  ROUND_DURATION_MS,
  BETTING_WINDOW_MS,
  MIN_BET_AMOUNT,
  MAX_BET_AMOUNT,
  CONSOLATION_BASE_AMOUNT,
  CONSOLATION_MAX_MULTIPLIER,
} from './types';
import { keccak256, toBytes, parseEther, formatEther } from 'viem';

/**
 * Generate a unique round ID
 */
function generateRoundId(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const hour = now.getUTCHours().toString().padStart(2, '0');
  return `round_${dateStr}_${hour}`;
}

/**
 * Get the current round, or create a new one if none exists
 */
export async function getCurrentRound(): Promise<CoinflipRound | null> {
  const roundData = await redis.get<CoinflipRound>(COINFLIP_REDIS_KEYS.currentRound);
  return roundData;
}

/**
 * Create a new round
 */
export async function createNewRound(): Promise<CoinflipRound> {
  const now = Date.now();
  const round: CoinflipRound = {
    id: generateRoundId(),
    status: 'open',
    startedAt: now,
    closesAt: now + BETTING_WINDOW_MS,
    bets: [],
    totalHeads: '0',
    totalTails: '0',
  };

  await redis.set(COINFLIP_REDIS_KEYS.currentRound, round);
  await redis.set(COINFLIP_REDIS_KEYS.round(round.id), round);

  console.log(`[Coinflip] New round created: ${round.id}`);
  return round;
}

/**
 * Get or create current round
 */
export async function getOrCreateCurrentRound(): Promise<CoinflipRound> {
  let round = await getCurrentRound();

  // If no round or round is resolved, create new one
  if (!round || round.status === 'resolved') {
    round = await createNewRound();
  }

  // If betting window has closed, update status
  if (round.status === 'open' && Date.now() > round.closesAt) {
    round.status = 'closed';
    await redis.set(COINFLIP_REDIS_KEYS.currentRound, round);
    await redis.set(COINFLIP_REDIS_KEYS.round(round.id), round);
  }

  return round;
}

/**
 * Place a bet on the current round
 */
export async function placeBet(
  agentAddress: string,
  agentName: string,
  prediction: CoinflipPrediction,
  amount: string
): Promise<{ success: boolean; error?: string; bet?: CoinflipBet }> {
  const round = await getOrCreateCurrentRound();

  // Check if betting is open
  if (round.status !== 'open') {
    return { success: false, error: 'Betting is closed for this round' };
  }

  if (Date.now() > round.closesAt) {
    return { success: false, error: 'Betting window has ended' };
  }

  // Validate amount
  const amountWei = parseEther(amount);
  const minWei = parseEther(MIN_BET_AMOUNT);
  const maxWei = parseEther(MAX_BET_AMOUNT);

  if (amountWei < minWei) {
    return { success: false, error: `Minimum bet is ${MIN_BET_AMOUNT} EMPTOURS` };
  }

  if (amountWei > maxWei) {
    return { success: false, error: `Maximum bet is ${MAX_BET_AMOUNT} EMPTOURS` };
  }

  // Check if agent already bet this round
  const existingBet = round.bets.find(
    b => b.agentAddress.toLowerCase() === agentAddress.toLowerCase()
  );

  if (existingBet) {
    return { success: false, error: 'Agent already placed a bet this round' };
  }

  // Create bet
  const bet: CoinflipBet = {
    id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    roundId: round.id,
    agentAddress: agentAddress.toLowerCase(),
    agentName,
    prediction,
    amount,
    timestamp: Date.now(),
  };

  // Update round totals
  round.bets.push(bet);

  const currentHeads = parseEther(round.totalHeads);
  const currentTails = parseEther(round.totalTails);

  if (prediction === 'heads') {
    round.totalHeads = formatEther(currentHeads + amountWei);
  } else {
    round.totalTails = formatEther(currentTails + amountWei);
  }

  // Save round
  await redis.set(COINFLIP_REDIS_KEYS.currentRound, round);
  await redis.set(COINFLIP_REDIS_KEYS.round(round.id), round);

  console.log(`[Coinflip] Bet placed: ${agentName} bet ${amount} EMPTOURS on ${prediction}`);

  return { success: true, bet };
}

/**
 * Close betting for the current round
 */
export async function closeBetting(): Promise<CoinflipRound | null> {
  const round = await getCurrentRound();

  if (!round || round.status !== 'open') {
    return null;
  }

  round.status = 'closed';
  await redis.set(COINFLIP_REDIS_KEYS.currentRound, round);
  await redis.set(COINFLIP_REDIS_KEYS.round(round.id), round);

  console.log(`[Coinflip] Betting closed for round ${round.id}`);
  return round;
}

/**
 * Mark round as executing (flip in progress)
 */
export async function markExecuting(): Promise<CoinflipRound | null> {
  const round = await getCurrentRound();

  if (!round || round.status !== 'closed') {
    return null;
  }

  round.status = 'executing';
  await redis.set(COINFLIP_REDIS_KEYS.currentRound, round);
  await redis.set(COINFLIP_REDIS_KEYS.round(round.id), round);

  return round;
}

/**
 * Calculate payouts for winners (parimutuel style)
 */
function calculatePayouts(
  round: CoinflipRound,
  result: CoinflipPrediction
): CoinflipPayout[] {
  const payouts: CoinflipPayout[] = [];

  const winners = round.bets.filter(b => b.prediction === result);
  const losers = round.bets.filter(b => b.prediction !== result);

  if (winners.length === 0) {
    return payouts; // No winners, losers' funds stay in pool
  }

  // Calculate total winning and losing pools
  const winningPool = winners.reduce(
    (sum, b) => sum + parseEther(b.amount),
    0n
  );
  const losingPool = losers.reduce(
    (sum, b) => sum + parseEther(b.amount),
    0n
  );

  // Each winner gets their bet back + proportional share of losing pool
  for (const winner of winners) {
    const betAmount = parseEther(winner.amount);
    const shareOfPool = losingPool * betAmount / winningPool;
    const totalPayout = betAmount + shareOfPool;

    payouts.push({
      agentAddress: winner.agentAddress,
      agentName: winner.agentName,
      betAmount: winner.amount,
      winnings: formatEther(shareOfPool),
      totalPayout: formatEther(totalPayout),
    });
  }

  return payouts;
}

/**
 * Resolve the round with a result
 */
export async function resolveRound(
  result: CoinflipPrediction,
  flipTxHash: string
): Promise<CoinflipRoundResult | null> {
  const round = await getCurrentRound();

  if (!round || (round.status !== 'closed' && round.status !== 'executing')) {
    return null;
  }

  // Calculate payouts
  const payouts = calculatePayouts(round, result);
  const losers = round.bets
    .filter(b => b.prediction !== result)
    .map(b => b.agentAddress);

  const totalPool = formatEther(
    parseEther(round.totalHeads) + parseEther(round.totalTails)
  );

  // Update round
  round.status = 'resolved';
  round.result = result;
  round.flipTxHash = flipTxHash;
  round.resolvedAt = Date.now();

  await redis.set(COINFLIP_REDIS_KEYS.currentRound, round);
  await redis.set(COINFLIP_REDIS_KEYS.round(round.id), round);

  // Add to history
  await redis.lpush(COINFLIP_REDIS_KEYS.roundHistory, round.id);
  await redis.ltrim(COINFLIP_REDIS_KEYS.roundHistory, 0, 99); // Keep last 100 rounds

  console.log(`[Coinflip] Round ${round.id} resolved: ${result.toUpperCase()}`);

  return {
    roundId: round.id,
    result,
    flipTxHash,
    totalPool,
    headsBets: round.bets.filter(b => b.prediction === 'heads').length,
    tailsBets: round.bets.filter(b => b.prediction === 'tails').length,
    winners: payouts,
    losers,
  };
}

/**
 * Force reset a stuck round and start fresh
 * Use when a round gets stuck in executing/closed status
 */
export async function forceResetRound(): Promise<CoinflipRound> {
  const currentRound = await getCurrentRound();

  if (currentRound) {
    // Archive the stuck round as cancelled
    currentRound.status = 'resolved';
    currentRound.result = undefined;
    currentRound.resolvedAt = Date.now();
    await redis.set(COINFLIP_REDIS_KEYS.round(currentRound.id), currentRound);
    console.log(`[Coinflip] Force reset stuck round: ${currentRound.id}`);
  }

  // Create fresh round
  return createNewRound();
}

/**
 * Get round by ID
 */
export async function getRound(roundId: string): Promise<CoinflipRound | null> {
  return redis.get<CoinflipRound>(COINFLIP_REDIS_KEYS.round(roundId));
}

/**
 * Get recent round history
 */
export async function getRoundHistory(limit = 10): Promise<CoinflipRound[]> {
  const roundIds = await redis.lrange(COINFLIP_REDIS_KEYS.roundHistory, 0, limit - 1);
  const rounds: CoinflipRound[] = [];

  for (const id of roundIds) {
    const round = await getRound(id);
    if (round) rounds.push(round);
  }

  return rounds;
}

/**
 * Get agent stats
 */
export async function getAgentStats(address: string): Promise<{
  totalBets: number;
  wins: number;
  losses: number;
  totalWagered: string;
  totalWon: string;
}> {
  const stats = await redis.get<{
    totalBets: number;
    wins: number;
    losses: number;
    totalWagered: string;
    totalWon: string;
  }>(COINFLIP_REDIS_KEYS.agentStats(address));

  return stats || {
    totalBets: 0,
    wins: 0,
    losses: 0,
    totalWagered: '0',
    totalWon: '0',
  };
}

/**
 * Update agent stats after round resolution
 */
export async function updateAgentStats(
  address: string,
  won: boolean,
  wagered: string,
  payout: string
): Promise<void> {
  const stats = await getAgentStats(address);

  stats.totalBets += 1;
  if (won) {
    stats.wins += 1;
    const newTotalWon = parseEther(stats.totalWon) + parseEther(payout);
    stats.totalWon = formatEther(newTotalWon);
  } else {
    stats.losses += 1;
  }

  const newTotalWagered = parseEther(stats.totalWagered) + parseEther(wagered);
  stats.totalWagered = formatEther(newTotalWagered);

  await redis.set(COINFLIP_REDIS_KEYS.agentStats(address), stats);
}

/**
 * Calculate consolation prizes for losers using tx hash as entropy
 * Each loser gets 1-5 TOURS based on deterministic random from tx hash
 */
export function calculateConsolationPrizes(
  round: CoinflipRound,
  result: CoinflipPrediction,
  flipTxHash: string
): ConsolationPrize[] {
  const losers = round.bets.filter(b => b.prediction !== result);
  const prizes: ConsolationPrize[] = [];

  for (const loser of losers) {
    // Generate deterministic random using tx hash + address
    const seed = keccak256(toBytes(`${flipTxHash}:${loser.agentAddress}`));
    // Take last byte and mod by max multiplier to get 0-4, then add 1 for 1-5
    const seedNum = parseInt(seed.slice(-2), 16);
    const multiplier = (seedNum % CONSOLATION_MAX_MULTIPLIER) + 1;

    const baseAmount = parseEther(CONSOLATION_BASE_AMOUNT);
    const prizeAmount = baseAmount * BigInt(multiplier);

    prizes.push({
      agentAddress: loser.agentAddress,
      agentName: loser.agentName,
      amount: formatEther(prizeAmount),
      multiplier,
    });
  }

  return prizes;
}
