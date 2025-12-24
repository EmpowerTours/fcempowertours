'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useDailyLottery } from '@/src/hooks';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';

interface DailyAccessGateProps {
  children: React.ReactNode;
}

export default function DailyAccessGate({ children }: DailyAccessGateProps) {
  const router = useRouter();
  const { walletAddress, user, isLoading: contextLoading } = useFarcasterContext();
  const { address: wagmiAddress } = useAccount();
  const effectiveAddress = (walletAddress || wagmiAddress) as `0x${string}` | undefined;

  const {
    useGetCurrentRound,
    useGetTimeRemaining,
    useHasEnteredToday,
    useGetEntryFee,
  } = useDailyLottery();

  // Contract data hooks
  const { data: currentRound, isLoading: roundLoading, refetch: refetchRound } = useGetCurrentRound();
  const { data: timeRemaining } = useGetTimeRemaining();
  // 🔒 SIMPLIFIED: Only check user's wallet address for lottery entry
  // Safe wallet integration was causing bypass issues
  const { data: hasEntered, isLoading: entryLoading, refetch: refetchHasEntered, isError: hasEnteredError } = useHasEnteredToday(effectiveAddress);
  const { data: entryFee } = useGetEntryFee();

  // Local state
  const [isEntering, setIsEntering] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [grantAccess, setGrantAccess] = useState(false); // Force grant access when "Already entered"
  const [grantedRoundId, setGrantedRoundId] = useState<bigint | null>(null); // Track which round access was granted for

  // Live countdown
  const [countdown, setCountdown] = useState<string>('--:--:--');

  // Auto-redirect after successful entry
  useEffect(() => {
    if (txHash) {
      const timer = setTimeout(() => {
        router.push('/discover');
      }, 2500); // Redirect after 2.5 seconds
      return () => clearTimeout(timer);
    }
  }, [txHash, router]);

  // Auto-redirect when grantAccess is set (Already entered case)
  useEffect(() => {
    if (grantAccess) {
      router.push('/discover');
    }
  }, [grantAccess, router]);

  // 🔒 SECURITY: Reset grantAccess if round changes (prevents 24hr bypass)
  useEffect(() => {
    if (grantedRoundId !== null && currentRound?.roundId !== undefined && currentRound.roundId !== grantedRoundId) {
      console.log('🔄 Round changed - resetting access grant', {
        grantedRound: grantedRoundId.toString(),
        currentRound: currentRound.roundId.toString()
      });
      setGrantAccess(false);
      setGrantedRoundId(null);
    }
  }, [currentRound?.roundId, grantedRoundId]);

  // Update countdown every second
  useEffect(() => {
    const updateCountdown = () => {
      if (timeRemaining) {
        const secs = Number(timeRemaining);
        const hrs = Math.floor(secs / 3600);
        const mins = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        setCountdown(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [timeRemaining]);

  // Handle lottery entry with MON
  const handleEnterWithMon = async () => {
    if (!effectiveAddress) {
      setError('Wallet not connected');
      return;
    }

    setIsEntering(true);
    setError('');
    setStatusMessage('');
    setTxHash(null);

    try {
      // ✅ Lottery entry is now a PUBLIC action - no delegation needed!
      setStatusMessage('Entering lottery with 1 MON...');

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
      setStatusMessage('');
      setIsEntering(false);

      // Start background polling
      setTimeout(() => refetchHasEntered(), 3000);
      setTimeout(() => refetchHasEntered(), 6000);
      setTimeout(() => refetchRound(), 5000);

    } catch (err: any) {
      console.error('Entry error:', err);
      const errMsg = err.message || 'Failed to enter lottery';

      // Check for "Already entered" error - grant access if so
      if (errMsg.includes('Already entered') || errMsg.includes('416c726561647920656e7465726564')) {
        console.log('User already entered in current round - granting access');
        setGrantAccess(true);
        setGrantedRoundId(currentRound?.roundId || null);
        setIsEntering(false);
        return;
      }

      setError(errMsg);
      setIsEntering(false);
    }
  };

  // Debug logging
  useEffect(() => {
    if (!roundLoading && !entryLoading && !contextLoading) {
      console.log('🎰 Lottery Gate Status:', {
        effectiveAddress,
        hasEntered,
        grantAccess,
        grantedRoundId: grantedRoundId?.toString(),
        currentRoundId: currentRound?.roundId?.toString(),
        shouldShowGate: !hasEntered && !(grantAccess && grantedRoundId !== null && currentRound?.roundId === grantedRoundId)
      });
    }
  }, [roundLoading, entryLoading, contextLoading, hasEntered, grantAccess, grantedRoundId, currentRound?.roundId, effectiveAddress]);

  // Show loading while checking
  if (roundLoading || entryLoading || contextLoading) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🎰</div>
          <p className="text-white text-lg">Checking lottery status...</p>
        </div>
      </div>
    );
  }

  // ❌ REMOVED hasEnteredError BYPASS - Security Fix
  // Users must have ACTUALLY entered or received explicit "Already entered" confirmation
  // Contract errors should NOT grant automatic access
  // 🔒 CRITICAL: Only grant access if user entered THIS round (prevents 24hr bypass)
  const currentRoundMatches = grantedRoundId !== null && currentRound?.roundId === grantedRoundId;
  if (hasEntered || (grantAccess && currentRoundMatches)) {
    return <>{children}</>;
  }

  // Show error state if contract read fails - DO NOT grant access
  if (hasEnteredError) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[9999]">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-red-500/50 shadow-2xl p-8 max-w-md mx-4 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-white mb-4">Connection Error</h2>
          <p className="text-white/80 mb-6">
            Unable to verify lottery status. Please check your connection and try again.
          </p>
          <button
            onClick={() => {
              refetchHasEntered();
              refetchRound();
            }}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-xl font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
          >
            🔄 Retry
          </button>
          <p className="text-white/50 text-xs mt-4">
            Error checking lottery contract
          </p>
        </div>
      </div>
    );
  }

  // Calculate total prize pool
  const totalPrizePool = currentRound
    ? Number(formatEther(currentRound.prizePoolWmon)).toFixed(4)
    : '0';

  // Show lottery gate - FULL SCREEN CENTERED
  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 z-[9999] overflow-auto">
      <div className="min-h-screen w-full flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-6 sm:p-8">

            {/* Header */}
            <div className="text-center mb-6">
              <div className="text-6xl mb-3">🎰</div>
              <h1 className="text-3xl font-bold text-white mb-2">Daily Pass Lottery</h1>
              <p className="text-white/80 text-sm">
                Enter once, access all day, win the pot!
              </p>
            </div>

            {/* SUCCESS STATE - Show after TX */}
            {txHash && (
              <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/50 rounded-2xl p-5 mb-6">
                <div className="text-center mb-4">
                  <div className="text-5xl mb-2">🎉</div>
                  <h2 className="text-xl font-bold text-white">You're In!</h2>
                  <p className="text-green-300 text-sm">Entry successful - redirecting...</p>
                </div>

                <a
                  href={`https://testnet.monadscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-cyan-400 text-sm hover:text-cyan-300 underline mb-4"
                >
                  View TX: {txHash.slice(0, 10)}...{txHash.slice(-6)}
                </a>

                <div className="flex justify-center">
                  <button
                    onClick={() => router.push('/discover')}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold py-5 px-12 rounded-2xl transition-all shadow-lg shadow-green-500/30 text-xl"
                  >
                    🚀 Enter EmpowerTours
                  </button>
                </div>
              </div>
            )}

            {/* Current Round Info */}
            {!txHash && (
              <>
                <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl p-4 mb-6 border border-purple-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white/70 text-sm">Round #{currentRound?.roundId?.toString() || '0'}</span>
                    <div className="text-right">
                      <span className="text-white/50 text-xs block">Payout in</span>
                      <span className="text-cyan-400 font-mono text-lg font-bold">{countdown}</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-white/60 text-xs mb-1">Current Prize Pool</p>
                    <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                      {totalPrizePool} MON
                    </p>
                    <p style={{ color: '#fdba74', backgroundColor: 'rgba(249, 115, 22, 0.3)', borderColor: 'rgba(251, 146, 60, 0.5)' }} className="text-sm font-bold mt-2 rounded-lg py-1.5 px-4 inline-block border">
                      👥 {currentRound?.participantCount?.toString() || '0'} participants
                    </p>
                  </div>
                </div>

                {/* Entry Fee */}
                <div className="bg-white/10 rounded-2xl p-4 mb-6 border border-white/10">
                  <div className="bg-black/20 rounded-xl p-3 text-center">
                    <p className="text-white text-lg font-bold">
                      {entryFee ? Number(formatEther(entryFee)).toFixed(2) : '1'} WMON
                    </p>
                    <p className="text-white/50 text-xs">90% to prize pool, 10% to platform</p>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mb-4 bg-red-500/20 border border-red-400/50 rounded-xl p-3">
                    <p className="text-red-100 text-sm">{error}</p>
                  </div>
                )}

                {/* Status Message */}
                {statusMessage && (
                  <div className="mb-4 bg-blue-500/20 border border-blue-400/50 rounded-xl p-3">
                    <p className="text-blue-100 text-sm flex items-center gap-2">
                      <span className="animate-spin">⏳</span>
                      {statusMessage}
                    </p>
                  </div>
                )}

                {/* Enter Button */}
                <button
                  onClick={handleEnterWithMon}
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
                      <p>Enter today's lottery with WMON</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">2</span>
                      <p>Get full access to EmpowerTours for 24 hours</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">3</span>
                      <p>Random winner drawn when countdown hits zero</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold">4</span>
                      <p>Winner claims entire prize pool!</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Wallet Info */}
            {effectiveAddress && (
              <p className="text-white/40 text-xs text-center mt-4">
                {effectiveAddress.slice(0, 6)}...{effectiveAddress.slice(-4)}
              </p>
            )}

            {/* Full Lottery Page Link - opens in new tab */}
            <div className="text-center mt-4">
              <a
                href="/lottery"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 text-sm hover:text-purple-300 underline"
              >
                View Full Lottery Dashboard ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
