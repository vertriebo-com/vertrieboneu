/**
 * listContacts
 * ============
 * Gibt alle Contacts einer Organization (optional gefiltert nach company_id) zurück.
 * AuthZ via kanonischem authorizeOrganizationAction.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const _PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);
const _ACTION_ROLES = { use_ai_scoring: ['organization_admin', 'sales_rep'] };
function _allow(r) { return { allowed: true, status: 200, error: null, ...r }; }
function _deny(reason, message, ctx = {}) { return { allowed: false, status: reason === 'not_authenticated' ? 401 : 403, error: message, reason, user: ctx.user || null, organization: ctx.organization || null }; }
async function authorizeOrganizationAction(base44, { organizationId, requireActiveOrg = true, allowPlatformAdmin = true } = {}) {
  let user; try { user = await base44.auth.me(); } catch { return _deny('not_authenticated', 'Nicht eingeloggt.'); }
  if (!user) return _deny('not_authenticated', 'Nicht eingeloggt.');
  if (allowPlatformAdmin && _PLATFORM_ADMIN_ROLES.has(user.role)) return _allow({ user, organization: null, member: null, access_role: 'platform_admin' });
  if (!organizationId) return _deny('missing_organization_id', 'Keine organization_id angegeben.');
  let orgs, members;
  try { [orgs, members] = await Promise.all([base44.asServiceRole.entities.Organization.filter({ id: organizationId }), base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: organizationId, user_email: user.email })]); }
  catch { return _deny('organization_not_found', 'Organisation nicht gefunden.'); }
  const organization = orgs[0] || null;
  if (!organization) return _deny('organization_not_found', 'Organisation nicht gefunden.');
  if (requireActiveOrg && organization.platform_status === 'suspended') return _deny('organization_suspended', `Organisation gesperrt.`, { user, organization });
  if (organization.owner_email === user.email) return _allow({ user, organization, member: members[0] || null, access_role: 'organization_admin' });
  const member = members[0] || null;
  if (!member || member.status !== 'active') return _deny('not_a_member', 'Kein aktives Mitglied dieser Organisation.', { user, organization });
  return _allow({ user, organization, member, access_role: member.role });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { org_id, company_id, page = 1, page_size = 50 } = body;

    if (!org_id) return Response.json({ error: 'org_id ist Pflichtparameter' }, { status: 400 });

    const access = await authorizeOrganizationAction(base44, { organizationId: org_id });
    if (!access.allowed) return Response.json({ error: access.error, reason: access.reason }, { status: access.status });

    const filter = { organization_id: org_id };
    if (company_id) filter.company_id = company_id;

    const all = await base44.asServiceRole.entities.Contact.filter(filter, '-created_date', 500);

    // Sales Rep sieht nur eigene company-Contacts (via assigned_to)
    let contacts = all;
    if (access.access_role === 'sales_rep' && company_id) {
      // Für sales_rep: company muss ihm assigned sein
      const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id: org_id });
      const company = companies[0];
      if (company && company.assigned_to && company.assigned_to !== access.user.email) {
        return Response.json({ error: 'Kein Zugriff auf diese Firma.' }, { status: 403 });
      }
    }

    const total = contacts.length;
    const skip = (page - 1) * page_size;
    const paginated = contacts.slice(skip, skip + page_size);

    return Response.json({
      contacts: paginated,
      total,
      page,
      page_size,
      has_more: skip + page_size < total,
      diagnostics: {
        org_id,
        company_id: company_id || null,
        access_role: access.access_role,
      },
    });
  } catch (error) {
    console.error('[listContacts] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});