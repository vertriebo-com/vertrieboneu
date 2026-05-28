import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import SEOFooter from "@/components/SEOFooter";

const CITY_DATA = {
  "frankfurt-am-main": { name: "Frankfurt am Main", state: "Hessen", region: "Rhein-Main-Gebiet" },
  "muenchen": { name: "München", state: "Bayern", region: "Oberbayern" },
  "berlin": { name: "Berlin", state: "Berlin", region: "Berlin-Brandenburg" },
  "hamburg": { name: "Hamburg", state: "Hamburg", region: "Metropolregion Hamburg" },
  "koeln": { name: "Köln", state: "Nordrhein-Westfalen", region: "Rheinland" },
  "duesseldorf": { name: "Düsseldorf", state: "Nordrhein-Westfalen", region: "Rheinland" },
  "stuttgart": { name: "Stuttgart", state: "Baden-Württemberg", region: "Stuttgarter Region" },
  "dortmund": { name: "Dortmund", state: "Nordrhein-Westfalen", region: "Ruhrgebiet" },
  "essen": { name: "Essen", state: "Nordrhein-Westfalen", region: "Ruhrgebiet" },
  "bremen": { name: "Bremen", state: "Bremen", region: "Nordwest" },
  "hannover": { name: "Hannover", state: "Niedersachsen", region: "Hannover Region" },
  "nuernberg": { name: "Nürnberg", state: "Bayern", region: "Metropolregion Nürnberg" },
  "leipzig": { name: "Leipzig", state: "Sachsen", region: "Mitteldeutschland" },
  "dresden": { name: "Dresden", state: "Sachsen", region: "Sachsen" },
  "wiesbaden": { name: "Wiesbaden", state: "Hessen", region: "Rhein-Main-Gebiet" },
  "mannheim": { name: "Mannheim", state: "Baden-Württemberg", region: "Metropolregion Rhein-Neckar" },
  "karlsruhe": { name: "Karlsruhe", state: "Baden-Württemberg", region: "Technologieregion Karlsruhe" },
  "muenster": { name: "Münster", state: "Nordrhein-Westfalen", region: "Münsterland" },
  "augsburg": { name: "Augsburg", state: "Bayern", region: "Bayerisch-Schwaben" },
  "aachen": { name: "Aachen", state: "Nordrhein-Westfalen", region: "Städteregion Aachen" },
};

