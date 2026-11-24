import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Unlock,
  Smartphone, 
  AlertTriangle,
  QrCode, 
  CheckCircle2, 
  X, 
  CreditCard, 
  Sliders,
  MapPin,
  Eye
} from 'lucide-react';

import { Driver, Device } from './types';
import { secureFetch, getAdminApiKey, setAdminApiKey } from './api';
import { Navigation } from './components/Navigation';
import { OnboardingWizardModal } from './components/OnboardingWizardModal';
import { LiveMapSection } from './components/LiveMapSection';
import { LockybeeSection } from './components/LockybeeSection';
import { RulesSection } from './components/RulesSection';
import { PaymentModal } from './components/PaymentModal';
import { LockScreenPreviewModal } from './components/LockScreenPreviewModal';
import { FleetTable } from './components/FleetTable';

export function App() {
  // Theme state: dark (Bleu Nuit / Vert) or light (Blanc / Vert)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('locker_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('locker_theme', nextTheme);
  };

  // Section navigation state
  const [activeSection, setActiveSection] = useState<'dashboard' | 'fleet' | 'map' | 'lockybee' | 'payments' | 'rules' | 'preview'>('dashboard');

  // Core Data
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [devices, setDevices] = useState<Record<number, Device>>({});
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [securityScore, setSecurityScore] = useState<number>(96);

  // Modals state
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLockScreenPreview, setShowLockScreenPreview] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [selectedDriverForAction, setSelectedDriverForAction] = useState<Driver | null>(null);

  // Dynamic API URL
  const defaultApi = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:8000'
    : 'https://locker-2nuk.onrender.com';

  const getInitialApi = () => {
    if (typeof window === 'undefined') return defaultApi;
    const stored = localStorage.getItem('locker_api_url');
    if (!stored || stored.includes('locker-backend-api') || (stored.includes('localhost') && window.location.hostname !== 'localhost') || (stored.startsWith('http://') && window.location.protocol === 'https:')) {
      localStorage.setItem('locker_api_url', defaultApi);
      return defaultApi;
    }
    return stored;
  };

  const [apiUrl, setApiUrl] = useState(getInitialApi);
  const [tempApiUrl, setTempApiUrl] = useState(apiUrl);
  const [tempApiKey, setTempApiKey] = useState(getAdminApiKey);
  const [isApiOnline, setIsApiOnline] = useState<boolean | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone_number: '',
    vehicle_plate: '',
    daily_rate_xof: 5000,
    current_status: 'UP_TO_DATE'
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Synchronisation avec le Backend
  const fetchData = async () => {
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '');
      const [driversRes, devicesRes, auditRes] = await Promise.all([
        secureFetch(`${cleanUrl}/api/v1/drivers`),
        secureFetch(`${cleanUrl}/api/v1/devices`),
        secureFetch(`${cleanUrl}/api/v1/lockybee/audit`).catch(() => null)
      ]);

      if (driversRes.ok) {
        setIsApiOnline(true);
        const driversData = await driversRes.json();
        setDrivers(Array.isArray(driversData) ? driversData : []);
      } else {
        setIsApiOnline(false);
      }

      if (devicesRes.ok) {
        const devicesData: Device[] = await devicesRes.json();
        const map: Record<number, Device> = {};
        if (Array.isArray(devicesData)) {
          devicesData.forEach((dev) => {
            if (dev.driver_id) map[dev.driver_id] = dev;
          });
        }
        setDevices(map);
      }

      if (auditRes && auditRes.ok) {
        const auditData = await auditRes.json();
        if (auditData.security_score) {
          setSecurityScore(auditData.security_score);
        }
      }
    } catch {
      setIsApiOnline(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  // Verrouiller / Déverrouiller un conducteur
  const handleToggleLock = async (driver: Driver) => {
    setLoadingActionId(driver.id);
    const isLocked = driver.current_status === 'LOCKED';
    const action = isLocked ? 'unblock' : 'block';
    const reason = isLocked ? 'Déblocage administratif' : 'Échéance journalière dépassée';
    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await secureFetch(`${cleanUrl}/api/v1/${action}/${driver.id}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });

      if (res.ok) {
        showToast(
          isLocked 
            ? `🔓 Terminal de ${driver.full_name} déverrouillé avec succès !` 
            : `🔒 Signal de verrouillage envoyé vers ${driver.full_name} !`,
          'success'
        );
        fetchData();
      } else {
        showToast("Erreur lors de l'envoi de l'ordre de verrouillage.", 'error');
      }
    } catch {
      showToast("Impossible de joindre le serveur.", 'error');
    } finally {
      setLoadingActionId(null);
    }
  };

  // Enregistrer modification conducteur
  const handleSaveDriverConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await secureFetch(`${cleanUrl}/api/v1/drivers/${editingDriver.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm)
      });

      if (res.ok) {
        showToast(`Règles de ${editForm.full_name} enregistrées !`, 'success');
        setEditingDriver(null);
        fetchData();
      }
    } catch {
      showToast("Erreur lors de la sauvegarde.", 'error');
    }
  };

  // Supprimer un conducteur
  const handleDeleteDriver = async (driverId: number, name: string) => {
    if (!confirm(`Supprimer définitivement le profil de ${name} ?`)) return;
    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await secureFetch(`${cleanUrl}/api/v1/drivers/${driverId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`Fiche de ${name} supprimée.`, 'info');
        fetchData();
      }
    } catch {
      showToast("Erreur de suppression.", 'error');
    }
  };

  // Quick stats
  const totalEnrolled = drivers.length;
  const activeCount = drivers.filter((d) => d.current_status === 'UP_TO_DATE').length;
  const overdueCount = drivers.filter((d) => d.current_status.startsWith('OVERDUE')).length;
  const lockedCount = drivers.filter((d) => d.current_status === 'LOCKED').length;

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
      isDark ? 'bg-[#070D1E] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
    }`}>
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border animate-bounce ${
          notification.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' 
            : notification.type === 'error'
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
        }`}>
          {notification.type === 'success' && <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />}
          {notification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          {notification.type === 'info' && <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0" />}
          <p className="text-xs sm:text-sm font-semibold">{notification.message}</p>
        </div>
      )}

      {/* Main Top Navigation */}
      <Navigation
        theme={theme}
        toggleTheme={toggleTheme}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onOpenAddWizard={() => setShowAddWizard(true)}
        onOpenConfigApi={() => {
          setTempApiUrl(apiUrl);
          setTempApiKey(getAdminApiKey());
          setShowApiModal(true);
        }}
        isApiOnline={isApiOnline}
        securityScore={securityScore}
      />

      {/* Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        
        {/* ================= SECTION 1: TABLEAU DE BORD (DASHBOARD) ================= */}
        {activeSection === 'dashboard' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Hero Quick Action Banner */}
            <div className={`p-6 sm:p-8 rounded-3xl border shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden ${
              isDark 
                ? 'bg-gradient-to-r from-[#0B132B] via-[#0F1B33] to-[#0A1128] border-[#1E3A5F]' 
                : 'bg-gradient-to-r from-emerald-50 via-white to-slate-50 border-slate-200 shadow-sm'
            }`}>
              <div className="space-y-2 z-10 text-center sm:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  SYSTÈME OPÉRATIONNEL • BÉNIN XOF
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                  Gestion Flotte Android
                </h2>
                <p className={`text-xs sm:text-sm max-w-xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Enrôlement guidé par QR code, synchronisation automatique des adresses, traçage GPS point vert et déblocage instantané Mobile Money.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 z-10">
                <button
                  onClick={() => setShowAddWizard(true)}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-xs shadow-xl shadow-emerald-500/30 transition flex items-center gap-2 active:scale-95"
                >
                  <QrCode className="w-4 h-4" />
                  <span>+ AJOUTER UN TÉLÉPHONE (PROCESSUS)</span>
                </button>

                <button
                  onClick={() => setActiveSection('map')}
                  className={`px-4 py-3 rounded-2xl font-bold text-xs border transition flex items-center gap-2 ${
                    isDark 
                      ? 'bg-[#070D1E] border-slate-700 hover:bg-slate-800 text-slate-200' 
                      : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>Carte GPS en Direct</span>
                </button>

                <button
                  onClick={() => setActiveSection('lockybee')}
                  className={`px-4 py-3 rounded-2xl font-bold text-xs border transition flex items-center gap-2 ${
                    isDark 
                      ? 'bg-[#070D1E] border-slate-700 hover:bg-slate-800 text-amber-300' 
                      : 'bg-white border-slate-300 hover:bg-slate-50 text-amber-600'
                  }`}
                >
                  <span>🐝</span>
                  <span>Lockybee IA</span>
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Terminaux Enrôlés */}
              <div className={`p-5 rounded-2xl border shadow-lg transition ${
                isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Terminaux Enrôlés</span>
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-3xl font-extrabold text-emerald-400">{totalEnrolled}</div>
                <p className="text-xs text-slate-500 mt-1">Terminaux Android actifs</p>
              </div>

              {/* À jour */}
              <div className={`p-5 rounded-2xl border shadow-lg transition ${
                isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Paiements à Jour</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-3xl font-extrabold text-emerald-400">{activeCount}</div>
                <p className="text-xs text-emerald-500/80 mt-1">Terminaux libres d'accès</p>
              </div>

              {/* Retard J+1/J+2 */}
              <div className={`p-5 rounded-2xl border shadow-lg transition ${
                isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Retards (J+1 / J+2)</span>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-3xl font-extrabold text-amber-400">{overdueCount}</div>
                <p className="text-xs text-amber-500/80 mt-1">Sous préavis de verrouillage</p>
              </div>

              {/* Verrouillés J>=3 */}
              <div className={`p-5 rounded-2xl border shadow-lg transition ${
                isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400">Bloqués Kiosk (J≥3)</span>
                  <Lock className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-3xl font-extrabold text-rose-400">{lockedCount}</div>
                <p className="text-xs text-rose-500/80 mt-1">Redirection Mobile Money active</p>
              </div>
            </div>

            {/* Quick Fleet Table Preview in Dashboard */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold tracking-tight">
                  Aperçu des Terminaux & Télémétrie en Direct
                </h3>
                <button
                  onClick={() => setActiveSection('fleet')}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <span>Voir tous les terminaux ({drivers.length})</span>
                  <span>→</span>
                </button>
              </div>

              <FleetTable
                drivers={drivers}
                devices={devices}
                theme={theme}
                onToggleLock={handleToggleLock}
                onOpenEditModal={(driver) => {
                  setEditingDriver(driver);
                  setEditForm({
                    full_name: driver.full_name,
                    phone_number: driver.phone_number,
                    vehicle_plate: driver.vehicle_plate || '',
                    daily_rate_xof: driver.daily_rate_xof,
                    current_status: driver.current_status
                  });
                }}
                onDeleteDriver={handleDeleteDriver}
                onOpenPaymentModal={(driver) => {
                  setSelectedDriverForAction(driver);
                  setShowPaymentModal(true);
                }}
                onOpenLiveMapForDriver={(driver) => {
                  setSelectedDriverForAction(driver);
                  setActiveSection('map');
                }}
                onOpenLockScreenPreview={(driver) => {
                  setSelectedDriverForAction(driver);
                  setShowLockScreenPreview(true);
                }}
                loadingActionId={loadingActionId}
                onRefreshData={fetchData}
              />
            </div>

          </div>
        )}

        {/* ================= SECTION 2: GESTION DE FLOTTE (FLEET) ================= */}
        {activeSection === 'fleet' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Gestion de la Flotte Complète</h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Liste exhaustive des téléphones enrôlés, contrôles de verrouillage et télémétrie réseau
                </p>
              </div>

              <button
                onClick={() => setShowAddWizard(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                <span>+ Ajouter un Téléphone</span>
              </button>
            </div>

            <FleetTable
              drivers={drivers}
              devices={devices}
              theme={theme}
              onToggleLock={handleToggleLock}
              onOpenEditModal={(driver) => {
                setEditingDriver(driver);
                setEditForm({
                  full_name: driver.full_name,
                  phone_number: driver.phone_number,
                  vehicle_plate: driver.vehicle_plate || '',
                  daily_rate_xof: driver.daily_rate_xof,
                  current_status: driver.current_status
                });
              }}
              onDeleteDriver={handleDeleteDriver}
              onOpenPaymentModal={(driver) => {
                setSelectedDriverForAction(driver);
                setShowPaymentModal(true);
              }}
              onOpenLiveMapForDriver={(driver) => {
                setSelectedDriverForAction(driver);
                setActiveSection('map');
              }}
              onOpenLockScreenPreview={(driver) => {
                setSelectedDriverForAction(driver);
                setShowLockScreenPreview(true);
              }}
              loadingActionId={loadingActionId}
              onRefreshData={fetchData}
            />
          </div>
        )}

        {/* ================= SECTION 3: CARTOGRAPHIE GPS (MAP) ================= */}
        {activeSection === 'map' && (
          <LiveMapSection
            devices={devices}
            drivers={drivers}
            theme={theme}
            onSelectDriverForAction={(driver) => {
              setSelectedDriverForAction(driver);
            }}
          />
        )}

        {/* ================= SECTION 4: LOCKYBEE AI GUARDIAN ================= */}
        {activeSection === 'lockybee' && (
          <LockybeeSection apiUrl={apiUrl} theme={theme} />
        )}

        {/* ================= SECTION 5: PAIEMENTS & WEBHOOKS ================= */}
        {activeSection === 'payments' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Passerelle de Paiements & Déblocage Automatique</h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Reconciliation instantanée des versements MTN MoMo, Moov Money et Stripe avec levée immédiate du verrou Kiosk
                </p>
              </div>

              <button
                onClick={() => setShowPaymentModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>Simuler un Paiement Immédiat</span>
              </button>
            </div>

            {/* Quick Payment Banner & Explanations */}
            <div className={`p-6 rounded-3xl border space-y-4 ${
              isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                Fonctionnement du Déblocage / Verrouillage Automatique :
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className={`p-4 rounded-2xl border space-y-2 ${isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Unlock className="w-4 h-4" />
                    <span>Déblocage Automatique au Paiement</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Dès qu'une transaction MTN MoMo (*133#), Moov (*880#) ou Stripe est reçue par le webhook backend, le statut du chauffeur repasse instantanément à <b>UP_TO_DATE</b>, le bail local est prolongé de 72h et l'ordre FCM <b>UNLOCK</b> est diffusé.
                  </p>
                </div>

                <div className={`p-4 rounded-2xl border space-y-2 ${isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-rose-400 flex items-center gap-1.5">
                    <Lock className="w-4 h-4" />
                    <span>Verrouillage Automatique pour Impayé (J≥3)</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Le service d'audit de Lockybee vérifie en continu l'échéancier. Tout chauffeur totalisant 3 jours ou plus de retard est automatiquement basculé en statut <b>LOCKED</b> et son écran est verrouillé en mode Kiosk avec redirection vers le paiement.
                  </p>
                </div>
              </div>
            </div>

            <FleetTable
              drivers={drivers}
              devices={devices}
              theme={theme}
              onToggleLock={handleToggleLock}
              onOpenEditModal={(driver) => setEditingDriver(driver)}
              onDeleteDriver={handleDeleteDriver}
              onOpenPaymentModal={(driver) => {
                setSelectedDriverForAction(driver);
                setShowPaymentModal(true);
              }}
              onOpenLiveMapForDriver={(driver) => {
                setSelectedDriverForAction(driver);
                setActiveSection('map');
              }}
              onOpenLockScreenPreview={(driver) => {
                setSelectedDriverForAction(driver);
                setShowLockScreenPreview(true);
              }}
              loadingActionId={loadingActionId}
              onRefreshData={fetchData}
            />
          </div>
        )}

        {/* ================= SECTION 6: RÈGLES & ÉCHÉANCIERS ================= */}
        {activeSection === 'rules' && (
          <RulesSection apiUrl={apiUrl} theme={theme} />
        )}

        {/* ================= SECTION 7: KIOSK SIMULATOR (PREVIEW) ================= */}
        {activeSection === 'preview' && (
          <div className="space-y-6 animate-fadeIn text-center">
            <div className="max-w-lg mx-auto space-y-1">
              <h2 className="text-xl font-bold tracking-tight">Simulateur d'Écran Kiosk Android</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Visualisez l'interface exacte affichée sur le téléphone lorsque le verrouillage administratif ou pour impayé est actif.
              </p>
            </div>

            <div className="flex justify-center pt-2">
              <button
                onClick={() => setShowLockScreenPreview(true)}
                className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-xl shadow-emerald-600/30 transition flex items-center gap-2 active:scale-95"
              >
                <Eye className="w-4 h-4" />
                <span>Ouvrir l'Aperçu Téléphone Kiosk Interactif</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ================= MODAL: PROCESSUS D'AJOUT TÉLÉPHONE (WIZARD) ================= */}
      <OnboardingWizardModal
        isOpen={showAddWizard}
        onClose={() => setShowAddWizard(false)}
        apiUrl={apiUrl}
        theme={theme}
        onEnrolledSuccessfully={() => {
          showToast("✓ Nouveau terminal Android enrôlé avec succès !", "success");
          fetchData();
        }}
      />

      {/* ================= MODAL: PAIEMENT MOBILE MONEY / STRIPE ================= */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        drivers={drivers}
        selectedDriver={selectedDriverForAction}
        apiUrl={apiUrl}
        theme={theme}
        onSuccess={(msg) => {
          showToast(msg, 'success');
          fetchData();
        }}
      />

      {/* ================= MODAL: PRÉVISUALISATION LOCK SCREEN KIOSK ================= */}
      <LockScreenPreviewModal
        isOpen={showLockScreenPreview}
        onClose={() => setShowLockScreenPreview(false)}
        driver={selectedDriverForAction || drivers[0]}
        device={selectedDriverForAction ? devices[selectedDriverForAction.id] : undefined}
        onSimulateUnlock={() => {
          showToast("Paiement validé ! Déverrouillage ordonné par le serveur.", "success");
          setShowLockScreenPreview(false);
          fetchData();
        }}
      />

      {/* ================= MODAL: PARAMÈTRES SERVEUR API ================= */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`max-w-md w-full rounded-3xl border p-6 space-y-4 shadow-2xl animate-scale-up ${
            isDark ? 'bg-[#0B132B] border-[#1E3A5F] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold">Paramètres Serveur API</h3>
              </div>
              <button onClick={() => setShowApiModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 block">URL du Backend FastAPI</label>
                <input 
                  type="url" 
                  value={tempApiUrl} 
                  onChange={(e) => setTempApiUrl(e.target.value)}
                  placeholder="https://locker-2nuk.onrender.com"
                  className={`w-full p-2.5 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                    isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTempApiUrl('https://locker-2nuk.onrender.com')}
                  className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg border border-slate-700"
                >
                  Défaut Render Cloud
                </button>
                <button
                  type="button"
                  onClick={() => setTempApiUrl('http://localhost:8000')}
                  className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700"
                >
                  Localhost (8000)
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 block">Clé d'Administration API (X-API-Key)</label>
                <input 
                  type="password" 
                  value={tempApiKey} 
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="locker_admin_prod_secret_2026_xof"
                  className={`w-full p-2.5 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 font-mono ${
                    isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-700/50">
              <button 
                type="button" 
                onClick={() => setShowApiModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
              >
                Annuler
              </button>
              <button 
                type="button" 
                onClick={() => {
                  const cleaned = tempApiUrl.trim().replace(/\/$/, '');
                  setApiUrl(cleaned);
                  localStorage.setItem('locker_api_url', cleaned);
                  setAdminApiKey(tempApiKey);
                  setShowApiModal(false);
                  showToast(`Paramètres API mis à jour !`, 'info');
                  setTimeout(fetchData, 300);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: MODIFIER CONDUCTEUR ================= */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`max-w-lg w-full rounded-3xl border p-6 space-y-5 shadow-2xl animate-scale-up ${
            isDark ? 'bg-[#0B132B] border-[#1E3A5F] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
              <h3 className="text-base font-bold">Modifier les Informations & Règles</h3>
              <button onClick={() => setEditingDriver(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDriverConfig} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 uppercase mb-1">Nom Complet</label>
                <input 
                  type="text" 
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  required
                  className={`w-full p-2.5 rounded-xl border font-medium ${
                    isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-400 uppercase mb-1">Téléphone Bénin</label>
                  <input 
                    type="text" 
                    value={editForm.phone_number}
                    onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                    required
                    className={`w-full p-2.5 rounded-xl border font-medium ${
                      isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-400 uppercase mb-1">Plaque Véhicule</label>
                  <input 
                    type="text" 
                    value={editForm.vehicle_plate}
                    onChange={(e) => setEditForm({ ...editForm, vehicle_plate: e.target.value })}
                    className={`w-full p-2.5 rounded-xl border font-medium ${
                      isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-400 uppercase mb-1">Forfait (FCFA/j)</label>
                  <input 
                    type="number" 
                    value={editForm.daily_rate_xof}
                    onChange={(e) => setEditForm({ ...editForm, daily_rate_xof: parseInt(e.target.value) || 0 })}
                    required
                    className={`w-full p-2.5 rounded-xl border font-bold ${
                      isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-400 uppercase mb-1">Statut Administratif</label>
                  <select 
                    value={editForm.current_status}
                    onChange={(e) => setEditForm({ ...editForm, current_status: e.target.value })}
                    className={`w-full p-2.5 rounded-xl border font-medium ${
                      isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  >
                    <option value="UP_TO_DATE">À jour (En règle)</option>
                    <option value="OVERDUE_1">Retard J+1</option>
                    <option value="OVERDUE_2">Retard J+2</option>
                    <option value="LOCKED">Bloqué (Kiosk)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-700/50">
                <button 
                  type="button" 
                  onClick={() => setEditingDriver(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30"
                >
                  Sauvegarder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
