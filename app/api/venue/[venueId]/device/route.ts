import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import {
  getVenue,
  verifyApiKey,
  getVenuePlaybackState,
  setVenuePlaybackState,
  popNextFromQueue,
  pickRandomClearedSong,
  addToVenueHistory,
  bufferPlay,
  getMiningStats,
  recordMinedBlock,
  VENUE_KEYS,
} from '@/lib/venue';
import { broadcast } from '@/lib/sse-broadcaster';

/**
 * Device API — REST endpoints for embedded hardware (ESP32, Raspberry Pi, etc.)
 *
 * GET  /api/venue/[venueId]/device?key=X          — Current state + mining stats
 * GET  /api/venue/[venueId]/device/next?key=X     — Next song URL + metadata
 * POST /api/venue/[venueId]/device?key=X          — Actions: play, pause, skip, song_ended
 *
 * Designed for low bandwidth: minimal JSON, direct audio URLs.
 * No SSE — devices poll via periodic GET.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('key') || '';
  const endpoint = searchParams.get('endpoint') || 'state'; // 'state' or 'next'

  if (!apiKey) {
    return json({ error: 'key required' }, 401);
  }

  const valid = await verifyApiKey(redis, venueId, apiKey);
  if (!valid) {
    return json({ error: 'invalid key' }, 403);
  }

  const venue = await getVenue(redis, venueId);
  if (!venue || !venue.isActive) {
    return json({ error: 'venue inactive' }, 404);
  }

  if (endpoint === 'next') {
    return handleGetNext(venueId);
  }

  // Default: return current state + mining stats
  const state = await getVenuePlaybackState(redis, venueId);
  const mining = await getMiningStats(redis, venueId);

  // Get leaderboard rank
  const rank = await redis.zrevrank(VENUE_KEYS.miningLeaderboard, venueId);

  // Try to read on-chain TOURS earned from VenueRegistry
  let onChainTours: number | null = null;
  const VENUE_REGISTRY = process.env.NEXT_PUBLIC_VENUE_REGISTRY;
  if (VENUE_REGISTRY && venue.ownerAddress) {
    try {
      const { JsonRpcProvider, Contract } = await import('ethers');
      const provider = new JsonRpcProvider(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz');
      const registry = new Contract(VENUE_REGISTRY, [
        'function getVenueIdByOwner(address) view returns (uint256)',
        'function venues(uint256) view returns (address,string,uint256,uint256,bool,uint256,uint256,uint256)',
      ], provider);
      const onChainId = await registry.getVenueIdByOwner(venue.ownerAddress);
      if (onChainId > 0n) {
        const v = await registry.venues(onChainId);
        onChainTours = Number(v[7]) / 1e18; // totalToursEarned (index 7)
      }
    } catch {}
  }

  return json({
    venue: venue.name,
    nowPlaying: state.currentSong ? {
      id: state.currentSong.tokenId,
      name: state.currentSong.name,
      artist: state.currentSong.artist,
      art: state.currentSong.imageUrl,
      audio: state.currentSong.audioUrl,
      duration: state.currentSong.duration,
      elapsed: Math.floor((Date.now() - state.currentSong.startedAt) / 1000),
    } : null,
    playing: state.isPlaying,
    today: state.songsPlayedToday,
    total: state.totalSongsPlayed,
    mining: {
      blocks: mining.blocksMined,
      hashrate: mining.hashrate,
      combo: Math.round(mining.combo * 10) / 10,
      tours: onChainTours ?? Math.round(mining.totalToursMined * 100) / 100,
      toursOnChain: onChainTours !== null,
      rank: rank !== null ? rank + 1 : null,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('key') || '';

  if (!apiKey) {
    return json({ error: 'key required' }, 401);
  }

  const valid = await verifyApiKey(redis, venueId, apiKey);
  if (!valid) {
    return json({ error: 'invalid key' }, 403);
  }

  const venue = await getVenue(redis, venueId);
  if (!venue || !venue.isActive) {
    return json({ error: 'venue inactive' }, 404);
  }

  let body: { action: string; data?: any };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const state = await getVenuePlaybackState(redis, venueId);

  switch (body.action) {
    case 'play': {
      state.isPlaying = true;
      await setVenuePlaybackState(redis, venueId, state);
      broadcast(`venue:${venueId}`, 'state_update', { type: 'play', state });
      return json({ ok: true, playing: true });
    }

    case 'pause': {
      state.isPlaying = false;
      await setVenuePlaybackState(redis, venueId, state);
      broadcast(`venue:${venueId}`, 'state_update', { type: 'pause', state });
      return json({ ok: true, playing: false });
    }

    case 'skip': {
      if (state.currentSong) {
        state.currentSong = null;
      }
      await setVenuePlaybackState(redis, venueId, state);
      broadcast(`venue:${venueId}`, 'state_update', { type: 'skipped', state });
      return json({ ok: true, skipped: true });
    }

    case 'song_ended': {
      if (!state.currentSong) {
        return json({ ok: true, mined: false });
      }

      const duration = body.data?.duration ||
        Math.floor((Date.now() - state.currentSong.startedAt) / 1000);

      // Buffer play for batch on-chain submission
      await bufferPlay(redis, venueId, state.currentSong.tokenId, duration);

      // Record mining block
      const { toursEarned, stats: miningStats } = await recordMinedBlock(redis, venueId);

      // Add to history
      await addToVenueHistory(redis, venueId, {
        tokenId: state.currentSong.tokenId,
        name: state.currentSong.name,
        artist: state.currentSong.artist,
        imageUrl: state.currentSong.imageUrl,
        playedAt: state.currentSong.startedAt,
        duration,
      });

      state.currentSong = null;
      state.totalSongsPlayed++;
      state.songsPlayedToday++;
      await setVenuePlaybackState(redis, venueId, state);

      broadcast(`venue:${venueId}`, 'state_update', { type: 'song_ended', state });

      return json({
        ok: true,
        mined: true,
        block: miningStats.blocksMined,
        tours: toursEarned,
        combo: Math.round(miningStats.combo * 10) / 10,
      });
    }

    default:
      return json({ error: `unknown action: ${body.action}` }, 400);
  }
}

/**
 * Get next song URL + metadata (for device pre-fetch).
 */
async function handleGetNext(venueId: string) {
  let next = await popNextFromQueue(redis, venueId);

  if (!next) {
    const random = await pickRandomClearedSong(redis);
    if (!random) {
      return json({ error: 'no songs available' }, 404);
    }
    next = {
      tokenId: random.tokenId,
      name: random.name,
      artist: random.artist,
      artistAddress: '',
      audioUrl: random.audioUrl,
      imageUrl: random.imageUrl,
      duration: random.duration || 600,
      startedAt: 0,
    };
  }

  return json({
    id: next.tokenId,
    name: next.name,
    artist: next.artist,
    art: next.imageUrl,
    audio: next.audioUrl,
    duration: next.duration,
  });
}

function json(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
