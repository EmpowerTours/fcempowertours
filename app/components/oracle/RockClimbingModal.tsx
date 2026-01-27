'use client';

import React, { useState, useEffect } from 'react';
import { X, Mountain, MapPin, Camera, Plus, Loader2, ExternalLink, Search } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ClimbLocation {
  id: string;
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

interface RockClimbingModalProps {
  onClose: () => void;
  isDarkMode: boolean;
  walletAddress?: string;
  userFid?: number;
}

export function RockClimbingModal({ onClose, isDarkMode, walletAddress, userFid }: RockClimbingModalProps) {
  const [activeTab, setActiveTab] = useState<'explore' | 'create' | 'my-climbs'>('explore');
  const [locations, setLocations] = useState<ClimbLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

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

  const filteredLocations = locations.filter(loc =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    loc.difficulty.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getIPFSUrl = (hash: string) => {
    if (hash.startsWith('ipfs://')) {
      return `https://harlequin-used-hare-224.mypinata.cloud/ipfs/${hash.replace('ipfs://', '')}`;
    }
    return hash;
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
            { id: 'create', label: 'Create Climb', icon: Plus },
            { id: 'my-climbs', label: 'My Climbs', icon: Mountain },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
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
                  {filteredLocations.map((loc) => (
                    <div
                      key={loc.id}
                      className={`rounded-xl overflow-hidden transition-all cursor-pointer group ${
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
                      </div>
                      <div className="p-3">
                        <h3 className={`font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{loc.name}</h3>
                        <p className={`text-xs truncate mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{loc.description}</p>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-orange-500 font-bold text-sm">{loc.priceWmon} WMON</span>
                          <button className="px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs rounded-lg font-medium hover:from-orange-600 hover:to-red-600 transition-all">
                            Purchase
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
              <div className={`rounded-xl p-4 ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Create a Climbing Location</h3>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Share your favorite climbing spots with the community. Costs 35 WMON to create.
                </p>
              </div>

              <div className={`text-center py-8 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Coming soon to the mini app!</p>
                <p className="text-xs mt-1">Use the Telegram bot /buildaclimb for now</p>
              </div>
            </div>
          )}

          {activeTab === 'my-climbs' && (
            <div className="space-y-4">
              {!walletAddress ? (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Mountain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Connect wallet to see your climbs</p>
                </div>
              ) : (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Mountain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Your purchased climbs will appear here</p>
                </div>
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
