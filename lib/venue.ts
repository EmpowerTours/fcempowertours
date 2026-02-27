import { Redis } from '@upstash/redis';
import { randomBytes, createHash } from 'crypto';
import { keccak256, toHex } from 'viem';
import { getRightsStatus } from '@/lib/rights-declaration';

/**
 * Venue Player — Core Module
 *
 * PRO-free music streaming for businesses. Venues subscribe via
 * MusicSubscriptionV5, plays recorded via PlayOracleV3. Only
 * rights-cleared songs (status = 'cleared') are eligible.
 * Legacy NFTs without rights records are excluded.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Venue {
  venueId: string;
  name: string;
  ownerAddress: string;
  ownerFid?: number;
  apiKeyHash: string;
  createdAt: string;
  isActive: boolean;
  settings: VenueSettings;
}

export interface VenueSettings {
  autoplay: boolean;
  shuffle: boolean;
  genreFilter?: string[];
}

export interface VenuePlaybackState {
  currentSong: VenueSong | null;
  isPlaying: boolean;
  songsPlayedToday: number;
  totalSongsPlayed: number;
  lastUpdated: number;
}

export interface VenueSong {
  tokenId: string;
  name: string;
  artist: string;
  artistAddress: string;
  audioUrl: string;
  imageUrl: string;
  duration: number;
  startedAt: number;
}

export interface VenueHistoryEntry {
  tokenId: string;
  name: string;
  artist: string;
  imageUrl: string;
  playedAt: number;
  duration: number;
}

// ============================================================================
// REDIS KEY HELPERS
// ============================================================================

export const VENUE_KEYS = {
  info: (venueId: string) => `venue:info:${venueId}`,
  owner: (address: string) => `venue:owner:${address.toLowerCase()}`,
  state: (venueId: string) => `venue:state:${venueId}`,
  queue: (venueId: string) => `venue:queue:${venueId}`,
  history: (venueId: string) => `venue:history:${venueId}`,
  stats: (venueId: string) => `venue:stats:${venueId}`,
  schedulerLock: (venueId: string) => `venue:scheduler-lock:${venueId}`,
  activeVenues: 'venue:active-set',
  session: (venueId: string) => `venue:session:${venueId}`,
  playBatch: (venueId: string) => `venue:playbatch:${venueId}`,
  lastBatchSubmit: (venueId: string) => `venue:lastBatchSubmit:${venueId}`,
  mining: (venueId: string) => `venue:mining:${venueId}`,
  miningLeaderboard: 'venue:mining:leaderboard',
} as const;

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

export function generateApiKey(): { raw: string; hashed: string } {
  const raw = `vk_${randomBytes(32).toString('hex')}`;
  const hashed = createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function verifyApiKey(
  redis: Redis,
  venueId: string,
  rawKey: string
): Promise<boolean> {
  const venue = await getVenue(redis, venueId);
  if (!venue) return false;
  const hashed = hashApiKey(rawKey);
  return venue.apiKeyHash === hashed;
}

// ============================================================================
// VENUE CRUD
// ============================================================================

export async function registerVenue(
  redis: Redis,
  ownerAddress: string,
  name: string,
  ownerFid?: number
): Promise<{ venue: Venue; apiKey: string }> {
  const address = ownerAddress.toLowerCase();

  // Check if owner already has a venue
  const existingId = await redis.get<string>(VENUE_KEYS.owner(address));
  if (existingId) {
    throw new Error('Address already has a registered venue');
  }

  const venueId = randomBytes(16).toString('hex');
  const { raw: apiKey, hashed: apiKeyHash } = generateApiKey();

  const venue: Venue = {
    venueId,
    name,
    ownerAddress: address,
    ownerFid,
    apiKeyHash,
    createdAt: new Date().toISOString(),
    isActive: true,
    settings: {
      autoplay: true,
      shuffle: true,
    },
  };

  // Store venue record and owner lookup
  await redis.set(VENUE_KEYS.info(venueId), JSON.stringify(venue));
  await redis.set(VENUE_KEYS.owner(address), venueId);

  // Add to active venues set
  await redis.sadd(VENUE_KEYS.activeVenues, venueId);

  // Initialize playback state
  const initialState: VenuePlaybackState = {
    currentSong: null,
    isPlaying: false,
    songsPlayedToday: 0,
    totalSongsPlayed: 0,
    lastUpdated: Date.now(),
  };
  await redis.set(VENUE_KEYS.state(venueId), JSON.stringify(initialState));

  console.log(`[Venue] Registered venue "${name}" (${venueId}) for ${address}`);
  return { venue, apiKey };
}

export async function getVenue(redis: Redis, venueId: string): Promise<Venue | null> {
  const data = await redis.get<string>(VENUE_KEYS.info(venueId));
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data as unknown as Venue;
}

export async function getVenueByOwner(redis: Redis, ownerAddress: string): Promise<Venue | null> {
  const venueId = await redis.get<string>(VENUE_KEYS.owner(ownerAddress.toLowerCase()));
  if (!venueId) return null;
  return getVenue(redis, venueId);
}

export async function updateVenueSettings(
  redis: Redis,
  venueId: string,
  settings: Partial<VenueSettings>
): Promise<Venue | null> {
  const venue = await getVenue(redis, venueId);
  if (!venue) return null;

  venue.settings = { ...venue.settings, ...settings };
  await redis.set(VENUE_KEYS.info(venueId), JSON.stringify(venue));

  console.log(`[Venue] Updated settings for ${venueId}:`, settings);
  return venue;
}

export async function regenerateApiKey(
  redis: Redis,
  venueId: string
): Promise<string | null> {
  const venue = await getVenue(redis, venueId);
  if (!venue) return null;

  const { raw: apiKey, hashed: apiKeyHash } = generateApiKey();
  venue.apiKeyHash = apiKeyHash;
  await redis.set(VENUE_KEYS.info(venueId), JSON.stringify(venue));

  console.log(`[Venue] Regenerated API key for ${venueId}`);
  return apiKey;
}

// ============================================================================
// PLAYBACK STATE
// ============================================================================

export async function getVenuePlaybackState(
  redis: Redis,
  venueId: string
): Promise<VenuePlaybackState> {
  const data = await redis.get<string>(VENUE_KEYS.state(venueId));
  if (!data) {
    return {
      currentSong: null,
      isPlaying: false,
      songsPlayedToday: 0,
      totalSongsPlayed: 0,
      lastUpdated: Date.now(),
    };
  }
  return typeof data === 'string' ? JSON.parse(data) : data as unknown as VenuePlaybackState;
}

export async function setVenuePlaybackState(
  redis: Redis,
  venueId: string,
  state: VenuePlaybackState
): Promise<void> {
  state.lastUpdated = Date.now();
  await redis.set(VENUE_KEYS.state(venueId), JSON.stringify(state));
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

export async function addToVenueQueue(
  redis: Redis,
  venueId: string,
  song: VenueSong
): Promise<number> {
  const length = await redis.rpush(VENUE_KEYS.queue(venueId), JSON.stringify(song));
  return length;
}

export async function getVenueQueue(
  redis: Redis,
  venueId: string,
  limit: number = 20
): Promise<VenueSong[]> {
  const raw = await redis.lrange(VENUE_KEYS.queue(venueId), 0, limit - 1);
  return raw.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item);
}

export async function popNextFromQueue(
  redis: Redis,
  venueId: string
): Promise<VenueSong | null> {
  const raw = await redis.lpop(VENUE_KEYS.queue(venueId));
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as VenueSong;
}

// ============================================================================
// PLAY HISTORY
// ============================================================================

export async function addToVenueHistory(
  redis: Redis,
  venueId: string,
  entry: VenueHistoryEntry
): Promise<void> {
  await redis.lpush(VENUE_KEYS.history(venueId), JSON.stringify(entry));
  await redis.ltrim(VENUE_KEYS.history(venueId), 0, 99);
}

export async function getVenueHistory(
  redis: Redis,
  venueId: string,
  limit: number = 20
): Promise<VenueHistoryEntry[]> {
  const raw = await redis.lrange(VENUE_KEYS.history(venueId), 0, limit - 1);
  return raw.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item);
}

// ============================================================================
// CLEARED CATALOG
// ============================================================================

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

export interface CatalogSong {
  tokenId: string;
  name: string;
  artist: string;
  artistFid: number;
  audioUrl: string;
  imageUrl: string;
  duration?: number;
}

/**
 * Fetch all music NFTs from Envio and filter to only rights-cleared songs.
 * Unlike Live Radio which allows legacy NFTs through, venue play requires
 * explicit rights clearance (status = 'cleared').
 */
