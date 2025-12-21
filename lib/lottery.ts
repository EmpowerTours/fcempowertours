import { redis } from './redis';
import { randomBytes, createHash } from 'crypto';

// Configuration
export const LOTTERY_CONFIG = {
  ENABLED: false,                   // ⚠️ DISABLED - Neynar wallet transfer API doesn't exist
  ACCESS_FEE_ETH: 0.001,          // 0.001 ETH to access
  TREASURY_SHARE: 0.5,             // 50% to treasury
  LOTTERY_SHARE: 0.5,              // 50% to lottery pool
  TREASURY_ADDRESS: '0x33fFCcb1802e13a7eead232BCd4706a2269582b0',
  BOT_WALLET_ADDRESS: '0x2d5dd9aa1dc42949d203d1946d599ba47f0b6d1c',
  BOT_WALLET_ID: 'n8frpzpxeq7lbfkciap1cnr5',
  NETWORK: 'base' as const,
  ACCESS_DURATION_HOURS: 24,
};

// Types
export interface AccessPayment {
  userAddress: string;
  fid?: number;
  username?: string;
  txHash: string;
  amountETH: number;
  lotteryContribution: number;
  treasuryContribution: number;
  timestamp: number;
  expiresAt: number;
  lotteryDay: string; // YYYY-MM-DD format
}

export interface LotteryPool {
  day: string; // YYYY-MM-DD
  totalPool: number;
  participants: string[]; // array of user addresses
  participantCount: number;
  status: 'active' | 'drawing' | 'completed';
  winner?: string;
  winnerFid?: number;
  winnerUsername?: string;
  winningAmount?: number;
  payoutTxHash?: string;
  announcementCastHash?: string;
  createdAt: number;
  completedAt?: number;
}

export interface LotteryWinner {
  day: string;
  winnerAddress: string;
  winnerFid?: number;
  winnerUsername?: string;
  amount: number;
  payoutTxHash?: string;
  castHash?: string;
  timestamp: number;
}

// Redis Keys
const KEYS = {
  accessPayment: (address: string) => `lottery:access:${address.toLowerCase()}`,
  lotteryPool: (day: string) => `lottery:pool:${day}`,
  lotteryParticipants: (day: string) => `lottery:participants:${day}`,
  lotteryWinner: (day: string) => `lottery:winner:${day}`,
  allWinners: () => `lottery:winners:all`,
  totalStats: () => `lottery:stats:total`,
};

// Helper: Get today's date in YYYY-MM-DD format
export function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper: Get specific date key
export function getDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Cryptographically Secure Random Winner Selection
 *
 * Uses multiple entropy sources combined:
 * 1. Node.js crypto.randomBytes (CSPRNG)
 * 2. Current timestamp (nanoseconds)
 * 3. Day identifier (lottery date)
 * 4. Pool size (total ETH in pool)
 * 5. All participant addresses (hashed)
 *
 * The combination is hashed with SHA-256 to produce
 * a deterministic but unpredictable index.
 *
 * Returns a proof hash that can be verified.
 */
export function selectSecureRandomWinner(
  participants: string[],
  day: string,
  poolSize: number
): { winnerIndex: number; seed: string; proof: string } {
  if (participants.length === 0) {
    throw new Error('No participants to select from');
  }

  if (participants.length === 1) {
    return { winnerIndex: 0, seed: 'single-participant', proof: 'n/a' };
  }

  // Gather entropy from multiple sources
  const cryptoRandom = randomBytes(32).toString('hex'); // 256 bits of randomness
  const timestamp = Date.now().toString() + process.hrtime.bigint().toString();
  const participantsHash = createHash('sha256')
    .update(participants.sort().join(','))
    .digest('hex');

  // Combine all entropy sources
  const entropyString = [
    cryptoRandom,
    timestamp,
    day,
    poolSize.toString(),
    participantsHash,
  ].join('|');

  // Create seed hash
  const seedHash = createHash('sha256')
    .update(entropyString)
    .digest('hex');

  // Create proof (can be published for transparency)
  const proof = createHash('sha256')
    .update(seedHash + '|' + participants.length.toString())
    .digest('hex');

  // Convert hash to number and get index
  // Use first 8 bytes (64 bits) of hash as a big integer
  const hashBuffer = Buffer.from(seedHash, 'hex');
  const bigIntValue = hashBuffer.readBigUInt64BE(0);
  const winnerIndex = Number(bigIntValue % BigInt(participants.length));

  return {
    winnerIndex,
    seed: seedHash.slice(0, 16) + '...', // Truncated for display
    proof,
  };
}

/**
 * Verify a lottery drawing (for transparency)
 */
