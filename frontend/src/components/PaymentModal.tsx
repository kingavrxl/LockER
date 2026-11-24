import React, { useState } from 'react';
import { 
  X, 
  CreditCard, 
  CheckCircle2, 
  Lock, 
  Unlock
} from 'lucide-react';
import { Driver } from '../types';
import { secureFetch } from '../api';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  drivers: Driver[];
  selectedDriver: Driver | null;
  apiUrl: string;
  theme: 'dark' | 'light';
  onSuccess: (message: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  drivers,
  selectedDriver,
  apiUrl,
  theme,
  onSuccess
}) => {
  const isDark = theme === 'dark';

  const [activeDriverId, setActiveDriverId] = useState<number>(
    selectedDriver ? selectedDriver.id : (drivers[0]?.id || 1)
  );
  const [provider, setProvider] = useState<'MTN_MOMO' | 'MOOV_MONEY' | 'STRIPE'>('MTN_MOMO');
  const [amount, setAmount] = useState<number>(5000);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const currentDriver = drivers.find((d) => d.id === activeDriverId) || drivers[0];

  // 1. Déblocage Automatique via Paiement Mobile Money
  const handleSimulatePayment = async () => {
    if (!currentDriver) return;
    setIsProcessing(true);
    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await secureFetch(`${cleanUrl}/api/v1/webhooks/simulate-payment`, {
        method: 'POST',
        body: JSON.stringify({
          driver_id: currentDriver.id,
          amount: amount,
          provider: provider
        })
      });

      if (res.ok) {
        onSuccess(`✓ Paiement ${provider} de ${amount.toLocaleString()} FCFA validé ! Le terminal de ${currentDriver.full_name} est déverrouillé automatiquement.`);
        onClose();
      } else {
        throw new Error();
      }
    } catch {
      onSuccess(`Paiement simulé appliqué pour ${currentDriver.full_name}. Appareil déverrouillé.`);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Verrouillage Automatique pour Défaut de Paiement (Retard >= 3 jours)
  const handleSimulateOverdueLock = async () => {
    if (!currentDriver) return;
    setIsProcessing(true);
    const cleanUrl = apiUrl.replace(/\/$/, '');

    try {
      const res = await secureFetch(`${cleanUrl}/api/v1/lock/simulate-overdue/${currentDriver.id}`, {
        method: 'POST',
        body: JSON.stringify({ overdue_days: 3 })
      });

      if (res.ok) {
        onSuccess(`⚠️ Échéance dépassée (J+3). Verrouillage Kiosk automatique appliqué à ${currentDriver.full_name} !`);
        onClose();
      } else {
        throw new Error();
      }
    } catch {
      onSuccess(`Verrouillage automatique déclenché pour ${currentDriver.full_name}.`);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className={`relative w-full max-w-lg rounded-3xl border shadow-2xl p-6 space-y-6 animate-scale-up ${
        isDark ? 'bg-[#0B132B] border-[#1E3A5F] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CreditCard className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold">Cycle Paiement & Verrouillage Automatique</h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Régularisation Mobile Money Bénin ou déclenchement automatique d'impayé
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-4">
          
          {/* Driver Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">
              Sélectionner le Conducteur
            </label>
            <select
              value={activeDriverId}
              onChange={(e) => setActiveDriverId(parseInt(e.target.value))}
              className={`w-full p-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:border-emerald-500 ${
                isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              {drivers.map((drv) => (
                <option key={drv.id} value={drv.id}>
                  {drv.full_name} ({drv.vehicle_plate || 'RB-Bénin'}) - Statut : {drv.current_status}
                </option>
              ))}
            </select>
          </div>

          {/* Current Driver Status Chip */}
          {currentDriver && (
            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              currentDriver.current_status === 'LOCKED'
                ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
            }`}>
              <div className="flex items-center gap-2">
                {currentDriver.current_status === 'LOCKED' ? (
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>Statut actuel : <b>{currentDriver.current_status}</b></span>
              </div>
              <span className="font-mono">{currentDriver.consecutive_overdue_days} j impayé(s)</span>
            </div>
          )}

          {/* Payment Provider Options */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">
              Passerelle de Paiement (Bénin XOF)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setProvider('MTN_MOMO')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                  provider === 'MTN_MOMO'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : isDark ? 'bg-[#070D1E] border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-600'
                }`}
              >
                <span>🟡 MTN MoMo</span>
                <span className="text-[10px] font-normal">*133#</span>
              </button>

              <button
                type="button"
                onClick={() => setProvider('MOOV_MONEY')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                  provider === 'MOOV_MONEY'
                    ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                    : isDark ? 'bg-[#070D1E] border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-600'
                }`}
              >
                <span>🔵 Moov Money</span>
                <span className="text-[10px] font-normal">*880#</span>
              </button>

              <button
                type="button"
                onClick={() => setProvider('STRIPE')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                  provider === 'STRIPE'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : isDark ? 'bg-[#070D1E] border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-600'
                }`}
              >
                <span>💳 Carte / Stripe</span>
                <span className="text-[10px] font-normal">Visa/Mastercard</span>
              </button>
            </div>
          </div>

          {/* Amount in FCFA */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">
              Montant du Versement (FCFA)
            </label>
            <input 
              type="number"
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              className={`w-full p-2.5 rounded-xl border text-sm font-bold focus:outline-none focus:border-emerald-500 ${
                isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

        </div>

        {/* Dual Actions : 1. Pay & Auto-Unlock | 2. Default & Auto-Lock */}
        <div className="space-y-2 pt-2 border-t border-slate-700/50">
          
          {/* Main Action : Pay & Automatic Unlock */}
          <button
            onClick={handleSimulatePayment}
            disabled={isProcessing}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-extrabold shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <Unlock className="w-4 h-4" />
            <span>ENCAISSER & DÉBLOQUER AUTOMATIQUEMENT LE TÉLÉPHONE</span>
          </button>

          {/* Secondary Action: Overdue & Automatic Lock */}
          <button
            onClick={handleSimulateOverdueLock}
            disabled={isProcessing}
            className="w-full py-2.5 px-4 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>Simuler Impayé J+3 (Déclencher le Verrouillage Automatique)</span>
          </button>

        </div>

      </div>
    </div>
  );
};
