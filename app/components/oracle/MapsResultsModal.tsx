'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Star, Clock, ExternalLink, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// Declare google maps types
declare global {
  interface Window {
    google?: any;
    initMapsWidget?: () => void;
  }
}

interface MapsSource {
  uri: string;
  title: string;
  placeId?: string;
}

interface PlaceDetails {
  name: string;
  rating?: number;
  userRatingsTotal?: number;
  vicinity?: string;
  types?: string[];
  openNow?: boolean;
  photoUrl?: string;
}

interface MapsResultsModalProps {
  sources: MapsSource[];
  widgetToken?: string;
  query: string;
  onClose: () => void;
  paymentTxHash?: string;
}

export const MapsResultsModal: React.FC<MapsResultsModalProps> = ({
  sources,
  widgetToken,
  query,
  onClose,
  paymentTxHash
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [placeDetails, setPlaceDetails] = useState<Record<string, PlaceDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Google Maps API key from environment variable
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Load Google Maps JavaScript API and render widget
  useEffect(() => {
    if (!widgetToken || !mapsApiKey) {
      if (!mapsApiKey) {
        console.log('[MapsWidget] No API key configured');
      }
      return;
    }

    // Check if already loaded
    if (window.google?.maps) {
      setMapsLoaded(true);
      return;
    }

    // Define callback
    window.initMapsWidget = () => {
      console.log('[MapsWidget] Google Maps loaded');
      setMapsLoaded(true);
    };

    // Check if script already exists
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Script exists, wait for it to load
      const checkInterval = setInterval(() => {
        if (window.google?.maps) {
          setMapsLoaded(true);
          clearInterval(checkInterval);
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 5000);
      return;
    }

    // Load script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places&callback=initMapsWidget`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.error('[MapsWidget] Failed to load Google Maps');
      setWidgetError('Failed to load Google Maps');
    };
    document.head.appendChild(script);

    return () => {
      window.initMapsWidget = undefined;
    };
  }, [widgetToken, mapsApiKey]);

  // Render widget when maps is loaded
  useEffect(() => {
    if (!mapsLoaded || !widgetToken || !widgetRef.current) return;

    const renderWidget = async () => {
      try {
        console.log('[MapsWidget] Attempting to render with token:', widgetToken.substring(0, 30) + '...');

        // Clear previous content
        if (widgetRef.current) {
          widgetRef.current.innerHTML = '';
        }

        // Try to use the Places contextual widget if available
        // Note: The exact API depends on Google's implementation
        if (window.google?.maps?.places?.PlaceContextualWidget) {
          const widget = new window.google.maps.places.PlaceContextualWidget({
            contextToken: widgetToken,
          });
          widget.setContainer(widgetRef.current);
          console.log('[MapsWidget] Widget rendered');
        } else {
          // Fallback message - widget API may not be available
          console.log('[MapsWidget] Contextual widget API not available');
          setWidgetError('Interactive widget not available');
        }
      } catch (error: any) {
        console.error('[MapsWidget] Render error:', error);
        setWidgetError(error.message || 'Widget render failed');
      }
    };

    renderWidget();
  }, [mapsLoaded, widgetToken]);

  // Fetch additional place details for each source
  useEffect(() => {
    if (!sources.length) return;

    setLoadingDetails(true);
    const details: Record<string, PlaceDetails> = {};

    for (const source of sources) {
      if (source.placeId) {
        details[source.placeId] = {
          name: source.title,
        };
      }
    }

    setPlaceDetails(details);
    setLoadingDetails(false);
  }, [sources]);

  const handleNavigateToPlace = (uri: string) => {
    window.open(uri, '_blank', 'noopener,noreferrer');
  };

  const handleGetDirections = (source: MapsSource) => {
    // Open Google Maps directions in a new tab
    const directionsUrl = source.placeId
      ? `https://www.google.com/maps/dir/?api=1&destination_place_id=${source.placeId}`
      : source.uri.replace('/maps/place/', '/maps/dir/?api=1&destination=');
    window.open(directionsUrl, '_blank', 'noopener,noreferrer');
  };

  const selectedSource = sources[selectedIndex];

  // Extract type tags from title (e.g., "Restaurant", "Cafe")
  const getPlaceType = (title: string): string => {
    const types = ['Restaurant', 'Cafe', 'Bar', 'Hotel', 'Museum', 'Park', 'Shop', 'Store', 'Beach', 'Club'];
    for (const type of types) {
      if (title.toLowerCase().includes(type.toLowerCase())) {
        return type;
      }
    }
    return 'Place';
  };

  return (
    <div className="fixed inset-0 bg-black modal-backdrop flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 10000 }} onClick={onClose}>
      <div
        className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-cyan-500/30 rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl shadow-cyan-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500/20 to-purple-600/20 border-b border-cyan-500/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-full flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Places Found</h2>
                <p className="text-xs text-gray-400 truncate max-w-[300px]">"{query}"</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    viewMode === 'list' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    viewMode === 'map' ? 'bg-cyan-500 text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Map
                </button>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row h-[calc(85vh-80px)]">
          {/* Places List */}
          <div className={`${viewMode === 'map' ? 'hidden md:block' : ''} md:w-1/2 overflow-y-auto p-4 border-r border-cyan-500/20`}>
            <div className="space-y-3">
              {sources.map((source, index) => {
                const isSelected = index === selectedIndex;
                const placeType = getPlaceType(source.title);

                return (
                  <div
                    key={index}
                    onClick={() => setSelectedIndex(index)}
                    className={`p-4 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-cyan-500/20 to-purple-600/20 border-2 border-cyan-500/50'
                        : 'bg-gray-800 border border-gray-700/50 hover:border-cyan-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Number Badge */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-cyan-500 text-black' : 'bg-gray-700 text-gray-300'
                      }`}>
                        <span className="text-sm font-bold">{index + 1}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold truncate">{source.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">
                            {placeType}
                          </span>
                          {source.placeId && (
                            <span className="text-xs text-gray-500">
                              ID: {source.placeId.substring(0, 12)}...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons (shown on selected) */}
                    {isSelected && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700/50">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNavigateToPlace(source.uri);
                          }}
                          className="flex-1 py-2 px-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View on Maps
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGetDirections(source);
                          }}
                          className="flex-1 py-2 px-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Navigation className="w-3 h-3" />
                          Get Directions
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Results Count & Google Maps Attribution */}
            <div className="mt-4 pt-4 border-t border-gray-700/50">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{sources.length} places found</span>
                {/* Google Maps Text Attribution - Following Google Guidelines */}
                <span
                  translate="no"
                  className="flex items-center gap-1.5"
                  style={{ fontFamily: 'Roboto, Arial, sans-serif' }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 92.3 132.3"
                    className="flex-shrink-0"
                  >
                    <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z"/>
                    <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z"/>
                    <path fill="#4285f4" d="M46.2 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.6-6.3"/>
                    <path fill="#fbbc04" d="M46.2 63.8c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.6-8.3 4.2-11.4L4.6 68.1C11.5 81.9 24.5 98 36.6 114.2 43.3 101 51.3 88 59.6 74.9c-3.3 3.8-8.1 6.3-13.4 6.3"/>
                    <path fill="#34a853" d="M59.6 74.9c11.4-16.2 24.6-32.2 32.7-46.6 0 0-12.8 15.3-27.5 32.7 8.5 11.4 18.4 24 24.8 38.5 5.1-12.3 2.7-26.1 2.7-26.1-5.5 10.6-19.4 31.4-37.6 58.9 0 0 12.3-21.2 19.4-35.1-6.4-10.8-13.5-21.1-14.5-22.3"/>
                  </svg>
                  <span
                    style={{
                      fontSize: '11px',
                      letterSpacing: '0.2px',
                      color: '#9aa0a6'
                    }}
                  >
                    Google Maps
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Map View / Selected Place Details */}
          <div className={`${viewMode === 'list' ? 'hidden md:block' : ''} flex-1 p-4 flex flex-col`}>
            {/* Map Placeholder */}
            <div className="flex-1 bg-gray-900/50 rounded-xl border border-cyan-500/20 overflow-hidden relative">
              {widgetToken ? (
                <div className="w-full h-full flex flex-col">
                  {/* Google Maps Widget Container */}
                  <div ref={widgetRef} className="flex-1 min-h-[200px]" />

                  {/* Loading/Error/Fallback States */}
                  {!mapsLoaded && !widgetError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                      <div className="text-center p-6">
                        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Loading Google Maps...</p>
                      </div>
                    </div>
                  )}

                  {(widgetError || (mapsLoaded && !mapsApiKey)) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center p-6">
                        <div className="text-6xl mb-4">🗺️</div>
                        <h3 className="text-white font-semibold mb-2">{selectedSource?.title || 'Places Found'}</h3>
                        <p className="text-gray-400 text-sm mb-4">
                          {widgetError || 'Map widget unavailable'}
                        </p>
                        <a
                          href={selectedSource?.uri || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open in Google Maps
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center p-6">
                    <div className="text-6xl mb-4">📍</div>
                    <h3 className="text-white font-semibold mb-2">{selectedSource?.title || 'Select a Place'}</h3>
                    {selectedSource && (
                      <>
                        <p className="text-gray-400 text-sm mb-4">
                          Click to view location details on Google Maps
                        </p>
                        <div className="flex flex-col gap-2">
                          <a
                            href={selectedSource.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-lg transition-colors"
                          >
                            <MapPin className="w-4 h-4" />
                            View on Google Maps
                          </a>
                          <button
                            onClick={() => handleGetDirections(selectedSource)}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors"
                          >
                            <Navigation className="w-4 h-4" />
                            Get Directions
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation Arrows for Mobile */}
              {viewMode === 'map' && sources.length > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4 md:hidden">
                  <button
                    onClick={() => setSelectedIndex(prev => (prev > 0 ? prev - 1 : sources.length - 1))}
                    className="w-10 h-10 bg-gray-800 hover:bg-gray-800 rounded-full flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="bg-gray-800 px-3 py-1 rounded-full">
                    <span className="text-white text-sm font-semibold">{selectedIndex + 1} / {sources.length}</span>
                  </div>
                  <button
                    onClick={() => setSelectedIndex(prev => (prev < sources.length - 1 ? prev + 1 : 0))}
                    className="w-10 h-10 bg-gray-800 hover:bg-gray-800 rounded-full flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Selected Place Card */}
            {selectedSource && (
              <div className="mt-4 bg-gray-800 border border-cyan-500/20 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-bold text-lg">{selectedSource.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">
                        {getPlaceType(selectedSource.title)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-cyan-400">#{selectedIndex + 1}</div>
                    <div className="text-xs text-gray-500">of {sources.length}</div>
                  </div>
                </div>

                {selectedSource.placeId && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <div className="text-xs text-gray-500">
                      Place ID: <span className="text-gray-400">{selectedSource.placeId}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {paymentTxHash && (
          <div className="border-t border-cyan-500/20 p-3 bg-green-500/10">
            <div className="flex items-center justify-between text-xs">
              <span className="text-green-400 font-semibold">✅ Payment confirmed</span>
              <a
                href={`https://testnet.monadscan.com/tx/${paymentTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-cyan-400 transition-colors flex items-center gap-1"
              >
                View transaction
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
