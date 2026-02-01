'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useRadioStream — React hook that connects to the SSE endpoint
 * for real-time radio updates, with automatic fallback to polling.
 *
 * Returns reactive state that updates instantly via SSE or
 * falls back to 5s polling if the stream drops.
 */

interface RadioState {
  isLive: boolean;
  currentSong: {
    tokenId: string;
    name: string;
    artist: string;
    audioUrl: string;
    imageUrl: string;
    queuedBy: string;
    queuedByFid: number;
    startedAt: number;
    duration: number;
  } | null;
  currentVoiceNote: {
    id: string;
    username?: string;
    audioUrl: string;
    duration: number;
    isAd: boolean;
    startedAt: number;
  } | null;
  listenerCount: number;
  lastUpdated: number;
}

interface QueuedSong {
  id: string;
  tokenId: string;
  name: string;
  artist: string;
  audioUrl: string;
  imageUrl: string;
  queuedBy: string;
  queuedByFid: number;
  queuedAt: number;
  paidAmount: string;
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

type ConnectionStatus = 'connecting' | 'connected' | 'fallback' | 'disconnected';

interface RadioStreamResult {
  radioState: RadioState | null;
  queue: QueuedSong[];
  voiceNotes: VoiceNote[];
  connectionStatus: ConnectionStatus;
  lastEvent: { type: string; data: any } | null;
}

const FALLBACK_POLL_INTERVAL = 5000; // 5s polling when SSE is down

export function useRadioStream(): RadioStreamResult {
  const [radioState, setRadioState] = useState<RadioState | null>(null);
  const [queue, setQueue] = useState<QueuedSong[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastEvent, setLastEvent] = useState<{ type: string; data: any } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polling fallback
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return; // Already polling

    const poll = async () => {
      try {
        const [stateRes, queueRes, voiceRes] = await Promise.all([
          fetch('/api/live-radio'),
          fetch('/api/live-radio?action=queue'),
          fetch('/api/live-radio?action=voice-notes'),
        ]);

        const [stateData, queueData, voiceData] = await Promise.all([
          stateRes.json(),
          queueRes.json(),
          voiceRes.json(),
        ]);

        if (stateData.success) setRadioState(stateData.state);
        if (queueData.success) setQueue(queueData.queue || []);
        if (voiceData.success) setVoiceNotes(voiceData.voiceNotes || []);
      } catch (error) {
        console.error('[useRadioStream] Polling failed:', error);
      }
    };

    poll(); // Immediate first poll
    pollIntervalRef.current = setInterval(poll, FALLBACK_POLL_INTERVAL);
    console.log('[useRadioStream] Fallback polling started (5s interval)');
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
      console.log('[useRadioStream] Fallback polling stopped');
    }
  }, []);

  // SSE connection
  const connectSSE = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionStatus('connecting');

    const es = new EventSource('/api/live-radio/stream');
    eventSourceRef.current = es;

    // Handle initial state
    es.addEventListener('initial_state', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.state) setRadioState(data.state);
        if (data.queue) setQueue(data.queue);
        if (data.voiceNotes) setVoiceNotes(data.voiceNotes);
        setConnectionStatus('connected');
        stopPolling(); // SSE is live — stop polling
        console.log('[useRadioStream] SSE connected, initial state received');
      } catch (error) {
        console.error('[useRadioStream] Failed to parse initial_state:', error);
      }
    });

    // State updates (song played, song ended, etc.)
    es.addEventListener('state_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.state) setRadioState(data.state);
        setLastEvent({ type: 'state_update', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse state_update:', error);
      }
    });

    // Queue updates (song queued)
    es.addEventListener('queue_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.queue) setQueue(data.queue);
        setLastEvent({ type: 'queue_update', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse queue_update:', error);
      }
    });

    // Voice notes updates
    es.addEventListener('voice_notes_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.voiceNotes) setVoiceNotes(data.voiceNotes);
        setLastEvent({ type: 'voice_notes_update', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse voice_notes_update:', error);
      }
    });

    // Voice note played
    es.addEventListener('voice_note_played', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent({ type: 'voice_note_played', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse voice_note_played:', error);
      }
    });

    // Tip received
    es.addEventListener('tip_received', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent({ type: 'tip_received', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse tip_received:', error);
      }
    });

    // Listener rewarded
    es.addEventListener('listener_rewarded', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent({ type: 'listener_rewarded', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse listener_rewarded:', error);
      }
    });

    // Subscription event
    es.addEventListener('subscription', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent({ type: 'subscription', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse subscription:', error);
      }
    });

    // Play recorded
    es.addEventListener('play_recorded', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent({ type: 'play_recorded', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse play_recorded:', error);
      }
    });

    // Reward distributed
    es.addEventListener('reward_distributed', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent({ type: 'reward_distributed', data });
      } catch (error) {
        console.error('[useRadioStream] Failed to parse reward_distributed:', error);
      }
    });

    // Connection opened
    es.onopen = () => {
      console.log('[useRadioStream] SSE connection opened');
    };

    // Connection error — fall back to polling
    es.onerror = () => {
      console.warn('[useRadioStream] SSE error — falling back to polling');
      setConnectionStatus('fallback');
      startPolling();

      // EventSource auto-reconnects. When it does, we'll get initial_state
      // and stop polling again. But if it stays broken, polling keeps us alive.
    };
  }, [startPolling, stopPolling]);

  // Initialize SSE on mount
  useEffect(() => {
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      stopPolling();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [connectSSE, stopPolling]);

  return {
    radioState,
    queue,
    voiceNotes,
    connectionStatus,
    lastEvent,
  };
}
