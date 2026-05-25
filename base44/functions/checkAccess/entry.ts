import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ─── Action → Role Matrix ─────────────────────────────────────────────────────
// Defines which roles are allowed to perform which actions.
// platform_admin bypasses all org-level checks.
const ACTION_ROLES = {
  view_leads:                ['organization_admin', 'sales_rep'],
  create_lead:               ['organization_admin', 'sales_rep'],
  update_assigned_lead:      ['organization_admin', 'sales_rep'],
  delete_lead:               ['organization_admin'],
  generate_leads:            ['organization_admin'],
  create_contact_log:        ['organization_admin', 'sales_rep'],
  view_tasks:                ['organization_admin', 'sales_rep'],
  complete_task:             ['organization_admin', 'sales_rep'],
  manage_users:              ['organization_admin'],
  manage_settings:           ['organization_admin'],
  manage_billing:            ['organization_admin'],
  data_export:               ['organization_admin'],
  view_reports:              ['organization_admin', 'sales_rep'],
  use_ai_scoring:            ['organization_admin', 'sales_rep'],
  send_bulk_email:           ['organization_admin', 'sales_rep'],
  manage_blacklist:          ['organization_admin'],
  platform_admin_access:     [], // platform_admin only
};

// ─── Billing Status → Access Mode ────────────────────────────────────────────
//
//  full        – alles erlaubt
//  degraded    – sales_rep nur Lesen/Bearbeiten; admin alles außer neue Leads/KI
//  admin_only  – nur admin: billing + data_export; sales_rep komplett gesperrt
//  blocked     – niemand hat Zugriff außer admin auf billing + data_export
//
const BILLING_ACCESS = {
  preview:              'full',
  active:               'full',
  trialing:             'full',
  past_due:             'degraded',       // sales_rep: lesen+bearbeiten; kein create/AI
  incomplete:           'degraded',       // gleich wie past_due
  unpaid:               'blocked',        // admin: nur billing; sales_rep: nix
  canceled:             'blocked',        // admin: billing + data_export; sales_rep: nix
  incomplete_expired:   'blocked',        // wie unpaid
};

// Aktionen, die im Modus "degraded" GESPERRT sind (für alle Rollen)
const DEGRADED_BLOCKED_ACTIONS = new Set([
  'create_lead',
  'generate_leads',
  'use_ai_scoring',
  'send_bulk_email',
]);

// Aktionen, die admin auch im Modus "blocked" darf
const BLOCKED_ADMIN_ALLOWED = new Set(['manage_billing', 'data_export']);

// ─── Main checkAccess function ────────────────────────────────────────────────
/**
 * checkAccess(req, { organization_id, action, check_limit })
 *
 * @param req         - The incoming Deno request (for auth)
 * @param options
 *   organization_id  - The org to check membership in
 *   action           - Action string (e.g. 'view_leads')
 *   check_limit      - Optional limit key to validate (e.g. 'max_leads_per_month')
 *   current_usage    - Current usage count for the limit check
 *
 * @returns {
 *   allowed: boolean,
 *   reason: string,
 *   global_role, is_base44_admin, is_platform_owner, is_platform_admin,
 *   is_support_agent, is_readonly_support,
 *   organization_id, organization_role, is_organization_admin, is_sales_rep,
 *   user, organization, member, role, plan, subscription, limits
 * }
 */
