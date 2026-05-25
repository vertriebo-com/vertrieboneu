/**
 * ============================================================
 * VERTRIEBO - generateLeads v2 (Phase C) — DEPRECATED
 * ============================================================
 *
 * ⚠️ DEPRECATED: Dieser Pfad ist NICHT der kanonische Kundenflow.
 *
 * KANONISCHER RESEARCH-FLOW (v3+):
 *   startResearchRun → processResearchRun → getResearchRunStatus
 *   Diese drei Funktionen nutzen die DB-Taxonomie (TaxonomyEntry),
 *   async ResearchRun-Status-Tracking, und korrekte Lock/Dedupe-Logik.
 *
 * DIESE FUNKTION:
 *   - Enthält eine veraltete Inline-Taxonomie (nur 23 Profile, ohne v6-Gewichte)
 *   - Ist synchron/blockierend (bis zu 40s Runtime)
 *   - Nutzt einen eigenen Settings-basierten Lock (lead_research_running)
 *     der nicht mit dem ResearchRun-Lock koordiniert ist
 *   - Wird nicht mehr direkt von Frontend-Seiten aufgerufen
 *   - Wird von runUnifiedResearch als Orchestrator gerufen (ebenfalls deprecated)
 *
 * AKTUELL NOCH AUFGERUFEN VON:
 *   - runUnifiedResearch (intern, kein direkter Frontend-Aufruf bekannt)
 *   - StartLeadsStep (alt, nicht mehr im aktiven Onboarding-Flow)
 *
 * NICHT LÖSCHEN OHNE vollständigen Audit: runUnifiedResearch + StartLeadsStep
 *
 * ============================================================
 * VERTRIEBO - generateLeads v2 (Phase C) — Original-Kommentar:
 * ============================================================
 * Nutzt die neue LeadSearchEngine Inline.
 *
 * ARCHITEKTUR-ENTSCHEIDUNG:
 * Da Deno Backend-Functions keine lokalen Imports unterstützen,
 * sind Taxonomy + Engine hier inline eingebettet.
 * utils/leadSearchTaxonomy.js und utils/leadSearchEngine.js
 * sind identische Kopien für Frontend-Nutzung.
 * EINE QUELLE DER WAHRHEIT: Änderungen müssen in beiden gepflegt werden.
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
const SEARCH_ENGINE_VERSION = "v2";

// ============================================================
// INLINE: LEAD SEARCH TAXONOMY
// (Quelle der Wahrheit: utils/leadSearchTaxonomy.js)
// ============================================================

const LEAD_SEARCH_TAXONOMY = {
  gebaeudereinigung: {
    id: "gebaeudereinigung", label: "Gebäudereinigung",
    searchableBusinessCategories: ["Hausverwaltung","Immobilienverwaltung","Bürogebäude","Ärztehaus","Arztpraxis","Zahnarztpraxis","Kindertagesstätte","Schule","Pflegeheim","Seniorenheim","Hotel","Autohaus","Fitnessstudio","Gewerbepark","Industrieunternehmen","Einzelhandel","Supermarkt"],
    idealCustomerProfiles: ["regelmäßiger Reinigungsbedarf","mehrere Standorte","größere Nutzfläche","laufende Objektbetreuung","wiederkehrende Dienstleistung","professionelle Verwaltung"],
    targetCustomerTypes: ["Hausverwaltungen","Immobilienverwaltungen","Bürogebäude","Arztpraxen","Zahnarztpraxen","Kitas","Schulen","Pflegeheime","Hotels","Autohäuser","Fitnessstudios"],
    negativeKeywords: ["privat","job","karriere","ausbildung","stellenangebot","minijob","kleinanzeigen","wohnung gesucht","mietgesuch"],
    badFitSignals: ["privat","job","karriere","kleinanzeige","einzelperson","mietgesuch","ausbildung"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","Immobilienverwaltung","WEG Verwaltung","Mietverwaltung"],
      "Arztpraxis": ["Arztpraxis","Ärztehaus","Zahnarztpraxis","Medizinisches Versorgungszentrum"],
      "Pflegeheim": ["Pflegeheim","Seniorenheim","Seniorenresidenz","Altenheim"],
      "Hotel": ["Hotel","Gasthof","Pension"],
      "Kindertagesstätte": ["Kindertagesstätte","Kita","Kindergarten"],
      "Schule": ["Schule","Gymnasium","Grundschule","Berufsschule"],
      "Bürogebäude": ["Bürogebäude","Gewerbepark","Business Center"],
    },
    scoringSignals: ["verwaltung","gewerbe","praxis","hotel","pflege","industrie","facility","büro","objekt","standort","wohnanlage","immobilien"],
    queryPriority: ["Hausverwaltung","Immobilienverwaltung","Pflegeheim","Arztpraxis","Hotel","Bürogebäude","Schule","Kindertagesstätte"],
  },
  sicherheitsdienst: {
    id: "sicherheitsdienst", label: "Sicherheitsdienst",
    searchableBusinessCategories: ["Bauunternehmen","Logistikzentrum","Industrieunternehmen","Veranstalter","Eventlocation","Hotel","Einkaufszentrum","Parkhaus","Messeveranstalter","Gewerbepark","Einzelhandel","Facility Management"],
    idealCustomerProfiles: ["hoher Sicherheitsbedarf","Publikumsverkehr","wertvolle Güter","Nachtbetrieb","Baustellenrisiko","große Flächen"],
    targetCustomerTypes: ["Baustellen","Bauunternehmen","Logistikzentren","Industriebetriebe","Veranstalter","Hotels"],
    negativeKeywords: ["job","stellenangebot","ausbildung","security job","privat","ehrenamt","karriere"],
    badFitSignals: ["job","karriere","privat","ehrenamt","ausbildung","bewerber"],
    searchKeywordVariants: {
      "Bauunternehmen": ["Bauunternehmen","Bauträger","Generalunternehmer"],
      "Eventlocation": ["Eventlocation","Veranstalter","Messeveranstalter","Kongresszentrum"],
      "Logistikzentrum": ["Industriebetrieb","Gewerbepark","Logistikzentrum","Produktionsbetrieb"],
      "Hotel": ["Hotel","Tagungshotel","Kongresshotel"],
    },
    scoringSignals: ["objektschutz","baustelle","logistik","industrie","veranstaltung","werkschutz","gewerbe","lager","messe"],
    queryPriority: ["Bauunternehmen","Logistikzentrum","Industrieunternehmen","Hotel","Eventlocation","Einkaufszentrum"],
  },
  it_service: {
    id: "it_service", label: "IT-Service",
    searchableBusinessCategories: ["Arztpraxis","Zahnarztpraxis","Steuerberater","Rechtsanwalt","Kanzlei","Pflegeheim","Schule","Handwerksbetrieb","Büro","Einzelhandel","Immobilienverwaltung","Logistikunternehmen","Unternehmensberatung","Ingenieurbüro"],
    idealCustomerProfiles: ["mehrere Arbeitsplätze","regelmäßiger IT-Bedarf","sensible Daten","Compliance-Anforderungen","Cloud-Nutzung"],
    targetCustomerTypes: ["Arztpraxen","Zahnarztpraxen","Steuerberater","Kanzleien","KMU","Schulen","Pflegeeinrichtungen","Handwerksbetriebe"],
    negativeKeywords: ["privat","gaming","job","karriere","ausbildung","computerhilfe privat","forum","blog"],
    badFitSignals: ["privat","gaming","job","forum","einzelperson","haushaltsgerät"],
    searchKeywordVariants: {
      "Arztpraxis": ["Arztpraxis","Zahnarztpraxis","Ärztehaus","Medizinisches Versorgungszentrum"],
      "Kanzlei": ["Rechtsanwalt","Kanzlei","Anwaltskanzlei","Steuerberater","Steuerberatung"],
      "Handwerksbetrieb": ["Handwerksbetrieb","Unternehmensberatung","Ingenieurbüro"],
      "Pflegeheim": ["Pflegeheim","Seniorenheim","Reha Zentrum"],
      "Schule": ["Schule","Gymnasium","Bildungszentrum"],
    },
    scoringSignals: ["praxis","kanzlei","steuer","pflege","schule","verwaltung","daten","büro","handwerk","logistik"],
    queryPriority: ["Arztpraxis","Zahnarztpraxis","Steuerberater","Rechtsanwalt","Kanzlei","Handwerksbetrieb","Pflegeheim","Schule"],
  },
  gartenbau: {
    id: "gartenbau", label: "Gartenbau",
    searchableBusinessCategories: ["Hausverwaltung","Immobilienverwaltung","Wohnanlage","Hotel","Gewerbepark","Pflegeheim","Kindertagesstätte","Schule","Facility Management","Bürogebäude","Industrieunternehmen","Friedhof"],
    idealCustomerProfiles: ["regelmäßige Außenpflege","größere Grünflächen","Wohnanlagenbestand","laufende Objektpflege","Winterdienstbedarf"],
    targetCustomerTypes: ["Hausverwaltungen","Immobilienverwaltungen","Wohnanlagen","Hotels","Gewerbeparks","Pflegeheime","Kitas","Schulen"],
    negativeKeywords: ["privatgarten","privat","job","karriere","kleinanzeigen","gratis","selber machen"],
    badFitSignals: ["privat","kleinanzeige","job","einzelgarten","hobby","selbst"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","Immobilienverwaltung","Wohnanlage","WEG Verwaltung"],
      "Pflegeheim": ["Pflegeheim","Kita","Schule","Altenheim"],
      "Hotel": ["Hotel","Tagungshotel","Gasthof"],
      "Bürogebäude": ["Gewerbepark","Bürogebäude","Industriebetrieb"],
    },
    scoringSignals: ["anlage","grünfläche","verwaltung","wohnanlage","gewerbe","hotel","pflege","objekt"],
    queryPriority: ["Hausverwaltung","Immobilienverwaltung","Hotel","Pflegeheim","Gewerbepark","Schule","Kindertagesstätte"],
  },
  catering: {
    id: "catering", label: "Catering",
    searchableBusinessCategories: ["Eventlocation","Tagungshotel","Seminarzentrum","Messeveranstalter","Kongresszentrum","Bürogebäude","Kindertagesstätte","Schule","Pflegeheim","Hotel","Coworking Space","Veranstalter","Unternehmensberatung"],
    idealCustomerProfiles: ["regelmäßige Veranstaltungen","viele Mitarbeitende","Tagungsbetrieb","Verpflegungspflicht","wiederkehrende Events"],
    targetCustomerTypes: ["Eventlocations","Tagungshotels","Seminarzentren","Messeveranstalter","Kitas","Schulen","Pflegeheime","Hotels"],
    negativeKeywords: ["privat","hochzeit","geburtstag","familienfeier","job","karriere","kleinanzeigen","selbst kochen"],
    badFitSignals: ["privat","hochzeit","geburtstag","kleinanzeige","familienfeier","selbst"],
    searchKeywordVariants: {
      "Eventlocation": ["Eventlocation","Veranstalter","Messeveranstalter","Kongresszentrum","Eventhalle"],
      "Tagungshotel": ["Tagungshotel","Kongresshotel","Hotel"],
      "Kindertagesstätte": ["Kindertagesstätte","Schule","Seminarzentrum","Bildungszentrum"],
      "Bürogebäude": ["Bürogebäude","Unternehmensberatung","Coworking Space"],
    },
    scoringSignals: ["event","tagung","messe","seminar","unternehmen","büro","kita","schule","hotel","kongress"],
    queryPriority: ["Eventlocation","Tagungshotel","Kongresszentrum","Seminarzentrum","Bürogebäude","Kindertagesstätte","Schule"],
  },
  handwerk: {
    id: "handwerk", label: "Handwerk",
    searchableBusinessCategories: ["Hausverwaltung","Immobilienverwaltung","Bauunternehmen","Facility Management","Hotel","Arztpraxis","Bürogebäude","Einzelhandel","Wohnungsbaugesellschaft","Gewerbeimmobilienverwaltung"],
    idealCustomerProfiles: ["regelmäßiger Instandhaltungsbedarf","mehrere Objekte","laufende Reparaturen","Objektbestand"],
    targetCustomerTypes: ["Hausverwaltungen","Immobilienverwaltungen","Bauunternehmen","Hotels","Bürogebäude"],
    negativeKeywords: ["privat","selber machen","diy","job","ausbildung","karriere","kleinanzeigen"],
    badFitSignals: ["privat","diy","job","kleinanzeige","selbst"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","Immobilienverwaltung","Wohnungsbaugesellschaft","WEG Verwaltung"],
      "Bürogebäude": ["Bürogebäude","Einzelhandel","Hotel","Gewerbepark"],
      "Bauunternehmen": ["Bauunternehmen","Facility Management","Generalunternehmer"],
    },
    scoringSignals: ["verwaltung","objekt","instandhaltung","gewerbe","hotel","bau","facility","wohnanlage"],
    queryPriority: ["Hausverwaltung","Immobilienverwaltung","Bauunternehmen","Hotel","Bürogebäude","Einzelhandel"],
  },
  spedition_logistik: {
    id: "spedition_logistik", label: "Spedition / Logistik",
    searchableBusinessCategories: ["Großhandel","Produktionsbetrieb","Industrieunternehmen","Möbelhaus","Baustoffhandel","Maschinenbau","Lebensmittelgroßhandel","Eventagentur","Einzelhandel","Versandhandel","Handelsunternehmen","Küchenstudio"],
    idealCustomerProfiles: ["regelmäßiger Versand","wiederkehrende Transporte","zeitkritische Lieferungen","hohes Sendungsvolumen"],
    targetCustomerTypes: ["Online-Shops","Großhändler","Produktionsbetriebe","Industriebetriebe","Möbelhäuser"],
    negativeKeywords: ["privat","umzug privat","job","fahrer gesucht","karriere","kleinanzeigen"],
    badFitSignals: ["privat","job","kleinanzeige","einzeltransport","möbel privat"],
    searchKeywordVariants: {
      "Großhandel": ["Großhandel","Lebensmittelgroßhandel","Handelsunternehmen"],
      "Produktionsbetrieb": ["Produktionsbetrieb","Industrieunternehmen","Maschinenbau"],
      "Möbelhaus": ["Möbelhaus","Baustoffhandel","Küchenstudio"],
      "Eventagentur": ["Eventagentur","Messeveranstalter","Veranstaltungstechnik"],
    },
    scoringSignals: ["versand","logistik","lager","großhandel","produktion","lieferung","handel"],
    queryPriority: ["Großhandel","Produktionsbetrieb","Industrieunternehmen","Möbelhaus","Maschinenbau","Baustoffhandel"],
  },
  gesundheit_medizin: {
    id: "gesundheit_medizin", label: "Gesundheit / Medizin",
    searchableBusinessCategories: ["Arztpraxis","Zahnarztpraxis","Therapiezentrum","Pflegeheim","Seniorenheim","Apotheke","Reha Zentrum","Privatklinik","Gesundheitszentrum","Physiotherapie","Ergotherapie","Ärztehaus"],
    idealCustomerProfiles: ["professioneller Gesundheitsbetrieb","regelmäßiger Bedarf","Patientenverkehr","mehrere Behandlungsräume"],
    targetCustomerTypes: ["Arztpraxen","Zahnarztpraxen","Therapiezentren","Pflegeheime","Apotheken","Reha-Zentren"],
    negativeKeywords: ["privat","forum","job","karriere","ausbildung","selbsthilfe","blog"],
    badFitSignals: ["forum","privat","job","erfahrung","selbsthilfe","blog"],
    searchKeywordVariants: {
      "Arztpraxis": ["Arztpraxis","Zahnarztpraxis","Ärztehaus","Medizinisches Versorgungszentrum"],
      "Therapiezentrum": ["Physiotherapie","Ergotherapie","Therapiezentrum","Logopädie"],
      "Pflegeheim": ["Pflegeheim","Seniorenheim","Reha Zentrum","Klinik"],
    },
    scoringSignals: ["praxis","gesundheit","pflege","therapie","reha","klinik","zentrum","apotheke"],
    queryPriority: ["Arztpraxis","Zahnarztpraxis","Pflegeheim","Physiotherapie","Therapiezentrum","Ärztehaus"],
  },
  immobilien: {
    id: "immobilien", label: "Immobilien",
    searchableBusinessCategories: ["Hausverwaltung","Immobilienverwaltung","WEG Verwaltung","Bauträger","Projektentwickler","Wohnungsbaugesellschaft","Immobiliengesellschaft","Gewerbeimmobilienverwaltung","Property Management","Mietverwaltung","Facility Management Immobilien"],
    idealCustomerProfiles: ["Eigentümer","Investoren","Gewerbeimmobilienbesitzer","Erbengemeinschaften","Unternehmen mit Standortsuche","Bestandshalter","Objektbestand"],
    targetCustomerTypes: ["Hausverwaltungen","Immobilienverwaltungen","WEG-Verwaltungen","Bauträger","Projektentwickler","Wohnungsbaugesellschaften"],
    negativeKeywords: ["privat","wohnung gesucht","mietgesuch","ferienwohnung","airbnb","job","karriere","vermiete privat","suche wohnung"],
    badFitSignals: ["privat","mietgesuch","wohnung gesucht","ferienwohnung","job","airbnb"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","WEG Verwaltung","Immobilienverwaltung","Mietverwaltung","Objektverwaltung"],
      "Bauträger": ["Bauträger","Wohnbaugesellschaft","Projektentwickler Immobilien"],
      "Property Management": ["Property Management","Gewerbeimmobilienverwaltung","Facility Management Immobilien"],
      "Immobiliengesellschaft": ["Immobiliengesellschaft","Wohnungsbaugesellschaft"],
    },
    scoringSignals: ["verwaltung","weg","gewerbeimmobilien","bestand","objektverwaltung","property management","projektentwicklung","bautraeger","wohnanlage"],
    queryPriority: ["Hausverwaltung","Property Management","Bauträger","Immobilienverwaltung","WEG Verwaltung","Wohnungsbaugesellschaft"],
  },
  lager_fulfillment: {
    id: "lager_fulfillment", label: "Lager / Fulfillment",
    searchableBusinessCategories: ["Versandhandel","Großhandel","Kosmetikmarke","Lebensmittelhersteller","Textilhandel","Ersatzteilhandel","Importeur","Handelsunternehmen","Modehändler","Online Händler"],
    idealCustomerProfiles: ["regelmäßiger Versand","wachsender Onlinehandel","Retourenbedarf","mehrere SKUs","Lagerbedarf"],
    targetCustomerTypes: ["Online-Shops","Großhändler","E-Commerce-Unternehmen","Kosmetikmarken","Textilhändler"],
    negativeKeywords: ["privat","kleinanzeigen","job","karriere","ebay privat","zu verschenken"],
    badFitSignals: ["privat","kleinanzeige","job","zu verschenken"],
    searchKeywordVariants: {
      "Versandhandel": ["Versandhandel","Online Händler","Handelsunternehmen"],
      "Großhandel": ["Großhandel","Importeur","Textilhandel","Modehändler"],
      "Lebensmittelhersteller": ["Kosmetikmarke","Lebensmittelhersteller","Ersatzteilhandel"],
    },
    scoringSignals: ["shop","versand","handel","import","retouren","lager","ecommerce","online"],
    queryPriority: ["Großhandel","Versandhandel","Importeur","Handelsunternehmen","Textilhandel"],
  },
  facility_service: {
    id: "facility_service", label: "Facility Service",
    searchableBusinessCategories: ["Hausverwaltung","Immobilienverwaltung","Gewerbeimmobilie","Bürogebäude","Hotel","Pflegeheim","Industrieunternehmen","Schule","Kindertagesstätte","Wohnanlage","Gewerbepark"],
    idealCustomerProfiles: ["mehrere Objekte","laufender Objektbedarf","technische Betreuung","Außenanlagen","wiederkehrende Dienstleistung"],
    targetCustomerTypes: ["Hausverwaltungen","Gewerbeimmobilien","Bürogebäude","Hotels","Pflegeheime","Industriebetriebe"],
    negativeKeywords: ["privat","job","karriere","ausbildung","kleinanzeigen"],
    badFitSignals: ["privat","job","kleinanzeige","einzelperson"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","Immobilienverwaltung","Wohnanlage","WEG Verwaltung"],
      "Bürogebäude": ["Bürogebäude","Gewerbeimmobilie","Industrieunternehmen","Gewerbepark"],
      "Pflegeheim": ["Pflegeheim","Schule","Kita","Altenheim"],
    },
    scoringSignals: ["objekt","verwaltung","gewerbe","facility","wohnanlage","technisch","gebäude"],
    queryPriority: ["Hausverwaltung","Immobilienverwaltung","Bürogebäude","Hotel","Pflegeheim","Gewerbepark"],
  },
  entruempelung: {
    id: "entruempelung", label: "Entrümpelung",
    searchableBusinessCategories: ["Hausverwaltung","Immobilienverwaltung","Nachlassverwaltung","Betreuungsbüro","Wohnungsbaugesellschaft","Pflegeheim","Seniorenheim","Rechtsanwalt Erbrecht","Sozialdienst"],
    idealCustomerProfiles: ["regelmäßige Wohnungswechsel","Nachlassfälle","Mietnomadenfälle","Objektbestand","Erbfälle"],
    targetCustomerTypes: ["Hausverwaltungen","Nachlassverwalter","Betreuungsbüros","Sozialdienste","Pflegeheime"],
    negativeKeywords: ["privat","sperrmüll kostenlos","kleinanzeigen","job","karriere","zu verschenken"],
    badFitSignals: ["privat","kleinanzeige","zu verschenken","job","sperrmüll kostenlos"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","Immobilienverwaltung","Wohnungsbaugesellschaft"],
      "Nachlassverwaltung": ["Nachlassverwaltung","Rechtsanwalt Erbrecht","Betreuungsbüro","Nachlassverwalter"],
      "Sozialdienst": ["Sozialdienst","Pflegeheim","Sozialstation","Seniorenheim"],
    },
    scoringSignals: ["verwaltung","nachlass","betreuung","erbrecht","wohnung","pflege","sozialdienst"],
    queryPriority: ["Hausverwaltung","Immobilienverwaltung","Nachlassverwaltung","Sozialdienst","Pflegeheim","Betreuungsbüro"],
  },
  maler_renovierung: {
    id: "maler_renovierung", label: "Maler / Renovierung",
    searchableBusinessCategories: ["Hausverwaltung","Immobilienverwaltung","Hotel","Bürogebäude","Arztpraxis","Einzelhandel","Wohnungsbaugesellschaft","Bauunternehmen","Facility Management","Gewerbeimmobilienverwaltung"],
    idealCustomerProfiles: ["regelmäßiger Renovierungsbedarf","Mieterwechsel","Objektbestand","Gewerbeflächen"],
    targetCustomerTypes: ["Hausverwaltungen","Immobilienverwaltungen","Hotels","Bürogebäude","Wohnungsbaugesellschaften"],
    negativeKeywords: ["privat","selber streichen","diy","job","ausbildung","kleinanzeigen"],
    badFitSignals: ["privat","diy","job","kleinanzeige","selbst streichen"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","Immobilienverwaltung","Wohnungsbaugesellschaft"],
      "Hotel": ["Hotel","Bürogebäude","Einzelhandel","Gewerbepark"],
      "Bauunternehmen": ["Bauunternehmen","Facility Management","Generalunternehmer"],
    },
    scoringSignals: ["verwaltung","mieterwechsel","objekt","hotel","gewerbe","bau","renovierung","wohnanlage"],
    queryPriority: ["Hausverwaltung","Immobilienverwaltung","Hotel","Bauunternehmen","Bürogebäude","Einzelhandel"],
  },
  elektro_gebaeudetechnik: {
    id: "elektro_gebaeudetechnik", label: "Elektro / Gebäudetechnik",
    searchableBusinessCategories: ["Hausverwaltung","Gewerbeimmobilie","Industrieunternehmen","Hotel","Bürogebäude","Bauunternehmen","Facility Management","Einzelhandel","Wohnungsbaugesellschaft","Arztpraxis"],
    idealCustomerProfiles: ["technischer Wartungsbedarf","mehrere Objekte","Gewerbeflächen","regelmäßige Prüfungen"],
    targetCustomerTypes: ["Hausverwaltungen","Gewerbeobjekte","Industriebetriebe","Hotels","Bürogebäude"],
    negativeKeywords: ["privat","diy","job","karriere","ausbildung","forum"],
    badFitSignals: ["privat","diy","job","forum","hobby"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","Wohnungsbaugesellschaft","Gewerbeimmobilie"],
      "Bürogebäude": ["Bürogebäude","Hotel","Einzelhandel","Gewerbepark"],
      "Industrieunternehmen": ["Industrieunternehmen","Bauunternehmen","Facility Management"],
    },
    scoringSignals: ["technik","gebäude","wartung","gewerbe","industrie","verwaltung","objekt","anlage"],
    queryPriority: ["Hausverwaltung","Industrieunternehmen","Hotel","Bürogebäude","Bauunternehmen","Facility Management"],
  },
  shk: {
    id: "shk", label: "SHK / Sanitär / Heizung / Klima",
    searchableBusinessCategories: ["Hausverwaltung","Hotel","Pflegeheim","Gewerbeimmobilie","Bürogebäude","Wohnungsbaugesellschaft","Facility Management","Industrieunternehmen","Arztpraxis","Gastronomie"],
    idealCustomerProfiles: ["regelmäßiger Wartungsbedarf","viele sanitäre Anlagen","Gewerbeflächen","Notdienstbedarf"],
    targetCustomerTypes: ["Hausverwaltungen","Hotels","Pflegeheime","Gewerbeobjekte","Bürogebäude"],
    negativeKeywords: ["privat","diy","job","ausbildung","forum","selber machen"],
    badFitSignals: ["privat","diy","job","forum","selbst"],
    searchKeywordVariants: {
      "Hausverwaltung": ["Hausverwaltung","Wohnungsbaugesellschaft","Gewerbeimmobilie"],
      "Hotel": ["Hotel","Bürogebäude","Gastronomie","Gewerbepark"],
      "Pflegeheim": ["Pflegeheim","Seniorenheim","Facility Management"],
    },
    scoringSignals: ["wartung","heizung","sanitaer","gewerbe","hotel","pflege","verwaltung","objekt"],
    queryPriority: ["Hausverwaltung","Hotel","Pflegeheim","Bürogebäude","Industrieunternehmen","Gastronomie"],
  },
  eventservice: {
    id: "eventservice", label: "Eventservice",
    searchableBusinessCategories: ["Eventlocation","Messeveranstalter","Hotel","Marketingagentur","Kongresszentrum","Seminarzentrum","Veranstalter","Messezentrum","Eventhalle","Tagungszentrum"],
    idealCustomerProfiles: ["regelmäßige Events","hohes Besucheraufkommen","Messebetrieb","Tagungen"],
    targetCustomerTypes: ["Eventlocations","Messeveranstalter","Hotels","Kongresszentren","Seminarzentren"],
    negativeKeywords: ["privat","geburtstag","hochzeit","kleinanzeigen","job","familienfeier"],
    badFitSignals: ["privat","geburtstag","hochzeit","job","familienfeier"],
    searchKeywordVariants: {
      "Eventlocation": ["Eventlocation","Veranstalter","Kongresszentrum","Eventhalle"],
      "Messeveranstalter": ["Messeveranstalter","Messezentrum","Messebau"],
      "Hotel": ["Tagungshotel","Marketingagentur","Seminarzentrum"],
    },
    scoringSignals: ["event","messe","kongress","veranstaltung","hotel","agentur","b2b","tagung"],
    queryPriority: ["Eventlocation","Kongresszentrum","Messeveranstalter","Hotel","Seminarzentrum","Marketingagentur"],
  },
  marketing_webdesign_werbung: {
    id: "marketing_webdesign_werbung", label: "Marketing / Webdesign / Werbung",
    searchableBusinessCategories: ["Handwerksbetrieb","Arztpraxis","Steuerberater","Rechtsanwalt","Restaurant","Hotel","Immobilienmakler","Fitnessstudio","Einzelhandel","Unternehmensberatung","Zahnarztpraxis","Autohaus","Bauunternehmen"],
    idealCustomerProfiles: ["lokal sichtbarkeitsabhängig","schwache Website","Leadbedarf","Wachstumsziel"],
    targetCustomerTypes: ["Handwerksbetriebe","Arztpraxen","Steuerberater","Restaurants","Hotels","Fitnessstudios"],
    negativeKeywords: ["privat","hobby","gratis","job","karriere","ehrenamt"],
    badFitSignals: ["privat","hobby","gratis","job","ehrenamt"],
    searchKeywordVariants: {
      "Handwerksbetrieb": ["Handwerksbetrieb","Arztpraxis","Restaurant","Fitnessstudio"],
      "Steuerberater": ["Steuerberater","Rechtsanwalt","Unternehmensberatung"],
      "Einzelhandel": ["Einzelhandel","Autohaus","Hotel"],
    },
    scoringSignals: ["lokal","dienstleister","praxis","kanzlei","hotel","shop","restaurant","handwerk"],
    queryPriority: ["Handwerksbetrieb","Arztpraxis","Restaurant","Steuerberater","Hotel","Fitnessstudio","Einzelhandel"],
  },
  personal_zeitarbeit: {
    id: "personal_zeitarbeit", label: "Personal / Zeitarbeit",
    searchableBusinessCategories: ["Logistikunternehmen","Industrieunternehmen","Produktionsbetrieb","Pflegeheim","Hotel","Gastronomie","Bauunternehmen","Lagerbetrieb","Reinigungsunternehmen","Einzelhandel","Callcenter"],
    idealCustomerProfiles: ["hoher Personalbedarf","Schichtbetrieb","saisonaler Bedarf","wachsendes Unternehmen"],
    targetCustomerTypes: ["Logistikunternehmen","Industriebetriebe","Produktionsbetriebe","Pflegeheime","Hotels"],
    negativeKeywords: ["bewerbung","jobs","stellenangebot","karriere","ausbildung","praktikum"],
    badFitSignals: ["bewerbung","job","karriere","praktikum","stellengesuch"],
    searchKeywordVariants: {
      "Logistikunternehmen": ["Logistikunternehmen","Lagerbetrieb","Spedition"],
      "Industrieunternehmen": ["Industrieunternehmen","Produktionsbetrieb","Maschinenbau"],
      "Pflegeheim": ["Pflegeheim","Seniorenheim","Klinik","Pflegedienst"],
      "Gastronomie": ["Hotel","Gastronomie","Restaurant"],
    },
    scoringSignals: ["produktion","logistik","pflege","hotel","schicht","lager","personalbedarf","industrie"],
    queryPriority: ["Logistikunternehmen","Industrieunternehmen","Pflegeheim","Produktionsbetrieb","Hotel","Gastronomie"],
  },
  buchhaltung_steuernahe_dienste: {
    id: "buchhaltung_steuernahe_dienste", label: "Buchhaltung / steuernahe Dienste",
    searchableBusinessCategories: ["Handwerksbetrieb","Restaurant","Einzelhandel","Pflegedienst","Immobilienverwaltung","Agentur","Dienstleister","Gastronomie","Unternehmensberatung","Bauunternehmen"],
    idealCustomerProfiles: ["laufende Belege","mehrere Rechnungen monatlich","Lohnabrechnung","Wachstum"],
    targetCustomerTypes: ["Kleinunternehmen","Handwerksbetriebe","Gastronomie","Einzelhandel","Startups"],
    negativeKeywords: ["privat","job","karriere","ausbildung","kostenlos","forum"],
    badFitSignals: ["privat","forum","job","kostenlos","selbst"],
    searchKeywordVariants: {
      "Handwerksbetrieb": ["Handwerksbetrieb","Restaurant","Einzelhandel","Gastronomie"],
      "Pflegedienst": ["Agentur","Pflegedienst","Immobilienverwaltung"],
      "Unternehmensberatung": ["Unternehmensberatung","Dienstleister","Bauunternehmen"],
    },
    scoringSignals: ["unternehmen","handel","handwerk","agentur","shop","dienstleister","pflege","büro"],
    queryPriority: ["Handwerksbetrieb","Restaurant","Einzelhandel","Pflegedienst","Agentur","Immobilienverwaltung"],
  },
  industrieservice: {
    id: "industrieservice", label: "Industrieservice",
    searchableBusinessCategories: ["Produktionsbetrieb","Maschinenbau","Metallbau","Logistikzentrum","Chemiebetrieb","Lebensmittelhersteller","Industriepark","Automobilzulieferer","Kunststoffverarbeitung","Industrieunternehmen"],
    idealCustomerProfiles: ["laufende Produktion","technische Anlagen","Schichtbetrieb","Wartungsbedarf"],
    targetCustomerTypes: ["Produktionsbetriebe","Maschinenbauunternehmen","Logistikzentren","Chemiebetriebe"],
    negativeKeywords: ["privat","job","karriere","ausbildung","hobbywerkstatt"],
    badFitSignals: ["privat","hobby","job","klein","werkstatt privat"],
    searchKeywordVariants: {
      "Produktionsbetrieb": ["Produktionsbetrieb","Industrieunternehmen","Lebensmittelhersteller"],
      "Maschinenbau": ["Maschinenbau","Metallbau","Kunststoffverarbeitung","Automobilzulieferer"],
      "Industriepark": ["Industriepark","Logistikzentrum","Chemiebetrieb"],
    },
    scoringSignals: ["produktion","industrie","maschine","anlage","werk","halle","wartung","technik"],
    queryPriority: ["Produktionsbetrieb","Industrieunternehmen","Maschinenbau","Logistikzentrum","Metallbau","Lebensmittelhersteller"],
  },
  fuhrparkservice_fahrzeugpflege: {
    id: "fuhrparkservice_fahrzeugpflege", label: "Fuhrparkservice / Fahrzeugpflege",
    searchableBusinessCategories: ["Autohaus","Taxiunternehmen","Pflegedienst","Handwerksbetrieb","Logistikunternehmen","Spedition","Mietwagenfirma","Fahrschule","Lieferdienst","Kommunaler Betrieb","Fuhrparkbetrieb"],
    idealCustomerProfiles: ["mehrere Fahrzeuge","regelmäßige Reinigung","Außendienst","Flotte"],
    targetCustomerTypes: ["Autohäuser","Taxiunternehmen","Pflegedienste","Logistikunternehmen","Speditionen"],
    negativeKeywords: ["privat","gebrauchtwagen privat","job","kleinanzeigen","selber reinigen"],
    badFitSignals: ["privat","kleinanzeige","job","einzelfahrzeug","gebrauchtwagen privat"],
    searchKeywordVariants: {
      "Taxiunternehmen": ["Taxiunternehmen","Pflegedienst","Lieferdienst","Mietwagenfirma"],
      "Autohaus": ["Autohaus","Fahrschule","Fuhrparkbetrieb"],
      "Logistikunternehmen": ["Handwerksbetrieb","Logistikunternehmen","Spedition"],
    },
    scoringSignals: ["flotte","fahrzeuge","lieferung","taxi","pflege","autohaus","logistik","fuhrpark"],
    queryPriority: ["Autohaus","Taxiunternehmen","Logistikunternehmen","Handwerksbetrieb","Pflegedienst","Mietwagenfirma"],
  },
  pflege_betreuung: {
    id: "pflege_betreuung", label: "Pflege / Betreuung",
    searchableBusinessCategories: ["Pflegeheim","Seniorenresidenz","Betreutes Wohnen","Klinik","Reha Zentrum","Sozialdienst","Betreuungsverein","Ärztehaus","Pflegedienst","Sozialstation"],
    idealCustomerProfiles: ["regelmäßiger Betreuungsbedarf","Senioren-Zielgruppe","soziale Versorgung"],
    targetCustomerTypes: ["Pflegeheime","Seniorenresidenzen","Betreutes Wohnen","Kliniken","Sozialdienste"],
    negativeKeywords: ["job","karriere","ausbildung","forum","privat","erfahrung"],
    badFitSignals: ["job","forum","privat","erfahrung","selbsthilfe"],
    searchKeywordVariants: {
      "Pflegeheim": ["Pflegeheim","Seniorenresidenz","Betreutes Wohnen","Altenheim"],
      "Klinik": ["Klinik","Reha Zentrum","Ärztehaus","Pflegedienst"],
      "Sozialdienst": ["Sozialdienst","Betreuungsverein","Sozialstation"],
    },
    scoringSignals: ["pflege","senioren","betreuung","sozial","reha","klinik","wohnen","station"],
    queryPriority: ["Pflegeheim","Seniorenresidenz","Klinik","Reha Zentrum","Sozialdienst","Pflegedienst"],
  },
  schulungen_weiterbildung: {
    id: "schulungen_weiterbildung", label: "Schulungen / Weiterbildung",
    searchableBusinessCategories: ["Industrieunternehmen","Pflegeheim","Hotel","Logistikunternehmen","Handwerksbetrieb","Bildungsträger","Schule","Einzelhandel","Callcenter","Unternehmensberatung","Produktionsbetrieb"],
    idealCustomerProfiles: ["mehrere Mitarbeitende","Schulungspflicht","Compliance","wiederkehrender Schulungsbedarf"],
    targetCustomerTypes: ["Unternehmen","Industriebetriebe","Pflegeheime","Hotels","Logistikunternehmen"],
    negativeKeywords: ["privat","nachhilfe","hobby","job","karriere","kostenlos"],
    badFitSignals: ["privat","nachhilfe","hobby","job","kostenlos"],
    searchKeywordVariants: {
      "Industrieunternehmen": ["Industrieunternehmen","Logistikunternehmen","Produktionsbetrieb"],
      "Pflegeheim": ["Pflegeheim","Hotel","Einzelhandel","Callcenter"],
      "Bildungsträger": ["Bildungsträger","Schule","Handwerksbetrieb"],
    },
    scoringSignals: ["mitarbeiter","schulung","industrie","pflege","logistik","compliance","unternehmen"],
    queryPriority: ["Industrieunternehmen","Pflegeheim","Hotel","Logistikunternehmen","Handwerksbetrieb","Bildungsträger"],
  },
};

const LEGACY_INDUSTRY_MAP = {
  "Gebäudereinigung":"gebaeudereinigung","Gartenbau / Gartenpflege":"gartenbau","Gartenbau":"gartenbau",
  "Hausmeisterdienst / Facility Service":"facility_service","Facility Service":"facility_service","Hausmeisterdienst":"facility_service",
  "Entrümpelung / Entsorgung":"entruempelung","Entrümpelung":"entruempelung",
  "Buchhaltung / Büroservice":"buchhaltung_steuernahe_dienste","Buchhaltung":"buchhaltung_steuernahe_dienste",
  "Maschinenwartung / Industrieservice":"industrieservice","Industrieservice":"industrieservice",
  "Sicherheitsdienst":"sicherheitsdienst","IT-Service":"it_service","Catering":"catering","Handwerk":"handwerk",
  "Spedition / Logistik":"spedition_logistik","Spedition":"spedition_logistik","Logistik":"spedition_logistik",
  "Gesundheit / Medizin":"gesundheit_medizin","Gesundheit":"gesundheit_medizin","Medizin":"gesundheit_medizin",
  "Immobilien":"immobilien","Lager / Fulfillment":"lager_fulfillment","Fulfillment":"lager_fulfillment",
  "Maler / Renovierung":"maler_renovierung","Maler":"maler_renovierung","Renovierung":"maler_renovierung",
  "Elektro / Gebäudetechnik":"elektro_gebaeudetechnik","Elektro":"elektro_gebaeudetechnik",
  "SHK / Sanitär / Heizung / Klima":"shk","SHK":"shk","Sanitär":"shk","Heizung":"shk",
  "Eventservice":"eventservice","Marketing / Webdesign / Werbung":"marketing_webdesign_werbung",
  "Marketing":"marketing_webdesign_werbung","Webdesign":"marketing_webdesign_werbung",
  "Personal / Zeitarbeit":"personal_zeitarbeit","Zeitarbeit":"personal_zeitarbeit",
  "Fuhrparkservice / Fahrzeugpflege":"fuhrparkservice_fahrzeugpflege","Fuhrparkservice":"fuhrparkservice_fahrzeugpflege",
  "Pflege / Betreuung":"pflege_betreuung","Pflege":"pflege_betreuung",
  "Schulungen / Weiterbildung":"schulungen_weiterbildung","Schulungen":"schulungen_weiterbildung",
};

// ============================================================
// INLINE: LEAD SEARCH ENGINE (Quelle der Wahrheit: utils/leadSearchEngine.js)
// ============================================================

function normStr(str) {
  return String(str || "").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").trim();
}

function normalizeIndustryId(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (LEAD_SEARCH_TAXONOMY[str]) return str;
  if (LEGACY_INDUSTRY_MAP[str]) return LEGACY_INDUSTRY_MAP[str];
  const lower = str.toLowerCase();
  const match = Object.keys(LEAD_SEARCH_TAXONOMY).find(k => k.toLowerCase() === lower);
  return match || str;
}

function getQueryBudget(trialStage, remainingLeadBudget, fastMode = false) {
  if (trialStage === 'free_preview') {
    if (!remainingLeadBudget || remainingLeadBudget <= 0) {
      return { blocked: true, reason: 'preview_limit_reached', maxLeadsToSave: 0, maxSearchQueries: 0, maxPlaceDetails: 0, stopWhenEnoughLeadsFound: true };
    }
    return { blocked: false, maxLeadsToSave: Math.min(remainingLeadBudget, 10), maxSearchQueries: 5, maxPlaceDetails: 15, stopWhenEnoughLeadsFound: true };
  }
  if (fastMode) {
    // Mobile/fast mode: sehr konservatives Budget
    return { blocked: false, maxLeadsToSave: 10, maxSearchQueries: 4, maxPlaceDetails: 20, stopWhenEnoughLeadsFound: true };
  }
  if (trialStage === 'verified_trial') {
    return { blocked: false, maxLeadsToSave: null, maxSearchQueries: 20, maxPlaceDetails: 60, stopWhenEnoughLeadsFound: true };
  }
  // paid: konservativ halten damit kein Timeout entsteht
  return { blocked: false, maxLeadsToSave: null, maxSearchQueries: 25, maxPlaceDetails: 70, stopWhenEnoughLeadsFound: true };
}

function getCityLimit(trialStage, radiusKm) {
  if (trialStage === 'free_preview') return 1;
  if (radiusKm <= 10) return 1;
  if (radiusKm <= 25) return 2;
  if (radiusKm <= 60) return 3;
  return 4;
}

function buildSearchPlan({ industry, targetCustomerTypes = [], excludedCustomerTypes = [], location, radiusKm = 25, trialStage = 'free_preview', remainingLeadBudget = 3, additionalCities = [], searchPoints = [], learnedPriorityCategories = [], learnedWinningSignals = [] }) {
  const industryId = normalizeIndustryId(industry);
  const profile = LEAD_SEARCH_TAXONOMY[industryId] || null;

  if (!profile) return { error: `Unbekannte Branche: ${industry}`, blocked: true, industryProfile: null, searchQueries: [], queryBudget: { blocked: true, reason: 'unknown_industry' } };

  const queryBudget = getQueryBudget(trialStage, remainingLeadBudget);
  if (queryBudget.blocked) return { industryProfile: profile, queryBudget, searchCities: [], searchQueries: [], blocked: true, debug: { ignoredIdealProfiles: profile.idealCustomerProfiles || [] } };

  const cityLimit = getCityLimit(trialStage, radiusKm);
  const searchCities = [location, ...additionalCities.slice(0, cityLimit - 1)].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);

  const usedCategories = (profile.searchableBusinessCategories || []).filter(c => !excludedCustomerTypes.includes(c));
  const ignoredIdealProfiles = profile.idealCustomerProfiles || [];

  const maxVariantsPerCategory = 
    trialStage === 'free_preview' ? 2 :
    trialStage === 'verified_trial' ? 3 : 999;

  const queries = [];
  const seen = new Set();
  const maxQ = queryBudget.maxSearchQueries;
  
  const learnedFirst = learnedPriorityCategories.filter(c => usedCategories.includes(c));
  const staticPriority = (profile.queryPriority || []).filter(c => usedCategories.includes(c) && !learnedFirst.includes(c));
  const rest = usedCategories.filter(c => !learnedFirst.includes(c) && !staticPriority.includes(c));

  const ordered = [...learnedFirst, ...staticPriority, ...rest];

  for (const cat of ordered) {
    if (queries.length >= maxQ) break;
    const variants = (profile.searchKeywordVariants?.[cat] ? profile.searchKeywordVariants[cat] : [cat])
      .slice(0, maxVariantsPerCategory);
    for (const variant of variants) {
      if (queries.length >= maxQ) break;
      const q = variant;
      if (!seen.has(q)) {
        seen.add(q);
        queries.push({ query: q, category: cat, variant });
      }
    }
  }

  return {
    industryProfile: profile,
    searchCities,
    searchQueries: queries,
    searchPoints,
    queryBudget,
    debug: {
      usedSearchableCategories: usedCategories,
      ignoredIdealProfiles,
      idealProfilesNotUsedAsRawQueries: true,
      searchableBusinessCategoriesUsed: true,
    }
  };
}

function isBadFit(candidate, profile) {
  const text = normStr([candidate.name, (candidate.types || []).join(' '), candidate.vicinity || '', candidate.editorial_summary?.overview || ''].join(' '));
  const jobSignals = ['job', 'karriere', 'ausbildung', 'stellenangebot', 'bewerber', 'bewerbung', 'praktikum'];
  for (const s of jobSignals) if (text.includes(normStr(s))) return { isBadFit: true, reason: `Job-Signal: "${s}"`, signalType: 'job' };
  const privatSignals = ['privat', 'kleinanzeigen', 'mietgesuch', 'wohnung gesucht', 'zu verschenken', 'airbnb'];
  for (const s of privatSignals) if (text.includes(normStr(s))) return { isBadFit: true, reason: `Privat-Signal: "${s}"`, signalType: 'private' };
  for (const kw of (profile.negativeKeywords || [])) if (text.includes(normStr(kw))) return { isBadFit: true, reason: `NegKeyword: "${kw}"`, signalType: 'negativeKeyword' };
  for (const s of (profile.badFitSignals || [])) if (text.includes(normStr(s))) return { isBadFit: true, reason: `BadFit: "${s}"`, signalType: 'badFitSignal' };
  return { isBadFit: false, reason: null };
}

function scoreLeadCandidate({ candidate, profile, distanceKm = null, radiusKm = 25, matchedSearchCategory = null, learnedWinningSignals = [] }) {
  const text = normStr([candidate.name, (candidate.types || []).join(' '), candidate.vicinity || '', candidate.editorial_summary?.overview || '', candidate.formatted_address || ''].join(' '));
  const badFitResult = isBadFit(candidate, profile);

  let score = 50;
  const reasons = [];
  let matched_search_category = matchedSearchCategory || null;
  let matched_target_customer_type = null;
  let matched_service_context = null;

  if (!matched_search_category) {
    for (const cat of (profile.searchableBusinessCategories || [])) {
      const variants = profile.searchKeywordVariants?.[cat] ? profile.searchKeywordVariants[cat] : [cat];
      for (const v of variants) { if (text.includes(normStr(v))) { matched_search_category = cat; break; } }
      if (matched_search_category) break;
    }
  }
  if (matched_search_category) { score += 20; reasons.push(`Kategorie: "${matched_search_category}"`); }

  for (const s of learnedWinningSignals) {
    if (text.includes(normStr(s))) { score += 20; reasons.push(`Gelernt: "${s}"`); break; }
  }

  for (const s of (profile.scoringSignals || [])) {
    if (text.includes(normStr(s))) { score += 15; reasons.push(`Signal: "${s}"`); break; }
  }

  if (candidate.formatted_phone_number || candidate.international_phone_number) { score += 10; reasons.push("Telefon"); }
  if (candidate.website) { score += 10; reasons.push("Website"); }
  if (distanceKm !== null && distanceKm <= radiusKm) { score += 10; reasons.push(`Radius (${distanceKm}km)`); }

  if (badFitResult.isBadFit) {
    const penalty = (badFitResult.signalType === 'job' || badFitResult.signalType === 'private') ? 50 : 30;
    score -= penalty;
    reasons.push(`BadFit: ${badFitResult.reason}`);
  }

  for (const tc of (profile.targetCustomerTypes || [])) {
    if (text.includes(normStr(tc))) { matched_target_customer_type = tc; break; }
  }

  for (const svc of (profile.ownServices || [])) {
    if (text.includes(normStr(svc))) { matched_service_context = svc; break; }
  }

  score = Math.max(0, Math.min(100, score));
  return {
    search_quality_score: score,
    matched_search_category,
    matched_target_customer_type,
    matched_service_context,
    relevance_reason: reasons.join(' | ') || 'Kein Match',
    bad_fit_reason: badFitResult.isBadFit ? badFitResult.reason : null,
    shouldSave: score >= 55 && !badFitResult.isBadFit,
  };
}

// ============================================================
// GOOGLE API HELPERS
// ============================================================

const GOOGLE_SKU_PRICING_USD_PER_1000 = { 
  places_text_search_pro: 32,
  places_new_text_search: 35,
  place_details_essentials: 5,
  places_new_details_basic: 3,
};
function skuCostCent(sku, requests) { return (requests / 1000) * (GOOGLE_SKU_PRICING_USD_PER_1000[sku] || 0) * 100; }

function isLikelyChain(candidate) {
  const chainKeywords = [
    'aldi', 'aldisüd', 'aldinord', 'lidl', 'penny', 'netto', 'rewe', 'edeka', 'kaufland', 'real', 'marktkauf', 'selgros', 'metro', 'makro', 'costco',
    'dm', 'rossmann', 'müller',
    'h&m', 'zara', 'primark', 'c&a', 'next', 'gap', 'mango', 'esprit', 'tommy hilfiger', 'calvin klein', 'guess', 'diesel',
    'deichmann', 'foot locker', 'intersport', 'decathlon', 'nike store', 'adidas store', 'puma store',
    'deutsche post', 'dhl', 'ups store', 'fedex', 'hermes', 'dpd', 'gls', 'postamt', 'postfiliale',
    'sparkasse', 'deutsche bank', 'commerzbank', 'comdirect', 'ing-diba', 'ing diba', 'hypovereinsbank', 'unicredit', 'santander', 'postbank', 'targobank',
    'mcdonalds', 'burger king', 'subway', 'kfc', 'pizza hut', 'dominos', 'vapiano', 'maredo', 'segafredo', 'starbucks', 'costa coffee',
    'hilton', 'marriott', 'accor', 'ibis', 'novotel', 'mercure', 'sofitel', 'holiday inn', 'hyatt', 'sheraton', 'radisson', 'best western', 'motel one',
    'karstadt', 'kaufhof', 'galeria', 'peek & cloppenburg', 'breuninger',
    'sixt', 'hertz', 'avis', 'enterprise', 'europcar', 'budget',
    'fitx', 'mcfit', 'easyfit', 'fitness first', 'john reed',
    'david garrett', 'klier', 'haar und farbe',
    'fielmann', 'apollo optik',
    'telekom', 't-mobile', 'vodafone', 'o2', 'telefonica',
    'cinemaxx', 'uci', 'cinestar',
    'ikea', 'hoffner', 'segmuller', 'poco', 'roller', 'xxxlutz', 'conforama',
    'obi', 'bauhaus', 'hornbach', 'hagebau', 'hellweg',
    'dehner', 'gartencenter müller',
    'toys r us', 'smyths',
    'franchise', 'filiale', 'kette', 'filialen', 'niederlassung', 'zentrale', 'konzern', 'holding'
  ];
  
  const nameLower = (candidate.name || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  
  for (const kw of chainKeywords) {
    if (nameLower.includes(kw)) return { isChain: true, reason: `Kette: ${kw}` };
  }
  
  const reviews = candidate.user_ratings_total || 0;
  if (reviews > 1500) return { isChain: true, reason: `>1500 Bewertungen (${reviews})` };
  
  return { isChain: false, reason: null };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function generateSearchGrid(centerLat, centerLng, radiusKm, trialStage) {
  const points = [{ lat: centerLat, lng: centerLng, label: 'center' }];
  if (trialStage === 'free_preview') return points;

  const stepKm = 15;
  // Reduzierte Rings um Laufzeit stabil zu halten
  const rings = radiusKm <= 20 ? 1 : radiusKm <= 40 ? 1 : 2;

  for (let ring = 1; ring <= rings; ring++) {
    const ringRadiusKm = ring * stepKm;
    const pointsInRing = 6 * ring;
    for (let i = 0; i < pointsInRing; i++) {
      const angle = (2 * Math.PI * i) / pointsInRing;
      const dLat = (ringRadiusKm / 111) * Math.cos(angle);
      const dLng = (ringRadiusKm / (111 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle);
      const pLat = centerLat + dLat;
      const pLng = centerLng + dLng;
      if (haversineKm(centerLat, centerLng, pLat, pLng) <= radiusKm * 1.05) {
        points.push({ lat: pLat, lng: pLng, label: `grid_${ring}_${i}` });
      }
    }
  }
  return points;
}

async function searchPlaces(query, cityCoords, radiusMeters, apiCounters, pageToken = null) {
  const body = {
    textQuery: query,
    languageCode: "de",
    locationBias: {
      circle: {
        center: { latitude: cityCoords.lat, longitude: cityCoords.lng },
        radius: Math.min(radiusMeters, 50000),
      },
    },
    maxResultCount: 20,
  };
  if (pageToken) body.pageToken = pageToken;

  apiCounters.textSearch++;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,nextPageToken",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { results: [], nextPageToken: null };
  const data = await res.json();

  const results = (data.places || []).map((p) => ({
    place_id: p.id,
    name: p.displayName?.text || "",
    formatted_address: p.formattedAddress || "",
    geometry: { location: { lat: p.location?.latitude, lng: p.location?.longitude } },
    rating: p.rating,
    user_ratings_total: p.userRatingCount,
    types: p.types || [],
  }));

  return { results, nextPageToken: data.nextPageToken || null };
}

async function searchPlacesWithPagination(query, cityCoords, radiusMeters, apiCounters, maxPages = 3) {
  const allResults = [];
  let pageToken = null;
  let page = 0;
  
  do {
    const { results, nextPageToken } = await searchPlaces(query, cityCoords, radiusMeters, apiCounters, pageToken);
    allResults.push(...results);
    pageToken = nextPageToken || null;
    page++;
    if (pageToken) await new Promise(resolve => setTimeout(resolve, 2000));
  } while (pageToken && page < maxPages);
  
  return allResults;
}

async function getPlaceDetails(placeId, apiCounters) {
  apiCounters.placeDetailsEssentials++;
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=de`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,location,addressComponents,types",
    },
  });
  if (!res.ok) return null;
  const p = await res.json();
  if (!p || p.error) return null;

  return {
    place_id: p.id,
    name: p.displayName?.text || "",
    formatted_address: p.formattedAddress || "",
    formatted_phone_number: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
    website: p.websiteUri || "",
    geometry: { location: { lat: p.location?.latitude, lng: p.location?.longitude } },
    types: p.types || [],
    address_components: (p.addressComponents || []).map((c) => ({
      long_name: c.longText,
      types: c.types,
    })),
  };
}

function extractAddressComponents(components = []) {
  let plz = '', ort = '', strasse = '', hausnummer = '';
  if (!Array.isArray(components)) return { plz, ort, adresse: '' };
  for (const c of components) {
    if (c?.types?.includes('postal_code')) plz = c.long_name;
    if (c?.types?.includes('locality')) ort = c.long_name;
    if (c?.types?.includes('route')) strasse = c.long_name;
    if (c?.types?.includes('street_number')) hausnummer = c.long_name;
  }
  return { plz, ort, adresse: [strasse, hausnummer].filter(Boolean).join(' ') };
}

// ============================================================
// ACCESS CHECK
// ============================================================

async function checkAccess(req, { organization_id, action } = {}) {
  const b44 = createClientFromRequest(req);
  let user;
  try { user = await b44.auth.me(); } catch { return { allowed: false, reason: 'not_authenticated', message: 'Nicht eingeloggt.' }; }
  if (!user) return { allowed: false, reason: 'not_authenticated', message: 'Nicht eingeloggt.' };
  if (user.role === 'admin') return { allowed: true, reason: 'platform_admin', user, organization: null, role: 'platform_admin' };
  if (!organization_id) return { allowed: false, reason: 'missing_organization_id', message: 'Keine organization_id.' };

  const [orgs, members] = await Promise.all([
    b44.asServiceRole.entities.Organization.filter({ id: organization_id }),
    b44.asServiceRole.entities.OrganizationMember.filter({ organization_id, user_email: user.email }),
  ]);
  const organization = orgs[0] || null;
  if (!organization) return { allowed: false, reason: 'organization_not_found', message: 'Organisation nicht gefunden.' };
  if (organization.owner_email === user.email) return { allowed: true, reason: 'org_owner', user, organization, member: members[0] || null, role: 'organization_admin' };
  const member = members[0] || null;
  if (!member || member.status !== 'active') return { allowed: false, reason: 'not_a_member', message: 'Kein aktives Mitglied.' };
  const allowedRoles = ['organization_admin', 'sales_rep'];
  if (!allowedRoles.includes(member.role)) return { allowed: false, reason: 'insufficient_role', message: `Rolle "${member.role}" nicht erlaubt.` };
  return { allowed: true, reason: 'ok', user, organization, member, role: member.role };
}

// ============================================================
// LOCK HELPERS
// ============================================================
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

async function acquireLock(base44, organization_id, user_email) {
  const [existing, startedAt] = await Promise.all([
    base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id, key: 'lead_research_running' }),
    base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id, key: 'lead_research_started_at' }),
  ]);
  if (existing[0]?.value === 'true' && startedAt[0]?.value) {
    const age = Date.now() - new Date(startedAt[0].value).getTime();
    if (age < LOCK_TIMEOUT_MS) {
      const lockedBy = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id, key: 'lead_research_locked_by' });
      return { acquired: false, lockedBy: lockedBy[0]?.value || 'unbekannt', startedAt: startedAt[0].value };
    }
  }
  const now = new Date().toISOString();
  const upsert = async (key, value) => {
    const rec = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id, key });
    if (rec[0]) await base44.asServiceRole.entities.OrganizationSettings.update(rec[0].id, { value });
    else await base44.asServiceRole.entities.OrganizationSettings.create({ organization_id, key, value });
  };
  await upsert('lead_research_running', 'true');
  await upsert('lead_research_started_at', now);
  await upsert('lead_research_locked_by', user_email);
  return { acquired: true };
}

async function releaseLock(base44, organization_id) {
  try {
    const rec = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id, key: 'lead_research_running' });
    if (rec[0]) await base44.asServiceRole.entities.OrganizationSettings.update(rec[0].id, { value: 'false' });
  } catch (e) { console.error('[generateLeads] Lock-Release fehler:', e?.message); }
}

// ============================================================
// USAGE LOG
// ============================================================
function getPeriodMonth() { const n = new Date(); return `${n.getUTCFullYear()}-${String(n.getUTCMonth()+1).padStart(2,'0')}`; }

async function upsertUsageLog(base44, organization_id, delta, lastReport) {
  const periodMonth = getPeriodMonth();
  const now = new Date().toISOString();
  const existing = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
  const reportJson = JSON.stringify(lastReport);
  const skuJson = JSON.stringify(delta.skuBreakdown || {});
  if (existing?.[0]) {
    const log = existing[0];
    await base44.asServiceRole.entities.UsageLog.update(log.id, {
      lead_generations_used: (log.lead_generations_used || 0) + (delta.lead_generations_used || 0),
      leads_created: (log.leads_created || 0) + (delta.leads_created || 0),
      google_places_text_search_requests: (log.google_places_text_search_requests || 0) + (delta.textSearch || 0),
      google_place_details_essentials_requests: (log.google_place_details_essentials_requests || 0) + (delta.placeDetails || 0),
      google_places_requests: (log.google_places_requests || 0) + (delta.textSearch || 0),
      place_details_requests: (log.place_details_requests || 0) + (delta.placeDetails || 0),
      estimated_external_cost_cent: (log.estimated_external_cost_cent || 0) + (delta.estimatedCostCent || 0),
      google_sku_breakdown: skuJson,
      last_lead_generation_at: now,
      last_lead_generation_report: reportJson,
    });
  } else {
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const end = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth()+1, 0, 23, 59, 59)).toISOString();
    await base44.asServiceRole.entities.UsageLog.create({
      organization_id, period_month: periodMonth, period_start: start, period_end: end,
      lead_generations_used: delta.lead_generations_used || 0,
      leads_created: delta.leads_created || 0,
      google_places_text_search_requests: delta.textSearch || 0,
      google_place_details_essentials_requests: delta.placeDetails || 0,
      google_places_requests: delta.textSearch || 0,
      place_details_requests: delta.placeDetails || 0,
      estimated_external_cost_cent: delta.estimatedCostCent || 0,
      google_sku_breakdown: skuJson,
      last_lead_generation_at: now,
      last_lead_generation_report: reportJson,
    });
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req) => {
  let _base44 = null, _orgId = null, _lockAcquired = false;

  try {
    const base44 = createClientFromRequest(req);
    _base44 = base44;
    const body = await req.json();
    const { organization_id, skip_usage_log = false } = body;
    _orgId = organization_id;

    // ── Internes Time-Budget ─────────────────────────────────────────────────
    const startedAt = Date.now();
    const isFastMode = body.mode === 'fast';
    const MAX_RUNTIME_MS = isFastMode ? 20000 : 40000;
    const shouldStopForTimeout = () => Date.now() - startedAt > MAX_RUNTIME_MS;

    // ── P2: Per-Run-Limit serverseitig erzwingen ─────────────────────────────
    const PER_RESEARCH_RUN_LIMIT = isFastMode ? 10 : 25;
    const requestedTargetCount = Math.max(1, Number(body.target_count || (isFastMode ? 10 : 25)));
    const wasClampedByRunLimit = requestedTargetCount > PER_RESEARCH_RUN_LIMIT;

    if (!organization_id) return Response.json({ error: 'organization_id fehlt', success: false }, { status: 400 });

    // ── DEPRECATED RUNTIME GUARD ─────────────────────────────────────────────
    // generateLeads ist deprecated (Phase 1 Audit 2026-05-18).
    // Diese Funktion darf NUR noch von internen Service-Calls oder Platform-Admins genutzt werden.
    // Im aktiven Kundenflow MUSS startResearchRun + processResearchRun verwendet werden.
    // Direkte Frontend-Aufrufe von normalen Usern werden hier abgelehnt.
    {
      const _guardBase44 = createClientFromRequest(req);
      let _guardUser = null;
      try { _guardUser = await _guardBase44.auth.me(); } catch {}
      const _isPlatformLevel = _guardUser && ['admin', 'platform_owner', 'platform_admin'].includes(_guardUser.role);
      const _isInternalCall = body.skip_usage_log === true; // Nur runUnifiedResearch setzt skip_usage_log=true
      const _isTestCall = body._internal_test === true;
      if (!_isPlatformLevel && !_isInternalCall && !_isTestCall) {
        console.warn(`[generateLeads] DEPRECATED GUARD: Direct call from user=${_guardUser?.email} role=${_guardUser?.role} — rejected. Use startResearchRun instead.`);
        return Response.json({
          error: 'deprecated_function',
          message: 'Diese Funktion ist nicht mehr aktiv. Bitte nutzen Sie den aktuellen Recherche-Flow.',
          success: false,
        }, { status: 410 }); // 410 Gone
      }
      console.info(`[generateLeads] DEPRECATED but allowed: isPlatform=${_isPlatformLevel} isInternal=${_isInternalCall} user=${_guardUser?.email}`);
    }

    const access = await checkAccess(req, { organization_id, action: 'generate_leads' });
    if (!access.allowed) return Response.json({ error: access.message, success: false, reason: access.reason }, { status: 403 });
    if (!GOOGLE_PLACES_API_KEY) return Response.json({ error: 'GOOGLE_PLACES_API_KEY nicht konfiguriert', success: false }, { status: 500 });

    const configs = await base44.asServiceRole.entities.PlatformConfig.list();
    if (configs[0] && !configs[0].google_places_api_enabled) {
      return Response.json({
        success: false,
        error: 'service_temporarily_unavailable',
        message: configs[0].disabled_reason || 'Die Lead-Recherche ist gerade in Wartung. Wir sind in Kürze wieder verfügbar.'
      }, { status: 503 });
    }

    const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
    const org = orgs[0];
    if (!org) return Response.json({ error: 'Organization not found', success: false }, { status: 404 });

    if (access.user.role !== 'admin') {
      if (org.platform_status === 'suspended') return Response.json({ error: 'organization_suspended', message: 'Organisation gesperrt.', success: false }, { status: 403 });
      if (org.abuse_status === 'blocked') return Response.json({ error: 'abuse_blocked', message: 'Zugang eingeschränkt. Support kontaktieren.', success: false }, { status: 403 });
    }
    const billingOk = ['preview', 'active', 'trialing'].includes(org.billing_status);
    if (!billingOk) return Response.json({ error: `Billing status "${org.billing_status}" nicht erlaubt.`, success: false }, { status: 402 });

    const trialStage = org.trial_stage || 'free_preview';
    const remainingPreviewLeads = Math.max(0, 10 - (org.trial_leads_granted || 0));

    if (trialStage === 'free_preview') {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentRuns = await base44.asServiceRole.entities.ResearchRun.filter(
        { organization_id },
        '-created_date',
        10
      );
      const runsLast24h = recentRuns.filter(
        r => new Date(r.created_date) >= last24h
      ).length;

      if (runsLast24h >= 3) {
        return Response.json({
          success: false,
          error: 'free_preview_daily_limit',
          message: 'Du hast deine kostenlosen Vorschau-Recherchen für heute aufgebraucht.',
          cta: 'Mit dem Testzugang kannst du mehr recherchieren.',
          cta_url: '/settings?tab=billing'
        }, { status: 429 });
      }
    }

    const settingsRecords = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id });
    const settings = {};
    settingsRecords.forEach(s => { settings[s.key] = s.value; });

    // Load currentUsage early (needed for verified_trial budget check)
    const periodMonth = getPeriodMonth();
    const existingUsage = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
    const currentUsage = existingUsage[0] || { leads_created: 0 };

    const learnedSignalsRecords = await base44.asServiceRole.entities.OrgLearnedSignals.filter({ organization_id });
    const learnedSignals = learnedSignalsRecords[0] || null;

    let learnedPriorityCategories = [];
    let learnedWinningSignals = [];

    if (learnedSignals) {
      try {
        const cats = JSON.parse(learnedSignals.priority_categories || '[]');
        learnedPriorityCategories = cats.filter(c => c.score > 55 && c.total >= 2).map(c => c.category);
        learnedWinningSignals = JSON.parse(learnedSignals.winning_signals || '[]').map(s => s.signal);
      } catch (e) {
        console.warn('[generateLeads] OrgLearnedSignals parse error:', e?.message);
      }
    }

    // ── Canonical Research Settings Resolver ────────────────────────────────
    // Liest alle Legacy- und Canonical-Keys zusammen. Kein Stadt-Sonderfall.
    // Reihenfolge: org-Felder > canonical settings-keys > legacy settings-keys
    const industry = settings.industry_name || settings.own_industry || settings.industry || org.industry || '';
    const targetCustomerTypes = (settings.target_customer_types || settings.zielkunden || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    const excludedCustomerTypes = (settings.excluded_customer_types || settings.zielkunden_ausschluss || '').split(/,|, /).map(x => x.trim()).filter(Boolean);

    // Haupt-Suchstadt: org-Felder haben Vorrang (direkt auf Organization gespeichert)
    const city = org.service_area_city || settings.service_area_city || settings.lead_plz_city || settings.lead_plz || '';
    if (!city) return Response.json({ error: 'Kein Suchgebiet definiert. Bitte in den Einstellungen eine Stadt angeben.', success: false }, { status: 400 });

    // Radius: org-Felder haben Vorrang
    const radiusKm = parseFloat(
      (org.service_area_radius_km && org.service_area_radius_km > 0 ? org.service_area_radius_km : null) ||
      settings.service_area_radius_km || settings.lead_radius_km || '25'
    ) || 25;
    const radiusMeters = Math.min(radiusKm * 1000, 50000);

    // Zusätzliche Zielorte: target_locations_json (strukturiert, mit place_id/lat/lng) hat Vorrang
    // Fallback auf target_locations (Legacy-Kommaliste) und additional_cities
    let additionalCityObjects = []; // [{ city, place_id, lat, lng }]
    if (settings.target_locations_json) {
      try {
        const parsed = JSON.parse(settings.target_locations_json);
        if (Array.isArray(parsed)) additionalCityObjects = parsed.filter(o => o && o.city);
      } catch {}
    }

    const rawLegacyCities = [
      ...(settings.target_locations || '').split(','),
      ...(settings.additional_cities || '').split(','),
      ...(settings.targetLocations || '').split(','),
    ].map(s => s.trim()).filter(Boolean);

    // Merge: strukturierte Objekte bevorzugen, Legacy-Strings als Fallback ergänzen
    const structuredCityNames = new Set(additionalCityObjects.map(o => o.city.toLowerCase()));
    for (const c of rawLegacyCities) {
      if (!structuredCityNames.has(c.toLowerCase())) {
        additionalCityObjects.push({ city: c, place_id: null, lat: null, lng: null });
        structuredCityNames.add(c.toLowerCase());
      }
    }

    // additionalCities wird weiter unten nach Grid-Aufteilung gesetzt.
    // Hauptstadt aus Liste bereits entfernt in der Merge-Logik oben.
    console.info(`[generateLeads] resolveResearchSettings: city="${city}" radius=${radiusKm}km additionalCityObjects=${additionalCityObjects.length} industry="${industry}" targetTypes=${targetCustomerTypes.length}`);

    const searchPlan = buildSearchPlan({
      industry,
      targetCustomerTypes,
      excludedCustomerTypes,
      location: city,
      radiusKm,
      trialStage,
      remainingLeadBudget: remainingPreviewLeads,
      additionalCities: [],
      searchPoints: [],
      learnedPriorityCategories,
      learnedWinningSignals,
    });

    if (searchPlan.blocked || searchPlan.queryBudget?.blocked) {
      const reason = searchPlan.queryBudget?.reason || searchPlan.error;
      if (reason === 'preview_limit_reached' || trialStage === 'free_preview' && remainingPreviewLeads <= 0) {
        console.warn(`[generateLeads] Preview-Limit: ${org.trial_leads_granted}/10 für org=${organization_id}`);
        return Response.json({
          error: 'trial_preview_limit_reached',
          message: 'Kostenlose Vorschau aufgebraucht. Aktivieren Sie den verifizierten Testzugang.',
          success: false, trial_stage: trialStage,
          limits: { max_leads: 10, used: org.trial_leads_granted || 0 }
        }, { status: 403 });
      }
      if (reason === 'unknown_industry' || !searchPlan.industryProfile) {
        console.warn(`[generateLeads] Keine Taxonomie für Branche "${industry}" – nutze Legacy-Fallback`);
      } else {
        return Response.json({ error: searchPlan.error || 'SearchPlan-Fehler', success: false }, { status: 400 });
      }
    }

    // Fast-Mode überschreibt immer das Budget – egal was searchPlan zurückgegeben hat
    const baseQueryBudget = searchPlan.queryBudget || getQueryBudget(trialStage, remainingPreviewLeads, isFastMode);
    const queryBudget = isFastMode
      ? { ...baseQueryBudget, maxSearchQueries: 4, maxPlaceDetails: 20, maxLeadsToSave: 10, blocked: false }
      : baseQueryBudget;
    
    // ── P2: Plan-Limits laden + Monatslimit prüfen ───────────────────────────
    let monthlyContactLimit = 300;
    if (org.plan_id) {
      const plans = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
      if (plans[0]) monthlyContactLimit = plans[0].max_leads_per_month ?? 300;
    } else if (trialStage === 'paid') {
      console.warn(`[generateLeads] trial_stage=paid aber plan_id leer. Nutze Fallback-Limit.`);
    }

    const monthlyContactsUsed = currentUsage.leads_created || 0;
    const remainingMonthlyContacts = monthlyContactLimit === -1 ? 9999 : Math.max(0, monthlyContactLimit - monthlyContactsUsed);

    // Monatslimit erschöpft?
    if (monthlyContactLimit !== -1 && monthlyContactsUsed >= monthlyContactLimit) {
      const isTrialMsg = trialStage === 'verified_trial';
      return Response.json({
        success: false,
        error: isTrialMsg ? 'trial_monthly_contact_limit_reached' : 'monthly_contact_limit_reached',
        message: isTrialMsg
          ? `Ihr Testzugang-Kontingent von ${monthlyContactLimit} Firmenkontakten wurde erreicht.`
          : `Ihr monatliches Kontakt-Limit von ${monthlyContactLimit} wurde erreicht.`,
        monthly_usage: { monthly_limit: monthlyContactLimit, monthly_used: monthlyContactsUsed, remaining: 0 },
        cta_url: '/settings?tab=billing'
      }, { status: 429 });
    }

    // ── P2: effectiveTargetCount = min(requested, per-run-limit, remaining-monthly) ──
    let effectiveTargetCount;
    if (trialStage === 'free_preview') {
      effectiveTargetCount = remainingPreviewLeads;
    } else {
      effectiveTargetCount = Math.min(requestedTargetCount, PER_RESEARCH_RUN_LIMIT, remainingMonthlyContacts);
    }
    const wasClampedByMonthly = effectiveTargetCount < Math.min(requestedTargetCount, PER_RESEARCH_RUN_LIMIT);
    const wasClamped = wasClampedByRunLimit || wasClampedByMonthly;

    // Legacy alias für bestehende Logik unten
    const target_count = requestedTargetCount;
    const effectiveTarget = effectiveTargetCount;

    // ── Koordinaten: strukturierte place_id-Koordinaten bevorzugen ──────────
    // Priorität: service_area_lat/lng (aus Autocomplete gespeichert) > Google Places Geocoding
    let cityCoords = null;
    const savedLat = parseFloat(settings.service_area_lat || settings.lead_lat || '0');
    const savedLng = parseFloat(settings.service_area_lng || settings.lead_lng || '0');

    if (savedLat && savedLng && Math.abs(savedLat) > 0.001 && Math.abs(savedLng) > 0.001) {
      cityCoords = { lat: savedLat, lng: savedLng };
      console.info(`[generateLeads] Koordinaten aus Settings: lat=${savedLat} lng=${savedLng} (place_id=${settings.service_area_place_id || 'n/a'})`);
    } else {
      // Fallback: Google Places Text Search Geocoding
      console.info(`[generateLeads] Geocoding Fallback für "${city}"…`);
      const cityQuery = city + ' Deutschland';
      const refRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(cityQuery)}&key=${GOOGLE_PLACES_API_KEY}&language=de`);
      const refData = await refRes.json();
      cityCoords = refData.results?.[0]?.geometry?.location
        ? { lat: refData.results[0].geometry.location.lat, lng: refData.results[0].geometry.location.lng }
        : null;
      if (!cityCoords) return Response.json({ error: `Stadt "${city}" nicht gefunden. Bitte in den Einstellungen eine Stadt aus der Vorschlagsliste auswählen.`, success: false }, { status: 400 });
      console.info(`[generateLeads] Geocoding Fallback Ergebnis: lat=${cityCoords.lat} lng=${cityCoords.lng}`);
    }

    // ── SearchPoints: Haupt-Grid + eigene Grids für jeden Zusatzort mit Koordinaten ──
    // Jeder Ort mit lat/lng bekommt eigene SearchPoints, sodass wirklich um jeden Ort gesucht wird.
    const mainGridPoints = generateSearchGrid(cityCoords.lat, cityCoords.lng, radiusKm, trialStage);

    // Zusatzorte mit Koordinaten auflösen (max 4 im Normal-Mode, 2 im Fast Mode)
    const maxAdditionalLocations = isFastMode ? 2 : 4;
    const additionalCityObjectsWithCoords = additionalCityObjects
      .filter(o => o.city.toLowerCase() !== city.toLowerCase() && o.lat && o.lng)
      .slice(0, maxAdditionalLocations);
    const additionalCityObjectsWithoutCoords = additionalCityObjects
      .filter(o => o.city.toLowerCase() !== city.toLowerCase() && (!o.lat || !o.lng))
      .slice(0, maxAdditionalLocations);

    // Grid-Punkte für jeden Zusatzort mit Koordinaten erzeugen
    // Im Fast Mode: nur Center-Punkt, kein vollständiges Grid
    const additionalSearchPoints = [];
    for (const loc of additionalCityObjectsWithCoords) {
      if (isFastMode) {
        additionalSearchPoints.push({ lat: loc.lat, lng: loc.lng, label: `extra_${loc.city}`, centerLat: loc.lat, centerLng: loc.lng, centerCity: loc.city });
      } else {
        const locGrid = generateSearchGrid(loc.lat, loc.lng, radiusKm, trialStage);
        for (const p of locGrid) {
          additionalSearchPoints.push({ ...p, label: `extra_${loc.city}_${p.label}`, centerLat: loc.lat, centerLng: loc.lng, centerCity: loc.city });
        }
      }
    }

    // Legacy-Städte ohne Koordinaten: nur als Strings für buildSearchPlan weitergeben
    const additionalCities = additionalCityObjectsWithoutCoords.map(o => o.city);

    const allSearchPoints = isFastMode
      ? [{ lat: cityCoords.lat, lng: cityCoords.lng, label: 'center', centerLat: cityCoords.lat, centerLng: cityCoords.lng, centerCity: city }]
      : [
          ...mainGridPoints.map(p => ({ ...p, centerLat: cityCoords.lat, centerLng: cityCoords.lng, centerCity: city })),
          ...additionalSearchPoints,
        ];

    console.info(`[generateLeads] Grid: ${mainGridPoints.length} Hauptpunkte + ${additionalSearchPoints.length} Zusatzort-Punkte = ${allSearchPoints.length} gesamt (${trialStage})`);

    const fullSearchPlan = buildSearchPlan({
      industry,
      targetCustomerTypes,
      excludedCustomerTypes,
      location: city,
      radiusKm,
      trialStage: isFastMode ? 'free_preview' : trialStage,
      remainingLeadBudget: remainingPreviewLeads,
      additionalCities,
      searchPoints: allSearchPoints,
      learnedPriorityCategories,
      learnedWinningSignals,
    });
    searchPlan.searchQueries = isFastMode
      ? (fullSearchPlan.searchQueries || []).slice(0, 4)
      : fullSearchPlan.searchQueries;
    searchPlan.searchPoints = allSearchPoints;

    // Alle Suchzentren (Haupt + Zusatz mit Koordinaten) für Distanzprüfung
    const allSearchCenters = [
      { lat: cityCoords.lat, lng: cityCoords.lng, city },
      ...additionalCityObjectsWithCoords.map(o => ({ lat: o.lat, lng: o.lng, city: o.city })),
    ];

    // Suchstädte für Diagnose
    const searchCitiesUsed = allSearchCenters.map(c => c.city).slice(0, isFastMode ? 3 : 10);

    const lockResult = await acquireLock(base44, organization_id, access.user.email);
    if (!lockResult.acquired) {
      return Response.json({ error: `Recherche läuft bereits (${lockResult.lockedBy}).`, success: false, parallelLockActive: true }, { status: 429 });
    }
    _lockAcquired = true;

    let searchQueryList = (searchPlan.searchQueries || []);

    if (searchQueryList.length === 0 && targetCustomerTypes.length > 0) {
      console.warn(`[generateLeads] Fallback auf targetCustomerTypes für Queries`);
      const seen = new Set();
      const maxFallbackQueries = isFastMode ? 4 : (queryBudget.maxSearchQueries || 10);
      for (const tc of targetCustomerTypes.slice(0, maxFallbackQueries)) {
        const q = `${tc} ${city}`;
        if (!seen.has(q)) { seen.add(q); searchQueryList.push({ query: q, city, category: tc, variant: tc }); }
      }
    }

    if (searchQueryList.length === 0) return Response.json({ error: 'Keine Suchkategorien gefunden.', success: false }, { status: 400 });

    const industryProfile = searchPlan.industryProfile || null;

    console.info(`[generateLeads v2] START org=${organization_id} branche="${industry}" (${normalizeIndustryId(industry)}) stadt=${city} radius=${radiusKm}km trial=${trialStage} remaining=${remainingPreviewLeads} target=${effectiveTarget} queries=${searchQueryList.length}`);
    console.info(`[generateLeads v2] Engine: searchableCategories=${searchPlan.debug?.usedSearchableCategories?.length || 0} ignoredIdealProfiles=${searchPlan.debug?.ignoredIdealProfiles?.length || 0}`);

    const existing = await base44.asServiceRole.entities.Company.filter({ organization_id });
    const existingNames = new Set(existing.map(c => normStr(c.name || '')));

    const apiCounters = { textSearch: 1, placeDetailsEssentials: 0 };
    const seenPlaceIds = new Set();
    const createdIds = [];
    let raw_hits = 0, skipped_outside_radius = 0, skipped_duplicate = 0, skipped_no_match = 0, skipped_bad_fit = 0;
    const noMatchExamples = [], savedExamples = [], outsideRadiusExamples = [];
    let maxSavedDistanceKm = 0;
    let stopped_early = false, stop_reason = null;
    const maxPlaceDetails = queryBudget.maxPlaceDetails || 80;

    const gridPoints = searchPlan.searchPoints || [{ lat: cityCoords.lat, lng: cityCoords.lng, label: 'center', centerLat: cityCoords.lat, centerLng: cityCoords.lng }];
    const pointRadiusMeters = Math.min(15000, (radiusMeters / Math.max(gridPoints.length, 1)) * 1.5);

    outer: for (const point of gridPoints) {
      const pointCoords = { lat: point.lat, lng: point.lng };
      // Das Suchzentrum dieses Grid-Punktes für Distanzprüfung + Company-Create
      const pointCenter = { lat: point.centerLat ?? cityCoords.lat, lng: point.centerLng ?? cityCoords.lng, city: point.centerCity || city };
      
      for (const { query, category, variant } of searchQueryList) {
        if (createdIds.length >= effectiveTarget) {
          stopped_early = true; stop_reason = 'enough_leads_found';
          console.info(`[generateLeads v2] STOP: genug Leads (${createdIds.length}/${effectiveTarget})`);
          break outer;
        }

        if (shouldStopForTimeout()) {
          stopped_early = true; stop_reason = 'time_budget_reached';
          console.warn(`[generateLeads v2] STOP: Time budget (${MAX_RUNTIME_MS}ms) reached after ${createdIds.length} leads`);
          break outer;
        }

        const maxPages = (trialStage === 'free_preview' || isFastMode) ? 1 : 2;
        const places = await searchPlacesWithPagination(query, pointCoords, pointRadiusMeters, apiCounters, maxPages);
        raw_hits += places.length;
        console.info(`[generateLeads v2] Point=${point.label} Query="${query}" → ${places.length} Treffer`);

        for (const place of places) {
        if (createdIds.length >= effectiveTarget) {
          stopped_early = true; stop_reason = 'enough_leads_found'; break outer;
        }
        if (apiCounters.placeDetailsEssentials >= maxPlaceDetails) {
          stopped_early = true; stop_reason = 'place_details_limit';
          console.warn(`[generateLeads v2] Place-Details-Limit erreicht (${maxPlaceDetails})`);
          break outer;
        }

        if (seenPlaceIds.has(place.place_id)) continue;
        seenPlaceIds.add(place.place_id);

        const placeLat = place.geometry?.location?.lat, placeLng = place.geometry?.location?.lng;
        let distanceKm = null;
        if (placeLat && placeLng) {
          // Distanz zum Suchzentrum dieses Grid-Punktes prüfen
          distanceKm = haversineKm(pointCenter.lat, pointCenter.lng, placeLat, placeLng);
          if (distanceKm > radiusKm * 1.05) {
            // Zusätzlich gegen alle anderen Suchzentren prüfen – Treffer gültig wenn nahe an irgendeinem
            const nearAnyCenter = allSearchCenters.some(
              sc => haversineKm(sc.lat, sc.lng, placeLat, placeLng) <= radiusKm * 1.05
            );
            if (!nearAnyCenter) {
              skipped_outside_radius++;
              if (outsideRadiusExamples.length < 5) outsideRadiusExamples.push({ name: place.name, distance_km: Math.round(distanceKm * 10) / 10 });
              continue;
            }
            // Wenn nahe an einem anderen Zentrum: nehme die kleinste Distanz
            distanceKm = Math.min(...allSearchCenters.map(sc => haversineKm(sc.lat, sc.lng, placeLat, placeLng)));
          }
        }

        const chainCheck = isLikelyChain(place);
        if (chainCheck.isChain) {
          skipped_no_match++;
          if (noMatchExamples.length < 8) noMatchExamples.push({ name: place.name, reason: chainCheck.reason });
          console.info(`[generateLeads v2] SKIP CHAIN "${place.name}" (${chainCheck.reason})`);
          continue;
        }

        if (existingNames.has(normStr(place.name || ''))) { skipped_duplicate++; continue; }

        let scoring;
        if (industryProfile) {
          scoring = scoreLeadCandidate({ candidate: place, profile: industryProfile, distanceKm, radiusKm, matchedSearchCategory: category, learnedWinningSignals });
          if (!scoring.shouldSave) {
            skipped_no_match++;
            if (noMatchExamples.length < 8) noMatchExamples.push({ name: place.name, reason: scoring.bad_fit_reason || scoring.relevance_reason });
            console.info(`[generateLeads v2] SKIP "${place.name}" score=${scoring.search_quality_score} reason="${scoring.bad_fit_reason || scoring.relevance_reason}"`);
            continue;
          }
        } else {
          const bf = isBadFit(place, { negativeKeywords: [], badFitSignals: [] });
          if (bf.isBadFit) { skipped_bad_fit++; continue; }
          scoring = { search_quality_score: 60, matched_search_category: category, matched_target_customer_type: null, matched_service_context: null, relevance_reason: `Legacy: ${category}`, bad_fit_reason: null, shouldSave: true };
        }

        const details = await getPlaceDetails(place.place_id, apiCounters);
        const { plz, ort, adresse } = extractAddressComponents(details?.address_components || []);
        const phone = details?.formatted_phone_number || '';
        const website = details?.website || '';
        const lat = details?.geometry?.location?.lat || placeLat;
        const lng = details?.geometry?.location?.lng || placeLng;
        const roundedDist = distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null;

        const company = await base44.asServiceRole.entities.Company.create({
          organization_id,
          name: place.name || '',
          branche: scoring.matched_target_customer_type || scoring.matched_search_category || category,
          ort: ort || city,
          plz: plz || '',
          adresse: adresse || '',
          telefon: phone,
          email: '',
          website,
          latitude: lat || null,
          longitude: lng || null,
          quelle: 'Google Places API',
          status: 'Neu',
          is_hot: false,
          matched_target_customer_type: scoring.matched_target_customer_type,
          matched_service_context: scoring.matched_service_context,
          relevance_score: scoring.search_quality_score,
          relevance_reason: scoring.relevance_reason,
          excluded_reason: scoring.bad_fit_reason,
          source_query: variant || query,
          distance_km: roundedDist,
          search_center_city: pointCenter.city || city,
          search_center_lat: pointCenter.lat,
          search_center_lng: pointCenter.lng,
          search_radius_km: radiusKm,
        });

        createdIds.push(company.id);
        existingNames.add(normStr(place.name || ''));
        if (roundedDist !== null && roundedDist > maxSavedDistanceKm) maxSavedDistanceKm = roundedDist;
        if (savedExamples.length < 10) savedExamples.push({ name: place.name, city: ort || city, distance_km: roundedDist, score: scoring.search_quality_score });
        console.info(`[generateLeads v2] SAVED "${place.name}" (cat=${scoring.matched_search_category} score=${scoring.search_quality_score} dist=${roundedDist}km)`);
        }
        }
        if (createdIds.length >= effectiveTarget) break outer;
        }

    if (!stopped_early && createdIds.length >= effectiveTarget) { stopped_early = true; stop_reason = 'enough_leads_found'; }
    if (!stopped_early) { stop_reason = 'query_budget_exhausted'; }

    const isPartialTimeout = stop_reason === 'time_budget_reached' && createdIds.length > 0;

    const newLeadsSaved = createdIds.length;
    const chargedLeadGeneration = newLeadsSaved > 0;

    let runType = 'new_leads';
    if (newLeadsSaved === 0) {
      if (skipped_duplicate > 0 && skipped_no_match === 0) runType = 'duplicate_only';
      else if (raw_hits === 0) runType = 'zero_result';
      else runType = 'no_match';
    }

    const estimatedCostCent = skuCostCent('places_text_search_pro', apiCounters.textSearch) + skuCostCent('place_details_essentials', apiCounters.placeDetailsEssentials);

    // ── 0-Ergebnis-Diagnose ──────────────────────────────────────────────────
    let zero_result_cause = null;
    if (newLeadsSaved === 0) {
      if (searchQueryList.length === 0) zero_result_cause = 'no_search_queries';
      else if (raw_hits === 0) zero_result_cause = 'google_returned_zero_results';
      else if (skipped_duplicate > 0 && skipped_no_match === 0 && skipped_outside_radius === 0) zero_result_cause = 'all_duplicates';
      else if (skipped_outside_radius > skipped_no_match) zero_result_cause = 'all_outside_radius';
      else if (stop_reason === 'time_budget_reached') zero_result_cause = 'time_budget_reached_before_save';
      else if (stop_reason === 'place_details_limit') zero_result_cause = 'place_details_limit_reached';
      else if (skipped_no_match > 0) zero_result_cause = 'scoring_too_strict_or_bad_fit';
      else zero_result_cause = 'unknown';
      console.warn(`[generateLeads v2] ZERO RESULTS - cause=${zero_result_cause} raw=${raw_hits} dup=${skipped_duplicate} noMatch=${skipped_no_match} outRadius=${skipped_outside_radius} stop=${stop_reason}`);
    }

    const lastReport = {
      search_engine_version: SEARCH_ENGINE_VERSION,
      requestedTarget: target_count, effectiveTarget, saved: newLeadsSaved,
      duplicates: skipped_duplicate, noMatch: skipped_no_match,
      outsideRadius: skipped_outside_radius, rawHits: raw_hits,
      noMatchExamples, outsideRadiusExamples, savedExamples, maxSavedDistanceKm,
      // ── Vollständige Suchkonfiguration ──
      main_search_city: city,
      radius_km: radiusKm,
      additional_cities_resolved: allSearchCenters.slice(1).map(c => c.city),
      search_cities_used: searchCitiesUsed,
      grid_points_count: (searchPlan.searchPoints || []).length,
      // ── Diagnose ──
      runType, chargedLeadGeneration,
      stopped_early, stop_reason,
      zero_result_cause,
      search_queries_used: searchQueryList.map(q => q.query),
      used_search_categories: searchPlan.debug?.usedSearchableCategories || [],
      ignored_ideal_profiles: searchPlan.debug?.ignoredIdealProfiles || [],
      query_budget: queryBudget,
      industry_resolved: industry,
      industry_id: normalizeIndustryId(industry),
      taxonomy_used: !!searchPlan.industryProfile,
      is_fast_mode: isFastMode,
      timestamp: new Date().toISOString(),
    };

    // WICHTIG: Nur UsageLog schreiben wenn NOT called from runUnifiedResearch
    // Falls skip_usage_log=true, muss der Orchestrator (runUnifiedResearch) die Zählung machen
    if (!skip_usage_log) {
      await upsertUsageLog(base44, organization_id, {
        lead_generations_used: chargedLeadGeneration ? 1 : 0,
        leads_created: newLeadsSaved,
        textSearch: apiCounters.textSearch,
        placeDetails: apiCounters.placeDetailsEssentials,
        estimatedCostCent,
        skuBreakdown: {
          places_text_search_pro: { requests: apiCounters.textSearch, estimated_cost_cent: skuCostCent('places_text_search_pro', apiCounters.textSearch) },
          place_details_essentials: { requests: apiCounters.placeDetailsEssentials, estimated_cost_cent: skuCostCent('place_details_essentials', apiCounters.placeDetailsEssentials) },
        }
      }, lastReport);
    }

    let research_run_id = null;
    try {
      const run = await base44.asServiceRole.entities.ResearchRun.create({
        organization_id, run_type: runType, requested_target: target_count,
        leads_saved: newLeadsSaved, duplicates_skipped: skipped_duplicate,
        no_match_count: skipped_no_match, outside_radius_count: skipped_outside_radius,
        raw_hits, search_center_city: city, search_radius_km: radiusKm,
        target_customer_types: targetCustomerTypes.join(', '),
        excluded_customer_types: excludedCustomerTypes.join(', '),
        summary: JSON.stringify(lastReport),
        charged_lead_generation: chargedLeadGeneration,
        created_by: access.user.email,
      });
      research_run_id = run.id;
    } catch (e) { console.error('[generateLeads v2] ResearchRun Fehler:', e?.message); }

    if (research_run_id && createdIds.length > 0) {
      try { await Promise.all(createdIds.map(id => base44.asServiceRole.entities.Company.update(id, { research_run_id }))); } catch {}
    }

    if (trialStage === 'free_preview' && chargedLeadGeneration) {
      const newTotal = (org.trial_leads_granted || 0) + newLeadsSaved;
      await base44.asServiceRole.entities.Organization.update(organization_id, { trial_leads_granted: newTotal });
      console.info(`[generateLeads v2] trial_leads_granted: ${org.trial_leads_granted} → ${newTotal}`);
    }

    console.info(`[generateLeads v2] DONE: saved=${newLeadsSaved} raw=${raw_hits} noMatch=${skipped_no_match} dup=${skipped_duplicate} outRadius=${skipped_outside_radius} stop=${stop_reason} textSearch=${apiCounters.textSearch} placeDetails=${apiCounters.placeDetailsEssentials} cost=${estimatedCostCent.toFixed(2)}¢`);

    return Response.json({
      success: true,
      runType,
      research_run_id,
      chargedLeadGeneration,
      partial_timeout: isPartialTimeout,
      // ── P2: Saubere Run-vs-Monat-Trennung ────────────────────────────────
      current_run: {
        requested_count: requestedTargetCount,
        effective_target_count: effectiveTargetCount,
        created_count: newLeadsSaved,
        skipped_duplicates: skipped_duplicate,
        per_run_limit: PER_RESEARCH_RUN_LIMIT,
        was_clamped: wasClamped,
      },
      monthly_usage: trialStage !== 'free_preview' ? {
        monthly_limit: monthlyContactLimit,
        monthly_used_before: monthlyContactsUsed,
        monthly_used_after: monthlyContactsUsed + newLeadsSaved,
        remaining_after: monthlyContactLimit === -1 ? -1 : Math.max(0, monthlyContactLimit - (monthlyContactsUsed + newLeadsSaved)),
      } : null,
      // Legacy-Felder für bestehenden Frontend-Code
      count: newLeadsSaved,
      requestedTarget: requestedTargetCount,
      effectiveTarget: effectiveTargetCount,
      ...(trialStage === 'free_preview' ? {
        freePreviewReport: {
          saved: newLeadsSaved,
          totalPreviewBudget: 10,
          usedBefore: org.trial_leads_granted || 0,
          usedAfter: (org.trial_leads_granted || 0) + newLeadsSaved,
          remaining: Math.max(0, 10 - ((org.trial_leads_granted || 0) + newLeadsSaved)),
        }
      } : {}),
      summary: {
        raw_hits, saved: newLeadsSaved, duplicates: skipped_duplicate,
        excluded: 0, noMatch: skipped_no_match, outsideRadius: skipped_outside_radius,
        noMatchExamples, outsideRadiusExamples, savedExamples,
        maxSavedDistanceKm, radiusKm, searchCenterCity: city,
      },
      debug: {
        search_engine_version: SEARCH_ENGINE_VERSION,
        used_search_categories: searchPlan.debug?.usedSearchableCategories || [],
        ignored_ideal_profiles: searchPlan.debug?.ignoredIdealProfiles || [],
        search_queries_used: searchQueryList.map(q => q.query),
        query_budget: queryBudget,
        stopped_early,
        stop_reason,
        zero_result_cause,
        industryId: normalizeIndustryId(industry),
        taxonomyUsed: !!industryProfile,
        // Suchkonfiguration für Diagnose
        main_search_city: city,
        additional_cities_resolved: allSearchCenters.slice(1).map(c => c.city),
        search_cities_used: searchCitiesUsed,
        grid_points_count: (searchPlan.searchPoints || []).length,
        is_fast_mode: isFastMode,
      },
      googleRequests: { textSearch: apiCounters.textSearch, placeDetailsEssentials: apiCounters.placeDetailsEssentials },
      usage: { lead_generations_used: chargedLeadGeneration ? 1 : 0, leads_created: newLeadsSaved, estimated_external_cost_cent: estimatedCostCent },
    });

  } catch (error) {
    console.error('[generateLeads v2] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  } finally {
    if (_lockAcquired && _base44 && _orgId) await releaseLock(_base44, _orgId);
  }
});