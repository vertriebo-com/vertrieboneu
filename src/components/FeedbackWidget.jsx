/**
 * FeedbackWidget – Pilot-Feedback Floating Button
 * Nur für eingeloggte Nutzer. Speichert in SupportNote Entity.
 *
 * Wichtig: SupportNote verlangt aktuell exakt diese Pflichtfelder:
 * - organization_id
 * - created_by
 * - note
 * Optional: severity = info | warning | critical
 */
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X, Send, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  { value: "bug", label: "🐛 Bug" },
  { value: "question", label: "❓ Frage" },
  { value: "idea", label: "💡 Idee" },
  { value: "data_issue", label: "📊 Datenproblem" },
  { value: "other", label: "💬 Sonstiges" },
];

const SEVERITIES = [
  { value: "low", label: "Niedrig" },
  { value: "medium", label: "Mittel" },
  { value: "high", label: "Hoch" },
];

const SUPPORT_NOTE_SEVERITY = {
  low: "info",
  medium: "warning",
  high: "critical",
};

function buildFeedbackNote({ category, severity, message, user, orgId }) {
  const payload = {
    type: "pilot_feedback",
    category,
    severity,
    page_url: typeof window !== "undefined" ? window.location.href : null,
    browser_info: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    submitted_at: new Date().toISOString(),
    user_email: user?.email || null,
    organization_id: orgId || null,
    message,
  };

  return [
    `[Pilot-Feedback] ${category} / ${severity}`,
    "",
    message,
    "",
    "--- Kontext ---",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

export default function FeedbackWidget({ user }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [orgLoading, setOrgLoading] = useState(false);

  useEffect(() => {
    if (!user?.email) return;

    let cancelled = false;

    async function resolveOrg() {
      setOrgLoading(true);
      setError(null);
      try {
        const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
        if (!cancelled && ownerOrgs?.[0]?.id) {
          setOrgId(ownerOrgs[0].id);
          return;
        }

        const memberships = await base44.entities.OrganizationMember.filter({
          user_email: user.email,
          status: "active",
        });
        if (!cancelled && memberships?.[0]?.organization_id) {
          setOrgId(memberships[0].organization_id);
          return;
        }

        if (!cancelled) {
          setOrgId(null);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[FeedbackWidget] Org resolve error:", e);
          setError("Organisation konnte nicht geladen werden. Bitte Seite neu laden.");
        }
      } finally {
        if (!cancelled) setOrgLoading(false);
      }
    }

    resolveOrg();

    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  // Nur für eingeloggte Nutzer rendern
  if (!user) return null;

  const handleSubmit = async () => {
    if (!message.trim()) return;
    if (!orgId) {
      setError("Kein Organisationskontext gefunden. Feedback konnte nicht gespeichert werden.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await base44.entities.SupportNote.create({
        organization_id: orgId,
        created_by: user.email,
        note: buildFeedbackNote({ category, severity, message: message.trim(), user, orgId }),
        severity: SUPPORT_NOTE_SEVERITY[severity] || "warning",
      });

      setDone(true);
      setMessage("");
      setTimeout(() => {
        setDone(false);
        setOpen(false);
      }, 2000);
    } catch (e) {
      console.error("[FeedbackWidget] Submit error:", e);
      setError(e?.message || "Feedback konnte nicht gespeichert werden.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3.5 py-2.5 rounded-full shadow-lg transition-all hover:scale-105"
          title="Feedback geben"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {/* Feedback Panel */}
      {open && (
        <div className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-bold text-slate-900">Feedback geben</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              aria-label="Feedback schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-900">Danke für dein Feedback!</p>
              <p className="text-xs text-slate-500">Wir schauen uns das an.</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {/* Kategorie */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Kategorie</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                        category === c.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nachricht */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Nachricht <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Was ist passiert? Was hast du erwartet?"
                  rows={4}
                  className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>

              {/* Dringlichkeit */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Dringlichkeit</label>
                <div className="flex gap-1.5">
                  {SEVERITIES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSeverity(s.value)}
                      className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all ${
                        severity === s.value
                          ? s.value === "high"
                            ? "bg-red-100 text-red-700 border-red-300"
                            : s.value === "medium"
                            ? "bg-amber-100 text-amber-700 border-amber-300"
                            : "bg-slate-100 text-slate-700 border-slate-300"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting || orgLoading}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white h-9"
                size="sm"
              >
                {submitting || orgLoading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {orgLoading ? "Wird vorbereitet…" : "Wird gesendet…"}</>
                ) : (
                  <><Send className="w-3.5 h-3.5" /> Feedback senden</>
                )}
              </Button>

              <p className="text-[10px] text-slate-400 text-center">
                Übermittelt: aktuelle URL + Browser-Infos. Keine sensiblen Daten.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
