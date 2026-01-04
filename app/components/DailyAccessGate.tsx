'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useDailyLottery, usePassportNFT } from '@/src/hooks';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import { Address } from 'viem';

interface DailyAccessGateProps {
  children: React.ReactNode;
}

interface RequirementStatus {
  faucet: boolean | null;
  subscription: boolean | null;
  following: boolean | null;
  passport: boolean | null;
  lottery: boolean | null;
}

interface FaucetStatus {
  canClaimNow: boolean;
  walletCooldownSeconds: number;
  fidCooldownSeconds: number;
  hasClaimed: boolean;
}

export default function DailyAccessGate({ children }: DailyAccessGateProps) {
  const router = useRouter();
  const { walletAddress, user, isLoading: contextLoading } = useFarcasterContext();
  const { address: wagmiAddress } = useAccount();
  const effectiveAddress = (walletAddress || wagmiAddress) as `0x${string}` | undefined;

  // Passport hook
  const { useBalanceOf } = usePassportNFT();
  const { data: passportBalance, isLoading: passportLoading } = useBalanceOf(effectiveAddress as Address);

  // Lottery hooks
  const {
    useGetCurrentRound,
    useGetTimeRemaining,
    useHasEnteredToday,
    useGetEntryFee,
  } = useDailyLottery();

  const { data: currentRound } = useGetCurrentRound();
  const { data: timeRemaining } = useGetTimeRemaining();
  const { data: hasEnteredLottery, isLoading: entryLoading, refetch: refetchHasEntered } = useHasEnteredToday(effectiveAddress);
  const { data: entryFee } = useGetEntryFee();

  // Requirement states
  const [requirements, setRequirements] = useState<RequirementStatus>({
    faucet: null,
    subscription: null,
    following: null,
    passport: null,
    lottery: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [countdown, setCountdown] = useState<string>('--:--:--');
  const [safeWmonBalance, setSafeWmonBalance] = useState<string>('0');
  const [faucetStatus, setFaucetStatus] = useState<FaucetStatus>({
    canClaimNow: false,
    walletCooldownSeconds: 0,
    fidCooldownSeconds: 0,
    hasClaimed: false,
  });
  const [faucetCooldown, setFaucetCooldown] = useState<string>('');

  // Check faucet status via faucet contract AND Safe balance
  const checkFaucetStatus = async () => {
    if (!user?.fid || !effectiveAddress) {
      setRequirements(prev => ({ ...prev, faucet: false }));
      return;
    }
    try {
      // Fetch both faucet claim status AND Safe balance in parallel
      const [faucetRes, safeRes] = await Promise.all([
        fetch(`/api/faucet/check-claimed?fid=${user.fid}&address=${effectiveAddress}`),
        fetch(`/api/user-safe?address=${effectiveAddress}`),
      ]);

      const faucetData = await faucetRes.json();
      const safeData = await safeRes.json();

      // Update Safe balance
      const wmonBal = parseFloat(safeData.wmonBalance || '0');
      setSafeWmonBalance(safeData.wmonBalance || '0');

      // Update faucet status for cooldown display
      if (faucetData.success) {
        setFaucetStatus({
          canClaimNow: faucetData.canClaimNow || false,
          walletCooldownSeconds: faucetData.walletCooldownSeconds || 0,
          fidCooldownSeconds: faucetData.fidCooldownSeconds || 0,
          hasClaimed: faucetData.hasClaimed || false,
        });
      }

      // Faucet requirement logic:
      // - If user has sufficient balance (>= 15 WMON for daily sub), requirement is met
      // - OR if user is on cooldown (claimed recently), requirement is met
      const hasEnoughBalance = wmonBal >= 15;
      const isOnCooldown = faucetData.success && faucetData.hasClaimed && !faucetData.canClaimNow;

      setRequirements(prev => ({ ...prev, faucet: hasEnoughBalance || isOnCooldown }));
    } catch (err) {
      console.error('Failed to check faucet status:', err);
      setRequirements(prev => ({ ...prev, faucet: false }));
    }
  };

  useEffect(() => {
    checkFaucetStatus();
  }, [effectiveAddress, user?.fid]);

  // Check subscription status
  useEffect(() => {
    if (!effectiveAddress) return;

    const checkSubscription = async () => {
      try {
        const res = await fetch(`/api/music/check-subscription?address=${effectiveAddress}`);
        const data = await res.json();
        setRequirements(prev => ({ ...prev, subscription: data.hasSubscription || false }));
      } catch (err) {
        console.error('Failed to check subscription:', err);
        setRequirements(prev => ({ ...prev, subscription: false }));
      }
    };

    checkSubscription();
  }, [effectiveAddress]);

  // Check follow status
  useEffect(() => {
    if (!user?.fid) return;

    const checkFollow = async () => {
      try {
        // If user IS unify34 (FID 765994), auto-pass
        if (user.fid === 765994 || user.username?.toLowerCase() === 'unify34') {
          setRequirements(prev => ({ ...prev, following: true }));
          return;
        }

        const res = await fetch(`/api/check-follow?fid=${user.fid}`);
        const data = await res.json();
        setRequirements(prev => ({ ...prev, following: data.isFollowing || false }));
      } catch (err) {
        console.error('Failed to check follow:', err);
        setRequirements(prev => ({ ...prev, following: false }));
      }
    };

    checkFollow();
  }, [user?.fid, user?.username]);

  // Check passport ownership
  useEffect(() => {
    if (!passportLoading && passportBalance !== undefined) {
      const hasPassport = typeof passportBalance === 'bigint' && passportBalance > 0n;
      setRequirements(prev => ({ ...prev, passport: hasPassport }));
    }
  }, [passportBalance, passportLoading]);

  // Check lottery entry
  useEffect(() => {
    if (!entryLoading && hasEnteredLottery !== undefined) {
      setRequirements(prev => ({ ...prev, lottery: hasEnteredLottery }));
    }
  }, [hasEnteredLottery, entryLoading]);

  // Update loading state
  useEffect(() => {
    const allChecked = Object.values(requirements).every(v => v !== null);
    if (allChecked && !contextLoading && !passportLoading && !entryLoading) {
      setIsLoading(false);
    }
  }, [requirements, contextLoading, passportLoading, entryLoading]);

  // Update lottery countdown
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

  // Update faucet cooldown timer
  useEffect(() => {
    const maxCooldown = Math.max(faucetStatus.walletCooldownSeconds, faucetStatus.fidCooldownSeconds);
    if (maxCooldown <= 0) {
      setFaucetCooldown('');
      return;
    }

    let remaining = maxCooldown;
    const updateFaucetCooldown = () => {
      if (remaining <= 0) {
        setFaucetCooldown('');
        // Refresh faucet status when cooldown expires
        checkFaucetStatus();
        return;
      }
      const hrs = Math.floor(remaining / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      setFaucetCooldown(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      remaining--;
    };

    updateFaucetCooldown();
    const interval = setInterval(updateFaucetCooldown, 1000);
    return () => clearInterval(interval);
  }, [faucetStatus.walletCooldownSeconds, faucetStatus.fidCooldownSeconds]);

  // Check if all requirements met
  const allRequirementsMet = requirements.faucet && requirements.subscription && requirements.following && requirements.passport && requirements.lottery;

  // Subscription tier prices
  const SUBSCRIPTION_TIERS = [
    { tier: 0, name: 'Daily', price: '15000000000000000000', display: '15 WMON' },
    { tier: 1, name: 'Weekly', price: '75000000000000000000', display: '75 WMON' },
    { tier: 2, name: 'Monthly', price: '300000000000000000000', display: '300 WMON' },
    { tier: 3, name: 'Yearly', price: '3000000000000000000000', display: '3000 WMON' },
  ];

  // Handle faucet claim via execute-delegated (WMON goes directly to Safe)
  const handleClaimFaucet = async () => {
    // Prevent double-clicks / duplicate submissions
    if (activeAction === 'faucet') {
      return;
    }
    if (!user?.fid || !effectiveAddress) {
      setError('Farcaster account required');
      return;
    }
    setActiveAction('faucet');
    setError('');

    try {
      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'faucet_claim',
          params: { fid: user.fid }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Faucet claim failed');
      }

      // Immediately mark as claimed to prevent double-claims
      setFaucetStatus(prev => ({ ...prev, canClaimNow: false, hasClaimed: true }));
      setStatusMessage('20 WMON claimed to your Safe!');

      // Refresh status after a delay
      setTimeout(() => {
        checkFaucetStatus();
        setStatusMessage('');
        setActiveAction(null);
      }, 3000);
    } catch (err: any) {
      // Check if it's a cooldown error
      const errorMsg = err.message || 'Faucet claim failed';
      if (errorMsg.includes('cooldown') || errorMsg.includes('already claimed') || errorMsg.includes('revert')) {
        setError('Already claimed today. Next claim available in 24 hours.');
        setFaucetStatus(prev => ({ ...prev, canClaimNow: false, hasClaimed: true }));
      } else {
        setError(errorMsg);
      }
      setActiveAction(null);
    }
  };

  // Handle subscribe action
  const handleSubscribe = async (tierIndex: number) => {
    // Prevent double-clicks
    if (activeAction === 'subscription') {
      return;
    }
    setActiveAction('subscription');
    setError('');
    try {
      const tier = SUBSCRIPTION_TIERS[tierIndex];
      const tierPrice = parseFloat(tier.display.split(' ')[0]);
      const currentBalance = parseFloat(safeWmonBalance);

      // Validate balance before attempting transaction
      if (currentBalance < tierPrice) {
        throw new Error(`Insufficient balance. Need ${tierPrice} WMON but have ${currentBalance.toFixed(2)} WMON. Claim from faucet first.`);
      }

      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'music-subscribe',
          params: {
            userFid: user?.fid || 0,
            tier: tier.tier,
            amount: tier.price
          }
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Subscription failed');
      }

      setTimeout(async () => {
        // Refresh both subscription status and balance
        const [checkRes, safeRes] = await Promise.all([
          fetch(`/api/music/check-subscription?address=${effectiveAddress}`),
          fetch(`/api/user-safe?address=${effectiveAddress}`),
        ]);
        const checkData = await checkRes.json();
        const safeData = await safeRes.json();

        setRequirements(prev => ({ ...prev, subscription: checkData.hasSubscription || false }));
        setSafeWmonBalance(safeData.wmonBalance || '0');
        setActiveAction(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message);
      setActiveAction(null);
    }
  };

  // Handle follow action
  const handleFollow = () => {
    window.open('https://warpcast.com/unify34', '_blank');
    setStatusMessage('After following, click "Verify" to check status');
  };

  // Verify follow status
  const verifyFollow = async () => {
    if (!user?.fid) return;
    setActiveAction('following');
    try {
      const res = await fetch(`/api/check-follow?fid=${user.fid}`);
      const data = await res.json();
      setRequirements(prev => ({ ...prev, following: data.isFollowing || false }));
      if (!data.isFollowing) {
        setError('Still not following @unify34. Please follow and try again.');
      }
    } catch (err) {
      setError('Failed to verify follow status');
    }
    setActiveAction(null);
    setStatusMessage('');
  };

  // Handle mint passport - use window.location for reliable navigation in Farcaster mini-app
  const handleMintPassport = () => {
    window.location.href = '/passport';
  };

  // Handle lottery entry
  const handleEnterLottery = async () => {
    // Prevent double-clicks
    if (activeAction === 'lottery') {
      return;
    }
    if (!effectiveAddress) return;
    setActiveAction('lottery');
    setError('');

    try {
      const res = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'lottery_enter_mon',
          params: {}
        })
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error?.includes('Already entered')) {
          setRequirements(prev => ({ ...prev, lottery: true }));
          setActiveAction(null);
          return;
        }
        throw new Error(data.error || 'Entry failed');
      }

      setTimeout(() => {
        refetchHasEntered();
        setRequirements(prev => ({ ...prev, lottery: true }));
        setActiveAction(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message);
      setActiveAction(null);
    }
  };

  // Show loading
  if (isLoading || contextLoading) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🌍</div>
          <p className="text-white text-lg">Checking access requirements...</p>
        </div>
      </div>
    );
  }

  // All requirements met - grant access
  if (allRequirementsMet) {
    return <>{children}</>;
  }

  // Calculate progress
  const completedCount = Object.values(requirements).filter(v => v === true).length;
  const totalCount = 5;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 z-[9999] overflow-auto">
      <div className="min-h-screen w-full flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-6 sm:p-8">

            {/* Header */}
            <div className="text-center mb-6">
              <div className="text-6xl mb-3">🌍</div>
              <h1 className="text-3xl font-bold text-white mb-2">EmpowerTours</h1>
              <p className="text-white/80 text-sm">
                Complete all requirements to access the app
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-white/70 mb-2">
                <span>Progress</span>
                <span>{completedCount}/{totalCount} completed</span>
              </div>
              <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                />
              </div>
            </div>

            {/* Requirements Checklist */}
            <div className="space-y-3 mb-6">

              {/* 1. WMON Faucet */}
              <div className={`p-4 rounded-2xl border transition-all ${
                requirements.faucet
                  ? 'bg-green-500/20 border-green-500/50'
                  : 'bg-white/5 border-white/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{requirements.faucet ? '✅' : '💧'}</span>
                    <div>
                      <p className="text-white font-medium">Claim Testnet WMON</p>
                      <p className="text-white/60 text-xs">
                        Safe: {parseFloat(safeWmonBalance).toFixed(2)} WMON
                        {faucetCooldown && !faucetStatus.canClaimNow && (
                          <span className="text-cyan-400 ml-2">• Next claim: {faucetCooldown}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {/* Show claim button if: not enough balance OR can claim again (daily reset) */}
                  {(!requirements.faucet || faucetStatus.canClaimNow) && (
                    <button
                      onClick={handleClaimFaucet}
                      disabled={activeAction === 'faucet' || (!faucetStatus.canClaimNow && faucetStatus.hasClaimed)}
                      className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
                    >
                      {activeAction === 'faucet' ? '...' : faucetStatus.canClaimNow && faucetStatus.hasClaimed ? 'Claim Daily' : 'Claim'}
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Music Subscription */}
              <div className={`p-4 rounded-2xl border transition-all ${
                requirements.subscription
                  ? 'bg-green-500/20 border-green-500/50'
                  : 'bg-white/5 border-white/20'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{requirements.subscription ? '✅' : '🎵'}</span>
                  <div>
                    <p className="text-white font-medium">Music Subscription</p>
                    <p className="text-white/60 text-xs">
                      {!requirements.subscription && parseFloat(safeWmonBalance) < 15
                        ? `Need 15+ WMON (have ${parseFloat(safeWmonBalance).toFixed(2)})`
                        : 'Choose a plan to stream music'}
                    </p>
                  </div>
                </div>
                {!requirements.subscription && (
                  <div className="grid grid-cols-2 gap-2">
                    {SUBSCRIPTION_TIERS.map((tier, idx) => {
                      const tierPrice = parseFloat(tier.display.split(' ')[0]);
                      const canAfford = parseFloat(safeWmonBalance) >= tierPrice;
                      return (
                        <button
                          key={tier.tier}
                          onClick={() => handleSubscribe(idx)}
                          disabled={activeAction === 'subscription' || !canAfford}
                          className={`p-2 rounded-xl text-center transition-all disabled:opacity-50 ${
                            canAfford && idx === 0
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                              : canAfford
                                ? 'bg-white/10 hover:bg-white/20 border border-white/20'
                                : 'bg-white/5 border border-white/10'
                          }`}
                          title={!canAfford ? `Need ${tierPrice} WMON` : ''}
                        >
                          <p className="text-white text-xs font-bold">{tier.name}</p>
                          <p className={`text-xs ${canAfford ? 'text-white/80' : 'text-red-400'}`}>{tier.display}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Follow unify34 */}
              <div className={`p-4 rounded-2xl border transition-all ${
                requirements.following
                  ? 'bg-green-500/20 border-green-500/50'
                  : 'bg-white/5 border-white/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{requirements.following ? '✅' : '👤'}</span>
                    <div>
                      <p className="text-white font-medium">Follow @unify34</p>
                      <p className="text-white/60 text-xs">Follow the creator on Farcaster</p>
                    </div>
                  </div>
                  {!requirements.following && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleFollow}
                        className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold rounded-xl transition-all"
                      >
                        Follow
                      </button>
                      <button
                        onClick={verifyFollow}
                        disabled={activeAction === 'following'}
                        className="px-3 py-2 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
                      >
                        {activeAction === 'following' ? '...' : 'Verify'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Mint Passport */}
              <div className={`p-4 rounded-2xl border transition-all ${
                requirements.passport
                  ? 'bg-green-500/20 border-green-500/50'
                  : 'bg-white/5 border-white/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{requirements.passport ? '✅' : '🛂'}</span>
                    <div>
                      <p className="text-white font-medium">Mint Passport NFT</p>
                      <p className="text-white/60 text-xs">Your travel identity on-chain</p>
                    </div>
                  </div>
                  {!requirements.passport && (
                    <button
                      onClick={handleMintPassport}
                      className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold rounded-xl transition-all"
                    >
                      Mint
                    </button>
                  )}
                </div>
              </div>

              {/* 5. Enter Lottery */}
              <div className={`p-4 rounded-2xl border transition-all ${
                requirements.lottery
                  ? 'bg-green-500/20 border-green-500/50'
                  : 'bg-white/5 border-white/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{requirements.lottery ? '✅' : '🎰'}</span>
                    <div>
                      <p className="text-white font-medium">Enter Daily Lottery</p>
                      <p className="text-white/60 text-xs">
                        {entryFee ? `${Number(formatEther(entryFee)).toFixed(2)} WMON` : '1 WMON'} entry
                      </p>
                    </div>
                  </div>
                  {!requirements.lottery && (
                    <button
                      onClick={handleEnterLottery}
                      disabled={activeAction === 'lottery' || !requirements.faucet}
                      className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
                    >
                      {activeAction === 'lottery' ? '...' : 'Enter'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Lottery Info */}
            {currentRound && (
              <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl p-4 mb-4 border border-purple-500/30">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/70">Round #{currentRound.roundId?.toString()}</span>
                  <span className="text-cyan-400 font-mono font-bold">{countdown}</span>
                </div>
                <div className="text-center mt-2">
                  <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                    {Number(formatEther(currentRound.prizePoolWmon)).toFixed(4)} MON
                  </p>
                  <p className="text-white/50 text-xs">Prize Pool</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-4 bg-red-500/20 border border-red-400/50 rounded-xl p-3">
                <p className="text-red-100 text-sm">{error}</p>
              </div>
            )}

            {/* Status Message */}
            {statusMessage && (
              <div className="mb-4 bg-blue-500/20 border border-blue-400/50 rounded-xl p-3">
                <p className="text-blue-100 text-sm">{statusMessage}</p>
              </div>
            )}

            {/* Wallet Info */}
            {effectiveAddress && (
              <p className="text-white/40 text-xs text-center">
                {effectiveAddress.slice(0, 6)}...{effectiveAddress.slice(-4)}
                {user?.username && ` • @${user.username}`}
              </p>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
