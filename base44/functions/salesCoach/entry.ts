import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ─── ARCHITEKTUR-HINWEIS ──────────────────────────────────────────────────────
// TODO (Skalierung): Bei 100+ Orgs muss ein Orchestrator salesCoach pro Org
// enqueuen. Derzeit: organization_id als Pflichtparameter = batch-ready.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Inline checkAccess ───────────────────────────────────────────────────────
const ACTION_ROLES = {
  view_leads: ['organization_admin','sales_rep'], create_lead: ['organization_admin','sales_rep'],
  update_assigned_lead: ['organization_admin','sales_rep'], delete_lead: ['organization_admin'],
  generate_leads: ['organization_admin'], create_contact_log: ['organization_admin','sales_rep'],
  view_tasks: ['organization_admin','sales_rep'], complete_task: ['organization_admin','sales_rep'],
  manage_users: ['organization_admin'], manage_settings: ['organization_admin'],
  manage_billing: ['organization_admin'], data_export: ['organization_admin'],
  view_reports: ['organization_admin','sales_rep'], use_ai_scoring: ['organization_admin','sales_rep'],
  send_bulk_email: ['organization_admin','sales_rep'], manage_blacklist: ['organization_admin'],
  platform_admin_access: [],
};
const BILLING_ACCESS = { preview:'full', active:'full', trialing:'full', past_due:'degraded', incomplete:'degraded', unpaid:'blocked', canceled:'blocked', incomplete_expired:'blocked' };
const DEGRADED_BLOCKED = new Set(['create_lead','generate_leads','use_ai_scoring','send_bulk_email']);
const BLOCKED_ADMIN_OK = new Set(['manage_billing','data_export']);
const DEGRADED_SALES_OK = new Set(['view_leads','view_tasks','create_contact_log','update_assigned_lead','complete_task']);

function _allow(r) { return { allowed:true, ...r }; }
function _deny(reason, message, ctx={}) { return { allowed:false, reason, message, user:ctx.user||null, organization:ctx.organization||null, member:ctx.member||null, role:ctx.role||null, plan:ctx.plan||null, subscription:ctx.subscription||null, limits:ctx.limits||null }; }

