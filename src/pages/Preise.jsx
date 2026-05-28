import { ArrowRight, CheckCircle2 } from "lucide-react";
import SEOFooter from "@/components/SEOFooter";

const PLANS = [
  {
    name: "Starter",
    price: "99",
    desc: "Perfekt für Einzelunternehmer und kleine Teams die mit automatisierter Leadgenerierung starten wollen.",
    features: ["Bis zu 300 neue Leads/Monat", "Automatische Firmenrecherche", "KI-Lead-Scoring", "Priorisierte Tagesliste", "Kontakthistorie & CRM", "E-Mail-Vorlagen", "1 Nutzer"],
    highlight: false,
    cta: "Starter wählen",
  },
  {
    name: "Professional",
    price: "199",
    desc: "Für wachsende Vertriebsteams die mehr Leads, mehr Regionen und erweiterte KI-Funktionen benötigen.",
    features: ["Bis zu 1.500 neue Leads/Monat", "Alle Starter-Funktionen", "Mehrere Suchgebiete", "Erweiterte KI-Analyse", "Follow-up-Automatisierung", "Statistik & Reporting", "Bis zu 3 Nutzer"],
    highlight: true,
    cta: "Professional wählen",
  },
  {
    name: "Gold",
    price: "349",
    desc: "Für etablierte Dienstleister die maximale Leadgenerierung und vollständige Gebietsabdeckung benötigen.",
    features: ["Bis zu 5.000 neue Leads/Monat", "Alle Professional-Funktionen", "Vollständige Gebietsabdeckung", "Individuelle Branchenprofile", "Priority Support", "API-Zugang", "Bis zu 10 Nutzer"],
    highlight: false,
    cta: "Gold wählen",
  },
];

export default function Preise() {
  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <style>{`
        @media (max-width: 768px) {
          .plans-grid { grid-template-columns: 1fr !important; }
          .faq-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/">
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 120, objectFit: "contain" }} />
        </a>
        <a href="/#waitlist-form" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>
          Frühen Zugang sichern →
        </a>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 20px 0" }}>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
          <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>Vertriebo</a> {" › "}
          <span style={{ color: "rgba(148,163,184,1)" }}>Preise</span>
        </p>
      </div>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 20px 56px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
          💰 Transparente Preise · Monatlich kündbar
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 16 }}>
          Einfache,{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            transparente Preise
          </span>
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, maxWidth: 580, margin: "0 auto" }}>
          Kein verstecktes Kleingedrucktes. Keine Setup-Gebühren. Monatlich kündbar. Wählen Sie den Plan der zu Ihrem Betrieb passt.
        </p>
      </section>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 64px" }}>
        <div className="plans-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "start" }}>
          {PLANS.map((plan, i) => (
            <div key={i} style={{
              background: plan.highlight ? "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(124,58,237,0.08))" : "rgba(255,255,255,0.03)",
              border: `1px solid ${plan.highlight ? "rgba(37,99,235,0.4)" : "rgba(255,255,255,0.07)"}`,
              borderRadius: 18,
              padding: "28px 24px",
              position: "relative",
              boxShadow: plan.highlight ? "0 0 40px rgba(37,99,235,0.12)" : "none",
            }}>
              {plan.highlight && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontSize: 10, fontWeight: 800, padding: "4px 14px", borderRadius: 999, whiteSpace: "nowrap" }}>
                  ⭐ EMPFOHLEN
                </div>
              )}
              <p style={{ fontSize: 14, fontWeight: 700, color: plan.highlight ? "#93c5fd" : "rgba(148,163,184,1)", marginBottom: 8 }}>{plan.name}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 12 }}>
                <span style={{ fontSize: 40, fontWeight: 900, color: "white" }}>{plan.price}€</span>
                <span style={{ fontSize: 13, color: "rgba(100,116,139,1)" }}>/Monat</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(100,116,139,1)", lineHeight: 1.65, marginBottom: 20, minHeight: 52 }}>{plan.desc}</p>
              <a href="/#waitlist-form" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: plan.highlight ? "linear-gradient(135deg,#2563eb,#7c3aed)" : "rgba(255,255,255,0.07)", color: "white", fontWeight: 700, fontSize: 13, padding: "11px 16px", borderRadius: 10, textDecoration: "none", marginBottom: 20, border: plan.highlight ? "none" : "1px solid rgba(255,255,255,0.1)" }}>
                {plan.cta} <ArrowRight size={14} />
              </a>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {plan.features.map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <CheckCircle2 size={13} color={plan.highlight ? "#60a5fa" : "#4ade80"} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(203,213,225,1)" }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <p style={{ fontSize: 13, color: "rgba(100,116,139,1)" }}>
            🏢 Für Agenturen und größere Teams:{" "}
            <a href="/kontakt" style={{ color: "#60a5fa", textDecoration: "none" }}>Kontaktieren Sie uns für individuelle Konditionen</a>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 32, textAlign: "center", letterSpacing: -0.5 }}>Häufige Fragen zu den Preisen</h2>
          <div className="faq-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {[
              { q: "Kann ich monatlich kündigen?", a: "Ja. Vertriebo ist monatlich kündbar. Keine Mindestlaufzeit, keine Kündigungsfristen." },
              { q: "Gibt es eine Testphase?", a: "Ja. Im Early Access erhalten Sie eine kostenlose Vorschau mit ersten Leads — ohne Kreditkarte." },
              { q: "Was sind 'Leads/Monat'?", a: "Das sind neue, qualifizierte Firmenkontakte die Vertriebo für Sie in einem Kalendermonat findet und speichert." },
              { q: "Was passiert nach Erreichen des Limits?", a: "Sie werden informiert. Sie können jederzeit upgraden oder bis zum nächsten Monat warten." },
            ].map((faq, i) => (
              <div key={i} style={{ padding: "18px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 8 }}>{faq.q}</p>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.65 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(22px,4vw,40px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>
          Frühen Zugang zu Sonderkonditionen sichern
        </h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
          Early-Access-Nutzer erhalten dauerhaft vergünstigte Konditionen. Jetzt eintragen.
        </p>
        <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
          Jetzt Platz sichern <ArrowRight size={16} />
        </a>
      </section>

      <SEOFooter />
    </div>
  );
}