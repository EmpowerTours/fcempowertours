'use client';

import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { MapPin, Navigation, ExternalLink, X, ChevronLeft, ChevronRight, Loader2, ArrowLeft, Clock, Route, CheckCircle2, AlertTriangle, Star, Users, PlusCircle, Minus, Maximize2 } from 'lucide-react';
import { getCurrentPosition, isWithinProximity, formatDistance } from '@/lib/utils/gps';

const LeafletMapRenderer = lazy(() => import('./map-renderers/LeafletMapRenderer'));
import { useFarcasterContext } from '@/app/hooks/useFarcasterContext';
import { PlaceDetailsCard } from './PlaceDetailsCard';
import type { MapProviderType, MapClientConfig } from '@/lib/maps/provider';

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
  address?: string;
  types?: string[];
  openNow?: boolean;
  photoUrl?: string;
  location?: { lat: number; lng: number };
}

interface ProtocolExperience {
  id: string;
  itineraryId: string;
  title: string;
  description: string;
  creator: string;
  creatorFid?: string;
  creatorUsername?: string;
  creatorDisplayName?: string;
  creatorPfpUrl?: string;
  photoUrl?: string;
  priceWMON: string;
  averageRating: number;
  ratingCount: number;
  totalPurchases: number;
  createdAt?: string;
}

interface MapsResultsModalProps {
  sources: MapsSource[];
  widgetToken?: string;
  query: string;
  onClose: () => void;
  paymentTxHash?: string;
  userLocation?: { latitude: number; longitude: number; city?: string; country?: string };
  mapsProvider?: MapProviderType;
  clientConfig?: MapClientConfig;
  protocolExperiences?: ProtocolExperience[];
  minimized?: boolean;
  setMinimized?: (minimized: boolean) => void;
  onCreateExperience?: (placeData: {
    name: string; placeId: string; googleMapsUri: string;
    latitude: number; longitude: number;
    address?: string; rating?: number; types?: string[];
  }) => void;
  onCreateCustomExperience?: () => void;
  onPurchaseExperience?: (experienceId: string) => void;
}

// Format timestamp to relative time (e.g. "2 days ago", "3 months ago")
function formatTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return '';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  } catch {
    return '';
  }
}

