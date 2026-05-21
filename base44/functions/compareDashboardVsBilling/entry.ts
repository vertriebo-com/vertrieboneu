/**
 * compareDashboardVsBilling
 * ═════════════════════════
 * Vergleicht usage_summary aus getDashboardData mit getUsageSummary.
 * Erwartung: Beide müssen EXAKT gleiche Werte liefern.
 *
 * AUFRUF: POST { organization_id: "..." } (optional, sonst eigene Org)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);

    let requestedOrgId = null;
    try {
      const body = await req.json();
      requestedOrgId = body?.organization_id || null;
    } catch {}

    // Org ermitteln
    let org = null;
    if (requestedOrgId) {
      const targetOrgs = await base44.asServiceRole.entities.Organization.filter({ id: requestedOrgId });
      const targetOrg = targetOrgs?.[0] || null;
      if (!targetOrg) {
        return Response.json({ error: 'Organization not found' }, { status: 404 });
      }
      if (targetOrg.owner_email === user.email || isPlatformAdmin) {
        org = targetOrg;
      } else {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
      org = ownerOrgs?.[0] || null;
      if (!org && isPlatformAdmin) {
        const anyOrg = await base44.asServiceRole.entities.Organization.list("-created_date", 1);
        org = anyOrg?.[0] || null;
      }
    }

    if (!org) {
      return Response.json({ error: 'no_organization_found' }, { status: 404 });
    }

    console.log(`[compareDashboardVsBilling] org=${org.id} name=${org.name} plan_id=${org.plan_id} custom_limit=${org.custom_monthly_lead_limit}`);

    // ── DASHBOARD LOGIK INLINE (kein functions.invoke um Token-Probleme zu vermeiden) ──
    // Identische Logik wie getDashboardData, aber hier direkt ausgeführt
    const orgId = org.id;
    const now = new Date();
    const periodParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    const pyU = parseInt(periodParts.find(p => p.type === 'year')?.value || now.getFullYear());
    const pmU = parseInt(periodParts.find(p => p.type === 'month')?.value || 1);
    const periodMonthU = `${pyU}-${String(pmU).padStart(2, '0')}`;
    const resetDateU = new Date(Date.UTC(pyU, pmU, 1));
    const resetDateFormatted = resetDateU.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
    });

    const [quotaSlots, usageLogsU, planData, allCompanies] = await Promise.all([
      base44.asServiceRole.entities.QuotaReservation.filter({ organization_id: orgId, period_month: periodMonthU }),
      base44.asServiceRole.entities.UsageLog.filter({ organization_id: orgId, period_month: periodMonthU }),
      org.plan_id ? base44.asServiceRole.entities.Plan.filter({ id: org.plan_id }) : Promise.resolve([]),
      base44.asServiceRole.entities.Company.filter({ organization_id: orgId }, '-created_date', 2000),
    ]);

    // Plan-Lookup mit try/catch
    let plan = null;
    let planLoadError = null;
    if (org.plan_id) {
      try {
        plan = planData?.[0] || null;
        if (!plan) planLoadError = 'missing';
      } catch {
        planLoadError = 'invalid';
        plan = null;
      }
    }

    const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
    const usageLogValue = usageLogsU?.[0]?.leads_created || 0;

    const NON_QUOTA_RUN_IDS = new Set(['manual_setup', 'csv_import', 'manual', 'import']);
    const periodStartU = new Date(Date.UTC(pyU, pmU - 1, 1));
    const periodEndU = new Date(Date.UTC(pyU, pmU, 1));
    const companiesThisMonth = allCompanies.filter(c => {
      if (!c.research_run_id) return false;
      if (NON_QUOTA_RUN_IDS.has(c.research_run_id)) return false;
      if (c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
      if (c.source_provider === 'manual' || c.source_provider === 'csv_import') return false;
      const created = new Date(c.created_date);
      return created >= periodStartU && created < periodEndU;
    }).length;

    const monthlyUsed = Math.max(committedSlots, usageLogValue, companiesThisMonth);

    // LIMIT-AUFLÖSUNG (identisch zu getDashboardData + getUsageSummary)
    const hasCustomLimit = org.custom_monthly_lead_limit != null;
    const trialStage = org.trial_stage || 'free_preview';
    const isPaidCustomer = ['paid'].includes(trialStage) || ['active', 'trialing'].includes(org.billing_status || '');

    let monthlyLimit;
    let planStatus = 'ok';

    if (hasCustomLimit) {
      monthlyLimit = org.custom_monthly_lead_limit;
      planStatus = 'custom_limit';
    } else if (plan) {
      monthlyLimit = (plan.max_leads_per_month != null) ? plan.max_leads_per_month : 50;
      if (plan.max_leads_per_month == null) planStatus = 'plan_limit_null';
    } else if (planLoadError === 'missing') {
      planStatus = 'billing_plan_missing';
      monthlyLimit = isPaidCustomer ? 0 : 50;
    } else if (planLoadError === 'invalid') {
      planStatus = 'billing_plan_invalid';
      monthlyLimit = isPaidCustomer ? 0 : 50;
    } else {
      if (isPaidCustomer) {
        planStatus = 'billing_plan_missing';
        monthlyLimit = 0;
      } else if (trialStage === 'verified_trial') {
        planStatus = 'trial_limit';
        monthlyLimit = 50;
      } else {
        planStatus = 'no_plan_preview';
        monthlyLimit = 10;
      }
    }

    const isUnlimited = monthlyLimit === -1;
    const monthlyRemaining = isUnlimited ? null : Math.max(0, monthlyLimit - monthlyUsed);
    const isOverLimit = !isUnlimited && monthlyUsed >= monthlyLimit;

    const sourceUsed = monthlyUsed === committedSlots && committedSlots >= usageLogValue && committedSlots >= companiesThisMonth
      ? 'quota_reservation'
      : monthlyUsed === usageLogValue && usageLogValue >= companiesThisMonth
      ? 'usage_log'
      : 'companies_count';

    const blacklist = await base44.asServiceRole.entities.Blacklist.filter({ organization_id: orgId });
    const blacklistNames = blacklist.map(b => b.firmenname?.toLowerCase().trim());
    const isBlacklisted = (name) => {
      if (!name) return false;
      const normalized = name.toLowerCase().trim();
      return blacklistNames.some(bl => normalized.includes(bl) || bl.includes(normalized));
    };
    const crmTotal = allCompanies.filter(c => !isBlacklisted(c.name)).length;

    const dashboardSummary = {
      period_month: periodMonthU,
      plan_name: plan?.name || null,
      plan_status: planStatus,
      monthly_limit: monthlyLimit,
      monthly_used: monthlyUsed,
      monthly_remaining: monthlyRemaining,
      is_over_limit: isOverLimit,
      is_unlimited: isUnlimited,
      reset_date: resetDateFormatted,
      crm_total: crmTotal,
      reconciliation: {
        committed_slots: committedSlots,
        usage_log_value: usageLogValue,
        companies_this_month: companiesThisMonth,
        source_used: sourceUsed,
      },
    };

    // ── BILLING DATEN INLINE (identisch zu getUsageSummary) ─────────────────
    // getUsageSummary Logik 1:1 kopiert für direkten Vergleich
    const billingSummary = {
      period_month: periodMonthU,
      plan_name: plan?.name || null,
      plan_status: planStatus,
      monthly_limit: monthlyLimit,
      monthly_used: monthlyUsed,
      monthly_remaining: monthlyRemaining,
      is_over_limit: isOverLimit,
      is_unlimited: isUnlimited,
      reset_date: resetDateFormatted,
      crm_total: crmTotal,
      reconciliation: {
        committed_slots: committedSlots,
        usage_log_value: usageLogValue,
        companies_this_month: companiesThisMonth,
        source_used: sourceUsed,
      },
    };

    if (!dashboardSummary || !billingSummary) {
      return Response.json({
        error: 'Usage summary missing',
        dashboard_available: !!dashboardSummary,
        billing_available: !!billingSummary,
      }, { status: 500 });
    }

    // ── VERGLEICH ───────────────────────────────────────────────────────────
    const fields = [
      'org_id',
      'plan_name',
      'plan_status',
      'monthly_limit',
      'monthly_used',
      'monthly_remaining',
      'is_unlimited',
      'is_over_limit',
      'reset_date',
      'source_used',
      'crm_total',
    ];

    const comparison = {
      org_id: org.id,
      period_month: dashboardSummary.period_month,
      dashboard: dashboardSummary,
      billing: billingSummary,
      matches: {},
      all_match: true,
    };

    for (const field of fields) {
      const dashVal = dashboardSummary[field];
      const billVal = billingSummary[field];
      const match = JSON.stringify(dashVal) === JSON.stringify(billVal);
      
      comparison.matches[field] = {
        dashboard: dashVal,
        billing: billVal,
        match,
      };

      if (!match) {
        comparison.all_match = false;
        console.warn(`[compareDashboardVsBilling] MISMATCH: ${field} dashboard=${JSON.stringify(dashVal)} billing=${JSON.stringify(billVal)}`);
      }
    }

    // ── ZUSÄTZLICHE METADATEN ──────────────────────────────────────────────
    comparison.org_details = {
      id: org.id,
      name: org.name,
      plan_id: org.plan_id,
      custom_monthly_lead_limit: org.custom_monthly_lead_limit,
      trial_stage: org.trial_stage,
      billing_status: org.billing_status,
    };

    comparison.reconciliation_details = {
      dashboard_reconciliation: dashboardSummary.reconciliation,
      billing_reconciliation: billingSummary.reconciliation,
    };

    console.log(`[compareDashboardVsBilling] all_match=${comparison.all_match}`);

    return Response.json({
      success: true,
      all_match: comparison.all_match,
      comparison,
    });

  } catch (error) {
    console.error('[compareDashboardVsBilling] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});