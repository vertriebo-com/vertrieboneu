import { ArrowRight, CheckCircle2, Users, TrendingUp, DollarSign, Star } from "lucide-react";
import SEOFooter from "@/components/SEOFooter";

const BENEFITS = [
  { icon: "💰", title: "Attraktive Provisionen", desc: "Verdienen Sie wiederkehrende Provisionen für jeden geworbenen Vertriebo-Kunden – monatlich, solange das Abo läuft." },
  { icon: "🚀", title: "Einfacher Start", desc: "Registrierung bei Digistore24, Produkt beantragen, Promo-Link erhalten – in weniger als 10 Minuten bereit." },
  { icon: "📊", title: "Vollständiges Tracking", desc: "Digistore24 trackt alle Klicks, Käufe und Provisionen transparent in Ihrem Affiliate-Dashboard." },
  { icon: "🤝", title: "Starkes Produkt", desc: "Vertriebo ist eine bewährte B2B-Vertriebslösung für lokale Dienstleister – leicht zu empfehlen, hohe Conversion." },
  { icon: "🔄", title: "Wiederkehrende Einnahmen", desc: "Keine Einmalprovisionen: Sie verdienen jeden Monat, solange Ihr geworbener Kunde aktiv bleibt." },
  { icon: "🛡️", title: "Zuverlässige Auszahlung", desc: "Digistore24 übernimmt die gesamte Provisionsabwicklung und Auszahlung direkt an Sie." },
];

const STEPS = [
  { num: "01", title: "Digistore24-Account erstellen", desc: "Registrieren Sie sich kostenlos als Affiliate-Partner bei Digistore24." },
  { num: "02", title: "Vertriebo-Produkt beantragen", desc: "Suchen Sie nach 'Vertriebo' im Digistore24-Marktplatz und beantragen Sie die Partnergenehmigung." },
  { num: "03", title: "Promo-Link erhalten", desc: "Nach Freischaltung erhalten Sie Ihren persönlichen Affiliate-Link mit vollem Tracking." },
  { num: "04", title: "Empfehlen & verdienen", desc: "Teilen Sie Ihren Link auf Ihrer Website, in Newslettern, Social Media oder direkt mit Interessenten." },
];

const PLANS = [
  { name: "Starter", price: "99 €", period: "/Monat" },
  { name: "Professional", price: "199 €", period: "/Monat" },
  { name: "Gold", price: "349 €", period: "/Monat" },
  { name: "Agency", price: "599 €", period: "/Monat" },
];

export default function Affiliates() {
  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <style>{`@media (max-width: 640px) { .aff-grid { grid-template-columns: 1fr !important; } }`}</style>

      {/* NAV */}
      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/">
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 110, objectFit: "contain" }} />
        </a>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="/preise" style={{ color: "rgba(148,163,184,1)", fontWeight: 600, fontSize: 13, padding: "9px 14px", borderRadius: 9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)" }}>Preise</a>
          <a href="/registrieren" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>Kostenlos testen →</a>
        </div>
      </nav>

      {/* BREADCRUMB */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 20px 0" }}>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
          <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>Vertriebo</a> {" › "}
          <span style={{ color: "rgba(148,163,184,1)" }}>Affiliate-Programm</span>
        </p>
      </div>

      {/* HERO */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px 48px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
          🤝 Affiliate-Programm · Powered by Digistore24
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 16 }}>
          Empfehlen.{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Verdienen.
          </span>
          {" "}Wiederholt.
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, maxWidth: 640, marginBottom: 32 }}>
          Werden Sie Vertriebo-Affiliate und verdienen Sie attraktive Provisionen für jeden Kunden, den Sie über Ihren persönlichen Digistore24-Promo-Link gewinnen — monatlich wiederkehrend.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a
            href="https://www.digistore24.com/vendor/register"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.4)" }}
          >
            Jetzt bei Digistore24 registrieren <ArrowRight size={16} />
          </a>
          <a href="#wie-es-funktioniert" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontWeight: 600, fontSize: 14, padding: "14px 22px", borderRadius: 12, textDecoration: "none" }}>
            Wie es funktioniert ↓
          </a>
        </div>
      </section>

      {/* PLAN ÜBERSICHT */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
          <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 8, letterSpacing: -0.5 }}>Vertriebo Pläne – Ihre Provisionsbasis</h2>
          <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", marginBottom: 28 }}>Ihre Provision basiert auf dem vom Kunden gewählten Monatsabo.</p>
          <div className="aff-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {PLANS.map((p, i) => (
              <div key={i} style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.18)", borderRadius: 14, padding: "20px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd", marginBottom: 8 }}>{p.name}</p>
                <p style={{ fontSize: 24, fontWeight: 900, color: "white", lineHeight: 1 }}>{p.price}</p>
                <p style={{ fontSize: 11, color: "rgba(100,116,139,1)", marginTop: 4 }}>{p.period}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "rgba(100,116,139,1)", marginTop: 16 }}>* Genaue Provisionssätze werden nach Ihrer Freischaltung im Digistore24-Dashboard angezeigt.</p>
        </div>
      </section>

      {/* VORTEILE */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
        <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 32, letterSpacing: -0.5 }}>Warum Vertriebo promoten?</h2>
        <div className="aff-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          {BENEFITS.map((b, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "22px 18px" }}>
              <p style={{ fontSize: 28, marginBottom: 12 }}>{b.icon}</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 8 }}>{b.title}</p>
              <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WIE ES FUNKTIONIERT */}
      <section id="wie-es-funktioniert" style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 32, letterSpacing: -0.5 }}>In 4 Schritten zum ersten Verdienst</h2>
          <div className="aff-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ position: "relative" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#60a5fa", marginBottom: 14 }}>{s.num}</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 8, lineHeight: 1.3 }}>{s.title}</p>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 700, margin: "0 auto", padding: "64px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(24px,4vw,42px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16, letterSpacing: -1 }}>
          Bereit, mit Vertriebo zu{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>verdienen?</span>
        </h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 32, lineHeight: 1.7 }}>
          Registrieren Sie sich bei Digistore24, beantragen Sie das Vertriebo-Produkt und starten Sie noch heute.
        </p>
        <a
          href="https://www.digistore24.com/vendor/register"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 16, padding: "16px 36px", borderRadius: 14, textDecoration: "none", boxShadow: "0 0 50px rgba(37,99,235,0.45)" }}
        >
          Jetzt Affiliate werden <ArrowRight size={18} />
        </a>
        <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 14 }}>Kostenlose Registrierung · Kein Risiko · Digistore24-geprüft</p>
        <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 6 }}>
          Fragen? <a href="mailto:info@vertriebo.com" style={{ color: "#60a5fa", textDecoration: "none" }}>info@vertriebo.com</a>
        </p>
      </section>

      <SEOFooter />
    </div>
  );
}