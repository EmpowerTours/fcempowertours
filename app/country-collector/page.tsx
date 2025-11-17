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

function CountryCollectorContent() {
  const { address } = useAccount();
  const [passportTokenId, setPassportTokenId] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<bigint | null>(null);

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

  const isChallengeActive = challenge && !(challenge as any).finalized && (challenge as any).endTime > BigInt(Date.now() / 1000);
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

        {/* Current Challenge */}
        {isChallengeActive ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-white">Weekly Challenge</h2>
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
                  <h3 className="text-2xl font-bold text-white">{(challenge as any).name}</h3>
                  <p className="text-teal-200">
                    Country: {(challenge as any).countryCode}
                  </p>
                  <p className="text-green-200 text-sm">
                    Challenge #{(challenge as any).id.toString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {(challenge as any).artistIds?.map((artistId, idx) => (
                  <div
                    key={idx}
                    className="bg-white/5 rounded-lg p-3 text-center"
                  >
                    <div className="text-white font-bold mb-1">Artist {idx + 1}</div>
                    <div className="text-teal-200 text-sm">ID: {artistId.toString()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress */}
            {userProgress && (
              <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-6 mb-6">
                <h3 className="text-white font-bold mb-4">Your Progress</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-blue-200 text-sm mb-1">Artists Completed</div>
                    <div className="text-2xl font-bold text-white">
                      {userProgress.artistsCompleted?.toString() || '0'}/3
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-200 text-sm mb-1">Status</div>
                    <div className="text-lg font-bold text-white">
                      {userProgress.isComplete ? '✅ Complete' : '⏳ In Progress'}
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-200 text-sm mb-1">Rewards Claimed</div>
                    <div className="text-lg font-bold text-white">
                      {userProgress.rewardsClaimed ? '✅ Yes' : '❌ No'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Complete Artist Form */}
            {!userProgress?.isComplete && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white font-semibold mb-2">Artist ID</label>
                    <input
                      type="number"
                      value={selectedArtist?.toString() || ''}
                      onChange={(e) => setSelectedArtist(e.target.value ? BigInt(e.target.value) : null)}
                      placeholder="Enter artist ID from challenge"
                      className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50"
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-2">Passport NFT ID</label>
                    <input
                      type="number"
                      value={passportTokenId}
                      onChange={(e) => setPassportTokenId(e.target.value)}
                      placeholder="Your Passport Token ID"
                      className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50"
                    />
                  </div>
                </div>

                {writeError && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                    <p className="text-red-200">❌ Error: {writeError.message}</p>
                  </div>
                )}

                <button
                  onClick={handleCompleteArtist}
                  disabled={!selectedArtist || !passportTokenId || isPending || isConfirming}
                  className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:scale-100"
                >
                  {isPending || isConfirming
                    ? 'Completing...'
                    : 'Complete Artist 🎯'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center">
            <p className="text-white text-2xl mb-4">😴 No active challenge right now</p>
            <p className="text-teal-200">Check back next week for a new country challenge!</p>
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
