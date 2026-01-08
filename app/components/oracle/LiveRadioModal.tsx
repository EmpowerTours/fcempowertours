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
} from 'lucide-react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

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
}

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const POLL_INTERVAL = 5000; // 5 seconds for state updates

export function LiveRadioModal({ onClose }: LiveRadioModalProps) {
  const { user, walletAddress } = useFarcasterContext();
  const [mounted, setMounted] = useState(false);
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
  const [queueing, setQueueing] = useState(false);
  const [pricing, setPricing] = useState({
    queueSong: 1,
    voiceNote: 0.5,
    maxVoiceNoteDuration: 5,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Fetch radio state
  const fetchRadioState = useCallback(async () => {
    try {
      const response = await fetch('/api/live-radio');
      const data = await response.json();
      if (data.success) {
        setRadioState(data.state);
        setPricing(data.pricing);
      }
    } catch (error) {
      console.error('[LiveRadio] Failed to fetch state:', error);
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

  // Send heartbeat
  const sendHeartbeat = useCallback(async () => {
    if (!walletAddress || !isPlaying || !radioState?.currentSong) return;

    try {
      await fetch('/api/live-radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'heartbeat',
          userAddress: walletAddress,
          userFid: user?.fid,
          masterTokenId: radioState.currentSong.tokenId,
        }),
      });
    } catch (error) {
      console.error('[LiveRadio] Heartbeat failed:', error);
    }
  }, [walletAddress, user?.fid, isPlaying, radioState?.currentSong]);

  // Initial fetch
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchRadioState(), fetchQueue()]);
      setLoading(false);
    };
    init();
  }, [fetchRadioState, fetchQueue]);

  // Poll for updates
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchRadioState();
      fetchQueue();
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchRadioState, fetchQueue]);

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

  // Handle audio play/pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Handle mute toggle
  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Queue a song
  const handleQueueSong = async (masterTokenId: string, tipAmount: number = 0) => {
    if (!walletAddress) return;

    setQueueing(true);
    try {
      const response = await fetch('/api/live-radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'queue_song',
          userAddress: walletAddress,
          userFid: user?.fid,
          tokenId: masterTokenId,
          txHash: 'pending', // In production, would be actual tx hash
        }),
      });

      const data = await response.json();
      if (data.success) {
        fetchQueue();
        setShowQueueModal(false);
      }
    } catch (error) {
      console.error('[LiveRadio] Queue failed:', error);
    } finally {
      setQueueing(false);
    }
  };

  // Claim rewards
  const handleClaimRewards = async () => {
    if (!walletAddress || pendingRewards === '0') return;

    setClaimingRewards(true);
    try {
      // In production, this would call the smart contract
      console.log('[LiveRadio] Claiming rewards:', pendingRewards);
      setPendingRewards('0');
    } catch (error) {
      console.error('[LiveRadio] Claim failed:', error);
    } finally {
      setClaimingRewards(false);
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 border border-purple-500/30 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Live Radio</h2>
              <p className="text-xs text-gray-400">World Cup 2026 Jukebox</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
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
                </div>

                {/* Current Song */}
                {radioState?.currentSong ? (
                  <div className="bg-black/40 rounded-2xl p-4 border border-purple-500/20">
                    <div className="flex gap-4">
                      <div className="w-20 h-20 rounded-xl bg-purple-500/20 overflow-hidden flex-shrink-0">
                        {radioState.currentSong.imageUrl ? (
                          <img
                            src={radioState.currentSong.imageUrl}
                            alt={radioState.currentSong.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music2 className="w-8 h-8 text-purple-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold truncate">{radioState.currentSong.name}</p>
                        <p className="text-sm text-gray-400 truncate">{radioState.currentSong.artist}</p>
                        <p className="text-xs text-purple-400 mt-1">
                          Queued by: {radioState.currentSong.queuedBy.slice(0, 6)}...
                        </p>
                      </div>
                    </div>

                    {/* Audio Element */}
                    <audio
                      ref={audioRef}
                      src={radioState.currentSong.audioUrl}
                      onEnded={() => setIsPlaying(false)}
                    />

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
                      <button className="p-2 rounded-full hover:bg-purple-500/20 transition-colors opacity-50 cursor-not-allowed">
                        <SkipForward className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-black/40 rounded-2xl p-8 border border-purple-500/20 text-center">
                    <Music2 className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-400">No song playing</p>
                    <p className="text-xs text-gray-500 mt-1">Queue a song to start the party!</p>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => setShowQueueModal(true)}
                  className="p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 rounded-xl transition-all"
                >
                  <Plus className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                  <p className="text-sm text-white font-semibold">Queue Song</p>
                  <p className="text-xs text-gray-400">{pricing.queueSong} WMON (or free w/ license)</p>
                </button>
                <button
                  onClick={() => setShowVoiceNoteModal(true)}
                  className="p-3 bg-gradient-to-r from-pink-500/20 to-orange-500/20 hover:from-pink-500/30 hover:to-orange-500/30 border border-pink-500/30 rounded-xl transition-all"
                >
                  <Mic className="w-5 h-5 text-pink-400 mx-auto mb-1" />
                  <p className="text-sm text-white font-semibold">Voice Shoutout</p>
                  <p className="text-xs text-gray-400">{pricing.voiceNote} WMON (3-5 sec)</p>
                </button>
              </div>

              {/* Queue */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-400" />
                    Up Next
                  </h3>
                  <span className="text-xs text-gray-400">{queue.length} in queue</span>
                </div>
                {queue.length > 0 ? (
                  <div className="space-y-2">
                    {queue.slice(0, 5).map((song, index) => (
                      <div
                        key={song.id}
                        className="flex items-center gap-3 p-2 bg-black/20 rounded-lg border border-purple-500/10"
                      >
                        <span className="text-xs text-gray-500 w-5">{index + 1}</span>
                        <div className="w-10 h-10 rounded bg-purple-500/20 overflow-hidden flex-shrink-0">
                          {song.imageUrl ? (
                            <img src={song.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music2 className="w-4 h-4 text-purple-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{song.name}</p>
                          <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 text-sm py-4">Queue is empty</p>
                )}
              </div>

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
                    disabled={claimingRewards || pendingRewards === '0'}
                    className="w-full py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg font-semibold text-sm transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {claimingRewards ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Coins className="w-4 h-4" />
                        Claim TOURS Rewards
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Earn 0.1 TOURS/song • 10 TOURS for 7-day streak
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-purple-500/20 bg-black/40">
          <p className="text-xs text-gray-500 text-center">
            Powered by Pyth Entropy • Smart Contract on Monad
          </p>
        </div>
      </div>

      {/* Queue Song Sub-Modal */}
      {showQueueModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
          style={{ zIndex: 10000 }}
          onClick={() => setShowQueueModal(false)}
        >
          <div
            className="bg-gray-900 border border-purple-500/30 rounded-2xl max-w-sm w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-4">Queue a Song</h3>
            <p className="text-sm text-gray-400 mb-4">
              Select a song from your library or pay {pricing.queueSong} WMON to queue any song.
            </p>
            {/* In production, this would show user's owned songs or searchable list */}
            <div className="space-y-2 mb-4">
              <div className="p-3 bg-black/40 rounded-lg border border-purple-500/20 flex items-center gap-3">
                <Music2 className="w-8 h-8 text-purple-400" />
                <div className="flex-1">
                  <p className="text-sm text-white">Your Licensed Songs</p>
                  <p className="text-xs text-gray-400">Queue for free</p>
                </div>
                <Check className="w-5 h-5 text-green-400" />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowQueueModal(false)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleQueueSong('1')}
                disabled={queueing}
                className="flex-1 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
              >
                {queueing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Queue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Note Sub-Modal */}
      {showVoiceNoteModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
          style={{ zIndex: 10000 }}
          onClick={() => setShowVoiceNoteModal(false)}
        >
          <div
            className="bg-gray-900 border border-pink-500/30 rounded-2xl max-w-sm w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-4">Voice Shoutout</h3>
            <p className="text-sm text-gray-400 mb-4">
              Record a 3-5 second shoutout for {pricing.voiceNote} WMON, or a 30-second ad for 2 WMON.
            </p>
            <div className="space-y-3 mb-4">
              <button className="w-full p-4 bg-gradient-to-r from-pink-500/20 to-orange-500/20 hover:from-pink-500/30 hover:to-orange-500/30 border border-pink-500/30 rounded-xl transition-all text-left">
                <div className="flex items-center gap-3">
                  <Mic className="w-8 h-8 text-pink-400" />
                  <div>
                    <p className="text-white font-semibold">Quick Shoutout</p>
                    <p className="text-xs text-gray-400">3-5 seconds • {pricing.voiceNote} WMON</p>
                  </div>
                </div>
              </button>
              <button className="w-full p-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded-xl transition-all text-left">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-8 h-8 text-purple-400" />
                  <div>
                    <p className="text-white font-semibold">Voice Ad</p>
                    <p className="text-xs text-gray-400">30 seconds • 2 WMON</p>
                  </div>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowVoiceNoteModal(false)}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold text-sm transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
