// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useMusicBeatMatch } from '@/src/hooks';
import { useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import PassportGate from '@/app/components/PassportGate';

export default function BeatMatchPage() {
  return (
    <PassportGate>
      <BeatMatchContent />
    </PassportGate>
  );
}

function BeatMatchContent() {
  const { address } = useAccount();
  const [selectedArtist, setSelectedArtist] = useState<bigint | null>(null);
  const [guessReason, setGuessReason] = useState('');
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);

  const {
    useGetCurrentChallenge,
    useGetPlayerStats,
    useHasPlayed,
    submitGuess,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
  } = useMusicBeatMatch();

  const { data: challenge, isLoading: challengeLoading } = useGetCurrentChallenge();
  const { data: playerStats } = useGetPlayerStats(address!);
  const { data: hasPlayed } = useHasPlayed(address!, (challenge as any)?.id || BigInt(0));

  useEffect(() => {
    if (isConfirmed) {
      setShowSubmitSuccess(true);
      setSelectedArtist(null);
      setGuessReason('');
      setTimeout(() => setShowSubmitSuccess(false), 5000);
    }
  }, [isConfirmed]);

  const handleSubmitGuess = () => {
    if (challenge && (challenge as any).id && selectedArtist && guessReason.trim()) {
      submitGuess((challenge as any).id, selectedArtist, guessReason);
    }
  };

  if (challengeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading (challenge as any)...</div>
      </div>
    );
  }

  const isChallengeActive = challenge && !(challenge as any).finalized && (challenge as any).endTime > BigInt(Date.now() / 1000);
  const timeRemaining = challenge ? Number((challenge as any).endTime) * 1000 - Date.now() : 0;
  const hoursLeft = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesLeft = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return (
    // @ts-ignore
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">🎵 Music Beat Match</h1>
          <p className="text-blue-200 text-lg max-w-2xl mx-auto">
            Guess the artist behind today's mystery track and earn TOURS rewards!
          </p>
        </div>

        {/* Player Stats Card */}
        {playerStats && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">🏆 Your Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Guesses"
                value={playerStats.totalGuesses?.toString() || '0'}
                icon="🎯"
              />
              <StatCard
                label="Correct"
                value={playerStats.correctGuesses?.toString() || '0'}
                icon="✅"
              />
              <StatCard
                label="Current Streak"
                value={playerStats.currentStreak?.toString() || '0'}
                icon="🔥"
              />
              <StatCard
                label="Rewards Earned"
                value={`${formatEther(playerStats.totalRewards || BigInt(0))} TOURS`}
                icon="💰"
              />
            </div>
          </div>
        )}

        {/* Current Challenge */}
        {isChallengeActive ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-white">Today's Challenge</h2>
              <div className="bg-red-500/20 border border-red-500/50 px-4 py-2 rounded-lg">
                <span className="text-red-200 font-semibold">
                  ⏱️ {hoursLeft}h {minutesLeft}m left
                </span>
              </div>
            </div>

            <div className="bg-black/30 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-3xl">
                  🎵
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">{(challenge as any).songTitle}</h3>
                  <p className="text-blue-200">Challenge #{(challenge as any).id.toString()}</p>
                </div>
              </div>

              {(challenge as any).spotifyUri && (
                <a
                  href={`https://open.spotify.com/track/${(challenge as any).spotifyUri}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  <span>🎧</span>
                  Listen on Spotify
                </a>
              )}
            </div>

            {/* Guess Form */}
            {hasPlayed ? (
              <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-6">
                <p className="text-yellow-200 text-lg text-center">
                  ✅ You've already submitted your guess for today's challenge!
                  <br />
                  Come back tomorrow for the next one.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-white font-semibold mb-2">Select Artist ID</label>
                  <input
                    type="number"
                    value={selectedArtist?.toString() || ''}
                    onChange={(e) => setSelectedArtist(e.target.value ? BigInt(e.target.value) : null)}
                    placeholder="Enter artist ID"
                    className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2">Why do you think so?</label>
                  <textarea
                    value={guessReason}
                    onChange={(e) => setGuessReason(e.target.value)}
                    placeholder="Share your reasoning..."
                    rows={3}
                    className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                {writeError && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                    <p className="text-red-200">
                      ❌ Error: {writeError.message}
                    </p>
                  </div>
                )}

                {showSubmitSuccess && (
                  <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
                    <p className="text-green-200">
                      ✅ Guess submitted successfully! Good luck!
                    </p>
                  </div>
                )}

                <button
                  onClick={handleSubmitGuess}
                  disabled={!selectedArtist || !guessReason.trim() || isPending || isConfirming}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {isPending || isConfirming
                    ? 'Submitting...'
                    : 'Submit Your Guess 🎯'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center">
            <p className="text-white text-2xl mb-4">😴 No active challenge right now</p>
            <p className="text-blue-200">Check back soon for the next daily challenge!</p>
          </div>
        )}

        {/* How it Works */}
        <div className="mt-12 bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold text-white mb-6">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-4xl mb-3">🎵</div>
              <h3 className="text-white font-semibold mb-2">1. Listen</h3>
              <p className="text-blue-200 text-sm">
                Listen to the mystery track on Spotify
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-3">🤔</div>
              <h3 className="text-white font-semibold mb-2">2. Guess</h3>
              <p className="text-blue-200 text-sm">
                Submit your guess for the artist
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-3">💰</div>
              <h3 className="text-white font-semibold mb-2">3. Earn</h3>
              <p className="text-blue-200 text-sm">
                Get rewards if you're correct!
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
      <div className="text-blue-200 text-sm">{label}</div>
    </div>
  );
}
