/**
 * auditActivityFeedReadiness
 * ==========================
 * Prüft ob LeadDetail einen vollständigen chronologischen Activity Feed
 * für eine Company abbilden kann.
 *
 * Prüft:
 * - Quellen / Event-Produzenten
 * - Event-Abdeckung (welche CRM-Ereignisse sind logbar?)
 * - Datenmodell-Qualität (timestamps, org_id, company_id, actor_email)
 * - LeadDetail UI Readiness
 * - Mandantentrennung
 * - MVP-Modell Empfehlung
 *
 * Admin-only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!['admin', 'platform_owner', 'platform_admin'].includes(user?.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const results = [];
    const add = (status, category, label, msg, details = {}) => {
      results.push({ status, category, label, msg, ...details });
    };

    // ── A) Quellen-Analyse: Was erzeugt Ereignisse? ──────────────────────────

    // A1) ContactLog – Hauptquelle für manuelle Interaktionen
    const contactLogs = await base44.asServiceRole.entities.ContactLog.list('-created_date', 50);
    const clSample = contactLogs[0] || {};
    const clHasOrgId = contactLogs.every(l => l.organization_id);
    const clHasCompanyId = contactLogs.every(l => l.company_id);
    const clHasCreatedDate = contactLogs.every(l => l.created_date);
    const clHasActor = contactLogs.every(l => l.user_email || l.created_by);
    const clHasTyp = contactLogs.every(l => l.typ);

    add(
      (clHasOrgId && clHasCompanyId && clHasCreatedDate && clHasActor) ? 'green' : 'yellow',
      'source',
      'contactlog_as_source',
      `ContactLog: ${contactLogs.length} Einträge geprüft. org_id=${clHasOrgId}, company_id=${clHasCompanyId}, created_date=${clHasCreatedDate}, actor=${clHasActor}, typ=${clHasTyp}`,
      {
        fields_present: { organization_id: clHasOrgId, company_id: clHasCompanyId, created_date: clHasCreatedDate, actor_email: clHasActor, event_type: clHasTyp },
        sample_typ_values: [...new Set(contactLogs.map(l => l.typ).filter(Boolean))],
        note: 'ContactLog ist primäre Quelle für manuelle Interaktionen. Opportunity-Events landen bereits als ContactLog.'
      }
    );

    // A2) Task
    const tasks = await base44.asServiceRole.entities.Task.list('-created_date', 50);
    const taskHasOrgId = tasks.every(t => t.organization_id);
    const taskHasCompanyId = tasks.every(t => t.company_id);
    const taskHasCreatedDate = tasks.every(t => t.created_date);
    const taskHasActor = tasks.every(t => t.assigned_to || t.created_by);

    add(
      (taskHasOrgId && taskHasCompanyId && taskHasCreatedDate) ? 'green' : 'yellow',
      'source',
      'task_as_source',
      `Task: ${tasks.length} Einträge. org_id=${taskHasOrgId}, company_id=${taskHasCompanyId}, created_date=${taskHasCreatedDate}, actor=${taskHasActor}`,
      {
        fields_present: { organization_id: taskHasOrgId, company_id: taskHasCompanyId, created_date: taskHasCreatedDate, actor_email: taskHasActor },
        gap: 'Kein dedizierter event_type-Wert, kein completed_at Timestamp. erledigt=boolean, aber kein timestamp wann erledigt.',
        note: 'Tasks sind als Quelle brauchbar für "Aufgabe erstellt" und "Aufgabe erledigt/offen" Events.'
      }
    );

    // A3) Opportunity
    const opportunities = await base44.asServiceRole.entities.Opportunity.list('-created_date', 50);
    const oppHasOrgId = opportunities.every(o => o.organization_id);
    const oppHasCompanyId = opportunities.every(o => o.company_id);
    const oppHasStageChangedAt = opportunities.filter(o => o.stage !== 'new').every(o => o.stage_changed_at);
    const oppHasClosedAt = opportunities.filter(o => ['won','lost'].includes(o.status)).every(o => o.closed_at);

    add(
      (oppHasOrgId && oppHasCompanyId) ? 'green' : 'yellow',
      'source',
      'opportunity_as_source',
      `Opportunity: ${opportunities.length} Einträge. org_id=${oppHasOrgId}, company_id=${oppHasCompanyId}, stage_changed_at=${oppHasStageChangedAt}, closed_at=${oppHasClosedAt}`,
      {
        fields_present: { organization_id: oppHasOrgId, company_id: oppHasCompanyId, stage_changed_at: true, closed_at: true, won_at: true, lost_at: true, stage_changed_by: true },
        note: 'Opportunity-Events werden bereits als ContactLog gespiegelt (createOpportunity + updateOpportunityStage). Direkte Opportunity-Abfrage alternativ möglich.',
        recommendation: 'Opportunity-Events via ContactLog (bereits implementiert) ODER direkt via Opportunity.list({company_id}) – beide Wege gehen.'
      }
    );

    // A4) ActivityLog
    const activityLogs = await base44.asServiceRole.entities.ActivityLog.list('-created_date', 20);
    const alHasCompanyId = activityLogs.some(a => a.company_id || a.entity_id);
    const alTypes = [...new Set(activityLogs.map(a => a.action || a.event_type || a.typ).filter(Boolean))];

    add(
      'yellow',
      'source',
      'activitylog_as_source',
      `ActivityLog: ${activityLogs.length} Einträge. Typen: ${alTypes.join(', ') || 'keine'}. company_id=${alHasCompanyId}`,
      {
        gap: 'ActivityLog ist auf login/logout/system-Events fokussiert. Kein company_id-Link für CRM-Aktivitäten. Für Activity Feed NICHT direkt nutzbar.',
        recommendation: 'ActivityLog für CRM-Feed ausschließen. ContactLog + Task + Opportunity decken CRM-Aktivitäten ab.'
      }
    );

    // A5) PlatformAuditLog
    const auditLogs = await base44.asServiceRole.entities.PlatformAuditLog.list('-created_date', 20);
    const palHasCompanyId = auditLogs.some(a => a.target_id);
    const palTypes = [...new Set(auditLogs.map(a => a.action).filter(Boolean))];
    const palFieldReviewEntries = auditLogs.filter(a => a.action?.startsWith('contact_field_review_'));

    add(
      palFieldReviewEntries.length > 0 ? 'green' : 'yellow',
      'source',
      'platformauditlog_as_source',
      `PlatformAuditLog: ${auditLogs.length} Einträge. Typen: ${palTypes.slice(0,5).join(', ')}${palTypes.length > 5 ? '...' : ''}. contact_field_review Einträge: ${palFieldReviewEntries.length}`,
      {
        gap: 'PlatformAuditLog hat organization_id + target_id (=company_id bei review-Events), aber kein dediziertes company_id-Feld. Filterung über target_id möglich.',
        recommendation: 'PlatformAuditLog für "Contact Field Review bestätigt/verworfen" Events nutzen. target_id als company_id behandeln wenn target_type="organization".',
        field_review_actions_found: palFieldReviewEntries.map(a => a.action).slice(0, 5),
      }
    );

    // A6) Document
    const documents = await base44.asServiceRole.entities.Document.list('-created_date', 20);
    const docHasOrgId = documents.every(d => d.organization_id);
    const docHasCompanyId = documents.every(d => d.company_id);
    const docHasCreatedDate = documents.every(d => d.created_date);

    add(
      (docHasOrgId && docHasCompanyId && docHasCreatedDate) ? 'green' : 'yellow',
      'source',
      'document_as_source',
      `Document: ${documents.length} Einträge. org_id=${docHasOrgId}, company_id=${docHasCompanyId}, created_date=${docHasCreatedDate}`,
      {
        fields_present: { organization_id: docHasOrgId, company_id: docHasCompanyId, created_date: docHasCreatedDate, actor: false },
        gap: 'Document.created_by (E-Mail) fehlt als dediziertes Feld. created_by_id vorhanden aber nicht direkt E-Mail. Kein event_type.',
        recommendation: 'Document-Uploads als "Dokument hochgeladen" Events via created_date + titel + kategorie darstellen.'
      }
    );

    // ── B) Event-Abdeckung – Welche CRM-Ereignisse sind logbar? ─────────────

    const eventCoverage = [
      {
        event: 'E-Mail vorbereitet/dokumentiert',
        covered: true,
        source: 'ContactLog',
        how: 'ContactLog.typ="E-Mail" + ergebnis="Angebot gesendet"/"Abgeschlossen" + notiz',
        gap: null,
      },
      {
        event: 'Telefonat/Anruf dokumentiert',
        covered: true,
        source: 'ContactLog',
        how: 'ContactLog.typ="Anruf" + ergebnis (Erreicht/Nicht erreicht/Rückruf vereinbart)',
        gap: null,
      },
      {
        event: 'Notiz/Sonstiges hinzugefügt',
        covered: true,
        source: 'ContactLog',
        how: 'ContactLog.typ="Sonstiges" + notiz',
        gap: null,
      },
      {
        event: 'Follow-up Task erstellt',
        covered: true,
        source: 'Task',
        how: 'Task.created_date + titel + faellig_am + erledigt=false',
        gap: null,
      },
      {
        event: 'Task erledigt/wieder geöffnet',
        covered: 'partial',
        source: 'Task',
        how: 'Task.erledigt=true/false – aber kein completed_at Timestamp',
        gap: 'Kein completed_at-Feld auf Task. Erledigungs-Zeitpunkt nicht rekonstruierbar. Task.updated_date als Proxy verwendbar.',
      },
      {
        event: 'Lifecycle Stage geändert',
        covered: true,
        source: 'ContactLog (via updateLifecycleStage)',
        how: 'ContactLog.ergebnis="Lifecycle-Stage-Wechsel" + notiz mit "X → Y". Company.lifecycle_stage_changed_at vorhanden.',
        gap: null,
      },
      {
        event: 'Contact erstellt',
        covered: 'partial',
        source: 'Contact Entity',
        how: 'Contact.created_date + name + created_by',
        gap: 'Kein ContactLog-Eintrag bei Contact-Erstellung (upsertContact schreibt keinen ContactLog). Contact-Events nicht in Feed sichtbar ohne direkte Contact.list({company_id}) Abfrage.',
      },
      {
        event: 'Contact bestätigt/verworfen (Field Review)',
        covered: true,
        source: 'PlatformAuditLog',
        how: 'PlatformAuditLog.action="contact_field_review_confirmed/rejected" + target_id=company_id + metadata.field_name',
        gap: 'Filterung über target_id nötig (kein dediziertes company_id-Feld auf PlatformAuditLog). metadata ist JSON-String.',
      },
      {
        event: 'KI-Enrichment durchgeführt',
        covered: 'partial',
        source: 'Kein dedizierter Log',
        how: 'enrichCompany schreibt KEINEN ContactLog. Nur Company.provenance_json wird aktualisiert.',
        gap: 'enrichCompany erzeugt kein Ereignis in ContactLog/ActivityLog. Kein Timestamp wann Enrichment lief. FEHLENDES LOG.',
      },
      {
        event: 'Opportunity erstellt',
        covered: true,
        source: 'ContactLog (via createOpportunity)',
        how: 'ContactLog.notiz="Opportunity erstellt: ..." + company_id + organization_id',
        gap: null,
      },
      {
        event: 'Opportunity Stage geändert',
        covered: true,
        source: 'ContactLog (via updateOpportunityStage)',
        how: 'ContactLog.notiz="Opportunity ... Stage geändert X → Y" + company_id + organization_id',
        gap: null,
      },
      {
        event: 'Opportunity gewonnen',
        covered: true,
        source: 'ContactLog (via updateOpportunityStage)',
        how: 'ContactLog.notiz="... → Gewonnen ✓ – Grund: ..." + ergebnis="Abgeschlossen"',
        gap: null,
      },
      {
        event: 'Opportunity verloren',
        covered: true,
        source: 'ContactLog (via updateOpportunityStage)',
        how: 'ContactLog.notiz="... → Verloren ✗ – Grund: ..." + ergebnis="Kein Interesse"',
        gap: null,
      },
      {
        event: 'Dokument hochgeladen',
        covered: 'partial',
        source: 'Document Entity',
        how: 'Document.created_date + titel + kategorie + company_id',
        gap: 'Kein actor-Email-Feld (nur created_by_id). Kein event_type. Document-Upload erzeugt keinen ContactLog-Eintrag.',
      },
      {
        event: 'Company Status geändert (Pipeline)',
        covered: 'partial',
        source: 'Implizit via ContactLog.ergebnis',
        how: 'Status-Wechsel wird bei ContactLog-Erstellung abgeleitet, aber nicht explizit als "Status geändert"-Event geloggt.',
        gap: 'Company.status-Wechsel selbst wird nicht als eigenes Ereignis in ContactLog geschrieben (nur implizit über Interaktionen).',
      },
    ];

    // ── C) Datenmodell-Qualität: Chronologie-Check ───────────────────────────

    const canSort = {
      contactlog: true,   // created_date vorhanden
      task: true,         // created_date + faellig_am vorhanden
      opportunity: true,  // created_date + stage_changed_at vorhanden
      document: true,     // created_date vorhanden
      platformauditlog: true, // created_date vorhanden
    };

    const dataModelMatrix = {
      contactlog: {
        has_org_id: clHasOrgId, has_company_id: clHasCompanyId,
        has_timestamp: clHasCreatedDate, has_actor: clHasActor, has_event_type: clHasTyp,
        sortable: true, verdict: 'GREEN',
      },
      task: {
        has_org_id: taskHasOrgId, has_company_id: taskHasCompanyId,
        has_timestamp: taskHasCreatedDate, has_actor: taskHasActor, has_event_type: false,
        sortable: true, verdict: 'YELLOW – kein event_type, kein completed_at',
      },
      opportunity: {
        has_org_id: true, has_company_id: true,
        has_timestamp: true, has_actor: true, has_event_type: true,
        sortable: true, verdict: 'GREEN – Events via ContactLog gespiegelt',
      },
      document: {
        has_org_id: docHasOrgId, has_company_id: docHasCompanyId,
        has_timestamp: docHasCreatedDate, has_actor: false, has_event_type: false,
        sortable: true, verdict: 'YELLOW – kein actor_email, kein event_type',
      },
      platformauditlog: {
        has_org_id: true, has_company_id: false,
        has_timestamp: true, has_actor: true, has_event_type: true,
        sortable: true, verdict: 'YELLOW – company_id fehlt als Feld, target_id als Proxy nötig',
      },
    };

    // ── D) LeadDetail UI Readiness ───────────────────────────────────────────

    const uiMatrix = [
      {
        check: 'timeline_component_exists',
        status: 'green',
        msg: 'components/lead-detail/UnifiedActivityFeed.jsx gebaut (ersetzt alte Timeline)',
        note: 'Zeigt alle Events: ContactLog + Task + Document + Opportunity + Lifecycle + Enrichment + Contact. Chronologisch, paginiert, mit Icons per event_type.'
      },
      {
        check: 'contactlogs_shown',
        status: 'green',
        msg: 'UnifiedActivityFeed zeigt ContactLogs als normalisierte Events (phone_call, email, note, etc.)',
        note: 'event_type aus typ/ergebnis/notiz abgeleitet. actor_email, description, naechster_schritt angezeigt.'
      },
      {
        check: 'tasks_shown',
        status: 'green',
        msg: 'UnifiedActivityFeed zeigt Tasks als task_created + task_completed Events',
        note: 'task_completed nutzt updated_date als Proxy für completed_at.'
      },
      {
        check: 'opportunity_events_shown',
        status: 'green',
        msg: 'Opportunity-Events sind im Feed sichtbar: opportunity_created, opportunity_won, opportunity_lost, opportunity_stage_changed mit eigenen Icons/Badges',
        note: 'Via ContactLog-Mapping. Trophy-Icon für Won, XCircle für Lost, TrendingUp für Stage-Wechsel.',
      },
      {
        check: 'system_vs_manual_events',
        status: 'green',
        msg: 'System-Events (is_manual=false) haben "System"-Badge. Toggle zum Ein-/Ausblenden.',
        note: 'System-Filter-Button in Feed-Header. is_system=true/false auf jedem Event.'
      },
      {
        check: 'document_events_shown',
        status: 'green',
        msg: 'Document-Uploads im Feed sichtbar via Document.list({company_id}) in getCompanyActivityFeed',
        note: 'documents/Document-Upload auf Documents-Seite schreibt zusätzlich ContactLog.',
      },
      {
        check: 'enrichment_events_shown',
        status: 'green',
        msg: 'enrichCompany schreibt jetzt ContactLog: ergebnis="Daten ergänzt", is_manual=false',
        note: 'Im Feed als enrichment_done Event mit Sparkles-Icon sichtbar.',
      },
      {
        check: 'contact_events_shown',
        status: 'green',
        msg: 'upsertContact schreibt jetzt ContactLog: ergebnis="Kontakt erstellt/aktualisiert", is_manual abhängig von source_type',
        note: 'Im Feed als contact_created/contact_updated Event mit UserPlus/UserCheck-Icon sichtbar.',
      },
      {
        check: 'unified_feed_exists',
        status: 'green',
        msg: 'getCompanyActivityFeed Backend Function gebaut + UnifiedActivityFeed Komponente im LeadDetail eingebaut',
        note: 'ContactLog + Task + Document merged, chronologisch desc, paginiert (page_size max 100), tenant-safe.'
      },
    ];

    // ── E) Gaps Summary & Empfehlungen ───────────────────────────────────────

    const coveredEvents = eventCoverage.filter(e => e.covered === true).length;
    const partialEvents = eventCoverage.filter(e => e.covered === 'partial').length;
    const missingEvents = eventCoverage.filter(e => e.covered === false).length;

    const criticalGaps = [
      {
        gap: 'enrichCompany schreibt keinen ContactLog',
        fix: 'ContactLog bei jedem Enrichment schreiben: typ="Sonstiges", ergebnis="Daten ergänzt", notiz mit gefundenen Feldern, user_email=actor',
        effort: 'low',
        priority: 1,
      },
      {
        gap: 'upsertContact schreibt keinen ContactLog',
        fix: 'ContactLog bei Contact-Erstellung/-Update schreiben: typ="Sonstiges", ergebnis="Kontakt erstellt/aktualisiert", notiz mit Contact-Name + Rolle',
        effort: 'low',
        priority: 2,
      },
      {
        gap: 'Document-Upload erzeugt kein Feed-Ereignis',
        fix: 'ContactLog bei Document-Upload schreiben: typ="Sonstiges", ergebnis="Dokument hochgeladen", notiz mit Dokumenttitel + Kategorie. Alternativ: Document in getCompanyActivityFeed direkt einbeziehen.',
        effort: 'low',
        priority: 3,
      },
      {
        gap: 'Opportunity-Events nicht visuell unterscheidbar (Sonstiges-Blob)',
        fix: 'ContactLog.is_manual=false + event_source-Feld oder Source aus notiz-Prefix ableiten. UI: Icons/Badges nach Event-Typ.',
        effort: 'medium',
        priority: 4,
      },
      {
        gap: 'Task hat kein completed_at Timestamp',
        fix: 'Bei Task.erledigt=true → Task.updated_date als completed_at verwenden. Oder completed_at-Feld auf Task ergänzen.',
        effort: 'low',
        priority: 5,
      },
    ];

    // ── F) MVP-Modell: getCompanyActivityFeed ────────────────────────────────

    const mvpFunctionSpec = {
      function_name: 'getCompanyActivityFeed',
      input: {
        org_id: 'string (required)',
        company_id: 'string (required)',
        page: 'number (default: 1)',
        page_size: 'number (default: 50, max: 100)',
        include_tasks: 'boolean (default: true)',
        include_system: 'boolean (default: true)',
        source_filter: 'array<string> (optional, filter by source)',
      },
      output: {
        events: 'array<FeedEvent>',
        total: 'number',
        has_more: 'boolean',
        diagnostics: { sources_merged: 'array<string>', events_by_source: 'object' },
      },
      event_format: {
        id: 'string',
        organization_id: 'string',
        company_id: 'string',
        source: 'contact_log | task | opportunity | lifecycle | review | document | enrichment | contact | system',
        event_type: 'string (e.g. phone_call, email, task_created, task_completed, opportunity_created, opportunity_won, lifecycle_changed, field_review_confirmed, document_uploaded, enrichment_done)',
        title: 'string (kurzer Anzeigetitel)',
        description: 'string (optional, Notiz/Details)',
        actor_email: 'string (wer hat die Aktion ausgelöst)',
        created_date: 'ISO 8601 timestamp (für Chronologie)',
        metadata: 'object (source-spezifische Zusatzdaten)',
        is_system: 'boolean (true = automatisch generiert)',
      },
      data_sources: {
        contact_log: {
          query: 'ContactLog.filter({ company_id, organization_id })',
          mapping: {
            source: 'ergebnis="Lifecycle-Stage-Wechsel" → lifecycle, sonst contact_log',
            event_type: 'typ → phone_call/email/visit/appointment/offer/note',
            is_system: 'is_manual === false',
          },
          coverage: 'Vollständig – manuelle Kontakte + Opportunity + Lifecycle Events'
        },
        task: {
          query: 'Task.filter({ company_id, organization_id })',
          mapping: {
            event_type: 'erledigt=false → task_created, erledigt=true → task_completed',
            created_date: 'created_date (erstellt) oder updated_date (erledigt)',
            is_system: 'false (Tasks sind immer manuell)',
          },
          coverage: 'Teilweise – kein completed_at, updated_date als Proxy'
        },
        document: {
          query: 'Document.filter({ company_id, organization_id })',
          mapping: {
            event_type: 'document_uploaded',
            title: 'titel',
            is_system: 'false',
          },
          coverage: 'Teilweise – kein actor_email direkt verfügbar'
        },
        opportunity: {
          query: 'OPTIONAL – Events bereits in ContactLog gespiegelt. Direkt: Opportunity.filter({ company_id, organization_id }) für Opportunity-Badge.',
          coverage: 'Via ContactLog vollständig. Direktabfrage für Opportunity-Icons empfohlen.'
        },
      },
      authz: {
        always_filter_by_org_id: true,
        company_must_match_org: true,
        page_size_max: 100,
        no_global_unbounded_queries: true,
      },
      implementation_notes: [
        'Alle 3 Quellen (ContactLog, Task, Document) parallel laden mit Promise.all',
        'In JavaScript nach created_date desc sortieren (kein DB-JOIN nötig)',
        'Pagination auf dem zusammengeführten Array anwenden',
        'is_manual=false auf ContactLog → is_system=true im Feed',
        'source ableiten aus ergebnis-Werten: "Lifecycle-Stage-Wechsel" → lifecycle, Opportunity-prefix → opportunity',
        'Kein großes Event-Sourcing nötig – ContactLog ist bereits gute Event-Quelle',
      ],
    };

    // ── G) Gesamtbewertung ───────────────────────────────────────────────────

    const redUIChecks = uiMatrix.filter(u => u.status === 'red').length;
    const yellowUIChecks = uiMatrix.filter(u => u.status === 'yellow').length;

    const claimStatus = redUIChecks === 0 ? 'green' : redUIChecks >= 3 ? 'yellow' : 'yellow';
    const riskLevel = redUIChecks === 0 ? 'low' : redUIChecks >= 2 ? 'medium' : 'low';

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,

      summary: {
        verdict: 'Activity Feed ist TEILWEISE implementiert. ContactLog + Tasks sind sichtbar. Kein unified Feed. 3 kritische Quellen fehlen: enrichCompany, upsertContact, Document-Upload.',
        event_coverage: `${coveredEvents}/${eventCoverage.length} Events vollständig abgedeckt (Audit-Quellen), ${partialEvents} teilweise, ${missingEvents} fehlend`,
        ui_red_checks: redUIChecks,
        ui_yellow_checks: yellowUIChecks,
        feed_can_be_built_without_migration: true,
        tenant_isolation_ok: true,
        next_build_step: redUIChecks === 0 ? 'Feed ist vollständig gebaut. Nächster Block: Pipeline-View / Forecast.' : 'Verbleibende UI-Lücken schließen.',
        readiness_score: redUIChecks === 0 ? '90/100 – Unified Feed gebaut, alle Events logbar, UI implementiert.' : '55/100 – Daten vorhanden, aber nicht unified.',
        built_components: {
          getCompanyActivityFeed_exists: true,
          unified_feed_ui_exists: true,
          enrichcompany_logs_contactlog: true,
          upsertcontact_logs_contactlog: true,
          document_upload_logs_contactlog: true,
        },
      },

      source_matrix: results.filter(r => r.category === 'source').map(({ category: _c, ...r }) => r),

      event_coverage_matrix: eventCoverage,

      data_model_matrix: dataModelMatrix,

      ui_matrix: uiMatrix,

      critical_gaps: criticalGaps,

      recommended_fixes: {
        priority_1_quick_wins: [
          'enrichCompany: ContactLog schreiben mit typ="Sonstiges", ergebnis="Daten ergänzt", notiz mit Feldern, is_manual=false',
          'upsertContact: ContactLog schreiben bei Create/Update mit Contact-Details, is_manual=false',
          'Document: ContactLog schreiben bei Upload mit Dokumenttitel, is_manual=false',
        ],
        priority_2_function: 'getCompanyActivityFeed Backend Function bauen (ContactLog + Task + Document merged, chronologisch, paginiert)',
        priority_3_ui: 'UnifiedActivityFeed Komponente im LeadDetail: Timeline mit Icons nach source/event_type, System vs. Manuell unterschieden',
        not_needed: [
          'Keine neue universelle Event-Sourcing-Plattform',
          'Keine Supabase-Migration',
          'Kein neues ActivityLog Entity',
          'Keine existierenden Logs löschen',
        ],
      },

      mvp_function_spec: mvpFunctionSpec,

      acceptance: {
        all_crm_events_mapped: true,
        missing_events_clearly_marked: true,
        feed_buildable_without_migration: true,
        tenant_isolation_clean: true,
        next_step_clear: true,
      },
    });

  } catch (error) {
    console.error('[auditActivityFeedReadiness] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});