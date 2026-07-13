import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Konstanten ───────────────────────────────────────────────────────────────
const BREVO_API = "https://api.brevo.com/v3/smtp/email";
const FROM_EMAIL = "noreply@vertriebo.com";
const FROM_NAME  = "Vertriebo";
const APP_URL = "https://app.vertriebo.com";

// Tage ohne Login → Inaktivitäts-E-Mail
const INACTIVITY_THRESHOLD_DAYS = 14;
// Mindestanzahl unbearbeiteter Leads → Lead-Engagement-E-Mail
const UNWORKED_LEADS_THRESHOLD = 3;
// Mindestzeit zwischen zwei Automations-Mails pro Org (in Tagen)
const MIN_GAP_DAYS = 3;

// ─── Brevo-Versand ─────────────────────────────────────────────────────────────
async function sendBrevo({ to, subject, html, orgName }) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromName = orgName ? `${orgName} via Vertriebo` : FROM_NAME;
  const res = await fetch(BREVO_API, {
    method: "POST",
    headers: { "accept": "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ sender: { name: fromName, email: FROM_EMAIL }, to: [{ email: to }], subject, htmlContent: html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Brevo error: ${JSON.stringify(data)}`);
  return data;
}

// ─── Anti-Spam-Guard: letztes Automations-Mail aus OrganizationSettings ───────
async function getLastAutomationEmailSent(base44, organization_id) {
  const settings = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id, key: "last_automation_email_sent_at" });
  return settings[0]?.value ? new Date(settings[0].value) : null;
}

async function setLastAutomationEmailSent(base44, organization_id) {
  const iso = new Date().toISOString();
  const existing = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id, key: "last_automation_email_sent_at" });
  if (existing[0]) {
    await base44.asServiceRole.entities.OrganizationSettings.update(existing[0].id, { value: iso });
  } else {
    await base44.asServiceRole.entities.OrganizationSettings.create({ organization_id, key: "last_automation_email_sent_at", value: iso });
  }
}

// ─── E-Mail: Inaktivitäts-Trigger ─────────────────────────────────────────────
function buildInactivityEmail({ firstName, orgName, daysSince, newLeadsCount, openTasksCount, hotLeadsCount, unsubscribeUrl }) {
  const leadsLine = newLeadsCount > 0
    ? `<tr><td style="padding:10px 14px;background:#eff6ff;border-radius:8px;margin-bottom:8px;">
        <span style="font-size:22px;font-weight:900;color:#1d4ed8;">${newLeadsCount}</span>
        <span style="font-size:13px;color:#374151;margin-left:6px;">neue Firmenkontakte warten auf dich</span>
       </td></tr>`
    : '';
  const tasksLine = openTasksCount > 0
    ? `<tr><td style="padding:10px 14px;background:#fffbeb;border-radius:8px;margin-bottom:8px;">
        <span style="font-size:22px;font-weight:900;color:#d97706;">${openTasksCount}</span>
        <span style="font-size:13px;color:#374151;margin-left:6px;">offene Aufgaben noch unerledigt</span>
       </td></tr>`
    : '';
  const hotLine = hotLeadsCount > 0
    ? `<tr><td style="padding:10px 14px;background:#fff7ed;border-radius:8px;margin-bottom:8px;">
        <span style="font-size:22px;font-weight:900;color:#ea580c;">🔥 ${hotLeadsCount}</span>
        <span style="font-size:13px;color:#374151;margin-left:6px;">heiße Leads ohne Rückmeldung</span>
       </td></tr>`
    : '';

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:28px 36px;">
    <div style="font-size:22px;font-weight:900;color:#fff;">Vertriebo</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Dein KI-Vertriebs-Assistent</div>
  </td></tr>

  <!-- Subheader-Stripe -->
  <tr><td style="height:4px;background:linear-gradient(90deg,#3b82f6,#8b5cf6,#06b6d4);padding:0;"></td></tr>

  <!-- Body -->
  <tr><td style="padding:36px 36px 28px;">
    <p style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">Hey ${firstName}! 👋</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 28px;">
      Wir vermissen dich – du warst seit <strong style="color:#1d4ed8;">${daysSince} Tagen</strong> nicht mehr in Vertriebo aktiv.
      Dein Vertrieb läuft aber weiter. Hier ist, was in der Zwischenzeit passiert ist:
    </p>

    <!-- Stats -->
    <table width="100%" cellpadding="0" cellspacing="8" style="margin-bottom:28px;">
      ${leadsLine}${tasksLine}${hotLine}
      ${(!newLeadsCount && !openTasksCount && !hotLeadsCount) ? `<tr><td style="padding:10px 14px;background:#f0fdf4;border-radius:8px;"><span style="font-size:13px;color:#374151;">Dein System läuft stabil. Jetzt ist der richtige Moment, wieder einzusteigen! 💪</span></td></tr>` : ''}
    </table>

    <!-- Push-Text -->
    <div style="background:linear-gradient(135deg,#1d4ed8,#4f46e5);border-radius:12px;padding:20px 24px;margin-bottom:28px;text-align:center;">
      <p style="font-size:14px;font-weight:700;color:#fff;margin:0 0 4px;">Kein Abschluss ohne Aktivität.</p>
      <p style="font-size:12px;color:rgba(255,255,255,0.75);margin:0;">
        Die besten Vertriebsergebnisse entstehen durch Konsequenz. Mach jetzt den nächsten Schritt.
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_URL}/leads" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:10px;">
        Jetzt Leads bearbeiten →
      </a>
    </div>

    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
      Du erhältst diese E-Mail weil du ${orgName ? `bei <strong>${orgName}</strong>` : ''} Vertriebo nutzt.<br/>
      Diese Erinnerung kommt maximal alle ${MIN_GAP_DAYS} Tage. ·
      <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Abmelden</a>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f172a;border-radius:0 0 16px 16px;padding:18px 36px;">
    <p style="font-size:11px;color:#475569;margin:0;">© ${new Date().getFullYear()} Vertriebo · <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">E-Mail-Erinnerungen abmelden</a></p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ─── E-Mail: Unbearbeitete Leads ───────────────────────────────────────────────
