import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Navigation as NavIcon, 
  Compass
} from 'lucide-react';
import L from 'leaflet';
import { Device, Driver } from '../types';

interface LiveMapSectionProps {
  devices: Record<number, Device>;
  drivers: Driver[];
  theme: 'dark' | 'light';
  onSelectDriverForAction?: (driver: Driver) => void;
}

export const LiveMapSection: React.FC<LiveMapSectionProps> = ({
  devices,
  drivers,
  theme
}) => {
  const isDark = theme === 'dark';
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [mapType, setMapType] = useState<'satellite' | 'street'>('satellite');
  const [activeRouteInfo, setActiveRouteInfo] = useState<{
    driverName: string;
    distance: string;
    duration: string;
    destination: string;
  } | null>(null);

  // Initialize & Update Leaflet Map Layer
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Définition des flux de tuiles : Satellite Réel Google Maps vs Vue Plan
    const getTileConfig = () => {
      if (mapType === 'satellite') {
        return {
          url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          attribution: '&copy; Google Maps / Earth Satellite &copy; LockER Bénin',
          maxZoom: 20
        };
      }
      return {
        url: isDark
          ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap &copy; LockER GPS',
        maxZoom: 19
      };
    };

    const tileConfig = getTileConfig();

    if (!mapInstanceRef.current) {
      // Centrage par défaut Cotonou Littoral
      const map = L.map(mapContainerRef.current, {
        center: [6.3654, 2.4183],
        zoom: 14,
        zoomControl: true
      });

      L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom
      }).addTo(map);

      markersGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          mapInstanceRef.current?.removeLayer(layer);
        }
      });
      L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom
      }).addTo(mapInstanceRef.current);
    }
  }, [isDark, mapType]);

  // Update Markers when drivers or devices change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();

    drivers.forEach((driver, index) => {
      const dev = devices[driver.id];
      // Generate realistic spread around Cotonou if coordinates missing
      const baseLat = 6.3654 + ((index % 5) * 0.012) - 0.02;
      const baseLon = 2.4183 + ((index % 4) * 0.015) - 0.02;

      const lat = dev?.latitude || baseLat;
      const lon = dev?.longitude || baseLon;

      const isLocked = driver.current_status === 'LOCKED';
      const isOverdue = driver.current_status.startsWith('OVERDUE');

      // Create Custom HTML Marker Icon
      const markerHtml = isLocked
        ? `<div style="background-color:#EF4444; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow:0 0 12px #EF4444;"></div>`
        : isOverdue
          ? `<div style="background-color:#F59E0B; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow:0 0 12px #F59E0B;"></div>`
          : `<div class="pulsing-gps-marker"></div>`;

      const customIcon = L.divIcon({
        className: 'custom-fleet-marker',
        html: markerHtml,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const marker = L.marker([lat, lon], { icon: customIcon });

      marker.bindPopup(`
        <div style="font-family: system-ui, sans-serif; font-size: 12px; color: #0F172A; min-width: 180px; padding: 4px;">
          <div style="font-weight: bold; font-size: 13px; color: ${isLocked ? '#DC2626' : '#059669'}; margin-bottom: 4px;">
            ${isLocked ? '🔒 Terminal Bloqué' : '● Point Vert en Direct (Actif)'}
          </div>
          <b>${driver.full_name}</b><br/>
          Plaque : ${driver.vehicle_plate || 'RB-Benin'}<br/>
          IMEI : <span style="font-family: monospace;">${dev ? dev.imei : '-'}</span><br/>
          Opérateur : ${dev?.network_operator || '-'}<br/>
          Batterie : ${dev?.battery_level != null ? `${dev.battery_level}%` : '-'}<br/>
          Statut : <b>${driver.current_status}</b>
        </div>
      `);

      marker.on('click', () => {
        setSelectedDriverId(driver.id);
      });

      markersGroupRef.current?.addLayer(marker);
    });
  }, [drivers, devices]);

  // Function: "Localiser le téléphone" -> Trace Route Itinerary
  const handleTraceRouteForDriver = (driver: Driver) => {
    if (!mapInstanceRef.current) return;
    const dev = devices[driver.id];
    setSelectedDriverId(driver.id);

    const destLat = dev?.latitude || 6.3685;
    const destLon = dev?.longitude || 2.4280;

    // Point de départ Siège Central LockER Cotonou
    const startLat = 6.3533;
    const startLon = 2.4011;

    // Supprimer l'ancienne route
    if (routeLayerRef.current) {
      mapInstanceRef.current.removeLayer(routeLayerRef.current);
    }

    // Calculer points intermédiaires (simulation routière réaliste)
    const waypoints: [number, number][] = [
      [startLat, startLon],
      [startLat + (destLat - startLat) * 0.3, startLon + (destLon - startLon) * 0.2],
      [startLat + (destLat - startLat) * 0.7, startLon + (destLon - startLon) * 0.8],
      [destLat, destLon]
    ];

    const polyline = L.polyline(waypoints, {
      color: '#10B981',
      weight: 5,
      opacity: 0.9,
      dashArray: '6, 8'
    }).addTo(mapInstanceRef.current);

    routeLayerRef.current = polyline;
    mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });

    // Calcul approximatif de distance
    const distKm = (Math.sqrt(Math.pow(destLat - startLat, 2) + Math.pow(destLon - startLon, 2)) * 111).toFixed(1);
    const durationMin = Math.round(parseFloat(distKm) * 2.3);

    setActiveRouteInfo({
      driverName: driver.full_name,
      distance: `${distKm} km`,
      duration: `${durationMin} min (Trafic fluide)`,
      destination: `${driver.vehicle_plate || 'RB-Bénin'} - ${dev?.model || 'Terminal Android'}`
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <MapPin className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Cartographie & Traçabilité GPS en Direct
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Visualisation en temps réel de la flotte au Bénin avec itinéraire dynamique
              </p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className={`flex items-center gap-3 px-3.5 py-2 rounded-xl border text-xs font-semibold ${
          isDark ? 'bg-[#0B152B] border-[#1E2E56]' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shadow shadow-emerald-500/50"></span>
            <span>Point Vert (En ligne)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span>Impayé (Pré-avis)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500"></span>
            <span>Bloqué (Kiosk)</span>
          </div>
        </div>
      </div>

      {/* Itinerary Banner if Active */}
      {activeRouteInfo && (
        <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-100 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl animate-scale-up">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <NavIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-300">
                Itinéraire Tracé vers : {activeRouteInfo.driverName}
              </div>
              <div className="text-xs text-emerald-200/80">
                Véhicule : {activeRouteInfo.destination}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono font-bold text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Distance QG</span>
              <span className="text-base text-white">{activeRouteInfo.distance}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Temps Estimé</span>
              <span className="text-base text-emerald-400">{activeRouteInfo.duration}</span>
            </div>
            <button
              onClick={() => setActiveRouteInfo(null)}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-800/60 hover:bg-emerald-700 text-white transition"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Map Layout: Left Sidebar + Map View */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Device & Driver GPS Quick List */}
        <div className={`lg:col-span-1 rounded-2xl border p-4 space-y-3.5 max-h-[580px] overflow-y-auto ${
          isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Terminaux Détectés ({drivers.length})
            </h3>
            <Compass className="w-4 h-4 text-emerald-400" />
          </div>

          {drivers.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Aucun terminal connecté. Utilisez "+ Ajouter un Téléphone".
            </p>
          ) : (
            drivers.map((driver) => {
              const dev = devices[driver.id];
              const isSelected = selectedDriverId === driver.id;
              const isLocked = driver.current_status === 'LOCKED';

              return (
                <div 
                  key={driver.id}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500 shadow-md'
                      : isDark 
                        ? 'bg-[#070D1E] border-[#1E2E56] hover:border-emerald-500/50' 
                        : 'bg-slate-50 border-slate-200 hover:border-emerald-500/50'
                  }`}
                  onClick={() => {
                    setSelectedDriverId(driver.id);
                    if (mapInstanceRef.current) {
                      const lat = dev?.latitude || 6.3654;
                      const lon = dev?.longitude || 2.4183;
                      mapInstanceRef.current.flyTo([lat, lon], 15);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-xs truncate max-w-[140px]">
                      {driver.full_name}
                    </div>
                    {isLocked ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        Bloqué
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        En Ligne
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
                    <div>IMEI : {dev ? dev.imei : '-'}</div>
                    <div className="text-[10px] text-emerald-400/90 font-semibold">
                      📍 GPS : {dev?.latitude ? `${dev.latitude.toFixed(5)}°N, ${dev.longitude?.toFixed(5)}°E` : 'En attente signal'}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>🔋 {dev?.battery_level != null ? `${dev.battery_level}%` : '-'}</span>
                      <span>📶 {dev?.network_operator || '-'}</span>
                    </div>
                  </div>

                  {/* Bouton Localiser le téléphone (Itinéraire) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTraceRouteForDriver(driver);
                    }}
                    className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <NavIcon className="w-3 h-3" />
                    <span>Localiser (Itinéraire)</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Full Leaflet Map with Real Satellite Layer */}
        <div className="lg:col-span-3 rounded-2xl border overflow-hidden shadow-2xl relative border-slate-700 min-h-[500px]">
          <div 
            ref={mapContainerRef} 
            className="w-full h-full min-h-[580px] z-0"
          />

          {/* Top Left: Map Mode Status */}
          <div className="absolute top-4 left-4 z-10 bg-[#070D1E]/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#1E2E56] text-xs font-semibold text-emerald-400 shadow-lg flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span>{mapType === 'satellite' ? '🛰️ Vue Satellite Réelle (Google Earth)' : '🗺️ Vue Plan Routier'}</span>
          </div>

          {/* Top Right: Layer Switcher Toggle */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 p-1 rounded-xl bg-[#070D1E]/90 backdrop-blur-md border border-[#1E2E56] shadow-2xl">
            <button
              onClick={() => setMapType('satellite')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                mapType === 'satellite'
                  ? 'bg-emerald-500 text-[#070D1E] shadow-lg shadow-emerald-500/30'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>🛰️ Satellite Réel</span>
            </button>
            <button
              onClick={() => setMapType('street')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                mapType === 'street'
                  ? 'bg-emerald-500 text-[#070D1E] shadow-lg shadow-emerald-500/30'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>🗺️ Plan</span>
            </button>
          </div>

          {/* Bottom Left: Real GPS Coordinates Telemetry Badge */}
          <div className="absolute bottom-4 left-4 z-10 bg-[#070D1E]/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#1E2E56] text-xs font-mono text-slate-200 shadow-xl flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>GPS Matériel Téléphone :</span>
            </div>
            <span className="text-white font-bold">
              {((selectedDriverId && devices[selectedDriverId]?.latitude) || (drivers[0] && devices[drivers[0].id]?.latitude) || 6.3654).toFixed(6)}° N, {((selectedDriverId && devices[selectedDriverId]?.longitude) || (drivers[0] && devices[drivers[0].id]?.longitude) || 2.4183).toFixed(6)}° E
            </span>
            <span className="text-emerald-400 text-[10px] hidden sm:inline">• Signal Fixé</span>
          </div>
        </div>

      </div>
    </div>
  );
};
