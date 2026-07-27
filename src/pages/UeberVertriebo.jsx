import { ArrowRight, CheckCircle2 } from "lucide-react";
import SEOFooter from "@/components/SEOFooter";

export default function UeberVertriebo() {
  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/">
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 120, objectFit: "contain" }} />
        </a>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="/kontakt" style={{ color: "rgba(148,163,184,1)", fontWeight: 600, fontSize: 13, padding: "9px 14px", borderRadius: 9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)" }}>
            Kontakt
          </a>
          <a href="/preise" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>
            Preise →
          </a>
        </div>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 32 }}>
          <a href="/preise" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 11, textDecoration: "none" }}>
            Preise & Pläne <ArrowRight size={14} />
          </a>
          <a href="/branchen" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 11, textDecoration: "none" }}>
            Alle Branchen
          </a>
        </div>
      </section>

      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Kontakt & Unternehmen</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {[
              { icon: "🏢", title: "Unternehmen", lines: [
                  { text: "Huwa Gebäudereinigung & Hausmeisterdienste" },
                  { text: "Mittelweg 24, 56566 Neuwied" },
                ]
              },
              { icon: "📞", title: "Kontakt", lines: [
                  { text: "02601 / 9131820", href: "tel:026019131820" },
                  { text: "info@vertriebo.com", href: "mailto:info@vertriebo.com" },
                  { text: "vertriebo.de", href: "/" },
                ]
              },
              { icon: "⚖️", title: "Rechtliches", lines: [
                  { text: "Impressum", href: "/impressum" },
                  { text: "Datenschutzerklärung", href: "/datenschutz" },
                  { text: "AGB", href: "/agb" },
                ]
              },
            ].map((c, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 18px" }}>
                <p style={{ fontSize: 24, marginBottom: 10 }}>{c.icon}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 10 }}>{c.title}</p>
                {c.lines.map((l, j) => l.href ? (
                  <a key={j} href={l.href} style={{ display: "block", fontSize: 13, color: "#60a5fa", lineHeight: 1.9, textDecoration: "none" }}>{l.text}</a>
                ) : (
                  <p key={j} style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>{l.text}</p>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <a href="/kontakt" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)", color: "#93c5fd", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 11, textDecoration: "none" }}>
              Kontaktformular öffnen <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </section>

      <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(22px,4vw,40px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>Werden Sie Teil von Vertriebo</h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 32, maxWidth: 500, margin: "0 auto 32px" }}>
          Sichern Sie sich frühen Zugang und starten Sie noch heute mit automatisierter B2B-Leadgenerierung.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <a href="/preise" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
            Preise ansehen <ArrowRight size={16} />
          </a>
          <a href="/kontakt" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontWeight: 700, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none" }}>
            Demo anfragen
          </a>
        </div>
      </section>

      <SEOFooter />
    </div>
  );
}