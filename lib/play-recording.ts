import { Redis } from '@upstash/redis';

/**
 * Shared Play Recording Helper
 *
 * Records plays on-chain via PlayOracleV3 for both:
 * - Live Radio: records for all active listeners with subscriptions
 * - Venue Player: records under venue proxy address
 *
 * Extracted to avoid duplicating oracle interaction logic.
 */

const PLAY_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_PLAY_ORACLE;
const MUSIC_SUBSCRIPTION_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION;
const ORACLE_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

/**
 * Record a single play on-chain for a specific user/address.
 */
export async function recordPlay(
  userAddress: string,
  tokenId: string,
  duration: number
): Promise<string | null> {
  if (!PLAY_ORACLE_ADDRESS || !ORACLE_PRIVATE_KEY) {
    console.log('[PlayRecording] Skipping: missing PLAY_ORACLE or DEPLOYER_PRIVATE_KEY');
    return null;
  }

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(ORACLE_PRIVATE_KEY, provider);

    const oracleAbi = [
      'function recordPlay(address user, uint256 masterTokenId, uint256 duration) external',
      'function canPlay(address user, uint256 masterTokenId) view returns (bool)',
    ];
    const oracle = new Contract(PLAY_ORACLE_ADDRESS, oracleAbi, wallet);

    // Check canPlay (anti-replay)
    const canPlay = await oracle.canPlay(userAddress, tokenId);
    if (!canPlay) {
      console.log(`[PlayRecording] canPlay=false for ${userAddress.slice(0, 10)}... tokenId=${tokenId}`);
      return null;
    }

    const tx = await oracle.recordPlay(userAddress, tokenId, Math.min(duration, 600));
    await tx.wait();
    console.log(`[PlayRecording] Recorded play for ${userAddress.slice(0, 10)}... tokenId=${tokenId} tx=${tx.hash.slice(0, 10)}`);
    return tx.hash;
  } catch (err: any) {
    console.error(`[PlayRecording] Error for ${userAddress.slice(0, 10)}:`, err.message?.slice(0, 120));
    return null;
  }
}

/**
 * Record plays for all active radio listeners.
 * Checks subscription status before recording.
 */
export async function recordPlaysForListeners(
  redis: Redis,
  tokenId: string,
  duration: number,
  activeListenersKey: string,
  heartbeatExpiry: number
): Promise<{ recorded: number; total: number }> {
  if (!PLAY_ORACLE_ADDRESS || !ORACLE_PRIVATE_KEY) {
    console.log('[PlayRecording] Skipping batch: missing PLAY_ORACLE or DEPLOYER_PRIVATE_KEY');
    return { recorded: 0, total: 0 };
  }

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(ORACLE_PRIVATE_KEY, provider);

    const oracleAbi = [
      'function recordPlay(address user, uint256 masterTokenId, uint256 duration) external',
      'function canPlay(address user, uint256 masterTokenId) view returns (bool)',
    ];
    const subscriptionAbi = [
      'function hasActiveSubscription(address user) view returns (bool)',
    ];
    const oracle = new Contract(PLAY_ORACLE_ADDRESS, oracleAbi, wallet);
    const subscription = MUSIC_SUBSCRIPTION_ADDRESS
      ? new Contract(MUSIC_SUBSCRIPTION_ADDRESS, subscriptionAbi, provider)
      : null;

    // Get active listeners from ZSET
    const cutoff = Date.now() - (heartbeatExpiry * 1000);
    const listeners = await redis.zrange(activeListenersKey, cutoff, '+inf', { byScore: true }) as string[];

    if (listeners.length === 0) {
      console.log('[PlayRecording] No active listeners');
      return { recorded: 0, total: 0 };
    }

    console.log(`[PlayRecording] Recording plays for ${listeners.length} listeners, tokenId=${tokenId}`);

    let recorded = 0;
    for (const listener of listeners) {
      try {
        if (subscription) {
          const hasSub = await subscription.hasActiveSubscription(listener);
          if (!hasSub) continue;
        }

        const canPlay = await oracle.canPlay(listener, tokenId);
        if (!canPlay) continue;

        const tx = await oracle.recordPlay(listener, tokenId, Math.min(duration, 600));
        await tx.wait();
        recorded++;
      } catch (err: any) {
        console.warn(`[PlayRecording] Failed for ${listener.slice(0, 10)}:`, err.message?.slice(0, 80));
      }
    }

    console.log(`[PlayRecording] Recorded ${recorded}/${listeners.length} plays for tokenId=${tokenId}`);
    return { recorded, total: listeners.length };
  } catch (err: any) {
    console.error('[PlayRecording] Batch error:', err.message?.slice(0, 120));
    return { recorded: 0, total: 0 };
  }
}

/**
 * Record a venue play under the oracle wallet (venue proxy).
 */
export async function recordVenuePlay(
  tokenId: string,
  duration: number
): Promise<string | null> {
  if (!PLAY_ORACLE_ADDRESS || !ORACLE_PRIVATE_KEY) return null;

  try {
    const { JsonRpcProvider, Wallet } = await import('ethers');
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(ORACLE_PRIVATE_KEY, provider);
    return await recordPlay(wallet.address, tokenId, duration);
  } catch (err: any) {
    console.error('[PlayRecording] Venue play error:', err.message?.slice(0, 120));
    return null;
  }
}
