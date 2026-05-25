/**
 * auditPlanMissingOrgs
 * ====================
 * Dedizierte Diagnose für Orgs mit plan_id aber Plan nicht in DB auffindbar.
 *
 * Prüft für jede betroffene Org:
 * 1. Plan.filter({ id: org.plan_id }) → leer?
 * 2. Subscription vorhanden? → plan_id, stripe_price_id, status
 * 3. Plan gelöscht/inaktiv?
 * 4. Legacy-Trial ohne Plan?
 * 5. recommended_plan_id (falls eindeutig ableitbar aus Subscription-Preis)
 * 6. repair_confidence: high/medium/low
 * 7. requires_manual_review: boolean
 *
 * Gibt: org_id, org_name, plan_id, subscription_id, trial_stage,
 *        subscription_status, platform_status, created_date, owner_email (masked)
 *
 * Admin-only. Schreibt nichts. Setzt keinen Plan automatisch.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const masked = local.slice(0, 2) + '***' + local.slice(-1);
  return `${masked}@${domain}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetOrgId = body?.org_id || null;
    const includeAllOrgs = body?.include_all || false;

    // ── Orgs laden ────────────────────────────────────────────────────────────
    let orgs = [];
    if (targetOrgId) {
      orgs = await base44.asServiceRole.entities.Organization.filter({ id: targetOrgId });
    } else {
      orgs = await base44.asServiceRole.entities.Organization.filter({}, '-created_date', 100);
    }

    // ── Alle Pläne laden (für Empfehlungs-Lookup) ────────────────────────────
    const allPlans = await base44.asServiceRole.entities.Plan.filter({});
    const planById = {};
    const planByStripePrice = {};
    for (const p of allPlans) {
      planById[p.id] = p;
      if (p.stripe_price_id) planByStripePrice[p.stripe_price_id] = p;
    }

    // ── Stripe-Preis → Plan-Mapping (für Repair-Empfehlung) ─────────────────
    // Bekannte Preise aus Produktkatalog
    const KNOWN_PRICE_TO_PLAN_NAME = {
      // Live
      'price_starter_monthly':      'Starter',
      'price_professional_monthly':  'Professional',
      'price_gold_monthly':          'Gold',
      'price_agency_monthly':        'Agency',
    };

    // ── Betroffene Orgs identifizieren ────────────────────────────────────────
    // Kandidaten: Orgs mit plan_id aber Plan fehlt ODER Orgs ohne plan_id die "paid" sind
    const candidates = orgs.filter(o => {
      if (includeAllOrgs) return true;
      const isPaid = ['paid'].includes(o.trial_stage) || ['active', 'trialing'].includes(o.billing_status || '');
      // Org hat plan_id aber Plan nicht im Map? → betroffen
      if (o.plan_id && !planById[o.plan_id]) return true;
      // Org ist bezahlend aber hat keine plan_id? → betroffen
      if (!o.plan_id && isPaid) return true;
      return false;
    });

    if (candidates.length === 0) {
      return Response.json({
        status: 'green',
        message: 'Keine betroffenen Orgs gefunden. Alle aktiven Orgs mit plan_id haben einen gültigen Plan in der DB.',
        affected_count: 0,
        orgs_audited: orgs.length,
        affected_orgs: [],
        all_plans: allPlans.map(p => ({ id: p.id, name: p.name, is_active: p.is_active, stripe_price_id: p.stripe_price_id })),
      });
    }

    // ── Pro betroffene Org: Diagnose durchführen ─────────────────────────────
    const affectedOrgs = [];

    for (const org of candidates) {
      const orgId = org.id;

      // 1. Plan direkt aus DB laden
      let planFromDb = null;
      let planLoadResult = 'not_checked';
      if (org.plan_id) {
        const planRes = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
        planFromDb = planRes?.[0] || null;
        planLoadResult = planFromDb
          ? 'found'
          : planById[org.plan_id]
            ? 'found_in_cache'  // war im allPlans-Load drin (sollte nicht passieren)
            : 'missing';
      } else {
        planLoadResult = 'no_plan_id';
      }

      // 2. Subscription laden
      const subscriptions = await base44.asServiceRole.entities.Subscription.filter({ organization_id: orgId });
      const activeSub = subscriptions.find(s => ['active', 'trialing'].includes(s.status)) || subscriptions[0] || null;

      // 3. Inaktive/gelöschte Pläne prüfen (plan_id könnte verwaist sein)
      const allPlansIncInactive = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
      const deletedOrInactivePlan = allPlansIncInactive?.[0] || null;

      // 4. recommended_plan_id ableiten
      let recommendedPlanId = null;
      let recommendedPlanName = null;
      let repairConfidence = 'low';
      let repairMethod = null;
      let requiresManualReview = true;

      if (activeSub?.stripe_price_id) {
        // Aus Stripe-Preis → Plan suchen
        const matchedPlan = planByStripePrice[activeSub.stripe_price_id];
        if (matchedPlan) {
          recommendedPlanId = matchedPlan.id;
          recommendedPlanName = matchedPlan.name;
          repairConfidence = 'high';
          repairMethod = 'subscription_stripe_price_match';
          requiresManualReview = false;
        } else {
          // Stripe-Preis bekannt aber kein Plan → suche per Name
          const priceBasedName = KNOWN_PRICE_TO_PLAN_NAME[activeSub.stripe_price_id];
          if (priceBasedName) {
            const byName = allPlans.find(p => p.name?.toLowerCase().includes(priceBasedName.toLowerCase()));
            if (byName) {
              recommendedPlanId = byName.id;
              recommendedPlanName = byName.name;
              repairConfidence = 'medium';
              repairMethod = 'stripe_price_name_lookup';
              requiresManualReview = true;
            }
          }
        }
      } else if (activeSub?.plan_id && planById[activeSub.plan_id]) {
        // Subscription hat plan_id der in DB existiert
        recommendedPlanId = activeSub.plan_id;
        recommendedPlanName = planById[activeSub.plan_id]?.name;
        repairConfidence = 'high';
        repairMethod = 'subscription_plan_id_match';
        requiresManualReview = false;
      } else if (org.billing_status === 'trialing' || org.trial_stage === 'verified_trial') {
        // Trialing ohne Plan → Starter empfehlen (niedrigstes bezahltes Tier)
        const starterPlan = allPlans.find(p => p.name?.toLowerCase().includes('starter') && p.is_active !== false);
        if (starterPlan) {
          recommendedPlanId = starterPlan.id;
          recommendedPlanName = starterPlan.name;
          repairConfidence = 'low';
          repairMethod = 'trial_stage_fallback';
          requiresManualReview = true;
        }
      }

      // 5. Root-Cause klassifizieren
      let rootCause = 'unknown';
      let rootCauseDetail = null;
      if (!org.plan_id) {
        rootCause = 'no_plan_id_assigned';
        rootCauseDetail = `Org ist ${org.billing_status}/${org.trial_stage} aber plan_id=null`;
      } else if (planLoadResult === 'missing' && deletedOrInactivePlan) {
        rootCause = 'plan_deleted_or_inactive';
        rootCauseDetail = `Plan-Datensatz existiert (is_active=${deletedOrInactivePlan.is_active}) aber nicht in aktivem Filter`;
      } else if (planLoadResult === 'missing') {
        rootCause = 'plan_id_orphaned';
        rootCauseDetail = `plan_id=${org.plan_id} existiert nicht in Plan-Tabelle`;
      } else if (planFromDb && planFromDb.is_active === false) {
        rootCause = 'plan_deactivated';
        rootCauseDetail = `Plan "${planFromDb.name}" ist is_active=false`;
      }

      // 6. UI-Fallback-Verhalten prüfen: Inline-Simulation von getUsageSummary
      // (kein functions.invoke wegen Auth-Kontext-Problemen in asServiceRole)
      let uiFallbackStatus = 'unknown';
      let uiFallbackDetail = null;
      try {
        // Inline: Plan-Auflösung simulieren (identisch zu getUsageSummary Limit-Resolution)
        const trialStage = org.trial_stage || 'free_preview';
        const isPaidCustomer = ['paid'].includes(trialStage) || ['active', 'trialing'].includes(org.billing_status || '');
        const hasCustomLimit = org.custom_monthly_lead_limit != null;

        let simulatedMonthlyLimit = null;
        let simulatedPlanStatus = 'ok';

        if (hasCustomLimit) {
          simulatedMonthlyLimit = org.custom_monthly_lead_limit;
          simulatedPlanStatus = 'custom_limit';
        } else if (planFromDb) {
          simulatedMonthlyLimit = planFromDb.max_leads_per_month != null ? planFromDb.max_leads_per_month : 50;
          simulatedPlanStatus = planFromDb.is_active === false ? 'plan_deactivated' : 'ok';
        } else if (planLoadResult === 'missing') {
          simulatedPlanStatus = 'billing_plan_missing';
          simulatedMonthlyLimit = isPaidCustomer ? 0 : 50;
        } else if (!org.plan_id) {
          if (isPaidCustomer) {
            simulatedPlanStatus = 'billing_plan_missing';
            simulatedMonthlyLimit = 0; // paid ohne plan → UI zeigt 0/0, Balken rot
          } else if (trialStage === 'verified_trial') {
            simulatedPlanStatus = 'trial_limit';
            simulatedMonthlyLimit = 50;
          } else {
            simulatedPlanStatus = 'no_plan_preview';
            simulatedMonthlyLimit = 10;
          }
        }

        // Prüfen ob UI-Kern-Felder vollständig wären
        const periodPartsMock = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
        }).formatToParts(new Date());
        const mockPeriodMonth = `${periodPartsMock.find(p=>p.type==='year')?.value}-${periodPartsMock.find(p=>p.type==='month')?.value}`;

        const uiCoreComplete = simulatedMonthlyLimit != null && mockPeriodMonth != null;

        if (simulatedPlanStatus === 'billing_plan_missing' && isPaidCustomer) {
          uiFallbackStatus = 'warning';
          uiFallbackDetail = `plan_status="${simulatedPlanStatus}" — UI zeigt Fallback monthly_limit=0 (Balken 100% rot). Kein Crash, aber irreführend für Paid-Kunden.`;
        } else if (simulatedPlanStatus === 'billing_plan_missing' || simulatedPlanStatus === 'billing_plan_invalid') {
          uiFallbackStatus = 'warning';
          uiFallbackDetail = `plan_status="${simulatedPlanStatus}" — UI zeigt Fallback-Werte (monthly_limit=${simulatedMonthlyLimit}), kein Crash`;
        } else if (!uiCoreComplete) {
          uiFallbackStatus = 'fail';
          uiFallbackDetail = `UI-Kern-Felder unvollständig: monthly_limit=${simulatedMonthlyLimit} period_month=${mockPeriodMonth}`;
        } else {
          uiFallbackStatus = 'ok';
          uiFallbackDetail = `Simulation stabil: plan_status="${simulatedPlanStatus}" monthly_limit=${simulatedMonthlyLimit}`;
        }
      } catch (e) {
        uiFallbackStatus = 'fail';
        uiFallbackDetail = `UI-Simulation warf Fehler: ${e.message}`;
      }

      affectedOrgs.push({
        // ── Identifikation ────────────────────────────────────────────────────
        organization_id: orgId,
        organization_name: org.name,
        owner_email_masked: maskEmail(org.owner_email),
        created_date: org.created_date,
        platform_status: org.platform_status,

        // ── Billing-Zustand ───────────────────────────────────────────────────
        plan_id: org.plan_id || null,
        trial_stage: org.trial_stage,
        billing_status: org.billing_status,
        custom_monthly_lead_limit: org.custom_monthly_lead_limit ?? null,

        // ── Subscription ──────────────────────────────────────────────────────
        subscription_id: activeSub?.id || null,
        subscription_stripe_id: activeSub?.stripe_subscription_id || null,
        subscription_status: activeSub?.status || null,
        subscription_plan_id: activeSub?.plan_id || null,
        subscription_stripe_price_id: activeSub?.stripe_price_id || null,
        subscriptions_count: subscriptions.length,

        // ── Plan-Diagnose ─────────────────────────────────────────────────────
        plan_load_result: planLoadResult,
        plan_from_db_name: planFromDb?.name || null,
        plan_from_db_active: planFromDb?.is_active ?? null,
        root_cause: rootCause,
        root_cause_detail: rootCauseDetail,

        // ── UI-Fallback-Status ────────────────────────────────────────────────
        ui_fallback_status: uiFallbackStatus,
        ui_fallback_detail: uiFallbackDetail,

        // ── Repair-Empfehlung (kein Auto-Repair!) ─────────────────────────────
        repair_recommendation: {
          recommended_plan_id: recommendedPlanId,
          recommended_plan_name: recommendedPlanName,
          repair_confidence: repairConfidence,
          repair_method: repairMethod,
          requires_manual_review: requiresManualReview,
          action_required: recommendedPlanId
            ? `Organization.update({ id: "${orgId}", plan_id: "${recommendedPlanId}" }) — NUR nach manueller Prüfung`
            : 'Manuelle Prüfung erforderlich — kein Plan eindeutig ableitbar',
          warning: 'KEIN AUTO-REPAIR. Nur nach expliziter Admin-Genehmigung ausführen.',
        },
      });
    }

    // ── Zusammenfassung ───────────────────────────────────────────────────────
    // E2E/Test-Orgs: bekannte Datenmüll-Orgs — separat ausweisen, nicht als echte Fehler werten
    const isTestOrg = (o) => {
      const n = (o.organization_name || '').toLowerCase();
      return n.includes('test') || n.includes('e2e') || n.includes('quota test') || n.includes('real_api');
    };

    const realAffected = affectedOrgs.filter(o => !isTestOrg(o));
    const testAffected = affectedOrgs.filter(o => isTestOrg(o));

    const uiFailCount  = realAffected.filter(o => o.ui_fallback_status === 'fail').length;
    const uiWarnCount  = realAffected.filter(o => o.ui_fallback_status === 'warning').length;
    const highConf     = realAffected.filter(o => o.repair_recommendation.repair_confidence === 'high').length;
    const needsManual  = realAffected.filter(o => o.repair_recommendation.requires_manual_review).length;

    const overallStatus = uiFailCount > 0 ? 'red' : uiWarnCount > 0 ? 'yellow' : 'green';

    return Response.json({
      status: overallStatus,
      summary: {
        affected_count_real: realAffected.length,
        affected_count_test_orgs: testAffected.length,
        affected_count_total: affectedOrgs.length,
        orgs_audited: orgs.length,
        ui_fail_count: uiFailCount,
        ui_warning_count: uiWarnCount,
        repair_high_confidence: highConf,
        repair_needs_manual_review: needsManual,
        note: testAffected.length > 0
          ? `${testAffected.length} Test/E2E-Orgs separat ausgewiesen (nicht als echte Fehler gewertet)`
          : null,
      },
      acceptance_criteria: {
        no_ui_null_bars: uiFailCount === 0,
        admin_visibility: true,
        no_auto_repair: true,
      },
      available_plans: allPlans.map(p => ({
        id: p.id,
        name: p.name,
        is_active: p.is_active,
        stripe_price_id: p.stripe_price_id,
        max_leads_per_month: p.max_leads_per_month,
      })),
      affected_orgs_real: realAffected,
      affected_orgs_test: testAffected.map(o => ({
        organization_name: o.organization_name,
        plan_id: o.plan_id,
        billing_status: o.billing_status,
        trial_stage: o.trial_stage,
        root_cause: o.root_cause,
      })),
    });

  } catch (error) {
    console.error('[auditPlanMissingOrgs] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});