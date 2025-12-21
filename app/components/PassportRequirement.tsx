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

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const UNIFY34_USERNAME = 'unify34';

export default function PassportRequirement({ onPassportMinted }: PassportRequirementProps) {
  const { user, walletAddress, isLoading: contextLoading, requestWallet } = useFarcasterContext();
  const { location, loading: geoLoading } = useGeolocation();
  const { useBalanceOf } = usePassportNFT();

  const farcasterFid = user?.fid;
  const isUnify34 = user?.username?.toLowerCase() === UNIFY34_USERNAME;

  // Check if user has any passports
  const { data: passportBalance, isLoading: balanceLoading } = useBalanceOf(walletAddress as Address);
  const hasPassport = passportBalance !== undefined && passportBalance !== null && typeof passportBalance === 'bigint' && passportBalance > 0n;

  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasCasted, setHasCasted] = useState(false);
  const [isCheckingFollow, setIsCheckingFollow] = useState(false);
  const [isCheckingCast, setIsCheckingCast] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState<'welcome' | 'requirements' | 'minting'>('welcome');

  // Auto-select country once geolocation loads
  useEffect(() => {
    if (location && location.country && !selectedCountryCode) {
      console.log('🌍 Auto-selecting country:', location.country);
      setSelectedCountryCode(location.country);
    }
  }, [location, selectedCountryCode]);

  // 🐛 DEBUG: Log button state to diagnose desktop issue
  useEffect(() => {
    if (currentStep === 'requirements' && isFollowing && hasCasted) {
      console.log('🔍 [BUTTON-DEBUG] Mint button state:', {
        isMinting,
        geoLoading,
        selectedCountryCode,
        hasCountryCode: !!selectedCountryCode,
        isDisabled: isMinting || geoLoading || !selectedCountryCode,
        location: location ? { country: location.country, countryName: location.countryName } : 'null'
      });
    }
  }, [isMinting, geoLoading, selectedCountryCode, location, currentStep, isFollowing, hasCasted]);

  // Check if user has passport
  useEffect(() => {
    if (!balanceLoading && hasPassport) {
      onPassportMinted?.();
    }
  }, [hasPassport, balanceLoading, onPassportMinted]);

  // Check follow status when FID is available
  const checkFollowStatus = async () => {
    if (!farcasterFid) return;

    // Skip check if user is @unify34
    if (isUnify34) {
      setIsFollowing(true);
      return;
    }

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
    if (farcasterFid && !hasPassport && currentStep === 'requirements') {
      checkFollowStatus();
      checkCastStatus();
    }
  }, [farcasterFid, hasPassport, currentStep]);

  const handleFollowClick = () => {
    window.open('https://warpcast.com/unify34', '_blank');
    setTimeout(checkFollowStatus, 2000);
  };

  const handleCastClick = () => {
    const castText = encodeURIComponent(`Just got my digital passport on EmpowerTours! 🌍✈️\n\nGet yours: ${APP_URL}\n\n@empowertours`);
    window.open(`https://warpcast.com/~/compose?text=${castText}&embeds[]=${APP_URL}`, '_blank');
    setTimeout(checkCastStatus, 2000);
  };

  const handleMint = async () => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return;
    }

    if (!isFollowing || !hasCasted) {
      setError('Please complete all requirements first');
      return;
    }

    if (!selectedCountryCode) {
      setError('Unable to detect your country. Please refresh the page.');
      return;
    }

    const selectedCountry = getCountryByCode(selectedCountryCode);
    if (!selectedCountry) {
      setError('Invalid country detected. Please refresh the page.');
      return;
    }

    setIsMinting(true);
    setError('');
    setSuccess('');
    setCurrentStep('minting');

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
        setSuccess('Setting up gasless transactions...');

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

      setSuccess('Minting your passport...');

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
      setSuccess(`🎉 Passport minted successfully!\n${selectedCountry.flag} ${selectedCountry.name}\nToken #${tokenId || 'pending'}`);

      setTimeout(() => {
        onPassportMinted?.();
      }, 2000);

    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Failed to mint passport');
      setCurrentStep('requirements');
    } finally {
      setIsMinting(false);
    }
  };

  // Show loading while checking balance
  if (balanceLoading || contextLoading) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🌍</div>
          <p className="text-white text-lg">Checking passport status...</p>
        </div>
      </div>
    );
  }

  // Don't show modal if user has passport
  if (hasPassport) {
    return null;
  }

  // Welcome screen
  if (currentStep === 'welcome') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center z-[9999] p-4">
        <div className="w-full max-w-md">
          {/* Animated passport icon */}
          <div className="text-center mb-8 animate-bounce">
            <div className="text-8xl mb-4">✈️</div>
          </div>

          {/* Main card */}
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
              Welcome to<br />EmpowerTours
            </h1>

            {user?.pfpUrl && (
              <img
                src={user.pfpUrl}
                alt={user.username || 'User'}
                className="rounded-full mx-auto mb-4 border-4 border-white/30 shadow-xl"
                style={{
                  width: '80px',
                  height: '80px',
                  objectFit: 'cover'
                }}
              />
            )}

            <p className="text-white/90 text-xl mb-2">
              Hello, <span className="font-semibold">@{user?.username || 'traveler'}</span>!
            </p>

            <p className="text-white/80 mb-8 text-base leading-relaxed">
              To start your journey, you'll need to mint your<br />
              <span className="font-bold text-white">Digital Passport NFT</span>
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-left bg-white/5 rounded-xl p-3">
                <div className="text-2xl">🌍</div>
                <div className="text-white/90 text-sm">
                  <div className="font-semibold">Global Access</div>
                  <div className="text-white/70">Mint passports for 195 countries</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-left bg-white/5 rounded-xl p-3">
                <div className="text-2xl">⚡</div>
                <div className="text-white/90 text-sm">
                  <div className="font-semibold">100% Free</div>
                  <div className="text-white/70">We pay all gas fees for you</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-left bg-white/5 rounded-xl p-3">
                <div className="text-2xl">🎫</div>
                <div className="text-white/90 text-sm">
                  <div className="font-semibold">Quick Setup</div>
                  <div className="text-white/70">Just 2 simple steps to get started</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCurrentStep('requirements')}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:from-pink-600 hover:to-purple-700 active:scale-95 transition-all shadow-lg"
            >
              Get Started ✨
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Minting screen
  if (currentStep === 'minting') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 flex items-center justify-center z-[9999] p-4">
        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-8 text-center">
          <div className="animate-spin text-6xl mb-6">🎫</div>
          <h2 className="text-3xl font-bold text-white mb-4">Minting Your Passport</h2>

          {success && (
            <div className="bg-green-500/20 border border-green-400/50 rounded-xl p-4 mb-4">
              <p className="text-green-100 whitespace-pre-line">{success}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-400/50 rounded-xl p-4 mb-4">
              <p className="text-red-100">{error}</p>
            </div>
          )}

          <p className="text-white/80 text-sm">Please wait while we process your transaction...</p>
        </div>
      </div>
    );
  }

  // Requirements screen
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
      <div className="w-full max-w-lg my-8">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-6 sm:p-8">

          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🌍</div>
            <h1 className="text-3xl font-bold text-white mb-2">Get Your Digital Passport</h1>
            <p className="text-white/80 text-sm">Complete these steps to unlock EmpowerTours</p>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between mb-2 text-xs text-white/70">
              <span>Progress</span>
              <span>{isFollowing && hasCasted ? '2/2' : isFollowing || hasCasted ? '1/2' : '0/2'}</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-pink-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(isFollowing && hasCasted ? 100 : isFollowing || hasCasted ? 50 : 0)}%` }}
              />
            </div>
          </div>

          {/* Requirements */}
          <div className="space-y-3 mb-6">
            {/* Requirement 1: Follow (skip if user is unify34) */}
            {!isUnify34 && (
              <div className={`rounded-xl border transition-all ${
                isFollowing
                  ? 'bg-green-500/20 border-green-400/50'
                  : 'bg-white/5 border-white/10 hover:border-white/30'
              }`}>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-3xl">{isFollowing ? '✅' : '1️⃣'}</div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold text-lg">Follow @unify34</h3>
                      <p className="text-white/70 text-sm">Support our community on Farcaster</p>
                    </div>
                  </div>
                  {!isFollowing && (
                    <button
                      onClick={handleFollowClick}
                      disabled={isCheckingFollow}
                      className="w-full mt-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-semibold disabled:opacity-50 transition-all"
                    >
                      {isCheckingFollow ? '⏳ Checking...' : '👤 Follow on Warpcast'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Requirement 2: Post a cast */}
            <div className={`rounded-xl border transition-all ${
              hasCasted
                ? 'bg-green-500/20 border-green-400/50'
                : 'bg-white/5 border-white/10 hover:border-white/30'
            }`}>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-3xl">{hasCasted ? '✅' : isUnify34 ? '1️⃣' : '2️⃣'}</div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-lg">Share on Warpcast</h3>
                    <p className="text-white/70 text-sm">Tell your network about EmpowerTours</p>
                  </div>
                </div>
                {!hasCasted && (
                  <button
                    onClick={handleCastClick}
                    disabled={isCheckingCast}
                    className="w-full mt-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold disabled:opacity-50 transition-all"
                  >
                    {isCheckingCast ? '⏳ Checking...' : '📢 Share on Warpcast'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Country Display - shows after completing requirements */}
          {isFollowing && hasCasted && (
            <div className="space-y-4 mb-6 animate-fade-in">
              <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-green-500/30">
                <div className="flex items-center gap-3">
                  <div className="text-4xl">
                    {selectedCountryCode ? getCountryByCode(selectedCountryCode)?.flag : '🌍'}
                  </div>
                  <div>
                    <p className="text-white/70 text-xs font-medium">Your passport will be minted for:</p>
                    <p className="text-white text-lg font-bold">
                      {selectedCountryCode
                        ? getCountryByCode(selectedCountryCode)?.name
                        : (location?.countryName || 'Detecting location...')}
                    </p>
                  </div>
                </div>
                {location && (
                  <p className="text-white/60 text-xs mt-2">
                    📍 Detected from your location: {location.city || ''}{location.city && location.region ? ', ' : ''}{location.region || ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 bg-red-500/20 border border-red-400/50 rounded-xl p-3">
              <p className="text-red-100 text-sm">❌ {error}</p>
            </div>
          )}

          {/* Mint Button */}
          {isFollowing && hasCasted && (
            <button
              onClick={handleMint}
              disabled={isMinting || geoLoading || !selectedCountryCode}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all shadow-lg"
            >
              {isMinting
                ? '⏳ Minting...'
                : geoLoading
                  ? '📍 Detecting location...'
                  : !selectedCountryCode
                    ? '📍 Waiting for location...'
                    : '🎫 Mint Passport (FREE)'}
            </button>
          )}

          {/* 🐛 DEBUG: Show button state for debugging */}
          {isFollowing && hasCasted && (isMinting || geoLoading || !selectedCountryCode) && (
            <div className="mt-2 text-xs text-white/50 text-center">
              Debug: {isMinting ? 'Minting in progress' : geoLoading ? 'Geolocation loading...' : !selectedCountryCode ? 'No country code yet' : 'Unknown'}
            </div>
          )}

          {/* Refresh buttons */}
          <div className="flex gap-2 mt-4">
            {!isUnify34 && (
              <button
                onClick={checkFollowStatus}
                disabled={isCheckingFollow || isFollowing}
                className="flex-1 px-3 py-2 bg-white/10 text-white/90 rounded-lg text-xs hover:bg-white/20 disabled:opacity-50 transition-all border border-white/10"
              >
                {isCheckingFollow ? '⏳' : isFollowing ? '✅' : '🔄'} Follow
              </button>
            )}
            <button
              onClick={checkCastStatus}
              disabled={isCheckingCast || hasCasted}
              className="flex-1 px-3 py-2 bg-white/10 text-white/90 rounded-lg text-xs hover:bg-white/20 disabled:opacity-50 transition-all border border-white/10"
            >
              {isCheckingCast ? '⏳' : hasCasted ? '✅' : '🔄'} Cast
            </button>
          </div>

          <p className="text-white/50 text-xs text-center mt-4">
            ⚡ Free mint - we pay all gas fees!
          </p>
        </div>
      </div>
    </div>
  );
}
