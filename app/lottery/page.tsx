'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useDailyLottery, useShMon, LOTTERY_CONTRACT_ADDRESS, SHMON_CONTRACT_ADDRESS } from '@/src/hooks';
import { formatEther, parseEther } from 'viem';
import { useAccount } from 'wagmi';
import FinalizeLotteryButton from '@/components/lottery/FinalizeLotteryButton';

// Round status enum matching contract
enum RoundStatus {
  Active = 0,
  Committed = 1,
  Revealed = 2,
  Completed = 3
}

const STATUS_LABELS: Record<number, string> = {
  [RoundStatus.Active]: 'Active - Entries Open',
  [RoundStatus.Committed]: 'Committed - Awaiting Reveal',
  [RoundStatus.Revealed]: 'Revealed - Ready to Claim',
  [RoundStatus.Completed]: 'Completed'
};

export default function LotteryPage() {
  const { walletAddress, user } = useFarcasterContext();
  const { address: wagmiAddress } = useAccount();
  const effectiveAddress = (walletAddress || wagmiAddress) as `0x${string}` | undefined;

  const {
    useGetCurrentRound,
    useGetStats,
    useGetTimeRemaining,
    useHasEnteredToday,
    useCanCommit,
    useCanReveal,
    useGetShMonEntryFee,
    enterWithMon,
    enterWithShMon,
    commitRandomness,
    revealWinner,
    claimPrize,
    isPending,
    isConfirming,
    isConfirmed,
    writeError,
    hash,
    LOTTERY_ADDRESS,
    SHMON_ADDRESS
  } = useDailyLottery();

  const { useGetShMonBalance, useGetAllowance, approveShMon } = useShMon();

  // Contract data hooks
  const { data: currentRound, isLoading: roundLoading, refetch: refetchRound } = useGetCurrentRound();
  const { data: stats, refetch: refetchStats } = useGetStats();
  const { data: timeRemaining } = useGetTimeRemaining();
  const { data: hasEntered, refetch: refetchHasEntered } = useHasEnteredToday(effectiveAddress);
  const { data: canCommit } = useCanCommit(currentRound?.roundId);
  const { data: canReveal } = useCanReveal(currentRound?.roundId);
  const { data: shMonEntryFee } = useGetShMonEntryFee();
  const { data: shMonBalance } = useGetShMonBalance(effectiveAddress);
  const { data: shMonAllowance } = useGetAllowance(effectiveAddress, LOTTERY_ADDRESS);

  // Local state
  const [entryMethod, setEntryMethod] = useState<'mon' | 'shmon'>('mon');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Refresh data when transaction confirms
  useEffect(() => {
    if (isConfirmed) {
      const refreshData = async () => {
        await refetchRound();
        await refetchStats();
        await refetchHasEntered();

        // Show appropriate success message based on current round state
        const updatedRound = await refetchRound();
        if (updatedRound.data?.status === RoundStatus.Revealed && updatedRound.data?.winner) {
          setSuccess(`🏆 WINNER REVEALED: ${updatedRound.data.winner.slice(0, 10)}...${updatedRound.data.winner.slice(-8)}`);
        } else if (updatedRound.data?.status === RoundStatus.Committed) {
          setSuccess('✅ Randomness committed! You earned 0.01 MON. Now anyone can reveal the winner.');
        } else {
          setSuccess('Transaction confirmed!');
        }
        setActionLoading(false);
      };
      refreshData();
    }
  }, [isConfirmed, refetchRound, refetchStats, refetchHasEntered]);

  // Handle transaction errors
  useEffect(() => {
    if (writeError) {
      setError(writeError.message || 'Transaction failed');
      setActionLoading(false);
    }
  }, [writeError]);

  // Timeout for stuck transactions (2 minutes)
  useEffect(() => {
    if (isPending || isConfirming) {
      const timeout = setTimeout(() => {
        if (isPending || isConfirming) {
          setError('Transaction timeout - please try again or check Monad explorer');
          setActionLoading(false);
        }
      }, 120000); // 2 minutes

      return () => clearTimeout(timeout);
    }
  }, [isPending, isConfirming]);

  // Format time remaining
  const formatTimeRemaining = (seconds: bigint | undefined) => {
    if (!seconds) return '--:--:--';
    const hrs = Math.floor(Number(seconds) / 3600);
    const mins = Math.floor((Number(seconds) % 3600) / 60);
    const secs = Number(seconds) % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle entry with MON (gasless via delegated)
  const handleEnterWithMon = async () => {
    if (!effectiveAddress) {
      setError('Wallet not connected');
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use gasless delegation
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'lottery_enter_mon',
          params: {}
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to enter lottery');
      }

      const { txHash } = await response.json();
      setSuccess(`Entry submitted! TX: ${txHash.slice(0, 10)}...`);

      // Refresh after delay
      setTimeout(() => {
        refetchRound();
        refetchHasEntered();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to enter');
      enterWithMon(); // Fallback to direct call
    } finally {
      setActionLoading(false);
    }
  };

  // Handle entry with shMON
  const handleEnterWithShMon = async () => {
    if (!effectiveAddress || !shMonEntryFee) {
      setError('Wallet not connected or fee not loaded');
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Check allowance
      const requiredAllowance = shMonEntryFee;
      if (!shMonAllowance || shMonAllowance < requiredAllowance) {
        setSuccess('Approving shMON... please confirm');
        approveShMon(LOTTERY_ADDRESS, formatEther(requiredAllowance * BigInt(10)));
        return;
      }

      // Use gasless delegation
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'lottery_enter_shmon',
          params: { amount: formatEther(shMonEntryFee) }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to enter lottery');
      }

      const { txHash } = await response.json();
      setSuccess(`Entry submitted! TX: ${txHash.slice(0, 10)}...`);

      setTimeout(() => {
        refetchRound();
        refetchHasEntered();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to enter');
      if (shMonEntryFee) {
        enterWithShMon(formatEther(shMonEntryFee));
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Handle commit (anyone can call)
  const handleCommit = async () => {
    if (!currentRound?.roundId || !effectiveAddress) return;
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use delegated API for gasless commit
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'lottery_commit',
          params: { roundId: currentRound.roundId.toString() }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to commit randomness');
      }

      const { txHash } = await response.json();
      setSuccess(`Committed randomness! TX: ${txHash.slice(0, 10)}... You earned 0.01 MON!`);

      // Refresh after delay
      setTimeout(() => {
        refetchRound();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to commit');
      // Fallback to direct call if delegated fails
      try {
        await commitRandomness(currentRound.roundId);
        setSuccess('Committing randomness... waiting for confirmation');
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || 'Failed to commit');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Handle reveal (anyone can call)
  const handleReveal = async () => {
    console.log('[REVEAL] Button clicked!', { roundId: currentRound?.roundId, effectiveAddress });
    if (!currentRound?.roundId || !effectiveAddress) {
      console.error('[REVEAL] Missing required data:', { currentRound, effectiveAddress });
      setError(`Cannot reveal: ${!effectiveAddress ? 'Wallet not connected' : 'Round ID missing'}`);
      return;
    }
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use delegated API for gasless reveal
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'lottery_reveal',
          params: { roundId: currentRound.roundId.toString() }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reveal winner');
      }

      const { txHash } = await response.json();
      setSuccess(`Winner revealed! TX: ${txHash.slice(0, 10)}... You earned 0.01 MON!`);

      // Refresh after delay
      setTimeout(() => {
        refetchRound();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reveal');
      // Fallback to direct call if delegated fails
      try {
        await revealWinner(currentRound.roundId);
        setSuccess('Revealing winner... waiting for confirmation');
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || 'Failed to reveal');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Handle claim (winner only)
  const handleClaim = async () => {
    if (!currentRound?.roundId || !effectiveAddress) return;
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use delegated API for gasless claim
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'lottery_claim',
          params: { roundId: currentRound.roundId.toString() }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to claim prize');
      }

      const { txHash } = await response.json();
      setSuccess(`Prize claimed! TX: ${txHash.slice(0, 10)}...`);

      // Refresh after delay
      setTimeout(() => {
        refetchRound();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to claim');
      // Fallback to direct call if delegated fails
      try {
        claimPrize(currentRound.roundId);
        setSuccess('Claim transaction sent!');
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || 'Failed to claim');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (roundLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🎰</div>
          <p className="text-white text-lg">Loading lottery data from Monad...</p>
        </div>
      </div>
    );
  }

  const totalPrizePool = currentRound ?
    Number(formatEther(currentRound.prizePoolMon + currentRound.prizePoolShMon)).toFixed(4) : '0';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="text-6xl mb-4">🎰</div>
          <h1 className="text-3xl font-bold text-white mb-2">Daily Lottery</h1>
          <p className="text-white/70">Win MON every day on Monad!</p>
          <p className="text-purple-300 text-xs mt-1">
            Contract: {LOTTERY_ADDRESS.slice(0, 8)}...{LOTTERY_ADDRESS.slice(-6)}
          </p>
        </div>

        {/* Finalization Button (Auto-checks for pending rounds) */}
        <FinalizeLotteryButton />

        {/* Current Round Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Round #{currentRound?.roundId?.toString() || '0'}</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              currentRound?.status === RoundStatus.Active ? 'bg-green-500/20 text-green-400' :
              currentRound?.status === RoundStatus.Committed ? 'bg-yellow-500/20 text-yellow-400' :
              currentRound?.status === RoundStatus.Revealed ? 'bg-blue-500/20 text-blue-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {STATUS_LABELS[currentRound?.status || 0]}
            </span>
          </div>

          {/* Prize Pool */}
          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl p-4 mb-4">
            <p className="text-white/60 text-sm mb-1">Total Prize Pool</p>
            <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              {totalPrizePool} MON
            </p>
            <div className="flex gap-4 mt-2 text-xs text-white/50">
              <span>MON: {currentRound ? formatEther(currentRound.prizePoolMon) : '0'}</span>
              <span>shMON: {currentRound ? formatEther(currentRound.prizePoolShMon) : '0'}</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-white/60 text-sm mb-1">Participants</p>
              <p className="text-2xl font-bold text-white">
                {currentRound?.participantCount?.toString() || '0'}
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <p className="text-white/60 text-sm mb-1">Time Remaining</p>
              <p className="text-2xl font-bold text-cyan-400 font-mono">
                {formatTimeRemaining(timeRemaining as bigint | undefined)}
              </p>
            </div>
          </div>

          {/* Entry Section */}
          {((currentRound?.status === RoundStatus.Active && !hasEntered) ||
            (currentRound?.status === RoundStatus.Completed)) && (
            <div className="border-t border-white/10 pt-4 mt-4">
              <h3 className="text-white font-semibold mb-3">
                {currentRound?.status === RoundStatus.Completed ? 'Enter New Round' : 'Enter Today\'s Lottery'}
              </h3>

              {/* Entry Method Toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setEntryMethod('mon')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                    entryMethod === 'mon'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Pay with MON (1 MON)
                </button>
                <button
                  onClick={() => setEntryMethod('shmon')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                    entryMethod === 'shmon'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Pay with shMON
                </button>
              </div>

              {/* Entry Fee Info */}
              <div className="bg-white/5 rounded-lg p-3 mb-4 text-sm">
                {entryMethod === 'mon' ? (
                  <p className="text-white/70">Entry fee: <span className="text-purple-400 font-bold">1 MON</span></p>
                ) : (
                  <p className="text-white/70">
                    Entry fee: <span className="text-cyan-400 font-bold">
                      {shMonEntryFee ? `~${Number(formatEther(shMonEntryFee)).toFixed(4)}` : '...'} shMON
                    </span>
                    <br/>
                    <span className="text-white/50 text-xs">Your balance: {shMonBalance ? Number(formatEther(shMonBalance)).toFixed(4) : '0'} shMON</span>
                  </p>
                )}
              </div>

              {/* Enter Button */}
              <button
                onClick={entryMethod === 'mon' ? handleEnterWithMon : handleEnterWithShMon}
                disabled={actionLoading || isPending || isConfirming}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-500 disabled:to-gray-600 text-white font-bold py-4 rounded-xl transition-all"
              >
                {actionLoading || isPending || isConfirming ? 'Processing...' : `Enter Lottery (FREE Gas)`}
              </button>
            </div>
          )}

          {/* Already Entered */}
          {hasEntered && currentRound?.status === RoundStatus.Active && (
            <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mt-4">
              <p className="text-green-400 font-semibold text-center">
                ✅ You're in today's lottery! Good luck!
              </p>
            </div>
          )}

          {/* Winner Display */}
          {currentRound?.winner && currentRound.winner !== '0x0000000000000000000000000000000000000000' && (
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4 mt-4">
              <p className="text-yellow-400 font-semibold text-center mb-2">🏆 Winner</p>
              <p className="text-white text-center font-mono text-sm">
                {currentRound.winner.slice(0, 10)}...{currentRound.winner.slice(-8)}
              </p>
              {currentRound.winner.toLowerCase() === effectiveAddress?.toLowerCase() && (
                <button
                  onClick={handleClaim}
                  disabled={actionLoading}
                  className="w-full mt-3 bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg"
                >
                  Claim Your Prize!
                </button>
              )}
            </div>
          )}
        </div>

        {/* Finalization Actions */}
        {(canCommit || canReveal) && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Help Finalize Round</h2>
            <p className="text-white/60 text-sm mb-4">
              Earn 0.01 MON by helping finalize the round!
            </p>

            <div className="flex gap-3">
              {canCommit && (
                <button
                  onClick={handleCommit}
                  disabled={actionLoading || isPending || isConfirming}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all"
                >
                  {actionLoading || isPending || isConfirming ? '⏳ Processing...' : '🎲 Commit Randomness (+0.01 MON)'}
                </button>
              )}
              {canReveal && (
                <button
                  onClick={handleReveal}
                  disabled={actionLoading || isPending || isConfirming}
                  className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all"
                >
                  {actionLoading || isPending || isConfirming ? '⏳ Processing...' : '🎰 Reveal Winner (+0.01 MON)'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Overall Stats */}
        {stats && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">All-Time Stats</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <p className="text-white/60 text-sm mb-1">Total Paid Out</p>
                <p className="text-xl font-bold text-green-400">
                  {stats[3] ? Number(formatEther(stats[3])).toFixed(2) : '0'} MON
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <p className="text-white/60 text-sm mb-1">Total Participants</p>
                <p className="text-xl font-bold text-white">
                  {stats[4]?.toString() || '0'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-6">
            <p className="text-green-400 text-sm">{success}</p>
            {hash && (
              <a
                href={`https://testnet.monadscan.com/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-300 hover:text-green-100 underline mt-2 block"
              >
                View on Monad Explorer →
              </a>
            )}
          </div>
        )}

        {/* How it Works */}
        <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-4">How It Works</h2>
          <div className="space-y-4 text-sm text-white/70">
            <div className="flex items-start gap-3">
              <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs font-bold shrink-0">1</span>
              <p>Enter with 1 MON or equivalent shMON (one entry per day)</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs font-bold shrink-0">2</span>
              <p><span className="inline-block w-1"></span>90% goes to prize pool, 5% gas fund, 5% platform treasury</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs font-bold shrink-0">3</span>
              <p>At round end, anyone can trigger commit/reveal for 0.01 MON reward</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs font-bold shrink-0">4</span>
              <p>Winner claims prize from escrow (48hr window)</p>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center mt-6 pb-8">
          <a href="/" className="text-white/60 text-sm hover:text-white/90 underline">
            Back to EmpowerTours
          </a>
        </div>
      </div>
    </div>
  );
}
