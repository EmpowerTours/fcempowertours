'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { PHASES } from '@/lib/homework/curriculum';
import './homework.css';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_APP_CLIENT_ID || 'Iv23liqRktzXrtHxJHwT';

interface WeekProgress {
  week: number;
  title: string;
  description: string;
  requiredFiles: string[];
  phase: number;
  phaseColor: string;
  phaseName: string;
  isMilestone: boolean;
  completed: boolean;
  progress: { completedAt: string; commitSha: string } | null;
  reward: { amount: number; txHash: string; distributedAt: string } | null;
}

interface ProgressData {
  github: { username: string; avatarUrl: string; linkedAt: string } | null;
  completedCount: number;
  totalWeeks: number;
  percentage: number;
  totalEarned: number;
  totalPending: number;
  totalPossible: number;
  leaderboardRank: number | null;
  curriculum: WeekProgress[];
}

const MILESTONE_BADGES = [
  { week: 8, title: 'Dev Foundations', icon: '\uD83D\uDCBB' },
  { week: 20, title: 'Web3 Builder', icon: '\u26D3\uFE0F' },
  { week: 36, title: 'Full-Stack Dev', icon: '\uD83D\uDE80' },
  { week: 52, title: 'TURBO Graduate', icon: '\uD83C\uDF93' },
];

export default function HomeworkPage() {
  const { user, walletAddress, isLoading: contextLoading } = useFarcasterContext();
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    loadProgress();
  }, [walletAddress]);

  const loadProgress = async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/homework/progress?wallet=${walletAddress}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getOAuthUrl = () => {
    if (!walletAddress) return '#';
    // Build HMAC state client-side is not possible (secret is server-side)
    // Instead, redirect to a server endpoint that builds the URL
    return `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user&redirect_uri=${encodeURIComponent(APP_URL + '/api/github/callback')}&state=${walletAddress}`;
  };

  if (contextLoading) {
    return (
      <div className="hw-container flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">&#9203;</div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !walletAddress) {
    return (
      <div className="hw-container flex items-center justify-center">
        <div className="hw-card text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">TURBO Homework</h1>
          <p className="text-gray-400 mb-4">Connect via Farcaster to access your homework dashboard.</p>
          <p className="text-xs text-gray-500">Open this page in Warpcast</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hw-container">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="hw-card" style={{ borderColor: 'rgba(6, 182, 212, 0.3)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">TURBO Homework</h1>
              <p className="text-gray-400 text-sm">Cohort 1 &middot; 52-Week Curriculum</p>
            </div>
            {data?.github ? (
              <div className="flex items-center gap-2">
                {data.github.avatarUrl && (
                  <img src={data.github.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                )}
                <span className="text-sm font-medium">{data.github.username}</span>
                <span className="text-xs text-green-400">&#10003; Linked</span>
              </div>
            ) : (
              <a href={getOAuthUrl()} className="hw-link-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Link GitHub
              </a>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="hw-card" style={{ borderColor: 'rgba(220, 38, 38, 0.5)' }}>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Progress Bar */}
        {data && (
          <div className="hw-card">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">Progress</span>
              <span className="text-sm" style={{ color: '#06b6d4' }}>
                {data.completedCount} / {data.totalWeeks} weeks ({data.percentage}%)
              </span>
            </div>
            <div className="hw-progress-bar">
              <div className="hw-progress-fill" style={{ width: `${data.percentage}%` }} />
            </div>

            {/* Stats */}
            <div className="hw-stats mt-4">
              <div className="hw-stat">
                <div className="hw-stat-value" style={{ color: '#22c55e' }}>{data.totalEarned}</div>
                <div className="hw-stat-label">TOURS Earned</div>
              </div>
              <div className="hw-stat">
                <div className="hw-stat-value" style={{ color: '#f59e0b' }}>{data.totalPending}</div>
                <div className="hw-stat-label">TOURS Pending</div>
              </div>
              <div className="hw-stat">
                <div className="hw-stat-value" style={{ color: '#8b5cf6' }}>
                  {data.leaderboardRank ? `#${data.leaderboardRank}` : '-'}
                </div>
                <div className="hw-stat-label">Leaderboard</div>
              </div>
            </div>
          </div>
        )}

        {/* No GitHub Linked */}
        {data && !data.github && (
          <div className="hw-card text-center" style={{ borderColor: 'rgba(234, 179, 8, 0.3)' }}>
            <p className="text-yellow-400 font-semibold mb-2">Link Your GitHub to Get Started</p>
            <p className="text-gray-400 text-sm mb-4">
              Fork the template repo, complete weekly assignments, and push to auto-verify.
            </p>
            <a href={getOAuthUrl()} className="hw-link-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Link GitHub Account
            </a>
          </div>
        )}

        {/* Milestone Badges */}
        {data && (
          <div className="hw-card">
            <h2 className="font-bold mb-3">Milestone Badges</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {MILESTONE_BADGES.map(badge => {
                const allCompleted = data.curriculum
                  .filter(c => c.week <= badge.week)
                  .every(c => c.completed);
                return (
                  <div
                    key={badge.week}
                    className={`hw-badge-card ${!allCompleted ? 'hw-badge-locked' : ''}`}
                  >
                    <div className="text-3xl mb-1">{badge.icon}</div>
                    <div className="text-sm font-bold">{badge.title}</div>
                    <div className="text-xs text-gray-400">Week {badge.week}</div>
                    {allCompleted && (
                      <a
                        href={`/api/homework/badge/${badge.week}?wallet=${walletAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-xs px-3 py-1 rounded-full"
                        style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}
                      >
                        View Badge
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Curriculum Grid */}
        {data && PHASES.map(phase => {
          const phaseWeeks = data.curriculum.filter(c => c.phase === phase.phase);
          const phaseCompleted = phaseWeeks.filter(c => c.completed).length;
          return (
            <div key={phase.phase} className="mb-4">
              <div
                className="hw-phase-header"
                style={{ background: `${phase.color}20`, color: phase.color }}
              >
                <span>Phase {phase.phase}: {phase.name}</span>
                <span className="text-xs opacity-70">
                  Weeks {phase.weeks} &middot; {phaseCompleted}/{phaseWeeks.length}
                </span>
              </div>
              <div className="hw-grid">
                {phaseWeeks.map(week => (
                  <div
                    key={week.week}
                    className={`hw-week ${week.completed ? 'hw-week-completed' : 'hw-week-pending'} ${week.isMilestone ? 'hw-milestone' : ''}`}
                    style={{ background: `${week.phaseColor}15` }}
                    onClick={() => setExpandedWeek(expandedWeek === week.week ? null : week.week)}
                  >
                    {week.completed && <div className="hw-check">&#10003;</div>}
                    <div className="hw-week-number" style={{ color: week.phaseColor }}>
                      W{week.week}
                    </div>
                    <div className="hw-week-title">{week.title}</div>
                    {expandedWeek === week.week && (
                      <div className="mt-2 text-left">
                        <p className="text-xs text-gray-400">{week.description}</p>
                        <div className="mt-1">
                          {week.requiredFiles.map((f: string) => (
                            <code key={f} className="block text-xs text-gray-500 truncate">{f}</code>
                          ))}
                        </div>
                        {week.progress && (
                          <p className="text-xs text-green-400 mt-1">
                            Completed {new Date(week.progress.completedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Loading */}
        {loading && !data && (
          <div className="hw-card text-center">
            <div className="animate-spin text-3xl mb-2">&#9203;</div>
            <p className="text-gray-400">Loading curriculum...</p>
          </div>
        )}
      </div>
    </div>
  );
}
