import type {
  MapProvider,
  MapProviderType,
  PlaceSearchParams,
  NormalizedPlaceDetails,
  NormalizedDirections,
  MapsSource,
  MapClientConfig,
} from './provider';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OSRM_BASE = 'https://router.project-osrm.org';
const USER_AGENT = 'EmpowerTours/1.0 (https://empowertours.xyz)';

export class OSMProvider implements MapProvider {
  type: MapProviderType = 'osm';

  async searchPlaces(params: PlaceSearchParams): Promise<MapsSource[]> {
    try {
      const searchParams = new URLSearchParams({
        q: params.query,
        format: 'json',
        addressdetails: '1',
        limit: '10',
      });

      if (params.latitude && params.longitude) {
        searchParams.set('viewbox', this.buildViewbox(params.latitude, params.longitude, params.radius || 5000));
        searchParams.set('bounded', '1');
      }

      const response = await fetch(`${NOMINATIM_BASE}/search?${searchParams}`, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        console.error('[OSM] Nominatim search failed:', response.status);
        return [];
      }

      const results: any[] = await response.json();

      // If bounded search returned few results, retry without bounding
      if (results.length < 3 && params.latitude && params.longitude) {
        const retryParams = new URLSearchParams({
          q: params.query,
          format: 'json',
          addressdetails: '1',
          limit: '10',
        });
        const retryResponse = await fetch(`${NOMINATIM_BASE}/search?${retryParams}`, {
          headers: { 'User-Agent': USER_AGENT },
        });
        if (retryResponse.ok) {
          const retryResults: any[] = await retryResponse.json();
          if (retryResults.length > results.length) {
            return this.nominatimToSources(retryResults);
          }
        }
      }

      return this.nominatimToSources(results);
    } catch (error) {
      console.error('[OSM] searchPlaces error:', error);
      return [];
    }
  }

  async getPlaceDetails(
    placeIds: string[]
  ): Promise<Record<string, NormalizedPlaceDetails>> {
    const results: Record<string, NormalizedPlaceDetails> = {};

    await Promise.all(
      placeIds.map(async (placeId) => {
        try {
          // placeId format: "N12345" (node), "W12345" (way), "R12345" (relation)
          const osmType = placeId.charAt(0);
          const osmId = placeId.substring(1);

          const typeMap: Record<string, string> = { N: 'N', W: 'W', R: 'R' };
          const osmTypeParam = typeMap[osmType] || 'N';

          const response = await fetch(
            `${NOMINATIM_BASE}/lookup?osm_ids=${osmTypeParam}${osmId}&format=json&addressdetails=1&extratags=1`,
            { headers: { 'User-Agent': USER_AGENT } }
          );

          if (!response.ok) {
            results[placeId] = { id: placeId, name: placeId };
            return;
          }

          const data: any[] = await response.json();
          if (!data[0]) {
            results[placeId] = { id: placeId, name: placeId };
            return;
          }

          const place = data[0];
          results[placeId] = {
            id: placeId,
            name: place.display_name?.split(',')[0] || place.name || placeId,
            address: place.display_name,
            types: place.type ? [place.type] : undefined,
            location:
              place.lat && place.lon
                ? { lat: parseFloat(place.lat), lng: parseFloat(place.lon) }
                : undefined,
            // OSM doesn't have ratings; extratags may have opening_hours
            openNow: undefined,
            rating: undefined,
          };
        } catch (err) {
          console.error(`[OSM] Error fetching place ${placeId}:`, err);
          results[placeId] = { id: placeId, name: placeId };
        }
      })
    );

    return results;
  }

  async getDirections(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number } | string
  ): Promise<NormalizedDirections | null> {
    try {
      // OSRM requires lng,lat order
      let destCoords: { lat: number; lng: number };

      if (typeof destination === 'string') {
        // Look up coordinates from OSM ID
        const lookupResult = await this.getPlaceDetails([destination]);
        const place = lookupResult[destination];
        if (!place?.location) return null;
        destCoords = place.location;
      } else {
        destCoords = destination;
      }

      const url = `${OSRM_BASE}/route/v1/driving/${origin.lng},${origin.lat};${destCoords.lng},${destCoords.lat}?overview=full&geometries=geojson&steps=true`;

      const response = await fetch(url);
      if (!response.ok) {
        console.error('[OSM] OSRM routing failed:', response.status);
        return null;
      }

      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes?.[0]) return null;

      const route = data.routes[0];
      const leg = route.legs[0];

      // Convert GeoJSON coordinates to polyline points
      const polyline = route.geometry?.coordinates?.map((coord: number[]) => ({
        lat: coord[1],
        lng: coord[0],
      })) || [];

      return {
        distance: this.formatDistance(route.distance),
        duration: this.formatDuration(route.duration),
        polyline,
        steps: (leg.steps || []).map((step: any) => ({
          instruction: this.buildStepInstruction(step),
          distance: this.formatDistance(step.distance),
          duration: this.formatDuration(step.duration),
        })),
      };
    } catch (error) {
      console.error('[OSM] getDirections error:', error);
      return null;
    }
  }

  getClientConfig(): MapClientConfig {
    return {
      provider: 'osm',
      tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      cssUrls: ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'],
    };
  }

  // =============================================
  // Private helpers
  // =============================================

  private nominatimToSources(results: any[]): MapsSource[] {
    return results.map((r) => ({
      uri: `https://www.openstreetmap.org/${r.osm_type?.charAt(0)?.toUpperCase() || 'N'}/${r.osm_id}`,
      title: r.display_name?.split(',')[0] || r.name || 'Unknown',
      placeId: `${(r.osm_type?.charAt(0) || 'N').toUpperCase()}${r.osm_id}`,
    }));
  }

  private buildViewbox(lat: number, lng: number, radiusMeters: number): string {
    // Approximate bounding box from center + radius
    const latDelta = radiusMeters / 111_320;
    const lngDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
    return `${lng - lngDelta},${lat + latDelta},${lng + lngDelta},${lat - latDelta}`;
  }

  private formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours} hr ${remainingMinutes} min`;
  }

  private buildStepInstruction(step: any): string {
    const maneuver = step.maneuver;
    if (!maneuver) return step.name || 'Continue';

    const modifier = maneuver.modifier ? ` ${maneuver.modifier}` : '';
    const name = step.name ? ` onto ${step.name}` : '';

    switch (maneuver.type) {
      case 'depart':
        return `Head${modifier}${name}`;
      case 'arrive':
        return `Arrive at destination${name}`;
      case 'turn':
        return `Turn${modifier}${name}`;
      case 'roundabout':
        return `Enter roundabout, take exit${name}`;
      case 'merge':
        return `Merge${modifier}${name}`;
      case 'fork':
        return `Keep${modifier}${name}`;
      default:
        return `Continue${name}`;
    }
  }
}
