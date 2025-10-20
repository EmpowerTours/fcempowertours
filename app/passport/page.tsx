'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { ALL_COUNTRIES, getCountryByCode } from '@/lib/passport/countries';

export default function PassportPage() {
  const { user, walletAddress, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();
  
  const farcasterFid = user?.fid;

  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Auto-request wallet when user loads
  useEffect(() => {
    if (user && !walletAddress) {
      console.log('🔑 Auto-requesting wallet...');
      requestWallet();
    }
  }, [user, walletAddress, requestWallet]);

  // Auto-detect country
  useEffect(() => {
    async function fetchLocation() {
      try {
        console.log('🌍 Fetching location...');
        const res = await fetch('/api/geo');
        if (res.ok) {
          const data = await res.json();
          console.log('📍 Location data:', data);
          
          setSelectedCountryCode(data.country || 'US');
          
          console.log('✅ Auto-detected country:', data.country, data.country_name);
        } else {
          console.warn('⚠️ Geo API returned non-OK status');
          setSelectedCountryCode('US');
        }
      } catch (err) {
        console.error('❌ Location detection failed:', err);
        setSelectedCountryCode('US');
      }
    }
    
    if (user) {
      fetchLocation();
    }
  }, [user]);

  const handleMint = async () => {
    if (!walletAddress || !selectedCountryCode) {
      setError('Please select a country and connect wallet');
      return;
    }

    const selectedCountry = getCountryByCode(selectedCountryCode);
    if (!selectedCountry) {
      setError('Invalid country selected');
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
          countryCode: selectedCountry.code,
          countryName: selectedCountry.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Mint failed');
      }

      const { txHash, tokenId } = await response.json();
      setSuccess(`🎉 Passport #${tokenId} minted!`);
      setSelectedCountryCode('');
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
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  if (contextError || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900 p-4">
        <div className="text-center p-8 bg-black/40 backdrop-blur-md rounded-2xl border border-purple-500/30 max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-bold text-white mb-4">Connection Issue</h1>
          <p className="text-gray-400 mb-6">{contextError || 'Not connected to Farcaster'}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-all"
          >
            🔄 Refresh Page
          </button>
          <p className="text-xs text-gray-500 mt-4">
            Make sure you're opening this in Warpcast
          </p>
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

        {walletAddress ? (
          <div className="mb-6 bg-green-500/20 border border-green-500/50 rounded-lg p-3">
            <p className="text-green-300 text-sm font-mono">
              ✅ FID: {user.fid} | Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </p>
          </div>
        ) : (
          <div className="mb-6 bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3">
            <p className="text-yellow-300 text-sm">⚠️ Wallet not connected</p>
            <button
              onClick={requestWallet}
              className="mt-2 w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
            >
              🔑 Connect Wallet
            </button>
          </div>
        )}

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
          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Select Your Country (All 195 Countries Available!)
            </label>
            <select
              value={selectedCountryCode}
              onChange={(e) => setSelectedCountryCode(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 text-base"
              style={{ minHeight: '48px' }}
            >
              <option value="">Choose a country...</option>
              {ALL_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} {country.name}
                </option>
              ))}
            </select>
            <p className="text-gray-500 text-xs mt-2">
              📍 Auto-detected from your location
            </p>
          </div>
        </div>

        <button
          onClick={handleMint}
          disabled={isLoading || !selectedCountryCode || !walletAddress}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-lg font-bold text-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 touch-manipulation"
          style={{ minHeight: '56px' }}
        >
          {isLoading ? '⏳ Minting...' : '🎫 Mint Passport (FREE)'}
        </button>

        <p className="text-gray-500 text-xs text-center mt-4">
          📍 Free mint - we pay gas! Each wallet can mint one passport per country.
        </p>
      </div>
    </div>
  );
}
