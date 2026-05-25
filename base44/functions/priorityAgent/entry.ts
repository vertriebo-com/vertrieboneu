import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

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
  if (organization.status==='suspended') return _deny('organization_suspended',`Organisation gesperrt: ${organization.suspended_reason||'kein Grund'}.`);
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

const BRANCHE_SCORES = {
  "Immobilienverwaltung":8, "Lager / Logistik":7, "Spedition / Logistik":7,
  "Baufirma":7, "Bürogebäude":6, "Steuerberatung / Büro":6,
  "Bank / Finanzdienstleister":6, "Versicherung / Büro":6,
  "Arztpraxis":5, "Zahnarztpraxis":5, "Kanzlei / Architekt":5,
  "Autohaus / Kfz-Betrieb":5, "Handwerksbetrieb":4, "Logistik / Paketdienst":4, "Gewerbe":2,
};

function calcBaseScore(company, logs, tasks) {
  const now = new Date();
  let score = 0;
  const statusScore = { "Neu":1, "Kontakt":2, "Rückruf":8, "Termin":10, "Angebot":9 };
  score += statusScore[company.status] || 0;
  score += BRANCHE_SCORES[company.branche] || 2;
  if (company.website) score += 2;
  if (company.telefon) score += 1;
  if (company.ansprechpartner) score += 2;
  if (company.entfernung_km) {
    if (company.entfernung_km < 5) score += 5;
    else if (company.entfernung_km < 10) score += 3;
    else if (company.entfernung_km < 20) score += 1;
  }
  const lastLog = logs[0];
  if (lastLog) {
    const days = (now - new Date(lastLog.created_date)) / (1000*60*60*24);
    if (days < 1) score += 5; else if (days < 3) score += 3; else if (days > 14) score -= 3;
  }
  score += logs.filter(l => ["Rückruf vereinbart","Termin vereinbart","Angebot gesendet"].includes(l.ergebnis)).length * 3;
  if (tasks.find(t => !t.erledigt && t.faellig_am && new Date(t.faellig_am) < now)) score += 4;
  score += Math.min(logs.length, 5);
  return Math.max(0, score);
}

async function aiScoreCompany(base44, company, logs) {
  const logSummary = logs.slice(0, 6).map(l =>
    `- ${l.typ} (${l.ergebnis}): ${(l.notiz||"").slice(0,80)}${l.naechster_schritt ? " → "+l.naechster_schritt : ""}`
  ).join("\n");
  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `Vertriebsanalyst für Gebäudedienstleistung. Bewerte diesen Lead 0-100:\nFirma: ${company.name}, Branche: ${company.branche||"?"}, Status: ${company.status}\nKontakte:\n${logSummary||"kein Kontakt"}\nNotizen: ${(company.notizen||"").replace(/\[\[AI:.*?\]\]\n?/s,"").slice(0,100)}\nKriterien: Interesse-Signale, Abschlusswahrscheinlichkeit, Dringlichkeit, Branchenfit.\nJSON: {"score": <0-100>, "grund": "<max 12 Wörter>"}`,
    response_json_schema: { type:"object", properties:{ score:{type:"number"}, grund:{type:"string"} } }
  });
  return { ai_score: Math.min(100,Math.max(0,Math.round(result.score||0))), ai_grund: result.grund||"" };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;

    // ── 1. checkAccess ──────────────────────────────────────────────────────
    if (!organization_id) return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });
    const access = await checkAccess(req, { organization_id, action: 'use_ai_scoring' });
    if (!access.allowed) {
      console.warn(`[priorityAgent] Access denied: ${access.reason}`);
      return Response.json({ error: access.message, reason: access.reason }, { status: 403 });
    }

    // ── 2. Nur Daten der eigenen Organisation laden ─────────────────────────
    const [companies, contactLogs, tasks] = await Promise.all([
      base44.asServiceRole.entities.Company.filter({ organization_id }),
      base44.asServiceRole.entities.ContactLog.filter({ organization_id }),
      base44.asServiceRole.entities.Task.filter({ organization_id }),
    ]);

    // Sales Rep: nur zugewiesene Leads
    const filteredCompanies = access.role === 'sales_rep'
      ? companies.filter(c => c.assigned_to === access.user.email)
      : companies;

    const logsByCompany = {};
    for (const log of contactLogs) { if (!logsByCompany[log.company_id]) logsByCompany[log.company_id]=[]; logsByCompany[log.company_id].push(log); }
    const tasksByCompany = {};
    for (const task of tasks) { if (!tasksByCompany[task.company_id]) tasksByCompany[task.company_id]=[]; tasksByCompany[task.company_id].push(task); }

    let updated = 0, aiAnalyzed = 0;

    for (const company of filteredCompanies) {
      if (["Gewonnen","Verloren"].includes(company.status)) continue;
      const logs = (logsByCompany[company.id]||[]).sort((a,b) => new Date(b.created_date)-new Date(a.created_date));
      const compTasks = tasksByCompany[company.id]||[];
      const baseScore = calcBaseScore(company, logs, compTasks);

      let aiScore=null, aiGrund="";
      if (logs.length >= 2 && aiAnalyzed < 20) {
        try {
          if (aiAnalyzed > 0) await new Promise(r => setTimeout(r, 2000));
          const res = await aiScoreCompany(base44, company, logs);
          aiScore=res.ai_score; aiGrund=res.ai_grund; aiAnalyzed++;
        } catch (e) { console.error(`AI scoring failed for ${company.name}:`, e.message); }
      }

      const finalScore = aiScore !== null
        ? Math.round(Math.min(100,Math.round(baseScore*2))*0.4 + aiScore*0.6)
        : Math.min(100, Math.round(baseScore*2));
      const isHot = finalScore >= 60;
      const updatePayload = { priority_score: finalScore, is_hot: isHot };

      if (aiScore !== null && aiGrund) {
        const cleanNotizen = (company.notizen||"").replace(/\[\[AI:.*?\]\]\n?/s,"");
        updatePayload.notizen = `[[AI:${aiGrund}]]\n${cleanNotizen}`.trim();
      }

      if (company.priority_score !== finalScore || company.is_hot !== isHot) {
        await base44.asServiceRole.entities.Company.update(company.id, updatePayload);
        updated++;
      }
    }

    // ── 3. UsageLog ─────────────────────────────────────────────────────────
    if (aiAnalyzed > 0) {
      try {
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const periodEnd = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59).toISOString();
        const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_start: periodStart });
        if (usageLogs[0]) {
          await base44.asServiceRole.entities.UsageLog.update(usageLogs[0].id, { ai_scorings_used: (usageLogs[0].ai_scorings_used||0)+aiAnalyzed });
        } else {
          await base44.asServiceRole.entities.UsageLog.create({ organization_id, period_start: periodStart, period_end: periodEnd, ai_scorings_used: aiAnalyzed });
        }
      } catch (e) { console.warn('[priorityAgent] UsageLog failed:', e.message); }
    }

    console.info(`[priorityAgent] org=${organization_id} evaluated=${filteredCompanies.length} updated=${updated} ai=${aiAnalyzed}`);
    return Response.json({ success:true, ran_at:new Date().toISOString(), companies_evaluated:filteredCompanies.length, companies_updated:updated, ai_analyzed:aiAnalyzed });

  } catch (error) {
    console.error("priorityAgent error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});