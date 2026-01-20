'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, MapPin, Camera, Clock, Star, DollarSign, Lightbulb, Upload, Check } from 'lucide-react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

interface PlaceData {
  name: string;
  placeId: string;
  googleMapsUri: string;
  latitude: number;
  longitude: number;
  address?: string;
  rating?: number;
  types?: string[];
}

interface CreateExperienceModalProps {
  place: PlaceData;
  onClose: () => void;
  onSuccess?: (itineraryId: string, txHash: string) => void;
  isDarkMode?: boolean;
}

const steps = [
  { number: 1, title: 'Take Photos', icon: '📸' },
  { number: 2, title: 'Share Tips', icon: '💡' },
  { number: 3, title: 'Set Price', icon: '💰' },
  { number: 4, title: 'Review', icon: '🚀' },
];

export function CreateExperienceModal({ place, onClose, onSuccess, isDarkMode = true }: CreateExperienceModalProps) {
  const { user, walletAddress, requestWallet } = useFarcasterContext();

  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    title: `${place.name} Experience`,
    review: '',
    bestTime: '',
    recommendation: '',
    hiddenGem: '',
    proTip: '',
    price: '0.1',
  });

  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [success, setSuccess] = useState<{ itineraryId: string; txHash: string } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + photos.length > 5) {
      setError('Maximum 5 photos allowed');
      return;
    }

    setPhotos(prev => [...prev, ...files]);

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    setError(null);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreview(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!walletAddress) {
      setError('Please connect your wallet');
      return;
    }

    if (photos.length === 0) {
      setError('Please upload at least one photo');
      return;
    }

    if (!formData.review.trim()) {
      setError('Please write your tips and review');
      return;
    }

    setUploading(true);
    setError(null);
    setProgressStage('Preparing files...');
    setProgressPercent(5);

    try {
      // 1. Upload photos to IPFS
      setProgressStage('Uploading photos...');
      setProgressPercent(15);
      const photoHashes: string[] = [];

      for (let i = 0; i < photos.length; i++) {
        const formDataUpload = new FormData();
        formDataUpload.append('file', photos[i]);

        const uploadRes = await fetch('/api/upload-to-ipfs', {
          method: 'POST',
          body: formDataUpload,
        });

        if (!uploadRes.ok) throw new Error('Failed to upload photo');
        const uploadData = await uploadRes.json();
        photoHashes.push(uploadData.ipfsHash);
        setProgressPercent(15 + (i + 1) * (35 / photos.length));
        setProgressStage(`Uploaded photo ${i + 1}/${photos.length}`);
      }

      // 2. Generate AI-powered stamp using Gemini (Nano Banana)
      setProgressStage('Creating unique stamp with AI...');
      setProgressPercent(50);

      // Extract city and country from address for stamp
      const addressParts = (place.address || '').split(',').map(p => p.trim());
      const city = addressParts[addressParts.length - 2] || 'Unknown City';
      const country = addressParts[addressParts.length - 1] || 'Unknown Country';

      // Determine experience type from place types
      let experienceType: 'food' | 'attraction' | 'hotel' | 'entertainment' | 'nature' | 'shopping' | 'other' = 'other';
      const placeTypes = place.types || [];
      if (placeTypes.some(t => ['restaurant', 'cafe', 'bakery', 'bar', 'food'].includes(t))) {
        experienceType = 'food';
      } else if (placeTypes.some(t => ['lodging', 'hotel'].includes(t))) {
        experienceType = 'hotel';
      } else if (placeTypes.some(t => ['park', 'natural_feature', 'campground'].includes(t))) {
        experienceType = 'nature';
      } else if (placeTypes.some(t => ['museum', 'tourist_attraction', 'point_of_interest'].includes(t))) {
        experienceType = 'attraction';
      } else if (placeTypes.some(t => ['shopping_mall', 'store'].includes(t))) {
        experienceType = 'shopping';
      } else if (placeTypes.some(t => ['night_club', 'movie_theater', 'amusement_park'].includes(t))) {
        experienceType = 'entertainment';
      }

      let stampIpfsHash: string | null = null;
      try {
        const stampRes = await fetch('/api/oracle/generate-experience-stamp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationName: place.name,
            city,
            country,
            experienceType,
            description: formData.review.slice(0, 200),
            creatorUsername: user?.username,
            photos: photoHashes.map(h => `ipfs://${h}`),
            style: 'vintage',
          }),
        });

        if (stampRes.ok) {
          const stampData = await stampRes.json();
          if (stampData.success && stampData.ipfsHash) {
            stampIpfsHash = stampData.ipfsHash;
            console.log('[CreateExperience] AI stamp generated:', stampIpfsHash);
          }
        }
      } catch (stampError) {
        console.log('[CreateExperience] Stamp generation skipped:', stampError);
        // Continue without stamp - not a critical failure
      }

      setProgressPercent(60);

      // 3. Create metadata JSON
      setProgressStage('Creating experience data...');

      const metadata = {
        name: formData.title,
        description: formData.review,
        image: `ipfs://${photoHashes[0]}`,
        stamp: stampIpfsHash ? `ipfs://${stampIpfsHash}` : null, // AI-generated stamp
        attributes: [
          { trait_type: 'Location', value: place.name },
          { trait_type: 'Best Time', value: formData.bestTime || 'Anytime' },
          { trait_type: 'Creator FID', value: user?.fid?.toString() || '0' },
          { trait_type: 'Price', value: formData.price },
          { trait_type: 'Experience Type', value: experienceType },
          { trait_type: 'Has AI Stamp', value: stampIpfsHash ? 'Yes' : 'No' },
        ],
        properties: {
          review: formData.review,
          bestTime: formData.bestTime,
          recommendation: formData.recommendation,
          hiddenGem: formData.hiddenGem,
          proTip: formData.proTip,
          photos: photoHashes.map(h => `ipfs://${h}`),
          stampImage: stampIpfsHash ? `ipfs://${stampIpfsHash}` : null,
          placeId: place.placeId,
          googleMapsUri: place.googleMapsUri,
          coordinates: {
            latitude: place.latitude,
            longitude: place.longitude,
          },
        },
      };

      // Upload metadata to IPFS
      const metadataRes = await fetch('/api/upload-json-to-ipfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: metadata, name: `experience-${place.placeId}` }),
      });

      if (!metadataRes.ok) throw new Error('Failed to upload metadata');

      setProgressPercent(70);
      setProgressStage('Creating on blockchain...');
      setUploading(false);
      setCreating(true);

      const createRes = await fetch('/api/oracle/create-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator: walletAddress,
          creatorFid: user?.fid || 0,
          title: formData.title,
          description: formData.review,
          city,
          country,
          price: formData.price,
          photoProofIPFS: photoHashes[0],
          stampIPFS: stampIpfsHash, // AI-generated unique stamp
          experienceType,
          locations: [{
            name: place.name,
            placeId: place.placeId,
            googleMapsUri: place.googleMapsUri,
            latitude: place.latitude,
            longitude: place.longitude,
            description: formData.recommendation || formData.review.slice(0, 200),
          }],
        }),
      });

      setProgressPercent(90);
      setProgressStage('Confirming transaction...');

      const createData = await createRes.json();

      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create experience');
      }

      setProgressPercent(100);
      setProgressStage('Success!');

      setSuccess({
        itineraryId: createData.itineraryId || '0',
        txHash: createData.txHash,
      });

      if (onSuccess) {
        onSuccess(createData.itineraryId, createData.txHash);
      }

    } catch (err: any) {
      console.error('Create experience error:', err);
      setError(err.message || 'Failed to create experience');
      setProgressStage('');
      setProgressPercent(0);
    } finally {
      setUploading(false);
      setCreating(false);
    }
  };

  if (!mounted) return null;

  const circleRadius = 70;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - (progressPercent / 100) * circleCircumference;

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-2 overflow-y-auto ${isDarkMode ? 'dark' : ''}`}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
    >
      {/* Circular Progress Overlay */}
      {(uploading || creating) && (
        <div className="absolute inset-0 z-[10000] flex flex-col items-center justify-center" style={{ backgroundColor: isDarkMode ? '#1f2937' : '#f3f4f6' }}>
          <div className="relative">
            <svg className="w-40 h-40 transform -rotate-90">
              <circle cx="80" cy="80" r={circleRadius} stroke="rgba(100, 100, 100, 0.3)" strokeWidth="8" fill="transparent" />
              <circle
                cx="80" cy="80" r={circleRadius}
                stroke="url(#gradient)"
                strokeWidth="8"
                fill="transparent"
                strokeLinecap="round"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 ease-out"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="50%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-4xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{progressPercent}</span>
            </div>
          </div>
          <p className={`mt-6 font-medium text-lg ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>{progressStage}</p>
          <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>Please wait, do not close this window...</p>
        </div>
      )}

      <div className={`w-full max-w-lg rounded-2xl shadow-2xl my-4 relative overflow-hidden ${isDarkMode ? 'bg-gray-900 border border-cyan-500/30' : 'bg-white border border-gray-300'}`}>
        <div className="relative p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-green-500 rounded-full flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Create Experience</h1>
                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} truncate max-w-[200px]`}>{place.name}</p>
              </div>
            </div>
            <button onClick={onClose} className={`transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Earn Badge */}
          <div className="mb-6 p-3 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg border border-green-500/30">
            <p className="text-sm font-bold text-green-400 text-center">💰 Earn 70% of every purchase!</p>
          </div>

          {/* Progress Stepper */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold transition-all ${
                      currentStep >= step.number
                        ? 'bg-gradient-to-r from-cyan-500 to-green-500 text-white scale-110 shadow-lg'
                        : isDarkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-200 text-gray-400'
                    }`}>
                      {step.icon}
                    </div>
                    <p className={`mt-2 text-xs font-medium ${
                      currentStep >= step.number
                        ? isDarkMode ? 'text-cyan-400' : 'text-cyan-600'
                        : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                      {step.title}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`h-1 flex-1 mx-2 rounded transition-all ${
                      currentStep > step.number
                        ? 'bg-gradient-to-r from-cyan-500 to-green-500'
                        : isDarkMode ? 'bg-gray-800' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 font-medium">❌ {error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="mb-6 p-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/40 rounded-2xl">
              <p className="text-green-400 font-bold text-xl mb-3">🎉 Experience Created!</p>
              <div className="space-y-2 text-sm">
                <p className="text-green-300"><strong className="text-green-400">Location:</strong> {place.name}</p>
                <p className="text-green-300"><strong className="text-green-400">Price:</strong> {formData.price} WMON</p>
                <p className="text-green-300"><strong className="text-green-400">You earn:</strong> {(parseFloat(formData.price) * 0.7).toFixed(3)} WMON per sale</p>
                <div className="flex flex-col gap-3 mt-4">
                  {success.txHash && (
                    <a
                      href={`https://testnet.monadscan.com/tx/${success.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-3 bg-gradient-to-r from-cyan-500 to-green-500 text-white rounded-lg font-medium transition-all text-center"
                    >
                      View on Monadscan
                    </a>
                  )}
                  <button onClick={onClose} className="px-4 py-3 bg-gray-700 text-white rounded-lg font-medium">
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step Content */}
          {!success && (
            <div className="space-y-6">
              {/* STEP 1: Take Photos */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <h2 className={`text-2xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    📸 Upload Your Photos
                  </h2>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Photos prove you visited this location. Upload 1-5 photos.
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    {photoPreview.map((src, i) => (
                      <div key={i} className="relative aspect-square">
                        <img src={src} alt={`Photo ${i+1}`} className="w-full h-full object-cover rounded-xl" />
                        <button
                          onClick={() => removePhoto(i)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                    {photos.length < 5 && (
                      <label className="aspect-square border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500 transition-colors">
                        <Camera className="w-8 h-8 text-gray-500 mb-2" />
                        <span className="text-xs text-gray-500">Add Photo</span>
                        <input type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
                      </label>
                    )}
                  </div>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>{photos.length}/5 photos uploaded</p>

                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={photos.length === 0}
                    className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-green-500 text-white rounded-xl font-bold text-lg hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all"
                  >
                    Continue →
                  </button>
                </div>
              )}

              {/* STEP 2: Share Tips */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>💡 Share Your Tips</h2>
                    <button onClick={() => setCurrentStep(1)} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                  </div>

                  <div>
                    <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <Star className="w-4 h-4 inline mr-1" /> Your Review & Tips *
                    </label>
                    <textarea
                      value={formData.review}
                      onChange={e => setFormData(prev => ({ ...prev, review: e.target.value }))}
                      className={`w-full px-4 py-3 rounded-xl border resize-none ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'}`}
                      rows={3}
                      placeholder="What made this place special? Any insider tips?"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <Clock className="w-4 h-4 inline mr-1" /> Best Time to Visit
                    </label>
                    <input
                      type="text"
                      value={formData.bestTime}
                      onChange={e => setFormData(prev => ({ ...prev, bestTime: e.target.value }))}
                      className={`w-full px-4 py-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'}`}
                      placeholder="e.g., Weekday mornings, avoid weekends"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <Star className="w-4 h-4 inline mr-1" /> What to Order/Do
                    </label>
                    <input
                      type="text"
                      value={formData.recommendation}
                      onChange={e => setFormData(prev => ({ ...prev, recommendation: e.target.value }))}
                      className={`w-full px-4 py-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'}`}
                      placeholder="e.g., Try the house special, sit by the window"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <Lightbulb className="w-4 h-4 inline mr-1" /> Hidden Gem Nearby
                    </label>
                    <input
                      type="text"
                      value={formData.hiddenGem}
                      onChange={e => setFormData(prev => ({ ...prev, hiddenGem: e.target.value }))}
                      className={`w-full px-4 py-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'}`}
                      placeholder="e.g., Amazing bakery 2 blocks east"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <Lightbulb className="w-4 h-4 inline mr-1" /> Pro Tip
                    </label>
                    <input
                      type="text"
                      value={formData.proTip}
                      onChange={e => setFormData(prev => ({ ...prev, proTip: e.target.value }))}
                      className={`w-full px-4 py-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'}`}
                      placeholder="e.g., Cash only, free parking on 3rd street"
                    />
                  </div>

                  <button
                    onClick={() => setCurrentStep(3)}
                    disabled={!formData.review.trim()}
                    className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-green-500 text-white rounded-xl font-bold text-lg hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all"
                  >
                    Continue →
                  </button>
                </div>
              )}

              {/* STEP 3: Set Price */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>💰 Set Your Price</h2>
                    <button onClick={() => setCurrentStep(2)} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                  </div>

                  <div>
                    <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Experience Title
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      className={`w-full px-4 py-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                  </div>

                  <div className="p-6 bg-gradient-to-br from-green-900/30 to-emerald-900/30 rounded-2xl border border-green-500/30">
                    <label className={`block text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Price in WMON
                    </label>

                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {['0.05', '0.1', '0.25', '0.5'].map((p) => (
                        <button
                          key={p}
                          onClick={() => setFormData(prev => ({ ...prev, price: p }))}
                          className={`px-3 py-3 rounded-xl font-bold transition-all ${
                            formData.price === p
                              ? 'bg-gradient-to-r from-cyan-500 to-green-500 text-white scale-105 shadow-lg'
                              : isDarkMode ? 'bg-gray-800 text-gray-300 hover:scale-105' : 'bg-white text-gray-700 hover:scale-105'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.price}
                        onChange={e => setFormData(prev => ({ ...prev, price: e.target.value }))}
                        className={`flex-1 px-4 py-3 rounded-xl border ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                      />
                      <span className={`font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>WMON</span>
                    </div>

                    <div className="mt-4 p-4 bg-green-500/20 rounded-xl">
                      <p className="text-green-400 font-bold text-center">
                        You earn: {(parseFloat(formData.price || '0') * 0.7).toFixed(3)} WMON per sale (70%)
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setCurrentStep(4)}
                    className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-green-500 text-white rounded-xl font-bold text-lg hover:scale-105 transition-all"
                  >
                    Review & Create →
                  </button>
                </div>
              )}

              {/* STEP 4: Review */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>🚀 Review Experience</h2>
                    <button onClick={() => setCurrentStep(3)} className={`px-3 py-1 rounded-lg flex items-center gap-1 ${isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                  </div>

                  {/* Preview Card */}
                  <div className="p-6 bg-gradient-to-br from-cyan-900/30 via-green-900/30 to-emerald-900/30 rounded-2xl border-2 border-cyan-500/30">
                    <div className="flex gap-4">
                      {photoPreview[0] && (
                        <img src={photoPreview[0]} alt="Cover" className="w-24 h-24 object-cover rounded-xl shadow-lg" />
                      )}
                      <div className="flex-1">
                        <p className="text-xs font-bold text-cyan-400 mb-1">📍 EXPERIENCE</p>
                        <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formData.title}</h3>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>{place.address}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-700 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Price:</span>
                        <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formData.price} WMON</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>You earn:</span>
                        <span className="font-bold text-green-400">{(parseFloat(formData.price) * 0.7).toFixed(3)} WMON (70%)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Photos:</span>
                        <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{photos.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Creator:</span>
                        <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>@{user?.username || 'You'}</span>
                      </div>
                    </div>

                    {formData.review && (
                      <div className="mt-4 pt-4 border-t border-gray-700">
                        <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>"{formData.review.slice(0, 100)}..."</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleCreate}
                    disabled={uploading || creating}
                    className="w-full px-8 py-6 bg-gradient-to-r from-cyan-500 via-green-500 to-emerald-500 text-white rounded-2xl font-bold text-2xl hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all shadow-2xl"
                  >
                    🚀 Create Experience (FREE!)
                  </button>

                  {!walletAddress && (
                    <button
                      onClick={requestWallet}
                      className="w-full px-6 py-4 bg-yellow-500 text-black rounded-xl font-bold text-lg hover:bg-yellow-400 transition-all"
                    >
                      🔑 Connect Wallet First
                    </button>
                  )}

                  <div className="p-4 bg-green-500/20 rounded-xl border border-green-500/30">
                    <p className="text-green-400 font-bold text-center text-sm">✨ FREE to create! We pay all gas fees</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info Box */}
          {!success && (
            <div className="mt-6 p-4 bg-gradient-to-r from-cyan-500/10 to-green-500/10 rounded-xl border border-cyan-500/20">
              <p className="text-sm text-cyan-400 font-bold mb-2">💡 How Experiences Work:</p>
              <ul className={`text-xs space-y-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                <li>• Share your insider tips and photos</li>
                <li>• Set your price - you earn 70% of every sale</li>
                <li>• Buyers get your tips + a stamp on their passport</li>
                <li>• Creating is FREE - we cover all gas fees</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
