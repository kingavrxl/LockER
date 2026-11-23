import React from 'react';
import { 
  Sun, 
  Moon, 
  QrCode, 
  Sliders, 
  MapPin, 
  LayoutDashboard, 
  Smartphone, 
  CreditCard, 
  Calendar,
  Eye
} from 'lucide-react';

interface NavigationProps {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  activeSection: 'dashboard' | 'fleet' | 'map' | 'lockybee' | 'payments' | 'rules' | 'preview';
  setActiveSection: (sec: 'dashboard' | 'fleet' | 'map' | 'lockybee' | 'payments' | 'rules' | 'preview') => void;
  onOpenAddWizard: () => void;
  onOpenConfigApi: () => void;
  isApiOnline: boolean | null;
  securityScore: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  theme,
  toggleTheme,
  activeSection,
  setActiveSection,
  onOpenAddWizard,
  onOpenConfigApi,
  isApiOnline,
  securityScore
}) => {
  const isDark = theme === 'dark';

  return (
    <header className={`sticky top-0 z-40 transition-colors duration-200 ${
      isDark 
        ? 'bg-[#070D1E]/90 border-b border-[#1E2E56] text-slate-100' 
        : 'bg-white/95 border-b border-slate-200 text-slate-800 shadow-sm'
    } backdrop-blur-xl px-4 lg:px-8 py-3.5`}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <img 
              src="/locker_app_icon.png" 
              alt="LockER Icon" 
              className="w-11 h-11 rounded-2xl shadow-lg shadow-emerald-500/20 object-cover border border-emerald-500/30"
              onError={(e) => {
                // Fallback si l'image charge
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#070D1E] animate-pulse"></span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                LockER
              </h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                isDark 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                MDM Enterprise • Bénin
              </span>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Plateforme de Gestion &amp; Verrouillage Flotte Android
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Sections) */}
        <nav className={`flex items-center gap-1.5 p-1 rounded-xl text-xs font-semibold ${
          isDark ? 'bg-[#0B152B] border border-[#1E2E56]' : 'bg-slate-100 border border-slate-200'
        }`}>
          <button
            onClick={() => setActiveSection('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeSection === 'dashboard'
                ? isDark ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Tableau de Bord</span>
          </button>

          <button
            onClick={() => setActiveSection('fleet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeSection === 'fleet'
                ? isDark ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Flotte</span>
          </button>

          <button
            onClick={() => setActiveSection('map')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeSection === 'map'
                ? isDark ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>GPS Direct</span>
          </button>

          <button
            onClick={() => setActiveSection('lockybee')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeSection === 'lockybee'
                ? isDark ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="text-sm">🐝</span>
            <span>Lockybee IA</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              {securityScore}%
            </span>
          </button>

          <button
            onClick={() => setActiveSection('payments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeSection === 'payments'
                ? isDark ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Paiements</span>
          </button>

          <button
            onClick={() => setActiveSection('rules')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeSection === 'rules'
                ? isDark ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Règles & Échéanciers</span>
          </button>

          <button
            onClick={() => setActiveSection('preview')}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeSection === 'preview'
                ? isDark ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-600 text-white shadow'
                : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Kiosk</span>
          </button>
        </nav>

        {/* Right Actions: Add Phone Process, API Status & Theme Toggle */}
        <div className="flex items-center gap-2.5">
          {/* Add Phone via Process Button */}
          <button
            onClick={onOpenAddWizard}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 transition active:scale-95"
          >
            <QrCode className="w-4 h-4" />
            <span>+ Ajouter un Téléphone</span>
          </button>

          {/* API Health indicator button */}
          <button 
            onClick={onOpenConfigApi}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
              isApiOnline 
                ? isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : isApiOnline === false 
                  ? isDark ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-rose-50 border-rose-300 text-rose-700'
                  : isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-600'
            }`}
            title="Paramètres de connexion API"
          >
            <span className={`w-2 h-2 rounded-full ${isApiOnline ? 'bg-emerald-400 animate-ping' : isApiOnline === false ? 'bg-rose-500' : 'bg-amber-400'}`}></span>
            <span className="hidden xl:inline">{isApiOnline ? 'API Connectée' : isApiOnline === false ? 'API Déconnectée' : 'Connexion...'}</span>
            <Sliders className="w-3 h-3 opacity-70" />
          </button>

          {/* Dark / Light Mode Switcher */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl border transition ${
              isDark 
                ? 'bg-[#0B152B] border-[#1E2E56] text-amber-300 hover:bg-[#112040]' 
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
            title={isDark ? "Passer en mode Clair (Blanc / Vert)" : "Passer en mode Sombre (Bleu Nuit / Vert)"}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

      </div>
    </header>
  );
};
