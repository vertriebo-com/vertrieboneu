export default function SEOFooter() {
  return (
    <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "56px 24px 32px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* LOGO + TAGLINE */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 48 }}>
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo – B2B Leadgenerierung für lokale Dienstleister" style={{ height: 110, width: "auto", objectFit: "contain", marginBottom: 10, opacity: 0.7 }} />
          <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", textAlign: "center" }}>Automatisierte B2B-Leadgenerierung · KI-Lead-Scoring · CRM für lokale Dienstleister</p>
          <p style={{ fontSize: 12, color: "rgba(71,85,105,1)" }}>
            <a href="tel:026019131820" style={{ color: "rgba(100,116,139,1)", textDecoration: "none" }}>📞 02601/9131820</a>
            {" · "}
            <a href="mailto:info@huwa-gebaeudedienste.de" style={{ color: "rgba(100,116,139,1)", textDecoration: "none" }}>✉️ info@huwa-gebaeudedienste.de</a>
          </p>
        </div>

        {/* NAVIGATIONSBLÖCKE */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 32, marginBottom: 48 }}>

          {/* PRODUKT */}
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: "rgba(148,163,184,1)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Produkt</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                ["Was ist B2B Leadgenerierung?", "/was-ist-leadgenerierung"],
                ["Automatisierte Recherche", "/automatisierte-recherche"],
                ["KI-Lead-Scoring", "/ki-lead-scoring"],
                ["Preise & Pläne", "/preise"],
                ["Funktionen", "/#wie-es-funktioniert"],
              ].map(([l, h]) => <a key={l} href={h} style={{ fontSize: 13, color: "rgba(100,116,139,1)", textDecoration: "none" }}>{l}</a>)}
            </div>
          </div>

          {/* BRANCHEN */}
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: "rgba(148,163,184,1)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Branchen</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                ["Alle Branchen", "/branchen"],
                ["Gebäudereinigung", "/branchen/gebaeudereinigung"],
                ["Facility Service", "/branchen/facility_service"],
                ["IT-Service", "/branchen/it_service"],
                ["Sicherheitsdienst", "/branchen/sicherheitsdienst"],
                ["Handwerk", "/branchen/handwerk"],
                ["Gartenbau", "/branchen/gartenbau"],
                ["SHK / Heizung", "/branchen/shk"],
              ].map(([l, h]) => <a key={l} href={h} style={{ fontSize: 13, color: "rgba(100,116,139,1)", textDecoration: "none" }}>{l}</a>)}
            </div>
          </div>

          {/* REGIONEN */}
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: "rgba(148,163,184,1)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Regionen</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                ["Frankfurt am Main", "/branchen/gebaeudereinigung/frankfurt-am-main"],
                ["München", "/branchen/gebaeudereinigung/muenchen"],
                ["Berlin", "/branchen/gebaeudereinigung/berlin"],
                ["Hamburg", "/branchen/gebaeudereinigung/hamburg"],
                ["Köln", "/branchen/gebaeudereinigung/koeln"],
                ["Düsseldorf", "/branchen/gebaeudereinigung/duesseldorf"],
                ["Stuttgart", "/branchen/gebaeudereinigung/stuttgart"],
                ["Alle Regionen →", "/branchen"],
              ].map(([l, h]) => <a key={l} href={h} style={{ fontSize: 13, color: "rgba(100,116,139,1)", textDecoration: "none" }}>{l}</a>)}
            </div>
          </div>

          {/* WISSEN */}
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: "rgba(148,163,184,1)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Wissen & Ratgeber</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                ["Was ist CRM?", "/was-ist-leadgenerierung"],
                ["Was ist Lead-Scoring?", "/ki-lead-scoring"],
                ["B2B Kaltakquise", "/was-ist-leadgenerierung"],
                ["Firmenrecherche automatisieren", "/automatisierte-recherche"],
                ["Vertriebssoftware für KMU", "/preise"],
              ].map(([l, h]) => <a key={l} href={h} style={{ fontSize: 13, color: "rgba(100,116,139,1)", textDecoration: "none" }}>{l}</a>)}
            </div>
          </div>

          {/* UNTERNEHMEN */}
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: "rgba(148,163,184,1)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Unternehmen</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {[
                ["Über Vertriebo", "/ueber-uns"],
                ["Kontakt", "/kontakt"],
                ["Investor Relations", "/investors"],
                ["Preise", "/preise"],
                ["Anmelden", "/anmelden"],
                ["Registrieren", "/registrieren"],
              ].map(([l, h]) => <a key={l} href={h} style={{ fontSize: 13, color: "rgba(100,116,139,1)", textDecoration: "none" }}>{l}</a>)}
            </div>
          </div>

        </div>

        {/* BRANCHEN-TAGS – für SEO-Crawler sichtbar */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 24, marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(71,85,105,1)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Weitere Branchen</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              ["Catering", "/branchen/catering"],
              ["Maler", "/branchen/maler_renovierung"],
              ["Elektro", "/branchen/elektro_gebaeudetechnik"],
              ["Spedition", "/branchen/spedition_logistik"],
              ["Zeitarbeit", "/branchen/personal_zeitarbeit"],
              ["Industrieservice", "/branchen/industrieservice"],
              ["Buchhaltung", "/branchen/buchhaltung_steuernahe_dienste"],
              ["Fuhrparkservice", "/branchen/fuhrparkservice_fahrzeugpflege"],
              ["Pflege", "/branchen/pflege_betreuung"],
              ["Messebau", "/branchen/messebau"],
              ["Lager", "/branchen/lager_fulfillment"],
              ["Umzugsunternehmen", "/branchen/umzugsunternehmen"],
              ["Eventservice", "/branchen/eventservice"],
              ["Marketing", "/branchen/marketing_webdesign_werbung"],
              ["Immobilien", "/branchen/immobilien"],
              ["Schulungen", "/branchen/schulungen_weiterbildung"],
            ].map(([l, h]) => (
              <a key={l} href={h} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(71,85,105,1)", textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>

        {/* RECHTLICHES */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 20, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ color: "rgba(51,65,85,1)", fontSize: 11 }}>© 2026 Vertriebo · Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste, Mittelweg 24, 56566 Neuwied</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {[["Impressum", "/impressum"], ["Datenschutz", "/datenschutz"], ["AGB", "/agb"]].map(([l, h]) => (
              <a key={l} href={h} style={{ color: "rgba(71,85,105,1)", fontSize: 11, textDecoration: "none" }}>{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}