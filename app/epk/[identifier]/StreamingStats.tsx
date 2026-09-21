"use client";

import { Play, Users, DollarSign, Music } from "lucide-react";
import type { ArtistStreamingStats } from "@/lib/epk/types";

interface StreamingStatsProps {
  stats: ArtistStreamingStats;
}

export default function StreamingStats({ stats }: StreamingStatsProps) {
  // Each card carries its own provenance. A single "Verified on Monad" under all four was wrong
  // under three of them: "—" is not a chain reading, the play total is part ledger, and the
  // revenue figure is the subscription pool rather than everything the artist earned.
  const statCards = [
    {
      label: "Total Plays",
      // `83+`, never a bare `83`, when the figure is a lower bound — see `totalPlaysIsFloor`.
      value: stats.totalPlaysIsFloor
        ? `${stats.totalPlays.toLocaleString()}+`
        : stats.totalPlays.toLocaleString(),
      note: stats.totalPlaysIsFloor
        ? "On-chain plus a recent window — at least this many"
        : "Verified on Monad",
      icon: Play,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      label: "Unique Listeners",
      // Null means unknown, not zero — no contract keeps a roster of listeners, and rendering 0
      // would claim nobody has ever listened.
      value:
        stats.uniqueListeners === null
          ? "—"
          : stats.uniqueListeners.toLocaleString(),
      note:
        stats.uniqueListeners === null
          ? "No contract keeps a listener roster"
          : "Verified on Monad",
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Licences Sold",
      value: stats.totalSales.toLocaleString(),
      note: "Verified on Monad",
      icon: Music,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      // Not "Revenue": this is `artistMonthlyPayouts` only. Licence sales settle straight to the
      // artist through SalesController and never pass through here, so the old label put 0.00
      // next to a non-zero sale count and implied the sales earned nothing.
      label: "Payouts (WMON)",
      value: stats.totalRevenue,
      note: "Subscription pool only — excludes licence sales",
      icon: DollarSign,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
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
            <span className="text-xs text-slate-400 uppercase tracking-wider">
              {stat.label}
            </span>
          </div>
          <p className="text-2xl font-bold text-white">{stat.value}</p>
          <p className="text-xs text-slate-500 mt-1">{stat.note}</p>
        </div>
      ))}
    </div>
  );
}
