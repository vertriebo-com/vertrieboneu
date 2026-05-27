import { ArrowRight } from "lucide-react";

export default function LandingFinalCTA({ onScrollToForm }) {
  return (
    <section style={{ padding: "80px 24px", background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), rgba(124,58,237,0.12), #020617)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.02) 1px,transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />
      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 16 }}>Jetzt starten</p>
        <h2 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, color: "white", lineHeight: 1.1, marginBottom: 18, letterSpacing: -1.5 }}>
          Kein vergessener Rückruf mehr.
          <br />
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Kein Lead mehr verloren.
          </span>
        </h2>
        <p style={{ fontSize: 17, color: "rgba(148,163,184,1)", marginBottom: 36, lineHeight: 1.7 }}>
          Starten Sie mit Vertriebo und bringen Sie echte Struktur in Ihre Neukundengewinnung. Die ersten Early-Access-Plätze sind limitiert.
        </p>
        <button
          onClick={onScrollToForm}
          style={{
            background: "linear-gradient(135deg,#2563eb,#7c3aed)",
            color: "white", fontWeight: 800, fontSize: 16,
            padding: "16px 36px", borderRadius: 14, border: "none",
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 0 50px rgba(37,99,235,0.5), 0 4px 24px rgba(37,99,235,0.3)",
            display: "inline-flex", alignItems: "center", gap: 10,
          }}
        >
          Frühen Zugang sichern <ArrowRight size={18} />
        </button>
        <p style={{ fontSize: 13, color: "rgba(71,85,105,1)", marginTop: 16 }}>
          Kostenlos eintragen · Persönlicher Kontakt · Keine Kreditkarte
        </p>
      </div>
    </section>
  );
}