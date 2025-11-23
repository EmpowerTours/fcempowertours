'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

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
  const { walletAddress, user, isLoading: contextLoading } = useFarcasterContext();

  const [accessStatus, setAccessStatus] = useState<AccessStatus | null>(null);
  const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

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

  // Copy address to clipboard
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(LOTTERY_CONFIG.BOT_WALLET_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = LOTTERY_CONFIG.BOT_WALLET_ADDRESS;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Verify payment on-chain
  const handleVerifyPayment = async () => {
    if (!walletAddress || !user?.fid) {
      setError('Wallet not connected');
      return;
    }

    setIsVerifying(true);
    setError('');
    setSuccess('');

    try {
      console.log('Verifying payment on-chain...');
      setSuccess('Checking Base blockchain for your payment...');

      const response = await fetch('/api/lottery/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          fid: user.fid,
          username: user.username,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Payment verified! ${data.message}`);

        // Refresh access status
        setTimeout(() => {
          checkAccess();
          fetchPoolStatus();
        }, 1500);
      } else {
        setError(data.error || 'No payment found. Please send ETH and try again.');
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
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

  // Show payment gate with manual payment instructions
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

          {/* Payment Instructions */}
          <div className="bg-blue-500/20 rounded-xl p-4 mb-6 border border-blue-400/30">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              📋 Payment Instructions
            </h3>

            <div className="space-y-3">
              <div className="text-sm text-white/80">
                <span className="text-blue-400 font-bold">1.</span> Send exactly <span className="text-green-400 font-bold">{LOTTERY_CONFIG.ACCESS_FEE_ETH} ETH</span> on <span className="text-blue-400 font-bold">Base</span> to:
              </div>

              {/* Payment Address */}
              <div
                onClick={copyAddress}
                className="bg-black/30 rounded-lg p-3 cursor-pointer hover:bg-black/40 transition-colors border border-white/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-yellow-300 text-xs sm:text-sm break-all font-mono">
                    {LOTTERY_CONFIG.BOT_WALLET_ADDRESS}
                  </code>
                  <button className="text-white/60 hover:text-white shrink-0">
                    {copied ? '✅' : '📋'}
                  </button>
                </div>
                <p className="text-white/50 text-xs mt-1">
                  {copied ? 'Copied!' : 'Tap to copy address'}
                </p>
              </div>

              <div className="text-sm text-white/80">
                <span className="text-blue-400 font-bold">2.</span> Use any wallet (Coinbase, MetaMask, Rainbow, etc.)
              </div>

              <div className="text-sm text-white/80">
                <span className="text-blue-400 font-bold">3.</span> After sending, click "Verify Payment" below
              </div>
            </div>
          </div>

          {/* Today's Pool Info */}
          {poolStatus && (
            <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 mb-6 border border-green-500/30">
              <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                🏆 Today's Lottery Pool
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
            </div>
          )}

          {/* Verify Payment Button */}
          <button
            onClick={handleVerifyPayment}
            disabled={isVerifying || !walletAddress}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg"
          >
            {isVerifying ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">🔍</span>
                Verifying on Base...
              </span>
            ) : (
              <span>✅ Verify My Payment</span>
            )}
          </button>

          <p className="text-white/50 text-xs text-center mt-2">
            We'll check the blockchain for your payment
          </p>

          {/* Wallet Info */}
          {walletAddress && (
            <p className="text-white/40 text-xs text-center mt-4">
              Your wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
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
