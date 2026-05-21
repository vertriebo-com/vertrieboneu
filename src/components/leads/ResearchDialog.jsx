/**
 * ResearchDialog – Asynchrone ResearchRun Engine
 * 1. Klick → startResearchRun (sofort zurück)
 * 2. Dialog zeigt Fortschritt
 * 3. Frontend pollt alle 3s processResearchRun (kleiner Batch)
 * 4. Bei done=true → Erfolg anzeigen, onSuccess triggern
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

/**
 * Wandelt Backend-Fehler (inkl. Axios-Exceptions) in kundenfreundliche Texte um.
 * Unterscheidet explizit: Monatskontingent vs. API-Rate-Limit vs. Billing vs. allgemein.
 */
function getFriendlyResearchError(err, responseData) {
  // responseData kommt aus res.data wenn kein Exception
  const reason = responseData?.reason || responseData?.error || '';
  const monthly = responseData?.monthly_usage;

  if (reason === 'monthly_lead_quota_reached' || reason === 'monthly_contact_limit_reached') {
    return {
      type: 'quota',
      title: 'Monatskontingent erreicht',
      message: `Sie haben ${monthly?.monthly_used ?? '?'} von ${monthly?.monthly_limit ?? '?'} Leads diesen Monat genutzt.`,
      resetDate: monthly?.reset_date || null,
    };
  }
  if (reason === 'trial_preview_limit_reached') {
    return { type: 'quota', title: 'Vorschau-Kontingent aufgebraucht', message: 'Alle kostenlosen Vorschau-Leads wurden genutzt. Bitte wählen Sie einen Plan.', resetDate: null };
  }
  if (reason === 'free_preview_daily_limit') {
    return { type: 'ratelimit', title: 'Tages-Limit erreicht', message: 'Für heute wurden alle Vorschau-Recherchen genutzt. Bitte morgen wieder versuchen.', resetDate: null };
  }
  // Axios wirft bei 4xx/5xx – dann steht in err.response.data der Body
  const axiosData = err?.response?.data;
  const axiosReason = axiosData?.reason || axiosData?.error || '';
  const axiosMonthly = axiosData?.monthly_usage;

  if (axiosReason === 'monthly_lead_quota_reached' || axiosReason === 'monthly_contact_limit_reached') {
    return {
      type: 'quota',
      title: 'Monatskontingent erreicht',
      message: `Sie haben ${axiosMonthly?.monthly_used ?? '?'} von ${axiosMonthly?.monthly_limit ?? '?'} Leads diesen Monat genutzt.`,
      resetDate: axiosMonthly?.reset_date || null,
    };
  }
  const status = err?.response?.status;
  if (status === 402 || axiosReason === 'billing_blocked') {
    return { type: 'billing', title: 'Abo / Zahlung prüfen', message: 'Bitte prüfen Sie Ihren Abotstatus unter Einstellungen → Billing.', resetDate: null };
  }
  if (status === 429) {
    return { type: 'ratelimit', title: 'Recherche gerade ausgelastet', message: 'Unsere Recherche wurde kurzzeitig gebremst. Bitte versuchen Sie es in wenigen Minuten erneut.', resetDate: null };
  }
  if (status === 403) {
    return { type: 'forbidden', title: 'Keine Berechtigung', message: 'Sie haben keine Berechtigung für diese Aktion.', resetDate: null };
  }
  if (status === 503) {
    return { type: 'maintenance', title: 'Recherche kurz nicht verfügbar', message: responseData?.message || axiosData?.message || 'Die Recherche befindet sich in Wartung. Bitte versuchen Sie es in Kürze erneut.', resetDate: null };
  }
  if (status === 409 || axiosReason === 'research_run_already_active' || reason === 'research_run_already_active') {
    return { type: 'already_active', title: 'Recherche läuft bereits', message: 'Für diese Organisation läuft bereits eine Recherche. Bitte warten Sie, bis diese abgeschlossen ist.', resetDate: null };
  }
  return { type: 'error', title: 'Recherche konnte nicht gestartet werden', message: 'Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.', resetDate: null };
}

const POLL_INTERVAL_MS = 3000;

