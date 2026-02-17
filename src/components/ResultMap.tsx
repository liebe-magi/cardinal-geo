import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import type { City } from '../types/city';

interface ResultMapProps {
  cityA: City;
  cityB: City;
}

export function ResultMap({ cityA, cityB }: ResultMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const { lang } = useSettingsStore();

  useEffect(() => {
    if (!mapRef.current) return;

    // Cleanup existing map
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      worldCopyJump: false,
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      maxBoundsViscosity: 1.0,
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      noWrap: true,
    }).addTo(map);

    const latlngA: [number, number] = [cityA.lat, cityA.lon];
    const latlngB: [number, number] = [cityB.lat, cityB.lon];
    const labelA = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
    const labelB = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;

    L.marker(latlngA).addTo(map).bindPopup(`${labelA}<br>(Target)`).openPopup();
    L.marker(latlngB).addTo(map).bindPopup(`${labelB}<br>(Origin)`);
    L.polyline([latlngA, latlngB], { color: 'red' }).addTo(map);

    const group = new L.FeatureGroup([L.marker(latlngA), L.marker(latlngB)]);
    map.fitBounds(group.getBounds().pad(0.1));

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [cityA, cityB, lang]);

  return (
    <div
      ref={mapRef}
      className="w-full h-48 md:h-64 rounded-xl overflow-hidden my-4 border border-white/5"
    />
  );
}
