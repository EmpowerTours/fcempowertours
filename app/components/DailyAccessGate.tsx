'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { parseEther, formatEther } from 'viem';

// Configuration - matches lib/lottery.ts
const LOTTERY_CONFIG = {
  ACCESS_FEE_ETH: 0.001,
  BOT_WALLET_ADDRESS: '0x2d5dd9aa1dc42949d203d1946d599ba47f0b6d1c',
  BASE_CHAIN_ID: 8453, // Base mainnet
};

interface DailyAccessGateProps {
  children: React.ReactNode;
}

interface AccessStatus {
  hasAccess: boolean;
  expiresAt?: number;
}

interface PoolStatus {
  day: string;
  totalPool: number;
  participantCount: number;
  status: string;
}

export default function DailyAccessGate({ children }: DailyAccessGateProps) {
  const { walletAddress, user, sendTransaction, sdk, isLoading: contextLoading } = useFarcasterContext();

  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);

  // Check access status
  const checkAccess = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const response = await fetch(`/api/lottery/check-access?address=${walletAddress}`);
      const data = await response.json();

      if (data.success) {
        setAccessStatus({
          hasAccess: data.hasAccess,
          expiresAt: data.expiresAt,
        });
      } else {
        setAccessStatus({ hasAccess: false });
      }
    } catch (err) {
      console.error('Error checking access:', err);
      setAccessStatus({ hasAccess: false });
    }
  }, [walletAddress]);

  // Fetch lottery pool status
  const fetchPoolStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/lottery/status');
      const data = await response.json();

      if (data.success && data.todayPool) {
        setPoolStatus(data.todayPool);
      }
    } catch (err) {
      console.error('Error fetching pool status:', err);
    }
  }, []);

  // Initial checks
  useEffect(() => {
    const runChecks = async () => {
      setIsChecking(true);
      await Promise.all([checkAccess(), fetchPoolStatus()]);
      setIsChecking(false);
    };

    if (walletAddress && !contextLoading) {
      runChecks();
    } else if (!contextLoading) {
      setIsChecking(false);
    }
  }, [walletAddress, contextLoading, checkAccess, fetchPoolStatus]);

  // Handle payment
  const handlePayment = async () => {
    if (!walletAddress || !user?.fid) {
      setError('Wallet not connected');
      return;
    }

    setIsPaying(true);
    setError('');
    setSuccess('');

    try {
      // Step 1: Request chain switch to Base
      console.log('Switching to Base chain...');
      setSuccess('Switching to Base network...');

      try {
        if (sdk?.actions?.switchChain) {
          await sdk.actions.switchChain({ chainId: LOTTERY_CONFIG.BASE_CHAIN_ID });
        }
      } catch (switchErr: any) {
        // Chain switch may fail if already on Base or not supported
        console.warn('Chain switch result:', switchErr);
      }

      // Step 2: Send ETH to bot wallet
      console.log('Sending payment...');
      setSuccess('Please confirm the payment in your wallet...');

      const value = parseEther(LOTTERY_CONFIG.ACCESS_FEE_ETH.toString());
      const valueHex = '0x' + value.toString(16);

      let txResult: any;

      // Try Farcaster SDK first
      if (sdk?.actions?.sendTransaction) {
        console.log('Using Farcaster SDK sendTransaction');
        txResult = await sdk.actions.sendTransaction({
          to: LOTTERY_CONFIG.BOT_WALLET_ADDRESS,
          value: valueHex,
          chainId: LOTTERY_CONFIG.BASE_CHAIN_ID,
        });
      } else if (sendTransaction) {
        console.log('Using context sendTransaction');
        txResult = await sendTransaction({
          to: LOTTERY_CONFIG.BOT_WALLET_ADDRESS,
          value: valueHex,
          chainId: LOTTERY_CONFIG.BASE_CHAIN_ID,
        });
      } else {
        throw new Error('No transaction method available');
      }

      const hash = txResult?.transactionHash || txResult?.hash || txResult;
      console.log('Transaction result:', txResult);

      if (!hash) {
        throw new Error('No transaction hash received');
      }

      setTxHash(hash);
      setSuccess('Payment sent! Verifying...');

      // Step 3: Record payment on backend
      console.log('Recording payment...');
      const recordResponse = await fetch('/api/lottery/pay-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          fid: user.fid,
          username: user.username,
          txHash: hash,
          amountETH: LOTTERY_CONFIG.ACCESS_FEE_ETH,
        }),
      });

      const recordData = await recordResponse.json();

      if (!recordData.success) {
        throw new Error(recordData.error || 'Failed to record payment');
      }

      setSuccess('Access granted! You are entered in today\'s lottery!');

      // Refresh status after short delay
      setTimeout(() => {
        checkAccess();
        fetchPoolStatus();
      }, 2000);

    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setIsPaying(false);
    }
  };

  // Format time remaining
  const formatTimeRemaining = (expiresAt: number) => {
    const now = Date.now();
    const remaining = expiresAt - now;

    if (remaining <= 0) return 'Expired';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  };

  // Show loading while checking
  if (isChecking || contextLoading) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🎰</div>
          <p className="text-white text-lg">Checking access status...</p>
        </div>
      </div>
    );
  }

  // User has valid access - show children
  if (accessStatus?.hasAccess) {
    return <>{children}</>;
  }

  // Show payment gate
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-amber-900 via-orange-900 to-red-900 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
      <div className="w-full max-w-md my-8">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-6 sm:p-8">

          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-6xl mb-3">🎰</div>
            <h1 className="text-3xl font-bold text-white mb-2">Daily Access Pass</h1>
            <p className="text-white/80 text-sm">
              Pay once, access all day, win ETH!
            </p>
          </div>

          {/* Price Card */}
          <div className="bg-white/10 rounded-2xl p-4 mb-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white/70 text-sm">Daily Access Fee</p>
                <p className="text-3xl font-bold text-white">
                  {LOTTERY_CONFIG.ACCESS_FEE_ETH} ETH
                </p>
                <p className="text-white/60 text-xs">on Base network</p>
              </div>
              <div className="text-5xl">
                <img
                  src="https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.svg"
                  alt="Base"
                  className="w-14 h-14"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/60 text-xs">Your Share</p>
                <p className="text-green-400 font-semibold">50% to Lottery</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/60 text-xs">Access Duration</p>
                <p className="text-blue-400 font-semibold">24 Hours</p>
              </div>
            </div>
          </div>

          {/* Today's Pool Info */}
          {poolStatus && (
            <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 mb-6 border border-green-500/30">
              <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                <span>Today's Lottery Pool</span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-white/60 text-xs">Current Pool</p>
                  <p className="text-xl font-bold text-green-400">
                    {poolStatus.totalPool.toFixed(6)} ETH
                  </p>
                </div>
                <div>
                  <p className="text-white/60 text-xs">Participants</p>
                  <p className="text-xl font-bold text-white">
                    {poolStatus.participantCount}
                  </p>
                </div>
              </div>
              <p className="text-white/60 text-xs mt-2">
                Winner drawn daily at midnight UTC
              </p>
            </div>
          )}

          {/* How it Works */}
          <div className="space-y-2 mb-6">
            <div className="flex items-start gap-3 text-sm">
              <span className="text-lg">1.</span>
              <p className="text-white/80">Pay {LOTTERY_CONFIG.ACCESS_FEE_ETH} ETH on Base</p>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="text-lg">2.</span>
              <p className="text-white/80">Get 24-hour access to EmpowerTours</p>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="text-lg">3.</span>
              <p className="text-white/80">50% of your fee enters today's lottery</p>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="text-lg">4.</span>
              <p className="text-white/80">Random winner announced daily!</p>
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
            <div className="mb-4 bg-green-500/20 border border-green-400/50 rounded-xl p-3">
              <p className="text-green-100 text-sm">{success}</p>
              {txHash && (
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 text-xs underline mt-1 block"
                >
                  View on BaseScan
                </a>
              )}
            </div>
          )}

          {/* Pay Button */}
          <button
            onClick={handlePayment}
            disabled={isPaying || !walletAddress}
            className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white py-4 rounded-xl font-bold text-lg hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg"
          >
            {isPaying ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                Processing...
              </span>
            ) : (
              <span>Pay {LOTTERY_CONFIG.ACCESS_FEE_ETH} ETH & Enter Lottery</span>
            )}
          </button>

          {/* Wallet Info */}
          {walletAddress && (
            <p className="text-white/40 text-xs text-center mt-4">
              Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </p>
          )}

          {/* Previous Winners Link */}
          <div className="text-center mt-4">
            <a
              href="/lottery"
              className="text-white/60 text-sm hover:text-white/90 underline"
            >
              View Previous Winners
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
