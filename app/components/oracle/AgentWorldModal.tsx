'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minimize2, Maximize2, Radio, Users, Loader2, RefreshCw, Music, Ticket, Zap, Globe } from 'lucide-react';
import useSWR from 'swr';

// =============================================================================
// TYPES
// =============================================================================

interface WorldAgent {
  address: string;
  name: string;
  lastActionAt: number;
  totalActions: number;
  toursEarned: string;
}

interface WorldEvent {
  id: string;
  type: 'enter' | 'action' | 'chat' | 'achievement';
  agent: string;
  agentName: string;
  description: string;
  timestamp: number;
}

interface WorldState {
  agents: { total: number; active: number };
  economy: {
    radioActive: boolean;
    recentSongs: Array<{ tokenId: string; name: string; price: string }>;
  };
  recentEvents: WorldEvent[];
}

interface AgentWorldModalProps {
  onClose: () => void;
  isDarkMode?: boolean;
  minimized?: boolean;
  setMinimized?: (v: boolean) => void;
}

// =============================================================================
// API FETCHER
// =============================================================================

const fetcher = (url: string) => fetch(url).then(res => res.json());

// =============================================================================
// ANIMATED COMPONENTS
// =============================================================================

function PulsingDot({ color, size = 'w-3 h-3' }: { color: string; size?: string }) {
  return (
    <span className="relative flex">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}></span>
      <span className={`relative inline-flex rounded-full ${size} ${color}`}></span>
    </span>
  );
}

