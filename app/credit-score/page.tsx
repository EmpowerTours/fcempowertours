'use client';

import { CreditScoreBadge } from '@/src/components/CreditScoreBadge';

export default function CreditScorePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">⭐ Credit Score</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Track your EmpowerTours credit score based on your on-chain activity
          </p>
        </div>

        <CreditScoreBadge />
      </div>
    </div>
  );
}
