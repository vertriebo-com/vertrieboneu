import { ArrowRight, CheckCircle2, Brain, Flame, Thermometer, TrendingUp } from "lucide-react";

export default function KiLeadScoring() {
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
          <span style={{ color: "rgba(148,163,184,1)" }}>KI-Lead-Scoring & Priorisierung</span>
        </p>
      </div>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 56px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
          🤖 KI & Automatisierung
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 20 }}>
          KI-Lead-Scoring:{" "}
          <span style={{ background: "linear-gradient(135deg,#f87171,#fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Wer ist heiß, wer ist kalt?
          </span>
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 32, maxWidth: 720 }}>
          Nicht jeder Firmenkontakt ist gleich wertvoll. Vertriebos KI bewertet jeden Lead automatisch mit einem Score von 0 bis 100 — damit Sie immer wissen, wen Sie zuerst anrufen sollten. Keine Zeitverschwendung mehr mit unqualifizierten Kontakten.
        </p>
        <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 15, padding: "13px 24px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 30px rgba(37,99,235,0.4)" }}>
          Jetzt KI-Scoring nutzen <ArrowRight size={16} />
        </a>
      </section>

      {/* SCORE KARTEN */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 32, letterSpacing: -0.5 }}>Die 3 Temperaturen: Heiß, Warm, Kalt</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
            {[
              { temp: "🔥 Heiß", range: "Score 80–100", color: "#ef4444", bg: "rgba(239,68,68,0.08)", bd: "rgba(239,68,68,0.25)", desc: "Starke Signale: Passt perfekt zur Zielgruppe, hat Telefon und Website, keine schlechten Signale. Sofort anrufen!" },
              { temp: "🌡️ Warm", range: "Score 50–79", color: "#f59e0b", bg: "rgba(245,158,11,0.08)", bd: "rgba(245,158,11,0.25)", desc: "Gute Übereinstimmung, aber einzelne Felder fehlen oder Score-Signale sind gemischt. Anrufen nach den heißen Leads." },
              { temp: "❄️ Kalt", range: "Score unter 50", color: "#60a5fa", bg: "rgba(37,99,235,0.08)", bd: "rgba(37,99,235,0.25)", desc: "Geringe Relevanz oder fehlende Kontaktdaten. Diese Leads kommen am Ende der Warteschlange." },
            ].map((t, i) => (
              <div key={i} style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 14, padding: "22px 18px" }}>
                <p style={{ fontSize: 22, marginBottom: 6 }}>{t.temp}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: t.color, marginBottom: 12 }}>{t.range}</p>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.65 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WIE SCORING FUNKTIONIERT */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
        <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 14, letterSpacing: -0.5 }}>Wie berechnet die KI den Score?</h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 28 }}>
          Vertriebos KI-Engine analysiert über 20 verschiedene Signale pro Firmenkontakt. Das Ergebnis ist ein transparenter Score, der Ihnen in Echtzeit zeigt, wie relevant ein Lead für Ihr Unternehmen ist.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Branchenübereinstimmung", desc: "Passt die Firma zur gesuchten Zielgruppe? (z.B. Bürogebäude für Gebäudereiniger)", weight: "Hoch" },
            { label: "Vorhandene Kontaktdaten", desc: "Hat der Kontakt eine Telefonnummer, Website, E-Mail?", weight: "Mittel" },
            { label: "Relevanz-Keywords im Namen", desc: "Enthält der Firmenname typische Schlüsselbegriffe?", weight: "Mittel" },
            { label: "Google-Bewertungen & Präsenz", desc: "Ist das Unternehmen aktiv und gut etabliert?", weight: "Niedrig" },
            { label: "Negative Signale prüfen", desc: "Kein Privatunternehmen, keine Kleinstbetriebe, keine Franchise-Ketten.", weight: "Sehr hoch" },
            { label: "Entfernung zum Suchzentrum", desc: "Wie weit ist die Firma vom Ihrem Standort entfernt?", weight: "Niedrig" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>{s.desc}</p>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap",
                background: s.weight === "Sehr hoch" ? "rgba(239,68,68,0.15)" : s.weight === "Hoch" ? "rgba(245,158,11,0.12)" : "rgba(37,99,235,0.1)",
                color: s.weight === "Sehr hoch" ? "#f87171" : s.weight === "Hoch" ? "#fbbf24" : "#93c5fd",
                border: s.weight === "Sehr hoch" ? "1px solid rgba(239,68,68,0.3)" : s.weight === "Hoch" ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(37,99,235,0.2)",
              }}>
                {s.weight}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* LERNEN */}
      <section style={{ background: "rgba(124,58,237,0.05)", borderTop: "1px solid rgba(124,58,237,0.12)", borderBottom: "1px solid rgba(124,58,237,0.12)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 14, letterSpacing: -0.5 }}>Das System lernt mit Ihnen</h2>
              <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.8 }}>
                Vertriebo analysiert Ihre Erfolge und Misserfolge: Welche Branchen konvertieren? Welche Keywords bringen die besten Leads? Je mehr Sie das System nutzen, desto präziser wird das Scoring — individuell auf Ihr Unternehmen zugeschnitten.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
              {["Feedback nach jedem Anruf", "Automatische Keyword-Anpassung", "Branchenspezifisches Lernen", "Wöchentliche Score-Kalibrierung"].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={14} color="#a78bfa" />
                  <span style={{ fontSize: 13, color: "rgba(203,213,225,1)" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(22px,4vw,40px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>
          Hören Sie auf zu raten — lassen Sie die KI priorisieren
        </h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
          Vertriebo zeigt Ihnen jeden Morgen genau: Das sind Ihre 5 wichtigsten Anrufe heute.
        </p>
        <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
          Frühen Zugang sichern <ArrowRight size={16} />
        </a>
        <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 14 }}>Keine Kreditkarte · DSGVO-konform · Sofort einsatzbereit</p>
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