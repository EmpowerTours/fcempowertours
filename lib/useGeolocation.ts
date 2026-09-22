'use client';

import { useEffect, useState } from 'react';

export interface GeolocationData {
  country: string;
  countryName: string;
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  accuracy?: number;
}

/**
 * How long the whole detection may take, measured from the moment the hook mounts.
 *
 * This exists because `PositionOptions.timeout` does NOT cover the permission prompt. The W3C
 * Geolocation spec is explicit: "The time spent waiting for the document to become visible and
 * for obtaining permission to use the API is not included in the period covered by the timeout
 * member." So while an iOS Safari prompt sits unanswered — dismissed, swiped away, or never
 * shown because Location Services is off for the browser — **neither callback ever fires and
 * the 10s timeout never starts**. The passport modal spun on "Detecting your location…"
 * indefinitely, with the Mint button disabled behind it, and the only way out was reloading.
 *
 * Both callbacks were reachable and correct; that was never the bug. Verified against production
 * 2026-09-22 by driving the real page: permission granted resolved to MX through Nominatim, and
 * permission denied resolved to MX through the IP fallback. The unhandled case is the third one,
 * where the user answers neither way.
 */
const DETECT_DEADLINE_MS = 12_000;

/** No fetch here may outlive this. Every one of them used to have no timeout at all. */
const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function useGeolocation() {
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    /** Loading ends exactly once. A late callback may still improve the location, never revive the spinner. */
    const settle = () => {
      if (cancelled || settled) return;
      settled = true;
      setLoading(false);
    };

    /**
     * Last resort, shared by every failure path: ask the server where this request came from.
     *
     * It does NOT fall back to a hardcoded country. It used to set `US / United States` whenever
     * anything went wrong, which the passport modal then displayed as a confident
     * "Detected: 🇺🇸 United States" — and a passport is minted one-per-country and cannot be
     * undone, so a bad guess permanently spends a slot on a country the holder has never been to.
     * Reporting nothing is recoverable; reporting the wrong country is not.
     */
    const resolveByIpOrGiveUp = async (why: string) => {
      const ipLocation = await fetchIPBasedLocation();
      if (cancelled) return;
      if (ipLocation) {
        setLocation(ipLocation);
        setError(null);
      } else {
        setLocation(null);
        setError(why);
      }
      settle();
    };

    if (!navigator.geolocation) {
      console.warn('⚠️ Geolocation API not available');
      void resolveByIpOrGiveUp('Geolocation not supported');
      return;
    }

    console.log('📍 Requesting user location...');

    const successHandler = async (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;

      console.log('✅ Got GPS coordinates:', { latitude, longitude, accuracy });

      try {
        // Use reverse geocoding to get country from coordinates
        const response = await fetchWithTimeout(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          { headers: { 'Accept': 'application/json' } },
        );

        if (!response.ok) {
          throw new Error(`Geocoding API returned ${response.status}`);
        }

        const geoData = await response.json();
        if (cancelled) return;

        console.log('🌍 Reverse geocoding result:', geoData);

        const countryCode = geoData.address?.country_code?.toUpperCase();
        if (!countryCode) throw new Error('no country_code in reverse geocoding result');

        // Use our country database for consistent naming (e.g., "Hong Kong SAR" instead of "Hong Kong China")
        const { getCountryByCode } = await import('./passport/countries');
        const countryInfo = getCountryByCode(countryCode);
        const countryName = countryInfo?.name || geoData.address?.country;
        if (!countryName) throw new Error(`unknown country code ${countryCode}`);

        const city = geoData.address?.city || geoData.address?.town || geoData.address?.village;
        const region = geoData.address?.state || geoData.address?.province;

        const locationData: GeolocationData = {
          country: countryCode,
          countryName,
          latitude,
          longitude,
          accuracy,
          city,
          region,
        };

        console.log('📍 Final location data:', locationData);
        if (cancelled) return;
        setLocation(locationData);
        setError(null);
        settle();
      } catch (geoError) {
        console.error('❌ Reverse geocoding failed:', geoError);
        // Coordinates without a country are not a passport. Ask the server rather than guess —
        // and if that fails too, say so instead of inventing one.
        await resolveByIpOrGiveUp('Could not determine your country. Please try again.');
      }
    };

    const errorHandler = async (err: GeolocationPositionError) => {
      console.error('❌ Geolocation error:', err.code, err.message);

      let errorMsg = 'Unable to get location';
      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMsg = 'Location permission denied, and we could not place you by network either.';
          break;
        case err.POSITION_UNAVAILABLE:
          errorMsg = 'Location information is unavailable, and we could not place you by network either.';
          break;
        case err.TIMEOUT:
          errorMsg = 'Location request timed out, and we could not place you by network either.';
          break;
      }

      console.log('⚠️ Falling back to IP-based location detection...');
      await resolveByIpOrGiveUp(errorMsg);
    };

    // Request user location with high accuracy
    navigator.geolocation.getCurrentPosition(successHandler, errorHandler, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0, // Don't use cached location
    });

    // The deadline the option above cannot provide. Starts now, runs whatever the prompt is
    // doing, and hands the user a resolved country or a real error rather than a spinner.
    const deadline = setTimeout(() => {
      if (settled || cancelled) return;
      console.warn(
        `⚠️ No answer from the permission prompt after ${DETECT_DEADLINE_MS}ms — placing by network instead`,
      );
      void resolveByIpOrGiveUp(
        'We could not detect your location. Allow location access for this site, then try again.',
      );
    }, DETECT_DEADLINE_MS);

    return () => {
      cancelled = true;
      clearTimeout(deadline);
    };
  }, []);

  return { location, loading, error };
}

// Fallback: IP-based geolocation with geocoding
async function fetchIPBasedLocation(): Promise<GeolocationData | null> {
  try {
    console.log('🌐 Using IP-based geolocation fallback...');
    const response = await fetchWithTimeout('/api/geo', {});
    if (response.ok) {
      const data = await response.json();
      console.log('✅ IP-based location response:', data);

      // Transform API response to GeolocationData format
      // API returns: { country: "US", country_name: "United States", city: "...", region: "..." }
      let latitude = 0;
      let longitude = 0;

      // Geocode city to get approximate coordinates for Maps Grounding
      if (data.city) {
        // Coordinates here are only used to ground Maps answers. A slow or failing geocode must
        // not delay the country, which is the only thing the passport actually needs.
        const coords = await geocodeCity(data.city, data.country_name || data.country);
        if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
          console.log('✅ Geocoded city coordinates:', coords);
        }
      }

      if (!data.country) {
        console.warn('⚠️ /api/geo returned no country — reporting nothing rather than guessing');
        return null;
      }

      const locationData: GeolocationData = {
        country: data.country,
        countryName: data.country_name || data.country,
        latitude,
        longitude,
        city: data.city,
        region: data.region,
      };

      console.log('✅ Formatted IP-based location:', locationData);
      return locationData;
    }
  } catch (error) {
    console.error('❌ IP-based geolocation failed:', error);
  }
  return null;
}

// Geocode city name to coordinates using Nominatim
async function geocodeCity(city: string, country?: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const query = country ? `${city}, ${country}` : city;
    console.log('🔍 Geocoding city:', query);

    const response = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'EmpowerTours/1.0',
        },
      }
    );

    if (response.ok) {
      const results = await response.json();
      if (results && results.length > 0) {
        return {
          latitude: parseFloat(results[0].lat),
          longitude: parseFloat(results[0].lon),
        };
      }
    }
  } catch (error) {
    console.error('❌ Geocoding failed:', error);
  }
  return null;
}