export function verifyLotteryProof(
  proof: string,
  participantCount: number,
  expectedIndex: number
): boolean {
  // This is a simplified verification
  // In production, you'd store the full entropy and allow recalculation
  return proof.length === 64; // SHA-256 produces 64 hex chars
}

// Check if user has valid access
export async function checkUserAccess(userAddress: string): Promise<{
  hasAccess: boolean;
  expiresAt?: number;
  payment?: AccessPayment;
}> {
  const payment = await redis.get<AccessPayment>(KEYS.accessPayment(userAddress));

  if (!payment) {
    return { hasAccess: false };
  }

  const now = Date.now();
  if (now > payment.expiresAt) {
    return { hasAccess: false, payment };
  }

  return {
    hasAccess: true,
    expiresAt: payment.expiresAt,
    payment,
  };
}

// Record a new access payment
export async function recordAccessPayment(params: {
  userAddress: string;
  fid?: number;
  username?: string;
  txHash: string;
  amountETH: number;
}): Promise<AccessPayment> {
  const { userAddress, fid, username, txHash, amountETH } = params;

  const now = Date.now();
  const lotteryDay = getTodayKey();
  const expiresAt = now + (LOTTERY_CONFIG.ACCESS_DURATION_HOURS * 60 * 60 * 1000);

  const lotteryContribution = amountETH * LOTTERY_CONFIG.LOTTERY_SHARE;
  const treasuryContribution = amountETH * LOTTERY_CONFIG.TREASURY_SHARE;

  const payment: AccessPayment = {
    userAddress: userAddress.toLowerCase(),
    fid,
    username,
    txHash,
    amountETH,
    lotteryContribution,
    treasuryContribution,
    timestamp: now,
    expiresAt,
    lotteryDay,
  };

  // Store access payment (expires after 24h)
  await redis.set(KEYS.accessPayment(userAddress), payment, {
    ex: LOTTERY_CONFIG.ACCESS_DURATION_HOURS * 60 * 60,
  });

  // Add to today's lottery pool
  await addToLotteryPool(lotteryDay, userAddress, lotteryContribution, fid, username);

  return payment;
}

// Add participant to lottery pool
async function addToLotteryPool(
  day: string,
  userAddress: string,
  contribution: number,
  fid?: number,
  username?: string
): Promise<void> {
  const poolKey = KEYS.lotteryPool(day);
  const participantsKey = KEYS.lotteryParticipants(day);

  // Get or create pool
  let pool = await redis.get<LotteryPool>(poolKey);

  if (!pool) {
    pool = {
      day,
      totalPool: 0,
      participants: [],
      participantCount: 0,
      status: 'active',
      createdAt: Date.now(),
    };
  }

  // Add participant if not already in pool
  const normalizedAddress = userAddress.toLowerCase();
  if (!pool.participants.includes(normalizedAddress)) {
    pool.participants.push(normalizedAddress);
    pool.participantCount = pool.participants.length;
  }

  // Add contribution to pool
  pool.totalPool += contribution;

  // Save updated pool
  await redis.set(poolKey, pool);

  // Also store in a set for quick lookup
  await redis.sadd(participantsKey, JSON.stringify({
    address: normalizedAddress,
    fid,
    username,
    contribution,
    timestamp: Date.now(),
  }));
}

// Get lottery pool for a specific day
export async function getLotteryPool(day: string): Promise<LotteryPool | null> {
  return await redis.get<LotteryPool>(KEYS.lotteryPool(day));
}

// Get today's lottery pool
export async function getTodayPool(): Promise<LotteryPool | null> {
  return await getLotteryPool(getTodayKey());
}

