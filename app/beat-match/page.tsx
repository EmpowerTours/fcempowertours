// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useMusicBeatMatch } from '@/src/hooks';
import { useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import PassportGate from '@/app/components/PassportGate';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

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
  const [guessUsername, setGuessUsername] = useState('');
  const [guessReason, setGuessReason] = useState('');
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);
  const [musicNFTs, setMusicNFTs] = useState([]);
  const [artistUsernames, setArtistUsernames] = useState<Record<string, string>>({});
  const [loadingMusic, setLoadingMusic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const {
    useGetCurrentChallenge,
    useGetPlayerStats,
    useHasPlayed,
  } = useMusicBeatMatch();

  const { data: challenge, isLoading: challengeLoading } = useGetCurrentChallenge();
  const { data: playerStats } = useGetPlayerStats(address!);
  const { data: hasPlayed } = useHasPlayed(address!, (challenge as any)?.id || BigInt(0));

  // Fetch music NFTs from Envio
  useEffect(() => {
    const fetchMusicNFTs = async () => {
      try {
        const query = `
          query GetMusicNFTs {
            MusicNFT(
              where: {isBurned: {_eq: false}, isArt: {_eq: false}},
              limit: 50,
              order_by: {mintedAt: desc}
            ) {
              id
              tokenId
              name
              artist
              imageUrl
              previewAudioUrl
              fullAudioUrl
              owner
            }
          }
        `;

        const response = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('Beat Match: Loaded', result.data?.MusicNFT?.length || 0, 'music NFTs');
          setMusicNFTs(result.data?.MusicNFT || []);
        }
      } catch (error) {
        console.error('Error fetching music NFTs:', error);
      } finally {
        setLoadingMusic(false);
      }
    };

    fetchMusicNFTs();
  }, []);

  // Fetch Farcaster usernames for all artists
  useEffect(() => {
    const fetchUsernames = async () => {
      if (musicNFTs.length === 0) return;

      try {
        const uniqueArtists = [...new Set(musicNFTs.map((nft: any) => nft.artist))];
        const neynarApiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

        const usernameMap: Record<string, string> = {};

        for (const artistAddress of uniqueArtists) {
          try {
            const url = `https://api.neynar.com/v2/farcaster/user/bulk_by_address?addresses=${artistAddress}`;
            const response = await fetch(url, {
              headers: { 'x-api-key': neynarApiKey },
            });

            if (response.ok) {
              const data: any = await response.json();
              const users = data[artistAddress.toLowerCase()];
              if (users && users.length > 0) {
                usernameMap[artistAddress] = users[0].username;
              } else {
                usernameMap[artistAddress] = `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`;
              }
            } else {
              usernameMap[artistAddress] = `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`;
            }
          } catch (error) {
            usernameMap[artistAddress] = `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`;
          }
        }

        setArtistUsernames(usernameMap);
      } catch (error) {
        console.error('Error fetching artist usernames:', error);
      }
    };

    fetchUsernames();
  }, [musicNFTs]);

  const handleSubmitGuess = async () => {
    if (!selectedArtist && !guessUsername.trim()) {
      setSubmitError('Please provide either artist ID or @username');
      return;
    }
    if (!guessReason.trim()) {
      setSubmitError('Please provide your reasoning');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Check/create delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${address}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('beat_match_submit_guess');

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

      // Submit guess via delegation
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          action: 'beat_match_submit_guess',
          params: {
            challengeId: (challenge as any).id.toString(),
            artistId: selectedArtist?.toString() || '0',
            songTitle: guessReason,
            username: guessUsername || ''
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit guess');
      }

      const result = await response.json();
      setShowSubmitSuccess(true);
      setSelectedArtist(null);
      setGuessUsername('');
      setGuessReason('');
      setTimeout(() => setShowSubmitSuccess(false), 5000);
      console.log('Guess submitted!', result.txHash);

    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed');
      console.error('Error submitting guess:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (challengeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading (challenge as any)...</div>
      </div>
    );
  }

  const isChallengeActive = challenge && !(challenge as any).finalized && (challenge as any).endTime > BigInt(Math.floor(Date.now() / 1000));
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
                  {(challenge as any).artistUsername ? (
                    <p className="text-purple-300 text-sm">Guess the artist: @{(challenge as any).artistUsername}</p>
                  ) : (
                    <p className="text-purple-300 text-sm">Artist ID: {(challenge as any).artistId?.toString()}</p>
                  )}
                </div>
              </div>

              {/* Display music NFT if we have music data */}
              {musicNFTs.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-white font-semibold mb-3">🎵 Available Music NFTs</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                    {musicNFTs.map((nft) => (
                      <div
                        key={nft.id}
                        className="bg-white/5 rounded-lg p-4 flex gap-3 hover:bg-white/10 transition-colors"
                      >
                        {nft.imageUrl && (
                          <img
                            src={nft.imageUrl}
                            alt={nft.name}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1">
                          <div className="text-white font-semibold">{nft.name || 'Untitled'}</div>
                          <div className="text-blue-300 text-sm">
                            by {artistUsernames[nft.artist]
                              ? `@${artistUsernames[nft.artist]}`
                              : `${nft.artist.slice(0, 6)}...${nft.artist.slice(-4)}`}
                          </div>
                          <div className="text-purple-300 text-xs">Token ID: {nft.tokenId}</div>
                          {nft.previewAudioUrl && (
                            <audio
                              controls
                              className="w-full mt-2 h-8"
                              style={{ maxWidth: '100%' }}
                            >
                              <source src={nft.previewAudioUrl} type="audio/mpeg" />
                            </audio>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loadingMusic && (
                <div className="text-blue-200 text-center py-4">Loading music...</div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white font-semibold mb-2">Artist ID (Optional)</label>
                    <input
                      type="number"
                      value={selectedArtist?.toString() || ''}
                      onChange={(e) => setSelectedArtist(e.target.value ? BigInt(e.target.value) : null)}
                      placeholder="Enter artist ID"
                      className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-2">OR @username (Optional)</label>
                    <input
                      type="text"
                      value={guessUsername}
                      onChange={(e) => setGuessUsername(e.target.value)}
                      placeholder="@artist"
                      className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-purple-500"
                    />
                  </div>
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

                {submitError && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                    <p className="text-red-200">
                      ❌ Error: {submitError}
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
                  disabled={(!selectedArtist && !guessUsername.trim()) || !guessReason.trim() || isSubmitting}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {isSubmitting
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
                Listen to music from NFTs minted on-chain
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
                Get TOURS rewards if you're correct!
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