export async function checkAccess(req, { organization_id, action, check_limit = null, current_usage = 0 } = {}) {
  const base44 = createClientFromRequest(req);

  // ── 1. Authentication ──────────────────────────────────────────────────────
  let user;
  try {
    user = await base44.auth.me();
  } catch {
    return deny('not_authenticated', 'Nicht eingeloggt.');
  }
  if (!user) return deny('not_authenticated', 'Nicht eingeloggt.');

  const isBaseAdmin = user.role === 'admin';
  const isPlatformLevel = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);

  // ── 2. Platform Admin/Owner shortcut ─────────────────────────────────────────────
  // Base44 admin and platform owners can bypass org-level checks
  if (isPlatformLevel && !organization_id) {
    console.info(`[checkAccess] platform_level "${user.email}" (role="${user.role}") platform access`);
    return allow({
      reason: 'platform_level',
      user,
      global_role: user.role,
      is_base44_admin: isBaseAdmin,
      is_platform_owner: ['admin', 'platform_owner'].includes(user.role),
      is_platform_admin: isPlatformLevel,
      is_support_agent: isSupportAgent(user.role),
      is_readonly_support: isReadOnlySupport(user.role),
      organization: null,
      organization_id: null,
      member: null,
      organization_role: null,
      is_organization_admin: false,
      is_sales_rep: false,
      // Backward-compatible
      role: null,
      is_admin: false,
      isAdmin: false,
      isSalesRep: false,
      user_role: user.role,
      plan: null,
      subscription: null,
      limits: null,
    });
  }

  if (isPlatformLevel && organization_id) {
    console.info(`[checkAccess] platform_level "${user.email}" (role="${user.role}") accessing org="${organization_id}"`);
    // Fetch org for suspension info (platform admin still has access, but sees the status)
    let platformOrg = null;
    try {
      const orgsForAdmin = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      platformOrg = orgsForAdmin[0] || null;
    } catch (err) {
      console.warn('[checkAccess] platform_level org lookup failed:', err?.message);
    }
    return allow({
      reason: 'platform_level_org_access',
      user,
      global_role: user.role,
      is_base44_admin: isBaseAdmin,
      is_platform_owner: ['admin', 'platform_owner'].includes(user.role),
      is_platform_admin: isPlatformLevel,
      is_support_agent: isSupportAgent(user.role),
      is_readonly_support: isReadOnlySupport(user.role),
      organization: platformOrg,
      organization_id,
      member: null,
      organization_role: null,
      is_organization_admin: false,
      is_sales_rep: false,
      // Backward-compatible
      role: 'platform_admin',
      is_admin: false,
      isAdmin: false,
      isSalesRep: false,
      user_role: user.role,
      plan: null,
      subscription: null,
      limits: null,
      organization_platform_status: platformOrg?.platform_status || 'active',
      organization_suspended: platformOrg?.platform_status === 'suspended',
      suspended_reason: platformOrg?.suspended_reason || null,
      suspended_at: platformOrg?.suspended_at || null,
    });
  }

  // ── 3. Organization check (required for non-platform users) ─────────────────
  if (!organization_id) return deny('missing_organization_id', 'Keine organisation_id angegeben.');

  // Safe organization lookup with SDK error handling
  let orgs, members;
  try {
    [orgs, members] = await Promise.all([
      base44.asServiceRole.entities.Organization.filter({ id: organization_id }),
      base44.asServiceRole.entities.OrganizationMember.filter({
        organization_id,
        user_email: user.email,
      }),
    ]);
  } catch (err) {
    console.warn('[checkAccess] Invalid organization lookup', {
      organization_id,
      error: err?.message,
    });
    return deny('invalid_organization_id', `Ungültige Organisation: "${organization_id}".`);
  }

  const organization = orgs[0] || null;
  if (!organization) {
    return deny('organization_not_found', `Organisation "${organization_id}" nicht gefunden.`);
  }

  // Suspension check - Block unless platform admin
  const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);
  if (organization.platform_status === 'suspended' && !isPlatformAdmin) {
    return deny('organization_suspended', `Organisation ist gesperrt: ${organization.suspended_reason || 'kein Grund angegeben'}.`, {
      user, organization, organization_suspended: true, suspended_reason: organization.suspended_reason, suspended_at: organization.suspended_at,
    });
  }

  // ── 4. Membership & Role check ─────────────────────────────────────────────
  const member = members[0] || null;
  if (!member) return deny('not_a_member', 'Nutzer ist kein Mitglied dieser Organisation.');
  if (member.status !== 'active') return deny('member_inactive', `Mitglied-Status ist "${member.status}", kein Zugriff.`);

  const role = member.role; // 'organization_admin' | 'sales_rep'

  // ── 5. Action permission check ─────────────────────────────────────────────
  if (action) {
    const allowedRoles = ACTION_ROLES[action];
    if (allowedRoles === undefined) return deny('unknown_action', `Unbekannte Aktion: "${action}".`);
    if (!allowedRoles.includes(role)) {
      return deny('insufficient_role', `Rolle "${role}" darf die Aktion "${action}" nicht ausführen.`);
    }
  }

  // ── 6. Billing / Subscription check ───────────────────────────────────────
  let subscription = null;
  let plan = null;
  let limits = null;

  const [subs, plans] = await Promise.all([
    base44.asServiceRole.entities.Subscription.filter({ organization_id }),
    organization.plan_id
      ? base44.asServiceRole.entities.Plan.filter({ id: organization.plan_id })
      : Promise.resolve([]),
  ]);

  subscription = subs[0] || null;
  plan = plans[0] || null;

  // Determine billing access level
  const billingStatus = subscription?.status || organization.billing_status || 'trialing';
  const billingAccess = BILLING_ACCESS[billingStatus] || 'blocked';

  if (action && billingAccess !== 'full') {
    const ctx = { user, organization, member, role, plan, subscription, limits };

    if (billingAccess === 'blocked') {
      // admin darf billing + data_export
      if (role === 'organization_admin' && BLOCKED_ADMIN_ALLOWED.has(action)) {
        // allowed – fall through
      } else if (role === 'sales_rep') {
        return deny('billing_blocked_sales_rep',
          `Abo-Status "${billingStatus}": Kein Zugriff für Sales Rep. Admin muss Zahlung aktualisieren.`, ctx);
      } else {
        return deny('billing_blocked',
          `Abo-Status "${billingStatus}": Zugriff gesperrt. Bitte Zahlung aktualisieren.`, ctx);
      }
    }

    if (billingAccess === 'degraded') {
      // Bestimmte Aktionen sind in degraded komplett gesperrt (für alle Rollen)
      if (DEGRADED_BLOCKED_ACTIONS.has(action)) {
        return deny('billing_degraded_action_blocked',
          `Abo-Status "${billingStatus}": Aktion "${action}" nicht verfügbar. Bitte Zahlung aktualisieren.`, ctx);
      }
      // sales_rep darf: view_leads, view_tasks, create_contact_log, update_assigned_lead, complete_task
      // alles andere ist für sales_rep gesperrt (nur admin)
      const DEGRADED_SALES_REP_ALLOWED = new Set([
        'view_leads', 'view_tasks', 'create_contact_log', 'update_assigned_lead', 'complete_task',
      ]);
      if (role === 'sales_rep' && !DEGRADED_SALES_REP_ALLOWED.has(action)) {
        return deny('billing_degraded_sales_rep',
          `Abo-Status "${billingStatus}": Sales Rep darf "${action}" nicht ausführen.`, ctx);
      }
    }
  }

  // ── 7. Plan limits check ───────────────────────────────────────────────────
  if (plan) {
    limits = {
      max_users:                    plan.max_users,
      max_leads_per_month:          plan.max_leads_per_month,
      max_ai_scorings_per_month:    plan.max_ai_scorings_per_month,
      max_emails_per_month:         plan.max_emails_per_month,
      max_lead_generations_per_month: plan.max_lead_generations_per_month,
    };

    if (check_limit && limits[check_limit] !== undefined) {
      const maxVal = limits[check_limit];
      if (maxVal !== -1 && current_usage >= maxVal) {
        return deny(
          'plan_limit_exceeded',
          `Plan-Limit für "${check_limit}" erreicht: ${current_usage}/${maxVal}.`,
          { user, organization, member, role, plan, subscription, limits }
        );
      }
    }
  }

  // ── 8. All checks passed ───────────────────────────────────────────────────
  // Backward-compatible fallback fields for old code
  const isAdmin = role === 'organization_admin';
  const isSalesRep = role === 'sales_rep';

  return allow({
    reason: 'ok',
    user,
    global_role: user.role,
    is_base44_admin: isBaseAdmin,
    is_platform_owner: ['admin', 'platform_owner'].includes(user.role),
    is_platform_admin: ['admin', 'platform_owner', 'platform_admin'].includes(user.role),
    is_support_agent: isSupportAgent(user.role),
    is_readonly_support: isReadOnlySupport(user.role),
    organization,
    organization_id,
    organization_role: role,
    is_organization_admin: role === 'organization_admin',
    is_sales_rep: role === 'sales_rep',
    // Backward-compatible legacy fields
    role,
    is_admin: isAdmin,
    isAdmin,
    isSalesRep,
    user_role: user.role,
    member,
    plan,
    subscription,
    limits,
    organization_platform_status: organization.platform_status || 'active',
    organization_suspended: false,
    suspended_reason: null,
    suspended_at: null,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isSupportAgent(role) {
  return ['admin', 'platform_owner', 'platform_admin', 'support_agent'].includes(role);
}

function isReadOnlySupport(role) {
  return ['admin', 'platform_owner', 'platform_admin', 'support_agent', 'readonly_support'].includes(role);
}

function allow({
  reason,
  user,
  global_role,
  is_base44_admin,
  is_platform_owner,
  is_platform_admin,
  is_support_agent,
  is_readonly_support,
  organization,
  organization_id,
  organization_role,
  is_organization_admin,
  is_sales_rep,
  member,
  role,
  plan,
  subscription,
  limits,
  organization_platform_status,
  organization_suspended,
  suspended_reason,
  suspended_at,
}) {
  return {
    allowed: true,
    reason,
    user,
    global_role,
    is_base44_admin,
    is_platform_owner,
    is_platform_admin,
    is_support_agent,
    is_readonly_support,
    organization,
    organization_id,
    organization_role,
    is_organization_admin,
    is_sales_rep,
    member,
    role,
    plan,
    subscription,
    limits,
    organization_platform_status: organization_platform_status || 'active',
    organization_suspended: organization_suspended || false,
    suspended_reason: suspended_reason || null,
    suspended_at: suspended_at || null,
  };
}

function deny(reason, message, context = {}) {
  return {
    allowed: false,
    reason,
    message,
    user: context.user || null,
    global_role: context.global_role || null,
    is_base44_admin: context.is_base44_admin || false,
    is_platform_owner: context.is_platform_owner || false,
    is_platform_admin: context.is_platform_admin || false,
    is_support_agent: context.is_support_agent || false,
    is_readonly_support: context.is_readonly_support || false,
    organization: context.organization || null,
    organization_id: context.organization_id || null,
    organization_role: context.organization_role || null,
    is_organization_admin: context.is_organization_admin || false,
    is_sales_rep: context.is_sales_rep || false,
    member: context.member || null,
    role: context.role || null,
    plan: context.plan || null,
    subscription: context.subscription || null,
    limits: context.limits || null,
  };
}

// ─── HTTP Handler (for direct testing via HTTP) ───────────────────────────────
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await checkAccess(req, {
      organization_id: body.organization_id,
      action: body.action,
      check_limit: body.check_limit,
      current_usage: body.current_usage || 0,
    });
    return Response.json(result);
  } catch (error) {
    console.error('[checkAccess] Unexpected error:', error.message);
    return Response.json({ allowed: false, reason: 'internal_error', message: error.message }, { status: 500 });
  }
});