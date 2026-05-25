import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ─── ARCHITEKTUR-HINWEIS ──────────────────────────────────────────────────────
// TODO (Skalierung): cleanupAgent muss bei 100+ Orgs pro Org als separater
// Job laufen. Jetzt: organization_id als Pflichtparameter = batch-ready.
// Admin-only: nur organization_admin oder platform_admin darf ausführen.
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
    const { organization_id } = body;

    // ── 1. organization_id Pflicht + checkAccess (nur admin) ────────────────
    if (!organization_id) return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });
    const access = await checkAccess(req, { organization_id, action: 'manage_settings' });
    if (!access.allowed) {
      console.warn(`[cleanupAgent] Access denied: ${access.reason}`);
      return Response.json({ error: access.message, reason: access.reason }, { status: 403 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30*24*60*60*1000);
    const sixtyDaysAgo = new Date(now - 60*24*60*60*1000);

    // ── 2. Alle Daten org-spezifisch laden ─────────────────────────────────
    const [companies, tasks, contactLogs] = await Promise.all([
      base44.asServiceRole.entities.Company.filter({ organization_id }),
      base44.asServiceRole.entities.Task.filter({ organization_id }),
      base44.asServiceRole.entities.ContactLog.filter({ organization_id }),
    ]);

    // Last contact per company
    const lastContactByCompany = {};
    for (const log of contactLogs) {
      if (!lastContactByCompany[log.company_id] || new Date(log.created_date) > new Date(lastContactByCompany[log.company_id])) {
        lastContactByCompany[log.company_id] = log.created_date;
      }
    }

    let deadLeadsMarked = 0;
    let tasksDeleted = 0;
    const duplicatesFound = [];

    // ── 3. Tote "Neu"-Leads archivieren (30 Tage kein Kontakt) ─────────────
    for (const company of companies) {
      if (company.status !== "Neu") continue;
      const lastContact = lastContactByCompany[company.id];
      const lastActivity = lastContact ? new Date(lastContact) : new Date(company.created_date);
      if (lastActivity < thirtyDaysAgo) {
        await base44.asServiceRole.entities.Company.update(company.id, {
          status: "Verloren",
          notizen: (company.notizen||"") + `\n[Cleanup ${now.toLocaleDateString('de-DE')}]: Archiviert – kein Kontakt seit 30+ Tagen.`,
        });
        deadLeadsMarked++;
      }
    }

    // ── 4. Erledigte Tasks älter als 60 Tage löschen ───────────────────────
    for (const task of tasks) {
      if (task.erledigt && task.updated_date && new Date(task.updated_date) < sixtyDaysAgo) {
        await base44.asServiceRole.entities.Task.delete(task.id);
        tasksDeleted++;
      }
    }

    // ── 5. Dubletten finden (gleicher Name, case-insensitive) ───────────────
    const nameMap = {};
    for (const company of companies) {
      const key = company.name?.toLowerCase().trim();
      if (!key) continue;
      if (!nameMap[key]) nameMap[key] = [];
      nameMap[key].push(company.id);
    }
    for (const [name, ids] of Object.entries(nameMap)) {
      if (ids.length > 1) duplicatesFound.push({ name, count:ids.length, ids });
    }

    console.info(`[cleanupAgent] org=${organization_id} dead_leads=${deadLeadsMarked} tasks_deleted=${tasksDeleted} duplicates=${duplicatesFound.length}`);
    return Response.json({
      success: true,
      ran_at: now.toISOString(),
      dead_leads_archived: deadLeadsMarked,
      tasks_deleted: tasksDeleted,
      duplicates_found: duplicatesFound.length,
      duplicates: duplicatesFound,
    });

  } catch (error) {
    console.error('[cleanupAgent] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});