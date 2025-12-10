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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false);
  const [createChallengeResult, setCreateChallengeResult] = useState('');

  const {
    useGetCurrentChallenge,
    useGetCollectorStats,
    useGetUserBadges,
    useGetUserProgress,
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
                  MusicNFT(
                    where: {
                      artist: {_in: $artists},
                      isBurned: {_eq: false},
                      isArt: {_eq: false}
                    }
                  ) {
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
                const artists = musicData.data?.MusicNFT || [];
                console.log(`Country Collector: Loaded ${artists.length} music NFTs from ${passport.countryName}`);
                setCountryArtists(artists);
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

  const handleCreateChallenge = async () => {
    setIsCreatingChallenge(true);
    setCreateChallengeResult('');

    try {
      const response = await fetch('/api/cron/manage-games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'dev-secret-change-in-production'}`
        }
      });

      const result = await response.json();

      if (result.success) {
        setCreateChallengeResult(`✅ ${result.actions?.join(', ') || 'Challenge management completed'}`);
        // Refresh the page after 2 seconds to show new challenge
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setCreateChallengeResult(`❌ Error: ${result.error || 'Failed to manage challenges'}`);
      }
    } catch (err: any) {
      setCreateChallengeResult(`❌ Error: ${err.message}`);
    } finally {
      setIsCreatingChallenge(false);
    }
  };

  const handleCompleteArtist = async (artistIndex: number, artistId: number) => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Check/create delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${address}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('country_collector_complete');

      if (!hasValidDelegation) {
        console.log('Creating delegation with game permissions...');
        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: address,
            durationHours: 24,
            maxTransactions: 100,
            permissions: [
              'mint_passport', 'mint_music', 'swap_mon_for_tours',
              'beat_match_submit_guess',
              'country_collector_complete'
            ]
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation');
        }
      }

      // Complete artist via delegation
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          action: 'country_collector_complete',
          params: {
            weekId: (challenge as any).id.toString(),
            artistIndex,
            artistId
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete artist');
      }

      const result = await response.json();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
      console.log('Artist completed!', result.txHash);

    } catch (err: any) {
      setSubmitError(err.message || 'Completion failed');
      console.error('Error completing artist:', err);
    } finally {
      setIsSubmitting(false);
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

        {/* Current Weekly Challenge */}
        {isChallengeActive && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8 border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-white">This Week's Challenge</h2>
              <div className="bg-green-500/20 border border-green-500/50 px-4 py-2 rounded-lg">
                <span className="text-green-200 font-semibold">
                  ⏱️ {daysLeft}d {hoursLeft}h left
                </span>
              </div>
            </div>

            <div className="bg-black/30 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-teal-500 rounded-lg flex items-center justify-center text-3xl">
                  🌍
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">{(challenge as any).countryName}</h3>
                  <p className="text-teal-200">Country Code: {(challenge as any).countryCode}</p>
                  <p className="text-green-300 text-sm">Complete all 3 artists to earn a badge!</p>
                </div>
              </div>

              {/* Artist completion progress */}
              <div className="space-y-4">
                <h4 className="text-white font-semibold">Artists to Complete:</h4>
                {[0, 1, 2].map((index) => {
                  const artistId = (challenge as any).artistIds?.[index]?.toString();
                  const isCompleted = userProgress?.artistsCompleted?.[index] || false;

                  return (
                    <div
                      key={index}
                      className={`bg-white/5 border ${
                        isCompleted ? 'border-green-500/50 bg-green-500/10' : 'border-white/20'
                      } rounded-lg p-4 flex justify-between items-center`}
                    >
                      <div>
                        <div className="text-white font-semibold">
                          Artist {index + 1}
                          {isCompleted && ' ✅'}
                        </div>
                        <div className="text-teal-300 text-sm">Token ID: {artistId}</div>
                      </div>
                      {!isCompleted && (
                        <button
                          onClick={() => handleCompleteArtist(index, Number(artistId))}
                          disabled={isSubmitting}
                          className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold px-6 py-2 rounded-lg transition-all disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? 'Completing...' : 'Complete'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="mt-6">
                <div className="flex justify-between text-sm text-white mb-2">
                  <span>Progress</span>
                  <span>{userProgress?.completedCount || 0}/3 artists</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-green-500 to-teal-500 h-3 rounded-full transition-all"
                    style={{ width: `${((userProgress?.completedCount || 0) / 3) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Success/Error messages */}
            {submitError && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-4">
                <p className="text-red-200">❌ Error: {submitError}</p>
              </div>
            )}

            {showSuccess && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                <p className="text-green-200">✅ Artist completed successfully! Keep going!</p>
              </div>
            )}

            {userProgress?.badgeEarned && (
              <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-6 text-center">
                <div className="text-5xl mb-3">🏅</div>
                <p className="text-yellow-200 text-xl font-bold mb-2">
                  Badge Earned!
                </p>
                <p className="text-yellow-100">
                  You've completed {(challenge as any).countryName}!
                </p>
              </div>
            )}
          </div>
        )}

        {/* No Active Challenge */}
        {!isChallengeActive && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center mb-8">
            <p className="text-white text-2xl mb-4">😴 No active challenge right now</p>
            <p className="text-teal-200 mb-6">Check back soon for the next weekly challenge!</p>

            {/* Admin: Create Challenge Button */}
            <div className="border-t border-white/20 pt-6 mt-6">
              <button
                onClick={handleCreateChallenge}
                disabled={isCreatingChallenge}
                className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold px-8 py-3 rounded-xl transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
              >
                {isCreatingChallenge ? '⏳ Creating...' : '🎲 Create New Challenge (Admin)'}
              </button>
              {createChallengeResult && (
                <div className={`mt-4 p-4 rounded-lg ${createChallengeResult.startsWith('✅') ? 'bg-green-500/20 border border-green-500/50' : 'bg-red-500/20 border border-red-500/50'}`}>
                  <p className={createChallengeResult.startsWith('✅') ? 'text-green-200' : 'text-red-200'}>
                    {createChallengeResult}
                  </p>
                </div>
              )}
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
