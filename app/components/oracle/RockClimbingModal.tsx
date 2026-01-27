'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Mountain, MapPin, Camera, Plus, Loader2, ExternalLink, Search, ChevronRight, ChevronLeft, Check, Upload, DollarSign, Image as ImageIcon } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useGeolocation } from '@/lib/useGeolocation';

interface ClimbLocation {
  id: string;
  locationId: string;
  name: string;
  difficulty: string;
  latitude: number;
  longitude: number;
  photoProofIPFS: string;
  description: string;
  priceWmon: string;
  creator: string;
  createdAt: string;
}

interface AccessBadge {
  id: string;
  tokenId: string;
  locationId: string;
  purchasedAt: string;
  txHash: string;
  location: ClimbLocation | null;
}

interface ClimbProof {
  id: string;
  tokenId: string;
  locationId: string;
  photoIPFS: string;
  entryText: string;
  reward: string;
  climbedAt: string;
  txHash: string;
  locationName: string;
  locationDifficulty: string;
}

interface RockClimbingModalProps {
  onClose: () => void;
  isDarkMode: boolean;
  walletAddress?: string;
  userFid?: number;
  userTelegramId?: number;
}

// Difficulty grades for climbing
const BOULDER_GRADES = ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17'];
const SPORT_GRADES = ['5.6', '5.7', '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d', '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b', '5.13c', '5.13d', '5.14a', '5.14b', '5.14c', '5.14d', '5.15a', '5.15b', '5.15c'];

type CreateStep = 'photo' | 'details' | 'location' | 'price' | 'confirm';

