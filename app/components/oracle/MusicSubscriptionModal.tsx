'use client';

import React, { useState, useEffect } from 'react';
import { Music2, Sparkles, Clock, AlertTriangle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';

interface SubscriptionStatus {
  hasSubscription: boolean;
  expiry: number;
  isActive: boolean;
  daysRemaining: number;
  totalPlays: number;
  tier: number;
}

interface MusicSubscriptionModalProps {
  userAddress?: string;
  userFid?: number;
  onClose: () => void;
}

const MUSIC_SUBSCRIPTION_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION || '';
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON || '';

// Subscription tiers from contract
const TIERS = [
  { id: 0, name: 'Daily', price: 15, duration: '1 day' },
  { id: 1, name: 'Weekly', price: 75, duration: '7 days', discount: '15% off' },
  { id: 2, name: 'Monthly', price: 300, duration: '30 days' },
  { id: 3, name: 'Yearly', price: 3000, duration: '365 days', discount: '15% off' },
];

const SUBSCRIPTION_ABI = [
  'function hasActiveSubscription(address user) external view returns (bool)',
  'function getSubscriptionInfo(address user) external view returns (uint256 userFid, uint256 expiry, bool active, uint256 totalPlays, uint256 flagVotes, uint8 lastTier, bool isFlagged)',
  'function subscribeFor(address user, uint256 userFid, uint8 tier) external',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

export const MusicSubscriptionModal: React.FC<MusicSubscriptionModalProps> = ({
  userAddress,
  userFid,
  onClose
}) => {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [selectedTier, setSelectedTier] = useState(2); // Default to Monthly
  const [wmonBalance, setWmonBalance] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch subscription status
  useEffect(() => {
    if (!userAddress) {
      setCheckingStatus(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        // Use RPC directly instead of MetaMask
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz');
        const subscriptionContract = new ethers.Contract(
          MUSIC_SUBSCRIPTION_ADDRESS,
          SUBSCRIPTION_ABI,
          provider
        );

        const info = await subscriptionContract.getSubscriptionInfo(userAddress);
        const [, expiry, active, totalPlays, , lastTier] = info;

        const expiryTimestamp = Number(expiry);
        const now = Math.floor(Date.now() / 1000);
        const daysRemaining = Math.max(0, Math.floor((expiryTimestamp - now) / 86400));

        const status: SubscriptionStatus = {
          hasSubscription: active && expiryTimestamp > now,
          expiry: expiryTimestamp,
          isActive: active && expiryTimestamp > now,
          daysRemaining,
          totalPlays: Number(totalPlays),
          tier: Number(lastTier),
        };

        setSubscriptionStatus(status);
      } catch (err) {
        console.error('Failed to fetch subscription status:', err);
      } finally {
        setCheckingStatus(false);
      }
    };

    fetchStatus();
  }, [userAddress]);

  // Check WMON balance
  useEffect(() => {
    if (!userAddress) return;

    const checkBalance = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz');
        const wmonContract = new ethers.Contract(WMON_ADDRESS, ERC20_ABI, provider);
        const balance = await wmonContract.balanceOf(userAddress);
        setWmonBalance(ethers.formatEther(balance));
      } catch (err) {
        console.error('Failed to check WMON balance:', err);
      }
    };

    checkBalance();
  }, [userAddress]);

  const handleSubscribe = async () => {
    if (!userAddress || !userFid) {
      setError('Please connect your Farcaster account');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const tier = TIERS[selectedTier];
      const priceInWei = ethers.parseEther(tier.price.toString());

      // Call the delegation API
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'music-subscribe',
          userAddress,
          params: {
            userFid,
            tier: selectedTier,
            amount: priceInWei.toString(),
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Subscription failed');
      }

      setSuccess(`Successfully subscribed for ${tier.duration}!`);

      // Refresh status after 2 seconds
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      console.error('Subscription error:', err);
      setError(err.message || 'Failed to subscribe');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (checkingStatus) {
    return (
      <div className="bg-gradient-to-br from-purple-900/20 via-black to-cyan-900/20 border border-cyan-500/30 rounded-2xl p-6">
        <div className="flex justify-center items-center py-8">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      </div>
    );
  }

  // Active subscription view
  if (subscriptionStatus?.isActive) {
    return (
      <div className="bg-gradient-to-br from-green-900/20 via-black to-cyan-900/20 border border-green-500/30 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <div>
              <h3 className="text-xl font-bold text-white">Active Subscription</h3>
              <p className="text-sm text-gray-400">Unlimited music streaming</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Days Remaining</div>
            <div className="text-2xl font-bold text-green-400">{subscriptionStatus.daysRemaining}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Total Plays</div>
            <div className="text-2xl font-bold text-cyan-400">{subscriptionStatus.totalPlays}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Clock className="w-4 h-4" />
          <span>Expires: {new Date(subscriptionStatus.expiry * 1000).toLocaleDateString()}</span>
        </div>
      </div>
    );
  }

  const selectedTierData = TIERS[selectedTier];
  const canAfford = Number(wmonBalance) >= selectedTierData.price;

  return (
    <div className="bg-gradient-to-br from-purple-900/20 via-black to-cyan-900/20 border border-cyan-500/30 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-full flex items-center justify-center">
            <Music2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Music Streaming</h3>
            <p className="text-sm text-gray-400">Unlimited access to all music NFTs</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Tier Selection */}
      <div className="mb-6">
        <label className="text-sm text-gray-400 mb-2 block">Select Plan</label>
        <div className="grid grid-cols-2 gap-2">
          {TIERS.map((tier) => (
            <button
              key={tier.id}
              onClick={() => setSelectedTier(tier.id)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                selectedTier === tier.id
                  ? 'border-cyan-500 bg-cyan-500/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="text-lg font-bold text-white">{tier.name}</div>
                {tier.discount && (
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                    {tier.discount}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400">{tier.price} WMON</div>
              <div className="text-[10px] text-gray-500">{tier.duration}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cost Summary */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Plan</span>
          <span className="text-sm font-semibold text-white">{selectedTierData.name} ({selectedTierData.duration})</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Cost</span>
          <span className="text-sm font-semibold text-cyan-400">{selectedTierData.price} WMON</span>
        </div>
        <div className="border-t border-gray-700 pt-2 mt-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">Your WMON Balance</span>
            <span className={canAfford ? 'text-green-400' : 'text-red-400'}>
              {Number(wmonBalance).toFixed(2)} WMON
            </span>
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-sm text-green-300">{success}</span>
        </div>
      )}

      {/* Subscribe Button */}
      <button
        onClick={handleSubscribe}
        disabled={loading || !canAfford || !userFid}
        className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : !canAfford ? (
          'Insufficient WMON Balance'
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Subscribe for {selectedTierData.price} WMON
          </>
        )}
      </button>

      {/* Info */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• Stream any music NFT on the platform</p>
        <p>• Artists are paid based on your listening activity</p>
        <p>• Cancel anytime - no long-term commitment</p>
      </div>
    </div>
  );
};
