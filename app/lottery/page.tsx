'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

interface LotteryWinner {
  day: string;
  winnerAddress: string;
  winnerFid?: number;
  winnerUsername?: string;
  amount: number;
  payoutTxHash?: string;
  castHash?: string;
  timestamp: number;
}

interface PoolStatus {
  day: string;
  totalPool: number;
  participantCount: number;
  status: string;
}

export default function LotteryPage() {
  const { walletAddress, user } = useFarcasterContext();
  const [todayPool, setTodayPool] = useState<PoolStatus | null>(null);
  const [recentWinners, setRecentWinners] = useState<LotteryWinner[]>([]);
  const [stats, setStats] = useState<{
    totalPaidOut: number;
    totalDrawings: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/lottery/status');
        const data = await response.json();

        if (data.success) {
          setTodayPool(data.todayPool);
          setRecentWinners(data.recentWinners || []);
          setStats(data.stats);
        }
      } catch (err) {
        console.error('Error fetching lottery data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-orange-900 to-red-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🎰</div>
          <p className="text-white text-lg">Loading lottery data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-900 via-orange-900 to-red-900 p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="text-6xl mb-4">🎰</div>
          <h1 className="text-3xl font-bold text-white mb-2">Daily Lottery</h1>
          <p className="text-white/70">Win ETH every day on Base!</p>
        </div>

        {/* Today's Pool */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span>Today's Pool</span>
            <span className="text-sm font-normal text-white/60">
              ({todayPool?.day || new Date().toISOString().split('T')[0]})
            </span>
          </h2>

          {todayPool ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <p className="text-white/60 text-sm mb-1">Pool Size</p>
                <p className="text-2xl font-bold text-green-400">
                  {todayPool.totalPool.toFixed(6)} ETH
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <p className="text-white/60 text-sm mb-1">Participants</p>
                <p className="text-2xl font-bold text-white">
                  {todayPool.participantCount}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-white/60">No pool started yet today</p>
              <p className="text-white/40 text-sm mt-1">Be the first to enter!</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-white/60 text-sm text-center">
              Winner drawn at midnight UTC
            </p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Lottery Stats</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <p className="text-white/60 text-sm mb-1">Total Paid Out</p>
                <p className="text-xl font-bold text-green-400">
                  {stats.totalPaidOut.toFixed(6)} ETH
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <p className="text-white/60 text-sm mb-1">Total Drawings</p>
                <p className="text-xl font-bold text-white">
                  {stats.totalDrawings}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recent Winners */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
          <h2 className="text-xl font-bold text-white mb-4">Recent Winners</h2>

          {recentWinners.length > 0 ? (
            <div className="space-y-3">
              {recentWinners.map((winner, index) => (
                <div
                  key={winner.day}
                  className="bg-white/5 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-white font-semibold">
                      {winner.winnerUsername ? (
                        `@${winner.winnerUsername}`
                      ) : (
                        `${winner.winnerAddress.slice(0, 6)}...${winner.winnerAddress.slice(-4)}`
                      )}
                    </p>
                    <p className="text-white/60 text-sm">{formatDate(winner.day)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold">{winner.amount.toFixed(6)} ETH</p>
                    {winner.payoutTxHash && (
                      <a
                        href={`https://basescan.org/tx/${winner.payoutTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 text-xs hover:underline"
                      >
                        View TX
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-white/60">No winners yet!</p>
              <p className="text-white/40 text-sm mt-1">First drawing coming soon...</p>
            </div>
          )}
        </div>

        {/* How it Works */}
        <div className="mt-6 bg-white/5 rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-4">How It Works</h2>
          <div className="space-y-3 text-sm text-white/70">
            <div className="flex items-start gap-3">
              <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs font-bold">1</span>
              <p>Pay 0.001 ETH daily fee on Base to access EmpowerTours</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs font-bold">2</span>
              <p>50% of your fee goes to the daily lottery pool</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs font-bold">3</span>
              <p>A random winner is selected every day at midnight UTC</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs font-bold">4</span>
              <p>Winner receives the entire lottery pool!</p>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center mt-6 pb-8">
          <a
            href="/"
            className="text-white/60 text-sm hover:text-white/90 underline"
          >
            Back to EmpowerTours
          </a>
        </div>
      </div>
    </div>
  );
}
