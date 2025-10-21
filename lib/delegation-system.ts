import { redis } from '@/lib/redis';

export interface DelegationConfig {
  permissions: string[];
  maxTransactions: number;
  durationHours: number;
}

export interface StoredDelegation {
  user: string;
  bot: string;
  expiresAt: number;
  config: DelegationConfig;
  transactionsExecuted: number;
  createdAt: number;
}

/**
 * Create a delegation for a user
 * Stores in Redis with TTL
 */
export async function createDelegation(
  userAddress: string,
  config: DelegationConfig
): Promise<StoredDelegation> {
  const botAddress = process.env.BOT_SMART_ACCOUNT_ADDRESS || 
    '0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5';

  const delegation: StoredDelegation = {
    user: userAddress.toLowerCase(),
    bot: botAddress.toLowerCase(),
    expiresAt: Date.now() + (config.durationHours * 60 * 60 * 1000),
    config,
    transactionsExecuted: 0,
    createdAt: Date.now(),
  };

  const key = `delegation:${userAddress.toLowerCase()}`;
  const ttl = config.durationHours * 3600;

  await redis.setex(key, ttl, JSON.stringify(delegation));

  console.log(`✅ Delegation created for ${userAddress}`);
  console.log(`   Permissions: ${config.permissions.join(', ')}`);
  console.log(`   Valid for: ${config.durationHours} hours`);
  console.log(`   Max transactions: ${config.maxTransactions}`);

  return delegation;
}

/**
 * Get active delegation for user
 */
export async function getDelegation(userAddress: string): Promise<StoredDelegation | null> {
  const key = `delegation:${userAddress.toLowerCase()}`;
  const result = await redis.get(key);

  if (!result) {
    return null;
  }

  const delegation = JSON.parse(result as string) as StoredDelegation;

  if (delegation.expiresAt < Date.now()) {
    await redis.del(key);
    console.log(`⚠️ Delegation expired for ${userAddress}`);
    return null;
  }

  return delegation;
}

/**
 * Check if user has permission for action
 */
export async function hasPermission(
  userAddress: string,
  action: string
): Promise<boolean> {
  const delegation = await getDelegation(userAddress);
  
  if (!delegation) {
    return false;
  }

  return delegation.config.permissions.includes(action);
}

/**
 * Increment transaction counter
 */
export async function incrementTransactionCount(userAddress: string): Promise<void> {
  const key = `delegation:${userAddress.toLowerCase()}`;
  const delegation = await getDelegation(userAddress);

  if (!delegation) {
    throw new Error('No active delegation found');
  }

  delegation.transactionsExecuted++;

  const ttl = Math.floor((delegation.expiresAt - Date.now()) / 1000);
  if (ttl > 0) {
    await redis.setex(key, ttl, JSON.stringify(delegation));
  }
}

/**
 * Revoke delegation
 */
export async function revokeDelegation(userAddress: string): Promise<void> {
  const key = `delegation:${userAddress.toLowerCase()}`;
  await redis.del(key);
  console.log(`✅ Delegation revoked for ${userAddress}`);
}

/**
 * Get delegation stats
 */
export async function getDelegationStats(): Promise<{
  activeDelegations: number;
  totalKeys: number;
  timestamp: number;
}> {
  const keys = await redis.keys('delegation:*');
  
  let activeDelegations = 0;
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      const delegation = JSON.parse(data as string) as StoredDelegation;
      if (delegation.expiresAt > Date.now()) {
        activeDelegations++;
      }
    }
  }

  return {
    activeDelegations,
    totalKeys: keys.length,
    timestamp: Date.now(),
  };
}
