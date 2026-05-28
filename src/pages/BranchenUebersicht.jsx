import { ArrowRight } from "lucide-react";

const INDUSTRIES = [
  { id: "gebaeudereinigung", label: "Gebäudereinigung", icon: "🏢", group: "Facility & Reinigung", desc: "Leads für Bürogebäude, Hotels, Industrieanlagen" },
  { id: "facility_service", label: "Facility Service", icon: "🏠", group: "Facility & Reinigung", desc: "Hausverwaltungen, Gewerbeparks, Wohnanlagen" },
  { id: "gartenbau", label: "Gartenbau", icon: "🌿", group: "Facility & Reinigung", desc: "Gewerbeimmobilien, Kommunen, Wohnanlagen" },
  { id: "entruempelung", label: "Entrümpelung", icon: "📦", group: "Facility & Reinigung", desc: "Hausverwaltungen, Immobilienmakler, Unternehmen" },
  { id: "sicherheitsdienst", label: "Sicherheitsdienst", icon: "🛡️", group: "Sicherheit & Schutz", desc: "Einkaufszentren, Industriegebiete, Veranstaltungen" },
  { id: "it_service", label: "IT-Service", icon: "💻", group: "IT & Technik", desc: "KMU, Arztpraxen, Kanzleien, Handelsunternehmen" },
  { id: "elektro_gebaeudetechnik", label: "Elektro / Gebäudetechnik", icon: "⚡", group: "Handwerk & Bau", desc: "Gewerbebauten, Industrieanlagen, Hotels" },
  { id: "shk", label: "SHK / Heizung & Sanitär", icon: "🔧", group: "Handwerk & Bau", desc: "Wohnungsbaugesellschaften, Industrie, Gastgewerbe" },
  { id: "maler_renovierung", label: "Maler & Renovierung", icon: "🎨", group: "Handwerk & Bau", desc: "Hausverwaltungen, Hotellerie, Gewerbebetriebe" },
  { id: "handwerk", label: "Handwerk", icon: "🔨", group: "Handwerk & Bau", desc: "Diverse Gewerbekunden, Hausverwaltungen, Industrie" },
  { id: "catering", label: "Catering & Events", icon: "🍽️", group: "Gastronomie & Event", desc: "Unternehmen, Messen, Krankenhäuser, Schulen" },
  { id: "eventservice", label: "Eventservice", icon: "🎪", group: "Gastronomie & Event", desc: "Unternehmen, Verbände, Messen, Kommunen" },
  { id: "messebau", label: "Messebau", icon: "🏗️", group: "Gastronomie & Event", desc: "Industrieunternehmen, Agenturen, Technologiefirmen" },
  { id: "spedition_logistik", label: "Spedition & Logistik", icon: "🚚", group: "Transport & Logistik", desc: "Produktionsunternehmen, Handel, E-Commerce" },
  { id: "umzugsunternehmen", label: "Umzugsunternehmen", icon: "📦", group: "Transport & Logistik", desc: "Bürogebäude, Arztpraxen, Hotels, Kanzleien" },
  { id: "lager_fulfillment", label: "Lager & Fulfillment", icon: "🏭", group: "Transport & Logistik", desc: "Online-Shops, Großhändler, E-Commerce-Marken" },
  { id: "personal_zeitarbeit", label: "Personal & Zeitarbeit", icon: "👥", group: "Personal & HR", desc: "Produktion, Logistik, Handel, Gastronomie" },
  { id: "schulungen_weiterbildung", label: "Schulungen & Weiterbildung", icon: "📚", group: "Personal & HR", desc: "Unternehmen, Verbände, Behörden, Kammern" },
  { id: "buchhaltung_steuernahe_dienste", label: "Buchhaltung & Steuer", icon: "💰", group: "Finanzen & Recht", desc: "KMU, Selbständige, Handwerksbetriebe" },
  { id: "marketing_webdesign_werbung", label: "Marketing & Webdesign", icon: "📱", group: "Marketing & Kommunikation", desc: "KMU, Gastgewerbe, Einzelhandel, Handwerk" },
  { id: "fuhrparkservice_fahrzeugpflege", label: "Fuhrparkservice", icon: "🚗", group: "Fahrzeug & Mobilität", desc: "Flottenbetreiber, Behörden, Lieferdienste" },
  { id: "pflege_betreuung", label: "Pflege & Betreuung", icon: "🏥", group: "Gesundheit & Soziales", desc: "Kommunen, Wohlfahrtsverbände, Privatkliniken" },
  { id: "industrieservice", label: "Industrieservice", icon: "⚙️", group: "Industrie & Produktion", desc: "Produktionsanlagen, Chemie, Maschinenbau" },
  { id: "immobilien", label: "Immobilien", icon: "🏘️", group: "Immobilien & Bau", desc: "Wohnungsbaugesellschaften, Investoren, Kommunen" },
];

const grouped = INDUSTRIES.reduce((acc, ind) => {
  if (!acc[ind.group]) acc[ind.group] = [];
  acc[ind.group].push(ind);
  return acc;
}, {});

export default function BranchenUebersicht() {
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
          🏭 40+ Branchen verfügbar
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 16 }}>
          B2B Leads für{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            jede Branche
          </span>
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, maxWidth: 720 }}>
          Vertriebo kennt die spezifischen Zielkunden von über 40 lokalen Dienstleistungsbranchen. Wählen Sie Ihre Branche und starten Sie sofort mit der automatischen Firmenrecherche.
        </p>
      </section>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 64px" }}>
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {group}
            </h2>
            <div className="uebersicht-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {items.map(ind => (
                <a key={ind.id} href={`/branchen/${ind.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, textDecoration: "none", transition: "border-color 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(37,99,235,0.4)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}
                >
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{ind.icon}</span>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>{ind.label}</p>
                    <p style={{ fontSize: 12, color: "rgba(100,116,139,1)", lineHeight: 1.5 }}>{ind.desc}</p>
                  </div>
                  <ArrowRight size={14} color="rgba(100,116,139,0.5)" style={{ marginLeft: "auto", flexShrink: 0, marginTop: 4 }} />
                </a>
              ))}
            </div>
          </div>
        ))}
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