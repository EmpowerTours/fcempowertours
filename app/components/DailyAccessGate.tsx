'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useDailyLottery, useShMon } from '@/src/hooks';
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
    useGetShMonEntryFee,
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
  const [statusMessage, setStatusMessage] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [grantAccess, setGrantAccess] = useState(false); // Force grant access when "Already entered"

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
      // Check delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${effectiveAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('lottery_enter_mon');

      if (!hasValidDelegation) {
        setStatusMessage('Setting up gasless transactions...');
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
        console.log('User already entered - granting access');
        setGrantAccess(true);
        setIsEntering(false);
        return;
      }

      setError(errMsg);
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
    setStatusMessage('');
    setTxHash(null);

    try {
      const delegationRes = await fetch(`/api/delegation-status?address=${effectiveAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('lottery_enter_shmon');

      if (!hasValidDelegation) {
        setStatusMessage('Setting up gasless transactions...');
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

      setStatusMessage('Entering lottery with shMON...');

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
      setStatusMessage('');
      setIsEntering(false);

      setTimeout(() => refetchHasEntered(), 3000);
      setTimeout(() => refetchHasEntered(), 6000);
      setTimeout(() => refetchRound(), 5000);

    } catch (err: any) {
      console.error('Entry error:', err);
      const errMsg = err.message || 'Failed to enter lottery';

      // Check for "Already entered" error - grant access if so
      if (errMsg.includes('Already entered') || errMsg.includes('416c726561647920656e7465726564')) {
        console.log('User already entered - granting access');
        setGrantAccess(true);
        setIsEntering(false);
        return;
      }

      setError(errMsg);
      setIsEntering(false);
    }
  };

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

  // User has already entered today OR got "Already entered" error - show children (grant access)
  if (hasEntered || grantAccess) {
    return <>{children}</>;
  }

  // Calculate total prize pool
  const totalPrizePool = currentRound
    ? Number(formatEther(currentRound.prizePoolMon + currentRound.prizePoolShMon)).toFixed(4)
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
                    <p className="text-white/50 text-xs mt-1">
                      {currentRound?.participantCount?.toString() || '0'} participants
                    </p>
                  </div>
                </div>

                {/* Entry Options */}
                <div className="bg-white/10 rounded-2xl p-4 mb-6 border border-white/10">
                  <h3 className="text-white font-semibold mb-3 text-center">Choose Entry Method</h3>

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
