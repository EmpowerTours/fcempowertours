'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, Ticket, Trophy, Clock, Users, Zap, TrendingUp } from 'lucide-react';

interface LotteryRound {
  roundId: number;
  prizePool: string;
  ticketCount: number;
  timeRemaining: number;
  canDraw: boolean;
  willRollover: boolean;
  potentialWinnerPrize: string;
}

interface LotteryData {
  success: boolean;
  currentRound: LotteryRound;
  config: {
    ticketPrice: number;
    minEntries: number;
  };
}

interface Win {
  roundId: number;
  amount: string;
  timestamp: number;
}

interface UserLotteryStats {
  ticketsToday: number;
  spendingToday: number;
  recentWins: Win[];
}

interface LotteryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAddress?: string;
}

export function LotteryModal({ isOpen, onClose, userAddress }: LotteryModalProps) {
  const [loading, setLoading] = useState(true);
  const [lotteryData, setLotteryData] = useState<LotteryData | null>(null);
  const [userStats, setUserStats] = useState<UserLotteryStats | null>(null);
  const [ticketsToBuy, setTicketsToBuy] = useState(1);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchLotteryStatus();
    }
  }, [isOpen]);

  async function fetchLotteryStatus() {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch lottery status
      const res = await fetch('/api/lottery');
      const data = await res.json();
      setLotteryData(data);

      // Fetch user stats if logged in
      if (userAddress) {
        const statsRes = await fetch(`/api/lottery/user-stats?address=${userAddress}`);
        const statsData = await statsRes.json();
        if (statsData.success) {
          setUserStats(statsData);
        }
      }
    } catch (err) {
      console.error('Failed to fetch lottery status:', err);
      setError('Could not load lottery status');
    } finally {
      setLoading(false);
    }
  }

  async function handleBuyTickets() {
    if (!userAddress) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setBuying(true);
      setError(null);

      // Call oracle chat with lottery_buy action
      const res = await fetch('/api/oracle/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `buy ${ticketsToBuy} lottery tickets`,
          userAddress,
        }),
      });

      const result = await res.json();

      if (result.success) {
        // Refresh lottery status
        await fetchLotteryStatus();
        setTicketsToBuy(1);
        alert(`✅ Purchased ${ticketsToBuy} ticket${ticketsToBuy > 1 ? 's' : ''}! Good luck!`);
      } else {
        setError(result.error || 'Failed to buy tickets');
      }
    } catch (err) {
      console.error('Failed to buy tickets:', err);
      setError('Failed to buy tickets');
    } finally {
      setBuying(false);
    }
  }

  if (!isOpen) return null;

  const odds = lotteryData?.currentRound.ticketCount
    ? `1/${lotteryData.currentRound.ticketCount}`
    : '0/0';

  const timeLeft = lotteryData?.currentRound.timeRemaining
    ? formatTime(lotteryData.currentRound.timeRemaining)
    : 'Unknown';

  const totalCost = ticketsToBuy * (lotteryData?.config.ticketPrice || 2);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/30">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-slate-900 to-purple-900 border-b border-purple-500/30 p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Ticket className="w-6 h-6 text-yellow-400" />
            <h2 className="text-2xl font-bold text-white">🎰 Daily Lottery</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
          ) : error ? (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200">
              {error}
            </div>
          ) : lotteryData ? (
            <>
              {/* Round Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-purple-500/20 rounded-lg p-4">
                  <div className="text-gray-400 text-sm font-medium">Round</div>
                  <div className="text-2xl font-bold text-white">
                    #{lotteryData.currentRound.roundId}
                  </div>
                </div>

                <div className="bg-white/5 border border-purple-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
                    <Trophy className="w-4 h-4" />
                    Prize Pool
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {lotteryData.currentRound.prizePool}
                  </div>
                </div>

                <div className="bg-white/5 border border-purple-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
                    <Clock className="w-4 h-4" />
                    Time Left
                  </div>
                  <div className="text-2xl font-bold text-cyan-400">{timeLeft}</div>
                </div>

                <div className="bg-white/5 border border-purple-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
                    <Users className="w-4 h-4" />
                    Entries
                  </div>
                  <div className="text-2xl font-bold text-blue-400">
                    {lotteryData.currentRound.ticketCount}
                  </div>
                </div>
              </div>

              {/* User Stats Section */}
              {userStats && (userStats.ticketsToday > 0 || userStats.spendingToday > 0) && (
                <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                    Your Stats Today
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-400">Your Tickets</div>
                      <div className="text-2xl font-bold text-yellow-300">{userStats.ticketsToday}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">You Spent</div>
                      <div className="text-2xl font-bold text-cyan-300">{userStats.spendingToday} WMON</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Wins Section */}
              {userStats && userStats.recentWins.length > 0 && (
                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-green-400" />
                    Recent Wins
                  </h3>
                  <div className="space-y-2">
                    {userStats.recentWins.slice(0, 5).map((win, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <span className="text-gray-300">Round #{win.roundId}</span>
                        <span className="text-green-300 font-semibold">{win.amount} WMON</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Win Amount */}
              <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-4">
                <div className="text-sm text-gray-300 mb-2">
                  💰 Your potential win (90% of prize pool):
                </div>
                <div className="text-3xl font-bold text-yellow-300">
                  {lotteryData.currentRound.potentialWinnerPrize}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  Odds: 1 ticket = {odds} chance
                </div>
              </div>

              {/* Ticket Purchase Section */}
              <div className="border-t border-purple-500/20 pt-6">
                <h3 className="text-lg font-semibold text-white mb-4">Buy Tickets</h3>

                <div className="bg-white/5 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-300">Ticket Price:</span>
                    <span className="text-xl font-bold text-cyan-400">
                      {lotteryData.config.ticketPrice} WMON
                    </span>
                  </div>

                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-sm text-gray-400 block mb-2">
                        How many tickets?
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={ticketsToBuy}
                        onChange={(e) =>
                          setTicketsToBuy(Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-full bg-slate-800 border border-purple-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                        disabled={buying}
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">Total Cost:</div>
                      <div className="text-xl font-bold text-white">{totalCost} WMON</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleBuyTickets}
                  disabled={buying || !userAddress}
                  className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                    buying || !userAddress
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
                  }`}
                >
                  {buying && <Loader2 className="w-5 h-5 animate-spin" />}
                  {buying
                    ? 'Processing...'
                    : !userAddress
                    ? 'Connect Wallet to Play'
                    : `Buy ${ticketsToBuy} Ticket${ticketsToBuy > 1 ? 's' : ''}`}
                </button>
              </div>

              {/* Draw Status */}
              {lotteryData.currentRound.canDraw && (
                <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg p-4 flex items-start gap-3">
                  <Zap className="w-5 h-5 text-green-400 flex-shrink-0 mt-1" />
                  <div>
                    <div className="font-semibold text-green-300">
                      ✅ Ready to Draw!
                    </div>
                    <div className="text-sm text-green-200">
                      Enough entries received. Drawing can happen anytime now.
                    </div>
                  </div>
                </div>
              )}

              {lotteryData.currentRound.willRollover && (
                <div className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30 rounded-lg p-4">
                  <div className="font-semibold text-orange-300">⚠️ Not Enough Entries</div>
                  <div className="text-sm text-orange-200">
                    Minimum {lotteryData.config.minEntries} entries required. Prize will
                    rollover if not met!
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
