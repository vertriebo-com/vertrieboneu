import { base44 } from "@/api/base44Client";
import { Shield, Check, ArrowRight, Zap } from "lucide-react";

const FEATURES = [
  "300 Firmenkontakte im kostenlosen Test",
  "Automatische Firmenrecherche in Ihrer Region",
  "KI-gestützte Lead-Priorisierung",
  "Vollständiges CRM & Pipeline",
  "Keine Kreditkarte erforderlich",
  "Jederzeit kündbar",
];

export default function RegisterPage() {
  const handleRegister = () => {
    base44.auth.redirectToLogin(window.location.origin + "/onboarding");
  };

  const handleLogin = () => {
    base44.auth.redirectToLogin(window.location.origin + "/dashboard");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020617",
      display: "flex",
      fontFamily: "'Inter', sans-serif",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Background Glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse 70% 50% at 80% 50%, rgba(124,58,237,0.12), transparent 70%),
          radial-gradient(ellipse 50% 60% at 20% 30%, rgba(37,99,235,0.08), transparent 70%)
        `
      }} />

      {/* Left Panel - Register Form */}
      <div style={{
        width: "100%", maxWidth: 460, display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "48px 40px",
        background: "rgba(255,255,255,0.02)", borderRight: "1px solid rgba(255,255,255,0.06)",
        position: "relative", zIndex: 1
      }}>
        {/* Mobile Logo */}
        <div className="mobile-logo" style={{ marginBottom: 28 }}>
          <img
            src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png"
            alt="Vertriebo"
            style={{ height: 80, width: "auto", objectFit: "contain" }}
          />
        </div>

        {/* Green Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px",
          borderRadius: 999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
          color: "#86efac", fontSize: 12, fontWeight: 600, marginBottom: 24, width: "fit-content"
        }}>
          <Check size={12} strokeWidth={3} color="#22c55e" />
          14 Tage kostenlos · Keine Kreditkarte
        </div>

        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "white", marginBottom: 8 }}>Konto erstellen</h2>
          <p style={{ fontSize: 15, color: "rgba(148,163,184,1)" }}>Starten Sie Ihren kostenlosen Test</p>
        </div>

        <button
          onClick={handleRegister}
          style={{
            width: "100%", padding: "16px",
            background: "linear-gradient(135deg,#2563eb,#7c3aed)",
            color: "white", fontWeight: 700, fontSize: 16, borderRadius: 12, border: "none",
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: "0 0 40px rgba(37,99,235,0.4)", marginBottom: 20, transition: "all 0.2s"
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = "0 0 60px rgba(37,99,235,0.6)"}
          onMouseLeave={e => e.currentTarget.style.boxShadow = "0 0 40px rgba(37,99,235,0.4)"}
        >
          <Zap size={18} fill="white" />
          Kostenlos registrieren
          <ArrowRight size={18} />
        </button>

        {/* Trust Chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
          {["Keine Kreditkarte", "Sofort startklar", "Jederzeit kündbar"].map((t, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
              borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)"
            }}>
              <Check size={10} color="#22c55e" strokeWidth={3} />
              <span style={{ fontSize: 11, color: "rgba(148,163,184,1)", fontWeight: 500 }}>{t}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "0 0 20px" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ fontSize: 12, color: "rgba(100,116,139,1)", fontWeight: 500 }}>bereits registriert?</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>

        <button
          onClick={handleLogin}
          style={{
            width: "100%", padding: "13px", background: "transparent",
            color: "rgba(148,163,184,1)", fontWeight: 600, fontSize: 15,
            borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s"
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "white"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(148,163,184,1)"; }}
        >
          Zum Anmelden →
        </button>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <a href="/" style={{ fontSize: 13, color: "rgba(100,116,139,1)", textDecoration: "none" }}>
            ← Zurück zur Startseite
          </a>
        </div>

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "rgba(71,85,105,1)", lineHeight: 1.6 }}>
            Mit der Registrierung stimmen Sie unseren{" "}
            <a href="/agb" style={{ color: "rgba(100,116,139,1)" }}>AGB</a> und der{" "}
            <a href="/datenschutz" style={{ color: "rgba(100,116,139,1)" }}>Datenschutzerklärung</a> zu.
          </p>
        </div>
      </div>

      {/* Right Panel - Features (Desktop only) */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "48px 64px",
        position: "relative", zIndex: 1
      }} className="right-panel">
        <div style={{ marginBottom: 40 }}>
          <img
            src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png"
            alt="Vertriebo"
            style={{ height: 160, width: "auto", objectFit: "contain" }}
          />
        </div>

        <h2 style={{ fontSize: 36, fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 16, letterSpacing: -1 }}>
          Was Sie erwartet
        </h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 32, maxWidth: 400 }}>
          Starten Sie noch heute und gewinnen Sie Ihren ersten neuen Firmenkunden in weniger als 24 Stunden.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}>
                <Check size={12} color="#22c55e" strokeWidth={3} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(203,213,225,1)" }}>{f}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 32, marginTop: 48 }}>
          {[["40+", "Branchen"], ["5 Min", "bis zum ersten Lead"], ["🇩🇪", "Made for Germany"]].map(([v, l]) => (
            <div key={l}>
              <p style={{ fontSize: 28, fontWeight: 900, color: "white" }}>{v}</p>
              <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>{l}</p>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 32 }}>
          <Shield size={14} color="rgba(100,116,139,1)" />
          <span style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>DSGVO-konform · Serverstandort Deutschland</span>
        </div>
      </div>

      <style>{`
        @media (min-width: 769px) { .mobile-logo { display: none; } }
        @media (max-width: 768px) { .right-panel { display: none !important; } }
      `}</style>
    </div>
  );
}