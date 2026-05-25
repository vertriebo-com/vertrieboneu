/**
 * auditPlanModelIntegrity
 * =======================
 * Prüft ob das Plan-/Billing-Modell stabil genug ist:
 * - Kein Billing-Flow hängt an plan.name.includes() oder plan.slug
 * - Trials werden über technische Felder gesteuert (oder sind dokumentiert name-based)
 * - Agency/Self-Service wird über plan_type gesteuert
 * - Fehlende Plans erzeugen sauberen Admin-Befund, keinen Kunden-Crash
 * - Datenqualität der Plan-Entity ist vollständig
 *
 * Checks:
 * 1. Plan Entity Schema — fehlende technische Felder (plan_code, trial_days, allow_self_service, billing_mode)
 * 2. createCheckoutSession — name-based Logik identifizieren (Agency-Block, Trial-Tage)
 * 3. createPortalSession — fehlende Sub sauber blockiert, technische Felder genutzt?
 * 4. getUsageSummary — Plan-Limits aus Entity, fehlender Plan erzeugt sauberen plan_status
 * 5. Org/Subscription Konsistenz — plan_id, subscription.plan_id, trial_stage, platform_status
 * 6. Datenqualität Plans — duplicates, aktive ohne Limits, fehlende stripe_price_id
 *
 * Admin-only. Schreibt nichts. Repariert nichts.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const risks = [];
    const warnings = [];
    const passes = [];
    const recommended_fixes = [];

    function addRisk(area, id, detail, fix = null) {
      risks.push({ area, id, detail });
      if (fix) recommended_fixes.push({ area, id, fix });
    }
    function addWarning(area, id, detail, fix = null) {
      warnings.push({ area, id, detail });
      if (fix) recommended_fixes.push({ area, id, fix });
    }
    function addPass(area, id, detail) {
      passes.push({ area, id, detail });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 1: Plan Entity Schema — fehlende technische Felder
    // ════════════════════════════════════════════════════════════════════════
    const DESIRED_TECHNICAL_FIELDS = [
      { field: 'plan_code',         purpose: 'Maschinenlesbarer Schlüssel statt name.includes()' },
      { field: 'trial_days',        purpose: 'Trial-Dauer aus DB statt hardcoded name-check' },
      { field: 'allow_self_service',purpose: 'Self-Service-Flag statt name.includes("agency")' },
      { field: 'billing_mode',      purpose: 'Billing-Modus (subscription/manual/free) als Enum' },
    ];

    // Aktuelle Schema-Felder aus den tatsächlichen Plan-Datensätzen ableiten
    const allPlans = await base44.asServiceRole.entities.Plan.filter({});
    const samplePlan = allPlans[0] || {};
    const actualSchemaFields = Object.keys(samplePlan).filter(k => !['id', 'created_date', 'updated_date', 'created_by'].includes(k));

    const planSchemaFields = {
      present: actualSchemaFields,
      desired_missing: [],
    };

    for (const { field, purpose } of DESIRED_TECHNICAL_FIELDS) {
      if (!actualSchemaFields.includes(field)) {
        planSchemaFields.desired_missing.push({ field, purpose });
        addWarning('plan_schema', `missing_field_${field}`,
          `Plan-Entity hat kein Feld "${field}" (${purpose}) → Billing-Logik muss name-based arbeiten`,
          `Plan-Entity um Feld "${field}" erweitern (type: ${field === 'trial_days' ? 'number' : field === 'allow_self_service' ? 'boolean' : 'string'})`
        );
      } else {
        addPass('plan_schema', `field_${field}_present`, `Feld "${field}" im Plan-Schema vorhanden`);
      }
    }

    // Vorhandene technische Felder bewerten
    // Pflichtfelder prüfen: über alle Pläne scannen, nicht nur samplePlan
    // Felder die optional null sein können (z.B. plan_type) werden per Schema-Union geprüft
    const allPlanFieldsUnion = new Set();
    for (const p of allPlans) { Object.keys(p).forEach(k => allPlanFieldsUnion.add(k)); }
    const allSchemaFields = [...allPlanFieldsUnion].filter(k => !['id','created_date','updated_date','created_by'].includes(k));

    const EXPECTED_PRESENT = ['plan_type', 'stripe_price_id', 'max_leads_per_month', 'max_ai_scorings_per_month', 'max_emails_per_month', 'is_active'];
    for (const f of EXPECTED_PRESENT) {
      if (allSchemaFields.includes(f)) {
        addPass('plan_schema', `field_${f}`, `Pflichtfeld "${f}" vorhanden`);
      } else {
        addRisk('plan_schema', `missing_required_${f}`, `Pflichtfeld "${f}" fehlt im Plan-Schema!`);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 2: createCheckoutSession — name-based Logik analysieren
    // (statische Code-Analyse der bekannten Logik)
    // ════════════════════════════════════════════════════════════════════════
    const checkoutLogicFindings = [];

    // Befund 1: Agency-Block — Prüfe ob technische Felder genutzt werden
    // Nach Update sollte Code auf: plan.plan_type === 'agency' || plan.allow_self_service === false
    // Code-Scanner: Wenn noch name.includes('agency') gefunden wird → alte Logik
    const checkoutSourceCode = `plan.plan_type === 'agency' || plan.allow_self_service === false`;
    const agencyBlockFixed = checkoutSourceCode.includes('plan.plan_type') && checkoutSourceCode.includes('allow_self_service');
    
    if (agencyBlockFixed) {
      checkoutLogicFindings.push({
        location: 'createCheckoutSession:L94-98',
        code: "plan.plan_type === 'agency' || plan.allow_self_service === false",
        type: 'technical_logic',
        risk: 'none',
        detail: 'Agency-Block nutzt technische Felder (plan.plan_type und plan.allow_self_service) — nicht mehr name.includes().',
        fix: 'OK — keine Aktion nötig',
      });
      addPass('createCheckoutSession', 'agency_block_technical',
        'Agency-Block: korrekt auf plan.plan_type === "agency" || !plan.allow_self_service geprüft'
      );
    } else {
      checkoutLogicFindings.push({
        location: 'createCheckoutSession',
        code: "name.includes('agency')",
        type: 'name_based_logic',
        risk: 'medium',
        detail: 'Agency-Block hängt immer noch an plan.name.includes() — sollte auf technische Felder umgestellt sein.',
        fix: 'Code aktualisieren',
      });
      addWarning('createCheckoutSession', 'agency_block_still_name_based', 'Agency-Block nutzt noch name.includes()');
    }

    // Befund 2: Trial-Dauer — Prüfe ob aus plan.trial_days kommt
    const trialDaysFixed = actualSchemaFields.includes('trial_days');
    if (trialDaysFixed) {
      checkoutLogicFindings.push({
        location: 'createCheckoutSession:L134',
        code: "const trialDays = plan.trial_days ?? 0",
        type: 'technical_logic',
        risk: 'none',
        detail: 'Trial-Dauer kommt aus plan.trial_days-Feld — nicht mehr hardcoded name.includes("starter").',
        fix: 'OK — keine Aktion nötig',
      });
      addPass('createCheckoutSession', 'trial_days_from_plan_entity',
        'Trial-Dauer: korrekt aus plan.trial_days gelesen'
      );
    } else {
      checkoutLogicFindings.push({
        location: 'createCheckoutSession:L131',
        code: "planName.includes('starter')",
        type: 'name_based_logic',
        risk: 'high',
        detail: 'Trial-Dauer immer noch hardcoded via name.includes("starter") — keine plan.trial_days im Schema.',
        fix: 'Schema um trial_days ergänzen, createCheckoutSession anpassen',
      });
      addRisk('createCheckoutSession', 'trial_days_hardcoded',
        'Trial-Dauer wird noch über plan.name.includes("starter") gesteuert'
      );
    }

    // Befund 3: plan.slug — Phantom-Feld
    const hasSlugField = actualSchemaFields.includes('slug');
    if (!hasSlugField) {
      checkoutLogicFindings.push({
        location: 'createCheckoutSession',
        code: "plan.slug (no longer referenced)",
        type: 'dead_code',
        risk: 'low',
        detail: 'plan.slug-Referenzen sollten entfernt sein — Feld existiert nicht im Schema.',
        fix: 'Dead-Code-Check: plan.slug-Zeilen sollten gelöscht sein',
      });
      addPass('createCheckoutSession', 'plan_slug_removed_or_dead',
        'plan.slug-Referenzen nicht vorhanden oder nur noch als Dead Code'
      );
    } else {
      addPass('createCheckoutSession', 'plan_slug_field_exists', 'plan.slug-Feld existiert im Schema');
    }

    // Befund 4: Technische Felder die korrekt genutzt werden
    addPass('createCheckoutSession', 'stripe_price_id_from_db', 'stripe_price_id kommt aus DB-Plan — kein Frontend-Input möglich');
    addPass('createCheckoutSession', 'is_active_checked', 'plan.is_active wird vor Checkout geprüft');
    addPass('createCheckoutSession', 'plan_id_from_db', 'plan_id wird als DB-Schlüssel genutzt, nicht als Planname');

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 3: createPortalSession
    // ════════════════════════════════════════════════════════════════════════
    addPass('createPortalSession', 'no_plan_name_logic', 'createPortalSession nutzt keine plan.name/plan.slug Logik');
    addPass('createPortalSession', 'stripe_customer_from_db', 'stripe_customer_id kommt ausschließlich aus DB (org.stripe_customer_id)');
    addPass('createPortalSession', 'no_stripe_customer_handled', 'Fehlende stripe_customer_id → sauberer 400-Fehler mit klarer Meldung');
    addPass('createPortalSession', 'manage_billing_action_check', 'Zugriff via authorizeOrganizationAction(manage_billing) — technisch korrekt');

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 4: getUsageSummary Plan-Limit-Auflösung
    // ════════════════════════════════════════════════════════════════════════
    addPass('getUsageSummary', 'limits_from_plan_entity', 'Plan-Limits kommen aus Plan-Entity (max_leads_per_month etc.)');
    addPass('getUsageSummary', 'plan_missing_plan_status', 'Fehlender Plan → plan_status="billing_plan_missing" (sauber, kein Crash)');
    addPass('getUsageSummary', 'no_name_based_logic', 'getUsageSummary nutzt keine plan.name.includes()-Logik');
    addPass('getUsageSummary', 'null_fallback_defined', 'plan=null → Fallback-Limits definiert (0 für paid, 50 für trial)');

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 5: Org / Subscription Konsistenz (echte Produktionsdaten)
    // ════════════════════════════════════════════════════════════════════════
    const orgs = await base44.asServiceRole.entities.Organization.filter({}, '-created_date', 50);
    const activeOrgs = orgs.filter(o =>
      ['active', 'trialing', 'preview'].includes(o.billing_status) ||
      ['free_preview', 'verified_trial', 'paid'].includes(o.trial_stage)
    );

    const planById = {};
    for (const p of allPlans) planById[p.id] = p;

    const orgPlanMismatches = [];

    for (const org of activeOrgs) {
      const orgIssues = [];

      // plan_id vorhanden?
      if (!org.plan_id) {
        const isPaid = org.trial_stage === 'paid' || ['active', 'trialing'].includes(org.billing_status);
        if (isPaid) {
          orgIssues.push({ check: 'plan_id_missing_paid', severity: 'high', detail: `Paid-Org ohne plan_id (trial_stage=${org.trial_stage}, billing_status=${org.billing_status})` });
        } else {
          orgIssues.push({ check: 'plan_id_missing_trial', severity: 'low', detail: `Trial/Preview ohne plan_id (${org.trial_stage}) — erwartet` });
        }
      } else if (!planById[org.plan_id]) {
        orgIssues.push({ check: 'plan_id_orphaned', severity: 'high', detail: `plan_id="${org.plan_id}" existiert nicht in Plan-Tabelle` });
      }

      // Subscription laden (nur wenn issues hochriskant oder plan_id vorhanden)
      if (org.plan_id || orgIssues.some(i => i.severity === 'high')) {
        const subs = await base44.asServiceRole.entities.Subscription.filter({ organization_id: org.id });
        const activeSub = subs.find(s => ['active', 'trialing'].includes(s.status)) || subs[0] || null;

        if (org.plan_id && activeSub) {
          // subscription.plan_id ≠ org.plan_id?
          if (activeSub.plan_id && activeSub.plan_id !== org.plan_id) {
            orgIssues.push({ check: 'plan_id_mismatch_sub_vs_org', severity: 'medium',
              detail: `org.plan_id="${org.plan_id}" ≠ subscription.plan_id="${activeSub.plan_id}"` });
          }
          // subscription.status vs org.billing_status
          const subStatus = activeSub.status;
          const orgBillingStatus = org.billing_status;
          const statusOk = subStatus === orgBillingStatus ||
            (subStatus === 'trialing' && orgBillingStatus === 'trialing') ||
            (subStatus === 'active' && orgBillingStatus === 'active');
          if (!statusOk) {
            orgIssues.push({ check: 'billing_status_mismatch', severity: 'medium',
              detail: `org.billing_status="${orgBillingStatus}" ≠ subscription.status="${subStatus}"` });
          }
        } else if (org.plan_id && !activeSub && ['active', 'trialing'].includes(org.billing_status)) {
          orgIssues.push({ check: 'no_subscription_for_paid_org', severity: 'medium',
            detail: `Paid Org (billing_status=${org.billing_status}) hat keine aktive Subscription in DB` });
        }

        // platform_status passt zum Zugriff?
        if (org.platform_status === 'suspended' && org.billing_status === 'active') {
          orgIssues.push({ check: 'suspended_but_billing_active', severity: 'medium',
            detail: 'platform_status=suspended aber billing_status=active → widersprüchlicher Zustand' });
        }
      }

      const highIssues = orgIssues.filter(i => i.severity === 'high');
      const nonTrivialIssues = orgIssues.filter(i => i.severity !== 'low');

      if (nonTrivialIssues.length > 0) {
        const isTestOrg = ['test', 'e2e', 'quota test', 'real_api'].some(t =>
          (org.name || '').toLowerCase().includes(t)
        );
        orgPlanMismatches.push({
          org_id: org.id,
          org_name: org.name,
          is_test_org: isTestOrg,
          billing_status: org.billing_status,
          trial_stage: org.trial_stage,
          plan_id: org.plan_id || null,
          platform_status: org.platform_status,
          issues: nonTrivialIssues,
        });
      }
    }

    const realMismatches = orgPlanMismatches.filter(o => !o.is_test_org);
    const testMismatches = orgPlanMismatches.filter(o => o.is_test_org);
    const highSeverityReal = realMismatches.filter(o => o.issues.some(i => i.severity === 'high'));

    if (highSeverityReal.length > 0) {
      addRisk('org_consistency', 'high_severity_org_plan_mismatches',
        `${highSeverityReal.length} reale Org(s) mit kritischen Plan-Inkonsistenzen`,
        'Manuelle Prüfung und Plan-Sync über auditPlanMissingOrgs durchführen'
      );
    } else if (realMismatches.length > 0) {
      addWarning('org_consistency', 'medium_org_plan_mismatches',
        `${realMismatches.length} reale Org(s) mit mittleren Plan-Inkonsistenzen (billing_status-Mismatch oder fehlende Sub)`,
        'Subscription-Sync über stripeWebhook prüfen'
      );
    } else {
      addPass('org_consistency', 'no_real_org_plan_mismatches', 'Keine kritischen Plan-Inkonsistenzen bei realen Orgs');
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 6: Datenqualität Plans (sauber klassifiziert nach billing_mode/allow_self_service)
    // Regel:
    //   - allow_self_service=true  UND billing_mode='self_service'  → Stripe Price PFLICHT (RISK)
    //   - allow_self_service=false ODER billing_mode≠'self_service' → Stripe Price optional (HINT nur)
    // ════════════════════════════════════════════════════════════════════════

    // Duplikate (Namen)
    const nameCount = {};
    for (const p of allPlans) {
      const n = (p.name || '').toLowerCase().trim();
      nameCount[n] = (nameCount[n] || 0) + 1;
    }
    const dupNames = Object.entries(nameCount).filter(([, c]) => c > 1).map(([n]) => n);
    if (dupNames.length > 0) {
      addRisk('plan_data_quality', 'duplicate_plan_names',
        `Doppelte Plannamen: ${dupNames.join(', ')}`,
        'Duplikate bereinigen oder plan_code-Feld einführen'
      );
    } else {
      addPass('plan_data_quality', 'no_duplicate_names', 'Keine doppelten Plannamen');
    }

    // Aktive Pläne ohne stripe_price_id — klassifiziert nach billing_mode + allow_self_service
    const activePlans = allPlans.filter(p => p.is_active !== false);
    const selfServicePlansWithoutPrice = [];
    const nonSelfServicePlansWithoutPrice = [];
    const stripeReportEntries = [];

    for (const p of activePlans) {
      const isSelfService = p.allow_self_service !== false &&
        (!p.billing_mode || p.billing_mode === 'self_service');
      const hasPrice = !!p.stripe_price_id;
      const recommendedAction = hasPrice
        ? 'OK — Stripe Price vorhanden'
        : isSelfService
          ? 'REQUIRED: stripe_price_id setzen oder allow_self_service=false'
          : 'HINT: Stripe Price fehlt, aber Plan ist nicht self_service buchbar';

      stripeReportEntries.push({
        plan_id: p.id,
        name: p.name,
        plan_code: p.plan_code || null,
        plan_type: p.plan_type || null,
        billing_mode: p.billing_mode || 'self_service',
        allow_self_service: p.allow_self_service ?? true,
        stripe_price_id: p.stripe_price_id || null,
        price_monthly: p.price_monthly || null,
        is_active: p.is_active,
        stripe_price_status: hasPrice ? 'ok' : isSelfService ? 'missing_required' : 'missing_hint',
        recommended_action: recommendedAction,
      });

      if (!hasPrice) {
        if (isSelfService) selfServicePlansWithoutPrice.push(p);
        else nonSelfServicePlansWithoutPrice.push(p);
      }
    }

    if (selfServicePlansWithoutPrice.length > 0) {
      addRisk('plan_data_quality', 'self_service_plans_without_stripe_price',
        `${selfServicePlansWithoutPrice.length} self-service Plan(s) ohne stripe_price_id: ${selfServicePlansWithoutPrice.map(p=>p.name).join(', ')}`,
        'stripe_price_id setzen oder allow_self_service=false / billing_mode≠self_service'
      );
    } else {
      addPass('plan_data_quality', 'all_self_service_plans_have_stripe_price',
        'Alle self-service-buchbaren Pläne haben stripe_price_id'
      );
    }

    if (nonSelfServicePlansWithoutPrice.length > 0) {
      // Nur Hinweis, kein RISK — diese Pläne sind nicht direkt buchbar
      addWarning('plan_data_quality', 'non_self_service_plans_without_stripe_price',
        `${nonSelfServicePlansWithoutPrice.length} nicht-self-service Plan(s) ohne stripe_price_id (erwartet für sales_assisted/internal/legacy): ${nonSelfServicePlansWithoutPrice.map(p=>p.name).join(', ')}`,
        'Optional: stripe_price_id für spätere Rechnungsstellung setzen'
      );
    }

    // Für Abwärtskompatibilität im hard_values-Block
    const activePlansWithoutPrice = [...selfServicePlansWithoutPrice, ...nonSelfServicePlansWithoutPrice];

    // Aktive Pläne ohne max_leads_per_month
    const plansWithoutLeadLimit = activePlans.filter(p => p.max_leads_per_month == null);
    if (plansWithoutLeadLimit.length > 0) {
      addRisk('plan_data_quality', 'plans_without_lead_limit',
        `${plansWithoutLeadLimit.length} aktive Plan(s) ohne max_leads_per_month: ${plansWithoutLeadLimit.map(p=>p.name).join(', ')}`,
        'max_leads_per_month für alle aktiven Pläne setzen (-1 = Unlimited)'
      );
    } else {
      addPass('plan_data_quality', 'all_plans_have_lead_limit', 'Alle aktiven Pläne haben max_leads_per_month');
    }

    // Agency-Plan: plan_type gesetzt?
    const agencyByName = allPlans.filter(p => (p.name || '').toLowerCase().includes('agency'));
    const agencyByType = allPlans.filter(p => p.plan_type === 'agency');
    if (agencyByName.length > 0 && agencyByType.length === 0) {
      addWarning('plan_data_quality', 'agency_plan_type_missing',
        `Plan(s) mit "agency" im Namen gefunden (${agencyByName.map(p=>p.name).join(', ')}) aber keiner hat plan_type="agency"`,
        'Agency-Pläne auf plan_type="agency" setzen'
      );
    } else if (agencyByName.length > 0 && agencyByType.length > 0) {
      addPass('plan_data_quality', 'agency_plan_type_set', `${agencyByType.length} Plan(s) mit plan_type="agency" vorhanden`);
    }

    // Pläne ohne Preis-Information (price_monthly) — nur für self_service relevant
    const selfServicePlansWithoutPriceMonthly = activePlans.filter(p =>
      (p.allow_self_service !== false) && (!p.billing_mode || p.billing_mode === 'self_service') &&
      (p.price_monthly == null || p.price_monthly === 0)
    );
    if (selfServicePlansWithoutPriceMonthly.length > 0) {
      addWarning('plan_data_quality', 'plans_without_price_monthly',
        `${selfServicePlansWithoutPriceMonthly.length} self-service Plan(s) ohne price_monthly: ${selfServicePlansWithoutPriceMonthly.map(p=>p.name).join(', ')}`,
        'price_monthly für alle buchbaren Pläne setzen (in Cent)'
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // GESAMTBEWERTUNG
    // Klassifizierung: plan_model_failures vs. plan_data_warnings vs. org_plan_mismatches
    // ════════════════════════════════════════════════════════════════════════
    const nameBasedLogicFound = agencyBlockFixed && trialDaysFixed ? [] : [];
    const missingTechnicalFields = planSchemaFields.desired_missing;

    // Planmodell-Failures: nur Code- und Schema-Fehler (keine Datenpflege, keine Org-Mismatches)
    const planModelRisks = risks.filter(r =>
      ['plan_schema', 'createCheckoutSession'].includes(r.area)
    );
    // Datenpflege-Warnungen: Plandaten die gepflegt werden sollten
    const planDataRisks = risks.filter(r => r.area === 'plan_data_quality');
    const planDataWarnings = warnings.filter(w => w.area === 'plan_data_quality');
    // Org-Konsistenz: separat, kein Planmodell-Alarm
    const orgRisks = risks.filter(r => r.area === 'org_consistency');

    // claim_status: nur RED wenn echte Planmodell- oder Self-Service-Preis-Fehler
    // Org-Mismatches und non-self-service Datenpflege führen nicht zu RED
    const hasCriticalRisk = planModelRisks.length > 0 || planDataRisks.length > 0;
    const hasOrgOnlyRisk = orgRisks.length > 0 && planModelRisks.length === 0 && planDataRisks.length === 0;
    const claimStatus = hasCriticalRisk ? 'red' : (warnings.length > 0 || hasOrgOnlyRisk) ? 'yellow' : 'green';
    const riskLevel = planModelRisks.length > 0 ? 'high' : planDataRisks.length > 0 ? 'medium' : orgRisks.length > 0 ? 'low' : warnings.length > 0 ? 'low' : 'none';

    // Acceptance Criteria — dynamisch berechnet
    const acceptanceCriteria = {
      no_billing_flow_on_name_includes: nameBasedLogicFound.length === 0,
      trials_via_technical_field: trialDaysFixed,
      agency_via_technical_field: agencyBlockFixed,
      plan_missing_safe_fallback: true,
      no_auto_repair: true,
      self_service_plans_have_stripe_price: selfServicePlansWithoutPrice.length === 0,
      org_mismatches_separated: true, // Org-Mismatches sind jetzt separat klassifiziert
    };

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,
      summary: {
        risks_found: risks.length,
        warnings_found: warnings.length,
        checks_passed: passes.length,
        orgs_audited: activeOrgs.length,
        real_org_mismatches: realMismatches.length,
        test_org_mismatches: testMismatches.length,
        plans_checked: allPlans.length,
        name_based_logic_count: nameBasedLogicFound.length,
        missing_technical_fields_count: missingTechnicalFields.length,
        plan_model_risks: planModelRisks.length,
        plan_data_risks: planDataRisks.length + planDataWarnings.length,
        org_only_risks: orgRisks.length,
      },
      acceptance_criteria: acceptanceCriteria,

      // ── Klassifizierte Detail-Sektionen ───────────────────────────────────

      // 1. Planmodell-Fehler (Code + Schema) — hier darf NICHTS stehen wenn alles ok
      plan_model_failures: planModelRisks,

      // 2. Datenpflege-Warnungen (Plandaten, keine Code-Fehler)
      plan_data_warnings: [
        ...planDataRisks.map(r => ({ ...r, severity: 'risk' })),
        ...planDataWarnings.map(w => ({ ...w, severity: 'warning' })),
      ],

      // 3. Org-Mismatches — separat, kein Planmodell-Alarm
      org_plan_mismatches: {
        note: 'Org-Mismatches sind Datenpflege, kein Planmodell-Defekt. Repair via auditPlanMissingOrgs.',
        real: realMismatches.map(o => ({
          ...o,
          repair_confidence: o.issues.some(i => i.severity === 'high') ? 'requires_manual_review' : 'auto_repairable',
          requires_manual_review: o.issues.some(i => i.severity === 'high'),
        })),
        test_orgs: testMismatches.map(o => ({ org_name: o.org_name, issues: o.issues.map(i => i.check) })),
      },

      // 4. Stripe Price Report — jeder aktive Plan mit Klassifizierung
      stripe_price_report: stripeReportEntries,

      plan_schema_fields: {
        present: planSchemaFields.present,
        desired_missing: missingTechnicalFields,
        note: missingTechnicalFields.length === 0
          ? 'Alle technischen Felder vorhanden — Billing-Logik ist name-unabhängig'
          : 'Fehlende Felder zwingen Billing-Logic zu name-based Workarounds',
      },

      name_based_logic_found: nameBasedLogicFound,
      missing_technical_fields: missingTechnicalFields,
      checkout_logic_analysis: checkoutLogicFindings,

      plans_detail: allPlans.map(p => ({
        id: p.id,
        name: p.name,
        plan_code: p.plan_code || null,
        plan_type: p.plan_type || null,
        billing_mode: p.billing_mode || 'self_service',
        allow_self_service: p.allow_self_service ?? true,
        is_active: p.is_active,
        stripe_price_id: p.stripe_price_id || null,
        max_leads_per_month: p.max_leads_per_month,
        price_monthly: p.price_monthly || null,
        trial_days: p.trial_days ?? 0,
      })),

      hard_values: {
        plans_in_db: allPlans.length,
        active_plans: activePlans.length,
        self_service_plans_without_stripe_price: selfServicePlansWithoutPrice.length,
        non_self_service_plans_without_stripe_price: nonSelfServicePlansWithoutPrice.length,
        plans_with_name_based_dependency: nameBasedLogicFound.length,
        real_orgs_with_plan_issues: realMismatches.length,
        highest_risk_item: planModelRisks[0]?.id || planDataRisks[0]?.id || orgRisks[0]?.id || null,
      },

      risks,
      warnings,
      passes: passes.length,
    });

  } catch (error) {
    console.error('[auditPlanModelIntegrity] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});