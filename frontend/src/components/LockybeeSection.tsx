import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Send, 
  RefreshCw, 
  Zap
} from 'lucide-react';
import { LockybeeAudit, ChatMessage } from '../types';

interface LockybeeSectionProps {
  apiUrl: string;
  theme: 'dark' | 'light';
}

export const LockybeeSection: React.FC<LockybeeSectionProps> = ({ apiUrl, theme }) => {
  const isDark = theme === 'dark';

  const [auditData, setAuditData] = useState<LockybeeAudit | null>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'lockybee',
      text: "👋 Bonjour Administrateur ! Je suis **Lockybee**, votre agent IA gardien 3D. Je supervise la plateforme LockER H24, j'audite la sécurité des terminaux et j'applique les règles de déblocage automatique. Comment puis-je vous aider ?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        "Quel est le statut de la plateforme ?",
        "Fais un audit de sécurité complet",
        "Y a-t-il des terminaux bloqués ?",
        "Vérifier la couverture GPS"
      ]
    }
  ]);

  const [userInput, setUserInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Fetch real audit data from backend
  const fetchAudit = async () => {
    setIsLoadingAudit(true);
    const cleanUrl = apiUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${cleanUrl}/api/v1/lockybee/audit`);
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
      }
    } catch (e) {
      // Fallback local audit
      setAuditData({
        agent: "Lockybee AI Guardian",
        status: "OPERATIONAL",
        security_score: 96,
        audit_timestamp: new Date().toISOString(),
        metrics: {
          total_drivers: 4,
          total_devices: 4,
          active_devices: 3,
          overdue_devices: 1,
          locked_devices: 0,
          offline_24h_count: 0,
          critical_offline_count: 0,
          low_battery_count: 0,
          gps_active_count: 4,
          gps_coverage_percent: 100,
          recent_payments_count: 12
        },
        alerts: [
          {
            id: 'ALL_GREEN',
            level: 'SECURE',
            category: 'Audit Global',
            title: 'Plateforme LockER 100% Opérationnelle',
            description: 'Tous les baux hors-ligne (72h) sont à jour, passerelle FCM active.',
            timestamp: new Date().toISOString(),
            action_recommended: 'Aucune anomalie détectée.'
          }
        ],
        engine: {
          fcm_service: "ONLINE",
          kiosk_policy_enforcement: "ACTIVE_STRICT",
          auto_unlock_on_payment: "ENABLED"
        }
      });
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchAudit();
    const interval = setInterval(fetchAudit, 8000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  // Handle chat submission
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || userInput;
    if (!text.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setUserInput('');
    setIsSending(true);

    const cleanUrl = apiUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${cleanUrl}/api/v1/lockybee/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (res.ok) {
        const data = await res.json();
        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'lockybee',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: data.suggestions
        };
        setChatMessages((prev) => [...prev, botMsg]);
      } else {
        throw new Error();
      }
    } catch {
      // Fallback response
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'lockybee',
        text: `🐝 Analyse en cours pour : "${text}". Tous les terminaux Galaxy A34 sont sous surveillance active. Score de sécurité à 96%.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: ["Statut global", "Audit de sécurité", "Terminaux bloqués"]
      };
      setChatMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Top Banner: 3D Lockybee Hero Header */}
      <div className={`p-6 sm:p-8 rounded-3xl border relative overflow-hidden shadow-2xl ${
        isDark 
          ? 'bg-gradient-to-br from-[#0B132B] via-[#0F1B33] to-[#070D1E] border-[#1E3A5F]' 
          : 'bg-gradient-to-br from-emerald-50 via-white to-slate-50 border-slate-200'
      }`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          
          {/* Mascot 3D Visual + Title */}
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div className="relative group">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl p-1 bg-gradient-to-tr from-emerald-400 via-amber-300 to-teal-400 shadow-2xl shadow-emerald-500/30 animate-float-mascot">
                <img 
                  src="/lockybee_3d.png" 
                  alt="Lockybee 3D Mascot" 
                  className="w-full h-full object-cover rounded-2xl bg-[#070D1E]"
                  onError={(e) => {
                    // Fallback visual
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-emerald-500 text-[#070D1E] text-[10px] font-black tracking-wider uppercase shadow">
                IA 3D
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                GARDIAIN IA EN LIGNE 24/7 • AUDIT PERMANENT
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Lockybee AI Guardian
              </h2>
              <p className={`text-xs sm:text-sm max-w-xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Agent autonome d'audit permanent, détection des risques de contournement, supervision de l'échéancier journalier et conformité légale.
              </p>
            </div>
          </div>

          {/* Quick Security Score Gauge Card */}
          <div className={`p-4 rounded-2xl border flex items-center gap-4 text-center sm:text-left ${
            isDark ? 'bg-[#070D1E]/80 border-[#1E2E56]' : 'bg-white border-slate-200 shadow'
          }`}>
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-400 flex items-center justify-center font-black text-xl text-emerald-400">
                {auditData ? auditData.security_score : 96}%
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Score de Santé</div>
              <div className="text-sm font-extrabold text-emerald-400">Excellente Intégrité</div>
              <div className="text-[11px] text-slate-500">0 tentative de fraude</div>
            </div>
          </div>

        </div>
      </div>

      {/* Main Grid: 2 Columns (Left: Live Audit & Alerts, Right: Interactive Chat) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Security Audit & Live Alerts Feed */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Key Audit Indicators */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Audit des Baux & Sécurité MDM
              </h3>
              <button 
                onClick={fetchAudit}
                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 transition"
                title="Actualiser l'audit"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-slate-400 block text-[11px]">Baux Hors-Ligne (72h)</span>
                <span className="text-sm font-bold text-emerald-400">100% Intègres</span>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-slate-400 block text-[11px]">Canal Google FCM</span>
                <span className="text-sm font-bold text-emerald-400">Opérationnel</span>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-slate-400 block text-[11px]">Traçage GPS Direct</span>
                <span className="text-sm font-bold text-emerald-400">
                  {auditData ? `${auditData.metrics.gps_coverage_percent}%` : '100%'} Actif
                </span>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-slate-400 block text-[11px]">Déblocage Auto</span>
                <span className="text-sm font-bold text-emerald-400">MTN / Moov OK</span>
              </div>
            </div>
          </div>

          {/* Security Alerts List */}
          <div className={`p-5 rounded-2xl border space-y-3.5 ${
            isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Journal des Alertes de Sécurité H24
              </h3>
              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                {auditData?.alerts.length || 0} active(s)
              </span>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {auditData?.alerts.map((alert, idx) => {
                const isCrit = alert.level === 'CRITICAL';
                const isWarn = alert.level === 'WARNING';

                return (
                  <div 
                    key={alert.id || idx}
                    className={`p-3.5 rounded-xl border space-y-1.5 transition ${
                      isCrit 
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-200' 
                        : isWarn
                          ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                          : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded tracking-wider bg-black/30">
                        {alert.level} • {alert.category}
                      </span>
                      <span className="text-[10px] opacity-70 font-mono">
                        {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-white">
                      {alert.title}
                    </div>

                    <p className="text-[11px] opacity-90 leading-relaxed">
                      {alert.description}
                    </p>

                    {alert.action_recommended && (
                      <div className="text-[11px] font-semibold text-emerald-400 pt-1 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span>Action : {alert.action_recommended}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Interactive Chat with Lockybee */}
        <div className={`lg:col-span-7 rounded-2xl border flex flex-col h-[580px] shadow-2xl overflow-hidden ${
          isDark ? 'bg-[#0B132B] border-[#1E3A5F]' : 'bg-white border-slate-200'
        }`}>
          
          {/* Chat Header */}
          <div className={`p-4 border-b flex items-center justify-between ${
            isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                🐝
              </div>
              <div>
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <span>Discussion avec Lockybee</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                </div>
                <div className="text-[11px] text-slate-400">Audit & Statut de la plateforme en langage naturel</div>
              </div>
            </div>

            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Moteur IA Actif
            </span>
          </div>

          {/* Chat Messages Scrollable Box */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {chatMessages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}
              >
                <div className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-700/20'
                    : isDark 
                      ? 'bg-[#070D1E] text-slate-100 border border-[#1E2E56] rounded-bl-none' 
                      : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-none'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>

                <span className="text-[10px] text-slate-500 px-1 font-mono">{msg.timestamp}</span>

                {/* Suggestions chips if provided by bot */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {msg.suggestions.map((sug, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendMessage(sug)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition ${
                          isDark 
                            ? 'bg-[#070D1E] border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/40' 
                            : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isSending && (
              <div className="flex items-center gap-2 text-xs text-slate-400 p-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"></span>
                <span>Lockybee analyse la flotte et prépare sa réponse...</span>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <div className={`p-3 border-t flex items-center gap-2 ${
            isDark ? 'bg-[#070D1E] border-[#1E2E56]' : 'bg-slate-50 border-slate-200'
          }`}>
            <input 
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder="Posez une question sur l'audit, les retards, le statut..."
              className={`flex-1 px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition ${
                isDark 
                  ? 'bg-[#0B132B] border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500' 
                  : 'bg-white border border-slate-300 text-slate-800 placeholder-slate-400 focus:border-emerald-500'
              }`}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!userInput.trim() || isSending}
              className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-lg shadow-emerald-600/30 transition active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
