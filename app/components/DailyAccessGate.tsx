'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useDailyLottery, useShMon } from '@/src/hooks';
import { formatEther, parseEther } from 'viem';
import { useAccount } from 'wagmi';

interface DailyAccessGateProps {
  children: React.ReactNode;
}

// Round status enum matching contract
enum RoundStatus {
  Active = 0,
  Committed = 1,
  Revealed = 2,
  Completed = 3
}

export default function DailyAccessGate({ children }: DailyAccessGateProps) {
  const { walletAddress, user, isLoading: contextLoading } = useFarcasterContext();
  const { address: wagmiAddress } = useAccount();
  const effectiveAddress = (walletAddress || wagmiAddress) as `0x${string}` | undefined;

  const {
    useGetCurrentRound,
    useGetTimeRemaining,
    useHasEnteredToday,
    useGetShMonEntryFee,
    LOTTERY_ADDRESS
  } = useDailyLottery();

  const { useGetShMonBalance } = useShMon();

  // Contract data hooks
  const { data: currentRound, isLoading: roundLoading, refetch: refetchRound } = useGetCurrentRound();
  const { data: timeRemaining } = useGetTimeRemaining();
  const { data: hasEntered, isLoading: entryLoading, refetch: refetchHasEntered } = useHasEnteredToday(effectiveAddress);
  const { data: shMonEntryFee } = useGetShMonEntryFee();
  const { data: shMonBalance } = useGetShMonBalance(effectiveAddress);

  // Local state
  const [entryMethod, setEntryMethod] = useState<'mon' | 'shmon'>('mon');
  const [isEntering, setIsEntering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [entryComplete, setEntryComplete] = useState(false);

  // Format time remaining
  const formatTimeRemaining = (seconds: bigint | undefined) => {
    if (!seconds) return '--:--:--';
    const hrs = Math.floor(Number(seconds) / 3600);
    const mins = Math.floor((Number(seconds) % 3600) / 60);
    const secs = Number(seconds) % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle lottery entry with MON
  const handleEnterWithMon = async () => {
    if (!effectiveAddress) {
      setError('Wallet not connected');
      return;
    }

    setIsEntering(true);
    setError('');
    setSuccess('');

    try {
      // Check delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${effectiveAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('lottery_enter_mon');

      if (!hasValidDelegation) {
        setSuccess('Setting up gasless transactions...');
        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: effectiveAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours', 'unstake_tours', 'swap_tours_for_wmon', 'swap_wmon_for_tours', 'wrap_mon', 'unwrap_wmon', 'shmon_deposit', 'lottery_enter_mon', 'lottery_enter_shmon']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
      }

      setSuccess('Entering lottery with 1 MON (FREE gas)...');

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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Entry failed');
      }

      const { txHash: hash } = await response.json();
      setTxHash(hash);
      setSuccess(`You're in! Confirming on-chain...`);

      // Poll for entry confirmation
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        const result = await refetchHasEntered();
        if (result.data === true) {
          clearInterval(pollInterval);
          setEntryComplete(true);
          setSuccess('Entry confirmed! Entering app...');
          // Brief delay to show confirmation message
          setTimeout(() => {
            refetchRound();
          }, 1000);
        } else if (attempts >= 15) {
          clearInterval(pollInterval);
          setSuccess('Entry submitted! Click below to continue.');
          setEntryComplete(true);
        }
      }, 2000);
    } catch (err: any) {
      console.error('Entry error:', err);
      setError(err.message || 'Failed to enter lottery');
    } finally {
      setIsEntering(false);
    }
  };

  // Handle lottery entry with shMON
  const handleEnterWithShMon = async () => {
    if (!effectiveAddress || !shMonEntryFee) {
      setError('Wallet not connected or fee not loaded');
      return;
    }

    setIsEntering(true);
    setError('');
    setSuccess('');

    try {
      // Check delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${effectiveAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('lottery_enter_shmon');

      if (!hasValidDelegation) {
        setSuccess('Setting up gasless transactions...');
        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: effectiveAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours', 'unstake_tours', 'swap_tours_for_wmon', 'swap_wmon_for_tours', 'wrap_mon', 'unwrap_wmon', 'shmon_deposit', 'lottery_enter_mon', 'lottery_enter_shmon']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
      }

      setSuccess(`Entering lottery with shMON (FREE gas)...`);

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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Entry failed');
      }

      const { txHash: hash } = await response.json();
      setTxHash(hash);
      setSuccess(`You're in! Confirming on-chain...`);

      // Poll for entry confirmation
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        const result = await refetchHasEntered();
        if (result.data === true) {
          clearInterval(pollInterval);
          setEntryComplete(true);
          setSuccess('Entry confirmed! Entering app...');
          setTimeout(() => {
            refetchRound();
          }, 1000);
        } else if (attempts >= 15) {
          clearInterval(pollInterval);
          setSuccess('Entry submitted! Click below to continue.');
          setEntryComplete(true);
        }
      }, 2000);
    } catch (err: any) {
      console.error('Entry error:', err);
      setError(err.message || 'Failed to enter lottery');
    } finally {
      setIsEntering(false);
    }
  };

  // Show loading while checking
  if (roundLoading || entryLoading || contextLoading) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🎰</div>
          <p className="text-white text-lg">Checking lottery status on Monad...</p>
        </div>
      </div>
    );
  }

  // User has already entered today - show children (grant access)
  if (hasEntered) {
    return <>{children}</>;
  }

  // Calculate total prize pool
  const totalPrizePool = currentRound
    ? Number(formatEther(currentRound.prizePoolMon + currentRound.prizePoolShMon)).toFixed(4)
    : '0';

  // Show lottery gate
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
      <div className="w-full max-w-md my-8">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-6 sm:p-8">

          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-6xl mb-3">🎰</div>
            <h1 className="text-3xl font-bold text-white mb-2">Daily Pass Lottery</h1>
            <p className="text-white/80 text-sm">
              Enter once, access all day, win the pot!
            </p>
          </div>

          {/* Current Round Info */}
          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl p-4 mb-6 border border-purple-500/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/70 text-sm">Round #{currentRound?.roundId?.toString() || '0'}</span>
              <span className="text-cyan-400 font-mono text-sm">
                {formatTimeRemaining(timeRemaining as bigint | undefined)}
              </span>
            </div>
            <div className="text-center">
              <p className="text-white/60 text-xs mb-1">Current Prize Pool</p>
              <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                {totalPrizePool} MON
              </p>
              <p className="text-white/50 text-xs mt-1">
                {currentRound?.participantCount?.toString() || '0'} participants
              </p>
            </div>
          </div>

          {/* Entry Options */}
          <div className="bg-white/10 rounded-2xl p-4 mb-6 border border-white/10">
            <h3 className="text-white font-semibold mb-3 text-center">Choose Entry Method</h3>

            {/* Entry Method Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setEntryMethod('mon')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                  entryMethod === 'mon'
                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                <div className="text-lg mb-1">💜</div>
                <div>1 MON</div>
              </button>
              <button
                onClick={() => setEntryMethod('shmon')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                  entryMethod === 'shmon'
                    ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                <div className="text-lg mb-1">💎</div>
                <div>shMON</div>
              </button>
            </div>

            {/* Entry Fee Details */}
            <div className="bg-black/20 rounded-xl p-3 text-center">
              {entryMethod === 'mon' ? (
                <>
                  <p className="text-white text-lg font-bold">1 MON</p>
                  <p className="text-white/50 text-xs">90% to prize pool, 10% to platform</p>
                </>
              ) : (
                <>
                  <p className="text-white text-lg font-bold">
                    ~{shMonEntryFee ? Number(formatEther(shMonEntryFee)).toFixed(4) : '...'} shMON
                  </p>
                  <p className="text-white/50 text-xs">
                    Your balance: {shMonBalance ? Number(formatEther(shMonBalance)).toFixed(4) : '0'} shMON
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 bg-red-500/20 border border-red-400/50 rounded-xl p-3">
              <p className="text-red-100 text-sm">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 bg-green-500/20 border border-green-400/50 rounded-xl p-4">
              <p className="text-green-100 text-sm mb-2">{success}</p>
              {txHash && (
                <a
                  href={`https://testnet.monadscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 text-xs hover:text-cyan-300 underline break-all"
                >
                  View TX: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              )}
              {entryComplete && (
                <button
                  onClick={() => window.location.reload()}
                  className="w-full mt-3 bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Continue to App
                </button>
              )}
            </div>
          )}

          {/* Enter Button */}
          <button
            onClick={entryMethod === 'mon' ? handleEnterWithMon : handleEnterWithShMon}
            disabled={isEntering || !effectiveAddress}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-xl font-bold text-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg shadow-purple-500/30"
          >
            {isEntering ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">🎰</span>
                Entering Lottery...
              </span>
            ) : (
              <span>🚀 Enter Lottery (FREE Gas)</span>
            )}
          </button>

          <p className="text-white/50 text-xs text-center mt-2">
            Gasless transaction - we pay the network fees!
          </p>

          {/* How It Works */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <h4 className="text-white/80 text-sm font-semibold mb-3 text-center">How It Works</h4>
            <div className="space-y-2 text-xs text-white/60">
              <div className="flex items-start gap-2">
                <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">1</span>
                <p>Enter today's lottery with MON or shMON</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">2</span>
                <p>Get full access to EmpowerTours for 24 hours</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">3</span>
                <p>Random winner drawn at round end</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">4</span>
                <p>Winner claims entire prize pool!</p>
              </div>
            </div>
          </div>

          {/* Wallet Info */}
          {effectiveAddress && (
            <p className="text-white/40 text-xs text-center mt-4">
              Your wallet: {effectiveAddress.slice(0, 6)}...{effectiveAddress.slice(-4)}
            </p>
          )}

          {/* Full Lottery Page Link */}
          <div className="text-center mt-4">
            <a
              href="/lottery"
              className="text-purple-400 text-sm hover:text-purple-300 underline"
            >
              View Full Lottery Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
