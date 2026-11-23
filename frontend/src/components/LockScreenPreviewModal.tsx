import React from 'react';
import { 
  X, 
  Lock, 
  ShieldCheck, 
  PhoneCall, 
  AlertOctagon, 
  RefreshCw, 
  CreditCard,
  Wifi,
  BatteryCharging
} from 'lucide-react';
import { Driver, Device } from '../types';

interface LockScreenPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver?: Driver | null;
  device?: Device | null;
  onSimulateUnlock?: () => void;
}

export const LockScreenPreviewModal: React.FC<LockScreenPreviewModalProps> = ({
  isOpen,
  onClose,
  driver,
  device,
  onSimulateUnlock
}) => {
  if (!isOpen) return null;

  const driverName = driver?.full_name || 'Conducteur Flotte';
  const vehicle = driver?.vehicle_plate || 'RB-Bénin';
  const imei = device?.imei || 'Non renseigné';
  const dailyRate = driver?.daily_rate_xof || 5000;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative flex flex-col items-center max-w-sm w-full my-auto animate-scale-up">
        
        {/* Close Button Top Right */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Realistic Smartphone Bezel */}
        <div className="w-[320px] sm:w-[350px] h-[660px] bg-[#0E1526] rounded-[48px] p-3 shadow-2xl border-4 border-[#2A3B5E] relative flex flex-col shadow-emerald-500/10">
          
          {/* Top Speaker & Camera Punch Hole */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 w-4 h-4 bg-black rounded-full z-30 border border-slate-700"></div>

          {/* Screen Container */}
          <div className="flex-1 bg-gradient-to-b from-[#070D1E] via-[#0B152B] to-[#060913] rounded-[38px] overflow-hidden flex flex-col text-slate-100 p-5 relative border border-slate-800">
            
            {/* Status Bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 pb-3 px-1 font-mono">
              <span>08:45</span>
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bold text-emerald-400">5G</span>
                <div className="flex items-center text-emerald-400">
                  <BatteryCharging className="w-4 h-4" />
                  <span className="text-[10px]">95%</span>
                </div>
              </div>
            </div>

            {/* Lock Screen Content */}
            <div className="flex-1 flex flex-col items-center justify-between text-center py-2 space-y-3">
              
              {/* MDM Security Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black tracking-widest uppercase">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>LOCKER MDM PROTECTION</span>
              </div>

              {/* Glowing Lock Icon */}
              <div className="relative my-1">
                <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-500 shadow-lg shadow-rose-500/30 animate-pulse">
                  <Lock className="w-8 h-8" />
                </div>
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-1">
                <h3 className="text-base font-extrabold tracking-tight text-white leading-tight">
                  TÉLÉPHONE BLOQUÉ
                </h3>
                <p className="text-xs text-rose-400 font-semibold">
                  Échéance journalière non régularisée (J≥3)
                </p>
              </div>

              {/* Driver & Vehicle Box */}
              <div className="w-full bg-[#0E1A33] border border-[#1E335F] rounded-2xl p-3 text-left space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Conducteur</span>
                  <span className="font-bold text-white truncate max-w-[150px]">{driverName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Véhicule</span>
                  <span className="font-mono text-emerald-400 font-bold">{vehicle}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">À payer</span>
                  <span className="font-bold text-white">{dailyRate.toLocaleString()} FCFA</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full space-y-2 pt-1">
                {/* 1. Pay via Mobile Money */}
                <button 
                  onClick={() => {
                    alert("Redirection vers le menu USSD MTN Mobile Money (*133#) ou Moov (*880#)");
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-extrabold text-xs shadow-md shadow-emerald-500/30 flex items-center justify-center gap-2 active:scale-95 transition"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>PAYER VIA MOBILE MONEY</span>
                </button>

                {/* 2. Refresh Status / Unlock if paid */}
                <button 
                  onClick={onSimulateUnlock}
                  className="w-full py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>J'AI EFFECTUÉ LE PAIEMENT</span>
                </button>

                {/* 3. Call Fleet Support */}
                <button 
                  className="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Appeler le Support (+229)</span>
                </button>

                {/* 4. Emergency Call 112 */}
                <button 
                  className="w-full py-1.5 rounded-xl bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-[11px] flex items-center justify-center gap-1.5"
                >
                  <AlertOctagon className="w-3 h-3" />
                  <span>APPEL D'URGENCE (112)</span>
                </button>
              </div>

              {/* Watermark & Legal Footer */}
              <div className="text-[10px] text-slate-500 font-mono pt-1">
                IMEI : {imei.length > 8 ? imei.slice(0, 8) + '****' : imei} • {device?.model || 'Smartphone Android'}
              </div>

            </div>

          </div>

          {/* Bottom Home Indicator Bar */}
          <div className="w-32 h-1 bg-slate-600 rounded-full mx-auto mt-2"></div>

        </div>

        <p className="text-xs text-slate-400 mt-3 text-center">
          Aperçu direct de l'affichage Kiosk sous verrouillage.
        </p>

      </div>
    </div>
  );
};
