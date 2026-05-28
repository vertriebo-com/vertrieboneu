import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function UeberVertriebo() {
  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
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
          <span style={{ color: "rgba(148,163,184,1)" }}>Über uns</span>
        </p>
      </div>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 56px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
          🏢 Über Vertriebo
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 20 }}>
          Wir sind{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Vertriebo
          </span>
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, maxWidth: 720 }}>
          Vertriebo ist eine B2B-Vertriebsplattform, die lokalen Dienstleistern hilft, systematisch neue Firmenkunden zu gewinnen — durch automatisierte Recherche, KI-Bewertung und strukturiertes Vertriebsmanagement.
        </p>
      </section>

      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Unsere Geschichte</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
            <div>
              <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.85 }}>
                Vertriebo entstand aus einer einfachen Frustration: Als Inhaber der <strong style={{ color: "white" }}>Huwa Gebäudereinigung & Hausmeisterdienste</strong> in Neuwied haben wir täglich erlebt, wie zeitaufwändig und ineffizient die manuelle Suche nach neuen Geschäftskunden ist.
              </p>
            </div>
            <div>
              <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.85 }}>
                Stundenlange Google-Suchen, veraltete Adresslisten, vergessene Rückrufe — das kann kein Dienstleistungsunternehmen auf Dauer stemmen. Deshalb haben wir Vertriebo entwickelt: Ein System, das das alles automatisiert und die Vertriebsarbeit auf das Wesentliche reduziert.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
        <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Unsere Mission</h2>
        <div style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.06))", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 20, padding: "32px 28px", marginBottom: 32 }}>
          <p style={{ fontSize: "clamp(18px,2.5vw,24px)", fontWeight: 700, color: "white", lineHeight: 1.5, fontStyle: "italic" }}>
            „Jeder lokale B2B-Dienstleister soll die gleichen Werkzeuge haben wie große Konzerne — automatisierte Kundengewinnung, KI-gestützte Prioritäten und eine lückenlose Vertriebsorganisation."
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            "Automatisierte Firmenrecherche für über 40 Branchen",
            "KI-Lead-Scoring das täglich besser wird",
            "DSGVO-konformes System Made in Germany",
            "Persönlicher Support und Onboarding durch unser Team",
            "Monatlich kündbar — kein Risiko für kleine Betriebe",
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CheckCircle2 size={16} color="#4ade80" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: "rgba(203,213,225,1)" }}>{f}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Kontakt & Unternehmen</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {[
              { icon: "🏢", title: "Unternehmen", lines: ["Huwa Gebäudereinigung &", "Hausmeisterdienste", "Mittelweg 24", "56566 Neuwied"] },
              { icon: "📞", title: "Kontakt", lines: ["Telefon: 02601/9131820", "E-Mail: info@huwa-gebaeudedienste.de", "Web: vertriebo.de"] },
              { icon: "⚖️", title: "Rechtliches", lines: ["Inhaber: Huwa", "Gebäudereinigung & HMD", "Eingetragen in Neuwied", "DDG-konform"] },
            ].map((c, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 18px" }}>
                <p style={{ fontSize: 24, marginBottom: 10 }}>{c.icon}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 8 }}>{c.title}</p>
                {c.lines.map((l, j) => (
                  <p key={j} style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>{l}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(22px,4vw,40px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>Werden Sie Teil von Vertriebo</h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
          Sichern Sie sich frühen Zugang und starten Sie noch heute mit automatisierter B2B-Leadgenerierung.
        </p>
        <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
          Frühen Zugang sichern <ArrowRight size={16} />
        </a>
      </section>

      <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "28px 20px", textAlign: "center" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginBottom: 10 }}>
          {[["Impressum", "/impressum"], ["Datenschutz", "/datenschutz"], ["AGB", "/agb"], ["Kontakt", "/kontakt"]].map(([l, h]) => (
            <a key={l} href={h} style={{ color: "rgba(71,85,105,1)", fontSize: 12, textDecoration: "none" }}>{l}</a>
          ))}
        </div>
        <p style={{ color: "rgba(51,65,85,1)", fontSize: 11 }}>© 2026 Vertriebo · Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
      </footer>
    </div>
  );
}