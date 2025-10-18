'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface Cast {
  text: string;
  author: {
    username: string;
    pfp_url?: string;
  };
  timestamp?: string;
}

export default function HomeClient() {
  const { ready, authenticated, user } = usePrivy();
  const [showSplash, setShowSplash] = useState(true);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [currentCastIndex, setCurrentCastIndex] = useState(0);
  const [isLoadingCasts, setIsLoadingCasts] = useState(false);
  const [musicCount, setMusicCount] = useState(0);
  const [passportCount, setPassportCount] = useState(0);
  const [loadingNFTs, setLoadingNFTs] = useState(false);

  const walletAddress = user?.wallet?.address;

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchNFTCounts = async () => {
      if (!walletAddress) return;

      setLoadingNFTs(true);
      try {
        const query = `
          query {
            UserStats(where: {address: {_eq: "${walletAddress.toLowerCase()}"}}) {
              musicNFTCount
              passportNFTCount
            }
          }
        `;

        const endpoint = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://fcempowertours-production-6551.up.railway.app/v1/graphql';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });

        const result = await response.json();
        const userStats = result.data?.UserStats?.[0];

        if (userStats) {
          setMusicCount(userStats.musicNFTCount || 0);
          setPassportCount(userStats.passportNFTCount || 0);
        }
      } catch (error) {
        console.error('Error fetching NFT counts:', error);
      } finally {
        setLoadingNFTs(false);
      }
    };

    fetchNFTCounts();
    const interval = setInterval(fetchNFTCounts, 10000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  useEffect(() => {
    const fetchCasts = async () => {
      setIsLoadingCasts(true);
      try {
        const res = await fetch('/api/recent-casts');
        if (!res.ok) {
          setCasts([
            {
              author: { username: 'empowertours' },
              text: '🌍 Welcome to EmpowerTours! Mint music NFTs and travel passports on Monad.',
            },
            {
              author: { username: 'empowertours' },
              text: '🎵 Create exclusive music experiences with token-gated content.',
            },
            {
              author: { username: 'empowertours' },
              text: '🎫 Collect digital passports from your travels around the world.',
            },
          ]);
          return;
        }
        const { casts: dataCasts } = await res.json();

        const relevantCasts = dataCasts?.filter((cast: any) =>
          String(cast.text || '').toLowerCase().includes('empowertours') ||
          String(cast.text || '').toLowerCase().includes('music') ||
          String(cast.text || '').toLowerCase().includes('nft') ||
          String(cast.text || '').toLowerCase().includes('passport')
        ) || [];

        setCasts(relevantCasts.length > 0 ? relevantCasts : dataCasts?.slice(0, 10) || []);
      } catch (error) {
        console.error('Failed to fetch casts:', error);
        setCasts([
          {
            author: { username: 'empowertours' },
            text: '🌍 Welcome to EmpowerTours! Connect to see the latest community updates.',
          },
        ]);
      } finally {
        setIsLoadingCasts(false);
      }
    };

    fetchCasts();
    const interval = setInterval(fetchCasts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!casts || casts.length === 0) return;

    const interval = setInterval(() => {
      setCurrentCastIndex((prev) => (prev + 1) % casts.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [casts]);

  if (showSplash) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: '#353B48' }}>
        <img 
          src="/images/splash.png" 
          alt="EmpowerTours" 
          className="w-[200px] h-[200px] mb-6 animate-pulse"
        />
        <h1 className="text-3xl font-bold text-white mb-2">EmpowerTours</h1>
        <p className="text-lg text-gray-300">Travel Stamp Buy Experiences</p>
        <div className="mt-8">
          <div className="flex gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 to-blue-900">
        <div className="text-6xl mb-4 animate-spin">⏳</div>
        <h1 className="text-2xl font-bold text-white">Connecting...</h1>
      </div>
    );
  }

  const currentCast = casts[currentCastIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-purple-900">
      <div className="safe-area-inset-top"></div>
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-white mb-4">
            🎵 EmpowerTours
          </h1>
          <p className="text-2xl text-purple-200 mb-6">
            Music NFTs + Travel Passports on Monad
          </p>

          {authenticated && walletAddress && (
            <div className="inline-block bg-white/10 backdrop-blur-lg border border-white/20 rounded-full px-6 py-3">
              <p className="text-white font-medium">
                👋 Welcome, {user?.farcaster?.username ? `@${user.farcaster.username}` : `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}
              </p>
            </div>
          )}
        </div>

        {/* Live Farcaster Feed */}
        <div className="mb-12">
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <h2 className="text-2xl font-bold text-white">🔴 Live from Farcaster</h2>
            </div>

            {isLoadingCasts ? (
              <div className="text-center py-8">
                <div className="animate-spin text-4xl mb-4">⏳</div>
                <p className="text-purple-200">Loading community updates...</p>
              </div>
            ) : currentCast ? (
              <div className="min-h-[120px] flex flex-col justify-center">
                <div className="flex items-start gap-4">
                  {currentCast.author.pfp_url && (
                    <img
                      src={currentCast.author.pfp_url}
                      alt={currentCast.author.username}
                      className="w-12 h-12 rounded-full"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-white text-lg mb-3 leading-relaxed">
                      {currentCast.text}
                    </p>
                    <p className="text-purple-300 text-sm">
                      — @{currentCast.author.username}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-purple-200 py-8">
                No casts available. Check back soon!
              </p>
            )}

            {/* Cast indicator dots */}
            {casts.length > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                {casts.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === currentCastIndex
                        ? 'bg-white w-6'
                        : 'bg-white/30'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CTA Button - FIXED HERE */}
        <div className="text-center mb-12">
          
            href="/market"
            className="inline-block px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full text-xl font-bold hover:from-purple-700 hover:to-blue-700 transition-all shadow-2xl transform hover:scale-105"
          >
            🔥 Explore Marketplace
          </a>
        </div>

        {/* NFT Counts */}
        {authenticated && walletAddress && (
          <div className="grid grid-cols-2 gap-4 mt-16 pt-8 border-t border-white/20">
            
              href="/profile"
              className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 hover:bg-white/20 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="text-5xl group-hover:scale-110 transition-transform">🎵</div>
                <div>
                  <div className="text-3xl font-bold text-white">
                    {loadingNFTs ? '...' : musicCount}
                  </div>
                  <p className="text-purple-200 text-sm">Music NFT{musicCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </a>

            
              href="/profile"
              className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 hover:bg-white/20 transition-all group"
            >
              <div className="flex items-center gap-4 justify-end">
                <div className="text-right">
                  <div className="text-3xl font-bold text-white">
                    {loadingNFTs ? '...' : passportCount}
                  </div>
                  <p className="text-purple-200 text-sm">Passport{passportCount !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-5xl group-hover:scale-110 transition-transform">🎫</div>
              </div>
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-purple-300 text-sm">
            Powered by Monad Testnet • Indexed by Envio • Social via Farcaster
          </p>
        </div>
      </div>

      <div className="safe-area-inset-bottom"></div>
    </div>
  );
}
