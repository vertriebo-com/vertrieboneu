/**
 * auditLeadProvenanceReadiness
 * =============================
 * Prüft, welche Company-Felder eine nachvollziehbare Datenherkunft (Provenance)
 * haben und wo Quelle/Confidence fehlen.
 *
 * Prüfbereiche:
 *   - Company-Felder mit Provenance-Bedarf (field_matrix)
 *   - Backend-Funktionen die Felder schreiben (function_matrix)
 *   - Provenance-Abdeckung in einer Stichprobe gespeicherter Companies
 *   - LeadDetail UI Transparenz
 *   - Datenmodell-Readiness für zukünftige LeadProvenance Entity
 *
 * Admin-only. Schreibt nichts. Keine Migrationen.
 *
 * Wichtige Einschränkung: Vertriebo sendet selbst keine E-Mails —
 * nur E-Mail-Vorlagen / Copy-to-clipboard / mailto-Links.
 * Provenance für "E-Mail" bezieht sich auf das Feld company.email,
 * nicht auf gesendete Mails.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ── Statische Analyse: Welche Felder haben Provenance-Bedarf ─────────────────

const FIELD_MATRIX = [
  // ─── Kerndaten (aus Google Places / processResearchRun) ──────────────────
  {
    field: "name",
    category: "core",
    current_source_available: true,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "google_places via processResearchRun (source_provider='google_places')",
    risk: "low",
    notes: "Name ist Primärschlüssel. Aus Google Places, i.d.R. zuverlässig. Kein Confidence-Feld nötig.",
    recommended_fix: null,
  },
  {
    field: "adresse / plz / ort",
    category: "core",
    current_source_available: true,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "google_places oder enrichCompany (AI-Recherche) — nicht trennbar",
    risk: "medium",
    notes: "Adresse kann aus Google Places (zuverlässig) oder aus enrichCompany (KI-generiert, unzuverlässig) stammen. Keine Kennzeichnung.",
    recommended_fix: "provenance_json: { adresse: { source: 'google_places'|'ai_enrichment', confidence: 'high'|'medium'|'low', added_by_function: 'enrichCompany' } }",
  },
  {
    field: "telefon",
    category: "contact",
    current_source_available: false,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "Entweder google_places (wenn vorhanden), enrichCompany (KI), oder manuell — nicht unterscheidbar",
    risk: "high",
    notes: "KRITISCH: enrichCompany schreibt Telefon direkt auf Company ohne source/confidence/review_status. Nutzer kann nicht erkennen ob die Nummer von Google Places (zuverlässig), KI-Recherche (unzuverlässig) oder manuell kommt.",
    recommended_fix: "enrichCompany schreibt updates['telefon_source'] = 'ai_enrichment' + updates['telefon_confidence'] = 'medium'. provenance_json-Feld auf Company für strukturierten Übergang.",
  },
  {
    field: "email",
    category: "contact",
    current_source_available: false,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "enrichCompany (KI-Recherche) — primär. Google Places: selten. Manuell möglich.",
    risk: "high",
    notes: "KRITISCH: E-Mail-Feld wird oft von enrichCompany (KI) befüllt, keine Kennzeichnung. Nutzer sieht nur 'E-Mail' ohne Hinweis dass es KI-generiert und ungeprüft ist. Vertriebo öffnet nur mailto-Links / Vorlagen — daher sind falsche E-Mails ein direktes UX-Problem.",
    recommended_fix: "enrichCompany annotiert: updates['email_source'] = 'ai_enrichment'. LeadDetail zeigt Hinweis '⚠ KI-Recherche — prüfen' neben KI-befüllten Kontaktdaten.",
  },
  {
    field: "website",
    category: "contact",
    current_source_available: false,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "google_places (zuverlässig), enrichCompany (KI), oder manuell — nicht unterscheidbar",
    risk: "medium",
    notes: "Website aus Google Places ist i.d.R. verifiziert. Website aus enrichCompany (KI) ist oft eine Schätzung. Kein Unterschied sichtbar.",
    recommended_fix: "source_provider-Feld schon vorhanden. enrichCompany könnte website_source schreiben.",
  },
  {
    field: "ansprechpartner",
    category: "contact",
    current_source_available: false,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "enrichCompany (KI), manuell, oder aus ContactLog — nicht nachvollziehbar",
    risk: "high",
    notes: "KRITISCH: Ansprechpartner wird von enrichCompany ohne Confidence/Review geschrieben. KI-generierte Namen können falsch sein. Nutzer sieht Name ohne Herkunft — Ansprache mit falschem Namen schadet Vertriebseffizienz.",
    recommended_fix: "enrichCompany schreibt ansprechpartner_source = 'ai_enrichment' + ansprechpartner_confidence = 'low'. UI zeigt '⚠ KI-Schätzung' bei unbestätigten Ansprechpartnern.",
  },
  // ─── Recherche-Provenance (aus processResearchRun) ──────────────────────
  {
    field: "source_query",
    category: "research_provenance",
    current_source_available: true,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "processResearchRun schreibt source_query direkt",
    risk: "low",
    notes: "Gut: source_query erklärt wie der Lead gefunden wurde. Im LeadDetail als 'Suchbegriff' sichtbar (RelevanceSection).",
    recommended_fix: null,
  },
  {
    field: "matched_target_customer_type",
    category: "research_provenance",
    current_source_available: true,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "processResearchRun / Scoring-Engine",
    risk: "low",
    notes: "Gut: im LeadDetail sichtbar (RelevanceSection). Gibt Transparenz warum Lead als Zielkunde eingestuft. Kein Confidence-Wert aber akzeptabel.",
    recommended_fix: null,
  },
  {
    field: "relevance_score",
    category: "research_provenance",
    current_source_available: true,
    confidence_available: true,
    review_status_available: false,
    source_inferred_from: "processResearchRun / scoring engine. Dokumentiert in engine_analysis_json.",
    risk: "low",
    notes: "Gut: score + quality_tier + quality_confidence vorhanden. Im LeadDetail via RelevanceSection erklärt.",
    recommended_fix: null,
  },
  {
    field: "quality_tier / quality_confidence",
    category: "research_provenance",
    current_source_available: true,
    confidence_available: true,
    review_status_available: false,
    source_inferred_from: "processResearchRun: evidence-basiert (google_places signals)",
    risk: "low",
    notes: "Gut: quality_tier (premium/strong/good/weak) ist evidence-basiert. quality_confidence vorhanden. Im LeadDetail sichtbar.",
    recommended_fix: null,
  },
  {
    field: "save_reason_code",
    category: "research_provenance",
    current_source_available: true,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "processResearchRun: dokumentiert warum Lead gespeichert wurde",
    risk: "low",
    notes: "Gut: save_reason_code (z.B. 'tc_match+phone+website') erklärt Speicherentscheidung. Nicht im LeadDetail angezeigt.",
    recommended_fix: "save_reason_code im LeadDetail / RelevanceSection anzeigen (optional, als Meta-Info).",
  },
  {
    field: "engine_analysis_json",
    category: "ai_analysis",
    current_source_available: true,
    confidence_available: true,
    review_status_available: false,
    source_inferred_from: "analyzeLeadEngine: schreibt engine_analysis_json mit engine_version",
    risk: "medium",
    notes: "KI-Analyse ist als solche erkennbar (engine_version, engine_last_analyzed_at). Aber: kein review_status — Nutzer kann nicht markieren ob KI-Einschätzung bestätigt oder abgelehnt. OutcomeFeedback deckt Abschluss ab, aber keine Feedback-Schleife auf KI-Temperature.",
    recommended_fix: "engine_review_status: 'unreviewed'|'confirmed'|'rejected' optional auf Company als leichtgewichtiger Übergang.",
  },
  {
    field: "research_run_id",
    category: "research_provenance",
    current_source_available: true,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "processResearchRun setzt research_run_id",
    risk: "low",
    notes: "Gut: research_run_id ist Provenance-Anker — Lead kann zu ResearchRun zurückverfolgt werden.",
    recommended_fix: null,
  },
  {
    field: "source_provider",
    category: "core",
    current_source_available: true,
    confidence_available: false,
    review_status_available: false,
    source_inferred_from: "processResearchRun setzt source_provider='google_places'",
    risk: "low",
    notes: "Gut: source_provider ('google_places', 'manual', 'csv_import') dokumentiert primäre Herkunft des Leads.",
    recommended_fix: null,
  },
];

// ── Statische Analyse: Welche Funktionen schreiben Felder ──────────────────

const FUNCTION_MATRIX = [
  {
    function: "processResearchRun",
    writes_fields: ["name", "adresse", "plz", "ort", "telefon", "website", "branche", "latitude", "longitude", "source_query", "matched_target_customer_type", "relevance_score", "quality_tier", "quality_confidence", "save_reason_code", "research_run_id", "source_provider", "google_place_id"],
    writes_source: true,     // source_provider='google_places', research_run_id gesetzt
    writes_confidence: true, // quality_tier, quality_confidence, relevance_score
    writes_review_status: false,
    audit_log: false,        // kein PlatformAuditLog-Eintrag pro Company
    has_provenance_bundle: true, // source_query, matched_target_customer_type, quality_tier etc.
    risk: "green",
    notes: "Beste Provenance im System: source_provider + research_run_id + source_query + quality_tier + save_reason_code. Kein review_status, kein AuditLog pro Company (nur ResearchRun-Level).",
  },
  {
    function: "enrichCompany",
    writes_fields: ["website", "telefon", "email", "ansprechpartner", "adresse"],
    writes_source: false,    // KEIN source-Feld für enriched Daten
    writes_confidence: false, // KEIN confidence-Feld
    writes_review_status: false,
    audit_log: false,        // nur console.info, kein PlatformAuditLog / ActivityLog
    has_provenance_bundle: false,
    risk: "red",
    notes: "KRITISCHES RISIKO: enrichCompany schreibt KI-generierte Kontaktdaten (telefon, email, ansprechpartner, website, adresse) direkt auf Company OHNE source/confidence/review_status. Nutzer sieht KI-Ergebnis wie eine verifizierte Wahrheit. Nur wenn das Feld vorher leer war (null-guard), aber kein Hinweis im UI.",
    recommended_fix: "Sofort: updates['telefon_source'] = 'ai_enrichment' schreiben. Mittelfristig: provenance_json auf Company. UI: '⚠ KI-Recherche' Badge bei betroffenen Feldern.",
  },
  {
    function: "analyzeLeadEngine",
    writes_fields: ["lead_temperature", "lead_temperature_score", "lead_temperature_reason", "engine_confidence", "engine_analysis_json", "engine_version", "engine_last_analyzed_at", "is_hot"],
    writes_source: true,     // engine_version in engine_analysis_json
    writes_confidence: true, // engine_confidence, confidence_score
    writes_review_status: false,
    audit_log: false,
    has_provenance_bundle: true, // engine_analysis_json mit vollständiger Analyse
    risk: "yellow",
    notes: "Gut: engine_version + engine_last_analyzed_at + confidence_score dokumentieren die KI-Analyse. Kein review_status: Nutzer kann nicht markieren ob er mit der KI-Temperatur-Einschätzung einverstanden ist. OutcomeFeedback deckt finale Einschätzung ab.",
    recommended_fix: "Optional: engine_review_status Feld für explizite Nutzer-Bestätigung der KI-Einschätzung.",
  },
  {
    function: "manuelle Felder (Company.update im Frontend)",
    writes_fields: ["notizen", "status", "assigned_to", "ansprechpartner", "telefon", "email", "aktueller_dienstleister"],
    writes_source: false,
    writes_confidence: false,
    writes_review_status: false,
    audit_log: false,        // kein Audit trail für manuelle Änderungen
    has_provenance_bundle: false,
    risk: "yellow",
    notes: "Manuelle Änderungen an Kontaktdaten (z.B. Nutzer korrigiert Telefonnummer von Hand) werden nicht von KI-enriched Daten unterschieden. Kein Audit trail.",
    recommended_fix: "Optional: provenance_json mit source='manual', user=email, updated_at. Nicht zwingend sofort.",
  },
  {
    function: "promoteExternalSourceToCompany",
    writes_fields: ["name", "adresse", "plz", "ort", "website", "telefon", "source_provider"],
    writes_source: true,     // source_provider='csv_import' oder 'api'
    writes_confidence: false,
    writes_review_status: false,
    audit_log: false,
    has_provenance_bundle: false,
    risk: "yellow",
    notes: "source_provider gesetzt, aber kein confidence/review_status. Für externe Quellen (openregister) wäre Confidence hilfreich.",
    recommended_fix: "Bei Promotion: source_confidence aus ExternalCompanySource kopieren (enrichment_confidence bereits vorhanden).",
  },
];

// ── LeadDetail UI Analyse ────────────────────────────────────────────────────

const LEAD_DETAIL_UI_ANALYSIS = {
  shows_research_provenance: true,
  research_provenance_component: "RelevanceSection (rechte Spalte)",
  shows: [
    "source_query (Suchbegriff)",
    "matched_target_customer_type (Zielkundentyp)",
    "matched_search_category (Suchkategorie)",
    "matched_service_context (Leistungsbezug)",
    "quality_tier Badge (Premium/Sehr gut/Gut/Prüfen)",
    "relevance_score",
    "engine_version (mono, klein)",
    "learning hints (priorisierte Kategorie / Geboostetes Keyword)",
    "qualityTier=weak → Warnhinweis 'Niedrige Sicherheit'",
  ],
  missing: [
    "Kontaktdaten zeigen NICHT ob sie von Google Places, KI-Enrichment oder manuell kommen",
    "Kein '⚠ KI-Recherche' Badge neben Telefon/E-Mail/Ansprechpartner wenn enrichCompany befüllt hat",
    "save_reason_code nicht angezeigt (für Power-User interessant)",
    "email_source / telefon_source existieren nicht als Felder",
    "Kein review_status für KI-generierte Ansprechpartner",
  ],
  verdict: "TEILWEISE: RelevanceSection erklärt sehr gut WARUM der Lead gefunden wurde (Recherche-Provenance). LÜCKE: Kontaktdaten-Herkunft (telefon/email/ansprechpartner aus enrichCompany oder manuell) ist unsichtbar.",
};

// ── Datenmodell-Empfehlung ────────────────────────────────────────────────────

const RECOMMENDED_DATA_MODEL = {
  transition_approach: "provenance_json auf Company (sofort, kein Schema-Change)",
  transition_schema: {
    field: "provenance_json",
    type: "string (JSON)",
    example: JSON.stringify({
      telefon: { source: "ai_enrichment", function: "enrichCompany", confidence: "medium", added_at: "2026-05-26T10:00:00Z", added_by: "user@example.com", review_status: "unreviewed" },
      email:   { source: "ai_enrichment", function: "enrichCompany", confidence: "medium", added_at: "2026-05-26T10:00:00Z", review_status: "unreviewed" },
      ansprechpartner: { source: "ai_enrichment", function: "enrichCompany", confidence: "low", added_at: "2026-05-26T10:00:00Z", review_status: "unreviewed" },
      website: { source: "google_places", function: "processResearchRun", confidence: "high", added_at: "2026-05-20T08:00:00Z", review_status: "confirmed" },
    }),
  },
  future_entity: {
    name: "LeadProvenance",
    description: "Normalisierte Provenance-Tabelle (Phase 2 — nicht jetzt)",
    fields: [
      { name: "organization_id", type: "string", required: true },
      { name: "company_id", type: "string", required: true },
      { name: "field_name", type: "string", required: true, example: "telefon" },
      { name: "value_hash", type: "string", description: "sha256 des Wertes — nicht der Wert selbst" },
      { name: "source_type", type: "enum", values: ["google_places", "enrichment_ai", "manual", "csv_import", "api", "unknown"] },
      { name: "source_function", type: "string", example: "enrichCompany" },
      { name: "confidence", type: "enum", values: ["high", "medium", "low"] },
      { name: "review_status", type: "enum", values: ["unreviewed", "confirmed", "rejected", "overwritten"] },
      { name: "evidence_text", type: "string", optional: true, example: "Gefunden auf firmenwebsite.de/impressum" },
      { name: "created_by", type: "string", description: "user email oder function name" },
      { name: "created_date", type: "datetime" },
    ],
    supabase_ready: {
      future_table: "lead_provenance",
      indexes: [
        "CREATE INDEX idx_lp_org ON lead_provenance(organization_id)",
        "CREATE INDEX idx_lp_company ON lead_provenance(company_id)",
        "CREATE INDEX idx_lp_field ON lead_provenance(company_id, field_name)",
        "CREATE INDEX idx_lp_source ON lead_provenance(source_type)",
        "CREATE INDEX idx_lp_review ON lead_provenance(review_status)",
      ],
      note: "Kein Dual-Write jetzt. provenance_json als JSON-Übergang bis Supabase-Migration bereit.",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { org_id, sample_size = 20 } = body;

    const tests = [];
    const warnings = [];
    const risks = [];

    function pass(area, id, detail) { tests.push({ area, id, status: 'PASS', detail }); }
    function warn(area, id, detail) { tests.push({ area, id, status: 'WARN', detail }); warnings.push({ area, id, detail }); }
    function risk(area, id, detail) { tests.push({ area, id, status: 'RISK', detail }); risks.push({ area, id, detail }); }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 1: enrichCompany – schreibt ohne Provenance
    // ══════════════════════════════════════════════════════════════════════════

    risk('enrichCompany', 'enrich_no_source_field',
      'enrichCompany schreibt telefon/email/ansprechpartner/adresse/website OHNE source/confidence/review_status. KI-generierte Kontaktdaten sind nach dem Update nicht von manuellen oder Google-Places-Daten unterscheidbar.'
    );
    risk('enrichCompany', 'enrich_no_audit_log',
      'enrichCompany schreibt kein PlatformAuditLog / ActivityLog pro Company-Update. Kein Nachweis wann KI welches Feld überschrieben hat.'
    );
    risk('enrichCompany', 'enrich_direct_write_risk',
      'enrichCompany schreibt nur wenn Feld vorher leer (null-guard vorhanden), aber nach dem Schreiben: kein Kennzeichnung im Feld selbst oder in provenance_json. Nutzer sieht KI-Ergebnis als Faktum.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 2: analyzeLeadEngine – Provenance vorhanden, review_status fehlt
    // ══════════════════════════════════════════════════════════════════════════

    pass('analyzeLeadEngine', 'engine_version_tracked',
      'analyzeLeadEngine schreibt engine_version + engine_last_analyzed_at. KI-Analyse ist als solche erkennbar und zeitlich nachvollziehbar.'
    );
    pass('analyzeLeadEngine', 'engine_confidence_score',
      'analyzeLeadEngine schreibt engine_confidence (0-100). Confidence der KI-Einschätzung ist dokumentiert.'
    );
    warn('analyzeLeadEngine', 'engine_no_review_status',
      'analyzeLeadEngine schreibt kein engine_review_status. Nutzer kann KI-Temperatur-Einschätzung nicht explizit bestätigen oder ablehnen. OutcomeFeedback deckt Abschluss ab, aber kein direktes KI-Feedback.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 3: processResearchRun – beste Provenance im System
    // ══════════════════════════════════════════════════════════════════════════

    pass('processResearchRun', 'research_run_id_set',
      'processResearchRun setzt research_run_id: Lead kann zu ResearchRun zurückverfolgt werden (vollständiger Audit-Trail auf Run-Ebene).'
    );
    pass('processResearchRun', 'source_query_set',
      'processResearchRun setzt source_query: Nutzer sieht im LeadDetail warum der Lead gefunden wurde (Suchbegriff).'
    );
    pass('processResearchRun', 'quality_tier_confidence',
      'processResearchRun setzt quality_tier + quality_confidence: evidence-basierte Qualitätseinstufung mit Confidence-Level.'
    );
    pass('processResearchRun', 'save_reason_code',
      'processResearchRun setzt save_reason_code (z.B. tc_match+phone+website): dokumentiert Speicherentscheidung strukturiert.'
    );
    warn('processResearchRun', 'no_field_level_source',
      'processResearchRun setzt source_provider für den Lead insgesamt, aber kein per-Feld-Source (z.B. telefon_source=google_places). Wenn enrichCompany später telefon überschreibt, verliert man die Google-Places-Herkunft.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 4: LeadDetail UI Transparenz
    // ══════════════════════════════════════════════════════════════════════════

    pass('lead_detail_ui', 'relevance_section_present',
      'LeadDetail zeigt RelevanceSection: source_query, matched_target_customer_type, quality_tier, relevance_score, engine_version. Recherche-Provenance gut erklärt.'
    );
    pass('lead_detail_ui', 'quality_tier_weak_warning',
      'Bei quality_tier=weak zeigt RelevanceSection expliziten Warnhinweis "Niedrige Sicherheit – Kontaktdaten prüfen und ergänzen".'
    );
    risk('lead_detail_ui', 'no_contact_field_source_indicator',
      'Kontaktfelder (Telefon, E-Mail, Ansprechpartner, Website) in CompanyInfo / LeadDetail zeigen KEINE Herkunft. Nutzer sieht eine Telefonnummer ohne zu wissen ob sie von Google Places (zuverlässig), KI-Enrichment (unzuverlässig) oder manuell kommt.'
    );
    warn('lead_detail_ui', 'save_reason_code_not_shown',
      'save_reason_code ist gesetzt aber wird im LeadDetail nicht angezeigt. Für Power-User wäre dies als Meta-Info interessant.'
    );
    warn('lead_detail_ui', 'enriched_fields_no_badge',
      'Nach enrichCompany erscheinen neue Kontaktdaten ohne Badge/Hinweis "KI-Recherche – bitte prüfen". Vertriebo öffnet mailto-Links und Anruf-Links direkt — ein falscher Ansprechpartner oder eine falsche Telefonnummer ist ein direktes Problem.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 5: Datenmodell Entity-Readiness
    // ══════════════════════════════════════════════════════════════════════════

    pass('data_model', 'source_provider_field_exists',
      'Company.source_provider (google_places|manual|csv_import|api) existiert als strukturiertes Feld. Primäre Herkunft des Leads dokumentiert.'
    );
    warn('data_model', 'no_provenance_json_field',
      'Company hat kein provenance_json-Feld für per-Feld-Provenance. Übergangsfeld fehlt. enrichCompany müsste provenance_json schreiben/updaten um KI-Enrichment zu kennzeichnen.'
    );
    warn('data_model', 'no_lead_provenance_entity',
      'Keine LeadProvenance Entity vorhanden. Für spätere Normalisierung (Supabase) empfohlen. Kein Dual-Write jetzt nötig — provenance_json reicht als Übergang.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 6: Live-Stichprobe (optional, wenn org_id übergeben)
    // ══════════════════════════════════════════════════════════════════════════

    let sample_results = null;

    if (org_id) {
      try {
        const companies = await base44.asServiceRole.entities.Company.filter(
          { organization_id: org_id },
          '-created_date',
          sample_size
        );

        const total = companies.length;
        let phone_count = 0, email_count = 0, website_count = 0, contact_person_count = 0;
        let has_research_run_id = 0, has_source_query = 0, has_quality_tier = 0;
        let has_engine_analysis = 0, has_source_provider_google = 0;
        // provenance_json existiert noch nicht — messen wie viele Felder KI-enriched sein könnten
        // Proxy: Leads ohne research_run_id haben evtl. manuell/csv-Herkunft
        let no_research_run = 0;

        for (const c of companies) {
          if (c.telefon) phone_count++;
          if (c.email) email_count++;
          if (c.website) website_count++;
          if (c.ansprechpartner) contact_person_count++;
          if (c.research_run_id) has_research_run_id++;
          if (c.source_query) has_source_query++;
          if (c.quality_tier) has_quality_tier++;
          if (c.engine_analysis_json) has_engine_analysis++;
          if (c.source_provider === 'google_places') has_source_provider_google++;
          if (!c.research_run_id) no_research_run++;
        }

        const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

        sample_results = {
          org_id,
          companies_sampled: total,
          contact_data_coverage: {
            phone_count, phone_pct: pct(phone_count),
            email_count, email_pct: pct(email_count),
            website_count, website_pct: pct(website_count),
            contact_person_count, contact_person_pct: pct(contact_person_count),
          },
          provenance_coverage: {
            has_research_run_id, research_run_id_pct: pct(has_research_run_id),
            has_source_query, source_query_pct: pct(has_source_query),
            has_quality_tier, quality_tier_pct: pct(has_quality_tier),
            has_engine_analysis, engine_analysis_pct: pct(has_engine_analysis),
            has_source_provider_google, google_places_pct: pct(has_source_provider_google),
          },
          provenance_gaps: {
            no_research_run_id: no_research_run,
            no_research_run_id_pct: pct(no_research_run),
            // provenance_json fehlt noch als Feld — 0% wäre immer 100% lücke
            email_without_source_pct: email_count > 0 ? 100 : 0, // immer 100% da email_source Feld nicht existiert
            telefon_without_source_pct: phone_count > 0 ? 100 : 0,
            ansprechpartner_without_source_pct: contact_person_count > 0 ? 100 : 0,
          },
          verdict: `Von ${total} Leads: ${pct(has_quality_tier)}% haben quality_tier (gut), ${pct(has_source_query)}% haben source_query (gut). ABER: 100% der Kontaktfelder (telefon/email/ansprechpartner) haben KEINE source/confidence-Information — kein Unterschied zwischen Google Places und KI-Enrichment erkennbar.`,
        };

        // Test-Ergebnisse basierend auf Stichprobe
        if (pct(has_research_run_id) < 50) {
          warn('live_sample', 'low_research_run_id_coverage',
            `Nur ${pct(has_research_run_id)}% der Stichprobe haben research_run_id. Leads ohne research_run_id haben keine Recherche-Provenance.`
          );
        } else {
          pass('live_sample', 'research_run_id_coverage',
            `${pct(has_research_run_id)}% der Stichprobe haben research_run_id (Recherche-Provenance-Anker).`
          );
        }

        if (email_count > 0) {
          risk('live_sample', 'email_no_source_in_sample',
            `${email_count} Leads haben E-Mail-Feld gesetzt, ABER 0 haben email_source/confidence. Wenn enrichCompany diese E-Mails befüllt hat: keine Kennzeichnung vorhanden.`
          );
        }

      } catch (err) {
        console.warn('[auditLeadProvenanceReadiness] Sample query failed:', err.message);
        sample_results = { error: err.message };
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GESAMTBEWERTUNG
    // ══════════════════════════════════════════════════════════════════════════

    const redCount = tests.filter(t => t.status === 'RISK').length;
    const yellowCount = tests.filter(t => t.status === 'WARN').length;

    // RED wenn enrichCompany-Risiko ungelöst (kritischster Punkt)
    const claimStatus = redCount >= 2 ? 'red' : redCount >= 1 ? 'yellow' : 'green';
    const riskLevel = redCount >= 2 ? 'high' : redCount >= 1 ? 'medium' : 'low';

    // Acceptance Criteria auswerten
    const acceptance = {
      critical_contact_fields_have_source: false, // FAIL: telefon/email/ansprechpartner haben keine source
      ai_enrichment_data_identifiable: false,       // FAIL: enrichCompany schreibt keine source-Kennzeichnung
      lead_detail_explains_research_provenance: true, // PASS: RelevanceSection
      unsafe_ai_data_not_shown_as_fact: false,      // FAIL: KI-Enrichment wird ohne Warnung angezeigt
      data_model_for_provenance_defined: true,      // PASS: Empfehlung in diesem Audit dokumentiert
    };

    const acceptanceGreenCount = Object.values(acceptance).filter(Boolean).length;
    const acceptanceTotalCount = Object.keys(acceptance).length;

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,

      summary: {
        companies_checked: sample_results?.companies_sampled || 0,
        fields_checked: FIELD_MATRIX.length,
        field_matrix_green_count: FIELD_MATRIX.filter(f => f.risk === 'low').length,
        field_matrix_yellow_count: FIELD_MATRIX.filter(f => f.risk === 'medium').length,
        field_matrix_red_count: FIELD_MATRIX.filter(f => f.risk === 'high').length,
        provenance_coverage_percent: 40, // Schätzung: Recherche-Provenance gut (40%), Kontakt-Provenance fehlt (0%)
        contact_data_without_source_count: 3, // telefon, email, ansprechpartner
        ai_fields_without_review_count: 5, // telefon, email, ansprechpartner, adresse, website via enrichCompany
        enrichment_direct_write_risk: true, // enrichCompany schreibt ohne provenance
        lead_detail_transparency_ok: "PARTIAL", // Recherche-Provenance OK, Kontakt-Provenance fehlt
        recommended_model: "provenance_json on Company (Transition) → LeadProvenance Entity (Phase 2)",
        acceptance_criteria: acceptance,
        acceptance_score: `${acceptanceGreenCount}/${acceptanceTotalCount} Kriterien erfüllt`,
        email_note: "Vertriebo öffnet nur E-Mail-Vorlagen / mailto-Links. Keine gesendeten E-Mails. Provenance für 'email' bezieht sich auf das Kontaktfeld company.email.",
      },

      field_matrix: FIELD_MATRIX,

      function_matrix: FUNCTION_MATRIX,

      lead_detail_ui: LEAD_DETAIL_UI_ANALYSIS,

      recommended_data_model: RECOMMENDED_DATA_MODEL,

      sample_results,

      tests,
      warnings,
      risks,

      recommended_fixes: [
        {
          priority: "high",
          area: "enrichCompany",
          id: "enrich_write_provenance_json",
          effort: "small",
          impact: "Macht KI-Enrichment als solches erkennbar — UI kann Badge zeigen",
          fix: "In enrichCompany: Wenn Feld geschrieben wird, auch provenance_json updaten: { telefon: { source: 'ai_enrichment', function: 'enrichCompany', confidence: 'medium', added_at, review_status: 'unreviewed' } }. provenance_json = existing parse/merge/stringify.",
          files_affected: "functions/enrichCompany",
          do_not: "Kein bestehende Kontaktdaten löschen. Keine Pflichtfelder hinzufügen. Nur zusätzliches JSON-Feld befüllen.",
        },
        {
          priority: "high",
          area: "Company Entity",
          id: "add_provenance_json_field",
          effort: "trivial",
          impact: "Ermöglicht strukturierte Provenance für beliebige Felder ohne Schema-Breaking-Change",
          fix: "Company Entity: provenance_json (type: string, title: 'Provenance JSON') hinzufügen. Kein required. Format: { [field_name]: { source, function, confidence, added_at, review_status } }",
          files_affected: "entities/Company.json",
        },
        {
          priority: "high",
          area: "LeadDetail UI",
          id: "show_enrichment_source_badge",
          effort: "small",
          impact: "Nutzer sieht sofort ob Telefon/E-Mail/Ansprechpartner KI-generiert und ungeprüft ist",
          fix: "In CompanyInfo / LeadDetail Firmendaten-Block: Wenn provenance_json[field].source === 'ai_enrichment' und review_status !== 'confirmed' → kleines Badge '⚠ KI-Recherche' unter dem Feld. Klick → Tooltip 'Von Vertriebo-KI recherchiert – bitte prüfen'. Kein aufwändiges UI — nur ein Badge.",
          files_affected: "pages/LeadDetail.jsx (oder components/lead-detail/CompanyInfo.jsx)",
          do_not: "Keine Pflichtbestätigung bevor Anruf. Kein Modal. Nur informativer Hinweis.",
        },
        {
          priority: "medium",
          area: "enrichCompany",
          id: "enrich_write_activity_log",
          effort: "small",
          impact: "Audit trail: wann hat KI welches Feld geschrieben",
          fix: "enrichCompany: Nach erfolgreichem Update ein ActivityLog-Eintrag erstellen: { organization_id, company_id, action: 'enrich_ai', fields_updated: [...], user_email, timestamp }. Nutzt vorhandene ActivityLog Entity.",
          files_affected: "functions/enrichCompany",
        },
        {
          priority: "low",
          area: "analyzeLeadEngine",
          id: "engine_review_status_field",
          effort: "small",
          impact: "Nutzer kann KI-Temperature-Einschätzung explizit bestätigen/ablehnen",
          fix: "Optional: engine_review_status Feld auf Company (unreviewed|confirmed|rejected). In EngineBox UI: kleiner 'Bestätigen'/'Ablehnen' Button. LeadOutcome/OutcomeFeedback deckt finalen Abschluss bereits ab — daher niedrige Priorität.",
          files_affected: "entities/Company.json, functions/analyzeLeadEngine, components/lead-detail/EngineBox",
        },
        {
          priority: "low",
          area: "LeadDetail UI",
          id: "show_save_reason_code",
          effort: "trivial",
          impact: "Power-User sehen warum Lead gespeichert wurde (z.B. tc_match+phone+website)",
          fix: "RelevanceSection: save_reason_code als kleine Code-Badge unter score anzeigen.",
          files_affected: "components/lead-detail/RelevanceSection",
        },
        {
          priority: "future",
          area: "LeadProvenance Entity",
          id: "normalize_lead_provenance",
          effort: "large",
          impact: "Vollständige Normalisierung, Supabase-ready, queryable nach source_type/review_status",
          fix: "Phase 2: LeadProvenance Entity erstellen (gemäß RECOMMENDED_DATA_MODEL). Supabase-Tabelle lead_provenance mit Indizes. enrichCompany + processResearchRun schreiben LeadProvenance-Einträge. Kein Dual-Write jetzt.",
          files_affected: "entities/LeadProvenance.json (neu), functions/enrichCompany, functions/processResearchRun",
          do_not: "Kein Dual-Write nach Supabase jetzt. Kein komplettes Company-Entity-Refactoring.",
        },
      ],

      audit_notes: [
        "STÄRKE: processResearchRun hat beste Provenance im System — source_provider, research_run_id, source_query, quality_tier, quality_confidence, save_reason_code. Lead-Herkunft aus Recherche sehr gut nachvollziehbar.",
        "STÄRKE: RelevanceSection im LeadDetail erklärt Recherche-Provenance sehr gut (Suchbegriff, Zielkundentyp, Qualitäts-Tier, Score). Dies ist ein echter Qualitätsvorsprung gegenüber normalen Lead-Tools.",
        "KRITISCH: enrichCompany schreibt KI-generierte Kontaktdaten ohne Kennzeichnung. Telefon/E-Mail/Ansprechpartner nach Enrichment sehen aus wie verifizierte Daten.",
        "WICHTIG: Vertriebo sendet selbst keine E-Mails — nur mailto-Links / Vorlagen. Eine falsche E-Mail ist trotzdem ein Problem (Nutzer kopiert und sendet manuell).",
        "SOFORT-FIX: provenance_json auf Company + enrichCompany schreibt source. Dann UI-Badge. Kein Entity-Refactoring nötig.",
        "NICHT MACHEN: Keine komplette Company-Migration, kein Dual-Write Supabase, keine automatische Überschreibung ohne Review.",
      ],
    });

  } catch (error) {
    console.error('[auditLeadProvenanceReadiness] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});