const INDUSTRIES = [
  "gebaeudereinigung","sicherheitsdienst","it_service","gartenbau","catering",
  "handwerk","spedition_logistik","facility_service","entruempelung","maler_renovierung",
  "elektro_gebaeudetechnik","shk","eventservice","marketing_webdesign_werbung",
  "personal_zeitarbeit","buchhaltung_steuernahe_dienste","industrieservice",
  "fuhrparkservice_fahrzeugpflege","pflege_betreuung","schulungen_weiterbildung",
  "immobilien","lager_fulfillment","messebau","umzugsunternehmen",
];

const CITIES = [
  "berlin","hamburg","muenchen","koeln","frankfurt-am-main","stuttgart","duesseldorf",
  "dortmund","essen","leipzig","bremen","dresden","hannover","nuernberg","duisburg",
  "bochum","wuppertal","bielefeld","bonn","muenster","mannheim","karlsruhe","augsburg",
  "wiesbaden","moenchengladbach","gelsenkirchen","aachen","braunschweig","kiel","chemnitz",
  "magdeburg","freiburg-im-breisgau","krefeld","luebeck","oberhausen","erfurt","rostock",
  "mainz","kassel","hagen","hamm","saarbruecken","muelheim-an-der-ruhr","potsdam",
  "ludwigshafen","oldenburg","leverkusen","darmstadt","heidelberg","solingen",
];

const BASE = "https://vertriebo.com";

function u(loc: string, changefreq: string, priority: string) {
  return `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

Deno.serve(async (_req) => {
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,

    // Hauptseiten
    u(`${BASE}/`, "weekly", "1.0"),
    u(`${BASE}/preise`, "monthly", "0.9"),
    u(`${BASE}/registrieren`, "monthly", "0.8"),
    u(`${BASE}/anmelden`, "monthly", "0.6"),
    u(`${BASE}/ueber-uns`, "monthly", "0.7"),
    u(`${BASE}/kontakt`, "monthly", "0.7"),

    // Content / SEO
    u(`${BASE}/was-ist-leadgenerierung`, "monthly", "0.8"),
    u(`${BASE}/automatisierte-recherche`, "monthly", "0.8"),
    u(`${BASE}/ki-lead-scoring`, "monthly", "0.8"),

    // Branchen-Übersicht
    u(`${BASE}/branchen`, "weekly", "0.9"),

    // Branchen-Seiten
    ...INDUSTRIES.map(ind => u(`${BASE}/branchen/${ind}`, "weekly", "0.8")),

    // Branchen × Städte
    ...INDUSTRIES.flatMap(ind =>
      CITIES.map(city => u(`${BASE}/branchen/${ind}/${city}`, "monthly", "0.7"))
    ),

    // Rechtliches
    u(`${BASE}/impressum`, "yearly", "0.3"),
    u(`${BASE}/datenschutz`, "yearly", "0.3"),
    u(`${BASE}/agb`, "yearly", "0.3"),
    u(`${BASE}/investors`, "monthly", "0.4"),

    `</urlset>`,
  ];

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
});