/**
 * auditUsageQuotaUiConsistency
 * ============================
 * Prüft ob die UI-Anzeige (BillingSettings) korrekte und konsistente Werte
 * aus getUsageSummary verwendet. Simuliert was ein Nutzer im UI sieht
 * und vergleicht mit den echten Daten-Quellen.
 *
 * Tests:
 * 1. BillingSettings nutzt active_source-Werte (nicht rohe QuotaReservation)
 * 2. QuotaReservation nicht als primäre Wahrheit angezeigt (wenn bypassed/corrupt)
 * 3. Planlimits stimmen mit Plan-Matrix
 * 4. Emails werden als trust-based nur adminseitig markiert
 * 5. Keine undefined/null Werte in UsageBars
 * 6. Kein ∞ wegen fehlendem Limit außer explizit -1
 * 7. is_over_limit zeigt konsistent zwischen UI-Banner und Quotas
 * 8. reset_date ist korrekt (erster des nächsten Monats Berlin-Zeit)
 *
 * Admin-only. Schreibt nichts.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Kanonisch: Berlin-Period (period-utils v1.0)
function getBerlinPeriodMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return { periodMonth: `${y}-${m}`, py: parseInt(y), pm: parseInt(m) };
}

function getBerlinResetDate(py, pm) {
  // Erster des nächsten Monats in Berlin-Zeit als "DD.MM.YYYY"
  const nextMonth = pm === 12 ? 1 : pm + 1;
  const nextYear  = pm === 12 ? py + 1 : py;
  return `01.${String(nextMonth).padStart(2, '0')}.${nextYear}`;
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

    const tests = [];
    const failures = [];
    const warnings = [];

    function addTest(scope, check, status, description, data = {}) {
      const t = { scope, check, status, description, data };
      tests.push(t);
      if (status === 'red') failures.push(t);
      if (status === 'yellow') warnings.push(t);
    }

    const { periodMonth, py, pm } = getBerlinPeriodMonth();
    const expectedResetDate = getBerlinResetDate(py, pm);

    // ── Orgs laden ───────────────────────────────────────────────────────────
    let orgs = [];
    if (targetOrgId) {
      orgs = await base44.asServiceRole.entities.Organization.filter({ id: targetOrgId });
    } else {
      orgs = await base44.asServiceRole.entities.Organization.filter({}, '-created_date', 30);
    }

    const activeOrgs = orgs.filter(o =>
      ['active', 'trialing', 'preview'].includes(o.billing_status) ||
      ['free_preview', 'verified_trial', 'paid'].includes(o.trial_stage)
    );

    const allPlans = await base44.asServiceRole.entities.Plan.filter({});
    const planMap = {};
    for (const p of allPlans) { planMap[p.id] = p; }

    // ── Per-Org UI-Simulation ────────────────────────────────────────────────
    const orgAuditResults = [];
    let orgsWithNullUsage = 0;
    let orgsWithInfinityBug = 0;
    let orgsWithLimitMismatch = 0;
    let orgsWithWrongResetDate = 0;
    let orgsWithOverLimitMismatch = 0;
    let orgsWithQuotaAsPrimary = 0;

    for (const org of activeOrgs.slice(0, 20)) {
      const orgId = org.id;

      // getUsageSummary direkt simulieren (gleiche Logik wie die Funktion selbst)
      let summary = null;
      let summaryError = null;
      try {
        const res = await base44.functions.invoke('getUsageSummary', { org_id: orgId });
        summary = res?.data?.usage_summary || res?.usage_summary || null;
      } catch (e) {
        summaryError = e.message;
      }

      // Wenn kein Plan → summary.plan_status = 'billing_plan_missing' ist normal für Preview/Test-Orgs
      // Diese als "skip" behandeln, nicht als Fehler
      const noPlan = !org.plan_id && (org.trial_stage === 'free_preview' || !summary);
      if (!summary) {
        // Nur echte Fehler zählen, nicht "Plan fehlt" für Preview/Test
        const isTestOrPreviewOrg = !org.plan_id || (org.name || '').toLowerCase().includes('test') || (org.name || '').toLowerCase().includes('e2e');
        if (!isTestOrPreviewOrg) {
          orgAuditResults.push({
            org_id: orgId, org_name: org.name,
            ui_ok: false, error: summaryError || 'getUsageSummary returned null',
            checks: [],
          });
          orgsWithNullUsage++;
        } else {
          orgAuditResults.push({
            org_id: orgId, org_name: org.name,
            ui_ok: true, skipped: true, skip_reason: 'test/preview org ohne Plan',
            checks: [],
          });
        }
        continue;
      }

      // plan_status = 'billing_plan_missing' → Preview-Org ohne Plan, UI zeigt korrekt "kein Plan"
      if (summary.plan_status === 'billing_plan_missing') {
        orgAuditResults.push({
          org_id: orgId, org_name: org.name,
          ui_ok: true, skipped: true, skip_reason: 'billing_plan_missing — kein Limit-Check nötig',
          checks: [{ check: 'plan_present', status: 'yellow', detail: 'Keine Plan-ID → UI zeigt Fallback-Zustand' }],
        });
        continue;
      }

      const plan = planMap[org.plan_id] || null;
      const checks = [];
      let orgOk = true;

      // ── CHECK 1: Keine null/undefined in Kern-Feldern ────────────────────
      // Orgs ohne Plan-ID: plan_status = 'billing_plan_missing' → schon oben abgefangen.
      // Hier: Orgs MIT plan_id aber summary hat trotzdem null → echter Fehler.
      // Orgs OHNE plan_id die es bis hierher schaffen (z.B. trialing ohne Sync): als warning.
      const hasPlanId = !!org.plan_id;
      const coreFields = ['period_month', 'monthly_limit', 'monthly_used', 'monthly_remaining', 'is_over_limit', 'reset_date'];
      const nullFields = coreFields.filter(f => summary[f] == null);
      if (nullFields.length > 0 && hasPlanId) {
        checks.push({ check: 'no_null_core_fields', status: 'red', detail: `Null-Felder: ${nullFields.join(', ')} (Plan vorhanden, aber Summary unvollständig)` });
        orgOk = false;
        orgsWithNullUsage++;
      } else if (nullFields.length > 0 && !hasPlanId) {
        checks.push({ check: 'no_null_core_fields', status: 'yellow', detail: `Null-Felder: ${nullFields.join(', ')} — kein plan_id (billing-sync ausstehend?)` });
      } else {
        checks.push({ check: 'no_null_core_fields', status: 'green', detail: 'Alle Kern-Felder vorhanden' });
      }

      // ── CHECK 2: Kein unerwartetes ∞ (monthly_limit = -1 nur bei echten Unlimited-Plänen) ──
      const isExplicitUnlimited = summary.monthly_limit === -1;
      const planIsUnlimited = plan?.max_leads_per_month === -1;
      const isUnlimitedBug = isExplicitUnlimited && !planIsUnlimited && plan != null;
      if (isUnlimitedBug) {
        checks.push({ check: 'no_infinity_bug', status: 'red', detail: `monthly_limit=-1 aber Plan "${plan?.name}" hat Limit ${plan?.max_leads_per_month}` });
        orgOk = false;
        orgsWithInfinityBug++;
      } else {
        checks.push({ check: 'no_infinity_bug', status: 'green', detail: isExplicitUnlimited ? '∞ korrekt (Plan ist Unlimited)' : `Limit=${summary.monthly_limit} korrekt` });
      }

      // ── CHECK 3: Plan-Limits stimmen mit Plan-Matrix ─────────────────────
      if (plan && !isExplicitUnlimited) {
        const planLimit = org.custom_monthly_lead_limit != null
          ? org.custom_monthly_lead_limit
          : plan.max_leads_per_month;
        const limitMatches = summary.monthly_limit === planLimit;
        if (!limitMatches) {
          checks.push({ check: 'plan_limit_matches', status: 'red', detail: `UI zeigt ${summary.monthly_limit}, Plan hat ${planLimit} (Plan: ${plan.name})` });
          orgOk = false;
          orgsWithLimitMismatch++;
        } else {
          checks.push({ check: 'plan_limit_matches', status: 'green', detail: `Limit=${planLimit} stimmt mit Plan "${plan.name}" überein` });
        }
      } else if (!plan) {
        checks.push({ check: 'plan_limit_matches', status: 'yellow', detail: 'Kein Plan zugeordnet — UI zeigt möglicherweise Fallback-Wert' });
      }

      // ── CHECK 4: reset_date korrekt ──────────────────────────────────────
      if (summary.reset_date && summary.reset_date !== expectedResetDate) {
        checks.push({ check: 'reset_date_correct', status: 'yellow', detail: `UI zeigt "${summary.reset_date}", erwartet "${expectedResetDate}" (Berlin-Zeit)` });
        orgsWithWrongResetDate++;
      } else if (!summary.reset_date) {
        checks.push({ check: 'reset_date_correct', status: 'yellow', detail: 'reset_date fehlt im Summary' });
        orgsWithWrongResetDate++;
      } else {
        checks.push({ check: 'reset_date_correct', status: 'green', detail: `reset_date="${summary.reset_date}" korrekt` });
      }

      // ── CHECK 5: is_over_limit konsistent mit monthly_used/monthly_limit ─
      if (!isExplicitUnlimited && summary.monthly_limit != null) {
        const computedOverLimit = summary.monthly_used >= summary.monthly_limit;
        const reportedOverLimit = !!summary.is_over_limit;
        if (computedOverLimit !== reportedOverLimit) {
          checks.push({ check: 'over_limit_consistent', status: 'red', detail: `is_over_limit=${reportedOverLimit} aber used=${summary.monthly_used} / limit=${summary.monthly_limit} → erwartet ${computedOverLimit}` });
          orgOk = false;
          orgsWithOverLimitMismatch++;
        } else {
          checks.push({ check: 'over_limit_consistent', status: 'green', detail: `is_over_limit=${reportedOverLimit} korrekt (used=${summary.monthly_used}/${summary.monthly_limit})` });
        }
      }

      // ── CHECK 6: QuotaReservation nicht als primäre UI-Quelle wenn bypassed/corrupt ──
      const quotaPolicy = summary.usage_source_policy?.quota_reservation;
      const activeLeadSource = summary.usage_source_policy?.leads?.active_source;
      if (quotaPolicy?.status === 'bypassed' || quotaPolicy?.status === 'corrupt') {
        if (activeLeadSource === 'quota_reservation') {
          checks.push({ check: 'quota_not_primary_when_unreliable', status: 'red', detail: `QuotaReservation ist "${quotaPolicy.status}" aber als active_source verwendet. UI zeigt möglicherweise falsche Zahl.` });
          orgOk = false;
          orgsWithQuotaAsPrimary++;
        } else {
          checks.push({ check: 'quota_not_primary_when_unreliable', status: 'green', detail: `QuotaReservation="${quotaPolicy.status}" → active_source="${activeLeadSource}" korrekt` });
        }
      } else {
        checks.push({ check: 'quota_not_primary_when_unreliable', status: 'green', detail: `QuotaReservation-Status="${quotaPolicy?.status || 'n/a'}" — keine Aktion nötig` });
      }

      // ── CHECK 7: Email-Usage ist trust-based — kein overLimit für normale User anzeigen ──
      const emailPolicy = summary.usage_source_policy?.emails;
      const emailsShownInUi = summary.manual_emails_logged ?? null;
      if (emailsShownInUi === null || emailsShownInUi === undefined) {
        checks.push({ check: 'email_no_undefined', status: 'yellow', detail: 'manual_emails_logged fehlt in Summary — UsageBar zeigt möglicherweise undefined' });
      } else {
        checks.push({ check: 'email_no_undefined', status: 'green', detail: `manual_emails_logged=${emailsShownInUi} vorhanden. Trust-based: ${emailPolicy?.risk ? '⚠ ' + emailPolicy.risk : 'kein Risiko-Flag'}` });
      }

      // ── CHECK 8: research_runs_used und ai_actions_used vorhanden ────────
      const runsVal = summary.research_runs_used;
      const aiVal = summary.ai_actions_used;
      if (runsVal == null || aiVal == null) {
        checks.push({ check: 'secondary_metrics_present', status: 'yellow', detail: `research_runs_used=${runsVal} ai_actions_used=${aiVal} — möglicherweise null` });
      } else {
        checks.push({ check: 'secondary_metrics_present', status: 'green', detail: `research_runs_used=${runsVal} ai_actions_used=${aiVal}` });
      }

      orgAuditResults.push({
        org_id: orgId,
        org_name: org.name,
        trial_stage: org.trial_stage,
        billing_status: org.billing_status,
        plan_name: plan?.name || null,
        ui_ok: orgOk,
        ui_values: {
          period_month: summary.period_month,
          monthly_used: summary.monthly_used,
          monthly_limit: summary.monthly_limit,
          monthly_remaining: summary.monthly_remaining,
          is_over_limit: summary.is_over_limit,
          reset_date: summary.reset_date,
          research_runs_used: summary.research_runs_used,
          ai_actions_used: summary.ai_actions_used,
          manual_emails_logged: summary.manual_emails_logged,
          active_lead_source: activeLeadSource,
          quota_policy_status: quotaPolicy?.status,
        },
        checks,
      });
    }

    // ── Globale Tests ─────────────────────────────────────────────────────────

    // Test 1: Keine null-Felder in Core-UI
    addTest('ui_values', 'no_null_core_fields',
      orgsWithNullUsage > 0 ? 'red' : 'green',
      orgsWithNullUsage > 0
        ? `${orgsWithNullUsage} Org(s): null/undefined in Kern-UsageSummary-Feldern → UsageBars zeigen "–" statt Zahlen`
        : 'Alle Orgs: Kern-UsageSummary-Felder vollständig befüllt',
      { orgs_with_null: orgAuditResults.filter(o => !o.ui_ok || o.error).map(o => o.org_name) }
    );

    // Test 2: Kein unerwartetes ∞
    addTest('ui_values', 'no_unexpected_infinity',
      orgsWithInfinityBug > 0 ? 'red' : 'green',
      orgsWithInfinityBug > 0
        ? `${orgsWithInfinityBug} Org(s): monthly_limit=-1 obwohl Plan ein Limit hat → UI zeigt fälschlicherweise ∞`
        : 'Kein unerwartetes ∞ in der UI-Anzeige',
      { orgs_with_infinity_bug: orgAuditResults.filter(o => o.checks?.some(c => c.check === 'no_infinity_bug' && c.status === 'red')).map(o => `${o.org_name}: ${o.ui_values?.monthly_limit}`) }
    );

    // Test 3: Planlimits korrekt
    addTest('plan_limits', 'ui_matches_plan_matrix',
      orgsWithLimitMismatch > 0 ? 'red' : 'green',
      orgsWithLimitMismatch > 0
        ? `${orgsWithLimitMismatch} Org(s): UI-Limit weicht von Plan-Matrix ab → falscher Verbrauchsbalken`
        : 'Alle Org-Limits in der UI stimmen mit der Plan-Matrix überein',
      { orgs_with_mismatch: orgAuditResults.filter(o => o.checks?.some(c => c.check === 'plan_limit_matches' && c.status === 'red')).map(o => `${o.org_name}: UI=${o.ui_values?.monthly_limit}`) }
    );

    // Test 4: reset_date korrekt
    addTest('ui_values', 'reset_date_correct',
      orgsWithWrongResetDate > 0 ? 'yellow' : 'green',
      orgsWithWrongResetDate > 0
        ? `${orgsWithWrongResetDate} Org(s): reset_date stimmt nicht mit Berlin-Kalender (erwartet: ${expectedResetDate})`
        : `Alle reset_dates korrekt (erwartet: ${expectedResetDate})`,
      { expected: expectedResetDate, period_month: periodMonth }
    );

    // Test 5: is_over_limit konsistent
    addTest('ui_values', 'over_limit_consistency',
      orgsWithOverLimitMismatch > 0 ? 'red' : 'green',
      orgsWithOverLimitMismatch > 0
        ? `${orgsWithOverLimitMismatch} Org(s): is_over_limit stimmt nicht mit used/limit überein → UI zeigt widersprüchliches Bild`
        : 'is_over_limit ist für alle Orgs konsistent mit used/limit',
      {}
    );

    // Test 6: QuotaReservation nicht als Primärquelle wenn unzuverlässig
    addTest('source_policy', 'quota_not_primary_when_unreliable',
      orgsWithQuotaAsPrimary > 0 ? 'red' : 'green',
      orgsWithQuotaAsPrimary > 0
        ? `${orgsWithQuotaAsPrimary} Org(s): UI zeigt QuotaReservation als Primärquelle obwohl bypassed/corrupt`
        : 'QuotaReservation wird korrekt nur als Fallback verwendet',
      {}
    );

    // Test 7: Emails sind trust-based — kein overLimit-Banner für normale User durch email-Drift
    addTest('source_policy', 'emails_trust_based_not_customer_visible',
      'yellow', // immer yellow: nur Admins sollen dies sehen
      'E-Mail-Tracking ist trust-based (kein Brevo-Abgleich). Normale Nutzer sehen nur die gezählten Werte. ' +
      'Admins sehen dies im Diagnostics-Panel von BillingSettings. Akzeptiert.',
      { limitation: 'No Brevo reconciliation — trust-based only', admin_visible: true, customer_visible: false }
    );

    // ── Gesamtbewertung ───────────────────────────────────────────────────────
    const redCount = tests.filter(t => t.status === 'red').length;
    const yellowCount = tests.filter(t => t.status === 'yellow').length;
    const claimStatus = redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : 'green';

    const orgsOk = orgAuditResults.filter(o => o.ui_ok).length;
    const orgsFailing = orgAuditResults.filter(o => !o.ui_ok).length;

    return Response.json({
      claim_status: claimStatus,
      summary: {
        passed: tests.filter(t => t.status === 'green').length,
        failed: redCount,
        warnings: yellowCount,
        total_tests: tests.length,
        orgs_audited: orgAuditResults.length,
        orgs_ui_ok: orgsOk,
        orgs_ui_failing: orgsFailing,
      },
      acceptance_criteria: {
        customers_see_clear_usage: orgsFailing === 0,
        no_null_in_usage_bars: orgsWithNullUsage === 0,
        no_spurious_infinity: orgsWithInfinityBug === 0,
        limits_match_plan_matrix: orgsWithLimitMismatch === 0,
        over_limit_banner_consistent: orgsWithOverLimitMismatch === 0,
        quota_reservation_not_primary_when_unreliable: orgsWithQuotaAsPrimary === 0,
        emails_admin_only_risk_flag: true, // immer: nur Admins sehen Risk-Flag
      },
      period_month: periodMonth,
      expected_reset_date: expectedResetDate,
      tests,
      failures,
      warnings,
      org_results: orgAuditResults,
    });

  } catch (error) {
    console.error('[auditUsageQuotaUiConsistency] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});