async function checkAccess(req, { organization_id, action, check_limit=null, current_usage=0 }={}) {
  const b44 = createClientFromRequest(req);
  let user; try { user = await b44.auth.me(); } catch { return _deny('not_authenticated','Nicht eingeloggt.'); }
  if (!user) return _deny('not_authenticated','Nicht eingeloggt.');
  if (user.role === 'admin') return _allow({ reason:'platform_admin', user, organization:null, member:null, role:'platform_admin', plan:null, subscription:null, limits:null });
  if (!organization_id) return _deny('missing_organization_id','Keine organization_id angegeben.');
  let orgs, members;
  try { [orgs, members] = await Promise.all([b44.asServiceRole.entities.Organization.filter({id:organization_id}), b44.asServiceRole.entities.OrganizationMember.filter({organization_id, user_email:user.email})]); }
  catch { return _deny('organization_not_found','Organisation nicht gefunden.'); }
  const organization = orgs[0]||null;
  if (!organization) return _deny('organization_not_found','Organisation nicht gefunden.');
  if (organization.status==='suspended') return _deny('organization_suspended',`Organisation gesperrt.`);
  const member = members[0]||null;
  if (!member) return _deny('not_a_member','Kein Mitglied dieser Organisation.');
  if (member.status!=='active') return _deny('member_inactive',`Mitglied-Status: "${member.status}".`);
  const role = member.role;
  if (action) {
    const ar = ACTION_ROLES[action];
    if (ar===undefined) return _deny('unknown_action',`Unbekannte Aktion: "${action}".`);
    if (!ar.includes(role)) return _deny('insufficient_role',`Rolle "${role}" darf "${action}" nicht.`);
  }
  const [subs, plans] = await Promise.all([b44.asServiceRole.entities.Subscription.filter({organization_id}), organization.plan_id ? b44.asServiceRole.entities.Plan.filter({id:organization.plan_id}) : Promise.resolve([])]);
  const subscription=subs[0]||null, plan=plans[0]||null;
  const billingStatus = subscription?.status || organization.billing_status || 'trialing';
  const billingAccess = BILLING_ACCESS[billingStatus]||'blocked';
  if (action && billingAccess!=='full') {
    const ctx={user,organization,member,role,plan,subscription,limits:null};
    if (billingAccess==='blocked') {
      if (role==='organization_admin' && BLOCKED_ADMIN_OK.has(action)) { /* ok */ }
      else if (role==='sales_rep') return _deny('billing_blocked_sales_rep',`Abo "${billingStatus}": Kein Zugriff für Sales Rep.`,ctx);
      else return _deny('billing_blocked',`Abo "${billingStatus}": Zugriff gesperrt.`,ctx);
    }
    if (billingAccess==='degraded') {
      if (DEGRADED_BLOCKED.has(action)) return _deny('billing_degraded_action_blocked',`Abo "${billingStatus}": "${action}" nicht verfügbar.`,ctx);
      if (role==='sales_rep' && !DEGRADED_SALES_OK.has(action)) return _deny('billing_degraded_sales_rep',`Abo "${billingStatus}": Sales Rep darf "${action}" nicht.`,ctx);
    }
  }
  let limits = null;
  if (plan) {
    limits = { max_users:plan.max_users, max_leads_per_month:plan.max_leads_per_month, max_ai_scorings_per_month:plan.max_ai_scorings_per_month, max_emails_per_month:plan.max_emails_per_month, max_lead_generations_per_month:plan.max_lead_generations_per_month };
    if (check_limit && limits[check_limit]!==undefined) {
      const maxVal=limits[check_limit];
      if (maxVal!==-1 && current_usage>=maxVal) return _deny('plan_limit_exceeded',`Limit "${check_limit}": ${current_usage}/${maxVal}.`,{user,organization,member,role,plan,subscription,limits});
    }
  }
  return _allow({ reason:'ok', user, organization, member, role, plan, subscription, limits });
}
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { organization_id, testMode = false, testEmail = null } = body;

    // ── 1. organization_id Pflicht + checkAccess ────────────────────────────
    if (!organization_id) return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });
    const access = await checkAccess(req, { organization_id, action: 'view_reports' });
    if (!access.allowed) {
      console.warn(`[salesCoach] Access denied: ${access.reason}`);
      return Response.json({ error: access.message, reason: access.reason }, { status: 403 });
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const dateStr = now.toLocaleDateString('de-DE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    // ── 2. Alle Daten org-spezifisch laden ─────────────────────────────────
    const [members, contactLogs, tasks, settingsRecords, hotLeads] = await Promise.all([
      base44.asServiceRole.entities.OrganizationMember.filter({ organization_id, status: 'active' }),
      base44.asServiceRole.entities.ContactLog.filter({ organization_id }),
      base44.asServiceRole.entities.Task.filter({ organization_id }),
      base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id }),
      base44.asServiceRole.entities.Company.filter({ organization_id, lead_temperature: 'hot' }),
    ]);

    // Org Settings Map
    const settingsMap = {};
    for (const r of settingsRecords) settingsMap[r.key] = r.value;
    const orgServices = (settingsMap.services || settingsMap.dienstleistungen || '').split(',').map(s => s.trim()).filter(Boolean);
    const orgTargetCustomers = (settingsMap.target_customer_types || settingsMap.zielkunden || '').split(',').map(s => s.trim()).filter(Boolean);
    const industryName = settingsMap.industry_name || settingsMap.own_industry || '';

    // Warme Leads zusätzlich laden
    const warmLeads = await base44.asServiceRole.entities.Company.filter({ organization_id, lead_temperature: 'warm' });
    const priorityLeads = [...hotLeads, ...warmLeads].filter(c => !c.is_blacklisted && !['Gewonnen','Verloren'].includes(c.status));

    // User-Objekte für full_name
    const memberEmails = members.map(m => m.user_email);
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 200);
    const orgUsers = allUsers.filter(u => memberEmails.includes(u.email));
    const targetUsers = testEmail ? orgUsers.filter(u => u.email === testEmail) : orgUsers;

    const todayLogs = contactLogs.filter(log => new Date(log.created_date) >= todayStart);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0,0,0,0);

    // ── Branchenspezifische Tagesfokus-Analyse ──────────────────────────────
    // Gruppiere Priority-Leads nach Zielkunden-Typ und Service-Kontext
    const leadsByType = {};
    for (const c of priorityLeads) {
      const type = c.matched_target_customer_type || 'Weitere Leads';
      if (!leadsByType[type]) leadsByType[type] = [];
      leadsByType[type].push(c);
    }
    // Top-3 Zielkunden-Typen nach Anzahl heißer/warmer Leads
    const topTypes = Object.entries(leadsByType)
      .sort((a,b) => b[1].length - a[1].length)
      .slice(0,3);

    // Service-Kontext je Top-Typ ableiten
    function getServiceFocusForType(leads) {
      const ctxCounts = {};
      for (const c of leads) {
        const ctx = c.matched_service_context || '';
        if (ctx) {
          const first = ctx.split(',')[0].trim();
          ctxCounts[first] = (ctxCounts[first]||0) + 1;
        }
      }
      const sorted = Object.entries(ctxCounts).sort((a,b)=>b[1]-a[1]);
      return sorted.slice(0,2).map(e=>e[0]).filter(Boolean);
    }

    // Tagesfokus-HTML-Block generieren
    function buildDailyFocusHtml() {
      // Mit Kontext
      if (topTypes.length > 0 && (orgServices.length > 0 || topTypes[0][1].some(c=>c.matched_service_context))) {
        const focusLines = topTypes.map(([type, leads]) => {
          const services = getServiceFocusForType(leads);
          const serviceHint = services.length > 0
            ? services.join(' und ')
            : (orgServices.slice(0,2).join(' und ') || 'passende Leistungen');
          return `<div style="padding:8px 0;border-top:1px solid #dbeafe;font-size:13px;color:#1e3a5f;">
            <span style="font-weight:700;">→ ${type}</span>
            <span style="color:#475569;"> · ${leads.length} priorität Lead${leads.length>1?'s':''} · Einstieg über: <strong>${serviceHint}</strong></span>
          </div>`;
        }).join('');
        const industryLine = industryName ? `<div style="font-size:12px;color:#64748b;margin-bottom:10px;">Branche: <strong>${industryName}</strong></div>` : '';
        return `<div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
          <div style="font-size:14px;font-weight:700;color:#1e40af;margin-bottom:8px;">🎯 Dein Tagesfokus</div>
          ${industryLine}
          ${focusLines}
        </div>`;
      }
      // Fallback mit org-Services
      if (orgTargetCustomers.length > 0 || orgServices.length > 0) {
        const tcLine = orgTargetCustomers.length > 0
          ? `<div style="font-size:13px;color:#1e3a5f;padding:6px 0;">Zielgruppen heute: <strong>${orgTargetCustomers.slice(0,3).join(', ')}</strong></div>` : '';
        const svcLine = orgServices.length > 0
          ? `<div style="font-size:13px;color:#1e3a5f;padding:6px 0;">Leistungsfokus: <strong>${orgServices.slice(0,3).join(', ')}</strong></div>` : '';
        return `<div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
          <div style="font-size:14px;font-weight:700;color:#1e40af;margin-bottom:8px;">🎯 Dein Tagesfokus</div>
          ${tcLine}${svcLine}
        </div>`;
      }
      // Generischer Fallback
      return `<div style="background:#eff6ff;border-left:4px solid #0f4cb3;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:15px;font-weight:600;color:#1e40af;">💡 Heute 3 Leads kontaktieren und Ergebnis im CRM eintragen.</div>
      </div>`;
    }

    const motivations = [
      { emoji:"🔥", text:"Die besten Deals entstehen durch Konsequenz. Ein Anruf kann alles ändern!" },
      { emoji:"💪", text:"Jeder Kontakt bringt dich näher zum nächsten Abschluss. Fang jetzt an!" },
      { emoji:"🎯", text:"Dein nächster Kunde wartet schon auf deinen Anruf. Greif zum Hörer!" },
      { emoji:"🚀", text:"Vertrieb ist ein Zahlenspiel – je mehr du kontaktierst, desto mehr gewinnst du!" },
      { emoji:"⚡", text:"Ein kurzes Gespräch heute kann morgen ein unterschriebenes Angebot sein!" },
    ];
    const motivation = motivations[now.getDay() % motivations.length];
    const dailyFocusHtml = buildDailyFocusHtml();

    const results = [];

    for (const user of targetUsers) {
      if (!user.email) continue;
      const firstName = user.full_name?.split(' ')[0] || user.email.split('@')[0];

      // Hat der User heute schon einen Log? → kein Reminder nötig
      const userTodayLogs = todayLogs.filter(log => log.user_email === user.email);
      if (userTodayLogs.length > 0 && !testMode) {
        console.log(`[salesCoach] ${user.email} already logged ${userTodayLogs.length} contact(s) today. Skipping.`);
        continue;
      }

      // Nur org-spezifische Tasks und Logs
      const openTasks = tasks.filter(t => !t.erledigt && t.assigned_to === user.email);
      const weekLogs = contactLogs.filter(log => log.user_email === user.email && new Date(log.created_date) >= weekStart);

      const hotCount = hotLeads.filter(c=>!c.is_blacklisted && !['Gewonnen','Verloren'].includes(c.status)).length;
      const warmCount = warmLeads.filter(c=>!c.is_blacklisted && !['Gewonnen','Verloren'].includes(c.status)).length;

      const emailBody = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background:#0f4cb3;border-radius:12px 12px 0 0;padding:28px 32px;">
  <div style="font-size:26px;font-weight:800;color:white;">${motivation.emoji} Hey ${firstName}, noch kein Kontakt heute!</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:8px;">${dateStr}</div>
</td></tr>
<tr><td style="background:white;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;">
  ${dailyFocusHtml}
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr>
    <td align="center" style="padding:14px 8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <div style="font-size:28px;font-weight:800;color:#0f4cb3;">${weekLogs.length}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">Kontakte diese Woche</div>
    </td>
    <td width="10"></td>
    <td align="center" style="padding:14px 8px;background:#fff5f5;border-radius:8px;border:1px solid #fecaca;">
      <div style="font-size:28px;font-weight:800;color:#dc2626;">${openTasks.length}</div>
      <div style="font-size:11px;color:#dc2626;margin-top:2px;">Offene Aufgaben</div>
    </td>
    <td width="10"></td>
    <td align="center" style="padding:14px 8px;background:#fef9ec;border-radius:8px;border:1px solid #fde68a;">
      <div style="font-size:28px;font-weight:800;color:#d97706;">${hotCount}</div>
      <div style="font-size:11px;color:#d97706;margin-top:2px;">🔥 Heiße Leads</div>
    </td>
    <td width="10"></td>
    <td align="center" style="padding:14px 8px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
      <div style="font-size:28px;font-weight:800;color:#16a34a;">${warmCount}</div>
      <div style="font-size:11px;color:#16a34a;margin-top:2px;">Warme Leads</div>
    </td>
  </tr></table>
  <p style="font-size:14px;color:#4b5563;margin-bottom:20px;">${motivation.text}</p>
  ${openTasks.length > 0 ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-top:16px;">
    <div style="font-size:13px;font-weight:600;color:#92400e;margin-bottom:6px;">⚠️ Du hast ${openTasks.length} offene Aufgabe${openTasks.length>1?'n':''}</div>
    ${openTasks.slice(0,3).map(t => `<div style="font-size:12px;color:#6b7280;padding:4px 0;border-top:1px solid #fde68a;">📋 ${t.titel}${t.company_name?' · '+t.company_name:''}</div>`).join('')}
  </div>` : ''}
</td></tr>
<tr><td style="background:#1e293b;border-radius:0 0 12px 12px;padding:20px 32px;">
  <div style="font-size:12px;color:#94a3b8;">Viele Erfolge heute! 💼 · Vertriebo</div>
</td></tr>
</table></td></tr></table></body></html>`;

      const fromEmail = settingsMap['email_reply_to'] || settingsMap['email_sender_email'] || 'noreply@vertriebo.com';
      const fromName = settingsMap['email_from_name'] || settingsMap['company_name'] || 'Vertriebo';

      const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "accept":"application/json", "api-key":Deno.env.get("BREVO_API_KEY"), "content-type":"application/json" },
        body: JSON.stringify({
          sender: { name:fromName, email:fromEmail },
          to: [{ email:user.email }],
          subject: testMode ? `[TEST] ${motivation.emoji} ${firstName}, noch kein Kontakt heute!` : `${motivation.emoji} ${firstName}, dein Vertriebscoach meldet sich!`,
          htmlContent: emailBody,
        }),
      });
      if (!brevoRes.ok) {
        const err = await brevoRes.json();
        console.error(`[salesCoach] Brevo error for ${user.email}:`, JSON.stringify(err));
        throw new Error(`Brevo: ${JSON.stringify(err)}`);
      }

      console.log(`[salesCoach] Reminder sent to ${user.email} (weekLogs: ${weekLogs.length}, openTasks: ${openTasks.length})`);
      results.push({ user:user.email, sent:true, weekLogs:weekLogs.length, openTasks:openTasks.length });
    }

    // ── 3. UsageLog: emails_sent ────────────────────────────────────────────
    if (results.length > 0) {
     try {
       const periodMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
       const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
       if (usageLogs[0]) {
         await base44.asServiceRole.entities.UsageLog.update(usageLogs[0].id, { emails_sent:(usageLogs[0].emails_sent||0)+results.length });
       } else {
         const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
         const periodEnd = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59).toISOString();
         await base44.asServiceRole.entities.UsageLog.create({ organization_id, period_month: periodMonth, period_start:periodStart, period_end:periodEnd, emails_sent:results.length });
       }
     } catch (e) { console.warn('[salesCoach] UsageLog failed:', e.message); }
    }

    console.info(`[salesCoach] org=${organization_id} reminders=${results.length}/${targetUsers.length}`);
    return Response.json({ success:true, checked:targetUsers.length, reminders_sent:results.length, results });

  } catch (error) {
    console.error("salesCoach error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});