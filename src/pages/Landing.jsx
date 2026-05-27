import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Zap, Shield, Brain, Target, Users, ArrowRight, ChevronDown } from "lucide-react";

const FEATURES = [
  { icon: "🔍", title: "Automatische Firmenrecherche", desc: "Vertriebo findet passende B2B-Kontakte in Ihrem Suchgebiet – vollautomatisch, täglich aktuell." },
  { icon: "🔥", title: "KI-Priorisierung", desc: "Heiße Leads werden sofort erkannt und nach oben sortiert, damit Sie immer beim richtigen Kontakt landen." },
  { icon: "📋", title: "Integriertes CRM", desc: "Kontakthistorie, Aufgaben, E-Mails und Follow-ups – alles an einem Ort, ohne komplizierte Einrichtung." },
  { icon: "📧", title: "E-Mail & Follow-up", desc: "Vorgefertigte Vorlagen, automatische Erinnerungen und Nachfass-Workflows für Ihren Vertriebsalltag." },
];

const BENEFITS = [
  { label: "Kein kompliziertes CRM", sub: "Sofort loslegen, keine lange Einrichtung" },
  { label: "40+ Branchen unterstützt", sub: "Von Gebäudereinigung bis IT-Service" },
  { label: "DSGVO-orientiert", sub: "Datenschutz made in Germany" },
  { label: "Monatlich kündbar", sub: "Keine langfristigen Verträge" },
];

const INDUSTRIES = ["Gebäudereinigung", "IT-Service", "Handwerk", "Facility Service", "Logistik & Spedition", "Catering", "Sicherheitsdienst", "Gartenbau", "Pflege & Gesundheit", "Maler & Renovierung", "Elektro", "SHK / Heizung"];

