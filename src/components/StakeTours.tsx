'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useYieldStrategy } from '../hooks/useYieldStrategy';
import { toast } from 'sonner';
import { formatUnits, parseUnits } from 'viem';

export function StakeTours() {
  const { address } = useAccount();
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

  const { data: stakedAmount } = useGetStakedAmount(address!);
  const { data: pendingRewards } = useGetPendingRewards(address!);
  const { data: apy } = useGetAPY();

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const amount = parseUnits(stakeAmount, 18);
      stake(amount);
      toast.success('Staking TOURS...');
      setStakeAmount('');
    } catch (error) {
      console.error('Error staking:', error);
      toast.error('Failed to stake');
    }
  };

  const handleUnstake = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!unstakeAmount || parseFloat(unstakeAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const amount = parseUnits(unstakeAmount, 18);
      unstake(amount);
      toast.success('Unstaking TOURS...');
      setUnstakeAmount('');
    } catch (error) {
      console.error('Error unstaking:', error);
      toast.error('Failed to unstake');
    }
  };

  const handleClaimRewards = async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      claimRewards();
      toast.success('Claiming rewards...');
    } catch (error) {
      console.error('Error claiming rewards:', error);
      toast.error('Failed to claim rewards');
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      {/* Stats Card */}
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Staking Stats</h2>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Your Staked:</span>
            <span className="font-semibold">
              {stakedAmount ? formatUnits(stakedAmount, 18) : '0'} TOURS
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Pending Rewards:</span>
            <span className="font-semibold text-green-600">
              {pendingRewards ? formatUnits(pendingRewards, 18) : '0'} TOURS
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
          disabled={!address || isPending || isConfirming || !pendingRewards || pendingRewards === 0n}
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
            disabled={isPending || isConfirming || !address}
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
              disabled={isPending || isConfirming || !address}
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