export async function fetchClearedCatalog(redis: Redis): Promise<CatalogSong[]> {
  try {
    const query = `
      query GetMusicNFTs {
        MusicNFT(where: {isBurned: {_eq: false}, fullAudioUrl: {_is_null: false}}, limit: 200) {
          tokenId
          name
          artist
          artistFid
          fullAudioUrl
          imageUrl
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    const songs = data.data?.MusicNFT || [];

    // Filter to only songs with explicit rights clearance
    const cleared: CatalogSong[] = [];
    for (const song of songs) {
      if (!song.fullAudioUrl) continue;
      const status = await getRightsStatus(redis, song.tokenId);
      // VENUE ONLY: require explicit cleared status (no legacy pass-through)
      if (status && status.status === 'cleared') {
        cleared.push({
          tokenId: song.tokenId,
          name: song.name || `Song #${song.tokenId}`,
          artist: song.artist || 'Unknown Artist',
          artistFid: song.artistFid || 0,
          audioUrl: song.fullAudioUrl,
          imageUrl: song.imageUrl || '',
        });
      }
    }

    console.log(`[Venue] Catalog: ${cleared.length} cleared songs out of ${songs.length} total`);
    return cleared;
  } catch (error) {
    console.error('[Venue] Failed to fetch cleared catalog:', error);
    return [];
  }
}

