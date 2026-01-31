'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Navigation, MapPin, Star, Clock, Phone, Globe } from 'lucide-react';

/**
 * PlaceDetailsCard - Uses Google Maps Places UI Kit (gmp-place-details-compact)
 * for rendering rich place information cards with photos, ratings, hours, and actions.
 *
 * Falls back to a manual card if the Extended Component Library isn't available.
 *
 * @see https://developers.google.com/maps/documentation/places/web-service/place-details-compact
 */

interface PlaceDetailsCardProps {
  placeId: string;
  title: string;
  onGetDirections?: () => void;
  onViewOnMaps?: () => void;
  compact?: boolean;
}

// Track whether the Extended Component Library import map has been added
let extLibInjected = false;

function injectExtendedComponentLibrary() {
  if (extLibInjected) return;
  // The Places UI Kit requires an importmap for the Extended Component Library
  const existing = document.querySelector('script[type="importmap"]');
  if (!existing) {
    const importMap = document.createElement('script');
    importMap.type = 'importmap';
    importMap.textContent = JSON.stringify({
      imports: {
        '@googlemaps/extended-component-library/': 'https://unpkg.com/@googlemaps/extended-component-library@0.6/'
      }
    });
    document.head.appendChild(importMap);
  }
  extLibInjected = true;
}

export const PlaceDetailsCard: React.FC<PlaceDetailsCardProps> = ({
  placeId,
  title,
  onGetDirections,
  onViewOnMaps,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [uiKitAvailable, setUiKitAvailable] = useState(false);
  const [fallbackDetails, setFallbackDetails] = useState<{
    name: string;
    rating?: number;
    totalRatings?: number;
    address?: string;
    phone?: string;
    website?: string;
    openNow?: boolean;
    photoUrl?: string;
    types?: string[];
  } | null>(null);

  // Try to use Places UI Kit web component
  useEffect(() => {
    if (!placeId || !containerRef.current) return;

    // Check if google maps and the extended component library are available
    const checkAvailability = () => {
      if (typeof customElements !== 'undefined' && customElements.get('gmp-place-details-compact')) {
        setUiKitAvailable(true);
        return true;
      }
      return false;
    };

    if (checkAvailability()) return;

    // Try to load the extended component library
    injectExtendedComponentLibrary();

    // Try loading the module
    const loadModule = async () => {
      try {
        // @ts-expect-error - dynamic import from CDN URL
        await import(/* webpackIgnore: true */ 'https://unpkg.com/@googlemaps/extended-component-library@0.6/place_building_blocks/place_details_compact.js');
        if (checkAvailability()) return;
      } catch {
        // UI Kit not available, use fallback
        console.log('[PlaceDetailsCard] Extended Component Library not available, using fallback');
      }

      // Fallback: Use server-side proxy to get details (no client-side API key exposure)
      try {
        const res = await fetch('/api/maps/place-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placeIds: [placeId] }),
        });

        if (res.ok) {
          const data = await res.json();
          const place = data.places?.[placeId];
          if (place) {
            setFallbackDetails({
              name: place.name || title,
              rating: place.rating,
              totalRatings: place.userRatingsTotal,
              address: place.address,
              types: place.types?.slice(0, 3),
              openNow: place.openNow,
              photoUrl: place.photoUrl,
            });
          }
        }
      } catch (err) {
        console.error('[PlaceDetailsCard] Server fallback failed:', err);
      }
    };

    loadModule();
  }, [placeId, title]);

  // Render the UI Kit web component if available
  if (uiKitAvailable && placeId) {
    return (
      <div className="rounded-xl overflow-hidden border border-cyan-500/20 bg-gray-800">
        <div ref={containerRef}>
          {/* @ts-ignore - gmp-place-details-compact is a web component */}
          <gmp-place-details-compact
            place={placeId}
            style={{ width: '100%' }}
          />
        </div>
        {(onGetDirections || onViewOnMaps) && (
          <div className="flex gap-2 p-3 border-t border-gray-700/50">
            {onViewOnMaps && (
              <button
                onClick={onViewOnMaps}
                className="flex-1 py-2 px-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                View on Maps
              </button>
            )}
            {onGetDirections && (
              <button
                onClick={onGetDirections}
                className="flex-1 py-2 px-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <Navigation className="w-3 h-3" />
                Directions
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Fallback: Manual rich place card
  if (!fallbackDetails) {
    return (
      <div className="rounded-xl border border-cyan-500/20 bg-gray-800 p-4 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-3/4 mb-2" />
        <div className="h-3 bg-gray-700 rounded w-1/2" />
      </div>
    );
  }

  const { name, rating, totalRatings, address, phone, website, openNow, photoUrl, types } = fallbackDetails;

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-gray-800 overflow-hidden">
      {/* Photo */}
      {photoUrl && !compact && (
        <div className="relative h-36 overflow-hidden">
          <img
            src={photoUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent" />
          {openNow !== undefined && (
            <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
              openNow ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'
            }`}>
              {openNow ? 'Open' : 'Closed'}
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Name and rating */}
        <h3 className="text-white font-bold text-base truncate">{name}</h3>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {rating && (
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              <span className="text-yellow-400 text-sm font-semibold">{rating}</span>
              {totalRatings && (
                <span className="text-gray-500 text-xs">({totalRatings})</span>
              )}
            </div>
          )}
          {types?.map((type) => (
            <span key={type} className="text-xs px-2 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full capitalize">
              {type.replace(/_/g, ' ')}
            </span>
          ))}
          {compact && openNow !== undefined && (
            <span className={`text-xs ${openNow ? 'text-green-400' : 'text-red-400'}`}>
              {openNow ? '● Open' : '● Closed'}
            </span>
          )}
        </div>

        {/* Address */}
        {address && (
          <div className="flex items-start gap-1.5 mt-2">
            <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
            <p className="text-gray-400 text-xs line-clamp-2">{address}</p>
          </div>
        )}

        {/* Contact info */}
        {!compact && (phone || website) && (
          <div className="flex items-center gap-3 mt-2">
            {phone && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Phone className="w-3 h-3" />
                {phone}
              </div>
            )}
            {website && (
              <div className="flex items-center gap-1 text-xs text-cyan-500">
                <Globe className="w-3 h-3" />
                <a href={website} target="_blank" rel="noopener noreferrer" className="truncate max-w-[150px] hover:underline">
                  Website
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {(onGetDirections || onViewOnMaps) && (
        <div className="flex gap-2 px-4 pb-4">
          {onViewOnMaps && (
            <button
              onClick={onViewOnMaps}
              className="flex-1 py-2 px-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              View on Maps
            </button>
          )}
          {onGetDirections && (
            <button
              onClick={onGetDirections}
              className="flex-1 py-2 px-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              <Navigation className="w-3 h-3" />
              Directions
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PlaceDetailsCard;