export function RockClimbingModal({ onClose, isDarkMode, walletAddress, userFid, userTelegramId }: RockClimbingModalProps) {
  const [activeTab, setActiveTab] = useState<'explore' | 'create' | 'my-climbs'>('explore');
  const [locations, setLocations] = useState<ClimbLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [portalMounted, setPortalMounted] = useState(false);

  // Create climb state
  const [createStep, setCreateStep] = useState<CreateStep>('photo');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [climbName, setClimbName] = useState('');
  const [description, setDescription] = useState('');
  const [gradeType, setGradeType] = useState<'boulder' | 'sport'>('boulder');
  const [selectedGrade, setSelectedGrade] = useState('V0');
  const [price, setPrice] = useState(5);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState<{ locationId: string; txHash: string } | null>(null);

  // Purchase state
  const [purchasingLocationId, setPurchasingLocationId] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState('');
  const [purchaseSuccess, setPurchaseSuccess] = useState<{ locationId: string; txHash: string } | null>(null);

  // My Climbs state
  const [myAccessBadges, setMyAccessBadges] = useState<AccessBadge[]>([]);
  const [myClimbProofs, setMyClimbProofs] = useState<ClimbProof[]>([]);
  const [loadingMyClimbs, setLoadingMyClimbs] = useState(false);

  const { location: geoLocation, loading: geoLoading } = useGeolocation();
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  // Auto-fill location from geolocation
  useEffect(() => {
    if (geoLocation && !manualLat && !manualLng) {
      setManualLat(geoLocation.latitude?.toFixed(6) || '');
      setManualLng(geoLocation.longitude?.toFixed(6) || '');
    }
  }, [geoLocation]);

  // Fetch climbing locations from Envio
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await fetch('/api/climbing/locations');
        const data = await response.json();
        if (data.success) {
          setLocations(data.locations || []);
        }
      } catch (error) {
        console.error('[RockClimbingModal] Failed to fetch locations:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLocations();
  }, []);

  // Fetch user's purchases when my-climbs tab is active
  useEffect(() => {
    const fetchMyClimbs = async () => {
      if (!walletAddress || activeTab !== 'my-climbs') return;

      setLoadingMyClimbs(true);
      try {
        const response = await fetch(`/api/climbing/my-purchases?holder=${walletAddress}`);
        const data = await response.json();
        if (data.success) {
          setMyAccessBadges(data.accessBadges || []);
          setMyClimbProofs(data.climbProofs || []);
        }
      } catch (error) {
        console.error('[RockClimbingModal] Failed to fetch my climbs:', error);
      } finally {
        setLoadingMyClimbs(false);
      }
    };
    fetchMyClimbs();
  }, [walletAddress, activeTab]);

  // Get purchased location IDs for the current user
  const purchasedLocationIds = new Set(myAccessBadges.map(b => b.locationId));

  const handlePurchase = async (loc: ClimbLocation) => {
    if (!walletAddress) {
      setPurchaseError('Please connect your wallet first');
      return;
    }

    // Check if already purchased
    if (purchasedLocationIds.has(loc.locationId)) {
      setPurchaseError('You already own access to this location');
      return;
    }

    // Check if trying to buy own location
    if (loc.creator.toLowerCase() === walletAddress.toLowerCase()) {
      setPurchaseError('You cannot purchase your own location');
      return;
    }

    setPurchasingLocationId(loc.locationId);
    setPurchaseError('');
    setPurchaseSuccess(null);

    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'purchase_climb',
          params: {
            locationId: loc.locationId,
            priceWmon: (parseFloat(loc.priceWmon) * 1e18).toString(),
            buyerFid: userFid || 0,
            buyerTelegramId: userTelegramId || 0,
          }
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to purchase');
      }

      setPurchaseSuccess({
        locationId: loc.locationId,
        txHash: result.txHash || ''
      });

      // Refresh the locations and my climbs
      const refreshRes = await fetch('/api/climbing/locations');
      const refreshData = await refreshRes.json();
      if (refreshData.success) {
        setLocations(refreshData.locations || []);
      }

      // Also refresh my purchases
      if (walletAddress) {
        const myRes = await fetch(`/api/climbing/my-purchases?holder=${walletAddress}`);
        const myData = await myRes.json();
        if (myData.success) {
          setMyAccessBadges(myData.accessBadges || []);
          setMyClimbProofs(myData.climbProofs || []);
        }
      }

    } catch (error: any) {
      console.error('[PurchaseClimb] Error:', error);
      setPurchaseError(error.message || 'Failed to purchase');
    } finally {
      setPurchasingLocationId(null);
    }
  };

  const filteredLocations = locations.filter(loc =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    loc.difficulty.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getIPFSUrl = (hash: string) => {
    if (!hash) return '';
    if (hash.startsWith('ipfs://')) {
      return `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${hash.replace('ipfs://', '')}`;
    }
    if (hash.startsWith('Qm') || hash.startsWith('bafy')) {
      return `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${hash}`;
    }
    return hash;
  };

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

  const handleCreateClimb = async () => {
    if (!walletAddress || !photoFile || !climbName || !manualLat || !manualLng) {
      setCreateError('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      // 1. Upload photo to IPFS
      const formData = new FormData();
      formData.append('file', photoFile);

      const uploadRes = await fetch('/api/upload-to-ipfs', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadData.success) {
        throw new Error('Failed to upload photo: ' + (uploadData.error || 'Unknown error'));
      }

      const photoHash = uploadData.ipfsHash;

      // 2. Check/create delegation
      const delegationRes = await fetch(`/api/delegation-status?address=${walletAddress}`);
      const delegationData = await delegationRes.json();

      const hasValidDelegation = delegationData.success &&
                                delegationData.delegation &&
                                Array.isArray(delegationData.delegation.permissions) &&
                                delegationData.delegation.permissions.includes('create_climb');

      if (!hasValidDelegation) {
        const createRes = await fetch('/api/create-delegation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: walletAddress,
            authMethod: 'farcaster',
            fid: userFid,
            durationHours: 24,
            maxTransactions: 100,
            permissions: ['create_climb', 'purchase_climb', 'mint_passport', 'wrap_mon']
          })
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error('Failed to create delegation: ' + createData.error);
        }
      }

      // 3. Execute create climb transaction
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: 'create_climb',
          params: {
            creatorFid: userFid || 0,
            creatorTelegramId: userTelegramId || 0,
            name: climbName,
            difficulty: selectedGrade,
            latitude: Math.round(parseFloat(manualLat) * 1e6),
            longitude: Math.round(parseFloat(manualLng) * 1e6),
            photoProofIPFS: `ipfs://${photoHash}`,
            description: description || climbName,
            priceWmon: (price * 1e18).toString(),
          }
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create climb');
      }

      setCreateSuccess({
        locationId: result.locationId || 'New',
        txHash: result.txHash || ''
      });

    } catch (error: any) {
      console.error('[CreateClimb] Error:', error);
      setCreateError(error.message || 'Failed to create climb');
    } finally {
      setIsCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateStep('photo');
    setPhotoPreview(null);
    setPhotoFile(null);
    setClimbName('');
    setDescription('');
    setSelectedGrade('V0');
    setPrice(5);
    setCreateError('');
    setCreateSuccess(null);
  };

  const steps: CreateStep[] = ['photo', 'details', 'location', 'price', 'confirm'];
  const currentStepIndex = steps.indexOf(createStep);

  const canProceed = () => {
    switch (createStep) {
      case 'photo': return !!photoPreview;
      case 'details': return climbName.length >= 2;
      case 'location': return !!manualLat && !!manualLng;
      case 'price': return price >= 1;
      case 'confirm': return true;
      default: return false;
    }
  };

  const nextStep = () => {
    const idx = steps.indexOf(createStep);
    if (idx < steps.length - 1) {
      setCreateStep(steps[idx + 1]);
    }
  };

  const prevStep = () => {
    const idx = steps.indexOf(createStep);
    if (idx > 0) {
      setCreateStep(steps[idx - 1]);
    }
  };

  if (!portalMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 10000, backgroundColor: isDarkMode ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)' }}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden flex flex-col ${
          isDarkMode ? 'bg-gray-900 border border-orange-500/30' : 'bg-white border border-gray-200 shadow-xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
              <Mountain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Rock Climbing</h2>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Discover & share climbing spots</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          {[
            { id: 'explore', label: 'Explore', icon: Search },
            { id: 'create', label: 'Create', icon: Plus },
            { id: 'my-climbs', label: 'My Climbs', icon: Mountain },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id === 'create') resetCreateForm();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? isDarkMode
                    ? 'text-orange-400 border-b-2 border-orange-400'
                    : 'text-orange-600 border-b-2 border-orange-600'
                  : isDarkMode
                    ? 'text-gray-500 hover:text-gray-300'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'explore' && (
            <div className="space-y-4">
              {/* Purchase Success Message */}
              {purchaseSuccess && (
                <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 text-sm font-medium">Purchase successful!</p>
                  {purchaseSuccess.txHash && (
                    <a
                      href={`https://monadscan.com/tx/${purchaseSuccess.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 text-xs underline flex items-center gap-1 mt-1"
                    >
                      View transaction <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Purchase Error Message */}
              {purchaseError && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{purchaseError}</p>
                </div>
              )}

              {/* Search */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <Search className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  type="text"
                  placeholder="Search by name or difficulty..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`flex-1 bg-transparent outline-none text-sm ${isDarkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
                />
              </div>

              {/* Locations Grid */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className={`w-8 h-8 animate-spin ${isDarkMode ? 'text-orange-400' : 'text-orange-500'}`} />
                </div>
              ) : filteredLocations.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredLocations.map((loc) => {
                    const isOwned = purchasedLocationIds.has(loc.locationId);
                    const isOwnLocation = walletAddress && loc.creator.toLowerCase() === walletAddress.toLowerCase();
                    const isPurchasing = purchasingLocationId === loc.locationId;

                    return (
                      <div
                        key={loc.id}
                        className={`rounded-xl overflow-hidden transition-all group ${
                          isDarkMode
                            ? 'bg-gray-800 border border-gray-700 hover:border-orange-500/50'
                            : 'bg-white border border-gray-200 hover:border-orange-500/50 shadow-sm'
                        }`}
                      >
                        <div className="aspect-video bg-gradient-to-br from-orange-500/20 to-red-500/20 relative overflow-hidden">
                          {loc.photoProofIPFS ? (
                            <img
                              src={getIPFSUrl(loc.photoProofIPFS)}
                              alt={loc.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Mountain className={`w-12 h-12 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                            </div>
                          )}
                          <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-bold">
                            {loc.difficulty}
                          </div>
                          {isOwned && (
                            <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-green-500 text-white text-xs font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Owned
                            </div>
                          )}
                          {isOwnLocation && (
                            <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-purple-500 text-white text-xs font-bold">
                              Your Location
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className={`font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{loc.name}</h3>
                          <p className={`text-xs truncate mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{loc.description}</p>
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-orange-500 font-bold text-sm">{loc.priceWmon} WMON</span>
                            {isOwned ? (
                              <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs rounded-lg font-medium">
                                Access Granted
                              </span>
                            ) : isOwnLocation ? (
                              <span className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-lg font-medium">
                                Creator
                              </span>
                            ) : (
                              <button
                                onClick={() => handlePurchase(loc)}
                                disabled={isPurchasing || !walletAddress}
                                className={`px-3 py-1 text-white text-xs rounded-lg font-medium transition-all flex items-center gap-1 ${
                                  isPurchasing || !walletAddress
                                    ? 'bg-gray-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'
                                }`}
                              >
                                {isPurchasing ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" /> Buying...
                                  </>
                                ) : (
                                  'Purchase'
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Mountain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No climbing locations found</p>
                  <p className="text-sm mt-1">Be the first to create one!</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'create' && (
            <div className="space-y-4">
              {/* Success State */}
              {createSuccess ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-10 h-10 text-green-400" />
                  </div>
                  <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Climb Created!</h3>
                  <p className={`mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Your climbing location is now live</p>
                  {createSuccess.txHash && (
                    <a
                      href={`https://monadscan.com/tx/${createSuccess.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 mb-4"
                    >
                      View Transaction <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => {
                      resetCreateForm();
                      setActiveTab('explore');
                    }}
                    className={`block w-full mt-4 px-4 py-3 rounded-xl font-medium ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Progress Steps */}
                  <div className="flex items-center justify-between mb-6">
                    {steps.map((step, idx) => (
                      <React.Fragment key={step}>
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all ${
                            idx < currentStepIndex
                              ? 'bg-green-500 text-white'
                              : idx === currentStepIndex
                                ? 'bg-orange-500 text-white'
                                : isDarkMode
                                  ? 'bg-gray-700 text-gray-400'
                                  : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {idx < currentStepIndex ? <Check className="w-4 h-4" /> : idx + 1}
                        </div>
                        {idx < steps.length - 1 && (
                          <div className={`flex-1 h-1 mx-2 rounded ${idx < currentStepIndex ? 'bg-green-500' : isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Error */}
                  {createError && (
                    <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg mb-4">
                      <p className="text-red-400 text-sm">{createError}</p>
                    </div>
                  )}

                  {/* Step 1: Photo */}
                  {createStep === 'photo' && (
                    <div className="space-y-4">
                      <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        📸 Add a Photo
                      </h3>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Take a photo of the rock or wall
                      </p>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />

                      {photoPreview ? (
                        <div className="relative">
                          <img src={photoPreview} alt="Preview" className="w-full aspect-video object-cover rounded-xl" />
                          <button
                            onClick={() => { setPhotoPreview(null); setPhotoFile(null); }}
                            className="absolute top-2 right-2 p-2 bg-black/60 rounded-full text-white hover:bg-black/80"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all ${
                            isDarkMode
                              ? 'border-gray-600 hover:border-orange-500 bg-gray-800/50'
                              : 'border-gray-300 hover:border-orange-500 bg-gray-50'
                          }`}
                        >
                          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
                            <Camera className="w-8 h-8 text-white" />
                          </div>
                          <span className={`font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Tap to add photo
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Step 2: Details */}
                  {createStep === 'details' && (
                    <div className="space-y-4">
                      <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        ✏️ Name & Difficulty
                      </h3>

                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Climb Name
                        </label>
                        <input
                          type="text"
                          value={climbName}
                          onChange={(e) => setClimbName(e.target.value)}
                          placeholder="e.g., Sunset Slab"
                          maxLength={50}
                          className={`w-full px-4 py-3 rounded-xl outline-none text-lg ${
                            isDarkMode
                              ? 'bg-gray-800 text-white border border-gray-700 focus:border-orange-500'
                              : 'bg-gray-100 text-gray-900 border border-gray-200 focus:border-orange-500'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Description (optional)
                        </label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Describe the climb..."
                          rows={2}
                          maxLength={200}
                          className={`w-full px-4 py-3 rounded-xl outline-none resize-none ${
                            isDarkMode
                              ? 'bg-gray-800 text-white border border-gray-700 focus:border-orange-500'
                              : 'bg-gray-100 text-gray-900 border border-gray-200 focus:border-orange-500'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Grade Type
                        </label>
                        <div className="flex gap-2">
                          {(['boulder', 'sport'] as const).map((type) => (
                            <button
                              key={type}
                              onClick={() => {
                                setGradeType(type);
                                setSelectedGrade(type === 'boulder' ? 'V0' : '5.9');
                              }}
                              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                                gradeType === type
                                  ? 'bg-orange-500 text-white'
                                  : isDarkMode
                                    ? 'bg-gray-800 text-gray-400'
                                    : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {type === 'boulder' ? 'Boulder (V)' : 'Sport (5.x)'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Difficulty: <span className="text-orange-500 font-bold">{selectedGrade}</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {(gradeType === 'boulder' ? BOULDER_GRADES : SPORT_GRADES).map((grade) => (
                            <button
                              key={grade}
                              onClick={() => setSelectedGrade(grade)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                selectedGrade === grade
                                  ? 'bg-orange-500 text-white'
                                  : isDarkMode
                                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {grade}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Location */}
                  {createStep === 'location' && (
                    <div className="space-y-4">
                      <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        📍 Location
                      </h3>

                      {geoLoading ? (
                        <div className={`flex items-center gap-2 p-3 rounded-lg ${isDarkMode ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                          <span className="text-blue-400 text-sm">Detecting your location...</span>
                        </div>
                      ) : geoLocation ? (
                        <div className={`flex items-center gap-2 p-3 rounded-lg ${isDarkMode ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-200'}`}>
                          <MapPin className="w-4 h-4 text-green-400" />
                          <span className="text-green-400 text-sm">
                            Location detected: {geoLocation.city || 'Unknown'}, {geoLocation.countryName || geoLocation.country}
                          </span>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Latitude
                          </label>
                          <input
                            type="text"
                            value={manualLat}
                            onChange={(e) => setManualLat(e.target.value)}
                            placeholder="e.g., 34.0522"
                            className={`w-full px-4 py-3 rounded-xl outline-none ${
                              isDarkMode
                                ? 'bg-gray-800 text-white border border-gray-700 focus:border-orange-500'
                                : 'bg-gray-100 text-gray-900 border border-gray-200 focus:border-orange-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Longitude
                          </label>
                          <input
                            type="text"
                            value={manualLng}
                            onChange={(e) => setManualLng(e.target.value)}
                            placeholder="e.g., -118.2437"
                            className={`w-full px-4 py-3 rounded-xl outline-none ${
                              isDarkMode
                                ? 'bg-gray-800 text-white border border-gray-700 focus:border-orange-500'
                                : 'bg-gray-100 text-gray-900 border border-gray-200 focus:border-orange-500'
                            }`}
                          />
                        </div>
                      </div>

                      {manualLat && manualLng && (
                        <a
                          href={`https://www.google.com/maps?q=${manualLat},${manualLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-center gap-2 p-3 rounded-lg ${isDarkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                          <MapPin className="w-4 h-4" />
                          Preview on Google Maps
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Step 4: Price */}
                  {createStep === 'price' && (
                    <div className="space-y-4">
                      <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        💰 Set Your Price
                      </h3>
                      <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        How much WMON should others pay to access this climb?
                      </p>

                      <div className="text-center py-6">
                        <div className={`text-5xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {price} <span className="text-orange-500 text-2xl">WMON</span>
                        </div>
                      </div>

                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={price}
                        onChange={(e) => setPrice(parseInt(e.target.value))}
                        className="w-full accent-orange-500"
                      />
                      <div className="flex justify-between text-sm">
                        <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>1 WMON</span>
                        <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>100 WMON</span>
                      </div>

                      <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-orange-50 border border-orange-200'}`}>
                        <p className="text-orange-500 text-sm">
                          <strong>Creation Cost:</strong> 35 WMON (one-time platform fee)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 5: Confirm */}
                  {createStep === 'confirm' && (
                    <div className="space-y-4">
                      <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        ✅ Review & Create
                      </h3>

                      {/* Preview Card */}
                      <div className={`rounded-xl overflow-hidden ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200 shadow'}`}>
                        {photoPreview && (
                          <img src={photoPreview} alt="Preview" className="w-full aspect-video object-cover" />
                        )}
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{climbName}</h4>
                            <span className="px-2 py-1 bg-orange-500 text-white text-xs rounded-full font-bold">{selectedGrade}</span>
                          </div>
                          {description && (
                            <p className={`text-sm mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
                          )}
                          <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <MapPin className="w-4 h-4" />
                            {manualLat}, {manualLng}
                          </div>
                          <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between items-center">
                            <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Access Price</span>
                            <span className="text-orange-500 font-bold text-lg">{price} WMON</span>
                          </div>
                        </div>
                      </div>

                      {!walletAddress && (
                        <div className="p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
                          <p className="text-yellow-400 text-sm">Connect your wallet to create a climb</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex gap-3 mt-6">
                    {currentStepIndex > 0 && (
                      <button
                        onClick={prevStep}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium ${
                          isDarkMode
                            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <ChevronLeft className="w-4 h-4" /> Back
                      </button>
                    )}

                    {createStep !== 'confirm' ? (
                      <button
                        onClick={nextStep}
                        disabled={!canProceed()}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                          canProceed()
                            ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600'
                            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Next <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleCreateClimb}
                        disabled={isCreating || !walletAddress}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                          !isCreating && walletAddress
                            ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600'
                            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" /> Create Climb (35 WMON)
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'my-climbs' && (
            <div className="space-y-4">
              {!walletAddress ? (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Mountain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Connect wallet to see your climbs</p>
                </div>
              ) : loadingMyClimbs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className={`w-8 h-8 animate-spin ${isDarkMode ? 'text-orange-400' : 'text-orange-500'}`} />
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-4 rounded-xl text-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{myAccessBadges.length}</p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Locations Purchased</p>
                    </div>
                    <div className={`p-4 rounded-xl text-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{myClimbProofs.length}</p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Climbs Logged</p>
                    </div>
                  </div>

                  {/* Purchased Locations */}
                  {myAccessBadges.length > 0 && (
                    <div>
                      <h3 className={`font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        My Purchased Locations
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {myAccessBadges.map((badge) => (
                          <div
                            key={badge.id}
                            className={`rounded-xl overflow-hidden ${
                              isDarkMode
                                ? 'bg-gray-800 border border-gray-700'
                                : 'bg-white border border-gray-200 shadow-sm'
                            }`}
                          >
                            {badge.location?.photoProofIPFS && (
                              <img
                                src={getIPFSUrl(badge.location.photoProofIPFS)}
                                alt={badge.location?.name || 'Location'}
                                className="w-full h-24 object-cover"
                              />
                            )}
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className={`font-semibold text-sm truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                  {badge.location?.name || 'Unknown Location'}
                                </h4>
                                <span className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full font-bold">
                                  {badge.location?.difficulty || '?'}
                                </span>
                              </div>
                              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                Badge #{badge.tokenId}
                              </p>
                              {badge.txHash && (
                                <a
                                  href={`https://monadscan.com/tx/${badge.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-orange-500 hover:underline flex items-center gap-1 mt-1"
                                >
                                  View TX <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Climb Proofs */}
                  {myClimbProofs.length > 0 && (
                    <div>
                      <h3 className={`font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        My Climb Proofs
                      </h3>
                      <div className="space-y-3">
                        {myClimbProofs.map((proof) => (
                          <div
                            key={proof.id}
                            className={`rounded-xl overflow-hidden flex ${
                              isDarkMode
                                ? 'bg-gray-800 border border-gray-700'
                                : 'bg-white border border-gray-200 shadow-sm'
                            }`}
                          >
                            {proof.photoIPFS && (
                              <img
                                src={getIPFSUrl(proof.photoIPFS)}
                                alt="Climb proof"
                                className="w-24 h-24 object-cover flex-shrink-0"
                              />
                            )}
                            <div className="p-3 flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                  {proof.locationName}
                                </h4>
                                <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full font-bold">
                                  +{proof.reward} TOURS
                                </span>
                              </div>
                              <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {proof.locationDifficulty} • Proof #{proof.tokenId}
                              </p>
                              {proof.entryText && (
                                <p className={`text-xs line-clamp-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                  {proof.entryText}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {myAccessBadges.length === 0 && myClimbProofs.length === 0 && (
                    <div className={`text-center py-8 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Mountain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No climbing activity yet</p>
                      <p className="text-sm mt-1">Purchase a location to get started!</p>
                      <button
                        onClick={() => setActiveTab('explore')}
                        className="mt-4 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-sm font-medium hover:from-orange-600 hover:to-red-600"
                      >
                        Explore Locations
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <p className={`text-xs text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Powered by ClimbingLocationsV1 on Monad
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
