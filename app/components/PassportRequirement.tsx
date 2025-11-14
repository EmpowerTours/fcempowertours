'use client';

import { useState, useEffect } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useGeolocation } from '@/lib/useGeolocation';
import { ALL_COUNTRIES, getCountryByCode } from '@/lib/passport/countries';
import { usePassportNFT } from '@/src/hooks/usePassportNFT';
import { Address } from 'viem';

interface PassportRequirementProps {
  onPassportMinted?: () => void;
}

export default function PassportRequirement({ onPassportMinted }: PassportRequirementProps) {
  const { user, walletAddress, isLoading: contextLoading, requestWallet } = useFarcasterContext();
  const { location, loading: geoLoading } = useGeolocation();
  const { useBalanceOf } = usePassportNFT();

  const farcasterFid = user?.fid;

  // Check if user has any passports
  const { data: passportBalance, isLoading: balanceLoading } = useBalanceOf(walletAddress as Address);
  const hasPassport = passportBalance !== undefined && passportBalance !== null && passportBalance > 0n;

  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasCasted, setHasCasted] = useState(false);
  const [isCheckingFollow, setIsCheckingFollow] = useState(false);
  const [isCheckingCast, setIsCheckingCast] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRequirements, setShowRequirements] = useState(false);

  // Auto-select country once geolocation loads
  useEffect(() => {
    if (location && location.country && !selectedCountryCode) {
      setSelectedCountryCode(location.country);
    }
  }, [location, selectedCountryCode]);

  // Check if user has passport
  useEffect(() => {
    if (!balanceLoading && hasPassport) {
      // User has passport, call callback
      onPassportMinted?.();
    }
  }, [hasPassport, balanceLoading, onPassportMinted]);

  // Check follow status when FID is available
  const checkFollowStatus = async () => {
    if (!farcasterFid) return;

    setIsCheckingFollow(true);
    try {
      const response = await fetch(`/api/check-follow?fid=${farcasterFid}`);
      const data = await response.json();

      if (data.success) {
        setIsFollowing(data.isFollowing);
      }
    } catch (err) {
      console.error('Error checking follow status:', err);
    } finally {
      setIsCheckingFollow(false);
    }
  };

  // Check cast status when FID is available
  const checkCastStatus = async () => {
    if (!farcasterFid) return;

    setIsCheckingCast(true);
    try {
      const response = await fetch(`/api/check-cast?fid=${farcasterFid}`);
      const data = await response.json();

      if (data.success) {
        setHasCasted(data.hasPostedCast);
      }
    } catch (err) {
      console.error('Error checking cast status:', err);
    } finally {
      setIsCheckingCast(false);
    }
  };

  // Initial checks when component mounts
  useEffect(() => {
    if (farcasterFid && !hasPassport && showRequirements) {
      checkFollowStatus();
      checkCastStatus();
    }
  }, [farcasterFid, hasPassport, showRequirements]);

  const handleFollowClick = () => {
    // Open Warpcast to follow @unify34
    window.open('https://warpcast.com/unify34', '_blank');
    // Recheck after 2 seconds
    setTimeout(checkFollowStatus, 2000);
  };

  const handleCastClick = () => {
    // Open Warpcast composer with pre-filled text
    const castText = encodeURIComponent('Just minted my digital passport on @empowertours! 🌍✈️ Get yours and join the travel revolution!');
    window.open(`https://warpcast.com/~/compose?text=${castText}`, '_blank');
    // Recheck after 2 seconds
    setTimeout(checkCastStatus, 2000);
  };

  const handleMint = async () => {
    if (!walletAddress || !selectedCountryCode) {
      setError('Please select a country and connect wallet');
      return;
    }

    if (!isFollowing || !hasCasted) {
      setError('Please complete all requirements first');
      return;
    }

    const selectedCountry = getCountryByCode(selectedCountryCode);
    if (!selectedCountry) {
      setError('Invalid country selected');
      return;
    }

    setIsMinting(true);
    setError('');
    setSuccess('');

    try {
      console.log('🎫 Minting passport via delegation API (gasless)...');

      // Check for existing delegation
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

      // Execute mint via delegation API
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

      const { txHash, tokenId } = await response.json();
      setSuccess(`🎉 Passport minted successfully!
${selectedCountry.flag} ${selectedCountry.name}
Token #${tokenId || 'pending'}
TX: ${txHash?.slice(0, 10)}...`);

      // Call callback to allow navigation
      setTimeout(() => {
        onPassportMinted?.();
      }, 2000);

    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Failed to mint passport');
    } finally {
      setIsMinting(false);
    }
  };

  // Show loading while checking balance
  if (balanceLoading || contextLoading) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-white">Checking passport status...</p>
        </div>
      </div>
    );
  }

  // Don't show modal if user has passport
  if (hasPassport) {
    return null;
  }

  // Show requirements screen
  if (!showRequirements) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-md bg-gradient-to-br from-purple-900/90 via-black/90 to-blue-900/90 rounded-2xl border border-purple-500/30 shadow-2xl p-8 text-center">
          <div className="text-6xl mb-6">🌍</div>
          <h1 className="text-3xl font-bold text-white mb-4">Welcome to EmpowerTours!</h1>
          <p className="text-gray-300 mb-6">
            To access EmpowerTours, you need to mint your Digital Passport NFT.
          </p>
          <p className="text-gray-400 text-sm mb-8">
            Complete a few quick steps to get started on your travel journey!
          </p>
          <button
            onClick={() => setShowRequirements(true)}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:from-purple-700 hover:to-blue-700 active:scale-95 transition-all"
          >
            Get Started ✨
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-gradient-to-br from-purple-900/90 via-black/90 to-blue-900/90 rounded-2xl border border-purple-500/30 shadow-2xl p-8 my-4">
        <div className="text-center mb-8">
          {user?.pfpUrl && (
            <img
              src={user.pfpUrl}
              alt={user.username || 'User'}
              className="rounded-full mx-auto mb-4 border-2 border-purple-500"
              style={{
                width: '60px',
                height: '60px',
                objectFit: 'cover'
              }}
            />
          )}
          <h1 className="text-3xl font-bold text-white mb-2">🌍 Mint Your Digital Passport</h1>
          <p className="text-gray-400">@{user?.username || 'User'}</p>
        </div>

        {/* Requirements Checklist */}
        <div className="space-y-4 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">Requirements:</h2>

          {/* Requirement 1: Follow @unify34 */}
          <div className={`p-4 rounded-lg border ${isFollowing ? 'bg-green-500/20 border-green-500/50' : 'bg-gray-800/50 border-gray-600'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{isFollowing ? '✅' : '1️⃣'}</div>
                <div>
                  <p className="text-white font-medium">Follow @unify34</p>
                  <p className="text-gray-400 text-sm">Required to mint passport</p>
                </div>
              </div>
            </div>
            {!isFollowing && (
              <button
                onClick={handleFollowClick}
                disabled={isCheckingFollow}
                className="w-full mt-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50"
              >
                {isCheckingFollow ? '⏳ Checking...' : '👤 Follow on Warpcast'}
              </button>
            )}
          </div>

          {/* Requirement 2: Post a cast */}
          <div className={`p-4 rounded-lg border ${hasCasted ? 'bg-green-500/20 border-green-500/50' : 'bg-gray-800/50 border-gray-600'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{hasCasted ? '✅' : '2️⃣'}</div>
                <div>
                  <p className="text-white font-medium">Post about Digital Passports</p>
                  <p className="text-gray-400 text-sm">Share with your network</p>
                </div>
              </div>
            </div>
            {!hasCasted && (
              <button
                onClick={handleCastClick}
                disabled={isCheckingCast}
                className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {isCheckingCast ? '⏳ Checking...' : '📢 Post Cast'}
              </button>
            )}
          </div>
        </div>

        {/* Country Selection */}
        {isFollowing && hasCasted && (
          <div className="space-y-4 mb-6 animate-fade-in">
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
              >
                <option value="">Choose a country...</option>
                {ALL_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name}
                  </option>
                ))}
              </select>
            </div>
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

        {/* Mint Button */}
        {isFollowing && hasCasted && (
          <button
            onClick={handleMint}
            disabled={isMinting || !selectedCountryCode || !walletAddress}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-lg font-bold text-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
          >
            {isMinting ? '⏳ Minting...' : '🎫 Mint Passport (FREE)'}
          </button>
        )}

        <p className="text-gray-500 text-xs text-center mt-4">
          Free mint - we pay gas! Each wallet can mint one passport per country.
        </p>

        {/* Refresh buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={checkFollowStatus}
            disabled={isCheckingFollow}
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded text-xs hover:bg-gray-600 disabled:opacity-50"
          >
            {isCheckingFollow ? '⏳' : '🔄'} Refresh Follow
          </button>
          <button
            onClick={checkCastStatus}
            disabled={isCheckingCast}
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded text-xs hover:bg-gray-600 disabled:opacity-50"
          >
            {isCheckingCast ? '⏳' : '🔄'} Refresh Cast
          </button>
        </div>
      </div>
    </div>
  );
}
