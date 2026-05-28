import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, MapPin, Building2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import SEOFooter from "@/components/SEOFooter";

const CITIES_SEO = [
  "Frankfurt am Main", "München", "Berlin", "Hamburg", "Köln", "Düsseldorf",
  "Stuttgart", "Dortmund", "Essen", "Bremen", "Hannover", "Nürnberg",
  "Leipzig", "Dresden", "Bochum", "Wuppertal", "Bonn", "Bielefeld",
  "Mannheim", "Karlsruhe", "Wiesbaden", "Münster", "Augsburg", "Aachen",
];

export default function BranchenPage() {
  const { industryId } = useParams();
  const [taxonomy, setTaxonomy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!industryId) return;
    (async () => {
      try {
        const records = await base44.entities.TaxonomyEntry.filter({ industry_id: industryId, is_active: true });
        if (records[0]) {
          const r = records[0];
          setTaxonomy({
            label: r.label,
            industry_id: r.industry_id,
            own_services: r.own_services ? JSON.parse(r.own_services) : [],
            target_customer_types: r.target_customer_types ? JSON.parse(r.target_customer_types) : [],
            searchable_business_categories: r.searchable_business_categories ? JSON.parse(r.searchable_business_categories) : [],
            profile_group: r.profile_group || "",
            search_strategy: r.search_strategy || "",
          });
        }
      } catch (e) {
        console.warn("Taxonomy load error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [industryId]);

  const label = taxonomy?.label || industryId?.replace(/_/g, " ") || "Ihre Branche";
  const services = taxonomy?.own_services?.slice(0, 6) || [];
  const customers = taxonomy?.target_customer_types?.slice(0, 6) || [];
  const categories = taxonomy?.searchable_business_categories?.slice(0, 6) || [];

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <style>{`
        @media (max-width: 640px) {
          .branchen-grid { grid-template-columns: 1fr !important; }
          .branchen-hero h1 { font-size: 28px !important; }
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
          <span style={{ color: "rgba(148,163,184,1)" }}>{label}</span>
        </p>
      </div>

      {loading ? (
        <div style={{ maxWidth: 900, margin: "60px auto", padding: "0 20px", textAlign: "center", color: "rgba(100,116,139,1)" }}>
          Lade Branchenprofil…
        </div>
      ) : (
        <>
          <section className="branchen-hero" style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 56px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#93c5fd", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
              🏭 Branchenprofil · {taxonomy?.profile_group || "Dienstleistung"}
            </div>
            <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 20 }}>
              B2B Leads für{" "}
              <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {label}
              </span>
            </h1>
            <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 32, maxWidth: 720 }}>
              Vertriebo findet automatisch passende Firmenkontakte für Ihr {label}-Unternehmen — in Ihrem Suchgebiet, täglich aktuell, KI-bewertet und priorisiert. Kein manuelles Googeln mehr.
            </p>
            <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 15, padding: "13px 24px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 30px rgba(37,99,235,0.4)" }}>
              Jetzt Leads für {label} finden <ArrowRight size={16} />
            </a>
          </section>

          {/* DIENSTLEISTUNGEN */}
          {services.length > 0 && (
            <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
                <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 20, letterSpacing: -0.5 }}>
                  Typische Leistungen im Bereich {label}
                </h2>
                <div className="branchen-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  {services.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: 10 }}>
                      <CheckCircle2 size={14} color="#60a5fa" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "rgba(203,213,225,1)" }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ZIELKUNDEN */}
          {customers.length > 0 && (
            <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
              <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 12, letterSpacing: -0.5 }}>
                Wer sind die typischen Kunden für {label}?
              </h2>
              <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", marginBottom: 20, lineHeight: 1.7 }}>
                Vertriebo kennt die Zielgruppen für {label} genau und sucht gezielt nach diesen Unternehmenstypen in Ihrem Suchgebiet:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {customers.map((c, i) => (
                  <span key={i} style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 999, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", color: "#c4b5fd" }}>
                    🏢 {c}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* WIE VERTRIEBO HILFT */}
          <section style={{ background: "rgba(37,99,235,0.05)", borderTop: "1px solid rgba(37,99,235,0.12)", borderBottom: "1px solid rgba(37,99,235,0.12)" }}>
            <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
              <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>
                So hilft Vertriebo {label}-Unternehmen bei der Kundengewinnung
              </h2>
              <div className="branchen-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  { icon: "🔍", title: "Automatische Firmensuche", desc: `Vertriebo sucht täglich nach neuen Auftraggebern für ${label} in Ihrem Umkreis.` },
                  { icon: "🧠", title: "KI-Score 0–100", desc: "Jeder Lead wird bewertet — Sie sehen sofort, welche Firmen am vielversprechendsten sind." },
                  { icon: "📋", title: "Priorisierte Tagesliste", desc: "Jeden Morgen: Ihre wichtigsten Anrufe des Tages, automatisch sortiert nach Potenzial." },
                  { icon: "📞", title: "Vollständige Kontakthistorie", desc: "Alle Gespräche, Notizen und Follow-ups zu jedem Lead an einem Ort." },
                ].map((item, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 14px" }}>
                    <p style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</p>
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{item.title}</h3>
                    <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* REGIONALE LINKS */}
          <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
            <h2 style={{ fontSize: "clamp(18px,2.5vw,26px)", fontWeight: 800, marginBottom: 12, letterSpacing: -0.5 }}>
              {label} Leads nach Regionen
            </h2>
            <p style={{ fontSize: 14, color: "rgba(100,116,139,1)", marginBottom: 20 }}>
              Vertriebo ist für alle deutschen Städte und Regionen verfügbar:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CITIES_SEO.map(city => {
                const slug = city.toLowerCase().replace(/\s+/g, "-").replace(/[äöü]/g, c => ({ ä: "ae", ö: "oe", ü: "ue" }[c]));
                return (
                  <a key={city} href={`/branchen/${industryId}/${slug}`} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", color: "#93c5fd", textDecoration: "none" }}>
                    <MapPin size={10} style={{ display: "inline", marginRight: 4 }} />{label} in {city}
                  </a>
                );
              })}
            </div>
          </section>

          <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
            <h2 style={{ fontSize: "clamp(22px,4vw,40px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>
              Mehr Aufträge für Ihr {label}-Unternehmen
            </h2>
            <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
              Vertriebo findet täglich neue Firmenkontakte in Ihrem Suchgebiet. Jetzt frühen Zugang sichern.
            </p>
            <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
              Frühen Zugang sichern <ArrowRight size={16} />
            </a>
            <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 14 }}>Keine Kreditkarte · DSGVO-konform · In 5 Minuten startklar</p>
          </section>
        </>
      )}

      <SEOFooter />
    </div>
  );
}