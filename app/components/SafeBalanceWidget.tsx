'use client';

import { useState, useEffect } from 'react';

export default function SafeBalanceWidget() {
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBalance();
    const interval = setInterval(loadBalance, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  const loadBalance = async () => {
    try {
      const response = await fetch('/api/safe-balance');
      const data = await response.json();
      if (data.success) {
        setBalance(data);
      }
    } catch (error) {
      console.error('Error loading Safe balance:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-100 rounded-lg animate-pulse">
        <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
        <div className="h-6 bg-gray-300 rounded w-3/4"></div>
      </div>
    );
  }

  if (!balance) {
    return null;
  }

  return (
    <div className={`p-4 rounded-lg border-2 ${
      balance.needsFunding 
        ? 'bg-red-50 border-red-200' 
        : 'bg-green-50 border-green-200'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs text-gray-600">Safe Account Balance</p>
          <p className="text-2xl font-bold text-gray-900">
            {balance.safe.balanceFormatted.toFixed(4)} MON
          </p>
        </div>
        <div className="text-3xl">
          {balance.needsFunding ? '⚠️' : '✅'}
        </div>
      </div>

      {balance.needsFunding && (
        <div className="mt-3 p-3 bg-red-100 rounded border border-red-300">
          <p className="text-xs text-red-900 font-medium mb-2">
            ⚠️ Low balance - fund the Safe to enable delegated transactions
          </p>
          <p className="text-xs text-red-800 font-mono">
            {balance.safe.address}
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(balance.safe.address);
              alert('✅ Safe address copied to clipboard!');
            }}
            className="mt-2 w-full px-3 py-2 bg-red-600 text-white rounded text-xs hover:bg-red-700"
          >
            📋 Copy Address
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className={`p-2 rounded ${balance.capabilities.canMintPassport ? 'bg-green-100' : 'bg-gray-100'}`}>
          <p className="text-center">
            {balance.capabilities.canMintPassport ? '✅' : '❌'} Passport
          </p>
        </div>
        <div className={`p-2 rounded ${balance.capabilities.canMintMusic ? 'bg-green-100' : 'bg-gray-100'}`}>
          <p className="text-center">
            {balance.capabilities.canMintMusic ? '✅' : '❌'} Music
          </p>
        </div>
        <div className={`p-2 rounded ${balance.capabilities.canSwap ? 'bg-green-100' : 'bg-gray-100'}`}>
          <p className="text-center">
            {balance.capabilities.canSwap ? '✅' : '❌'} Swap
          </p>
        </div>
      </div>
    </div>
  );
}
