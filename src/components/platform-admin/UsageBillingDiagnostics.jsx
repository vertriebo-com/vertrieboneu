/**
 * UsageBillingDiagnostics
 * =======================
 * Phase 4 des Admin-/Owner-Diagnosecenters.
 *
 * Ermöglicht Platform-Admins und Org-Admins die Nachverfolgung von:
 * - UsageLog-Einträgen (Firmenkontakte, ResearchRuns, KI-Aktionen)
 * - Abgleich mit ResearchRun.leads_saved
 * - Plausibilitätsprüfungen und Warnungen bei Diskrepanzen
 *
 * Zugriff:
 * - Platform Admin: alle Orgs
 * - Org Admin: nur eigene Org
 * - Normaler User: kein Zugriff
 *
 * WICHTIG: Diese Komponente ist REIN DIAGNOSTISCH.
 * Sie verändert KEINE UsageLogs, KEINE Companies, KEINE Billing-Daten.
 */

import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import {
  BarChart3, AlertCircle, CheckCircle2, XCircle, Info,
  ChevronDown, ChevronRight, RefreshCw, Filter, Search,
  TrendingUp, DollarSign, Database, FileText, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import moment from 'moment';

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function WarningBadge({ type }) {
  const cfg = {
    usage_higher:        { label: 'Usage > Run', color: 'bg-red-50 text-red-700 border-red-300' },
    no_usage:            { label: 'Kein UsageLog', color: 'bg-amber-50 text-amber-700 border-amber-300' },
    double_counted:      { label: 'Mehrfach gezählt', color: 'bg-red-50 text-red-700 border-red-300' },
    partial_no_finish:   { label: 'Partial ohne Finish', color: 'bg-amber-50 text-amber-700 border-amber-300' },
    failed_with_usage:   { label: 'Failed mit Usage', color: 'bg-red-50 text-red-700 border-red-300' },
    companies_no_usage:  { label: 'Companies ohne Usage', color: 'bg-amber-50 text-amber-700 border-amber-300' },
    usage_no_run:        { label: 'Usage ohne Run', color: 'bg-amber-50 text-amber-700 border-amber-300' },
  }[type] || { label: type, color: 'bg-slate-100 text-slate-700 border-slate-300' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>;
}

function StatusBadge({ status }) {
  const cfg = {
    queued:    { label: 'Ausstehend', color: 'bg-slate-50 text-slate-700 border-slate-300' },
    running:   { label: 'Läuft',     color: 'bg-blue-50 text-blue-700 border-blue-300' },
    completed: { label: 'Fertig',    color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    partial:   { label: 'Teilweise', color: 'bg-amber-50 text-amber-700 border-amber-300' },
    failed:    { label: 'Fehler',    color: 'bg-red-50 text-red-700 border-red-300' },
  }[status] || { label: status || '—', color: 'bg-slate-100 text-slate-700 border-slate-300' };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>;
}

function StatCard({ label, value, sub, color = 'slate' }) {
  const colorMap = {
    slate:   'bg-slate-50 border-slate-200 text-slate-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    red:     'bg-red-50 border-red-200 text-red-800',
    blue:    'bg-blue-50 border-blue-200 text-blue-800',
    purple:  'bg-purple-50 border-purple-200 text-purple-800',
  };
  return (
    <div className={`rounded-xl p-3 border ${colorMap[color]}`}>
      <p className="text-[10px] font-medium opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value ?? '—'}</p>
      {sub && <p className="text-[10px] mt-0.5 opacity-60">{sub}</p>}
    </div>
  );
}

// ── UsageLog Row ──────────────────────────────────────────────────────────────

function UsageLogRow({ log, orgName, expanded, onToggle }) {
  const report = safeParseJSON(log.last_lead_generation_report);
  const skuBreakdown = safeParseJSON(log.google_sku_breakdown);

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </td>
        <td className="px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{orgName || log.organization_id?.slice(0, 12) + '…'}</p>
          <p className="text-[10px] text-slate-500 font-mono">{log.period_month}</p>
        </td>
        <td className="px-4 py-3 text-sm text-slate-800">
          <span className="font-bold text-emerald-700">{log.leads_created ?? 0}</span>
          <span className="text-slate-400 mx-1"> Leads</span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-800">
          <span className="font-bold text-purple-700">{log.ai_actions_used ?? 0}</span>
          <span className="text-slate-400 mx-1"> KI</span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-800">
          <span className="font-bold text-blue-700">{log.lead_generations_used ?? 0}</span>
          <span className="text-slate-400 mx-1"> Runs</span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-600">
          {moment(log.created_date).format('DD.MM.YY HH:mm')}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={6} className="px-6 py-4">
            <div className="space-y-3 text-xs">
              {/* Rohdaten JSON */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 mb-1">Rohdaten (last_lead_generation_report)</p>
                <pre className="bg-white border border-slate-200 rounded p-3 text-[10px] text-slate-700 overflow-x-auto max-h-64 overflow-y-auto">
                  {log.last_lead_generation_report ? JSON.stringify(report, null, 2) : '—'}
                </pre>
              </div>

              {/* SKU Breakdown */}
              {skuBreakdown && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 mb-1">Google SKU Breakdown</p>
                  <div className="bg-white border border-slate-200 rounded p-3 space-y-1">
                    {Object.entries(skuBreakdown).map(([sku, data]) => (
                      <div key={sku} className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-slate-700">{sku}</span>
                        <span className="text-slate-600">
                          {data.requests} Requests · {(data.estimated_cost_cent / 100).toFixed(2)}€
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Kosten */}
              <div className="flex items-center gap-2 text-slate-700">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Geschätzte externe Kosten: <strong>{(log.estimated_external_cost_cent / 100).toFixed(2)}€</strong></span>
              </div>

              {/* Zeitstempel */}
              <div className="text-[10px] text-slate-400">
                erstellt: {moment(log.created_date).format('DD.MM.YYYY HH:mm')} ·
                aktualisiert: {log.updated_date ? moment(log.updated_date).format('DD.MM.YYYY HH:mm') : '—'}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── ResearchRun vs UsageLog Comparison ───────────────────────────────────────

function RunUsageComparison({ run, matchingUsageLogs }) {
  const [expanded, setExpanded] = useState(false);
  const runLeads = run.leads_saved || 0;
  const usageLeads = matchingUsageLogs.reduce((sum, u) => sum + (u.leads_created || 0), 0);
  const diff = usageLeads - runLeads;

  const hasWarning = diff !== 0 || matchingUsageLogs.length === 0 || run.status === 'partial' || run.status === 'failed';

  return (
    <div className={`border rounded-lg overflow-hidden ${hasWarning ? 'border-amber-300' : 'border-slate-200'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {hasWarning && <AlertCircle className="w-4 h-4 text-amber-600" />}
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Run {run.id.slice(0, 8)}… · {run.industry_id || '—'} · {moment(run.created_date).format('DD.MM.YY')}
            </p>
            <p className="text-[10px] text-slate-500">
              {runLeads} Leads (Run) · {usageLeads} Leads (Usage) · Diff: <strong className={diff > 0 ? 'text-red-700' : diff < 0 ? 'text-emerald-700' : 'text-slate-700'}>{diff > 0 ? '+' : ''}{diff}</strong>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={run.status} />
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 bg-slate-50 border-t border-slate-100 text-xs">
          {/* Warnungen */}
          {diff > 0 && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-800">
                <strong>UsageLog höher als Run:</strong> UsageLog zählt {usageLeads} Leads, aber Run meldet nur {runLeads}.
                Mögliche Ursache: UsageLog wurde später korrigiert oder aggregiert.
              </p>
            </div>
          )}
          {matchingUsageLogs.length === 0 && runLeads > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-800">
                <strong>Kein UsageLog gefunden:</strong> Run hat {runLeads} Leads gespeichert, aber es gibt keinen passenden UsageLog-Eintrag.
              </p>
            </div>
          )}
          {run.status === 'partial' && !run.finished_at && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-800">
                <strong>Partial ohne finished_at:</strong> Run ist im Status "partial", aber hat kein finished_at-Datum.
              </p>
            </div>
          )}
          {run.status === 'failed' && runLeads > 0 && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-800">
                <strong>Failed mit gespeicherten Leads:</strong> Run ist "failed", hat aber {runLeads} Leads gespeichert.
              </p>
            </div>
          )}

          {/* Run Details */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded p-2 border border-slate-200">
              <p className="text-[10px] text-slate-500">Run Leads (saved)</p>
              <p className="text-lg font-bold text-slate-900">{runLeads}</p>
            </div>
            <div className="bg-white rounded p-2 border border-slate-200">
              <p className="text-[10px] text-slate-500">UsageLog Leads</p>
              <p className="text-lg font-bold text-emerald-700">{usageLeads}</p>
            </div>
            <div className="bg-white rounded p-2 border border-slate-200">
              <p className="text-[10px] text-slate-500">Dubletten</p>
              <p className="text-lg font-bold text-slate-900">{run.duplicates_skipped || 0}</p>
            </div>
            <div className="bg-white rounded p-2 border border-slate-200">
              <p className="text-[10px] text-slate-500">Kein Match</p>
              <p className="text-lg font-bold text-slate-900">{run.no_match_count || 0}</p>
            </div>
          </div>

          {/* Matching UsageLogs */}
          {matchingUsageLogs.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 mb-1">Zugehörige UsageLogs ({matchingUsageLogs.length})</p>
              <div className="space-y-1">
                {matchingUsageLogs.map((u, i) => (
                  <div key={i} className="bg-white rounded px-2 py-1 border border-slate-200 flex items-center justify-between">
                    <span className="text-[10px] text-slate-600">{u.period_month}</span>
                    <span className="text-[10px] font-semibold text-emerald-700">{u.leads_created || 0} Leads</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run Metadata */}
          <div className="text-[10px] text-slate-500">
            <p>Run-ID: <code className="font-mono">{run.id}</code></p>
            <p>Org: <code className="font-mono">{run.organization_id}</code></p>
            {run.stop_reason && <p>Stopp-Grund: <strong>{run.stop_reason}</strong></p>}
            {run.zero_result_cause && <p>Null-Ergebnis: <strong>{run.zero_result_cause}</strong></p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── UI Consistency Audit Panel ────────────────────────────────────────────────

function UiConsistencyAuditPanel({ isPlatformAdmin }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('auditUsageQuotaUiConsistency', {});
      setResult(res?.data || null);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  if (!isPlatformAdmin) return null;

  const statusColor = {
    green: 'bg-emerald-50 border-emerald-200',
    yellow: 'bg-amber-50 border-amber-200',
    red: 'bg-red-50 border-red-200',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-700" />
          <h3 className="text-sm font-bold text-slate-900">UI Consistency Audit</h3>
          <span className="text-[10px] text-slate-500">— BillingSettings vs. echte Daten</span>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Prüfe…' : 'Audit starten'}
        </button>
      </div>

      {result?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">{result.error}</div>
      )}

      {result && !result.error && (
        <>
          {/* Acceptance Criteria */}
          <div className={`rounded-lg border p-3 ${statusColor[result.claim_status] || 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-800">Gesamtstatus: <span className={result.claim_status === 'green' ? 'text-emerald-700' : result.claim_status === 'red' ? 'text-red-700' : 'text-amber-700'}>{result.claim_status?.toUpperCase()}</span></p>
              <p className="text-[10px] text-slate-500">{result.summary?.orgs_audited} Orgs · {result.summary?.passed}/{result.summary?.total_tests} Tests ok</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {result.acceptance_criteria && Object.entries(result.acceptance_criteria).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5 text-[10px]">
                  {v
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    : <XCircle className="w-3 h-3 text-red-600 shrink-0" />}
                  <span className={v ? 'text-emerald-800' : 'text-red-800'}>{k.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Failures */}
          {result.failures?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide">Fehler ({result.failures.length})</p>
              {result.failures.map((f, i) => (
                <div key={i} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[11px] text-red-900">
                  <strong>[{f.scope}/{f.check}]</strong> {f.description}
                </div>
              ))}
            </div>
          )}

          {/* Per-Org Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                  <th className="pb-1.5">Org</th>
                  <th className="pb-1.5 text-right">Verwendet</th>
                  <th className="pb-1.5 text-right">Limit</th>
                  <th className="pb-1.5 text-right">Quelle</th>
                  <th className="pb-1.5 text-center">UI ok?</th>
                </tr>
              </thead>
              <tbody>
                {(result.org_results || []).map(o => (
                  <tr key={o.org_id} className="border-b border-slate-50">
                    <td className="py-1.5 font-medium text-slate-800">{o.org_name}</td>
                    <td className="py-1.5 text-right text-slate-700">{o.ui_values?.monthly_used ?? '–'}</td>
                    <td className="py-1.5 text-right text-slate-700">
                      {o.ui_values?.monthly_limit === -1 ? '∞' : (o.ui_values?.monthly_limit ?? '–')}
                    </td>
                    <td className="py-1.5 text-right text-slate-500">{o.ui_values?.active_lead_source || '–'}</td>
                    <td className="py-1.5 text-center">
                      {o.error
                        ? <span className="text-red-600 font-bold">ERR</span>
                        : o.ui_ok
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mx-auto" />
                        : <XCircle className="w-3.5 h-3.5 text-red-600 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result && !loading && (
        <p className="text-xs text-slate-400 text-center py-4">Noch kein Audit durchgeführt. Klicke "Audit starten".</p>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function UsageBillingDiagnostics({ userRole, userEmail, orgId }) {
  const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(userRole);
  const isOrgAdmin = userRole === 'organization_admin';
  const hasAccess = isPlatformAdmin || isOrgAdmin;

  const [usageLogs, setUsageLogs] = useState([]);
  const [researchRuns, setResearchRuns] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterOrg, setFilterOrg] = useState(isPlatformAdmin ? 'all' : (orgId || 'all'));
  // filterMonth: moment().format('YYYY-MM') liefert im Browser den lokalen Kalendermonat (Europe/Berlin).
  // Da die Komponente nur im Browser läuft und die Filterung client-seitig gegen period_month erfolgt,
  // ist dies konsistent mit der Europe/Berlin-Logik in processResearchRun/getDashboardData.
  // KEIN Backend-Call mit filterMonth – reiner UI-Filter. Keine Änderung nötig.
  const [filterMonth, setFilterMonth] = useState(moment().format('YYYY-MM'));
  const [searchText, setSearchText] = useState('');
  const [showComparisons, setShowComparisons] = useState(false);

  const orgMap = useMemo(() => {
    const m = {};
    organizations.forEach(o => { m[o.id] = o.name; });
    return m;
  }, [organizations]);

  const loadData = async () => {
    setLoading(true);
    try {
      const usageQuery = isOrgAdmin && orgId ? { organization_id: orgId } : {};
      const runsQuery = isOrgAdmin && orgId ? { organization_id: orgId } : {};

      const [usageData, runsData, orgsData] = await Promise.all([
        base44.entities.UsageLog.filter(usageQuery, '-created_date', 100),
        base44.entities.ResearchRun.filter(runsQuery, '-created_date', 200),
        isPlatformAdmin
          ? base44.entities.Organization.list('-created_date', 200)
          : (orgId ? base44.entities.Organization.filter({ id: orgId }) : Promise.resolve([])),
      ]);

      setUsageLogs(usageData || []);
      setResearchRuns(runsData || []);
      setOrganizations(orgsData || []);
    } catch (e) {
      console.error('[UsageBillingDiagnostics] Ladefehler:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (hasAccess) loadData(); }, [hasAccess]);

  // Gefilterte UsageLogs
  const filteredUsageLogs = useMemo(() => {
    if (!hasAccess) return [];
    return usageLogs.filter(u => {
      if (filterOrg !== 'all' && u.organization_id !== filterOrg) return false;
      if (filterMonth && u.period_month !== filterMonth) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const orgName = (orgMap[u.organization_id] || '').toLowerCase();
        if (!orgName.includes(q) && !u.id.includes(q)) return false;
      }
      return true;
    });
  }, [hasAccess, usageLogs, filterOrg, filterMonth, searchText, orgMap]);

  // Gefilterte ResearchRuns
  const filteredRuns = useMemo(() => {
    if (!hasAccess) return [];
    return researchRuns.filter(r => {
      if (filterOrg !== 'all' && r.organization_id !== filterOrg) return false;
      if (filterMonth) {
        const runMonth = moment(r.created_date).format('YYYY-MM');
        if (runMonth !== filterMonth) return false;
      }
      return true;
    });
  }, [hasAccess, researchRuns, filterOrg, filterMonth]);

  // UsageLog pro Run finden
  const findMatchingUsageLogs = (run) => {
    const runMonth = moment(run.created_date).format('YYYY-MM');
    return usageLogs.filter(u =>
      u.organization_id === run.organization_id &&
      u.period_month === runMonth
    );
  };

  // Warnungen berechnen
  const warnings = useMemo(() => {
    if (!hasAccess) return [];
    const warnings = [];

    filteredRuns.forEach(run => {
      const matchingUsage = findMatchingUsageLogs(run);
      const runLeads = run.leads_saved || 0;
      const usageLeads = matchingUsage.reduce((sum, u) => sum + (u.leads_created || 0), 0);

      if (usageLeads > runLeads && runLeads > 0) {
        warnings.push({ type: 'usage_higher', run, diff: usageLeads - runLeads });
      }
      if (matchingUsage.length === 0 && runLeads > 0) {
        warnings.push({ type: 'no_usage', run });
      }
      if (run.status === 'partial' && !run.finished_at) {
        warnings.push({ type: 'partial_no_finish', run });
      }
      if (run.status === 'failed' && runLeads > 0) {
        warnings.push({ type: 'failed_with_usage', run });
      }
    });

    return warnings;
  }, [hasAccess, filteredRuns, usageLogs]);

  if (!hasAccess) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-6">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-red-900">Kein Zugriff</p>
          <p className="text-xs text-red-700">Usage/Billing-Diagnose ist nur für Platform-Admins und Organisations-Admins zugänglich.</p>
        </div>
      </div>
    );
  }

  // Aggregierte KPIs
  const totalLeads = filteredUsageLogs.reduce((sum, u) => sum + (u.leads_created || 0), 0);
  const totalRuns = filteredRuns.length;
  const totalUsageLogs = filteredUsageLogs.length;
  const totalCosts = filteredUsageLogs.reduce((sum, u) => sum + (u.estimated_external_cost_cent || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Usage & Billing Diagnose</h2>
            <p className="text-xs text-slate-500">UsageLogs, ResearchRuns, Plausibilitätsprüfungen</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Org oder ID suchen…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>

        {isPlatformAdmin && (
          <select
            value={filterOrg}
            onChange={e => setFilterOrg(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 font-medium"
          >
            <option value="all">Alle Organisationen</option>
            {organizations.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}

        <input
          type="month"
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 font-medium"
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowComparisons(!showComparisons)}
          className={showComparisons ? 'bg-blue-50 border-blue-300' : ''}
        >
          {showComparisons ? 'Vergleiche ausblenden' : 'Run vs Usage zeigen'}
        </Button>
      </div>

      {/* Summary KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Gespeicherte Leads (Monat)" value={totalLeads} color="emerald" />
          <StatCard label="ResearchRuns (Monat)" value={totalRuns} color="blue" />
          <StatCard label="UsageLog-Einträge" value={totalUsageLogs} color="purple" />
          <StatCard label="Geschätzte Kosten" value={`${(totalCosts / 100).toFixed(2)}€`} color="amber" sub="Externe API-Kosten" />
        </div>
      )}

      {/* Warnungen */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-amber-900">
              {warnings.length} Plausibilitäts-Warnungen gefunden
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(
              warnings.reduce((acc, w) => {
                acc[w.type] = (acc[w.type] || 0) + 1;
                return acc;
              }, {})
            ).map(([type, count]) => (
              <WarningBadge key={type} type={`${type} (${count})`} />
            ))}
          </div>
        </div>
      )}

      {/* UsageLog Tabelle */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">UsageLog-Einträge ({filteredUsageLogs.length})</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            <span className="text-sm">Lade UsageLogs…</span>
          </div>
        ) : filteredUsageLogs.length === 0 ? (
          <div className="text-center py-12">
            <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Keine UsageLogs gefunden</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-8 px-4 py-2.5" />
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Organisation / Monat</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Leads</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">KI-Aktionen</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Runs</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsageLogs.map(log => (
                  <UsageLogRow
                    key={log.id}
                    log={log}
                    orgName={orgMap[log.organization_id]}
                    expanded={false}
                    onToggle={() => {}}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* UI Consistency Audit — nur Platform Admin */}
      <UiConsistencyAuditPanel isPlatformAdmin={isPlatformAdmin} />

      {/* Run vs Usage Vergleich */}
      {showComparisons && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-5 h-5 text-blue-700" />
            <h3 className="text-sm font-bold text-slate-900">
              ResearchRun vs UsageLog Vergleich ({filteredRuns.length} Runs)
            </h3>
          </div>
          <div className="space-y-2">
            {filteredRuns.map(run => (
              <RunUsageComparison
                key={run.id}
                run={run}
                matchingUsageLogs={findMatchingUsageLogs(run)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}