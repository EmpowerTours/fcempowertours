'use client';

import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/card';
import { useYieldStrategy } from '../hooks/useYieldStrategy';
import { useTandaYieldGroup } from '../hooks/useTandaYieldGroup';
import { useCreditScoreCalculator } from '../hooks/useCreditScoreCalculator';
import { formatUnits } from 'viem';

export function PortfolioDisplay() {
  const { address } = useAccount();

  const { useGetStakedAmount, useGetPendingRewards } = useYieldStrategy();
  const { useGetScore, useGetScoreTier } = useCreditScoreCalculator();

  const { data: stakedAmount } = useGetStakedAmount(address!);
  const { data: pendingRewards } = useGetPendingRewards(address!);
  const { data: creditScore } = useGetScore(address!);
  const { data: scoreTier } = useGetScoreTier(address!);

  // Type assertions
  const typedStakedAmount = stakedAmount as bigint | undefined;
  const typedPendingRewards = pendingRewards as bigint | undefined;

  if (!address) {
    return (
      <Card className="p-6 max-w-4xl mx-auto">
        <p className="text-center text-gray-600">
          Connect your wallet to view your portfolio
        </p>
      </Card>
    );
  }

  const totalValue = typedStakedAmount && typedPendingRewards
    ? formatUnits(typedStakedAmount + typedPendingRewards, 18)
    : '0';

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6">Your Portfolio</h2>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Total Value</div>
          <div className="text-3xl font-bold">{totalValue} TOURS</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Credit Score</div>
          <div className="text-3xl font-bold">
            {creditScore ? creditScore.toString() : '0'}
          </div>
          {scoreTier ? (
            <div className="text-sm text-gray-600 mt-1">
              Tier: {String(scoreTier)}
            </div>
          ) : null}
        </Card>

        <Card className="p-6">
          <div className="text-sm text-gray-600 mb-1">Staked Amount</div>
          <div className="text-3xl font-bold">
            {typedStakedAmount ? formatUnits(typedStakedAmount, 18) : '0'} TOURS
          </div>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">Holdings Breakdown</h3>

        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b">
            <div>
              <div className="font-medium">Staked TOURS</div>
              <div className="text-sm text-gray-600">In YieldStrategy contract</div>
            </div>
            <div className="text-right">
              <div className="font-bold">
                {typedStakedAmount ? formatUnits(typedStakedAmount, 18) : '0'}
              </div>
              <div className="text-sm text-gray-600">TOURS</div>
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-b">
            <div>
              <div className="font-medium">Pending Rewards</div>
              <div className="text-sm text-gray-600">Unclaimed staking rewards</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-green-600">
                {typedPendingRewards ? formatUnits(typedPendingRewards, 18) : '0'}
              </div>
              <div className="text-sm text-gray-600">TOURS</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
