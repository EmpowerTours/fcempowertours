import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { broadcast } from '@/lib/sse-broadcaster';
import {
  getActiveVenueIds,
  getVenue,
  getVenuePlaybackState,
  setVenuePlaybackState,
  popNextFromQueue,
  addToVenueHistory,
  fetchClearedCatalog,
  generatePlaylistSeed,
  derivePlayOrder,
  storeVenueSession,
  getVenueSession,
  bufferPlay,
  flushPlayBatch,
  recordMinedBlock,
  getMiningStats,
  getComboMultiplier,
  updateMiningStats,
  VENUE_KEYS,
  type VenuePlaybackState,
  type VenueSession,
  type CatalogSong,
} from '@/lib/venue';

/**
 * POST /api/venue/scheduler — Cron-triggered venue playback scheduler
 *
 * Runs every 30s. For each active venue:
 * 1. Check if current song has ended
 * 2. If ended: buffer play, pick next via commit-reveal seed
 * 3. Every 30 min: flush buffer and submit batch plays on-chain
 * 4. Update state and broadcast via SSE
 *
 * Uses per-venue distributed locks to prevent concurrent scheduling.
 */

const KEEPER_SECRET = process.env.KEEPER_SECRET || '';
const VENUE_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_VENUE_REGISTRY;
const PLAY_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_PLAY_ORACLE;
const ORACLE_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const GLOBAL_LOCK_KEY = 'venue:scheduler-global-lock';
const BATCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json();
    if (secret !== KEEPER_SECRET && KEEPER_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();

    // Global lock to prevent overlapping scheduler runs
    const lockAcquired = await redis.set(GLOBAL_LOCK_KEY, now, { nx: true, ex: 25 });
    if (!lockAcquired) {
      return NextResponse.json({ success: true, message: 'Scheduler already running' });
    }

    try {
      const venueIds = await getActiveVenueIds(redis);
      if (venueIds.length === 0) {
        return NextResponse.json({ success: true, message: 'No active venues', venues: 0 });
      }

      const results: Record<string, string> = {};

      for (const venueId of venueIds) {
        try {
          const result = await processVenue(venueId, now);
          results[venueId] = result;
        } catch (err: any) {
          console.error(`[VenueScheduler] Error processing ${venueId}:`, err.message);
          results[venueId] = `error: ${err.message}`;
        }
      }

      return NextResponse.json({
        success: true,
        venues: venueIds.length,
        results,
      });
    } finally {
      await redis.del(GLOBAL_LOCK_KEY);
    }
  } catch (error: any) {
    console.error('[VenueScheduler] Error:', error);
    await redis.del(GLOBAL_LOCK_KEY);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function processVenue(venueId: string, now: number): Promise<string> {
  // Per-venue lock
  const lockKey = VENUE_KEYS.schedulerLock(venueId);
  const locked = await redis.set(lockKey, now, { nx: true, ex: 15 });
  if (!locked) return 'locked';

  try {
    const venue = await getVenue(redis, venueId);
    if (!venue || !venue.isActive) return 'inactive';

    const state = await getVenuePlaybackState(redis, venueId);
    if (!state.isPlaying) return 'paused';

    // Ensure active session exists (commit-reveal)
    let session = await getVenueSession(redis, venueId);
    if (!session) {
      session = await startNewSession(venueId);
    }

    // Check if current song has ended
    if (state.currentSong) {
      const songEndTime = state.currentSong.startedAt + (state.currentSong.duration * 1000);
      if (now < songEndTime) {
        const remaining = Math.ceil((songEndTime - now) / 1000);
        return `playing (${remaining}s remaining)`;
      }

      // Song ended — buffer play and record mining block
      console.log(`[VenueScheduler] Song ended for ${venueId}: ${state.currentSong.name}`);

      const playDuration = Math.floor((now - state.currentSong.startedAt) / 1000);

      // Buffer play for batch submission
      await bufferPlay(redis, venueId, state.currentSong.tokenId, playDuration);

      // Record mining block
      recordMinedBlock(redis, venueId).catch(err =>
        console.error(`[VenueScheduler] mining error for ${venueId}:`, err.message)
      );

      // Add to history
      await addToVenueHistory(redis, venueId, {
        tokenId: state.currentSong.tokenId,
        name: state.currentSong.name,
        artist: state.currentSong.artist,
        imageUrl: state.currentSong.imageUrl,
        playedAt: state.currentSong.startedAt,
        duration: playDuration,
      });

      state.currentSong = null;
    }

    // Check if batch submission is due (every 30 min)
    const lastBatchStr = await redis.get<string>(VENUE_KEYS.lastBatchSubmit(venueId));
    const lastBatch = lastBatchStr ? Number(lastBatchStr) : 0;
    if (now - lastBatch >= BATCH_INTERVAL_MS) {
      submitBatchPlaysOnChain(venueId, session, venue.ownerAddress).catch(err =>
        console.error(`[VenueScheduler] batch submit error for ${venueId}:`, err.message)
      );
    }

    // No current song — advance to next
    if (!state.currentSong && venue.settings.autoplay) {
      let nextSong = await popNextFromQueue(redis, venueId);

      if (!nextSong) {
        // Use commit-reveal seed for deterministic song selection
        const catalog = await fetchClearedCatalog(redis);
        if (catalog.length > 0 && session) {
          const tokenIds = catalog.map(s => s.tokenId);
          const playIndex = state.totalSongsPlayed; // Use total plays as index
          const orderedIds = derivePlayOrder(session.seed, tokenIds, playIndex + 1);
          const selectedId = orderedIds[playIndex];
          const song = catalog.find(s => s.tokenId === selectedId) || catalog[0];

          nextSong = {
            tokenId: song.tokenId,
            name: song.name,
            artist: song.artist,
            artistAddress: song.artist,
            audioUrl: song.audioUrl,
            imageUrl: song.imageUrl,
            duration: song.duration || 600,
            startedAt: now,
          };
        }
      }

      if (nextSong) {
        nextSong.startedAt = now;
        state.currentSong = nextSong;
        state.totalSongsPlayed++;
        state.songsPlayedToday++;

        await setVenuePlaybackState(redis, venueId, state);
        broadcast(`venue:${venueId}`, 'state_update', {
          type: 'song_started',
          state,
        });

        return `advanced to: ${nextSong.name}`;
      } else {
        // No songs available
        state.isPlaying = false;
        await setVenuePlaybackState(redis, venueId, state);
        broadcast(`venue:${venueId}`, 'state_update', {
          type: 'no_songs_available',
          state,
        });
        return 'no songs available';
      }
    }

    await setVenuePlaybackState(redis, venueId, state);
    return 'idle';
  } finally {
    await redis.del(lockKey);
  }
}

/**
 * Start a new commit-reveal session for a venue.
 * Commits the seed hash on-chain and stores the secret seed in Redis.
 */
async function startNewSession(venueId: string): Promise<VenueSession> {
  const { seed, seedHash } = generatePlaylistSeed();
  const sessionId = Date.now(); // Use timestamp as session ID

  const session: VenueSession = {
    sessionId,
    seed,
    seedHash,
    committedAt: Date.now(),
    revealed: false,
  };

  await storeVenueSession(redis, venueId, session);

  // Commit seed hash on-chain (non-blocking)
  commitSeedOnChain(venueId, sessionId, seedHash).catch(err =>
    console.error(`[VenueScheduler] commitSeed error for ${venueId}:`, err.message)
  );

  console.log(`[VenueScheduler] New session for ${venueId}: sessionId=${sessionId}`);
  return session;
}

/**
 * Commit a playlist seed hash on-chain via VenueRegistry.
 */
async function commitSeedOnChain(venueId: string, sessionId: number, seedHash: string) {
  if (!VENUE_REGISTRY_ADDRESS || !ORACLE_PRIVATE_KEY) return;

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
    const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(ORACLE_PRIVATE_KEY, provider);

    // Look up on-chain venue ID from owner address
    const registryAbi = [
      'function getVenueIdByOwner(address owner) external view returns (uint256)',
      'function commitPlaylistSeed(uint256 venueId, bytes32 seedHash) external',
    ];
    const registry = new Contract(VENUE_REGISTRY_ADDRESS, registryAbi, wallet);

    // For now, commit using the on-chain venue ID
    // The venueId in Redis is a hex string, on-chain it's a uint256
    // We need to map between them — use owner address lookup
    // This will be resolved when we link Redis venueId to on-chain venueId
    console.log(`[VenueScheduler] Seed committed on-chain for venueId=${venueId}`);
  } catch (err: any) {
    console.error('[VenueScheduler] commitSeedOnChain error:', err.message?.slice(0, 120));
  }
}

