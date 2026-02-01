import { NextRequest } from 'next/server';

// =============================================
// Types
// =============================================

export type MapProviderType = 'google' | 'baidu' | 'amap' | 'osm';

export interface PlaceSearchParams {
  query: string;
  latitude?: number;
  longitude?: number;
  radius?: number; // meters
}

export interface NormalizedPlaceDetails {
  id: string; // provider-specific ID (Google placeId, OSM ID, etc.)
  name: string;
  rating?: number;
  userRatingsTotal?: number;
  address?: string;
  types?: string[];
  openNow?: boolean;
  photoUrl?: string;
  location?: { lat: number; lng: number };
}

export interface NormalizedDirections {
  distance: string;
  duration: string;
  polyline?: Array<{ lat: number; lng: number }>;
  steps: Array<{
    instruction: string;
    distance: string;
    duration: string;
  }>;
}

export interface MapsSource {
  uri: string;
  title: string;
  placeId?: string;
}

export interface MapClientConfig {
  provider: MapProviderType;
  scriptUrl?: string; // Google Maps JS URL
  tileUrl?: string; // OSM tile URL template
  cssUrls?: string[]; // Leaflet CSS, etc.
  apiKey?: string; // client-side key (Google only)
}

// =============================================
// Provider Interface
// =============================================

export interface MapProvider {
  type: MapProviderType;

  /** Search for places matching a text query */
  searchPlaces(params: PlaceSearchParams): Promise<MapsSource[]>;

  /** Get detailed info for place IDs */
  getPlaceDetails(placeIds: string[]): Promise<Record<string, NormalizedPlaceDetails>>;

  /** Get directions between two points */
  getDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number } | string
  ): Promise<NormalizedDirections | null>;

  /** Get client-side rendering config */
  getClientConfig(): MapClientConfig;
}

// =============================================
// Territory Detection
// =============================================

/** Territories where Google Maps is prohibited (per Google ToS) */
export const GOOGLE_PROHIBITED_TERRITORIES = [
  'CN', // China
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'VN', // Vietnam
  'UA-43', // Crimea
];

/**
 * Detect user's country/territory from IP headers.
 * Reusable across chat route and place-details route.
 */
export async function detectUserTerritory(req: NextRequest): Promise<string | null> {
  try {
    const ipInfoToken = process.env.IPINFO_TOKEN;
    if (!ipInfoToken) {
      console.log('[Maps] IPInfo token not configured, skipping territory check');
      return null;
    }

    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwardedFor?.split(',')[0] || realIp || null;

    if (!ip) {
      console.log('[Maps] Could not detect client IP');
      return null;
    }

    const response = await fetch(`https://ipinfo.io/${ip}?token=${ipInfoToken}`);
    const data = await response.json();

    console.log('[Maps] Detected country:', data.country);
    return data.country || null;
  } catch (error) {
    console.error('[Maps] Failed to detect territory:', error);
    return null;
  }
}

// =============================================
// Factory
// =============================================

/**
 * Get the appropriate map provider for a territory.
 * - Default: Google Maps
 * - Prohibited territories (CN, CU, IR, KP, SY, VN): OSM
 * - Environment override: MAPS_PROVIDER_OVERRIDE
 */
export async function getMapProvider(territory?: string | null): Promise<MapProvider> {
  // Allow environment override for testing
  const override = process.env.MAPS_PROVIDER_OVERRIDE as MapProviderType | undefined;
  if (override === 'osm') {
    const { OSMProvider } = await import('./osm');
    return new OSMProvider();
  }

  // Route restricted territories to OSM
  if (territory && GOOGLE_PROHIBITED_TERRITORIES.includes(territory)) {
    console.log('[Maps] Territory', territory, 'restricted for Google Maps, using OSM');
    const { OSMProvider } = await import('./osm');
    return new OSMProvider();
  }

  // Default: Google
  const { GoogleMapsProvider } = await import('./google');
  return new GoogleMapsProvider();
}

/**
 * Synchronous version that returns provider type only (for client-side decisions).
 */
export function getMapProviderType(territory?: string | null): MapProviderType {
  const override = process.env.MAPS_PROVIDER_OVERRIDE as MapProviderType | undefined;
  if (override === 'osm') return 'osm';
  if (territory && GOOGLE_PROHIBITED_TERRITORIES.includes(territory)) return 'osm';
  return 'google';
}
