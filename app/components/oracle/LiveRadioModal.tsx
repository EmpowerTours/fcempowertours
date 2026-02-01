'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Radio,
  Music2,
  Mic,
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Loader2,
  Coins,
  Gift,
  Users,
  Clock,
  TrendingUp,
  Flame,
  Plus,
  Check,
  Minus,
  Maximize2,
  Trophy,
  History,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useRadioStream } from '@/app/hooks/useRadioStream';
import { MusicSubscriptionModal } from './MusicSubscriptionModal';

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

interface ListenerStats {
  totalSongsListened: number;
  totalRewardsEarned: string;
  currentStreak: number;
  longestStreak: number;
  voiceNotesSubmitted: number;
  voiceNotesPlayed: number;
}

interface LiveRadioModalProps {
  onClose: () => void;
  isDarkMode?: boolean;
}

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
// POLL_INTERVAL removed — replaced by SSE via useRadioStream (fallback at 5s)

// Format seconds to mm:ss
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function LiveRadioModal({ onClose, isDarkMode = true }: LiveRadioModalProps) {
  const { user, walletAddress } = useFarcasterContext();

  // Real-time SSE stream (replaces 2s polling for radioState, queue, voiceNotes)
  const {
    radioState: streamRadioState,
    queue: streamQueue,
    voiceNotes: streamVoiceNotes,
    connectionStatus,
  } = useRadioStream();

  const [mounted, setMounted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [radioState, setRadioState] = useState<RadioState | null>(null);
  const [queue, setQueue] = useState<QueuedSong[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showVoiceNoteModal, setShowVoiceNoteModal] = useState(false);
  const [pendingRewards, setPendingRewards] = useState('0');
  const [listenerStats, setListenerStats] = useState<ListenerStats | null>(null);
  const [claimingRewards, setClaimingRewards] = useState(false);
  const [lastClaimTxHash, setLastClaimTxHash] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [skippingToRandom, setSkippingToRandom] = useState(false);
  // Subscription requirement
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [pricing, setPricing] = useState({
    queueSong: 1,
    voiceNote: 0.5,
    voiceAd: 2,
    maxVoiceNoteDuration: 5,
    maxVoiceAdDuration: 30,
  });
  const [availableSongs, setAvailableSongs] = useState<any[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [selectedSong, setSelectedSong] = useState<any>(null);
  const [tipAmount, setTipAmount] = useState('');
  const [voiceNoteType, setVoiceNoteType] = useState<'shoutout' | 'ad' | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'uploading' | 'recorded'>('idle');
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ address: string; totalSongsListened: number; currentStreak: number }[]>([]);
  const [recentPlays, setRecentPlays] = useState<{ tokenId: string; name: string; artist: string; imageUrl: string; playedAt: number; queuedBy: string; isRandom: boolean }[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Sync SSE stream data into local state
  useEffect(() => {
    if (streamRadioState) {
      setRadioState(streamRadioState as RadioState);
      if (loading) setLoading(false);
    }
  }, [streamRadioState, loading]);

  useEffect(() => {
    if (streamQueue) setQueue(streamQueue as QueuedSong[]);
  }, [streamQueue]);

  useEffect(() => {
    if (streamVoiceNotes) setVoiceNotes(streamVoiceNotes as VoiceNote[]);
  }, [streamVoiceNotes]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Check subscription status - required to listen to radio
  useEffect(() => {
    const checkSubscription = async () => {
      if (!walletAddress) {
        setCheckingSubscription(false);
        setHasSubscription(false);
        return;
      }
      try {
        const response = await fetch(`/api/music/check-subscription?address=${walletAddress}`);
        const data = await response.json();
        setHasSubscription(data.hasSubscription || false);
      } catch (error) {
        console.error('[LiveRadio] Failed to check subscription:', error);
        setHasSubscription(false);
      } finally {
        setCheckingSubscription(false);
      }
    };
    checkSubscription();
  }, [walletAddress]);

  // Show toast notification (replaces alerts which don't work in Farcaster)
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Fetch radio state
  const fetchRadioState = useCallback(async () => {
    try {
      const response = await fetch('/api/live-radio');
      const data = await response.json();
      if (data.success) {
        setRadioState(data.state);
        if (data.pricing) {
          setPricing(prev => ({ ...prev, ...data.pricing }));
        }
      }
    } catch (error) {
      console.error('[LiveRadio] Failed to fetch state:', error);
    }
  }, []);

  // Fetch available songs from Envio (only Music NFTs with audio)
  const fetchAvailableSongs = useCallback(async () => {
    setLoadingSongs(true);
    try {
      const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
      // Only fetch NFTs that have fullAudioUrl (music NFTs, not art NFTs)
      const query = `
        query GetMusicNFTs {
          MusicNFT(where: {isBurned: {_eq: false}, fullAudioUrl: {_is_null: false}}, limit: 50) {
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
      if (data.data?.MusicNFT) {
        // Map fullAudioUrl to audioUrl and filter out any without valid audio
        const songs = data.data.MusicNFT
          .filter((song: any) => song.fullAudioUrl && song.fullAudioUrl.length > 0)
          .map((song: any) => ({
            ...song,
            audioUrl: song.fullAudioUrl,
          }));
        setAvailableSongs(songs);
        console.log('[LiveRadio] Fetched', songs.length, 'music NFTs (filtered out art NFTs)');
      }
    } catch (error) {
      console.error('[LiveRadio] Failed to fetch songs:', error);
    } finally {
      setLoadingSongs(false);
    }
  }, []);

  // Fetch queue
  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/live-radio?action=queue');
      const data = await response.json();
      if (data.success) {
        setQueue(data.queue);
      }
    } catch (error) {
      console.error('[LiveRadio] Failed to fetch queue:', error);
    }
  }, []);

  // Fetch pending voice notes
  const fetchVoiceNotes = useCallback(async () => {
    try {
      const response = await fetch('/api/live-radio?action=voice-notes');
      const data = await response.json();
      if (data.success) {
        setVoiceNotes(data.voiceNotes || []);
      }
    } catch (error) {
      console.error('[LiveRadio] Failed to fetch voice notes:', error);
    }
  }, []);

  // Fetch listener stats
  const fetchListenerStats = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const response = await fetch(`/api/live-radio?action=listener-stats&address=${walletAddress}`);
      const data = await response.json();
      if (data.success && data.stats) {
        setListenerStats(data.stats);
        setPendingRewards(data.stats.pendingRewards?.toString() || '0');
      }
    } catch (error) {
      console.error('[LiveRadio] Failed to fetch listener stats:', error);
    }
  }, [walletAddress]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await fetch('/api/live-radio?action=leaderboard');
      const data = await response.json();
      if (data.success && data.leaderboard) {
        setLeaderboard(data.leaderboard);
      }
    } catch (error) {
      console.error('[LiveRadio] Failed to fetch leaderboard:', error);
    }
  }, []);

  // Fetch recent plays
  const fetchRecentPlays = useCallback(async () => {
    try {
      const response = await fetch('/api/live-radio?action=play-history&limit=10');
      const data = await response.json();
      if (data.success && data.plays) {
        setRecentPlays(data.plays);
      }
    } catch (error) {
      console.error('[LiveRadio] Failed to fetch recent plays:', error);
    }
  }, []);

  // Send heartbeat
  const sendHeartbeat = useCallback(async () => {
    if (!walletAddress || !isPlaying || !radioState?.currentSong) return;

    try {
      const response = await fetch('/api/live-radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'heartbeat',
          userAddress: walletAddress,
          userFid: user?.fid,
          masterTokenId: radioState.currentSong.tokenId,
        }),
      });

      // Update stats from heartbeat response
      const data = await response.json();
      if (data.success && data.stats) {
        setListenerStats(data.stats);
        setPendingRewards(data.stats.pendingRewards?.toString() || '0');
      }
    } catch (error) {
      console.error('[LiveRadio] Heartbeat failed:', error);
    }
  }, [walletAddress, user?.fid, isPlaying, radioState?.currentSong]);

  // Initial fetch for data not covered by SSE (listener stats, leaderboard, recent plays, pricing)
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchRadioState(), fetchListenerStats(), fetchLeaderboard(), fetchRecentPlays()]);
    };
    init();
  }, [fetchRadioState, fetchListenerStats, fetchLeaderboard, fetchRecentPlays]);

  // Periodic refresh for leaderboard and recent plays (30s — not time-critical)
  useEffect(() => {
    const slowPoll = setInterval(() => {
      fetchLeaderboard();
      fetchRecentPlays();
    }, 30_000);

    return () => clearInterval(slowPoll);
  }, [fetchLeaderboard, fetchRecentPlays]);

  // Heartbeat for listener tracking
  useEffect(() => {
    if (isPlaying) {
      sendHeartbeat(); // Send immediately
      heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    } else {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    }

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [isPlaying, sendHeartbeat]);

  // Auto-sync and switch between songs and voice notes
  const lastSongIdRef = useRef<string | null>(null);
  const lastVoiceNoteIdRef = useRef<string | null>(null);
  const isPlayingVoiceNoteRef = useRef<boolean>(false); // Track if voice note is actively playing

  // Handle audio end event - for both songs and voice notes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = async () => {
      console.log('[LiveRadio] Audio ended, isPlayingVoiceNote:', isPlayingVoiceNoteRef.current);

      if (isPlayingVoiceNoteRef.current) {
        // Voice note just finished
        console.log('[LiveRadio] Voice note audio ended on client');
        isPlayingVoiceNoteRef.current = false;
        lastVoiceNoteIdRef.current = null;

        // Switch to current song if available
        if (radioState?.currentSong && audioRef.current) {
          console.log('[LiveRadio] Switching to song after voice note:', radioState.currentSong.name);
          lastSongIdRef.current = radioState.currentSong.tokenId;
          audioRef.current.src = radioState.currentSong.audioUrl;

          const now = Date.now();
          const elapsedSeconds = (now - radioState.currentSong.startedAt) / 1000;
          const duration = radioState.currentSong.duration || 180;
          if (elapsedSeconds < duration && elapsedSeconds >= 0) {
            audioRef.current.currentTime = elapsedSeconds;
          }
          // Auto-play next song - don't check isPlaying since we want continuous playback
          audioRef.current.play().catch(e => console.warn('[LiveRadio] Post-voice-note autoplay blocked:', e));
        }
      } else {
        // Song just finished naturally - tell server so it can move to next song
        console.log('[LiveRadio] Song ended naturally, reporting to server');

        if (radioState?.currentSong && walletAddress) {
          try {
            // Report to server that song has ended
            await fetch('/api/live-radio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'song_ended',
                userAddress: walletAddress,
                tokenId: radioState.currentSong.tokenId,
              }),
            });
            console.log('[LiveRadio] Reported song end to server:', radioState.currentSong.name);
          } catch (error) {
            console.error('[LiveRadio] Failed to report song end:', error);
          }
        }
        // Don't set isPlaying to false - we want to keep playing when next song arrives
      }
    };

    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [radioState?.currentSong, walletAddress]);

  useEffect(() => {
    if (!audioRef.current) return;

    // Check if voice note is playing on server
    if (radioState?.currentVoiceNote) {
      const voiceNoteId = radioState.currentVoiceNote.id;

      // New voice note detected - switch to voice note audio
      if (lastVoiceNoteIdRef.current !== voiceNoteId) {
        console.log('[LiveRadio] 🎤 Voice note detected:', {
          from: radioState.currentVoiceNote.username || 'unknown',
          url: radioState.currentVoiceNote.audioUrl,
          duration: radioState.currentVoiceNote.duration,
          isPlaying,
        });
        lastVoiceNoteIdRef.current = voiceNoteId;
        lastSongIdRef.current = null; // Reset song tracking
        isPlayingVoiceNoteRef.current = true; // Mark voice note as playing

        // Update audio source to voice note
        audioRef.current.src = radioState.currentVoiceNote.audioUrl;
        audioRef.current.currentTime = 0;

        // Play if user has playback enabled
        if (isPlaying) {
          console.log('[LiveRadio] 🎤 Starting voice note playback...');
          audioRef.current.play()
            .then(() => console.log('[LiveRadio] 🎤 Voice note playing!'))
            .catch(e => console.warn('[LiveRadio] Voice note autoplay blocked:', e));
        } else {
          console.log('[LiveRadio] 🎤 Voice note loaded but isPlaying=false, waiting for user to play');
        }
      }
      return; // Don't process song while voice note is active on server
    }

    // If client is still playing voice note, don't switch to song yet
    if (isPlayingVoiceNoteRef.current) {
      console.log('[LiveRadio] Server cleared voice note, but client still playing - waiting for audio to end');
      return;
    }

    // Clear voice note ref when no voice note
    lastVoiceNoteIdRef.current = null;

    if (!radioState?.currentSong) return;

    const currentSongId = radioState.currentSong.tokenId;

    // New song detected - update audio source and sync
    if (lastSongIdRef.current !== currentSongId) {
      console.log('[LiveRadio] 🎵 New song detected:', radioState.currentSong.name, { isPlaying });
      lastSongIdRef.current = currentSongId;

      // Update audio source
      audioRef.current.src = radioState.currentSong.audioUrl;

      // If playback is enabled, sync to live position and continue
      if (isPlaying) {
        const now = Date.now();
        const elapsedSeconds = (now - radioState.currentSong.startedAt) / 1000;
        const duration = radioState.currentSong.duration || 180;

        if (elapsedSeconds < duration && elapsedSeconds >= 0) {
          audioRef.current.currentTime = elapsedSeconds;
        }
        audioRef.current.play().catch(e => console.warn('[LiveRadio] Song autoplay blocked:', e));
      }
    }
  }, [radioState?.currentSong, radioState?.currentVoiceNote, isPlaying]);

  // Update progress bar every second
  useEffect(() => {
    if (!radioState?.currentSong) {
      setPlaybackProgress(0);
      setRemainingTime(0);
      return;
    }

    const updateProgress = () => {
      const now = Date.now();
      const startedAt = radioState.currentSong!.startedAt;
      const duration = radioState.currentSong!.duration || 180;
      const elapsed = (now - startedAt) / 1000;
      const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));
      const remaining = Math.max(0, duration - elapsed);

      setPlaybackProgress(progress);
      setRemainingTime(Math.ceil(remaining));
    };

    updateProgress();
    const interval = setInterval(updateProgress, 1000);

    return () => clearInterval(interval);
  }, [radioState?.currentSong]);

  // Sync audio to live position based on server startedAt timestamp
  const syncToLivePosition = useCallback(() => {
    if (!audioRef.current || !radioState?.currentSong) return;

    const now = Date.now();
    const startedAt = radioState.currentSong.startedAt;
    const elapsedSeconds = (now - startedAt) / 1000;
    const duration = radioState.currentSong.duration || 180;

    // If song should still be playing, seek to correct position
    if (elapsedSeconds < duration && elapsedSeconds >= 0) {
      audioRef.current.currentTime = elapsedSeconds;
      console.log('[LiveRadio] Synced to position:', elapsedSeconds.toFixed(1), 'seconds');
    }
  }, [radioState?.currentSong]);

  // Handle audio play/pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      // Sync to live position before playing
      syncToLivePosition();
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, syncToLivePosition]);

  // Handle mute toggle
  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Get audio duration from URL
  const getAudioDuration = (audioUrl: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        audio.src = ''; // Clean up
        console.log('[LiveRadio] Got audio duration:', duration, 'seconds');
        resolve(Math.round(duration));
      };
      audio.onerror = () => {
        console.log('[LiveRadio] Could not get duration, using default');
        resolve(180); // Default 3 minutes
      };
      // Timeout after 5 seconds
      setTimeout(() => resolve(180), 5000);
      audio.src = audioUrl;
    });
  };

  // Queue a song
  const handleQueueSong = async (song: any) => {
    if (!walletAddress || !song) return;

    setQueueing(true);
    try {
      // First, get the actual audio duration
      const duration = await getAudioDuration(song.audioUrl);
      console.log('[LiveRadio] Song duration for queue:', duration, 'seconds');

      // Step 1: Queue song ON-CHAIN via LiveRadio contract
      console.log('[LiveRadio] Queueing song on-chain:', song.name, 'tokenId:', song.tokenId);
      const paymentRes = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'radio_queue_song',
          params: {
            masterTokenId: song.tokenId,
            userFid: user?.fid?.toString() || '0',
            tipAmount: tipAmount && parseFloat(tipAmount) > 0 ? tipAmount : '0',
          },
        }),
      });

      const paymentData = await paymentRes.json();
      if (!paymentData.success) {
        throw new Error(paymentData.error || 'Payment failed');
      }

      const txHash = paymentData.txHash;
      console.log('[LiveRadio] On-chain queue TX:', txHash);

      // Step 2: Also add to Redis queue for scheduler (until fully migrated)
      const response = await fetch('/api/live-radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'queue_song',
          userAddress: walletAddress,
          userFid: user?.fid,
          tokenId: song.tokenId,
          name: song.name,
          artist: song.artist,
          audioUrl: song.audioUrl,
          imageUrl: song.imageUrl,
          txHash,
          duration, // Include actual song duration
        }),
      });

      const data = await response.json();
      if (data.success) {
        fetchQueue();
        setShowQueueModal(false);
        setSelectedSong(null);
        setTipAmount('');
        console.log('[LiveRadio] Song queued:', song.name);

        // Show success with tx hash link
        const explorerUrl = `https://monadscan.com/tx/${txHash}`;
        showToast(`Song "${song.name}" queued! TX: ${txHash.slice(0, 10)}...`, 'success');
      } else {
        throw new Error(data.error || 'Queue failed');
      }
    } catch (error: any) {
      console.error('[LiveRadio] Queue failed:', error);
      showToast('Failed to queue: ' + error.message, 'error');
    } finally {
      setQueueing(false);
    }
  };

  // Start voice recording
  const startRecording = async (type: 'shoutout' | 'ad') => {
    try {
      // Check for MediaRecorder support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Audio recording not supported on this device');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Detect supported MIME type (mobile compatibility)
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      }

      console.log('[LiveRadio] Using MIME type:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);
        setRecordedAudioBlob(audioBlob);
        setRecordingStatus('recorded');

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.onerror = (event) => {
        console.error('[LiveRadio] MediaRecorder error:', event);
        stream.getTracks().forEach(track => track.stop());
        setRecordingStatus('idle');
      };

      setVoiceNoteType(type);
      setRecordingStatus('recording');
      setRecordingTime(0);
      mediaRecorder.start();

      // Timer for recording duration
      const maxDuration = type === 'shoutout' ? 5 : 30;
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      console.log('[LiveRadio] Recording started for', type);
    } catch (error: any) {
      console.error('[LiveRadio] Failed to start recording:', error);
      setRecordingStatus('idle');
      setVoiceNoteType(null);
      // Show error in UI (alert doesn't work in Farcaster)
      const errorMessage = error.name === 'NotAllowedError'
        ? 'Microphone access denied. Please allow microphone permissions.'
        : error.name === 'NotFoundError'
        ? 'No microphone found on this device.'
        : error.message || 'Could not start recording. Please try again.';
      console.error('[LiveRadio] Recording error:', errorMessage);
    }
  };

  // Stop voice recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // Submit voice note
  const submitVoiceNote = async () => {
    if (!walletAddress || !recordedAudioBlob || !voiceNoteType) return;

    setRecordingStatus('uploading');

    try {
      // Step 1: Process WMON payment via delegated transaction
      console.log('[LiveRadio] Processing payment for', voiceNoteType);
      const paymentRes = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'radio_voice_note',
          params: { noteType: voiceNoteType },
        }),
      });

      const paymentData = await paymentRes.json();
      if (!paymentData.success) {
        throw new Error(paymentData.error || 'Payment failed');
      }

      const txHash = paymentData.txHash;
      console.log('[LiveRadio] Payment successful, TX:', txHash);

      // Step 2: Upload audio to IPFS via Pinata
      const formData = new FormData();
      formData.append('file', recordedAudioBlob, `voice-${voiceNoteType}-${Date.now()}.webm`);

      const uploadRes = await fetch('/api/upload-to-ipfs', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Upload failed');
      }

      // Step 3: Submit to live radio queue
      const action = voiceNoteType === 'shoutout' ? 'voice_note' : 'voice_ad';
      const response = await fetch('/api/live-radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          userAddress: walletAddress,
          userFid: user?.fid,
          username: user?.username,
          audioUrl: uploadData.url,
          duration: recordingTime,
          txHash,
        }),
      });

      const data = await response.json();
      if (data.success) {
        console.log('[LiveRadio] Voice note submitted!');
        resetRecording();
        setShowVoiceNoteModal(false);

        // Fetch updated voice notes to show in queue
        await fetchVoiceNotes();

        // Show success with tx hash link and queue info
        const explorerUrl = `https://monadscan.com/tx/${txHash}`;
        showToast(`Voice ${voiceNoteType} submitted! Will play after current song.`, 'success');
      } else {
        throw new Error(data.error || 'Submit failed');
      }
    } catch (error: any) {
      console.error('[LiveRadio] Voice note submit failed:', error);
      showToast('Failed to submit: ' + error.message, 'error');
      setRecordingStatus('recorded');
    }
  };

  // Reset recording state
  const resetRecording = () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setRecordedAudioBlob(null);
    setRecordingStatus('idle');
    setRecordingTime(0);
    setVoiceNoteType(null);
  };

  // Handle voice shoutout button click
  const handleVoiceShoutout = async (type: 'shoutout' | 'ad') => {
    if (!walletAddress) {
      showToast('Please connect your wallet first', 'error');
      return;
    }
    startRecording(type);
  };

  // Claim rewards
  const handleClaimRewards = async () => {
    if (!walletAddress || pendingRewards === '0' || parseFloat(pendingRewards) <= 0) return;

    setClaimingRewards(true);
    try {
      console.log('[LiveRadio] Claiming rewards:', pendingRewards, 'TOURS');

      // Step 1: Execute TOURS transfer via delegated transaction
      const paymentRes = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'radio_claim_rewards',
          params: { amount: pendingRewards },
        }),
      });

      const paymentData = await paymentRes.json();
      if (!paymentData.success) {
        throw new Error(paymentData.error || 'Claim failed');
      }

      const txHash = paymentData.txHash;
      console.log('[LiveRadio] Rewards claim TX:', txHash);

      // Step 2: Mark rewards as claimed in backend
      const claimRes = await fetch('/api/live-radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claim_rewards',
          userAddress: walletAddress,
          txHash,
          amount: pendingRewards,
        }),
      });

      const claimData = await claimRes.json();
      if (claimData.success) {
        // Update local state
        setPendingRewards('0');
        if (claimData.stats) {
          setListenerStats(claimData.stats);
        }

        // Store tx hash for clickable link
        setLastClaimTxHash(txHash);
        showToast(`Claimed ${pendingRewards} TOURS!`, 'success');
      } else {
        throw new Error(claimData.error || 'Failed to mark rewards as claimed');
      }
    } catch (error: any) {
      console.error('[LiveRadio] Claim failed:', error);
      showToast('Failed to claim: ' + error.message, 'error');
    } finally {
      setClaimingRewards(false);
    }
  };

  // Skip to random song using Pyth Entropy (on-chain verifiable randomness)
  const handleSkipToRandom = async () => {
    if (!walletAddress || skippingToRandom) return;

    setSkippingToRandom(true);
    try {
      console.log('[LiveRadio] Requesting random song via Pyth Entropy...');

      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'radio_skip_random',
          fid: user?.fid, // For Farcaster cast
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Skip to random failed');
      }

      console.log('[LiveRadio] Skip to random TX:', data.txHash);
      showToast('Requesting random song... Pyth Entropy processing!', 'success');

      // Refresh radio state to get new song
      setTimeout(() => {
        fetchRadioState();
        fetchQueue();
      }, 3000);

    } catch (error: any) {
      console.error('[LiveRadio] Skip to random failed:', error);
      showToast('Failed: ' + error.message, 'error');
    } finally {
      setSkippingToRandom(false);
    }
  };

  if (!mounted) return null;

  // Persistent audio element - ALWAYS rendered to keep playing across view switches
  // Source is controlled by useEffect logic, not hardcoded here
  const persistentAudioPortal = createPortal(
    <audio
      ref={audioRef}
      style={{ display: 'none' }}
      // Don't set src here - let useEffect handle it
      // Don't set onEnded here - it breaks continuous playback
    />,
    document.body
  );

  // Minimized - Small floating button in top-right corner
  if (isMinimized) {
    const minimizedContent = (
      <>
        {/* Tiny floating button - top right */}
        <button
          onClick={() => setIsMinimized(false)}
          className="fixed top-2 right-2 w-8 h-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 shadow-md flex items-center justify-center hover:scale-105 transition-transform active:scale-95"
          style={{ zIndex: 9999, backgroundColor: "#000000" }}
        >
          <Radio className="w-4 h-4 text-white" />

          {/* Live pulse indicator */}
          {radioState?.isLive && isPlaying && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
          )}
        </button>
      </>
    );
    return (
      <>
        {persistentAudioPortal}
        {createPortal(minimizedContent, document.body)}
      </>
    );
  }

  const modalContent = (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`}
      style={{ zIndex: 9999, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
      onClick={onClose}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-lg z-[10000] max-w-[90%] text-center ${
            toast.type === 'success'
              ? 'bg-green-600/90 text-white'
              : 'bg-red-600/90 text-white'
          }`}
        >
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      )}

      <div
        className={`${isDarkMode ? 'bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 border-purple-500/30' : 'bg-white border-gray-200'} border rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 border-b ${isDarkMode ? 'border-purple-500/20' : 'border-gray-200'} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Live Radio</h2>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>World Cup 2026 Jukebox</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className={`${isDarkMode ? 'text-gray-400 hover:text-purple-400' : 'text-gray-500 hover:text-purple-500'} transition-colors`}
              title="Minimize"
            >
              <Minus className="w-6 h-6" />
            </button>
            <button onClick={onClose} className={`${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'} transition-colors`}>
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Subscription Gate */}
          {checkingSubscription ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
              <span className="ml-3 text-gray-400">Checking subscription...</span>
            </div>
          ) : !hasSubscription ? (
            <MusicSubscriptionModal
              userAddress={walletAddress || undefined}
              userFid={user?.fid}
              onClose={onClose}
            />
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Radio Status */}
              <div className="mb-6">
                <div className={`flex items-center gap-2 mb-2 ${radioState?.isLive ? 'text-green-400' : 'text-gray-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${radioState?.isLive ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                  <span className="text-sm font-semibold">{radioState?.isLive ? 'LIVE' : 'OFFLINE'}</span>
                  {radioState?.isLive && (
                    <span className="text-xs text-gray-400">• {radioState.listenerCount || 0} listeners</span>
                  )}
                  {connectionStatus === 'connected' && (
                    <span className="text-xs text-green-500 opacity-75">• SSE</span>
                  )}
                  {connectionStatus === 'fallback' && (
                    <span className="text-xs text-yellow-500 opacity-75">• polling</span>
                  )}
                </div>

                {/* Current Song */}
                {radioState?.currentSong ? (
                  <div className={`${isDarkMode ? 'bg-gray-800 border-purple-500/20' : 'bg-gray-50 border-purple-200'} rounded-2xl p-4 border`}>
                    {/* Album Art */}
                    <div className="w-full aspect-square rounded-xl bg-purple-500/20 overflow-hidden mb-3">
                      {radioState.currentSong.imageUrl ? (
                        <img
                          src={radioState.currentSong.imageUrl}
                          alt={radioState.currentSong.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-12 h-12 text-purple-400" />
                        </div>
                      )}
                    </div>
                    {/* Song Info */}
                    <div className="text-center">
                      <p className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{radioState.currentSong.name}</p>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{radioState.currentSong.artist}</p>
                      <p className="text-xs text-purple-400 mt-1">
                        Queued by: {radioState.currentSong.queuedBy.slice(0, 6)}...{radioState.currentSong.queuedBy.slice(-4)}
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className={`flex items-center justify-between text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <span>{formatTime(Math.floor((radioState.currentSong.duration || 180) * playbackProgress / 100))}</span>
                        <span className="text-purple-400 font-medium">
                          {remainingTime > 0 ? `-${formatTime(remainingTime)}` : 'Ending...'}
                        </span>
                      </div>
                      <div className={`h-1 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000"
                          style={{ width: `${playbackProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Playback Controls */}
                    <div className="flex items-center justify-center gap-4 mt-4">
                      <button
                        onClick={toggleMute}
                        className="p-2 rounded-full hover:bg-purple-500/20 transition-colors"
                      >
                        {isMuted ? (
                          <VolumeX className="w-5 h-5 text-gray-400" />
                        ) : (
                          <Volume2 className="w-5 h-5 text-purple-400" />
                        )}
                      </button>
                      <button
                        onClick={togglePlay}
                        className="p-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 transition-all"
                      >
                        {isPlaying ? (
                          <Pause className="w-6 h-6 text-white" />
                        ) : (
                          <Play className="w-6 h-6 text-white ml-0.5" />
                        )}
                      </button>
                      <button
                        onClick={handleSkipToRandom}
                        disabled={skippingToRandom || !walletAddress}
                        className="p-2 rounded-full hover:bg-purple-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group relative"
                        title="Skip to Random - 1 MON (Pyth Entropy)"
                      >
                        {skippingToRandom ? (
                          <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                        ) : (
                          <SkipForward className="w-5 h-5 text-purple-400 group-hover:text-pink-400 transition-colors" />
                        )}
                      </button>
                    </div>

                  </div>
                ) : (
                  <div className={`${isDarkMode ? 'bg-gray-800 border-purple-500/20' : 'bg-gray-50 border-purple-200'} rounded-2xl p-8 border text-center`}>
                    <Music2 className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>No song playing</p>
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Queue a song to start the party!</p>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <button
                  onClick={() => {
                    setShowQueueModal(true);
                    fetchAvailableSongs();
                  }}
                  className={`p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border ${isDarkMode ? 'border-purple-500/30' : 'border-purple-300'} rounded-xl transition-all`}
                >
                  <Plus className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                  <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Queue Song</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{pricing.queueSong} WMON</p>
                </button>
                <button
                  onClick={() => setShowVoiceNoteModal(true)}
                  className={`p-3 bg-gradient-to-r from-pink-500/20 to-orange-500/20 hover:from-pink-500/30 hover:to-orange-500/30 border ${isDarkMode ? 'border-pink-500/30' : 'border-pink-300'} rounded-xl transition-all`}
                >
                  <Mic className="w-5 h-5 text-pink-400 mx-auto mb-1" />
                  <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Voice Shoutout</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{pricing.voiceNote} WMON (3-5 sec)</p>
                </button>
                <button
                  onClick={handleSkipToRandom}
                  disabled={skippingToRandom || !walletAddress}
                  className={`p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border ${isDarkMode ? 'border-purple-500/30' : 'border-purple-300'} rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {skippingToRandom ? (
                    <Loader2 className="w-5 h-5 text-purple-400 mx-auto mb-1 animate-spin" />
                  ) : (
                    <SkipForward className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                  )}
                  <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Skip Random</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>1 MON (Pyth)</p>
                </button>
              </div>

              {/* Queue */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    <Clock className="w-4 h-4 text-purple-400" />
                    Up Next
                  </h3>
                  <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{queue.length} in queue</span>
                </div>
                {queue.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {queue.slice(0, 5).map((song, index) => (
                      <div
                        key={song.id}
                        className={`p-2 rounded-lg border ${isDarkMode ? 'bg-gray-800 border-purple-500/10' : 'bg-gray-50 border-purple-200/50'}`}
                      >
                        <div className="w-full aspect-square rounded bg-purple-500/20 overflow-hidden mb-2 relative">
                          {song.imageUrl ? (
                            <img src={song.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music2 className="w-6 h-6 text-purple-400" />
                            </div>
                          )}
                          <span className="absolute top-1 left-1 text-xs text-white bg-black/60 rounded px-1.5 py-0.5">{index + 1}</span>
                        </div>
                        <p className={`text-sm truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{song.name}</p>
                        <p className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{song.artist}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-center text-sm py-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Queue is empty</p>
                )}
              </div>

              {/* Pending Voice Shoutouts */}
              {voiceNotes.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Mic className="w-4 h-4 text-pink-400" />
                      Pending Shoutouts
                    </h3>
                    <span className="text-xs text-pink-400">{voiceNotes.length} waiting</span>
                  </div>
                  <div className="space-y-2">
                    {voiceNotes.slice(0, 5).map((note, index) => (
                      <div
                        key={note.id}
                        className={`flex items-center gap-3 p-2 rounded-lg border ${
                          note.userAddress?.toLowerCase() === walletAddress?.toLowerCase()
                            ? 'bg-pink-500/20 border-pink-500/50'
                            : 'bg-gray-800 border-pink-500/10'
                        }`}
                      >
                        <span className="text-xs text-gray-500 w-5">{index + 1}</span>
                        <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                          <Mic className="w-4 h-4 text-pink-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">
                            {note.username || `${note.userAddress?.slice(0, 6)}...`}
                            {note.userAddress?.toLowerCase() === walletAddress?.toLowerCase() && (
                              <span className="text-pink-400 ml-1">(You)</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">{note.duration}s • {note.isAd ? 'Ad' : 'Shoutout'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Shoutouts play after each song ends
                  </p>
                </div>
              )}

              {/* Rewards Section */}
              {walletAddress && (
                <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Gift className="w-4 h-4 text-yellow-400" />
                      Your Rewards
                    </h3>
                    <span className="text-xs text-yellow-400 font-bold">{pendingRewards} TOURS</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-white">{listenerStats?.totalSongsListened || 0}</p>
                      <p className="text-xs text-gray-400">Songs</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white flex items-center justify-center gap-1">
                        <Flame className="w-4 h-4 text-orange-400" />
                        {listenerStats?.currentStreak || 0}
                      </p>
                      <p className="text-xs text-gray-400">Day Streak</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white">{listenerStats?.voiceNotesPlayed || 0}</p>
                      <p className="text-xs text-gray-400">Shoutouts</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClaimRewards}
                    disabled={claimingRewards || !pendingRewards || parseFloat(pendingRewards) <= 0}
                    className="w-full py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg font-semibold text-sm transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {claimingRewards ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Claiming...
                      </>
                    ) : parseFloat(pendingRewards) > 0 ? (
                      <>
                        <Coins className="w-4 h-4" />
                        Claim {pendingRewards} TOURS
                      </>
                    ) : (
                      <>
                        <Coins className="w-4 h-4" />
                        No Rewards to Claim
                      </>
                    )}
                  </button>
                  {lastClaimTxHash && (
                    <button
                      onClick={() => window.open(`https://monadscan.com/tx/${lastClaimTxHash}`, '_blank')}
                      className="w-full mt-2 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <Check className="w-3 h-3" />
                      Last Claim: {lastClaimTxHash.slice(0, 8)}...{lastClaimTxHash.slice(-6)}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Earn 0.1 TOURS/song • 10 TOURS for 7-day streak
                  </p>
                </div>
              )}

              {/* Leaderboard & Recent Plays Section */}
              <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowLeaderboard(!showLeaderboard)}
                  className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                >
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    Leaderboard & Recent Plays
                  </h3>
                  {showLeaderboard ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {showLeaderboard && (
                  <div className="p-3 pt-0 space-y-4">
                    {/* Top Listeners */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> Top Listeners
                      </h4>
                      {leaderboard.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-2">No listeners yet</p>
                      ) : (
                        <div className="space-y-1">
                          {leaderboard.slice(0, 5).map((entry, idx) => (
                            <div
                              key={entry.address}
                              className={`flex items-center gap-2 p-2 rounded-lg ${
                                idx === 0 ? 'bg-yellow-500/20' : idx === 1 ? 'bg-gray-400/20' : idx === 2 ? 'bg-orange-500/20' : 'bg-white/5'
                              }`}
                            >
                              <span className={`w-5 text-xs font-bold ${
                                idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-500'
                              }`}>
                                #{idx + 1}
                              </span>
                              <span className="text-xs text-white font-mono truncate flex-1">
                                {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                              </span>
                              <span className="text-xs text-purple-400 font-semibold">
                                {entry.totalSongsListened} songs
                              </span>
                              {entry.currentStreak > 0 && (
                                <span className="text-xs text-orange-400 flex items-center gap-0.5">
                                  <Flame className="w-3 h-3" />
                                  {entry.currentStreak}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recent Plays - Grid layout with smaller covers and text below */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
                        <History className="w-3 h-3" /> Recent Plays
                      </h4>
                      {recentPlays.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-2">No plays yet</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                          {recentPlays.map((play, idx) => (
                            <div
                              key={`${play.tokenId}-${play.playedAt}`}
                              className="flex flex-col items-center p-1.5 bg-white/5 rounded-lg"
                            >
                              {/* Smaller album art */}
                              <div className="w-12 h-12 rounded bg-purple-500/20 overflow-hidden mb-1">
                                {play.imageUrl ? (
                                  <img src={play.imageUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Music2 className="w-4 h-4 text-purple-400" />
                                  </div>
                                )}
                              </div>
                              {/* Song name below cover */}
                              <p className="text-[10px] text-white text-center truncate w-full leading-tight">
                                {play.name || `#${play.tokenId}`}
                              </p>
                              {/* Artist/queuer below song name */}
                              <p className="text-[9px] text-gray-500 text-center truncate w-full">
                                {play.queuedBy ? `${play.queuedBy.slice(0, 4)}...${play.queuedBy.slice(-2)}` : play.artist?.slice(0, 6) || ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t ${isDarkMode ? 'border-purple-500/20 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <p className="text-xs text-gray-500 text-center">
            Powered by Pyth Entropy • Smart Contract on Monad
          </p>
        </div>
      </div>

      {/* Queue Song Sub-Modal */}
      {showQueueModal && (
        <div
          className={`fixed inset-0 flex items-center justify-center p-2 sm:p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`}
          style={{ zIndex: 10000, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
          onClick={() => { setShowQueueModal(false); setSelectedSong(null); setTipAmount(''); }}
        >
          <div
            className={`${isDarkMode ? 'border-purple-500/30' : 'bg-white border-purple-300'} border rounded-2xl w-full max-w-[calc(100vw-16px)] sm:max-w-md p-3 sm:p-4 max-h-[85vh] overflow-y-auto flex flex-col shadow-xl`}
            style={{ backgroundColor: isDarkMode ? '#111827' : '#ffffff' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-base sm:text-lg font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Queue a Song</h3>
            <p className={`text-xs sm:text-sm mb-3 break-words ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Select a song to add to the radio queue ({pricing.queueSong} WMON)
            </p>

            {/* Song List */}
            <div className="grid grid-cols-2 gap-2 mb-3 sm:mb-4 max-h-[35vh] overflow-y-auto">
              {loadingSongs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                </div>
              ) : availableSongs.length > 0 ? (
                availableSongs.map((song) => (
                  <button
                    key={song.tokenId}
                    onClick={() => setSelectedSong(song)}
                    className={`w-full p-2 sm:p-3 rounded-lg border transition-all text-left relative ${
                      selectedSong?.tokenId === song.tokenId
                        ? 'bg-purple-500/20 border-purple-500'
                        : isDarkMode
                          ? 'bg-gray-800 border-purple-500/20 hover:border-purple-500/50'
                          : 'bg-gray-50 border-purple-300/50 hover:border-purple-400'
                    }`}
                  >
                    {selectedSong?.tokenId === song.tokenId && (
                      <div className="absolute top-2 right-2">
                        <Check className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
                      </div>
                    )}
                    <div className="w-full aspect-square rounded bg-purple-500/20 overflow-hidden mb-2">
                      {song.imageUrl ? (
                        <img src={song.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-8 h-8 text-purple-400" />
                        </div>
                      )}
                    </div>
                    <p className={`text-xs sm:text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{song.name || `Song #${song.tokenId}`}</p>
                    <p className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{song.artist || 'Unknown Artist'}</p>
                  </button>
                ))
              ) : (
                <div className="text-center py-8">
                  <Music2 className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>No songs available</p>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>Mint some Music NFTs first!</p>
                </div>
              )}
            </div>

            {/* Selected Song Preview */}
            {selectedSong && (
              <div className={`mb-3 p-3 rounded-xl ${isDarkMode ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'}`}>
                <p className="text-xs text-purple-400 mb-1">Selected:</p>
                <p className={`text-sm font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedSong.name}</p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{selectedSong.artist}</p>
              </div>
            )}

            {/* Tip Artist (optional) */}
            {selectedSong && (
              <div className={`mb-3 p-3 rounded-xl ${isDarkMode ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-orange-50 border border-orange-200'}`}>
                <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-orange-400' : 'text-orange-700'}`}>
                  Tip the artist (optional, 100% goes to them)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-sm border outline-none focus:border-orange-400 ${isDarkMode ? 'border-orange-500/30 placeholder-gray-500' : 'border-orange-300 placeholder-gray-400'}`}
                    style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff', color: isDarkMode ? '#ffffff' : '#111827' }}
                  />
                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-orange-400' : 'text-orange-700'}`}>WMON</span>
                </div>
              </div>
            )}

            {/* Payment Info */}
            <div className={`mb-3 p-2 rounded-lg ${isDarkMode ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-yellow-50 border border-yellow-200'}`}>
              <p className={`text-xs text-center ${isDarkMode ? 'text-yellow-400' : 'text-yellow-700'}`}>
                Payment: {pricing.queueSong} WMON{tipAmount && parseFloat(tipAmount) > 0 ? ` + ${tipAmount} WMON tip` : ''} via delegated transaction
              </p>
            </div>

            <div className={`flex gap-2 pt-2 border-t ${isDarkMode ? 'border-purple-500/20' : 'border-gray-200'}`}>
              <button
                onClick={() => { setShowQueueModal(false); setSelectedSong(null); setTipAmount(''); }}
                className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
              >
                Cancel
              </button>
              <button
                onClick={() => handleQueueSong(selectedSong)}
                disabled={queueing || !selectedSong}
                className="flex-1 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {queueing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Coins className="w-4 h-4" />
                    Pay & Queue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Note Sub-Modal */}
      {showVoiceNoteModal && (
        <div
          className={`fixed inset-0 flex items-center justify-center p-2 sm:p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`}
          style={{ zIndex: 10000, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
          onClick={() => { if (recordingStatus === 'idle') { setShowVoiceNoteModal(false); resetRecording(); } }}
        >
          <div
            className={`${isDarkMode ? 'bg-gray-900 border-pink-500/30' : 'bg-white border-pink-300'} border rounded-2xl w-full max-w-[calc(100vw-16px)] sm:max-w-sm p-3 sm:p-4 overflow-hidden shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-base sm:text-lg font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {recordingStatus === 'idle' ? 'Voice Shoutout' :
               recordingStatus === 'recording' ? '🔴 Recording...' :
               recordingStatus === 'recorded' ? 'Preview Recording' :
               'Uploading...'}
            </h3>

            {/* Selection View */}
            {recordingStatus === 'idle' && (
              <>
                <p className={`text-xs sm:text-sm mb-3 break-words ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Record a shoutout or ad to play between songs
                </p>
                <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                  <button
                    onClick={() => handleVoiceShoutout('shoutout')}
                    className={`w-full p-3 sm:p-4 bg-gradient-to-r from-pink-500/20 to-orange-500/20 hover:from-pink-500/30 hover:to-orange-500/30 border ${isDarkMode ? 'border-pink-500/30' : 'border-pink-300'} rounded-xl transition-all text-left active:scale-[0.98]`}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Mic className="w-6 h-6 sm:w-8 sm:h-8 text-pink-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm sm:text-base font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Quick Shoutout</p>
                        <p className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Up to 5 seconds</p>
                      </div>
                      <div className="text-pink-400 text-xs font-bold bg-pink-500/20 px-2 py-1 rounded">
                        {pricing.voiceNote} WMON
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleVoiceShoutout('ad')}
                    className={`w-full p-3 sm:p-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border ${isDarkMode ? 'border-purple-500/30' : 'border-purple-300'} rounded-xl transition-all text-left active:scale-[0.98]`}
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm sm:text-base font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Voice Ad</p>
                        <p className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Up to 30 seconds</p>
                      </div>
                      <div className="text-purple-400 text-xs font-bold bg-purple-500/20 px-2 py-1 rounded">
                        {pricing.voiceAd} WMON
                      </div>
                    </div>
                  </button>
                </div>
                <button
                  onClick={() => setShowVoiceNoteModal(false)}
                  className={`w-full py-2 rounded-lg font-semibold text-sm transition-all ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
                >
                  Cancel
                </button>
              </>
            )}

            {/* Recording View */}
            {recordingStatus === 'recording' && (
              <div className="text-center py-6">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-red-500/20 border-4 border-red-500 flex items-center justify-center animate-pulse">
                  <Mic className="w-10 h-10 text-red-500" />
                </div>
                <p className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{recordingTime}s</p>
                <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {voiceNoteType === 'shoutout' ? `Max 5 seconds` : `Max 30 seconds`}
                </p>
                <button
                  onClick={stopRecording}
                  className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all"
                >
                  Stop Recording
                </button>
              </div>
            )}

            {/* Preview View */}
            {recordingStatus === 'recorded' && recordedAudioUrl && (
              <div className="py-4">
                <div className={`rounded-xl p-4 mb-4 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <audio src={recordedAudioUrl} controls className="w-full" />
                  <p className={`text-xs text-center mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Duration: {recordingTime} seconds
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={resetRecording}
                    className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
                  >
                    Re-record
                  </button>
                  <button
                    onClick={submitVoiceNote}
                    className="flex-1 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 text-white rounded-lg font-semibold text-sm transition-all"
                  >
                    Submit ({voiceNoteType === 'shoutout' ? pricing.voiceNote : pricing.voiceAd} WMON)
                  </button>
                </div>
              </div>
            )}

            {/* Uploading View */}
            {recordingStatus === 'uploading' && (
              <div className="text-center py-8">
                <Loader2 className="w-12 h-12 text-pink-400 animate-spin mx-auto mb-4" />
                <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Uploading your voice note...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {persistentAudioPortal}
      {createPortal(modalContent, document.body)}
    </>
  );
}
