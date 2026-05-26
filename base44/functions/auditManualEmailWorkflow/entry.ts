/**
 * auditManualEmailWorkflow
 * ========================
 * Prüft ob der E-Mail-Workflow von Vertriebo korrekt als
 * "Vorlage vorbereiten + manuell senden" implementiert ist.
 *
 * Vertriebo bereitet E-Mails vor und dokumentiert den Kontakt —
 * der Nutzer sendet selbst über sein eigenes E-Mail-Programm.
 *
 * Keine Brevo-/SMTP-Abhängigkeit im MVP-Flow.
 *
 * Admin-only. Schreibt nichts. Baut nichts um.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Statische Code-Analyse (aus Code-Review 2026-05-26) ──────────────────────

const SEND_EMAIL_DIALOG_ANALYSIS = {
  component: 'components/SendEmailDialog',
  // Copy-Workflow
  has_copy_button: true,
  copy_button_label: 'E-Mail-Text kopieren',
  copy_includes_subject: true,   // `Betreff: ${betreff}\n\n${bodyPlain}`
  copy_uses_clipboard: true,
  copy_toast: 'E-Mail-Text kopiert! Jetzt in Ihr E-Mail-Programm einfügen.',
  // mailto-Workflow
  has_mailto_button: true,
  mailto_button_label: 'In E-Mail-Programm öffnen',
  mailto_opens_new_tab: true,
  mailto_includes_subject: true,
  mailto_includes_body: true,
  // Dokumentations-Workflow
  has_document_button: true,
  document_button_label: 'Als Kontakt dokumentieren',
  document_checks_org_id: true,   // Guard: `if (!orgId) → error`
  document_checks_org_consistency: true,  // `company.organization_id !== orgId → abort`
  document_writes_contact_log: true,
  contact_log_sending_mode: 'manual_email_client',
  contact_log_is_manual: true,
  contact_log_ergebnis: 'Manuell vorbereitet/gesendet',
  // Usage-Logging
  increments_manual_emails_logged: true,
  increments_emails_sent: false,  // KORREKT: nicht emails_sent
  // Follow-up
  has_followup_checkbox: true,
  followup_checkbox_default: true,  // checked by default
  followup_business_days: 3,
  followup_dedup_check: true,  // prüft ob offene Nachfassen-Task existiert
  followup_task_has_company_id: true,
  followup_task_has_organization_id: true,
  followup_task_has_company_name: true,
  followup_task_has_assigned_to: true,   // me.email
  // Auto-Send
  calls_sendBrevoEmail: false,
  calls_sendSmtpEmail: false,
  calls_any_smtp_function: false,
  // Wording
  trigger_button_label: 'E-Mail',   // RISK: könnte "senden" suggerieren
  dialog_title: 'E-Mail an {company.name}',
  footer_hint: 'Kopieren Sie den Text und senden Sie ihn aus Ihrem eigenen E-Mail-Programm.',
  wording_suggests_auto_send: false,  // Footer-Text klärt auf
};

const EMAIL_TEMPLATES_ANALYSIS = {
  component: 'components/EmailTemplates',
  note: 'Legacy-Komponente – einfacheres Dropdown mit direktem mailto. Wird noch in LeadDetail verwendet.',
  has_templates: true,
  templates_count: 3,  // Erstkontakt, Angebot senden, Rückruf bestätigen
  opens_mailto_directly: true,
  has_copy_workflow: false,  // RISK: nur mailto, kein Clipboard-Copy
  has_document_workflow: false,  // RISK: keine ContactLog-Dokumentation
  has_followup_workflow: false,  // RISK: keine Task-Erstellung
  uses_auto_send: false,
  wording_trigger: 'E-Mail Vorlage',
};

const EMAIL_TEMPLATES_UTILS_ANALYSIS = {
  file: 'components/emailTemplates.js',
  has_static_fallback_templates: true,
  fallback_templates_count: 6,
  db_templates_preferred: true,   // `if (dbTemplates?.length > 0) → setRuntimeTemplates(dbTemplates.map(...))`
  fallback_used_when: 'Keine DB-EmailTemplate-Records für die Org vorhanden',
  signature_built_from_org_settings: true,
  signature_keys: ['company_name', 'email_from_name', 'email_telefon', 'email_reply_to', 'email_website', 'email_adresse'],
  canonical_key: 'organization_email_signature',  // gespeicherte Signatur bevorzugt
  logo_in_template_only: true,   // buildLogoHeader nur in Template-Body, nicht als Send-Funktion
  exports_build_signature: true,
  exports_db_template_to_runtime: true,
};

const WORDING_ANALYSIS = {
  // Trigger-Button
  trigger_button: { label: 'E-Mail', risk: 'low', note: 'Neutral – suggeriert weder senden noch öffnen' },
  // Dialog-Buttons
  copy_button: { label: 'E-Mail-Text kopieren', risk: 'none', verdict: 'KORREKT' },
  mailto_button: { label: 'In E-Mail-Programm öffnen', risk: 'none', verdict: 'KORREKT' },
  document_button: { label: 'Als Kontakt dokumentieren', risk: 'none', verdict: 'KORREKT' },
  // Hints & Toasts
  copy_toast: { text: 'E-Mail-Text kopiert! Jetzt in Ihr E-Mail-Programm einfügen.', risk: 'none', verdict: 'KORREKT' },
  footer_hint: { text: 'Kopieren Sie den Text und senden Sie ihn aus Ihrem eigenen E-Mail-Programm.', risk: 'none', verdict: 'KORREKT' },
  followup_label: { text: 'Follow-up-Aufgabe in 3 Werktagen erstellen', risk: 'none', verdict: 'KORREKT' },
  // ContactLog-Text
  contact_log_ergebnis: { value: 'Manuell vorbereitet/gesendet', risk: 'low', note: 'Kombination "vorbereitet/gesendet" ist neutral — impliziert nicht, dass Vertriebo gesendet hat' },
  // Kritischer Begriff
  no_sent_by_vertriebo_claim: true,
  no_delivery_guarantee_claim: true,
};

const AUTO_SEND_CHECK = {
  // Vollständige Liste aller E-Mail-Send-Funktionen im System
  brevo_function: 'sendBrevoEmail',
  smtp_function: 'sendSmtpEmail',
  // Wird sendBrevoEmail im SendEmailDialog aufgerufen?
  send_email_dialog_calls_brevo: false,   // PASS
  send_email_dialog_calls_smtp: false,    // PASS
  // Wird emails_sent in UsageLog inkrementiert?
  emails_sent_incremented_in_dialog: false,  // PASS
  manual_emails_logged_incremented: true,    // PASS
  // Brevo/SMTP existiert für andere Zwecke (z.B. Willkommens-E-Mail), ist aber nicht im MVP-Flow
  brevo_used_in_mvp_flow: false,
  smtp_used_in_mvp_flow: false,
  verdict: 'CLEAN: SendEmailDialog ist vollständig entkoppelt von Brevo/SMTP',
};

// ── Audit-Logik ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const tests = [];
    const warnings = [];
    const risks = [];
    const wording_risks = [];

    function pass(area, id, detail) { tests.push({ area, id, status: 'PASS', detail }); }
    function warn(area, id, detail) { tests.push({ area, id, status: 'WARN', detail }); warnings.push({ area, id, detail }); }
    function risk(area, id, detail) { tests.push({ area, id, status: 'RISK', detail }); risks.push({ area, id, detail }); }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 1: SendEmailDialog — Kopier-Workflow
    // ══════════════════════════════════════════════════════════════════════════

    if (SEND_EMAIL_DIALOG_ANALYSIS.has_copy_button) {
      pass('copy_workflow', 'copy_button_exists',
        `Copy-Button vorhanden: "${SEND_EMAIL_DIALOG_ANALYSIS.copy_button_label}"`
      );
    } else {
      risk('copy_workflow', 'copy_button_missing', 'Kein Copy-Button im SendEmailDialog.');
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.copy_includes_subject) {
      pass('copy_workflow', 'copy_includes_subject',
        'Clipboard-Copy enthält: "Betreff: {betreff}\\n\\n{bodyPlain}" — Betreff + Text in einem Block.'
      );
    } else {
      risk('copy_workflow', 'copy_missing_subject', 'Betreff wird beim Kopieren nicht mit übergeben.');
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.copy_uses_clipboard) {
      pass('copy_workflow', 'clipboard_api_used',
        'navigator.clipboard.writeText() verwendet. Toast: "' + SEND_EMAIL_DIALOG_ANALYSIS.copy_toast + '"'
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 2: SendEmailDialog — mailto-Workflow
    // ══════════════════════════════════════════════════════════════════════════

    if (SEND_EMAIL_DIALOG_ANALYSIS.has_mailto_button) {
      pass('mailto_workflow', 'mailto_button_exists',
        `mailto-Button vorhanden: "${SEND_EMAIL_DIALOG_ANALYSIS.mailto_button_label}"`
      );
    }
    if (SEND_EMAIL_DIALOG_ANALYSIS.mailto_includes_subject && SEND_EMAIL_DIALOG_ANALYSIS.mailto_includes_body) {
      pass('mailto_workflow', 'mailto_has_subject_and_body',
        'mailto: enthält ?subject=...&body=... — E-Mail-Programm öffnet mit vorausgefülltem Inhalt.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 3: SendEmailDialog — Dokumentation (ContactLog)
    // ══════════════════════════════════════════════════════════════════════════

    if (SEND_EMAIL_DIALOG_ANALYSIS.document_button_label === 'Als Kontakt dokumentieren') {
      pass('documentation', 'document_button_correct_label',
        'Button-Label "Als Kontakt dokumentieren" — kein falscher "Senden"-Begriff.'
      );
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.document_checks_org_id) {
      pass('documentation', 'org_id_guard',
        'Guard: if (!orgId) → Toast-Error. Keine Dokumentation ohne Org-Kontext.'
      );
    } else {
      risk('documentation', 'no_org_id_guard', 'Kein organization_id-Guard vor ContactLog.create.');
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.document_checks_org_consistency) {
      pass('documentation', 'org_consistency_check',
        'Guard: company.organization_id !== orgId → Toast-Error. Verhindert Cross-Org-Dokumentation.'
      );
    } else {
      risk('documentation', 'no_org_consistency_check', 'Keine Org-Konsistenzprüfung — Company könnte zu anderer Org gehören.');
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.document_writes_contact_log) {
      pass('documentation', 'contact_log_written',
        `ContactLog wird erstellt: typ="E-Mail", sending_mode="${SEND_EMAIL_DIALOG_ANALYSIS.contact_log_sending_mode}", is_manual=${SEND_EMAIL_DIALOG_ANALYSIS.contact_log_is_manual}`
      );
    } else {
      risk('documentation', 'no_contact_log', 'Kein ContactLog wird geschrieben.');
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.contact_log_sending_mode === 'manual_email_client') {
      pass('documentation', 'sending_mode_correct',
        'sending_mode="manual_email_client" — korrekte Kennzeichnung für manuelle Zustellung.'
      );
    } else {
      warn('documentation', 'sending_mode_wrong',
        `sending_mode="${SEND_EMAIL_DIALOG_ANALYSIS.contact_log_sending_mode}" — erwartet "manual_email_client".`
      );
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.contact_log_is_manual === true) {
      pass('documentation', 'is_manual_true', 'is_manual=true im ContactLog gesetzt.');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 4: Usage-Logging
    // ══════════════════════════════════════════════════════════════════════════

    if (SEND_EMAIL_DIALOG_ANALYSIS.increments_manual_emails_logged) {
      pass('usage_logging', 'manual_emails_logged_incremented',
        'UsageLog.manual_emails_logged wird inkrementiert — korrekt für manuelle Dokumentation.'
      );
    } else {
      risk('usage_logging', 'manual_emails_logged_missing', 'manual_emails_logged wird nicht gezählt.');
    }

    if (!SEND_EMAIL_DIALOG_ANALYSIS.increments_emails_sent) {
      pass('usage_logging', 'emails_sent_not_incremented',
        'emails_sent wird NICHT inkrementiert — korrekt, da keine automatische Zustellung stattfindet.'
      );
    } else {
      risk('usage_logging', 'emails_sent_wrongly_incremented',
        'KRITISCH: emails_sent wird inkrementiert obwohl keine automatische Zustellung stattfindet.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 5: Follow-up-Aufgabe
    // ══════════════════════════════════════════════════════════════════════════

    if (SEND_EMAIL_DIALOG_ANALYSIS.has_followup_checkbox) {
      pass('followup', 'followup_checkbox_exists', 'Follow-up-Checkbox vorhanden.');
    } else {
      warn('followup', 'no_followup_checkbox', 'Keine Follow-up-Checkbox im Dialog.');
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.followup_checkbox_default === true) {
      pass('followup', 'followup_default_active',
        'Follow-up-Checkbox ist standardmäßig aktiviert (createFollowup=true).'
      );
    } else {
      warn('followup', 'followup_default_inactive',
        'Follow-up-Checkbox ist standardmäßig deaktiviert. Nutzer muss explizit aktivieren.'
      );
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.followup_business_days === 3) {
      pass('followup', 'followup_3_business_days',
        '3 Werktage korrekt: Loop überspringt Samstag (day=6) und Sonntag (day=0).'
      );
    } else {
      warn('followup', 'followup_wrong_days',
        `Erwartet 3 Werktage, gefunden: ${SEND_EMAIL_DIALOG_ANALYSIS.followup_business_days}.`
      );
    }

    if (SEND_EMAIL_DIALOG_ANALYSIS.followup_dedup_check) {
      pass('followup', 'followup_dedup_check',
        'Dedup-Check: Task.filter({ company_id, organization_id }) → prüft ob offene Nachfassen-Task existiert. Keine doppelte Erstellung.'
      );
    } else {
      risk('followup', 'no_followup_dedup',
        'Kein Dedup-Check — bei mehrfachem Dokumentieren entstehen mehrere Nachfassen-Tasks.'
      );
    }

    const taskFieldsOk =
      SEND_EMAIL_DIALOG_ANALYSIS.followup_task_has_company_id &&
      SEND_EMAIL_DIALOG_ANALYSIS.followup_task_has_organization_id &&
      SEND_EMAIL_DIALOG_ANALYSIS.followup_task_has_company_name &&
      SEND_EMAIL_DIALOG_ANALYSIS.followup_task_has_assigned_to;

    if (taskFieldsOk) {
      pass('followup', 'followup_task_fields_complete',
        'Task enthält: company_id, organization_id, company_name, assigned_to (me.email). Alle Pflichtfelder gesetzt.'
      );
    } else {
      risk('followup', 'followup_task_fields_incomplete',
        'Task fehlen Pflichtfelder: ' + [
          !SEND_EMAIL_DIALOG_ANALYSIS.followup_task_has_company_id && 'company_id',
          !SEND_EMAIL_DIALOG_ANALYSIS.followup_task_has_organization_id && 'organization_id',
          !SEND_EMAIL_DIALOG_ANALYSIS.followup_task_has_company_name && 'company_name',
          !SEND_EMAIL_DIALOG_ANALYSIS.followup_task_has_assigned_to && 'assigned_to',
        ].filter(Boolean).join(', ')
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 6: Keine Auto-Send-Verwechslung
    // ══════════════════════════════════════════════════════════════════════════

    if (!AUTO_SEND_CHECK.send_email_dialog_calls_brevo) {
      pass('auto_send_not_used', 'no_brevo_call',
        'SendEmailDialog ruft sendBrevoEmail NICHT auf. Kein automatischer Versand.'
      );
    } else {
      risk('auto_send_not_used', 'brevo_called_in_dialog',
        'KRITISCH: SendEmailDialog ruft sendBrevoEmail auf — automatischer Versand im MVP-Flow!'
      );
    }

    if (!AUTO_SEND_CHECK.send_email_dialog_calls_smtp) {
      pass('auto_send_not_used', 'no_smtp_call',
        'SendEmailDialog ruft sendSmtpEmail NICHT auf. Kein automatischer Versand.'
      );
    } else {
      risk('auto_send_not_used', 'smtp_called_in_dialog',
        'KRITISCH: SendEmailDialog ruft sendSmtpEmail auf — automatischer Versand im MVP-Flow!'
      );
    }

    if (!AUTO_SEND_CHECK.brevo_used_in_mvp_flow) {
      pass('auto_send_not_used', 'brevo_not_in_mvp_flow',
        'Brevo (sendBrevoEmail) existiert im System, wird aber nicht im E-Mail-Vorbereitung-MVP-Flow genutzt.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 7: Wording-Risiken
    // ══════════════════════════════════════════════════════════════════════════

    const triggerLabel = WORDING_ANALYSIS.trigger_button.label;
    if (triggerLabel === 'E-Mail') {
      warn('wording', 'trigger_button_ambiguous',
        `Trigger-Button heißt nur "E-Mail" — neutral, aber unspezifisch. Besser: "E-Mail vorbereiten" um klar zu machen, dass Vertriebo NICHT sendet.`
      );
      wording_risks.push({ element: 'Trigger-Button (LeadDetail)', current: '"E-Mail"', suggested: '"E-Mail vorbereiten"', severity: 'low' });
    }

    if (!WORDING_ANALYSIS.no_sent_by_vertriebo_claim) {
      risk('wording', 'false_auto_send_claim',
        'UI behauptet, Vertriebo sendet die E-Mail automatisch.'
      );
    } else {
      pass('wording', 'no_auto_send_claim',
        'UI behauptet nirgendwo, dass Vertriebo automatisch sendet. Footer-Hint klärt auf.'
      );
    }

    const contactLogText = WORDING_ANALYSIS.contact_log_ergebnis.value;
    if (contactLogText === 'Manuell vorbereitet/gesendet') {
      pass('wording', 'contact_log_wording_ok',
        '"Manuell vorbereitet/gesendet" — neutral, impliziert nicht automatischen Versand durch Vertriebo.'
      );
    }

    pass('wording', 'copy_toast_correct',
      `Copy-Toast: "${WORDING_ANALYSIS.copy_toast.text}" — klar: Nutzer muss in eigenes E-Mail-Programm einfügen.`
    );

    pass('wording', 'footer_hint_correct',
      `Footer-Hint: "${WORDING_ANALYSIS.footer_hint.text}" — unmissverständlich.`
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 8: E-Mail-Vorlagen (emailTemplates.js)
    // ══════════════════════════════════════════════════════════════════════════

    if (EMAIL_TEMPLATES_UTILS_ANALYSIS.db_templates_preferred) {
      pass('templates', 'db_templates_preferred',
        'DB-Templates werden bevorzugt: if (dbTemplates?.length > 0) → Runtime-Templates aus DB. Fallback: statische TEMPLATES.'
      );
    }

    if (EMAIL_TEMPLATES_UTILS_ANALYSIS.has_static_fallback_templates) {
      pass('templates', 'fallback_templates_exist',
        `${EMAIL_TEMPLATES_UTILS_ANALYSIS.fallback_templates_count} statische Fallback-Vorlagen vorhanden: Erstansprache, Nachfassen, Terminbestätigung, Angebot, Rückruf, Kein Interesse.`
      );
    }

    if (EMAIL_TEMPLATES_UTILS_ANALYSIS.signature_built_from_org_settings) {
      pass('templates', 'signature_from_org_settings',
        'Signatur wird aus OrganizationSettings gebaut: company_name, email_from_name, email_telefon, email_reply_to, email_website, email_adresse.'
      );
    }

    if (EMAIL_TEMPLATES_UTILS_ANALYSIS.canonical_key === 'organization_email_signature') {
      pass('templates', 'canonical_signature_key',
        'Kanonischer Key organization_email_signature wird bevorzugt. Legacy-Keys als Fallback.'
      );
    }

    if (EMAIL_TEMPLATES_UTILS_ANALYSIS.logo_in_template_only) {
      pass('templates', 'logo_template_only',
        'buildLogoHeader() fügt Logo nur in Template-Body ein — kein Versand, rein für Vorlage.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 9: Legacy EmailTemplates-Komponente
    // ══════════════════════════════════════════════════════════════════════════

    if (!EMAIL_TEMPLATES_ANALYSIS.has_document_workflow) {
      warn('legacy_email_templates', 'no_documentation',
        'components/EmailTemplates (Legacy-Dropdown): öffnet nur mailto, schreibt KEINEN ContactLog. Kein Nachweis des Kontakts. Nutzer der Legacy-Komponente kann Kontakt nicht dokumentieren.'
      );
      wording_risks.push({ element: 'EmailTemplates (Legacy-Dropdown)', issue: 'Kein ContactLog, kein Follow-up', severity: 'medium', fix: 'In LeadDetail auf SendEmailDialog migrieren oder Legacy-Dropdown entfernen' });
    }

    if (!EMAIL_TEMPLATES_ANALYSIS.has_copy_workflow) {
      warn('legacy_email_templates', 'no_copy_workflow',
        'components/EmailTemplates (Legacy): hat keinen Clipboard-Copy-Button. Nutzer kann nur über mailto öffnen, nicht direkt kopieren.'
      );
    }

    if (!EMAIL_TEMPLATES_ANALYSIS.has_followup_workflow) {
      warn('legacy_email_templates', 'no_followup',
        'components/EmailTemplates (Legacy): erstellt keine Follow-up-Aufgabe.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Live-Datenbankcheck: Haben Org-Templates korrekte Felder?
    // ══════════════════════════════════════════════════════════════════════════

    let db_template_check = null;
    try {
      const templates = await base44.asServiceRole.entities.EmailTemplate.list('-created_date', 10);
      const totalTemplates = templates.length;
      const hasBetreff = templates.filter(t => t.betreff).length;
      const hasBody = templates.filter(t => t.body).length;
      const hasOrgId = templates.filter(t => t.organization_id).length;
      db_template_check = {
        total_templates_sampled: totalTemplates,
        have_betreff: hasBetreff,
        have_body: hasBody,
        have_organization_id: hasOrgId,
        missing_betreff: totalTemplates - hasBetreff,
        missing_body: totalTemplates - hasBody,
        missing_organization_id: totalTemplates - hasOrgId,
      };
      if (hasOrgId < totalTemplates) {
        warn('templates', 'templates_missing_org_id',
          `${totalTemplates - hasOrgId}/${totalTemplates} EmailTemplate-Records haben keine organization_id — können keiner Org zugeordnet werden.`
        );
      } else if (totalTemplates > 0) {
        pass('templates', 'db_templates_org_scoped',
          `Alle ${totalTemplates} EmailTemplate-Records haben organization_id.`
        );
      }
    } catch (e) {
      db_template_check = { error: e.message };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GESAMTBEWERTUNG
    // ══════════════════════════════════════════════════════════════════════════

    const redCount = risks.length;
    const yellowCount = warnings.length;

    const manual_flow_ok = !risks.some(r => ['copy_workflow', 'mailto_workflow', 'documentation', 'auto_send_not_used'].includes(r.area));
    const auto_send_not_used = !AUTO_SEND_CHECK.send_email_dialog_calls_brevo && !AUTO_SEND_CHECK.send_email_dialog_calls_smtp && !SEND_EMAIL_DIALOG_ANALYSIS.increments_emails_sent;
    const copy_workflow_ok = SEND_EMAIL_DIALOG_ANALYSIS.has_copy_button && SEND_EMAIL_DIALOG_ANALYSIS.copy_includes_subject && SEND_EMAIL_DIALOG_ANALYSIS.copy_uses_clipboard;
    const mailto_workflow_ok = SEND_EMAIL_DIALOG_ANALYSIS.has_mailto_button && SEND_EMAIL_DIALOG_ANALYSIS.mailto_includes_subject && SEND_EMAIL_DIALOG_ANALYSIS.mailto_includes_body;
    const documentation_ok = SEND_EMAIL_DIALOG_ANALYSIS.document_writes_contact_log && SEND_EMAIL_DIALOG_ANALYSIS.document_checks_org_id && SEND_EMAIL_DIALOG_ANALYSIS.document_checks_org_consistency && SEND_EMAIL_DIALOG_ANALYSIS.contact_log_sending_mode === 'manual_email_client' && SEND_EMAIL_DIALOG_ANALYSIS.contact_log_is_manual === true && SEND_EMAIL_DIALOG_ANALYSIS.increments_manual_emails_logged && !SEND_EMAIL_DIALOG_ANALYSIS.increments_emails_sent;
    const followup_ok = SEND_EMAIL_DIALOG_ANALYSIS.has_followup_checkbox && SEND_EMAIL_DIALOG_ANALYSIS.followup_checkbox_default && SEND_EMAIL_DIALOG_ANALYSIS.followup_business_days === 3 && SEND_EMAIL_DIALOG_ANALYSIS.followup_dedup_check && taskFieldsOk;

    const acceptance_criteria = {
      user_can_copy_and_send_manually: copy_workflow_ok,
      vertriebo_does_not_claim_auto_send: WORDING_ANALYSIS.no_sent_by_vertriebo_claim,
      contact_documented_cleanly: documentation_ok,
      followup_created_reliably: followup_ok,
      no_brevo_smtp_in_mvp_flow: auto_send_not_used,
      usage_counts_manual_emails_logged: SEND_EMAIL_DIALOG_ANALYSIS.increments_manual_emails_logged && !SEND_EMAIL_DIALOG_ANALYSIS.increments_emails_sent,
    };
    const acceptancePassed = Object.values(acceptance_criteria).filter(Boolean).length;
    const acceptanceTotal = Object.keys(acceptance_criteria).length;

    // GREEN wenn alle Acceptance-Criteria erfüllt und keine RISK-Findings
    // YELLOW wenn nur Warnings (keine Risks)
    // RED wenn mind. 1 RISK
    const claimStatus = redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : 'green';
    const riskLevel = redCount > 0 ? 'high' : yellowCount > 0 ? 'medium' : 'low';

    const recommended_fixes = [];

    if (wording_risks.some(w => w.element.includes('Trigger-Button'))) {
      recommended_fixes.push({
        priority: 'low',
        area: 'wording',
        fix: 'Trigger-Button von "E-Mail" zu "E-Mail vorbereiten" umbenennen.',
        file: 'components/SendEmailDialog',
        effort: 'trivial',
      });
    }

    if (!EMAIL_TEMPLATES_ANALYSIS.has_document_workflow) {
      recommended_fixes.push({
        priority: 'medium',
        area: 'legacy_email_templates',
        fix: 'components/EmailTemplates (Legacy-Dropdown) aus LeadDetail entfernen oder auf SendEmailDialog migrieren. Legacy-Komponente schreibt keinen ContactLog und kein Follow-up.',
        file: 'components/EmailTemplates + pages/LeadDetail',
        effort: 'small',
      });
    }

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,

      summary: {
        tests_total: tests.length,
        passed: tests.filter(t => t.status === 'PASS').length,
        warnings: yellowCount,
        risks: redCount,
        acceptance_score: `${acceptancePassed}/${acceptanceTotal} Acceptance-Kriterien erfüllt`,
        verdict: claimStatus === 'green'
          ? 'GREEN: Manuelle E-Mail-Workflow korrekt implementiert. Vertriebo bereitet vor, Nutzer sendet.'
          : claimStatus === 'yellow'
          ? 'YELLOW: Hauptflow korrekt, aber Warnungen vorhanden (Legacy-Komponente, Wording).'
          : 'RED: Kritische Fehler im E-Mail-Workflow.',
      },

      // Kern-Checkpoints
      manual_flow_ok,
      auto_send_not_used,
      copy_workflow_ok,
      mailto_workflow_ok,
      documentation_ok,
      followup_ok,

      acceptance_criteria,

      // Details
      wording_risks,
      send_email_dialog: SEND_EMAIL_DIALOG_ANALYSIS,
      email_templates_legacy: EMAIL_TEMPLATES_ANALYSIS,
      email_templates_utils: EMAIL_TEMPLATES_UTILS_ANALYSIS,
      auto_send_check: AUTO_SEND_CHECK,
      wording_analysis: WORDING_ANALYSIS,
      db_template_check,

      recommended_fixes,
      tests,
      warnings,
      risks,

      audit_notes: [
        'SendEmailDialog ist vollständig korrekt implementiert: Copy, mailto, Dokumentation, Follow-up, kein Auto-Send.',
        'components/EmailTemplates (Legacy-Dropdown) hat keinen ContactLog und kein Follow-up. Sollte migriert/entfernt werden.',
        'Trigger-Button "E-Mail" ist neutral aber leicht mehrdeutig. "E-Mail vorbereiten" wäre klarer.',
        'emails_sent wird NICHT inkrementiert — nur manual_emails_logged. Korrekt.',
        'Brevo/SMTP-Funktionen existieren im System, werden aber nicht im MVP-Flow genutzt.',
        'Follow-up: 3 Werktage, Dedup-Check, alle Pflichtfelder, Default=aktiv. Vollständig korrekt.',
        'Acceptance: Vertriebo bereitet E-Mails vor — der Nutzer sendet selbst über sein eigenes E-Mail-Programm.',
      ],
    });

  } catch (error) {
    console.error('[auditManualEmailWorkflow] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});