// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useCountryCollector } from '@/src/hooks';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import PassportGate from '@/app/components/PassportGate';

export default function CountryCollectorPage() {
  return (
    <PassportGate>
      <CountryCollectorContent />
    </PassportGate>
  );
}

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

function CountryCollectorContent() {
  const { address } = useAccount();
  const [passportTokenId, setPassportTokenId] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<bigint | null>(null);
  const [userPassport, setUserPassport] = useState<any>(null);
  const [countryArtists, setCountryArtists] = useState<any[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(true);

  const {
    useGetCurrentChallenge,
    useGetCollectorStats,
    useGetUserBadges,
    useGetUserProgress,
    completeArtist,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  } = useCountryCollector();

  const { data: challenge, isLoading: challengeLoading } = useGetCurrentChallenge();
  const { data: stats } = useGetCollectorStats(address!);
  const { data: badges } = useGetUserBadges(address!);
  const { data: userProgress } = useGetUserProgress(
    challenge?.id || BigInt(0),
    address!
  );

  // Fetch user's passport and country-specific artists
  useEffect(() => {
    const fetchCountryArtists = async () => {
      if (!address) return;

      try {
        setLoadingArtists(true);

        // First, get user's passport to find their country
        const passportQuery = `
          query GetUserPassport($owner: String!) {
            PassportNFT(where: {owner: {_eq: $owner}}, limit: 1) {
              tokenId
              countryCode
              countryName
              owner
            }
          }
        `;

        const passportRes = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: passportQuery,
            variables: { owner: address.toLowerCase() }
          }),
        });

        if (passportRes.ok) {
          const passportData = await passportRes.json();
          const passport = passportData.data?.PassportNFT?.[0];

          if (passport) {
            setUserPassport(passport);
            setPassportTokenId(passport.tokenId);

            // Now fetch artists who have passports from the same country and have minted music
            const artistsQuery = `
              query GetCountryArtists($countryCode: String!) {
                PassportNFT(where: {countryCode: {_eq: $countryCode}}) {
                  owner
                  countryCode
                  countryName
                }
              }
            `;

            const artistsRes = await fetch(ENVIO_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: artistsQuery,
                variables: { countryCode: passport.countryCode }
              }),
            });

            if (artistsRes.ok) {
              const artistsData = await artistsRes.json();
              const passportHolders = artistsData.data?.PassportNFT || [];

              // Get unique artist addresses
              const artistAddresses = [...new Set(passportHolders.map((p: any) => p.owner))];

              // Fetch music NFTs from these artists
              const musicQuery = `
                query GetArtistMusic($artists: [String!]!) {
                  MusicNFT(where: {artist: {_in: $artists}}) {
                    tokenId
                    name
                    artist
                    imageUrl
                    previewAudioUrl
                    owner
                  }
                }
              `;

              const musicRes = await fetch(ENVIO_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query: musicQuery,
                  variables: { artists: artistAddresses }
                }),
              });

              if (musicRes.ok) {
                const musicData = await musicRes.json();
                setCountryArtists(musicData.data?.MusicNFT || []);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching country artists:', error);
      } finally {
        setLoadingArtists(false);
      }
    };

    fetchCountryArtists();
  }, [address]);

  const handleCompleteArtist = () => {
    if (challenge && (challenge as any).id && selectedArtist && passportTokenId) {
      completeArtist((challenge as any).id, selectedArtist, BigInt(passportTokenId));
    }
  };

  if (challengeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-teal-900 to-blue-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading (challenge as any)...</div>
      </div>
    );
  }

  const isChallengeActive = challenge && !(challenge as any).finalized && (challenge as any).endTime > BigInt(Math.floor(Date.now() / 1000));
  const timeRemaining = challenge ? Number((challenge as any).endTime) * 1000 - Date.now() : 0;
  const daysLeft = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-teal-900 to-blue-900 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">🌍 Country Collector</h1>
          <p className="text-teal-200 text-lg max-w-2xl mx-auto">
            Complete weekly challenges, collect country badges, and explore global music culture!
          </p>
        </div>

        {/* Collector Stats */}
        {stats && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">🏆 Your Collection</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard
                label="Countries Collected"
                value={stats.countriesCollected?.toString() || '0'}
                icon="🗺️"
              />
              <StatCard
                label="Total Badges"
                value={stats.totalBadges?.toString() || '0'}
                icon="🏅"
              />
              <StatCard
                label="Artists Completed"
                value={stats.artistsCompleted?.toString() || '0'}
                icon="🎵"
              />
              <StatCard
                label="Current Streak"
                value={stats.weeklyStreak?.toString() || '0'}
                icon="🔥"
              />
              <StatCard
                label="Best Streak"
                value={stats.longestStreak?.toString() || '0'}
                icon="⭐"
              />
              <StatCard
                label="Rewards Earned"
                value={`${formatEther(stats.totalRewards || BigInt(0))} TOURS`}
                icon="💰"
              />
            </div>
          </div>
        )}

        {/* Badges Collection */}
        {badges && badges.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">🏅 Your Badges</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {badges.map((badge, idx) => (
                <div
                  key={idx}
                  className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl p-4 text-center"
                >
                  <div className="text-4xl mb-2">{badge.isGlobalCitizen ? '🌎' : '🎫'}</div>
                  <div className="text-white font-bold">{badge.countryCode}</div>
                  <div className="text-teal-200 text-sm">{badge.countryName}</div>
                  {badge.isGlobalCitizen && (
                    <div className="mt-2 bg-yellow-500/30 px-2 py-1 rounded text-xs text-yellow-200">
                      Global Citizen
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Country Artists - Show artists from user's country */}
        {userPassport ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-white">
                🎵 {userPassport.countryName} Artists
              </h2>
              <div className="bg-green-500/20 border border-green-500/50 px-4 py-2 rounded-lg">
                <span className="text-green-200 font-semibold">
                  {userPassport.countryCode} Passport
                </span>
              </div>
            </div>

            {loadingArtists ? (
              <div className="text-center py-8">
                <div className="animate-spin text-3xl mb-2">⏳</div>
                <p className="text-white">Loading artists from {userPassport.countryName}...</p>
              </div>
            ) : countryArtists.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {countryArtists.map((nft) => (
                  <div
                    key={nft.tokenId}
                    className="bg-white/5 rounded-lg p-4 flex gap-4 hover:bg-white/10 transition-colors"
                  >
                    {nft.imageUrl && (
                      <img
                        src={nft.imageUrl}
                        alt={nft.name}
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <div className="text-white font-bold text-lg">{nft.name || 'Untitled'}</div>
                      <div className="text-teal-300 text-sm mb-2">by {nft.artist.slice(0, 6)}...{nft.artist.slice(-4)}</div>
                      <div className="text-green-200 text-xs mb-3">Token #{nft.tokenId}</div>
                      {nft.previewAudioUrl && (
                        <audio
                          controls
                          className="w-full h-8"
                          style={{ maxWidth: '100%' }}
                        >
                          <source src={nft.previewAudioUrl} type="audio/mpeg" />
                        </audio>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-white text-lg mb-2">No artists from {userPassport.countryName} yet</p>
                <p className="text-teal-200 text-sm">Be the first to mint music from your country!</p>
              </div>
            )}

          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center">
            <p className="text-white text-2xl mb-4">🎫 Get a Passport First</p>
            <p className="text-teal-200">Mint a passport to discover artists from your country!</p>
          </div>
        )}

        {/* How it Works */}
        <div className="mt-12 bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold text-white mb-6">How to Collect</h2>
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-4xl mb-3">📍</div>
              <h3 className="text-white font-semibold mb-2">1. Visit Country</h3>
              <p className="text-teal-200 text-sm">
                Use your Passport NFT to visit a featured country
              </p>
            </div>
            <div>
              <div className="text-4xl mb-3">🎵</div>
              <h3 className="text-white font-semibold mb-2">2. Complete Artists</h3>
              <p className="text-teal-200 text-sm">
                Discover and complete all 3 featured artists
              </p>
            </div>
            <div>
              <div className="text-4xl mb-3">🏅</div>
              <h3 className="text-white font-semibold mb-2">3. Earn Badge</h3>
              <p className="text-teal-200 text-sm">
                Collect the country badge and earn TOURS rewards!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-black/30 rounded-xl p-4 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-teal-200 text-sm">{label}</div>
    </div>
  );
}
