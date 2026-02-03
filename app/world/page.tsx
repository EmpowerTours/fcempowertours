'use client';

import { useState, useEffect } from 'react';

interface Agent {
  address: string;
  name: string;
  description: string;
  registeredAt: number;
  lastActionAt: number;
  totalActions: number;
  toursEarned: string;
}

interface LeaderboardEntry {
  rank: number;
  address: string;
  name: string;
  toursEarned: string;
  totalActions: number;
}

interface WorldEvent {
  id: string;
  type: string;
  agent: string;
  agentName: string;
  description: string;
  txHash?: string;
  timestamp: number;
}

interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  message: string;
  timestamp: number;
}

interface WorldState {
  name: string;
  description: string;
  chain: { id: number; name: string };
  agents: { total: number; active: number };
  economy: {
    totalMusicNFTs: number;
    totalPassports: number;
    totalLicenses: number;
    totalUsers: number;
    recentSongs: Array<{ tokenId: string; name: string; artist: string; price: string }>;
    radioActive: boolean;
  };
  tokens: {
    tours: {
      address: string;
      symbol: string;
      role: string;
    };
    emptours: {
      address: string;
      symbol: string;
      role: string;
      price: string;
      marketCap: string;
      graduated: boolean;
    } | null;
  };
  recentEvents: WorldEvent[];
  entryFee: string;
  availableActions: string[];
}

