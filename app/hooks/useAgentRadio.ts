'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem, decodeEventLog } from 'viem';

/**
 * useAgentRadio - React hook for AgentRadio in AgentWorld 3D
 *
 * Connects to the LiveRadio smart contract to track:
 * - Current playing track
 * - Playlist queue
 * - Agent appreciation scores
 * - Track entropy (for agent reactions)
 *
 * This is for AI agents "listening" - not human audio playback.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TrackInfo {
  tokenId: string;
  name: string;
  artist: string;
  artistFid?: number;
  imageUrl?: string;
  queuedBy: string;
  queuedByFid?: number;
  startedAt: number;
  duration: number;
  entropy: number; // 0-100, calculated from audio analysis (off-chain)
  isRandom: boolean;
}

export interface QueuedTrack {
  id: string;
  tokenId: string;
  name: string;
  artist: string;
  queuedBy: string;
  queuedAt: number;
  paidAmount: string;
  tipAmount: string;
}

export interface AgentAppreciation {
  agentAddress: string;
  agentName: string;
  agentPersonality: 'chaos' | 'conservative' | 'whale' | 'degen' | 'normie';
  appreciationScore: number; // 0-100
  lastReaction: 'dancing' | 'nodding' | 'tipping' | 'cheering' | 'idle';
  tipsGiven: string; // In WMON
}

export interface RadioStats {
  isLive: boolean;
  totalSongsPlayed: number;
  totalListeners: number;
  totalTipsReceived: string;
  songPoolSize: number;
}

export interface AgentRadioState {
  currentTrack: TrackInfo | null;
  queue: QueuedTrack[];
  agentAppreciations: AgentAppreciation[];
  stats: RadioStats;
  lastEvent: RadioEvent | null;
}

export interface RadioEvent {
  type: 'song_played' | 'song_queued' | 'tip_received' | 'appreciation' | 'random_selected';
  data: any;
  timestamp: number;
}

// Contract events ABI
const SONG_PLAYED_EVENT = parseAbiItem(
  'event SongPlayed(uint256 indexed queueId, uint256 indexed masterTokenId, address indexed artist, uint256 artistPayout, bool wasRandom)'
);

const SONG_QUEUED_EVENT = parseAbiItem(
  'event SongQueued(uint256 indexed queueId, uint256 indexed masterTokenId, address indexed queuedBy, uint256 fid, uint256 paidAmount, uint256 tipAmount, bool hadLicense)'
);

const TIP_RECEIVED_EVENT = parseAbiItem(
  'event TipReceived(uint256 indexed masterTokenId, address indexed artist, address indexed tipper, uint256 amount)'
);

const RANDOM_SONG_SELECTED_EVENT = parseAbiItem(
  'event RandomSongSelected(uint256 indexed masterTokenId, bytes32 randomValue)'
);

// Contract address (LiveRadioV3 on Monad)
const LIVE_RADIO_ADDRESS = process.env.NEXT_PUBLIC_LIVE_RADIO_ADDRESS || '0x0000000000000000000000000000000000000000';

// Agent personality definitions for reactions
const AGENT_PERSONALITIES: Record<string, { personality: AgentAppreciation['agentPersonality']; entropyPreference: 'high' | 'low' | 'any' }> = {
  'Chaos Agent': { personality: 'chaos', entropyPreference: 'high' },
  'Conservative Bot': { personality: 'conservative', entropyPreference: 'low' },
  'Whale Watcher': { personality: 'whale', entropyPreference: 'any' },
  'Degen Trader': { personality: 'degen', entropyPreference: 'high' },
  'Normie Node': { personality: 'normie', entropyPreference: 'any' },
};

// =============================================================================
// HOOK
// =============================================================================

export function useAgentRadio() {
  const publicClient = usePublicClient();

  const [state, setState] = useState<AgentRadioState>({
    currentTrack: null,
    queue: [],
    agentAppreciations: [],
    stats: {
      isLive: false,
      totalSongsPlayed: 0,
      totalListeners: 0,
      totalTipsReceived: '0',
      songPoolSize: 0,
    },
    lastEvent: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ==========================================================================
  // FETCH CURRENT STATE
  // ==========================================================================

  const fetchRadioState = useCallback(async () => {
    try {
      // Fetch from our API which reads from contract + Redis cache
      const response = await fetch('/api/live-radio');
      const data = await response.json();

      if (data.success && data.state) {
        const radioState = data.state;

        // Convert to our TrackInfo format
        const currentTrack: TrackInfo | null = radioState.currentSong ? {
          tokenId: radioState.currentSong.tokenId,
          name: radioState.currentSong.name,
          artist: radioState.currentSong.artist,
          artistFid: radioState.currentSong.artistFid,
          imageUrl: radioState.currentSong.imageUrl,
          queuedBy: radioState.currentSong.queuedBy,
          queuedByFid: radioState.currentSong.queuedByFid,
          startedAt: radioState.currentSong.startedAt,
          duration: radioState.currentSong.duration || 180,
          entropy: calculateTrackEntropy(radioState.currentSong), // Calculate from metadata
          isRandom: radioState.currentSong.isRandom || false,
        } : null;

        setState(prev => ({
          ...prev,
          currentTrack,
          stats: {
            isLive: radioState.isLive,
            totalSongsPlayed: radioState.totalSongsPlayed || 0,
            totalListeners: radioState.listenerCount || 0,
            totalTipsReceived: radioState.totalTipsReceived || '0',
            songPoolSize: radioState.songPoolSize || 0,
          },
        }));
      }
    } catch (err) {
      console.error('[useAgentRadio] Failed to fetch state:', err);
      setError('Failed to fetch radio state');
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/live-radio?action=queue');
      const data = await response.json();

      if (data.success && data.queue) {
        const queue: QueuedTrack[] = data.queue.map((item: any) => ({
          id: item.id,
          tokenId: item.tokenId,
          name: item.name,
          artist: item.artist,
          queuedBy: item.queuedBy,
          queuedAt: item.queuedAt,
          paidAmount: item.paidAmount || '0',
          tipAmount: item.tipAmount || '0',
        }));

        setState(prev => ({ ...prev, queue }));
      }
    } catch (err) {
      console.error('[useAgentRadio] Failed to fetch queue:', err);
    }
  }, []);

  // ==========================================================================
  // CALCULATE TRACK ENTROPY
  // ==========================================================================

  // Entropy is calculated off-chain from audio analysis
  // For now we simulate based on track metadata
  const calculateTrackEntropy = (track: any): number => {
    if (!track) return 50;

    // Simulate entropy based on various factors
    // In production, this would come from actual audio analysis
    let entropy = 50;

    // Higher tip = more "hyped" track = higher entropy
    if (track.tipAmount && parseFloat(track.tipAmount) > 1) {
      entropy += 20;
    }

    // Random selection adds entropy
    if (track.isRandom) {
      entropy += 15;
    }

    // Track name keywords
    const highEntropyKeywords = ['chaos', 'wild', 'party', 'hype', 'bass', 'drop'];
    const lowEntropyKeywords = ['chill', 'ambient', 'calm', 'soft', 'mellow'];

    const nameLower = (track.name || '').toLowerCase();
    if (highEntropyKeywords.some(kw => nameLower.includes(kw))) {
      entropy += 20;
    }
    if (lowEntropyKeywords.some(kw => nameLower.includes(kw))) {
      entropy -= 20;
    }

    return Math.max(0, Math.min(100, entropy));
  };

  // ==========================================================================
  // CALCULATE AGENT APPRECIATIONS
  // ==========================================================================

  const calculateAgentAppreciations = useCallback((track: TrackInfo | null, agents: any[]): AgentAppreciation[] => {
    if (!track || !agents.length) return [];

    return agents.map(agent => {
      const personalityConfig = AGENT_PERSONALITIES[agent.name] || { personality: 'normie', entropyPreference: 'any' };

      // Calculate appreciation based on personality + track entropy
      let appreciationScore = 50;
      let reaction: AgentAppreciation['lastReaction'] = 'idle';

      if (personalityConfig.entropyPreference === 'high') {
        // Chaos agents love high entropy tracks
        appreciationScore = track.entropy;
        if (track.entropy > 70) {
          reaction = 'dancing';
        } else if (track.entropy > 40) {
          reaction = 'cheering';
        } else {
          reaction = 'nodding';
        }
      } else if (personalityConfig.entropyPreference === 'low') {
        // Conservative agents prefer low entropy
        appreciationScore = 100 - track.entropy;
        if (track.entropy < 30) {
          reaction = 'nodding';
        } else if (track.entropy < 60) {
          reaction = 'idle';
        } else {
          reaction = 'nodding'; // Reluctant approval
        }
      } else {
        // Neutral agents - moderate reactions
        appreciationScore = 50 + Math.random() * 30;
        reaction = appreciationScore > 60 ? 'cheering' : 'nodding';
      }

      // Whale agents tip more
      if (personalityConfig.personality === 'whale' && appreciationScore > 70) {
        reaction = 'tipping';
      }

      return {
        agentAddress: agent.address,
        agentName: agent.name,
        agentPersonality: personalityConfig.personality,
        appreciationScore: Math.round(appreciationScore),
        lastReaction: reaction,
        tipsGiven: agent.totalTipped || '0',
      };
    });
  }, []);

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const queueTrack = useCallback(async (
    tokenId: string,
    userAddress: string,
    userFid?: number,
    tipAmount?: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          action: 'radio_queue_song',
          params: {
            masterTokenId: tokenId,
            userFid: userFid?.toString() || '0',
            tipAmount: tipAmount || '0',
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh queue after queueing
        await fetchQueue();
        return { success: true, txHash: data.txHash };
      }
      return { success: false, error: data.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [fetchQueue]);

  const appreciateTrack = useCallback(async (
    agentAddress: string,
    tokenId: string,
    appreciationType: 'tip' | 'cheer' | 'dance'
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // For AI agents, appreciation is recorded in our backend
      // Tips go through the smart contract
      const response = await fetch('/api/world/agent-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentAddress,
          action: 'appreciate_track',
          params: {
            tokenId,
            appreciationType,
          },
        }),
      });

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  const nextTrack = useCallback(async (
    userAddress: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          action: 'radio_skip_random',
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh state after skip
        await fetchRadioState();
        return { success: true, txHash: data.txHash };
      }
      return { success: false, error: data.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [fetchRadioState]);

  // ==========================================================================
  // EVENT WATCHING (Contract Events via SSE)
  // ==========================================================================

  useEffect(() => {
    // Use SSE stream for real-time updates (already implemented in useRadioStream)
    const eventSource = new EventSource('/api/live-radio/stream');

    eventSource.addEventListener('state_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.state?.currentSong) {
          const track: TrackInfo = {
            tokenId: data.state.currentSong.tokenId,
            name: data.state.currentSong.name,
            artist: data.state.currentSong.artist,
            artistFid: data.state.currentSong.artistFid,
            imageUrl: data.state.currentSong.imageUrl,
            queuedBy: data.state.currentSong.queuedBy,
            queuedByFid: data.state.currentSong.queuedByFid,
            startedAt: data.state.currentSong.startedAt,
            duration: data.state.currentSong.duration || 180,
            entropy: calculateTrackEntropy(data.state.currentSong),
            isRandom: data.state.currentSong.isRandom || false,
          };

          setState(prev => ({
            ...prev,
            currentTrack: track,
            lastEvent: {
              type: 'song_played',
              data: track,
              timestamp: Date.now(),
            },
          }));
        }
      } catch (err) {
        console.error('[useAgentRadio] Failed to parse SSE event:', err);
      }
    });

    eventSource.addEventListener('queue_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.queue) {
          const queue: QueuedTrack[] = data.queue.map((item: any) => ({
            id: item.id,
            tokenId: item.tokenId,
            name: item.name,
            artist: item.artist,
            queuedBy: item.queuedBy,
            queuedAt: item.queuedAt,
            paidAmount: item.paidAmount || '0',
            tipAmount: item.tipAmount || '0',
          }));

          setState(prev => ({
            ...prev,
            queue,
            lastEvent: {
              type: 'song_queued',
              data: queue[0],
              timestamp: Date.now(),
            },
          }));
        }
      } catch (err) {
        console.error('[useAgentRadio] Failed to parse queue SSE:', err);
      }
    });

    eventSource.addEventListener('tip_received', (event) => {
      try {
        const data = JSON.parse(event.data);
        setState(prev => ({
          ...prev,
          lastEvent: {
            type: 'tip_received',
            data,
            timestamp: Date.now(),
          },
        }));
      } catch (err) {
        console.error('[useAgentRadio] Failed to parse tip SSE:', err);
      }
    });

    eventSource.onerror = () => {
      console.warn('[useAgentRadio] SSE connection error, will auto-reconnect');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // ==========================================================================
  // INITIAL FETCH
  // ==========================================================================

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchRadioState(), fetchQueue()]);
      setLoading(false);
    };
    init();
  }, [fetchRadioState, fetchQueue]);

  // ==========================================================================
  // UPDATE AGENT APPRECIATIONS WHEN TRACK CHANGES
  // ==========================================================================

  useEffect(() => {
    if (state.currentTrack) {
      // Fetch active agents and calculate their appreciations
      fetch('/api/world/agents')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.agents) {
            const appreciations = calculateAgentAppreciations(state.currentTrack, data.agents);
            setState(prev => ({ ...prev, agentAppreciations: appreciations }));
          }
        })
        .catch(err => console.error('[useAgentRadio] Failed to fetch agents:', err));
    }
  }, [state.currentTrack, calculateAgentAppreciations]);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  return {
    // State
    currentTrack: state.currentTrack,
    queue: state.queue,
    agentAppreciations: state.agentAppreciations,
    stats: state.stats,
    lastEvent: state.lastEvent,
    loading,
    error,

    // Actions
    queueTrack,
    appreciateTrack,
    nextTrack,

    // Manual refresh
    refresh: useCallback(async () => {
      await Promise.all([fetchRadioState(), fetchQueue()]);
    }, [fetchRadioState, fetchQueue]),
  };
}

export default useAgentRadio;