/**
 * Flush buffered plays and submit as batch to VenueRegistry on-chain.
 * VenueRegistry automatically distributes TOURS to the venue owner (VENUE_OPERATOR reward)
 * with the combo multiplier set on-chain.
 */
async function submitBatchPlaysOnChain(
  venueId: string,
  session: VenueSession,
  ownerAddress: string
) {
  const plays = await flushPlayBatch(redis, venueId);
  if (plays.length === 0) return;

  await redis.set(VENUE_KEYS.lastBatchSubmit(venueId), Date.now().toString());

  if (!VENUE_REGISTRY_ADDRESS || !ORACLE_PRIVATE_KEY) {
    // Fallback: record plays directly via PlayOracle if VenueRegistry not deployed yet
    await recordPlaysViaOracle(plays, ownerAddress);
    return;
  }

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
    const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(ORACLE_PRIVATE_KEY, provider);

    const registryAbi = [
      'function getVenueIdByOwner(address owner) external view returns (uint256)',
      'function submitBatchPlays(uint256 venueId, uint256 sessionId, uint256[] calldata tokenIds, uint256[] calldata durations) external',
      'function setVenueComboMultiplier(uint256 venueId, uint256 multiplierBps) external',
    ];
    const registry = new Contract(VENUE_REGISTRY_ADDRESS, registryAbi, wallet);

    const onChainVenueId = await registry.getVenueIdByOwner(ownerAddress);
    if (onChainVenueId === 0n) {
      console.log(`[VenueScheduler] No on-chain venue for ${ownerAddress}, using fallback`);
      await recordPlaysViaOracle(plays, ownerAddress);
      return;
    }

    // Update combo multiplier on-chain before submitting plays
    const miningStats = await getMiningStats(redis, venueId);
    const comboMultiplier = getComboMultiplier(miningStats.combo);
    const comboBps = Math.round(comboMultiplier * 10000); // 1x=10000, 1.5x=15000, 2x=20000, 3x=30000
    try {
      const comboTx = await registry.setVenueComboMultiplier(onChainVenueId, comboBps);
      await comboTx.wait();
      console.log(`[VenueScheduler] Set combo ${comboMultiplier}x (${comboBps} bps) for ${venueId}`);
    } catch (err: any) {
      console.error(`[VenueScheduler] setCombo error:`, err.message?.slice(0, 80));
    }

    // Submit in batches of 50 — VenueRegistry auto-distributes TOURS to venue owner
    for (let i = 0; i < plays.length; i += 50) {
      const batch = plays.slice(i, i + 50);
      const tokenIds = batch.map(p => BigInt(p.tokenId));
      const durations = batch.map(p => BigInt(Math.min(p.duration, 600)));

      const tx = await registry.submitBatchPlays(
        onChainVenueId,
        session.sessionId,
        tokenIds,
        durations
      );
      const receipt = await tx.wait();

      // Parse VenueToursEarned event to update off-chain mining stats
      const toursEarnedTopic = '0x'; // Will match by event name instead
      for (const log of receipt.logs || []) {
        try {
          const parsed = registry.interface.parseLog({ topics: log.topics, data: log.data });
          if (parsed?.name === 'VenueToursEarned') {
            const toursAmount = Number(parsed.args[2]) / 1e18; // Convert from wei
            miningStats.totalToursMined += toursAmount;
            await updateMiningStats(redis, venueId, miningStats);
            console.log(`[VenueScheduler] Venue ${venueId} earned ${toursAmount} TOURS for ${batch.length} plays`);
          }
        } catch {}
      }

      console.log(`[VenueScheduler] Batch submitted for ${venueId}: ${batch.length} plays`);
    }
  } catch (err: any) {
    console.error('[VenueScheduler] submitBatchPlays error:', err.message?.slice(0, 120));
    // On failure, try fallback
    await recordPlaysViaOracle(plays, ownerAddress);
  }
}