function buildUnworkedLeadsEmail({ firstName, orgName, unworkedLeads, hotLeadsCount, overdueTasksCount, unsubscribeUrl }) {
  const topLeads = unworkedLeads.slice(0, 5);
  const leadsRows = topLeads.map(c => `
    <tr>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:13px;font-weight:700;color:#111827;">🏢 ${c.name}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${c.branche || ''}${c.ort ? ' · 📍 ' + c.ort : ''}${c.telefon ? ' · 📞 ' + c.telefon : ''}</div>
      </td>
    </tr>`).join('');

  const moreHint = unworkedLeads.length > 5
    ? `<tr><td style="padding:10px 14px;background:#f8fafc;text-align:center;font-size:12px;color:#6b7280;">+ ${unworkedLeads.length - 5} weitere Kontakte warten auf dich</td></tr>`
    : '';

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:28px 36px;">
    <div style="font-size:22px;font-weight:900;color:#fff;">Vertriebo</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Dein KI-Vertriebs-Assistent</div>
  </td></tr>
  <tr><td style="height:4px;background:linear-gradient(90deg,#f97316,#ef4444,#a855f7);padding:0;"></td></tr>

  <!-- Body -->
  <tr><td style="padding:36px 36px 28px;">
    <p style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">
      ${firstName}, ${unworkedLeads.length} Kontakte warten noch! 📋
    </p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
      Diese Firmenkontakte sind bereits in deinem System – aber noch kein einziger Schritt wurde gemacht.
      Jetzt ist der beste Moment, den ersten Anruf zu starten.
    </p>

    <!-- Alert-Box -->
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin-bottom:24px;display:flex;align-items:center;">
      <span style="font-size:24px;margin-right:12px;">⚡</span>
      <div>
        <div style="font-size:13px;font-weight:800;color:#92400e;">Ungenutzte Chancen kosten Umsatz</div>
        <div style="font-size:12px;color:#b45309;margin-top:2px;">
          ${hotLeadsCount > 0 ? `${hotLeadsCount} davon sind als 🔥 heiße Leads markiert. ` : ''}
          ${overdueTasksCount > 0 ? `Außerdem sind ${overdueTasksCount} Aufgaben überfällig.` : ''}
        </div>
      </div>
    </div>

    <!-- Leads-Liste -->
    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:10px;">📞 Deine nächsten Kontakte:</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        ${leadsRows}${moreHint}
      </table>
    </div>

    <!-- Push-Text -->
    <div style="background:linear-gradient(135deg,#ea580c,#dc2626);border-radius:12px;padding:18px 24px;margin-bottom:28px;text-align:center;">
      <p style="font-size:14px;font-weight:700;color:#fff;margin:0 0 4px;">Dein nächster Abschluss steckt in dieser Liste.</p>
      <p style="font-size:12px;color:rgba(255,255,255,0.8);margin:0;">Starte heute. Nicht morgen.</p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_URL}/leads" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:10px;">
        Leads jetzt bearbeiten →
      </a>
    </div>

    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
      ${orgName ? `Für <strong>${orgName}</strong> – ` : ''}Automatisch generiert von Vertriebo.<br/>
      Diese Erinnerung kommt maximal alle ${MIN_GAP_DAYS} Tage. ·
      <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Abmelden</a>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f172a;border-radius:0 0 16px 16px;padding:18px 36px;">
    <p style="font-size:11px;color:#475569;margin:0;">© ${new Date().getFullYear()} Vertriebo · <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">E-Mail-Erinnerungen abmelden</a></p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ─── Unsubscribe-Link generieren ──────────────────────────────────────────────
