'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Home, MapPin, Upload, Check, Loader2, FileText, User, Globe, ChevronRight, Grid3X3 } from 'lucide-react';
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';

interface Land {
  landId: number;
  ownerFid: number;
  ownerAddress: string;
  name: string;
  description: string;
  country: string;
  region: string;
  totalArea: number;
  plotSize: number;
  totalPlots: number;
  availablePlots: number[];
  pricePerPlotPerDay: string;
  imageUrl?: string;
  verified: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface LandFormData {
  name: string;
  description: string;
  country: string;
  region: string;
  streetAddress: string;
  latitude: string;
  longitude: string;
  totalArea: string;
  plotSize: string;
  pricePerDay: string;
  deedDocument: File | null;
  governmentId: File | null;
  utilityBill: File | null;
  photos: File[];
}

interface LandsModalProps {
  onClose: () => void;
}

export function LandsModal({ onClose }: LandsModalProps) {
  const { user, walletAddress } = useFarcasterContext();
  const [mounted, setMounted] = useState(false);
  const [lands, setLands] = useState<Land[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'register' | 'detail'>('list');
  const [selectedLand, setSelectedLand] = useState<Land | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<LandFormData>({
    name: '',
    description: '',
    country: '',
    region: '',
    streetAddress: '',
    latitude: '',
    longitude: '',
    totalArea: '',
    plotSize: '100',
    pricePerDay: '1',
    deedDocument: null,
    governmentId: null,
    utilityBill: null,
    photos: [],
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch available lands
  useEffect(() => {
    const fetchLands = async () => {
      try {
        const res = await fetch('/api/lands/list');
        const data = await res.json();
        if (data.success && data.lands) {
          setLands(data.lands);
        } else {
          setLands([]);
        }
      } catch (err) {
        console.error('Failed to fetch lands:', err);
        setLands([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLands();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (field: 'deedDocument' | 'governmentId' | 'utilityBill') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({ ...prev, [field]: e.target.files![0] }));
    }
  };

  const handlePhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).slice(0, 5);
      setFormData(prev => ({ ...prev, photos: files }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!formData.name || !formData.country || !formData.totalArea) {
        throw new Error('Please fill all required fields');
      }

      if (!formData.deedDocument || !formData.governmentId) {
        throw new Error('Deed document and Government ID are required');
      }

      if (!user?.fid) {
        throw new Error('Please sign in with Farcaster');
      }

      // Upload documents to IPFS
      const uploadFormData = new FormData();
      uploadFormData.append('deedDocument', formData.deedDocument);
      uploadFormData.append('governmentId', formData.governmentId);
      if (formData.utilityBill) {
        uploadFormData.append('utilityBill', formData.utilityBill);
      }
      formData.photos.forEach((photo, i) => {
        uploadFormData.append(`photo${i}`, photo);
      });

      // For now, show success - contract deployment pending
      setSuccess('Land registration submitted! Our team will contact you for a verification video call.');
      setView('list');

    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeasePlot = async (land: Land, plotIndex: number) => {
    if (!user?.fid || !walletAddress) {
      setError('Please connect your wallet');
      return;
    }

    try {
      setSubmitting(true);
      // This will call the smart contract once deployed
      setSuccess(`Plot #${plotIndex + 1} lease request submitted!`);
    } catch (err: any) {
      setError(err.message || 'Lease failed');
    } finally {
      setSubmitting(false);
    }
  };

  const renderInPortal = (content: React.ReactNode) => {
    if (!mounted) return null;
    return createPortal(content, document.body);
  };

  // Calculate plot count
  const plotCount = formData.totalArea && formData.plotSize
    ? Math.floor(Number(formData.totalArea) / Number(formData.plotSize))
    : 0;

  // Main content
  const content = (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-b border-amber-500/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <Home className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">ResonanceLands</h1>
            <p className="text-xs text-amber-400">Tokenized Land Leasing</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Messages */}
      {success && (
        <div className="mx-4 mt-4 p-3 bg-green-500/20 border border-green-500/50 rounded-xl flex items-center gap-2">
          <Check className="w-5 h-5 text-green-400" />
          <p className="text-green-300 text-sm">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-2">
          <X className="w-5 h-5 text-red-400" />
          <p className="text-red-300 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === 'list' && (
          <>
            {/* Register CTA */}
            <div className="mb-6 p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl border border-amber-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white">Own Land?</h2>
                  <p className="text-xs text-gray-400">Register and earn from tourists</p>
                </div>
                <button
                  onClick={() => setView('register')}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-bold text-sm hover:from-amber-400 hover:to-orange-400 transition-all flex items-center gap-1"
                >
                  <Upload className="w-4 h-4" />
                  Register
                </button>
              </div>
            </div>

            {/* Lands Grid */}
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-amber-400" />
              Available Lands
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              </div>
            ) : lands.length === 0 ? (
              <div className="text-center py-12 bg-gray-800/30 rounded-2xl border border-gray-700">
                <Home className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">No Lands Yet</h3>
                <p className="text-gray-400 text-sm mb-4">Be the first to register!</p>
                <button
                  onClick={() => setView('register')}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-bold text-sm"
                >
                  Register Your Land
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {lands.map((land) => (
                  <div
                    key={land.landId}
                    className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-bold text-white">{land.name}</h3>
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {land.region}, {land.country}
                          </p>
                        </div>
                        {land.verified && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-[10px] font-bold">
                            Verified
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-300 mb-3">
                        <span>{land.totalArea.toLocaleString()} m²</span>
                        <span className="text-amber-400">{land.availablePlots.length}/{land.totalPlots} available</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-gray-500">per plot/day</p>
                          <p className="text-lg font-bold text-amber-400">{land.pricePerPlotPerDay} WMON</p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedLand(land);
                            setView('detail');
                          }}
                          className="px-3 py-2 bg-amber-500 text-white rounded-lg font-medium text-sm hover:bg-amber-400 transition-colors flex items-center gap-1"
                        >
                          View Plots <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'register' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                Register Land
              </h2>
              <button
                type="button"
                onClick={() => setView('list')}
                className="text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>

            {/* Basic Info */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Property Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Villa Guerrero Farmland"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Country *</label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                  placeholder="Mexico"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Region</label>
                <input
                  type="text"
                  name="region"
                  value={formData.region}
                  onChange={handleInputChange}
                  placeholder="Estado de Mexico"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Area & Pricing */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Area (m²) *</label>
                <input
                  type="number"
                  name="totalArea"
                  value={formData.totalArea}
                  onChange={handleInputChange}
                  placeholder="400"
                  min="10"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Plot Size</label>
                <input
                  type="number"
                  name="plotSize"
                  value={formData.plotSize}
                  onChange={handleInputChange}
                  placeholder="100"
                  min="5"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">WMON/day</label>
                <input
                  type="number"
                  name="pricePerDay"
                  value={formData.pricePerDay}
                  onChange={handleInputChange}
                  placeholder="1"
                  min="0.1"
                  step="0.1"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {plotCount > 0 && (
              <p className="text-xs text-amber-400">= {plotCount} plots available for lease</p>
            )}

            {/* Description */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Describe your land..."
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-amber-500 focus:outline-none resize-none"
              />
            </div>

            {/* Document Uploads */}
            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                Ownership Proof
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <label className="p-3 bg-gray-900 rounded-lg border-2 border-dashed border-gray-700 hover:border-amber-500/50 transition-colors cursor-pointer">
                  <div className="text-center">
                    {formData.deedDocument ? (
                      <div className="text-green-400">
                        <Check className="w-6 h-6 mx-auto mb-1" />
                        <p className="text-[10px]">{formData.deedDocument.name.slice(0, 15)}...</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-gray-500 mx-auto mb-1" />
                        <p className="text-xs font-medium text-white">Deed *</p>
                      </>
                    )}
                  </div>
                  <input type="file" accept=".pdf,image/*" onChange={handleFileChange('deedDocument')} className="hidden" />
                </label>

                <label className="p-3 bg-gray-900 rounded-lg border-2 border-dashed border-gray-700 hover:border-amber-500/50 transition-colors cursor-pointer">
                  <div className="text-center">
                    {formData.governmentId ? (
                      <div className="text-green-400">
                        <Check className="w-6 h-6 mx-auto mb-1" />
                        <p className="text-[10px]">{formData.governmentId.name.slice(0, 15)}...</p>
                      </div>
                    ) : (
                      <>
                        <User className="w-6 h-6 text-gray-500 mx-auto mb-1" />
                        <p className="text-xs font-medium text-white">ID *</p>
                      </>
                    )}
                  </div>
                  <input type="file" accept=".pdf,image/*" onChange={handleFileChange('governmentId')} className="hidden" />
                </label>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Submit for Review
                </>
              )}
            </button>

            <p className="text-[10px] text-gray-500 text-center">
              Our team will schedule a video call to verify ownership
            </p>
          </form>
        )}

        {view === 'detail' && selectedLand && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  setSelectedLand(null);
                  setView('list');
                }}
                className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                Back
              </button>
              {selectedLand.verified && (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs font-bold">
                  Verified Owner
                </span>
              )}
            </div>

            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">{selectedLand.name}</h2>
              <p className="text-sm text-gray-400 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {selectedLand.region}, {selectedLand.country}
              </p>
              <p className="text-xs text-gray-500 mt-1">{selectedLand.description}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-white">{selectedLand.totalArea}</p>
                <p className="text-[10px] text-gray-400">m² total</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-amber-400">{selectedLand.availablePlots.length}</p>
                <p className="text-[10px] text-gray-400">available</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-white">{selectedLand.pricePerPlotPerDay}</p>
                <p className="text-[10px] text-gray-400">WMON/day</p>
              </div>
            </div>

            {/* Plot Grid */}
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-amber-400" />
              Select a Plot ({selectedLand.plotSize}m² each)
            </h3>

            <div className="grid grid-cols-5 gap-2 mb-4">
              {Array.from({ length: selectedLand.totalPlots }).map((_, i) => {
                const isAvailable = selectedLand.availablePlots.includes(i);
                return (
                  <button
                    key={i}
                    onClick={() => isAvailable && handleLeasePlot(selectedLand, i)}
                    disabled={!isAvailable || submitting}
                    className={`aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                      isAvailable
                        ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/40 hover:scale-105'
                        : 'bg-gray-700/50 border border-gray-600 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-amber-500/20 border border-amber-500/50 rounded"></div>
                Available
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-700/50 border border-gray-600 rounded"></div>
                Leased
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer - How it works */}
      {view === 'list' && (
        <div className="p-4 bg-gray-900/50 border-t border-gray-700">
          <div className="flex items-center justify-around text-center">
            <div>
              <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-1 text-sm">1</div>
              <p className="text-[10px] text-gray-400">Register</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600" />
            <div>
              <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-1 text-sm">2</div>
              <p className="text-[10px] text-gray-400">Verify</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600" />
            <div>
              <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-1 text-sm">3</div>
              <p className="text-[10px] text-gray-400">Earn 90%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return renderInPortal(content);
}
