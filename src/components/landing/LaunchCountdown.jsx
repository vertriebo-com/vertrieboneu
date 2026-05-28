import { useState, useEffect } from "react";

const LAUNCH_DATE = new Date("2026-06-27T00:00:00+02:00"); // 27.06.2026 Mitternacht MESZ

function getTimeLeft() {
  const now = new Date();
  const diff = LAUNCH_DATE - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    done: false,
  };
}

const Unit = ({ value, label }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 72 }}>
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(37,99,235,0.35)",
      borderRadius: 14,
      padding: "16px 10px 10px",
      width: "100%",
      textAlign: "center",
      boxShadow: "0 0 24px rgba(37,99,235,0.12), inset 0 1px 0 rgba(255,255,255,0.05)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* top glint */}
      <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg,transparent,rgba(96,165,250,0.5),transparent)" }} />
      <span style={{
        fontSize: "clamp(32px,5vw,52px)",
        fontWeight: 900,
        color: "white",
        letterSpacing: -2,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        display: "block",
        background: "linear-gradient(135deg,#ffffff,#93c5fd)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>
        {String(value).padStart(2, "0")}
      </span>
    </div>
    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: 2, marginTop: 8 }}>{label}</span>
  </div>
);

const Colon = () => (
  <span style={{ fontSize: "clamp(24px,4vw,40px)", fontWeight: 900, color: "rgba(37,99,235,0.6)", lineHeight: 1, alignSelf: "center", marginBottom: 18, userSelect: "none" }}>:</span>
);

export default function LaunchCountdown() {
  const [time, setTime] = useState(getTimeLeft());

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{ padding: "60px 20px", background: "linear-gradient(180deg, #020617 0%, #060d1f 50%, #020617 100%)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", position: "relative", overflow: "hidden" }}>
      {/* BG glow */}
      <div style={{ position: "absolute", width: 600, height: 300, background: "rgba(37,99,235,0.08)", borderRadius: "50%", filter: "blur(80px)", top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 999, background: "rgba(212,175,116,0.1)", border: "1px solid rgba(212,175,116,0.3)", color: "#d4a574", fontSize: 11, fontWeight: 700, marginBottom: 18, textTransform: "uppercase", letterSpacing: 1.5 }}>
          🚀 Offizieller Launch
        </div>

        <h2 style={{ fontSize: "clamp(20px,3.5vw,36px)", fontWeight: 900, color: "white", letterSpacing: -0.5, marginBottom: 6, lineHeight: 1.2 }}>
          Vertriebo startet am <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>27. Juni 2026</span>
        </h2>
        <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", marginBottom: 36 }}>Sichern Sie sich jetzt Ihren Early-Access-Platz – bevor die Warteliste schließt.</p>

        {time.done ? (
          <div style={{ fontSize: 28, fontWeight: 900, color: "#4ade80", letterSpacing: -1 }}>🎉 Vertriebo ist live!</div>
        ) : (
          <div style={{ display: "flex", gap: "clamp(8px,2vw,20px)", justifyContent: "center", alignItems: "flex-start" }}>
            <Unit value={time.days} label="Tage" />
            <Colon />
            <Unit value={time.hours} label="Stunden" />
            <Colon />
            <Unit value={time.minutes} label="Minuten" />
            <Colon />
            <Unit value={time.seconds} label="Sekunden" />
          </div>
        )}
      </div>
    </section>
  );
}