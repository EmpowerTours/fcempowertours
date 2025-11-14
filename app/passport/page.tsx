'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useGeolocation } from '@/lib/useGeolocation';
import { ALL_COUNTRIES, getCountryByCode } from '@/lib/passport/countries';

export default function PassportPage() {
  const { user, walletAddress, isLoading: contextLoading, error: contextError, requestWallet } = useFarcasterContext();
  const { location, loading: geoLoading, error: geoError } = useGeolocation();
  
  const farcasterFid = user?.fid;

  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txHash, setTxHash] = useState('');

  // Auto-select country once geolocation loads
  useEffect(() => {
    if (location && location.country && !selectedCountryCode) {
      console.log('🌍 Auto-selecting country:', location.country, location.countryName);
      setSelectedCountryCode(location.country);
    }
  }, [location, selectedCountryCode]);

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
    setTxHash('');

    try {
      console.log('🎫 Minting passport via delegation API (gasless)...');

      // ✅ Check for existing delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${walletAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
                                delegationData.delegation &&
                                Array.isArray(delegationData.delegation.permissions) &&
                                delegationData.delegation.permissions.includes('mint_passport');

      if (!hasValidDelegation) {
        console.log('📝 Creating delegation...');
        setSuccess('⏳ Setting up gasless transactions...');

        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: walletAddress,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music', 'stake_tours']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
        console.log('✅ Delegation created');
      }

      setSuccess('⏳ Minting passport (FREE - we pay gas)...');

      // ✅ Execute mint via delegation API
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'mint_passport',
          params: {
            countryCode: selectedCountry.code,
            countryName: selectedCountry.name,
            fid: farcasterFid
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Mint failed');
      }

      const { txHash: responseTxHash, tokenId } = await response.json();

      setTxHash(responseTxHash);
      setSuccess(`🎉 Passport minted (FREE)!
${selectedCountry.flag} ${selectedCountry.name}
Token #${tokenId || 'pending'}`);
      setSelectedCountryCode('');
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Failed to mint passport');
    } finally {
      setIsLoading(false);
    }
  };

  if (contextLoading || geoLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-white">
            {contextLoading ? 'Loading Farcaster...' : 'Detecting your location...'}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {geoLoading && 'Please allow location access when prompted'}
          </p>
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
          <p className="text-gray-400 mb-6">{contextError?.message || 'Not connected to Farcaster'}</p>
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

        {/* Location Detection Status */}
        <div className="mb-6">
          {geoError ? (
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3">
              <p className="text-yellow-300 text-sm">
                ⚠️ Location detection: {geoError}
              </p>
              <p className="text-yellow-200 text-xs mt-1">
                💡 Manually select your country below
              </p>
            </div>
          ) : location ? (
            <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-3">
              <p className="text-blue-300 text-sm font-medium">
                📍 Location detected: {location.countryName}
              </p>
              {location.city && (
                <p className="text-blue-200 text-xs mt-1">
                  📌 {location.city}
                  {location.region ? `, ${location.region}` : ''}
                </p>
              )}
              {location.accuracy && (
                <p className="text-blue-200 text-xs mt-1">
                  🎯 Accuracy: ±{Math.round(location.accuracy)}m
                </p>
              )}
            </div>
          ) : null}
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
            <p className="text-green-300 text-sm whitespace-pre-line">{success}</p>
            {txHash && (
              <a
                href={`https://explorer.monad.xyz/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-green-200 hover:text-green-100 underline text-sm font-mono"
              >
                🔗 View Transaction: {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            )}
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-white text-sm font-medium mb-2">
              {location 
                ? `Country (Auto-detected: ${location.country} 🎯)` 
                : 'Select Your Country'
              }
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
            <p className="text-gray-400 text-xs mt-2">
              📍 {location 
                ? `Based on your GPS location (${location.countryName})`
                : 'Select from all 195 countries'
              }
            </p>
          </div>
        </div>

        <button
          onClick={handleMint}
          disabled={isLoading || !selectedCountryCode || !walletAddress}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-lg font-bold text-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 touch-manipulation"
          style={{ minHeight: '56px' }}
        >
          {isLoading ? '⏳ Processing (2 steps)...' : '🎫 Mint Passport (FREE)'}
        </button>

        <p className="text-gray-500 text-xs text-center mt-4">
          📍 {location 
            ? `Minting passport for ${location.countryName} • Each wallet can mint one passport per country.`
            : 'Free mint - we pay gas! Each wallet can mint one passport per country.'
          }
        </p>

        {location && (
          <div className="mt-6 p-3 bg-blue-900/30 rounded-lg border border-blue-500/30">
            <p className="text-blue-200 text-xs font-mono">
              <strong>📍 Your GPS:</strong><br />
              Lat: {location.latitude.toFixed(4)}°<br />
              Lon: {location.longitude.toFixed(4)}°
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
