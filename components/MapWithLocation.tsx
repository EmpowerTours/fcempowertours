'use client';

import { useEffect, useRef } from 'react';

interface MapWithLocationProps {
  latitude: number;
  longitude: number;
  radius: number; // in meters
}

export default function MapWithLocation({ latitude, longitude, radius }: MapWithLocationProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Load Leaflet dynamically (client-side only)
    import('leaflet').then((L) => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      if (!mapRef.current) return;

      // Create map
      const map = L.map(mapRef.current).setView([latitude, longitude], 16);

      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Add marker
      const icon = L.icon({
        iconUrl: '/marker-icon.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: '/marker-shadow.png',
        shadowSize: [41, 41],
      });

      L.marker([latitude, longitude], { icon }).addTo(map)
        .bindPopup('Experience Location')
        .openPopup();

      // Add radius circle
      L.circle([latitude, longitude], {
        color: '#8b5cf6',
        fillColor: '#8b5cf6',
        fillOpacity: 0.2,
        radius: radius,
      }).addTo(map).bindPopup(`Check-in radius: ${radius}m`);

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }
    };
  }, [latitude, longitude, radius]);

  return (
    <div ref={mapRef} className="w-full h-full">
      {/* Map renders here */}
    </div>
  );
}
