/**
 * FeedbackWidget – Pilot-Feedback Floating Button
 * Nur für eingeloggte Nutzer. Speichert in SupportNote Entity.
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X, Send, Loader2, CheckCircle2 } from "lucide-react";
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

export default function FeedbackWidget({ user }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Nur für eingeloggte Nutzer rendern
  if (!user) return null;

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      await base44.entities.SupportNote.create({
        // SupportNote fields
        subject: `[Pilot-Feedback] [${category}] ${message.slice(0, 60)}`,
        content: message,
        note_type: "feedback",
        priority: severity,
        status: "open",
        // Kontext-Felder
        author_email: user.email,
        metadata: JSON.stringify({
          category,
          severity,
          page_url: window.location.href,
          browser_info: navigator.userAgent.slice(0, 200),
          submitted_at: new Date().toISOString(),
          user_email: user.email,
        }),
      });
      setDone(true);
      setMessage("");
      setTimeout(() => {
        setDone(false);
        setOpen(false);
      }, 2000);
    } catch (e) {
      // Fallback: wenn SupportNote fehl schlägt, nichts tun (kein kritischer Fehler)
      console.error("[FeedbackWidget] Submit error:", e);
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

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white h-9"
                size="sm"
              >
                {submitting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wird gesendet…</>
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