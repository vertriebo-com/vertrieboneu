import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowRight, CheckCircle2, TrendingUp, Users, Zap, Target, Globe, Shield } from "lucide-react";

const ROLES = ["Investor", "Business Angel", "Strategischer Partner", "Presse", "Sonstiges"];

const Section = ({ label, children }) => (
  <div style={{ marginBottom: 48 }}>
    <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>{label}</p>
    {children}
  </div>
);

export default function Investors() {
  const [form, setForm] = useState({ name: "", email: "", company_name: "", role: "Investor", message: "", consent_accepted: false, website_hidden: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) { setError("Bitte Name und E-Mail angeben."); return; }
    if (!form.consent_accepted) { setError("Bitte akzeptieren Sie die Datenschutzeinwilligung."); return; }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitInvestorInquiry", { ...form, source_page: "/investors" });
      if (res?.data?.success) { setSubmitted(true); }
      else { setError(res?.data?.error || "Fehler beim Absenden."); }
    } catch { setError("Verbindungsfehler. Bitte erneut versuchen."); }
    finally { setSubmitting(false); }
  };

  const inp = {
    width: "100%", padding: "11px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
    color: "white", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  const labelStyle = { display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 };

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white", overflowX: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::placeholder { color: rgba(100,116,139,0.7) !important; }
        @keyframes shimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: "rgba(2,6,23,0.95)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.07)", height: 58 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 140, width: "auto", objectFit: "contain" }} />
          </a>
          <a href="/#waitlist-form" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }}>
            Early Access →
          </a>
        </div>
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "100px 20px 80px" }}>

        {/* HERO */}
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#93c5fd", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
            Investor Relations
          </div>
          <h1 style={{ fontSize: "clamp(28px,4.5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1.5, marginBottom: 18 }}>
            Vertriebo baut das Vertriebssystem<br />
            <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "shimmer 5s linear infinite" }}>
              für moderne Dienstleister.
            </span>
          </h1>
          <p style={{ fontSize: "clamp(14px,1.8vw,17px)", color: "rgba(148,163,184,1)", lineHeight: 1.75, maxWidth: 640, margin: "0 auto" }}>
            Wir entwickeln eine skalierbare SaaS-Plattform, die Firmenrecherche, CRM, Vertriebssteuerung und Automatisierung in einem System verbindet.
          </p>
        </div>

        {/* DISCLAIMER */}
        <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 56, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Shield size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 12, color: "rgba(203,213,225,0.8)", lineHeight: 1.65 }}>
            Diese Seite dient der allgemeinen Information über Vertriebo. Sie stellt kein Angebot, keine Aufforderung zur Kapitalanlage und keine Renditeversprechen dar. Alle Angaben sind ohne Gewähr und spiegeln den aktuellen Entwicklungsstand wider.
          </p>
        </div>

        {/* SECTIONS */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "40px 36px", marginBottom: 48 }}>

          <Section label="Warum Vertriebo?">
            <p style={{ fontSize: 15, color: "rgba(203,213,225,1)", lineHeight: 1.8 }}>
              B2B-Vertrieb für lokale Dienstleister ist heute geprägt von Excel-Listen, manueller Google-Suche und verlorenen Rückrufen. Professionelle CRM-Systeme sind zu komplex, zu teuer und nicht auf dieses Segment zugeschnitten. Vertriebo schließt diese Lücke: fokussiert, erschwinglich, sofort einsatzbereit.
            </p>
          </Section>

          <Section label="Welches Problem lösen wir?">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              {[
                { icon: "🔍", title: "Kein System zur Neukundengewinnung", desc: "Dienstleister suchen manuell und unsystematisch nach Firmenkunden." },
                { icon: "📋", title: "Leads gehen verloren", desc: "Rückrufe werden vergessen, Follow-ups bleiben aus – kein strukturierter Prozess." },
                { icon: "🧠", title: "Kein Prioritätssystem", desc: "Niemand weiß, wen er heute anrufen soll und warum." },
                { icon: "⏱️", title: "Zeitverschwendung", desc: "Stunden pro Woche gehen für manuelle Recherchearbeit verloren." },
              ].map(p => (
                <div key={p.title} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{p.icon}</div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 6 }}>{p.title}</p>
                  <p style={{ fontSize: 12, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section label="Marktpotenzial">
            <p style={{ fontSize: 15, color: "rgba(203,213,225,1)", lineHeight: 1.8, marginBottom: 16 }}>
              In Deutschland gibt es über 3,5 Millionen kleine und mittelständische Dienstleistungsunternehmen – von Gebäudereinigung über IT-Service bis Handwerk. Der überwiegende Teil betreibt aktiven Außenvertrieb ohne professionelle Werkzeuge. Vertriebo adressiert diesen bislang weitgehend unerschlossenen Markt mit einem spezifisch zugeschnittenen Produkt.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              {[
                { v: "3,5 Mio+", l: "Zielunternehmen DE", c: "#60a5fa" },
                { v: "€99–349", l: "Monatlicher ACV", c: "#a78bfa" },
                { v: "SaaS", l: "Skalierbares Modell", c: "#4ade80" },
              ].map(s => (
                <div key={s.l} style={{ textAlign: "center", padding: "16px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize: "clamp(18px,2vw,26px)", fontWeight: 900, color: s.c, marginBottom: 4 }}>{s.v}</p>
                  <p style={{ fontSize: 11, color: "rgba(148,163,184,1)", fontWeight: 600 }}>{s.l}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section label="Produktstand">
            <p style={{ fontSize: 15, color: "rgba(203,213,225,1)", lineHeight: 1.8, marginBottom: 16 }}>
              Vertriebo befindet sich in der Early-Access-Phase. Das Kernprodukt ist funktionsfähig und wird aktiv weiterentwickelt. Folgende Module sind produktiv:
            </p>
            {[
              "Automatische Firmenrecherche im definierten Suchgebiet",
              "KI-gestütztes Lead-Scoring (Score 0–100)",
              "CRM mit Kontakthistorie, Notizen und Aufgaben",
              "Priorisierte Tagesliste mit Follow-up-Erinnerungen",
              "E-Mail-Vorlagen und manueller Versand",
              "Pipeline-Übersicht und Vertriebscontrolling",
              "Subscription-Billing via Stripe",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                <CheckCircle2 size={15} color="#4ade80" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 14, color: "rgba(203,213,225,1)" }}>{f}</span>
              </div>
            ))}
          </Section>

          <Section label="Für wen ist Vertriebo?">
            <p style={{ fontSize: 15, color: "rgba(203,213,225,1)", lineHeight: 1.8 }}>
              Lokale B2B-Dienstleister mit 1–50 Mitarbeitern, die aktiv neue Firmenkunden akquirieren: Gebäudereinigung, Facility Management, IT-Service, Handwerk, Sicherheitsdienste, Gartenbau, Catering, Zeitarbeit und viele weitere Branchen. Vertriebo ist bewusst nicht für Enterprise-Kunden gebaut – sondern für den Mittelstand, der bisher unterversorgt ist.
            </p>
          </Section>

          <Section label="Warum jetzt?">
            <p style={{ fontSize: 15, color: "rgba(203,213,225,1)", lineHeight: 1.8 }}>
              KI-gestützte Recherche und Priorisierung sind jetzt erstmals zu Preisen möglich, die für kleine Betriebe erschwinglich sind. Der Markt ist noch nicht konsolidiert, kein etablierter Player hat dieses Segment systematisch adressiert. Vertriebo hat die Möglichkeit, früh Marktführerschaft in einer klar definierten Nische zu erreichen.
            </p>
          </Section>

        </div>

        {/* CONTACT FORM */}
        <div id="investor-contact" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "40px 36px" }}>
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Kontakt für Investoren</p>
            <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, lineHeight: 1.2, marginBottom: 10 }}>Interesse? Sprechen wir.</h2>
            <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>
              Wenn Sie mehr über Vertriebo erfahren möchten, senden Sie uns eine Nachricht. Wir antworten persönlich innerhalb weniger Werktage.
            </p>
          </div>

          {submitted ? (
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 16, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>✅</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 8 }}>Vielen Dank für Ihre Nachricht.</h3>
              <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>Wir melden uns persönlich bei Ihnen – in der Regel innerhalb von 2–3 Werktagen.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="text" name="website_hidden" value={form.website_hidden} onChange={e => set("website_hidden", e.target.value)} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Name <span style={{ color: "#f87171" }}>*</span></label>
                  <input type="text" placeholder="Vorname Nachname" value={form.name} onChange={e => set("name", e.target.value)} style={inp} required />
                </div>
                <div>
                  <label style={labelStyle}>E-Mail <span style={{ color: "#f87171" }}>*</span></label>
                  <input type="email" placeholder="name@fonds.de" value={form.email} onChange={e => set("email", e.target.value)} style={inp} required />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Unternehmen / Fonds <span style={{ color: "rgba(100,116,139,1)", fontWeight: 400 }}>(optional)</span></label>
                  <input type="text" placeholder="z.B. Musterfonds GmbH" value={form.company_name} onChange={e => set("company_name", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={labelStyle}>Rolle</label>
                  <select value={form.role} onChange={e => set("role", e.target.value)} style={{ ...inp, appearance: "none" }}>
                    {ROLES.map(r => <option key={r} value={r} style={{ background: "#0f172a" }}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Nachricht</label>
                <textarea placeholder="Womit können wir Ihnen weiterhelfen? Was interessiert Sie an Vertriebo?" value={form.message} onChange={e => set("message", e.target.value)} rows={4} style={{ ...inp, resize: "vertical" }} />
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.consent_accepted} onChange={e => set("consent_accepted", e.target.checked)} style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, accentColor: "#2563eb" }} />
                <span style={{ fontSize: 11, color: "rgba(148,163,184,1)", lineHeight: 1.65 }}>
                  Ich bin damit einverstanden, dass Vertriebo meine Angaben zur Beantwortung meiner Anfrage verwendet.{" "}
                  <a href="/datenschutz" style={{ color: "#60a5fa", textDecoration: "none" }}>Datenschutzerklärung</a>
                </span>
              </label>

              {error && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#fca5a5" }}>{error}</div>
              )}

              <button type="submit" disabled={submitting} style={{ background: submitting ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 14, padding: "14px 20px", borderRadius: 11, border: "none", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {submitting ? (
                  <><span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Wird gesendet…</>
                ) : (
                  <>Anfrage senden <ArrowRight size={15} /></>
                )}
              </button>
              <p style={{ textAlign: "center", fontSize: 11, color: "rgba(71,85,105,1)" }}>🔒 Vertraulich · Keine Weitergabe an Dritte</p>
            </form>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "32px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20, marginBottom: 10 }}>
          {[["Impressum", "/impressum"], ["Datenschutz", "/datenschutz"], ["AGB", "/agb"], ["Landing", "/"], ["Investor Relations", "/investors"]].map(([label, href]) => (
            <a key={label} href={href} style={{ color: "rgba(71,85,105,1)", fontSize: 12, textDecoration: "none" }}>{label}</a>
          ))}
        </div>
        <p style={{ color: "rgba(51,65,85,1)", fontSize: 11 }}>© 2026 Vertriebo · Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
      </footer>
    </div>
  );
}