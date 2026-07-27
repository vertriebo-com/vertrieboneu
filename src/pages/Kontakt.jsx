import { useState } from "react";
import { ArrowRight, CheckCircle2, Phone, Mail, MapPin, Send } from "lucide-react";
import SEOFooter from "@/components/SEOFooter";
import { base44 } from "@/api/base44Client";

export default function Kontakt() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "", consent: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim()) { setError("Bitte geben Sie Ihre E-Mail ein."); return; }
    if (!form.consent) { setError("Bitte akzeptieren Sie die Einwilligung."); return; }
    setSubmitting(true);
    try {
      await base44.functions.invoke("submitWaitlistLead", {
        name: form.name,
        email: form.email,
        company_name: form.company,
        message: form.message,
        consent_accepted: true,
        source_page: "/kontakt",
      });
      setSubmitted(true);
    } catch {
      setError("Fehler beim Senden. Bitte versuchen Sie es erneut oder schreiben Sie uns direkt.");
    } finally {
      setSubmitting(false);
    }
  };

  const inp = {
    width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box"
  };

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <style>{`
        @media (max-width: 640px) { .kontakt-grid { grid-template-columns: 1fr !important; } }
        ::placeholder { color: rgba(100,116,139,0.7) !important; }
      `}</style>

      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/">
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 120, objectFit: "contain" }} />
        </a>
        <a href="/preise" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>
          Preise ansehen →
        </a>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 20px 0" }}>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
          <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>Vertriebo</a> {" › "}
          <span style={{ color: "rgba(148,163,184,1)" }}>Kontakt</span>
        </p>
      </div>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 40px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
          💬 Persönlicher Kontakt · Antwort in 24h
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 16 }}>
          Sprechen wir{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            miteinander
          </span>
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, maxWidth: 620 }}>
          Sie haben Fragen zu Vertriebo, möchten eine Demo oder benötigen Hilfe beim Setup? Wir melden uns persönlich bei Ihnen — garantiert innerhalb von 24 Stunden.
        </p>
      </section>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 64px" }}>
        <div className="kontakt-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

          {/* KONTAKTDATEN */}
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Direkt erreichen</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { icon: <Phone size={18} color="#60a5fa" />, title: "Telefon", value: "02601 / 9131820", href: "tel:026019131820" },
                { icon: <Mail size={18} color="#a78bfa" />, title: "E-Mail", value: "info@vertriebo.com", href: "mailto:info@vertriebo.com" },
                { icon: <MapPin size={18} color="#34d399" />, title: "Adresse", value: "Mittelweg 24, 56566 Neuwied", href: "https://maps.google.com/?q=Mittelweg+24+56566+Neuwied" },
              ].map((c, i) => (
                <a key={i} href={c.href} target={c.title === "Adresse" ? "_blank" : undefined} rel="noopener noreferrer"
                  style={{ display: "flex", gap: 14, padding: "16px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, alignItems: "flex-start", textDecoration: "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.icon}</div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{c.title}</p>
                    <p style={{ fontSize: 14, color: "#60a5fa" }}>{c.value}</p>
                  </div>
                </a>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: "20px 18px", background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd", marginBottom: 10 }}>Was können wir für Sie tun?</p>
              {["Demo-Termin vereinbaren", "Fragen zum Funktionsumfang", "Preis- & Agentur-Anfragen", "Technischer Support"].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <CheckCircle2 size={12} color="#60a5fa" />
                  <span style={{ fontSize: 13, color: "rgba(203,213,225,1)" }}>{f}</span>
                </div>
              ))}
              <a href="/preise" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", color: "#93c5fd", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>
                Preise & Pläne ansehen <ArrowRight size={13} />
              </a>
            </div>
          </div>

          {/* FORMULAR */}
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Nachricht senden</h2>
            {submitted ? (
              <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 18, padding: 36, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>🎉</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 10 }}>Nachricht erhalten!</h3>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>
                  Wir melden uns persönlich bei Ihnen — in der Regel innerhalb von 24 Stunden.
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 }}>
                  <CheckCircle2 size={13} color="#4ade80" />
                  <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Erfolgreich gesendet</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</label>
                  <input type="text" placeholder="Max Mustermann" value={form.name} onChange={e => set("name", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>E-Mail *</label>
                  <input type="email" placeholder="max@firma.de" value={form.email} onChange={e => set("email", e.target.value)} required style={inp} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Firma</label>
                  <input type="text" placeholder="Muster GmbH" value={form.company} onChange={e => set("company", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Ihre Nachricht</label>
                  <textarea placeholder="Wie können wir Ihnen helfen? Demo-Wunsch, Fragen zu Preisen, technische Fragen…" value={form.message} onChange={e => set("message", e.target.value)} rows={4} style={{ ...inp, resize: "vertical" }} />
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.consent} onChange={e => set("consent", e.target.checked)} required style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, accentColor: "#2563eb" }} />
                  <span style={{ fontSize: 11, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>
                    Ich bin damit einverstanden, dass Vertriebo mich bezüglich meiner Anfrage kontaktiert.{" "}
                    <a href="/datenschutz" style={{ color: "#60a5fa", textDecoration: "none" }}>Datenschutz</a>
                  </span>
                </label>
                {error && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, padding: "9px 13px", fontSize: 12, color: "#fca5a5" }}>{error}</div>
                )}
                <button type="submit" disabled={submitting} style={{
                  background: submitting ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white",
                  fontWeight: 700, fontSize: 14, padding: "12px 20px", borderRadius: 11, border: "none",
                  cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}>
                  {submitting ? "Wird gesendet…" : <><Send size={15} /> Nachricht senden</>}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* WEITERE OPTIONEN */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
          <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Mehr von Vertriebo</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {[
              { icon: "💰", title: "Preise & Pläne", desc: "Transparente Preise, monatlich kündbar", href: "/preise" },
              { icon: "🏭", title: "Branchen-Übersicht", desc: "Über 40 Branchen, alle Regionen", href: "/branchen" },
              { icon: "🏢", title: "Über Vertriebo", desc: "Unsere Geschichte & Mission", href: "/ueber-uns" },
              { icon: "🤝", title: "Investor Relations", desc: "Für Investoren & Partner", href: "/investors" },
            ].map((c, i) => (
              <a key={i} href={c.href} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "18px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, textDecoration: "none", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(37,99,235,0.4)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}
              >
                <span style={{ fontSize: 22 }}>{c.icon}</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{c.title}</p>
                <p style={{ fontSize: 12, color: "rgba(100,116,139,1)", lineHeight: 1.5 }}>{c.desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <SEOFooter />
    </div>
  );
}