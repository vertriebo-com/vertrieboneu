/**
 * upsertContact
 * =============
 * Erstellt oder aktualisiert einen Contact.
 * - Org guard + Company-Org-Match
 * - Dedupe: gleiche email ODER gleicher normalisierter name+role
 * - is_primary=true setzt alle anderen Contacts der Company auf is_primary=false
 * - Provenance wird korrekt gesetzt
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const _PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);
function _allow(r) { return { allowed: true, status: 200, error: null, ...r }; }
function _deny(reason, message, ctx = {}) { return { allowed: false, status: reason === 'not_authenticated' ? 401 : 403, error: message, reason, user: ctx.user || null }; }
async function authorizeOrganizationAction(base44, { organizationId } = {}) {
  let user; try { user = await base44.auth.me(); } catch { return _deny('not_authenticated', 'Nicht eingeloggt.'); }
  if (!user) return _deny('not_authenticated', 'Nicht eingeloggt.');
  if (_PLATFORM_ADMIN_ROLES.has(user.role)) return _allow({ user, organization: null, access_role: 'platform_admin' });
  if (!organizationId) return _deny('missing_organization_id', 'Keine organization_id angegeben.');
  let orgs, members;
  try { [orgs, members] = await Promise.all([base44.asServiceRole.entities.Organization.filter({ id: organizationId }), base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: organizationId, user_email: user.email })]); }
  catch { return _deny('organization_not_found', 'Organisation nicht gefunden.'); }
  const organization = orgs[0] || null;
  if (!organization) return _deny('organization_not_found', 'Organisation nicht gefunden.');
  if (organization.platform_status === 'suspended') return _deny('organization_suspended', 'Organisation gesperrt.');
  if (organization.owner_email === user.email) return _allow({ user, organization, access_role: 'organization_admin' });
  const member = members[0] || null;
  if (!member || member.status !== 'active') return _deny('not_a_member', 'Kein aktives Mitglied dieser Organisation.', { user });
  return _allow({ user, organization, access_role: member.role });
}

function normalizeName(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { org_id, company_id, contact } = body;

    if (!org_id) return Response.json({ error: 'org_id ist Pflichtparameter' }, { status: 400 });
    if (!company_id) return Response.json({ error: 'company_id ist Pflichtparameter' }, { status: 400 });
    if (!contact) return Response.json({ error: 'contact ist Pflichtparameter' }, { status: 400 });

    const access = await authorizeOrganizationAction(base44, { organizationId: org_id });
    if (!access.allowed) return Response.json({ error: access.error, reason: access.reason }, { status: access.status });

    // Company Org-Match prüfen
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id: org_id });
    const company = companies[0] || null;
    if (!company) return Response.json({ error: 'Firma nicht gefunden oder falsche Organisation.' }, { status: 404 });

    // Sales Rep nur eigene Firma
    if (access.access_role === 'sales_rep' && company.assigned_to && company.assigned_to !== access.user.email) {
      return Response.json({ error: 'Sales Rep darf nur eigene Leads bearbeiten.' }, { status: 403 });
    }

    // Bestehende Contacts für Dedupe laden
    const existing = await base44.asServiceRole.entities.Contact.filter({ organization_id: org_id, company_id });

    // Dedupe-Logik
    let matchedContact = null;

    // 1. Gleiche email
    if (contact.email) {
      const normalEmail = contact.email.toLowerCase().trim();
      matchedContact = existing.find(c => c.email && c.email.toLowerCase().trim() === normalEmail) || null;
    }

    // 2. Gleicher normalisierter name + role (falls keine email-Übereinstimmung)
    if (!matchedContact && contact.name) {
      const normalName = normalizeName(contact.name);
      matchedContact = existing.find(c => {
        const sameName = normalizeName(c.name) === normalName;
        const sameRole = !contact.role || !c.role || c.role === contact.role;
        return sameName && sameRole;
      }) || null;
    }

    // Provenance setzen
    const now = new Date().toISOString();
    const isManual = !contact.source_type || contact.source_type === 'manual';
    const contactData = {
      ...contact,
      organization_id: org_id,
      company_id,
      source_type: contact.source_type || 'manual',
      confidence: contact.confidence || (isManual ? 'high' : 'unknown'),
      review_status: contact.review_status || (isManual ? 'confirmed' : 'unreviewed'),
    };

    let result;
    let action;

    if (matchedContact) {
      // Update: nur nicht-leere Felder überschreiben
      const updates = {};
      for (const [k, v] of Object.entries(contactData)) {
        if (v !== undefined && v !== null && v !== '') updates[k] = v;
      }
      result = await base44.asServiceRole.entities.Contact.update(matchedContact.id, updates);
      action = 'updated';
    } else {
      result = await base44.asServiceRole.entities.Contact.create(contactData);
      action = 'created';
    }

    // is_primary=true → alle anderen dieser Company auf false setzen
    if (contact.is_primary === true) {
      const othersToUpdate = existing.filter(c => c.id !== (matchedContact?.id) && c.is_primary === true);
      await Promise.all(othersToUpdate.map(c =>
        base44.asServiceRole.entities.Contact.update(c.id, { is_primary: false })
      ));
    }

    // ContactLog schreiben
    try {
      const contactName = contact.name || contact.first_name || 'Unbekannt';
      const isManualSource = !contact.source_type || contact.source_type === 'manual';
      await base44.asServiceRole.entities.ContactLog.create({
        organization_id: org_id,
        company_id,
        typ: 'Sonstiges',
        ergebnis: action === 'created' ? 'Kontakt erstellt' : 'Kontakt aktualisiert',
        notiz: action === 'created'
          ? `Ansprechpartner erstellt: ${contactName}${contact.role ? ` (${contact.role})` : ''}${contact.is_primary ? ' – Hauptkontakt' : ''}`
          : `Ansprechpartner aktualisiert: ${contactName}${contact.role ? ` (${contact.role})` : ''}`,
        user_email: access.user.email,
        is_manual: isManualSource,
      });
    } catch (logErr) {
      console.warn('[upsertContact] ContactLog failed:', logErr.message);
    }

    console.info(`[upsertContact] ${action} contact for company=${company_id} org=${org_id} by ${access.user.email}`);
    return Response.json({ contact: result, action, dedupe_matched: !!matchedContact });

  } catch (error) {
    console.error('[upsertContact] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});