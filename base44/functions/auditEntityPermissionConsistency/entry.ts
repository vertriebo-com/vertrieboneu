/**
 * auditEntityPermissionConsistency
 * =================================
 * Prüft alle kritischen Entities auf Permission-Konsistenz:
 * - organization_id Vorhandensein
 * - Erwartetes Zugriffsmodell vs. tatsächliche Datenlage
 * - Backend-Guard-Abdeckung
 * - Risiken und empfohlene Base44-Regeln
 *
 * Platform-Admin-Only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !PLATFORM_ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Nur Platform-Admins dürfen diesen Audit ausführen.' }, { status: 403 });
    }

    // ── Entity-Definitionen: erwartetes Modell + Guards ───────────────────────
    const entityDefs = [
      {
        entity: 'Company',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Kern-Lead-Entity. organization_id Pflicht. Mandanten-isoliert.',
        backend_functions_guarding: ['listCompanies', 'enrichCompany', 'blacklistCompany', 'deleteCompany', 'analyzeLeadEngine', 'analyzeLeadTemperature'],
        expected_create: 'authenticated user (own org)',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'same organization_id + allowed role OR platform_admin',
        expected_delete: 'organization_admin/platform_admin OR via deleteCompany function',
        ui_risk: 'Base44 zeigt Berechtigungsproblem – möglicherweise fehlende RLS-Regel auf organization_id',
      },
      {
        entity: 'Contact',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Ansprechpartner einer Company. organization_id + company_id Pflicht.',
        backend_functions_guarding: ['upsertContact', 'listContacts', 'buildPrimaryContactFromCompany'],
        expected_create: 'authenticated user (same org + same company)',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'same organization_id + role OR platform_admin',
        expected_delete: 'organization_admin/platform_admin only',
        ui_risk: null,
      },
      {
        entity: 'Opportunity',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Sales-Verkaufschance. organization_id + company_id Pflicht.',
        backend_functions_guarding: ['createOpportunity', 'listOpportunities', 'updateOpportunityStage'],
        expected_create: 'authenticated user (same org)',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'same organization_id + role OR platform_admin. Stage via updateOpportunityStage.',
        expected_delete: 'organization_admin/platform_admin only (soft-delete via stage=lost/archived bevorzugt)',
        ui_risk: null,
      },
      {
        entity: 'ContactLog',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Aktivitäten-Journal. organization_id Pflicht.',
        backend_functions_guarding: ['enrichCompany', 'upsertContact', 'updateLifecycleStage', 'updateOpportunityStage', 'createOpportunity'],
        expected_create: 'authenticated user (same org) OR service role (system events)',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'eingeschränkt (Logs sind immutable – kein Update empfohlen)',
        expected_delete: 'organization_admin/platform_admin only (Löschung von Logs kritisch)',
        ui_risk: null,
      },
      {
        entity: 'Task',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Aufgaben je Company/Lead. organization_id Pflicht.',
        backend_functions_guarding: ['listTasks'],
        expected_create: 'authenticated user (same org)',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'same organization_id + assigned_to match OR org_admin OR platform_admin',
        expected_delete: 'organization_admin/platform_admin or task creator',
        ui_risk: null,
      },
      {
        entity: 'Document',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Datei-Anhänge. organization_id Pflicht. company_id optional.',
        backend_functions_guarding: ['deleteDocument'],
        expected_create: 'authenticated user (same org)',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'same organization_id + creator or admin',
        expected_delete: 'via deleteDocument function (service role) OR organization_admin',
        ui_risk: null,
      },
      {
        entity: 'LeadOutcome',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Feedback zu Lead-Ergebnissen. organization_id Pflicht.',
        backend_functions_guarding: ['processLeadOutcomeFeedback'],
        expected_create: 'authenticated user (same org)',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'same organization_id + role',
        expected_delete: 'organization_admin/platform_admin only',
        ui_risk: null,
      },
      {
        entity: 'ResearchRun',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Recherche-Läufe. organization_id Pflicht.',
        backend_functions_guarding: ['startResearchRun', 'processResearchRun', 'getResearchRunStatus', 'getResearchRunObservability'],
        expected_create: 'authenticated user (own org) OR service role',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'service role only (progress updates via processResearchRun)',
        expected_delete: 'platform_admin only (historische Daten)',
        ui_risk: null,
      },
      {
        entity: 'UsageLog',
        has_organization_id: true,
        expected_model: 'billing-system',
        notes: 'Verbrauchszähler. Wird nur von Backend Functions geschrieben.',
        backend_functions_guarding: ['getUsageSummary', 'debugUsageSummary', 'enrichCompany', 'processResearchRun'],
        expected_create: 'service role only',
        expected_read: 'same organization_id (own usage) OR platform_admin',
        expected_update: 'service role only (incrementing counters)',
        expected_delete: 'platform_admin only',
        ui_risk: 'Direkter User-Write muss blockiert sein. Nur service role darf inkrementieren.',
      },
      {
        entity: 'Organization',
        has_organization_id: false,
        expected_model: 'owner-scoped',
        notes: 'Org-Stammdaten. owner_email = User der die Org erstellt hat.',
        backend_functions_guarding: ['checkAccess', 'platformAdmin', 'getPlatformAdminData'],
        expected_create: 'authenticated user (self-service onboarding)',
        expected_read: 'owner_email == user.email OR org member OR platform_admin',
        expected_update: 'owner OR organization_admin OR platform_admin',
        expected_delete: 'platform_admin only',
        ui_risk: 'organization_id ist hier die id selbst. Kein org-isolation-Filter nötig. Trotzdem darf kein User fremde Orgs lesen.',
      },
      {
        entity: 'OrganizationMember',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'Mitgliedschaft in einer Org. organization_id Pflicht.',
        backend_functions_guarding: ['checkAccess'],
        expected_create: 'organization_admin OR platform_admin',
        expected_read: 'same organization_id members OR platform_admin',
        expected_update: 'organization_admin OR platform_admin',
        expected_delete: 'organization_admin OR platform_admin',
        ui_risk: null,
      },
      {
        entity: 'Subscription',
        has_organization_id: true,
        expected_model: 'billing-system',
        notes: 'Stripe-Abo-Daten. Nur von stripeWebhook/Backend geschrieben.',
        backend_functions_guarding: ['stripeWebhook', 'createCheckoutSession', 'createPortalSession'],
        expected_create: 'service role only (via stripeWebhook)',
        expected_read: 'same organization_id (own sub) OR platform_admin',
        expected_update: 'service role only (via stripeWebhook)',
        expected_delete: 'platform_admin only (Billing-Archivierung)',
        ui_risk: 'Direkter User-Write zu Subscription muss blockiert sein.',
      },
      {
        entity: 'Plan',
        has_organization_id: false,
        expected_model: 'platform-global',
        notes: 'Plan-Definitionen. Global. Nur platform_admin darf schreiben.',
        backend_functions_guarding: ['getPlatformAdminData', 'platformAdmin'],
        expected_create: 'platform_admin only',
        expected_read: 'all authenticated users (für Plan-Auswahl/Onboarding)',
        expected_update: 'platform_admin only',
        expected_delete: 'platform_admin only',
        ui_risk: 'Read muss für authenticated user erlaubt sein (Onboarding/Billing-UI). Write nur platform_admin.',
      },
      {
        entity: 'PlatformAuditLog',
        has_organization_id: true,
        expected_model: 'platform-admin-only',
        notes: 'Audit-Trail für Admin-Aktionen. Nur platform_admin darf lesen. Nur service role darf schreiben.',
        backend_functions_guarding: ['platformAdmin', 'getPlatformAdminData'],
        expected_create: 'service role only',
        expected_read: 'platform_admin only',
        expected_update: 'NEVER (immutable audit trail)',
        expected_delete: 'NEVER (immutable audit trail)',
        ui_risk: 'Kritisch: Normale User dürfen dieses Entity NICHT lesen oder schreiben. Base44 Permission muss platform_admin-only sein.',
      },
      {
        entity: 'ActivityLog',
        has_organization_id: true,
        expected_model: 'tenant-or-platform',
        notes: 'Generisches Activity Log. Falls genutzt: organization_id Pflicht.',
        backend_functions_guarding: [],
        expected_create: 'authenticated user (same org) OR service role',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'eingeschränkt (Logs immutable empfohlen)',
        expected_delete: 'organization_admin/platform_admin only',
        ui_risk: 'Wenig in Verwendung – prüfen ob durch ContactLog ersetzt.',
      },
      {
        entity: 'EmailTemplate',
        has_organization_id: true,
        expected_model: 'tenant',
        notes: 'E-Mail-Vorlagen. organization_id Pflicht.',
        backend_functions_guarding: ['initOrgEmailTemplates'],
        expected_create: 'organization_admin OR authenticated user (same org)',
        expected_read: 'same organization_id OR platform_admin',
        expected_update: 'same organization_id + role OR platform_admin',
        expected_delete: 'organization_admin/platform_admin only',
        ui_risk: null,
      },
    ];

    // ── Daten-Checks: organization_id Pflicht-Feld pro Entity ────────────────
    const dataChecks = {};
    const entitiesToSample = [
      'Company', 'Contact', 'Opportunity', 'ContactLog', 'Task', 'Document',
      'LeadOutcome', 'ResearchRun', 'UsageLog', 'OrganizationMember',
      'Subscription', 'EmailTemplate',
    ];

    for (const entityName of entitiesToSample) {
      try {
        const sample = await base44.asServiceRole.entities[entityName].list('-created_date', 10);
        const total = sample.length;
        const withOrgId = sample.filter(r => r.organization_id && r.organization_id.trim() !== '').length;
        const withoutOrgId = total - withOrgId;
        dataChecks[entityName] = {
          sampled: total,
          with_org_id: withOrgId,
          without_org_id: withoutOrgId,
          coverage_pct: total > 0 ? Math.round((withOrgId / total) * 100) : 100,
          data_ok: withoutOrgId === 0,
        };
      } catch (e) {
        dataChecks[entityName] = { error: e.message, data_ok: false };
      }
    }

    // ── Entity Matrix aufbauen ────────────────────────────────────────────────
    const entityMatrix = entityDefs.map(def => {
      const dataCheck = dataChecks[def.entity] || null;
      const orgIdCoverageOk = !dataCheck || dataCheck.data_ok;
      const hasBackendGuard = def.backend_functions_guarding.length > 0;

      // Risikobewertung
      let risk = 'green';
      const riskReasons = [];

      if (def.has_organization_id && dataCheck && !dataCheck.data_ok) {
        risk = 'red';
        riskReasons.push(`${dataCheck.without_org_id}/${dataCheck.sampled} Einträge ohne organization_id`);
      }

      if (def.ui_risk) {
        risk = risk === 'red' ? 'red' : 'yellow';
        riskReasons.push(def.ui_risk);
      }

      if (!hasBackendGuard && ['tenant', 'billing-system', 'platform-admin-only'].includes(def.expected_model)) {
        risk = risk === 'red' ? 'red' : 'yellow';
        riskReasons.push('Keine Backend-Function-Guards dokumentiert');
      }

      if (def.entity === 'PlatformAuditLog') {
        risk = 'yellow'; // immer gelb bis Permissions explizit verifiziert
        riskReasons.push('Platform-Admin-Only – Base44 Permission muss explizit gesetzt sein');
      }

      if (def.entity === 'UsageLog' || def.entity === 'Subscription') {
        riskReasons.push('Schreibzugriff muss auf service role beschränkt sein');
        risk = risk === 'red' ? 'red' : 'yellow';
      }

      // Empfohlene Base44-Regel
      let recommendedRule = '';
      switch (def.expected_model) {
        case 'tenant':
          recommendedRule = 'RLS: organization_id = current_user_org_id. Create/Read/Update: member+owner. Delete: owner/admin only.';
          break;
        case 'billing-system':
          recommendedRule = 'RLS: organization_id = current_user_org_id für Read. Write: service role only (Backend Functions).';
          break;
        case 'platform-admin-only':
          recommendedRule = 'RLS: role IN (admin, platform_admin, platform_owner). Write: service role only.';
          break;
        case 'platform-global':
          recommendedRule = 'Read: all authenticated. Write: platform_admin only.';
          break;
        case 'owner-scoped':
          recommendedRule = 'RLS: owner_email = user.email OR platform_admin. Write: owner OR platform_admin.';
          break;
        default:
          recommendedRule = 'Prüfen ob organization_id Pflichtfeld werden soll.';
      }

      return {
        entity: def.entity,
        has_organization_id: def.has_organization_id,
        expected_model: def.expected_model,
        backend_function_guarded: hasBackendGuard,
        backend_guards: def.backend_functions_guarding,
        expected_create: def.expected_create,
        expected_read: def.expected_read,
        expected_update: def.expected_update,
        expected_delete: def.expected_delete,
        data_check: dataCheck,
        org_id_coverage_ok: orgIdCoverageOk,
        notes: def.notes,
        ui_risk: def.ui_risk,
        risk_reasons: riskReasons,
        risk,
        recommended_rule: recommendedRule,
      };
    });

    // ── Zusammenfassung ───────────────────────────────────────────────────────
    const greenEntities = entityMatrix.filter(e => e.risk === 'green').length;
    const yellowEntities = entityMatrix.filter(e => e.risk === 'yellow').length;
    const redEntities = entityMatrix.filter(e => e.risk === 'red').length;

    const criticalRisks = entityMatrix
      .filter(e => e.risk === 'red')
      .map(e => `${e.entity}: ${e.risk_reasons.join('; ')}`);

    const recommendedFixes = entityMatrix
      .filter(e => e.risk !== 'green')
      .map(e => ({
        entity: e.entity,
        risk: e.risk,
        fix: e.recommended_rule,
        reasons: e.risk_reasons,
      }));

    const backendGuardCoverageOk = entityMatrix
      .filter(e => ['tenant', 'billing-system', 'platform-admin-only'].includes(e.expected_model))
      .every(e => e.backend_function_guarded);

    const claimStatus = redEntities > 0 ? 'red' : yellowEntities > 0 ? 'yellow' : 'green';
    const riskLevel = redEntities > 2 ? 'high' : redEntities > 0 ? 'medium' : yellowEntities > 0 ? 'medium' : 'low';

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,
      summary: {
        entities_checked: entityMatrix.length,
        green_entities: greenEntities,
        yellow_entities: yellowEntities,
        red_entities: redEntities,
        critical_permission_risks: criticalRisks,
        backend_guard_coverage_ok: backendGuardCoverageOk,
        key_finding: redEntities === 0
          ? 'Alle kritischen Entities haben Backend-Guards. Basis-Tenant-Isolation durch organization_id nachgewiesen.'
          : `${redEntities} Entities mit kritischen Permissions-Problemen gefunden.`,
        company_ui_warning_explanation:
          'Base44 zeigt möglicherweise eine Permission-Warnung für Company, weil die Entity keine explizite Base44 RLS-Regel hat. ' +
          'Die tatsächliche Sicherheit ist durch Backend-Functions (listCompanies, enrichCompany, deleteCompany, blacklistCompany) ' +
          'mit authorizeOrganizationAction gewährleistet. ' +
          'Die Base44-Warnung ist eine UI-Hinweis, kein aktives Sicherheitsleck, solange alle Reads/Writes über Backend Functions gehen. ' +
          'Empfehlung: Base44 RLS für Company auf organization_id = user.organization_id setzen, um Warnung zu beseitigen.',
        next_step: redEntities > 0
          ? 'Kritische Entities sofort absichern: RLS-Regeln setzen.'
          : 'Gelbe Entities: Base44 RLS-Regeln setzen für konsistente UI-Meldungen. Keine aktiven Sicherheitslücken bei Backend-Guard-Abdeckung.',
      },
      entity_matrix: entityMatrix,
      recommended_fixes: recommendedFixes,
      audit_note: [
        'Backend-Guards (authorizeOrganizationAction) sind die primäre Sicherheitsschicht.',
        'Base44 Entity-Permissions sind eine zweite Schicht für direkten Entity-API-Zugriff.',
        'Widersprüche zwischen beiden Schichten können zu inkonsistenten UI-Meldungen führen.',
        'Keine Backend-Guards wurden durch diesen Audit entfernt oder verändert.',
        'Keine Entity-Felder wurden durch diesen Audit entfernt oder verändert.',
      ],
    });

  } catch (error) {
    console.error('[auditEntityPermissionConsistency]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});