export default function BranchenStadtPage() {
  const { industryId, citySlug } = useParams();
  const [taxonomy, setTaxonomy] = useState(null);
  const [loading, setLoading] = useState(true);

  const cityInfo = CITY_DATA[citySlug] || { name: citySlug?.replace(/-/g, " ") || "", state: "Deutschland", region: "Ihre Region" };

  useEffect(() => {
    if (!industryId) return;
    (async () => {
      try {
        const records = await base44.entities.TaxonomyEntry.filter({ industry_id: industryId, is_active: true });
        if (records[0]) {
          const r = records[0];
          setTaxonomy({
            label: r.label,
            own_services: r.own_services ? JSON.parse(r.own_services) : [],
            target_customer_types: r.target_customer_types ? JSON.parse(r.target_customer_types) : [],
            profile_group: r.profile_group || "",
          });
        }
      } catch (e) { console.warn(e); }
      finally { setLoading(false); }
    })();
  }, [industryId]);

  const label = taxonomy?.label || industryId?.replace(/_/g, " ") || "Ihre Branche";
  const services = taxonomy?.own_services?.slice(0, 6) || [];
  const customers = taxonomy?.target_customer_types?.slice(0, 5) || [];

  const titleText = `B2B Leads für ${label} in ${cityInfo.name}`;
  const descText = `Vertriebo findet automatisch passende Firmenkontakte für ${label}-Unternehmen in ${cityInfo.name} und der Region ${cityInfo.region}. KI-bewertet, täglich aktuell, DSGVO-konform.`;

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <style>{`
        @media (max-width: 640px) {
          .stadt-grid { grid-template-columns: 1fr !important; }
          .stadt-hero h1 { font-size: 26px !important; }
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

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 20px 0" }}>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
          <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>Vertriebo</a> {" › "}
          <a href="/branchen" style={{ color: "#60a5fa", textDecoration: "none" }}>Branchen</a> {" › "}
          <a href={`/branchen/${industryId}`} style={{ color: "#60a5fa", textDecoration: "none" }}>{label}</a> {" › "}
          <span style={{ color: "rgba(148,163,184,1)" }}>{cityInfo.name}</span>
        </p>
      </div>

      {loading ? (
        <div style={{ maxWidth: 900, margin: "60px auto", padding: "0 20px", textAlign: "center", color: "rgba(100,116,139,1)" }}>Lade Seite…</div>
      ) : (
        <>
          <section className="stadt-hero" style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 48px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#93c5fd", fontSize: 11, fontWeight: 700 }}>
                🏭 {taxonomy?.profile_group || "Dienstleistung"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80", fontSize: 11, fontWeight: 700 }}>
                <MapPin size={10} /> {cityInfo.state}
              </span>
            </div>
            <h1 style={{ fontSize: "clamp(26px,5vw,50px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 20 }}>
              {titleText.split(cityInfo.name).map((part, i, arr) => i < arr.length - 1 ? (
                <span key={i}>{part}<span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{cityInfo.name}</span></span>
              ) : part)}
            </h1>
            <p style={{ fontSize: "clamp(14px,2vw,17px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 32, maxWidth: 720 }}>
              {descText}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 }}>
              {["In 5 Minuten startklar", "Keine Kreditkarte", "DSGVO Made in Germany"].map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <CheckCircle2 size={10} color="#4ade80" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(203,213,225,1)" }}>{t}</span>
                </div>
              ))}
            </div>
            <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 15, padding: "13px 24px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 30px rgba(37,99,235,0.4)" }}>
              Leads in {cityInfo.name} finden <ArrowRight size={16} />
            </a>
          </section>

          {/* STATS */}
          <section style={{ background: "#060d1f", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "28px 20px" }}>
            <div className="stadt-grid" style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
              {[
                { v: "< 5 Min", l: "bis zum ersten Lead", s: `in ${cityInfo.name} und Umgebung` },
                { v: "100%", l: "DSGVO-konform", s: "Datenschutz Made in Germany" },
                { v: "KI-Score", l: "für jeden Lead", s: "Priorität automatisch bestimmt" },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: "center", padding: "12px 8px" }}>
                  <p style={{ fontSize: "clamp(18px,3vw,28px)", fontWeight: 900, background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 3 }}>{s.v}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "white", marginBottom: 2 }}>{s.l}</p>
                  <p style={{ fontSize: 10, color: "rgba(100,116,139,1)" }}>{s.s}</p>
                </div>
              ))}
            </div>
          </section>

          {/* LEISTUNGEN */}
          {services.length > 0 && (
            <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
              <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 12, letterSpacing: -0.5 }}>
                {label} in {cityInfo.name}: Typische Leistungen
              </h2>
              <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", marginBottom: 20, lineHeight: 1.7 }}>
                Vertriebo kennt die typischen Leistungen im Bereich {label} und sucht gezielt nach Kunden, die diese Dienstleistungen benötigen:
              </p>
              <div className="stadt-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                {services.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: 10 }}>
                    <CheckCircle2 size={14} color="#60a5fa" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(203,213,225,1)" }}>{s}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ZIELKUNDEN */}
          {customers.length > 0 && (
            <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
                <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 12, letterSpacing: -0.5 }}>
                  Wer sind Ihre Kunden in {cityInfo.name}?
                </h2>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", marginBottom: 20, lineHeight: 1.7 }}>
                  Vertriebo sucht in {cityInfo.name} und der Region {cityInfo.region} gezielt nach diesen Unternehmenstypen für {label}-Dienstleister:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {customers.map((c, i) => (
                    <span key={i} style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 999, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", color: "#c4b5fd" }}>
                      🏢 {c}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* WARUM VERTRIEBO */}
          <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
            <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>
              Warum Vertriebo für {label} in {cityInfo.name}?
            </h2>
            <div className="stadt-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { icon: "🔍", title: `Vollständige Abdeckung von ${cityInfo.name}`, desc: `Alle Ortsteile, Stadtbezirke und Umlandgemeinden in der Region ${cityInfo.region} werden durchsucht.` },
                { icon: "🧠", title: "KI kennt Ihre Zielgruppe", desc: `Das Branchenprofil für ${label} ist in Vertriebo hinterlegt — die KI sucht sofort nach den richtigen Unternehmen.` },
                { icon: "⚡", title: "Sofortige Ergebnisse", desc: `Statt stundenlanger manueller Recherche: Neue Leads in ${cityInfo.name} in wenigen Minuten.` },
                { icon: "📊", title: "Tägliche Updates", desc: `Vertriebo findet täglich neue Firmenkontakte in ${cityInfo.name} — Ihre Pipeline wächst automatisch.` },
              ].map((item, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 14px" }}>
                  <p style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</p>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{item.title}</h3>
                  <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(22px,4vw,38px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>
              {label} Leads in {cityInfo.name} — jetzt starten
            </h2>
            <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
              Sichern Sie sich frühen Zugang zu Vertriebo und erhalten Sie als erster Leads aus {cityInfo.name} und Umgebung.
            </p>
            <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
              Frühen Zugang sichern <ArrowRight size={16} />
            </a>
            <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 14 }}>Keine Kreditkarte · DSGVO-konform · In 5 Minuten startklar</p>
          </section>
        </>
      )}

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