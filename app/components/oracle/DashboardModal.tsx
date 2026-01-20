'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Music, Palette, Ticket, Users, ShoppingBag, MapPin, Play, DollarSign, TrendingUp, Headphones, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { getExplorerUrl } from '@/app/chains';

interface DashboardModalProps {
  onClose: () => void;
  onViewProfile?: (address: string) => void;
  isDarkMode?: boolean;
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';

interface Stats {
  totalNFTs: number;
  totalMusicNFTs: number;
  totalArtNFTs: number;
  totalPassports: number;
  totalExperiences: number;
  totalUsers: number;
  totalMusicLicensesPurchased: number;
}

interface StreamingStats {
  totalPlays: number;
  totalSalesWMON: string;
  uniqueListeners: number;
  uniqueArtists: number;
  recentPlays: {
    user: string;
    masterTokenId: string;
    duration: number;
    timestamp: number;
    txHash: string;
    songName?: string;
    artistAddress?: string;
  }[];
  recentSales: {
    licenseId: string;
    masterTokenId: string;
    buyer: string;
    price: string;
    priceFormatted: string;
    createdAt: string;
    txHash: string;
    songName?: string;
    artistAddress?: string;
  }[];
  topSongs: { tokenId: string; name: string; salesCount: number; artist: string; totalRevenue: string }[];
  topArtists: { address: string; totalSales: string; songCount: number; licensesSold: number }[];
}

// Helper to get country flag emoji
const getCountryFlag = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export const DashboardModal: React.FC<DashboardModalProps> = ({ onClose, onViewProfile, isDarkMode = true }) => {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'activity' | 'streaming'>('activity');
  const [stats, setStats] = useState<Stats | null>(null);
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(null);
  const [recentPassports, setRecentPassports] = useState<any[]>([]);
  const [recentMusic, setRecentMusic] = useState<any[]>([]);
  const [recentArt, setRecentArt] = useState<any[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingLoading, setStreamingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (activeTab === 'streaming' && !streamingStats) {
      loadStreamingStats();
    }
  }, [activeTab]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = `
        query GetDashboardData {
          GlobalStats(limit: 1) {
            totalMusicNFTs
            totalPassports
            totalExperiences
            totalUsers
            totalMusicLicensesPurchased
            lastUpdated
          }
          AllNFTs: MusicNFT(limit: 1000, where: {isBurned: {_eq: false}, owner: {_neq: "0x0000000000000000000000000000000000000000"}}) {
            id
            isArt
          }
          MusicNFT(limit: 8, order_by: {mintedAt: desc}, where: {isBurned: {_eq: false}, isArt: {_eq: false}}) {
            id
            tokenId
            owner
            artist
            name
            imageUrl
            price
            mintedAt
            txHash
          }
          ArtNFT: MusicNFT(limit: 8, order_by: {mintedAt: desc}, where: {isBurned: {_eq: false}, isArt: {_eq: true}}) {
            id
            tokenId
            owner
            artist
            name
            imageUrl
            price
            mintedAt
            txHash
          }
          PassportNFT(limit: 8, order_by: {mintedAt: desc}) {
            id
            tokenId
            owner
            countryCode
            mintedAt
            txHash
          }
          MusicLicense(limit: 8, order_by: {createdAt: desc}) {
            id
            licenseId
            masterTokenId
            licensee
            active
            createdAt
            txHash
          }
        }
      `;

      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) throw new Error(`API returned ${response.status}`);

      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0]?.message || 'Query failed');

      const globalStats = result.data?.GlobalStats?.[0];
      const allNFTs = result.data?.AllNFTs || [];

      if (globalStats) {
        setStats({
          totalNFTs: allNFTs.length,
          totalMusicNFTs: allNFTs.filter((n: any) => !n.isArt).length,
          totalArtNFTs: allNFTs.filter((n: any) => n.isArt).length,
          totalPassports: globalStats.totalPassports || 0,
          totalExperiences: globalStats.totalExperiences || 0,
          totalUsers: globalStats.totalUsers || 0,
          totalMusicLicensesPurchased: globalStats.totalMusicLicensesPurchased || 0,
        });
      }

      setRecentMusic(result.data?.MusicNFT || []);
      setRecentArt(result.data?.ArtNFT || []);
      setRecentPassports(result.data?.PassportNFT || []);
      setRecentPurchases(result.data?.MusicLicense || []);
    } catch (err: any) {
      console.error('[DashboardModal] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStreamingStats = async () => {
    setStreamingLoading(true);
    try {
      const response = await fetch('/api/streaming-stats?limit=15');
      const data = await response.json();
      if (data.success && data.stats) {
        setStreamingStats(data.stats);
      }
    } catch (err: any) {
      console.error('[DashboardModal] Streaming stats error:', err);
    } finally {
      setStreamingLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const handleAddressClick = (address: string) => {
    if (onViewProfile) {
      onViewProfile(address);
    }
  };

  const WalletLink = ({ address }: { address: string }) => (
    <button
      onClick={() => handleAddressClick(address)}
      className="text-purple-400 hover:text-purple-300 hover:underline transition-colors font-mono text-xs"
    >
      {address.slice(0, 6)}...{address.slice(-4)}
    </button>
  );

  if (!mounted) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${isDarkMode ? 'bg-black' : 'bg-white'}`}
      style={{ zIndex: 9999, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
      onClick={onClose}
    >
      <div
        className={`rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl ${isDarkMode ? 'bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-purple-500/30' : 'bg-white border border-gray-200'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600/30 to-blue-600/30 border-b border-purple-500/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
              <h2 className="text-xl font-bold text-white">Live Dashboard</h2>
              <span className="text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded-full">
                Powered by Envio
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={activeTab === 'streaming' ? loadStreamingStats : loadDashboardData}
                disabled={loading || streamingLoading}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${(loading || streamingLoading) ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'activity'
                  ? 'bg-purple-500/30 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Activity
            </button>
            <button
              onClick={() => setActiveTab('streaming')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'streaming'
                  ? 'bg-green-500/30 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Headphones className="w-4 h-4" />
              Streaming & Payments
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {activeTab === 'activity' ? (
            <>
              {/* Stats Grid */}
              {stats && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                  <StatCard icon={<Music className="w-4 h-4" />} label="Music" value={stats.totalMusicNFTs} color="purple" />
                  <StatCard icon={<Palette className="w-4 h-4" />} label="Art" value={stats.totalArtNFTs} color="cyan" />
                  <StatCard icon={<Ticket className="w-4 h-4" />} label="Passports" value={stats.totalPassports} color="pink" />
                  <StatCard icon={<ShoppingBag className="w-4 h-4" />} label="Purchases" value={stats.totalMusicLicensesPurchased} color="amber" />
                  <StatCard icon={<MapPin className="w-4 h-4" />} label="Experiences" value={stats.totalExperiences} color="green" />
                  <StatCard icon={<Users className="w-4 h-4" />} label="Users" value={stats.totalUsers} color="indigo" />
                </div>
              )}

          {/* Activity Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recent Music */}
            <ActivitySection title="Recent Music" icon="🎵" items={recentMusic} loading={loading}>
              {recentMusic.map((item) => (
                <div key={item.id} className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <p className="font-medium text-white text-sm truncate">{item.name || `Music #${item.tokenId}`}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-400">Artist: <WalletLink address={item.artist} /></span>
                    {item.txHash && (
                      <a href={getExplorerUrl(item.txHash)} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300">TX →</a>
                    )}
                  </div>
                </div>
              ))}
            </ActivitySection>

            {/* Recent Art */}
            <ActivitySection title="Recent Art" icon="🎨" items={recentArt} loading={loading}>
              {recentArt.map((item) => (
                <div key={item.id} className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                  <p className="font-medium text-white text-sm truncate">{item.name || `Art #${item.tokenId}`}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-400">Artist: <WalletLink address={item.artist} /></span>
                    {item.txHash && (
                      <a href={getExplorerUrl(item.txHash)} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300">TX →</a>
                    )}
                  </div>
                </div>
              ))}
            </ActivitySection>

            {/* Recent Passports */}
            <ActivitySection title="Recent Passports" icon="🎫" items={recentPassports} loading={loading}>
              {recentPassports.map((item) => (
                <div key={item.id} className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-lg flex items-center gap-3">
                  <span className="text-2xl">{item.countryCode ? getCountryFlag(item.countryCode) : '🌍'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">Passport #{item.tokenId}</p>
                    <span className="text-xs text-gray-400">Owner: <WalletLink address={item.owner} /></span>
                  </div>
                </div>
              ))}
            </ActivitySection>

            {/* Recent Purchases */}
            <ActivitySection title="Recent Purchases" icon="🛒" items={recentPurchases} loading={loading}>
              {recentPurchases.map((item) => (
                <div key={item.id} className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="font-medium text-white text-sm">License #{item.licenseId}</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-400">Buyer: <WalletLink address={item.licensee} /></span>
                    <span className={`text-xs px-2 py-0.5 rounded ${item.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {item.active ? 'Active' : 'Expired'}
                    </span>
                  </div>
                </div>
              ))}
            </ActivitySection>
          </div>

          {/* View Full Dashboard Link */}
          <div className="mt-6 text-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-500 hover:to-blue-500 transition-colors"
            >
              View Full Dashboard →
            </Link>
          </div>
            </>
          ) : (
            /* Streaming Stats Tab */
            <div className="space-y-6">
              {streamingLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin text-4xl mb-3">🎵</div>
                  <p className="text-gray-400">Loading streaming stats...</p>
                </div>
              ) : streamingStats ? (
                <>
                  {/* Streaming Stats Overview */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard icon={<Play className="w-4 h-4" />} label="Total Plays" value={streamingStats.totalPlays} color="green" />
                    <StatCard icon={<Headphones className="w-4 h-4" />} label="Listeners" value={streamingStats.uniqueListeners} color="cyan" />
                    <StatCard icon={<Users className="w-4 h-4" />} label="Artists" value={streamingStats.uniqueArtists} color="amber" />
                    <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 text-center">
                      <DollarSign className="w-4 h-4 mx-auto mb-1 text-green-400" />
                      <p className="text-xl font-bold text-white">{streamingStats.totalSalesWMON}</p>
                      <p className="text-xs text-gray-400">WMON Sales</p>
                    </div>
                  </div>

                  {/* Recent Plays and Payments */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Recent Plays */}
                    <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4">
                      <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                        <span>🎧</span> Recent Plays
                        <span className="text-xs font-normal text-gray-500">({streamingStats.recentPlays.length})</span>
                      </h4>
                      {streamingStats.recentPlays.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">No plays recorded yet</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {streamingStats.recentPlays.map((play, idx) => (
                            <div key={`${play.txHash}-${idx}`} className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                              <p className="font-medium text-white text-sm truncate">{play.songName || `Song #${play.masterTokenId}`}</p>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-gray-400">
                                  <WalletLink address={play.user} /> • {play.duration}s
                                </span>
                                <span className="text-xs text-gray-500">{formatTimeAgo(new Date(play.timestamp * 1000).toISOString())}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recent Sales (Artist Payments) */}
                    <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4">
                      <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                        <span>💰</span> Recent Sales
                        <span className="text-xs font-normal text-gray-500">({streamingStats.recentSales.length})</span>
                      </h4>
                      {streamingStats.recentSales.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">No sales recorded yet</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {streamingStats.recentSales.map((sale) => (
                            <div key={sale.licenseId} className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                              <div className="flex justify-between items-start">
                                <p className="font-medium text-white text-sm truncate flex-1">{sale.songName || `Song #${sale.masterTokenId}`}</p>
                                <span className="text-green-400 text-sm font-bold ml-2">{sale.priceFormatted} WMON</span>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-gray-400">Buyer: <WalletLink address={sale.buyer} /></span>
                                <span className="text-xs text-gray-500">{formatTimeAgo(sale.createdAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Songs & Artists */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Top Songs */}
                    <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4">
                      <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-purple-400" />
                        Top Songs by Sales
                      </h4>
                      {streamingStats.topSongs.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">No sales data yet</p>
                      ) : (
                        <div className="space-y-2">
                          {streamingStats.topSongs.slice(0, 5).map((song, idx) => (
                            <div key={song.tokenId} className="flex items-center gap-3 p-2 bg-purple-500/10 rounded-lg">
                              <span className="text-lg font-bold text-purple-400">#{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{song.name}</p>
                                <p className="text-xs text-gray-400">{song.salesCount} sales • {song.totalRevenue} WMON earned</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Top Artists */}
                    <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4">
                      <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-amber-400" />
                        Top Earning Artists
                      </h4>
                      {streamingStats.topArtists.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">No artist data yet</p>
                      ) : (
                        <div className="space-y-2">
                          {streamingStats.topArtists.slice(0, 5).map((artist, idx) => (
                            <div key={artist.address} className="flex items-center gap-3 p-2 bg-amber-500/10 rounded-lg">
                              <span className="text-lg font-bold text-amber-400">#{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <WalletLink address={artist.address} />
                                <p className="text-xs text-gray-400">{artist.songCount} songs • {artist.licensesSold} sold • {artist.totalSales} WMON</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-400">No streaming data available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// Stat Card Component
const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) => {
  const colorClasses: Record<string, string> = {
    purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30 text-purple-400',
    cyan: 'from-cyan-500/20 to-cyan-600/20 border-cyan-500/30 text-cyan-400',
    pink: 'from-pink-500/20 to-pink-600/20 border-pink-500/30 text-pink-400',
    amber: 'from-amber-500/20 to-amber-600/20 border-amber-500/30 text-amber-400',
    green: 'from-green-500/20 to-green-600/20 border-green-500/30 text-green-400',
    indigo: 'from-indigo-500/20 to-indigo-600/20 border-indigo-500/30 text-indigo-400',
  };

  return (
    <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} border text-center`}>
      <div className={`mx-auto mb-1 ${colorClasses[color].split(' ').pop()}`}>{icon}</div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
};

// Activity Section Component
const ActivitySection = ({ title, icon, items, loading, children }: { title: string; icon: string; items: any[]; loading: boolean; children: React.ReactNode }) => (
  <div className="bg-gray-800 border border-gray-700/50 rounded-xl p-4">
    <h4 className="font-bold text-white mb-3 flex items-center gap-2">
      <span>{icon}</span> {title}
      <span className="text-xs font-normal text-gray-500">({items.length})</span>
    </h4>
    {loading && items.length === 0 ? (
      <div className="text-center py-4">
        <div className="animate-spin text-2xl">⏳</div>
      </div>
    ) : items.length === 0 ? (
      <p className="text-gray-500 text-sm text-center py-4">No data yet</p>
    ) : (
      <div className="space-y-2 max-h-48 overflow-y-auto">{children}</div>
    )}
  </div>
);

export default DashboardModal;
