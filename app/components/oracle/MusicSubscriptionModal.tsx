'use client';

import React, { useState, useEffect } from 'react';
import { Music2, Sparkles, Lock, Unlock, Clock, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { ethers } from 'ethers';

interface SubscriptionStatus {
  hasSubscription: boolean;
  expiry: number;
  stakedAmount: string;
  isActive: boolean;
  daysRemaining: number;
}

interface MusicSubscriptionModalProps {
  userAddress?: string;
  onClose: () => void;
}

const MUSIC_SUBSCRIPTION_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_SUBSCRIPTION || '';
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON || '';
const TOURS_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN || '';

const MONTHLY_PRICE = '300'; // 300 WMON
const STAKE_REQUIRED = '1000'; // 1000 TOURS

const SUBSCRIPTION_ABI = [
  'function subscribe(uint256 months) external',
  'function hasActiveSubscription(address user) external view returns (bool)',
  'function subscriptions(address user) external view returns (uint256 expiry, uint256 stakedTours, bool active, uint256 totalPlays, uint256 flagVotes)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];

export const MusicSubscriptionModal: React.FC<MusicSubscriptionModalProps> = ({
  userAddress,
  onClose
}) => {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [needsWmonApproval, setNeedsWmonApproval] = useState(false);
  const [needsToursApproval, setNeedsToursApproval] = useState(false);
  const [wmonBalance, setWmonBalance] = useState('0');
  const [toursBalance, setToursBalance] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch subscription status
  useEffect(() => {
    if (!userAddress) return;

    const fetchStatus = async () => {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const subscriptionContract = new ethers.Contract(
          MUSIC_SUBSCRIPTION_ADDRESS,
          SUBSCRIPTION_ABI,
          provider
        );

        const [expiry, stakedTours, active] = await subscriptionContract.subscriptions(userAddress);

        const expiryTimestamp = Number(expiry);
        const now = Math.floor(Date.now() / 1000);
        const daysRemaining = Math.max(0, Math.floor((expiryTimestamp - now) / 86400));

        const status: SubscriptionStatus = {
          hasSubscription: active && expiryTimestamp > now,
          expiry: expiryTimestamp,
          stakedAmount: ethers.formatEther(stakedTours),
          isActive: active && expiryTimestamp > now,
          daysRemaining,
        };

        setSubscriptionStatus(status);
      } catch (err) {
        console.error('Failed to fetch subscription status:', err);
      }
    };

    fetchStatus();
  }, [userAddress]);

  // Check balances and approvals
  useEffect(() => {
    if (!userAddress) return;

    const checkBalancesAndApprovals = async () => {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const wmonContract = new ethers.Contract(WMON_ADDRESS, ERC20_ABI, provider);
        const toursContract = new ethers.Contract(TOURS_TOKEN_ADDRESS, ERC20_ABI, provider);

        const [wmonBal, toursBal, wmonAllowance, toursAllowance] = await Promise.all([
          wmonContract.balanceOf(userAddress),
          toursContract.balanceOf(userAddress),
          wmonContract.allowance(userAddress, MUSIC_SUBSCRIPTION_ADDRESS),
          toursContract.allowance(userAddress, MUSIC_SUBSCRIPTION_ADDRESS),
        ]);

        setWmonBalance(ethers.formatEther(wmonBal));
        setToursBalance(ethers.formatEther(toursBal));

        const totalCost = ethers.parseEther((Number(MONTHLY_PRICE) * selectedMonths).toString());
        const stakeRequired = ethers.parseEther(STAKE_REQUIRED);

        setNeedsWmonApproval(wmonAllowance < totalCost);
        setNeedsToursApproval(!subscriptionStatus?.hasSubscription && toursAllowance < stakeRequired);
      } catch (err) {
        console.error('Failed to check balances:', err);
      }
    };

    checkBalancesAndApprovals();
  }, [userAddress, selectedMonths, subscriptionStatus]);

  const handleApproveWmon = async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const wmonContract = new ethers.Contract(WMON_ADDRESS, ERC20_ABI, signer);

      const totalCost = ethers.parseEther((Number(MONTHLY_PRICE) * selectedMonths).toString());
      const tx = await wmonContract.approve(MUSIC_SUBSCRIPTION_ADDRESS, totalCost);
      await tx.wait();

      setNeedsWmonApproval(false);
      setSuccess('WMON approved successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to approve WMON');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveTours = async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const toursContract = new ethers.Contract(TOURS_TOKEN_ADDRESS, ERC20_ABI, signer);

      const stakeRequired = ethers.parseEther(STAKE_REQUIRED);
      const tx = await toursContract.approve(MUSIC_SUBSCRIPTION_ADDRESS, stakeRequired);
      await tx.wait();

      setNeedsToursApproval(false);
      setSuccess('TOURS approved successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to approve TOURS');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const subscriptionContract = new ethers.Contract(
        MUSIC_SUBSCRIPTION_ADDRESS,
        SUBSCRIPTION_ABI,
        signer
      );

      const tx = await subscriptionContract.subscribe(selectedMonths);
      await tx.wait();

      setSuccess(`Successfully subscribed for ${selectedMonths} month(s)!`);

      // Refresh status after 2 seconds
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to subscribe');
    } finally {
      setLoading(false);
    }
  };

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
          <div className="bg-black/40 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Days Remaining</div>
            <div className="text-2xl font-bold text-green-400">{subscriptionStatus.daysRemaining}</div>
          </div>
          <div className="bg-black/40 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Staked TOURS</div>
            <div className="text-2xl font-bold text-cyan-400">{subscriptionStatus.stakedAmount}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Clock className="w-4 h-4" />
          <span>Expires: {new Date(subscriptionStatus.expiry * 1000).toLocaleDateString()}</span>
        </div>
      </div>
    );
  }

  const totalCost = Number(MONTHLY_PRICE) * selectedMonths;
  const canAfford = Number(wmonBalance) >= totalCost && Number(toursBalance) >= Number(STAKE_REQUIRED);

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

      {/* Pricing Options */}
      <div className="mb-6">
        <label className="text-sm text-gray-400 mb-2 block">Select Duration</label>
        <div className="grid grid-cols-3 gap-2">
          {[1, 3, 6].map((months) => (
            <button
              key={months}
              onClick={() => setSelectedMonths(months)}
              className={`p-3 rounded-lg border-2 transition-all ${
                selectedMonths === months
                  ? 'border-cyan-500 bg-cyan-500/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="text-lg font-bold text-white">{months}mo</div>
              <div className="text-xs text-gray-400">{Number(MONTHLY_PRICE) * months} WMON</div>
            </button>
          ))}
        </div>
      </div>

      {/* Requirements */}
      <div className="bg-black/40 rounded-lg p-4 mb-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Payment Required</span>
          <span className="text-sm font-semibold text-white">{totalCost} WMON</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Stake Required (one-time)</span>
          <span className="text-sm font-semibold text-white">{STAKE_REQUIRED} TOURS</span>
        </div>
        <div className="border-t border-gray-700 pt-2 mt-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">Your WMON Balance</span>
            <span className={Number(wmonBalance) >= totalCost ? 'text-green-400' : 'text-red-400'}>
              {Number(wmonBalance).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs mt-1">
            <span className="text-gray-500">Your TOURS Balance</span>
            <span className={Number(toursBalance) >= Number(STAKE_REQUIRED) ? 'text-green-400' : 'text-red-400'}>
              {Number(toursBalance).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-sm text-green-300">{success}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {needsWmonApproval && (
          <button
            onClick={handleApproveWmon}
            disabled={loading}
            className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50"
          >
            {loading ? 'Approving WMON...' : `Approve ${totalCost} WMON`}
          </button>
        )}

        {needsToursApproval && !subscriptionStatus?.hasSubscription && (
          <button
            onClick={handleApproveTours}
            disabled={loading}
            className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50"
          >
            {loading ? 'Approving TOURS...' : `Approve ${STAKE_REQUIRED} TOURS`}
          </button>
        )}

        <button
          onClick={handleSubscribe}
          disabled={loading || needsWmonApproval || needsToursApproval || !canAfford}
          className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            'Processing...'
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Subscribe for {selectedMonths} Month{selectedMonths > 1 ? 's' : ''}
            </>
          )}
        </button>
      </div>

      {/* Info */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>• TOURS stake is required once and returned when you unsubscribe</p>
        <p>• TOURS will be slashed if anti-bot systems detect fraudulent activity</p>
        <p>• Access to ALL music NFTs on the platform</p>
      </div>
    </div>
  );
};
