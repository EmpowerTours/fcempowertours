export interface MapRendererProps {
  sources: Array<{
    uri: string;
    title: string;
    placeId?: string;
  }>;
  placeDetails: Record<
    string,
    {
      name: string;
      rating?: number;
      userRatingsTotal?: number;
      address?: string;
      types?: string[];
      openNow?: boolean;
      photoUrl?: string;
      location?: { lat: number; lng: number };
    }
  >;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  userLocation?: { latitude: number; longitude: number };
  directionsPolyline?: Array<{ lat: number; lng: number }>;
}
