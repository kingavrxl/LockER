import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  Smartphone, 
  Search, 
  RefreshCw, 
  PhoneCall, 
  AlertTriangle,
  Sliders,
  Trash2,
  MapPin,
  CreditCard,
  Wifi,
  Battery,
  Radio,
  Eye
} from 'lucide-react';
import { Driver, Device } from '../types';

interface FleetTableProps {
  drivers: Driver[];
  devices: Record<number, Device>;
  theme: 'dark' | 'light';
  onToggleLock: (driver: Driver) => void;
  onOpenEditModal: (driver: Driver) => void;
  onDeleteDriver: (driverId: number, name: string) => void;
  onOpenPaymentModal: (driver: Driver) => void;
  onOpenLiveMapForDriver: (driver: Driver) => void;
  onOpenLockScreenPreview: (driver: Driver) => void;
  loadingActionId: number | null;
  onRefreshData: () => void;
}

export const FleetTable: React.FC<FleetTableProps> = ({
  drivers,
  devices,
  theme,
  onToggleLock,
  onOpenEditModal,
  onDeleteDriver,
  onOpenPaymentModal,
  onOpenLiveMapForDriver,
  onOpenLockScreenPreview,
  loadingActionId,
  onRefreshData
}) => {
  const isDark = theme === 'dark';
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filteredDrivers = drivers.filter((d) => {
    const dev = devices[d.id];
    const matchesSearch =
      d.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone_number.includes(searchTerm) ||
      (d.vehicle_plate && d.vehicle_plate.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (dev && dev.imei.includes(searchTerm)) ||
      (dev?.ip_address && dev.ip_address.includes(searchTerm));

    if (statusFilter === 'ALL') return matchesSearch;
    return matchesSearch && d.current_status === statusFilter;
  });

  const activeCount = drivers.filter((d) => d.current_status === 'UP_TO_DATE').length;
  const lockedCount = drivers.filter((d) => d.current_status === 'LOCKED').length;

  return (
    <div className="space-y-4 animate-fadeIn">
      
      {/* Search & Filters Bar */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 ${
        isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Rechercher par nom, IMEI, IP, plaque, téléphone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
              isDark 
                ? 'bg-[#070D1E] border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500' 
                : 'bg-slate-50 border border-slate-300 text-slate-800 placeholder-slate-400 focus:border-emerald-500'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-semibold">
          <button 
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'ALL'
                ? 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tous ({drivers.length})
          </button>

          <button 
            onClick={() => setStatusFilter('UP_TO_DATE')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'UP_TO_DATE'
                ? 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            À jour ({activeCount})
          </button>

          <button 
            onClick={() => setStatusFilter('LOCKED')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'LOCKED'
                ? 'bg-rose-600 text-white shadow'
                : isDark ? 'text-rose-400 hover:bg-rose-500/10' : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            Bloqués ({lockedCount})
          </button>

          <button 
            onClick={onRefreshData}
            title="Rafraîchir"
            className={`p-2 rounded-lg border transition ${
              isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className={`rounded-2xl border overflow-hidden shadow-xl ${
        isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b font-bold uppercase tracking-wider text-[11px] ${
              isDark 
                ? 'bg-[#070D1E] text-slate-400 border-[#1E2E56]' 
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}>
              <tr>
                <th className="py-3.5 px-4">Conducteur / Véhicule</th>
                <th className="py-3.5 px-4">Identifiants Matériels (IMEI)</th>
                <th className="py-3.5 px-4">Adresses & Réseau</th>
                <th className="py-3.5 px-4">GPS & Batterie</th>
                <th className="py-3.5 px-4">Statut & Échéance</th>
                <th className="py-3.5 px-4 text-right">Actions de Contrôle</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-[#1E2E56]' : 'divide-slate-200'}`}>
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Aucun conducteur trouvé pour ce filtre.
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => {
                  const dev = devices[driver.id];
                  const isLocked = driver.current_status === 'LOCKED';
                  const isOverdue = driver.current_status.startsWith('OVERDUE');

                  return (
                    <tr 
                      key={driver.id} 
                      className={`transition ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}
                    >
                      {/* Driver & Vehicle */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center text-xs shrink-0 ${
                            isDark ? 'bg-slate-800 text-emerald-400' : 'bg-slate-100 text-emerald-600'
                          }`}>
                            {driver.full_name.charAt(0)}
                          </div>
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-100 truncate max-w-[140px]">
                              {driver.full_name}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                              <PhoneCall className="w-3 h-3 text-slate-500" />
                              {driver.phone_number}
                            </div>
                            <div className="text-[10px] text-emerald-400 font-medium">
                              Plaque : {driver.vehicle_plate || 'RB-Bénin'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* IMEI & Hardware */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5 font-mono">
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/30 border border-slate-700 text-emerald-300 font-bold text-[11px]">
                            <Smartphone className="w-3 h-3 text-emerald-400" />
                            {dev ? dev.imei : '352965710157155'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {dev?.model || 'Samsung Galaxy A34 5G'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            S/N : {dev?.serial_number || `R58W${driver.id}084`}
                          </div>
                        </div>
                      </td>

                      {/* Addresses & Network */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5 font-mono text-[11px]">
                          <div className="text-cyan-400 flex items-center gap-1">
                            <Wifi className="w-3 h-3" />
                            <span>IP : {dev?.ip_address || '197.234.221.42'}</span>
                          </div>
                          <div className="text-slate-400 text-[10px]">
                            MAC : {dev?.mac_address || '38:F9:D3:5B:2A:10'}
                          </div>
                          <div className="text-amber-400 text-[10px] font-sans flex items-center gap-1">
                            <Radio className="w-3 h-3" />
                            <span>{dev?.network_operator || 'MTN Bénin 5G'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Live GPS & Battery */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                            <span className="text-[11px]">Point Vert Fixé</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {dev?.latitude?.toFixed(4) || '6.3685'}°N, {dev?.longitude?.toFixed(4) || '2.4280'}°E
                          </div>
                          <div className="text-[10px] text-slate-300 flex items-center gap-1">
                            <Battery className="w-3 h-3 text-emerald-400" />
                            <span>Batterie : {dev?.battery_level || 95}%</span>
                          </div>
                        </div>
                      </td>

                      {/* Status & Overdue */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[11px] font-bold animate-pulse">
                              <Lock className="w-3 h-3" />
                              Bloqué (Kiosk)
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[11px] font-bold">
                              <AlertTriangle className="w-3 h-3" />
                              Retard {driver.consecutive_overdue_days}j
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold">
                              <ShieldCheck className="w-3 h-3" />
                              À jour (En règle)
                            </span>
                          )}
                          <div className="text-[10px] text-slate-400">
                            {driver.daily_rate_xof.toLocaleString()} FCFA / jour
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          
                          {/* Localiser (Itinéraire) */}
                          <button
                            onClick={() => onOpenLiveMapForDriver(driver)}
                            title="Localiser sur la carte & tracer l'itinéraire"
                            className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>

                          {/* Aperçu Kiosk Lock Screen */}
                          <button
                            onClick={() => onOpenLockScreenPreview(driver)}
                            title="Aperçu Écran de Verrouillage Samsung"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Payer / Débloquer Mobile Money */}
                          <button
                            onClick={() => onOpenPaymentModal(driver)}
                            title="Régulariser paiement Mobile Money"
                            className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>

                          {/* Verrouiller / Déverrouiller Switch */}
                          <button
                            onClick={() => onToggleLock(driver)}
                            disabled={loadingActionId === driver.id}
                            className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 shadow ${
                              isLocked
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-rose-600 hover:bg-rose-500 text-white'
                            }`}
                          >
                            {loadingActionId === driver.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : isLocked ? (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>Débloquer</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Bloquer</span>
                              </>
                            )}
                          </button>

                          {/* Configurer */}
                          <button
                            onClick={() => onOpenEditModal(driver)}
                            title="Paramètres & Règles"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>

                          {/* Supprimer */}
                          <button
                            onClick={() => onDeleteDriver(driver.id, driver.full_name)}
                            title="Supprimer"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-slate-500 hover:text-rose-400 border border-slate-800 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
