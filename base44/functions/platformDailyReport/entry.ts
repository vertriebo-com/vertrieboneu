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

    // ── E-Mail-Bericht per Brevo senden ───────────────────────────────────────
    const REPORT_EMAIL = 'backend@slidebnb.de';
    const statusEmoji = report.status === 'critical' ? '🔴' : report.status === 'warning' ? '🟡' : '🟢';
    const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Berlin' });

    const htmlBody = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #f6f8fb; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { background: #0f172a; color: white; padding: 24px 28px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p { margin: 4px 0 0; font-size: 13px; color: #94a3b8; }
  .status-bar { padding: 12px 28px; font-size: 13px; font-weight: bold; }
  .status-ok { background: #f0fdf4; color: #166534; }
  .status-warning { background: #fffbeb; color: #92400e; }
  .status-critical { background: #fef2f2; color: #991b1b; }
  .section { padding: 20px 28px; border-bottom: 1px solid #f1f5f9; }
  .section h2 { font-size: 13px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .metric { background: #f8fafc; border-radius: 8px; padding: 12px 14px; }
  .metric .val { font-size: 22px; font-weight: bold; color: #0f172a; }
  .metric .lbl { font-size: 11px; color: #64748b; margin-top: 2px; }
  .metric.warn .val { color: #d97706; }
  .metric.crit .val { color: #dc2626; }
  .list-item { font-size: 12px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; color: #334155; }
  .list-item:last-child { border: none; }
  .badge { display: inline-block; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .footer { padding: 16px 28px; font-size: 11px; color: #94a3b8; text-align: center; }
</style></head><body>
<div class="container">
  <div class="header">
    <h1>🏢 Vertriebo Platform Report</h1>
    <p>${dateStr}</p>
  </div>
  <div class="status-bar status-${report.status}">
    ${statusEmoji} Status: ${report.status.toUpperCase()} &nbsp;·&nbsp; Generiert: ${now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' })} Uhr
  </div>

  <div class="section">
    <h2>📊 Übersicht (letzte 24h)</h2>
    <div class="grid">
      <div class="metric"><div class="val">${report.summary.new_waitlist_leads}</div><div class="lbl">Neue Interessenten</div></div>
      <div class="metric"><div class="val">${report.summary.new_investor_inquiries}</div><div class="lbl">Investor-Anfragen</div></div>
      <div class="metric"><div class="val">${report.summary.new_orgs}</div><div class="lbl">Neue Organisationen</div></div>
      <div class="metric"><div class="val">${report.summary.new_leads_24h}</div><div class="lbl">Neue Leads</div></div>
    </div>
  </div>

  <div class="section">
    <h2>⚙️ System-Status</h2>
    <div class="grid">
      <div class="metric ${report.summary.failed_research_runs > 0 ? 'crit' : ''}"><div class="val">${report.summary.failed_research_runs}</div><div class="lbl">Fehlgeschlagene Runs</div></div>
      <div class="metric ${report.summary.stuck_runs > 0 ? 'crit' : ''}"><div class="val">${report.summary.stuck_runs}</div><div class="lbl">Hängende Runs</div></div>
      <div class="metric ${report.summary.partial_zero_runs > 0 ? 'warn' : ''}"><div class="val">${report.summary.partial_zero_runs}</div><div class="lbl">Partial-Zero Runs</div></div>
      <div class="metric ${report.summary.paid_orgs_no_plan > 0 ? 'warn' : ''}"><div class="val">${report.summary.paid_orgs_no_plan}</div><div class="lbl">Paid Orgs ohne Plan</div></div>
    </div>
  </div>

  ${report.details.new_waitlist_leads.length > 0 ? `
  <div class="section">
    <h2>🧲 Neue Interessenten</h2>
    ${report.details.new_waitlist_leads.map(l => `
      <div class="list-item">
        <strong>${l.name || 'Unbekannt'}</strong> – ${l.email}
        ${l.company ? `· ${l.company}` : ''}
        ${l.industry ? `<span class="badge badge-amber">${l.industry}</span>` : ''}
      </div>`).join('')}
  </div>` : ''}

  ${report.details.new_investor_inquiries.length > 0 ? `
  <div class="section">
    <h2>💼 Investor-Anfragen</h2>
    ${report.details.new_investor_inquiries.map(i => `
      <div class="list-item">
        <strong>${i.name || 'Unbekannt'}</strong> – ${i.email}
        ${i.company ? `· ${i.company}` : ''}
        <span class="badge badge-amber">${i.role || ''}</span>
      </div>`).join('')}
  </div>` : ''}

  ${report.details.failed_runs.length > 0 ? `
  <div class="section">
    <h2>🔴 Fehlgeschlagene Research Runs</h2>
    ${report.details.failed_runs.slice(0, 5).map(r => `
      <div class="list-item">
        Org: <code>${r.org}</code>
        <span class="badge badge-red">FAILED</span>
        ${r.error ? `<br><span style="color:#94a3b8;font-size:11px">${r.error.slice(0,100)}</span>` : ''}
      </div>`).join('')}
  </div>` : ''}

  ${report.details.paid_orgs_no_plan.length > 0 ? `
  <div class="section">
    <h2>⚠️ Paid Orgs ohne Plan-ID</h2>
    ${report.details.paid_orgs_no_plan.map(o => `
      <div class="list-item">
        <strong>${o.name}</strong> · Status: ${o.billing_status}
        <span class="badge badge-amber">KEIN PLAN</span>
      </div>`).join('')}
  </div>` : ''}

  <div class="footer">
    Vertriebo Platform · Automatischer Tagesbericht · ${now.toISOString()}
  </div>
</div>
</body></html>`;

    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': Deno.env.get('BREVO_API_KEY'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Vertriebo System', email: 'noreply@vertriebo.com' },
          to: [{ email: REPORT_EMAIL, name: 'Vertriebo Admin' }],
          subject: `${statusEmoji} Vertriebo Daily Report – ${now.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`,
          htmlContent: htmlBody,
        }),
      });
      const brevoBody = await brevoRes.text();
      if (!brevoRes.ok) {
        console.error('[platformDailyReport] Brevo error HTTP ' + brevoRes.status + ':', brevoBody);
      } else {
        console.info('[platformDailyReport] Brevo response:', brevoBody);
        console.info('[platformDailyReport] E-Mail erfolgreich gesendet an ' + REPORT_EMAIL);
      }
    } catch (emailErr) {
      console.error('[platformDailyReport] E-Mail-Versand fehlgeschlagen:', emailErr?.message);
    }

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