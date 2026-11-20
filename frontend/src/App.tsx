import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Lock, 
  Unlock, 
  Smartphone, 
  Car, 
  User, 
  Clock, 
  Search, 
  RefreshCw, 
  PhoneCall, 
  AlertTriangle,
  TrendingUp
} from 'lucide-react';
import { Driver, DriverStatus } from './types';

// Données initiales représentatives des 20 téléphones Samsung A34 5G au Bénin
const INITIAL_DRIVERS: Driver[] = [
  {
    id: 1,
    full_name: "Koffi Mensah",
    phone_number: "+229 97 12 34 56",
    national_id: "CIP-2023-99881",
    vehicle_plate: "RB-4512-Cotonou",
    daily_rate_xof: 5000,
    current_status: "UP_TO_DATE",
    consecutive_overdue_days: 0,
    created_at: "2026-11-01T08:00:00Z",
    updated_at: "2026-11-20T07:30:00Z"
  },
  {
    id: 2,
    full_name: "Bio Gado",
    phone_number: "+229 96 44 21 00",
    national_id: "CIP-2022-44120",
    vehicle_plate: "RB-8891-Parakou",
    daily_rate_xof: 5000,
    current_status: "OVERDUE_1",
    consecutive_overdue_days: 1,
    created_at: "2026-11-01T08:00:00Z",
    updated_at: "2026-11-19T08:00:00Z"
  },
  {
    id: 3,
    full_name: "Sébastien Dossou",
    phone_number: "+229 61 78 90 12",
    national_id: "CIP-2024-11029",
    vehicle_plate: "RB-1209-Abomey",
    daily_rate_xof: 5000,
    current_status: "LOCKED",
    consecutive_overdue_days: 3,
    created_at: "2026-11-01T08:00:00Z",
    updated_at: "2026-11-20T10:15:00Z"
  },
  {
    id: 4,
    full_name: "Awaou Chabi",
    phone_number: "+229 95 33 22 11",
    national_id: "CIP-2021-33984",
    vehicle_plate: "RB-6677-PortoNovo",
    daily_rate_xof: 5000,
    current_status: "UP_TO_DATE",
    consecutive_overdue_days: 0,
    created_at: "2026-11-01T08:00:00Z",
    updated_at: "2026-11-20T09:00:00Z"
  },
  {
    id: 5,
    full_name: "Aimé Houndegbe",
    phone_number: "+229 90 11 88 44",
    national_id: "CIP-2023-77621",
    vehicle_plate: "RB-3321-Calavi",
    daily_rate_xof: 5000,
    current_status: "OVERDUE_2",
    consecutive_overdue_days: 2,
    created_at: "2026-11-01T08:00:00Z",
    updated_at: "2026-11-18T08:00:00Z"
  }
];

