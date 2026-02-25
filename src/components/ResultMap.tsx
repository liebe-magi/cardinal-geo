import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import type { City } from '../types/city';

interface ResultMapProps {
  cityA: City;
  cityB: City;
}

function getArrowAngleDeg(map: L.Map, from: [number, number], to: [number, number]) {
  const fromPoint = map.latLngToLayerPoint(L.latLng(from[0], from[1]));
  const toPoint = map.latLngToLayerPoint(L.latLng(to[0], to[1]));
  return (Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x) * 180) / Math.PI;
}

function getArrowLatLngOnLine(
  map: L.Map,
  from: [number, number],
  to: [number, number],
  ratio: number,
) {
  const fromPoint = map.latLngToLayerPoint(L.latLng(from[0], from[1]));
  const toPoint = map.latLngToLayerPoint(L.latLng(to[0], to[1]));
  const arrowPoint = L.point(
    fromPoint.x + (toPoint.x - fromPoint.x) * ratio,
    fromPoint.y + (toPoint.y - fromPoint.y) * ratio,
  );
  return map.layerPointToLatLng(arrowPoint);
}

export function ResultMap({ cityA, cityB }: ResultMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const { lang } = useSettingsStore();

  useEffect(() => {
    if (!mapRef.current) return;

    let isMounted = true;

    // Cleanup existing map
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const rafId = requestAnimationFrame(() => {
      if (!isMounted) return;
      if (mapInstance.current) return;
      const map = L.map(mapRef.current!, {
        worldCopyJump: false,
        maxBounds: [
          [-90, -180],
          [90, 180],
        ],
        maxBoundsViscosity: 1.0,
      }).setView([0, 0], 2);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        noWrap: true,
      }).addTo(map);

      const latlngA: [number, number] = [cityA.lat, cityA.lon];
      const latlngB: [number, number] = [cityB.lat, cityB.lon];
      const labelA = lang === 'ja' ? cityA.capitalJp : cityA.capitalEn;
      const labelB = lang === 'ja' ? cityB.capitalJp : cityB.capitalEn;
      const directionColor = '#a855f7';

      const targetMarker = L.marker(latlngA, { icon: new L.Icon.Default() }).addTo(map);
      const originMarker = L.marker(latlngB, {
        icon: new L.Icon.Default({ className: 'leaflet-marker-origin-red' }),
      }).addTo(map);

      targetMarker.bindTooltip(labelA, {
        permanent: true,
        direction: 'top',
        offset: [-16, 0],
        className: 'result-map-tooltip result-map-tooltip-target',
      });
      originMarker.bindTooltip(labelB, {
        permanent: true,
        direction: 'top',
        offset: [-16, 0],
        className: 'result-map-tooltip result-map-tooltip-origin',
      });

      L.polyline([latlngB, latlngA], { color: directionColor, weight: 3 }).addTo(map);

      const arrowRatio = 0.5;
      const arrowMarker = L.marker(latlngB, {
        icon: L.divIcon({
          className: '',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          html: `<div class="result-map-arrow" style="color:${directionColor};font-size:20px;line-height:1;display:inline-block;transform-origin:50% 50%;">➤</div>`,
        }),
        interactive: false,
      }).addTo(map);

      const updateArrow = () => {
        const arrowLatLng = getArrowLatLngOnLine(map, latlngB, latlngA, arrowRatio);
        const arrowAngleDeg = getArrowAngleDeg(map, latlngB, latlngA);
        arrowMarker.setLatLng(arrowLatLng);
        const markerEl = arrowMarker.getElement();
        const arrowEl = markerEl?.querySelector('.result-map-arrow') as HTMLElement | null;
        if (arrowEl) {
          arrowEl.style.transform = `rotate(${arrowAngleDeg}deg)`;
        }
      };

      updateArrow();
      map.on('zoom move', updateArrow);

      const bounds = L.latLngBounds([latlngA, latlngB]);

      // Delay fitBounds to let Leaflet paint
      setTimeout(() => {
        if (mapInstance.current === map) {
          map.fitBounds(bounds.pad(0.1));
          updateArrow();
        }
      }, 50);

      mapInstance.current = map;
    });

    return () => {
      isMounted = false;
      cancelAnimationFrame(rafId);
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
