/**
 * ResearchObservabilityPanel
 * ==========================
 * Kompaktes Observability-Panel für abgeschlossene ResearchRuns.
 * Zeigt: Summary, Funnel, Qualität, Coverage, Chain-Skips, Fehler.
 *
 * Props:
 *   orgId: string
 *   researchRunId?: string  (wenn gesetzt: Detail-Ansicht; sonst: letzte Runs)
 *   compact?: boolean       (true = nur Summary+Funnel, kein Detail-Accordion)
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  CheckCircle2, AlertCircle, AlertTriangle, ChevronDown, ChevronUp,
  BarChart3, MapPin, Filter, Zap, Search, Clock, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

function TierBar({ premium = 0, strong = 0, good = 0, weak = 0 }) {
  const total = premium + strong + good + weak;
  if (total === 0) return <p className="text-xs text-slate-400">Keine Qualitätsdaten</p>;
  const pct = (n) => Math.round((n / total) * 100);
  const segments = [
    { label: "Premium", count: premium, color: "bg-emerald-500", pct: pct(premium) },
    { label: "Stark", count: strong, color: "bg-blue-500", pct: pct(strong) },
    { label: "Gut", count: good, color: "bg-amber-400", pct: pct(good) },
    { label: "Schwach", count: weak, color: "bg-slate-300", pct: pct(weak) },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        {segments.map(s => s.count > 0 && (
          <div key={s.label} className={`${s.color} transition-all`} style={{ width: `${s.pct}%` }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {segments.map(s => s.count > 0 && (
          <span key={s.label} className="flex items-center gap-1 text-[11px] text-slate-600">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            {s.count} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function FunnelRow({ label, count, total, color = "bg-blue-400", icon }) {
  if (count === null || count === undefined) return null;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-28 text-xs text-slate-600 font-medium shrink-0">{label}</div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-2 ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className="text-xs font-bold text-slate-800 w-8 text-right">{count.toLocaleString('de-DE')}</span>
      </div>
    </div>
  );
}

function Accordion({ title, children, defaultOpen = false, icon }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {icon}
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    completed: { label: "Abgeschlossen", cls: "bg-emerald-100 text-emerald-700" },
    partial:   { label: "Teilweise",     cls: "bg-amber-100 text-amber-700" },
    failed:    { label: "Fehlgeschlagen",cls: "bg-red-100 text-red-700" },
    running:   { label: "Läuft",         cls: "bg-blue-100 text-blue-700" },
    queued:    { label: "Warteschlange", cls: "bg-slate-100 text-slate-600" },
  };
  const s = map[status] || { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

function formatRuntime(seconds) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// ── Single Run Detail ─────────────────────────────────────────────────────

// Hilfsfunktion: snake_case → lesbarer Label
function humanizeId(id) {
  if (!id) return '';
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// coverage_mode → lesbarer Text
function humanizeCoverageMode(mode) {
  const map = {
    location_index_plus_grid: 'Ortsindex + Raster',
    grid_only: 'Nur Raster',
    location_index_only: 'Nur Ortsindex',
  };
  return map[mode] || humanizeId(mode);
}

// zero_result_cause → lesbarer Text
function humanizeZeroResultCause(cause) {
  const map = {
    no_queries_built: 'Keine Suchanfragen generiert',
    no_google_results: 'Keine Google-Treffer',
    all_duplicates: 'Alle Treffer waren Duplikate',
    no_match_score: 'Kein Treffer erfüllte Mindest-Score',
    all_queries_exhausted: 'Alle Suchanfragen abgearbeitet',
    no_geo_coords: 'Keine Geo-Koordinaten gefunden',
    taxonomy_profile_missing: 'Branchenprofil fehlt',
  };
  return map[cause] || humanizeId(cause);
}

function RunDetail({ detail }) {
  const { research_run: run, funnel, quality, coverage, chain_skips, diagnostics } = detail;
  const rawHits = funnel.raw_hits_count || 0;

  return (
    <div className="space-y-3">
      {/* Summary Header */}
      <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill status={run.status} />
              {run.industry_id && <span className="text-xs text-slate-600 font-medium">{run.industry_label || humanizeId(run.industry_id)}</span>}
              {run.city && <span className="text-xs text-slate-500">· {run.city} {run.radius_km ? `(${run.radius_km} km)` : ''}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-700">{run.leads_saved}</p>
                <p className="text-[10px] text-slate-500 font-medium">Gespeichert</p>
              </div>
              {rawHits > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-700">{rawHits.toLocaleString('de-DE')}</p>
                  <p className="text-[10px] text-slate-500 font-medium">Geprüft</p>
                </div>
              )}
              {run.target_leads && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-400">{run.target_leads}</p>
                  <p className="text-[10px] text-slate-500 font-medium">Ziel</p>
                </div>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            {run.runtime_seconds && <p>⏱ {formatRuntime(run.runtime_seconds)}</p>}
            {run.batch_index > 0 && run.total_batches && (
              <p>Batch {run.batch_index}/{run.total_batches}</p>
            )}
            {diagnostics.legacy_run && <p className="text-amber-600">⚠ Legacy-Run</p>}
          </div>
        </div>
      </div>

      {/* Funnel */}
      {rawHits > 0 && (
        <Accordion title="Treffer-Funnel" defaultOpen={true} icon={<Filter className="w-4 h-4 text-blue-500" />}>
          <div className="space-y-2">
            <FunnelRow label="Treffer geprüft" count={rawHits} total={rawHits} color="bg-slate-300" />
            <FunnelRow label="Gespeichert" count={funnel.saved} total={rawHits} color="bg-emerald-500" />
            <FunnelRow label="Duplikate" count={funnel.duplicates_skipped} total={rawHits} color="bg-blue-300" />
            <FunnelRow label="Außerhalb Radius" count={funnel.outside_radius_count} total={rawHits} color="bg-amber-300" />
            <FunnelRow label="Ketten/Filiale" count={funnel.chain_skipped_count} total={rawHits} color="bg-orange-300" />
            <FunnelRow label="Kein Match" count={funnel.no_match_count} total={rawHits} color="bg-red-300" />
            {funnel.unaccounted > 5 && (
              <p className="text-[11px] text-slate-400 pt-1">
                {funnel.unaccounted} Treffer ohne Kategorie (Timing, API-Fehler, Legacy)
              </p>
            )}
          </div>
        </Accordion>
      )}

      {/* Lead-Qualität */}
      {quality.total_companies_for_run > 0 && (
        <Accordion title="Lead-Qualität" icon={<BarChart3 className="w-4 h-4 text-violet-500" />}>
          <div className="space-y-3">
            <TierBar
              premium={quality.premium_count}
              strong={quality.strong_count}
              good={quality.good_count}
              weak={quality.weak_count}
            />
            <div className="grid grid-cols-3 gap-2 text-center">
              {quality.avg_relevance_score !== null && (
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-base font-bold text-slate-800">{quality.avg_relevance_score}</p>
                  <p className="text-[10px] text-slate-500">Ø Score</p>
                </div>
              )}
              {quality.median_relevance_score !== null && (
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-base font-bold text-slate-800">{quality.median_relevance_score}</p>
                  <p className="text-[10px] text-slate-500">Median</p>
                </div>
              )}
              {quality.query_intent_match_count > 0 && (
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-base font-bold text-emerald-700">{quality.query_intent_match_count}</p>
                  <p className="text-[10px] text-slate-500">Zielkunden-Match</p>
                </div>
              )}
            </div>
            {Object.keys(quality.save_reason_code_distribution || {}).length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Speicher-Gründe</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(quality.save_reason_code_distribution).slice(0, 6).map(([k, v]) => (
                    <span key={k} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                      {k.replace(/\+/g, ' + ')} ({v})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Accordion>
      )}

      {/* Coverage */}
      {!diagnostics.legacy_run && (
        <Accordion title="Abdeckung" icon={<MapPin className="w-4 h-4 text-emerald-500" />}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {coverage.coverage_complete ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span className="text-sm font-medium text-slate-800">
                {coverage.coverage_complete ? "Suchgebiet vollständig abgedeckt" : `${coverage.locations_remaining_count ?? '?'} Orte noch offen`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {coverage.locations_searched_count !== null && (
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="font-bold text-slate-800">{coverage.locations_searched_count}</p>
                  <p className="text-slate-500">Orte durchsucht</p>
                </div>
              )}
              {coverage.selected_locations_count !== null && (
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="font-bold text-slate-800">{coverage.selected_locations_count}</p>
                  <p className="text-slate-500">Orte geplant</p>
                </div>
              )}
              {coverage.search_points_used_count !== null && (
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="font-bold text-slate-800">{coverage.search_points_used_count}</p>
                  <p className="text-slate-500">Suchpunkte</p>
                </div>
              )}
              {coverage.coverage_mode && (
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="font-bold text-slate-700 text-[11px]">{humanizeCoverageMode(coverage.coverage_mode)}</p>
                  <p className="text-slate-500">Modus</p>
                </div>
              )}
            </div>
          </div>
        </Accordion>
      )}

      {/* Chain-Skips */}
      {chain_skips.count > 0 && (
        <Accordion title={`Ketten-/Filialfilter (${chain_skips.count})`} icon={<Filter className="w-4 h-4 text-orange-400" />}>
          <div className="space-y-2">
            <p className="text-xs text-slate-600">
              {chain_skips.count} Treffer wurden als Kette/Filiale erkannt und übersprungen.
            </p>
            {chain_skips.examples.slice(0, 5).map((ex, i) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800">{ex.name}</p>
                  {ex.recommended_policy && ex.recommended_policy !== 'exclude' && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0">
                      {ex.recommended_policy === 'allow_if_target_customer' ? 'Prüfen' : ex.recommended_policy}
                    </span>
                  )}
                </div>
                <p className="text-slate-500 mt-0.5">
                  {ex.matched_chain_keyword ? `Ketten-Keyword: "${ex.matched_chain_keyword}"` : ex.reason}
                  {ex.rating_count > 0 && ` · ${ex.rating_count} Bewertungen`}
                </p>
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* Fehler */}
      {(run.error_message || run.stop_reason || run.zero_result_cause) && (
        <Accordion title="Diagnose / Fehler" icon={<AlertTriangle className="w-4 h-4 text-red-500" />}>
          <div className="space-y-2 text-sm">
            {run.zero_result_cause && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="font-semibold text-amber-900 text-xs mb-0.5">Ursache: Kein Ergebnis</p>
                <p className="text-amber-800 text-xs">{humanizeZeroResultCause(run.zero_result_cause)}</p>
              </div>
            )}
            {run.stop_reason && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-600"><span className="font-semibold">Stop-Grund:</span> {run.stop_reason}</p>
              </div>
            )}
            {run.error_message && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-700">{run.error_message.slice(0, 200)}</p>
              </div>
            )}
            {run.worker_attempts > 1 && (
              <p className="text-xs text-slate-500">{run.worker_attempts} Verarbeitungsversuche</p>
            )}
          </div>
        </Accordion>
      )}

      {diagnostics.missing_metrics?.length > 0 && (
        <p className="text-[11px] text-slate-400 px-1">
          Fehlende Metriken (Legacy-Run): {diagnostics.missing_metrics.join(', ')}
        </p>
      )}
    </div>
  );
}

// ── Run-List Row ──────────────────────────────────────────────────────────

function RunListRow({ run, onSelect }) {
  const rawHits = run.raw_hits || 0;
  const industryLabel = run.industry_label || humanizeId(run.industry_id);
  return (
    <button
      onClick={() => onSelect(run.id)}
      className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <StatusPill status={run.status} />
            {industryLabel && <span className="text-xs font-semibold text-slate-700">{industryLabel}</span>}
            {run.city && <span className="text-xs text-slate-500">{run.city}{run.radius_km ? ` · ${run.radius_km} km` : ''}</span>}
          </div>
          {/* Kompakter Funnel-Text */}
          <p className="text-sm font-bold text-slate-900">
            {run.leads_saved} neue Leads gespeichert
          </p>
          <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-slate-500">
            {rawHits > 0 && <span>{rawHits.toLocaleString('de-DE')} Firmenprofile geprüft</span>}
            {run.duplicates_skipped > 0 && <span>{run.duplicates_skipped} Duplikate übersprungen</span>}
            {run.outside_radius_count > 0 && <span>{run.outside_radius_count} außerhalb Suchgebiet</span>}
            {run.chain_skipped_count > 0 && <span>{run.chain_skipped_count} Ketten/Filialen übersprungen</span>}
            {run.no_match_count > 0 && <span>{run.no_match_count} kein Zielkunden-Match</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          {run.coverage_complete === true && (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto mb-1" />
          )}
          {run.coverage_complete === false && (
            <AlertCircle className="w-4 h-4 text-amber-400 ml-auto mb-1" />
          )}
          <p className="text-[11px] text-slate-400">
            {run.started_at ? new Date(run.started_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}
          </p>
        </div>
      </div>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ResearchObservabilityPanel({ orgId, researchRunId, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState(researchRunId || null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const res = await base44.functions.invoke('getResearchRunObservability', {
      org_id: orgId,
      ...(researchRunId ? { research_run_id: researchRunId } : { limit: 5 }),
    });
    setData(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [orgId, researchRunId]);

  const loadDetail = async (runId) => {
    if (!runId || !orgId) return;
    setSelectedRunId(runId);
    setDetailLoading(true);
    const res = await base44.functions.invoke('getResearchRunObservability', {
      org_id: orgId,
      research_run_id: runId,
    });
    setDetailData(res.data?.detail || null);
    setDetailLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
        Recherche-Daten werden geladen…
      </div>
    );
  }

  if (!data) return null;

  // Direct single-run mode
  if (data.mode === 'single' && data.detail) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-500" />
            Recherche-Analyse
          </h3>
          <button onClick={load} className="text-xs text-slate-400 hover:text-blue-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            Aktualisieren
          </button>
        </div>
        <RunDetail detail={data.detail} />
      </div>
    );
  }

  // List mode
  const runs = data.runs || [];
  if (runs.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-slate-500">
        <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
        Noch keine Recherchen durchgeführt.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-500" />
          Letzte Recherchen
        </h3>
        <button onClick={load} className="text-xs text-slate-400 hover:text-blue-600 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Run List */}
      {!selectedRunId && (
        <div className="space-y-2">
          {runs.map(run => (
            <RunListRow key={run.id} run={run} onSelect={loadDetail} />
          ))}
        </div>
      )}

      {/* Detail */}
      {selectedRunId && (
        <div className="space-y-3">
          <button
            onClick={() => { setSelectedRunId(null); setDetailData(null); }}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            ← Alle Recherchen
          </button>
          {detailLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
              <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              Analyse wird geladen…
            </div>
          )}
          {!detailLoading && detailData && <RunDetail detail={detailData} />}
        </div>
      )}
    </div>
  );
}