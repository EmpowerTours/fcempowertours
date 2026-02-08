'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Music, Heart, Baby, Sparkles, TrendingUp, Loader2, Volume2 } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface MusicNFT {
  songId?: string;
  title: string;
  genre: string;
  mood: string;
  creatorName: string;
  creatorId: string;
  coverIpfsUrl?: string;
  nftTokenId?: number;
  avgAppreciation?: number;
  createdAt?: number;
}

interface BreedingPair {
  agent1: { id: string; name: string };
  agent2: { id: string; name: string };
  score1to2: number;
  score2to1: number;
  avgScore: number;
  eligible: boolean;
}

interface AgentActivity {
  type: 'music' | 'breeding' | 'appreciation' | 'coinflip';
  agentName: string;
  description: string;
  timestamp: number;
  coverUrl?: string;
}

/**
 * AgentEconomyPanel - Shows music NFTs, breeding pairs, and real-time agent activity
 * For use in the AgentWorld modal during demo recordings
 */
export function AgentEconomyPanel({ className = '' }: { className?: string }) {
  const [activeTab, setActiveTab] = useState<'music' | 'breeding' | 'activity'>('activity');
  const [activities, setActivities] = useState<AgentActivity[]>([]);

  // Fetch music data
  const { data: musicData, isLoading: musicLoading } = useSWR(
    '/api/agents/generate-music',
    fetcher,
    { refreshInterval: 10000 }
  );

  // Fetch breeding data
  const { data: breedingData, isLoading: breedingLoading } = useSWR(
    '/api/agents/breed',
    fetcher,
    { refreshInterval: 15000 }
  );

  // Parse music into activities
  useEffect(() => {
    if (musicData?.success && musicData.recentSongs) {
      const musicActivities: AgentActivity[] = musicData.recentSongs.map((song: any) => ({
        type: 'music' as const,
        agentName: song.creatorName || 'Unknown Agent',
        description: `Created "${song.title}" (${song.genre})`,
        timestamp: song.createdAt || Date.now(),
        coverUrl: song.coverIpfsUrl,
      }));
      setActivities(prev => {
        const existing = new Set(prev.map(a => a.description));
        const newActivities = musicActivities.filter(a => !existing.has(a.description));
        return [...newActivities, ...prev].slice(0, 20);
      });
    }
  }, [musicData]);

  const recentSongs: MusicNFT[] = musicData?.success ? musicData.recentSongs || [] : [];
  const eligiblePairs: BreedingPair[] = breedingData?.success ? breedingData.eligiblePairs || [] : [];
  const ineligiblePairs: BreedingPair[] = breedingData?.success ? breedingData.ineligiblePairs || [] : [];
  const totalBabies: number = breedingData?.totalBabies || 0;

  return (
    <div className={`bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gradient-to-r from-purple-900/50 to-pink-900/50">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-yellow-400" />
          Agent Economy
        </h3>
        <p className="text-gray-400 text-xs mt-1">Music NFTs • Breeding • Real-time Activity</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {[
          { id: 'activity', label: 'Live Activity', icon: TrendingUp },
          { id: 'music', label: 'Music NFTs', icon: Music },
          { id: 'breeding', label: 'Breeding', icon: Heart },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3 max-h-[400px] overflow-y-auto custom-scrollbar">
        {/* Live Activity Tab */}
        {activeTab === 'activity' && (
          <div className="space-y-2">
            {activities.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                <p className="text-sm">Waiting for agent activity...</p>
              </div>
            ) : (
              activities.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors"
                >
                  {activity.coverUrl ? (
                    <img
                      src={activity.coverUrl}
                      alt="Cover"
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      activity.type === 'music' ? 'bg-pink-500/20' :
                      activity.type === 'breeding' ? 'bg-red-500/20' :
                      'bg-purple-500/20'
                    }`}>
                      {activity.type === 'music' && <Music className="w-5 h-5 text-pink-400" />}
                      {activity.type === 'breeding' && <Heart className="w-5 h-5 text-red-400" />}
                      {activity.type === 'appreciation' && <Volume2 className="w-5 h-5 text-purple-400" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{activity.agentName}</p>
                    <p className="text-gray-400 text-xs truncate">{activity.description}</p>
                  </div>
                  <span className="text-gray-500 text-[10px] flex-shrink-0">
                    {formatTimeAgo(activity.timestamp)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Music NFTs Tab */}
        {activeTab === 'music' && (
          <div className="space-y-3">
            {musicLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-purple-400" />
                <p className="text-gray-500 text-sm">Loading music...</p>
              </div>
            ) : recentSongs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No music created yet</p>
                <p className="text-xs mt-1">Broke agents create music to earn TOURS</p>
              </div>
            ) : (
              recentSongs.map((song, i) => (
                <div
                  key={song.songId || i}
                  className="flex gap-3 p-3 rounded-lg bg-gradient-to-r from-gray-800 to-gray-800/50 border border-gray-700 hover:border-purple-500/50 transition-colors"
                >
                  {/* Cover Art */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-700">
                    {song.coverIpfsUrl ? (
                      <img
                        src={song.coverIpfsUrl}
                        alt={song.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-8 h-8 text-gray-500" />
                      </div>
                    )}
                  </div>

                  {/* Song Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium text-sm truncate">{song.title}</h4>
                    <p className="text-gray-400 text-xs">by {song.creatorName}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] rounded">
                        {song.genre}
                      </span>
                      <span className="px-1.5 py-0.5 bg-pink-500/20 text-pink-300 text-[10px] rounded">
                        {song.mood}
                      </span>
                    </div>
                    {song.nftTokenId !== undefined && (
                      <p className="text-green-400 text-[10px] mt-1">
                        NFT #{song.nftTokenId}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Breeding Tab */}
        {activeTab === 'breeding' && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                <Baby className="w-5 h-5 mx-auto text-green-400 mb-1" />
                <p className="text-lg font-bold text-green-400">{totalBabies}</p>
                <p className="text-[10px] text-gray-400">Baby Agents Born</p>
              </div>
              <div className="p-3 rounded-lg bg-pink-500/10 border border-pink-500/30 text-center">
                <Heart className="w-5 h-5 mx-auto text-pink-400 mb-1" />
                <p className="text-lg font-bold text-pink-400">{eligiblePairs.length}</p>
                <p className="text-[10px] text-gray-400">Ready to Breed</p>
              </div>
            </div>

            {/* Eligible Pairs */}
            {eligiblePairs.length > 0 && (
              <div>
                <h4 className="text-green-400 text-xs font-semibold mb-2 flex items-center gap-1">
                  <Heart className="w-3 h-3" fill="currentColor" />
                  Eligible Pairs (&gt;70% mutual)
                </h4>
                {eligiblePairs.map((pair, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30 mb-2"
                  >
                    <span className="text-white text-sm font-medium">{pair.agent1.name}</span>
                    <Heart className="w-4 h-4 text-pink-400 animate-pulse" fill="currentColor" />
                    <span className="text-white text-sm font-medium">{pair.agent2.name}</span>
                    <span className="ml-auto text-green-400 text-xs font-bold">
                      {pair.avgScore.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Developing Pairs */}
            {ineligiblePairs.length > 0 && (
              <div>
                <h4 className="text-yellow-400 text-xs font-semibold mb-2">
                  Developing Appreciation
                </h4>
                {ineligiblePairs.slice(0, 5).map((pair, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 mb-1"
                  >
                    <span className="text-gray-300 text-xs">{pair.agent1.name}</span>
                    <span className="text-gray-500 text-xs">↔</span>
                    <span className="text-gray-300 text-xs">{pair.agent2.name}</span>
                    <span className="ml-auto text-yellow-400 text-xs">
                      {pair.avgScore.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {breedingLoading && (
              <div className="text-center py-4">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-pink-400" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with trigger button */}
      <div className="px-3 py-2 border-t border-gray-700 bg-gray-800/50">
        <p className="text-gray-500 text-[10px] text-center">
          Agents create music when broke • Breed when appreciation &gt;70%
        </p>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default AgentEconomyPanel;
