'use client';

import { useState } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useYieldStrategy } from '../hooks/useYieldStrategy';
import { toast } from 'sonner';
import { formatUnits, parseUnits, Address } from 'viem';

export function StakeTours() {
  const { walletAddress } = useFarcasterContext();
  const {
    stake,
    unstake,
    claimRewards,
    isPending,
    isConfirming,
    useGetStakedAmount,
    useGetPendingRewards,
    useGetAPY,
  } = useYieldStrategy();

  const { data: stakedAmount } = useGetStakedAmount(walletAddress as Address);
  const { data: pendingRewards } = useGetPendingRewards(walletAddress as Address);
  const { data: apy } = useGetAPY();

  // Type assertions
  const typedStakedAmount = stakedAmount as bigint | undefined;
  const typedPendingRewards = pendingRewards as bigint | undefined;

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('🎯 [STAKE] handleStake called');
    console.log('🎯 [STAKE] walletAddress:', walletAddress);
    console.log('🎯 [STAKE] stakeAmount:', stakeAmount);

    if (!walletAddress) {
      console.warn('⚠️ [STAKE] No wallet address');
      toast.error('Please connect your wallet first. Visit your profile to connect.');
      return;
    }

    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      console.warn('⚠️ [STAKE] Invalid amount:', stakeAmount);
      toast.error('Please enter a valid amount greater than 0');
      return;
    }

    try {
      console.log('🔄 [STAKE] Starting stake process...');
      toast.loading('Staking TOURS tokens (gasless)...');

      // Call delegation API for gasless staking
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'stake_tours',
          params: {
            amount: stakeAmount
          }
        })
      });

      console.log('📥 [STAKE] Response status:', response.status);
      const data = await response.json();
      console.log('📥 [STAKE] Response data:', data);

      if (!data.success) {
        throw new Error(data.error || 'Staking failed');
      }

      toast.dismiss();
      toast.success(`Successfully staked ${stakeAmount} TOURS! (Gasless transaction)`);
      setStakeAmount('');

      // Refresh the page data after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error('❌ [STAKE] Error staking:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to stake. Please try again.');
    }
  };

  const handleUnstake = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!walletAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!unstakeAmount || parseFloat(unstakeAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      toast.loading('Unstaking TOURS...');

      // Call delegation API for gasless unstaking
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'unstake_tours',
          params: {
            amount: unstakeAmount
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unstaking failed');
      }

      toast.dismiss();
      toast.success(`Unstaked ${unstakeAmount} TOURS! (Gasless)`);
      setUnstakeAmount('');
    } catch (error: any) {
      console.error('Error unstaking:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to unstake');
    }
  };

  const handleClaimRewards = async () => {
    if (!walletAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      toast.loading('Claiming rewards...');

      // Call delegation API for gasless claim
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'claim_rewards',
          params: {}
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Claiming failed');
      }

      toast.dismiss();
      toast.success('Rewards claimed! (Gasless)');
    } catch (error: any) {
      console.error('Error claiming rewards:', error);
      toast.dismiss();
      toast.error(error.message || 'Failed to claim rewards');
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      {/* Connection Status Banner */}
      {!walletAddress && (
        <div className="md:col-span-2 bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-yellow-800">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-semibold">Wallet Not Connected</p>
              <p className="text-sm">Please visit your profile page to connect your wallet first.</p>
            </div>
          </div>
        </div>
      )}

      {walletAddress && (
        <div className="md:col-span-2 bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-green-800">
            <span className="text-xl">✅</span>
            <div>
              <p className="font-semibold">Wallet Connected</p>
              <p className="text-sm font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Card */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Staking Stats</h2>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Your Staked:</span>
            <span className="font-semibold">
              {typedStakedAmount ? formatUnits(typedStakedAmount, 18) : '0'} TOURS
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Pending Rewards:</span>
            <span className="font-semibold text-green-600">
              {typedPendingRewards ? formatUnits(typedPendingRewards, 18) : '0'} TOURS
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Current APY:</span>
            <span className="font-semibold">
              {apy ? `${(Number(apy) / 100).toFixed(2)}%` : '0%'}
            </span>
          </div>
        </div>

        <Button
          onClick={handleClaimRewards}
          disabled={!walletAddress || isPending || isConfirming || !pendingRewards || pendingRewards === 0n}
          className="w-full mt-4"
        >
          Claim Rewards
        </Button>
      </Card>

      {/* Stake/Unstake Card */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Stake TOURS</h2>

        <form onSubmit={handleStake} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Amount to Stake</label>
            <Input
              type="number"
              step="0.000001"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="0.0"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || isConfirming || !walletAddress}
            className="w-full"
          >
            {isPending || isConfirming ? 'Staking...' : 'Stake'}
          </Button>
        </form>

        <div className="border-t pt-4">
          <h3 className="text-xl font-bold mb-4">Unstake TOURS</h3>

          <form onSubmit={handleUnstake} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Amount to Unstake</label>
              <Input
                type="number"
                step="0.000001"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                placeholder="0.0"
              />
            </div>

            <Button
              type="submit"
              variant="outline"
              disabled={isPending || isConfirming || !walletAddress}
              className="w-full"
            >
              {isPending || isConfirming ? 'Unstaking...' : 'Unstake'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
