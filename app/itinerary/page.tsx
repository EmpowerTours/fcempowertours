'use client';

import { useState, useEffect, useRef } from 'react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { useAccount } from 'wagmi';
import Link from 'next/link';

const EXPERIENCE_TYPES = [
  { id: 0, name: 'Food', emoji: '🍽️', color: 'from-orange-500 to-red-500' },
  { id: 1, name: 'Attraction', emoji: '🏛️', color: 'from-blue-500 to-indigo-500' },
  { id: 2, name: 'Cultural', emoji: '🎭', color: 'from-purple-500 to-pink-500' },
  { id: 3, name: 'Nature', emoji: '🌿', color: 'from-green-500 to-emerald-500' },
  { id: 4, name: 'Entertainment', emoji: '🎪', color: 'from-yellow-500 to-orange-500' },
  { id: 5, name: 'Accommodation', emoji: '🏨', color: 'from-cyan-500 to-blue-500' },
  { id: 6, name: 'Shopping', emoji: '🛍️', color: 'from-pink-500 to-rose-500' },
  { id: 7, name: 'Transport', emoji: '🚂', color: 'from-slate-500 to-gray-500' },
  { id: 8, name: 'Other', emoji: '📍', color: 'from-violet-500 to-purple-500' },
];

export default function ItineraryPage() {
  const { walletAddress, fid } = useFarcasterContext();
  const { address: wagmiAddress } = useAccount();
  const effectiveAddress = walletAddress || wagmiAddress;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [locationName, setLocationName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('10');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // GPS state
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Minting state
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintSuccess, setMintSuccess] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Get GPS location
  const getLocation = () => {
    setGpsLoading(true);
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setGpsLoading(false);
      },
      (error) => {
        setGpsError('Could not get location. You can enter manually.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Handle photo upload
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload to IPFS via Pinata
  const uploadToIPFS = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload-pinata', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload image');
    }

    const data = await response.json();
    return data.ipfsHash;
  };

  // Handle mint
  const handleMint = async () => {
    if (!effectiveAddress) {
      setMintError('Please connect your wallet');
      return;
    }

    if (selectedType === null || !locationName || !city || !country) {
      setMintError('Please fill in all required fields');
      return;
    }

    setIsMinting(true);
    setMintError(null);
    setMintSuccess(null);

    try {
      // Upload photo if provided
      let ipfsHash = '';
      if (photoFile) {
        setMintSuccess('Uploading photo...');
        ipfsHash = await uploadToIPFS(photoFile);
      }

      // Check delegation
      setMintSuccess('Setting up gasless transaction...');
      const delegationRes = await fetch(`/api/delegation-status?address=${effectiveAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes('create_experience');

      if (!hasValidDelegation) {
        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: effectiveAddress,
            authMethod: 'farcaster',
            fid,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['mint_passport', 'mint_music', 'create_experience', 'purchase_experience', 'stamp_passport']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation');
        }
      }

      setMintSuccess('Creating your experience (FREE gas)...');

      // Convert coordinates to scaled integers (1e6)
      const scaledLat = latitude ? Math.round(latitude * 1e6) : 0;
      const scaledLon = longitude ? Math.round(longitude * 1e6) : 0;

      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          action: 'create_experience',
          params: {
            country,
            city,
            locationName,
            description: description || `${locationName} in ${city}, ${country}`,
            experienceType: selectedType,
            latitude: scaledLat,
            longitude: scaledLon,
            proximityRadius: 100, // 100 meters
            price: price,
            ipfsImageHash: ipfsHash ? `ipfs://${ipfsHash}` : ''
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create experience');
      }

      const { txHash: hash } = await response.json();
      setTxHash(hash);
      setMintSuccess('Experience created successfully!');

    } catch (err: any) {
      console.error('Mint error:', err);
      setMintError(err.message || 'Failed to create experience');
    } finally {
      setIsMinting(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setStep(1);
    setSelectedType(null);
    setLocationName('');
    setCity('');
    setCountry('');
    setDescription('');
    setPrice('10');
    setPhotoPreview(null);
    setPhotoFile(null);
    setLatitude(null);
    setLongitude(null);
    setMintError(null);
    setMintSuccess(null);
    setTxHash(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900 p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6 pt-6">
          <h1 className="text-3xl font-bold text-white mb-2">Create Experience</h1>
          <p className="text-white/70 text-sm">Share your travel discoveries with the world</p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-3 h-3 rounded-full transition-all ${
                step >= s ? 'bg-emerald-400' : 'bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Success State */}
        {txHash && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">Experience Created!</h2>
            <p className="text-emerald-400 mb-4">{locationName}</p>
            <a
              href={`https://monadscan.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 text-sm underline mb-4 block"
            >
              View on MonadScan
            </a>
            <div className="flex flex-col gap-3">
              <Link
                href="/itinerary-market"
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-3 px-6 rounded-xl"
              >
                🗺️ View Experience Market
              </Link>
              <button
                onClick={resetForm}
                className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-xl border border-white/20"
              >
                Create Another
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Select Type */}
        {!txHash && step === 1 && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
            <h2 className="text-xl font-bold text-white mb-4">What type of experience?</h2>
            <div className="grid grid-cols-3 gap-3">
              {EXPERIENCE_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setSelectedType(type.id);
                    setStep(2);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all hover:scale-105 ${
                    selectedType === type.id
                      ? 'border-emerald-400 bg-emerald-500/20'
                      : 'border-white/20 bg-white/5 hover:border-white/40'
                  }`}
                >
                  <div className="text-3xl mb-2">{type.emoji}</div>
                  <div className="text-white text-xs font-medium">{type.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Location Details */}
        {!txHash && step === 2 && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setStep(1)} className="text-white/60 hover:text-white">
                ←
              </button>
              <h2 className="text-xl font-bold text-white">Location Details</h2>
            </div>

            <div className="space-y-4">
              {/* Location Name */}
              <div>
                <label className="text-white/70 text-sm block mb-1">Place Name *</label>
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g., El Taquero, Machu Picchu"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-emerald-400"
                />
              </div>

              {/* City */}
              <div>
                <label className="text-white/70 text-sm block mb-1">City *</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g., Lima, Tokyo, Paris"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-emerald-400"
                />
              </div>

              {/* Country */}
              <div>
                <label className="text-white/70 text-sm block mb-1">Country *</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g., Peru, Japan, France"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-emerald-400"
                />
              </div>

              {/* GPS */}
              <div>
                <label className="text-white/70 text-sm block mb-1">GPS Location (optional)</label>
                <button
                  onClick={getLocation}
                  disabled={gpsLoading}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                >
                  {gpsLoading ? (
                    <span className="animate-spin">📍</span>
                  ) : latitude && longitude ? (
                    <span className="text-emerald-400">📍 Location captured!</span>
                  ) : (
                    <span>📍 Use my current location</span>
                  )}
                </button>
                {gpsError && <p className="text-yellow-400 text-xs mt-1">{gpsError}</p>}
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={!locationName || !city || !country}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-500 text-white font-bold py-3 rounded-xl transition-all"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Photo & Price */}
        {!txHash && step === 3 && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setStep(2)} className="text-white/60 hover:text-white">
                ←
              </button>
              <h2 className="text-xl font-bold text-white">Photo & Price</h2>
            </div>

            <div className="space-y-4">
              {/* Photo Upload */}
              <div>
                <label className="text-white/70 text-sm block mb-1">Photo (optional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-xl"
                    />
                    <button
                      onClick={() => {
                        setPhotoPreview(null);
                        setPhotoFile(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 bg-white/5 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-white/40 transition-all"
                  >
                    <span className="text-3xl">📷</span>
                    <span className="text-white/60 text-sm">Tap to add photo</span>
                  </button>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="text-white/70 text-sm block mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Share tips, directions, best time to visit..."
                  rows={3}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-emerald-400 resize-none"
                />
              </div>

              {/* Price */}
              <div>
                <label className="text-white/70 text-sm block mb-1">Price (TOURS)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min="1"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-400"
                />
                <p className="text-white/50 text-xs mt-1">You earn 80% when others purchase your guide</p>
              </div>

              {/* Preview Card */}
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="text-3xl">{EXPERIENCE_TYPES[selectedType || 0]?.emoji}</div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold">{locationName || 'Your Experience'}</h3>
                    <p className="text-white/60 text-sm">{city}, {country}</p>
                    <p className="text-emerald-400 text-sm mt-1">{price} TOURS</p>
                  </div>
                </div>
              </div>

              {/* Error/Success */}
              {mintError && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3">
                  <p className="text-red-400 text-sm">{mintError}</p>
                </div>
              )}
              {mintSuccess && !txHash && (
                <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-3">
                  <p className="text-emerald-400 text-sm">{mintSuccess}</p>
                </div>
              )}

              {/* Mint Button */}
              <button
                onClick={handleMint}
                disabled={isMinting || !effectiveAddress}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-gray-500 disabled:to-gray-600 text-white font-bold py-4 rounded-xl transition-all"
              >
                {isMinting ? '⏳ Creating...' : '🚀 Create Experience (FREE Gas)'}
              </button>

              {!effectiveAddress && (
                <p className="text-yellow-400 text-xs text-center">Please connect wallet to continue</p>
              )}
            </div>
          </div>
        )}

        {/* Back Link */}
        <div className="text-center mt-6 pb-8">
          <Link href="/" className="text-white/60 text-sm hover:text-white/90 underline">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
