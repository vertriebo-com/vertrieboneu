import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

// ─── Inline checkAccess (nur manage_billing relevant) ────────────────────────
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

function _allow(r) { return { allowed:true, ...r }; }
function _deny(reason, message) { return { allowed:false, reason, message, user:null }; }

async function checkAccess(req, { organization_id, action }={}) {
  const b44 = createClientFromRequest(req);
  let user; try { user = await b44.auth.me(); } catch { return _deny('not_authenticated','Nicht eingeloggt.'); }
  if (!user) return _deny('not_authenticated','Nicht eingeloggt.');
  if (user.role === 'admin') return _allow({ reason:'platform_admin', user, organization:null, member:null, role:'platform_admin' });
  if (!organization_id) return _deny('missing_organization_id','Keine organization_id angegeben.');
  let orgs, members;
  try { [orgs, members] = await Promise.all([b44.asServiceRole.entities.Organization.filter({id:organization_id}), b44.asServiceRole.entities.OrganizationMember.filter({organization_id, user_email:user.email})]); }
  catch { return _deny('organization_not_found','Organisation nicht gefunden.'); }
  const organization = orgs[0]||null;
  if (!organization) return _deny('organization_not_found','Organisation nicht gefunden.');

  // Suspension-Check (vor owner/member)
  if (organization.platform_status === 'suspended') return _deny('organization_suspended', `Organisation gesperrt: ${organization.suspended_reason||'kein Grund'}.`);

  // Owner der Organisation darf immer Billing-Portal öffnen
  if (organization.owner_email === user.email) {
    return _allow({ reason:'org_owner', user, organization, member: members[0]||null, role:'organization_admin' });
  }

  const member = members[0]||null;
  if (!member) return _deny('not_a_member','Kein Mitglied dieser Organisation.');
  if (member.status!=='active') return _deny('member_inactive',`Mitglied-Status: "${member.status}".`);
  const role = member.role;
  if (action) {
    const ar = ACTION_ROLES[action];
    if (!ar || !ar.includes(role)) return _deny('insufficient_role',`Rolle "${role}" darf "${action}" nicht.`);
  }
  return _allow({ reason:'ok', user, organization, member, role });
}
// ─────────────────────────────────────────────────────────────────────────────

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { organization_id, return_url } = body;

    // ── 1. Pflichtparameter ─────────────────────────────────────────────────
    if (!organization_id) return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });

    // ── 2. Nur organization_admin darf Kundenportal öffnen ─────────────────
    const access = await checkAccess(req, { organization_id, action: 'manage_billing' });
    if (!access.allowed) {
      console.warn(`[createPortalSession] Access denied: ${access.reason}`);
      return Response.json({ error: access.message, reason: access.reason }, { status: 403 });
    }
    const user = access.user;

    // ── 3. Eigene Organisation laden (keine fremden IDs akzeptieren) ─────────
    // organization already validated via checkAccess (access.organization contains the org)
    const org = access.organization;
    // For platform_admin: load org manually since checkAccess returns null organization
    let orgData = org;
    if (!orgData) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      orgData = orgs[0] || null;
    }
    if (!orgData) return Response.json({ error: 'Organisation nicht gefunden', code: 'org_not_found' }, { status: 404 });

    if (!orgData.stripe_customer_id) {
      return Response.json({
        error: 'Kein Stripe-Konto verknüpft. Bitte zuerst ein Abonnement abschließen.',
        code: 'no_stripe_customer'
      }, { status: 400 });
    }

    // ── 4. Sicherheitscheck: Customer ID kommt NUR aus unserer DB ───────────
    const stripeCustomerId = orgData.stripe_customer_id;

    const origin = req.headers.get('origin') || 'https://app.base44.com';
    const returnUrl = return_url || `${origin}/settings`;

    // ── 5. Stripe Customer Portal Session erstellen ─────────────────────────
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    console.info(`[createPortalSession] org=${organization_id} user=${user.email} customer=${stripeCustomerId} org_name=${orgData.name}`);
    return Response.json({ url: portalSession.url });

  } catch (error) {
    console.error('[createPortalSession] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});