/**
 * Pick a random cleared song for venue playback.
 * Optionally avoids the currently playing tokenId.
 */
export async function pickRandomClearedSong(
  redis: Redis,
  avoidTokenId?: string
): Promise<CatalogSong | null> {
  const catalog = await fetchClearedCatalog(redis);
  if (catalog.length === 0) return null;

  // Try to avoid the current song
  let candidates = avoidTokenId
    ? catalog.filter(s => s.tokenId !== avoidTokenId)
    : catalog;

  if (candidates.length === 0) candidates = catalog;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ============================================================================
// ACTIVE VENUES
// ============================================================================

export async function getActiveVenueIds(redis: Redis): Promise<string[]> {
  const members = await redis.smembers(VENUE_KEYS.activeVenues);
  return members as string[];
}

export async function setVenueActive(redis: Redis, venueId: string, active: boolean): Promise<void> {
  const venue = await getVenue(redis, venueId);
  if (!venue) return;

  venue.isActive = active;
  await redis.set(VENUE_KEYS.info(venueId), JSON.stringify(venue));

  if (active) {
    await redis.sadd(VENUE_KEYS.activeVenues, venueId);
  } else {
    await redis.srem(VENUE_KEYS.activeVenues, venueId);
  }
}

// ============================================================================
// COMMIT-REVEAL PLAYLIST SEEDS
// ============================================================================

export interface VenueSession {
  sessionId: number;
  seed: string;       // hex string (32 bytes)
  seedHash: string;   // keccak256 of seed
  committedAt: number;
  revealed: boolean;
}

/**
 * Generate a random playlist seed and its keccak256 hash.
 * The hash is committed on-chain; the seed is stored in Redis until reveal.
 */
export function generatePlaylistSeed(): { seed: string; seedHash: string } {
  const seedBytes = randomBytes(32);
  const seed = toHex(seedBytes);
  const seedHash = keccak256(seed);
  return { seed, seedHash };
}

/**
 * Derive a deterministic play order from a seed.
 * Same algorithm as VenueRegistry.derivePlayOrder() on-chain.
 * @param seed The 32-byte hex seed
 * @param tokenIds Array of available token IDs
 * @param count How many songs to pick
 * @returns Ordered array of token IDs
 */
export function derivePlayOrder(seed: string, tokenIds: string[], count: number): string[] {
  const result: string[] = [];
  const catalogSize = tokenIds.length;
  if (catalogSize === 0) return result;

  for (let i = 0; i < count; i++) {
    // Match on-chain: uint256(keccak256(abi.encodePacked(seed, index))) % catalogSize
    const packed = keccak256(
      `0x${seed.replace('0x', '')}${i.toString(16).padStart(64, '0')}` as `0x${string}`
    );
    const index = Number(BigInt(packed) % BigInt(catalogSize));
    result.push(tokenIds[index]);
  }
  return result;
}

/**
 * Store active session data in Redis (seed kept secret until reveal).
 */
export async function storeVenueSession(
  redis: Redis,
  venueId: string,
  session: VenueSession
): Promise<void> {
  await redis.set(VENUE_KEYS.session(venueId), JSON.stringify(session));
}

/**
 * Get active session data from Redis.
 */
export async function getVenueSession(
  redis: Redis,
  venueId: string
): Promise<VenueSession | null> {
  const data = await redis.get<string>(VENUE_KEYS.session(venueId));
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data as unknown as VenueSession;
}

// ============================================================================
// PLAY BATCH BUFFERING
// ============================================================================

export interface BufferedPlay {
  tokenId: string;
  duration: number;
  playedAt: number;
}

/**
 * Buffer a play for later batch submission to VenueRegistry on-chain.
 */
export async function bufferPlay(
  redis: Redis,
  venueId: string,
  tokenId: string,
  duration: number
): Promise<number> {
  const entry: BufferedPlay = { tokenId, duration, playedAt: Date.now() };
  return redis.rpush(VENUE_KEYS.playBatch(venueId), JSON.stringify(entry));
}

/**
 * Flush the play buffer and return all buffered plays.
 */
export async function flushPlayBatch(
  redis: Redis,
  venueId: string
): Promise<BufferedPlay[]> {
  const raw = await redis.lrange(VENUE_KEYS.playBatch(venueId), 0, -1);
  if (raw.length === 0) return [];

  // Clear the buffer
  await redis.del(VENUE_KEYS.playBatch(venueId));

  return raw.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item);
}

