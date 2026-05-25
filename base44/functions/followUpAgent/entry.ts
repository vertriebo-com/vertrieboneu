import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ─── ARCHITEKTUR-HINWEIS ──────────────────────────────────────────────────────
// TODO (Skalierung): Bei 100+ Orgs muss ein Orchestrator alle aktiven Orgs
// laden und followUpAgent pro Org enqueuen. Derzeit: eine Automation = eine Org.
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

// ─── Org Settings Loader ─────────────────────────────────────────────────────
async function loadOrgSettings(base44, organization_id) {
  try {
    const records = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id });
    const map = {};
    for (const r of records) map[r.key] = r.value;
    return {
      services: map.services || map.dienstleistungen || '',
      targetCustomerTypes: map.target_customer_types || map.zielkunden || '',
    };
  } catch {
    return { services: '', targetCustomerTypes: '' };
  }
}

// ─── Task Text Builder ────────────────────────────────────────────────────────
function buildTaskTexts(company, orgSettings, type) {
  const serviceCtx = company.matched_service_context || '';
  const leadType = company.matched_target_customer_type || company.branche || '';
  const firstService = serviceCtx
    ? serviceCtx.split(',')[0].trim()
    : (orgSettings.services ? orgSettings.services.split(',')[0].trim() : '');

  // Titel
  let titel;
  if (type === 'rueckruf') {
    if (leadType && firstService) {
      titel = `Rückruf bei ${leadType} wegen ${firstService}: ${company.name}`;
    } else if (firstService) {
      titel = `Rückruf wegen ${firstService}: ${company.name}`;
    } else {
      titel = `Rückruf: ${company.name}`;
    }
  } else if (type === 'nachfassen') {
    if (leadType && firstService) {
      titel = `Nachfassen bei ${leadType} wegen ${firstService}: ${company.name}`;
    } else if (firstService) {
      titel = `Nachfassen wegen ${firstService}: ${company.name}`;
    } else {
      titel = `Nachfassen: ${company.name} – kein Kontakt seit 7 Tagen`;
    }
  } else if (type === 'angebot_nachfassen') {
    if (firstService) {
      titel = `Angebot ${firstService} nachfassen: ${company.name}`;
    } else {
      titel = `Angebot nachfassen: ${company.name} – seit 7 Tagen kein Feedback`;
    }
  } else { // reaktivieren
    if (leadType && firstService) {
      titel = `Reaktivieren: ${leadType} ${company.name} – ${firstService} ansprechen`;
    } else if (firstService) {
      titel = `Reaktivieren: ${company.name} – ${firstService} ansprechen`;
    } else {
      titel = `Reaktivieren: ${company.name} – seit 30 Tagen inaktiv`;
    }
  }

  // Beschreibung
  const parts = [];
  if (leadType) parts.push(`Lead-Typ: ${leadType}`);
  if (serviceCtx) {
    parts.push(`Relevante Leistung: ${serviceCtx}`);
  } else if (orgSettings.services) {
    parts.push(`Angebotene Leistungen: ${orgSettings.services.split(',').slice(0,3).join(', ')}`);
  }
  if (company.relevance_reason) parts.push(`Warum passend: ${company.relevance_reason}`);

  // Nächster Schritt je nach Typ
  if (type === 'rueckruf') {
    parts.push(`Nächster Schritt: Ansprechpartner klären und Bedarf für ${firstService || 'unsere Leistungen'} kurz qualifizieren.`);
  } else if (type === 'nachfassen') {
    parts.push(`Nächster Schritt: Kontakt aufnehmen und Status klären – hat sich etwas verändert?`);
  } else if (type === 'angebot_nachfassen') {
    parts.push(`Nächster Schritt: Feedback zum Angebot einholen und Entscheidung herbeiführen.`);
  } else {
    parts.push(`Nächster Schritt: Lead erneut kontaktieren und Aktualität des Bedarfs prüfen.`);
  }

  const beschreibung = parts.length > 1 ? parts.join('\n') : null;
  return { titel, beschreibung };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;

    // ── 1. organization_id Pflicht + checkAccess ────────────────────────────
    if (!organization_id) return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });
    const access = await checkAccess(req, { organization_id, action: 'manage_settings' });
    if (!access.allowed) {
      console.warn(`[followUpAgent] Access denied: ${access.reason}`);
      return Response.json({ error: access.message, reason: access.reason }, { status: 403 });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now - 7*24*60*60*1000);
    const thirtyDaysAgo = new Date(now - 30*24*60*60*1000);

    // ── 2. Alle Daten org-spezifisch laden ─────────────────────────────────
    const [companies, tasks, contactLogs, orgSettings] = await Promise.all([
      base44.asServiceRole.entities.Company.filter({ organization_id }),
      base44.asServiceRole.entities.Task.filter({ organization_id }),
      base44.asServiceRole.entities.ContactLog.filter({ organization_id }),
      loadOrgSettings(base44, organization_id),
    ]);

    const activeCompanies = companies.filter(c => !["Gewonnen","Verloren"].includes(c.status) && !c.is_blacklisted);

    // Last contact per company
    const lastContactByCompany = {};
    for (const log of contactLogs) {
      if (!lastContactByCompany[log.company_id] || new Date(log.created_date) > new Date(lastContactByCompany[log.company_id])) {
        lastContactByCompany[log.company_id] = log.created_date;
      }
    }
    const openTasksByCompany = {};
    for (const task of tasks.filter(t => !t.erledigt)) {
      if (!openTasksByCompany[task.company_id]) openTasksByCompany[task.company_id] = [];
      openTasksByCompany[task.company_id].push(task);
    }

    let tasksCreated = 0;

    // ── 3. Rückruf-Status ohne offene Rückruf-Task ──────────────────────────
    for (const company of activeCompanies.filter(c => c.status === "Rückruf")) {
      const hasRückrufTask = (openTasksByCompany[company.id]||[]).some(t => t.typ === "Rückruf");
      if (!hasRückrufTask) {
        const { titel, beschreibung } = buildTaskTexts(company, orgSettings, 'rueckruf');
        await base44.asServiceRole.entities.Task.create({
          organization_id,
          company_id: company.id, company_name: company.name,
          titel, beschreibung, typ: "Rückruf", prioritaet: "Hoch",
          faellig_am: new Date().toISOString(), erledigt: false, assigned_to: company.assigned_to,
        });
        tasksCreated++;
      }
    }

    // ── 4. Kontakt-Status ohne Kontakt seit 7 Tagen → Nachfassen ───────────
    for (const company of activeCompanies.filter(c => c.status === "Kontakt")) {
      const lastContact = lastContactByCompany[company.id];
      if (!lastContact || new Date(lastContact) < sevenDaysAgo) {
        if (!(openTasksByCompany[company.id]||[]).length) {
          const { titel, beschreibung } = buildTaskTexts(company, orgSettings, 'nachfassen');
          await base44.asServiceRole.entities.Task.create({
            organization_id,
            company_id: company.id, company_name: company.name,
            titel, beschreibung, typ: "Nachfassen", prioritaet: "Hoch",
            faellig_am: new Date().toISOString(), erledigt: false, assigned_to: company.assigned_to,
          });
          tasksCreated++;
        }
      }
    }

    // ── 5. Angebot ohne Kontakt seit 7 Tagen → Erinnerung ──────────────────
    for (const company of activeCompanies.filter(c => c.status === "Angebot")) {
      const lastContact = lastContactByCompany[company.id];
      if (!lastContact || new Date(lastContact) < sevenDaysAgo) {
        const hasNachfass = (openTasksByCompany[company.id]||[]).some(t => t.typ === "Nachfassen");
        if (!hasNachfass) {
          const { titel, beschreibung } = buildTaskTexts(company, orgSettings, 'angebot_nachfassen');
          await base44.asServiceRole.entities.Task.create({
            organization_id,
            company_id: company.id, company_name: company.name,
            titel, beschreibung, typ: "Nachfassen", prioritaet: "Hoch",
            faellig_am: new Date().toISOString(), erledigt: false, assigned_to: company.assigned_to,
          });
          tasksCreated++;
        }
      }
    }

    // ── 6. Alle aktiven Leads – 30 Tage inaktiv → reaktivieren ─────────────
    for (const company of activeCompanies.filter(c => !["Rückruf","Angebot","Termin"].includes(c.status))) {
      const lastContact = lastContactByCompany[company.id];
      const lastActivity = lastContact ? new Date(lastContact) : new Date(company.created_date);
      if (lastActivity < thirtyDaysAgo && !(openTasksByCompany[company.id]||[]).length) {
        const { titel, beschreibung } = buildTaskTexts(company, orgSettings, 'reaktivieren');
        await base44.asServiceRole.entities.Task.create({
          organization_id,
          company_id: company.id, company_name: company.name,
          titel, beschreibung, typ: "Nachfassen", prioritaet: "Mittel",
          faellig_am: new Date().toISOString(), erledigt: false, assigned_to: company.assigned_to,
        });
        tasksCreated++;
      }
    }

    console.info(`[followUpAgent] org=${organization_id} tasks_created=${tasksCreated} active=${activeCompanies.length}`);
    return Response.json({ success:true, ran_at:now.toISOString(), tasks_created:tasksCreated, active_companies:activeCompanies.length });

  } catch (error) {
    console.error('[followUpAgent] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});