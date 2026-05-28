import { ArrowRight, CheckCircle2, Search, Brain, Target, TrendingUp, Building2, MapPin } from "lucide-react";
import SEOFooter from "@/components/SEOFooter";

const INDUSTRIES = [
  { id: "gebaeudereinigung", label: "Gebäudereinigung", icon: "🏢" },
  { id: "facility_service", label: "Facility Service", icon: "🏠" },
  { id: "it_service", label: "IT-Service", icon: "💻" },
  { id: "sicherheitsdienst", label: "Sicherheitsdienst", icon: "🛡️" },
  { id: "handwerk", label: "Handwerk", icon: "🔨" },
  { id: "gartenbau", label: "Gartenbau", icon: "🌿" },
  { id: "catering", label: "Catering", icon: "🍽️" },
  { id: "maler_renovierung", label: "Maler & Renovierung", icon: "🧹" },
  { id: "shk", label: "SHK / Sanitär", icon: "🔧" },
  { id: "elektro_gebaeudetechnik", label: "Elektro", icon: "⚡" },
];

export default function WasIstB2BLeadgenerierung() {
  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      {/* SEO Head via meta tags via index.html — page title set dynamically */}

      {/* NAV */}
      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 120, width: "auto", objectFit: "contain" }} />
        </a>
        <a href="/#waitlist-form" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none", whiteSpace: "nowrap" }}>
          Kostenlos starten →
        </a>
      </nav>

      {/* BREADCRUMB */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 20px 0" }}>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
          <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>Vertriebo</a>
          {" › "}
          <span style={{ color: "rgba(148,163,184,1)" }}>Was ist B2B Leadgenerierung?</span>
        </p>
      </div>

      {/* HERO */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 56px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#93c5fd", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
          📚 Ratgeber & Wissen
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 20 }}>
          Was ist <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>B2B Leadgenerierung</span>?
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 32, maxWidth: 720 }}>
          B2B Leadgenerierung ist der systematische Prozess, neue Geschäftskunden (Business-to-Business) zu identifizieren und deren Kontaktdaten zu erfassen — damit Ihr Vertriebsteam gezielt ansprechen kann, wer tatsächlich Bedarf an Ihren Dienstleistungen hat.
        </p>
        <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 15, padding: "13px 24px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 30px rgba(37,99,235,0.4)" }}>
          Jetzt Leads generieren <ArrowRight size={16} />
        </a>
      </section>

      {/* WAS BEDEUTET DAS */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 32, letterSpacing: -0.5 }}>
            Leadgenerierung im B2B – was steckt dahinter?
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              { icon: <Search size={20} color="#60a5fa" />, title: "Firmen finden", desc: "Unternehmen in Ihrer Branche und Region systematisch aufspüren — nicht per Hand googeln, sondern automatisiert und vollständig." },
              { icon: <Target size={20} color="#a78bfa" />, title: "Zielgruppe definieren", desc: "Genau festlegen, welche Typen von Unternehmen als Kunden in Frage kommen — nach Branche, Größe und Region." },
              { icon: <Brain size={20} color="#34d399" />, title: "KI-Bewertung", desc: "Jeden gefundenen Kontakt nach Relevanz bewerten, sodass Ihr Vertrieb zuerst die vielversprechendsten Leads anruft." },
              { icon: <TrendingUp size={20} color="#fbbf24" />, title: "Pipeline aufbauen", desc: "Aus rohen Firmendaten eine strukturierte Verkaufspipeline entwickeln, die Sie Schritt für Schritt zum Abschluss führt." },
            ].map((item, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>{item.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "white" }}>{item.title}</h3>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.65 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WARUM WICHTIG */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
        <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 20, letterSpacing: -0.5 }}>
          Warum ist Leadgenerierung für lokale B2B-Dienstleister so wichtig?
        </h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 28, maxWidth: 700 }}>
          Lokale Dienstleister wie Gebäudereiniger, Facility-Manager, IT-Techniker oder Handwerksbetriebe leben von Stammkunden — aber für Wachstum brauchen sie ständig neue Aufträge. Das Problem: Die meisten haben keine strukturierte Methode, um potenzielle Kunden zu finden.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            "Manuelle Google-Suche ist zeitaufwändig und unvollständig",
            "Gekaufte Adresslisten sind teuer und oft veraltet",
            "Kaltakquise ohne Priorisierung verschwendet Vertriebszeit",
            "Ohne System gehen Follow-ups verloren und Leads werden kalt",
            "Regionale Märkte werden nie vollständig abgedeckt",
          ].map((point, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)", borderRadius: 10 }}>
              <span style={{ fontSize: 14, color: "#f87171", marginTop: 1 }}>✗</span>
              <span style={{ fontSize: 14, color: "rgba(203,213,225,1)" }}>{point}</span>
            </div>
          ))}
        </div>
      </section>

      {/* WIE VERTRIEBO LÖST ES */}
      <section style={{ background: "rgba(37,99,235,0.05)", borderTop: "1px solid rgba(37,99,235,0.12)", borderBottom: "1px solid rgba(37,99,235,0.12)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 12, letterSpacing: -0.5 }}>
            Wie Vertriebo B2B Leadgenerierung löst
          </h2>
          <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 32, maxWidth: 680 }}>
            Vertriebo ist speziell für lokale B2B-Dienstleister entwickelt. Statt stundenlanger Recherche durchsucht die Plattform automatisch Ihr Suchgebiet nach passenden Firmenkontakten — bewertet von der KI nach Ihrer Zielgruppe.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              "Automatische Firmenrecherche in Ihrem Umkreis (z.B. 25 km um Frankfurt)",
              "KI bewertet jeden Kontakt 0–100 nach Relevanz für Ihre Branche",
              "Täglich aktualisierte Prioritätsliste: Wen soll ich heute anrufen?",
              "Vollständige Kontakthistorie: Notizen, E-Mails, Rückrufzeiten",
              "System lernt aus Ihren Erfolgen und wird täglich besser",
            ].map((point, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10 }}>
                <CheckCircle2 size={16} color="#4ade80" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "rgba(203,213,225,1)" }}>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BRANCHEN */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
        <h2 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 800, marginBottom: 12, letterSpacing: -0.5 }}>
          Für welche Branchen ist B2B Leadgenerierung mit Vertriebo geeignet?
        </h2>
        <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", marginBottom: 24, lineHeight: 1.7 }}>
          Vertriebo kennt über 40 lokale Dienstleistungsbranchen und deren spezifische Zielkunden. Hier sind einige der beliebtesten:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {INDUSTRIES.map(ind => (
            <a key={ind.id} href={`/branchen/${ind.id}`} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", color: "#93c5fd", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              <span>{ind.icon}</span> {ind.label}
            </a>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(22px,4vw,40px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>
          Bereit für automatisierte B2B Leadgenerierung?
        </h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
          Vertriebo findet täglich neue Firmenkontakte in Ihrem Suchgebiet — vollautomatisch, KI-bewertet, sofort einsatzbereit.
        </p>
        <a href="/#waitlist-form" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
          Frühen Zugang sichern <ArrowRight size={16} />
        </a>
        <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 14 }}>Keine Kreditkarte · DSGVO-konform · Sofort einsatzbereit</p>
      </section>

      <SEOFooter />
    </div>
  );
}