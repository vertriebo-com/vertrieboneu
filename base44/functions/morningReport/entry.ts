import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ─── ARCHITEKTUR-HINWEIS ──────────────────────────────────────────────────────
// TODO (Skalierung): Bei 100+ Organisationen muss morningReport über eine
// Queue/Batch-Job-Infrastruktur ausgeführt werden (z.B. eine Automation pro Org,
// oder ein Orchestrator der pro Org einen Job enqueued). Der aktuelle Ansatz
// (eine Funktion, eine Org) ist bereits batch-fähig designed (organization_id als
// Pflichtparameter). Der Aufruf-Loop liegt beim Caller (Automation/Orchestrator).
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

    // ── 1. organization_id Pflicht ──────────────────────────────────────────
    if (!organization_id) {
      return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });
    }

    // ── 2. checkAccess: nur admins dürfen Reports für die ganze Org auslösen ─
    const access = await checkAccess(req, { organization_id, action: 'view_reports' });
    if (!access.allowed) {
      console.warn(`[morningReport] Access denied: ${access.reason}`);
      return Response.json({ error: access.message, reason: access.reason }, { status: 403 });
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);
    const dayName = now.toLocaleDateString('de-DE', { weekday:'long' });
    const dateStr = now.toLocaleDateString('de-DE', { year:'numeric', month:'long', day:'numeric' });

    const motivationalQuotes = [
      "Jeder Anruf bringt dich näher zum nächsten Abschluss. Los geht's! 💪",
      "Erfolg ist kein Zufall – er ist das Ergebnis konsequenter Arbeit. 🚀",
      "Ein Nein heute ist vielleicht das Ja von morgen. Bleib dran! 🎯",
      "Die besten Vertriebler geben nicht auf – du bist einer von ihnen. 🏆",
      "Heute ist ein neuer Tag voller Möglichkeiten. Pack sie an! ⚡",
      "Qualität schlägt Quantität – aber heute machen wir beides! 💼",
      "Dein nächster Abschluss wartet – ruf jetzt an! 📞",
    ];
    const todayQuote = motivationalQuotes[now.getDay() % motivationalQuotes.length];

    // ── 3. Alle Daten org-spezifisch laden ─────────────────────────────────
    const [members, tasks, companies, orgSettings, contactLogs] = await Promise.all([
      base44.asServiceRole.entities.OrganizationMember.filter({ organization_id, status: 'active' }),
      base44.asServiceRole.entities.Task.filter({ organization_id }),
      base44.asServiceRole.entities.Company.filter({ organization_id }),
      base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id }),
      base44.asServiceRole.entities.ContactLog.filter({ organization_id }),
    ]);

    // Logo: erst OrganizationSettings, dann AppSettings als Fallback
    const settingsMap = {};
    orgSettings.forEach(s => { settingsMap[s.key] = s.value; });
    if (!settingsMap["email_logo_url"]) {
      const appSettings = await base44.asServiceRole.entities.AppSettings.list();
      appSettings.forEach(s => { if (!settingsMap[s.key]) settingsMap[s.key] = s.value; });
    }
    const logoUrl = settingsMap["email_logo_url"] || null;

    // ── 4. Nutzer der Organisation bestimmen ────────────────────────────────
    // User-Emails aus OrganizationMember, dann User-Objekte laden für full_name
    const memberEmails = members.map(m => m.user_email);
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 200);
    const orgUsers = allUsers.filter(u => memberEmails.includes(u.email));

    const targetUsers = testEmail
      ? orgUsers.filter(u => u.email === testEmail)
      : orgUsers;

    const reports = [];

    for (const user of targetUsers) {
      if (!user.email) continue;
      const firstName = user.full_name?.split(' ')[0] || user.email.split('@')[0];

      const overdueTasks = tasks.filter(t =>
        !t.erledigt && t.assigned_to === user.email && t.faellig_am && new Date(t.faellig_am) < todayStart
      );
      const todayTasks = tasks.filter(t =>
        !t.erledigt && t.assigned_to === user.email && t.faellig_am &&
        new Date(t.faellig_am) >= todayStart && new Date(t.faellig_am) <= todayEnd
      );
      const rueckrufCompanies = companies.filter(c =>
        c.assigned_to === user.email && c.status === "Rückruf"
      ).slice(0, 10);
      const hotLeads = companies.filter(c =>
        c.assigned_to === user.email && c.is_hot && !["Gewonnen","Verloren"].includes(c.status)
      ).slice(0, 5);

      const yesterday = new Date(now); yesterday.setDate(yesterday.getDate()-1);
      const yesterdayStart = new Date(yesterday); yesterdayStart.setHours(0,0,0,0);
      const yesterdayEnd = new Date(yesterday); yesterdayEnd.setHours(23,59,59,999);
      const yesterdayCalls = contactLogs.filter(l =>
        l.user_email === user.email && l.typ === "Anruf" &&
        new Date(l.created_date) >= yesterdayStart && new Date(l.created_date) <= yesterdayEnd
      ).length;

      const totalItems = overdueTasks.length + todayTasks.length + rueckrufCompanies.length;
      if (!testMode && totalItems === 0) continue;

      const headerLogo = logoUrl
        ? `<img src="${logoUrl}" alt="Logo" style="max-height:52px;max-width:160px;object-fit:contain;display:block;"/>`
        : `<div style="font-size:20px;font-weight:900;color:#ffffff;">Huwa Gebäudedienste</div><div style="font-size:10px;color:rgba(255,255,255,0.65);margin-top:3px;text-transform:uppercase;letter-spacing:1px;">Gebäudereinigung &amp; Hausmeisterdienste</div>`;

      const statsBar = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
<td width="22%" align="center" style="padding:14px 6px;background:#fff5f5;border-radius:12px;border:1px solid #fecaca;"><div style="font-size:26px;font-weight:900;color:#dc2626;line-height:1;">${overdueTasks.length}</div><div style="font-size:10px;font-weight:700;color:#dc2626;margin-top:4px;text-transform:uppercase;">Überfällig</div></td>
<td width="4%"></td>
<td width="22%" align="center" style="padding:14px 6px;background:#fffbeb;border-radius:12px;border:1px solid #fde68a;"><div style="font-size:26px;font-weight:900;color:#d97706;line-height:1;">${todayTasks.length}</div><div style="font-size:10px;font-weight:700;color:#d97706;margin-top:4px;text-transform:uppercase;">Heute fällig</div></td>
<td width="4%"></td>
<td width="22%" align="center" style="padding:14px 6px;background:#eff6ff;border-radius:12px;border:1px solid #bfdbfe;"><div style="font-size:26px;font-weight:900;color:#1d4ed8;line-height:1;">${rueckrufCompanies.length}</div><div style="font-size:10px;font-weight:700;color:#1d4ed8;margin-top:4px;text-transform:uppercase;">Rückrufe</div></td>
<td width="4%"></td>
<td width="22%" align="center" style="padding:14px 6px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;"><div style="font-size:26px;font-weight:900;color:#16a34a;line-height:1;">${yesterdayCalls}</div><div style="font-size:10px;font-weight:700;color:#16a34a;margin-top:4px;text-transform:uppercase;">Calls gestern</div></td>
</tr></table>`;

      const motivationBanner = `<div style="background:linear-gradient(135deg,#1d4ed8,#4f46e5);border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center;"><div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);line-height:1.6;">${todayQuote}</div></div>`;

      const overdueSection = overdueTasks.length > 0 ? `<div style="margin-bottom:22px;"><div style="font-size:14px;font-weight:800;color:#dc2626;margin-bottom:8px;">⚠️ Überfällige Aufgaben</div>${overdueTasks.map(t => `<div style="background:#fff5f5;border-left:4px solid #dc2626;border-radius:0 10px 10px 0;padding:12px 14px;margin-bottom:7px;"><div style="font-size:13px;font-weight:700;color:#1f2937;">${t.titel}</div><div style="font-size:11px;color:#dc2626;">📅 Fällig seit ${new Date(t.faellig_am).toLocaleDateString('de-DE')}${t.company_name ? ' · 🏢 '+t.company_name : ''}</div></div>`).join('')}</div>` : '';

      const todaySection = todayTasks.length > 0 ? `<div style="margin-bottom:22px;"><div style="font-size:14px;font-weight:800;color:#d97706;margin-bottom:8px;">⏰ Heute zu erledigen</div>${todayTasks.map(t => { const uhr = t.faellig_am ? new Date(t.faellig_am).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : ''; return `<div style="background:#fffbeb;border-left:4px solid #d97706;border-radius:0 10px 10px 0;padding:12px 14px;margin-bottom:7px;"><div style="font-size:13px;font-weight:700;color:#1f2937;">${t.titel}${uhr ? ' <span style="color:#92400e;font-size:11px;">'+uhr+' Uhr</span>' : ''}</div>${t.company_name ? `<div style="font-size:11px;color:#6b7280;">🏢 ${t.company_name}</div>` : ''}</div>`; }).join('')}</div>` : '';

      const hotSection = hotLeads.length > 0 ? `<div style="margin-bottom:22px;"><div style="font-size:14px;font-weight:800;color:#ea580c;margin-bottom:8px;">🔥 Heiße Leads</div>${hotLeads.map(c => `<div style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border-left:4px solid #f97316;border-radius:0 10px 10px 0;padding:12px 14px;margin-bottom:7px;"><div style="font-size:13px;font-weight:700;color:#1f2937;">🔥 ${c.name}</div><div style="font-size:11px;color:#6b7280;">${c.branche||''}${c.ort?' · 📍 '+c.ort:''} · ${c.status}</div></div>`).join('')}</div>` : '';

      const rueckrufSection = rueckrufCompanies.length > 0 ? `<div style="margin-bottom:22px;"><div style="font-size:14px;font-weight:800;color:#1d4ed8;margin-bottom:8px;">📞 Offene Rückrufe (${rueckrufCompanies.length})</div>${rueckrufCompanies.map((c,i) => `<div style="background:${i%2===0?'#eff6ff':'#f8faff'};border-left:4px solid #1d4ed8;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:7px;"><div style="font-size:13px;font-weight:700;color:#1f2937;">${c.name}</div><div style="font-size:11px;color:#6b7280;">${c.ort?'📍 '+c.ort:''}${c.branche?' · '+c.branche:''}${c.telefon?' · 📞 '+c.telefon:''}</div></div>`).join('')}</div>` : '';

      const noItemsSection = totalItems === 0 ? `<div style="text-align:center;padding:40px 24px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:16px;"><div style="font-size:48px;margin-bottom:12px;">🎉</div><div style="font-size:18px;font-weight:900;color:#15803d;">Alles erledigt – Perfekt!</div></div>` : '';

      const emailBody = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/><title>Tagesbericht ${dateStr}</title></head><body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:28px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
