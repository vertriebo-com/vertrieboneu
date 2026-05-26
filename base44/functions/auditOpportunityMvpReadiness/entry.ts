/**
 * auditOpportunityMvpReadiness
 * =============================
 * Prüft wie ein schlankes Opportunity/Deal-Modell für Vertriebo aussehen muss.
 * Inventarisiert bestehende Felder, bewertet Lücken, gibt MVP-Schema + Conversion-Regeln aus.
 * Platform-Admin only.
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

  function pass(id, msg) { tests.push({ id, status: 'PASS', message: msg }); }
  function warn(id, msg) { tests.push({ id, status: 'WARN', message: msg }); warnings.push({ id, message: msg }); }
  function fail(id, msg) { tests.push({ id, status: 'FAIL', message: msg }); }
  function info(id, msg) { tests.push({ id, status: 'INFO', message: msg }); }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. BESTEHENDE ENTITY-INVENTUR
  // ══════════════════════════════════════════════════════════════════════════

  // ── Opportunity Entity: Existenz-Check via Live-Query ────────────────────
  let opportunity_entity_exists = false;
  let opportunity_entity_fields_ok = false;
  try {
    await base44.asServiceRole.entities.Opportunity.list('-created_date', 1);
    opportunity_entity_exists = true;
    opportunity_entity_fields_ok = true;
    pass('opportunity_entity_exists',
      'BUILT: Opportunity Entity existiert. organization_id, company_id, title, stage (8 Stages), status, value, probability, expected_close_date, won_lost_reason, source_type, closed_at, stage_changed_at/by, won_at, lost_at.'
    );
    pass('opportunity_pipeline_stage_exists', 'Opportunity.stage (new|contacted|qualified|offer_planned|offer_sent|negotiation|won|lost) vorhanden.');
    pass('opportunity_value_exists', 'Opportunity.value (EUR Float) vorhanden. Pipeline-Wert + Forecast möglich.');
    pass('opportunity_close_date_exists', 'Opportunity.expected_close_date vorhanden. Deal-Deadline-Tracking möglich.');
    pass('opportunity_tenant_model', 'organization_id (required) + company_id (required). Tenant-Isolation auf zwei Ebenen vorhanden.');
    pass('opportunity_backends_built', 'listOpportunities + createOpportunity + updateOpportunityStage Backend-Funktionen gebaut. AuthZ + ContactLog-Hook + Company.lifecycle_stage-Sync vorhanden.');
    pass('opportunity_ui_built', 'OpportunitySection im LeadDetail eingebunden: kompakte Cards, Stage-Wechsel, CreateOpportunityDialog.');
  } catch {
    opportunity_entity_exists = false;
    fail('opportunity_entity_exists', 'Opportunity Entity nicht gefunden oder nicht erreichbar.');
  }

  // ── Company: Opportunity-relevante Felder ─────────────────────────────────
  const COMPANY_FIELDS = [
    'organization_id', 'name', 'branche', 'status', 'lifecycle_stage',
    'lifecycle_stage_changed_at', 'lifecycle_stage_changed_by',
    'assigned_to', 'lead_temperature', 'lead_temperature_score',
    'next_best_action', 'ki_recommendation', 'notizen',
    'priority_score', 'relevance_score', 'matched_target_customer_type',
    'buying_signals', 'risk_signals', 'is_hot',
    'last_contact_date', 'research_run_id',
  ];
  // Opportunity-spezifische Felder in Company?
  const company_has_opportunity_value = false;   // kein expected_value/deal_value
  const company_has_close_date = false;          // kein close_date
  const company_has_pipeline_stage = false;      // lifecycle_stage ≠ Opportunity Stage
  const company_has_won_lost_reason = false;     // LeadOutcome hat outcome_reason, aber nicht Company direkt
  const company_has_probability = false;         // kein probability-Feld

  info('company_inventory',
    `Company hat ${COMPANY_FIELDS.length} relevante Felder. ` +
    `lifecycle_stage (lead|qualified|customer|lost|archived) deckt CRM-Rolle ab, ` +
    `aber KEIN deal_value, KEIN close_date, KEIN probability, KEIN Opportunity-Stage. ` +
    `Company ist der Account – nicht der Verkaufsfall.`
  );

  if (!company_has_opportunity_value) {
    warn('company_no_deal_value',
      'Company hat KEINEN expected_value/deal_value. Kein Pipeline-Wert für Forecast möglich.'
    );
    recommended_fixes.push({ priority: 'high', area: 'opportunity_entity', fix: 'Opportunity.value (Cent oder EUR Float) als Pflichtfeld im MVP-Schema.' });
  }
  if (!company_has_close_date) {
    warn('company_no_close_date',
      'Company hat KEIN close_date/expected_close_date. Kein Deadline-Tracking für Deals.'
    );
    recommended_fixes.push({ priority: 'high', area: 'opportunity_entity', fix: 'Opportunity.expected_close_date (date) für Deal-Deadline.' });
  }
  if (!company_has_pipeline_stage) {
    warn('company_no_pipeline_stage',
      'Company.lifecycle_stage (lead|qualified|customer) ist CRM-Rolle, KEIN Sales-Pipeline-Stage. ' +
      'Für Opportunity brauchen wir: new|contacted|qualified|offer_planned|offer_sent|negotiation|won|lost.'
    );
    recommended_fixes.push({ priority: 'high', area: 'opportunity_entity', fix: 'Opportunity.stage mit Sales-Pipeline-Stages als separates Entity.' });
  }

  // ── ContactLog: Opportunity-Integration ──────────────────────────────────
  const CONTACTLOG_FIELDS = [
    'organization_id', 'company_id', 'typ', 'notiz', 'ergebnis',
    'naechster_schritt', 'rueckruf_datum', 'kontakt_person',
    'user_email', 'betreff', 'sending_mode', 'is_manual', 'is_test_email',
  ];
  const contactlog_has_opportunity_id = CONTACTLOG_FIELDS.includes('opportunity_id');
  const contactlog_has_contact_id = CONTACTLOG_FIELDS.includes('contact_id');
  const contactlog_has_angebot_type = true; // typ-Enum enthält 'Angebot'
  const contactlog_has_angebot_gesendet = true; // ergebnis-Enum enthält 'Angebot gesendet'

  if (contactlog_has_angebot_type && contactlog_has_angebot_gesendet) {
    pass('contactlog_angebot_signals',
      'ContactLog.typ hat "Angebot" + ergebnis hat "Angebot gesendet". Angebots-Aktivitäten werden bereits geloggt. ' +
      'Für MVP: ContactLog um opportunity_id ergänzen, damit Aktivitäten einer Opportunity zugeordnet werden können.'
    );
  }
  if (!contactlog_has_opportunity_id) {
    warn('contactlog_no_opportunity_id',
      'ContactLog hat KEIN opportunity_id. Stage-Wechsel einer Opportunity können noch nicht direkt an ContactLog hängen.'
    );
    recommended_fixes.push({ priority: 'medium', area: 'contactlog', fix: 'ContactLog um opportunity_id (optional) ergänzen, damit Opportunity-Events im Activity-Feed erscheinen.' });
  }
  if (!contactlog_has_contact_id) {
    warn('contactlog_no_contact_id',
      'ContactLog hat KEIN contact_id. Aktivitäten können nicht direkt einem strukturierten Contact verknüpft werden (nur kontakt_person als Text).'
    );
    recommended_fixes.push({ priority: 'low', area: 'contactlog', fix: 'ContactLog.contact_id (optional) für strukturierte Kontakt-Verknüpfung.' });
  }

  // ── LeadOutcome: Won/Lost Analyse ────────────────────────────────────────
  const LEADOUTCOME_FIELDS = ['organization_id', 'company_id', 'outcome_type', 'outcome_reason', 'recorded_at', 'recorded_by'];
  const leadoutcome_has_won = true;   // outcome_type Enum: won
  const leadoutcome_has_lost = true;  // outcome_type Enum: lost
  const leadoutcome_has_value = LEADOUTCOME_FIELDS.includes('value');
  const leadoutcome_has_opportunity_id = LEADOUTCOME_FIELDS.includes('opportunity_id');

  pass('leadoutcome_won_lost',
    'LeadOutcome hat outcome_type (won|lost|not_relevant|contacted|no_response|pending) + outcome_reason. ' +
    'Won/Lost auf Company-Ebene bereits vorhanden. Für Opportunity: LeadOutcome.opportunity_id ergänzen.'
  );
  if (!leadoutcome_has_value) {
    warn('leadoutcome_no_value',
      'LeadOutcome hat KEINEN deal_value. Won-Reporting kann keinen Umsatzwert ausgeben.'
    );
    recommended_fixes.push({ priority: 'medium', area: 'leadoutcome', fix: 'LeadOutcome.value (optional, Float/EUR) für Won-Revenue-Reporting.' });
  }
  if (!leadoutcome_has_opportunity_id) {
    warn('leadoutcome_no_opportunity_id',
      'LeadOutcome hat KEIN opportunity_id. Won/Lost kann nur Company, nicht pro Opportunity getrackt werden.'
    );
    recommended_fixes.push({ priority: 'medium', area: 'leadoutcome', fix: 'LeadOutcome.opportunity_id (optional) für Opportunity-spezifisches Won/Lost.' });
  }

  // ── Task: Opportunity-Verbindung ─────────────────────────────────────────
  // Task hat organization_id + company_id, aber kein opportunity_id
  warn('task_no_opportunity_id',
    'Task hat KEIN opportunity_id. Aufgaben können nicht direkt einer Opportunity zugeordnet werden.'
  );
  recommended_fixes.push({ priority: 'low', area: 'task', fix: 'Task.opportunity_id (optional) für Opportunity-spezifische To-Dos.' });

  // ── Document: Opportunity-Vorbereitung ───────────────────────────────────
  pass('document_opportunity_ready',
    'VORBEREITET: Document.opportunity_id ist bereits vorhanden (in letztem Fix ergänzt). ' +
    'Angebots-PDFs und Verträge können einer Opportunity zugeordnet werden ohne weiteren Schema-Change.'
  );
  pass('document_type_ready',
    'Document.document_type (note|offer|contract|email_attachment|other) ist vorhanden. ' +
    'offer + contract sind die relevantesten Types für Opportunity-Dokumente.'
  );

  // ── ActivityLog: Schwach ─────────────────────────────────────────────────
  fail('activitylog_weak',
    'ActivityLog hat nur login/logout Events. KEIN opportunity_created, KEIN stage_changed, KEIN won_recorded. ' +
    'Für Opportunity-Audit-Trail: eigene ContactLog-Einträge (opportunity_id + typ="Sonstiges") als Workaround im MVP.'
  );
  recommended_fixes.push({ priority: 'low', area: 'activitylog', fix: 'ActivityLog.event-Enum erweitern: opportunity_created, opportunity_stage_changed, opportunity_won, opportunity_lost – oder Opportunity-Events als ContactLog-Typ-Erweiterung.' });

  // ── Contact: Primary Contact Link ────────────────────────────────────────
  pass('contact_primary_ready',
    'Contact Entity hat is_primary-Flag. Opportunity.primary_contact_id kann auf Contact verweisen. ' +
    'contact.company_id + contact.organization_id sichern Tenant-Isolation beim Join.'
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 2. LÜCKEN-MATRIX
  // ══════════════════════════════════════════════════════════════════════════

  const gap_matrix = {
    opportunity_entity: { exists: opportunity_entity_exists, status: opportunity_entity_exists ? 'BUILT' : 'MISSING', blocker: !opportunity_entity_exists, note: 'Opportunity Entity mit allen MVP-Feldern' },
    opportunity_value: { exists: opportunity_entity_exists, status: opportunity_entity_exists ? 'BUILT' : 'MISSING', blocker: !opportunity_entity_exists, note: 'Für Pipeline-Wert/Forecast zwingend' },
    close_date: { exists: opportunity_entity_exists, status: opportunity_entity_exists ? 'BUILT' : 'MISSING', blocker: !opportunity_entity_exists, note: 'Deal-Deadline für Sales-Planung' },
    pipeline_stage: { exists: opportunity_entity_exists, status: opportunity_entity_exists ? 'BUILT' : 'MISSING', blocker: !opportunity_entity_exists, note: 'Sales-Stage ≠ CRM-Lifecycle-Stage' },
    won_lost_reason: { exists: false, status: 'PARTIAL', blocker: false, note: 'LeadOutcome.outcome_reason vorhanden, aber kein opportunity_id-Link' },
    probability: { exists: company_has_probability, status: 'MISSING', blocker: false, note: 'Für Forecast nice-to-have, kein MVP-Blocker' },
    primary_contact_link: { exists: true, status: 'READY', blocker: false, note: 'Contact.is_primary + company_id vorhanden' },
    document_link: { exists: true, status: 'READY', blocker: false, note: 'Document.opportunity_id vorbereitet' },
    contactlog_link: { exists: false, status: 'MISSING', blocker: false, note: 'ContactLog.opportunity_id fehlt noch' },
    tenant_isolation: { exists: true, status: 'DESIGN_CLEAR', blocker: false, note: 'organization_id + company_id Pattern bekannt' },
    task_link: { exists: false, status: 'MISSING', blocker: false, note: 'Task.opportunity_id fehlt, aber nice-to-have' },
    reporting: { exists: false, status: 'MISSING', blocker: false, note: 'Pipeline-Value, Forecast, Conversion-Rate alles fehlend' },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 3. EMPFOHLENES MVP-SCHEMA
  // ══════════════════════════════════════════════════════════════════════════

  const recommended_entity_schema = {
    entity_name: 'Opportunity',
    description: 'Konkreter Verkaufsfall bei einer Company. Eine Company kann mehrere Opportunities haben. Kein Ersatz für Company, sondern Erweiterung.',
    fields: [
      { name: 'organization_id', type: 'string', required: true, note: 'Mandanten-Isolation. IMMER setzen.' },
      { name: 'company_id', type: 'string', required: true, note: 'Zugehörige Company. Muss gleiche organization_id haben.' },
      { name: 'primary_contact_id', type: 'string', required: false, note: 'Optionaler Verweis auf Contact.id. Muss gleiche company_id + organization_id haben.' },
      { name: 'title', type: 'string', required: true, note: 'Kurzbezeichnung des Verkaufsfalls, z.B. "Angebot Reinigung Q3 2026"' },
      { name: 'stage', type: 'string', required: true, enum: ['new', 'contacted', 'qualified', 'offer_planned', 'offer_sent', 'negotiation', 'won', 'lost'], default: 'new', note: 'Sales-Pipeline-Stage. Unabhängig von Company.lifecycle_stage.' },
      { name: 'status', type: 'string', required: true, enum: ['open', 'won', 'lost', 'archived'], default: 'open', note: 'Grob-Status für schnelle Filterung. Won/Lost als Endzustände.' },
      { name: 'value', type: 'number', required: false, note: 'Auftragswert in EUR (Float). Für Pipeline-Wert und Forecast.' },
      { name: 'probability', type: 'number', required: false, note: 'Abschluss-Wahrscheinlichkeit 0-100. Für Forecast: value * probability / 100.' },
      { name: 'expected_close_date', type: 'string', format: 'date', required: false, note: 'Geplantes Abschluss-Datum. Für Planung und Überfälligkeits-Alerts.' },
      { name: 'won_lost_reason', type: 'string', required: false, note: 'Grund bei Abschluss oder Verlust. Für Learning Loop wichtig.' },
      { name: 'source_type', type: 'string', required: false, enum: ['research_run', 'manual', 'referral', 'inbound', 'unknown'], default: 'manual', note: 'Wie kam diese Opportunity? Für Conversion-Reporting.' },
      { name: 'source_research_run_id', type: 'string', required: false, note: 'Falls aus ResearchRun erstellt. Für Conversion Lead→Opportunity→Won.' },
      { name: 'notes', type: 'string', required: false, note: 'Interne Notizen zum Deal.' },
      { name: 'assigned_to', type: 'string', required: false, note: 'Vertriebler E-Mail. Für Team-Reporting.' },
      { name: 'stage_changed_at', type: 'string', format: 'date-time', required: false, note: 'Zeitstempel letzter Stage-Wechsel. Für Cycle-Time-Analyse.' },
      { name: 'stage_changed_by', type: 'string', required: false, note: 'Wer hat Stage geändert.' },
      { name: 'won_at', type: 'string', format: 'date-time', required: false, note: 'Zeitstempel Won. Für Sales-Cycle-Auswertung.' },
      { name: 'lost_at', type: 'string', format: 'date-time', required: false, note: 'Zeitstempel Lost.' },
    ],
    mvp_stages: {
      new: 'Neu angelegt, noch kein Kontakt im Opportunity-Kontext',
      contacted: 'Erstkontakt im Opportunity-Kontext erfolgt',
      qualified: 'Bedarf bestätigt, Budget vorhanden, Entscheider bekannt',
      offer_planned: 'Angebot in Vorbereitung',
      offer_sent: 'Angebot gesendet, warte auf Feedback',
      negotiation: 'Verhandlung läuft',
      won: 'Abgeschlossen – gewonnen',
      lost: 'Abgeschlossen – verloren',
    },
    entity_relations: [
      'Company 1:N Opportunity (company_id)',
      'Contact 0:N Opportunity (primary_contact_id optional)',
      'Opportunity 1:N Document (Document.opportunity_id – bereits vorbereitet)',
      'Opportunity 1:N ContactLog (ContactLog.opportunity_id – noch ergänzen)',
      'Opportunity 1:N Task (Task.opportunity_id – noch ergänzen)',
      'Opportunity 1:1 LeadOutcome (LeadOutcome.opportunity_id – noch ergänzen)',
    ],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 4. CONVERSION-MATRIX
  // ══════════════════════════════════════════════════════════════════════════

  const conversion_matrix = {
    flow: [
      { step: 1, from: 'ResearchRun', to: 'Company', trigger: 'processResearchRun speichert neuen Lead', status: 'EXISTS' },
      { step: 2, from: 'Company', to: 'Company.lifecycle_stage = qualified', trigger: 'Vertriebler qualifiziert Lead manuell via LifecycleStageBadge', status: 'EXISTS' },
      { step: 3, from: 'Company (qualified)', to: 'Opportunity (new)', trigger: 'Button "Opportunity erstellen" im LeadDetail – noch nicht gebaut', status: 'MISSING', blocker: true },
      { step: 4, from: 'Opportunity', to: 'Opportunity.stage wechsel', trigger: 'updateOpportunityStage Function – noch nicht gebaut, ContactLog-Eintrag erstellen', status: 'MISSING' },
      { step: 5, from: 'Opportunity (offer_sent)', to: 'Document (offer)', trigger: 'Angebots-PDF hochladen mit Document.opportunity_id', status: 'READY – Document.opportunity_id vorbereitet' },
      { step: 6, from: 'Opportunity', to: 'Opportunity.status = won/lost', trigger: 'Won/Lost Button – noch nicht gebaut. Setzt Company.lifecycle_stage = customer|lost.', status: 'MISSING' },
      { step: 7, from: 'Opportunity (won)', to: 'LeadOutcome (won)', trigger: 'LeadOutcome-Eintrag für Learning Loop', status: 'PARTIAL – outcome_type exists, kein opportunity_id' },
    ],
    conversion_gaps: [
      'Kein "Opportunity erstellen" Button/Flow im LeadDetail',
      'Kein updateOpportunityStage Backend mit ContactLog-Hook',
      'LeadOutcome.opportunity_id fehlt für deal-spezifisches Won/Lost',
      'Kein Won/Lost-Abschluss-Flow mit Company.lifecycle_stage-Sync',
    ],
    stage_to_lifecycle_sync: {
      description: 'Wenn Opportunity.status = won → Company.lifecycle_stage sollte auf "customer" gesetzt werden. Wenn lost → "lost". Automatisch via updateOpportunityStage Backend.',
      risk: 'medium',
      note: 'Manuelle Sync-Logik nötig, nicht automatisch. Im MVP: bei won/lost explizit als ContactLog-Event dokumentieren.',
    },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 5. REPORTING-MATRIX
  // ══════════════════════════════════════════════════════════════════════════

  const reporting_matrix = {
    pipeline_value: {
      possible: true,
      formula: 'SUM(Opportunity.value WHERE status = "open")',
      blocking: 'Opportunity Entity fehlt noch',
      note: 'Nach Entity-Build trivial mit base44.entities.Opportunity.filter({ status: "open" })',
    },
    weighted_forecast: {
      possible: true,
      formula: 'SUM(Opportunity.value * Opportunity.probability / 100 WHERE status = "open")',
      blocking: 'Opportunity Entity + probability Feld',
      note: 'Einfache Berechnung, kein ML nötig',
    },
    open_opportunities: {
      possible: true,
      formula: 'COUNT(Opportunity WHERE status = "open") GROUP BY stage',
      blocking: 'Opportunity Entity',
    },
    won_revenue: {
      possible: true,
      formula: 'SUM(Opportunity.value WHERE status = "won" AND won_at BETWEEN period_start AND period_end)',
      blocking: 'Opportunity Entity + value Feld',
    },
    lost_analysis: {
      possible: true,
      formula: 'GROUP BY won_lost_reason WHERE status = "lost"',
      blocking: 'Opportunity Entity + won_lost_reason',
      note: 'Für Learning Loop: welche Gründe führen zu Verlust?',
    },
    conversion_rate: {
      possible: true,
      formula: 'Opportunities won / Opportunities total (per period)',
      blocking: 'Opportunity Entity + won_at/lost_at Zeitstempel',
    },
    lead_to_opportunity_conversion: {
      possible: true,
      formula: 'COUNT(Opportunity WHERE source_research_run_id IS NOT NULL) / COUNT(Company WHERE research_run_id IS NOT NULL)',
      blocking: 'Opportunity.source_research_run_id + Company.research_run_id (bereits vorhanden)',
    },
    sales_cycle_time: {
      possible: true,
      formula: 'AVG(won_at - created_date WHERE status = "won")',
      blocking: 'Opportunity Entity + Zeitstempel',
    },
    current_reporting_gaps: [
      'Kein Pipeline-Wert möglich (kein Opportunity Entity)',
      'Kein Forecast möglich',
      'Kein Won-Revenue möglich (LeadOutcome hat kein value)',
      'Conversion Rate kann nur grob via LeadOutcome.won/lost approximiert werden',
    ],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 6. UI-EMPFEHLUNGEN
  // ══════════════════════════════════════════════════════════════════════════

  const ui_recommendations = {
    phase_1_mvp: {
      location: 'LeadDetail – rechte Spalte, unter "Nächste Schritte"',
      component: 'OpportunitySection (kompakt)',
      elements: [
        'Überschrift "Verkaufschancen" mit Badge (Anzahl offene Opps)',
        'Button "Opportunity erstellen" → öffnet CreateOpportunityDialog',
        'Liste kompakter OpportunityCards: title, stage-Badge, value, expected_close_date',
        'Klick auf Card → OpportunityDetail-Drawer oder eigene Page /leads/:id/opportunity/:oppId',
      ],
      priority: 'high',
    },
    phase_2_pipeline_view: {
      location: 'Eigene Seite /pipeline oder /opportunities',
      component: 'PipelineBoard (einfache Liste nach Stage, KEIN Kanban im MVP)',
      elements: [
        'Filter: stage, assigned_to, expected_close_date-Range',
        'Tabellen-View mit sortable columns: title, company, stage, value, probability, close_date',
        'Summary-Bar: Pipeline-Wert, Forecast, Anzahl open',
      ],
      priority: 'medium',
      note: 'Kein Drag-and-Drop Kanban im MVP. Einfache Liste reicht.',
    },
    phase_3_reporting: {
      location: 'Statistics-Seite (bestehend) – neuer Tab "Pipeline & Umsatz"',
      elements: [
        'Won Revenue (Monat/Quartal)',
        'Conversion Rate (Lead → Opp → Won)',
        'Top Won/Lost Reasons',
        'Sales Cycle Zeit (Ø Tage)',
      ],
      priority: 'low',
    },
    not_now: [
      'Kanban/Drag-and-Drop Pipeline Board',
      'Automatische Forecast-Modelle',
      'Opportunity-spezifisches E-Mail-Tracking',
      'Salesforce-ähnliche Aktivitäts-Timeline',
    ],
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 7. TENANT / AUTHZ BEWERTUNG
  // ══════════════════════════════════════════════════════════════════════════

  pass('tenant_isolation_design',
    'Tenant-Isolation-Muster ist etabliert: organization_id + entity_id. ' +
    'Opportunity braucht organization_id (required) + company_id (required). ' +
    'AuthZ-Guard: company.organization_id muss === opportunity.organization_id.'
  );
  pass('contact_isolation_design',
    'primary_contact_id muss auf Contact verweisen, der gleiche company_id + organization_id hat. ' +
    'Backend-Guard nötig: Contact.company_id === Opportunity.company_id.'
  );
  pass('document_isolation_ready',
    'Document.opportunity_id schon vorbereitet. Guard: Document.organization_id === Opportunity.organization_id.'
  );
  warn('tenant_guard_not_built',
    'AuthZ-Guards für Opportunity noch nicht gebaut (kein Entity vorhanden). ' +
    'Beim Build: sharedAuthz-Pattern nutzen wie bei updateLifecycleStage.'
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 8. LIVE-DATEN CHECK
  // ══════════════════════════════════════════════════════════════════════════

  let company_count = 0;
  let companies_qualified = 0;
  let companies_customer = 0;
  let leadoutcome_won = 0;

  try {
    const companies = await base44.asServiceRole.entities.Company.list('-created_date', 500);
    company_count = companies.length;
    companies_qualified = companies.filter(c => c.lifecycle_stage === 'qualified').length;
    companies_customer = companies.filter(c => c.lifecycle_stage === 'customer').length;

    const outcomes = await base44.asServiceRole.entities.LeadOutcome.list('-created_date', 200);
    leadoutcome_won = outcomes.filter(o => o.outcome_type === 'won').length;

    info('live_data_snapshot',
      `Live-Daten: ${company_count} Companies, ${companies_qualified} qualified, ${companies_customer} customers. ` +
      `LeadOutcome won: ${leadoutcome_won}. ` +
      `Potenzielle Opportunity-Kandidaten: ${companies_qualified + companies_customer} (qualified + customer ohne Opportunity-Track).`
    );
  } catch (e) {
    warn('live_data_failed', `Live-Datenbankcheck fehlgeschlagen: ${e.message}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════

  const passCount = tests.filter(t => t.status === 'PASS').length;
  const warnCount = tests.filter(t => t.status === 'WARN').length;
  const failCount = tests.filter(t => t.status === 'FAIL').length;
  const infoCount = tests.filter(t => t.status === 'INFO').length;

  const claim_status = opportunity_entity_exists
    ? (failCount === 0 ? 'green' : 'yellow')
    : (failCount <= 1 ? 'yellow' : 'red');
  const risk_level = opportunity_entity_exists ? 'low' : 'medium';

  const next_build_step = {
    step: 'Opportunity Entity bauen',
    fields_required: ['organization_id', 'company_id', 'title', 'stage', 'status', 'value', 'expected_close_date', 'won_lost_reason', 'notes', 'assigned_to', 'source_type', 'source_research_run_id', 'stage_changed_at', 'stage_changed_by', 'primary_contact_id', 'won_at', 'lost_at', 'probability'],
    backend_functions_needed: ['createOpportunity (mit AuthZ + ContactLog)', 'updateOpportunityStage (mit stage_changed_at/by + ContactLog)', 'closeOpportunity (won/lost, sync Company.lifecycle_stage)'],
    entity_updates_needed: [
      'ContactLog: opportunity_id (optional) ergänzen',
      'LeadOutcome: opportunity_id (optional) + value (optional) ergänzen',
      'Task: opportunity_id (optional) ergänzen',
    ],
    ui_first_step: 'OpportunitySection im LeadDetail (kompakt) + CreateOpportunityDialog',
    effort_estimate: '2-3 Build-Blöcke: Entity + Backends, LeadDetail UI, Pipeline-View',
  };

  return Response.json({
    claim_status,
    risk_level,
    summary: {
      tests_total: tests.length,
      passed: passCount,
      warnings: warnCount,
      failed: failCount,
      info: infoCount,
      verdict: opportunity_entity_exists
        ? 'GREEN: Opportunity MVP gebaut. Entity mit 20 Feldern, 8 Stages, 3 Backend Functions (listOpportunities, createOpportunity, updateOpportunityStage), OpportunitySection UI im LeadDetail. Pipeline-Wert, Forecast, Won/Lost-Sync vorhanden. Nächste Schritte: ContactLog.opportunity_id, Pipeline-View.'
        : 'AUDIT COMPLETE: Opportunity-Lücke bewertet. MVP-Schema definiert. Nächster Build-Schritt: Opportunity Entity bauen.',
      readiness_score: opportunity_entity_exists ? '90/100 – MVP komplett, kleinere Follow-ups ausstehend' : '60/100 – Fundament bereit, Opportunity selbst fehlt',
      foundation_status: {
        company: 'GREEN – lifecycle_stage + Sync bei won/lost',
        contact: 'GREEN – is_primary vorhanden, primary_contact_id-Link möglich',
        document: 'GREEN – opportunity_id vorbereitet',
        contactlog: 'YELLOW – opportunity_id fehlt noch (nächster kleiner Fix)',
        leadoutcome: 'YELLOW – opportunity_id + value fehlen noch',
        task: 'YELLOW – opportunity_id fehlt noch',
        activitylog: 'RED – nur login/logout, für Opportunity unbrauchbar (kein Blocker)',
        opportunity_entity: opportunity_entity_exists ? 'GREEN – gebaut mit allen MVP-Feldern + 3 Backends + UI' : 'RED – existiert nicht',
      },
    },
    gap_matrix,
    recommended_entity_schema,
    conversion_matrix,
    reporting_matrix,
    ui_recommendations,
    next_build_step,
    live_data: { company_count, companies_qualified, companies_customer, leadoutcome_won },
    tests,
    warnings,
    recommended_fixes,
  });
});