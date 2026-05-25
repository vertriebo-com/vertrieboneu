/**
 * createCheckoutSession
 * =====================
 * AuthZ via kanonischer authorizeOrganizationAction (sharedAuthz v1.0.0)
 *
 * SOURCE OF TRUTH ARCHITEKTUR:
 *  Stripe  = Zahlungsquelle (Geld, Rechnungen, Zahlungsmethoden)
 *  unsere DB = App-Zugriffsquelle (Rollen, Features, Limits)
 *
 *  Trial-Schutz: nur Starter-Plan, nur wenn noch keine Subscription vorhanden.
 *  Parallel-Checkout-Schutz: aktive/trialing Sub → 409, außer allow_upgrade=true.
 *  Agency-Block: Agency-Plan nur auf Anfrage, kein Self-Service-Checkout.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
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

function getAppEnvironment() {
  const key = Deno.env.get('STRIPE_SECRET_KEY') || '';
  return key.startsWith('sk_live_') ? 'production' : 'sandbox';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { organization_id, plan_id, success_url, cancel_url, allow_upgrade = false } = body;

    // ── 1. Pflichtparameter ─────────────────────────────────────────────────
    if (!organization_id) return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });
    if (!plan_id) return Response.json({ error: 'plan_id ist Pflichtparameter' }, { status: 400 });

    // ── 2. HARD-BLOCK: Suspended Org kann keinen neuen Checkout starten ─────
    // requireActiveOrg=true blockiert suspended BEVOR owner-bypass greift
    const access = await authorizeOrganizationAction(base44, {
      organizationId: organization_id,
      action: 'manage_billing',
      requireActiveOrg: true,
    });
    if (!access.allowed) {
      console.warn(`[createCheckoutSession] Access denied: ${access.reason}`);
      return Response.json({ error: access.error, reason: access.reason }, { status: access.status });
    }
    const user = access.user;
    const userRole = access.access_role;

    // ── 3. Plan aus DB laden (Price-ID NIEMALS vom Frontend übernehmen) ─────
    let plan = null;
    try {
      const plans = await base44.asServiceRole.entities.Plan.filter({ id: plan_id });
      plan = plans[0] || null;
    } catch (_) { plan = null; }
    if (!plan) return Response.json({ error: `Plan "${plan_id}" nicht gefunden` }, { status: 404 });
    if (!plan.stripe_price_id) return Response.json({ error: `Plan hat keine Stripe Price ID – bitte zuerst Stripe Products anlegen` }, { status: 400 });
    if (!plan.is_active) return Response.json({ error: `Plan ist nicht buchbar` }, { status: 400 });

    // ── 3a. HARD-BLOCK: Pläne die nicht self-service buchbar sind ────────────
    // Technisch: plan.plan_type === 'agency' ODER plan.allow_self_service === false
    // Kein plan.name.includes() / plan.slug — technische Felder sind source of truth
    const isNotSelfService = plan.plan_type === 'agency' || plan.allow_self_service === false;
    if (isNotSelfService) {
      console.warn(`[createCheckoutSession] Access denied: Non-self-service plan checkout attempt for org ${organization_id} plan=${plan.name} plan_type=${plan.plan_type} allow_self_service=${plan.allow_self_service}`);
      return Response.json({ error: 'Dieser Plan ist nur auf Anfrage verfügbar', reason: 'agency_contact_required' }, { status: 400 });
    }

    // ── 4. Organisation laden (platform_admin: access.organization ist null) ─
    let org = access.organization;
    if (!org) {
      try {
        const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
        org = orgs[0] || null;
      } catch (e) {
        console.error(`[createCheckoutSession] Failed to load org ${organization_id}:`, e.message);
        return Response.json({ error: 'Organisation konnte nicht geladen werden', reason: 'org_load_failed' }, { status: 404 });
      }
    }
    if (!org) return Response.json({ error: 'Organisation nicht gefunden' }, { status: 404 });

    // ── 5. Existierende Subscriptions prüfen ───────────────────────────────
    let existingSubs = [];
    try {
      existingSubs = await base44.asServiceRole.entities.Subscription.filter({ organization_id });
    } catch (e) {
      console.error(`[createCheckoutSession] Failed to load subscriptions for org ${organization_id}:`, e.message);
    }
    const activeSub = existingSubs.find(s => ['active', 'trialing'].includes(s.status));

    // ── 5a. Doppel-Checkout-Schutz ───────────────────────────────────────────
    if (activeSub && !allow_upgrade) {
      console.warn(`[createCheckoutSession] Active subscription already exists for org ${organization_id}`);
      return Response.json({
        error: 'Organisation hat bereits eine aktive Subscription',
        subscription_status: activeSub.status,
        hint: 'Sende allow_upgrade=true für Plan-Wechsel oder nutze das Kundenportal',
      }, { status: 409 });
    }

    // Trial-Dauer aus Plan-Entity (plan.trial_days) — kein name.includes() mehr
    const trialDays = plan.trial_days ?? 0;

    console.info(`[createCheckoutSession] org=${organization_id} plan=${plan.name} plan_code=${plan.plan_code || 'n/a'} trial=${trialDays}d (from plan.trial_days)`);

    // ── 6. Stripe Customer: bestehende ID nutzen oder neu anlegen ───────────
    let stripeCustomerId = org.stripe_customer_id || null;
    if (!stripeCustomerId) {
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          name: org.name,
          metadata: {
            organization_id,
            owner_email: org.owner_email,
            base44_app_id: Deno.env.get('BASE44_APP_ID'),
            app_environment: getAppEnvironment(),
          },
        });
        stripeCustomerId = customer.id;
        await base44.asServiceRole.entities.Organization.update(organization_id, { stripe_customer_id: stripeCustomerId });
        console.info(`[createCheckoutSession] Stripe Customer erstellt: ${stripeCustomerId} für org ${organization_id}`);
      } catch (e) {
        console.error(`[createCheckoutSession] Failed to create Stripe customer for org ${organization_id}:`, e.message);
        return Response.json({ error: 'Stripe Customer konnte nicht erstellt werden', reason: 'stripe_customer_creation_failed' }, { status: 500 });
      }
    }

    const origin = req.headers.get('origin') || 'https://app.base44.com';
    const successRedirect = success_url || `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelRedirect = cancel_url || `${origin}/landing`;
    const appEnv = getAppEnvironment();

    // ── 7. Checkout Session erstellen ───────────────────────────────────────
    const sessionParams = {
      mode: 'subscription',
      customer: stripeCustomerId,
      payment_method_types: ['card', 'klarna'],
      allow_promotion_codes: true,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: successRedirect,
      cancel_url: cancelRedirect,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        organization_id,
        plan_id,
        plan_name: plan.name,
        initiated_by_user: user.email,
        initiated_by_role: userRole,
        app_environment: appEnv,
        ...(activeSub?.stripe_subscription_id ? { upgrade_from_subscription_id: activeSub.stripe_subscription_id } : {}),
      },
      subscription_data: {
        metadata: {
          organization_id,
          plan_id,
          plan_name: plan.name,
          initiated_by_user: user.email,
          initiated_by_role: userRole,
          app_environment: appEnv,
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
        },
      },
    };

    if (trialDays > 0) {
      sessionParams.subscription_data.trial_period_days = trialDays;
      console.info(`[createCheckoutSession] Trial aktiviert: ${trialDays} Tage (Starter) für org ${organization_id}`);
    } else {
      console.info(`[createCheckoutSession] Kein Trial für Plan "${plan.name}" – direkter Start`);
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.info(`[createCheckoutSession] OK – org=${organization_id} user=${user.email} plan=${plan.name} session=${session.id} trial=${trialDays}d upgrade=${allow_upgrade} env=${appEnv}`);
    return Response.json({
      url: session.url,
      session_id: session.id,
      trial_days: trialDays,
      has_trial: trialDays > 0,
      plan_name: plan.name,
    });

  } catch (error) {
    console.error('[createCheckoutSession] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});