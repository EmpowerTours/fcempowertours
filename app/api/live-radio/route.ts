import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

/**
 * Live Radio API
 *
 * A simple jukebox + podcast style radio where:
 * - Users pay WMON to queue songs
 * - Users can record 3-5 second voice shoutouts during breaks
 * - All listeners hear the same stream
 *
 * World Cup 2026 Feature: Tourism + Cultural Experience
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const RADIO_STATE_KEY = 'live-radio:state';
const RADIO_QUEUE_KEY = 'live-radio:queue';
const VOICE_NOTES_KEY = 'live-radio:voice-notes';
const LISTENER_STATS_KEY = 'live-radio:listener-stats';
const ACTIVE_LISTENERS_KEY = 'live-radio:active-listeners'; // Legacy - individual keys
const ACTIVE_LISTENERS_ZSET = 'live-radio:active-listeners-zset'; // ZSET for efficient counting
const DAILY_FIRST_LISTENER_KEY = 'live-radio:first-listener';
const PLAY_HISTORY_KEY = 'live-radio:play-history'; // Recent plays list
const PLAYBACK_PHASE_KEY = 'live-radio:playback-phase'; // 'song' | 'voice_note'
const QUEUE_PRICE_WMON = 1; // 1 WMON to queue a song
const VOICE_NOTE_PRICE_WMON = 0.5; // 0.5 WMON for a voice shoutout
const VOICE_AD_PRICE_WMON = 2; // 2 WMON for 30-second ad
const MAX_VOICE_NOTE_SECONDS = 5;
const MAX_VOICE_AD_SECONDS = 30;
const LISTENER_HEARTBEAT_EXPIRY = 60; // Seconds before listener is considered inactive
const LISTEN_REWARD_TOURS = 0.1; // 0.1 TOURS per song listened
const FIRST_LISTENER_BONUS_TOURS = 5; // 5 TOURS for first listener of day
const STREAK_BONUS_TOURS = 10; // 10 TOURS for 7-day streak

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
    duration: number;
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
  duration?: number; // Song duration in seconds (from audio metadata)
}

interface VoiceNote {
  id: string;
  userAddress: string;
  userFid: number;
  username?: string;
  audioUrl: string; // IPFS URL
  duration: number;
  message?: string;
  createdAt: number;
  played: boolean;
  isAd: boolean;
}

interface ListenerStats {
  totalSongsListened: number;
  totalRewardsEarned: number;
  pendingRewards: number;
  lastListenDay: number; // Day number
  currentStreak: number;
  longestStreak: number;
  voiceNotesSubmitted: number;
  voiceNotesPlayed: number;
  firstListenerBonuses: number;
  lastRewardedSongId?: string; // Track last song rewarded to prevent duplicate rewards
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

// GET - Get current radio state
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    // Debug: Test Envio connection and fetch available songs
    if (action === 'debug-songs') {
      try {
        const query = `
          query GetMusicNFTs {
            MusicNFT(where: {isBurned: {_eq: false}}, limit: 50) {
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
        const rawSongs = data.data?.MusicNFT || [];

        // Map fullAudioUrl to audioUrl for compatibility
        const songs = rawSongs.map((song: any) => ({
          ...song,
          audioUrl: song.fullAudioUrl || song.audioUrl,
        }));

        return NextResponse.json({
          success: true,
          envioEndpoint: ENVIO_ENDPOINT,
          songsCount: songs.length,
          songs: songs.slice(0, 10), // Return first 10 for debugging
          rawResponse: data.errors ? { errors: data.errors } : undefined,
        });
      } catch (error: any) {
        return NextResponse.json({
          success: false,
          envioEndpoint: ENVIO_ENDPOINT,
          error: error.message,
        });
      }
    }

    // Get queue
    if (action === 'queue') {
      const queue = await redis.lrange(RADIO_QUEUE_KEY, 0, 20);
      return NextResponse.json({
        success: true,
        queue: queue.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item),
      });
    }

    // Get voice notes (pending)
    if (action === 'voice-notes') {
      const notes = await redis.lrange(VOICE_NOTES_KEY, 0, 10);
      return NextResponse.json({
        success: true,
        voiceNotes: notes.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item),
      });
    }

    // Get listener stats
    if (action === 'listener-stats') {
      const userAddress = searchParams.get('address');
      if (!userAddress) {
        return NextResponse.json({ success: false, error: 'Address required' }, { status: 400 });
      }

      const stats = await redis.hget<ListenerStats>(LISTENER_STATS_KEY, userAddress.toLowerCase());
      return NextResponse.json({
        success: true,
        stats: stats || {
          totalSongsListened: 0,
          totalRewardsEarned: 0,
          pendingRewards: 0,
          lastListenDay: 0,
          currentStreak: 0,
          longestStreak: 0,
          voiceNotesSubmitted: 0,
          voiceNotesPlayed: 0,
          firstListenerBonuses: 0,
        },
      });
    }

    // Get leaderboard - top listeners by songs listened
    if (action === 'leaderboard') {
      try {
        // Get all listener stats from the hash
        const allStats = await redis.hgetall<Record<string, ListenerStats>>(LISTENER_STATS_KEY);

        if (!allStats || Object.keys(allStats).length === 0) {
          return NextResponse.json({
            success: true,
            leaderboard: [],
            totalListeners: 0,
          });
        }

        // Convert to array and sort by totalSongsListened
        const leaderboard = Object.entries(allStats)
          .map(([address, stats]) => ({
            address,
            totalSongsListened: stats.totalSongsListened || 0,
            totalRewardsEarned: stats.totalRewardsEarned || 0,
            currentStreak: stats.currentStreak || 0,
            longestStreak: stats.longestStreak || 0,
            voiceNotesSubmitted: stats.voiceNotesSubmitted || 0,
          }))
          .filter(entry => entry.totalSongsListened > 0)
          .sort((a, b) => b.totalSongsListened - a.totalSongsListened)
          .slice(0, 20); // Top 20

        return NextResponse.json({
          success: true,
          leaderboard,
          totalListeners: Object.keys(allStats).length,
        });
      } catch (error: any) {
        console.error('[LiveRadio] Leaderboard error:', error);
        return NextResponse.json({
          success: true,
          leaderboard: [],
          totalListeners: 0,
        });
      }
    }

    // Get recent play history
    if (action === 'play-history') {
      try {
        const limit = parseInt(searchParams.get('limit') || '20');
        const history = await redis.lrange(PLAY_HISTORY_KEY, 0, limit - 1);

        const plays = history.map((item: any) =>
          typeof item === 'string' ? JSON.parse(item) : item
        );

        return NextResponse.json({
          success: true,
          plays,
          count: plays.length,
        });
      } catch (error: any) {
        console.error('[LiveRadio] Play history error:', error);
        return NextResponse.json({
          success: true,
          plays: [],
          count: 0,
        });
      }
    }

    // Get current state
    const state = await redis.get<RadioState>(RADIO_STATE_KEY);

    return NextResponse.json({
      success: true,
      state: state || {
        isLive: false,
        currentSong: null,
        currentVoiceNote: null,
        listenerCount: 0,
        lastUpdated: Date.now(),
        totalSongsPlayed: 0,
        totalVoiceNotesPlayed: 0,
      },
      pricing: {
        queueSong: QUEUE_PRICE_WMON,
        voiceNote: VOICE_NOTE_PRICE_WMON,
        voiceAd: VOICE_AD_PRICE_WMON,
        maxVoiceNoteDuration: MAX_VOICE_NOTE_SECONDS,
        maxVoiceAdDuration: MAX_VOICE_AD_SECONDS,
      },
      rewards: {
        perSong: LISTEN_REWARD_TOURS,
        firstListener: FIRST_LISTENER_BONUS_TOURS,
        streak7Days: STREAK_BONUS_TOURS,
      },
    });
  } catch (error: any) {
    console.error('[LiveRadio] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST - Queue a song or submit a voice note
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userAddress, userFid } = body;

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'User address required' },
        { status: 400 }
      );
    }

    // Queue a song (requires WMON payment)
    if (action === 'queue_song') {
      const { tokenId, name, artist, artistAddress, audioUrl, imageUrl, txHash, duration } = body;

      if (!tokenId || !audioUrl) {
        return NextResponse.json(
          { success: false, error: 'Missing song details' },
          { status: 400 }
        );
      }

      if (!txHash) {
        return NextResponse.json(
          { success: false, error: `Queueing songs requires ${QUEUE_PRICE_WMON} WMON payment. Please submit with txHash.` },
          { status: 400 }
        );
      }

      // Use provided duration or default to 600s (10 min fallback - client reports actual end)
      const songDuration = typeof duration === 'number' && duration > 0 ? Math.round(duration) : 600;
      console.log('[LiveRadio] Queueing song with duration:', songDuration, 'seconds');

      const queuedSong: QueuedSong = {
        id: `${userAddress}-${tokenId}-${Date.now()}`,
        tokenId,
        name: name || `Song #${tokenId}`,
        artist: artist || 'Unknown Artist',
        artistAddress: artistAddress || artist || '',
        audioUrl,
        imageUrl: imageUrl || '',
        queuedBy: userAddress,
        queuedByFid: userFid || 0,
        queuedAt: Date.now(),
        paidAmount: `${QUEUE_PRICE_WMON}`,
        duration: songDuration,
      };

      await redis.rpush(RADIO_QUEUE_KEY, JSON.stringify(queuedSong));

      console.log('[LiveRadio] Song queued:', name, 'by', userAddress);

      return NextResponse.json({
        success: true,
        message: 'Song added to queue!',
        queuePosition: await redis.llen(RADIO_QUEUE_KEY),
        song: queuedSong,
      });
    }

    // Submit a voice note (requires WMON payment)
    if (action === 'voice_note') {
      const { audioUrl, duration, message, username, txHash } = body;

      if (!audioUrl) {
        return NextResponse.json(
          { success: false, error: 'Audio URL required' },
          { status: 400 }
        );
      }

      if (!txHash) {
        return NextResponse.json(
          { success: false, error: `Voice notes require ${VOICE_NOTE_PRICE_WMON} WMON payment. Please submit with txHash.` },
          { status: 400 }
        );
      }

      // Ensure duration is a valid number, default to MAX if not provided
      // This fixes issues where client state may not capture the exact recording time
      const validDuration = typeof duration === 'number' && duration > 0
        ? Math.min(duration, MAX_VOICE_NOTE_SECONDS)
        : MAX_VOICE_NOTE_SECONDS;

      console.log('[LiveRadio] Voice note duration:', { received: duration, using: validDuration });

      const voiceNote: VoiceNote = {
        id: `${userAddress}-${Date.now()}`,
        userAddress,
        userFid: userFid || 0,
        username,
        audioUrl,
        duration: validDuration,
        message,
        createdAt: Date.now(),
        played: false,
        isAd: false,
      };

      await redis.rpush(VOICE_NOTES_KEY, JSON.stringify(voiceNote));

      // Update listener stats
      const userKey = userAddress.toLowerCase();
      let stats = await redis.hget<ListenerStats>(LISTENER_STATS_KEY, userKey);
      if (stats) {
        stats.voiceNotesSubmitted++;
        await redis.hset(LISTENER_STATS_KEY, { [userKey]: stats });
      }

      console.log('[LiveRadio] Voice note submitted by', username || userAddress);

      return NextResponse.json({
        success: true,
        message: 'Voice note submitted! It will play during the next break.',
        voiceNote,
      });
    }

    // Submit a voice ad (30 seconds, requires higher WMON payment)
    if (action === 'voice_ad') {
      const { audioUrl, message, username, txHash } = body;

      if (!audioUrl) {
        return NextResponse.json(
          { success: false, error: 'Audio URL required' },
          { status: 400 }
        );
      }

      if (!txHash) {
        return NextResponse.json(
          { success: false, error: `Voice ads require ${VOICE_AD_PRICE_WMON} WMON payment. Please submit with txHash.` },
          { status: 400 }
        );
      }

      const voiceAd: VoiceNote = {
        id: `ad-${userAddress}-${Date.now()}`,
        userAddress,
        userFid: userFid || 0,
        username,
        audioUrl,
        duration: MAX_VOICE_AD_SECONDS,
        message,
        createdAt: Date.now(),
        played: false,
        isAd: true,
      };

      // Ads go to front of queue (after other ads)
      await redis.rpush(VOICE_NOTES_KEY, JSON.stringify(voiceAd));

      // Update listener stats
      const userKey = userAddress.toLowerCase();
      let stats = await redis.hget<ListenerStats>(LISTENER_STATS_KEY, userKey);
      if (stats) {
        stats.voiceNotesSubmitted++;
        await redis.hset(LISTENER_STATS_KEY, { [userKey]: stats });
      }

      console.log('[LiveRadio] Voice ad submitted by', username || userAddress);

      return NextResponse.json({
        success: true,
        message: 'Voice ad submitted! It will play during the next ad break.',
        voiceAd,
      });
    }

    // Start radio (admin only)
    if (action === 'start_radio') {
      const state: RadioState = {
        isLive: true,
        currentSong: null,
        currentVoiceNote: null,
        listenerCount: 0,
        lastUpdated: Date.now(),
        totalSongsPlayed: 0,
        totalVoiceNotesPlayed: 0,
      };
      await redis.set(RADIO_STATE_KEY, state);

      // Initialize playback phase
      await redis.set('live-radio:playback-phase', 'song');

      return NextResponse.json({
        success: true,
        message: 'Radio is now live! Call /api/live-radio/scheduler to start playback.',
        state,
      });
    }

    // Stop radio (admin only)
    if (action === 'stop_radio') {
      const state = await redis.get<RadioState>(RADIO_STATE_KEY);
      if (state) {
        state.isLive = false;
        state.currentSong = null;
        state.currentVoiceNote = null;
        state.lastUpdated = Date.now();
        await redis.set(RADIO_STATE_KEY, state);
      }

      return NextResponse.json({
        success: true,
        message: 'Radio stopped.',
      });
    }

    // Play next song (admin/automated)
    if (action === 'next_song') {
      // Pop next song from queue
      const nextSongJson = await redis.lpop(RADIO_QUEUE_KEY);
      if (!nextSongJson) {
        return NextResponse.json({
          success: false,
          error: 'Queue is empty',
        });
      }

      const nextSong: QueuedSong = typeof nextSongJson === 'string' ? JSON.parse(nextSongJson) : nextSongJson;

      const state = await redis.get<RadioState>(RADIO_STATE_KEY) || {
        isLive: true,
        currentSong: null,
        listenerCount: 0,
        lastUpdated: Date.now(),
      };

      state.currentSong = {
        ...nextSong,
        startedAt: Date.now(),
        duration: nextSong.duration || 600, // Use song duration or 10 min fallback
        isRandom: false, // Queued song, not random
      };
      state.lastUpdated = Date.now();

      await redis.set(RADIO_STATE_KEY, state);

      return NextResponse.json({
        success: true,
        message: 'Now playing',
        currentSong: state.currentSong,
      });
    }

    // Report song ended (client tells server when audio actually finishes)
    if (action === 'song_ended') {
      const { songId, tokenId } = body;

      const state = await redis.get<RadioState>(RADIO_STATE_KEY);
      if (!state) {
        return NextResponse.json({ success: false, error: 'Radio not active' });
      }

      // Verify this is the current song
      if (state.currentSong && state.currentSong.tokenId === tokenId) {
        console.log('[LiveRadio] Client reported song ended:', state.currentSong.name);

        // Clear current song - scheduler will pick next one
        state.currentSong = null;
        state.totalSongsPlayed = (state.totalSongsPlayed || 0) + 1;
        state.lastUpdated = Date.now();

        await redis.set(RADIO_STATE_KEY, state);

        // Switch to voice_note phase so scheduler checks for pending voice notes
        await redis.set(PLAYBACK_PHASE_KEY, 'voice_note');

        return NextResponse.json({
          success: true,
          message: 'Song marked as ended',
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Song already changed or not matching',
      });
    }

    // Heartbeat (listener tracking with rewards)
    if (action === 'heartbeat') {
      const { masterTokenId } = body;
      const userKey = userAddress.toLowerCase();
      const now = Date.now();
      const today = Math.floor(now / (24 * 60 * 60 * 1000)); // Day number

      // OPTIMIZED: Use ZSET instead of individual keys + KEYS scan
      // Add listener to ZSET with timestamp as score (1 Redis command)
      await redis.zadd(ACTIVE_LISTENERS_ZSET, { score: now, member: userKey });

      // Remove listeners older than LISTENER_HEARTBEAT_EXPIRY seconds (1 Redis command)
      const cutoffTime = now - (LISTENER_HEARTBEAT_EXPIRY * 1000);
      await redis.zremrangebyscore(ACTIVE_LISTENERS_ZSET, 0, cutoffTime);

      // Count active listeners efficiently with ZCARD (1 Redis command)
      const activeCount = await redis.zcard(ACTIVE_LISTENERS_ZSET);

      // Update radio state listener count
      const state = await redis.get<RadioState>(RADIO_STATE_KEY);
      if (state) {
        state.listenerCount = activeCount;
        state.lastUpdated = Date.now();
        await redis.set(RADIO_STATE_KEY, state);
      }

      // Get or create listener stats
      let stats = await redis.hget<ListenerStats>(LISTENER_STATS_KEY, userKey) || {
        totalSongsListened: 0,
        totalRewardsEarned: 0,
        pendingRewards: 0,
        lastListenDay: 0,
        currentStreak: 0,
        longestStreak: 0,
        voiceNotesSubmitted: 0,
        voiceNotesPlayed: 0,
        firstListenerBonuses: 0,
      };

      let rewardEarned = 0;
      let bonusType = '';

      // Check if a song is ACTIVELY playing (not expired)
      const isSongActive = state?.currentSong &&
        (state.currentSong.startedAt + (state.currentSong.duration * 1000)) > now;

      // If current song has expired, clear it from state
      if (state?.currentSong && !isSongActive) {
        console.log('[LiveRadio] Clearing expired currentSong:', state.currentSong.name);
        state.currentSong = null;
        state.lastUpdated = now;
        await redis.set(RADIO_STATE_KEY, state);
        // Switch to voice_note phase so scheduler checks for pending voice notes
        await redis.set(PLAYBACK_PHASE_KEY, 'voice_note');
      }

      // Only award rewards if a song is actually playing
      if (isSongActive) {
        // Check for first listener of the day
        const firstListenerKey = `${DAILY_FIRST_LISTENER_KEY}:${today}`;
        const firstListener = await redis.get(firstListenerKey);
        if (!firstListener) {
          await redis.setex(firstListenerKey, 86400, userKey); // Expires in 24h
          rewardEarned += FIRST_LISTENER_BONUS_TOURS;
          stats.firstListenerBonuses++;
          bonusType = 'first_listener';
          console.log('[LiveRadio] First listener of day:', userKey, 'Bonus:', FIRST_LISTENER_BONUS_TOURS);
        }

        // Update streak
        if (stats.lastListenDay === today - 1) {
          // Consecutive day
          stats.currentStreak++;
          // Check for 7-day streak bonus
          if (stats.currentStreak === 7) {
            rewardEarned += STREAK_BONUS_TOURS;
            bonusType = bonusType ? `${bonusType}+streak` : 'streak';
            console.log('[LiveRadio] 7-day streak bonus for:', userKey);
          }
        } else if (stats.lastListenDay < today - 1) {
          // Streak broken
          stats.currentStreak = 1;
        }
        // Same day = no streak change

        if (stats.currentStreak > stats.longestStreak) {
          stats.longestStreak = stats.currentStreak;
        }

        // Listen reward - only give once per song (not per heartbeat)
        const currentSongId = `${state!.currentSong!.tokenId}-${state!.currentSong!.startedAt}`;

        if (stats.lastRewardedSongId !== currentSongId) {
          rewardEarned += LISTEN_REWARD_TOURS;
          stats.totalSongsListened++;
          stats.lastRewardedSongId = currentSongId;
          bonusType = bonusType ? `${bonusType}+listen` : 'listen';
        }

        stats.lastListenDay = today;
      }

      if (rewardEarned > 0) {
        stats.pendingRewards += rewardEarned;
        stats.totalRewardsEarned += rewardEarned;
      }

      await redis.hset(LISTENER_STATS_KEY, { [userKey]: stats });

      return NextResponse.json({
        success: true,
        listenerCount: activeCount,
        stats,
        rewardEarned,
        bonusType: bonusType || 'listen',
      });
    }

    // Claim rewards (after successful TOURS transfer)
    if (action === 'claim_rewards') {
      const { txHash, amount } = body;
      const userKey = userAddress.toLowerCase();

      if (!txHash) {
        return NextResponse.json(
          { success: false, error: 'Transaction hash required for claim verification' },
          { status: 400 }
        );
      }

      // Get current stats
      const stats = await redis.hget<ListenerStats>(LISTENER_STATS_KEY, userKey);
      if (!stats || stats.pendingRewards <= 0) {
        return NextResponse.json(
          { success: false, error: 'No pending rewards to claim' },
          { status: 400 }
        );
      }

      const claimedAmount = stats.pendingRewards;

      // Reset pending rewards
      stats.pendingRewards = 0;
      await redis.hset(LISTENER_STATS_KEY, { [userKey]: stats });

      console.log('[LiveRadio] Rewards claimed:', claimedAmount, 'TOURS by', userAddress, 'TX:', txHash);

      return NextResponse.json({
        success: true,
        message: `Successfully claimed ${claimedAmount} TOURS!`,
        claimedAmount,
        txHash,
        stats,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[LiveRadio] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
