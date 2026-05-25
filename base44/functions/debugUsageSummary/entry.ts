// DEBUG-ONLY: Gibt usage_summary aus getDashboardData-Logik zurück (kein functions.invoke)
// Nach Debugging löschen oder deaktivieren.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);
    if (!isPlatformAdmin) return Response.json({ error: 'Admin only' }, { status: 403 });

    let requestedOrgId = null;
    try { const body = await req.json(); requestedOrgId = body?.org_id || null; } catch {}

    const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
    let org = ownerOrgs?.[0] || null;
    if (!org && requestedOrgId) {
      const r = await base44.asServiceRole.entities.Organization.filter({ id: requestedOrgId });
      org = r?.[0] || null;
    }
    if (!org) return Response.json({ error: 'No org' }, { status: 404 });

    const orgId = org.id;
    // Phase-3: kanonische Berlin-Period-Berechnung (period-utils v1.0, identisch zu getUsageSummary)
    const now = new Date();
    const _parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    const pyU = parseInt(_parts.find(p => p.type === 'year')?.value || now.getFullYear());
    const pmU = parseInt(_parts.find(p => p.type === 'month')?.value || 1);
    const periodMonthU = `${pyU}-${String(pmU).padStart(2, '0')}`;

    const [quotaSlots, usageLogsU, planData, allCompaniesRaw] = await Promise.all([
      base44.asServiceRole.entities.QuotaReservation.filter({ organization_id: orgId, period_month: periodMonthU }),
      base44.asServiceRole.entities.UsageLog.filter({ organization_id: orgId, period_month: periodMonthU }),
      org.plan_id ? base44.asServiceRole.entities.Plan.filter({ id: org.plan_id }) : Promise.resolve([]),
      base44.asServiceRole.entities.Company.filter({ organization_id: orgId }, '-created_date', 2000),
    ]);

    const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
    const usageLogValue = usageLogsU?.[0]?.leads_created || 0;

    const NON_QUOTA_RUN_IDS = new Set(['manual_setup', 'csv_import', 'manual', 'import']);
    const periodStartU = new Date(Date.UTC(pyU, pmU - 1, 1));
    const periodEndU   = new Date(Date.UTC(pyU, pmU, 1));

    const companiesFiltered = allCompaniesRaw.filter(c => {
      if (!c.research_run_id) return false;
      if (NON_QUOTA_RUN_IDS.has(c.research_run_id)) return false;
      if (c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
      if (c.source_provider === 'manual' || c.source_provider === 'csv_import') return false;
      const created = new Date(c.created_date);
      return created >= periodStartU && created < periodEndU;
    });

    const monthlyUsed = Math.max(committedSlots, usageLogValue, companiesFiltered.length);
    const plan = planData?.[0] || null;

    // Sample der letzten 5 Companies (alle, ungefiltert) für Diagnose
    const last5 = allCompaniesRaw.slice(0, 5).map(c => ({
      id: c.id, name: c.name, created_date: c.created_date,
      research_run_id: c.research_run_id, quelle: c.quelle, source_provider: c.source_provider,
    }));

    // Sample der letzten 5 qualifizierenden Companies
    const last5qualified = companiesFiltered.slice(0, 5).map(c => ({
      id: c.id, name: c.name, created_date: c.created_date, research_run_id: c.research_run_id,
    }));

    return Response.json({
      org_id: orgId,
      org_name: org.name,
      period_month: periodMonthU,
      period_start_utc: periodStartU.toISOString(),
      period_end_utc: periodEndU.toISOString(),
      monthly_used: monthlyUsed,
      committed_slots: committedSlots,
      usage_log_value: usageLogValue,
      companies_this_month: companiesFiltered.length,
      allCompaniesRaw_count: allCompaniesRaw.length,
      plan_name: plan?.name,
      monthly_limit: plan?.max_leads_per_month ?? -1,
      source_used: monthlyUsed === committedSlots ? 'quota_reservation' : monthlyUsed === usageLogValue ? 'usage_log' : 'companies_count',
      last_5_companies_raw: last5,
      last_5_companies_qualified: last5qualified,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});