export default function ResearchDialog({ open, orgId, onClose, onSuccess }) {
  const [phase, setPhase] = useState("idle"); // idle | starting | running | done | error | quota | ratelimit
  const [researchRunId, setResearchRunId] = useState(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [leadsSaved, setLeadsSaved] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [errorInfo, setErrorInfo] = useState(null); // { type, title, message, resetDate }
  const [quotaHint, setQuotaHint] = useState(null); // { remaining, limit } – sanfter Hinweis wenn Kontingent knapp

  const pollRef = useRef(null);
  const processingRef = useRef(false);

  // Reset wenn Dialog aufgeht
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setResearchRunId(null);
      setProgressPercent(0);
      setLeadsSaved(0);
      setCurrentStep("");
      setErrorMsg("");
      setQuotaHint(null);
    } else {
      stopPolling();
    }
  }, [open]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // ── Schritt 1: Research starten ──────────────────────────────────────────
  const handleStart = async () => {
    setPhase("starting");
    setErrorMsg("");
    setErrorInfo(null);

    try {
      const res = await base44.functions.invoke("startResearchRun", {
        organization_id: orgId,
        target_count: 25,
      });

      if (!res?.data?.success) {
        const info = getFriendlyResearchError(null, res?.data);
        setErrorInfo(info);
        setPhase("error");
        return;
      }

      const runId = res.data.research_run_id;
      setResearchRunId(runId);
      setPhase("running");
      setCurrentStep("Recherche wird gestartet…");
      setProgressPercent(5);

      // Wenn effectiveTarget < 25 (Kontingent war knapp) → sanften Hinweis setzen
      const effective = res.data?.effective_target;
      const monthly = res.data?.monthly_usage;
      if (effective != null && effective < 25 && monthly?.remaining != null) {
        setQuotaHint({ remaining: monthly.remaining, limit: monthly.monthly_limit });
      }

      // Polling starten
      startPolling(runId);

    } catch (err) {
      // Axios wirft bei 4xx/5xx – response.data enthält den strukturierten Backend-Body
      const info = getFriendlyResearchError(err, err?.response?.data);
      setErrorInfo(info);
      setPhase("error");
    }
  };

  // ── Schritt 2: Polling → processResearchRun aufrufen ────────────────────
  function startPolling(runId) {
    pollRef.current = setInterval(() => {
      triggerBatch(runId);
    }, POLL_INTERVAL_MS);
  }

  const triggerBatch = async (runId) => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const res = await base44.functions.invoke("processResearchRun", {
        research_run_id: runId,
        organization_id: orgId,
      });

      const data = res?.data;
      if (!data) return;

      setProgressPercent(data.progress_percent || 0);
      setLeadsSaved(data.leads_saved || 0);
      setCurrentStep(data.current_step || data.message || "");

      if (data.done || ['completed', 'partial', 'failed'].includes(data?.status)) {
        stopPolling();
        setPhase("done");
        // P0-FIX: Direkt zur Leads-Seite mit runId (direkt aus Closure, nicht aus State)
        window.location.href = `/leads?new_run=${runId}`;
        onSuccess?.();
      }

    } catch (err) {
      console.error("[ResearchDialog] Batch error:", err?.message);
      // Nicht sofort als Fehler werten – nächster Poll-Cycle versucht es nochmal
    } finally {
      processingRef.current = false;
    }
  };

  // Sicherheitsnetz: Nach 3 Minuten ohne done-Signal → erzwinge Abschluss-UI
  useEffect(() => {
    if (phase !== "running") return;
    const timeout = setTimeout(() => {
      stopPolling();
      setPhase("done"); // Zeigt "X Kontakte gefunden" – Run wird im Backend durch Watchdog beendet
      onSuccess?.();
    }, 3 * 60 * 1000);
    return () => clearTimeout(timeout);
  }, [phase]);

  // ── Schließen ────────────────────────────────────────────────────────────
  const handleClose = () => {
    if (phase === "running") {
      // Recherche läuft im Hintergrund weiter – Banner zeigt Fortschritt
      stopPolling();
    }
    onClose?.();
  };

  // ── UI ───────────────────────────────────────────────────────────────────
  const isRunning = phase === "running";
  const isDone = phase === "done";
  const isError = phase === "error";
  const isStarting = phase === "starting";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Firmen recherchieren
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-5">

          {/* IDLE: Startansicht */}
          {phase === "idle" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Vertriebo sucht automatisch passende Firmenkontakte in Ihrem Suchgebiet basierend auf Ihren Einstellungen.
              </p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-800 space-y-1">
                <div className="font-semibold">Die Recherche läuft im Hintergrund.</div>
                <div className="text-blue-600 text-xs">Erste Kontakte erscheinen automatisch in Ihrer Leadliste – Sie können den Dialog schließen.</div>
              </div>
              <Button
                onClick={handleStart}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                size="lg"
              >
                <Sparkles className="w-4 h-4" />
                Recherche starten
              </Button>
            </div>
          )}

          {/* STARTING: Kurzer Spinner */}
          {isStarting && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm font-medium text-slate-700">Recherche wird gestartet…</p>
            </div>
          )}

          {/* RUNNING: Fortschritt */}
          {isRunning && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Recherche läuft im Hintergrund</div>
                  <div className="text-xs text-slate-500 mt-0.5">{currentStep || "Firmenprofile werden gesucht…"}</div>
                </div>
              </div>

              {/* Progressbar */}
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-700"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>

              {leadsSaved > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {leadsSaved} neue Firmenkontakte bereits gefunden
                </div>
              )}

              {quotaHint && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <span>
                    Es ist nur noch <strong>{quotaHint.remaining} Lead{quotaHint.remaining !== 1 ? 's' : ''}</strong> in Ihrem Monatskontingent verfügbar. Die Recherche wurde automatisch auf das verbleibende Kontingent begrenzt.
                  </span>
                </div>
              )}

              <p className="text-xs text-slate-400 text-center">
                Sie können diesen Dialog schließen – die Recherche läuft weiter.
              </p>

              <Button variant="outline" onClick={handleClose} className="w-full">
                Dialog schließen (Recherche läuft weiter)
              </Button>
            </div>
          )}

          {/* DONE: Abgeschlossen */}
          {isDone && (
            <div className="space-y-4">
              {leadsSaved > 0 ? (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <div className="text-lg font-bold text-slate-900">{leadsSaved} neue Firmenkontakte</div>
                  <div className="text-sm text-slate-500">wurden erfolgreich in Ihre Leadliste aufgenommen.</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-2 text-center">
                  <CheckCircle2 className="w-10 h-10 text-slate-300" />
                  <div className="text-base font-semibold text-slate-700">Keine neuen Kontakte gefunden</div>
                  <div className="text-sm text-slate-500">Bitte erweitern Sie den Radius oder passen Sie Ihre Zielkunden in den Einstellungen an.</div>
                </div>
              )}
              <Button onClick={handleClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                Schließen
              </Button>
            </div>
          )}

          {/* ERROR */}
          {isError && (
            <div className="space-y-4">
              {errorInfo?.type === 'quota' ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center gap-2 py-2 text-center">
                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="text-base font-bold text-slate-900">{errorInfo.title}</div>
                    <div className="text-sm text-slate-600">{errorInfo.message}</div>
                    {errorInfo.resetDate && (
                      <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        Ihr Kontingent wird am <strong>{errorInfo.resetDate}</strong> zurückgesetzt.
                        <br />Sie können bis dahin bestehende Leads bearbeiten oder upgraden.
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleClose} className="flex-1">Bestehende Leads</Button>
                    <Button onClick={() => { handleClose(); window.location.href = '/settings?tab=billing'; }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                      Plan ansehen
                    </Button>
                  </div>
                </div>
              ) : errorInfo?.type === 'already_active' ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center gap-2 py-2 text-center">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="text-base font-bold text-slate-900">{errorInfo.title}</div>
                    <div className="text-sm text-slate-600">{errorInfo.message}</div>
                  </div>
                  <Button onClick={handleClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    Verstanden
                  </Button>
                </div>
              ) : errorInfo?.type === 'ratelimit' ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center gap-2 py-2 text-center">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="text-base font-bold text-slate-900">{errorInfo.title}</div>
                    <div className="text-sm text-slate-600">{errorInfo.message}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleClose} className="flex-1">Schließen</Button>
                    <Button onClick={() => setPhase("idle")} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                      Später erneut versuchen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col items-center gap-2 py-2 text-center">
                    <XCircle className="w-10 h-10 text-red-400" />
                    <div className="text-base font-bold text-slate-900">{errorInfo?.title || 'Fehler'}</div>
                    <div className="text-sm text-slate-600">{errorInfo?.message || 'Bitte versuchen Sie es erneut.'}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleClose} className="flex-1">Schließen</Button>
                    <Button onClick={() => setPhase("idle")} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                      Erneut versuchen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}