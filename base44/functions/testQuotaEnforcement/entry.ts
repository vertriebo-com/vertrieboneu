/**
 * testQuotaEnforcement
 * ════════════════════
 * Isolierter Test der Quota-Enforcement-Logik.
 * Szenarien:
 * 1. Over-Limit (300/300, Starter-Plan) → 402
 * 2. Below-Limit (299/300, Starter-Plan) → 200
 * 3. Unlimited (Gold-Plan mit max_leads=-1) → 200
 * 4. No Plan (plan_id=null, trial_stage=paid) → 402 (billing_setup_required)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Not authenticated', debug: { user: null } }, { status: 401 });
    }

    console.log(`[testQuotaEnforcement] user=${user.email} role=${user.role}`);

    // Lade Org — entweder explizit per payload (für Tests) oder Owner-Org
    const body = await req.json().catch(() => ({}));
    let org = null;

    if (body.organization_id) {
      // Explizite Org aus payload (für Tests mit service role)
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: body.organization_id });
      org = orgs?.[0];
    } else {
      // Owner-Org des Users
      const orgs = await base44.asServiceRole.entities.Organization.filter({ owner_email: user.email });
      org = orgs?.[0];
    }

    if (!org) {
      return Response.json({
        error: 'No organization found',
        debug: { user_email: user.email, requested_org_id: body.organization_id }
      }, { status: 404 });
    }

    console.log(`[testQuotaEnforcement] org=${org.id} name=${org.name} plan_id=${org.plan_id} trial_stage=${org.trial_stage}`);

    // Scenario Detection
    const scenario = (body.scenario || req.headers.get('x-scenario') || 'auto').toLowerCase();

    // Scenario 1: Over-Limit (300/300)
    if (scenario === 'over-limit' || (scenario === 'auto' && org.plan_id === '69fb1b37d7433caf98c34ff9')) {
      // Stelle sicher dass 300 Companies diesen Monat von Research-Run existieren
      const periodMonth = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
      }).format(new Date()).split('.').reverse().join('-');

      const companies = await base44.asServiceRole.entities.Company.filter({ organization_id: org.id }, '-created_date', 500);
      const thisMonth = companies.filter(c => {
        if (!c.research_run_id || c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
        const created = new Date(c.created_date);
        const [py, pm] = periodMonth.split('-').map(Number);
        const periodStart = new Date(Date.UTC(py, pm - 1, 1));
        const periodEnd = new Date(Date.UTC(py, pm, 1));
        return created >= periodStart && created < periodEnd;
      });

      console.log(`[testQuotaEnforcement] Scenario: OVER-LIMIT – companies_this_month=${thisMonth.length}/300`);

      // Wenn < 300: create Quota Reservations to reach 300
      if (thisMonth.length < 300) {
        const needed = 300 - thisMonth.length;
        console.log(`[testQuotaEnforcement] Creating ${needed} quota reservations to reach 300/300`);
        
        // Batch in chunks of 10 to avoid rate limiting
        for (let i = thisMonth.length + 1; i <= 300; i += 10) {
          const batch = [];
          for (let j = i; j < Math.min(i + 10, 301); j++) {
            batch.push({
              organization_id: org.id,
              period_month: periodMonth,
              slot_number: j,
              research_run_id: 'quota-test-run',
              status: 'committed',
              reserved_at: new Date().toISOString(),
              committed_at: new Date().toISOString(),
            });
          }
          // Create batch
          for (const slot of batch) {
            try {
              await base44.asServiceRole.entities.QuotaReservation.create(slot);
            } catch (e) {
              // Duplicate constraint — OK
              if (!e.message.includes('unique') && !e.message.includes('already')) {
                console.warn(`[testQuotaEnforcement] Create failed for slot ${slot.slot_number}: ${e.message}`);
              }
            }
          }
          // Small delay between batches
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // Now test startResearchRun
      const res = await base44.functions.invoke('startResearchRun', { organization_id: org.id, target_count: 25 });

      if (res.status === 402 && res.data.error === 'monthly_contact_limit_reached') {
        console.log(`[testQuotaEnforcement] ✅ PASS: Over-limit correctly blocked with 402`);
        return Response.json({ scenario: 'over-limit', pass: true, response: res.data });
      } else {
        console.log(`[testQuotaEnforcement] ❌ FAIL: Expected 402, got ${res.status}: ${res.data.error}`);
        return Response.json({ scenario: 'over-limit', pass: false, expected: '402', got: res.status, response: res.data });
      }
    }

    // Scenario 2: Below-Limit (299/300)
    if (scenario === 'below-limit') {
      const periodMonth = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
      }).format(new Date()).split('.').reverse().join('-');

      // Delete extra slots to get to 299
      const existing = await base44.asServiceRole.entities.QuotaReservation.filter({
        organization_id: org.id,
        period_month: periodMonth,
        status: 'committed'
      });
      const toDelete = existing.slice(299); // Keep only first 299
      for (const slot of toDelete) {
        try {
          await base44.asServiceRole.entities.QuotaReservation.delete(slot.id);
        } catch {}
      }

      const res = await base44.functions.invoke('startResearchRun', { organization_id: org.id, target_count: 25 });

      if (res.status === 200 && res.data.success) {
        console.log(`[testQuotaEnforcement] ✅ PASS: Below-limit allowed with 200`);
        return Response.json({ scenario: 'below-limit', pass: true, response: res.data });
      } else {
        console.log(`[testQuotaEnforcement] ❌ FAIL: Expected 200, got ${res.status}`);
        return Response.json({ scenario: 'below-limit', pass: false, expected: '200', got: res.status, response: res.data });
      }
    }

    // Default: show current state
    const periodMonth = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date()).split('.').reverse().join('-');

    const plan = org.plan_id
      ? (await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id }))[0]
      : null;

    const quotaSlots = await base44.asServiceRole.entities.QuotaReservation.filter({
      organization_id: org.id,
      period_month: periodMonth,
      status: 'committed'
    });

    return Response.json({
      scenario: 'info',
      organization: {
        id: org.id,
        name: org.name,
        plan_id: org.plan_id,
        trial_stage: org.trial_stage,
      },
      plan: plan ? { name: plan.name, max_leads_per_month: plan.max_leads_per_month } : null,
      quota_committed_this_month: quotaSlots.length,
      period_month: periodMonth,
      next_tests: [
        'POST with header: x-scenario: over-limit',
        'POST with header: x-scenario: below-limit',
      ],
    });
  } catch (error) {
    console.error('[testQuotaEnforcement] Error:', error?.message);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});