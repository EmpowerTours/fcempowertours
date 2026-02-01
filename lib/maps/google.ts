import type {
  MapProvider,
  MapProviderType,
  PlaceSearchParams,
  NormalizedPlaceDetails,
  NormalizedDirections,
  MapsSource,
  MapClientConfig,
} from './provider';

const GOOGLE_MAPS_SERVER_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export class GoogleMapsProvider implements MapProvider {
  type: MapProviderType = 'google';

  async searchPlaces(params: PlaceSearchParams): Promise<MapsSource[]> {
    if (!GOOGLE_MAPS_SERVER_KEY) {
      console.error('[GoogleMaps] No API key configured');
      return [];
    }

    try {
      const body: any = {
        textQuery: params.query,
      };

      if (params.latitude && params.longitude) {
        body.locationBias = {
          circle: {
            center: { latitude: params.latitude, longitude: params.longitude },
            radius: params.radius || 5000,
          },
        };
      }

      const response = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_SERVER_KEY,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        console.error('[GoogleMaps] Text search failed:', response.status);
        return [];
      }

      const data = await response.json();
      return (data.places || []).map((place: any) => ({
        uri: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        title: place.displayName?.text || 'Unknown',
        placeId: place.id,
      }));
    } catch (error) {
      console.error('[GoogleMaps] searchPlaces error:', error);
      return [];
    }
  }

  async getPlaceDetails(
    placeIds: string[]
  ): Promise<Record<string, NormalizedPlaceDetails>> {
    if (!GOOGLE_MAPS_SERVER_KEY) {
      return {};
    }

    const results: Record<string, NormalizedPlaceDetails> = {};

    await Promise.all(
      placeIds.map(async (placeId) => {
        try {
          const fields =
            'displayName,rating,userRatingCount,formattedAddress,types,currentOpeningHours,photos,location';
          const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&key=${GOOGLE_MAPS_SERVER_KEY}`;

          const response = await fetch(url, {
            headers: { 'X-Goog-FieldMask': fields },
          });

          if (!response.ok) {
            results[placeId] = { id: placeId, name: placeId };
            return;
          }

          const data = await response.json();

          let photoUrl: string | undefined;
          if (data.photos?.[0]?.name) {
            photoUrl = `https://places.googleapis.com/v1/${data.photos[0].name}/media?maxWidthPx=400&key=${GOOGLE_MAPS_SERVER_KEY}`;
          }

          results[placeId] = {
            id: placeId,
            name: data.displayName?.text || placeId,
            rating: data.rating,
            userRatingsTotal: data.userRatingCount,
            address: data.formattedAddress,
            types: data.types,
            openNow: data.currentOpeningHours?.openNow,
            photoUrl,
            location: data.location
              ? { lat: data.location.latitude, lng: data.location.longitude }
              : undefined,
          };
        } catch (err) {
          console.error(`[GoogleMaps] Error fetching place ${placeId}:`, err);
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
    if (!GOOGLE_MAPS_SERVER_KEY) return null;

    try {
      const destStr =
        typeof destination === 'string'
          ? `place_id:${destination}`
          : `${destination.lat},${destination.lng}`;

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destStr}&key=${GOOGLE_MAPS_SERVER_KEY}`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      if (data.status !== 'OK' || !data.routes?.[0]) return null;

      const leg = data.routes[0].legs[0];
      return {
        distance: leg.distance?.text || '',
        duration: leg.duration?.text || '',
        steps: (leg.steps || []).map((step: any) => ({
          instruction: (step.html_instructions || '').replace(/<[^>]*>/g, ''),
          distance: step.distance?.text || '',
          duration: step.duration?.text || '',
        })),
      };
    } catch (error) {
      console.error('[GoogleMaps] getDirections error:', error);
      return null;
    }
  }

  getClientConfig(): MapClientConfig {
    return {
      provider: 'google',
      scriptUrl: `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=marker`,
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    };
  }
}
