'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

export default function PassportPage() {
  const { user, walletAddress, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();
  
  const farcasterFid = user?.fid;

  const [form, setForm] = useState({ countryCode: '', countryName: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-request wallet when user loads
  useEffect(() => {
    if (user && !walletAddress) {
      requestWallet();
    }
  }, [user, walletAddress, requestWallet]);

  // Auto-detect country
  useEffect(() => {
    async function fetchLocation() {
      try {
        const res = await fetch('/api/geo');
        if (res.ok) {
          const data = await res.json();
          setForm({ countryCode: data.country || '', countryName: data.country_name || '' });
        }
      } catch (err) {
        console.error('Location detection failed:', err);
      }
    }
    
    if (user) {
      fetchLocation();
    }
  }, [user]);

  const handleMint = async () => {
    if (!walletAddress || !form.countryCode || !form.countryName) {
      setError('Please fill all fields');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/mint-passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: farcasterFid,
          userAddress: walletAddress,
          countryCode: form.countryCode,
          countryName: form.countryName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Mint failed');
      }

      const { txHash, tokenId } = await response.json();
      setSuccess(`🎉 Passport #${tokenId} minted!`);
      setForm({ countryCode: '', countryName: '' });
    } catch (err: any) {
      setError(err.message || 'Mint failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (contextLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-white">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (contextError || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900 p-4">
        <div className="text-center p-8 bg-black/40 backdrop-blur-md rounded-2xl border border-purple-500/30 max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-bold text-white mb-4">Not in Farcaster</h1>
          <p className="text-gray-400 mb-6">
            This Mini App must be opened in Warpcast or another Farcaster client.
          </p>
          <p className="text-sm text-gray-500">Error: {contextError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-black/40 backdrop-blur-md rounded-2xl border border-purple-500/30 shadow-2xl p-8">
        <div className="text-center mb-8">
          {user?.pfpUrl && (
            <img
              src={user.pfpUrl}
              alt={user.username || 'User'}
              className="rounded-full mx-auto mb-4 border-2 border-purple-500"
              style={{
                width: '40px',
                height: '40px',
                minWidth: '40px',
                minHeight: '40px',
                maxWidth: '40px',
                maxHeight: '40px',
                objectFit: 'cover'
              }}
            />
          )}
          <h1 className="text-4xl font-bold text-white mb-2">🌍 Travel Passport NFT</h1>
          <p className="text-gray-400">@{user?.username || 'User'}</p>
        </div>

        <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-lg p-3">
          <p className="text-green-300 text-sm font-mono">
            ✅ FID: {user.fid} | Wallet: {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-lg p-3">
            <p className="text-red-300 text-sm">❌ {error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-500/20 border border-green-500/50 rounded-lg p-3">
            <p className="text-green-300 text-sm">{success}</p>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <input
            type="text"
            name="countryCode"
            placeholder="Country Code (e.g., MX)"
            value={form.countryCode}
            onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
            maxLength={2}
            className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 uppercase"
          />

          <input
            type="text"
            name="countryName"
            placeholder="Country Name (e.g., Mexico)"
            value={form.countryName}
            onChange={(e) => setForm({ ...form, countryName: e.target.value })}
            className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500"
          />
        </div>

        <button
          onClick={handleMint}
          disabled={isLoading || !form.countryCode || !form.countryName}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-lg font-bold text-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '⏳ Minting...' : '🎫 Mint Passport (FREE)'}
        </button>

        <p className="text-gray-500 text-xs text-center mt-4">
          📍 Location auto-detected. Free mint - we pay gas!
        </p>
      </div>
    </div>
  );
}
