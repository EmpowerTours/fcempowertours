'use client';

import { useAccount } from 'wagmi';
import { Card } from '@/components/ui/card';
import { useCreditScoreCalculator } from '../hooks/useCreditScoreCalculator';

interface ScoreBreakdown {
  paymentHistory: bigint;
  stakeAmount: bigint;
  tandaParticipation: bigint;
  eventAttendance: bigint;
  totalScore: bigint;
}

export function CreditScoreBadge() {
  const { address } = useAccount();
  const { useGetScore, useGetScoreTier, useGetScoreBreakdown } = useCreditScoreCalculator();

  const { data: score } = useGetScore(address!);
  const { data: tier } = useGetScoreTier(address!);
  const { data: breakdown } = useGetScoreBreakdown(address!);

  if (!address) {
    return (
      <Card className="p-6 max-w-md mx-auto">
        <p className="text-center text-gray-600">
          Connect your wallet to view your credit score
        </p>
      </Card>
    );
  }

  const getTierColor = (tierName: string | undefined) => {
    if (!tierName) return 'bg-gray-500';
    const lowerTier = tierName.toLowerCase();
    if (lowerTier.includes('platinum') || lowerTier.includes('diamond')) return 'bg-purple-600';
    if (lowerTier.includes('gold')) return 'bg-yellow-600';
    if (lowerTier.includes('silver')) return 'bg-gray-400';
    if (lowerTier.includes('bronze')) return 'bg-orange-700';
    return 'bg-blue-600';
  };

  const getTierEmoji = (tierName: string | undefined) => {
    if (!tierName) return '⭐';
    const lowerTier = tierName.toLowerCase();
    if (lowerTier.includes('platinum') || lowerTier.includes('diamond')) return '💎';
    if (lowerTier.includes('gold')) return '🥇';
    if (lowerTier.includes('silver')) return '🥈';
    if (lowerTier.includes('bronze')) return '🥉';
    return '⭐';
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6">Your Credit Score</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Score Display */}
        <Card className="p-6">
          <div className="text-center">
            <div className={`w-32 h-32 mx-auto rounded-full ${getTierColor(tier as string)} flex items-center justify-center mb-4`}>
              <div className="text-white">
                <div className="text-4xl font-bold">{score ? score.toString() : '0'}</div>
                <div className="text-sm">Score</div>
              </div>
            </div>

            <div className="text-2xl mb-2">
              {getTierEmoji(tier as string)}
            </div>

            <h3 className="text-xl font-bold mb-1">
              {tier ? tier : 'No Tier'}
            </h3>

            <p className="text-sm text-gray-600">
              Your EmpowerTours Credit Tier
            </p>
          </div>

          <div className="mt-6 pt-6 border-t">
            <h4 className="font-medium mb-3">Benefits</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Lower fees on ticket purchases</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Priority access to events</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Better loan terms in Tanda groups</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Exclusive rewards and airdrops</span>
              </li>
            </ul>
          </div>
        </Card>

        {/* Score Breakdown */}
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">Score Breakdown</h3>

          {breakdown ? (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Payment History</span>
                  <span className="text-sm font-bold">{(breakdown as ScoreBreakdown).paymentHistory.toString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min((Number((breakdown as ScoreBreakdown).paymentHistory) / Number(score || 1)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Stake Amount</span>
                  <span className="text-sm font-bold">{(breakdown as ScoreBreakdown).stakeAmount.toString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${Math.min((Number((breakdown as ScoreBreakdown).stakeAmount) / Number(score || 1)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Tanda Participation</span>
                  <span className="text-sm font-bold">{(breakdown as ScoreBreakdown).tandaParticipation.toString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${Math.min((Number((breakdown as ScoreBreakdown).tandaParticipation) / Number(score || 1)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Event Attendance</span>
                  <span className="text-sm font-bold">{(breakdown as ScoreBreakdown).eventAttendance.toString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-orange-600 h-2 rounded-full"
                    style={{ width: `${Math.min((Number((breakdown as ScoreBreakdown).eventAttendance) / Number(score || 1)) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">
              Start building your credit score by participating in the ecosystem!
            </p>
          )}

          <div className="mt-6 pt-6 border-t">
            <h4 className="font-medium mb-2">How to Improve</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Make timely contributions to Tanda groups</li>
              <li>• Increase your TOURS token stake</li>
              <li>• Attend and participate in events</li>
              <li>• Maintain a good payment history</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
