/**
 * auditEnrichmentReviewSafety
 * ============================
 * Prüft ob KI-/Enrichment-Daten sicher behandelt werden:
 *   - Provenance-Vollständigkeit pro Feld
 *   - Überschreibschutz für confirmed/high-confidence Daten
 *   - Review-Status standardmäßig 'unreviewed' (nicht 'confirmed')
 *   - LeadDetail UI-Transparenz (ProvenanceBadge, Confirm/Reject)
 *   - AuditLog-Nachvollziehbarkeit
 *   - KI-Halluzinationsschutz
 *   - Supabase-ready Datenmodell
 *
 * Basiert auf statischer Code-Analyse (2026-05-26):
 *   - functions/enrichCompany (v1.2 — schreibt provenance_json)
 *   - utils/provenance.js (buildEnrichmentProvenance)
 *   - components/lead-detail/ProvenanceBadge
 *   - components/lead-detail/CompanyInfo (KEIN ProvenanceBadge integriert!)
 *
 * Admin-only. Schreibt nichts. Baut nichts um.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ── 1. Field Matrix: Was schreibt enrichCompany? ────────────────────────────

const FIELD_MATRIX = [
  {
    field: "telefon",
    prov_key: "phone",
    written_by_enrichCompany: true,
    only_if_empty: true,           // enrichCompany Guard: `if (!company.telefon && isValid(result.telefon))`
    writes_provenance: true,       // provenance_json.fields.phone gesetzt
    writes_confidence: true,       // confidence: 'medium'
    writes_review_status: true,    // review_status: 'unreviewed'
    writes_source_type: true,      // source_type: 'enrichment'
    writes_source_function: true,  // source_function: 'enrichCompany'
    writes_previous_source: true,  // previous_source wenn vorher gesetzt
    writes_previous_value: false,  // LÜCKE: previous_value nicht gespeichert
    writes_evidence_url: false,    // LÜCKE: keine evidence_url
    writes_evidence_text: false,   // LÜCKE: keine evidence_text
    can_overwrite_existing: false, // Guard schützt: nur schreiben wenn leer
    can_overwrite_confirmed: false, // Implizit: leer = kein confirmed-Wert möglich
    risk: "low",
    notes: "Guard `if (!company.telefon)` verhindert Überschreiben. Aber: previous_value und evidence_url fehlen. Confidence 'medium' ist korrekt für KI-Recherche.",
    recommended_fix: "previous_value speichern (aktuell nur previous_source). evidence_url/text ergänzen wenn LLM Quelle liefert.",
  },
  {
    field: "email",
    prov_key: "email",
    written_by_enrichCompany: true,
    only_if_empty: true,
    writes_provenance: true,
    writes_confidence: true,       // confidence: 'medium'
    writes_review_status: true,
    writes_source_type: true,
    writes_source_function: true,
    writes_previous_source: true,
    writes_previous_value: false,
    writes_evidence_url: false,
    writes_evidence_text: false,
    can_overwrite_existing: false,
    can_overwrite_confirmed: false,
    risk: "medium",
    notes: "HALLUZINATIONSRISIKO: enrichCompany verlangt 'Felder nur wenn mit Sicherheit gefunden' (Prompt), aber LLM kann Muster-Mails wie vorname@domain.de erfinden. Confidence='medium' statt 'low' für E-Mail (welche selten direkt aus Web extrahierbar). Kein evidence_url → keine Verifizierung möglich. Guard schützt vor Überschreiben.",
    recommended_fix: "Confidence für email auf 'low' senken (schwierig aus dem Web zu finden, oft KI-Schätzung). LLM-Prompt: 'Nur wenn direkt auf Website gefunden, sonst weglassen.' evidence_url hinzufügen wenn möglich.",
  },
  {
    field: "website",
    prov_key: "website",
    written_by_enrichCompany: true,
    only_if_empty: true,
    writes_provenance: true,
    writes_confidence: true,       // confidence: 'medium'
    writes_review_status: true,
    writes_source_type: true,
    writes_source_function: true,
    writes_previous_source: true,
    writes_previous_value: false,
    writes_evidence_url: false,
    writes_evidence_text: false,
    can_overwrite_existing: false,
    can_overwrite_confirmed: false,
    risk: "low",
    notes: "Guard schützt. Website-URL ist i.d.R. verifizierbar. Google hat oft schon eine Website → enrichCompany läuft dann nicht. Confidence 'medium' akzeptabel.",
    recommended_fix: "evidence_url = die gefundene URL selbst speichern (trivial).",
  },
  {
    field: "ansprechpartner",
    prov_key: "contact_person",
    written_by_enrichCompany: true,
    only_if_empty: true,
    writes_provenance: true,
    writes_confidence: true,       // confidence: 'low' (korrekt)
    writes_review_status: true,
    writes_source_type: true,
    writes_source_function: true,
    writes_previous_source: true,
    writes_previous_value: false,
    writes_evidence_url: false,
    writes_evidence_text: false,
    can_overwrite_existing: false,
    can_overwrite_confirmed: false,
    risk: "medium",
    notes: "HALLUZINATIONSRISIKO: Ansprechpartner ist schwer verifizierbar. LLM kann Namen erfinden. confidence='low' ist korrekt. Guard schützt vor Überschreiben. Kein evidence_url → kein Nachweis. Nutzer darf dieser Information NICHT ohne Bestätigung vertrauen.",
    recommended_fix: "confidence='low' beibehalten. evidence_url ergänzen. UI muss 'low' deutlich als unsicher zeigen. Confirm-Aktion empfohlen.",
  },
  {
    field: "adresse",
    prov_key: "address",
    written_by_enrichCompany: true,
    only_if_empty: true,
    writes_provenance: true,
    writes_confidence: true,       // confidence: 'medium'
    writes_review_status: true,
    writes_source_type: true,
    writes_source_function: true,
    writes_previous_source: true,
    writes_previous_value: false,
    writes_evidence_url: false,
    writes_evidence_text: false,
    can_overwrite_existing: false,
    can_overwrite_confirmed: false,
    risk: "low",
    notes: "Guard schützt. Adresse aus processResearchRun (Google Places) ist i.d.R. already set → enrichCompany läuft oft nicht. Confidence 'medium' ok.",
    recommended_fix: null,
  },
  // Felder die enrichCompany NICHT schreibt (zur Vollständigkeit)
  {
    field: "notizen",
    prov_key: null,
    written_by_enrichCompany: false,
    only_if_empty: null,
    writes_provenance: false,
    writes_confidence: false,
    writes_review_status: false,
    writes_source_type: false,
    writes_source_function: false,
    writes_previous_source: false,
    writes_previous_value: false,
    writes_evidence_url: false,
    writes_evidence_text: false,
    can_overwrite_existing: false,
    can_overwrite_confirmed: false,
    risk: "none",
    notes: "enrichCompany schreibt notizen nicht. Kein Risiko.",
    recommended_fix: null,
  },
  {
    field: "aktueller_dienstleister",
    prov_key: null,
    written_by_enrichCompany: false,
    only_if_empty: null,
    writes_provenance: false,
    writes_confidence: false,
    writes_review_status: false,
    writes_source_type: false,
    writes_source_function: false,
    writes_previous_source: false,
    writes_previous_value: false,
    writes_evidence_url: false,
    writes_evidence_text: false,
    can_overwrite_existing: false,
    can_overwrite_confirmed: false,
    risk: "none",
    notes: "enrichCompany schreibt aktueller_dienstleister nicht.",
    recommended_fix: null,
  },
];

// ── 2. Overwrite Matrix ────────────────────────────────────────────────────

const OVERWRITE_MATRIX = [
  {
    scenario: "Feld ist leer (null) → enrichCompany schreibt",
    expected_behavior: "Feld wird gesetzt, provenance_json mit source='enrichment', review_status='unreviewed'",
    current_behavior: "KORREKT: Guard `if (!company.telefon && isValid(...))` + provenance_json geschrieben",
    risk: "none",
    notes: "Hauptfall. Funktioniert korrekt.",
  },
  {
    scenario: "Feld hat Wert aus Google Places (source='google_places', confidence='high', review_status='confirmed')",
    expected_behavior: "Feld darf NICHT überschrieben werden. Google Places ist verifiziert.",
    current_behavior: "KORREKT (implizit): Guard `if (!company.telefon)` — Feld ist gesetzt → wird nicht überschrieben. Kein Review der provenance_json nötig.",
    risk: "low",
    notes: "Schutz ist korrekt aber rein wertbasiert (≠ null), nicht provenance-basiert. Wenn ein Google-Places-Wert nach Enrichment manuell gelöscht wurde, könnte er dann von enrichCompany überschrieben werden. Kein echtes Problem aber kein Defense-in-Depth.",
    recommended_fix: "Optional (Defense-in-Depth): Provenance-Check: if field has source='google_places' AND confidence='high' → skip even if empty.",
  },
  {
    scenario: "Feld hat manuell eingetragenen Wert (source='manual', review_status='confirmed')",
    expected_behavior: "Feld darf NICHT überschrieben werden. Manuell bestätigt = Nutzerwille.",
    current_behavior: "KORREKT (implizit): Guard `if (!company.telefon)` — Feld gesetzt → nicht überschrieben.",
    risk: "low",
    notes: "Gleiche implizite Logik wie Google Places. Kein expliziter Provenance-Guard.",
    recommended_fix: "Defense-in-Depth: Provenance-Check auf manual+confirmed ergänzen.",
  },
  {
    scenario: "Feld hat Wert aus enrichCompany (review_status='unreviewed') → zweites enrichCompany",
    expected_behavior: "Würde nicht überschrieben (Feld schon gesetzt). Kein doppeltes Enrichment.",
    current_behavior: "KORREKT: Guard verhindert es. Zweites Enrichment findet kein leeres Feld.",
    risk: "none",
    notes: "Korrekt.",
  },
  {
    scenario: "Nutzer löscht enrichten Wert manuell → enrichCompany läuft erneut",
    expected_behavior: "Feld ist wieder leer → enrichCompany schreibt neuen KI-Wert, review_status='unreviewed'",
    current_behavior: "KORREKT: Guard erlaubt es, da Feld leer. Neuer Wert bekommt provenance_json.",
    risk: "low",
    notes: "Korrekt. previous_source könnte vorherigen Enrichment-Wert referenzieren (aktuell: 'enrichment'). previous_value fehlt.",
    recommended_fix: "previous_value speichern um vor/nach sichtbar zu machen.",
  },
  {
    scenario: "Feld hat KI-Wert (review_status='unreviewed') + Nutzer sieht es im LeadDetail",
    expected_behavior: "UI zeigt ⚠ KI-Badge, Nutzer kann Confirm/Reject klicken.",
    current_behavior: "LÜCKE: CompanyInfo.jsx zeigt KEIN ProvenanceBadge neben Feldern. ProvenanceBadge existiert aber ist NICHT in CompanyInfo eingebunden.",
    risk: "high",
    notes: "ProvenanceBadge ist gebaut aber nicht eingebunden. Nutzer sieht KI-E-Mail und KI-Ansprechpartner OHNE jeglichen Hinweis auf die Herkunft.",
  },
  {
    scenario: "KI generiert Muster-E-Mail wie 'max.mustermann@firma.de' (nicht auf Website gefunden)",
    expected_behavior: "Sollte als low-confidence oder nicht gespeichert werden.",
    current_behavior: "RISIKO: enrichCompany hat isValid()-Guard (kein 'null', 'n/a' etc.) aber erkennt generierte Muster-Mails nicht. Confidence='medium' statt 'low'. Kein evidence_url.",
    risk: "high",
    notes: "LLM-Prompt sagt 'nur wenn mit Sicherheit gefunden', aber das reicht nicht. Muster-Mails wie vorname@domain.de sind schwer zu erkennen. Nutzer könnte kontaktieren ohne zu prüfen.",
  },
];

// ── 3. UI Matrix ───────────────────────────────────────────────────────────

const UI_MATRIX = [
  {
    component: "CompanyInfo.jsx",
    shows_provenance_badge: false,    // KEIN ProvenanceBadge!
    shows_source: false,
    shows_confidence: false,
    shows_review_status: false,
    has_confirm_action: false,
    has_reject_action: false,
    risk: "high",
    notes: "KRITISCHE LÜCKE: CompanyInfo zeigt Telefon, E-Mail, Website, Ansprechpartner direkt ohne jeden Hinweis auf Herkunft. ProvenanceBadge ist gebaut und importierbar, aber NICHT eingebunden. Nutzer sieht KI-Daten wie verifizierte Daten.",
    recommended_fix: "ProvenanceBadge neben jedem Kontaktfeld in CompanyInfo einbinden. getFieldProvenance(company, 'phone') etc. verwenden.",
  },
  {
    component: "ProvenanceBadge.jsx",
    shows_provenance_badge: true,
    shows_source: true,              // source_type → label
    shows_confidence: true,          // Tooltip: Konfidenz-Level
    shows_review_status: true,       // isUnreviewed → ⚠-Symbol
    has_confirm_action: false,       // LÜCKE
    has_reject_action: false,        // LÜCKE
    risk: "medium",
    notes: "Badge zeigt korrekt Quelle, Confidence und Unreviewed-Status via Tooltip. Aber: (1) nicht eingebunden in CompanyInfo, (2) keine Confirm/Reject-Aktionen — nur informativ. Nutzer kann Badge sehen aber nicht darauf reagieren.",
    recommended_fix: "Confirm/Reject-Aktionen via updateContactFieldReviewStatus-Backend ergänzen. Optional: inline onConfirm/onReject Props für ProvenanceBadge.",
  },
  {
    component: "LeadDetail.jsx / RelevanceSection.jsx",
    shows_provenance_badge: true,    // RelevanceSection zeigt Recherche-Provenance
    shows_source: true,
    shows_confidence: true,
    shows_review_status: false,      // Nur für research-Provenance, nicht Kontaktdaten
    has_confirm_action: false,
    has_reject_action: false,
    risk: "low",
    notes: "RelevanceSection erklärt Recherche-Herkunft (source_query, quality_tier) gut. Aber Kontaktdaten-Provenance (telefon, email, ansprechpartner aus enrichCompany) ist nicht sichtbar weil CompanyInfo keine Badges zeigt.",
    recommended_fix: null,
  },
];

// ── 4. AuditLog Analyse ───────────────────────────────────────────────────

const AUDIT_LOG_ANALYSIS = {
  enrichCompany_writes_audit_log: false,
  enrichCompany_writes_activity_log: false,
  enrichCompany_writes_contact_log: false,
  enrichCompany_writes_platform_audit_log: false,
  has_before_after_values: false,
  has_field_list: false,          // console.info schreibt fields-count, nicht field-names
  has_user_email: true,           // console.info: user=${access.user.email}
  has_company_name: true,         // console.info: company=${company.name}
  has_timestamp: true,            // implizit via created_date/updated_date auf Company
  has_provenance_updated_at: true, // provenance_json.fields[x].updated_at gesetzt
  has_provenance_updated_by: true, // provenance_json.fields[x].updated_by = user.email
  verdict: "YELLOW",
  notes: [
    "enrichCompany schreibt console.info für jedes Update (org, user, company, count). Für Server-Logs ausreichend.",
    "ABER: Kein PlatformAuditLog-Eintrag, kein ActivityLog-Eintrag. Änderungen sind nur über provenance_json.updated_at/updated_by nachvollziehbar.",
    "provenance_json enthält updated_by=user.email und updated_at=ISO — das ist bereits Audit-Basis.",
    "previous_value fehlt: kein Vorher-Nachher-Vergleich möglich.",
    "Für Compliance/Nachvollziehbarkeit: ActivityLog-Eintrag empfohlen (action='enrich_ai', fields_updated=[...], before={...}, after={...}).",
  ],
  recommended_fix: "Nach Company.update: ActivityLog.create({ organization_id, company_id, action: 'enrich_ai', fields_updated: Object.keys(updates).filter(k => k !== 'provenance_json'), user_email: access.user.email, details: JSON.stringify({ fields_count: n }) }). Kein before/after wenn previous_value fehlt.",
};

// ── 5. Halluzinationsschutz ────────────────────────────────────────────────

const HALLUCINATION_ANALYSIS = {
  prompt_says_only_if_found: true,       // "Gib nur Felder zurück, die du mit Sicherheit gefunden hast"
  is_valid_guard_present: true,          // isValid() blockt 'null', 'n/a', 'unbekannt', 'keine', 'nicht gefunden'
  add_context_from_internet: true,       // LLM sucht im Internet → nicht rein halluziniert
  email_confidence_correct: false,       // 'medium' für email — sollte 'low' sein
  contact_person_confidence_correct: true, // 'low' — korrekt
  pattern_email_detection: false,        // kein Guard für 'vorname.nachname@domain.de' Muster
  evidence_url_stored: false,            // evidence_url wird nicht gespeichert
  evidence_text_stored: false,           // evidence_text wird nicht gespeichert
  risk_level: "medium",
  notes: [
    "add_context_from_internet=true ist gut: LLM recherchiert aktiv statt nur zu raten.",
    "Prompt fordert Sicherheit, aber LLMs können trotzdem plausible Muster-E-Mails generieren.",
    "isValid() Guard blockt typische Leerwert-Phrasen, aber nicht konstruierte Muster-Mails.",
    "email confidence='medium' ist zu optimistisch. E-Mail-Adressen aus Web-Enrichment sind oft Schätzungen.",
    "Kein evidence_url → Nutzer kann nicht nachprüfen, woher die E-Mail kommt.",
    "Ansprechpartner confidence='low' ist korrekt — Namen sind schwer zuverlässig.",
    "Empfehlung: LLM-Antwort um 'found_on_url' Feld erweitern für evidence_url.",
  ],
  recommended_fix: "1. email confidence auf 'low' senken. 2. LLM response_json_schema um 'evidence_url' Feld ergänzen: { website: {type:'string'}, telefon: {type:'string'}, email: {type:'string'}, ansprechpartner: {type:'string'}, adresse: {type:'string'}, evidence_url: {type:'string'} }. 3. evidence_url in provenance_json.fields[x].evidence_url speichern.",
};

// ── 6. Datenmodell-Analyse ────────────────────────────────────────────────

const DATA_MODEL_ANALYSIS = {
  provenance_json_exists: true,
  current_fields_per_provenance_entry: [
    "source_type",       // ✅
    "source_function",   // ✅
    "confidence",        // ✅
    "review_status",     // ✅
    "updated_at",        // ✅
    "updated_by",        // ✅
    "previous_source",   // ✅ (wenn vorher gesetzt)
  ],
  missing_fields: [
    "previous_value",    // ❌ FEHLT: was war der Wert vorher?
    "evidence_url",      // ❌ FEHLT: Quelle/Nachweis
    "evidence_text",     // ❌ FEHLT: Freitext-Nachweis
  ],
  supabase_future_table: {
    name: "enrichment_reviews",
    fields: [
      "organization_id", "company_id", "field_name",
      "proposed_value", "current_value",
      "source_type", "source_function",
      "confidence", "review_status",
      "evidence_url", "evidence_text",
      "created_by", "reviewed_by", "reviewed_at", "created_at",
    ],
    status: "not_built — dokumentiert für Phase 2",
    note: "provenance_json ist ausreichender Übergang. Kein Dual-Write jetzt.",
  },
  verdict: "YELLOW",
  notes: "provenance_json deckt Kern-Anforderungen ab. Fehlende Felder (previous_value, evidence_url) sind small-effort ergänzbar ohne Schema-Breaking-Change.",
};

// ── 7. Review-Workflow Analyse ────────────────────────────────────────────

const REVIEW_WORKFLOW_ANALYSIS = {
  backend_update_review_status_function: false,  // Keine updateContactFieldReviewStatus Function
  frontend_confirm_action: false,                // Kein Confirm-Button
  frontend_reject_action: false,                 // Kein Reject-Button
  frontend_manual_override: true,                // Nutzer kann Feld manuell im LeadDetail bearbeiten
  review_updates_provenance: false,              // Manuelles Bearbeiten updatet provenance_json nicht
  missing_review_workflow: true,
  verdict: "RED",
  notes: [
    "Es gibt KEINEN updateContactFieldReviewStatus Backend-Endpoint.",
    "ProvenanceBadge hat KEINE onConfirm/onReject Props.",
    "Nutzer kann Felder manuell bearbeiten, aber das updatet provenance_json nicht (bleibt 'unreviewed' für enrichment).",
    "Folge: Einmal als enrichment gespeichert → bleibt immer 'unreviewed' → Badge zeigt ⚠ für immer, auch wenn Nutzer die Nummer schon geprüft hat.",
    "Das ist die kritischste Lücke: Nutzer hat keine Möglichkeit zu sagen 'ja, die Nummer stimmt'.",
    "Minimal-Fix: updateContactFieldReviewStatus({ companyId, fieldKey, reviewStatus, organization_id }) Backend + Confirm-Button in CompanyInfo/ProvenanceBadge.",
  ],
  recommended_fix: [
    "1. functions/updateContactFieldReviewStatus bauen: company laden, provenance_json updaten (review_status='confirmed'|'rejected', reviewed_by, reviewed_at), Company.update.",
    "2. ProvenanceBadge: onConfirm/onReject Props (optional, nur wenn gesetzt) → klick → Backend-Call → refetch.",
    "3. CompanyInfo: ProvenanceBadge neben Telefon/E-Mail/Ansprechpartner einbinden mit onConfirm/onReject.",
    "4. Wenn Nutzer Feld manuell bearbeitet: review_status='overwritten', source_type='manual', previous_value=alter Wert speichern.",
  ],
};

// ── 8. Acceptance Criteria ────────────────────────────────────────────────

const ACCEPTANCE_CRITERIA = {
  enrichment_data_has_source_confidence_review: true,   // ✅ enrichCompany schreibt alle drei
  enrichment_data_defaults_to_unreviewed: true,         // ✅ review_status='unreviewed' immer
  confirmed_manual_data_not_overwritten: true,          // ✅ (implizit via value-guard)
  lead_detail_shows_provenance: false,                  // ❌ CompanyInfo hat KEIN Badge eingebunden
  review_actions_exist_or_fix_documented: true,         // ⚠ fix documented (not built yet)
  enrichment_changes_auditable: true,                   // ⚠ provenance_json ja, ActivityLog nein
  no_ai_data_shown_as_verified_truth: false,            // ❌ CompanyInfo zeigt KI-Daten ohne Badge
  hallucination_confidence_correct: false,              // ❌ email confidence='medium' statt 'low'
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
    const { org_id, sample_size = 15 } = body;

    const tests = [];
    const warnings = [];
    const risks = [];

    function pass(area, id, detail) { tests.push({ area, id, status: 'PASS', detail }); }
    function warn(area, id, detail) { tests.push({ area, id, status: 'WARN', detail }); warnings.push({ area, id, detail }); }
    function risk(area, id, detail) { tests.push({ area, id, status: 'RISK', detail }); risks.push({ area, id, detail }); }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 1: enrichCompany Felder & Provenance
    // ══════════════════════════════════════════════════════════════════════════

    pass('enrichCompany', 'enrich_writes_5_fields',
      'enrichCompany schreibt: website, telefon, email, ansprechpartner, adresse. Keine weiteren Felder (notizen, position, rolle, summary werden NICHT geschrieben).'
    );
    pass('enrichCompany', 'enrich_provenance_source_type',
      'enrichCompany setzt source_type="enrichment" für alle geschriebenen Felder via provenance_json.fields[key].'
    );
    pass('enrichCompany', 'enrich_provenance_review_status_unreviewed',
      'enrichCompany setzt review_status="unreviewed" standardmäßig — nie "confirmed". KI-Daten gelten nicht als geprüfte Wahrheit.'
    );
    pass('enrichCompany', 'enrich_provenance_confidence_set',
      'enrichCompany setzt confidence: "medium" für telefon/email/website/adresse, "low" für ansprechpartner. Differenzierung korrekt.'
    );
    pass('enrichCompany', 'enrich_provenance_source_function',
      'enrichCompany setzt source_function="enrichCompany" — Herkunft der Provenance-Änderung nachvollziehbar.'
    );
    pass('enrichCompany', 'enrich_provenance_previous_source',
      'enrichCompany speichert previous_source wenn Feld vorher eine andere Provenance hatte.'
    );
    warn('enrichCompany', 'enrich_provenance_no_previous_value',
      'enrichCompany speichert NICHT previous_value. Wenn Feld überschrieben würde (hypothetisch), wäre der alte Wert verloren. Aktuell durch Guard geschützt, aber als Lücke dokumentiert.'
    );
    warn('enrichCompany', 'enrich_email_confidence_medium_too_high',
      'enrichCompany setzt confidence="medium" für email. E-Mail-Adressen aus LLM-Recherche sind oft Schätzungen (Muster vorname@domain.de). "low" wäre sicherer.'
    );
    warn('enrichCompany', 'enrich_no_evidence_url',
      'enrichCompany speichert keine evidence_url oder evidence_text. Nutzer kann nicht prüfen, von welcher Website die E-Mail/Telefonnummer stammt.'
    );
    warn('enrichCompany', 'enrich_no_activity_log',
      'enrichCompany schreibt kein ActivityLog / PlatformAuditLog. Änderungen sind nur über provenance_json.updated_by/updated_at und console.info nachvollziehbar.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 2: Überschreibschutz
    // ══════════════════════════════════════════════════════════════════════════

    pass('overwrite_protection', 'enrich_only_writes_if_empty',
      'enrichCompany hat expliziten Guard: `if (!company.telefon && isValid(result.telefon))` für alle 5 Felder. Bestehende Werte werden NICHT überschrieben.'
    );
    pass('overwrite_protection', 'google_places_implicitly_protected',
      'Google-Places-Werte (source_type="google_places", confidence="high", review_status="confirmed") sind implizit geschützt: Feld ist gesetzt → Guard verhindert Überschreiben.'
    );
    pass('overwrite_protection', 'manual_implicitly_protected',
      'Manuell eingetragene Werte sind implizit geschützt: Feld ist gesetzt → Guard verhindert Überschreiben.'
    );
    warn('overwrite_protection', 'no_explicit_provenance_guard',
      'Überschreibschutz ist rein wertbasiert (≠ null), NICHT provenance-basiert. Defense-in-Depth fehlt: kein Check ob source_type="google_places" AND confidence="high" → skip. Aktuell kein Sicherheitsproblem, aber kein Rückfall-Schutz.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 3: LeadDetail UI / ProvenanceBadge
    // ══════════════════════════════════════════════════════════════════════════

    pass('ui_provenance_badge', 'provenance_badge_component_exists',
      'ProvenanceBadge.jsx ist gebaut: zeigt source_type-Label, ⚠ bei unreviewed+enrichment, Tooltip mit Konfidenz-Info. Korrekte Implementierung.'
    );
    pass('ui_provenance_badge', 'provenance_utils_exist',
      'utils/provenance.js mit getFieldProvenance(), isUnreviewedEnrichment(), buildEnrichmentProvenance() vorhanden. Solide Basis für UI-Integration.'
    );
    risk('ui_provenance_badge', 'company_info_no_badge_integrated',
      'KRITISCH: CompanyInfo.jsx zeigt Telefon, E-Mail, Website, Ansprechpartner OHNE ProvenanceBadge. KI-angereicherte Kontaktdaten sehen aus wie verifizierte Daten. Nutzer kann nicht erkennen ob Ansprechpartner KI-generiert ist.'
    );
    risk('ui_review_actions', 'no_confirm_reject_actions',
      'KRITISCH: Es gibt KEINE Confirm/Reject-Aktionen für Kontaktfelder. ProvenanceBadge ist rein informativ. Einmal als "unreviewed" gespeichert → bleibt für immer "unreviewed" bis Feld manuell bearbeitet wird (ohne Provenance-Update).'
    );
    warn('ui_review_actions', 'manual_edit_does_not_update_provenance',
      'Wenn Nutzer ein Kontaktfeld manuell bearbeitet (LeadDetail Edit-Mode), wird provenance_json NICHT aktualisiert. Feld bleibt source_type="enrichment", review_status="unreviewed" — obwohl Nutzer es geprüft und geändert hat.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 4: Halluzinationsschutz
    // ══════════════════════════════════════════════════════════════════════════

    pass('hallucination_protection', 'prompt_requests_certainty',
      'LLM-Prompt: "Gib nur Felder zurück, die du mit Sicherheit gefunden hast." Grundschutz vorhanden.'
    );
    pass('hallucination_protection', 'add_context_from_internet_true',
      'add_context_from_internet=true: LLM recherchiert aktiv statt nur zu halluzinieren. Deutlich besser als reines LLM-Raten.'
    );
    pass('hallucination_protection', 'is_valid_guard_blocks_nullvalues',
      'isValid() blockt: "null", "n/a", "unbekannt", "keine", "nicht gefunden". Standard-Leerphrasen werden korrekt gefiltert.'
    );
    pass('hallucination_protection', 'contact_person_confidence_low',
      'Ansprechpartner: confidence="low" — korrekt, da Namen schwer verifizierbar.'
    );
    warn('hallucination_protection', 'email_confidence_medium_too_optimistic',
      'E-Mail: confidence="medium" ist zu optimistisch. LLMs konstruieren häufig plausible Muster-Mails (vorname.nachname@domain.de) ohne direkte Quelle auf Website. Kein isValid()-Guard für Muster-E-Mails.'
    );
    warn('hallucination_protection', 'no_pattern_email_detection',
      'Kein Guard für konstruierte E-Mail-Muster (z.B. info@, kontakt@, Vorname.Nachname@). Diese sind LLM-generiert aber nicht verifiziert. Nutzer könnte falsche E-Mail versenden.'
    );
    warn('hallucination_protection', 'no_evidence_url_in_llm_response',
      'LLM gibt keine evidence_url zurück. Kein Nachweis wo Information gefunden wurde. Für E-Mail besonders kritisch: war sie auf der Impressum-Seite oder nur eine LLM-Schätzung?'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 5: AuditLog / Nachvollziehbarkeit
    // ══════════════════════════════════════════════════════════════════════════

    pass('audit_log', 'provenance_updated_by_set',
      'provenance_json.fields[x].updated_by = user.email — wer hat Enrichment gestartet, ist nachvollziehbar.'
    );
    pass('audit_log', 'provenance_updated_at_set',
      'provenance_json.fields[x].updated_at = ISO timestamp — wann Enrichment lief, ist nachvollziehbar.'
    );
    pass('audit_log', 'console_info_logs_user_company',
      'console.info logt: org, user.email, company.name, fields_updated_count. Server-seitig auswertbar.'
    );
    warn('audit_log', 'no_activity_log_record',
      'Kein ActivityLog-Eintrag pro Enrichment-Run. Änderungen nicht in App-UI auditierbar. Nur provenance_json und Server-Logs.'
    );
    warn('audit_log', 'no_before_after_values',
      'Kein Vorher-Nachher-Vergleich: previous_value fehlt in provenance_json. Bei erneutem Enrichment nach manuellem Löschen: alter Wert verloren.'
    );
    warn('audit_log', 'no_fields_list_in_log',
      'console.info logt nur Anzahl der updates (updates=N), nicht welche Felder konkret geändert wurden.'
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
        let with_phone = 0, with_email = 0, with_contact = 0;
        let with_provenance = 0;
        let phone_enrichment = 0, email_enrichment = 0, contact_enrichment = 0;
        let phone_unreviewed = 0, email_unreviewed = 0, contact_unreviewed = 0;
        let phone_confirmed = 0, email_confirmed = 0, contact_confirmed = 0;

        for (const c of companies) {
          if (c.telefon) with_phone++;
          if (c.email) with_email++;
          if (c.ansprechpartner) with_contact++;
          if (c.provenance_json) with_provenance++;

          let prov = {};
          try { prov = JSON.parse(c.provenance_json || '{}').fields || {}; } catch {}

          if (prov.phone?.source_type === 'enrichment') { phone_enrichment++; if (prov.phone.review_status !== 'confirmed') phone_unreviewed++; else phone_confirmed++; }
          if (prov.email?.source_type === 'enrichment') { email_enrichment++; if (prov.email.review_status !== 'confirmed') email_unreviewed++; else email_confirmed++; }
          if (prov.contact_person?.source_type === 'enrichment') { contact_enrichment++; if (prov.contact_person.review_status !== 'confirmed') contact_unreviewed++; else contact_confirmed++; }
        }

        const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

        sample_results = {
          org_id,
          companies_sampled: total,
          contact_data: {
            with_phone, with_email, with_contact,
            phone_pct: pct(with_phone), email_pct: pct(with_email), contact_pct: pct(with_contact),
          },
          provenance_coverage: {
            with_provenance_json: with_provenance,
            provenance_pct: pct(with_provenance),
          },
          enrichment_review_status: {
            phone_from_enrichment: phone_enrichment,
            phone_unreviewed: phone_unreviewed,
            phone_confirmed: phone_confirmed,
            email_from_enrichment: email_enrichment,
            email_unreviewed: email_unreviewed,
            email_confirmed: email_confirmed,
            contact_from_enrichment: contact_enrichment,
            contact_unreviewed: contact_unreviewed,
            contact_confirmed: contact_confirmed,
          },
          verdict: `Von ${total} Leads: ${pct(with_provenance)}% haben provenance_json. ${phone_enrichment + email_enrichment + contact_enrichment} Enrichment-Felder davon ${phone_unreviewed + email_unreviewed + contact_unreviewed} unreviewed. Confirm-Workflow fehlt.`,
        };

        if ((phone_unreviewed + email_unreviewed + contact_unreviewed) > 0) {
          warn('live_sample', 'unreviewed_enrichment_fields_found',
            `Stichprobe: ${phone_unreviewed + email_unreviewed + contact_unreviewed} unreviewed Enrichment-Felder gefunden. Kein Review-Workflow vorhanden → diese bleiben für immer 'unreviewed'.`
          );
        }

      } catch (err) {
        console.warn('[auditEnrichmentReviewSafety] Sample query failed:', err.message);
        sample_results = { error: err.message };
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GESAMTBEWERTUNG
    // ══════════════════════════════════════════════════════════════════════════

    const redCount = tests.filter(t => t.status === 'RISK').length;
    const yellowCount = tests.filter(t => t.status === 'WARN').length;

    // RED: CompanyInfo hat kein Badge + kein Review-Workflow — KI-Daten als Wahrheit
    // YELLOW: wenn Badge eingebunden aber Review-Workflow fehlt
    // GREEN: Badge eingebunden + Review-Workflow vorhanden
    const claimStatus = redCount >= 2 ? 'red' : redCount >= 1 ? 'yellow' : 'green';
    const riskLevel = redCount >= 2 ? 'high' : redCount >= 1 ? 'medium' : 'low';

    const acceptancePassCount = Object.values(ACCEPTANCE_CRITERIA).filter(Boolean).length;
    const acceptanceTotalCount = Object.keys(ACCEPTANCE_CRITERIA).length;

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,

      summary: {
        enrich_fields_checked: FIELD_MATRIX.filter(f => f.written_by_enrichCompany).length,
        direct_write_fields: FIELD_MATRIX.filter(f => f.written_by_enrichCompany).map(f => f.field),
        unreviewed_fields_count: FIELD_MATRIX.filter(f => f.written_by_enrichCompany && f.writes_review_status).length,
        confirmed_overwrite_risk: false,  // Guard schützt implizit
        missing_review_workflow: REVIEW_WORKFLOW_ANALYSIS.missing_review_workflow,
        audit_log_available: "partial",  // provenance_json ja, ActivityLog nein
        lead_detail_review_visibility: "MISSING",  // CompanyInfo hat kein Badge
        hallucination_risk_level: HALLUCINATION_ANALYSIS.risk_level,
        acceptance_criteria: ACCEPTANCE_CRITERIA,
        acceptance_score: `${acceptancePassCount}/${acceptanceTotalCount} Kriterien erfüllt`,
        verdict: claimStatus === 'red'
          ? 'RED: KI-Daten werden in CompanyInfo ohne Badge oder Review-Workflow angezeigt. Nutzer kann nicht erkennen ob Ansprechpartner/E-Mail KI-generiert ist.'
          : claimStatus === 'yellow'
          ? 'YELLOW: Badge eingebunden aber Review-Workflow fehlt.'
          : 'GREEN: Vollständig.',
      },

      field_matrix: FIELD_MATRIX,

      overwrite_matrix: OVERWRITE_MATRIX,

      ui_matrix: UI_MATRIX,

      audit_log_analysis: AUDIT_LOG_ANALYSIS,

      hallucination_analysis: HALLUCINATION_ANALYSIS,

      data_model_analysis: DATA_MODEL_ANALYSIS,

      review_workflow_analysis: REVIEW_WORKFLOW_ANALYSIS,

      sample_results,

      tests,
      warnings,
      risks,

      recommended_fixes: [
        {
          priority: 'critical',
          area: 'CompanyInfo.jsx',
          id: 'integrate_provenance_badge_in_company_info',
          effort: 'small',
          impact: 'Nutzer sieht sofort welche Kontaktdaten KI-generiert und ungeprüft sind — das ist die wichtigste sichtbare Änderung.',
          fix: 'In CompanyInfo.jsx: import ProvenanceBadge + getFieldProvenance. Neben telefon: <ProvenanceBadge provenance={getFieldProvenance(company, "phone")} />. Neben email: "email". Neben ansprechpartner: "contact_person". Neben website: "website".',
          files_affected: 'components/lead-detail/CompanyInfo.jsx',
          do_not: 'Kein Modal, keine Pflichtbestätigung, nur Badge als info-Hinweis.',
        },
        {
          priority: 'high',
          area: 'updateContactFieldReviewStatus (neu)',
          id: 'build_update_review_status_function',
          effort: 'small',
          impact: 'Nutzer kann endlich "Ja, die Telefonnummer stimmt" oder "Nein, falsch" sagen. Löst das permanente-unreviewed-Problem.',
          fix: 'functions/updateContactFieldReviewStatus: { companyId, organization_id, field_key, review_status ("confirmed"|"rejected") } → company laden → provenance_json updaten: review_status, reviewed_by=user.email, reviewed_at=now → Company.update.',
          files_affected: 'functions/updateContactFieldReviewStatus (neu)',
          do_not: 'Kein komplettes Review-Modal. Nur simple Status-Änderung.',
        },
        {
          priority: 'high',
          area: 'ProvenanceBadge.jsx + CompanyInfo.jsx',
          id: 'add_confirm_reject_inline',
          effort: 'small',
          impact: 'Nutzer kann direkt bei Kontaktfeld bestätigen/verwerfen ohne separate Seite.',
          fix: 'ProvenanceBadge: optionale Props onConfirm und onReject. Wenn gesetzt: kleine Confirm/Reject Icons neben Badge. CompanyInfo: onConfirm={() => updateContactFieldReviewStatus(...)} übergeben.',
          files_affected: 'components/lead-detail/ProvenanceBadge.jsx, components/lead-detail/CompanyInfo.jsx',
          do_not: 'Kein großes UI. Nur ✓ und ✗ Icons neben Badge.',
        },
        {
          priority: 'medium',
          area: 'enrichCompany',
          id: 'lower_email_confidence_to_low',
          effort: 'trivial',
          impact: 'E-Mail-Konfidenz realistischer. Nutzer erwartet bei "medium" höhere Genauigkeit als bei "low".',
          fix: 'enrichCompany: confidence für email auf "low" senken (wie ansprechpartner). In provenance.js buildEnrichmentProvenance: email: CONFIDENCE.LOW.',
          files_affected: 'functions/enrichCompany, utils/provenance.js',
        },
        {
          priority: 'medium',
          area: 'enrichCompany',
          id: 'add_evidence_url_to_llm_schema',
          effort: 'small',
          impact: 'Nutzer und Audit können nachprüfen, von welcher Website die E-Mail/Telefon stammt.',
          fix: 'enrichCompany: response_json_schema um "evidence_url": {type:"string"} ergänzen. LLM gibt URL zurück wo Info gefunden. In provenance_json.fields[x].evidence_url speichern.',
          files_affected: 'functions/enrichCompany',
        },
        {
          priority: 'medium',
          area: 'enrichCompany',
          id: 'write_activity_log',
          effort: 'small',
          impact: 'Enrichment-Änderungen in App-UI auditierbar (nicht nur Server-Logs).',
          fix: 'Nach Company.update: ActivityLog.create({ organization_id, company_id, action: "enrich_ai", fields_updated: Object.keys(updates).filter(k => k !== "provenance_json"), user_email, timestamp: now }).',
          files_affected: 'functions/enrichCompany',
        },
        {
          priority: 'low',
          area: 'enrichCompany + provenance.js',
          id: 'store_previous_value',
          effort: 'small',
          impact: 'Vorher-Nachher-Vergleich bei hypothetischem Überschreiben. Audit-Trail vollständiger.',
          fix: 'buildEnrichmentProvenance: previous_value = company[apiField] (der alte Wert) speichern in provenance_json.fields[key].previous_value.',
          files_affected: 'utils/provenance.js, functions/enrichCompany',
        },
        {
          priority: 'low',
          area: 'LeadDetail manual edit',
          id: 'update_provenance_on_manual_edit',
          effort: 'medium',
          impact: 'Wenn Nutzer Kontaktfeld manuell bearbeitet: source_type="manual", review_status="overwritten".',
          fix: 'Beim Company.update aus LeadDetail-Edit-Mode: wenn Feld telefon/email/ansprechpartner/website geändert → provenance_json für dieses Feld: { source_type: "manual", review_status: "overwritten", updated_by, updated_at, previous_source: alter source_type, previous_value: alter Wert }.',
          files_affected: 'pages/LeadDetail.jsx oder components/lead-detail/EditableField',
          do_not: 'Nicht alle Updates mit Provenance überlasten. Nur explizit die 4 Kontaktfelder.',
        },
      ],

      audit_notes: [
        'STÄRKE: enrichCompany schreibt source_type, confidence, review_status, source_function, updated_by, updated_at, previous_source — solide Provenance-Basis.',
        'STÄRKE: Guard `if (!company.telefon)` verhindert Überschreiben bestehender Werte. Implizit korrekt.',
        'STÄRKE: ansprechpartner hat confidence="low" — realistisch für KI-generierte Namen.',
        'KRITISCH: CompanyInfo.jsx zeigt KI-Daten ohne Badge. ProvenanceBadge ist gebaut aber NICHT eingebunden. Das ist die wichtigste sofortige Fix.',
        'KRITISCH: Kein Review-Workflow. Einmal unreviewed → für immer unreviewed. Nutzer hat keine Möglichkeit zu bestätigen.',
        'MEDIUM: email confidence="medium" zu optimistisch. LLMs konstruieren Muster-Mails.',
        'MEDIUM: Kein evidence_url. Nutzer kann Datenquelle nicht prüfen.',
        'LOW: Kein ActivityLog. Server-Logs + provenance_json als Minimal-Audit vorhanden.',
        'NICHT GEBAUT: updateContactFieldReviewStatus Function. Erste Priorität nach Badge-Integration.',
      ],
    });

  } catch (error) {
    console.error('[auditEnrichmentReviewSafety] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});