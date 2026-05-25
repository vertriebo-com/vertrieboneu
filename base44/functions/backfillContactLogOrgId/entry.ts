/**
 * backfillContactLogOrgId
 * 
 * Füllt fehlende organization_id in ContactLogs aus der verknüpften Company.
 * Sicher: löscht nichts, rät nichts, meldet nur was nicht reparierbar ist.
 * 
 * Admin-only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && !["platform_owner", "platform_admin"].includes(user?.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 1. Alle ContactLogs ohne organization_id laden
    const allLogs = await base44.asServiceRole.entities.ContactLog.list('-created_date', 1000);
    const logsWithoutOrg = allLogs.filter(l => !l.organization_id);

    if (logsWithoutOrg.length === 0) {
      return Response.json({
        status: 'ok',
        message: 'Keine ContactLogs ohne organization_id gefunden – nichts zu tun.',
        repaired: 0,
        skipped: 0,
        warnings: [],
      });
    }

    const repaired = [];
    const warnings = [];

    // Company-Cache um doppelte Queries zu vermeiden
    const companyCache = {};

    for (const log of logsWithoutOrg) {
      if (!log.company_id) {
        warnings.push({ log_id: log.id, reason: 'Kein company_id – kann nicht zugeordnet werden' });
        continue;
      }

      // Company laden (mit Cache)
      if (!companyCache[log.company_id]) {
        const companies = await base44.asServiceRole.entities.Company.filter({ id: log.company_id });
        companyCache[log.company_id] = companies?.[0] || null;
      }

      const company = companyCache[log.company_id];

      if (!company) {
        warnings.push({ log_id: log.id, company_id: log.company_id, reason: 'Company nicht gefunden' });
        continue;
      }

      if (!company.organization_id) {
        warnings.push({ log_id: log.id, company_id: log.company_id, reason: 'Company hat selbst keine organization_id' });
        continue;
      }

      // 2. organization_id aus Company übernehmen
      await base44.asServiceRole.entities.ContactLog.update(log.id, {
        organization_id: company.organization_id,
      });
      repaired.push({ log_id: log.id, company_id: log.company_id, org_id: company.organization_id });
    }

    // 3. Abschließendes Mini-Audit: ContactLogs ohne organization_id neu zählen
    const logsAfter = await base44.asServiceRole.entities.ContactLog.list('-created_date', 1000);
    const remainingWithoutOrg = logsAfter.filter(l => !l.organization_id).length;

    return Response.json({
      status: warnings.length === 0 && remainingWithoutOrg === 0 ? 'green' : warnings.length > 0 ? 'partial' : 'ok',
      message: `${repaired.length} ContactLogs repariert, ${warnings.length} nicht reparierbar.`,
      repaired_count: repaired.length,
      warning_count: warnings.length,
      remaining_without_org: remainingWithoutOrg,
      repaired,
      warnings,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});