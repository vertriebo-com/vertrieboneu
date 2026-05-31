/**
 * ResearchDialog – Asynchrone ResearchRun Engine
 * Polling-Logik bleibt erhalten (startResearchRun → processResearchRun).
 * UX: Stepper, klare Zustände, kein falscher Erfolg bei failed.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle,
  MapPin, Users, Search, Filter, Save, ArrowRight
} from "lucide-react";

// ── Error Parser (unverändert) ────────────────────────────────────────────────
function getFriendlyResearchError(err, responseData) {
  const reason = responseData?.reason || responseData?.error || '';
  const monthly = responseData?.monthly_usage;
  if (reason === 'monthly_lead_quota_reached' || reason === 'monthly_contact_limit_reached') {
    return { type: 'quota', title: 'Monatskontingent erreicht', message: `Sie haben ${monthly?.monthly_used ?? '?'} von ${monthly?.monthly_limit ?? '?'} Leads diesen Monat genutzt.`, resetDate: monthly?.reset_date || null };
  }
  if (reason === 'trial_preview_limit_reached') {
    return { type: 'quota', title: 'Vorschau-Kontingent aufgebraucht', message: 'Alle kostenlosen Vorschau-Leads wurden genutzt. Bitte wählen Sie einen Plan.', resetDate: null };
  }
  if (reason === 'free_preview_daily_limit') {
    return { type: 'ratelimit', title: 'Tages-Limit erreicht', message: 'Für heute wurden alle Vorschau-Recherchen genutzt. Bitte morgen wieder versuchen.', resetDate: null };
  }
  const axiosData = err?.response?.data;
  const axiosReason = axiosData?.reason || axiosData?.error || '';
  const axiosMonthly = axiosData?.monthly_usage;
  if (axiosReason === 'monthly_lead_quota_reached' || axiosReason === 'monthly_contact_limit_reached') {
    return { type: 'quota', title: 'Monatskontingent erreicht', message: `Sie haben ${axiosMonthly?.monthly_used ?? '?'} von ${axiosMonthly?.monthly_limit ?? '?'} Leads diesen Monat genutzt.`, resetDate: axiosMonthly?.reset_date || null };
  }
  const status = err?.response?.status;
  if (status === 402 || axiosReason === 'billing_blocked') return { type: 'billing', title: 'Abo / Zahlung prüfen', message: 'Bitte prüfen Sie Ihren Abotstatus unter Einstellungen → Billing.', resetDate: null };
  if (status === 429) return { type: 'ratelimit', title: 'Recherche gerade ausgelastet', message: 'Bitte versuchen Sie es in wenigen Minuten erneut.', resetDate: null };
  if (status === 403) return { type: 'forbidden', title: 'Keine Berechtigung', message: 'Sie haben keine Berechtigung für diese Aktion.', resetDate: null };
  if (status === 503) return { type: 'maintenance', title: 'Recherche kurz nicht verfügbar', message: responseData?.message || axiosData?.message || 'Die Recherche befindet sich in Wartung. Bitte versuchen Sie es in Kürze erneut.', resetDate: null };
  if (status === 409 || axiosReason === 'research_run_already_active' || reason === 'research_run_already_active') {
    return { type: 'already_active', title: 'Recherche läuft bereits', message: 'Für Ihre Organisation läuft bereits eine Recherche. Bitte warten Sie, bis diese abgeschlossen ist.', resetDate: null };
  }
  return { type: 'error', title: 'Recherche konnte nicht gestartet werden', message: 'Bitte versuchen Sie es erneut oder kontaktieren Sie den Support.', resetDate: null };
}

// ── Stepper-Konfiguration ────────────────────────────────────────────────────
const STEPS = [
  { id: "init",      label: "Suchauftrag erstellen",           icon: Sparkles  },
  { id: "geo",       label: "Suchgebiet & Nachbarorte prüfen", icon: MapPin    },
  { id: "search",    label: "Firmenprofile durchsuchen",       icon: Search    },
  { id: "dedupe",    label: "Duplikate überspringen",          icon: Filter    },
  { id: "save",      label: "Leads speichern",                 icon: Save      },
];

function getActiveStep(progressPercent, currentStep) {
  const step = (currentStep || "").toLowerCase();
  if (progressPercent >= 90 || step.includes("speicher") || step.includes("sav")) return "save";
  if (progressPercent >= 60 || step.includes("duplikat") || step.includes("dupl") || step.includes("dedupe")) return "dedupe";
  if (progressPercent >= 30 || step.includes("firma") || step.includes("profil") || step.includes("such")) return "search";
  if (progressPercent >= 10 || step.includes("ort") || step.includes("geo") || step.includes("nachbar") || step.includes("center")) return "geo";
  return "init";
}

// ── Stepper-Komponente ───────────────────────────────────────────────────────
function ResearchStepper({ activeStepId, done = false }) {
  const activeIndex = STEPS.findIndex(s => s.id === activeStepId);
  return (
    <div className="space-y-1.5">
      {STEPS.map((step, i) => {
        const isCompleted = done ? true : i < activeIndex;
        const isActive = !done && i === activeIndex;
        const isPending = !done && i > activeIndex;
        const Icon = step.icon;
        return (
          <div key={step.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors ${
            isActive ? "bg-blue-50 border border-blue-100" :
            isCompleted ? "opacity-70" : "opacity-30"
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              isCompleted ? "bg-emerald-100" : isActive ? "bg-blue-100" : "bg-slate-100"
            }`}>
              {isCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : isActive ? (
                <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              ) : (
                <Icon className="w-3 h-3 text-slate-400" />
              )}
            </div>
            <span className={`text-xs font-semibold ${
              isActive ? "text-blue-800" : isCompleted ? "text-slate-600" : "text-slate-400"
            }`}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Fortschritts-Statistiken ─────────────────────────────────────────────────
function RunStats({ data, leadsSaved }) {
  const items = [];
  if (leadsSaved > 0) items.push({ label: "Leads gespeichert", value: leadsSaved, color: "text-emerald-700" });
  if (data?.duplicates_skipped > 0) items.push({ label: "Duplikate übersprungen", value: data.duplicates_skipped, color: "text-slate-500" });
  if (data?.locations_searched_count != null && data?.selected_locations_count != null) {
    items.push({ label: "Orte geprüft", value: `${data.locations_searched_count} / ${data.selected_locations_count}`, color: "text-slate-600" });
  }
  if (data?.raw_hits > 0) items.push({ label: "Profile geprüft", value: data.raw_hits, color: "text-slate-500" });
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(({ label, value, color }) => (
        <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
          <p className={`text-sm font-bold ${color}`}>{value}</p>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

const POLL_INTERVAL_MS = 3000;

// ── Main Component ───────────────────────────────────────────────────────────
export default function ResearchDialog({ open, orgId, onClose, onSuccess }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("idle");
  const [researchRunId, setResearchRunId] = useState(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [leadsSaved, setLeadsSaved] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [errorInfo, setErrorInfo] = useState(null);
  const [quotaHint, setQuotaHint] = useState(null);
  const [startingTimeout, setStartingTimeout] = useState(false);
  const [startingLongWait, setStartingLongWait] = useState(false);
  const [lastPollData, setLastPollData] = useState(null);
  const [doneStatus, setDoneStatus] = useState(null); // "completed" | "partial" | "failed"

  const pollRef = useRef(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPhase("idle");
      setResearchRunId(null);
      setProgressPercent(0);
      setLeadsSaved(0);
      setCurrentStep("");
      setErrorInfo(null);
      setQuotaHint(null);
      setLastPollData(null);
      setDoneStatus(null);
    } else {
      stopPolling();
    }
  }, [open]);

  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    setPhase("starting");
    setErrorInfo(null);
    setStartingTimeout(false);
    setStartingLongWait(false);

    const t1 = setTimeout(() => setStartingTimeout(true), 3000);
    const t2 = setTimeout(() => setStartingLongWait(true), 10000);

    if (!orgId) {
      clearTimeout(t1); clearTimeout(t2);
      setErrorInfo({ type: 'error', title: 'Keine Organisation gefunden', message: 'Bitte stellen Sie sicher, dass Sie einer Organisation angehören.' });
      setPhase("error"); return;
    }

    try {
      const res = await base44.functions.invoke("startResearchRun", { organization_id: orgId, target_count: 25 });
      clearTimeout(t1); clearTimeout(t2);

      if (!res?.data?.success) {
        setErrorInfo(getFriendlyResearchError(null, res?.data));
        setPhase("error"); return;
      }

      const runId = res.data.research_run_id;
      setResearchRunId(runId);
      setPhase("running");
      setCurrentStep("Suchauftrag erstellt. Suchgebiet wird geprüft…");
      setProgressPercent(5);

      const effective = res.data?.effective_target;
      const monthly = res.data?.monthly_usage;
      if (effective != null && effective < 25 && monthly?.remaining != null) {
        setQuotaHint({ remaining: monthly.remaining, limit: monthly.monthly_limit });
      }

      startPolling(runId);
    } catch (err) {
      clearTimeout(t1); clearTimeout(t2);
      console.error("[ResearchDialog] Start error:", err?.message, err?.response?.data);
      setErrorInfo(getFriendlyResearchError(err, err?.response?.data));
      setPhase("error");
    }
  };

  // ── Polling ───────────────────────────────────────────────────────────────
  function startPolling(runId) {
    pollRef.current = setInterval(() => triggerBatch(runId), POLL_INTERVAL_MS);
  }

  const triggerBatch = async (runId) => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const res = await base44.functions.invoke("processResearchRun", { research_run_id: runId, organization_id: orgId });
      const data = res?.data;
      if (!data) return;

      setProgressPercent(data.progress_percent || 0);
      setLeadsSaved(data.leads_saved || 0);
      setCurrentStep(data.current_step || data.message || "");
      setLastPollData(data);

      if (data.done || ['completed', 'partial'].includes(data?.status)) {
        stopPolling();
        setDoneStatus(data?.status || 'completed');
        setPhase("done");
        onSuccess?.();
        if (runId && runId !== 'undefined' && runId !== 'null') {
          navigate(`/leads?new_run=${runId}`, { replace: false });
        } else {
          navigate('/leads', { replace: false });
        }
      } else if (data?.status === 'failed') {
        stopPolling();
        setDoneStatus('failed');
        setPhase("done");
        // Kein onSuccess() bei failed
      }
    } catch (err) {
      console.error("[ResearchDialog] Batch error:", err?.message);
    } finally {
      processingRef.current = false;
    }
  };

  // Background-Timeout nach 3 Minuten
  useEffect(() => {
    if (phase !== "running") return;
    const timeout = setTimeout(() => { stopPolling(); setPhase("background"); }, 3 * 60 * 1000);
    return () => clearTimeout(timeout);
  }, [phase]);

  const handleClose = () => {
    if (phase === "running") stopPolling();
    onClose?.();
  };

  const activeStepId = getActiveStep(progressPercent, currentStep);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">Firmen recherchieren</DialogTitle>
              <DialogDescription className="text-sm text-slate-500 mt-0.5">
                Vertriebo sucht passende Firmenkontakte in Ihrem Suchgebiet.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-1 space-y-4">

          {/* ── IDLE ──────────────────────────────────────────────────── */}
          {phase === "idle" && (
            <div className="space-y-4">
              {/* Was passiert */}
              <div className="space-y-2">
                {[
                  { icon: MapPin,   text: "Suchgebiet aus Ihren Einstellungen wird verwendet" },
                  { icon: Users,    text: "Nachbarorte werden automatisch einbezogen" },
                  { icon: Filter,   text: "Bereits bekannte Firmen werden übersprungen" },
                  { icon: Save,     text: "Gefundene Firmen werden als Leads gespeichert" },
                  { icon: CheckCircle2, text: "Monatliches Kontingent wird berücksichtigt" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <p className="text-sm text-slate-700">{text}</p>
                  </div>
                ))}
              </div>
              <Button onClick={handleStart} className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 font-bold shadow-sm" size="lg">
                <Sparkles className="w-4 h-4" /> Recherche starten
              </Button>
            </div>
          )}

          {/* ── STARTING ──────────────────────────────────────────────── */}
          {phase === "starting" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {startingLongWait ? "Dauert etwas länger – bitte nicht erneut klicken." : "Recherche wird vorbereitet…"}
              </p>
              {startingTimeout && !startingLongWait && (
                <p className="text-xs text-slate-500">Wir prüfen Ihre Einstellungen und bauen den Suchplan…</p>
              )}
              {startingLongWait && (
                <Button variant="outline" size="sm" onClick={() => { stopPolling(); onClose?.(); navigate('/dashboard'); }} className="text-xs mt-1">
                  Im Dashboard prüfen
                </Button>
              )}
            </div>
          )}

          {/* ── RUNNING ───────────────────────────────────────────────── */}
          {phase === "running" && (
            <div className="space-y-4">
              {/* Stepper */}
              <ResearchStepper activeStepId={activeStepId} />

              {/* Progressbar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-500 truncate max-w-[75%]">
                    {currentStep || "Firmenprofile werden durchsucht…"}
                  </p>
                  <span className="text-xs font-bold text-slate-700 shrink-0">{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(5, progressPercent)}%` }}
                  />
                </div>
              </div>

              {/* Statistiken */}
              <RunStats data={lastPollData} leadsSaved={leadsSaved} />

              {quotaHint && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Nur noch <strong>{quotaHint.remaining} Lead{quotaHint.remaining !== 1 ? 's' : ''}</strong> verfügbar – Recherche wurde angepasst.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 bg-white text-slate-700 text-sm">
                  Schließen
                </Button>
                <Button onClick={() => { handleClose(); navigate('/leads'); }} className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm">
                  Zur Leadliste <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-slate-400 text-center">Recherche läuft weiter, auch wenn der Dialog geschlossen wird.</p>
            </div>
          )}

          {/* ── BACKGROUND ────────────────────────────────────────────── */}
          {phase === "background" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-800">Recherche läuft im Hintergrund</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {leadsSaved > 0
                      ? `${leadsSaved} Kontakte bereits gespeichert. Neue Leads erscheinen automatisch in Ihrer Liste.`
                      : "Neue Leads erscheinen automatisch in Ihrer Leadliste."}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">Der Fortschritt bleibt im Banner sichtbar.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 text-slate-700">
                  Dialog schließen
                </Button>
                <Button onClick={() => { handleClose(); navigate('/leads'); }} className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                  Zur Leadliste <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ── DONE ──────────────────────────────────────────────────── */}
          {phase === "done" && (
            <div className="space-y-4">
              {/* completed */}
              {(doneStatus === 'completed' || doneStatus === null) && (
                <div className="flex flex-col items-center gap-3 py-3 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">Recherche abgeschlossen</p>
                    {leadsSaved > 0 ? (
                      <p className="text-sm text-slate-600 mt-1">{leadsSaved} neue Leads gespeichert.</p>
                    ) : (
                      <p className="text-sm text-slate-500 mt-1">Keine neuen Firmen gefunden. Bitte Radius oder Zielkunden anpassen.</p>
                    )}
                  </div>
                </div>
              )}

              {/* partial */}
              {doneStatus === 'partial' && (
                <div className="flex flex-col items-center gap-3 py-3 text-center">
                  <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900">Teilweise abgeschlossen</p>
                    <p className="text-sm text-slate-600 mt-1">
                      {leadsSaved > 0 ? `${leadsSaved} Leads gefunden.` : ""} Die Recherche wurde wegen Laufzeit oder Limit teilweise beendet.
                    </p>
                  </div>
                </div>
              )}

              {/* failed */}
              {doneStatus === 'failed' && (
                <div className="flex flex-col items-center gap-3 py-3 text-center">
                  <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900">Recherche konnte nicht abgeschlossen werden</p>
                    {leadsSaved > 0 && (
                      <p className="text-sm text-amber-700 mt-1 font-medium">Es wurden trotzdem {leadsSaved} Leads gespeichert.</p>
                    )}
                    <p className="text-sm text-slate-500 mt-1">Bitte versuchen Sie es erneut oder prüfen Sie Ihre Einstellungen.</p>
                  </div>
                </div>
              )}

              {/* Statistiken auch in done */}
              {lastPollData && <RunStats data={lastPollData} leadsSaved={leadsSaved} />}

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 text-slate-700">
                  Schließen
                </Button>
                {(doneStatus !== 'failed' || leadsSaved > 0) && (
                  <Button onClick={() => { handleClose(); navigate('/leads'); }} className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                    Zur Leadliste <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
                {doneStatus === 'failed' && leadsSaved === 0 && (
                  <Button onClick={() => setPhase("idle")} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                    Erneut versuchen
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── ERROR ─────────────────────────────────────────────────── */}
          {phase === "error" && (
            <div className="space-y-4">
              {errorInfo?.type === 'quota' && (
                <>
                  <div className="flex flex-col items-center gap-3 py-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-900">{errorInfo.title}</p>
                      <p className="text-sm text-slate-600 mt-1">{errorInfo.message}</p>
                      {errorInfo.resetDate && (
                        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 mt-2">
                          Kontingent wird am <strong>{errorInfo.resetDate}</strong> zurückgesetzt.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 text-slate-700">Bestehende Leads</Button>
                    <Button onClick={() => { handleClose(); navigate('/settings?tab=billing'); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">Plan ansehen</Button>
                  </div>
                </>
              )}
              {errorInfo?.type === 'already_active' && (
                <>
                  <div className="flex flex-col items-center gap-3 py-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-900">{errorInfo.title}</p>
                      <p className="text-sm text-slate-600 mt-1">{errorInfo.message}</p>
                    </div>
                  </div>
                  <Button onClick={handleClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white">Verstanden</Button>
                </>
              )}
              {(errorInfo?.type === 'ratelimit' || errorInfo?.type === 'maintenance') && (
                <>
                  <div className="flex flex-col items-center gap-3 py-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-900">{errorInfo.title}</p>
                      <p className="text-sm text-slate-600 mt-1">{errorInfo.message}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 text-slate-700">Schließen</Button>
                    <Button onClick={() => setPhase("idle")} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">Später erneut</Button>
                  </div>
                </>
              )}
              {(!errorInfo?.type || (errorInfo?.type !== 'quota' && errorInfo?.type !== 'already_active' && errorInfo?.type !== 'ratelimit' && errorInfo?.type !== 'maintenance')) && (
                <>
                  <div className="flex flex-col items-center gap-3 py-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-red-500" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-900">{errorInfo?.title || 'Fehler'}</p>
                      <p className="text-sm text-slate-600 mt-1">{errorInfo?.message || 'Bitte versuchen Sie es erneut.'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleClose} className="flex-1 border-slate-200 text-slate-700">Schließen</Button>
                    <Button onClick={() => setPhase("idle")} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">Erneut versuchen</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}