'use client';

import { useState, useEffect } from 'react';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

export default function DashboardPage() {
  const [stats, setStats] = useState({ musicNFTs: 0, passports: 0, users: 0 });
  const [recentPassports, setRecentPassports] = useState<any[]>([]);
  const [recentMusic, setRecentMusic] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000); // Auto-refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // FIXED: Use mintedAt instead of blockTimestamp to match schema
      const query = `
        query GetDashboardData {
          MusicNFT(limit: 5, order_by: {mintedAt: desc}) {
            id
            tokenId
            owner
            artist
            tokenURI
            mintedAt
            txHash
          }
          PassportNFT(limit: 5, order_by: {mintedAt: desc}) {
            id
            tokenId
            owner
            countryCode
            mintedAt
            txHash
          }
          UserStats(limit: 1) {
            id
            address
            totalNFTs
          }
        }
      `;

      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Envio API returned ${response.status}`);
      }

      const result = await response.json();
      
      if (result.errors) {
        console.error('GraphQL errors:', result.errors);
        throw new Error(result.errors[0]?.message || 'GraphQL query failed');
      }

      const music = result.data?.MusicNFT || [];
      const passports = result.data?.PassportNFT || [];
      const users = result.data?.UserStats || [];

      setStats({
        musicNFTs: music.length,
        passports: passports.length,
        users: users.length,
      });

      setRecentMusic(music);
      setRecentPassports(passports);

      console.log('✅ Dashboard data loaded:', { music: music.length, passports: passports.length });
    } catch (error: any) {
      console.error('❌ Error loading dashboard data:', error);
      setError(error.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">📊 Live Dashboard</h1>
              <p className="text-gray-600 mt-2">Real-time stats powered by Envio indexer</p>
            </div>
            <button
              onClick={loadDashboardData}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {loading ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">⚠️ {String(error)}</p>
              <button
                onClick={loadDashboardData}
                className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border-2 border-blue-200">
              <div className="text-4xl mb-2">🎵</div>
              <p className="text-4xl font-bold text-blue-600">{stats.musicNFTs}</p>
              <p className="text-sm text-gray-600 mt-1">Music NFTs</p>
            </div>
            <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border-2 border-purple-200">
              <div className="text-4xl mb-2">🎫</div>
              <p className="text-4xl font-bold text-purple-600">{stats.passports}</p>
              <p className="text-sm text-gray-600 mt-1">Passports</p>
            </div>
            <div className="p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border-2 border-green-200">
              <div className="text-4xl mb-2">👥</div>
              <p className="text-4xl font-bold text-green-600">{stats.users}</p>
              <p className="text-sm text-gray-600 mt-1">Active Users</p>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Passports */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">🎫 Recent Passports</h2>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : recentPassports.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600">No passports yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentPassports.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 bg-purple-50 border-2 border-purple-200 rounded-lg hover:border-purple-400 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-purple-900">
                            {item.countryCode ? `${getCountryFlag(item.countryCode)} ` : '🌍 '}
                            Passport #{item.tokenId}
                          </p>
                          <p className="text-xs text-purple-700 mt-1">
                            {String(item.owner).slice(0, 6)}...{String(item.owner).slice(-4)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(item.mintedAt).toLocaleString()}
                          </p>
                        </div>
                        {item.txHash && (
                          <a
                            href={`https://testnet.monadexplorer.com/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-all"
                          >
                            View TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Music */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">🎵 Recent Music NFTs</h2>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : recentMusic.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600">No music NFTs yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentMusic.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg hover:border-blue-400 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-blue-900">🎵 Music NFT #{item.tokenId}</p>
                          <p className="text-xs text-blue-700 mt-1">
                            Owner: {String(item.owner).slice(0, 6)}...{String(item.owner).slice(-4)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(item.mintedAt).toLocaleString()}
                          </p>
                        </div>
                        {item.txHash && (
                          <a
                            href={`https://testnet.monadexplorer.com/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-all"
                          >
                            View TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-6 text-center">
            Live data from Envio indexer • Auto-refreshes every 10s • Powered by Monad testnet
          </p>
        </div>
      </div>
    </div>
  );
}

function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
