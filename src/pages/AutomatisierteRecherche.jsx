import { ArrowRight, CheckCircle2, MapPin, Zap, Shield, BarChart3 } from "lucide-react";
import SEOFooter from "@/components/SEOFooter";

export default function AutomatisierteRecherche() {
  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white" }}>
      <nav style={{ background: "rgba(2,6,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/">
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 120, objectFit: "contain" }} />
        </a>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="/preise" style={{ color: "rgba(148,163,184,1)", fontWeight: 600, fontSize: 13, padding: "9px 14px", borderRadius: 9, textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)" }}>Preise</a>
          <a href="/kontakt" style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 9, textDecoration: "none" }}>
            Demo anfragen →
          </a>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 20px 0" }}>
        <p style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
          <a href="/" style={{ color: "#60a5fa", textDecoration: "none" }}>Vertriebo</a> {" › "}
          <span style={{ color: "rgba(148,163,184,1)" }}>Automatisierte Firmenrecherche</span>
        </p>
      </div>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 56px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#93c5fd", fontSize: 11, fontWeight: 700, marginBottom: 20 }}>
          🔍 Funktionen & Features
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, marginBottom: 20 }}>
          Automatisierte{" "}
          <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Firmenrecherche
          </span>{" "}
          für B2B-Dienstleister
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.8, marginBottom: 32, maxWidth: 720 }}>
          Vertriebo durchsucht automatisch alle Orte und Gemeinden in Ihrem Suchgebiet nach passenden Firmenkontakten — vollständig, täglich aktuell und ohne manuellen Aufwand. Kein Googeln mehr, kein Adressbuch, keine veralteten Listen.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a href="/kontakt" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 15, padding: "13px 24px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 30px rgba(37,99,235,0.4)" }}>
            Jetzt Demo anfragen <ArrowRight size={16} />
          </a>
          <a href="/preise" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontWeight: 600, fontSize: 14, padding: "13px 20px", borderRadius: 12, textDecoration: "none" }}>
            Preise ansehen
          </a>
        </div>
      </section>

      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 32, letterSpacing: -0.5 }}>Wie die automatische Recherche funktioniert</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { step: "01", title: "Suchgebiet festlegen", desc: "Sie geben Ihre Stadt und den gewünschten Radius ein (z.B. Frankfurt, 25 km). Vertriebo analysiert daraufhin alle Postleitzahlen, Ortschaften und Gemeinden in diesem Bereich — lückenlos.", color: "#60a5fa" },
              { step: "02", title: "Branchenprofil laden", desc: "Basierend auf Ihrer Branche (z.B. Gebäudereinigung, IT-Service, Handwerk) lädt Vertriebo das passende Suchprofil mit den richtigen Zielkunden, Suchbegriffen und Qualitätskriterien.", color: "#a78bfa" },
              { step: "03", title: "Automatische Suche starten", desc: "Mit einem Klick startet die Recherche. Vertriebo durchsucht systematisch alle relevanten Orte im Radius und findet Firmenkontakte, die zu Ihrem Profil passen.", color: "#34d399" },
              { step: "04", title: "KI-Filterung & Bewertung", desc: "Jeder gefundene Kontakt wird von der KI bewertet: Passt er zu Ihrer Zielgruppe? Ist er ein Duplikat? Hat er Telefon und Adresse? Nur qualifizierte Leads werden gespeichert.", color: "#fbbf24" },
              { step: "05", title: "Leads in Ihrer Pipeline", desc: "Die gespeicherten Firmenkontakte erscheinen sofort in Ihrer Leadliste — priorisiert nach KI-Score, mit Kontaktdaten, bereit zum Anrufen.", color: "#f87171" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 20, paddingBottom: i < 4 ? 32 : 0, marginBottom: i < 4 ? 32 : 0, borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: s.color, flexShrink: 0 }}>{s.step}</div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "white", marginBottom: 6 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px" }}>
        <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, marginBottom: 32, letterSpacing: -0.5 }}>Vorteile gegenüber manueller Recherche</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {[
            { icon: <MapPin size={20} color="#60a5fa" />, title: "Lückenlose Gebietsabdeckung", desc: "Alle Orte und PLZ-Gebiete im Radius werden durchsucht — keine Region wird übersprungen." },
            { icon: <Zap size={20} color="#fbbf24" />, title: "Sofortergebnisse", desc: "Statt 2–3 Stunden manueller Suche: Ergebnisse in wenigen Minuten, automatisch und vollständig." },
            { icon: <Shield size={20} color="#34d399" />, title: "Qualitätskontrolle", desc: "KI filtert unpassende Firmen, Duplikate und irrelevante Treffer automatisch heraus." },
            { icon: <BarChart3 size={20} color="#a78bfa" />, title: "Skalierbar", desc: "Egal ob 10 oder 1.000 Leads — das System skaliert mit Ihren Anforderungen." },
          ].map((item, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 18px" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>{item.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{item.title}</h3>
              <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.65 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WEITERLESEN */}
      <section style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px" }}>
          <h2 style={{ fontSize: "clamp(20px,3vw,28px)", fontWeight: 800, marginBottom: 20, letterSpacing: -0.5 }}>Das gehört auch dazu</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {[
              { icon: "🤖", title: "KI-Lead-Scoring", desc: "Wie die KI jeden Lead 0–100 bewertet", href: "/ki-lead-scoring" },
              { icon: "📚", title: "Was ist B2B Leadgenerierung?", desc: "Grundlagen und Hintergründe", href: "/was-ist-leadgenerierung" },
              { icon: "🏭", title: "Alle Branchen", desc: "Verfügbare Branchenprofile ansehen", href: "/branchen" },
            ].map((c, i) => (
              <a key={i} href={c.href} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "18px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, textDecoration: "none", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(37,99,235,0.4)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"}
              >
                <span style={{ fontSize: 22 }}>{c.icon}</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{c.title}</p>
                <p style={{ fontSize: 12, color: "rgba(100,116,139,1)", lineHeight: 1.5 }}>{c.desc}</p>
                <span style={{ fontSize: 12, color: "#60a5fa", marginTop: 4 }}>Jetzt lesen →</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "56px 20px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(22px,4vw,40px)", fontWeight: 900, marginBottom: 14, letterSpacing: -1 }}>
          Starten Sie heute mit automatischer Firmenrecherche
        </h2>
        <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
          Kein manuelles Googeln mehr. Vertriebo findet täglich neue Firmenkontakte in Ihrem Gebiet.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <a href="/kontakt" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 0 40px rgba(37,99,235,0.5)" }}>
            Demo anfragen <ArrowRight size={16} />
          </a>
          <a href="/preise" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontWeight: 700, fontSize: 15, padding: "14px 28px", borderRadius: 12, textDecoration: "none" }}>
            Preise ansehen
          </a>
        </div>
        <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 14 }}>Keine Kreditkarte · DSGVO-konform · In 5 Minuten startklar</p>
      </section>

      <SEOFooter />
    </div>
  );
}