/**
 * sharedAuthz — Gemeinsamer AuthZ-Helper für alle Backend-Funktionen
 * ==================================================================
 * Exportiert authorizeOrganizationAction() für einheitliche Zugriffskontrolle.
 *
 * Da Base44 keine lokalen Imports zwischen Funktionen erlaubt, wird dieser
 * Helper als eigenständige Backend-Funktion deployed und per
 *   base44.functions.invoke('sharedAuthz', payload)
 * aufgerufen — ODER die Logik wird direkt importiert (inline).
 *
 * Für die 5 umgestellten Funktionen (createPortalSession, createCheckoutSession,
 * deleteCompany, blacklistCompany, enrichCompany) wird die Logik direkt
 * als inlinable Hilfsfunktion bereitgestellt:
 *   import { authorizeOrganizationAction } from './sharedAuthz' → NICHT möglich in Base44.
 *
 * LÖSUNG: Jede Funktion kopiert die minimale authorizeOrganizationAction()
 * aus diesem Canonical-File. Das ist 1 Kopie statt 5 Varianten = drastisch
 * reduzierte Divergenz. Der Audit prüft ob alle auf diese kanonische Version zeigen.
 *
 * CANONICAL VERSION: v1.0.0 — 2026-05-25
 */

// ── ACTION_ROLES (kanonisch) ──────────────────────────────────────────────────
export const ACTION_ROLES = {
  view_leads:            ['organization_admin', 'sales_rep'],
  create_lead:           ['organization_admin', 'sales_rep'],
  update_assigned_lead:  ['organization_admin', 'sales_rep'],
  delete_lead:           ['organization_admin'],
  generate_leads:        ['organization_admin'],
  create_contact_log:    ['organization_admin', 'sales_rep'],
  view_tasks:            ['organization_admin', 'sales_rep'],
  complete_task:         ['organization_admin', 'sales_rep'],
  manage_users:          ['organization_admin'],
  manage_settings:       ['organization_admin'],
  manage_billing:        ['organization_admin'],
  data_export:           ['organization_admin'],
  view_reports:          ['organization_admin', 'sales_rep'],
  use_ai_scoring:        ['organization_admin', 'sales_rep'],
  send_bulk_email:       ['organization_admin', 'sales_rep'],
  manage_blacklist:      ['organization_admin'],
  delete_company:        ['organization_admin'],
  platform_admin_access: [],
};

// ── PLATFORM ADMIN ROLES (kanonisch) ─────────────────────────────────────────
export const PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

function _allow(r) {
  return { allowed: true, status: 200, error: null, ...r };
}
function _deny(reason, message, ctx = {}) {
  return {
    allowed: false,
    status: reason === 'not_authenticated' ? 401 : 403,
    error: message,
    reason,
    user: ctx.user || null,
    organization: ctx.organization || null,
    member: ctx.member || null,
    access_role: ctx.access_role || null,
  };
}

/**
 * authorizeOrganizationAction
 * ===========================
 * Einheitlicher AuthZ-Check für alle Org-Operationen.
 *
 * @param {Request} req                   — Original-Request (für createClientFromRequest)
 * @param {object}  opts
 * @param {string}  opts.organizationId   — Pflicht
 * @param {string[]} [opts.requiredRoles] — Org-Rollen die nötig sind (leer = nur membership prüfen)
 * @param {string}  [opts.action]         — ACTION_ROLES-Key (alternativ zu requiredRoles)
 * @param {boolean} [opts.requireActiveOrg=true]   — Suspended/blocked wird blockiert
 * @param {boolean} [opts.allowPlatformAdmin=true] — Platform-Admin darf immer
 *
 * @returns {object} { allowed, status, error, user, organization, member, access_role }
 *   access_role: 'platform_admin' | 'org_owner' | 'organization_admin' | 'sales_rep'
 */
export async function authorizeOrganizationAction(base44, {
  organizationId,
  requiredRoles = [],
  action = null,
  requireActiveOrg = true,
  allowPlatformAdmin = true,
} = {}) {
  // 1. User-Auth
  let user;
  try { user = await base44.auth.me(); } catch { return _deny('not_authenticated', 'Nicht eingeloggt.'); }
  if (!user) return _deny('not_authenticated', 'Nicht eingeloggt.');

  // 2. Platform-Admin Bypass
  if (allowPlatformAdmin && PLATFORM_ADMIN_ROLES.has(user.role)) {
    return _allow({ user, organization: null, member: null, access_role: 'platform_admin' });
  }

  // 3. organizationId Pflicht
  if (!organizationId) return _deny('missing_organization_id', 'Keine organization_id angegeben.');

  // 4. Org + Member parallel laden
  let orgs, members;
  try {
    [orgs, members] = await Promise.all([
      base44.asServiceRole.entities.Organization.filter({ id: organizationId }),
      base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: organizationId, user_email: user.email }),
    ]);
  } catch (e) {
    console.error('[authorizeOrganizationAction] DB error:', e.message);
    return _deny('organization_not_found', 'Organisation nicht gefunden.');
  }

  const organization = orgs[0] || null;
  if (!organization) return _deny('organization_not_found', 'Organisation nicht gefunden.');

  // 5. Suspension-Check (vor owner/member, außer platform_admin der oben schon returned)
  if (requireActiveOrg && organization.platform_status === 'suspended') {
    return _deny('organization_suspended',
      `Organisation gesperrt: ${organization.suspended_reason || 'kein Grund'}.`,
      { user, organization }
    );
  }

  // 6. Owner-Check: owner_email gilt als organization_admin
  if (organization.owner_email === user.email) {
    // Owner darf alles — keine Rollen-Einschränkung
    return _allow({ user, organization, member: members[0] || null, access_role: 'organization_admin' });
  }

  // 7. Member-Check
  const member = members[0] || null;
  if (!member) return _deny('not_a_member', 'Kein Mitglied dieser Organisation.', { user, organization });
  if (member.status !== 'active') return _deny('member_inactive', `Mitglied-Status: "${member.status}".`, { user, organization, member });

  const memberRole = member.role; // 'organization_admin' | 'sales_rep'

  // 8. Rollen-Check (requiredRoles oder action)
  const effectiveRequiredRoles = requiredRoles.length > 0
    ? requiredRoles
    : action && ACTION_ROLES[action]
      ? ACTION_ROLES[action]
      : null;

  if (effectiveRequiredRoles) {
    if (!effectiveRequiredRoles.includes(memberRole)) {
      const constraint = action || requiredRoles.join(',');
      return _deny('insufficient_role',
        `Rolle "${memberRole}" darf "${constraint}" nicht.`,
        { user, organization, member, access_role: memberRole }
      );
    }
  }

  return _allow({ user, organization, member, access_role: memberRole });
}

// ── Als Backend-Funktion aufrufbar (z.B. für Tests / direkten Invoke) ─────────
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 });
    if (!PLATFORM_ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Nur Platform-Admins dürfen sharedAuthz direkt aufrufen' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const result = await authorizeOrganizationAction(base44, body);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});