// ============================================================================
// MINING STATS
// ============================================================================

export interface MiningStats {
  blocksMined: number;
  hashrate: number;      // plays per hour
  combo: number;         // consecutive hours multiplier
  lastBlockAt: number;
  totalToursMined: number;
}

const BASE_REWARD = 1; // Base TOURS per song block

export function getComboMultiplier(consecutiveHours: number): number {
  if (consecutiveHours >= 8) return 3;
  if (consecutiveHours >= 4) return 2;
  if (consecutiveHours >= 2) return 1.5;
  return 1;
}

export async function getMiningStats(
  redis: Redis,
  venueId: string
): Promise<MiningStats> {
  const data = await redis.get<string>(VENUE_KEYS.mining(venueId));
  if (!data) {
    return { blocksMined: 0, hashrate: 0, combo: 0, lastBlockAt: 0, totalToursMined: 0 };
  }
  return typeof data === 'string' ? JSON.parse(data) : data as unknown as MiningStats;
}

export async function updateMiningStats(
  redis: Redis,
  venueId: string,
  stats: MiningStats
): Promise<void> {
  await redis.set(VENUE_KEYS.mining(venueId), JSON.stringify(stats));
  // Update leaderboard (sorted set by total blocks mined)
  await redis.zadd(VENUE_KEYS.miningLeaderboard, { score: stats.blocksMined, member: venueId });
}

/**
 * Record a mined block (song played to completion).
 * Returns TOURS earned for this block.
 */
export async function recordMinedBlock(
  redis: Redis,
  venueId: string
): Promise<{ toursEarned: number; stats: MiningStats }> {
  const stats = await getMiningStats(redis, venueId);
  const now = Date.now();

  // Check combo: reset if gap > 10 minutes
  const gapMs = now - stats.lastBlockAt;
  if (gapMs > 10 * 60 * 1000 && stats.lastBlockAt > 0) {
    stats.combo = 0;
  }

  // Increment combo hours (approximate)
  const hoursSinceReset = stats.combo === 0 ? 0 : gapMs / (60 * 60 * 1000);
  stats.combo = stats.combo + (hoursSinceReset > 0 ? hoursSinceReset : 0);

  const multiplier = getComboMultiplier(stats.combo);
  const toursEarned = BASE_REWARD * multiplier;

  stats.blocksMined++;
  stats.lastBlockAt = now;
  stats.totalToursMined += toursEarned;

  // Calculate hashrate (plays in last hour)
  stats.hashrate = Math.round(stats.blocksMined / Math.max(1, (now - stats.lastBlockAt) / (60 * 60 * 1000)));

  await updateMiningStats(redis, venueId, stats);

  return { toursEarned, stats };
}
