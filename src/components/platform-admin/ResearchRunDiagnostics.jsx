/**
 * ResearchRunDiagnostics
 * ======================
 * Phase 1 des Admin-/Owner-Diagnosecenters.
 * 
 * Zugriffsrechte:
 * - Platform Admin / Owner: sieht alle ResearchRuns aller Orgs
 * - Org Admin (organization_admin): sieht nur Runs der eigenen Org
 * - Normaler User: kein Zugriff (Komponente wird nicht gerendert)
 * 
 * Datenquelle: direkte Entity-Abfrage ResearchRun + Organization
 * Keine Dummy-Werte. Kein Speichern / keine Usage-Änderungen.
 */

import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import {
  ChevronDown, ChevronRight, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Loader2, XCircle, AlertTriangle, Search, Filter, Eye
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

function calcRuntime(run) {
  const start = run.started_at || run.created_date;
  const end = run.finished_at || (
    ['completed', 'failed', 'partial'].includes(run.status) ? run.updated_date : null
  );
  if (!start) return null;
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const secs = Math.round((endMs - startMs) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function isRuntimeEstimated(run) {
  const end = run.finished_at || (
    ['completed', 'failed', 'partial'].includes(run.status) ? run.updated_date : null
  );
  return !run.started_at || (!end && !['completed', 'failed', 'partial'].includes(run.status));
}

function isLockActive(run) {
  if (!run.processing_lock_until) return false;
  return new Date(run.processing_lock_until).getTime() > Date.now();
}

// ── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  queued:    { label: 'Ausstehend', icon: Clock,        color: 'bg-slate-100 text-slate-700 border-slate-300' },
  running:   { label: 'Läuft',     icon: Loader2,       color: 'bg-blue-50 text-blue-700 border-blue-300',   spin: true },
  completed: { label: 'Fertig',    icon: CheckCircle2,  color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  partial:   { label: 'Teilweise', icon: AlertTriangle, color: 'bg-amber-50 text-amber-700 border-amber-300' },
  failed:    { label: 'Fehler',    icon: XCircle,       color: 'bg-red-50 text-red-700 border-red-300' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon className={`w-3 h-3 ${cfg.spin ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

// ── Zero-Result-Cause Labels ──────────────────────────────────────────────────

const ZERO_CAUSE_LABELS = {
  taxonomy_profile_missing: 'Kein Taxonomie-Profil',
  no_queries_built: 'Keine Queries gebaut',
  no_google_results: 'Keine Google-Ergebnisse',
  all_duplicates: 'Alle Dubletten',
  no_match_score: 'Score zu niedrig',
  all_queries_exhausted: 'Alle Queries erschöpft',
  no_geo_coords: 'Keine Geokoordinaten',
};

// ── Run Detail Panel ──────────────────────────────────────────────────────────

function RunDetailPanel({ run, orgName }) {
  const queries = safeParseJSON(run.search_queries_used, null);
  const centers = safeParseJSON(run.search_centers_used, null);
  const queriesFamilies = safeParseJSON(run.query_families_used, null);
  const lockActive = isLockActive(run);
  const runtime = calcRuntime(run);
  const runtimeEstimated = isRuntimeEstimated(run);

  return (
    <div className="space-y-4 text-xs">
      {/* Lock / Watchdog Status */}
      {lockActive && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-900">Verarbeitung aktiv (Lock)</p>
            <p className="text-amber-800 mt-0.5">
              Worker: <code className="bg-amber-100 px-1 rounded">{run.processing_by || '—'}</code>
              {' '}· Lock bis: {moment(run.processing_lock_until).format('HH:mm:ss')}
              {' '}· Versuche: {run.worker_attempts || 0}
            </p>
          </div>
        </div>
      )}
      {!lockActive && run.worker_attempts > 1 && (
        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-slate-700">Worker-Versuche: <strong>{run.worker_attempts}</strong> — möglicher Retry</p>
        </div>
      )}

      {/* Kennzahlen Grid */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Kennzahlen</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ['Roh-Treffer', run.raw_hits ?? 0],
            ['Gespeichert', run.leads_saved ?? 0, 'text-emerald-700'],
            ['Dubletten', run.duplicates_skipped ?? 0],
            ['Kein Match', run.no_match_count ?? 0],
            ['Außerhalb Radius', run.outside_radius_count ?? 0],
            ['Batch', `${run.batch_index ?? 0} / ${run.total_batches ?? 0}`],
          ].map(([label, value, cls]) => (
            <div key={label} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
              <p className="text-[10px] text-slate-500 font-medium">{label}</p>
              <p className={`text-base font-bold text-slate-900 ${cls || ''}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage / Gebietsabdeckung */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Gebietsabdeckung (LocationIndex)</p>
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 space-y-1.5">
          <Row label="Coverage-Modus" value={run.coverage_mode || 'grid_only'} />
          <Row label="Orte im Suchgebiet" value={run.covered_locations_count ?? '—'} />
          <Row label="Ausgewählte Orte (Plan-Limit)" value={run.selected_locations_count ?? '—'} />
          <Row label="Tatsächlich durchsucht" value={
            (run.selected_locations_count > 0)
              ? `${run.locations_searched_count ?? 0} / ${run.selected_locations_count} (${Math.round(((run.locations_searched_count ?? 0) / run.selected_locations_count) * 100)}%)`
              : (run.locations_searched_count ?? '—')
          } />
          <Row label="Suchpunkte gesamt" value={run.search_points_used_count ?? '—'} />
          <Row label="Suchzentrum" value={[run.search_center_city, run.search_radius_km ? `${run.search_radius_km} km` : null].filter(Boolean).join(' · ') || '—'} />
          <Row label="Abdeckung vollständig" value={run.coverage_complete ? '✅ Ja' : run.coverage_mode === 'grid_only' ? 'Grid-Modus' : '⏳ Nein'} />
          {run.chain_skipped_count > 0 && (
            <Row label="Ketten übersprungen" value={run.chain_skipped_count} />
          )}
        </div>
        {/* Fortschrittsbalken für Orte */}
        {(run.selected_locations_count > 0) && (
          <div className="mt-2">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>Orte-Fortschritt</span>
              <span>{run.locations_searched_count ?? 0} / {run.selected_locations_count}</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full"
                style={{ width: `${Math.min(100, Math.round(((run.locations_searched_count ?? 0) / run.selected_locations_count) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Taxonomie */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Taxonomie</p>
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1.5">
          <Row label="Branchen-ID" value={run.industry_id || '—'} />
          <Row label="Taxonomie-Version" value={run.taxonomy_version || '—'} mono />
          <Row label="Taxonomie-Hash" value={run.taxonomy_hash || '—'} mono small />
          <Row label="Stadt-Modus" value={run.city_mode || '—'} />
          <Row label="Query-Familien" value={queriesFamilies ? queriesFamilies.join(', ') : '—'} />
        </div>
      </div>

      {/* Zeitliche Daten */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Zeitverlauf</p>
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1.5">
          <Row label="Gestartet" value={run.started_at ? moment(run.started_at).format('DD.MM.YYYY HH:mm:ss') : '—'} />
          <Row label="Beendet" value={run.finished_at ? moment(run.finished_at).format('DD.MM.YYYY HH:mm:ss') : '—'} />
          <Row
            label={`Laufzeit${runtimeEstimated ? ' (geschätzt)' : ''}`}
            value={runtime || '—'}
            warning={runtimeEstimated}
          />
          <Row label="Erstellt" value={moment(run.created_date).format('DD.MM.YYYY HH:mm:ss')} />
          <Row label="Aktualisiert" value={run.updated_date ? moment(run.updated_date).format('DD.MM.YYYY HH:mm:ss') : '—'} />
        </div>
      </div>

      {/* Stop/Error */}
      {(run.stop_reason || run.error_message || run.zero_result_cause) && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Fehler / Stopp</p>
          <div className="bg-red-50 rounded-lg p-3 border border-red-200 space-y-1.5">
            {run.zero_result_cause && (
              <Row label="Null-Ergebnis Ursache" value={ZERO_CAUSE_LABELS[run.zero_result_cause] || run.zero_result_cause} warning />
            )}
            {run.stop_reason && <Row label="Stopp-Grund" value={run.stop_reason} mono />}
            {run.error_message && <Row label="Fehlermeldung" value={run.error_message} warning />}
          </div>
        </div>
      )}

      {/* Zielkunden */}
      {(run.target_customer_types || run.excluded_customer_types) && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Zielkunden-Konfiguration</p>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1.5">
            <Row label="Zielkunden" value={run.selected_target_customer_types || run.target_customer_types || '—'} />
            <Row label="Ausschlüsse" value={run.excluded_customer_types || '—'} />
          </div>
        </div>
      )}

      {/* Suchzentren */}
      {centers && centers.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Suchzentren ({centers.length})</p>
          <div className="space-y-1">
            {centers.map((c, i) => (
              <div key={i} className="bg-slate-50 rounded px-3 py-1.5 border border-slate-200 flex items-center justify-between">
                <span className="font-semibold text-slate-800">{c.city || '—'}</span>
                <span className="text-slate-500 font-mono text-[10px]">{c.lat?.toFixed(4)}, {c.lng?.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!centers && run.search_centers_used && (
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-700">
          search_centers_used: Ungültiges JSON — Rohdaten: <code className="text-[10px] break-all">{String(run.search_centers_used).slice(0, 200)}</code>
        </div>
      )}

      {/* Suchanfragen */}
      {queries && queries.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Suchanfragen ({queries.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {queries.map((q, i) => (
              <div key={i} className="bg-slate-50 rounded px-3 py-1.5 border border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold text-slate-800">{q.query || q.variant || '—'}</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {q.family && <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">{q.family}</span>}
                  {q.source && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{q.source}</span>}
                  {q.search_strategy && <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">{q.search_strategy}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!queries && run.search_queries_used && (
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-700">
          search_queries_used: Ungültiges JSON — Rohdaten: <code className="text-[10px] break-all">{String(run.search_queries_used).slice(0, 200)}</code>
        </div>
      )}

      {/* Run-ID */}
      <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">
        Run-ID: <code className="font-mono">{run.id}</code> · Org: <code className="font-mono">{run.organization_id}</code>
      </div>
    </div>
  );
}

function Row({ label, value, mono, small, warning }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] text-slate-500 font-medium flex-shrink-0 min-w-[120px]">{label}</span>
      <span className={`text-right break-all ${mono ? 'font-mono text-[10px]' : 'text-xs'} ${small ? 'text-[9px]' : ''} ${warning ? 'text-amber-700 font-semibold' : 'text-slate-800 font-semibold'}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

// ── Run Row (Tabellenzeile) ────────────────────────────────────────────────────

function RunRow({ run, orgName, isExpanded, onToggle }) {
  const runtime = calcRuntime(run);
  const runtimeEstimated = isRuntimeEstimated(run);
  const lockActive = isLockActive(run);

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          {isExpanded
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </td>
        <td className="px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{orgName || run.organization_id?.slice(0, 12) + '…'}</p>
          <p className="text-[10px] text-slate-500 font-mono">{run.industry_id || '—'}</p>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={run.status} />
            {lockActive && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-300">
                🔒 Lock aktiv
              </span>
            )}
          </div>
          {run.current_step && (
            <p className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate">{run.current_step}</p>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-slate-800">
          <span className="font-bold text-emerald-700">{run.leads_saved ?? 0}</span>
          <span className="text-slate-400 mx-1">/</span>
          <span className="text-slate-600">{run.raw_hits ?? 0} roh</span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-600">
          <span>{run.duplicates_skipped ?? 0} Dup</span>
          <span className="text-slate-400 mx-1">·</span>
          <span>{run.no_match_count ?? 0} kein Match</span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-600">
          {runtime
            ? <span className={runtimeEstimated ? 'text-amber-600' : ''}>{runtime}{runtimeEstimated ? ' ~' : ''}</span>
            : '—'}
        </td>
        <td className="px-4 py-3 text-xs text-slate-600">
          {moment(run.created_date).format('DD.MM.YY HH:mm')}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={7} className="px-6 py-4">
            <RunDetailPanel run={run} orgName={orgName} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ResearchRunDiagnostics({ userRole, userEmail, orgId }) {
  const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(userRole);
  const isOrgAdmin = userRole === 'organization_admin';
  const hasAccess = isPlatformAdmin || isOrgAdmin;

  const [runs, setRuns] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [filterOrg, setFilterOrg] = useState(isPlatformAdmin ? 'all' : (orgId || 'all'));
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchText, setSearchText] = useState('');

  const orgMap = useMemo(() => {
    const m = {};
    orgs.forEach(o => { m[o.id] = o.name; });
    return m;
  }, [orgs]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Org-Admin: nur eigene Org
      const runsQuery = isOrgAdmin && orgId ? { organization_id: orgId } : {};
      const [runsData, orgsData] = await Promise.all([
        base44.entities.ResearchRun.filter(runsQuery, '-created_date', 100),
        isPlatformAdmin
          ? base44.entities.Organization.list('-created_date', 200)
          : (orgId ? base44.entities.Organization.filter({ id: orgId }) : Promise.resolve([])),
      ]);
      setRuns(runsData || []);
      setOrgs(orgsData || []);
    } catch (e) {
      console.error('[ResearchRunDiagnostics] Ladefehler:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!hasAccess) return [];
    return runs.filter(r => {
      if (filterOrg !== 'all' && r.organization_id !== filterOrg) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const orgName = (orgMap[r.organization_id] || '').toLowerCase();
        const industry = (r.industry_id || '').toLowerCase();
        if (!orgName.includes(q) && !industry.includes(q) && !r.id.includes(q)) return false;
      }
      return true;
    });
  }, [hasAccess, runs, filterOrg, filterStatus, searchText, orgMap]);

  useEffect(() => { if (hasAccess) loadData(); }, [hasAccess]);

  // Kein Zugriff für normale Vertriebler — nach allen Hooks
  if (!hasAccess) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-6">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-red-900">Kein Zugriff</p>
          <p className="text-xs text-red-700">Das Diagnose-Center ist nur für Platform-Admins und Organisations-Admins zugänglich.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">ResearchRun Diagnose</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isPlatformAdmin ? 'Alle Organisations-Runs' : 'Nur eigene Organisation'}
            {' · '}letzte 100 Einträge
          </p>
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
            placeholder="Org, Branche oder Run-ID suchen…"
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
            {orgs.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        )}

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 font-medium"
        >
          <option value="all">Alle Status</option>
          <option value="queued">Ausstehend</option>
          <option value="running">Läuft</option>
          <option value="completed">Fertig</option>
          <option value="partial">Teilweise</option>
          <option value="failed">Fehler</option>
        </select>
      </div>

      {/* Summary Chips */}
      {!loading && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const count = runs.filter(r => r.status === status).length;
            if (count === 0) return null;
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
                className={`px-2.5 py-1 rounded-full border font-bold transition-colors ${
                  filterStatus === status ? cfg.color : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cfg.label}: {count}
              </button>
            );
          })}
          <span className="text-slate-400 ml-auto">{filtered.length} angezeigt</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Lade ResearchRuns…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Keine ResearchRuns gefunden</p>
            {(filterOrg !== 'all' || filterStatus !== 'all' || searchText) && (
              <button
                onClick={() => { setFilterOrg('all'); setFilterStatus('all'); setSearchText(''); }}
                className="text-xs text-blue-600 mt-2 hover:underline"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-8 px-4 py-2.5" />
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Organisation / Branche</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Gespeichert / Roh</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Dubletten / kein Match</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Laufzeit</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(run => (
                  <RunRow
                    key={run.id}
                    run={run}
                    orgName={orgMap[run.organization_id]}
                    isExpanded={expandedRunId === run.id}
                    onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}