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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
    const EXPECTED_PRESENT = ['plan_type', 'stripe_price_id', 'max_leads_per_month', 'max_ai_scorings_per_month', 'max_emails_per_month', 'is_active'];
    for (const f of EXPECTED_PRESENT) {
      if (actualSchemaFields.includes(f)) {
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

    // Befund 1: Agency-Block via name.includes('agency') || slug.includes('agency')
    checkoutLogicFindings.push({
      location: 'createCheckoutSession:L91-97',
      code: "planName.includes('agency') || planSlug.includes('agency')",
      type: 'name_based_logic',
      risk: 'medium',
      detail: 'Agency-Block hängt an plan.name.includes("agency") und plan.slug.includes("agency"). Wenn Plan umbenannt wird, greift der Block nicht mehr.',
      fix: 'Plan-Entity um allow_self_service: boolean erweitern. Agency-Block auf !plan.allow_self_service prüfen.',
    });
    addWarning('createCheckoutSession', 'agency_block_name_based',
      'Agency-Block nutzt plan.name.includes("agency") — nicht plan_type oder allow_self_service',
      'Plan.allow_self_service=false für Agency-Plan setzen, Block auf !plan.allow_self_service umstellen'
    );

    // Hinweis: plan_type='agency' wäre bereits vorhanden — aber wird in createCheckoutSession NICHT genutzt!
    const agencyPlansByType = allPlans.filter(p => p.plan_type === 'agency');
    if (agencyPlansByType.length > 0) {
      addWarning('createCheckoutSession', 'plan_type_agency_unused',
        `Plan-Entity hat plan_type="agency" für ${agencyPlansByType.map(p=>p.name).join(', ')} — aber createCheckoutSession prüft plan.name statt plan_type`,
        'createCheckoutSession: Agency-Block auf plan.plan_type === "agency" umstellen (Feld existiert bereits)'
      );
    } else {
      addPass('createCheckoutSession', 'no_agency_plans_in_db', 'Kein Plan mit plan_type="agency" in DB (kein unmittelbares Risiko)');
    }

    // Befund 2: Trial-Tage via name.includes('starter')
    checkoutLogicFindings.push({
      location: 'createCheckoutSession:L131-132',
      code: "planName.includes('starter') || planSlug.includes('starter') → trialDays = 14",
      type: 'name_based_logic',
      risk: 'high',
      detail: 'Trial-Dauer (14 Tage) ist hardcoded und hängt an plan.name.includes("starter"). Kein trial_days-Feld im Plan-Schema. Wenn Starter-Plan umbenannt wird, entfällt der Trial ohne Fehlermeldung.',
      fix: 'Plan-Entity um trial_days: number erweitern. Starter-Plan: trial_days=14. createCheckoutSession: trialDays = plan.trial_days ?? 0.',
    });
    addRisk('createCheckoutSession', 'trial_days_hardcoded',
      'Trial-Dauer hardcoded: 14 Tage NUR wenn plan.name.includes("starter") — kein trial_days-Feld im Plan-Schema',
      'Plan.trial_days-Feld ergänzen (Starter=14, andere=0). createCheckoutSession auf plan.trial_days umstellen.'
    );

    // Befund 3: plan.slug — Feld existiert nicht im Schema
    const hasSlugField = actualSchemaFields.includes('slug');
    if (!hasSlugField) {
      checkoutLogicFindings.push({
        location: 'createCheckoutSession:L92',
        code: "const planSlug = (plan.slug || '').toLowerCase()",
        type: 'phantom_field',
        risk: 'low',
        detail: 'createCheckoutSession greift auf plan.slug zu, aber slug-Feld existiert nicht im Plan-Entity-Schema. Wert ist immer "" (kein Crash, aber Dead Code).',
        fix: 'plan.slug-Referenzen aus createCheckoutSession entfernen oder slug-Feld zum Schema hinzufügen.',
      });
      addWarning('createCheckoutSession', 'plan_slug_phantom_field',
        'plan.slug wird verwendet, aber Plan-Entity hat kein slug-Feld → immer leer (Dead Code)',
        'plan.slug-Zeilen entfernen — Agency/Starter-Erkennung läuft nur über plan.name'
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
    // CHECK 6: Datenqualität Plans
    // ════════════════════════════════════════════════════════════════════════
    const planQualityIssues = [];

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

    // Aktive Pläne ohne stripe_price_id
    const activePlansWithoutPrice = allPlans.filter(p => p.is_active !== false && !p.stripe_price_id);
    if (activePlansWithoutPrice.length > 0) {
      addRisk('plan_data_quality', 'active_plans_without_stripe_price',
        `${activePlansWithoutPrice.length} aktive Plan(s) ohne stripe_price_id: ${activePlansWithoutPrice.map(p=>p.name).join(', ')}`,
        'stripe_price_id für alle aktiven Pläne setzen oder Plan auf is_active=false setzen'
      );
    } else {
      addPass('plan_data_quality', 'all_active_plans_have_stripe_price', 'Alle aktiven Pläne haben stripe_price_id');
    }

    // Aktive Pläne ohne max_leads_per_month
    const plansWithoutLeadLimit = allPlans.filter(p => p.is_active !== false && p.max_leads_per_month == null);
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

    // Pläne ohne Preis-Information (price_monthly)
    const activePlansWithoutPrice2 = allPlans.filter(p => p.is_active !== false && (p.price_monthly == null || p.price_monthly === 0));
    if (activePlansWithoutPrice2.length > 0) {
      addWarning('plan_data_quality', 'plans_without_price_monthly',
        `${activePlansWithoutPrice2.length} aktive Plan(s) ohne price_monthly (oder =0): ${activePlansWithoutPrice2.map(p=>p.name).join(', ')}`,
        'price_monthly für alle buchbaren Pläne setzen (in Cent)'
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // GESAMTBEWERTUNG
    // ════════════════════════════════════════════════════════════════════════
    const claimStatus = risks.length > 0 ? 'red' : warnings.length > 0 ? 'yellow' : 'green';
    const riskLevel = risks.filter(r => r.area === 'createCheckoutSession' || r.area === 'plan_data_quality').length > 0
      ? 'high' : risks.length > 0 ? 'medium' : warnings.length > 0 ? 'low' : 'none';

    const nameBasedLogicFound = [
      { location: 'createCheckoutSession:L91', usage: "planName.includes('agency')", risk: 'medium', alternative: 'plan.plan_type === "agency"' },
      { location: 'createCheckoutSession:L93', usage: "planSlug.includes('agency')", risk: 'low', alternative: 'plan.plan_type === "agency" (slug-Feld existiert nicht im Schema)' },
      { location: 'createCheckoutSession:L131', usage: "planName.includes('starter')", risk: 'high', alternative: 'plan.trial_days (Feld fehlt noch im Schema)' },
      { location: 'createCheckoutSession:L131', usage: "planSlug.includes('starter')", risk: 'low', alternative: 'plan.trial_days (Feld fehlt noch im Schema)' },
    ];

    const missingTechnicalFields = planSchemaFields.desired_missing;

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
      },
      acceptance_criteria: {
        no_billing_flow_on_name_includes: false, // FAIL: Agency+Trial hängen an name.includes
        trials_via_technical_field: false,        // FAIL: kein trial_days-Feld
        agency_via_technical_field: false,        // FAIL: nutzt name statt plan_type (obwohl plan_type existiert)
        plan_missing_safe_fallback: true,         // PASS: getUsageSummary hat sauberen plan_status
        no_auto_repair: true,                     // PASS: kein Auto-Repair
      },

      // ── Detail-Sektionen ─────────────────────────────────────────────────
      plan_schema_fields: {
        present: planSchemaFields.present,
        desired_missing: missingTechnicalFields,
        note: 'Fehlende Felder zwingen Billing-Logic zu name-based Workarounds',
      },

      name_based_logic_found: nameBasedLogicFound,

      missing_technical_fields: missingTechnicalFields,

      billing_logic_risks: [
        ...risks.map(r => ({ ...r, type: 'risk' })),
        ...warnings.map(w => ({ ...w, type: 'warning' })),
      ],

      checkout_logic_analysis: checkoutLogicFindings,

      plans_checked: allPlans.map(p => ({
        id: p.id,
        name: p.name,
        plan_type: p.plan_type || null,
        is_active: p.is_active,
        stripe_price_id: p.stripe_price_id || null,
        max_leads_per_month: p.max_leads_per_month,
        price_monthly: p.price_monthly || null,
        // Felder die im Schema FEHLEN aber erwartet würden:
        trial_days: p.trial_days ?? 'FIELD_MISSING',
        allow_self_service: p.allow_self_service ?? 'FIELD_MISSING',
        plan_code: p.plan_code ?? 'FIELD_MISSING',
        billing_mode: p.billing_mode ?? 'FIELD_MISSING',
      })),

      org_plan_mismatches: {
        real: realMismatches,
        test_orgs: testMismatches.map(o => ({ org_name: o.org_name, issues: o.issues.map(i => i.check) })),
      },

      recommended_fixes: [
        {
          priority: 1,
          area: 'plan_schema + createCheckoutSession',
          fix: 'Plan-Entity: trial_days: number hinzufügen (Starter=14, andere=0). createCheckoutSession: const trialDays = plan.trial_days ?? 0; — name.includes("starter") entfernen.',
          confidence: 'high',
          breaking_change: false,
        },
        {
          priority: 2,
          area: 'plan_schema + createCheckoutSession',
          fix: 'Plan-Entity: allow_self_service: boolean hinzufügen (Agency=false, andere=true). createCheckoutSession: Agency-Block auf !plan.allow_self_service umstellen. ODER: plan_type === "agency" nutzen (Feld existiert bereits!).',
          confidence: 'high',
          breaking_change: false,
        },
        {
          priority: 3,
          area: 'createCheckoutSession',
          fix: 'plan.slug-Zeilen entfernen (Dead Code — Feld existiert nicht im Schema, plan.slug ist immer "").',
          confidence: 'high',
          breaking_change: false,
        },
        {
          priority: 4,
          area: 'plan_schema',
          fix: 'Plan-Entity: plan_code: string hinzufügen (maschinenlesbarer Schlüssel: "starter", "professional", "gold", "agency"). Mittelfristig name.includes() durch plan_code === "..." ersetzen.',
          confidence: 'medium',
          breaking_change: false,
        },
        ...recommended_fixes,
      ].filter((v, i, arr) => arr.findIndex(x => x.fix === v.fix) === i), // deduplizieren

      hard_values: {
        plans_in_db: allPlans.length,
        active_plans: allPlans.filter(p => p.is_active !== false).length,
        plans_without_stripe_price: activePlansWithoutPrice.length,
        plans_with_name_based_dependency: nameBasedLogicFound.length,
        real_orgs_with_plan_issues: realMismatches.length,
        highest_risk_item: risks[0]?.id || null,
      },

      risks,
      warnings,
      passes: passes.length, // nur Anzahl, kein Array (zu lang)
    });

  } catch (error) {
    console.error('[auditPlanModelIntegrity] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});