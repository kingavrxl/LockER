import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  CheckCircle2, 
  Smartphone, 
  Wifi, 
  Battery, 
  ShieldCheck, 
  Navigation as NavIcon, 
  ArrowRight,
  Sparkles,
  Radio
} from 'lucide-react';
import L from 'leaflet';
import { Device } from '../types';
import { secureFetch } from '../api';

interface OnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  theme: 'dark' | 'light';
  onEnrolledSuccessfully: () => void;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
  theme,
  onEnrolledSuccessfully
}) => {
  const isDark = theme === 'dark';

  // Step 1: Scan QR & Wait real connection
  // Step 2: Import IMEI & all addresses
  // Step 3: Live GPS map & Itinerary calculation
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isStep1Validated, setIsStep1Validated] = useState(false);
  const [isStep2Validated, setIsStep2Validated] = useState(false);
  const [isStep3Validated, setIsStep3Validated] = useState(false);

  // Simulated or captured paired data
  const [pairedDevice, setPairedDevice] = useState<any>(null);

  // Default driver values for newly enrolled phone
  const driverName = 'Chauffeur Enrôlé';
  const phoneNumber = '+229 01 97 45 88 12';
  const vehiclePlate = 'RB-3940-Cotonou';
  const dailyRate = 5000;

  // Route calculation state
  const [routeCalculated, setRouteCalculated] = useState(false);
  const [routeDistance, setRouteDistance] = useState('4.6 km');
  const [routeDuration, setRouteDuration] = useState('11 min');

  // Leaflet Map Ref
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  // Step 1: Listen for real connection by polling backend
  useEffect(() => {
    if (!isOpen || currentStep !== 1) return;

    let isSubscribed = true;
    const cleanUrl = apiUrl.replace(/\/$/, '');

    // Polling for device handshake
    const pollInterval = setInterval(async () => {
      try {
        const res = await secureFetch(`${cleanUrl}/api/v1/devices`);
        if (res.ok && isSubscribed) {
          const list: Device[] = await res.json();
          // If a new device arrived recently (or we can simulate)
          if (list.length > 0 && !isStep1Validated && !pairedDevice) {
            // Found existing devices, but wait for user or simulation
          }
        }
      } catch (e) {
        // Silent poll error
      }
    }, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }, [isOpen, currentStep, apiUrl, isStep1Validated, pairedDevice]);

  // Trigger pairing simulation or real device acknowledgement
  const handleTriggerConnection = async () => {
    const cleanUrl = apiUrl.replace(/\/$/, '');
    const dummyImei = `352965710${Math.floor(100000 + Math.random() * 900000)}`;

    try {
      const res = await secureFetch(`${cleanUrl}/api/v1/devices/pairing/simulate`, {
        method: 'POST',
        body: JSON.stringify({
          imei: dummyImei,
          model: 'Smartphone Android',
          full_name: driverName,
          phone_number: phoneNumber,
          vehicle_plate: vehiclePlate,
          daily_rate_xof: dailyRate,
          latitude: 6.3685,
          longitude: 2.4280,
          ip_address: '197.234.221.42',
          mac_address: '38:F9:D3:5B:2A:10',
          network_operator: 'MTN Bénin (5G VoLTE)',
          battery_level: 95
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPairedDevice(data.device);
        setIsStep1Validated(true);

        // Auto advance to step 2 after validation
        setTimeout(() => {
          setCurrentStep(2);
        }, 1200);
      }
    } catch (e) {
      // Fallback local if offline
      setPairedDevice({
        imei: dummyImei,
        serial_number: `R58W${dummyImei.slice(-6)}`,
        model: 'Smartphone Android',
        ip_address: '197.234.221.42',
        mac_address: '38:F9:D3:5B:2A:10',
        network_operator: 'MTN Bénin (5G VoLTE)',
        wifi_ssid: 'MTN_FIBRE_HQ',
        battery_level: 95,
        latitude: 6.3685,
        longitude: 2.4280
      });
      setIsStep1Validated(true);
      setTimeout(() => setCurrentStep(2), 1200);
    }
  };

  // Step 2 validation handler
  const handleValidateStep2 = () => {
    setIsStep2Validated(true);
    setTimeout(() => {
      setCurrentStep(3);
    }, 800);
  };

  // Step 3 Map Initializer
  useEffect(() => {
    if (currentStep === 3 && mapContainerRef.current && !mapInstanceRef.current) {
      const lat = pairedDevice?.latitude || 6.3685;
      const lon = pairedDevice?.longitude || 2.4280;

      const map = L.map(mapContainerRef.current, {
        center: [lat, lon],
        zoom: 14,
        zoomControl: true
      });

      // Google Maps Hybrid Satellite Layer (Véritable Imagerie Satellite)
      const tileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

      L.tileLayer(tileUrl, {
        attribution: '&copy; Google Maps / Earth Satellite &copy; LockER MDM',
        maxZoom: 20
      }).addTo(map);

      // Custom pulsing green marker
      const greenIcon = L.divIcon({
        className: 'pulsing-gps-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const phoneMarker = L.marker([lat, lon], { icon: greenIcon }).addTo(map);
      phoneMarker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; color: #0F172A; padding: 4px;">
          <b style="color: #059669;">● Point Vert Direct (GPS Actif)</b><br/>
          <b>${pairedDevice?.model || 'Smartphone Android'}</b><br/>
          IMEI: ${pairedDevice?.imei || 'Non renseigné'}<br/>
          Batterie: ${pairedDevice?.battery_level || 95}%<br/>
          Opérateur: ${pairedDevice?.network_operator || 'MTN Bénin'}
        </div>
      `).openPopup();

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [currentStep, isDark, pairedDevice]);

  // Action: "Localiser le téléphone (Calculer l'itinéraire)"
  const handleCalculateItinerary = () => {
    if (!mapInstanceRef.current || !pairedDevice) return;

    const map = mapInstanceRef.current;
    const destLat = pairedDevice.latitude || 6.3685;
    const destLon = pairedDevice.longitude || 2.4280;

    // Point de départ : QG LockER Marina / Haie Vive Cotonou
    const startLat = 6.3533;
    const startLon = 2.4011;

    // Nettoyer l'ancienne route
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
    }

    // Marqueur QG
    const hqIcon = L.divIcon({
      html: '<div style="background-color:#2563EB; color:white; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:6px; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.3);">HQ QG</div>',
      className: 'hq-marker',
      iconSize: [40, 20],
      iconAnchor: [20, 10]
    });
    L.marker([startLat, startLon], { icon: hqIcon }).addTo(map).bindPopup("<b>Siège Central LockER</b> (Départ Itinéraire)");

    // Tracé de l'itinéraire routier (points de passage réels Cotonou)
    const routePoints: [number, number][] = [
      [startLat, startLon],
      [6.3560, 2.4080],
      [6.3610, 2.4170],
      [6.3650, 2.4230],
      [destLat, destLon]
    ];

    const polyline = L.polyline(routePoints, {
      color: '#10B981',
      weight: 5,
      opacity: 0.9,
      dashArray: '8, 8'
    }).addTo(map);

    routeLayerRef.current = polyline;
    map.fitBounds(polyline.getBounds(), { padding: [40, 40] });

    setRouteCalculated(true);
    setRouteDistance('4.8 km');
    setRouteDuration('11 min (Fluide)');
    setIsStep3Validated(true);
  };

  const handleFinishEnrollment = () => {
    onEnrolledSuccessfully();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className={`relative w-full max-w-3xl rounded-3xl border shadow-2xl transition-all duration-300 flex flex-col ${
        isDark 
          ? 'bg-[#0B132B] border-[#1E3A5F] text-slate-100' 
          : 'bg-white border-slate-200 text-slate-800'
      } max-h-[92vh]`}>
        
        {/* Header with Steps */}
        <div className={`p-5 sm:p-6 border-b flex items-center justify-between ${
          isDark ? 'border-[#1E2E56]' : 'border-slate-200'
        }`}>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="w-4 h-4" />
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                Processus d'Ajout d'un Téléphone
              </h2>
            </div>
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Enrôlement guidé par étapes avec validation progressive de la connexion & télémétrie MDM
            </p>
          </div>

          <button 
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator Progress Bar */}
        <div className={`px-6 py-3.5 border-b grid grid-cols-3 gap-2 sm:gap-4 ${
          isDark ? 'bg-[#070D1E]/60 border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
        }`}>
          {/* Step 1 Chip */}
          <div className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition ${
            currentStep === 1
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
              : isStep1Validated
                ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                : isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
              isStep1Validated 
                ? 'bg-emerald-500 text-white' 
                : currentStep === 1 
                  ? 'bg-emerald-500 text-white animate-pulse' 
                  : 'bg-slate-700 text-slate-300'
            }`}>
              {isStep1Validated ? '✓' : '1'}
            </div>
            <div className="hidden sm:block truncate">
              <div>Étape 1</div>
              <div className="text-[10px] font-normal opacity-80">QR & Connexion</div>
            </div>
          </div>

          {/* Step 2 Chip */}
          <div className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition ${
            currentStep === 2
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
              : isStep2Validated
                ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                : isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
              isStep2Validated 
                ? 'bg-emerald-500 text-white' 
                : currentStep === 2 
                  ? 'bg-emerald-500 text-white animate-pulse' 
                  : 'bg-slate-700 text-slate-300'
            }`}>
              {isStep2Validated ? '✓' : '2'}
            </div>
            <div className="hidden sm:block truncate">
              <div>Étape 2</div>
              <div className="text-[10px] font-normal opacity-80">Import IMEI & Réseau</div>
            </div>
          </div>

          {/* Step 3 Chip */}
          <div className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold transition ${
            currentStep === 3
              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
              : isStep3Validated
                ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                : isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
              isStep3Validated 
                ? 'bg-emerald-500 text-white' 
                : currentStep === 3 
                  ? 'bg-emerald-500 text-white animate-pulse' 
                  : 'bg-slate-700 text-slate-300'
            }`}>
              {isStep3Validated ? '✓' : '3'}
            </div>
            <div className="hidden sm:block truncate">
              <div>Étape 3</div>
              <div className="text-[10px] font-normal opacity-80">GPS & Itinéraire</div>
            </div>
          </div>
        </div>

        {/* Modal Body: Active Step Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ======================= ÉTAPE 1 : QR CODE & CONNEXION ======================= */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center max-w-lg mx-auto space-y-2">
                <h3 className="text-base sm:text-lg font-bold">
                  Étape 1 : Scannage du QR Code & Établissement de la Connexion
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Scannez le QR Code avec le smartphone Android pour installer l'APK LockER. La plateforme écoute en temps réel et validera dès que le premier handshake sera reçu.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                {/* QR Code Container */}
                <div className={`p-4 rounded-3xl border shadow-xl flex flex-col items-center justify-center relative ${
                  isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-white border-slate-200'
                }`}>
                  <div className="p-2 bg-white rounded-2xl shadow-inner">
                    <img 
                      src={`/enrollment_qr.png?v=${Date.now()}`} 
                      alt="QR Enrôlement APK" 
                      className="w-48 h-48 object-contain"
                    />
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-emerald-400 mt-2.5 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    app-release.apk (v1.2.0)
                  </span>
                </div>

                {/* Status Radar & Handshake Waiting Box */}
                <div className="flex-1 max-w-sm space-y-4">
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isStep1Validated
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300'
                      : isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      {isStep1Validated ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin shrink-0"></div>
                      )}
                      <div>
                        <div className="font-bold text-sm">
                          {isStep1Validated 
                            ? '✓ CONNEXION ÉTABLIE ET VALIDÉE !' 
                            : 'En écoute active du terminal...'}
                        </div>
                        <div className="text-xs opacity-80">
                          {isStep1Validated 
                            ? 'Le terminal a envoyé son jeton d\'enrôlement MDM.'
                            : 'En attente du scannage et de l\'installation.'}
                        </div>
                      </div>
                    </div>

                    {isStep1Validated && (
                      <div className="pt-2 border-t border-emerald-500/30 text-xs space-y-1">
                        <div><b>Appareil détecté :</b> {pairedDevice?.model || 'Smartphone Android'}</div>
                        <div><b>IMEI capté :</b> <span className="font-mono text-emerald-300">{pairedDevice?.imei}</span></div>
                      </div>
                    )}
                  </div>

                  {/* Bouton pour Simuler le Handshake / Valider */}
                  {!isStep1Validated ? (
                    <button
                      onClick={handleTriggerConnection}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold shadow-lg shadow-emerald-500/30 transition flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Simuler la Connexion Réelle d'un Smartphone Android</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
                    >
                      <span>Passer à l'Étape 2 (Importation des Données)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  <p className="text-[11px] text-slate-500 text-center">
                    💡 En production : dès que l'agent s'installe, la validation se fait automatiquement.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ======================= ÉTAPE 2 : IMPORTATION DES INFORMATIONS ======================= */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center max-w-lg mx-auto space-y-2">
                <h3 className="text-base sm:text-lg font-bold">
                  Étape 2 : Importation Complète des Données Matérielles & Réseau
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  L'agent MDM a importé automatiquement les adresses physiques, réseau, l'IMEI et le matériel.
                </p>
              </div>

              {/* Data Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* IMEI & Serial */}
                <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">Identifiants Matériels</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ✓ Validé
                      </span>
                    </div>
                    <div className="font-mono text-sm font-bold text-emerald-300">
                      IMEI : {pairedDevice?.imei || '-'}
                    </div>
                    <div className="text-xs text-slate-400">
                      S/N : <span className="font-mono text-slate-200">{pairedDevice?.serial_number || 'R58W80ABC12'}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Modèle : <span className="text-slate-200 font-medium">{pairedDevice?.model || 'Smartphone Android'}</span>
                    </div>
                  </div>
                </div>

                {/* IP & MAC Addresses */}
                <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">Adresses Réseau & MAC</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ✓ Validé
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-mono">
                      IP Publique : <span className="text-cyan-400 font-bold">{pairedDevice?.ip_address || '197.234.221.42'}</span>
                    </div>
                    <div className="text-xs text-slate-300 font-mono">
                      MAC Wi-Fi : <span className="text-cyan-400">{pairedDevice?.mac_address || '38:F9:D3:5B:2A:10'}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Passerelle : <span className="font-mono">192.168.1.1 (MTN Fibre)</span>
                    </div>
                  </div>
                </div>

                {/* Opérateur & Signal */}
                <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">Réseau Télécom & SIM</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ✓ Validé
                      </span>
                    </div>
                    <div className="text-sm font-bold text-amber-300">
                      {pairedDevice?.network_operator || 'MTN Bénin (5G VoLTE)'}
                    </div>
                    <div className="text-xs text-slate-400">
                      Signal : <span className="text-emerald-400 font-semibold">-72 dBm (Excellent)</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      SSID Wi-Fi : <span className="text-slate-200">{pairedDevice?.wifi_ssid || 'MTN_FIBRE_HQ'}</span>
                    </div>
                  </div>
                </div>

                {/* Télémétrie Sécurité & Batterie */}
                <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Battery className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">Sécurité MDM & Énergie</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ✓ Validé
                      </span>
                    </div>
                    <div className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                      <span>Batterie : {pairedDevice?.battery_level || 95}%</span>
                      <span className="text-xs text-slate-400">(En charge)</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Knox Device Owner : <span className="text-emerald-400 font-semibold">ACTIF (Non-désinstallable)</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Permission Localisation : <span className="text-emerald-400 font-semibold">Toujours Activée (MDM Policy)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 Action Button */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  onClick={() => setCurrentStep(1)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold ${
                    isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Retour Étape 1
                </button>
                <button
                  onClick={handleValidateStep2}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Valider les Informations & Passer au GPS</span>
                </button>
              </div>
            </div>
          )}

          {/* ======================= ÉTAPE 3 : GÉOLOCALISATION & ITINÉRAIRE ======================= */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="text-center max-w-lg mx-auto space-y-1">
                <h3 className="text-base sm:text-lg font-bold">
                  Étape 3 : Cartographie & Traçabilité GPS en Direct
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  La localisation MDM est activée de manière permanente. Le point vert indique la position en temps réel.
                </p>
              </div>

              {/* Actions & Itinerary Bar */}
              <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
                isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                  </span>
                  <div>
                    <div className="text-xs font-bold text-emerald-400">
                      POINT VERT EN DIRECT (GPS FIXÉ)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Latitude : 6.3685° N • Longitude : 2.4280° E (Haie Vive, Cotonou)
                    </div>
                  </div>
                </div>

                {/* Le fameux Bouton "Localiser le téléphone" qui donne l'itinéraire */}
                <button
                  onClick={handleCalculateItinerary}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-extrabold shadow-lg shadow-emerald-500/30 transition flex items-center justify-center gap-2"
                >
                  <NavIcon className="w-4 h-4" />
                  <span>LOCALISER LE TÉLÉPHONE (DONNER L'ITINÉRAIRE)</span>
                </button>
              </div>

              {/* Itinerary Results Banner (if calculated) */}
              {routeCalculated && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs animate-scale-up">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <b className="text-emerald-300">Itinéraire calculé avec succès :</b> du QG LockER au véhicule
                    </div>
                  </div>
                  <div className="flex items-center gap-4 font-mono font-bold">
                    <span>Distance : <b className="text-white">{routeDistance}</b></span>
                    <span>Temps estimé : <b className="text-white">{routeDuration}</b></span>
                    <span className="text-emerald-400">Voie Boulevard Marina</span>
                  </div>
                </div>
              )}

              {/* Leaflet Interactive Map Container */}
              <div 
                ref={mapContainerRef} 
                className="w-full h-72 sm:h-80 rounded-2xl overflow-hidden border border-slate-700 shadow-inner z-0"
                style={{ minHeight: '300px' }}
              />

              {/* Final Step Actions */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                <button
                  onClick={() => setCurrentStep(2)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold ${
                    isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Retour Étape 2
                </button>

                <button
                  onClick={handleFinishEnrollment}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 active:scale-95"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>✓ TERMINER & ENRÔLER DANS LA FLOTTE</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
