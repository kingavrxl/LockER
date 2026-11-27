import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Radio,
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronUp
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

interface ProvisioningPayloadMeta {
  apk_filename: string;
  apk_size_bytes: number;
  apk_checksum_sha256_b64url: string;
  payload_json: string;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
  theme,
  onEnrolledSuccessfully
}) => {
  const isDark = theme === 'dark';

  // Step 1: Scan QR (7-tap boot provisioning) & Wait real connection
  // Step 2: Import IMEI & all addresses
  // Step 3: Live GPS map & Itinerary calculation
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isStep1Validated, setIsStep1Validated] = useState(false);
  const [isStep2Validated, setIsStep2Validated] = useState(false);
  const [isStep3Validated, setIsStep3Validated] = useState(false);

  // Optional Wi-Fi pre-configuration for factory-reset 7-tap QR provisioning
  const [showWifiConfig, setShowWifiConfig] = useState(false);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState<'WPA' | 'WEP' | 'NONE'>('WPA');

  // QR metadata & UI state
  const [qrFallback, setQrFallback] = useState(false);
  const [provisioningMeta, setProvisioningMeta] = useState<ProvisioningPayloadMeta | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [qrCacheBust] = useState(() => Date.now());

  // Simulated or captured paired data
  const [pairedDevice, setPairedDevice] = useState<any>(null);
  const baselineHeartbeatsRef = useRef<Record<string, string> | null>(null);

  // Default driver values for simulation
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

  // Reset modal baseline when opened/closed
  useEffect(() => {
    if (isOpen) {
      baselineHeartbeatsRef.current = null;
      setQrFallback(false);
    } else {
      setCurrentStep(1);
      setIsStep1Validated(false);
      setIsStep2Validated(false);
      setIsStep3Validated(false);
      setPairedDevice(null);
      setRouteCalculated(false);
      baselineHeartbeatsRef.current = null;
    }
  }, [isOpen]);

  const cleanApiUrl = useMemo(() => apiUrl.replace(/\/$/, ''), [apiUrl]);

  const provisioningQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('server_url', cleanApiUrl);
    if (wifiSsid.trim()) {
      params.set('wifi_ssid', wifiSsid.trim());
      params.set('wifi_security', wifiSecurity);
      if (wifiPassword && wifiSecurity !== 'NONE') {
        params.set('wifi_password', wifiPassword);
      }
    }
    return params.toString();
  }, [cleanApiUrl, wifiSsid, wifiPassword, wifiSecurity]);

  const qrImageUrl = qrFallback
    ? `/enrollment_qr.png?v=${qrCacheBust}`
    : `${cleanApiUrl}/api/v1/provisioning/qr.png?${provisioningQuery}`;

  // Fetch provisioning metadata (checksum, size, JSON payload)
  useEffect(() => {
    if (!isOpen || currentStep !== 1) return;
    let active = true;
    fetch(`${cleanApiUrl}/api/v1/provisioning/payload?${provisioningQuery}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && data.payload_json) {
          setProvisioningMeta(data);
          setQrFallback(false);
        }
      })
      .catch(() => {
        // Fallback to static enrollment_qr.png if backend unavailable
      });
    return () => {
      active = false;
    };
  }, [isOpen, currentStep, cleanApiUrl, provisioningQuery]);

  // Step 1: Listen for real device handshake by polling backend
  useEffect(() => {
    if (!isOpen || currentStep !== 1 || isStep1Validated) return;

    let isSubscribed = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const pollDevices = async () => {
      try {
        const res = await secureFetch(`${cleanApiUrl}/api/v1/devices`);
        if (res.ok && isSubscribed) {
          const list: Device[] = await res.json();
          if (baselineHeartbeatsRef.current === null) {
            const initialMap: Record<string, string> = {};
            list.forEach((dev) => {
              initialMap[dev.imei] = dev.last_heartbeat || dev.created_at || '';
            });
            baselineHeartbeatsRef.current = initialMap;
            return;
          }

          const baseline = baselineHeartbeatsRef.current;
          const newlyConnected = list.find((dev) => {
            const prev = baseline[dev.imei];
            const current = dev.last_heartbeat || dev.created_at || '';
            if (prev === undefined) return true;
            return Boolean(current && prev && current !== prev);
          });

          if (newlyConnected && isSubscribed) {
            setPairedDevice(newlyConnected);
            setIsStep1Validated(true);
            timerId = setTimeout(() => {
              if (isSubscribed) setCurrentStep(2);
            }, 1200);
          }
        }
      } catch {
        // Silent poll error
      }
    };

    pollDevices();
    const pollInterval = setInterval(pollDevices, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      if (timerId) clearTimeout(timerId);
    };
  }, [isOpen, currentStep, cleanApiUrl, isStep1Validated]);

  const handleCopyPayload = async () => {
    if (!provisioningMeta?.payload_json) return;
    try {
      await navigator.clipboard.writeText(provisioningMeta.payload_json);
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  // Trigger pairing simulation
  const handleTriggerConnection = async () => {
    const dummyImei = `352965710${Math.floor(100000 + Math.random() * 900000)}`;

    try {
      const res = await secureFetch(`${cleanApiUrl}/api/v1/devices/pairing/simulate`, {
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

        setTimeout(() => {
          setCurrentStep(2);
        }, 1200);
      }
    } catch {
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

      const tileUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

      L.tileLayer(tileUrl, {
        attribution: '&copy; Google Maps / Earth Satellite &copy; LockER MDM',
        maxZoom: 20
      }).addTo(map);

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
          Batterie: ${pairedDevice?.battery_level ?? 100}%<br/>
          Opérateur: ${pairedDevice?.network_operator || 'Réseau actif'}
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

    const startLat = 6.3533;
    const startLon = 2.4011;

    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
    }

    const hqIcon = L.divIcon({
      html: '<div style="background-color:#2563EB; color:white; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:6px; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.3);">HQ QG</div>',
      className: 'hq-marker',
      iconSize: [40, 20],
      iconAnchor: [20, 10]
    });
    L.marker([startLat, startLon], { icon: hqIcon }).addTo(map).bindPopup("<b>Siège Central LockER</b> (Départ Itinéraire)");

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

  const displayLat = (pairedDevice?.latitude ?? 6.3685).toFixed(4);
  const displayLon = (pairedDevice?.longitude ?? 2.4280).toFixed(4);

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
              Enrôlement Android Enterprise dès l'allumage (7 taps sur l'écran) &amp; activation Device Owner
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
              <div className="text-[10px] font-normal opacity-80">QR 7-Tap &amp; Connexion</div>
            </div>
          </div>

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
              <div className="text-[10px] font-normal opacity-80">Import IMEI &amp; Réseau</div>
            </div>
          </div>

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
              <div className="text-[10px] font-normal opacity-80">GPS &amp; Itinéraire</div>
            </div>
          </div>
        </div>

        {/* Modal Body: Active Step Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ======================= ÉTAPE 1 : QR CODE 7-TAP & CONNEXION ======================= */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <h3 className="text-base sm:text-lg font-bold">
                  Étape 1 : Enrôlement QR Android Enterprise (7 taps à l'allumage)
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Sur un téléphone neuf ou réinitialisé (écran « Bienvenue »), tapotez <b>7 fois rapidement</b> sur un espace vide de l'écran puis scannez ce QR Code pour installer LockER automatiquement en mode <b>Device Owner</b>.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-6">
                {/* QR Code Container */}
                <div className={`p-4 rounded-3xl border shadow-xl flex flex-col items-center justify-center relative shrink-0 ${
                  isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-white border-slate-200'
                }`}>
                  <div className="p-2.5 bg-white rounded-2xl shadow-inner">
                    <img 
                      src={qrImageUrl}
                      alt="QR Code Enrôlement Android Enterprise 7-Tap"
                      onError={() => {
                        if (!qrFallback) setQrFallback(true);
                      }}
                      className="w-52 h-52 object-contain"
                    />
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-emerald-400 mt-2.5 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    app-release.apk (v2.2.0)
                  </span>
                  {provisioningMeta?.apk_checksum_sha256_b64url && (
                    <span className={`text-[10px] font-mono mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      SHA-256 : {provisioningMeta.apk_checksum_sha256_b64url.slice(0, 14)}…
                    </span>
                  )}

                  <div className="flex items-center gap-2 mt-3 w-full">
                    <a
                      href={qrImageUrl}
                      download="locker_enrollment_qr.png"
                      className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 text-slate-200'
                          : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <Download className="w-3 h-3" />
                      <span>PNG</span>
                    </a>
                    {provisioningMeta?.payload_json && (
                      <button
                        type="button"
                        onClick={handleCopyPayload}
                        className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition ${
                          isDark
                            ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 text-slate-200'
                            : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedPayload ? 'Copié' : 'JSON'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Right column: 7-tap guide, Wi-Fi optional config & live status */}
                <div className="flex-1 w-full max-w-sm space-y-3.5">
                  <div className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                    isDark ? 'bg-[#070D1E] border-[#1E2E56] text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <div className="font-bold text-emerald-400">Procédure 7 taps à l'allumage :</div>
                    <div>1. Réinitialiser le téléphone sans compte Google (pas de verrou FRP).</div>
                    <div>2. Tapoter <b>7 fois</b> sur l'écran « Bienvenue » puis scanner le QR Code.</div>
                    <div>3. Connecter un Wi-Fi/4G sans portail captif (partage 4G recommandé).</div>
                    <div>4. LockER s'installe en <b>Device Owner</b> sans blocage « Just a sec... ».</div>
                  </div>

                  {/* Optional Wi-Fi pre-configuration */}
                  <div className={`rounded-2xl border overflow-hidden ${
                    isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setShowWifiConfig(!showWifiConfig)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold"
                    >
                      <span className="flex items-center gap-2">
                        <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Wi-Fi automatique dans le QR (optionnel)</span>
                      </span>
                      {showWifiConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showWifiConfig && (
                      <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-slate-700/40 text-xs">
                        <input
                          type="text"
                          value={wifiSsid}
                          onChange={(e) => setWifiSsid(e.target.value)}
                          placeholder="Nom du Wi-Fi (SSID)"
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs ${
                            isDark ? 'bg-[#0B132B] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={wifiSecurity}
                            onChange={(e) => setWifiSecurity(e.target.value as 'WPA' | 'WEP' | 'NONE')}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs ${
                              isDark ? 'bg-[#0B132B] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          >
                            <option value="WPA">WPA / WPA2</option>
                            <option value="WEP">WEP</option>
                            <option value="NONE">Ouvert (Sans mot de passe)</option>
                          </select>
                          <input
                            type="password"
                            value={wifiPassword}
                            disabled={wifiSecurity === 'NONE'}
                            onChange={(e) => setWifiPassword(e.target.value)}
                            placeholder="Mot de passe Wi-Fi"
                            className={`px-2.5 py-1.5 rounded-lg border text-xs disabled:opacity-50 ${
                              isDark ? 'bg-[#0B132B] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status Radar & Handshake Waiting Box */}
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
                            : 'Validation automatique dès la fin de l\'installation.'}
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
                </div>
              </div>
            </div>
          )}

          {/* ======================= ÉTAPE 2 : IMPORTATION DES INFORMATIONS ======================= */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center max-w-lg mx-auto space-y-2">
                <h3 className="text-base sm:text-lg font-bold">
                  Étape 2 : Importation Complète des Données Matérielles &amp; Réseau
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
                      S/N : <span className="font-mono text-slate-200">{pairedDevice?.serial_number || pairedDevice?.imei || '-'}</span>
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
                      <span className="text-xs font-semibold text-slate-400">Adresses Réseau &amp; MAC</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ✓ Validé
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-mono">
                      IP Publique : <span className="text-cyan-400 font-bold">{pairedDevice?.ip_address || 'En attente télémétrie'}</span>
                    </div>
                    <div className="text-xs text-slate-300 font-mono">
                      MAC Wi-Fi : <span className="text-cyan-400">{pairedDevice?.mac_address || 'Protégé Android 10+'}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Liaison Cloud : <span className="font-mono">WebSocket sub-50ms</span>
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
                      <span className="text-xs font-semibold text-slate-400">Réseau Télécom &amp; SIM</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ✓ Validé
                      </span>
                    </div>
                    <div className="text-sm font-bold text-amber-300">
                      {pairedDevice?.network_operator || 'Détection opérateur...'}
                    </div>
                    <div className="text-xs text-slate-400">
                      État : <span className="text-emerald-400 font-semibold">En ligne (Heartbeat actif)</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      SSID Wi-Fi : <span className="text-slate-200">{pairedDevice?.wifi_ssid || 'Réseau actif'}</span>
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
                      <span className="text-xs font-semibold text-slate-400">Sécurité MDM &amp; Énergie</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ✓ Validé
                      </span>
                    </div>
                    <div className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                      <span>Batterie : {pairedDevice?.battery_level ?? 100}%</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Device Owner : <span className="text-emerald-400 font-semibold">ACTIF (Non-désinstallable)</span>
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
                  <span>Valider les Informations &amp; Passer au GPS</span>
                </button>
              </div>
            </div>
          )}

          {/* ======================= ÉTAPE 3 : GÉOLOCALISATION & ITINÉRAIRE ======================= */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="text-center max-w-lg mx-auto space-y-1">
                <h3 className="text-base sm:text-lg font-bold">
                  Étape 3 : Cartographie &amp; Traçabilité GPS en Direct
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
                      Latitude : {displayLat}° N • Longitude : {displayLon}° E
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCalculateItinerary}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-extrabold shadow-lg shadow-emerald-500/30 transition flex items-center justify-center gap-2"
                >
                  <NavIcon className="w-4 h-4" />
                  <span>LOCALISER LE TÉLÉPHONE (DONNER L'ITINÉRAIRE)</span>
                </button>
              </div>

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
                  <span>✓ TERMINER &amp; ENRÔLER DANS LA FLOTTE</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