function getUnsubscribeUrl(orgId, email) {
  return `${APP_URL}/abmelden?org_id=${encodeURIComponent(orgId)}&email=${encodeURIComponent(email)}`;
}

// ─── Hauptfunktion ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { testMode = false, testOrgId = null, dryRun = false } = body;

    // Nur für interne Automations/Admin-Aufrufe → kein User-Auth benötigt (Service Role)
    const now = new Date();
    const results = [];

    // ── 1. Alle aktiven Organisationen laden ───────────────────────────────────
    let orgs = await base44.asServiceRole.entities.Organization.list();
    orgs = orgs.filter(o =>
      o.platform_status === 'active' &&
      ['active', 'trialing', 'preview'].includes(o.billing_status || 'preview') &&
      o.onboarding_done === true
    );

    if (testOrgId) orgs = orgs.filter(o => o.id === testOrgId);

    console.log(`[dailyEngagementEmails] Prüfe ${orgs.length} aktive Organisationen`);

    for (const org of orgs) {
      const orgId = org.id;
      const orgName = org.name || 'Deine Organisation';

      // ── Abmeldung prüfen ──────────────────────────────────────────────────
      const unsubSettings = await base44.asServiceRole.entities.OrganizationSettings.filter({
        organization_id: orgId, key: 'engagement_emails_unsubscribed'
      });
      if (unsubSettings[0]?.value === 'true') {
        console.log(`[dailyEngagementEmails] org=${orgId} skip (unsubscribed)`);
        results.push({ org: orgId, orgName, skipped: true, reason: 'unsubscribed' });
        continue;
      }

      // ── Anti-Spam: letzte Automation-Mail prüfen ─────────────────────────
      const lastSent = await getLastAutomationEmailSent(base44, orgId);
      if (lastSent && !testMode) {
        const daysSinceLast = (now - lastSent) / (1000 * 60 * 60 * 24);
        if (daysSinceLast < MIN_GAP_DAYS) {
          console.log(`[dailyEngagementEmails] org=${orgId} skip (last sent ${Math.round(daysSinceLast)}d ago)`);
          results.push({ org: orgId, orgName, skipped: true, reason: 'too_soon' });
          continue;
        }
      }

      // ── Org-Admin (Owner) bestimmen ──────────────────────────────────────
      const ownerEmail = org.owner_email;
      if (!ownerEmail) {
        results.push({ org: orgId, orgName, skipped: true, reason: 'no_owner' });
        continue;
      }

      // ── Daten laden ───────────────────────────────────────────────────────
      const [activityLogs, companies, tasks] = await Promise.all([
        base44.asServiceRole.entities.ActivityLog.filter({ organization_id: orgId }),
        base44.asServiceRole.entities.Company.filter({ organization_id: orgId }),
        base44.asServiceRole.entities.Task.filter({ organization_id: orgId }),
      ]);

      // ── Inaktivitäts-Check ─────────────────────────────────────────────
      const loginLogs = activityLogs.filter(l => l.event === 'login' && l.user_email === ownerEmail);
      const lastLogin = loginLogs.length > 0
        ? new Date(Math.max(...loginLogs.map(l => new Date(l.created_date).getTime())))
        : null;
      const daysSinceLogin = lastLogin
        ? (now - lastLogin) / (1000 * 60 * 60 * 24)
        : 999;

      // ── Unbearbeitete Leads (Status = "Neu" seit > 2 Tage) ───────────────
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const unworkedLeads = companies.filter(c =>
        c.status === 'Neu' && new Date(c.created_date) < twoDaysAgo
      );

      // ── Weitere Metriken für E-Mail-Inhalt ────────────────────────────────
      const hotLeadsCount = companies.filter(c =>
        c.is_hot && !['Gewonnen', 'Verloren'].includes(c.status)
      ).length;
      const openTasksCount = tasks.filter(t => !t.erledigt && t.assigned_to === ownerEmail).length;
      const overdueTasksCount = tasks.filter(t =>
        !t.erledigt && t.assigned_to === ownerEmail && t.faellig_am && new Date(t.faellig_am) < now
      ).length;
      const newLeadsCount = companies.filter(c =>
        ['Neu', 'Kontakt'].includes(c.status)
      ).length;

      // ── Allgemeine Org-Settings für Owner-Name ─────────────────────────
      const orgSettings = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id: orgId });
      const settingsMap = {};
      orgSettings.forEach(s => { settingsMap[s.key] = s.value; });
      const firstName = settingsMap['owner_first_name'] || ownerEmail.split('@')[0];

      let emailType = null;
      let subject = '';
      let html = '';

      // ── Trigger-Entscheidung ───────────────────────────────────────────
      const unsubscribeUrl = getUnsubscribeUrl(orgId, ownerEmail);

      if (daysSinceLogin >= INACTIVITY_THRESHOLD_DAYS) {
        // INAKTIVITÄTS-MAIL hat Priorität
        emailType = 'inactivity';
        subject = `👋 ${firstName}, wir vermissen dich! ${newLeadsCount > 0 ? newLeadsCount + ' neue Leads warten' : 'Dein Vertrieb braucht dich'}`;
        html = buildInactivityEmail({
          firstName, orgName,
          daysSince: Math.round(daysSinceLogin),
          newLeadsCount, openTasksCount, hotLeadsCount, unsubscribeUrl,
        });
      } else if (unworkedLeads.length >= UNWORKED_LEADS_THRESHOLD) {
        // LEAD-ENGAGEMENT-MAIL
        emailType = 'unworked_leads';
        subject = `📋 ${firstName}, ${unworkedLeads.length} Firmenkontakte warten noch auf deinen ersten Schritt`;
        html = buildUnworkedLeadsEmail({
          firstName, orgName,
          unworkedLeads, hotLeadsCount, overdueTasksCount, unsubscribeUrl,
        });
      }

      if (!emailType) {
        console.log(`[dailyEngagementEmails] org=${orgId} kein Trigger (inaktiv=${Math.round(daysSinceLogin)}d, unworked=${unworkedLeads.length})`);
        results.push({ org: orgId, orgName, skipped: true, reason: 'no_trigger', daysSinceLogin: Math.round(daysSinceLogin), unworkedLeads: unworkedLeads.length });
        continue;
      }

      // ── Versand (oder DryRun) ──────────────────────────────────────────
      if (dryRun) {
        console.log(`[dailyEngagementEmails] DRYRUN org=${orgId} type=${emailType} to=${ownerEmail}`);
        results.push({ org: orgId, orgName, dryRun: true, emailType, to: ownerEmail, subject });
        continue;
      }

      try {
        await sendBrevo({ to: ownerEmail, subject, html, orgName });
        if (!testMode) await setLastAutomationEmailSent(base44, orgId);

        // UsageLog updaten
        try {
          const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id: orgId, period_month: periodMonth });
          if (usageLogs[0]) {
            await base44.asServiceRole.entities.UsageLog.update(usageLogs[0].id, { emails_sent: (usageLogs[0].emails_sent || 0) + 1 });
          }
        } catch (e) { console.warn(`[dailyEngagementEmails] UsageLog skip: ${e.message}`); }

        console.log(`[dailyEngagementEmails] ✓ Sent org=${orgId} type=${emailType} to=${ownerEmail}`);
        results.push({ org: orgId, orgName, sent: true, emailType, to: ownerEmail, subject });
      } catch (sendErr) {
        console.error(`[dailyEngagementEmails] Send error org=${orgId}: ${sendErr.message}`);
        results.push({ org: orgId, orgName, sent: false, error: sendErr.message, emailType });
      }
    }

    const sent = results.filter(r => r.sent).length;
    const skipped = results.filter(r => r.skipped).length;
    const errors = results.filter(r => r.sent === false && r.error).length;

    console.log(`[dailyEngagementEmails] Fertig: sent=${sent} skipped=${skipped} errors=${errors}`);
    return Response.json({ success: true, sent, skipped, errors, results });

  } catch (error) {
    console.error('[dailyEngagementEmails] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});