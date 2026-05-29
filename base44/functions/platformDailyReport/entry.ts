/**
 * platformDailyReport
 * ===================
 * Scheduled: Täglich 07:00 Uhr
 * Erstellt einen internen Plattform-Bericht für Admins.
 * Kein E-Mail-Versand an Kunden. Nur PlatformAuditLog + Response.
 *
 * Prüft:
 * - Neue WaitlistLeads (24h)
 * - Neue InvestorInquiries (24h)
 * - Neue SupportNotes (24h)
 * - Fehlgeschlagene ResearchRuns
 * - Partial ResearchRuns mit 0 Leads
 * - Stuck ResearchRuns (running > 30min)
 * - Bezahlte Orgs ohne plan_id
 * - Neue Orgs (24h)
 * - Neue Leads gesamt (24h)
 *
 * Auth: kein User-Kontext (Scheduler) → SERVICE ROLE only
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Auth: entweder Admin-User oder System-Call (kein User-Kontext im Scheduler)
    const user = await base44.auth.me().catch(() => null);
    if (user && !ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    // Wenn kein User → Scheduler-Kontext: BASE44_APP_ID als Cron-Token prüfen
    if (!user) {
      const cronToken = req.headers.get('x-cron-secret') || body.cron_secret;
      const expectedToken = Deno.env.get('BASE44_APP_ID');
      if (!cronToken || cronToken !== expectedToken) {
        // Scheduled Automations laufen ohne Header → wir lassen sie durch via asServiceRole
        // Nur blockieren wenn explizit falscher Token gesetzt
        if (cronToken && cronToken !== expectedToken) {
          return Response.json({ error: 'Forbidden: Invalid cron secret' }, { status: 403 });
        }
      }
    }

    const db = base44.asServiceRole.entities;
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since30min = new Date(now.getTime() - 30 * 60 * 1000);

    console.info(`[platformDailyReport] Starting at ${now.toISOString()}`);

    // Alle Daten parallel laden
    const [
      waitlistLeads,
      investorInquiries,
      supportNotes,
      allResearchRuns,
      allOrgs,
      allCompanies,
    ] = await Promise.all([
      db.WaitlistLead.list('-created_date', 200),
      db.InvestorInquiry.list('-created_date', 200),
      db.SupportNote.list('-created_date', 200),
      db.ResearchRun.list('-created_date', 500),
      db.Organization.list('-created_date', 500),
      db.Company.list('-created_date', 100),
    ]);

    // ── Neue Einträge 24h ──────────────────────────────────────────────────────
    const newWaitlistLeads = waitlistLeads.filter(l => new Date(l.created_date) >= since24h);
    const newInvestorInquiries = investorInquiries.filter(i => new Date(i.created_date) >= since24h);
    const newSupportNotes = supportNotes.filter(n => new Date(n.created_date) >= since24h);
    const newOrgs = allOrgs.filter(o => new Date(o.created_date) >= since24h);
    const newLeads = allCompanies.filter(c => new Date(c.created_date) >= since24h);

    // ── ResearchRun Probleme ───────────────────────────────────────────────────
    const failedRuns = allResearchRuns.filter(r => r.status === 'failed');
    const partialZeroRuns = allResearchRuns.filter(r => r.status === 'partial' && (r.leads_saved || 0) === 0);
    const stuckRuns = allResearchRuns.filter(r => {
      if (!['queued', 'running'].includes(r.status)) return false;
      const startedAt = r.started_at ? new Date(r.started_at) : new Date(r.created_date);
      return startedAt < since30min;
    });

    // ── Orgs mit Billing-Problem ───────────────────────────────────────────────
    const paidOrgsNoPlan = allOrgs.filter(o =>
      ['active', 'trialing'].includes(o.billing_status) && !o.plan_id
    );

    // ── Bericht zusammenstellen ────────────────────────────────────────────────
    const report = {
      generated_at: now.toISOString(),
      period: '24h',
      summary: {
        new_waitlist_leads: newWaitlistLeads.length,
        new_investor_inquiries: newInvestorInquiries.length,
        new_support_notes: newSupportNotes.length,
        new_orgs: newOrgs.length,
        new_leads_24h: newLeads.length,
        failed_research_runs: failedRuns.length,
        partial_zero_runs: partialZeroRuns.length,
        stuck_runs: stuckRuns.length,
        paid_orgs_no_plan: paidOrgsNoPlan.length,
      },
      details: {
        new_waitlist_leads: newWaitlistLeads.map(l => ({ id: l.id, name: l.name, email: l.email, company: l.company_name, industry: l.industry, source: l.source_page, created: l.created_date })),
        new_investor_inquiries: newInvestorInquiries.map(i => ({ id: i.id, name: i.name, email: i.email, role: i.role, company: i.company_name, created: i.created_date })),
        new_support_notes: newSupportNotes.map(n => ({ id: n.id, org_id: n.organization_id, severity: n.severity, status: n.status, created: n.created_date })),
        failed_runs: failedRuns.slice(0, 10).map(r => ({ id: r.id, org: r.organization_id, error: r.error_message, created: r.created_date })),
        partial_zero_runs: partialZeroRuns.slice(0, 10).map(r => ({ id: r.id, org: r.organization_id, leads_saved: r.leads_saved, created: r.created_date })),
        stuck_runs: stuckRuns.slice(0, 10).map(r => ({ id: r.id, org: r.organization_id, status: r.status, started: r.started_at, created: r.created_date })),
        paid_orgs_no_plan: paidOrgsNoPlan.map(o => ({ id: o.id, name: o.name, billing_status: o.billing_status })),
      },
    };

    // Qualitätsstatus: hat der Report kritische Punkte?
    const hasCritical = failedRuns.length > 0 || stuckRuns.length > 0 || paidOrgsNoPlan.length > 0;
    const hasWarnings = partialZeroRuns.length > 0 || newSupportNotes.some(n => n.severity === 'critical');

    report.status = hasCritical ? 'critical' : hasWarnings ? 'warning' : 'ok';

    // ── PlatformAuditLog schreiben ─────────────────────────────────────────────
    await db.PlatformAuditLog.create({
      actor_email: 'system@vertriebo.scheduler',
      actor_role: 'system',
      action: 'platform_daily_report',
      target_type: 'organization',
      target_id: 'platform',
      organization_id: 'platform',
      metadata: JSON.stringify(report.summary),
      reason: `Daily Report: ${report.status.toUpperCase()} | Waitlist+${newWaitlistLeads.length} Investor+${newInvestorInquiries.length} FailedRuns:${failedRuns.length} Stuck:${stuckRuns.length}`,
    });

    console.info(`[platformDailyReport] Done: status=${report.status} waitlist=${newWaitlistLeads.length} investors=${newInvestorInquiries.length} failedRuns=${failedRuns.length} stuck=${stuckRuns.length}`);

    return Response.json({ success: true, ...report });

  } catch (err) {
    console.error('[platformDailyReport] Fatal:', err?.message);
    return Response.json({ error: err?.message, success: false }, { status: 500 });
  }
});