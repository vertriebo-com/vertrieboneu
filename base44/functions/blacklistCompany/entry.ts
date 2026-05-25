/**
 * blacklistCompany
 * ================
 * AuthZ via kanonischer authorizeOrganizationAction (sharedAuthz v1.0.0)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { company_id, organization_id } = await req.json();

    if (!company_id || !organization_id) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }

    // ── AuthZ: nur organization_admin darf blacklisten ──────────────────────
    const access = await authorizeOrganizationAction(base44, { organizationId: organization_id, action: 'manage_blacklist' });
    if (!access.allowed) {
      console.warn(`[blacklistCompany] Access denied: ${access.reason} user=${access.user?.email}`);
      return Response.json({ error: access.error, reason: access.reason }, { status: access.status });
    }

    // Org für AuditLog (platform_admin hat access.organization=null → extra laden)
    let org = access.organization;
    if (!org) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      org = orgs[0] || null;
    }

    // ── Prüfen: Firma gehört zur Organisation ───────────────────────────────
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id });
    if (!companies.length) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    const company = companies[0];

    // ── Duplikatprüfung Blacklist ────────────────────────────────────────────
    const existing = await base44.asServiceRole.entities.Blacklist.filter({ organization_id });
    const normalizedName = (company.name || '').toLowerCase().trim();
    const normalizedPhone = (company.telefon || '').replace(/\D/g, '');
    const normalizedEmail = (company.email || '').toLowerCase().trim();

    const alreadyExists = existing.some(b => {
      const bName = (b.firmenname || '').toLowerCase().trim();
      const bPhone = (b.telefon || '').replace(/\D/g, '');
      const bEmail = (b.email || '').toLowerCase().trim();
      return (
        (normalizedName && bName === normalizedName) ||
        (normalizedPhone && bPhone === normalizedPhone && normalizedPhone !== '') ||
        (normalizedEmail && bEmail === normalizedEmail && normalizedEmail !== '')
      );
    });

    if (!alreadyExists) {
      await base44.asServiceRole.entities.Blacklist.create({
        organization_id,
        firmenname: company.name,
        telefon: company.telefon || '',
        email: company.email || '',
        grund: 'Manuell hinzugefügt',
      });
    }

    // ── Firma als blacklisted und Verloren markieren ─────────────────────────
    await base44.asServiceRole.entities.Company.update(company_id, {
      is_blacklisted: true,
      status: 'Verloren',
    });

    // ── AuditLog ─────────────────────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.PlatformAuditLog.create({
        actor_email: access.user.email,
        actor_role: access.access_role,
        action: 'company_blacklisted',
        target_type: 'organization',
        target_id: company_id,
        organization_id,
        metadata: JSON.stringify({ company_name: company.name, company_id, blacklisted_at: new Date().toISOString() }),
      });
    } catch (auditErr) {
      console.warn(`[blacklistCompany] AuditLog failed (non-blocking): ${auditErr.message}`);
    }

    console.log(`[blacklistCompany] OK: user=${access.user.email} role=${access.access_role} company=${company_id} org=${organization_id}`);
    return Response.json({ success: true });

  } catch (error) {
    console.error('[blacklistCompany] Fehler:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});