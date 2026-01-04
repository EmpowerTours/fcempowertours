import { redis } from '@/lib/redis';

export interface DelegationConfig {
  permissions: string[];
  maxTransactions: number;
  durationHours: number;
}

export interface Delegation {
  user: string;
  bot: string;
  expiresAt: number;
  config: DelegationConfig;
  transactionsExecuted: number;
  createdAt: number;
}

/**
 * Safely parse delegation data from Redis
 * Handles both string and object types
 */
function parseDelegationData(data: any): Delegation | null {
  if (!data) return null;

  try {
    // If it's a string, parse it
    if (typeof data === 'string') {
      return JSON.parse(data) as Delegation;
    }
    
    // If it's already an object and valid, return it
    if (typeof data === 'object' && data.user && data.bot) {
      return data as Delegation;
    }

    console.warn('⚠️ Invalid delegation data format:', typeof data);
    return null;
  } catch (error) {
    console.error('❌ Failed to parse delegation:', error);
    return null;
  }
}

/**
 * Create a delegation for a user
 * Stores in Redis with TTL
 */
export async function createDelegation(
  userAddress: string,
  config: DelegationConfig
): Promise<Delegation> {
  const botAddress = process.env.BOT_SMART_ACCOUNT_ADDRESS ||
    '0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5';

  const delegation: Delegation = {
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
export async function getDelegation(userAddress: string): Promise<Delegation | null> {
  try {
    const normalizedAddress = userAddress.toLowerCase();
    const key = `delegation:${normalizedAddress}`;
    console.log(`🔍 Looking up delegation key: ${key}`);

    const data = await redis.get(key);

    if (!data) {
      console.log('⚠️ No delegation found in Redis for:', normalizedAddress);
      return null;
    }

    console.log('📦 Raw delegation data type:', typeof data);

    const delegation = parseDelegationData(data);

    if (!delegation) {
      console.warn('⚠️ Failed to parse delegation for:', normalizedAddress);
      return null;
    }

    const now = Date.now();
    const timeLeft = delegation.expiresAt - now;

    if (timeLeft <= 0) {
      await redis.del(key);
      console.log(`⚠️ Delegation expired for ${normalizedAddress} (expired ${Math.abs(timeLeft)}ms ago)`);
      return null;
    }

    console.log(`✅ Valid delegation found for ${normalizedAddress}, expires in ${Math.floor(timeLeft / 1000 / 60)} minutes`);
    return delegation;
  } catch (error) {
    console.error('❌ Error getting delegation:', error);
    return null;
  }
}

/**
 * Check if user has permission for action
 */
export async function hasPermission(
  userAddress: string,
  action: string
): Promise<boolean> {
  try {
    const delegation = await getDelegation(userAddress);

    if (!delegation) {
      console.log('❌ No delegation found');
      return false;
    }

    if (!delegation.config.permissions.includes(action)) {
      console.log(`❌ No permission for action: ${action}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Error checking permission:', error);
    return false;
  }
}

/**
 * Increment transaction counter
 * Silently returns if no delegation exists (for public actions that don't require delegation)
 */
export async function incrementTransactionCount(userAddress: string): Promise<void> {
  try {
    const key = `delegation:${userAddress.toLowerCase()}`;
    const data = await redis.get(key);

    const delegation = parseDelegationData(data);
    if (!delegation) {
      // No delegation found - this is expected for public actions, just return silently
      return;
    }

    delegation.transactionsExecuted++;

    const remainingTime = delegation.expiresAt - Date.now();
    const ttlSeconds = Math.max(1, Math.floor(remainingTime / 1000));

    await redis.setex(key, ttlSeconds, JSON.stringify(delegation));

    console.log(`✅ Transaction count incremented: ${delegation.transactionsExecuted}/${delegation.config.maxTransactions}`);
  } catch (error) {
    // Log as warning instead of error - non-critical for public actions
    console.warn('⚠️ Could not increment transaction count:', error);
  }
}

/**
 * Update delegation permissions
 * Adds new permissions to existing delegation without resetting transaction count
 */
export async function updateDelegationPermissions(
  userAddress: string,
  newPermissions: string[]
): Promise<Delegation | null> {
  try {
    const key = `delegation:${userAddress.toLowerCase()}`;
    const data = await redis.get(key);

    const delegation = parseDelegationData(data);
    if (!delegation) {
      console.warn('⚠️ No delegation found to update for:', userAddress);
      return null;
    }

    if (delegation.expiresAt < Date.now()) {
      await redis.del(key);
      console.log(`⚠️ Delegation expired for ${userAddress}, cannot update`);
      return null;
    }

    // Merge existing permissions with new ones (deduplicate)
    const mergedPermissions = Array.from(
      new Set([...delegation.config.permissions, ...newPermissions])
    );

    delegation.config.permissions = mergedPermissions;

    // Calculate remaining TTL and update in Redis
    const remainingTime = delegation.expiresAt - Date.now();
    const ttlSeconds = Math.max(1, Math.floor(remainingTime / 1000));

    await redis.setex(key, ttlSeconds, JSON.stringify(delegation));

    console.log(`✅ Delegation updated for ${userAddress}`);
    console.log(`   Added permissions:`, newPermissions);
    console.log(`   Total permissions:`, mergedPermissions.length);

    return delegation;
  } catch (error) {
    console.error('❌ Error updating delegation:', error);
    return null;
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
  totalTransactionsExecuted: number;
  timestamp: number;
}> {
  try {
    const keys = await redis.keys('delegation:*');

    let activeDelegations = 0;
    let totalTransactionsExecuted = 0;

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const delegation = parseDelegationData(data);
        if (delegation && delegation.expiresAt > Date.now()) {
          activeDelegations++;
          totalTransactionsExecuted += delegation.transactionsExecuted;
        }
      }
    }

    return {
      activeDelegations,
      totalKeys: keys.length,
      totalTransactionsExecuted,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('❌ Error getting delegation stats:', error);
    return {
      activeDelegations: 0,
      totalKeys: 0,
      totalTransactionsExecuted: 0,
      timestamp: Date.now(),
    };
  }
}
