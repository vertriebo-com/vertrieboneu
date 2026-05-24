/**
 * ResearchDialog – Asynchrone ResearchRun Engine
 * 1. Klick → startResearchRun (sofort zurück)
 * 2. Dialog zeigt Fortschritt
 * 3. Frontend pollt alle 3s processResearchRun (kleiner Batch)
 * 4. Bei done=true → Erfolg anzeigen, onSuccess triggern
 */
import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
        // Nur navigieren wenn runId gültig (nie undefined/null in URL)
        if (runId && runId !== 'undefined' && runId !== 'null') {
          window.location.href = `/leads?new_run=${runId}`;
        } else {
          window.location.href = `/leads`;
        }
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
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base font-bold text-slate-900">
                Firmen recherchieren
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-600 mt-0.5">
                Vertriebo sucht automatisch passende Firmenkontakte in Ihrem Suchgebiet.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-5">

          {/* IDLE: Startansicht */}
          {phase === "idle" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                Vertriebo sucht automatisch passende Firmenkontakte in Ihrem Suchgebiet basierend auf Ihren Einstellungen.
              </p>
              <div className="bg-gradient-to-r from-blue-50 to-blue-50/50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 space-y-1.5">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  Die Recherche läuft im Hintergrund.
                </div>
                <div className="text-blue-700 text-xs leading-relaxed">Erste Kontakte erscheinen automatisch in Ihrer Leadliste – Sie können den Dialog schließen.</div>
              </div>
              <Button
                onClick={handleStart}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 font-semibold shadow-sm"
                size="lg"
              >
                <Sparkles className="w-4 h-4" />
                Recherche starten
              </Button>
            </div>
          )}

          {/* STARTING: Kurzer Spinner */}
          {isStarting && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-slate-900">Recherche wird gestartet…</p>
            </div>
          )}

          {/* RUNNING: Fortschritt */}
          {isRunning && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">Recherche läuft im Hintergrund</div>
                  <div className="text-xs text-slate-600 mt-1 leading-relaxed">{currentStep || "Firmenprofile werden gesucht…"}</div>
                </div>
              </div>

              {/* Progressbar */}
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>

              {leadsSaved > 0 && (
                <div className="flex items-center gap-2.5 text-sm font-semibold text-emerald-800 bg-gradient-to-r from-emerald-50 to-emerald-50/50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  {leadsSaved} neue Firmenkontakte bereits gefunden
                </div>
              )}

              {quotaHint && (
                <div className="flex items-start gap-2.5 text-xs font-medium text-amber-900 bg-gradient-to-r from-amber-50 to-amber-50/50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                  <span className="leading-relaxed">
                    Es ist nur noch <strong>{quotaHint.remaining} Lead{quotaHint.remaining !== 1 ? 's' : ''}</strong> in Ihrem Monatskontingent verfügbar. Die Recherche wurde automatisch auf das verbleibende Kontingent begrenzt.
                  </span>
                </div>
              )}

              <p className="text-xs text-slate-500 text-center">
                Sie können diesen Dialog schließen – die Recherche läuft weiter.
              </p>

              <Button variant="outline" onClick={handleClose} className="w-full border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium">
                Dialog schließen
              </Button>
            </div>
          )}

          {/* DONE: Abgeschlossen */}
          {isDone && (
            <div className="space-y-4">
              {leadsSaved > 0 ? (
                <div className="flex flex-col items-center gap-3 py-3 text-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center shadow-sm">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-900">{leadsSaved} neue Firmenkontakte</div>
                    <div className="text-sm text-slate-600 mt-1">wurden erfolgreich in Ihre Leadliste aufgenommen.</div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-3 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-800">Keine neuen Kontakte gefunden</div>
                    <div className="text-sm text-slate-600 mt-1">Bitte erweitern Sie den Radius oder passen Sie Ihre Zielkunden an.</div>
                  </div>
                </div>
              )}
              <Button onClick={handleClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm">
                Schließen
              </Button>
            </div>
          )}

          {/* ERROR */}
          {isError && (
            <div className="space-y-4">
              {errorInfo?.type === 'quota' ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-3 text-center">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center shadow-sm">
                      <AlertTriangle className="w-7 h-7 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-slate-900">{errorInfo.title}</div>
                      <div className="text-sm text-slate-700 mt-1">{errorInfo.message}</div>
                      {errorInfo.resetDate && (
                        <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 mt-2.5 leading-relaxed">
                          Ihr Kontingent wird am <strong>{errorInfo.resetDate}</strong> zurückgesetzt.
                          <br />Sie können bis dahin bestehende Leads bearbeiten oder upgraden.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium">
                      Bestehende Leads
                    </Button>
                    <Button onClick={() => { handleClose(); window.location.href = '/settings?tab=billing'; }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm">
                      Plan ansehen
                    </Button>
                  </div>
                </div>
              ) : errorInfo?.type === 'already_active' ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-3 text-center">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center shadow-sm">
                      <Loader2 className="w-7 h-7 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-slate-900">{errorInfo.title}</div>
                      <div className="text-sm text-slate-700 mt-1">{errorInfo.message}</div>
                    </div>
                  </div>
                  <Button onClick={handleClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm">
                    Verstanden
                  </Button>
                </div>
              ) : errorInfo?.type === 'ratelimit' ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-3 text-center">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center shadow-sm">
                      <Loader2 className="w-7 h-7 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-slate-900">{errorInfo.title}</div>
                      <div className="text-sm text-slate-700 mt-1">{errorInfo.message}</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium">
                      Schließen
                    </Button>
                    <Button onClick={() => setPhase("idle")} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm">
                      Später erneut versuchen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-3 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                      <XCircle className="w-7 h-7 text-red-500" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-slate-900">{errorInfo?.title || 'Fehler'}</div>
                      <div className="text-sm text-slate-700 mt-1">{errorInfo?.message || 'Bitte versuchen Sie es erneut.'}</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium">
                      Schließen
                    </Button>
                    <Button onClick={() => setPhase("idle")} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm">
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