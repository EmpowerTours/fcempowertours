import Redis from 'ioredis';
import config from '../config';

// User data interface
export interface User {
  discord_id: string;
  wallet_address: string | null;
  farcaster_fid: number | null;
  farcaster_username: string | null;
  created_at: string;
  updated_at: string;
}

// Tip record interface
export interface TipRecord {
  id: string;
  from_discord_id: string;
  to_discord_id: string;
  amount: string;
  tx_hash: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

// Claim record interface
export interface ClaimRecord {
  id: string;
  discord_id: string;
  amount: string;
  tx_hash: string | null;
  claim_type: string;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

// Pending tip interface (off-chain tips for users without wallets)
export interface PendingTip {
  id: string;
  from_discord_id: string;
  to_discord_id: string;
  amount: string;
  created_at: string;
}

// Verification code interface
interface VerificationCode {
  code: string;
  expires_at: string;
}

class DatabaseService {
  private redis: Redis;
  private prefix: string;

  constructor() {
    this.redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });
    this.prefix = config.redis.keyPrefix;

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis');
    });
  }

  // Connect to Redis
  async connect(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      // Already connected or connecting
      if ((error as Error).message !== 'Redis is already connecting/connected') {
        throw error;
      }
    }
  }

  // Key helpers
  private userKey(discordId: string): string {
    return `${this.prefix}user:${discordId}`;
  }

  private walletIndexKey(wallet: string): string {
    return `${this.prefix}wallet:${wallet.toLowerCase()}`;
  }

  private farcasterIndexKey(fid: number): string {
    return `${this.prefix}farcaster:${fid}`;
  }

  private tipKey(tipId: string): string {
    return `${this.prefix}tip:${tipId}`;
  }

  private userTipsSentKey(discordId: string): string {
    return `${this.prefix}user:${discordId}:tips:sent`;
  }

  private userTipsReceivedKey(discordId: string): string {
    return `${this.prefix}user:${discordId}:tips:received`;
  }

  private pendingTipKey(tipId: string): string {
    return `${this.prefix}pending:${tipId}`;
  }

  private userPendingTipsKey(discordId: string): string {
    return `${this.prefix}user:${discordId}:pending`;
  }

  private claimKey(claimId: string): string {
    return `${this.prefix}claim:${claimId}`;
  }

  private userClaimsKey(discordId: string): string {
    return `${this.prefix}user:${discordId}:claims`;
  }

  private verificationKey(discordId: string): string {
    return `${this.prefix}verification:${discordId}`;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // User methods
  async getUser(discordId: string): Promise<User | null> {
    const data = await this.redis.hgetall(this.userKey(discordId));
    if (!data || Object.keys(data).length === 0) return null;

    return {
      discord_id: discordId,
      wallet_address: data.wallet_address || null,
      farcaster_fid: data.farcaster_fid ? parseInt(data.farcaster_fid, 10) : null,
      farcaster_username: data.farcaster_username || null,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
    };
  }

  async getUserByWallet(walletAddress: string): Promise<User | null> {
    const discordId = await this.redis.get(this.walletIndexKey(walletAddress));
    if (!discordId) return null;
    return this.getUser(discordId);
  }

  async getUserByFarcaster(fid: number): Promise<User | null> {
    const discordId = await this.redis.get(this.farcasterIndexKey(fid));
    if (!discordId) return null;
    return this.getUser(discordId);
  }

  async createUser(discordId: string): Promise<User> {
    const existing = await this.getUser(discordId);
    if (existing) return existing;

    const now = new Date().toISOString();
    await this.redis.hset(this.userKey(discordId), {
      created_at: now,
      updated_at: now,
    });

    return {
      discord_id: discordId,
      wallet_address: null,
      farcaster_fid: null,
      farcaster_username: null,
      created_at: now,
      updated_at: now,
    };
  }

  async linkWallet(discordId: string, walletAddress: string): Promise<boolean> {
    try {
      await this.createUser(discordId);
      const user = await this.getUser(discordId);
      const normalizedWallet = walletAddress.toLowerCase();

      // Check if wallet is already linked to another user
      const existingUserId = await this.redis.get(this.walletIndexKey(normalizedWallet));
      if (existingUserId && existingUserId !== discordId) {
        return false;
      }

      // Remove old wallet index if exists
      if (user?.wallet_address) {
        await this.redis.del(this.walletIndexKey(user.wallet_address));
      }

      // Update user and create new index
      await this.redis.hset(this.userKey(discordId), {
        wallet_address: normalizedWallet,
        updated_at: new Date().toISOString(),
      });
      await this.redis.set(this.walletIndexKey(normalizedWallet), discordId);

      return true;
    } catch (error) {
      console.error('Error linking wallet:', error);
      return false;
    }
  }

  async unlinkWallet(discordId: string): Promise<boolean> {
    try {
      const user = await this.getUser(discordId);
      if (user?.wallet_address) {
        await this.redis.del(this.walletIndexKey(user.wallet_address));
      }

      await this.redis.hset(this.userKey(discordId), {
        wallet_address: '',
        updated_at: new Date().toISOString(),
      });
      await this.redis.hdel(this.userKey(discordId), 'wallet_address');

      return true;
    } catch (error) {
      console.error('Error unlinking wallet:', error);
      return false;
    }
  }

  async linkFarcaster(discordId: string, fid: number, username: string): Promise<boolean> {
    try {
      await this.createUser(discordId);
      const user = await this.getUser(discordId);

      // Remove old farcaster index if exists
      if (user?.farcaster_fid) {
        await this.redis.del(this.farcasterIndexKey(user.farcaster_fid));
      }

      if (fid === 0) {
        // Unlinking farcaster
        await this.redis.hdel(this.userKey(discordId), 'farcaster_fid', 'farcaster_username');
      } else {
        // Update user and create new index
        await this.redis.hset(this.userKey(discordId), {
          farcaster_fid: fid.toString(),
          farcaster_username: username,
          updated_at: new Date().toISOString(),
        });
        await this.redis.set(this.farcasterIndexKey(fid), discordId);
      }

      return true;
    } catch (error) {
      console.error('Error linking Farcaster:', error);
      return false;
    }
  }

  // Tip methods
  async createTip(fromDiscordId: string, toDiscordId: string, amount: string, txHash?: string): Promise<string> {
    const tipId = this.generateId();
    const now = new Date().toISOString();

    const tip: TipRecord = {
      id: tipId,
      from_discord_id: fromDiscordId,
      to_discord_id: toDiscordId,
      amount,
      tx_hash: txHash || null,
      status: txHash ? 'completed' : 'pending',
      created_at: now,
    };

    await this.redis.hset(this.tipKey(tipId), tip as unknown as Record<string, string>);
    await this.redis.lpush(this.userTipsSentKey(fromDiscordId), tipId);
    await this.redis.lpush(this.userTipsReceivedKey(toDiscordId), tipId);

    return tipId;
  }

  async updateTipStatus(tipId: string, status: string, txHash?: string): Promise<void> {
    const updates: Record<string, string> = { status };
    if (txHash) {
      updates.tx_hash = txHash;
    }
    await this.redis.hset(this.tipKey(tipId), updates);
  }

  async getTipsReceived(discordId: string): Promise<TipRecord[]> {
    const tipIds = await this.redis.lrange(this.userTipsReceivedKey(discordId), 0, -1);
    const tips: TipRecord[] = [];

    for (const tipId of tipIds) {
      const data = await this.redis.hgetall(this.tipKey(tipId));
      if (data && Object.keys(data).length > 0) {
        tips.push({
          id: tipId,
          from_discord_id: data.from_discord_id,
          to_discord_id: data.to_discord_id,
          amount: data.amount,
          tx_hash: data.tx_hash || null,
          status: data.status as 'pending' | 'completed' | 'failed',
          created_at: data.created_at,
        });
      }
    }

    return tips.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async getTipsSent(discordId: string): Promise<TipRecord[]> {
    const tipIds = await this.redis.lrange(this.userTipsSentKey(discordId), 0, -1);
    const tips: TipRecord[] = [];

    for (const tipId of tipIds) {
      const data = await this.redis.hgetall(this.tipKey(tipId));
      if (data && Object.keys(data).length > 0) {
        tips.push({
          id: tipId,
          from_discord_id: data.from_discord_id,
          to_discord_id: data.to_discord_id,
          amount: data.amount,
          tx_hash: data.tx_hash || null,
          status: data.status as 'pending' | 'completed' | 'failed',
          created_at: data.created_at,
        });
      }
    }

    return tips.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Pending tips (off-chain)
  async createPendingTip(fromDiscordId: string, toDiscordId: string, amount: string): Promise<string> {
    const tipId = this.generateId();
    const now = new Date().toISOString();

    const tip: PendingTip = {
      id: tipId,
      from_discord_id: fromDiscordId,
      to_discord_id: toDiscordId,
      amount,
      created_at: now,
    };

    await this.redis.hset(this.pendingTipKey(tipId), tip as unknown as Record<string, string>);
    await this.redis.sadd(this.userPendingTipsKey(toDiscordId), tipId);

    return tipId;
  }

  async getPendingTips(discordId: string): Promise<PendingTip[]> {
    const tipIds = await this.redis.smembers(this.userPendingTipsKey(discordId));
    const tips: PendingTip[] = [];

    for (const tipId of tipIds) {
      const data = await this.redis.hgetall(this.pendingTipKey(tipId));
      if (data && Object.keys(data).length > 0) {
        tips.push({
          id: tipId,
          from_discord_id: data.from_discord_id,
          to_discord_id: data.to_discord_id,
          amount: data.amount,
          created_at: data.created_at,
        });
      }
    }

    return tips;
  }

  async getTotalPendingTips(discordId: string): Promise<bigint> {
    const tips = await this.getPendingTips(discordId);
    return tips.reduce((sum, tip) => sum + BigInt(tip.amount), 0n);
  }

  async deletePendingTips(discordId: string): Promise<number> {
    const tipIds = await this.redis.smembers(this.userPendingTipsKey(discordId));

    for (const tipId of tipIds) {
      await this.redis.del(this.pendingTipKey(tipId));
    }

    await this.redis.del(this.userPendingTipsKey(discordId));
    return tipIds.length;
  }

  // Claim methods
  async createClaim(discordId: string, amount: string, claimType: string, txHash?: string): Promise<string> {
    const claimId = this.generateId();
    const now = new Date().toISOString();

    const claim: ClaimRecord = {
      id: claimId,
      discord_id: discordId,
      amount,
      tx_hash: txHash || null,
      claim_type: claimType,
      status: txHash ? 'completed' : 'pending',
      created_at: now,
    };

    await this.redis.hset(this.claimKey(claimId), claim as unknown as Record<string, string>);
    await this.redis.lpush(this.userClaimsKey(discordId), claimId);

    return claimId;
  }

  async updateClaimStatus(claimId: string, status: string, txHash?: string): Promise<void> {
    const updates: Record<string, string> = { status };
    if (txHash) {
      updates.tx_hash = txHash;
    }
    await this.redis.hset(this.claimKey(claimId), updates);
  }

  async getClaims(discordId: string): Promise<ClaimRecord[]> {
    const claimIds = await this.redis.lrange(this.userClaimsKey(discordId), 0, -1);
    const claims: ClaimRecord[] = [];

    for (const claimId of claimIds) {
      const data = await this.redis.hgetall(this.claimKey(claimId));
      if (data && Object.keys(data).length > 0) {
        claims.push({
          id: claimId,
          discord_id: data.discord_id,
          amount: data.amount,
          tx_hash: data.tx_hash || null,
          claim_type: data.claim_type,
          status: data.status as 'pending' | 'completed' | 'failed',
          created_at: data.created_at,
        });
      }
    }

    return claims.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Verification code methods
  async createVerificationCode(discordId: string, code: string, expiresInMinutes: number = 10): Promise<void> {
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
    await this.redis.hset(this.verificationKey(discordId), {
      code,
      expires_at: expiresAt,
    });
    await this.redis.expire(this.verificationKey(discordId), expiresInMinutes * 60);
  }

  async getVerificationCode(discordId: string): Promise<VerificationCode | null> {
    const data = await this.redis.hgetall(this.verificationKey(discordId));
    if (!data || !data.code) return null;

    if (new Date(data.expires_at) < new Date()) {
      await this.redis.del(this.verificationKey(discordId));
      return null;
    }

    return {
      code: data.code,
      expires_at: data.expires_at,
    };
  }

  async deleteVerificationCode(discordId: string): Promise<void> {
    await this.redis.del(this.verificationKey(discordId));
  }

  // Statistics
  async getStats(): Promise<{ totalUsers: number; totalTips: number; totalTipped: string }> {
    // Count users by scanning keys (not efficient for large datasets, but works for MVP)
    const userKeys = await this.redis.keys(`${this.prefix}user:*`);
    const tipKeys = await this.redis.keys(`${this.prefix}tip:*`);

    // Filter out index keys
    const actualUserKeys = userKeys.filter(k => !k.includes(':tips:') && !k.includes(':pending') && !k.includes(':claims'));
    const totalUsers = actualUserKeys.length;
    const totalTips = tipKeys.length;

    // Calculate total tipped (simplified)
    let totalTipped = 0n;
    for (const tipKey of tipKeys) {
      const data = await this.redis.hgetall(tipKey);
      if (data && data.status === 'completed' && data.amount) {
        totalTipped += BigInt(data.amount);
      }
    }

    return {
      totalUsers,
      totalTips,
      totalTipped: totalTipped.toString(),
    };
  }

  // Close Redis connection
  async close(): Promise<void> {
    await this.redis.quit();
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const database = new DatabaseService();
export default database;
