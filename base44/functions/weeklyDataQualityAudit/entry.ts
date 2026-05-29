/**
 * weeklyDataQualityAudit
 * ======================
 * Scheduled: Montag 04:00 Uhr
 * Führt auditCompanyDataQuality für alle aktiven Orgs aus.
 * Kein automatischer Backfill. Nur Diagnose + PlatformAuditLog.
 *
 * Auth: Scheduler (kein User-Kontext) oder Admin
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

function normalize(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function auditOrgCompanies(db, organization_id) {
  const companies = await db.Company.filter({ organization_id }, '-created_date', 1000);
  const total = companies.length;
  if (total === 0) return { total: 0, score: 100, issues: [] };

  const noQualTier  = companies.filter(c => !c.quality_tier).length;
  const noLifecycle = companies.filter(c => !c.lifecycle_stage).length;
  const noPlaceId   = companies.filter(c => !c.google_place_id).length;
  const noCity      = companies.filter(c => !c.plz && !c.ort).length;
  const noContact   = companies.filter(c => !c.telefon && !c.website).length;
  const noOrgId     = companies.filter(c => !c.organization_id).length;

  // Duplikat-Check: name+city
  const nameMap = {};
  companies.forEach(c => {
    if (!c.name || !c.ort) return;
    const key = `${normalize(c.name)}::${normalize(c.ort)}`;
    if (!nameMap[key]) nameMap[key] = 0;
    nameMap[key]++;
  });
  const dupGroups = Object.values(nameMap).filter(n => n > 1).length;

  const pct = n => total > 0 ? Math.round((n / total) * 100) : 0;
  const score = Math.max(0, 100 - Math.round(
    pct(noQualTier) * 0.25 + pct(noLifecycle) * 0.2 + pct(noContact) * 0.15 + Math.min(dupGroups * 5, 30)
  ));

  const issues = [];
  if (noOrgId > 0) issues.push({ type: 'no_org_id', count: noOrgId, pct: pct(noOrgId), severity: 'critical' });
  if (pct(noQualTier) >= 50) issues.push({ type: 'no_quality_tier', count: noQualTier, pct: pct(noQualTier), severity: 'critical' });
  else if (pct(noQualTier) >= 20) issues.push({ type: 'no_quality_tier', count: noQualTier, pct: pct(noQualTier), severity: 'warning' });
  if (pct(noLifecycle) >= 50) issues.push({ type: 'no_lifecycle_stage', count: noLifecycle, pct: pct(noLifecycle), severity: 'critical' });
  if (dupGroups > 0) issues.push({ type: 'duplicates', count: dupGroups, severity: 'warning' });
  if (pct(noCity) >= 20) issues.push({ type: 'no_city', count: noCity, pct: pct(noCity), severity: 'warning' });

  return { total, score, issues, counts: { noQualTier, noLifecycle, noPlaceId, noCity, noContact, noOrgId, dupGroups } };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const user = await base44.auth.me().catch(() => null);
    if (user && !ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = base44.asServiceRole.entities;
    const now = new Date();

    console.info(`[weeklyDataQualityAudit] Starting at ${now.toISOString()}`);

    const allOrgs = await db.Organization.list('-created_date', 500);
    const activeOrgs = allOrgs.filter(o =>
      o.platform_status !== 'suspended' && o.abuse_status !== 'blocked'
    );

    const orgResults = [];
    const criticalOrgs = [];
    let totalCompanies = 0;
    let totalIssues = 0;

    // Sequenziell mit kleinem Delay um Rate Limits zu vermeiden
    for (const org of activeOrgs) {
      try {
        const result = await auditOrgCompanies(db, org.id);
        const entry = {
          org_id: org.id,
          org_name: org.name,
          ...result,
        };
        orgResults.push(entry);
        totalCompanies += result.total;
        totalIssues += result.issues.length;
        if (result.score < 50 || result.issues.some(i => i.severity === 'critical')) {
          criticalOrgs.push({ org_id: org.id, org_name: org.name, score: result.score, issues: result.issues });
        }
      } catch (e) {
        console.warn(`[weeklyDataQualityAudit] org=${org.id} error: ${e.message}`);
        orgResults.push({ org_id: org.id, error: e.message });
      }
      // Mini-delay
      await new Promise(r => setTimeout(r, 100));
    }

    const avgScore = orgResults.length > 0
      ? Math.round(orgResults.filter(r => r.score != null).reduce((s, r) => s + r.score, 0) / orgResults.filter(r => r.score != null).length)
      : 100;

    const summary = {
      audited_orgs: activeOrgs.length,
      total_companies: totalCompanies,
      total_issues: totalIssues,
      critical_orgs_count: criticalOrgs.length,
      average_score: avgScore,
      status: criticalOrgs.length > 0 ? 'critical' : avgScore < 70 ? 'warning' : 'ok',
    };

    // PlatformAuditLog
    await db.PlatformAuditLog.create({
      actor_email: 'system@vertriebo.scheduler',
      actor_role: 'system',
      action: 'weekly_data_quality_audit',
      target_type: 'organization',
      target_id: 'platform',
      organization_id: 'platform',
      metadata: JSON.stringify({ summary, critical_orgs: criticalOrgs }),
      reason: `Weekly Audit: ${summary.audited_orgs} Orgs, avg_score=${avgScore}, kritisch=${criticalOrgs.length}`,
    });

    console.info(`[weeklyDataQualityAudit] Done: orgs=${activeOrgs.length} avgScore=${avgScore} critical=${criticalOrgs.length}`);

    return Response.json({
      success: true,
      ...summary,
      critical_orgs: criticalOrgs,
      org_results: orgResults,
      generated_at: now.toISOString(),
    });

  } catch (err) {
    console.error('[weeklyDataQualityAudit] Fatal:', err?.message);
    return Response.json({ error: err?.message, success: false }, { status: 500 });
  }
});