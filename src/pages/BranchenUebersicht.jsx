import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import SEOFooter from "@/components/SEOFooter";

// Icon-Mapping nach industry_id
const ICONS = {
  gebaeudereinigung: "🏢", facility_service: "🏠", gartenbau: "🌿", entruempelung: "📦",
  sicherheitsdienst: "🛡️", it_service: "💻", elektro_gebaeudetechnik: "⚡", shk: "🔧",
  maler_renovierung: "🎨", handwerk: "🔨", catering: "🍽️", eventservice: "🎪",
  messebau: "🏗️", spedition_logistik: "🚚", umzugsunternehmen: "🚛", lager_fulfillment: "🏭",
  personal_zeitarbeit: "👥", schulungen_weiterbildung: "📚", buchhaltung_steuernahe_dienste: "💰",
  marketing_webdesign_werbung: "📱", fuhrparkservice_fahrzeugpflege: "🚗", pflege_betreuung: "🏥",
  industrieservice: "⚙️", immobilien: "🏘️", gesundheit_medizin: "🩺", kfz_service: "🔩",
  reinigungstechnik: "🧹", hausmeisterdienst: "🔑", gebaeudemanagement: "🏛️",
  textilreinigung: "👔", schädlingsbekämpfung: "🐛", winterdienst: "❄️",
  wachdienst: "👮", detektei: "🔍", brandschutz: "🔥", arbeitssicherheit: "⛑️",
  telekommunikation: "📡", software_entwicklung: "💾", cloud_services: "☁️",
  netzwerk_infrastruktur: "🌐", drucker_service: "🖨️",
};

export default function BranchenUebersicht() {
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const records = await base44.entities.TaxonomyEntry.filter(
          { is_active: true },
          "sort_order",
          200
        );
        // Fallback-Filter: kein Fallback-Profil anzeigen
        const filtered = records.filter(r => r.industry_id !== "fallback_lokaler_dienstleister");
        setIndustries(filtered);
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Nach profile_group gruppieren
  const grouped = industries.reduce((acc, r) => {
    const group = r.profile_group || "Sonstige";
    if (!acc[group]) acc[group] = [];
    acc[group].push(r);
    return acc;
  }, {});

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <style>{`
        @media (max-width: 640px) {
          .uebersicht-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/">
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 120, objectFit: "contain" }} />
        </a>
        <a href="/#waitlist-form" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>
          Kostenlos starten →
        </a>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 20px 0" }}>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
          <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>Vertriebo</a> {" › "}
          <span style={{ color: "rgba(148,163,184,1)" }}>Alle Branchen</span>
        </p>
      </div>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 20px 40px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#93c5fd", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
          🏭 {loading ? "…" : industries.length}+ Branchen verfügbar
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 16 }}>
          B2B Leads für{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            jede Branche
          </span>
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, maxWidth: 720 }}>
          Vertriebo kennt die spezifischen Zielkunden von über {loading ? "40" : industries.length} lokalen Dienstleistungsbranchen. Wählen Sie Ihre Branche und starten Sie sofort mit der automatischen Firmenrecherche.
        </p>
      </section>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 64px" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "rgba(100,116,139,1)", padding: "48px 0" }}>Lade Branchen…</div>
        ) : (
          Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, items]) => (
            <div key={group} style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {group}
              </h2>
              <div className="uebersicht-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {items.map(ind => {
                  const customers = ind.target_customer_types
                    ? JSON.parse(ind.target_customer_types).slice(0, 3).join(", ")
                    : "";
                  return (
                    <a key={ind.industry_id} href={`/branchen/${ind.industry_id}`}
                      style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, textDecoration: "none", transition: "border-color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(37,99,235,0.4)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}
                    >
                      <span style={{ fontSize: 24, flexShrink: 0 }}>{ICONS[ind.industry_id] || "🏭"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>{ind.label}</p>
                        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customers}</p>
                      </div>
                      <ArrowRight size={14} color="rgba(100,116,139,0.5)" style={{ marginLeft: "auto", flexShrink: 0, marginTop: 4 }} />
                    </a>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(22px,4vw,40px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>
          Ihre Branche nicht dabei?
        </h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
          Vertriebo wird ständig um neue Branchen erweitert. Kontaktieren Sie uns — wir richten Ihr Branchenprofil individuell ein.
        </p>
        <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
          Frühen Zugang sichern <ArrowRight size={16} />
        </a>
      </section>

      <SEOFooter />
    </div>
  );
}