export function App() {
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleToggleLock = async (driver: Driver) => {
    setLoadingActionId(driver.id);
    const isCurrentlyLocked = driver.current_status === 'LOCKED';
    const action = isCurrentlyLocked ? 'unblock' : 'block';

    try {
      // Simulation d'appel API vers FastAPI Backend
      // await fetch(`http://localhost:8000/api/v1/${action}/${driver.id}`, { method: 'POST' });
      
      setDrivers(prev => prev.map(d => {
        if (d.id === driver.id) {
          return {
            ...d,
            current_status: isCurrentlyLocked ? 'UP_TO_DATE' : 'LOCKED',
            consecutive_overdue_days: isCurrentlyLocked ? 0 : 3
          };
        }
        return d;
      }));

      showNotification(
        isCurrentlyLocked 
          ? `Ordre UNLOCK transmis via FCM à l'appareil de ${driver.full_name}. Déverrouillage en cours.` 
          : `Ordre LOCK transmis via FCM à l'appareil de ${driver.full_name}. Mode Kiosk activé.`
      );
    } catch (err) {
      alert("Erreur lors de la communication avec le serveur.");
    } finally {
      setLoadingActionId(null);
    }
  };

  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = d.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          d.phone_number.includes(searchTerm) ||
                          (d.vehicle_plate && d.vehicle_plate.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = statusFilter === 'ALL' || d.current_status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  const totalDrivers = 20; // Capacité totale du parc
  const activeCount = drivers.filter(d => d.current_status === 'UP_TO_DATE').length;
  const overdueCount = drivers.filter(d => d.current_status.startsWith('OVERDUE')).length;
  const lockedCount = drivers.filter(d => d.current_status === 'LOCKED').length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur sticky top-0 z-40 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="bg-red-600/20 p-2.5 rounded-xl border border-red-500/30">
            <ShieldAlert className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              LockER <span className="text-xs bg-red-950 text-red-400 border border-red-800/50 px-2 py-0.5 rounded-full font-medium">Bénin MDM</span>
            </h1>
            <p className="text-xs text-slate-400">Gestion et Verrouillage Flotte Samsung Galaxy A34 5G</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-400">Support Conducteurs</p>
            <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1">
              <PhoneCall className="w-3.5 h-3.5" /> +229 97 00 00 00
            </p>
          </div>
        </div>
      </header>

      {/* Notifications Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-emerald-500 text-white px-5 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-fade-in">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-sm">{notification}</p>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold">Parc A34 5G</span>
              <Smartphone className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">{totalDrivers} terminaux</div>
            <p className="text-xs text-slate-400 mt-1">20 conducteurs conventionnés</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold">Paiements à jour</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">{activeCount}</div>
            <p className="text-xs text-emerald-500/80 mt-1">Versements journaliers reçus</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold">Retards J+1 / J+2</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400">{overdueCount}</div>
            <p className="text-xs text-amber-500/80 mt-1">Notifications préventives envoyées</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold">Verrouillés (J≥3)</span>
              <Lock className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold text-red-500">{lockedCount}</div>
            <p className="text-xs text-red-400/80 mt-1">Mode Kiosk actif (Bloqué)</p>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Rechercher par nom, téléphone, plaque..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Filtrer par statut :</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="UP_TO_DATE">À jour (En règle)</option>
              <option value="OVERDUE_1">Retard J+1</option>
              <option value="OVERDUE_2">Retard J+2</option>
              <option value="LOCKED">Verrouillés (J+3)</option>
            </select>
          </div>
        </div>

        {/* Drivers Table */}
        <div className="bg-slate-800/50 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="py-3.5 px-4">Conducteur</th>
                  <th className="py-3.5 px-4">Véhicule</th>
                  <th className="py-3.5 px-4">Versement Quotidien</th>
                  <th className="py-3.5 px-4">Statut Paiement</th>
                  <th className="py-3.5 px-4">Retard</th>
                  <th className="py-3.5 px-4 text-right">Action Verrouillage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDrivers.map((driver) => {
                  const isLocked = driver.current_status === 'LOCKED';
                  return (
                    <tr key={driver.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-white">{driver.full_name}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-slate-500" /> {driver.phone_number}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-mono text-xs bg-slate-900 border border-slate-700 px-2 py-1 rounded inline-block text-slate-300">
                          {driver.vehicle_plate}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">Galaxy A34 5G</div>
                      </td>
                      <td className="py-4 px-4 font-medium text-slate-200">
                        {driver.daily_rate_xof.toLocaleString()} FCFA <span className="text-xs text-slate-500">/ jour</span>
                      </td>
                      <td className="py-4 px-4">
                        {driver.current_status === 'UP_TO_DATE' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck className="w-3.5 h-3.5" /> À jour
                          </span>
                        )}
                        {driver.current_status === 'OVERDUE_1' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="w-3.5 h-3.5" /> Retard 1j
                          </span>
                        )}
                        {driver.current_status === 'OVERDUE_2' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                            <AlertTriangle className="w-3.5 h-3.5" /> Retard 2j (Dernier avis)
                          </span>
                        )}
                        {driver.current_status === 'LOCKED' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                            <Lock className="w-3.5 h-3.5" /> Bloqué (J≥3)
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-slate-400 text-xs">
                        {driver.consecutive_overdue_days === 0 ? (
                          <span className="text-emerald-500 font-medium">Aucun retard</span>
                        ) : (
                          <span className="text-red-400 font-semibold">{driver.consecutive_overdue_days} jour(s) impayé</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => handleToggleLock(driver)}
                          disabled={loadingActionId === driver.id}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isLocked 
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30' 
                              : 'bg-red-600/90 hover:bg-red-500 text-white shadow-lg shadow-red-900/30'
                          }`}
                        >
                          {loadingActionId === driver.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : isLocked ? (
                            <>
                              <Unlock className="w-3.5 h-3.5" /> Déverrouiller
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" /> Bloquer
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/60 py-4 px-6 text-center text-xs text-slate-500">
        LockER Fleet Management Platform • Conforme APDP & Code du Numérique du Bénin (Loi n°2017-20)
      </footer>
    </div>
  );
}

export default App;
