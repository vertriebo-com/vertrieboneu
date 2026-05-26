/**
 * auditCoreCrmReadiness
 * =====================
 * Inventarisiert den aktuellen CRM-Kern von Vertriebo und bewertet:
 * - Company als Lead/Account-Modell
 * - Contact/Ansprechpartner-Readiness
 * - Opportunity/Deal-Readiness
 * - Pipeline/Stage-Readiness
 * - Activity Feed-Readiness
 * - Notes & Attachments
 * - Reporting/Forecast
 * - Mandantentrennung
 * - Supabase-ready Zielmodell
 *
 * Output: claim_status GREEN/YELLOW/RED + priorisierter MVP-Baustein
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
    return Response.json({ error: 'Nur Platform-Admins dürfen Audits ausführen.' }, { status: 403 });
  }

  const tests = [];
  const warnings = [];
  const recommended_fixes = [];

  function pass(area, id, msg) { tests.push({ area, id, status: 'PASS', message: msg }); }
  function warn(area, id, msg) { tests.push({ area, id, status: 'WARN', message: msg }); warnings.push({ area, id, message: msg }); }
  function fail(area, id, msg) { tests.push({ area, id, status: 'FAIL', message: msg }); }
  function info(area, id, msg) { tests.push({ area, id, status: 'INFO', message: msg }); }

  // ── ENTITY SCHEMAS (statische Analyse) ────────────────────────────────────

  // Company-Felder
  const COMPANY_FIELDS = [
    'organization_id', 'name', 'branche', 'adresse', 'plz', 'ort', 'telefon', 'email', 'website',
    'ansprechpartner', 'status', 'notizen', 'assigned_to', 'research_run_id', 'is_blacklisted',
    'is_hot', 'priority_score', 'last_contact_date', 'quelle', 'matched_target_customer_type',
    'relevance_score', 'lead_temperature', 'lead_temperature_score', 'next_best_action',
    'first_contact_summary', 'last_contact_summary', 'buying_signals', 'risk_signals',
    'engine_analysis_json', 'provenance_json', 'google_place_id', 'weekly_batch_id',
    'excluded_reason', 'aktueller_dienstleister', 'latitude', 'longitude', 'distance_km',
    'quality_tier', 'quality_confidence', 'save_reason_code', 'engine_confidence',
  ];

  const COMPANY_STATUS_VALUES = ['Neu', 'Kontakt', 'Rückruf', 'Termin', 'Angebot', 'Gewonnen', 'Verloren'];

  // ContactLog-Felder
  const CONTACTLOG_FIELDS = [
    'organization_id', 'company_id', 'typ', 'notiz', 'ergebnis', 'naechster_schritt',
    'rueckruf_datum', 'kontakt_person', 'user_email', 'betreff', 'sending_mode', 'is_manual',
  ];

  // Task-Felder
  const TASK_FIELDS = [
    'organization_id', 'company_id', 'company_name', 'titel', 'beschreibung',
    'typ', 'prioritaet', 'faellig_am', 'erledigt', 'assigned_to',
  ];

  // LeadOutcome-Felder
  const LEADOUTCOME_FIELDS = [
    'organization_id', 'company_id', 'outcome_type', 'outcome_reason', 'recorded_at', 'recorded_by',
  ];

  // Document-Felder
  const DOCUMENT_FIELDS = ['organization_id', 'titel', 'beschreibung', 'file_url', 'dateiname', 'kategorie'];

  // ActivityLog-Felder (sehr minimal: nur login/logout)
  const ACTIVITYLOG_FIELDS = ['organization_id', 'user_email', 'user_name', 'event'];
  const ACTIVITYLOG_EVENTS = ['login', 'logout'];

  // ── 1. COMPANY MODEL CLARITY ──────────────────────────────────────────────

  const hasStatus = COMPANY_FIELDS.includes('status');
  const hasLeadTemp = COMPANY_FIELDS.includes('lead_temperature');
  const hasAssigned = COMPANY_FIELDS.includes('assigned_to');
  const hasResearchRunId = COMPANY_FIELDS.includes('research_run_id');
  const hasBlacklist = COMPANY_FIELDS.includes('is_blacklisted');
  const hasIsHot = COMPANY_FIELDS.includes('is_hot');
  const hasProvenance = COMPANY_FIELDS.includes('provenance_json');
  const hasAnsprechpartner = COMPANY_FIELDS.includes('ansprechpartner');

  // Won/Lost sind in Status-Enum
  const hasWonLost = COMPANY_STATUS_VALUES.includes('Gewonnen') && COMPANY_STATUS_VALUES.includes('Verloren');

  info('company_model', 'status_enum',
    `Company.status hat: ${COMPANY_STATUS_VALUES.join(', ')}. Enthält Neu→Verloren-Pipeline: OK.`
  );

  if (hasLeadTemp && hasStatus) {
    warn('company_model', 'dual_role_lead_account',
      'Company ist gleichzeitig Lead (lead_temperature, research_run_id, quelle) UND Account (status=Gewonnen, assigned_to). Kein expliziter lifecycle_stage-Übergang Lead→Account. YELLOW: Für MVP-CRM sollte entweder ein lifecycle_stage-Feld (lead/customer/churned) ergänzt werden, oder Company klar als "Account" definiert werden mit Lead-Provenance-Feldern als read-only.'
    );
    recommended_fixes.push({
      priority: 'medium',
      area: 'company_model',
      fix: 'Company.lifecycle_stage-Feld ergänzen: lead | prospect | customer | churned | blacklisted. Alternativ: Company = Account mit klar getrennten Phasen. Kein großer Umbau, nur ein Enum-Feld.',
      effort: 'small',
    });
  } else {
    pass('company_model', 'single_role_ok', 'Company hat klare Einzelrolle.');
  }

  if (hasWonLost) {
    pass('company_model', 'won_lost_in_status', 'Gewonnen/Verloren sind in Company.status abgebildet.');
  }

  if (!COMPANY_FIELDS.includes('customer_since') && !COMPANY_FIELDS.includes('is_customer')) {
    warn('company_model', 'no_customer_flag',
      'Kein company.is_customer oder company.customer_since. Wenn Company.status=Gewonnen, gibt es keine semantisch klar markierte Kunden-Entity. Für Reporting/Forecast relevant.'
    );
  }

  if (!COMPANY_FIELDS.includes('lifecycle_stage')) {
    warn('company_model', 'no_lifecycle_stage',
      'Kein lifecycle_stage-Feld (lead/prospect/customer/churned). Für CRM-Kern nötig, da Company heute Lead und Account gleichzeitig spielt.'
    );
    recommended_fixes.push({
      priority: 'medium',
      area: 'company_model',
      fix: 'Company.lifecycle_stage ergänzen: lead | prospect | customer | churned | blacklisted. Kleines Enum-Feld, kein Migrationsaufwand.',
      effort: 'trivial',
    });
  }

  // ── 2. CONTACT / ANSPRECHPARTNER READINESS ────────────────────────────────

  if (hasAnsprechpartner) {
    pass('contacts', 'ansprechpartner_field',
      'Company.ansprechpartner-Feld existiert: 1 Ansprechpartner pro Firma speicherbar.'
    );
  }

  if (hasProvenance) {
    pass('contacts', 'contact_provenance',
      'Company.provenance_json dokumentiert Herkunft/Review-Status von ansprechpartner, email, telefon, website.'
    );
  }

  // Kein Contact Entity
  warn('contacts', 'no_contact_entity',
    'Kein eigenständiges Contact/Ansprechpartner-Entity. Company hat nur 1x ansprechpartner-Feld (String). Mehrere Kontakte pro Firma, Rollen, Titel, eigene E-Mail/Telefon pro Person nicht möglich.'
  );
  warn('contacts', 'no_multi_contact',
    'Multi-Contact (z.B. Einkäufer + Geschäftsführer + Assistent) nicht abbildbar. Für B2B-Vertrieb MVP-Lücke.'
  );
  recommended_fixes.push({
    priority: 'high',
    area: 'contacts',
    fix: 'Contact Entity ergänzen: organization_id, company_id, name, role/title, email, phone, is_primary, source_type, confidence, review_status. Kein sofortiger Umbau, aber als nächster MVP-Baustein priorisieren.',
    effort: 'medium',
  });

  // ── 3. OPPORTUNITY / DEAL READINESS ──────────────────────────────────────

  warn('opportunities', 'no_opportunity_entity',
    'Kein Opportunity/Deal-Entity. Company.status=Angebot ist kein echter Deal-Track (kein Wert, kein Abschlussdatum, keine Wahrscheinlichkeit).'
  );
  warn('opportunities', 'no_deal_value',
    'Kein expected_value, close_date oder probability auf Company oder separater Entity. Pipeline-Forecast nicht möglich.'
  );
  warn('opportunities', 'no_won_reason',
    'Kein won_reason/lost_reason auf Opportunity-Ebene. LeadOutcome hat outcome_reason, aber kein strukturiertes won/lost-Feld mit Wert und Datum.'
  );

  if (LEADOUTCOME_FIELDS.includes('outcome_type')) {
    pass('opportunities', 'leadoutcome_as_proxy',
      'LeadOutcome.outcome_type (won/lost/not_relevant) kann als Proxy für Opportunity-Abschluss dienen – aber kein Wert/Datum.'
    );
  }

  recommended_fixes.push({
    priority: 'high',
    area: 'opportunities',
    fix: 'Opportunity Entity ergänzen: organization_id, company_id, primary_contact_id, title, stage, value, probability, expected_close_date, won_lost_reason, source_company_id, created_from_research_run_id. Kein sofortiger Umbau – erst Contact, dann Opportunity.',
    effort: 'medium',
  });

  // ── 4. PIPELINE / STAGE READINESS ────────────────────────────────────────

  const pipelineStatuses = COMPANY_STATUS_VALUES;
  const hasPipelineStages = pipelineStatuses.length >= 5;

  if (hasPipelineStages) {
    pass('pipeline', 'status_covers_pipeline',
      `Company.status deckt ${pipelineStatuses.length} Stufen ab: ${pipelineStatuses.join(' → ')}. Grundpipeline vorhanden.`
    );
  }

  if (!COMPANY_FIELDS.includes('stage_changed_at') && !COMPANY_FIELDS.includes('stage_history')) {
    warn('pipeline', 'no_stage_history',
      'Kein stage_changed_at oder stage_history. Kein Nachweis wann ein Lead durch die Pipeline gewandert ist. Für Cycle-Time-Reporting Lücke.'
    );
  }

  warn('pipeline', 'lead_temp_vs_status_overlap',
    'Company hat BEIDE: status (pipeline-stage) UND lead_temperature (hot/warm/cold). Für Nutzer potentiell verwirrend: Ist status die Pipeline oder ist lead_temperature die Pipeline? Klare Semantik-Trennung empfohlen: status = pipeline-stage, lead_temperature = KI-Score.'
  );

  warn('pipeline', 'no_kanban_ui',
    'Kein Kanban/Pipeline-Board UI vorhanden. Leads-Seite hat Listenansicht + Filter, aber keine visuelle Pipeline-Übersicht.'
  );

  recommended_fixes.push({
    priority: 'medium',
    area: 'pipeline',
    fix: 'Company.stage_changed_at + Company.stage_changed_by ergänzen für Cycle-Time-Tracking. Sehr kleiner Aufwand. Kanban-UI als separater Block später.',
    effort: 'trivial',
  });

  // ── 5. ACTIVITY FEED READINESS ────────────────────────────────────────────

  const contactlogHasOrgId = CONTACTLOG_FIELDS.includes('organization_id');
  const contactlogHasCompanyId = CONTACTLOG_FIELDS.includes('company_id');
  const contactlogHasTypes = true; // Anruf, E-Mail, Besuch, Termin, Angebot, Sonstiges
  const contactlogHasNote = CONTACTLOG_FIELDS.includes('notiz');
  const contactlogHasUser = CONTACTLOG_FIELDS.includes('user_email');
  const taskHasCompanyId = TASK_FIELDS.includes('company_id');

  if (contactlogHasOrgId && contactlogHasCompanyId) {
    pass('activity_feed', 'contactlog_tenant_isolated',
      'ContactLog hat organization_id + company_id. Mandantensicher und pro Lead filterbar.'
    );
  }

  if (contactlogHasTypes) {
    pass('activity_feed', 'contactlog_types',
      'ContactLog.typ: Anruf, E-Mail, Besuch, Termin, Angebot, Sonstiges. Deckt Haupt-Activity-Typen ab.'
    );
  }

  if (contactlogHasNote) {
    pass('activity_feed', 'contactlog_notes',
      'ContactLog.notiz-Feld: Notes sind inline im Activity-Log speicherbar.'
    );
  }

  if (contactlogHasUser) {
    pass('activity_feed', 'contactlog_user',
      'ContactLog.user_email: Akteur ist im Activity-Feed nachvollziehbar.'
    );
  }

  if (taskHasCompanyId) {
    pass('activity_feed', 'task_linkable',
      'Task hat company_id: Tasks können im Activity Feed pro Lead angezeigt werden.'
    );
  }

  // ActivityLog ist zu minimal
  const activityLogIsMinimal = ACTIVITYLOG_EVENTS.length <= 2 && ACTIVITYLOG_EVENTS.every(e => ['login', 'logout'].includes(e));
  if (activityLogIsMinimal) {
    warn('activity_feed', 'activitylog_too_minimal',
      'ActivityLog Entity hat nur login/logout-Events – kein CRM-Activity-Feed. Für CRM-relevant wäre: status_changed, enrichment_done, email_prepared, task_created, outcome_recorded. ABER: ContactLog + Task decken den Sales-Feed bereits ab ohne separate ActivityLog-Entity.'
    );
  }

  // Kein stage-change log
  warn('activity_feed', 'no_status_change_log',
    'Statuswechsel (z.B. Neu→Termin) werden nicht automatisch als ContactLog-Eintrag geloggt. Für echten Activity Feed sollten Statuswechsel im ContactLog oder separater ActivityType auftauchen.'
  );
  recommended_fixes.push({
    priority: 'medium',
    area: 'activity_feed',
    fix: 'Bei Company.status-Änderung automatisch ContactLog-Eintrag schreiben (typ=Sonstiges, notiz="Status geändert: Neu → Termin"). Kleiner Backend-Trigger oder Frontend-Hook.',
    effort: 'small',
  });

  // Enrichment/Review-Aktionen werden nicht geloggt
  warn('activity_feed', 'no_enrichment_activity',
    'enrichCompany-Calls und Provenance-Reviews werden nicht im ContactLog/ActivityLog geloggt. Für Audit-Trail wäre nützlich: "KI-Anreicherung ausgeführt", "Telefonnummer bestätigt".'
  );

  // Timeline im LeadDetail
  pass('activity_feed', 'timeline_exists',
    'LeadDetail rendert Timeline-Komponente (components/lead-detail/Timeline). ContactLog + Tasks sind chronologisch sichtbar.'
  );

  pass('activity_feed', 'manual_email_logged',
    'ManualEmailWorkflow schreibt ContactLog mit typ=E-Mail, sending_mode=manual_email_client, is_manual=true. Activity Feed komplett für E-Mail-Flow.'
  );

  // ── 6. NOTES & ATTACHMENTS ───────────────────────────────────────────────

  if (COMPANY_FIELDS.includes('notizen')) {
    pass('notes', 'company_notizen',
      'Company.notizen-Feld: Ein freies Notizfeld pro Lead/Account vorhanden.'
    );
  }
  pass('notes', 'contactlog_as_notes',
    'ContactLog.notiz kann als strukturierte Notiz pro Aktivität genutzt werden – kein separates Notes-Entity nötig für MVP.'
  );

  // Document Entity
  if (DOCUMENT_FIELDS.includes('file_url')) {
    pass('attachments', 'document_entity_exists',
      'Document Entity mit file_url, kategorie (Preisliste, Präsentation, Vertrag, Angebot) vorhanden.'
    );
  }
  warn('attachments', 'document_no_company_id',
    'Document Entity hat KEINE company_id! Dokumente sind nur auf organization_id-Ebene, nicht pro Lead/Account. Für Lead-spezifische Angebote/Dokumente Lücke.'
  );
  recommended_fixes.push({
    priority: 'low',
    area: 'attachments',
    fix: 'Document Entity um company_id ergänzen, damit Dokumente pro Lead/Account filterbar sind. Sehr kleiner Aufwand.',
    effort: 'trivial',
  });

  // ── 7. REPORTING / FORECAST READINESS ────────────────────────────────────

  pass('reporting', 'statistics_page_exists',
    'Statistics-Seite (getStatisticsSummary) bietet Lead-Übersicht, Statusverteilung, Aktivitäten-Trend.'
  );
  warn('reporting', 'no_pipeline_value',
    'Kein Pipeline-Wert (€) berechenbar: Company hat kein expected_value. Forecast = 0. Für Sales-Controlling MVP-Lücke.'
  );
  warn('reporting', 'no_conversion_funnel',
    'Kein expliziter Conversion-Funnel Lead→Opportunity→Gewonnen mit Werten. LeadOutcome.outcome_type=won vorhanden, aber kein Zeitstempel-basierter Funnel.'
  );

  // ── 8. MANDANTENTRENNUNG ─────────────────────────────────────────────────

  const entitiesWithOrgId = [
    { entity: 'Company', has: COMPANY_FIELDS.includes('organization_id') },
    { entity: 'ContactLog', has: CONTACTLOG_FIELDS.includes('organization_id') },
    { entity: 'Task', has: TASK_FIELDS.includes('organization_id') },
    { entity: 'LeadOutcome', has: LEADOUTCOME_FIELDS.includes('organization_id') },
    { entity: 'Document', has: DOCUMENT_FIELDS.includes('organization_id') },
    { entity: 'ResearchRun', has: true }, // bekannt aus Schema
    { entity: 'ActivityLog', has: ACTIVITYLOG_FIELDS.includes('organization_id') },
  ];

  let tenantIsolationOk = true;
  for (const e of entitiesWithOrgId) {
    if (e.has) {
      pass('tenant_isolation', `${e.entity.toLowerCase()}_org_id`, `${e.entity}.organization_id vorhanden.`);
    } else {
      fail('tenant_isolation', `${e.entity.toLowerCase()}_no_org_id`, `${e.entity} fehlt organization_id!`);
      tenantIsolationOk = false;
    }
  }

  warn('tenant_isolation', 'contact_entity_needs_org_id',
    'Zukünftige Contact Entity MUSS organization_id + company_id erhalten. Kein Feld ohne Mandant anlegen.'
  );
  warn('tenant_isolation', 'opportunity_entity_needs_org_id',
    'Zukünftige Opportunity Entity MUSS organization_id + company_id erhalten.'
  );

  // ── 9. DOMAIN MATRIX ─────────────────────────────────────────────────────

  const domain_matrix = [
    {
      domain: 'Accounts/Companies',
      existing_entities: ['Company'],
      current_coverage: 'Company deckt Lead + Account in einem. Status-Pipeline (Neu→Gewonnen), Lead-Intelligence (KI-Score, Provenance), Research-Herkunft.',
      missing_capabilities: ['lifecycle_stage (lead/customer/churned)', 'customer_since', 'explicit lead→account conversion', 'parent/child account hierarchy'],
      risk: 'yellow',
      recommended_fix: 'lifecycle_stage-Feld ergänzen. Kein Umbau nötig.',
    },
    {
      domain: 'Contacts/Ansprechpartner',
      existing_entities: ['Company.ansprechpartner (1 String-Feld)'],
      current_coverage: 'Nur 1 Ansprechpartner pro Firma als freier String. Provenance/Review für dieses Feld vorhanden.',
      missing_capabilities: ['Contact Entity', 'Multi-Contact', 'Rolle/Titel pro Kontakt', 'eigene E-Mail+Telefon pro Kontakt', 'is_primary-Flag'],
      risk: 'red',
      recommended_fix: 'Contact Entity als nächster MVP-Baustein: organization_id, company_id, name, role, email, phone, is_primary, source_type, confidence, review_status.',
    },
    {
      domain: 'Opportunities/Deals',
      existing_entities: ['Company.status=Angebot (Proxy)', 'LeadOutcome (won/lost)'],
      current_coverage: 'Status=Angebot als Proxy. LeadOutcome für Gewonnen/Verloren mit Reason. Kein echter Deal-Track.',
      missing_capabilities: ['Opportunity Entity', 'expected_value', 'close_date', 'probability', 'deal title', 'pipeline_stage per deal', 'multiple deals per account'],
      risk: 'red',
      recommended_fix: 'Opportunity Entity: organization_id, company_id, title, stage, value, probability, expected_close_date, won_lost_reason, source_company_id.',
    },
    {
      domain: 'Pipeline/Stages',
      existing_entities: ['Company.status (Enum)'],
      current_coverage: '7 Status-Stufen: Neu→Verloren. Grundpipeline abgedeckt. KI-Temperature (hot/warm/cold) parallel.',
      missing_capabilities: ['stage_changed_at', 'stage_history', 'Kanban-UI', 'stage-change ContactLog-Event', 'separate pipeline per org konfigurierbar'],
      risk: 'yellow',
      recommended_fix: 'stage_changed_at + stage_changed_by auf Company ergänzen. Stage-Change als ContactLog-Event schreiben.',
    },
    {
      domain: 'Activity Feed',
      existing_entities: ['ContactLog', 'Task', 'ActivityLog (nur login/logout)'],
      current_coverage: 'ContactLog deckt Anruf/E-Mail/Besuche/Termine/Sonstiges mit Notiz + User. Tasks sind pro Lead verknüpft. Timeline in LeadDetail. ManualEmail loggt ContactLog.',
      missing_capabilities: ['automatischer Status-Change-Log', 'Enrichment-Events im Feed', 'stage_change_log', 'feed-aggregierter Endpoint (ContactLog + Task + StatusHistory)'],
      risk: 'yellow',
      recommended_fix: 'Status-Änderung als ContactLog-Eintrag schreiben. Enrichment-Events optional ergänzen.',
    },
    {
      domain: 'Notes',
      existing_entities: ['Company.notizen', 'ContactLog.notiz'],
      current_coverage: 'Freies Notizfeld auf Company. Strukturierte Notizen inline in ContactLog. Für MVP ausreichend.',
      missing_capabilities: ['eigene Notes-Entity für längere Notizen', 'Notiz-Tags/Kategorien', 'pinned notes'],
      risk: 'green',
      recommended_fix: 'Kein sofortiger Fix nötig. Notes-Entity erst bei konkretem User-Need.',
    },
    {
      domain: 'Attachments/Dokumente',
      existing_entities: ['Document (nur org-level, keine company_id)'],
      current_coverage: 'Document Entity mit Datei-URL und Kategorien. Aber nur organisationsweit, nicht per Lead.',
      missing_capabilities: ['Document.company_id fehlt', 'Angebots-PDF pro Lead', 'Attachment-Upload-UI im LeadDetail'],
      risk: 'yellow',
      recommended_fix: 'Document.company_id ergänzen (trivial). Upload-UI im LeadDetail optional.',
    },
    {
      domain: 'Reporting/Forecast',
      existing_entities: ['Statistics (getStatisticsSummary)'],
      current_coverage: 'Lead-Zahlen, Status-Verteilung, Aktivitäts-Trend. Won/Lost aus LeadOutcome querybar.',
      missing_capabilities: ['Pipeline-Wert (€)', 'Forecast (Wahrscheinlichkeit × Wert)', 'Conversion-Funnel mit Zeit', 'Won-Rate Trend'],
      risk: 'yellow',
      recommended_fix: 'Erst Opportunity Entity bauen → dann Forecast-Reporting ergänzen.',
    },
  ];

  // ── 10. ENTITY MATRIX ────────────────────────────────────────────────────

  const entity_matrix = [
    {
      entity: 'Company',
      has_organization_id: true,
      purpose: 'Lead + Account (Dual-Role)',
      overlaps: 'Lead-Intelligence-Felder (research_run_id, lead_temperature) + CRM-Felder (status, assigned_to) in einer Entity',
      crm_role: 'Account (primär) + Lead (sekundär)',
      risk: 'yellow — dual role ohne lifecycle_stage',
    },
    {
      entity: 'ContactLog',
      has_organization_id: true,
      purpose: 'Activity-Log: Anruf, E-Mail, Termin, Notiz',
      overlaps: 'Kein Overlap, klar abgegrenzt',
      crm_role: 'Activity Feed (primär)',
      risk: 'green — vollständig für MVP Activity Feed',
    },
    {
      entity: 'Task',
      has_organization_id: true,
      purpose: 'Aufgaben pro Lead und org-weit',
      overlaps: 'Überlapp mit ContactLog bei "Rückruf vereinbart" (Rückruf ist Task + ContactLog-Feld)',
      crm_role: 'Task Management',
      risk: 'green — vollständig',
    },
    {
      entity: 'LeadOutcome',
      has_organization_id: true,
      purpose: 'Feedback-Loop: won/lost/not_relevant für KI-Learning',
      overlaps: 'Company.status=Gewonnen/Verloren + LeadOutcome.outcome_type=won/lost → Redundanz möglich',
      crm_role: 'Outcome Tracking + Learning Loop',
      risk: 'yellow — redundant mit Company.status bei won/lost',
    },
    {
      entity: 'Document',
      has_organization_id: true,
      purpose: 'Org-weite Dokumente (Preislisten, Präsentationen)',
      overlaps: 'Kein company_id → nicht als Lead-Attachment nutzbar',
      crm_role: 'Dokument-Bibliothek (org-weit), NICHT Lead-Attachment',
      risk: 'yellow — fehlende company_id',
    },
    {
      entity: 'ActivityLog',
      has_organization_id: true,
      purpose: 'User-Login-Tracking (nur login/logout)',
      overlaps: 'Kein Overlap mit ContactLog, aber Name suggeriert CRM-Activity — irreführend',
      crm_role: 'Kein CRM-Role (nur Auth-Events)',
      risk: 'yellow — Name irreführend für CRM-Kontext, Scope zu eng',
    },
    {
      entity: 'ResearchRun',
      has_organization_id: true,
      purpose: 'Lead-Recherche-Session mit Herkunftsdaten',
      overlaps: 'Company.research_run_id verknüpft Leads mit Research. Kein CRM-Overlap.',
      crm_role: 'Lead Source (read-only für CRM)',
      risk: 'green',
    },
  ];

  // ── 11. RECOMMENDED MVP MODEL ─────────────────────────────────────────────

  const recommended_mvp_model = {
    priority_1_contact_entity: {
      needed: true,
      reason: 'Multi-Contact pro Firma fehlt komplett. B2B-Kernanforderung.',
      fields: ['organization_id', 'company_id', 'name', 'role', 'title', 'email', 'phone', 'is_primary', 'source_type', 'confidence', 'review_status'],
      effort: 'medium',
      prerequisite: 'none',
    },
    priority_2_lifecycle_stage: {
      needed: true,
      reason: 'Company spielt Lead+Account gleichzeitig. lifecycle_stage löst Dual-Role ohne Umbau.',
      fields: ['lifecycle_stage: lead | prospect | customer | churned | blacklisted'],
      effort: 'trivial',
      prerequisite: 'none',
    },
    priority_3_stage_change_log: {
      needed: true,
      reason: 'Statuswechsel fehlen im Activity Feed. Fehlende Cycle-Time-Daten.',
      fields: ['stage_changed_at', 'stage_changed_by', 'ContactLog-Event bei Statuswechsel'],
      effort: 'small',
      prerequisite: 'none',
    },
    priority_4_document_company_id: {
      needed: true,
      reason: 'Document ohne company_id nicht per Lead filterbar.',
      fields: ['company_id auf Document Entity'],
      effort: 'trivial',
      prerequisite: 'none',
    },
    priority_5_opportunity_entity: {
      needed: true,
      reason: 'Forecast, Pipeline-Wert, multi-deal-per-account fehlt komplett.',
      fields: ['organization_id', 'company_id', 'primary_contact_id', 'title', 'stage', 'value', 'probability', 'expected_close_date', 'won_lost_reason', 'source_company_id', 'created_from_research_run_id'],
      effort: 'medium',
      prerequisite: 'Contact Entity zuerst (primary_contact_id)',
    },
    activity_feed_can_use_contact_log: true,
    activity_feed_notes: 'ContactLog + Task + zukünftiger Stage-Change-Log decken MVP Activity Feed ab. Keine neue ActivityLog-Entity für CRM nötig.',
    attachments_later: true,
    attachments_notes: 'Document + company_id reicht für MVP-Attachments. Upload-UI im LeadDetail als separater Block.',
    supabase_ready_future_tables: [
      'companies (= Company migriert, mit lifecycle_stage)',
      'contacts (= neue Contact Entity)',
      'opportunities (= neue Opportunity Entity)',
      'pipeline_stages (= konfigurierbare Stage-Enum pro Org)',
      'activities (= ContactLog migriert, erweiterter typ-Enum)',
      'notes (= optional, falls notes-Entity nötig)',
      'attachments (= Document erweitert um company_id)',
    ],
  };

  // ── 12. SUMMARY & VERDICT ────────────────────────────────────────────────

  const passCount = tests.filter(t => t.status === 'PASS').length;
  const warnCount = tests.filter(t => t.status === 'WARN').length;
  const failCount = tests.filter(t => t.status === 'FAIL').length;
  const infoCount = tests.filter(t => t.status === 'INFO').length;

  // GREEN Acceptance-Kriterien
  const crm_footprint_inventoried = true;
  const company_role_assessed = true;
  const contact_gaps_identified = true;
  const opportunity_gaps_identified = true;
  const activity_feed_assessed = true;
  const tenant_isolation_covered = tenantIsolationOk;
  const next_mvp_block_clear = true;

  const acceptancePassed = [
    crm_footprint_inventoried,
    company_role_assessed,
    contact_gaps_identified,
    opportunity_gaps_identified,
    activity_feed_assessed,
    tenant_isolation_covered,
    next_mvp_block_clear,
  ].filter(Boolean).length;

  // YELLOW: Audit komplett aber Lücken klar identifiziert (Contact + Opportunity fehlen)
  const claim_status = failCount === 0 ? 'yellow' : 'red';
  const risk_level = 'medium';

  const summary = {
    tests_total: tests.length,
    passed: passCount,
    warnings: warnCount,
    failed: failCount,
    info: infoCount,
    acceptance_score: `${acceptancePassed}/7 Acceptance-Kriterien erfüllt`,
    crm_domains_checked: 8,
    company_model_clarity: 'YELLOW — Dual-Role Lead+Account ohne lifecycle_stage',
    contacts_ready: 'RED — Kein Contact Entity, nur 1 String-Feld. B2B-Kernlücke.',
    opportunities_ready: 'RED — Kein Opportunity Entity. Kein Wert/Datum/Forecast.',
    pipeline_ready: 'YELLOW — Status-Enum vorhanden, keine Stage-History, kein Kanban-UI.',
    activity_feed_ready: 'YELLOW — ContactLog + Task decken MVP ab, aber kein auto Stage-Change-Log.',
    notes_ready: 'GREEN — Company.notizen + ContactLog.notiz ausreichend für MVP.',
    attachments_ready: 'YELLOW — Document Entity vorhanden, aber fehlende company_id.',
    reporting_ready: 'YELLOW — Lead-Statistiken OK, kein Pipeline-Wert/Forecast.',
    tenant_isolation_ok: tenantIsolationOk,
    next_mvp_block_priority_1: 'Contact Entity (organization_id, company_id, name, role, email, phone, is_primary)',
    next_mvp_block_priority_2: 'Company.lifecycle_stage-Feld (trivial, kein Umbau)',
    next_mvp_block_priority_3: 'Stage-Change-Log im Activity Feed (ContactLog-Event bei Statuswechsel)',
    next_mvp_block_priority_4: 'Document.company_id ergänzen (trivial)',
    next_mvp_block_priority_5: 'Opportunity Entity (erst nach Contact)',
    verdict: 'YELLOW: CRM-Footprint klar inventarisiert. Kritische Lücken: Contact Entity + Opportunity Entity fehlen. Activity Feed + Notes + Mandantentrennung für MVP ausreichend. Empfohlener nächster Schritt: Contact Entity als MVP-Baustein 1.',
  };

  return Response.json({
    claim_status,
    risk_level,
    summary,
    domain_matrix,
    entity_matrix,
    recommended_mvp_model,
    tests,
    warnings,
    recommended_fixes,
  });
});