/**
 * createPortalSession
 * ===================
 * AuthZ via kanonischer authorizeOrganizationAction (sharedAuthz v1.0.0)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import Stripe from 'npm:stripe@14.21.0';

// ── authorizeOrganizationAction (kanonisch, sharedAuthz v1.0.0) ──────────────
const _PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);
const _ACTION_ROLES = {
  manage_billing: ['organization_admin'],
  manage_blacklist: ['organization_admin'],
  delete_company: ['organization_admin'],
  use_ai_scoring: ['organization_admin', 'sales_rep'],
};
function _allow(r) { return { allowed: true, status: 200, error: null, ...r }; }
function _deny(reason, message, ctx = {}) { return { allowed: false, status: reason === 'not_authenticated' ? 401 : 403, error: message, reason, user: ctx.user || null, organization: ctx.organization || null, member: ctx.member || null, access_role: ctx.access_role || null }; }
async function authorizeOrganizationAction(base44, { organizationId, action = null, requiredRoles = [], requireActiveOrg = true, allowPlatformAdmin = true } = {}) {
  let user; try { user = await base44.auth.me(); } catch { return _deny('not_authenticated', 'Nicht eingeloggt.'); }
  if (!user) return _deny('not_authenticated', 'Nicht eingeloggt.');
  if (allowPlatformAdmin && _PLATFORM_ADMIN_ROLES.has(user.role)) return _allow({ user, organization: null, member: null, access_role: 'platform_admin' });
  if (!organizationId) return _deny('missing_organization_id', 'Keine organization_id angegeben.');
  let orgs, members;
  try { [orgs, members] = await Promise.all([base44.asServiceRole.entities.Organization.filter({ id: organizationId }), base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: organizationId, user_email: user.email })]); }
  catch (e) { return _deny('organization_not_found', 'Organisation nicht gefunden.'); }
  const organization = orgs[0] || null;
  if (!organization) return _deny('organization_not_found', 'Organisation nicht gefunden.');
  if (requireActiveOrg && organization.platform_status === 'suspended') return _deny('organization_suspended', `Organisation gesperrt: ${organization.suspended_reason || 'kein Grund'}.`, { user, organization });
  if (organization.owner_email === user.email) return _allow({ user, organization, member: members[0] || null, access_role: 'organization_admin' });
  const member = members[0] || null;
  if (!member) return _deny('not_a_member', 'Kein Mitglied dieser Organisation.', { user, organization });
  if (member.status !== 'active') return _deny('member_inactive', `Mitglied-Status: "${member.status}".`, { user, organization, member });
  const memberRole = member.role;
  const effectiveRequired = requiredRoles.length > 0 ? requiredRoles : (action && _ACTION_ROLES[action] ? _ACTION_ROLES[action] : null);
  if (effectiveRequired && !effectiveRequired.includes(memberRole)) return _deny('insufficient_role', `Rolle "${memberRole}" darf "${action || requiredRoles.join(',')}" nicht.`, { user, organization, member, access_role: memberRole });
  return _allow({ user, organization, member, access_role: memberRole });
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
    const access = await authorizeOrganizationAction(base44, { organizationId: organization_id, action: 'manage_billing' });
    if (!access.allowed) {
      console.warn(`[createPortalSession] Access denied: ${access.reason}`);
      return Response.json({ error: access.error, reason: access.reason }, { status: access.status });
    }
    const user = access.user;

    // ── 3. Organisation laden (für platform_admin: access.organization ist null) ─
    let orgData = access.organization;
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