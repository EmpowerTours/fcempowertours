'use client';

import React, { useRef, useEffect, useState, Suspense, Component, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Minimize2, Maximize2, Radio, Users, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
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
// ERROR BOUNDARY
// =============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ThreeErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AgentWorld3D] Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// =============================================================================
// API FETCHER
// =============================================================================

const fetcher = (url: string) => fetch(url).then(res => res.json());

// =============================================================================
// 3D SCENE (Lazy loaded)
// =============================================================================

const ThreeScene = React.lazy(() => import('./AgentWorld3DScene'));

// =============================================================================
// FALLBACK 2D VIEW
// =============================================================================

function Fallback2DView({ worldState, agents, activeThreshold }: {
  worldState: WorldState | null;
  agents: WorldAgent[];
  activeThreshold: number;
}) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900 p-4 overflow-auto">
      <div className="flex items-center gap-2 mb-4 text-yellow-500">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">3D view unavailable - showing 2D fallback</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">{worldState?.agents?.total || 0}</div>
          <div className="text-xs text-gray-400">Total Agents</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{worldState?.agents?.active || 0}</div>
          <div className="text-xs text-gray-400">Active Now</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-cyan-400">{worldState?.economy?.recentSongs?.length || 0}</div>
          <div className="text-xs text-gray-400">Music NFTs</div>
        </div>
      </div>

      {/* Agent List */}
      <div className="space-y-2">
        <h3 className="text-white font-semibold">Agents</h3>
        {agents.slice(0, 10).map((agent, i) => {
          const isActive = agent.lastActionAt > activeThreshold;
          return (
            <div key={agent.address} className={`flex items-center gap-3 p-2 rounded-lg ${isActive ? 'bg-green-900/30' : 'bg-gray-800/50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold`}
                   style={{ backgroundColor: `hsl(${i * 37 % 360}, 60%, 40%)` }}>
                {agent.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-white text-sm">{agent.name}</div>
                <div className="text-gray-400 text-xs">{agent.totalActions} actions</div>
              </div>
              {isActive && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
            </div>
          );
        })}
      </div>
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
  const [use3D, setUse3D] = useState(true);

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
      <div className="fixed bottom-20 right-4 z-[9999]" style={{ pointerEvents: 'auto' }}>
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

  // Full modal - truly fullscreen
  return createPortal(
    <div
      className="fixed inset-0 z-[9998] overflow-hidden"
      style={{ backgroundColor: '#0a0a1a' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`absolute inset-0 ${
          isDarkMode ? 'bg-gray-900' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 ${
          isDarkMode ? 'bg-gray-900/80' : 'bg-white/80'
        } backdrop-blur-sm border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Agent World {use3D ? '3D' : '2D'}
              </h2>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {worldState?.agents?.total || 0} agents • {worldState?.agents?.active || 0} active
                {worldState?.economy?.radioActive && ' • Radio Live'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 3D/2D Toggle */}
            <button
              onClick={() => setUse3D(!use3D)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                use3D ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}
            >
              {use3D ? '3D' : '2D'}
            </button>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className={`p-2 rounded-full transition-colors ${
                isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
              }`}
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

        {/* 3D/2D Canvas */}
        <div className="w-full h-full pt-14">
          {hasError ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-900">
              <div className="text-center">
                <p className="text-red-400 mb-2">Failed to load world data</p>
                <button onClick={handleRefresh} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm">
                  Retry
                </button>
              </div>
            </div>
          ) : use3D ? (
            <ThreeErrorBoundary
              fallback={<Fallback2DView worldState={worldState} agents={agents} activeThreshold={activeThreshold} />}
            >
              <Suspense fallback={
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Loading 3D World...</p>
                  </div>
                </div>
              }>
                <ThreeScene worldState={worldState} agents={agents} />
              </Suspense>
            </ThreeErrorBoundary>
          ) : (
            <Fallback2DView worldState={worldState} agents={agents} activeThreshold={activeThreshold} />
          )}
        </div>

        {/* Event Feed */}
        <div className={`absolute bottom-0 left-0 right-0 z-10 px-4 py-2 ${
          isDarkMode ? 'bg-gray-900/80' : 'bg-white/80'
        } backdrop-blur-sm border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-medium text-gray-500">Recent:</span>
            {(worldState?.recentEvents || []).slice(0, 3).map((event: WorldEvent) => (
              <div
                key={event.id}
                className={`flex-shrink-0 px-2 py-1 rounded-full text-xs ${
                  event.type === 'enter' ? 'bg-green-500/20 text-green-400' :
                  event.type === 'action' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}
              >
                {event.agentName}: {event.description.slice(0, 30)}...
              </div>
            ))}
            {(!worldState?.recentEvents || worldState.recentEvents.length === 0) && (
              <span className="text-xs text-gray-600">No recent events</span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
