'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Star, User, ShoppingCart, Check, Loader2, Clock, Lightbulb, Camera } from 'lucide-react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

interface Experience {
  id: string;
  itineraryId: string;
  title: string;
  description: string;
  city: string;
  country: string;
  creator: string;
  creatorUsername?: string;
  creatorPfp?: string;
  price: string;
  priceWMON: string;
  averageRating: number;
  ratingCount: number;
  totalPurchases: number;
  photoProofIPFS?: string;
  bestTime?: string;
  proTip?: string;
  hiddenGem?: string;
  locations?: Array<{
    name: string;
    description: string;
    latitude?: number;
    longitude?: number;
  }>;
}

interface PurchaseExperienceModalProps {
  experience: Experience;
  onClose: () => void;
  onSuccess?: (txHash: string) => void;
  isDarkMode?: boolean;
}

export function PurchaseExperienceModal({
  experience,
  onClose,
  onSuccess,
  isDarkMode = true
}: PurchaseExperienceModalProps) {
  const { user, walletAddress, requestWallet } = useFarcasterContext();

  const [mounted, setMounted] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ txHash: string } | null>(null);
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePurchase = async () => {
    if (!walletAddress) {
      try {
        await requestWallet?.();
      } catch {
        setError('Please connect your wallet to purchase');
        return;
      }
    }

    setPurchasing(true);
    setError(null);
    setProgressStage('Preparing purchase...');
    setProgressPercent(10);

    try {
      setProgressStage('Approving TOURS tokens...');
      setProgressPercent(30);

      const res = await fetch('/api/oracle/purchase-experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: walletAddress,
          itineraryId: experience.itineraryId,
          price: experience.price,
        }),
      });

      setProgressStage('Confirming transaction...');
      setProgressPercent(70);

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Purchase failed');
      }

      setProgressPercent(100);
      setProgressStage('Success!');

      setSuccess({ txHash: data.txHash });

      if (onSuccess) {
        onSuccess(data.txHash);
      }

    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.message || 'Failed to purchase experience');
      setProgressStage('');
      setProgressPercent(0);
    } finally {
      setPurchasing(false);
    }
  };

  if (!mounted) return null;

  const circleRadius = 70;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - (progressPercent / 100) * circleCircumference;

  // Parse price to readable format
  const priceDisplay = experience.priceWMON || (Number(experience.price) / 1e18).toFixed(2);
  const creatorEarnings = (Number(priceDisplay) * 0.7).toFixed(2);

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-2 overflow-y-auto ${isDarkMode ? 'dark' : ''}`}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Loading Overlay */}
      {purchasing && (
        <div className="absolute inset-0 z-[10000] flex flex-col items-center justify-center" style={{ backgroundColor: isDarkMode ? '#1f2937' : '#f3f4f6' }}>
          <div className="relative">
            <svg className="w-40 h-40 transform -rotate-90">
              <circle cx="80" cy="80" r={circleRadius} stroke="rgba(100, 100, 100, 0.3)" strokeWidth="8" fill="transparent" />
              <circle
                cx="80" cy="80" r={circleRadius}
                stroke="url(#purchaseGradient)"
                strokeWidth="8"
                fill="transparent"
                strokeLinecap="round"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 ease-out"
              />
              <defs>
                <linearGradient id="purchaseGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-4xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{progressPercent}</span>
            </div>
          </div>
          <p className={`mt-6 font-medium text-lg ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{progressStage}</p>
          <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>Please wait...</p>
        </div>
      )}

      {/* Success Screen */}
      {success && (
        <div className={`w-full max-w-md rounded-2xl shadow-2xl p-8 text-center ${isDarkMode ? 'bg-gray-900 border border-green-500/30' : 'bg-white'}`}>
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Purchase Complete!</h2>
          <p className={`mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            You now have access to this experience. Visit the location to check-in and earn your stamp!
          </p>
          <div className={`p-4 rounded-lg mb-6 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Transaction</p>
            <a
              href={`https://monadscan.com/tx/${success.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 font-mono text-sm break-all"
            >
              {success.txHash.slice(0, 20)}...{success.txHash.slice(-8)}
            </a>
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 px-6 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-lg hover:opacity-90"
          >
            View My Experiences
          </button>
        </div>
      )}

      {/* Main Modal */}
      {!success && !purchasing && (
        <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-gray-900 border border-cyan-500/30' : 'bg-white border border-gray-200'}`}>
          {/* Header Image */}
          {experience.photoProofIPFS && (
            <div className="relative h-48 overflow-hidden">
              <img
                src={experience.photoProofIPFS.startsWith('ipfs://')
                  ? `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${experience.photoProofIPFS.replace('ipfs://', '')}`
                  : experience.photoProofIPFS
                }
                alt={experience.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          <div className="p-5">
            {/* Title & Location */}
            <div className="mb-4">
              <h2 className={`text-xl font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {experience.title}
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                  {experience.city}, {experience.country}
                </span>
              </div>
            </div>

            {/* Rating & Stats */}
            <div className="flex items-center gap-4 mb-4">
              {experience.averageRating > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {experience.averageRating.toFixed(1)}
                  </span>
                  <span className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    ({experience.ratingCount})
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <ShoppingCart className="w-4 h-4 text-green-400" />
                <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {experience.totalPurchases} purchased
                </span>
              </div>
            </div>

            {/* Creator */}
            <div className={`flex items-center gap-3 p-3 rounded-lg mb-4 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
                {experience.creatorPfp ? (
                  <img src={experience.creatorPfp} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Created by</p>
                <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  @{experience.creatorUsername || experience.creator.slice(0, 8)}
                </p>
              </div>
            </div>

            {/* Description */}
            {experience.description && (
              <div className="mb-4">
                <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {experience.description.slice(0, 200)}
                  {experience.description.length > 200 && '...'}
                </p>
              </div>
            )}

            {/* What You Get */}
            <div className={`p-4 rounded-lg mb-4 ${isDarkMode ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-200'}`}>
              <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-700'}`}>What you get:</h3>
              <ul className={`text-sm space-y-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <li className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-400" />
                  Insider tips & recommendations
                </li>
                <li className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-pink-400" />
                  Photo spots & hidden gems
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-green-400" />
                  Best times to visit
                </li>
                <li className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-purple-400" />
                  Passport stamp on check-in
                </li>
              </ul>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Price & Purchase */}
            <div className={`flex items-center justify-between p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <div>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Price</p>
                <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {priceDisplay} <span className="text-sm font-normal">TOURS</span>
                </p>
              </div>
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {purchasing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Purchasing...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    Purchase
                  </>
                )}
              </button>
            </div>

            {/* Creator earnings note */}
            <p className={`text-xs text-center mt-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              {creatorEarnings} TOURS goes to the creator (70%)
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
