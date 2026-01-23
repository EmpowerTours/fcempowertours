'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';  // For internal routing

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

interface Stats {
  totalMusicNFTs: number;
  totalPassports: number;
  totalItineraries: number;
  totalItineraryPurchases: number;
  totalUsers: number;
  recentActivity: Array<{
    id: string;
    type: 'music' | 'passport' | 'itinerary' | 'purchase';
    description: string;
    timestamp: string;
    address: string;
  }>;
}

export default function EnvioDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const query = `
        query {
          GlobalStats {
            id
            totalMusicNFTs
            totalPassports
            totalItineraries
            totalItineraryPurchases
            totalUsers
            lastUpdated
          }
          MusicNFT(limit: 5, order_by: {mintedAt: desc}) {
            id
            tokenId
            owner
            mintedAt
          }
          PassportNFT(limit: 5, order_by: {mintedAt: desc}) {
            id
            tokenId
            owner
            mintedAt
          }
          Itinerary(limit: 5, order_by: {createdAt: desc}) {
            id
            itineraryId
            creator
            description
            price
            createdAt
          }
          ItineraryPurchase(limit: 5, order_by: {timestamp: desc}) {
            id
            buyer
            timestamp
            itinerary {
              description
              price
            }
          }
        }
      `;
      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      const { data } = result;
      const globalStats = data.GlobalStats?.[0] || {
        totalMusicNFTs: 0,
        totalPassports: 0,
        totalItineraries: 0,
        totalItineraryPurchases: 0,
        totalUsers: 0,
      };
      // Combine all recent activity
      const recentActivity = [
        ...(data.MusicNFT || []).map((m: any) => ({
          id: m.id,
          type: 'music' as const,
          description: `Music NFT #${m.tokenId}`,
          timestamp: m.mintedAt,
          address: m.owner,
        })),
        ...(data.PassportNFT || []).map((p: any) => ({
          id: p.id,
          type: 'passport' as const,
          description: `Passport #${p.tokenId}`,
          timestamp: p.mintedAt,
          address: p.owner,
        })),
        ...(data.Itinerary || []).map((i: any) => ({
          id: i.id,
          type: 'itinerary' as const,
          description: i.description || `Itinerary #${i.itineraryId}`,
          timestamp: i.createdAt,
          address: i.creator,
        })),
        ...(data.ItineraryPurchase || []).map((p: any) => ({
          id: p.id,
          type: 'purchase' as const,
          description: `Purchased: ${p.itinerary.description || 'Itinerary'}`,
          timestamp: p.timestamp,
          address: p.buyer,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);
      setStats({
        totalMusicNFTs: globalStats.totalMusicNFTs,
        totalPassports: globalStats.totalPassports,
        totalItineraries: globalStats.totalItineraries,
        totalItineraryPurchases: globalStats.totalItineraryPurchases,
        totalUsers: globalStats.totalUsers,
        recentActivity,
      });
      setError(null);
    } catch (err: any) {
      console.error('Error fetching stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <p className="text-gray-600">Loading live data from Envio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 mb-4">⚠️ Error: {error}</div>
        <p className="text-sm text-gray-600 mb-4">
          Make sure the Envio indexer is running: <code className="bg-gray-100 px-2 py-1 rounded">pnpm dev</code>
        </p>
        <button
          onClick={() => {
            setLoading(true);
            fetchStats();
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'music': return '🎵';
      case 'passport': return '🎫';
      case 'itinerary': return '🗺️';
      case 'purchase': return '🛒';
      default: return '📦';
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'music': return 'bg-purple-50 border-purple-200';
      case 'passport': return 'bg-blue-50 border-blue-200';
      case 'itinerary': return 'bg-green-50 border-green-200';
      case 'purchase': return 'bg-orange-50 border-orange-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-4xl font-bold">{stats?.totalMusicNFTs || 0}</div>
          <div className="text-purple-100 mt-2">🎵 Music NFTs</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-4xl font-bold">{stats?.totalPassports || 0}</div>
          <div className="text-blue-100 mt-2">🎫 Passports</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-4xl font-bold">{stats?.totalItineraries || 0}</div>
          <div className="text-green-100 mt-2">🗺️ Itineraries</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-4xl font-bold">{stats?.totalItineraryPurchases || 0}</div>
          <div className="text-orange-100 mt-2">🛒 Purchases</div>
        </div>
        <div className="bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-xl p-6 shadow-lg">
          <div className="text-4xl font-bold">{stats?.totalUsers || 0}</div>
          <div className="text-pink-100 mt-2">👥 Users</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">🔥 Recent Activity</h2>
        {!stats?.recentActivity || stats.recentActivity.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎵</div>
            <p className="text-gray-500 text-lg mb-4">No activity yet</p>
            <p className="text-gray-400 text-sm mb-6">Be the first to mint or create!</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/nft">
                <a className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">
                  🎵 Mint Music
                </a>
              </Link>
              <Link href="/passport">
                <a className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                  🎫 Mint Passport
                </a>
              </Link>
              <Link href="/itinerary">
                <a className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                  🗺️ Create Itinerary
                </a>
              </Link>
              <Link href="/market">
                <a className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
                  🛒 Browse Market
                </a>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {stats.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all hover:shadow-md ${getActivityColor(activity.type)}`}
              >
                <div className="text-3xl">{getActivityIcon(activity.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{activity.description}</p>
                  <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                    <span className="font-mono text-xs">
                      {activity.address.slice(0, 6)}...{activity.address.slice(-4)}
                    </span>
                    <span className="text-xs">{new Date(activity.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                <a
                  href={`https://monadscan.com/address/${activity.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 font-medium text-sm whitespace-nowrap"
                >
                  View →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Indicator */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Live data from Envio indexer
        </div>
        <p className="text-xs text-gray-500 mt-2">Updates every 10 seconds • Powered by Monad testnet</p>
      </div>
    </div>
  );
}
