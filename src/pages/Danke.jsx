import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import SEOFooter from "@/components/SEOFooter";

export default function Danke() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || params.get("customer_email") || "";
  const orderId = params.get("order_id") || params.get("transaction_id") || "";

  const registerUrl = email
    ? `/registrieren?email=${encodeURIComponent(email)}`
    : "/registrieren";

  const STEPS = [
    {
      num: "1",
      title: email ? "E-Mail-Adresse merken" : "E-Mail-Adresse bereithalten",
      desc: email
        ? `Ihre Kaufadresse: ${email} — diese muessen Sie bei der Registrierung verwenden.`
        : "Verwenden Sie bei der Registrierung dieselbe E-Mail-Adresse, mit der Sie bei Digistore24 gekauft haben.",
      color: "#60a5fa",
      bg: "rgba(37,99,235,0.08)",
      border: "rgba(37,99,235,0.2)",
    },
    {
      num: "2",
      title: "Konto erstellen",
      desc: "Klicken Sie auf Jetzt Konto eroeffnen und registrieren Sie sich. Das dauert weniger als 2 Minuten.",
      color: "#a78bfa",
      bg: "rgba(124,58,237,0.08)",
      border: "rgba(124,58,237,0.2)",
    },
    {
      num: "3",
      title: "Tarif wird automatisch aktiviert",
      desc: "Unser System erkennt Ihren Kauf sofort. Ihr gebuchter Tarif ist direkt nach der Registrierung aktiv.",
      color: "#4ade80",
      bg: "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.2)",
    },
  ];

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>

      {/* NAV */}
      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/">
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 110, objectFit: "contain" }} />
        </a>
        <a href="/anmelden" style={{ color: "rgba(148,163,184,1)", fontWeight: 600, fontSize: 13, padding: "9px 14px", borderRadius: 9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)" }}>
          Bereits Kunde? Anmelden
        </a>
      </nav>

      {/* PFLICHTHINWEIS – Digistore24-Pflicht */}
      <div style={{ background: "rgba(37,99,235,0.08)", borderBottom: "1px solid rgba(37,99,235,0.2)", padding: "12px 20px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "#93c5fd", fontWeight: 600 }}>
          <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
          Die Abbuchung erfolgt durch <strong>Digistore24</strong> — Ihr zuverlässiger Zahlungsdienstleister.
        </p>
      </div>

      {/* HERO */}
      <section style={{ maxWidth: 680, margin: "0 auto", padding: "56px 20px 40px", textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "2px solid rgba(34,197,94,0.35)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 0 32px rgba(34,197,94,0.2)" }}>
          <span style={{ fontSize: 32 }}>🎉</span>
        </div>

        <h1 style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 16 }}>
          Vielen Dank für Ihren{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Kauf!
          </span>
        </h1>

        <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 8 }}>
          Ihr Vertriebo-Zugang wird automatisch aktiviert — Sie müssen sich nur noch registrieren.
        </p>

        {orderId && (
          <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 8 }}>
            Bestellnummer: <span style={{ color: "rgba(100,116,139,1)", fontFamily: "monospace" }}>{orderId}</span>
          </p>
        )}
      </section>

      {/* E-MAIL HINWEIS */}
      {email && (
        <section style={{ maxWidth: 620, margin: "0 auto", padding: "0 20px 32px" }}>
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 16, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mail size={18} color="#fbbf24" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", marginBottom: 6 }}>
                Wichtig: Verwenden Sie exakt diese E-Mail-Adresse
              </p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "white", background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: 8, display: "inline-block", marginBottom: 8, fontFamily: "monospace" }}>
                {email}
              </p>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>
                Nur wenn Sie sich mit <strong style={{ color: "white" }}>exakt dieser E-Mail</strong> registrieren,
                erkennt unser System Ihren Kauf und aktiviert automatisch Ihren gebuchten Tarif.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* SCHRITTE */}
      <section style={{ maxWidth: 620, margin: "0 auto", padding: "0 20px 40px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{ background: step.bg, border: `1px solid ${step.border}`, borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: `1px solid ${step.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: step.color, flexShrink: 0 }}>
                {step.num}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>{step.title}</p>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 620, margin: "0 auto", padding: "0 20px 64px", textAlign: "center" }}>
        <a
          href={registerUrl}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 16, padding: "16px 36px", borderRadius: 14, textDecoration: "none", boxShadow: "0 0 50px rgba(37,99,235,0.45)", marginBottom: 14 }}
        >
          Jetzt Konto eröffnen <ArrowRight size={18} />
        </a>

        <a href="/anmelden" style={{ display: "block", fontSize: 13, color: "rgba(100,116,139,1)", textDecoration: "none", marginBottom: 24 }}>
          Bereits registriert? <span style={{ color: "#60a5fa" }}>Jetzt anmelden</span>
        </a>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
          {["14 Tage Rückgaberecht", "DSGVO-konform", "Abbuchung via Digistore24"].map(t => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <CheckCircle2 size={10} color="#4ade80" />
              <span style={{ fontSize: 11, color: "rgba(203,213,225,1)", fontWeight: 500 }}>{t}</span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: "rgba(71,85,105,1)" }}>
          Fragen?{" "}
          <a href="mailto:info@vertriebo.com" style={{ color: "#60a5fa", textDecoration: "none" }}>info@vertriebo.com</a>
          {" · "}
          <a href="tel:026019131820" style={{ color: "#60a5fa", textDecoration: "none" }}>02601 / 9131820</a>
        </p>
      </section>

      <SEOFooter />
    </div>
  );
}