export default function Landing() {
  const [form, setForm] = useState({ name: "", email: "", company_name: "", phone: "", industry: "", message: "", consent_accepted: false, website_hidden: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [openFaq, setOpenFaq] = useState(null);

  // UTM-Parameter aus URL lesen
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setUtmSource(p.get("utm_source") || "");
    setUtmCampaign(p.get("utm_campaign") || "");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim()) { setError("Bitte geben Sie Ihre E-Mail-Adresse ein."); return; }
    if (!form.consent_accepted) { setError("Bitte akzeptieren Sie die Einwilligung."); return; }

    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitWaitlistLead", {
        ...form,
        source_page: "/landing",
        utm_source: utmSource,
        utm_campaign: utmCampaign,
      });
      if (res?.data?.success) {
        setSubmitted(true);
      } else {
        setError(res?.data?.error || "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
      }
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToForm = () => document.getElementById("waitlist-form")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white", overflowX: "hidden" }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.6s ease forwards; }
        .fade-up-2 { animation: fadeUp 0.6s 0.15s ease both; }
        .fade-up-3 { animation: fadeUp 0.6s 0.3s ease both; }
        * { box-sizing: border-box; }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, background: "rgba(2,6,23,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.07)", height: 60 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 180, width: "auto", objectFit: "contain" }} />
          <button
            onClick={scrollToForm}
            style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 14, padding: "9px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            Frühen Zugang sichern
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 80, padding: "120px 24px 80px", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37,99,235,0.18), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 780, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          {/* Coming Soon Badge */}
          <div className="fade-up" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 18px", borderRadius: 999, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.35)", color: "#93c5fd", fontSize: 13, fontWeight: 600, marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3b82f6", display: "inline-block", animation: "shimmer 2s linear infinite" }} />
            Demnächst verfügbar – Jetzt Early Access sichern
          </div>

          {/* Headline */}
          <h1 className="fade-up-2" style={{ fontSize: "clamp(36px,6vw,68px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -2, marginBottom: 20 }}>
            Vertriebo findet Firmen.{" "}
            <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa,#60a5fa)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "shimmer 4s linear infinite" }}>
              Ihr gewinnt Kunden.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="fade-up-3" style={{ fontSize: "clamp(16px,2.5vw,20px)", color: "rgba(148,163,184,1)", lineHeight: 1.7, marginBottom: 40, maxWidth: 620, margin: "0 auto 40px" }}>
            Das moderne Vertriebssystem für Dienstleister und B2B-Unternehmen. Automatische Recherche, KI-Priorisierung und CRM in einem.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginBottom: 48 }}>
            <button
              onClick={scrollToForm}
              style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 16, padding: "16px 32px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 40px rgba(37,99,235,0.45)", display: "inline-flex", alignItems: "center", gap: 10 }}
            >
              Frühen Zugang sichern <ArrowRight size={18} />
            </button>
            <button
              onClick={() => document.getElementById("was-ist")?.scrollIntoView({ behavior: "smooth" })}
              style={{ color: "rgba(148,163,184,1)", fontWeight: 600, fontSize: 15, padding: "16px 24px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Mehr erfahren ↓
            </button>
          </div>

          {/* Trust chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {BENEFITS.map(b => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <CheckCircle2 size={12} color="#4ade80" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(203,213,225,1)" }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WAS IST VERTRIEBO? */}
      <section id="was-ist" style={{ padding: "80px 24px", background: "#080e1e", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Was ist Vertriebo?</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, lineHeight: 1.2, marginBottom: 16 }}>Kein klassisches CRM. Ein aktives Vertriebssystem.</h2>
            <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", lineHeight: 1.7, maxWidth: 680, margin: "0 auto" }}>
              Vertriebo ist das erste System, das nicht nur Ihre Kontakte verwaltet – sondern Ihnen täglich neue, passende Firmenkontakte findet, bewertet und priorisiert. So wissen Sie immer, wen Sie als Nächstes anrufen sollten.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
            {[
              { icon: "🎯", title: "Findet Ihre Zielkunden", desc: "Basierend auf Branche, Region und Kundenprofil." },
              { icon: "⚡", title: "Priorisiert automatisch", desc: "KI erkennt heiße Leads – Sie verschwenden keine Zeit." },
              { icon: "📞", title: "Strukturiert Ihren Alltag", desc: "Rückrufe, Termine, E-Mails – alles geordnet." },
              { icon: "📈", title: "Lernt mit", desc: "Je mehr Sie nutzen, desto besser werden die Ergebnisse." },
            ].map(item => (
              <div key={item.title} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 8 }}>{item.title}</h3>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FÜR WEN? */}
      <section style={{ padding: "80px 24px", background: "#020617" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Für wen ist Vertriebo?</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, lineHeight: 1.2, marginBottom: 16 }}>Gemacht für lokale B2B-Dienstleister</h2>
            <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", lineHeight: 1.7, maxWidth: 620, margin: "0 auto" }}>
              Egal ob Sie eine Gebäudereinigung, einen IT-Service oder einen Handwerksbetrieb führen – wenn Sie aktiv neue Firmenkunden gewinnen möchten, ist Vertriebo für Sie.
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {INDUSTRIES.map(ind => (
              <span key={ind} style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 999, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", color: "rgba(147,197,253,1)" }}>
                {ind}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* WAS MACHT VERTRIEBO? */}
      <section style={{ padding: "80px 24px", background: "#080e1e", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Was macht Vertriebo?</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, lineHeight: 1.2 }}>Alles was Sie für aktiven B2B-Vertrieb brauchen</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WARUM BESSER ALS CRM? */}
      <section style={{ padding: "80px 24px", background: "#020617" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Warum besser als klassische CRM-Systeme?</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, lineHeight: 1.2, marginBottom: 16 }}>CRM verwaltet. Vertriebo macht Vertrieb.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20 }}>
            {[
              { vs: "Klassisches CRM", icon: "❌", points: ["Manuell gepflegte Kontaktlisten", "Kein aktives Lead-Finding", "Komplizierte Einrichtung", "Kein KI-Scoring", "Teuer und überladen"] },
              { vs: "Vertriebo", icon: "✅", points: ["Automatische Firmenrecherche", "KI findet & priorisiert Leads", "In 5 Minuten startklar", "Eingebettetes Lead-Scoring", "Fokussiert auf das Wesentliche"], highlight: true },
            ].map(col => (
              <div key={col.vs} style={{ background: col.highlight ? "linear-gradient(135deg,rgba(37,99,235,0.12),rgba(124,58,237,0.08))" : "rgba(255,255,255,0.02)", border: `1px solid ${col.highlight ? "rgba(37,99,235,0.35)" : "rgba(255,255,255,0.08)"}`, borderRadius: 20, padding: 28 }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>{col.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: col.highlight ? "#93c5fd" : "rgba(148,163,184,1)", marginBottom: 16 }}>{col.vs}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.points.map(p => (
                    <div key={p} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: col.highlight ? "rgba(191,219,254,1)" : "rgba(100,116,139,1)" }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}>{col.highlight ? "✓" : "–"}</span>
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WARTELISTE / EARLY ACCESS FORMULAR */}
      <section id="waitlist-form" style={{ padding: "80px 24px", background: "radial-gradient(ellipse 80% 60% at 50% 100%,rgba(37,99,235,0.15),rgba(124,58,237,0.08),#020617)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 580, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Early Access / Warteliste</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,38px)", fontWeight: 900, lineHeight: 1.2, marginBottom: 12 }}>Frühen Zugang sichern</h2>
            <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>
              Tragen Sie sich jetzt ein und seien Sie dabei, wenn Vertriebo offiziell für neue Kunden öffnet. Wir melden uns persönlich bei Ihnen.
            </p>
          </div>

          {submitted ? (
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "white", marginBottom: 12 }}>Danke für Ihre Anmeldung!</h3>
              <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>
                Wir melden uns, sobald Vertriebo für neue Kunden geöffnet wird. Sie erhalten als einer der Ersten Zugang.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Honeypot */}
              <input type="text" name="website_hidden" value={form.website_hidden} onChange={e => setForm(f => ({ ...f, website_hidden: e.target.value }))} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6 }}>Name</label>
                  <input
                    type="text"
                    placeholder="Max Mustermann"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6 }}>E-Mail <span style={{ color: "#f87171" }}>*</span></label>
                  <input
                    type="email"
                    placeholder="max@firma.de"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    required
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6 }}>Firma</label>
                  <input
                    type="text"
                    placeholder="Muster GmbH"
                    value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6 }}>Telefon <span style={{ color: "rgba(100,116,139,1)", fontWeight: 400 }}>(optional)</span></label>
                  <input
                    type="tel"
                    placeholder="+49 123 456 789"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6 }}>Branche <span style={{ color: "rgba(100,116,139,1)", fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="text"
                  placeholder="z.B. Gebäudereinigung, IT-Service, Handwerk…"
                  value={form.industry}
                  onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6 }}>Nachricht <span style={{ color: "rgba(100,116,139,1)", fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  placeholder="Was interessiert Sie an Vertriebo? Was ist Ihr größtes Vertriebsproblem?"
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  rows={3}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical" }}
                />
              </div>

              {/* Consent */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.consent_accepted}
                  onChange={e => setForm(f => ({ ...f, consent_accepted: e.target.checked }))}
                  style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: "#2563eb" }}
                />
                <span style={{ fontSize: 12, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>
                  Ich bin damit einverstanden, dass Vertriebo mich bezüglich Early Access und Produktinformationen kontaktiert. Eine Abmeldung ist jederzeit möglich. <a href="/datenschutz" style={{ color: "#60a5fa", textDecoration: "none" }}>Datenschutz</a>
                </span>
              </label>

              {error && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#fca5a5" }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 24px", borderRadius: 12, border: "none", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: submitting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {submitting ? "Wird gespeichert…" : (<>Frühen Zugang sichern <ArrowRight size={16} /></>)}
              </button>

              <p style={{ textAlign: "center", fontSize: 11, color: "rgba(100,116,139,1)" }}>
                Kein Spam. Keine Weitergabe an Dritte. Jederzeit abmeldbar.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "40px 24px", textAlign: "center" }}>
        <p style={{ color: "rgba(71,85,105,1)", fontSize: 13, marginBottom: 12 }}>© 2026 Vertriebo</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20, marginBottom: 12 }}>
          <a href="/impressum" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Impressum</a>
          <a href="/datenschutz" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Datenschutz</a>
          <a href="/agb" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>AGB</a>
          <a href="/start" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Preise & Pläne</a>
        </div>
        <p style={{ color: "rgba(51,65,85,1)", fontSize: 12 }}>Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
      </footer>
    </div>
  );
}