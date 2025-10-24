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

export function useGeolocation() {
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if geolocation is available
    if (!navigator.geolocation) {
      console.warn('⚠️ Geolocation API not available');
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    console.log('📍 Requesting user location...');

    const successHandler = async (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;

      console.log('✅ Got GPS coordinates:', { latitude, longitude, accuracy });

      try {
        // Use reverse geocoding to get country from coordinates
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Geocoding API returned ${response.status}`);
        }

        const geoData = await response.json();
        
        console.log('🌍 Reverse geocoding result:', geoData);

        // Extract country code from address
        const countryCode = geoData.address?.country_code?.toUpperCase() || 'US';
        const countryName = geoData.address?.country || 'United States';
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
        setLocation(locationData);
        setError(null);
      } catch (geoError) {
        console.error('❌ Reverse geocoding failed:', geoError);
        // Still set location with just coordinates
        setLocation({
          country: 'US',
          countryName: 'United States',
          latitude,
          longitude,
          accuracy,
        });
        setError('Could not determine country from coordinates');
      } finally {
        setLoading(false);
      }
    };

    const errorHandler = (err: GeolocationPositionError) => {
      console.error('❌ Geolocation error:', err.code, err.message);

      let errorMsg = 'Unable to get location';
      switch (err.code) {
        case err.PERMISSION_DENIED:
          errorMsg = 'Location permission denied. Please enable location access in your browser settings.';
          break;
        case err.POSITION_UNAVAILABLE:
          errorMsg = 'Location information is unavailable.';
          break;
        case err.TIMEOUT:
          errorMsg = 'Location request timed out.';
          break;
      }

      setError(errorMsg);
      setLoading(false);

      // Fallback to IP-based detection
      console.log('⚠️ Falling back to IP-based location detection...');
      fetchIPBasedLocation();
    };

    // Request user location with high accuracy
    navigator.geolocation.getCurrentPosition(successHandler, errorHandler, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0, // Don't use cached location
    });
  }, []);

  return { location, loading, error };
}

// Fallback: IP-based geolocation
async function fetchIPBasedLocation() {
  try {
    console.log('🌐 Using IP-based geolocation fallback...');
    const response = await fetch('/api/geo');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ IP-based location:', data);
      return data;
    }
  } catch (error) {
    console.error('❌ IP-based geolocation failed:', error);
  }
  return null;
}
