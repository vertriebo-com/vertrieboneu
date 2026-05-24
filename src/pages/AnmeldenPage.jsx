import { base44 } from "@/api/base44Client";
import { Shield, Check, ArrowRight, Zap } from "lucide-react";

export default function AnmeldenPage() {
  const handleLogin = () => {
    const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
    base44.auth.redirectToLogin(window.location.origin + next);
  };

  const handleRegister = () => {
    base44.auth.redirectToLogin(window.location.origin + "/onboarding");
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
          radial-gradient(ellipse 70% 50% at 20% 50%, rgba(37,99,235,0.12), transparent 70%),
          radial-gradient(ellipse 50% 60% at 80% 30%, rgba(124,58,237,0.08), transparent 70%)
        `
      }} />

      {/* Left Panel - Branding (Desktop only) */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "48px 64px",
        position: "relative",
        zIndex: 1
      }} className="left-panel">
        <div style={{ marginBottom: 40 }}>
          <img
            src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png"
            alt="Vertriebo"
            style={{ height: 160, width: "auto", objectFit: "contain" }}
          />
        </div>

        <h1 style={{
          fontSize: 40, fontWeight: 900, color: "white",
          lineHeight: 1.15, marginBottom: 20, letterSpacing: -1
        }}>
          Willkommen zurück<br />
          <span style={{
            background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
          }}>bei Vertriebo</span>
        </h1>

        <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", lineHeight: 1.7, marginBottom: 40, maxWidth: 400 }}>
          Ihr KI-gestütztes Vertriebssystem für lokale B2B-Dienstleister. Neue Firmenkunden finden, priorisieren und täglich steuern.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { icon: "🔍", text: "Automatische Firmenkontakt-Recherche" },
            { icon: "🧠", text: "KI-gestützte Lead-Priorisierung" },
            { icon: "📊", text: "Echtzeit-Vertriebssteuerung" },
          ].map((f, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, maxWidth: 360
            }}>
              <span style={{ fontSize: 18 }}>{f.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(203,213,225,1)" }}>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 40 }}>
          <Shield size={14} color="rgba(100,116,139,1)" />
          <span style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>DSGVO-konform · Made in Germany</span>
        </div>
      </div>

      {/* Right Panel - Auth */}
      <div style={{
        width: "100%", maxWidth: 460, display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "48px 40px",
        background: "rgba(255,255,255,0.02)", borderLeft: "1px solid rgba(255,255,255,0.06)",
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

        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "white", marginBottom: 8 }}>Anmelden</h2>
          <p style={{ fontSize: 15, color: "rgba(148,163,184,1)" }}>Melden Sie sich mit Ihrem Konto an</p>
        </div>

        <button
          onClick={handleLogin}
          style={{
            width: "100%", padding: "16px",
            background: "linear-gradient(135deg,#2563eb,#7c3aed)",
            color: "white", fontWeight: 700, fontSize: 16, borderRadius: 12, border: "none",
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: "0 0 40px rgba(37,99,235,0.4)", marginBottom: 24, transition: "all 0.2s"
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = "0 0 60px rgba(37,99,235,0.6)"}
          onMouseLeave={e => e.currentTarget.style.boxShadow = "0 0 40px rgba(37,99,235,0.4)"}
        >
          <Zap size={18} fill="white" />
          Jetzt anmelden
          <ArrowRight size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "8px 0 24px" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ fontSize: 12, color: "rgba(100,116,139,1)", fontWeight: 500 }}>oder</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>

        <div style={{
          padding: "20px", background: "rgba(37,99,235,0.06)",
          border: "1px solid rgba(37,99,235,0.2)", borderRadius: 12, textAlign: "center"
        }}>
          <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", marginBottom: 12 }}>Noch kein Konto?</p>
          <button
            onClick={handleRegister}
            style={{
              width: "100%", padding: "13px", background: "transparent",
              color: "#60a5fa", fontWeight: 700, fontSize: 15, borderRadius: 10,
              border: "1px solid rgba(37,99,235,0.4)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            14 Tage kostenlos testen →
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 28 }}>
          <a href="/" style={{ fontSize: 13, color: "rgba(100,116,139,1)", textDecoration: "none" }}>
            ← Zurück zur Startseite
          </a>
        </div>

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "rgba(71,85,105,1)", lineHeight: 1.6 }}>
            Mit der Anmeldung stimmen Sie unseren{" "}
            <a href="/agb" style={{ color: "rgba(100,116,139,1)" }}>AGB</a> und der{" "}
            <a href="/datenschutz" style={{ color: "rgba(100,116,139,1)" }}>Datenschutzerklärung</a> zu.
          </p>
        </div>
      </div>

      <style>{`
        @media (min-width: 769px) { .mobile-logo { display: none; } }
        @media (max-width: 768px) { .left-panel { display: none !important; } }
      `}</style>
    </div>
  );
}