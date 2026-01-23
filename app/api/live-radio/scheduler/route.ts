import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

/**
 * Live Radio Scheduler
 *
 * Called by cron job every 30-60 seconds to orchestrate playback.
 * OPTIMIZED for Redis usage (target: <500k commands/month)
 *
 * 1. Check if current song has ended
 * 2. Play voice note between songs (if any pending)
 * 3. Play next queued song OR random song
 *
 * Playback Order:
 * Song → Voice Note → Song → Voice Note → ...
 *
 * Redis Optimization Strategy:
 * - Use in-memory cache for state to avoid repeated reads
 * - Early exit if song/voice note still has time remaining
 * - Batch Redis operations where possible
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// In-memory cache to reduce Redis reads
let cachedState: { data: RadioState | null; timestamp: number } = { data: null, timestamp: 0 };
let cachedPhase: { data: string; timestamp: number } = { data: 'song', timestamp: 0 };
const CACHE_TTL_MS = 10000; // 10 second cache (scheduler runs every 30-60s anyway)

const RADIO_STATE_KEY = 'live-radio:state';
const RADIO_QUEUE_KEY = 'live-radio:queue';
const VOICE_NOTES_KEY = 'live-radio:voice-notes';
const SONG_POOL_KEY = 'live-radio:song-pool';
const SCHEDULER_LOCK_KEY = 'live-radio:scheduler-lock';
const PLAYBACK_PHASE_KEY = 'live-radio:playback-phase'; // 'song' | 'voice_note'
const PLAY_HISTORY_KEY = 'live-radio:play-history'; // Recent plays list

const KEEPER_SECRET = process.env.KEEPER_SECRET || '';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

interface RadioState {
  isLive: boolean;
  currentSong: {
    tokenId: string;
    name: string;
    artist: string;
    artistAddress: string;
    audioUrl: string;
    imageUrl: string;
    queuedBy: string;
    queuedByFid: number;
    startedAt: number;
    duration: number; // in seconds
    isRandom: boolean;
  } | null;
  currentVoiceNote: {
    id: string;
    submitter: string;
    username?: string;
    audioUrl: string;
    duration: number;
    message?: string;
    startedAt: number;
    isAd: boolean;
  } | null;
  listenerCount: number;
  lastUpdated: number;
  totalSongsPlayed: number;
  totalVoiceNotesPlayed: number;
}

interface QueuedSong {
  id: string;
  tokenId: string;
  name: string;
  artist: string;
  artistAddress: string;
  audioUrl: string;
  imageUrl: string;
  queuedBy: string;
  queuedByFid: number;
  queuedAt: number;
  paidAmount: string;
  duration?: number; // Song duration in seconds
}

interface VoiceNote {
  id: string;
  userAddress: string;
  userFid: number;
  username?: string;
  audioUrl: string;
  duration: number;
  message?: string;
  createdAt: number;
  played: boolean;
  isAd: boolean;
}

interface SongFromEnvio {
  tokenId: string;
  name: string;
  artist: string;
  audioUrl: string;
  imageUrl: string;
  artistFid: number;
  duration?: number; // May not be available from Envio, will default to 600s (client reports actual end)
}

// Fetch songs from Envio for random selection (only Music NFTs with audio)
async function fetchSongPool(): Promise<SongFromEnvio[]> {
  try {
    // Only fetch NFTs that have fullAudioUrl (music NFTs, not art NFTs)
    const query = `
      query GetMusicNFTs {
        MusicNFT(where: {isBurned: {_eq: false}, fullAudioUrl: {_is_null: false}}, limit: 100) {
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

    // Map fullAudioUrl to audioUrl and filter out any without valid audio
    return songs
      .filter((song: any) => song.fullAudioUrl && song.fullAudioUrl.length > 0)
      .map((song: any) => ({
        ...song,
        audioUrl: song.fullAudioUrl,
      }));
  } catch (error) {
    console.error('[RadioScheduler] Failed to fetch song pool:', error);
    return [];
  }
}

// Select a random song from the pool
async function selectRandomSong(): Promise<QueuedSong | null> {
  const songs = await fetchSongPool();
  if (songs.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * songs.length);
  const song = songs[randomIndex];

  return {
    id: `random-${song.tokenId}-${Date.now()}`,
    tokenId: song.tokenId,
    name: song.name || `Song #${song.tokenId}`,
    artist: song.artist || 'Unknown Artist',
    artistAddress: song.artist,
    audioUrl: song.audioUrl,
    imageUrl: song.imageUrl || '',
    queuedBy: 'radio',
    queuedByFid: 0,
    queuedAt: Date.now(),
    paidAmount: '0',
    duration: song.duration || 600, // Use metadata duration or 10 min fallback (client reports actual end)
  };
}

// Get next voice note to play
async function getNextVoiceNote(): Promise<VoiceNote | null> {
  const noteJson = await redis.lpop(VOICE_NOTES_KEY);
  if (!noteJson) return null;
  return typeof noteJson === 'string' ? JSON.parse(noteJson) as VoiceNote : noteJson as VoiceNote;
}

// Get next queued song
async function getNextQueuedSong(): Promise<QueuedSong | null> {
  const songJson = await redis.lpop(RADIO_QUEUE_KEY);
  if (!songJson) return null;
  return typeof songJson === 'string' ? JSON.parse(songJson) as QueuedSong : songJson as QueuedSong;
}

export async function POST(req: NextRequest) {
  try {
    // Verify keeper secret
    const { secret } = await req.json();
    if (secret !== KEEPER_SECRET && KEEPER_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();

    // OPTIMIZATION: Check cached state first to see if we need to do anything
    // This avoids hitting Redis if we know the song is still playing
    if (cachedState.data && (now - cachedState.timestamp) < CACHE_TTL_MS) {
      const state = cachedState.data;
      if (state.isLive && state.currentSong) {
        const songEndTime = state.currentSong.startedAt + (state.currentSong.duration * 1000);
        const remainingMs = songEndTime - now;
        // If song has more than 30 seconds left, skip Redis entirely
        if (remainingMs > 30000) {
          return NextResponse.json({
            success: true,
            message: 'Song still playing (cached)',
            song: state.currentSong.name,
            remainingMs,
            cached: true,
          });
        }
      }
      if (state.isLive && state.currentVoiceNote) {
        const vnEndTime = state.currentVoiceNote.startedAt + (state.currentVoiceNote.duration * 1000);
        const remainingMs = vnEndTime - now;
        if (remainingMs > 5000) {
          return NextResponse.json({
            success: true,
            message: 'Voice note still playing (cached)',
            remainingMs,
            cached: true,
          });
        }
      }
    }

    // Acquire lock to prevent concurrent scheduling (1 Redis command)
    const lockAcquired = await redis.set(SCHEDULER_LOCK_KEY, Date.now(), { nx: true, ex: 30 });
    if (!lockAcquired) {
      return NextResponse.json({ success: true, message: 'Scheduler already running' });
    }

    try {
      // Get current state (1 Redis command)
      let state = await redis.get<RadioState>(RADIO_STATE_KEY);

      // Update cache
      cachedState = { data: state, timestamp: now };

      if (!state || !state.isLive) {
        await redis.del(SCHEDULER_LOCK_KEY);
        return NextResponse.json({ success: true, message: 'Radio not live' });
      }

      let action = 'none';
      let details: any = {};

      // Get current playback phase (1 Redis command - but check cache first)
      let phase: string;
      if (cachedPhase.timestamp > 0 && (now - cachedPhase.timestamp) < CACHE_TTL_MS) {
        phase = cachedPhase.data;
      } else {
        phase = await redis.get<string>(PLAYBACK_PHASE_KEY) || 'song';
        cachedPhase = { data: phase, timestamp: now };
      }

      // Check if voice note is playing and has ended
      if (state.currentVoiceNote) {
        const voiceNoteDuration = state.currentVoiceNote.duration || 5;
        const voiceNoteEndTime = state.currentVoiceNote.startedAt + (voiceNoteDuration * 1000);
        const remainingMs = voiceNoteEndTime - now;

        console.log('[RadioScheduler] Voice note check:', {
          id: state.currentVoiceNote.id,
          duration: voiceNoteDuration,
          startedAt: state.currentVoiceNote.startedAt,
          endTime: voiceNoteEndTime,
          now,
          remainingMs,
        });

        if (now >= voiceNoteEndTime) {
          // Voice note ended, switch to song phase
          console.log('[RadioScheduler] Voice note ended after', voiceNoteDuration, 's, switching to song');
          state.currentVoiceNote = null;
          state.totalVoiceNotesPlayed = (state.totalVoiceNotesPlayed || 0) + 1;
          phase = 'song';
          await redis.set(PLAYBACK_PHASE_KEY, 'song');
          cachedPhase = { data: 'song', timestamp: now };
        } else {
          // Voice note still playing
          return NextResponse.json({
            success: true,
            message: 'Voice note still playing',
            remainingMs: voiceNoteEndTime - now
          });
        }
      }

      // Check if current song has ended
      if (state.currentSong) {
        const songEndTime = state.currentSong.startedAt + (state.currentSong.duration * 1000);

        if (now >= songEndTime) {
          // Song ended
          console.log('[RadioScheduler] Song ended:', state.currentSong.name);
          state.currentSong = null;
          state.totalSongsPlayed = (state.totalSongsPlayed || 0) + 1;

          // Switch to voice note phase (play voice note between songs)
          phase = 'voice_note';
          await redis.set(PLAYBACK_PHASE_KEY, 'voice_note');
          cachedPhase = { data: 'voice_note', timestamp: now };
        } else {
          // Song still playing
          return NextResponse.json({
            success: true,
            message: 'Song still playing',
            song: state.currentSong.name,
            remainingMs: songEndTime - now
          });
        }
      }

      // No song or voice note playing - advance playback
      if (phase === 'voice_note') {
        // Try to play a voice note
        const voiceNote = await getNextVoiceNote();

        if (voiceNote) {
          // Ensure duration is valid (default to 5 seconds if missing/invalid)
          const validDuration = typeof voiceNote.duration === 'number' && voiceNote.duration > 0
            ? voiceNote.duration
            : 5;

          state.currentVoiceNote = {
            id: voiceNote.id,
            submitter: voiceNote.userAddress,
            username: voiceNote.username,
            audioUrl: voiceNote.audioUrl,
            duration: validDuration,
            message: voiceNote.message,
            startedAt: now,
            isAd: voiceNote.isAd,
          };
          action = 'voice_note_started';
          details = { voiceNote: state.currentVoiceNote };
          console.log('[RadioScheduler] Playing voice note from:', voiceNote.username || voiceNote.userAddress, '| Duration:', validDuration, 's');
          console.log('[RadioScheduler] Voice note audioUrl:', voiceNote.audioUrl);

          // Save state and return immediately - let next scheduler call handle playback check
          state.lastUpdated = now;
          await redis.set(RADIO_STATE_KEY, state);
          cachedState = { data: state, timestamp: now };
          await redis.del(SCHEDULER_LOCK_KEY);

          return NextResponse.json({
            success: true,
            action,
            details,
            state: {
              isLive: state.isLive,
              currentSong: null,
              currentVoiceNote: state.currentVoiceNote.id,
              phase: 'voice_note',
              durationMs: validDuration * 1000,
            },
          });
        } else {
          // No voice notes, skip to song phase
          phase = 'song';
          await redis.set(PLAYBACK_PHASE_KEY, 'song');
          cachedPhase = { data: 'song', timestamp: now };
        }
      }

      if (phase === 'song' && !state.currentSong && !state.currentVoiceNote) {
        // Try queued song first, then random
        let nextSong = await getNextQueuedSong();
        let isRandom = false;

        if (!nextSong) {
          // No queued songs, select random
          nextSong = await selectRandomSong();
          isRandom = true;
        }

        if (nextSong) {
          // Use song duration from queue/metadata, or default to 10 minutes as fallback
          // Client will report actual song end via song_ended API, so this is just a safety net
          const duration = nextSong.duration || 600; // 10 minutes max fallback
          console.log('[RadioScheduler] Song duration:', duration, 'seconds for:', nextSong.name);

          state.currentSong = {
            tokenId: nextSong.tokenId,
            name: nextSong.name,
            artist: nextSong.artist,
            artistAddress: nextSong.artistAddress || nextSong.artist,
            audioUrl: nextSong.audioUrl,
            imageUrl: nextSong.imageUrl,
            queuedBy: nextSong.queuedBy,
            queuedByFid: nextSong.queuedByFid,
            startedAt: now,
            duration,
            isRandom,
          };
          action = 'song_started';
          details = { song: state.currentSong, isRandom };
          console.log('[RadioScheduler] Now playing:', nextSong.name, isRandom ? '(random)' : '(queued)');

          // Log play to history for tracking and leaderboard
          const playEntry = {
            tokenId: nextSong.tokenId,
            name: nextSong.name,
            artist: nextSong.artist,
            imageUrl: nextSong.imageUrl,
            queuedBy: nextSong.queuedBy,
            queuedByFid: nextSong.queuedByFid,
            playedAt: now,
            isRandom,
          };
          // Add to front of list, keep last 100 plays
          await redis.lpush(PLAY_HISTORY_KEY, JSON.stringify(playEntry));
          await redis.ltrim(PLAY_HISTORY_KEY, 0, 99);
        } else {
          action = 'no_songs_available';
        }
      }

      // Update state
      state.lastUpdated = now;
      await redis.set(RADIO_STATE_KEY, state);
      cachedState = { data: state, timestamp: now };

      return NextResponse.json({
        success: true,
        action,
        details,
        state: {
          isLive: state.isLive,
          currentSong: state.currentSong?.name || null,
          currentVoiceNote: (state as RadioState).currentVoiceNote?.id ?? null,
          phase,
          totalSongsPlayed: state.totalSongsPlayed,
          totalVoiceNotesPlayed: state.totalVoiceNotesPlayed,
        },
      });

    } finally {
      // Release lock
      await redis.del(SCHEDULER_LOCK_KEY);
    }

  } catch (error: any) {
    console.error('[RadioScheduler] Error:', error);
    // Release lock on error
    await redis.del(SCHEDULER_LOCK_KEY);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// GET - Check scheduler status
export async function GET(req: NextRequest) {
  try {
    const state = await redis.get<RadioState>(RADIO_STATE_KEY);
    const phase = await redis.get<string>(PLAYBACK_PHASE_KEY) || 'song';
    const queueLength = await redis.llen(RADIO_QUEUE_KEY);
    const voiceNotesLength = await redis.llen(VOICE_NOTES_KEY);

    const now = Date.now();
    let songTimeRemaining = 0;
    let voiceNoteTimeRemaining = 0;

    if (state?.currentSong) {
      const endTime = state.currentSong.startedAt + (state.currentSong.duration * 1000);
      songTimeRemaining = Math.max(0, endTime - now);
    }

    if (state?.currentVoiceNote) {
      const endTime = state.currentVoiceNote.startedAt + (state.currentVoiceNote.duration * 1000);
      voiceNoteTimeRemaining = Math.max(0, endTime - now);
    }

    return NextResponse.json({
      success: true,
      status: {
        isLive: state?.isLive || false,
        phase,
        currentSong: state?.currentSong ? {
          name: state.currentSong.name,
          artist: state.currentSong.artist,
          isRandom: state.currentSong.isRandom,
          timeRemainingMs: songTimeRemaining,
          timeRemainingSeconds: Math.ceil(songTimeRemaining / 1000),
        } : null,
        currentVoiceNote: state?.currentVoiceNote ? {
          id: state.currentVoiceNote.id,
          username: state.currentVoiceNote.username,
          audioUrl: state.currentVoiceNote.audioUrl,
          message: state.currentVoiceNote.message,
          duration: state.currentVoiceNote.duration,
          isAd: state.currentVoiceNote.isAd,
          timeRemainingMs: voiceNoteTimeRemaining,
          timeRemainingSeconds: Math.ceil(voiceNoteTimeRemaining / 1000),
        } : null,
        queueLength,
        voiceNotesLength,
        totalSongsPlayed: state?.totalSongsPlayed || 0,
        totalVoiceNotesPlayed: state?.totalVoiceNotesPlayed || 0,
        listenerCount: state?.listenerCount || 0,
      },
    });
  } catch (error: any) {
    console.error('[RadioScheduler] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
