import { redis } from '@/lib/redis';
import { encodeFunctionData, parseEther, Address } from 'viem';
import { TOURS_TOKEN } from './types';
import { addEvent } from './state';

// ============================================================================
// CONSTANTS
// ============================================================================

const REDIS_KEYS = {
  burn: (txHash: string) => `burn:tx:${txHash}`,
  userBurns: (address: string) => `burn:user:${address.toLowerCase()}`,
  userAbilities: (address: string) => `burn:abilities:${address.toLowerCase()}`,
  totalBurned: 'burn:total',
};

/** Burn dead address */
export const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address;

/** Abilities that can be unlocked by burning TOURS */
export const BURN_ABILITIES = {
  vip_status: {
    cost: '50',
    duration: 30 * 24 * 60 * 60 * 1000, // 30 days
    description: 'VIP status - priority support and exclusive features',
  },
  radio_priority: {
    cost: '25',
    duration: 7 * 24 * 60 * 60 * 1000, // 7 days
    description: 'Radio priority - your queued songs play sooner',
  },
  governance_boost: {
    cost: '100',
    duration: 30 * 24 * 60 * 60 * 1000, // 30 days
    description: 'Governance boost - 2x voting power on all proposals',
  },
  early_access: {
    cost: '75',
    duration: 14 * 24 * 60 * 60 * 1000, // 14 days
    description: 'Early access - preview new features before release',
  },
  custom_badge: {
    cost: '200',
    duration: 0, // Permanent
    description: 'Custom badge - unique profile badge (permanent)',
  },
} as const;

export type BurnAbility = keyof typeof BURN_ABILITIES;

// ============================================================================
// TYPES
// ============================================================================

export interface BurnRecord {
  txHash: string;
  user: string;
  amount: string;
  ability: BurnAbility;
  timestamp: number;
}

export interface UserAbility {
  ability: BurnAbility;
  grantedAt: number;
  expiresAt: number | null; // null = permanent
  burnTxHash: string;
}

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Generate calldata for burning TOURS (transfer to dead address)
 */
export function generateBurnCall(
  amount: string
): { to: Address; value: bigint; data: `0x${string}` } {
  const amountWei = parseEther(amount);

  return {
    to: TOURS_TOKEN,
    value: 0n,
    data: encodeFunctionData({
      abi: [
        {
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          name: 'transfer',
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function',
        },
      ],
      functionName: 'transfer',
      args: [BURN_ADDRESS, amountWei],
    }),
  };
}

/**
 * Record a burn and grant ability
 */
export async function recordBurn(
  user: Address,
  ability: BurnAbility,
  amount: string,
  txHash: string
): Promise<UserAbility> {
  const abilityConfig = BURN_ABILITIES[ability];
  const now = Date.now();

  const burnRecord: BurnRecord = {
    txHash,
    user,
    amount,
    ability,
    timestamp: now,
  };

  const userAbility: UserAbility = {
    ability,
    grantedAt: now,
    expiresAt: abilityConfig.duration > 0 ? now + abilityConfig.duration : null,
    burnTxHash: txHash,
  };

  // Store burn record
  await redis.set(REDIS_KEYS.burn(txHash), JSON.stringify(burnRecord));

  // Add to user's burn history
  await redis.lpush(REDIS_KEYS.userBurns(user), JSON.stringify(burnRecord));

  // Grant ability
  const abilities = await getUserAbilities(user);
  abilities[ability] = userAbility;
  await redis.set(REDIS_KEYS.userAbilities(user), JSON.stringify(abilities));

  // Update total burned
  await redis.incrbyfloat(REDIS_KEYS.totalBurned, parseFloat(amount));

  // Log event
  await addEvent({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'action',
    agent: user,
    agentName: user.slice(0, 8) + '...',
    description: `Burned ${amount} TOURS for ${abilityConfig.description}`,
    txHash,
    timestamp: now,
  });

  return userAbility;
}

/**
 * Get user's active abilities
 */
export async function getUserAbilities(
  user: string
): Promise<Record<string, UserAbility>> {
  const data = await redis.get(REDIS_KEYS.userAbilities(user));
  if (!data) return {};

  const abilities = JSON.parse(data as string) as Record<string, UserAbility>;
  const now = Date.now();

  // Filter out expired abilities
  const active: Record<string, UserAbility> = {};
  for (const [key, ability] of Object.entries(abilities)) {
    if (ability.expiresAt === null || ability.expiresAt > now) {
      active[key] = ability;
    }
  }

  return active;
}

/**
 * Check if user has a specific ability
 */
export async function hasAbility(user: string, ability: BurnAbility): Promise<boolean> {
  const abilities = await getUserAbilities(user);
  return ability in abilities;
}

/**
 * Get user's burn history
 */
export async function getUserBurnHistory(user: string): Promise<BurnRecord[]> {
  const data = await redis.lrange(REDIS_KEYS.userBurns(user), 0, 100);
  return data.map((d) => JSON.parse(d as string));
}

/**
 * Get total TOURS burned across all users
 */
export async function getTotalBurned(): Promise<string> {
  const total = await redis.get(REDIS_KEYS.totalBurned);
  return total?.toString() || '0';
}
