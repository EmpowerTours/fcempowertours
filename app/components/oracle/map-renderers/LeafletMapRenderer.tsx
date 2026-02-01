'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { MapRendererProps } from './types';
import { Loader2 } from 'lucide-react';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const LeafletMapRenderer: React.FC<MapRendererProps> = ({
  sources,
  placeDetails,
  selectedIndex,
  onSelectIndex,
  userLocation,
  directionsPolyline,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [leafletModule, setLeafletModule] = useState<any>(null);

  // Load Leaflet CSS
  useEffect(() => {
    if (document.querySelector('link[href*="leaflet"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }, []);

  // Load Leaflet JS dynamically
  useEffect(() => {
    import('leaflet').then((L) => {
      setLeafletModule(L);
    });
  }, []);

  // Initialize map
  useEffect(() => {
    if (!leafletModule || !mapRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const L = leafletModule;

    // Default center: first place with location, or user location, or NYC
    let defaultCenter: [number, number] = [40.7128, -74.006];
    for (const source of sources) {
      const details = source.placeId ? placeDetails[source.placeId] : null;
      if (details?.location) {
        defaultCenter = [details.location.lat, details.location.lng];
        break;
      }
    }
    if (userLocation) {
      defaultCenter = [userLocation.latitude, userLocation.longitude];
    }

    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION }).addTo(map);

    mapInstanceRef.current = map;
    setLoading(false);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletModule]); // Only init once when Leaflet loads

  // Add/update markers when details change
  useEffect(() => {
    if (!leafletModule || !mapInstanceRef.current) return;

    const L = leafletModule;
    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const bounds: Array<[number, number]> = [];

    sources.forEach((source, index) => {
      const details = source.placeId ? placeDetails[source.placeId] : null;
      if (!details?.location) return;

      const latlng: [number, number] = [details.location.lat, details.location.lng];
      bounds.push(latlng);

      const isSelected = index === selectedIndex;

      // Custom numbered circle marker
      const icon = L.divIcon({
        className: 'leaflet-custom-marker',
        html: `<div style="
          width: 28px; height: 28px; border-radius: 50%;
          background: ${isSelected ? '#06b6d4' : '#8b5cf6'};
          color: white; font-weight: bold; font-size: 12px;
          display: flex; align-items: center; justify-content: center;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        ">${index + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -16],
      });

      const marker = L.marker(latlng, { icon })
        .addTo(map)
        .bindPopup(`
          <div style="min-width: 180px;">
            <strong>${details.name}</strong>
            ${details.rating ? `<div style="margin-top:4px;">Rating: ${details.rating}/5</div>` : ''}
            ${details.address ? `<div style="font-size:11px; color:#666; margin-top:4px;">${details.address}</div>` : ''}
            <a href="${source.uri}" target="_blank" rel="noopener noreferrer" style="color:#0891b2; font-size:12px; margin-top:6px; display:inline-block;">View on OpenStreetMap</a>
          </div>
        `);

      marker.on('click', () => {
        onSelectIndex(index);
      });

      markersRef.current.push(marker);
    });

    // Fit bounds
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [leafletModule, placeDetails, sources, selectedIndex, onSelectIndex]);

  // Pan to selected marker
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletModule) return;

    const source = sources[selectedIndex];
    const details = source?.placeId ? placeDetails[source.placeId] : null;
    if (details?.location) {
      mapInstanceRef.current.panTo([details.location.lat, details.location.lng]);
    }

    // Update marker styles
    markersRef.current.forEach((marker, index) => {
      const isSelected = index === selectedIndex;
      const newIcon = leafletModule.divIcon({
        className: 'leaflet-custom-marker',
        html: `<div style="
          width: 28px; height: 28px; border-radius: 50%;
          background: ${isSelected ? '#06b6d4' : '#8b5cf6'};
          color: white; font-weight: bold; font-size: 12px;
          display: flex; align-items: center; justify-content: center;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        ">${index + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -16],
      });
      marker.setIcon(newIcon);
    });
  }, [selectedIndex, leafletModule, placeDetails, sources]);

  // Draw directions polyline
  useEffect(() => {
    if (!leafletModule || !mapInstanceRef.current) return;

    // Remove old polyline
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (directionsPolyline && directionsPolyline.length > 0) {
      const L = leafletModule;
      const latlngs = directionsPolyline.map((p) => [p.lat, p.lng] as [number, number]);
      const line = L.polyline(latlngs, {
        color: '#06b6d4',
        weight: 5,
        opacity: 0.85,
      }).addTo(mapInstanceRef.current);

      polylineRef.current = line;
      mapInstanceRef.current.fitBounds(line.getBounds(), { padding: [40, 40] });
    }
  }, [directionsPolyline, leafletModule]);

  return (
    <div className="relative w-full h-full min-h-[300px]">
      <div ref={mapRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeafletMapRenderer;
