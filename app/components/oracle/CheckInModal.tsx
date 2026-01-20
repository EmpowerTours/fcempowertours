'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Navigation, Check, Loader2, AlertCircle, Stamp, Globe } from 'lucide-react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { getCurrentPosition, formatDistance, isValidCoordinates } from '@/lib/utils/gps';

interface Experience {
  id: string;
  itineraryId: string;
  title: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  proximityRadius?: number;
}

interface CheckInModalProps {
  experience: Experience;
  onClose: () => void;
  onSuccess?: (txHash: string, passportId: string) => void;
  isDarkMode?: boolean;
}

type CheckInState = 'idle' | 'getting-location' | 'checking-in' | 'success' | 'error' | 'needs-passport';

export function CheckInModal({
  experience,
  onClose,
  onSuccess,
  isDarkMode = true
}: CheckInModalProps) {
  const { walletAddress, requestWallet } = useFarcasterContext();

  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<CheckInState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [passportId, setPassportId] = useState<string | null>(null);
  const [countryRequired, setCountryRequired] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getLocation = async () => {
    setState('getting-location');
    setError(null);
    setProgressPercent(20);

    try {
      const position = await getCurrentPosition();
      setUserLocation(position);

      // Calculate distance if experience has coordinates
      if (experience.latitude && experience.longitude) {
        const { calculateDistance } = await import('@/lib/utils/gps');
        const dist = calculateDistance(
          position.lat,
          position.lon,
          experience.latitude,
          experience.longitude
        );
        setDistance(dist);
      }

      setProgressPercent(40);
      setState('idle');
    } catch (err: any) {
      setError(err.message || 'Failed to get your location');
      setState('error');
    }
  };

  const handleCheckIn = async () => {
    if (!walletAddress) {
      try {
        await requestWallet?.();
      } catch {
        setError('Please connect your wallet');
        return;
      }
    }

    if (!userLocation) {
      await getLocation();
      if (!userLocation) return;
    }

    setState('checking-in');
    setError(null);
    setProgressPercent(60);

    try {
      const res = await fetch('/api/oracle/checkin-experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          itineraryId: experience.itineraryId,
          latitude: userLocation!.lat,
          longitude: userLocation!.lon,
        }),
      });

      setProgressPercent(90);
      const data = await res.json();

      if (!data.success) {
        if (data.needsPassport) {
          setCountryRequired(data.countryRequired);
          setState('needs-passport');
          return;
        }
        throw new Error(data.error || 'Check-in failed');
      }

      setProgressPercent(100);
      setTxHash(data.txHash);
      setPassportId(data.passportTokenId);
      setState('success');

      if (onSuccess) {
        onSuccess(data.txHash, data.passportTokenId);
      }

    } catch (err: any) {
      setError(err.message || 'Check-in failed');
      setState('error');
    }
  };

  if (!mounted) return null;

  const circleRadius = 70;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - (progressPercent / 100) * circleCircumference;

  const proximityRadius = experience.proximityRadius || 100;
  const isWithinRange = distance !== null && distance <= proximityRadius;

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${isDarkMode ? 'dark' : ''}`}
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Loading Overlay */}
      {state === 'checking-in' && (
        <div className="absolute inset-0 z-[10000] flex flex-col items-center justify-center" style={{ backgroundColor: isDarkMode ? '#1f2937' : '#f3f4f6' }}>
          <div className="relative">
            <svg className="w-40 h-40 transform -rotate-90">
              <circle cx="80" cy="80" r={circleRadius} stroke="rgba(100, 100, 100, 0.3)" strokeWidth="8" fill="transparent" />
              <circle
                cx="80" cy="80" r={circleRadius}
                stroke="url(#checkinGradient)"
                strokeWidth="8"
                fill="transparent"
                strokeLinecap="round"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 ease-out"
              />
              <defs>
                <linearGradient id="checkinGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="50%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Stamp className={`w-12 h-12 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
          </div>
          <p className={`mt-6 font-medium text-lg ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
            Stamping your passport...
          </p>
          <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>Please wait...</p>
        </div>
      )}

      {/* Success Screen */}
      {state === 'success' && (
        <div className={`w-full max-w-md rounded-2xl shadow-2xl p-8 text-center ${isDarkMode ? 'bg-gray-900 border border-purple-500/30' : 'bg-white'}`}>
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center animate-pulse">
            <Stamp className="w-10 h-10 text-white" />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Passport Stamped!</h2>
          <p className={`mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            You've officially checked in to {experience.title}. Your passport now has a new stamp!
          </p>
          <div className={`p-4 rounded-lg mb-6 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Transaction</p>
            <a
              href={`https://testnet.monadexplorer.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 font-mono text-sm break-all"
            >
              {txHash?.slice(0, 20)}...{txHash?.slice(-8)}
            </a>
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:opacity-90"
          >
            View My Passport
          </button>
        </div>
      )}

      {/* Needs Passport Screen */}
      {state === 'needs-passport' && (
        <div className={`w-full max-w-md rounded-2xl shadow-2xl p-8 text-center ${isDarkMode ? 'bg-gray-900 border border-yellow-500/30' : 'bg-white'}`}>
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center">
            <Globe className="w-10 h-10 text-white" />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Passport Required</h2>
          <p className={`mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            You need a <span className="font-bold text-yellow-400">{countryRequired}</span> passport to collect stamps from this location.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`flex-1 py-3 px-6 rounded-lg font-medium ${isDarkMode ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'}`}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // Navigate to passport minting page
                window.location.href = '/passport';
              }}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-lg hover:opacity-90"
            >
              Get Passport
            </button>
          </div>
        </div>
      )}

      {/* Main Modal */}
      {state !== 'success' && state !== 'needs-passport' && state !== 'checking-in' && (
        <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-gray-900 border border-cyan-500/30' : 'bg-white border border-gray-200'}`}>
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <Stamp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Check In</h2>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Stamp your passport</p>
                </div>
              </div>
              <button onClick={onClose} className={`p-2 rounded-full ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Location Info */}
            <div className={`p-4 rounded-lg mb-6 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <h3 className={`font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{experience.title}</h3>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {experience.city}, {experience.country}
                </span>
              </div>
            </div>

            {/* GPS Status */}
            <div className={`p-4 rounded-lg mb-6 ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Your Location</span>
                {state === 'getting-location' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                ) : userLocation ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : null}
              </div>

              {userLocation ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-green-400" />
                    <span className={`text-sm font-mono ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {userLocation.lat.toFixed(6)}, {userLocation.lon.toFixed(6)}
                    </span>
                  </div>
                  {distance !== null && (
                    <div className={`flex items-center gap-2 p-2 rounded ${isWithinRange ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                      <span className={`text-sm ${isWithinRange ? 'text-green-400' : 'text-yellow-400'}`}>
                        {isWithinRange ? '✓' : '!'} {formatDistance(distance)} from location
                        {!isWithinRange && ` (need to be within ${formatDistance(proximityRadius)})`}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={getLocation}
                  disabled={state === 'getting-location'}
                  className="w-full py-2 px-4 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 flex items-center justify-center gap-2"
                >
                  <Navigation className="w-4 h-4" />
                  Get My Location
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Check In Button */}
            <button
              onClick={handleCheckIn}
              disabled={state === 'getting-location' || (distance !== null && !isWithinRange)}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {state === 'getting-location' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Getting location...
                </>
              ) : (
                <>
                  <Stamp className="w-5 h-5" />
                  Check In & Get Stamp
                </>
              )}
            </button>

            <p className={`text-xs text-center mt-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              Your GPS location will be verified to ensure you're at the destination
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
