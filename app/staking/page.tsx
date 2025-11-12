'use client';

import { StakeTours } from '@/src/components/StakeTours';
import { PortfolioDisplay } from '@/src/components/PortfolioDisplay';

export default function StakingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">💰 Staking & Yield</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Stake your TOURS tokens to earn rewards and increase your credit score
          </p>
        </div>

        {/* Portfolio Overview */}
        <PortfolioDisplay />

        {/* Staking Interface */}
        <div className="mt-8">
          <StakeTours />
        </div>
      </div>
    </div>
  );
}
