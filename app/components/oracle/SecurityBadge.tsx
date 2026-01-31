'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

interface SecurityBadgeProps {
  score: number;
  passed: boolean;
  compact?: boolean;
}

export const SecurityBadge: React.FC<SecurityBadgeProps> = ({ score, passed, compact = false }) => {
  const getColor = () => {
    if (!passed || score < 50) return { bg: 'bg-red-900/50', border: 'border-red-500/50', text: 'text-red-400' };
    if (score < 80) return { bg: 'bg-yellow-900/50', border: 'border-yellow-500/50', text: 'text-yellow-400' };
    return { bg: 'bg-green-900/50', border: 'border-green-500/50', text: 'text-green-400' };
  };

  const getIcon = () => {
    if (!passed || score < 50) return <ShieldX className={compact ? 'w-3 h-3' : 'w-4 h-4'} />;
    if (score < 80) return <ShieldAlert className={compact ? 'w-3 h-3' : 'w-4 h-4'} />;
    return <ShieldCheck className={compact ? 'w-3 h-3' : 'w-4 h-4'} />;
  };

  const colors = getColor();

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs ${colors.bg} ${colors.border} border ${colors.text}`}>
        {getIcon()}
        {score}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${colors.bg} ${colors.border} border`}>
      <span className={colors.text}>{getIcon()}</span>
      <span className={`text-sm font-medium ${colors.text}`}>{score}/100</span>
      <span className={`text-xs ${colors.text} opacity-70`}>
        {!passed ? 'Failed' : score >= 80 ? 'Secure' : 'Review'}
      </span>
    </div>
  );
};
