import { Building2, Target, Phone, Mail, TrendingUp, Users, Calendar, FileText, Shield, Search, CheckCircle, BarChart3, ArrowRight } from "lucide-react";

const HOW_IT_WORKS = [
  {
    step: "Schritt 1",
    icon: Search,
    title: "Zielgebiet und Zielkunden festlegen",
    desc: "Definieren Sie PLZ-Gebiete, Branchen und Umkreis. Vertriebo sucht automatisch passende Firmen in Ihrem Zielgebiet.",
    color: "blue",
  },
  {
    step: "Schritt 2",
    icon: Target,
    title: "Firmenkontakte recherchieren und priorisieren",
    desc: "Das System findet Firmenkontakte und bewertet sie nach Potenzial. Heiße Leads werden zuerst angezeigt.",
    color: "emerald",
  },
  {
    step: "Schritt 3",
    icon: Phone,
    title: "Anrufen, nachfassen, dokumentieren und Abschlüsse messen",
    desc: "Sie arbeiten die täglichen Prioritäten ab. Alle Kontakte werden dokumentiert, Erfolge gemessen.",
    color: "purple",
  },
];

export default function HowItWorks() {
  return (
    <div style={{ background: "#080e1e", padding: "80px 24px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 16 }}>
            So funktioniert Vertriebo in 3 Schritten
          </h2>
          <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", maxWidth: 700, margin: "0 auto" }}>
            Einfach, klar, effektiv. Ohne komplizierte Einrichtung.
          </p>
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 }}>
          {HOW_IT_WORKS.map((item, i) => {
            const Icon = item.icon;
            const bgColor = item.color === "blue" ? "rgba(37,99,235,0.08)" : item.color === "emerald" ? "rgba(34,197,94,0.08)" : "rgba(139,92,246,0.08)";
            const iconColor = item.color === "blue" ? "#60a5fa" : item.color === "emerald" ? "#4ade80" : "#a78bfa";
            const borderColor = item.color === "blue" ? "rgba(37,99,235,0.2)" : item.color === "emerald" ? "rgba(34,197,94,0.2)" : "rgba(139,92,246,0.2)";
            
            return (
              <div key={i} style={{ position: "relative" }}>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div style={{ display: "none", position: "absolute", top: 48, left: "100%", width: "100%", height: 2, background: "linear-gradient(90deg,rgba(255,255,255,0.1),transparent)", transform: "translateX(-50%)", zIndex: 0 }} />
                )}
                <div style={{
                  position: "relative", zIndex: 1, background: "rgba(255,255,255,0.03)", border: `1px solid ${borderColor}`,
                  borderRadius: 20, padding: 32, textAlign: "center", transition: "all 0.3s"
                }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: bgColor, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                    <Icon style={{ width: 32, height: 32, color: iconColor }} />
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>{item.step}</p>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 10 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}