/**
 * ActiveResearchBanner
 * ====================
 * Zeigt Fortschrittsbalken während ein ResearchRun läuft.
 *
 * WICHTIG – Koordination mit ResearchDialog:
 * - Wenn ein Processing-Lock aktiv ist (run.processing_lock_until in Zukunft),
 *   verarbeitet der Banner NICHT selbst → verhindert parallele Duplikate.
 * - Banner ruft processResearchRun nur auf wenn KEIN aktiver Lock existiert.
 * - ResearchDialog ist der primäre Worker solange er offen ist.
 * - Banner übernimmt als Fallback wenn Dialog geschlossen wurde.
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, X } from "lucide-react";

const POLL_MS = 8000; // Längerer Interval als ResearchDialog (3s), um Lock-Kollisionen zu reduzieren
const STALE_TIMEOUT_MS = 90000;

export default function ActiveResearchBanner({ orgId, onNewLeads }) {
  const [activeRun, setActiveRun] = useState(null);
  const [dismissed, setDismissed] = useState(null);
  const lastLeadsSavedRef = useRef(0);
  const processingRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (!orgId) return;
    tickLoop();
    const interval = setInterval(tickLoop, POLL_MS);
    return () => clearInterval(interval);
  }, [orgId]);

  const tickLoop = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const runs = await base44.entities.ResearchRun.filter(
        { organization_id: orgId }, '-created_date', 3
      );
      const running = runs.find(r => r.status === 'queued' || r.status === 'running');
      const recentDone = runs.find(r => {
        if (!['completed', 'partial', 'failed'].includes(r.status)) return false;
        const ts = r.finished_at ? new Date(r.finished_at).getTime() : new Date(r.updated_date).getTime();
        return Date.now() - ts < 60000;
      });

      // PRIORITÄT: Wenn recentDone existiert und running dasselbe oder ein älterer Run ist → done gewinnt
      const runningIsSuperseded = running && recentDone && (
        recentDone.id === running.id ||
        new Date(recentDone.finished_at || recentDone.updated_date).getTime() > new Date(running.created_date).getTime()
      );

      if (running && !runningIsSuperseded) {
        // ── Lock-Prüfung: Aktiver Worker läuft bereits (z.B. ResearchDialog) ──
        const lockUntil = running.processing_lock_until ? new Date(running.processing_lock_until).getTime() : 0;
        const isLockActive = lockUntil > Date.now();

        // Stale-Check
        const lastUpdate = running.updated_date ? new Date(running.updated_date).getTime() : Date.now();
        const isStale = Date.now() - lastUpdate > STALE_TIMEOUT_MS;

        if (isStale && retryCountRef.current >= MAX_RETRIES) {
          // Stale + zu viele Retries → forcierter Abschluss
          console.warn('[ActiveResearchBanner] Stale run, forcing finish:', running.id);
          await base44.functions.invoke('processResearchRun', {
            research_run_id: running.id,
            organization_id: orgId,
            force_finish: true,
          }).catch(() => {});
          retryCountRef.current = 0;
          return;
        }

        // ── Wenn Lock aktiv: nur anzeigen, NICHT selbst verarbeiten ──────────
        if (isLockActive) {
          // Anderer Worker (ResearchDialog) ist aktiv → nur UI aktualisieren
          setActiveRun({
            id: running.id,
            status: running.status,
            leads_saved: running.leads_saved ?? 0,
            progress_percent: running.progress_percent ?? 5,
            message: running.current_step || 'Recherche läuft…',
            // Coverage-Daten für UI
            covered_locations_count: running.covered_locations_count ?? 0,
            selected_locations_count: running.selected_locations_count ?? 0,
            locations_searched_count: running.locations_searched_count ?? 0,
            search_center_city: running.search_center_city || '',
            search_radius_km: running.search_radius_km ?? null,
            raw_hits: running.raw_hits ?? 0,
            duplicates_skipped: running.duplicates_skipped ?? 0,
          });

          if ((running.leads_saved || 0) > lastLeadsSavedRef.current) {
            lastLeadsSavedRef.current = running.leads_saved || 0;
            onNewLeads?.();
          }
          return;
        }

        // ── PUNKT 5: Vor invoke nochmal frisch aus DB lesen ─────────────────
        // Verhindert, dass ein abgeschlossener Run nochmal aufgerufen wird.
        const freshRuns = await base44.entities.ResearchRun.filter({ id: running.id });
        const freshRun = freshRuns[0];
        if (!freshRun) return;

        if (['completed', 'partial', 'failed'].includes(freshRun.status)) {
          // Run bereits abgeschlossen → nur anzeigen, nicht verarbeiten
          const finalLeads = freshRun.leads_saved || 0;
          setActiveRun({
            id: freshRun.id,
            status: freshRun.status,
            leads_saved: finalLeads,
            progress_percent: 100,
            // PUNKT 6: einheitliche Zählquelle = ResearchRun.leads_saved
            message: finalLeads > 0 ? `${finalLeads} neue Firmenkontakte gefunden` : 'Keine neuen Kontakte gefunden',
            research_run_id: freshRun.id,
          });
          if (finalLeads > lastLeadsSavedRef.current) {
            lastLeadsSavedRef.current = finalLeads;
            onNewLeads?.();
          }
          return;
        }

        // ── Kein Lock aktiv → Banner kann selbst verarbeiten (Dialog geschlossen) ──
        const res = await base44.functions.invoke('processResearchRun', {
          research_run_id: freshRun.id,
        });
        const data = res?.data;

        // PUNKT 6: einheitliche Zählquelle = immer ResearchRun.leads_saved aus DB, nicht lokaler Ref
        const leadsFromResponse = data?.leads_saved ?? freshRun.leads_saved ?? 0;

        if (leadsFromResponse > lastLeadsSavedRef.current) {
          lastLeadsSavedRef.current = leadsFromResponse;
          retryCountRef.current = 0;
          onNewLeads?.();
        } else if (!isStale && !data?.already_processing) {
          retryCountRef.current++;
        }

        if (data?.done || ['completed', 'partial', 'failed'].includes(data?.status)) {
          const finalLeads = data?.leads_saved ?? leadsFromResponse;
          setActiveRun({
            id: freshRun.id,
            status: data?.status || 'completed',
            leads_saved: finalLeads,
            progress_percent: 100,
            // PUNKT 6: einheitliche Nachricht
            message: finalLeads > 0 ? `${finalLeads} neue Firmenkontakte gefunden` : 'Keine neuen Kontakte gefunden',
            research_run_id: freshRun.id,
          });
          lastLeadsSavedRef.current = 0;
          onNewLeads?.();
          return;
        }

        setActiveRun({
          id: freshRun.id,
          status: freshRun.status,
          leads_saved: leadsFromResponse,
          progress_percent: data?.progress_percent ?? freshRun.progress_percent ?? 0,
          message: data?.current_step || freshRun.current_step || 'Recherche läuft…',
          research_run_id: freshRun.id,
          // Coverage: API-Response hat Vorrang (aktueller), dann freshRun als Fallback
          covered_locations_count: data?.covered_locations_count ?? freshRun.covered_locations_count ?? 0,
          selected_locations_count: data?.selected_locations_count ?? freshRun.selected_locations_count ?? 0,
          locations_searched_count: data?.locations_searched_count ?? freshRun.locations_searched_count ?? 0,
          search_center_city: freshRun.search_center_city || '',
          search_radius_km: freshRun.search_radius_km ?? null,
          raw_hits: data?.raw_hits ?? freshRun.raw_hits ?? 0,
          duplicates_skipped: data?.duplicates_skipped ?? freshRun.duplicates_skipped ?? 0,
        });

      } else if (recentDone && recentDone.id !== dismissed) {
        // PUNKT 6: einheitliche Zählquelle = ResearchRun.leads_saved
        const doneLeads = recentDone.leads_saved || 0;
        setActiveRun({
          id: recentDone.id,
          status: recentDone.status,
          leads_saved: doneLeads,
          progress_percent: 100,
          message: doneLeads > 0 ? `${doneLeads} neue Firmenkontakte gefunden` : 'Keine neuen Kontakte gefunden',
          research_run_id: recentDone.id,
        });
        lastLeadsSavedRef.current = 0;
      } else if (!running || runningIsSuperseded) {
        if (!recentDone) {
          setActiveRun(null);
          lastLeadsSavedRef.current = 0;
        }
      }
    } catch (e) {
      console.warn('[ActiveResearchBanner] tick error:', e?.message);
    } finally {
      processingRef.current = false;
    }
  };

  if (!activeRun) return null;

  const isDone = ['completed', 'partial', 'failed'].includes(activeRun.status);
  const isRunning = activeRun.status === 'running' || activeRun.status === 'queued';

  // Coverage-Daten auslesen
  const locationsSearched = activeRun.locations_searched_count ?? 0;
  const locationsTotal = activeRun.selected_locations_count ?? 0;
  const coveredTotal = activeRun.covered_locations_count ?? 0;
  const hasLocationCoverage = locationsTotal > 0;
  const cityLabel = activeRun.search_center_city ? `${activeRun.search_center_city}${activeRun.search_radius_km ? ` · ${activeRun.search_radius_km} km` : ''}` : null;

  return (
    <div className={`rounded-xl border p-3 ${isDone ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-semibold ${isDone ? 'text-green-900' : 'text-blue-900'}`}>
              {isRunning ? 'Recherche läuft im Hintergrund' : 'Recherche abgeschlossen'}
              {cityLabel && isRunning && (
                <span className="font-normal text-blue-700 ml-1">· {cityLabel}</span>
              )}
            </div>
            <div className={`text-xs mt-0.5 ${isDone ? 'text-green-700' : 'text-blue-600'}`}>
              {activeRun.message}
            </div>

            {/* Coverage-Details */}
            {isRunning && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
                {hasLocationCoverage && (
                  <>
                    <span className="text-xs text-blue-600 font-medium">
                      🗺️ Orte erkannt: {coveredTotal}
                    </span>
                    <span className="text-xs text-blue-700 font-medium">
                      Geprüft: {locationsSearched} / {locationsTotal}
                    </span>
                  </>
                )}
                {!hasLocationCoverage && (
                  <span className="text-xs text-blue-500">
                    Vertriebo durchsucht automatisch Nachbarorte im Umkreis.
                  </span>
                )}
                {activeRun.leads_saved > 0 && (
                  <span className="text-xs text-green-700 font-medium">✅ Neue Leads: {activeRun.leads_saved}</span>
                )}
                {activeRun.duplicates_skipped > 0 && (
                  <span className="text-xs text-slate-500">Duplikate: {activeRun.duplicates_skipped}</span>
                )}
                {activeRun.raw_hits > 0 && (
                  <span className="text-xs text-slate-400">Treffer geprüft: {activeRun.raw_hits}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {isDone && (
          <button
            onClick={() => { setDismissed(activeRun.id); setActiveRun(null); }}
            className="text-slate-400 hover:text-slate-600 shrink-0 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isRunning && (
        <div className="mt-2">
          <div className="w-full bg-blue-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${Math.max(5, activeRun.progress_percent)}%` }}
            />
          </div>
          {/* Orte-Fortschrittsbalken (nur wenn LocationIndex aktiv) */}
          {hasLocationCoverage && locationsTotal > 0 && (
            <div className="w-full bg-blue-50 rounded-full h-1 mt-1">
              <div
                className="bg-blue-300 h-1 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.round((locationsSearched / locationsTotal) * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}