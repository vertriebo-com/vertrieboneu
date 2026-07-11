import { useEffect } from "react";

// Alle Branchen-IDs
const INDUSTRIES = [
  "gebaeudereinigung","sicherheitsdienst","it_service","gartenbau","catering",
  "handwerk","spedition_logistik","facility_service","entruempelung","maler_renovierung",
  "elektro_gebaeudetechnik","shk","eventservice","marketing_webdesign_werbung",
  "personal_zeitarbeit","buchhaltung_steuernahe_dienste","industrieservice",
  "fuhrparkservice_fahrzeugpflege","pflege_betreuung","schulungen_weiterbildung",
  "immobilien","lager_fulfillment","messebau","umzugsunternehmen",
];

// Wichtigste Städte für Branchen-Stadt-Seiten
const CITIES = [
  "berlin","hamburg","muenchen","koeln","frankfurt-am-main","stuttgart","duesseldorf",
  "dortmund","essen","leipzig","bremen","dresden","hannover","nuernberg","duisburg",
  "bochum","wuppertal","bielefeld","bonn","muenster","mannheim","karlsruhe","augsburg",
  "wiesbaden","moenchengladbach","gelsenkirchen","aachen","braunschweig","kiel","chemnitz",
  "magdeburg","freiburg-im-breisgau","krefeld","luebeck","oberhausen","erfurt","rostock",
  "mainz","kassel","hagen","hamm","saarbruecken","muelheim-an-der-ruhr","potsdam",
  "ludwigshafen","oldenburg","leverkusen","darmstadt","heidelberg","solingen",
];

const BASE = "https://vertriebo.de";
const TODAY = new Date().toISOString().slice(0, 10);

function urls() {
  const lines = [];
  const add = (loc, changefreq, priority, lastmod = TODAY) =>
    lines.push(`  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`);

  // ── Hauptseiten ───────────────────────────────────────────────────────────
  add(`${BASE}/`, "weekly", "1.0");
  add(`${BASE}/preise`, "monthly", "0.9");
  add(`${BASE}/registrieren`, "monthly", "0.8");
  add(`${BASE}/anmelden`, "monthly", "0.6");
  add(`${BASE}/ueber-uns`, "monthly", "0.7");
  add(`${BASE}/kontakt`, "monthly", "0.7");

  // ── Content / SEO ─────────────────────────────────────────────────────────
  add(`${BASE}/was-ist-leadgenerierung`, "monthly", "0.8");
  add(`${BASE}/automatisierte-recherche`, "monthly", "0.8");
  add(`${BASE}/ki-lead-scoring`, "monthly", "0.8");

  // ── Branchen-Übersicht ────────────────────────────────────────────────────
  add(`${BASE}/branchen`, "weekly", "0.9");

  // ── Branchen-Seiten ───────────────────────────────────────────────────────
  for (const ind of INDUSTRIES) {
    add(`${BASE}/branchen/${ind}`, "weekly", "0.8");
  }

  // ── Branchen × Städte ─────────────────────────────────────────────────────
  for (const ind of INDUSTRIES) {
    for (const city of CITIES) {
      add(`${BASE}/branchen/${ind}/${city}`, "monthly", "0.7");
    }
  }

  // ── Rechtliches ───────────────────────────────────────────────────────────
  add(`${BASE}/impressum`, "yearly", "0.3");
  add(`${BASE}/datenschutz`, "yearly", "0.3");
  add(`${BASE}/agb`, "yearly", "0.3");
  add(`${BASE}/investors`, "monthly", "0.4");

  return lines.join("\n");
}

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls()}
</urlset>`;

export default function SitemapXml() {
  useEffect(() => {
    // Replace the entire document with raw XML
    document.open("application/xml");
    document.write(SITEMAP);
    document.close();
  }, []);

  return null;
}