function AgentAvatar({ agent, isActive, index }: { agent: WorldAgent; isActive: boolean; index: number }) {
  const hue = (index * 37) % 360;

  return (
    <div
      className={`relative flex flex-col items-center p-2 rounded-lg transition-all duration-300 ${
        isActive ? 'bg-green-500/20 ring-1 ring-green-500/50' : 'bg-gray-800/50'
      }`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
          isActive ? 'ring-2 ring-green-400' : ''
        }`}
        style={{ backgroundColor: `hsl(${hue}, 60%, 40%)` }}
      >
        {agent.name.slice(0, 2).toUpperCase()}
      </div>

      {/* Status indicator */}
      {isActive && (
        <div className="absolute -top-1 -right-1">
          <PulsingDot color="bg-green-500" size="w-2 h-2" />
        </div>
      )}

      {/* Name */}
      <span className={`mt-1 text-[10px] truncate max-w-[60px] ${isActive ? 'text-green-400' : 'text-gray-400'}`}>
        {agent.name.length > 8 ? agent.name.slice(0, 8) + '...' : agent.name}
      </span>
    </div>
  );
}

function MusicNFTCard({ song, index }: { song: { tokenId: string; name: string; price: string }; index: number }) {
  const priceNum = parseFloat(song.price);
  const bgColor = priceNum >= 300 ? 'from-yellow-500/30 to-yellow-600/10' :
                  priceNum >= 100 ? 'from-purple-500/30 to-purple-600/10' :
                  'from-blue-500/30 to-blue-600/10';
  const borderColor = priceNum >= 300 ? 'border-yellow-500/50' :
                      priceNum >= 100 ? 'border-purple-500/50' :
                      'border-blue-500/50';

  return (
    <div
      className={`p-3 rounded-lg bg-gradient-to-br ${bgColor} border ${borderColor} animate-float`}
      style={{ animationDelay: `${index * 200}ms` }}
    >
      <div className="flex items-center gap-2">
        <Music className="w-4 h-4 text-white/70" />
        <span className="text-white text-sm font-medium truncate max-w-[100px]">{song.name}</span>
      </div>
      <div className="mt-1 text-yellow-400 text-xs">{song.price} WMON</div>
    </div>
  );
}

function EventItem({ event }: { event: WorldEvent }) {
  const typeColors = {
    enter: 'bg-green-500/20 text-green-400 border-green-500/30',
    action: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    chat: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    achievement: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  const typeIcons = {
    enter: <Users className="w-3 h-3" />,
    action: <Zap className="w-3 h-3" />,
    chat: <Radio className="w-3 h-3" />,
    achievement: <Ticket className="w-3 h-3" />,
  };

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs border ${typeColors[event.type]}`}>
      {typeIcons[event.type]}
      <span className="font-medium">{event.agentName}</span>
      <span className="opacity-70 truncate max-w-[150px]">{event.description}</span>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AgentWorldModal({
  onClose,
  isDarkMode = true,
  minimized = false,
  setMinimized
}: AgentWorldModalProps) {
  const [mounted, setMounted] = useState(false);

  // Fetch world state
  const { data: stateData, error: stateError, isLoading: stateLoading, mutate: refreshState } = useSWR(
    '/api/world/state',
    fetcher,
    { refreshInterval: 10000 }
  );

  // Fetch agents
  const { data: agentsData, error: agentsError, isLoading: agentsLoading, mutate: refreshAgents } = useSWR(
    '/api/world/agents',
    fetcher,
    { refreshInterval: 10000 }
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const worldState = stateData?.success ? stateData.state : null;
  const agents: WorldAgent[] = agentsData?.success ? agentsData.agents : [];
  const isLoading = stateLoading || agentsLoading;
  const hasError = stateError || agentsError;
  const activeThreshold = Date.now() - 5 * 60 * 1000;

  const handleRefresh = () => {
    refreshState();
    refreshAgents();
  };

  if (!mounted) return null;

  // Minimized view
  if (minimized) {
    return createPortal(
      <div
        className="fixed bottom-20 right-4 z-[9999]"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={() => setMinimized?.(false)}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-full text-white text-sm font-medium shadow-lg transition-all"
        >
          <Users className="w-4 h-4" />
          Agent World
          <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">
            {worldState?.agents?.total || 0}
          </span>
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>,
      document.body
    );
  }

  // Full modal
  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
    >
      <div
        className={`relative w-full max-w-4xl h-[80vh] rounded-2xl overflow-hidden ${
          isDarkMode ? 'bg-gray-900 border border-purple-500/30' : 'bg-white border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 ${
          isDarkMode ? 'bg-gray-900/90' : 'bg-white/90'
        } backdrop-blur-sm border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                EmpowerTours Agent World
              </h2>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {worldState?.agents?.total || 0} agents registered
                {worldState?.economy?.radioActive && ' • Radio Live'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Stats */}
            <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full text-xs ${
              isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
            }`}>
              <div className="flex items-center gap-1">
                <PulsingDot color="bg-green-500" size="w-2 h-2" />
                <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
                  {worldState?.agents?.active || 0} active
                </span>
              </div>
              {worldState?.economy?.radioActive && (
                <div className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-cyan-500" />
                  <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>LIVE</span>
                </div>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className={`p-2 rounded-full transition-colors ${
                isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Minimize */}
            {setMinimized && (
              <button
                onClick={() => setMinimized(true)}
                className={`p-2 rounded-full transition-colors ${
                  isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                }`}
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className={`p-2 rounded-full transition-colors ${
                isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full h-full pt-16 pb-16 overflow-y-auto">
          {hasError ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-red-400 mb-2">Failed to load world data</p>
                <button
                  onClick={handleRefresh}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : isLoading && !worldState ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Loading Agent World...</p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              {/* World Visualization */}
              <div className="relative h-64 rounded-xl bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 overflow-hidden">
                {/* Animated background stars */}
                <div className="absolute inset-0 overflow-hidden">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 2}s`,
                        opacity: Math.random() * 0.5 + 0.2,
                      }}
                    />
                  ))}
                </div>

                {/* Central Radio Tower */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                  <div className="relative">
                    {worldState?.economy?.radioActive && (
                      <>
                        <div className="absolute -inset-4 rounded-full border-2 border-cyan-500/30 animate-ping" />
                        <div className="absolute -inset-8 rounded-full border border-cyan-500/20 animate-pulse" />
                        <div className="absolute -inset-12 rounded-full border border-cyan-500/10 animate-pulse" style={{ animationDelay: '0.5s' }} />
                      </>
                    )}
                    <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 flex items-center justify-center shadow-lg shadow-purple-500/50">
                      <Radio className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  {worldState?.economy?.radioActive && (
                    <span className="mt-2 px-2 py-0.5 bg-red-500 rounded text-[10px] text-white font-bold animate-pulse">
                      LIVE
                    </span>
                  )}
                </div>

                {/* Lottery Booth */}
                <div className="absolute left-4 bottom-4 p-2 rounded-lg bg-gradient-to-r from-red-600/80 to-orange-600/80 border border-yellow-500/50">
                  <div className="flex items-center gap-1">
                    <Ticket className="w-4 h-4 text-yellow-400" />
                    <span className="text-white text-xs font-bold">LOTTERY</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {['red', 'green', 'blue', 'yellow', 'purple'].map((c, i) => (
                      <div
                        key={c}
                        className={`w-2 h-2 rounded-full bg-${c}-500 animate-bounce`}
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Monad Portal */}
                <div className="absolute right-4 bottom-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-purple-500 bg-purple-900/50 flex items-center justify-center animate-spin" style={{ animationDuration: '10s' }}>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 animate-pulse" />
                    </div>
                    <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-purple-400 whitespace-nowrap">MONAD</span>
                  </div>
                </div>
              </div>

              {/* Agents Grid */}
              <div>
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  Agents in World ({agents.length})
                </h3>
                {agents.length > 0 ? (
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {agents.slice(0, 16).map((agent, i) => (
                      <AgentAvatar
                        key={agent.address}
                        agent={agent}
                        isActive={agent.lastActionAt > activeThreshold}
                        index={i}
                      />
                    ))}
                    {agents.length > 16 && (
                      <div className="flex items-center justify-center p-2 rounded-lg bg-gray-800/50 text-gray-400 text-xs">
                        +{agents.length - 16} more
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No agents registered yet</p>
                )}
              </div>

              {/* Music NFTs */}
              {worldState?.economy?.recentSongs && worldState.economy.recentSongs.length > 0 && (
                <div>
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Music className="w-4 h-4 text-cyan-400" />
                    Music NFTs
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {worldState.economy.recentSongs.slice(0, 4).map((song: { tokenId: string; name: string; price: string }, i: number) => (
                      <MusicNFTCard key={song.tokenId} song={song} index={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Event Feed Footer */}
        <div className={`absolute bottom-0 left-0 right-0 z-10 px-4 py-2 ${
          isDarkMode ? 'bg-gray-900/90' : 'bg-white/90'
        } backdrop-blur-sm border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className={`text-xs font-medium flex-shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Recent:
            </span>
            {(worldState?.recentEvents || []).slice(0, 3).map((event: WorldEvent) => (
              <EventItem key={event.id} event={event} />
            ))}
            {(!worldState?.recentEvents || worldState.recentEvents.length === 0) && (
              <span className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                No recent events
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
