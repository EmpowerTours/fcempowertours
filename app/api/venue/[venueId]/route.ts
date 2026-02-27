import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { broadcast } from '@/lib/sse-broadcaster';
import {
  getVenue,
  getVenuePlaybackState,
  setVenuePlaybackState,
  getVenueQueue,
  addToVenueQueue,
  popNextFromQueue,
  getVenueHistory,
  addToVenueHistory,
  verifyApiKey,
  pickRandomClearedSong,
  type VenueSong,
  type VenuePlaybackState,
} from '@/lib/venue';

/**
 * GET  /api/venue/[venueId] — Current playback state, queue, history
 * POST /api/venue/[venueId] — Control playback (play, skip, pause, queue_song, song_ended)
 */

const PLAY_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_PLAY_ORACLE;
const MUSIC_SUBSCRIPTION_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION;
const ORACLE_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

async function authenticateVenueRequest(
  req: NextRequest,
  venueId: string
): Promise<{ valid: boolean; error?: string }> {
  // Check X-Venue-Key header
  const apiKey = req.headers.get('x-venue-key');
  if (apiKey) {
    const valid = await verifyApiKey(redis, venueId, apiKey);
    if (valid) return { valid: true };
    return { valid: false, error: 'Invalid API key' };
  }

  // Check query param ?key=X (for SSE and simple requests)
  const url = new URL(req.url);
  const queryKey = url.searchParams.get('key');
  if (queryKey) {
    const valid = await verifyApiKey(redis, venueId, queryKey);
    if (valid) return { valid: true };
    return { valid: false, error: 'Invalid API key' };
  }

  return { valid: false, error: 'Authentication required. Provide X-Venue-Key header.' };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const { venueId } = await params;

    // Auth check
    const auth = await authenticateVenueRequest(req, venueId);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const venue = await getVenue(redis, venueId);
    if (!venue) {
      return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
    }

    const [state, queue, history] = await Promise.all([
      getVenuePlaybackState(redis, venueId),
      getVenueQueue(redis, venueId),
      getVenueHistory(redis, venueId, 10),
    ]);

    return NextResponse.json({
      success: true,
      venue: {
        venueId: venue.venueId,
        name: venue.name,
        isActive: venue.isActive,
        settings: venue.settings,
      },
      state,
      queue,
      history,
    });
  } catch (error: any) {
    console.error('[VenueAPI] GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const { venueId } = await params;

    // Auth check
    const auth = await authenticateVenueRequest(req, venueId);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const venue = await getVenue(redis, venueId);
    if (!venue) {
      return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
    }

    const body = await req.json();
    const { action } = body;

    // ---- PLAY ----
    if (action === 'play') {
      const state = await getVenuePlaybackState(redis, venueId);

      // Resume if paused with a current song
      if (state.currentSong && !state.isPlaying) {
        state.isPlaying = true;
        await setVenuePlaybackState(redis, venueId, state);
        broadcastVenueUpdate(venueId, 'state_update', { type: 'resumed', state });
        return NextResponse.json({ success: true, message: 'Playback resumed', state });
      }

      // Pick a random cleared song if nothing is playing
      if (!state.currentSong) {
        const song = await pickRandomClearedSong(redis);
        if (!song) {
          return NextResponse.json(
            { success: false, error: 'No cleared songs available in catalog' },
            { status: 404 }
          );
        }

        state.currentSong = {
          tokenId: song.tokenId,
          name: song.name,
          artist: song.artist,
          artistAddress: song.artist,
          audioUrl: song.audioUrl,
          imageUrl: song.imageUrl,
          duration: song.duration || 600,
          startedAt: Date.now(),
        };
        state.isPlaying = true;
        state.totalSongsPlayed++;
        state.songsPlayedToday++;

        await setVenuePlaybackState(redis, venueId, state);
        broadcastVenueUpdate(venueId, 'state_update', { type: 'song_started', state });

        return NextResponse.json({ success: true, message: `Now playing: ${song.name}`, state });
      }

      return NextResponse.json({ success: true, message: 'Already playing', state });
    }

    // ---- PAUSE ----
    if (action === 'pause') {
      const state = await getVenuePlaybackState(redis, venueId);
      state.isPlaying = false;
      await setVenuePlaybackState(redis, venueId, state);
      broadcastVenueUpdate(venueId, 'state_update', { type: 'paused', state });
      return NextResponse.json({ success: true, message: 'Playback paused', state });
    }

    // ---- SKIP ----
    if (action === 'skip') {
      const state = await getVenuePlaybackState(redis, venueId);
      const currentTokenId = state.currentSong?.tokenId;

      // Record play for the skipped song if it played for at least 30s
      if (state.currentSong) {
        const playDuration = Math.floor((Date.now() - state.currentSong.startedAt) / 1000);
        if (playDuration >= 30) {
          recordVenuePlay(state.currentSong.tokenId, playDuration).catch(err =>
            console.error('[VenueAPI] Background recordPlay error:', err.message)
          );
        }

        await addToVenueHistory(redis, venueId, {
          tokenId: state.currentSong.tokenId,
          name: state.currentSong.name,
          artist: state.currentSong.artist,
          imageUrl: state.currentSong.imageUrl,
          playedAt: state.currentSong.startedAt,
          duration: playDuration,
        });
      }

      // Try queue first, then random
      let nextSong = await popNextFromQueue(redis, venueId);
      if (!nextSong) {
        const random = await pickRandomClearedSong(redis, currentTokenId);
        if (random) {
          nextSong = {
            tokenId: random.tokenId,
            name: random.name,
            artist: random.artist,
            artistAddress: random.artist,
            audioUrl: random.audioUrl,
            imageUrl: random.imageUrl,
            duration: random.duration || 600,
            startedAt: Date.now(),
          };
        }
      } else {
        nextSong.startedAt = Date.now();
      }

      state.currentSong = nextSong;
      state.isPlaying = !!nextSong;
      if (nextSong) {
        state.totalSongsPlayed++;
        state.songsPlayedToday++;
      }

      await setVenuePlaybackState(redis, venueId, state);
      broadcastVenueUpdate(venueId, 'state_update', { type: 'skipped', state });

      return NextResponse.json({
        success: true,
        message: nextSong ? `Now playing: ${nextSong.name}` : 'No more songs available',
        state,
      });
    }

    // ---- QUEUE SONG ----
    if (action === 'queue_song') {
      const { tokenId, name, artist, artistAddress, audioUrl, imageUrl, duration } = body;

      if (!tokenId || !audioUrl) {
        return NextResponse.json(
          { success: false, error: 'tokenId and audioUrl required' },
          { status: 400 }
        );
      }

      const song: VenueSong = {
        tokenId,
        name: name || `Song #${tokenId}`,
        artist: artist || 'Unknown Artist',
        artistAddress: artistAddress || '',
        audioUrl,
        imageUrl: imageUrl || '',
        duration: typeof duration === 'number' && duration > 0 ? Math.round(duration) : 600,
        startedAt: 0, // Will be set when song starts playing
      };

      const queueLength = await addToVenueQueue(redis, venueId, song);
      const queue = await getVenueQueue(redis, venueId);
      broadcastVenueUpdate(venueId, 'queue_update', { type: 'song_queued', queue });

      return NextResponse.json({
        success: true,
        message: `Added to queue (position ${queueLength})`,
        song,
      });
    }

    // ---- SONG ENDED ----
    if (action === 'song_ended') {
      const { tokenId } = body;
      const state = await getVenuePlaybackState(redis, venueId);

      // Verify this is the current song
      if (!state.currentSong || state.currentSong.tokenId !== tokenId) {
        return NextResponse.json({ success: true, message: 'Song already changed' });
      }

      const playDuration = Math.floor((Date.now() - state.currentSong.startedAt) / 1000);

      // Record play on-chain (non-blocking)
      recordVenuePlay(state.currentSong.tokenId, playDuration).catch(err =>
        console.error('[VenueAPI] Background recordPlay error:', err.message)
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

      // Advance to next song
      let nextSong = await popNextFromQueue(redis, venueId);
      if (!nextSong && venue.settings.autoplay) {
        const random = await pickRandomClearedSong(redis, tokenId);
        if (random) {
          nextSong = {
            tokenId: random.tokenId,
            name: random.name,
            artist: random.artist,
            artistAddress: random.artist,
            audioUrl: random.audioUrl,
            imageUrl: random.imageUrl,
            duration: random.duration || 600,
            startedAt: Date.now(),
          };
        }
      }

      if (nextSong) {
        nextSong.startedAt = Date.now();
        state.currentSong = nextSong;
        state.totalSongsPlayed++;
        state.songsPlayedToday++;
      } else {
        state.currentSong = null;
        state.isPlaying = false;
      }

      await setVenuePlaybackState(redis, venueId, state);
      broadcastVenueUpdate(venueId, 'state_update', {
        type: nextSong ? 'song_started' : 'playback_ended',
        state,
      });

      return NextResponse.json({
        success: true,
        message: nextSong ? `Now playing: ${nextSong.name}` : 'Playback ended',
        state,
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[VenueAPI] POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function broadcastVenueUpdate(venueId: string, eventType: string, data: Record<string, unknown>) {
  broadcast(`venue:${venueId}`, eventType, data);
}

async function recordVenuePlay(tokenId: string, duration: number) {
  if (!PLAY_ORACLE_ADDRESS || !ORACLE_PRIVATE_KEY) {
    console.log('[VenueAPI] Skipping recordPlay: missing PLAY_ORACLE or DEPLOYER_PRIVATE_KEY');
    return;
  }

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
    const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(ORACLE_PRIVATE_KEY, provider);

    const oracleAbi = [
      'function recordPlay(address user, uint256 masterTokenId, uint256 duration) external',
    ];
    const oracle = new Contract(PLAY_ORACLE_ADDRESS, oracleAbi, wallet);

    // For venue plays, record under a venue pseudo-address
    // This tracks venue plays separately from individual listener plays
    const tx = await oracle.recordPlay(
      wallet.address, // Oracle wallet as venue proxy
      tokenId,
      Math.min(duration, 600)
    );
    await tx.wait();
    console.log(`[VenueAPI] Recorded venue play for tokenId=${tokenId} tx=${tx.hash.slice(0, 10)}`);
  } catch (err: any) {
    console.error('[VenueAPI] recordVenuePlay error:', err.message?.slice(0, 120));
  }
}