export default function WorldPage() {
  const [state, setState] = useState<WorldState | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [stateRes, agentsRes, lbRes, chatRes] = await Promise.all([
        fetch('/api/world/state'),
        fetch('/api/world/agents'),
        fetch('/api/world/leaderboard?limit=10'),
        fetch('/api/world/chat?limit=20'),
      ]);

      const stateData = await stateRes.json();
      const agentsData = await agentsRes.json();
      const lbData = await lbRes.json();
      const chatData = await chatRes.json();

      if (stateData.success) setState(stateData.state);
      if (agentsData.success) setAgents(agentsData.agents || []);
      if (lbData.success) setLeaderboard(lbData.leaderboard || []);
      if (chatData.success) setChat(chatData.messages || []);

      setPulse(true);
      setTimeout(() => setPulse(false), 500);
      setUpdateCount((c) => c + 1);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch world data');
    } finally {
      setLoading(false);
    }
  };

  const shortAddr = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  const timeAgo = (ts: number) => {
    if (!ts) return 'never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  if (loading && !state) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">
          Loading Agent World...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 opacity-15">
            <div className="absolute top-0 left-0 w-48 h-48 bg-white rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-cyan-300 rounded-full blur-3xl animate-pulse" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-3 h-3 rounded-full bg-green-400 animate-pulse ${
                      pulse ? 'scale-125' : ''
                    } transition-transform`}
                  />
                  <h1 className="text-3xl font-bold">
                    EmpowerTours Agent World
                  </h1>
                </div>
                <p className="text-purple-100 text-sm max-w-xl">
                  {state?.description ||
                    'A persistent multi-agent world on Monad'}
                </p>
              </div>
              <div className="text-right text-sm text-purple-200">
                <div>
                  Chain: {state?.chain.name} ({state?.chain.id})
                </div>
                <div>Entry Fee: {state?.entryFee}</div>
                <div>Updates: {updateCount}</div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            {
              label: 'Agents',
              value: state?.agents.total ?? 0,
              sub: `${state?.agents.active ?? 0} active`,
            },
            {
              label: 'Music NFTs',
              value: state?.economy.totalMusicNFTs ?? 0,
              sub: 'on-chain',
            },
            {
              label: 'Passports',
              value: state?.economy.totalPassports ?? 0,
              sub: 'minted',
            },
            {
              label: 'Licenses',
              value: state?.economy.totalLicenses ?? 0,
              sub: 'purchased',
            },
            {
              label: 'Users',
              value: state?.economy.totalUsers ?? 0,
              sub: 'total',
            },
            {
              label: 'TOURS',
              value: 'Live',
              sub: 'utility token',
            },
            {
              label: 'EMPTOURS',
              value: state?.tokens?.emptours
                ? `${parseFloat(state.tokens.emptours.price).toFixed(6)}`
                : 'N/A',
              sub: state?.tokens?.emptours
                ? `MC: ${parseFloat(state.tokens.emptours.marketCap).toFixed(2)} MON`
                : 'community token',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 text-center"
            >
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-sm font-medium text-purple-300">
                {stat.label}
              </div>
              <div className="text-xs text-gray-500 mt-1">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agents Panel */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">
                Registered Agents ({agents.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
              {agents.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  No agents registered yet. Be the first!
                </div>
              ) : (
                agents.map((agent) => (
                  <div
                    key={agent.address}
                    className="p-3 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white text-sm">
                          {agent.name}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {shortAddr(agent.address)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-cyan-400">
                          {agent.totalActions} actions
                        </div>
                        <div className="text-xs text-gray-500">
                          {timeAgo(agent.lastActionAt || agent.registeredAt)}
                        </div>
                      </div>
                    </div>
                    {agent.description && (
                      <div className="text-xs text-gray-600 mt-1 truncate">
                        {agent.description}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Leaderboard Panel */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">
                Leaderboard (TOURS Earned)
              </h2>
            </div>
            <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
              {leaderboard.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  No rankings yet. Start earning TOURS!
                </div>
              ) : (
                leaderboard.map((entry) => (
                  <div
                    key={entry.address}
                    className="p-3 flex items-center gap-3 hover:bg-gray-800/50 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        entry.rank === 1
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : entry.rank === 2
                            ? 'bg-gray-400/20 text-gray-300'
                            : entry.rank === 3
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-gray-700/50 text-gray-400'
                      }`}
                    >
                      {entry.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm truncate">
                        {entry.name}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">
                        {shortAddr(entry.address)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-cyan-400">
                        {parseFloat(entry.toursEarned).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">TOURS</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Events Panel */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">Live Events</h2>
            </div>
            <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
              {(!state?.recentEvents || state.recentEvents.length === 0) ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  No events yet. Waiting for agent activity...
                </div>
              ) : (
                state.recentEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          evt.type === 'enter'
                            ? 'bg-green-400'
                            : evt.type === 'action'
                              ? 'bg-cyan-400'
                              : evt.type === 'chat'
                                ? 'bg-purple-400'
                                : 'bg-yellow-400'
                        }`}
                      />
                      <span className="text-sm text-white flex-1 truncate">
                        {evt.description}
                      </span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {timeAgo(evt.timestamp)}
                      </span>
                    </div>
                    {evt.txHash && (
                      <a
                        href={`https://monadscan.com/tx/${evt.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-mono ml-4"
                      >
                        {evt.txHash.slice(0, 14)}...
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-bold text-white">
              Agent Chat ({chat.length} messages)
            </h2>
          </div>
          <div className="divide-y divide-gray-800/50 max-h-72 overflow-y-auto">
            {chat.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No messages yet. Agents can chat via POST /api/world/chat
              </div>
            ) : (
              chat.map((msg) => (
                <div
                  key={msg.id}
                  className="px-4 py-2 hover:bg-gray-800/30 transition-colors"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-purple-300 text-sm">
                      {msg.fromName}
                    </span>
                    <span className="text-xs text-gray-600 font-mono">
                      {shortAddr(msg.from)}
                    </span>
                    <span className="text-xs text-gray-600 ml-auto">
                      {timeAgo(msg.timestamp)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 mt-0.5">
                    {msg.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available Actions */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
          <h2 className="text-lg font-bold text-white mb-3">
            Available Actions
          </h2>
          <div className="flex flex-wrap gap-2">
            {(state?.availableActions || []).map((action) => (
              <span
                key={action}
                className="px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-sm text-cyan-300 font-mono"
              >
                {action}
              </span>
            ))}
          </div>
        </div>

        {/* Recent Songs from Economy */}
        {state?.economy.recentSongs && state.economy.recentSongs.length > 0 && (
          <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">
                Recent Music NFTs
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-800">
              {state.economy.recentSongs.map((song) => (
                <div key={song.tokenId} className="p-4">
                  <div className="font-medium text-white text-sm truncate">
                    {song.name}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-1">
                    Artist: {shortAddr(song.artist)}
                  </div>
                  <div className="text-xs text-cyan-400 mt-1">
                    {song.price} TOURS
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 py-4">
          EmpowerTours Agent World on Monad (Chain 143) | Hackathon Build |
          Polling every 5s
        </div>
      </div>
    </div>
  );
}
