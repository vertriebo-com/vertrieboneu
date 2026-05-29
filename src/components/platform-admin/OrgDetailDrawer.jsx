import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Building2, X, Users, CreditCard, Search, Brain, FileText,
  Settings, Shield, MessageSquare, AlertTriangle, Loader2,
  CheckCircle2, AlertCircle, Lock, Unlock, RefreshCw, Wrench,
  Copy, Check, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

// ── Sub-Tab: Übersicht ──────────────────────────────────────────────────────
function OverviewTab({ org, plans, researchRuns, leads }) {
  const planName = plans?.find(p => p.id === org.plan_id)?.name || (org.plan_id ? 'Unbekannt' : 'Kein Plan');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Organisation ID', value: org.id, mono: true },
          { label: 'Owner E-Mail', value: org.owner_email },
          { label: 'Typ', value: org.organization_type || 'direct_customer' },
          { label: 'Platform Status', value: org.platform_status || 'active' },
          { label: 'Billing Status', value: org.billing_status || '—' },
          { label: 'Trial Stage', value: org.trial_stage || 'free_preview' },
          { label: 'Plan', value: planName },
          { label: 'Onboarding', value: org.onboarding_done ? 'Abgeschlossen ✓' : 'Offen ⏳' },
          { label: 'Suchgebiet', value: org.service_area_city ? `${org.service_area_city} · ${org.service_area_radius_km}km` : '—' },
          { label: 'Branche', value: org.industry || '—' },
          { label: 'Leads gesamt', value: org.leads_count ?? 0 },
          { label: 'Erstellt am', value: moment(org.created_date).format('DD.MM.YYYY HH:mm') },
          { label: 'Letzter Recherche-Run', value: researchRuns?.length > 0 ? moment(researchRuns[0].created_date).format('DD.MM.YYYY HH:mm') : 'Noch keiner' },
          { label: 'Letzte Aktivität (Leads)', value: leads?.length > 0 ? moment(leads[0].created_date).format('DD.MM.YYYY HH:mm') : '—' },
        ].map(({ label, value, mono }) => (
          <div key={label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</p>
            <p className={`text-xs font-semibold text-slate-900 break-all ${mono ? 'font-mono text-[10px]' : ''}`}>{String(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-Tab: Billing & Quota ────────────────────────────────────────────────
function BillingTab({ org, plans, onRefetch }) {
  const [setPlanId, setSetPlanId] = useState(org.plan_id || '');
  const [setBillingStatus, setSetBillingStatus] = useState(org.billing_status || 'trialing');
  const [setTrialStage, setSetTrialStage] = useState(org.trial_stage || 'free_preview');
  const [customLimit, setCustomLimit] = useState(org.custom_monthly_lead_limit ?? '');
  const [saving, setSaving] = useState(false);
  const [usageData, setUsageData] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const planName = plans?.find(p => p.id === org.plan_id)?.name || 'Kein Plan';
  const plan = plans?.find(p => p.id === org.plan_id);

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    setUsageLoading(true);
    try {
      const res = await base44.functions.invoke('getUsageSummary', { organization_id: org.id });
      setUsageData(res.data);
    } catch (e) {
      console.error('Usage load failed:', e.message);
    } finally {
      setUsageLoading(false);
    }
  };

  const handleSaveBilling = async () => {
    if (!confirmText.trim()) {
      toast.error('Bitte Bestätigungstext eingeben');
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke('platformAdmin', {
        action: 'updateAgencySettings',
        organization_id: org.id,
        plan_id: setPlanId || undefined,
        billing_status: setBillingStatus || undefined,
        custom_monthly_lead_limit: customLimit !== '' ? Number(customLimit) : undefined,
      });
      // Trial stage separat
      await base44.functions.invoke('platformAdmin', {
        action: 'updateTrialStage',
        organization_id: org.id,
        trial_stage: setTrialStage,
      });
      toast.success('Billing aktualisiert');
      setConfirmText('');
      onRefetch();
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRepairPlanSync = async () => {
    setRepairing(true);
    try {
      // Finde passenden Plan basierend auf billing_status + trial_stage
      let targetPlanId = org.plan_id;
      if (!targetPlanId) {
        const starterPlan = plans?.find(p => p.plan_code === 'starter' || p.name?.toLowerCase().includes('starter'));
        targetPlanId = starterPlan?.id;
      }
      if (!targetPlanId) throw new Error('Kein passender Plan gefunden');

      await base44.functions.invoke('platformAdmin', {
        action: 'updateAgencySettings',
        organization_id: org.id,
        plan_id: targetPlanId,
      });
      toast.success(`Plan-Sync repariert → ${plans?.find(p => p.id === targetPlanId)?.name}`);
      onRefetch();
    } catch (e) {
      toast.error('Repair fehlgeschlagen: ' + e.message);
    } finally {
      setRepairing(false);
    }
  };

  const used = usageData?.monthly_used ?? org.monthly_leads_created ?? 0;
  const limit = org.custom_monthly_lead_limit ?? plan?.max_leads_per_month ?? 0;
  const remaining = limit === -1 ? '∞' : Math.max(0, limit - used);
  const pct = limit > 0 && limit !== -1 ? Math.min(100, Math.round((used / limit) * 100)) : null;

  return (
    <div className="space-y-5">
      {/* Plan & Status Display */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-blue-900 uppercase">Aktueller Plan & Quota</h4>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-slate-500">Plan</p><p className="font-bold text-slate-900">{planName}</p></div>
          <div><p className="text-slate-500">Billing-Status</p><p className="font-bold text-slate-900">{org.billing_status || '—'}</p></div>
          <div><p className="text-slate-500">Trial-Stage</p><p className="font-bold text-slate-900">{org.trial_stage || '—'}</p></div>
          <div><p className="text-slate-500">Custom Limit</p><p className="font-bold text-slate-900">{org.custom_monthly_lead_limit ?? 'Plan-Default'}</p></div>
        </div>

        {/* Usage Bar */}
        {usageLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3 h-3 animate-spin" /> Lade Nutzung…</div>
        ) : (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600">Leads diesen Monat: <strong>{used}</strong></span>
              <span className="text-slate-600">Limit: <strong>{limit === -1 ? '∞' : (limit || '—')}</strong> · Verbleibend: <strong>{remaining}</strong></span>
            </div>
            {pct !== null && (
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
              </div>
            )}
            {!org.plan_id && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Kein plan_id gesetzt — UsageBar zeigt möglicherweise null
                <Button size="sm" variant="outline" onClick={handleRepairPlanSync} disabled={repairing} className="ml-auto h-6 text-[10px] px-2">
                  {repairing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                  Repair Plan-Sync
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Stripe IDs */}
        {(org.stripe_customer_id || usageData?.subscription_id) && (
          <div className="text-xs space-y-1 pt-2 border-t border-blue-200">
            {org.stripe_customer_id && <p className="text-slate-500">Stripe Customer: <span className="font-mono text-slate-900">{org.stripe_customer_id}</span></p>}
            {usageData?.subscription_id && <p className="text-slate-500">Stripe Sub: <span className="font-mono text-slate-900">{usageData.subscription_id}</span></p>}
          </div>
        )}
      </div>

      {/* Edit-Formular */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase">Billing manuell anpassen</h4>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-600 block mb-1">Plan</label>
            <select value={setPlanId} onChange={e => setSetPlanId(e.target.value)} className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
              <option value="">— Kein Plan —</option>
              {plans?.map(p => <option key={p.id} value={p.id}>{p.name} ({p.max_leads_per_month === -1 ? '∞' : p.max_leads_per_month} Leads)</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-600 block mb-1">Billing-Status</label>
            <select value={setBillingStatus} onChange={e => setSetBillingStatus(e.target.value)} className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
              {['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'preview'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-600 block mb-1">Trial-Stage</label>
            <select value={setTrialStage} onChange={e => setSetTrialStage(e.target.value)} className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
              {['free_preview', 'verified_trial', 'paid'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-600 block mb-1">Custom Limit/Monat (-1=∞)</label>
            <input type="number" value={customLimit} onChange={e => setCustomLimit(e.target.value)} placeholder="leer = Plan-Default" className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white" />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-red-700 block mb-1">⚠️ Bestätigung erforderlich: Tippe "CONFIRM"</label>
          <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="CONFIRM" className="w-full text-xs border border-red-300 rounded-lg px-2 py-1.5 bg-white focus:ring-1 focus:ring-red-400 focus:outline-none" />
        </div>

        <div className="flex gap-2">
          <Button onClick={loadUsage} variant="outline" size="sm" className="gap-1.5"><RefreshCw className="w-3 h-3" /> Neu laden</Button>
          <Button onClick={handleSaveBilling} disabled={saving || confirmText !== 'CONFIRM'} size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Billing speichern
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-Tab: Nutzer ─────────────────────────────────────────────────────────
function UsersTab({ org, onRefetch }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionReason, setActionReason] = useState('');
  const [actionTarget, setActionTarget] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await base44.entities.OrganizationMember.filter({ organization_id: org.id });
        setMembers(m);
      } catch (e) {
        console.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDeactivate = async (member) => {
    if (!actionReason.trim()) { toast.error('Grund erforderlich'); return; }
    try {
      await base44.functions.invoke('platformAdmin', {
        action: 'createSupportNote',
        organization_id: org.id,
        note: `Member ${member.user_email} deaktiviert. Grund: ${actionReason}`,
        severity: 'warning',
      });
      await base44.entities.OrganizationMember.update(member.id, { status: 'inactive' });
      toast.success('Member deaktiviert');
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, status: 'inactive' } : m));
      setActionReason('');
      setActionTarget(null);
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <p className="text-xs font-bold text-slate-600 mb-1">Owner</p>
        <p className="text-sm font-semibold text-slate-900">{org.owner_email}</p>
      </div>

      <div>
        <h4 className="text-xs font-bold text-slate-600 uppercase mb-3">Mitglieder ({members.length})</h4>
        {members.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Keine weiteren Mitglieder.</p>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{m.user_email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.role === 'organization_admin' ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>{m.role}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.status === 'active' ? 'bg-emerald-50 text-emerald-700' : m.status === 'invited' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>{m.status}</span>
                  </div>
                </div>
                {m.status === 'active' && (
                  <button onClick={() => setActionTarget(actionTarget?.id === m.id ? null : m)} className="text-[10px] text-red-600 hover:underline whitespace-nowrap">Deaktivieren</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {actionTarget && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-red-800">Mitglied deaktivieren: {actionTarget.user_email}</p>
          <input value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Grund eingeben…" className="w-full text-xs border border-red-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setActionTarget(null)} className="flex-1">Abbrechen</Button>
            <Button size="sm" onClick={() => handleDeactivate(actionTarget)} disabled={!actionReason.trim()} className="flex-1 bg-red-600 text-white">Deaktivieren</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-Tab: Research ───────────────────────────────────────────────────────
function ResearchTab({ org, researchRuns }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRun, setSelectedRun] = useState(null);
  const [repairing, setRepairing] = useState(null);

  const filtered = statusFilter === 'all' ? researchRuns : researchRuns.filter(r => r.status === statusFilter);

  const handleRepairStuck = async (run) => {
    setRepairing(run.id);
    try {
      const res = await base44.functions.invoke('watchdogStuckResearchRuns', { force_run_id: run.id });
      toast.success('Watchdog ausgeführt: ' + (res.data?.message || 'OK'));
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setRepairing(null);
    }
  };

  const STATUS_COLOR = {
    completed: 'bg-emerald-50 text-emerald-700',
    running: 'bg-blue-50 text-blue-700',
    failed: 'bg-red-50 text-red-700',
    partial: 'bg-amber-50 text-amber-700',
    queued: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'running', 'completed', 'failed', 'partial', 'queued'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${statusFilter === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{s}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Keine Research Runs.</p>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 20).map(run => (
            <div key={run.id} className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_COLOR[run.status] || 'bg-slate-100 text-slate-600'}`}>{run.status}</span>
                  <span className="text-xs font-semibold text-slate-900">{run.search_center_city || '—'} · {run.search_radius_km}km</span>
                  <span className="text-[10px] text-slate-500">{run.industry_id || '—'}</span>
                </div>
                <span className="text-[10px] text-slate-400">{moment(run.created_date).format('DD.MM.YY HH:mm')}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px] text-slate-600 mb-2">
                <span>💾 {run.leads_saved ?? 0} Leads</span>
                <span>🔍 {run.raw_hits ?? 0} geprüft</span>
                <span>🔄 {run.duplicates_skipped ?? 0} Duplikate</span>
                <span>📍 {run.locations_searched_count ?? 0}/{run.covered_locations_count ?? 0} Orte</span>
              </div>
              {run.current_step && <p className="text-[10px] text-slate-500 italic">{run.current_step}</p>}
              {run.error_message && <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1 mt-1">{run.error_message}</p>}
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)} className="text-[10px] text-blue-600 hover:underline">
                  {selectedRun?.id === run.id ? 'Einklappen' : 'search_plan_json ansehen'}
                </button>
                {(run.status === 'running' || run.status === 'queued') && (
                  <button onClick={() => handleRepairStuck(run)} disabled={repairing === run.id} className="text-[10px] text-amber-700 hover:underline flex items-center gap-1">
                    {repairing === run.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />} Stuck reparieren
                  </button>
                )}
              </div>
              {selectedRun?.id === run.id && (
                <pre className="mt-2 text-[9px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                  {run.search_plan_json ? JSON.stringify(JSON.parse(run.search_plan_json), null, 2) : '—'}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-Tab: Learning ───────────────────────────────────────────────────────
function LearningTab({ org }) {
  const [signals, setSignals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.OrgLearnedSignals.filter({ organization_id: org.id });
        setSignals(data[0] || null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRunFeedback = async () => {
    setRunning(true);
    try {
      const res = await base44.functions.invoke('processLeadOutcomeFeedback', { organization_id: org.id });
      toast.success(`Learning neu berechnet: ${res.data?.total_outcomes ?? 0} Outcomes, ${res.data?.categories_analyzed ?? 0} Kategorien`);
      const data = await base44.entities.OrgLearnedSignals.filter({ organization_id: org.id });
      setSignals(data[0] || null);
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-semibold mb-1">Vertriebo lernt mit 🧠</p>
        <p>Vertriebo lernt aus den Rückmeldungen dieser Organisation. Je mehr Leads bewertet werden, desto genauer werden künftige Recherchen.</p>
      </div>

      {!signals ? (
        <div className="text-center py-8">
          <Brain className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-xs text-slate-500">Noch keine Learning-Daten vorhanden.</p>
          <p className="text-[10px] text-slate-400">Mindestens 1 LeadOutcome-Bewertung erforderlich.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Version', value: signals.version ?? 1 },
              { label: 'Outcomes analysiert', value: signals.total_outcomes_analyzed ?? 0 },
              { label: 'Berechnet am', value: signals.last_computed_at ? moment(signals.last_computed_at).format('DD.MM.YYYY HH:mm') : '—' },
              { label: 'Harte Ausschlüsse', value: (() => { try { return JSON.parse(signals.excluded_categories || '[]').length; } catch { return 0; } })() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                <p className="text-[10px] text-slate-500">{label}</p>
                <p className="font-bold text-slate-900">{String(value)}</p>
              </div>
            ))}
          </div>

          {/* Priority Categories */}
          {signals.priority_categories && (() => {
            try {
              const cats = JSON.parse(signals.priority_categories);
              return cats.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-2">Kategorie-Scores</p>
                  <div className="space-y-1.5">
                    {cats.slice(0, 5).map(c => (
                      <div key={c.category} className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-700 font-medium">{c.category}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600">✓ {c.won}</span>
                          <span className="text-blue-600">→ {c.relevant}</span>
                          <span className="text-red-500">✗ {c.not_relevant}</span>
                          {c.rc_boost > 0 && <span className="text-green-600">↑{c.rc_boost}</span>}
                          {c.rc_reduce > 0 && <span className="text-red-600">↓{c.rc_reduce}</span>}
                          <span className={`font-bold px-1.5 py-0.5 rounded ${c.score >= 60 ? 'bg-emerald-50 text-emerald-700' : c.score >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{c.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            } catch { return null; }
          })()}

          {/* Boosted Keywords */}
          {signals.boosted_keywords && (() => {
            try {
              const kws = JSON.parse(signals.boosted_keywords);
              return kws.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-2">Boosted Keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {kws.map(k => (
                      <span key={k.keyword} className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                        {k.keyword} <span className="text-blue-400">+{k.score}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            } catch { return null; }
          })()}

          <div className="flex gap-2">
            <Button onClick={() => setShowJson(!showJson)} variant="outline" size="sm" className="gap-1.5 text-[10px]">
              <FileText className="w-3 h-3" /> {showJson ? 'JSON verbergen' : 'JSON anzeigen'}
            </Button>
            <Button onClick={handleRunFeedback} disabled={running} size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
              Learning neu berechnen
            </Button>
          </div>
          {showJson && (
            <pre className="text-[9px] bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto max-h-64 text-slate-600 whitespace-pre-wrap">
              {JSON.stringify({ priority_categories: JSON.parse(signals.priority_categories || '[]'), boosted_keywords: JSON.parse(signals.boosted_keywords || '[]'), excluded_categories: JSON.parse(signals.excluded_categories || '[]'), winning_signals: JSON.parse(signals.winning_signals || '[]') }, null, 2)}
            </pre>
          )}
        </div>
      )}

      <Button onClick={handleRunFeedback} disabled={running || !!signals} variant="outline" size="sm" className="w-full gap-1.5">
        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
        processLeadOutcomeFeedback ausführen
      </Button>
    </div>
  );
}

// ── Sub-Tab: Support Notes ──────────────────────────────────────────────────
function SupportNotesTab({ org }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [severity, setSeverity] = useState('info');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const n = await base44.entities.SupportNote.filter({ organization_id: org.id });
        setNotes(n.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      } catch { } finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await base44.functions.invoke('platformAdmin', {
        action: 'createSupportNote',
        organization_id: org.id,
        note: noteText,
        severity,
      });
      toast.success('Notiz gespeichert');
      const n = await base44.entities.SupportNote.filter({ organization_id: org.id });
      setNotes(n.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setNoteText('');
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const SEV_COLOR = { critical: 'bg-red-50 border-red-200 text-red-800', warning: 'bg-amber-50 border-amber-200 text-amber-800', info: 'bg-slate-50 border-slate-200 text-slate-700' };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-700">Neue Support-Notiz</h4>
        <select value={severity} onChange={e => setSeverity(e.target.value)} className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
          <option value="info">Info</option>
          <option value="warning">Warnung</option>
          <option value="critical">Kritisch</option>
        </select>
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Support-Notiz…" rows={3} className="w-full text-xs border border-slate-300 rounded-lg px-2 py-2 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <Button onClick={handleSave} disabled={saving || !noteText.trim()} size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
          {saving ? 'Speichert…' : 'Notiz speichern'}
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center py-6">Keine Support-Notizen vorhanden.</p>
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <div key={n.id} className={`rounded-xl border p-3 text-xs ${SEV_COLOR[n.severity] || SEV_COLOR.info}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold capitalize">{n.severity}</span>
                <span className="text-[10px] opacity-70">{moment(n.created_date).format('DD.MM.YYYY HH:mm')} · {n.created_by}</span>
              </div>
              <p>{n.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-Tab: Gefahrenzone ───────────────────────────────────────────────────
function DangerZoneTab({ org, onClose, onRefetch }) {
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSuspend = async () => {
    if (!reason.trim() || confirmText !== 'SPERREN') { toast.error('Grund und Bestätigung erforderlich'); return; }
    setLoading(true);
    try {
      await base44.functions.invoke('platformAdmin', { action: 'suspendOrganization', organization_id: org.id, reason });
      toast.success('Organisation gesperrt');
      onClose();
      onRefetch();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const handleUnsuspend = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('platformAdmin', { action: 'unsuspendOrganization', organization_id: org.id });
      toast.success('Organisation entsperrt');
      onClose();
      onRefetch();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <h4 className="text-sm font-bold text-red-900">Gefahrenzone</h4>
        </div>
        <p className="text-xs text-red-700 mb-4">Kritische Aktionen. Alle Änderungen werden im PlatformAuditLog protokolliert.</p>

        <div className="space-y-3">
          {org.platform_status !== 'suspended' ? (
            <div className="bg-white border border-red-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-red-800">Organisation sperren</p>
              <p className="text-[10px] text-red-600">Nutzer können sich nicht mehr einloggen. Daten bleiben erhalten.</p>
              {action === 'suspend' ? (
                <div className="space-y-2">
                  <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Sperrungsgrund (erforderlich)…" rows={2} className="w-full text-xs border border-red-300 rounded px-2 py-1.5 resize-none focus:outline-none" />
                  <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder='Tippe "SPERREN" zur Bestätigung' className="w-full text-xs border border-red-300 rounded px-2 py-1.5 focus:outline-none" />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setAction(null); setReason(''); setConfirmText(''); }} className="flex-1">Abbrechen</Button>
                    <Button size="sm" onClick={handleSuspend} disabled={loading || confirmText !== 'SPERREN'} className="flex-1 bg-red-600 text-white">
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />} Sperren
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setAction('suspend')} className="w-full border-red-300 text-red-700 hover:bg-red-50">
                  <Lock className="w-3 h-3 mr-1" /> Organisation sperren
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-emerald-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-emerald-800">Organisation entsperren</p>
              <Button size="sm" onClick={handleUnsuspend} disabled={loading} className="w-full bg-emerald-600 text-white">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />} Entsperren
              </Button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-bold text-slate-700 mb-1">TODO: Weitere Aktionen (Kann-nach-Live)</p>
            <ul className="text-[10px] text-slate-400 list-disc list-inside space-y-0.5">
              <li>Owner-Wechsel (mit doppelter Bestätigung)</li>
              <li>Bulk-Leads archivieren / soft-delete</li>
              <li>Learning zurücksetzen</li>
              <li>Organisation archivieren (soft-delete)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN DRAWER ─────────────────────────────────────────────────────────────
export default function OrgDetailDrawer({ org, plans, onClose, onRefetch }) {
  const [researchRuns, setResearchRuns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!org) return;
    (async () => {
      setDataLoading(true);
      try {
        const [runs, recentLeads] = await Promise.all([
          base44.entities.ResearchRun.filter({ organization_id: org.id }, '-created_date', 20),
          base44.entities.Company.filter({ organization_id: org.id }, '-created_date', 5),
        ]);
        setResearchRuns(runs);
        setLeads(recentLeads);
      } catch (e) {
        console.error(e.message);
      } finally {
        setDataLoading(false);
      }
    })();
  }, [org?.id]);

  if (!org) return null;

  return (
    <Dialog open={!!org} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-white border border-slate-200 shadow-2xl rounded-2xl p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <Building2 className="w-5 h-5 text-blue-600" />
            {org.name}
            <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${org.platform_status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {org.platform_status || 'active'}
            </span>
          </DialogTitle>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{org.owner_email} · {org.id}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {dataLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="bg-slate-50 border border-slate-200 p-1 h-auto gap-0.5 flex-wrap">
                <TabsTrigger value="overview" className="gap-1.5 text-[11px] py-1.5 px-2"><Building2 className="w-3 h-3" /> Übersicht</TabsTrigger>
                <TabsTrigger value="users" className="gap-1.5 text-[11px] py-1.5 px-2"><Users className="w-3 h-3" /> Nutzer</TabsTrigger>
                <TabsTrigger value="billing" className="gap-1.5 text-[11px] py-1.5 px-2"><CreditCard className="w-3 h-3" /> Billing & Quota</TabsTrigger>
                <TabsTrigger value="research" className="gap-1.5 text-[11px] py-1.5 px-2"><Search className="w-3 h-3" /> Research</TabsTrigger>
                <TabsTrigger value="learning" className="gap-1.5 text-[11px] py-1.5 px-2"><Brain className="w-3 h-3" /> Learning</TabsTrigger>
                <TabsTrigger value="notes" className="gap-1.5 text-[11px] py-1.5 px-2"><MessageSquare className="w-3 h-3" /> Support Notes</TabsTrigger>
                <TabsTrigger value="danger" className="gap-1.5 text-[11px] py-1.5 px-2 data-[state=active]:bg-red-600 data-[state=active]:text-white"><AlertTriangle className="w-3 h-3" /> Gefahrenzone</TabsTrigger>
              </TabsList>

              <TabsContent value="overview"><OverviewTab org={org} plans={plans} researchRuns={researchRuns} leads={leads} /></TabsContent>
              <TabsContent value="users"><UsersTab org={org} onRefetch={onRefetch} /></TabsContent>
              <TabsContent value="billing"><BillingTab org={org} plans={plans} onRefetch={onRefetch} /></TabsContent>
              <TabsContent value="research"><ResearchTab org={org} researchRuns={researchRuns} /></TabsContent>
              <TabsContent value="learning"><LearningTab org={org} /></TabsContent>
              <TabsContent value="notes"><SupportNotesTab org={org} /></TabsContent>
              <TabsContent value="danger"><DangerZoneTab org={org} onClose={onClose} onRefetch={onRefetch} /></TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}