export const MapsResultsModal: React.FC<MapsResultsModalProps> = ({
  sources,
  widgetToken,
  query,
  onClose,
  paymentTxHash,
  userLocation,
  mapsProvider,
  clientConfig,
  protocolExperiences,
  minimized = false,
  setMinimized,
  onCreateExperience,
  onCreateCustomExperience,
  onPurchaseExperience,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [placeDetails, setPlaceDetails] = useState<Record<string, PlaceDetails>>({});
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Directions state
  const [directionsMode, setDirectionsMode] = useState(false);
  const [directionsResult, setDirectionsResult] = useState<any>(null);
  const [directionsSteps, setDirectionsSteps] = useState<Array<{ instruction: string; distance: string; duration: string }>>([]);
  const [directionsSummary, setDirectionsSummary] = useState<{ distance: string; duration: string } | null>(null);
  const [loadingDirections, setLoadingDirections] = useState(false);
  const [directionsError, setDirectionsError] = useState<string | null>(null);

  // OSM directions polyline (for LeafletMapRenderer)
  const [osmDirectionsPolyline, setOsmDirectionsPolyline] = useState<Array<{ lat: number; lng: number }>>([]);
  const isOSM = mapsProvider === 'osm';

  // Proximity check state for "I'm Here" button
  const [proximityChecking, setProximityChecking] = useState(false);
  const [proximityResult, setProximityResult] = useState<{ tooFar: boolean; distance: string } | null>(null);
  const [proximityError, setProximityError] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);

  // Get Farcaster SDK for opening external URLs
  const { sdk } = useFarcasterContext();

  // Maps JS API key is only used for rendering the map (no Places calls)
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Helper to open URL in external browser (works in Farcaster mini app)
  const openExternalUrl = useCallback((url: string) => {
    try {
      // Try Farcaster SDK method first (opens in external browser)
      if (sdk?.actions?.openUrl) {
        console.log('[MapsWidget] Opening URL via Farcaster SDK:', url);
        sdk.actions.openUrl({ url });
        return;
      }
      // Fallback for non-Farcaster environment
      console.log('[MapsWidget] Opening URL via window.open:', url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[MapsWidget] Failed to open URL:', err);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [sdk]);

  // Handle "I'm Here" button — check GPS proximity before creating experience
  const handleCreateExperienceCheck = useCallback(async (source: MapsSource) => {
    if (!onCreateExperience) return;

    // Strip "places/" prefix from placeId for cache lookup (Grounding API uses "places/ChIJ..." format)
    const rawPlaceId = source.placeId || '';
    const cleanPlaceId = rawPlaceId.replace(/^places\//, '');
    const details = placeDetails[rawPlaceId] || placeDetails[cleanPlaceId] || null;

    if (!details?.location) {
      setProximityError('Location coordinates not available for this place. Try selecting a different result.');
      return;
    }

    setProximityChecking(true);
    setProximityResult(null);
    setProximityError(null);

    try {
      // Use already-available location from Oracle page hook first, fall back to GPS API
      let userPos: { lat: number; lon: number };
      if (userLocation?.latitude && userLocation?.longitude) {
        console.log('[MapsWidget] Using parent location for proximity check:', userLocation.city || 'unknown');
        userPos = { lat: userLocation.latitude, lon: userLocation.longitude };
      } else {
        console.log('[MapsWidget] Attempting browser geolocation for proximity check');
        const gpsPos = await getCurrentPosition();
        userPos = gpsPos;
      }

      const result = isWithinProximity(
        userPos.lat, userPos.lon,
        details.location.lat, details.location.lng,
        500 // 500m radius (relaxed for MVP — covers GPS drift in dense urban areas)
      );

      if (result.isWithin) {
        onCreateExperience({
          name: details.name || source.title,
          placeId: cleanPlaceId,
          googleMapsUri: source.uri,
          latitude: details.location.lat,
          longitude: details.location.lng,
          address: details.address,
          rating: details.rating,
          types: details.types,
        });
      } else {
        setProximityResult({
          tooFar: true,
          distance: formatDistance(result.distance),
        });
      }
    } catch (err: any) {
      console.error('[MapsWidget] Proximity check error:', err);
      setProximityError(
        userLocation
          ? 'Could not verify your location. Please try again.'
          : 'Location access is required. Please enable location services and try again.'
      );
    } finally {
      setProximityChecking(false);
    }
  }, [onCreateExperience, placeDetails, userLocation]);

  // Clear proximity state when switching places
  useEffect(() => {
    setProximityResult(null);
    setProximityError(null);
  }, [selectedIndex]);

  // Load Google Maps JavaScript API
  useEffect(() => {
    if (!mapsApiKey) {
      console.log('[MapsWidget] No API key configured');
      setMapError('Google Maps API key not configured');
      return;
    }

    // Check if already loaded
    if (window.google?.maps) {
      console.log('[MapsWidget] Google Maps already loaded');
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
      const checkInterval = setInterval(() => {
        if (window.google?.maps) {
          setMapsLoaded(true);
          clearInterval(checkInterval);
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 10000);
      return;
    }

    // Load Maps JS API (marker library only — Places calls go through server proxy)
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=marker&callback=initMapsWidget`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.error('[MapsWidget] Failed to load Google Maps');
      setMapError('Failed to load Google Maps');
    };
    document.head.appendChild(script);

    return () => {
      window.initMapsWidget = undefined;
    };
  }, [mapsApiKey]);

  // Initialize map when Google Maps is loaded
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInstanceRef.current) return;

    try {
      console.log('[MapsWidget] Initializing map');

      // Use user's actual location as center, fall back to first place with coords, then NYC
      let initialCenter = { lat: 40.7128, lng: -74.0060 };
      if (userLocation?.latitude && userLocation?.longitude) {
        initialCenter = { lat: userLocation.latitude, lng: userLocation.longitude };
      } else {
        // Check if any placeDetails already have locations
        for (const source of sources) {
          const details = source.placeId ? placeDetails[source.placeId] : null;
          if (details?.location) {
            initialCenter = details.location;
            break;
          }
        }
      }

      const map = new window.google.maps.Map(mapRef.current, {
        center: initialCenter,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d3748' }] },
          { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a2b' }] },
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a3a2a' }] },
        ],
      });

      mapInstanceRef.current = map;
      infoWindowRef.current = new window.google.maps.InfoWindow();

      setMapReady(true);
      console.log('[MapsWidget] Map initialized');
    } catch (error: any) {
      console.error('[MapsWidget] Map init error:', error);
      setMapError(error.message || 'Failed to initialize map');
    }
  }, [mapsLoaded]);

  // Effect A: Fetch place details immediately when sources arrive (no mapReady gate).
  // This ensures "I'm Here" works in mobile list view where Google Maps container may be hidden.
  useEffect(() => {
    if (sources.length === 0) return;

    const fetchPlaceDetails = async () => {
      const details: Record<string, PlaceDetails> = {};

      // Collect all placeIds and fetch in one batch via server route
      const placeIds = sources
        .map(s => s.placeId)
        .filter((id): id is string => !!id);

      if (placeIds.length > 0) {
        try {
          const res = await fetch('/api/maps/place-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ placeIds }),
          });

          if (res.ok) {
            const data = await res.json();
            const places = data.places || {};

            for (const source of sources) {
              if (source.placeId && places[source.placeId]) {
                const p = places[source.placeId];
                details[source.placeId] = {
                  name: p.name || source.title,
                  rating: p.rating,
                  userRatingsTotal: p.userRatingsTotal,
                  address: p.address,
                  types: p.types,
                  openNow: p.openNow,
                  photoUrl: p.photoUrl,
                  location: p.location,
                };
              }
            }
          } else {
            console.error('[MapsWidget] Server place-details error:', res.status);
            // Fall back to basic info from sources
            for (const source of sources) {
              if (source.placeId) {
                details[source.placeId] = { name: source.title };
              }
            }
          }
        } catch (error) {
          console.error('[MapsWidget] Failed to fetch place details:', error);
          for (const source of sources) {
            if (source.placeId) {
              details[source.placeId] = { name: source.title };
            }
          }
        }
      }

      setPlaceDetails(details);
    };

    fetchPlaceDetails();
  }, [sources]);

  // Effect B: Fit Google map to bounds when mapReady AND placeDetails are both available.
  // Separated from fetch so the map can initialize independently.
  useEffect(() => {
    if (isOSM || !mapReady || !mapInstanceRef.current) return;
    if (Object.keys(placeDetails).length === 0) return;

    const hasValidLocations = sources.some(s => {
      const d = s.placeId ? placeDetails[s.placeId] : null;
      return !!d?.location;
    });

    if (hasValidLocations) {
      const bounds = new window.google.maps.LatLngBounds();
      for (const source of sources) {
        const d = source.placeId ? placeDetails[source.placeId] : null;
        if (d?.location) bounds.extend(d.location);
      }
      mapInstanceRef.current.fitBounds(bounds);
      // Don't zoom in too much
      const listener = window.google.maps.event.addListener(mapInstanceRef.current, 'idle', () => {
        if (mapInstanceRef.current.getZoom() > 16) {
          mapInstanceRef.current.setZoom(16);
        }
        window.google.maps.event.removeListener(listener);
      });
    }
  }, [mapReady, placeDetails, sources, isOSM]);

  // Create markers when place details are loaded
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || Object.keys(placeDetails).length === 0) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Create markers for each place with a location
    sources.forEach((source, index) => {
      const details = source.placeId ? placeDetails[source.placeId] : null;
      if (!details?.location) return;

      const marker = new window.google.maps.Marker({
        position: details.location,
        map: mapInstanceRef.current,
        title: source.title,
        label: {
          text: String(index + 1),
          color: '#000000',
          fontWeight: 'bold',
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: index === selectedIndex ? '#06b6d4' : '#8b5cf6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      marker.addListener('click', () => {
        setSelectedIndex(index);
        showInfoWindow(marker, source, details);
      });

      markersRef.current.push(marker);
    });
  }, [mapReady, placeDetails, sources]);

  // Update marker colors when selection changes
  useEffect(() => {
    markersRef.current.forEach((marker, index) => {
      marker.setIcon({
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: index === selectedIndex ? '#06b6d4' : '#8b5cf6',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      });
    });

    // Pan to selected marker
    const selectedSource = sources[selectedIndex];
    const details = selectedSource?.placeId ? placeDetails[selectedSource.placeId] : null;
    if (details?.location && mapInstanceRef.current) {
      mapInstanceRef.current.panTo(details.location);
    }
  }, [selectedIndex, placeDetails, sources]);

  const showInfoWindow = useCallback((marker: any, source: MapsSource, details: PlaceDetails) => {
    if (!infoWindowRef.current) return;

    const content = `
      <div style="padding: 8px; max-width: 250px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #1a1a1a;">${details.name}</h3>
        ${details.rating ? `<div style="margin-bottom: 4px; font-size: 12px;">⭐ ${details.rating} (${details.userRatingsTotal || 0} reviews)</div>` : ''}
        ${details.address ? `<div style="font-size: 11px; color: #666; margin-bottom: 8px;">${details.address}</div>` : ''}
        <a href="${source.uri}" target="_blank" rel="noopener noreferrer" style="color: #0891b2; font-size: 12px; text-decoration: none;">View on Google Maps →</a>
      </div>
    `;

    infoWindowRef.current.setContent(content);
    infoWindowRef.current.open(mapInstanceRef.current, marker);
  }, []);

  const handleNavigateToPlace = (uri: string) => {
    openExternalUrl(uri);
  };

  // Render directions in-app using DirectionsService + DirectionsRenderer
  const renderInAppDirections = useCallback(async (source: MapsSource) => {
    if (!mapReady || !mapInstanceRef.current || !window.google?.maps) {
      // Fallback to external
      const directionsUrl = source.placeId
        ? `https://www.google.com/maps/dir/?api=1&destination_place_id=${source.placeId}`
        : source.uri.replace('/maps/place/', '/maps/dir/?api=1&destination=');
      openExternalUrl(directionsUrl);
      return;
    }

    setLoadingDirections(true);
    setDirectionsError(null);
    setDirectionsMode(true);
    setViewMode('map');

    try {
      // Get user's current location (try browser geolocation, fallback to IP-based)
      let origin: { lat: number; lng: number };
      try {
        const userPos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
          });
        });
        origin = {
          lat: userPos.coords.latitude,
          lng: userPos.coords.longitude,
        };
      } catch (geoErr) {
        // Fallback to IP-based location passed from parent
        if (userLocation?.latitude && userLocation?.longitude) {
          console.log('[MapsWidget] Using IP-based location fallback:', userLocation.city || 'unknown city');
          origin = {
            lat: userLocation.latitude,
            lng: userLocation.longitude,
          };
        } else {
          // No location available at all — open in external Google Maps
          console.log('[MapsWidget] No location available, opening external maps');
          const fallbackUrl = source.placeId
            ? `https://www.google.com/maps/dir/?api=1&destination_place_id=${source.placeId}`
            : source.uri.replace('/maps/place/', '/maps/dir/?api=1&destination=');
          openExternalUrl(fallbackUrl);
          setLoadingDirections(false);
          setDirectionsMode(false);
          return;
        }
      }

      // Build destination — strip "places/" prefix from Grounding API placeIds
      const cleanPlaceId = source.placeId?.replace(/^places\//, '');
      const destination: any = cleanPlaceId
        ? { placeId: cleanPlaceId }
        : (() => {
            const details = source.placeId ? placeDetails[source.placeId] : null;
            return details?.location || source.title;
          })();

      // Clear existing markers and old directions
      markersRef.current.forEach(m => m.setMap(null));
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }

      // Create DirectionsService and Renderer
      const directionsService = new window.google.maps.DirectionsService();
      const directionsRenderer = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#06b6d4',
          strokeWeight: 5,
          strokeOpacity: 0.85,
        },
      });
      directionsRendererRef.current = directionsRenderer;

      const result = await new Promise<any>((resolve, reject) => {
        directionsService.route(
          {
            origin,
            destination,
            travelMode: window.google.maps.TravelMode.DRIVING,
          },
          (response: any, status: string) => {
            if (status === 'OK') {
              resolve(response);
            } else {
              reject(new Error(`Directions failed: ${status}`));
            }
          }
        );
      });

      directionsRenderer.setDirections(result);
      setDirectionsResult(result);

      // Extract route info
      const route = result.routes[0];
      const leg = route.legs[0];
      setDirectionsSummary({
        distance: leg.distance?.text || '',
        duration: leg.duration?.text || '',
      });
      setDirectionsSteps(
        leg.steps?.map((step: any) => ({
          instruction: step.instructions?.replace(/<[^>]*>/g, '') || '',
          distance: step.distance?.text || '',
          duration: step.duration?.text || '',
        })) || []
      );

      console.log('[MapsWidget] In-app directions rendered:', leg.distance?.text, leg.duration?.text);
    } catch (err: any) {
      console.error('[MapsWidget] Directions error:', err);
      setDirectionsError(err.message || 'Could not get directions');
    } finally {
      setLoadingDirections(false);
    }
  }, [mapReady, placeDetails, openExternalUrl, userLocation]);

  // Exit directions mode and restore markers
  const exitDirectionsMode = useCallback(() => {
    setDirectionsMode(false);
    setDirectionsResult(null);
    setDirectionsSteps([]);
    setDirectionsSummary(null);
    setDirectionsError(null);
    setOsmDirectionsPolyline([]);
    setProximityResult(null);
    setProximityError(null);

    // Remove directions renderer
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }

    // Restore markers
    if (mapInstanceRef.current && Object.keys(placeDetails).length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      markersRef.current = [];

      sources.forEach((source, index) => {
        const details = source.placeId ? placeDetails[source.placeId] : null;
        if (!details?.location) return;

        const marker = new window.google.maps.Marker({
          position: details.location,
          map: mapInstanceRef.current,
          title: source.title,
          label: { text: String(index + 1), color: '#000000', fontWeight: 'bold' },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: index === selectedIndex ? '#06b6d4' : '#8b5cf6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        marker.addListener('click', () => {
          setSelectedIndex(index);
          showInfoWindow(marker, source, details);
        });

        markersRef.current.push(marker);
        bounds.extend(details.location);
      });

      mapInstanceRef.current.fitBounds(bounds);
    }
  }, [placeDetails, sources, selectedIndex, showInfoWindow]);

  // OSM directions via OSRM
  const renderOSMDirections = useCallback(async (source: MapsSource) => {
    setLoadingDirections(true);
    setDirectionsError(null);
    setDirectionsMode(true);
    setViewMode('map');

    try {
      let origin: { lat: number; lng: number };
      try {
        const userPos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
        });
        origin = { lat: userPos.coords.latitude, lng: userPos.coords.longitude };
      } catch {
        if (userLocation?.latitude && userLocation?.longitude) {
          origin = { lat: userLocation.latitude, lng: userLocation.longitude };
        } else {
          setDirectionsError('Location not available. Please enable location services.');
          setLoadingDirections(false);
          return;
        }
      }

      const details = source.placeId ? placeDetails[source.placeId] : null;
      if (!details?.location) {
        setDirectionsError('Destination coordinates not available.');
        setLoadingDirections(false);
        return;
      }

      const dest = details.location;
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes?.[0]) {
        setDirectionsError('Could not find a route.');
        setLoadingDirections(false);
        return;
      }

      const route = data.routes[0];
      const leg = route.legs[0];

      const formatDist = (m: number) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
      const formatDur = (s: number) => {
        const min = Math.round(s / 60);
        if (min < 60) return `${min} min`;
        return `${Math.floor(min / 60)} hr ${min % 60} min`;
      };

      setDirectionsSummary({
        distance: formatDist(route.distance),
        duration: formatDur(route.duration),
      });

      setDirectionsSteps(
        (leg.steps || []).map((step: any) => ({
          instruction: step.name || step.maneuver?.type || 'Continue',
          distance: formatDist(step.distance),
          duration: formatDur(step.duration),
        }))
      );

      // Set polyline for LeafletMapRenderer
      const polyline = (route.geometry?.coordinates || []).map((c: number[]) => ({ lat: c[1], lng: c[0] }));
      setOsmDirectionsPolyline(polyline);
    } catch (err: any) {
      setDirectionsError(err.message || 'Could not get directions');
    } finally {
      setLoadingDirections(false);
    }
  }, [placeDetails, userLocation]);

  const handleGetDirections = (source: MapsSource) => {
    if (isOSM) {
      renderOSMDirections(source);
    } else {
      renderInAppDirections(source);
    }
  };

  // Open directions in external Google Maps as fallback
  const handleExternalDirections = useCallback((source: MapsSource) => {
    const directionsUrl = source.placeId
      ? `https://www.google.com/maps/dir/?api=1&destination_place_id=${source.placeId}`
      : source.uri.replace('/maps/place/', '/maps/dir/?api=1&destination=');
    openExternalUrl(directionsUrl);
  }, [openExternalUrl]);

  const selectedSource = sources[selectedIndex];
  const selectedDetails = selectedSource?.placeId ? placeDetails[selectedSource.placeId] : null;

  // Extract type tags from title
  const getPlaceType = (title: string): string => {
    const types = ['Restaurant', 'Cafe', 'Bar', 'Hotel', 'Museum', 'Park', 'Shop', 'Store', 'Beach', 'Club'];
    for (const type of types) {
      if (title.toLowerCase().includes(type.toLowerCase())) {
        return type;
      }
    }
    return 'Place';
  };

  // Minimized floating pill
  if (minimized) {
    return (
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] animate-fadeIn cursor-pointer"
        onClick={() => setMinimized?.(false)}
      >
        <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-gray-900 via-black to-gray-900 border border-cyan-500/40 rounded-full shadow-2xl shadow-cyan-500/20 hover:border-cyan-500/70 transition-all">
          <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white whitespace-nowrap">
            {sources.length} places found
          </span>
          <span className="text-xs text-gray-400 hidden sm:inline truncate max-w-[120px]">
            — Tap to expand
          </span>
          <Maximize2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black modal-backdrop flex items-center justify-center p-2 sm:p-4 overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 10000 }} onClick={onClose}>
      <div
        className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-cyan-500/30 rounded-3xl w-full max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] md:max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl shadow-cyan-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500/20 to-purple-600/20 border-b border-cyan-500/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-white">Places Found</h2>
                <p className="text-xs text-gray-400 truncate max-w-[150px] sm:max-w-[300px]">"{query}"</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
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
              {/* Minimize button */}
              {setMinimized && (
                <button
                  onClick={() => setMinimized(true)}
                  className="text-gray-400 hover:text-white p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Minimize"
                >
                  <Minus className="w-5 h-5" />
                </button>
              )}
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
            {/* Protocol Community Experiences — Place Reviews style */}
            {protocolExperiences && protocolExperiences.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-bold text-green-400">Community Reviews</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">On-Chain</span>
                </div>
                <div className="space-y-3">
                  {protocolExperiences.map((exp) => {
                    const timeAgo = exp.createdAt ? formatTimeAgo(exp.createdAt) : '';
                    const starRating = exp.averageRating > 0 ? exp.averageRating : 0;
                    const fullStars = Math.floor(starRating);
                    const hasHalfStar = starRating % 1 >= 0.25;

                    return (
                      <div
                        key={exp.id}
                        className="rounded-xl bg-gray-800/80 border border-green-500/20 hover:border-green-500/40 transition-all overflow-hidden"
                      >
                        {/* Experience photo */}
                        {exp.photoUrl && (
                          <div className="relative w-full h-32 bg-gray-900">
                            <img
                              src={exp.photoUrl}
                              alt={exp.title}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="absolute top-2 left-2">
                              <span className="text-[9px] px-1.5 py-0.5 bg-green-500/90 text-white font-bold rounded">
                                COMMUNITY
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="p-3">
                          {/* Title + Price row */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-white font-semibold text-sm leading-tight">{exp.title}</h4>
                            <span className="text-sm font-bold text-green-400 whitespace-nowrap flex-shrink-0">
                              {exp.priceWMON} WMON
                            </span>
                          </div>

                          {/* Star rating bar */}
                          {starRating > 0 && (
                            <div className="flex items-center gap-1.5 mb-2">
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <Star
                                    key={i}
                                    className={`w-3.5 h-3.5 ${
                                      i <= fullStars
                                        ? 'text-yellow-400 fill-yellow-400'
                                        : i === fullStars + 1 && hasHalfStar
                                          ? 'text-yellow-400 fill-yellow-400/50'
                                          : 'text-gray-600'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-yellow-400 font-medium">
                                {starRating.toFixed(1)}
                              </span>
                              {exp.ratingCount > 0 && (
                                <span className="text-[10px] text-gray-500">
                                  ({exp.ratingCount} {exp.ratingCount === 1 ? 'review' : 'reviews'})
                                </span>
                              )}
                            </div>
                          )}

                          {/* Author row — like a Place Review author */}
                          <div className="flex items-center gap-2 mb-2">
                            {exp.creatorPfpUrl ? (
                              <img
                                src={exp.creatorPfpUrl}
                                alt={exp.creatorUsername || 'Creator'}
                                className="w-7 h-7 rounded-full border border-green-500/40 object-cover flex-shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            {/* Fallback avatar */}
                            <div className={`w-7 h-7 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center flex-shrink-0 ${exp.creatorPfpUrl ? 'hidden' : ''}`}>
                              <span className="text-green-400 text-[10px] font-bold">
                                {(exp.creatorUsername || exp.creatorDisplayName || exp.creator.slice(2, 4)).slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-white font-medium truncate">
                                {exp.creatorDisplayName || exp.creatorUsername || `${exp.creator.slice(0, 6)}...${exp.creator.slice(-4)}`}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {exp.creatorUsername && (
                                  <span className="text-[10px] text-gray-500">@{exp.creatorUsername}</span>
                                )}
                                {timeAgo && (
                                  <span className="text-[10px] text-gray-600">{timeAgo}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Review text / description */}
                          {exp.description && exp.description !== exp.title && (
                            <p className="text-xs text-gray-400 leading-relaxed mb-2 line-clamp-3">
                              {exp.description}
                            </p>
                          )}

                          {/* Stats + Purchase row */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
                            <div className="flex items-center gap-3">
                              {exp.totalPurchases > 0 && (
                                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {exp.totalPurchases} {exp.totalPurchases === 1 ? 'visitor' : 'visitors'}
                                </span>
                              )}
                              {!exp.photoUrl && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded font-medium">
                                  COMMUNITY
                                </span>
                              )}
                            </div>
                            {onPurchaseExperience && (
                              <button
                                onClick={() => onPurchaseExperience(exp.itineraryId)}
                                className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-[11px] font-bold rounded-lg transition-colors border border-green-500/30"
                              >
                                Purchase Access
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {sources.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 mb-2">
                    <div className="flex-1 h-px bg-gray-700/50" />
                    <span className="text-[10px] text-gray-500 font-medium">Google Maps Results</span>
                    <div className="flex-1 h-px bg-gray-700/50" />
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              {sources.map((source, index) => {
                const isSelected = index === selectedIndex;
                const placeType = getPlaceType(source.title);
                const details = source.placeId ? placeDetails[source.placeId] : null;

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
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">
                            {placeType}
                          </span>
                          {details?.rating && (
                            <span className="text-xs text-yellow-400">
                              ⭐ {details.rating}
                            </span>
                          )}
                          {details?.openNow !== undefined && (
                            <span className={`text-xs ${details.openNow ? 'text-green-400' : 'text-red-400'}`}>
                              {details.openNow ? '● Open' : '● Closed'}
                            </span>
                          )}
                        </div>
                        {details?.address && (
                          <p className="text-xs text-gray-500 mt-1 truncate">{details.address}</p>
                        )}
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
                        {onCreateExperience && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateExperienceCheck(source);
                            }}
                            disabled={proximityChecking}
                            className="flex-1 py-2 px-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            {proximityChecking ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            I'm Here
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Create Custom Experience button */}
            {onCreateCustomExperience && (
              <div className="mt-4">
                <button
                  onClick={onCreateCustomExperience}
                  className="w-full py-3 px-4 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 hover:from-purple-500/30 hover:to-cyan-500/30 border border-purple-500/30 hover:border-purple-500/50 text-purple-400 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create Custom Experience
                  <span className="text-[10px] text-purple-400/60 ml-1">(no Maps required)</span>
                </button>
              </div>
            )}

            {/* Results Count & Attribution */}
            <div className="mt-4 pt-4 border-t border-gray-700/50">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{sources.length} places found</span>
                {isOSM ? (
                  <span className="flex items-center gap-1.5">
                    <span style={{ fontSize: '11px', letterSpacing: '0.2px', color: '#9aa0a6' }}>
                      OpenStreetMap + OSRM
                    </span>
                  </span>
                ) : (
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
                    <span style={{ fontSize: '11px', letterSpacing: '0.2px', color: '#9aa0a6' }}>
                      Google Maps
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Map View / Selected Place Details */}
          <div className={`${viewMode === 'list' ? 'hidden md:block' : ''} flex-1 p-4 flex flex-col`}>
            {/* Map Container */}
            <div className="flex-1 bg-gray-900/50 rounded-xl border border-cyan-500/20 overflow-hidden relative">
              {isOSM ? (
                <Suspense fallback={
                  <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-gray-900/90">
                    <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                  </div>
                }>
                  <LeafletMapRenderer
                    sources={sources}
                    placeDetails={placeDetails}
                    selectedIndex={selectedIndex}
                    onSelectIndex={setSelectedIndex}
                    userLocation={userLocation ? { latitude: userLocation.latitude, longitude: userLocation.longitude } : undefined}
                    directionsPolyline={osmDirectionsPolyline.length > 0 ? osmDirectionsPolyline : undefined}
                  />
                </Suspense>
              ) : mapsApiKey ? (
                <>
                  {/* Google Maps Container */}
                  <div ref={mapRef} className="w-full h-full min-h-[300px]" />

                  {/* Loading State */}
                  {!mapReady && !mapError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90">
                      <div className="text-center p-6">
                        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Loading map...</p>
                      </div>
                    </div>
                  )}

                  {/* Error State */}
                  {mapError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90">
                      <div className="text-center p-6">
                        <div className="text-5xl mb-3">🗺️</div>
                        <p className="text-red-400 text-sm mb-4">{mapError}</p>
                        <button
                          onClick={() => selectedSource?.uri && openExternalUrl(selectedSource.uri)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-lg transition-colors"
                        >
                          <MapPin className="w-4 h-4" />
                          Open in Google Maps
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* No API Key Fallback */
                <div className="w-full h-full flex flex-col items-center justify-center p-4">
                  <div className="text-center mb-4">
                    <div className="text-5xl mb-2">📍</div>
                    <h3 className="text-white font-bold text-lg">{selectedSource?.title || 'Select a Place'}</h3>
                    <p className="text-cyan-400 text-sm">{getPlaceType(selectedSource?.title || '')}</p>
                  </div>

                  {selectedSource && (
                    <div className="flex flex-col gap-3 w-full max-w-xs">
                      <button
                        onClick={() => openExternalUrl(selectedSource.uri)}
                        className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        <MapPin className="w-5 h-5" />
                        View on Google Maps
                      </button>
                      <button
                        onClick={() => handleGetDirections(selectedSource)}
                        className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        <Navigation className="w-5 h-5" />
                        Get Directions
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-4 text-center">
                    Powered by Google Maps Grounding
                  </p>
                </div>
              )}

              {/* Navigation Arrows for Mobile */}
              {viewMode === 'map' && sources.length > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4 md:hidden">
                  <button
                    onClick={() => setSelectedIndex(prev => (prev > 0 ? prev - 1 : sources.length - 1))}
                    className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="bg-gray-800 px-3 py-1 rounded-full">
                    <span className="text-white text-sm font-semibold">{selectedIndex + 1} / {sources.length}</span>
                  </div>
                  <button
                    onClick={() => setSelectedIndex(prev => (prev < sources.length - 1 ? prev + 1 : 0))}
                    className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Directions Panel (shown when route is active) */}
            {directionsMode && (
              <div className="mt-4 bg-gray-800 border border-cyan-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={exitDirectionsMode}
                    className="flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Places
                  </button>
                  {selectedSource && (
                    <button
                      onClick={() => handleExternalDirections(selectedSource)}
                      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open in Google Maps
                    </button>
                  )}
                </div>

                {loadingDirections && (
                  <div className="flex items-center gap-2 text-gray-400 py-4 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Getting directions...</span>
                  </div>
                )}

                {directionsError && (
                  <div className="text-center py-3">
                    <p className="text-red-400 text-sm mb-2">{directionsError}</p>
                    {selectedSource && (
                      <button
                        onClick={() => handleExternalDirections(selectedSource)}
                        className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Open in Google Maps instead
                      </button>
                    )}
                  </div>
                )}

                {directionsSummary && (
                  <>
                    <div className="flex items-center gap-4 mb-3 pb-3 border-b border-gray-700/50">
                      <h3 className="text-white font-bold truncate flex-1">
                        {selectedSource?.title}
                      </h3>
                      <div className="flex items-center gap-3 text-sm flex-shrink-0">
                        <span className="flex items-center gap-1 text-cyan-400">
                          <Route className="w-3.5 h-3.5" />
                          {directionsSummary.distance}
                        </span>
                        <span className="flex items-center gap-1 text-purple-400">
                          <Clock className="w-3.5 h-3.5" />
                          {directionsSummary.duration}
                        </span>
                      </div>
                    </div>

                    {/* Step-by-step directions */}
                    <div className="max-h-[200px] overflow-y-auto space-y-2">
                      {directionsSteps.map((step, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className="w-5 h-5 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-gray-300 font-bold" style={{ fontSize: '9px' }}>{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-300">{step.instruction}</p>
                            <p className="text-gray-600 mt-0.5">{step.distance} &middot; {step.duration}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* "I'm Here - Create Experience" button in directions panel */}
                {onCreateExperience && directionsSummary && selectedSource && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <button
                      onClick={() => handleCreateExperienceCheck(selectedSource)}
                      disabled={proximityChecking}
                      className="w-full py-2.5 px-4 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {proximityChecking ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      I'm Here — Create Experience
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Proximity Feedback Banners */}
            {proximityResult?.tooFar && (
              <div className="mt-3 p-3 bg-yellow-500/15 border border-yellow-500/30 rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-yellow-400 text-sm font-medium">You're {proximityResult.distance} away</p>
                  <p className="text-yellow-400/70 text-xs mt-0.5">Get within 500m of this place to create an experience.</p>
                </div>
                <button onClick={() => setProximityResult(null)} className="text-yellow-400/50 hover:text-yellow-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {proximityError && (
              <div className="mt-3 p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-400 text-sm font-medium">Location Error</p>
                  <p className="text-red-400/70 text-xs mt-0.5">{proximityError}</p>
                </div>
                <button onClick={() => setProximityError(null)} className="text-red-400/50 hover:text-red-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Selected Place Card (hidden during directions mode) */}
            {selectedSource && !directionsMode && (
              <div className="mt-4">
                {selectedSource.placeId ? (
                  <PlaceDetailsCard
                    placeId={selectedSource.placeId}
                    title={selectedSource.title}
                    compact={false}
                    onViewOnMaps={() => openExternalUrl(selectedSource.uri)}
                    onGetDirections={() => handleGetDirections(selectedSource)}
                  />
                ) : (
                  <div className="bg-gray-800 border border-cyan-500/20 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-lg truncate">{selectedSource.title}</h3>
                        <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">
                          {getPlaceType(selectedSource.title)}
                        </span>
                      </div>
                      <div className="text-right ml-3">
                        <div className="text-2xl font-bold text-cyan-400">#{selectedIndex + 1}</div>
                        <div className="text-xs text-gray-500">of {sources.length}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700/50">
                      <button
                        onClick={() => openExternalUrl(selectedSource.uri)}
                        className="flex-1 py-2 px-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View on Maps
                      </button>
                      <button
                        onClick={() => handleGetDirections(selectedSource)}
                        className="flex-1 py-2 px-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <Navigation className="w-3 h-3" />
                        Directions
                      </button>
                    </div>
                  </div>
                )}

                {/* "I'm Here" button below place card */}
                {onCreateExperience && (
                  <button
                    onClick={() => handleCreateExperienceCheck(selectedSource)}
                    disabled={proximityChecking}
                    className="w-full mt-3 py-2.5 px-4 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {proximityChecking ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    I'm Here — Create Experience
                  </button>
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
              <button
                onClick={() => openExternalUrl(`https://monadscan.com/tx/${paymentTxHash}`)}
                className="text-gray-400 hover:text-cyan-400 transition-colors flex items-center gap-1"
              >
                View transaction
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
