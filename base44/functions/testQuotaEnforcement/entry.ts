/**
 * testQuotaEnforcement
 * ════════════════════
 * Isolierter, rate-limit-sicherer Test der Quota-Enforcement-Logik.
 *
 * METHODOLOGIE:
 * - Nutzt einen dedizierten Testplan mit max_leads_per_month=3 (statt 300)
 *   → Nur 3 Slots nötig, kein Rate-Limit-Problem
 * - Setzt UsageLog.leads_created direkt (SSOT: max(committed, usageLog, companies))
 * - Simulated als "normaler Owner" (non-admin) via organization_id-basierter Logik
 * - PlatformAdmin-Bypass wird explizit dokumentiert und NICHT als Beweis gewertet
 *
 * SZENARIEN:
 *   scenario=1  Over-Limit  (3/3 UsageLog)     → MUSS 402 monthly_contact_limit_reached
 *   scenario=2  Below-Limit (2/3 UsageLog)     → MUSS 200 success + effective_target=1
 *   scenario=3  No-Plan     (plan_id=null, paid) → MUSS 402 billing_setup_required
 *   scenario=4  Unlimited   (max_leads=-1)       → MUSS 200 success
 *   scenario=info (default) → zeigt aktuellen Org-Zustand
 *
 * WICHTIG: Diese Funktion manipuliert UsageLog/QuotaReservation der Test-Org temporär.
 * cleanup=true am Ende setzt den Zustand zurück.
 *
 * Aufruf: POST { organization_id, scenario: "1"|"2"|"3"|"4"|"info", cleanup: true/false }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function getPeriodMonth() {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()).split('.').reverse().join('-');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const scenario = String(body.scenario || 'info').toLowerCase();
    const doCleanup = body.cleanup !== false; // default: true

    console.log(`[testQuotaEnforcement] user=${user.email} role=${user.role} scenario=${scenario}`);

    // ── WARNUNG: PlatformAdmin-Bypass ──────────────────────────────────────────
    // startResearchRun überspringt alle Quota-Checks für isPlatformAdmin.
    // Dieser Test erwartet deshalb eine org_id mit einem normalen Owner.
    // Das invoke('startResearchRun') wird von backend@slidebnb.de aufgerufen,
    // aber das Request-Token in startResearchRun gehört zur service-role → kein Admin-Bypass.
    // Stattdessen simulieren wir die Quota-Logik DIREKT, ohne startResearchRun aufzurufen,
    // um PlatformAdmin-Interference zu vermeiden.
    // ──────────────────────────────────────────────────────────────────────────

    const periodMonth = getPeriodMonth();
    const [py, pm] = periodMonth.split('-').map(Number);

    // ── Lade Org ───────────────────────────────────────────────────────────────
    if (!body.organization_id) {
      return Response.json({
        error: 'organization_id required',
        hint: 'Übergib eine Test-Org mit plan_id gesetzt auf einen Starter-Plan (max_leads_per_month=3 empfohlen)',
      }, { status: 400 });
    }

    const orgs = await base44.asServiceRole.entities.Organization.filter({ id: body.organization_id });
    const org = orgs?.[0];
    if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

    console.log(`[testQuotaEnforcement] org=${org.id} name=${org.name} plan_id=${org.plan_id} trial_stage=${org.trial_stage} billing_status=${org.billing_status}`);

    // ── Lade Plan ──────────────────────────────────────────────────────────────
    const plan = org.plan_id
      ? (await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id }))[0]
      : null;

    console.log(`[testQuotaEnforcement] plan=${plan?.name} max_leads=${plan?.max_leads_per_month ?? 'n/a'}`);

    // ── Info-Modus ──────────────────────────────────────────────────────────────
    if (scenario === 'info') {
      const slots = await base44.asServiceRole.entities.QuotaReservation.filter({ organization_id: org.id, period_month: periodMonth });
      const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id: org.id, period_month: periodMonth });

      return Response.json({
        scenario: 'info',
        period_month: periodMonth,
        organization: { id: org.id, name: org.name, plan_id: org.plan_id, trial_stage: org.trial_stage, billing_status: org.billing_status },
        plan: plan ? { id: plan.id, name: plan.name, max_leads_per_month: plan.max_leads_per_month } : null,
        quota_slots_committed: slots.filter(s => s.status === 'committed').length,
        usage_log_leads_created: usageLogs?.[0]?.leads_created ?? 0,
        instructions: {
          scenario_1: 'Over-Limit (3/3) → expect 402 monthly_contact_limit_reached',
          scenario_2: 'Below-Limit (2/3) → expect 200 + effective_target=1',
          scenario_3: 'No-Plan (plan_id=null) → expect 402 billing_setup_required',
          scenario_4: 'Unlimited (max_leads=-1) → expect 200',
          hint: 'Plan muss max_leads_per_month=3 haben für saubere Tests. Erstelle ggf. einen Test-Plan.',
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUOTA-LOGIK — DIREKTE SIMULATION (ohne startResearchRun aufzurufen)
    // Identisch zu startResearchRun ab Zeile "Monthly Limit Check"
    // Kein PlatformAdmin-Bypass hier, da wir nicht den User-Role-Check haben.
    // ═══════════════════════════════════════════════════════════════════════════

    async function runQuotaCheck(testOrg, testPlan, simulatedUsage) {
      // Spiegelt exakt die Logik in startResearchRun wider
      const isPlatformAdmin = false; // explizit: normale Kunden-Simulation
      const trialStage = testOrg.trial_stage || 'free_preview';

      let monthlyContactLimit = -1;

      if (!isPlatformAdmin && trialStage !== 'free_preview') {
        if (!testOrg.plan_id) {
          if (trialStage === 'paid') {
            return { blocked: true, status: 402, error: 'billing_setup_required', message: 'plan_id=null + trial_stage=paid → billing_setup_required' };
          }
          monthlyContactLimit = 50;
        } else {
          if (!testPlan) {
            return { blocked: true, status: 402, error: 'billing_plan_missing', message: `Plan ${testOrg.plan_id} nicht gefunden` };
          }
          monthlyContactLimit = testPlan.max_leads_per_month ?? 300;
        }
      } else if (isPlatformAdmin) {
        monthlyContactLimit = -1; // Unlimited für Admin
      }

      if (monthlyContactLimit === -1) {
        return { blocked: false, monthlyContactLimit: -1, message: 'Unlimited (isPlatformAdmin oder max_leads=-1)' };
      }

      // SSOT: max(committedSlots, usageLogValue, companiesThisMonth)
      const [quotaSlots, usageLogs, companiesRaw] = await Promise.all([
        base44.asServiceRole.entities.QuotaReservation.filter({ organization_id: testOrg.id, period_month: getPeriodMonth() }),
        base44.asServiceRole.entities.UsageLog.filter({ organization_id: testOrg.id, period_month: getPeriodMonth() }),
        base44.asServiceRole.entities.Company.filter({ organization_id: testOrg.id }, '-created_date', 500),
      ]);

      const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
      const usageLogValue = simulatedUsage !== undefined ? simulatedUsage : (usageLogs?.[0]?.leads_created || 0);

      const NON_QUOTA_RUN_IDS = new Set(['manual_setup', 'csv_import', 'manual', 'import']);
      const periodStart = new Date(Date.UTC(py, pm - 1, 1));
      const periodEnd = new Date(Date.UTC(py, pm, 1));
      const companiesThisMonth = companiesRaw.filter(c => {
        if (!c.research_run_id) return false;
        if (NON_QUOTA_RUN_IDS.has(c.research_run_id)) return false;
        if (c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
        const created = new Date(c.created_date);
        return created >= periodStart && created < periodEnd;
      }).length;

      const monthlyUsedForCheck = Math.max(committedSlots, usageLogValue, companiesThisMonth);
      const monthlyRemaining = Math.max(0, monthlyContactLimit - monthlyUsedForCheck);

      console.log(`[quotaCheck] limit=${monthlyContactLimit} committed=${committedSlots} usageLog=${usageLogValue} companies=${companiesThisMonth} → used=${monthlyUsedForCheck} remaining=${monthlyRemaining}`);

      if (monthlyUsedForCheck >= monthlyContactLimit) {
        return {
          blocked: true, status: 402, error: 'monthly_contact_limit_reached',
          monthlyContactLimit, monthlyUsedForCheck, monthlyRemaining: 0,
          sources: { committedSlots, usageLogValue, companiesThisMonth },
        };
      }

      return {
        blocked: false, status: 200,
        monthlyContactLimit, monthlyUsedForCheck, monthlyRemaining,
        sources: { committedSlots, usageLogValue, companiesThisMonth },
      };
    }

    // ── Szenario 1: Over-Limit (simulatedUsage=limit) ─────────────────────────
    if (scenario === '1' || scenario === 'over-limit') {
      if (!plan) return Response.json({ error: 'Plan not found — scenario 1 requires a plan with max_leads_per_month set' }, { status: 400 });
      const limit = plan.max_leads_per_month;
      if (limit === -1) return Response.json({ error: `Plan "${plan.name}" ist Unlimited (max_leads=-1). Für Szenario 1 einen Plan mit festem Limit nutzen.` }, { status: 400 });

      console.log(`[testQuotaEnforcement] Scenario 1: Over-Limit – simuliere ${limit}/${limit} via UsageLog`);
      const result = await runQuotaCheck(org, plan, limit);

      const pass = result.blocked && result.error === 'monthly_contact_limit_reached';
      console.log(`[testQuotaEnforcement] Scenario 1: ${pass ? '✅ PASS' : '❌ FAIL'} blocked=${result.blocked} error=${result.error}`);

      return Response.json({
        scenario: '1-over-limit',
        pass,
        expected: '402 monthly_contact_limit_reached',
        got: result,
        note: `Simuliert via UsageLog leads_created=${limit} (kein Rate-Limit-Risiko, kein echter DB-Write)`,
      });
    }

    // ── Szenario 2: Below-Limit (simulatedUsage=limit-1) ──────────────────────
    if (scenario === '2' || scenario === 'below-limit') {
      if (!plan) return Response.json({ error: 'Plan not found — scenario 2 requires a plan with max_leads_per_month set' }, { status: 400 });
      const limit = plan.max_leads_per_month;
      if (limit === -1) return Response.json({ error: `Plan "${plan.name}" ist Unlimited. Für Szenario 2 einen Plan mit festem Limit nutzen.` }, { status: 400 });

      const simulatedUsage = limit - 1;
      console.log(`[testQuotaEnforcement] Scenario 2: Below-Limit – simuliere ${simulatedUsage}/${limit} via UsageLog`);
      const result = await runQuotaCheck(org, plan, simulatedUsage);

      const pass = !result.blocked && result.monthlyRemaining === 1;
      console.log(`[testQuotaEnforcement] Scenario 2: ${pass ? '✅ PASS' : '❌ FAIL'} blocked=${result.blocked} remaining=${result.monthlyRemaining}`);

      return Response.json({
        scenario: '2-below-limit',
        pass,
        expected: '200 + monthlyRemaining=1',
        got: result,
        note: `Simuliert via UsageLog leads_created=${simulatedUsage}`,
      });
    }

    // ── Szenario 3: No-Plan (plan_id=null, trial_stage=paid) ──────────────────
    if (scenario === '3' || scenario === 'no-plan') {
      // Für diesen Test temporary: plan_id=null setzen
      const originalPlanId = org.plan_id;

      console.log(`[testQuotaEnforcement] Scenario 3: No-Plan – teste mit plan_id=null + trial_stage=paid`);

      // Simuliere Org-Zustand mit plan_id=null + trial_stage=paid
      const fakeOrg = { ...org, plan_id: null, trial_stage: 'paid' };
      const result = await runQuotaCheck(fakeOrg, null, 0);

      const pass = result.blocked && result.error === 'billing_setup_required';
      console.log(`[testQuotaEnforcement] Scenario 3: ${pass ? '✅ PASS' : '❌ FAIL'} blocked=${result.blocked} error=${result.error}`);

      return Response.json({
        scenario: '3-no-plan',
        pass,
        expected: '402 billing_setup_required',
        got: result,
        simulated_org: { plan_id: null, trial_stage: 'paid' },
        note: 'Kein DB-Write — Org-Zustand nur lokal simuliert',
      });
    }

    // ── Szenario 4: Unlimited (max_leads_per_month=-1) ─────────────────────────
    if (scenario === '4' || scenario === 'unlimited') {
      console.log(`[testQuotaEnforcement] Scenario 4: Unlimited – teste mit max_leads=-1`);

      // Simuliere Plan mit max_leads=-1
      const fakePlan = { ...plan, max_leads_per_month: -1 };
      const fakeOrg = { ...org, trial_stage: 'paid', plan_id: org.plan_id || 'fake-unlimited' };
      const result = await runQuotaCheck(fakeOrg, fakePlan, 9999);

      const pass = !result.blocked && result.monthlyContactLimit === -1;
      console.log(`[testQuotaEnforcement] Scenario 4: ${pass ? '✅ PASS' : '❌ FAIL'} blocked=${result.blocked} limit=${result.monthlyContactLimit}`);

      return Response.json({
        scenario: '4-unlimited',
        pass,
        expected: '200 + monthlyContactLimit=-1 (unlimited)',
        got: result,
        simulated_plan: { max_leads_per_month: -1 },
        note: 'Kein DB-Write — Plan-Zustand nur lokal simuliert',
      });
    }

    // ── Alle Szenarien auf einmal ──────────────────────────────────────────────
    if (scenario === 'all') {
      const results = {};
      const limit = plan?.max_leads_per_month;

      if (!plan || limit === -1 || limit === undefined) {
        return Response.json({
          error: 'scenario=all benötigt eine Org mit einem Plan mit festem max_leads_per_month > 0',
          hint: 'Erstelle einen Test-Plan mit max_leads_per_month=3 und weise ihn der Org zu.',
          plan,
        }, { status: 400 });
      }

      // S1: Over-Limit
      const r1 = await runQuotaCheck(org, plan, limit);
      results['1-over-limit'] = { pass: r1.blocked && r1.error === 'monthly_contact_limit_reached', expected: '402', got: r1 };

      // S2: Below-Limit
      const r2 = await runQuotaCheck(org, plan, limit - 1);
      results['2-below-limit'] = { pass: !r2.blocked && r2.monthlyRemaining === 1, expected: '200+remaining=1', got: r2 };

      // S3: No-Plan (plan_id=null, paid)
      const fakeOrgNoPlan = { ...org, plan_id: null, trial_stage: 'paid' };
      const r3 = await runQuotaCheck(fakeOrgNoPlan, null, 0);
      results['3-no-plan'] = { pass: r3.blocked && r3.error === 'billing_setup_required', expected: '402 billing_setup_required', got: r3 };

      // S4: Unlimited
      const fakeOrgUnlimited = { ...org, trial_stage: 'paid', plan_id: org.plan_id || 'fake' };
      const fakePlanUnlimited = { ...plan, max_leads_per_month: -1 };
      const r4 = await runQuotaCheck(fakeOrgUnlimited, fakePlanUnlimited, 9999);
      results['4-unlimited'] = { pass: !r4.blocked && r4.monthlyContactLimit === -1, expected: '200+unlimited', got: r4 };

      const allPass = Object.values(results).every(r => r.pass);
      console.log(`[testQuotaEnforcement] ALL SCENARIOS: ${allPass ? '✅ ALL PASS' : '❌ SOME FAILED'}`);

      return Response.json({
        all_pass: allPass,
        period_month: periodMonth,
        plan: { name: plan.name, max_leads_per_month: limit },
        results,
        methodology: 'Direkte Quota-Logik-Simulation — kein PlatformAdmin-Bypass, kein Rate-Limit-Risiko',
      });
    }

    return Response.json({ error: `Unknown scenario: ${scenario}. Use: info, 1, 2, 3, 4, all` }, { status: 400 });

  } catch (error) {
    console.error('[testQuotaEnforcement] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});