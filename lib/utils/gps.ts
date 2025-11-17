/**
 * GPS Utilities for Itinerary NFT Marketplace
 * Handles distance calculations and geolocation for check-ins
 */

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param lat1 Latitude of point 1 (degrees)
 * @param lon1 Longitude of point 1 (degrees)
 * @param lat2 Latitude of point 2 (degrees)
 * @param lon2 Longitude of point 2 (degrees)
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get user's current GPS position
 * @returns Promise with latitude and longitude
 */
export async function getCurrentPosition(): Promise<{
  lat: number;
  lon: number;
  accuracy?: number;
}> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => {
        let message = 'Unable to retrieve location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied. Please enable location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out.';
            break;
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Check if user is within proximity of a location
 * @param userLat User's latitude
 * @param userLon User's longitude
 * @param targetLat Target location's latitude
 * @param targetLon Target location's longitude
 * @param radiusMeters Proximity radius in meters
 * @returns Object with isWithin boolean and distance in meters
 */
export function isWithinProximity(
  userLat: number,
  userLon: number,
  targetLat: number,
  targetLon: number,
  radiusMeters: number
): { isWithin: boolean; distance: number } {
  const distance = calculateDistance(userLat, userLon, targetLat, targetLon);
  return {
    isWithin: distance <= radiusMeters,
    distance: Math.round(distance),
  };
}

/**
 * Format distance for display
 * @param meters Distance in meters
 * @returns Formatted string (e.g., "150m" or "2.3km")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Validate GPS coordinates
 * @param lat Latitude
 * @param lon Longitude
 * @returns True if valid coordinates
 */
export function isValidCoordinates(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
