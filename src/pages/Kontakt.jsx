import { useState } from "react";
import { ArrowRight, CheckCircle2, Phone, Mail, MapPin } from "lucide-react";

export default function Kontakt() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "", consent: false });
  const [submitted, setSubmitted] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    // Leitet zum Waitlist-Form auf der Landing-Page weiter, vorausgefüllt
    window.location.href = `/#waitlist-form`;
  };

  const inp = {
    width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box"
  };

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <style>{`
        @media (max-width: 640px) {
          .kontakt-grid { grid-template-columns: 1fr !important; }
        }
        ::placeholder { color: rgba(100,116,139,0.7) !important; }
      `}</style>

      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/">
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 120, objectFit: "contain" }} />
        </a>
        <a href="/#waitlist-form" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>
          Kostenlos starten →
        </a>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 20px 0" }}>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
          <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>Vertriebo</a> {" › "}
          <span style={{ color: "rgba(148,163,184,1)" }}>Kontakt</span>
        </p>
      </div>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 40px" }}>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 16 }}>
          Sprechen wir miteinander
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, maxWidth: 620 }}>
          Sie haben Fragen zu Vertriebo, möchten eine Demo oder benötigen Hilfe beim Setup? Wir melden uns persönlich bei Ihnen.
        </p>
      </section>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 64px" }}>
        <div className="kontakt-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          {/* KONTAKTDATEN */}
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Direkt erreichen</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { icon: <Phone size={18} color="#60a5fa" />, title: "Telefon", value: "02601/9131820", href: "tel:026019131820" },
                { icon: <Mail size={18} color="#a78bfa" />, title: "E-Mail", value: "info@huwa-gebaeudedienste.de", href: "mailto:info@huwa-gebaeudedienste.de" },
                { icon: <MapPin size={18} color="#34d399" />, title: "Adresse", value: "Mittelweg 24, 56566 Neuwied", href: null },
              ].map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "16px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.icon}</div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{c.title}</p>
                    {c.href ? (
                      <a href={c.href} style={{ fontSize: 14, color: "#60a5fa", textDecoration: "none" }}>{c.value}</a>
                    ) : (
                      <p style={{ fontSize: 14, color: "rgba(203,213,225,1)" }}>{c.value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28, padding: "20px 18px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", marginBottom: 8 }}>⚡ Schnellste Option</p>
              <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>
                Tragen Sie sich in die Warteliste ein — unser Team meldet sich innerhalb von 24 Stunden persönlich bei Ihnen.
              </p>
              <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>
                Zur Warteliste <ArrowRight size={13} />
              </a>
            </div>
          </div>

          {/* FORMULAR */}
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Nachricht senden</h2>
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
                <textarea placeholder="Wie können wir Ihnen helfen?" value={form.message} onChange={e => set("message", e.target.value)} rows={4} style={{ ...inp, resize: "vertical" }} />
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.consent} onChange={e => set("consent", e.target.checked)} required style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, accentColor: "#2563eb" }} />
                <span style={{ fontSize: 11, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>
                  Ich bin damit einverstanden, dass Vertriebo mich kontaktiert.{" "}
                  <a href="/datenschutz" style={{ color: "#60a5fa", textDecoration: "none" }}>Datenschutz</a>
                </span>
              </label>
              <button type="submit" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 14, padding: "12px 20px", borderRadius: 11, border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                Nachricht senden <ArrowRight size={15} />
              </button>
            </form>
          </div>
        </div>
      </section>

      <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "28px 20px", textAlign: "center" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginBottom: 10 }}>
          {[["Impressum", "/impressum"], ["Datenschutz", "/datenschutz"], ["AGB", "/agb"]].map(([l, h]) => (
            <a key={l} href={h} style={{ color: "rgba(71,85,105,1)", fontSize: 12, textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <p style={{ color: "rgba(51,65,85,1)", fontSize: 11 }}>© 2026 Vertriebo · Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
      </footer>
    </div>
  );
}