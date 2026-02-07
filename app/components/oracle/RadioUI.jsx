'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Radio,
  Music2,
  Users,
  TrendingUp,
  Flame,
  Zap,
  Volume2,
  SkipForward,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

/**
 * RadioUI - 2D Overlay for AgentWorld Radio
 *
 * Shows:
 * - Current track info (from contract)
 * - Top appreciated tracks
 * - Agent reactions feed
 * - Radio stats
 *
 * This is a HUD overlay for the 3D world, NOT a standalone modal.
 * It complements the 3D AgentRadio visualization.
 */

// =============================================================================
// TYPES (inline for JSX)
// =============================================================================

// TrackInfo: { tokenId, name, artist, imageUrl, entropy, isRandom, startedAt, duration }
// AgentAppreciation: { agentAddress, agentName, agentPersonality, appreciationScore, lastReaction, tipsGiven }
// QueuedTrack: { id, tokenId, name, artist, queuedBy, queuedAt, paidAmount, tipAmount }
// RadioStats: { isLive, totalSongsPlayed, totalListeners, totalTipsReceived, songPoolSize }

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function TrackProgress({ startedAt, duration }) {
  const [progress, setProgress] = useState(0);
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    const updateProgress = () => {
      const now = Date.now();
      const elapsed = (now - startedAt) / 1000;
      const pct = Math.min(100, (elapsed / duration) * 100);
      const rem = Math.max(0, duration - elapsed);
      setProgress(pct);
      setRemaining(Math.ceil(rem));
    };

    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [startedAt, duration]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
        <span>{formatTime(Math.floor((duration * progress) / 100))}</span>
        <span>-{formatTime(remaining)}</span>
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function AgentReactionBadge({ agent }) {
  const reactionEmojis = {
    dancing: '💃',
    nodding: '👍',
    tipping: '💰',
    cheering: '🎉',
    idle: '😐',
  };

  const personalityColors = {
    chaos: 'border-pink-500 bg-pink-500/20',
    conservative: 'border-blue-500 bg-blue-500/20',
    whale: 'border-yellow-500 bg-yellow-500/20',
    degen: 'border-orange-500 bg-orange-500/20',
    normie: 'border-gray-500 bg-gray-500/20',
  };

  const colorClass = personalityColors[agent.agentPersonality] || personalityColors.normie;

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${colorClass}`}>
      <span className="text-sm">{reactionEmojis[agent.lastReaction] || '?'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white font-medium truncate">{agent.agentName}</p>
        <p className="text-[8px] text-gray-400">{agent.appreciationScore}% vibing</p>
      </div>
      {agent.lastReaction === 'tipping' && (
        <span className="text-[9px] text-yellow-400 font-bold">+TIP</span>
      )}
    </div>
  );
}

function EntropyMeter({ entropy = 50 }) {
  const getEntropyLabel = (e) => {
    if (e < 30) return { label: 'Chill', color: 'text-blue-400' };
    if (e < 50) return { label: 'Steady', color: 'text-cyan-400' };
    if (e < 70) return { label: 'Energetic', color: 'text-purple-400' };
    return { label: 'Chaos', color: 'text-pink-500' };
  };

  const { label, color } = getEntropyLabel(entropy);

  return (
    <div className="flex items-center gap-2">
      <Zap className={`w-3 h-3 ${color}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between text-[9px] mb-0.5">
          <span className="text-gray-400">Entropy</span>
          <span className={`font-bold ${color}`}>{label}</span>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 transition-all duration-500"
            style={{ width: `${entropy}%` }}
          />
        </div>
      </div>
      <span className="text-[10px] text-gray-400 w-6 text-right">{entropy}%</span>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function RadioUI({
  currentTrack = null,
  queue = [],
  agentAppreciations = [],
  stats = null,
  lastEvent = null,
  loading = false,
  onQueueTrack,
  onSkipToRandom,
  onRefresh,
  minimized = false,
  onToggleMinimize,
  position = 'bottom-left', // 'bottom-left', 'bottom-right', 'top-left', 'top-right'
}) {
  const [expanded, setExpanded] = useState(false);
  const [reactionFeed, setReactionFeed] = useState([]);

  // Add new reactions to feed
  useEffect(() => {
    if (lastEvent && lastEvent.type === 'appreciation') {
      setReactionFeed(prev => [
        { ...lastEvent.data, id: Date.now() },
        ...prev.slice(0, 9), // Keep last 10
      ]);
    }
  }, [lastEvent]);

  // Position classes
  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-20 left-4',
    'top-right': 'top-20 right-4',
  };

  // Sort agents by appreciation score
  const topAgents = useMemo(() => {
    return [...agentAppreciations]
      .sort((a, b) => b.appreciationScore - a.appreciationScore)
      .slice(0, 5);
  }, [agentAppreciations]);

  // Active reactions (not idle)
  const activeReactions = useMemo(() => {
    return agentAppreciations.filter(a => a.lastReaction !== 'idle');
  }, [agentAppreciations]);

  if (minimized) {
    return (
      <button
        onClick={onToggleMinimize}
        className={`fixed ${positionClasses[position]} z-50 flex items-center gap-2 px-3 py-2 bg-purple-600/90 hover:bg-purple-500 rounded-full text-white text-sm font-medium shadow-lg transition-all backdrop-blur-sm`}
      >
        <Radio className="w-4 h-4" />
        {stats?.isLive && (
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        )}
        {currentTrack && (
          <span className="max-w-[100px] truncate text-xs">
            {currentTrack.name}
          </span>
        )}
        <ChevronUp className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50 w-72 max-h-[80vh] overflow-hidden bg-gray-900/95 backdrop-blur-md rounded-xl border border-purple-500/30 shadow-2xl`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/50 to-pink-900/50">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-purple-400" />
          <span className="text-white font-bold text-sm">Agent Radio</span>
          {stats?.isLive && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/20 rounded text-[9px] text-green-400 font-medium">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 text-gray-400 hover:text-white transition-colors rounded hover:bg-white/10"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {onToggleMinimize && (
            <button
              onClick={onToggleMinimize}
              className="p-1.5 text-gray-400 hover:text-white transition-colors rounded hover:bg-white/10"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 overflow-y-auto max-h-[60vh] space-y-3">
        {/* Current Track */}
        {currentTrack ? (
          <div className="bg-gray-800/50 rounded-lg p-3 border border-purple-500/20">
            <div className="flex gap-3">
              {/* Album art */}
              <div className="w-14 h-14 rounded-lg bg-purple-500/20 overflow-hidden flex-shrink-0">
                {currentTrack.imageUrl ? (
                  <img
                    src={currentTrack.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music2 className="w-6 h-6 text-purple-400" />
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {currentTrack.name || 'Unknown Track'}
                </p>
                <p className="text-gray-400 text-xs truncate">
                  {currentTrack.artist || 'Unknown Artist'}
                </p>
                {currentTrack.isRandom && (
                  <span className="inline-flex items-center gap-1 text-[9px] text-yellow-400 mt-0.5">
                    <Zap className="w-2.5 h-2.5" />
                    Pyth Random
                  </span>
                )}
              </div>
            </div>

            {/* Entropy meter */}
            <div className="mt-2">
              <EntropyMeter entropy={currentTrack.entropy || 50} />
            </div>

            {/* Progress bar */}
            <TrackProgress
              startedAt={currentTrack.startedAt}
              duration={currentTrack.duration || 180}
            />
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-lg p-4 text-center border border-purple-500/20">
            <Music2 className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No track playing</p>
            <p className="text-gray-500 text-xs mt-1">Queue a song to start!</p>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2">
          {onQueueTrack && (
            <button
              onClick={onQueueTrack}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-purple-300 text-xs font-medium transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Queue
            </button>
          )}
          {onSkipToRandom && (
            <button
              onClick={onSkipToRandom}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/30 rounded-lg text-pink-300 text-xs font-medium transition-all"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Random
            </button>
          )}
        </div>

        {/* Agent Reactions */}
        {activeReactions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-400" />
                Agent Reactions
              </h3>
              <span className="text-[10px] text-purple-400">
                {activeReactions.length} reacting
              </span>
            </div>
            <div className="space-y-1.5">
              {activeReactions.slice(0, 4).map((agent, i) => (
                <AgentReactionBadge key={agent.agentAddress || i} agent={agent} />
              ))}
            </div>
          </div>
        )}

        {/* Expandable: Queue + Stats */}
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between py-2 text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-xs font-medium">
              {expanded ? 'Hide Details' : 'Show Queue & Stats'}
            </span>
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {expanded && (
            <div className="space-y-3 pt-1">
              {/* Queue */}
              {queue.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">
                    Up Next ({queue.length})
                  </h4>
                  <div className="space-y-1">
                    {queue.slice(0, 3).map((track, i) => (
                      <div
                        key={track.id || i}
                        className="flex items-center gap-2 p-1.5 bg-gray-800/30 rounded"
                      >
                        <span className="text-[10px] text-gray-500 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-white truncate">{track.name}</p>
                          <p className="text-[9px] text-gray-500 truncate">{track.artist}</p>
                        </div>
                      </div>
                    ))}
                    {queue.length > 3 && (
                      <p className="text-[10px] text-gray-500 text-center">
                        +{queue.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-800/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-purple-400">
                      {stats.totalSongsPlayed || 0}
                    </p>
                    <p className="text-[9px] text-gray-500">Songs Played</p>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-pink-400">
                      {stats.totalListeners || 0}
                    </p>
                    <p className="text-[9px] text-gray-500">Listeners</p>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-yellow-400">
                      {stats.totalTipsReceived || '0'}
                    </p>
                    <p className="text-[9px] text-gray-500">Tips (WMON)</p>
                  </div>
                  <div className="bg-gray-800/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-cyan-400">
                      {stats.songPoolSize || 0}
                    </p>
                    <p className="text-[9px] text-gray-500">In Pool</p>
                  </div>
                </div>
              )}

              {/* Top Appreciators */}
              {topAgents.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                    Top Vibes
                  </h4>
                  <div className="space-y-1">
                    {topAgents.map((agent, i) => (
                      <div
                        key={agent.agentAddress || i}
                        className="flex items-center gap-2 text-[10px]"
                      >
                        <span className={`w-4 font-bold ${
                          i === 0 ? 'text-yellow-400' :
                          i === 1 ? 'text-gray-400' :
                          i === 2 ? 'text-orange-400' :
                          'text-gray-500'
                        }`}>
                          #{i + 1}
                        </span>
                        <span className="flex-1 text-white truncate">{agent.agentName}</span>
                        <span className="text-purple-400 font-medium">
                          {agent.appreciationScore}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-purple-500/20 bg-gray-900/50">
        <p className="text-[9px] text-gray-500 text-center">
          Agents listening - no human audio playback
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// COMPACT VERSION (for embedding in other UIs)
// =============================================================================

export function RadioUICompact({ currentTrack, stats, agentAppreciations }) {
  const activeCount = agentAppreciations?.filter(a => a.lastReaction !== 'idle').length || 0;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/80 rounded-lg border border-purple-500/20">
      {/* Status */}
      <div className="flex items-center gap-1.5">
        <Radio className="w-4 h-4 text-purple-400" />
        {stats?.isLive ? (
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        ) : (
          <span className="w-2 h-2 bg-gray-500 rounded-full" />
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        {currentTrack ? (
          <>
            <p className="text-xs text-white truncate">{currentTrack.name}</p>
            <p className="text-[10px] text-gray-400 truncate">{currentTrack.artist}</p>
          </>
        ) : (
          <p className="text-xs text-gray-400">No track playing</p>
        )}
      </div>

      {/* Agent reactions count */}
      {activeCount > 0 && (
        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/20 rounded text-[10px] text-purple-300">
          <Users className="w-3 h-3" />
          {activeCount}
        </div>
      )}

      {/* Entropy indicator */}
      {currentTrack && (
        <div className="flex items-center gap-1">
          <Zap className={`w-3 h-3 ${
            currentTrack.entropy > 70 ? 'text-pink-400' :
            currentTrack.entropy > 40 ? 'text-purple-400' :
            'text-blue-400'
          }`} />
          <span className="text-[10px] text-gray-400">{currentTrack.entropy}%</span>
        </div>
      )}
    </div>
  );
}
