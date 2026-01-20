'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFarcasterContext } from '../hooks/useFarcasterContext';

interface UserSafeInfo {
  success: boolean;
  mode: string;
  userSafesEnabled: boolean;
  safeAddress: string;
  isDeployed: boolean;
  balance: string;
  balanceWei: string;
  isFunded: boolean;
  isAdequatelyFunded: boolean;
  minRequired: string;
  recommendedBalance: string;
  fundingInstructions: string | null;
}

export default function UserSafeWidget() {
  const { walletAddress, loading: contextLoading } = useFarcasterContext();
  const [safeInfo, setSafeInfo] = useState<UserSafeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadSafeInfo = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const response = await fetch(`/api/user-safe?address=${walletAddress}`);
      const data = await response.json();
      if (data.success) {
        setSafeInfo(data);
      }
    } catch (error) {
      console.error('Error loading user Safe info:', error);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress && !contextLoading) {
      loadSafeInfo();
      const interval = setInterval(loadSafeInfo, 15000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, contextLoading, loadSafeInfo]);

  const copyAddress = () => {
    if (safeInfo?.safeAddress) {
      navigator.clipboard.writeText(safeInfo.safeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Don't show if user Safes aren't enabled (old platform mode)
  if (safeInfo && !safeInfo.userSafesEnabled) {
    return null;
  }

  if (contextLoading || loading) {
    return (
      <div className="p-4 bg-slate-800/50 rounded-xl animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/2 mb-2"></div>
        <div className="h-6 bg-slate-700 rounded w-3/4"></div>
      </div>
    );
  }

  if (!walletAddress || !safeInfo) {
    return null;
  }

  const balance = parseFloat(safeInfo.balance);
  const isLow = balance < 0.1;
  const isZero = balance === 0;

  return (
    <div className={`p-4 rounded-xl border-2 ${
      isZero
        ? 'bg-red-900/20 border-red-500/50'
        : isLow
          ? 'bg-yellow-900/20 border-yellow-500/50'
          : 'bg-green-900/20 border-green-500/50'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">
            {isZero ? '🔴' : isLow ? '🟡' : '🟢'}
          </span>
          <div>
            <p className="text-xs text-slate-400">Your Safe Wallet</p>
            <p className="text-lg font-bold text-white">
              {balance.toFixed(4)} MON
            </p>
          </div>
        </div>
        {safeInfo.isDeployed && (
          <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
            Active
          </span>
        )}
      </div>

      <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
        <p className="text-xs text-slate-400 mb-1">Safe Address</p>
        <div className="flex items-center gap-2">
          <code className="text-xs text-slate-300 font-mono truncate flex-1">
            {safeInfo.safeAddress}
          </code>
          <button
            onClick={copyAddress}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
      </div>

      {(isZero || isLow) && (
        <div className={`p-3 rounded-lg ${
          isZero ? 'bg-red-500/20' : 'bg-yellow-500/20'
        }`}>
          <p className={`text-sm font-medium mb-2 ${
            isZero ? 'text-red-300' : 'text-yellow-300'
          }`}>
            {isZero
              ? 'Fund your Safe to enable transactions'
              : 'Low balance - consider adding more MON'}
          </p>
          <p className="text-xs text-slate-400 mb-2">
            Send at least <span className="text-white font-bold">{safeInfo.minRequired} MON</span> to your Safe.
            Recommended: <span className="text-white font-bold">{safeInfo.recommendedBalance} MON</span>
          </p>
          <button
            onClick={copyAddress}
            className={`w-full py-2 rounded font-medium text-sm ${
              isZero
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-yellow-500 hover:bg-yellow-600 text-black'
            }`}
          >
            {copied ? '✓ Copied!' : 'Copy Safe Address'}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`px-2 py-1 rounded text-xs ${
          safeInfo.isFunded ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {safeInfo.isFunded ? '✓ Funded' : '✗ Not Funded'}
        </span>
        <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-300">
          {safeInfo.mode}
        </span>
      </div>
    </div>
  );
}
