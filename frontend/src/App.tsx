import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  Smartphone, 
  Search, 
  RefreshCw, 
  PhoneCall, 
  AlertTriangle,
  QrCode,
  Trash2,
  PlusCircle,
  CheckCircle2,
  X,
  CreditCard,
  Wifi,
  Sliders
} from 'lucide-react';
import { Driver, Device } from './types';

export function App() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [devices, setDevices] = useState<Record<number, Device>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // Modals state
  const [showQrModal, setShowQrModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Dynamic API URL (LocalStorage / Render Cloud / Local)
  const defaultApi = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://localhost:8000'
    : 'https://locker-2nuk.onrender.com';
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('locker_api_url') || defaultApi);
  const [showApiModal, setShowApiModal] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState(apiUrl);
  const [isApiOnline, setIsApiOnline] = useState<boolean | null>(null);

  // Form state for editing / configuring driver
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone_number: '',
    vehicle_plate: '',
    daily_rate_xof: 5000,
    current_status: 'UP_TO_DATE'
  });

  // Form state for manual driver creation
  const [addForm, setAddForm] = useState({
    full_name: '',
    phone_number: '+229 ',
    vehicle_plate: 'RB-',
    daily_rate_xof: 5000
  });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Synchronisation en temps réel avec le Backend (Local ou Cloud)
  const fetchData = async () => {
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '');
      const [driversRes, devicesRes] = await Promise.all([
        fetch(`${cleanUrl}/api/v1/drivers`),
        fetch(`${cleanUrl}/api/v1/devices`)
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
          devicesData.forEach(dev => {
            if (dev.driver_id) map[dev.driver_id] = dev;
          });
        }
        setDevices(map);
      }
    } catch {
      setIsApiOnline(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2500);
    return () => clearInterval(interval);
  }, [apiUrl]);

  // Déclencher le Verrouillage / Déverrouillage à distance via Firebase Cloud Messaging
  const handleToggleLock = async (driver: Driver) => {
    setLoadingActionId(driver.id);
    const isLocked = driver.current_status === 'LOCKED';
    const action = isLocked ? 'unblock' : 'block';
    const reason = isLocked ? 'Déblocage administratif' : 'Échéance journalière dépassée';
    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${cleanUrl}/api/v1/${action}/${driver.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });

      if (res.ok) {
        showToast(
          isLocked 
            ? `🔓 Terminal de ${driver.full_name} déverrouillé avec succès !` 
            : `🔒 Signal de verrouillage envoyé à distance vers ${driver.full_name} !`,
          'success'
        );
        fetchData();
      } else {
        showToast("Erreur lors de l'envoi de la commande.", 'error');
      }
    } catch {
      showToast("Impossible de contacter le serveur backend.", 'error');
    } finally {
      setLoadingActionId(null);
    }
  };

  // Sauvegarder les règles de paiement et informations du conducteur
  const handleSaveDriverConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${cleanUrl}/api/v1/drivers/${editingDriver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      if (res.ok) {
        showToast(`Règles et infos de ${editForm.full_name} enregistrées !`, 'success');
        setEditingDriver(null);
        fetchData();
      } else {
        showToast("Erreur lors de la mise à jour.", 'error');
      }
    } catch {
      showToast("Erreur de connexion au serveur.", 'error');
    }
  };

  // Création manuelle d'un conducteur
  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = apiUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${cleanUrl}/api/v1/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm)
      });

      if (res.ok) {
        showToast(`Conducteur ${addForm.full_name} créé avec succès !`, 'success');
        setShowAddModal(false);
        setAddForm({ full_name: '', phone_number: '+229 ', vehicle_plate: 'RB-', daily_rate_xof: 5000 });
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.detail || "Erreur lors de la création.", 'error');
      }
    } catch {
      showToast("Erreur de communication avec le serveur.", 'error');
    }
  };

  // Supprimer un conducteur
  const handleDeleteDriver = async (driverId: number, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le profil de ${name} ?`)) return;
    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${cleanUrl}/api/v1/drivers/${driverId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`Conducteur ${name} supprimé.`, 'info');
        fetchData();
      }
    } catch {
      showToast("Erreur lors de la suppression.", 'error');
    }
  };

  const openEditModal = (driver: Driver) => {
    setEditingDriver(driver);
    setEditForm({
      full_name: driver.full_name,
      phone_number: driver.phone_number,
      vehicle_plate: driver.vehicle_plate || '',
      daily_rate_xof: driver.daily_rate_xof,
      current_status: driver.current_status
    });
  };

  // Filtres
  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = 
      d.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone_number.includes(searchTerm) ||
      (d.vehicle_plate && d.vehicle_plate.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (devices[d.id] && devices[d.id].imei.includes(searchTerm));
    
    if (statusFilter === 'ALL') return matchesSearch;
    return matchesSearch && d.current_status === statusFilter;
  });

  // Statistiques
  const totalEnrolled = drivers.length;
  const activeCount = drivers.filter(d => d.current_status === 'UP_TO_DATE').length;
  const overdueCount = drivers.filter(d => d.current_status === 'OVERDUE_1' || d.current_status === 'OVERDUE_2').length;
  const lockedCount = drivers.filter(d => d.current_status === 'LOCKED').length;

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md border animate-bounce ${
          notification.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' 
            : notification.type === 'error'
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
        }`}>
          {notification.type === 'success' && <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />}
          {notification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          {notification.type === 'info' && <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0" />}
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-[#0F172A]/80 backdrop-blur-xl border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">LockER</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase tracking-widest">
                  MDM Enterprise
                </span>
              </div>
              <p className="text-xs text-slate-400">Gestion de Flotte & Verrouillage à Distance (Samsung Galaxy A34)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* API Connection Indicator & Config */}
            <button 
              onClick={() => { setTempApiUrl(apiUrl); setShowApiModal(true); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                isApiOnline 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                  : isApiOnline === false 
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20' 
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Configurer l'adresse API du Backend (Render Cloud ou Local)"
            >
              <span className={`w-2 h-2 rounded-full ${isApiOnline ? 'bg-emerald-400 animate-ping' : isApiOnline === false ? 'bg-rose-500' : 'bg-amber-400'}`}></span>
              <span>{isApiOnline ? 'Backend Connecté' : isApiOnline === false ? 'Backend Hors Ligne' : 'Connexion Backend...'}</span>
              <Sliders className="w-3.5 h-3.5 ml-1 opacity-70" />
            </button>

            {/* Live Status indicator */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              FCM Cloud
            </div>

            {/* Quick Actions */}
            <button 
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              <QrCode className="w-4 h-4 text-cyan-400" />
              <span>QR Code Enrôlement</span>
            </button>

            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/30 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nouveau Conducteur</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-cyan-400">Terminaux Enrôlés</span>
              <Smartphone className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{totalEnrolled}</div>
            <p className="text-xs text-slate-500 mt-1">Appareils physiques enregistrés</p>
          </div>

          <div className="bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-emerald-400">Paiements à Jour</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-emerald-400">{activeCount}</div>
            <p className="text-xs text-emerald-500/80 mt-1">Terminaux libres d'accès</p>
          </div>

          <div className="bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-amber-400">Retards (J+1 / J+2)</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-amber-400">{overdueCount}</div>
            <p className="text-xs text-amber-500/80 mt-1">Avis d'impayé préventifs</p>
          </div>

          <div className="bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-rose-400">Verrouillés (J≥3)</span>
              <Lock className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-3xl font-extrabold text-rose-400">{lockedCount}</div>
            <p className="text-xs text-rose-500/80 mt-1">Mode Kiosk strict actif</p>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-md">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Rechercher par nom, IMEI, téléphone, plaque..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button 
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tous ({drivers.length})
            </button>
            <button 
              onClick={() => setStatusFilter('UP_TO_DATE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'UP_TO_DATE' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              À jour ({activeCount})
            </button>
            <button 
              onClick={() => setStatusFilter('LOCKED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'LOCKED' ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Bloqués ({lockedCount})
            </button>
            <button 
              onClick={fetchData}
              title="Rafraîchir"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Fleet List / Table */}
        {filteredDrivers.length === 0 ? (
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center animate-pulse">
              <Wifi className="w-8 h-8 text-cyan-400" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-lg font-bold text-white">En attente de connexion du premier terminal</h3>
              <p className="text-xs text-slate-400">
                Aucun téléphone pré-enregistré. Dès que vous installez LockER sur un Samsung Galaxy A34, son IMEI est automatiquement détecté et sa ligne apparaîtra ici en direct !
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setShowQrModal(true)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-600/20 transition flex items-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                Afficher le QR Code d'Enrôlement
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0D1322] text-slate-400 border-b border-slate-800/80 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-5">Conducteur / Appareil</th>
                    <th className="py-4 px-5">Identifiant Matériel (IMEI)</th>
                    <th className="py-4 px-5">Règle de Paiement</th>
                    <th className="py-4 px-5">Statut Actuel</th>
                    <th className="py-4 px-5 text-right">Actions Administrateur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredDrivers.map((driver) => {
                    const isLocked = driver.current_status === 'LOCKED';
                    const dev = devices[driver.id];

                    return (
                      <tr key={driver.id} className="hover:bg-slate-800/30 transition-colors group">
                        
                        {/* Conducteur */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs">
                              {driver.full_name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-white group-hover:text-cyan-400 transition">
                                {driver.full_name}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <PhoneCall className="w-3 h-3 text-slate-500" />
                                {driver.phone_number}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* IMEI & Véhicule */}
                        <td className="py-4 px-5">
                          <div className="space-y-1">
                            <div className="inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-cyan-400 font-semibold">
                              <Smartphone className="w-3 h-3 text-cyan-400" />
                              {dev ? dev.imei : "En attente de synchronisation"}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Véhicule : <span className="text-slate-200 font-medium">{driver.vehicle_plate || 'Non renseigné'}</span>
                            </div>
                          </div>
                        </td>

                        {/* Règle de Paiement */}
                        <td className="py-4 px-5">
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-200 flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                              {driver.daily_rate_xof.toLocaleString()} FCFA
                              <span className="text-xs font-normal text-slate-500">/ jour</span>
                            </div>
                            <div className="text-xs text-slate-400">
                              {driver.consecutive_overdue_days === 0 ? (
                                <span className="text-emerald-400 font-medium">À jour</span>
                              ) : (
                                <span className="text-amber-400 font-medium">{driver.consecutive_overdue_days} jour(s) impayé</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Statut Badge */}
                        <td className="py-4 px-5">
                          {driver.current_status === 'UP_TO_DATE' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <ShieldCheck className="w-3.5 h-3.5" /> Normal (En règle)
                            </span>
                          )}
                          {driver.current_status === 'OVERDUE_1' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              <AlertTriangle className="w-3.5 h-3.5" /> Retard 1j
                            </span>
                          )}
                          {driver.current_status === 'OVERDUE_2' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30">
                              <AlertTriangle className="w-3.5 h-3.5" /> Retard 2j (Pré-blocage)
                            </span>
                          )}
                          {driver.current_status === 'LOCKED' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
                              <Lock className="w-3.5 h-3.5" /> Bloqué (Kiosk)
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5 text-right space-x-2">
                          {/* Bouton Configurer Règle */}
                          <button
                            onClick={() => openEditModal(driver)}
                            title="Configurer règles et infos"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition inline-flex items-center"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>

                          {/* Bouton Verrouiller / Déverrouiller */}
                          <button
                            onClick={() => handleToggleLock(driver)}
                            disabled={loadingActionId === driver.id}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-lg ${
                              isLocked
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                            }`}
                          >
                            {loadingActionId === driver.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : isLocked ? (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                <span>Déverrouiller</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Verrouiller</span>
                              </>
                            )}
                          </button>

                          {/* Bouton Supprimer */}
                          <button
                            onClick={() => handleDeleteDriver(driver.id, driver.full_name)}
                            title="Supprimer la fiche"
                            className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 border border-slate-800 transition inline-flex items-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* Modal : Configurer le Conducteur & la Règle de Paiement */}
      {editingDriver && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Configurer le Terminal & les Règles</h3>
              </div>
              <button onClick={() => setEditingDriver(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDriverConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">Nom du Conducteur</label>
                <input 
                  type="text" 
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">Téléphone Bénin</label>
                  <input 
                    type="text" 
                    value={editForm.phone_number}
                    onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">Plaque d'Immatriculation</label>
                  <input 
                    type="text" 
                    value={editForm.vehicle_plate}
                    onChange={(e) => setEditForm({ ...editForm, vehicle_plate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">Forfait Journalier (FCFA)</label>
                  <input 
                    type="number" 
                    value={editForm.daily_rate_xof}
                    onChange={(e) => setEditForm({ ...editForm, daily_rate_xof: parseInt(e.target.value) || 0 })}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">Statut Administratif</label>
                  <select 
                    value={editForm.current_status}
                    onChange={(e) => setEditForm({ ...editForm, current_status: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    <option value="UP_TO_DATE">À jour (En règle)</option>
                    <option value="OVERDUE_1">Retard J+1</option>
                    <option value="OVERDUE_2">Retard J+2</option>
                    <option value="LOCKED">Bloqué (Kiosk)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setEditingDriver(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition"
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition"
                >
                  Enregistrer les Règles
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Ajouter Manuellement un Conducteur */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Nouveau Conducteur</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDriver} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Nom Complet</label>
                <input 
                  type="text" 
                  placeholder="Ex: Bio Gado"
                  value={addForm.full_name}
                  onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Numéro Mobile (Bénin)</label>
                <input 
                  type="text" 
                  placeholder="+229 01 97 00 00"
                  value={addForm.phone_number}
                  onChange={(e) => setAddForm({ ...addForm, phone_number: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Plaque Véhicule</label>
                  <input 
                    type="text" 
                    placeholder="RB-1234-Parakou"
                    value={addForm.vehicle_plate}
                    onChange={(e) => setAddForm({ ...addForm, vehicle_plate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Versement (FCFA/j)</label>
                  <input 
                    type="number" 
                    value={addForm.daily_rate_xof}
                    onChange={(e) => setAddForm({ ...addForm, daily_rate_xof: parseInt(e.target.value) || 0 })}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition"
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 transition"
                >
                  Créer le profil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : QR Code d'Enrôlement */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">QR Code Android Enterprise</h3>
              <button onClick={() => setShowQrModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-white rounded-2xl inline-block shadow-inner">
              <img 
                src="/enrollment_qr.png" 
                alt="QR Code Enrôlement LockER" 
                className="w-56 h-56 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <p className="text-xs text-slate-400 text-left leading-relaxed">
              <strong>Instructions Samsung A34 :</strong><br/>
              1. Allumer le téléphone neuf (écran <em>"Bienvenue"</em>).<br/>
              2. Tapoter 6 fois sur l'écran pour ouvrir la caméra.<br/>
              3. Scanner ce QR Code pour installer automatiquement l'application.
            </p>

            <button 
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Modal : Configuration API Backend */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Paramètres Serveur API</h3>
              </div>
              <button onClick={() => setShowApiModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Définissez l'URL de votre serveur Backend FastAPI hébergé sur Render ou en local. L'état de connexion s'actualise instantanément.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">URL du Backend (FastAPI)</label>
                <input 
                  type="url" 
                  value={tempApiUrl} 
                  onChange={(e) => setTempApiUrl(e.target.value)}
                  placeholder="https://locker-2nuk.onrender.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTempApiUrl('https://locker-2nuk.onrender.com')}
                  className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg border border-slate-700"
                >
                  Défaut Render
                </button>
                <button
                  type="button"
                  onClick={() => setTempApiUrl('http://localhost:8000')}
                  className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700"
                >
                  Localhost (8000)
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
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
                  setShowApiModal(false);
                  showToast(`URL API mise à jour : ${cleaned}`, 'info');
                  setTimeout(fetchData, 300);
                }}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-600/30 transition"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
export default App;