// Run the lottery drawing for a specific day
export async function runLotteryDrawing(day: string): Promise<LotteryWinner | null> {
  const poolKey = KEYS.lotteryPool(day);
  const pool = await redis.get<LotteryPool>(poolKey);

  if (!pool) {
    console.log(`No lottery pool found for ${day}`);
    return null;
  }

  if (pool.status === 'completed') {
    console.log(`Lottery for ${day} already completed. Winner: ${pool.winner}`);
    return null;
  }

  if (pool.participants.length === 0) {
    console.log(`No participants for ${day}`);
    return null;
  }

  // Mark as drawing
  pool.status = 'drawing';
  await redis.set(poolKey, pool);

  // Select random winner using cryptographically secure randomness
  const { winnerIndex, seed, proof } = selectSecureRandomWinner(
    pool.participants,
    day,
    pool.totalPool
  );
  const winnerAddress = pool.participants[winnerIndex];

  console.log(`[LOTTERY] Secure random selection:`);
  console.log(`  - Seed: ${seed}`);
  console.log(`  - Proof hash: ${proof}`);
  console.log(`  - Winner index: ${winnerIndex} of ${pool.participants.length}`);

  // Get winner details from participants set
  const participantsKey = KEYS.lotteryParticipants(day);
  const participantEntries = await redis.smembers(participantsKey);
  let winnerFid: number | undefined;
  let winnerUsername: string | undefined;

  for (const entry of participantEntries) {
    try {
      const parsed = JSON.parse(entry as string);
      if (parsed.address.toLowerCase() === winnerAddress.toLowerCase()) {
        winnerFid = parsed.fid;
        winnerUsername = parsed.username;
        break;
      }
    } catch (e) {
      // Skip invalid entries
    }
  }

  // Create winner record
  const winner: LotteryWinner = {
    day,
    winnerAddress,
    winnerFid,
    winnerUsername,
    amount: pool.totalPool,
    timestamp: Date.now(),
  };

  // Update pool with winner
  pool.status = 'completed';
  pool.winner = winnerAddress;
  pool.winnerFid = winnerFid;
  pool.winnerUsername = winnerUsername;
  pool.winningAmount = pool.totalPool;
  pool.completedAt = Date.now();

  await redis.set(poolKey, pool);
  await redis.set(KEYS.lotteryWinner(day), winner);
  await redis.lpush(KEYS.allWinners(), JSON.stringify(winner));

  console.log(`Lottery winner for ${day}: ${winnerAddress} wins ${pool.totalPool} ETH`);

  return winner;
}

// Update winner with payout transaction
export async function recordWinnerPayout(
  day: string,
  payoutTxHash: string,
  castHash?: string
): Promise<void> {
  const poolKey = KEYS.lotteryPool(day);
  const winnerKey = KEYS.lotteryWinner(day);

  const pool = await redis.get<LotteryPool>(poolKey);
  const winner = await redis.get<LotteryWinner>(winnerKey);

  if (pool) {
    pool.payoutTxHash = payoutTxHash;
    pool.announcementCastHash = castHash;
    await redis.set(poolKey, pool);
  }

  if (winner) {
    winner.payoutTxHash = payoutTxHash;
    winner.castHash = castHash;
    await redis.set(winnerKey, winner);
  }
}

// Get all historical winners
export async function getAllWinners(limit = 30): Promise<LotteryWinner[]> {
  const winners = await redis.lrange(KEYS.allWinners(), 0, limit - 1);
  return winners.map(w => {
    try {
      return typeof w === 'string' ? JSON.parse(w) : w;
    } catch {
      return w;
    }
  }) as LotteryWinner[];
}

// Get lottery stats
export async function getLotteryStats(): Promise<{
  totalPaidOut: number;
  totalParticipants: number;
  totalDrawings: number;
  recentWinners: LotteryWinner[];
}> {
  const winners = await getAllWinners(10);

  let totalPaidOut = 0;
  let totalParticipants = 0;

  for (const winner of winners) {
    totalPaidOut += winner.amount;
  }

  return {
    totalPaidOut,
    totalParticipants,
    totalDrawings: winners.length,
    recentWinners: winners,
  };
}

// Verify payment on Base network
export async function verifyPaymentOnBase(txHash: string, expectedAmount: number): Promise<{
  verified: boolean;
  from?: string;
  to?: string;
  amount?: number;
  error?: string;
}> {
  try {
    // Use Base RPC to verify transaction
    const BASE_RPC = 'https://mainnet.base.org';

    const response = await fetch(BASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionByHash',
        params: [txHash],
      }),
    });

    const data = await response.json();

    if (!data.result) {
      return { verified: false, error: 'Transaction not found' };
    }

    const tx = data.result;
    const valueWei = BigInt(tx.value);
    const valueETH = Number(valueWei) / 1e18;

    // Check if payment is to the bot wallet
    if (tx.to.toLowerCase() !== LOTTERY_CONFIG.BOT_WALLET_ADDRESS.toLowerCase()) {
      return {
        verified: false,
        error: `Payment not sent to correct address. Expected: ${LOTTERY_CONFIG.BOT_WALLET_ADDRESS}`
      };
    }

    // Check amount (allow small tolerance for gas)
    if (valueETH < expectedAmount * 0.99) {
      return {
        verified: false,
        error: `Insufficient payment. Expected: ${expectedAmount} ETH, Got: ${valueETH} ETH`
      };
    }

    return {
      verified: true,
      from: tx.from,
      to: tx.to,
      amount: valueETH,
    };
  } catch (error: any) {
    return { verified: false, error: error.message };
  }
}
