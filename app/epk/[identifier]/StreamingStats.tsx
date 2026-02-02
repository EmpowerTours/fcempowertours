'use client';

import { Play, Users, DollarSign, Music } from 'lucide-react';
import type { ArtistStreamingStats } from '@/lib/epk/types';

interface StreamingStatsProps {
  stats: ArtistStreamingStats;
}

export default function StreamingStats({ stats }: StreamingStatsProps) {
  const statCards = [
    {
      label: 'Total Plays',
      value: stats.totalPlays.toLocaleString(),
      icon: Play,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
    {
      label: 'Unique Listeners',
      value: stats.uniqueListeners.toLocaleString(),
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      label: 'Total Sales',
      value: stats.totalSales.toLocaleString(),
      icon: Music,
      color: 'text-green-400',
      bg: 'bg-green-400/10',
    },
    {
      label: 'Revenue (WMON)',
      value: stats.totalRevenue,
      icon: DollarSign,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <div
          key={stat.label}
          className="bg-[#1e293b] rounded-xl p-5 border border-white/5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`${stat.bg} p-2 rounded-lg`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</span>
          </div>
          <p className="text-2xl font-bold text-white">{stat.value}</p>
          <p className="text-xs text-slate-500 mt-1">Verified on Monad</p>
        </div>
      ))}
    </div>
  );
}
