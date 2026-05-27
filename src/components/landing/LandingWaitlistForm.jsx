import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function LandingWaitlistForm() {
  const [form, setForm] = useState({ name: "", email: "", company_name: "", phone: "", industry: "", message: "", consent_accepted: false, website_hidden: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setUtmSource(p.get("utm_source") || "");
    setUtmCampaign(p.get("utm_campaign") || "");
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim()) { setError("Bitte geben Sie Ihre E-Mail-Adresse ein."); return; }
    if (!form.consent_accepted) { setError("Bitte akzeptieren Sie die Einwilligung, um fortzufahren."); return; }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitWaitlistLead", { ...form, source_page: "/landing", utm_source: utmSource, utm_campaign: utmCampaign });
      if (res?.data?.success) { setSubmitted(true); }
      else { setError(res?.data?.error || "Ein Fehler ist aufgetreten. Bitte erneut versuchen."); }
    } catch { setError("Verbindungsfehler. Bitte erneut versuchen."); }
    finally { setSubmitting(false); }
  };

  const inputStyle = {
    width: "100%", padding: "11px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
    color: "white", fontSize: 14, fontFamily: "inherit", outline: "none",
    transition: "border-color 0.2s",
  };

  return (
    <section id="waitlist-form" style={{ padding: "96px 24px", background: "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(37,99,235,0.18), rgba(124,58,237,0.1), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80", fontSize: 12, fontWeight: 700, marginBottom: 20, letterSpacing: 0.5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80", display: "inline-block" }} />
            Limitierte Early-Access-Plätze verfügbar
          </div>
          <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, color: "white", lineHeight: 1.15, marginBottom: 14, letterSpacing: -1 }}>
            Frühen Zugang sichern
          </h2>
          <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>
            Tragen Sie sich jetzt ein. Wir melden uns persönlich bei Ihnen – bevor Vertriebo öffentlich verfügbar wird.
          </p>
        </div>

        {/* Perks */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 28 }}>
          {[
            { icon: "🚀", text: "Erster Zugang vor dem offiziellen Launch" },
            { icon: "💰", text: "Frühbucherkonditionen sichern" },
            { icon: "🤝", text: "Persönliches Onboarding durch unser Team" },
            { icon: "🎁", text: "Kostenloser Setup & Konfiguration" },
          ].map(p => (
            <div key={p.icon} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
              <span style={{ fontSize: 16 }}>{p.icon}</span>
              <span style={{ fontSize: 12, color: "rgba(203,213,225,1)", fontWeight: 500 }}>{p.text}</span>
            </div>
          ))}
        </div>

        {submitted ? (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, padding: 48, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>🎉</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: "white", marginBottom: 12 }}>Sie sind dabei!</h3>
            <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>
              Wir haben Ihre Anfrage erhalten. Unser Team meldet sich persönlich bei Ihnen, sobald Vertriebo für neue Kunden öffnet. Sie sind einer der Ersten!
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 }}>
              <CheckCircle2 size={14} color="#4ade80" />
              <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Bestätigung wurde an Ihre E-Mail gesendet</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Honeypot */}
            <input type="text" name="website_hidden" value={form.website_hidden} onChange={e => set("website_hidden", e.target.value)} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</label>
                <input type="text" placeholder="Max Mustermann" value={form.name} onChange={e => set("name", e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>E-Mail <span style={{ color: "#f87171" }}>*</span></label>
                <input type="email" placeholder="max@firma.de" value={form.email} onChange={e => set("email", e.target.value)} required style={inputStyle} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Firma</label>
                <input type="text" placeholder="Muster GmbH" value={form.company_name} onChange={e => set("company_name", e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Telefon <span style={{ color: "rgba(71,85,105,1)", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                <input type="tel" placeholder="+49 123 456 789" value={form.phone} onChange={e => set("phone", e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Ihre Branche</label>
              <input type="text" placeholder="z.B. Gebäudereinigung, IT-Service, Handwerk…" value={form.industry} onChange={e => set("industry", e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Was ist Ihr größtes Vertriebsproblem? <span style={{ color: "rgba(71,85,105,1)", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
              <textarea
                placeholder="z.B. Ich finde keine neuen Firmenkunden. Rückrufe werden vergessen. Ich weiß nicht, welche Leads Priorität haben…"
                value={form.message}
                onChange={e => set("message", e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
                onFocus={e => e.target.style.borderColor = "rgba(37,99,235,0.5)"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
              />
            </div>

            {/* Consent */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={form.consent_accepted} onChange={e => set("consent_accepted", e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: "#2563eb" }} />
              <span style={{ fontSize: 12, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>
                Ich bin damit einverstanden, dass Vertriebo mich bezüglich Early Access und Produktinformationen kontaktiert. Eine Abmeldung ist jederzeit möglich.{" "}
                <a href="/datenschutz" style={{ color: "#60a5fa", textDecoration: "none" }}>Datenschutzhinweise</a>
              </span>
            </label>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#fca5a5" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                background: submitting ? "rgba(37,99,235,0.5)" : "linear-gradient(135deg,#2563eb,#7c3aed)",
                color: "white", fontWeight: 800, fontSize: 15,
                padding: "15px 24px", borderRadius: 12, border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                boxShadow: submitting ? "none" : "0 0 30px rgba(37,99,235,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                transition: "all 0.2s",
              }}
            >
              {submitting ? (
                <><span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Wird gespeichert…</>
              ) : (
                <>Frühen Zugang sichern <ArrowRight size={16} /></>
              )}
            </button>

            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(71,85,105,1)" }}>
              🔒 Kein Spam · Keine Weitergabe an Dritte · Jederzeit abmeldbar
            </p>
          </form>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}