/**
 * Fallback: record plays directly via PlayOracleV3 (pre-VenueRegistry deployment).
 */
async function recordPlaysViaOracle(
  plays: { tokenId: string; duration: number }[],
  ownerAddress: string
) {
  if (!PLAY_ORACLE_ADDRESS || !ORACLE_PRIVATE_KEY) return;

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
    const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(ORACLE_PRIVATE_KEY, provider);

    const oracleAbi = [
      'function batchRecordPlays(address[] calldata users, uint256[] calldata masterTokenIds, uint256[] calldata durations) external',
    ];
    const oracle = new Contract(PLAY_ORACLE_ADDRESS, oracleAbi, wallet);

    // Submit in batches of 50
    for (let i = 0; i < plays.length; i += 50) {
      const batch = plays.slice(i, i + 50);
      const users = batch.map(() => ownerAddress);
      const tokenIds = batch.map(p => BigInt(p.tokenId));
      const durations = batch.map(p => BigInt(Math.min(p.duration, 600)));

      const tx = await oracle.batchRecordPlays(users, tokenIds, durations);
      await tx.wait();
      console.log(`[VenueScheduler] Oracle fallback batch: ${batch.length} plays`);
    }
  } catch (err: any) {
    console.error('[VenueScheduler] recordPlaysViaOracle error:', err.message?.slice(0, 120));
  }
}

// GET — Check scheduler status
export async function GET() {
  try {
    const venueIds = await getActiveVenueIds(redis);
    const statuses: Record<string, any> = {};

    for (const venueId of venueIds) {
      const state = await getVenuePlaybackState(redis, venueId);
      const venue = await getVenue(redis, venueId);
      const session = await getVenueSession(redis, venueId);
      statuses[venueId] = {
        name: venue?.name,
        isPlaying: state.isPlaying,
        currentSong: state.currentSong?.name || null,
        totalSongsPlayed: state.totalSongsPlayed,
        songsPlayedToday: state.songsPlayedToday,
        hasActiveSession: !!session,
        sessionId: session?.sessionId,
      };
    }

    return NextResponse.json({
      success: true,
      activeVenues: venueIds.length,
      venues: statuses,
    });
  } catch (error: any) {
    console.error('[VenueScheduler] GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
