import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CreditCard, 
  Plus, 
  Trash2, 
  ShieldAlert, 
  CheckCircle2, 
  RefreshCw,
  Clock
} from 'lucide-react';
import { PaymentScheduleRule } from '../types';

interface RulesSectionProps {
  apiUrl: string;
  theme: 'dark' | 'light';
}

export const RulesSection: React.FC<RulesSectionProps> = ({ apiUrl, theme }) => {
  const isDark = theme === 'dark';

  const [rules, setRules] = useState<PaymentScheduleRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [dueDateStr, setDueDateStr] = useState('');
  const [amountXof, setAmountXof] = useState(5000);
  const [paymentMethod, setPaymentMethod] = useState('🟡 MTN Mobile Money (*133#) & 🔵 Moov Money (*880#)');
  const [instructions, setInstructions] = useState('Payer par Mobile Money MTN (*133#) ou Moov (*880#). Déblocage automatique instantané.');
  const [graceDays, setGraceDays] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRules = async () => {
    setIsLoading(true);
    const cleanUrl = apiUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${cleanUrl}/api/v1/rules`);
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [apiUrl]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueDateStr.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const cleanUrl = apiUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${cleanUrl}/api/v1/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || `Échéancier (${dueDateStr})`,
          due_date_str: dueDateStr.trim(),
          amount_xof: Number(amountXof),
          payment_method: paymentMethod,
          payment_instructions: instructions,
          grace_period_days: Number(graceDays)
        })
      });

      if (res.ok) {
        setShowAddModal(false);
        setTitle('');
        setDueDateStr('');
        fetchRules();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette règle d'échéancier ?")) return;
    const cleanUrl = apiUrl.replace(/\/$/, '');
    try {
      const res = await fetch(`${cleanUrl}/api/v1/rules/${ruleId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchRules();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Règles & Échéanciers de Paiement
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Planification des échéances (jour/mois/an), montants et modalités de paiement (comment payer)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchRules}
            className={`p-2.5 rounded-xl border text-xs font-semibold transition flex items-center gap-2 ${
              isDark ? 'bg-[#0B152B] border-[#1E2E56] text-slate-300 hover:text-white' : 'bg-white border-slate-200 text-slate-700 shadow-sm'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-600/30 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>+ Ajouter une Règle / Échéancier</span>
          </button>
        </div>
      </div>

      {/* Info card: Business Logic */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 ${
        isDark ? 'bg-[#0F1B33] border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-emerald-400 block text-sm">
              Règle Antivol & Recouvrement Automatique
            </span>
            <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>
              Tout impayé dépassant le délai de grâce (<b>3 jours</b>) entraîne le verrouillage Kiosk immédiat du terminal. Le paiement régularise la situation et débloque le smartphone en <b>sub-30 secondes</b>.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 shrink-0">
          <CheckCircle2 className="w-4 h-4" />
          <span>Synchronisation Cloud Active</span>
        </div>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rules.map((rule) => (
          <div 
            key={rule.id}
            className={`p-5 rounded-2xl border transition shadow-xl space-y-4 relative ${
              isDark ? 'bg-[#0B152B] border-[#1E2E56]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Règle Active
                </span>
                <h3 className="text-sm font-extrabold mt-1.5">{rule.title}</h3>
              </div>

              <button
                onClick={() => handleDeleteRule(rule.id)}
                className="text-slate-500 hover:text-rose-400 transition p-1"
                title="Supprimer cette règle"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Details Box */}
            <div className={`p-3.5 rounded-xl border space-y-2 text-xs font-mono ${
              isDark ? 'bg-[#070D1E] border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Échéance (Date) :</span>
                </span>
                <span className="text-white font-bold">{rule.due_date_str}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Montant :</span>
                </span>
                <span className="text-emerald-400 font-extrabold text-sm">
                  {rule.amount_xof.toLocaleString()} FCFA
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Délai de grâce :</span>
                </span>
                <span className="text-amber-400 font-bold">{rule.grace_period_days} jours</span>
              </div>
            </div>

            {/* Payment instructions (How to pay) */}
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                Comment Payer :
              </span>
              <div className="text-xs font-semibold text-emerald-300">
                {rule.payment_method}
              </div>
              <p className={`text-[11px] pt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {rule.payment_instructions}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Add New Payment Schedule Rule */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl space-y-5 ${
            isDark ? 'bg-[#0B152B] border-[#1E2E56] text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-emerald-400 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                <span>Ajouter une Règle d'Échéancier & Paiement</span>
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Nom / Intitulé de la règle
                </label>
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Échéance Mensuelle Samsung A34"
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs border focus:outline-none ${
                    isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Échéance (Jour / Mois / An) *
                  </label>
                  <input 
                    type="text"
                    required
                    value={dueDateStr}
                    onChange={(e) => setDueDateStr(e.target.value)}
                    placeholder="Ex: 25/11/2026 ou Chaque 25"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border focus:outline-none ${
                      isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Montant du Versement (FCFA) *
                  </label>
                  <input 
                    type="number"
                    required
                    value={amountXof}
                    onChange={(e) => setAmountXof(Number(e.target.value))}
                    min={500}
                    step={500}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs border focus:outline-none ${
                      isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Délai de grâce avant verrouillage automatique (Jours)
                </label>
                <input 
                  type="number"
                  value={graceDays}
                  onChange={(e) => setGraceDays(Number(e.target.value))}
                  min={1}
                  max={30}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs border focus:outline-none ${
                    isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Comment Payer (Modalités Mobile Money Bénin)
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs border focus:outline-none ${
                    isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="🟡 MTN Mobile Money (*133#) & 🔵 Moov Money (*880#)">
                    🟡 MTN Mobile Money (*133#) & 🔵 Moov Money (*880#)
                  </option>
                  <option value="🟡 MTN Mobile Money Bénin (*133#)">
                    🟡 MTN Mobile Money Bénin (*133#)
                  </option>
                  <option value="🔵 Moov Money Bénin (*880#)">
                    🔵 Moov Money Bénin (*880#)
                  </option>
                  <option value="🏦 Virement Bancaire & Dépôt Agence Cotonou">
                    🏦 Virement Bancaire & Dépôt Agence Cotonou
                  </option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Instructions détaillées de paiement (affichées sur le téléphone)
                </label>
                <textarea 
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl text-xs border focus:outline-none ${
                    isDark ? 'bg-[#070D1E] border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30"
                >
                  {isSubmitting ? 'Enregistrement...' : 'Valider la Règle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
