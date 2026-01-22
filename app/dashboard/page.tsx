'use client';

import { useState, useEffect } from 'react';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

interface Stats {
  totalNFTs: number;
  totalMusicNFTs: number;
  totalArtNFTs: number;
  totalPassports: number;
  totalExperiences: number;
  totalUsers: number;
  totalMusicLicensesPurchased: number;
  lastUpdated: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentPassports, setRecentPassports] = useState<any[]>([]);
  const [recentMusic, setRecentMusic] = useState<any[]>([]);
  const [recentArt, setRecentArt] = useState<any[]>([]);
  const [recentMusicPurchases, setRecentMusicPurchases] = useState<any[]>([]);
  const [recentExperiences, setRecentExperiences] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 3000); // Update every 3s
    return () => clearInterval(interval);
  }, []);

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
          MusicNFT(limit: 10, order_by: {mintedAt: desc}, where: {isBurned: {_eq: false}, isArt: {_eq: false}, owner: {_neq: "0x0000000000000000000000000000000000000000"}}) {
            id
            tokenId
            owner
            artist
            tokenURI
            royaltyPercentage
            price
            totalSold
            active
            isArt
            isBurned
            mintedAt
            txHash
          }
          ArtNFT: MusicNFT(limit: 10, order_by: {mintedAt: desc}, where: {isBurned: {_eq: false}, isArt: {_eq: true}, owner: {_neq: "0x0000000000000000000000000000000000000000"}}) {
            id
            tokenId
            owner
            artist
            tokenURI
            royaltyPercentage
            price
            totalSold
            active
            isArt
            isBurned
            mintedAt
            txHash
          }
          PassportNFT(limit: 10, order_by: {mintedAt: desc}) {
            id
            tokenId
            owner
            countryCode
            mintedAt
            txHash
          }
          MusicLicense(limit: 10, order_by: {createdAt: desc}) {
            id
            licenseId
            masterTokenId
            licensee
            active
            createdAt
            txHash
            masterToken {
              tokenId
              artist
              price
            }
          }
          Experience(limit: 10, order_by: {createdAt: desc}) {
            id
            experienceId
            creator
            title
            city
            country
            price
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

      if (!response.ok) {
        throw new Error(`Envio API returned ${response.status}`);
      }

      const result = await response.json();

      if (result.errors) {
        console.error('GraphQL errors:', result.errors);
        throw new Error(result.errors[0]?.message || 'GraphQL query failed');
      }

      const globalStats = result.data?.GlobalStats?.[0];
      const allNFTs = result.data?.AllNFTs || [];
      const music = result.data?.MusicNFT || [];
      const art = result.data?.ArtNFT || [];
      const passports = result.data?.PassportNFT || [];
      const purchases = result.data?.MusicLicense || [];
      const experiences = result.data?.Experience || [];

      // Count from fetched data (non-burned only)
      const totalNFTCount = allNFTs.length;
      const totalMusicCount = allNFTs.filter((n: any) => !n.isArt).length;
      const totalArtCount = allNFTs.filter((n: any) => n.isArt).length;

      if (globalStats) {
        setStats({
          ...globalStats,
          totalNFTs: totalNFTCount,
          totalMusicNFTs: totalMusicCount,
          totalArtNFTs: totalArtCount,
        });
        setPulse(true);
        setTimeout(() => setPulse(false), 500);
        setUpdateCount(prev => prev + 1);
      }

      setRecentMusic(music);
      setRecentArt(art);
      setRecentPassports(passports);
      setRecentMusicPurchases(purchases);
      setRecentExperiences(experiences);

      console.log('✅ Dashboard data loaded:', {
        music: music.length,
        passports: passports.length,
        purchases: purchases.length,
        experiences: experiences.length,
        totalUsers: globalStats?.totalUsers,
        totalPurchased: globalStats?.totalMusicLicensesPurchased
      });
    } catch (error: any) {
      console.error('❌ Error loading dashboard data:', error);
      setError(error.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Envio Header Banner */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-0 right-0 w-40 h-40 bg-white rounded-full blur-3xl animate-pulse animation-delay-1000"></div>
          </div>
          <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-3 h-3 rounded-full bg-green-400 animate-pulse ${pulse ? 'scale-125' : ''} transition-transform`}></div>
                <h2 className="text-3xl font-bold">📊 Live Indexing Dashboard</h2>
              </div>
              <p className="text-white/90 text-sm">Powered by <span className="font-bold">Envio HyperIndex</span> on Monad Testnet</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-4xl font-bold">{updateCount}</div>
                <div className="text-xs text-white/80">Updates</div>
              </div>
              <button
                onClick={loadDashboardData}
                disabled={loading}
                className="px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 disabled:opacity-50 transition-all font-medium border border-white/30"
              >
                {loading ? '⏳ Loading...' : '🔄 Refresh'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <p className="text-red-700 font-medium">⚠️ {String(error)}</p>
            <button
              onClick={loadDashboardData}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <StatCard
              icon="📦"
              label="Total NFTs"
              value={stats.totalNFTs}
              gradient="from-slate-600 to-slate-700"
              pulse={pulse}
            />
            <StatCard
              icon="🎵"
              label="Music NFTs"
              value={stats.totalMusicNFTs}
              gradient="from-purple-500 to-purple-600"
              pulse={pulse}
            />
            <StatCard
              icon="🎨"
              label="Art NFTs"
              value={stats.totalArtNFTs}
              gradient="from-blue-500 to-cyan-600"
              pulse={pulse}
            />
            <StatCard
              icon="🎫"
              label="Passports"
              value={stats.totalPassports}
              gradient="from-pink-500 to-rose-600"
              pulse={pulse}
            />
            <StatCard
              icon="🎧"
              label="Purchases"
              value={stats.totalMusicLicensesPurchased}
              gradient="from-orange-500 to-amber-600"
              pulse={pulse}
            />
            <StatCard
              icon="🗺️"
              label="Experiences"
              value={stats.totalExperiences}
              gradient="from-green-500 to-emerald-600"
              pulse={pulse}
            />
            <StatCard
              icon="👥"
              label="Active Users"
              value={stats.totalUsers}
              gradient="from-indigo-500 to-violet-600"
              pulse={pulse}
            />
          </div>
        )}

        {/* Activity Feed */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Live Activity Stream
            </h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              Envio GraphQL • Auto-refresh: 3s
            </span>
          </div>

          {/* Activity Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">

            {/* Recent Passports */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                🎫 Recent Passports
                <span className="text-sm font-normal text-gray-500">({recentPassports.length})</span>
              </h4>
              {loading && recentPassports.length === 0 ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : recentPassports.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600">No passports yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentPassports.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg hover:border-purple-400 transition-all animate-slide-in"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">
                          {item.countryCode ? getCountryFlag(item.countryCode) : '🌍'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-purple-900">
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
                            href={`https://testnet.monadscan.com/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-all"
                          >
                            TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Music NFTs */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                🎵 Recent Music NFTs
                <span className="text-sm font-normal text-gray-500">({recentMusic.length})</span>
              </h4>
              {loading && recentMusic.length === 0 ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : recentMusic.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600">No music NFTs yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentMusic.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg hover:border-purple-400 transition-all animate-slide-in"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">🎵</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-purple-900">
                            Music NFT #{item.tokenId}
                          </p>
                          {item.artist && (
                            <p className="text-xs text-purple-700 mt-1">
                              🎤 {item.artist.slice(0, 20)}...
                            </p>
                          )}
                          {item.totalSold !== undefined && (
                            <p className="text-xs text-purple-700">
                              📊 {item.totalSold} sold
                            </p>
                          )}
                          {item.price && (
                            <p className="text-xs text-orange-600 font-semibold">
                              💰 {(Number(item.price) / 1e18).toFixed(2)} TOURS
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(item.mintedAt).toLocaleString()}
                          </p>
                        </div>
                        {item.txHash && (
                          <a
                            href={`https://testnet.monadscan.com/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-all"
                          >
                            TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Art NFTs */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                🎨 Recent Art NFTs
                <span className="text-sm font-normal text-gray-500">({recentArt.length})</span>
              </h4>
              {loading && recentArt.length === 0 ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : recentArt.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600">No art NFTs yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentArt.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg hover:border-blue-400 transition-all animate-slide-in"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">🎨</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-blue-900">
                            Art NFT #{item.tokenId}
                          </p>
                          {item.artist && (
                            <p className="text-xs text-blue-700 mt-1">
                              🎨 {item.artist.slice(0, 20)}...
                            </p>
                          )}
                          {item.totalSold !== undefined && (
                            <p className="text-xs text-blue-700">
                              📊 {item.totalSold} sold
                            </p>
                          )}
                          {item.price && (
                            <p className="text-xs text-orange-600 font-semibold">
                              💰 {(Number(item.price) / 1e18).toFixed(2)} TOURS
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(item.mintedAt).toLocaleString()}
                          </p>
                        </div>
                        {item.txHash && (
                          <a
                            href={`https://testnet.monadscan.com/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-all"
                          >
                            TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Music Purchases */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                🎧 Recent Purchases
                <span className="text-sm font-normal text-gray-500">({recentMusicPurchases.length})</span>
              </h4>
              {loading && recentMusicPurchases.length === 0 ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : recentMusicPurchases.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600">No purchases yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentMusicPurchases.map((item, idx) => {
                    const isActive = item.active;
                    return (
                      <div
                        key={item.id || idx}
                        className={`p-4 bg-gradient-to-r from-orange-50 to-amber-50 border-2 rounded-lg hover:border-orange-400 transition-all animate-slide-in ${
                          !isActive ? 'border-gray-300 opacity-60' : 'border-orange-200'
                        }`}
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <div className="flex items-start gap-4">
                          <div className="text-3xl">{isActive ? '🎧' : '⏱️'}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-orange-900">
                              License #{item.licenseId}
                            </p>
                            {item.masterToken?.artist && (
                              <p className="text-xs text-orange-700 mt-1">
                                🎤 {item.masterToken.artist.slice(0, 20)}...
                              </p>
                            )}
                            {item.masterToken?.price && (
                              <p className="text-xs text-orange-600 font-semibold">
                                💰 {(Number(item.masterToken.price) / 1e18).toFixed(2)} WMON
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              Licensee: {String(item.licensee).slice(0, 6)}...{String(item.licensee).slice(-4)}
                            </p>
                            <p className={`text-xs mt-1 ${isActive ? 'text-green-600' : 'text-red-600'}`}>
                              {isActive ? '✅ Active • Perpetual License' : '❌ Inactive'}
                            </p>
                          </div>
                          {item.txHash && (
                            <a
                              href={`https://testnet.monadscan.com/tx/${item.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 transition-all"
                            >
                              TX →
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Experiences */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                🗺️ Recent Experiences
                <span className="text-sm font-normal text-gray-500">({recentExperiences.length})</span>
              </h4>
              {loading && recentExperiences.length === 0 ? (
                <div className="text-center py-8">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              ) : recentExperiences.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600">No experiences yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentExperiences.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg hover:border-green-400 transition-all animate-slide-in"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">🗺️</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-green-900">
                            {item.title || `Experience #${item.experienceId}`}
                          </p>
                          <p className="text-xs text-green-700 mt-1">
                            📍 {item.city}, {item.country}
                          </p>
                          {item.price && (
                            <p className="text-xs text-orange-600 font-semibold">
                              💰 {(Number(item.price) / 1e18).toFixed(2)} WMON
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Creator: {String(item.creator).slice(0, 6)}...{String(item.creator).slice(-4)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {item.txHash && (
                          <a
                            href={`https://testnet.monadscan.com/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-all"
                          >
                            TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">
            Real-time blockchain indexing powered by <span className="font-bold text-purple-600">Envio</span>
          </p>
          <p className="text-xs text-gray-500">
            GraphQL Endpoint: <code className="bg-gray-100 px-2 py-1 rounded">{ENVIO_ENDPOINT}</code>
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.5s ease-out forwards;
        }
        .animation-delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
    </div>
  );
}

function StatCard({ icon, label, value, gradient, pulse }: any) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-xl p-8 text-white shadow-lg transform transition-all ${pulse ? 'scale-105' : 'scale-100'}`}>
      <div className="text-5xl mb-3">{icon}</div>
      <div className="text-4xl font-bold mb-2">{value}</div>
      <div className="text-sm opacity-90">{label}</div>
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