<tr><td style="background:linear-gradient(135deg,#1d4ed8 0%,#1e40af 100%);padding:22px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;">${headerLogo}</td>
    <td align="right" style="vertical-align:middle;"><div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:7px 13px;text-align:right;"><div style="font-size:10px;color:rgba(255,255,255,0.65);text-transform:uppercase;">Tagesbericht</div><div style="font-size:13px;font-weight:800;color:white;">${dayName}</div></div></td>
  </tr></table>
</td></tr>
<tr><td style="height:3px;background:linear-gradient(90deg,#60a5fa,#a78bfa,#34d399);padding:0;"></td></tr>
<tr><td style="background:#f8fafc;padding:20px 32px;border-bottom:1px solid #e5e7eb;"><div style="font-size:19px;font-weight:900;color:#1e3a8a;">Guten Morgen, ${firstName}! ☀️</div><div style="font-size:12px;color:#6b7280;margin-top:5px;">${dateStr}</div></td></tr>
<tr><td style="padding:28px 32px;">${statsBar}${totalItems>0?motivationBanner:''}${overdueSection}${todaySection}${hotSection}${rueckrufSection}${noItemsSection}</td></tr>
<tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:22px 32px;"><div style="font-size:11px;color:#94a3b8;">Automatisch generiert von <span style="color:#60a5fa;font-weight:700;">Vertriebo</span> · org=${organization_id}</div></td></tr>
</table></td></tr></table></body></html>`;

      const overdueFlag = overdueTasks.length > 0 ? '🔴 ' : '';
      const subject = testMode
        ? `[TEST] ☀️ Tagesbericht ${firstName} – ${dateStr}`
        : `${overdueFlag}☀️ Guten Morgen ${firstName}! ${totalItems>0?totalItems+' Aufgabe'+(totalItems===1?'':'n')+' heute':'Alles erledigt 🎉'} – ${dayName}`;

      const fromEmail = settingsMap['email_reply_to'] || settingsMap['email_sender_email'] || 'noreply@vertriebo.com';
      const fromName = settingsMap['email_from_name'] || settingsMap['company_name'] || 'Vertriebo';

      const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "accept":"application/json", "api-key":Deno.env.get("BREVO_API_KEY"), "content-type":"application/json" },
        body: JSON.stringify({ sender:{name:fromName,email:fromEmail}, to:[{email:user.email}], subject, htmlContent:emailBody }),
      });
      if (!brevoRes.ok) {
        const err = await brevoRes.json();
        console.error(`[morningReport] Brevo error for ${user.email}:`, JSON.stringify(err));
        throw new Error(`Brevo: ${JSON.stringify(err)}`);
      }

      reports.push({ user:user.email, sent:true, overdue:overdueTasks.length, today:todayTasks.length, callbacks:rueckrufCompanies.length, hotLeads:hotLeads.length, yesterdayCalls, testMode });
    }

    // ── 5. UsageLog: emails_sent ────────────────────────────────────────────
    if (reports.length > 0) {
     try {
       const now = new Date();
       const periodMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
       const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
       if (usageLogs[0]) {
         await base44.asServiceRole.entities.UsageLog.update(usageLogs[0].id, { emails_sent: (usageLogs[0].emails_sent||0)+reports.length });
       } else {
         const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
         const periodEnd = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59).toISOString();
         await base44.asServiceRole.entities.UsageLog.create({ organization_id, period_month: periodMonth, period_start:periodStart, period_end:periodEnd, emails_sent:reports.length });
       }
     } catch (e) { console.warn('[morningReport] UsageLog failed:', e.message); }
    }

    console.info(`[morningReport] org=${organization_id} sent=${reports.length}/${targetUsers.length}`);
    return Response.json({ success:true, reports, total_sent:reports.length, total_org_users:orgUsers.length });

  } catch (error) {
    console.error("morningReport error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});