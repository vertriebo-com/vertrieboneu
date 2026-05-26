/**
 * buildPrimaryContactFromCompany
 * ==============================
 * Liest Company.ansprechpartner/email/telefon und erstellt einen Primary Contact,
 * falls noch keiner existiert (Dedupe-Check).
 * Kein blindes Doppelt-Anlegen.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const _PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);
function _allow(r) { return { allowed: true, status: 200, error: null, ...r }; }
function _deny(reason, message, ctx = {}) { return { allowed: false, status: reason === 'not_authenticated' ? 401 : 403, error: message, reason }; }
async function authorizeOrganizationAction(base44, { organizationId } = {}) {
  let user; try { user = await base44.auth.me(); } catch { return _deny('not_authenticated', 'Nicht eingeloggt.'); }
  if (!user) return _deny('not_authenticated', 'Nicht eingeloggt.');
  if (_PLATFORM_ADMIN_ROLES.has(user.role)) return _allow({ user, access_role: 'platform_admin' });
  if (!organizationId) return _deny('missing_organization_id', 'Keine organization_id angegeben.');
  const [orgs, members] = await Promise.all([
    base44.asServiceRole.entities.Organization.filter({ id: organizationId }),
    base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: organizationId, user_email: user.email }),
  ]);
  const organization = orgs[0] || null;
  if (!organization) return _deny('organization_not_found', 'Organisation nicht gefunden.');
  if (organization.platform_status === 'suspended') return _deny('organization_suspended', 'Organisation gesperrt.');
  if (organization.owner_email === user.email) return _allow({ user, organization, access_role: 'organization_admin' });
  const member = members[0] || null;
  if (!member || member.status !== 'active') return _deny('not_a_member', 'Kein aktives Mitglied.');
  return _allow({ user, organization, access_role: member.role });
}

function normalizeName(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { org_id, company_id } = body;

    if (!org_id) return Response.json({ error: 'org_id ist Pflichtparameter' }, { status: 400 });
    if (!company_id) return Response.json({ error: 'company_id ist Pflichtparameter' }, { status: 400 });

    const access = await authorizeOrganizationAction(base44, { organizationId: org_id });
    if (!access.allowed) return Response.json({ error: access.error, reason: access.reason }, { status: access.status });

    // Company laden
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id: org_id });
    const company = companies[0] || null;
    if (!company) return Response.json({ error: 'Firma nicht gefunden.' }, { status: 404 });

    // Ansprechpartner-Daten aus Company
    const rawName = company.ansprechpartner || null;
    const rawEmail = company.email || null;
    const rawPhone = company.telefon || null;

    if (!rawName && !rawEmail) {
      return Response.json({
        action: 'skipped',
        reason: 'Company hat keinen ansprechpartner und keine email. Kein Contact erstellt.',
        contact: null,
      });
    }

    // Bestehende Contacts prüfen (Dedupe)
    const existing = await base44.asServiceRole.entities.Contact.filter({ organization_id: org_id, company_id });

    // Prüfen ob bereits Primary existiert
    const existingPrimary = existing.find(c => c.is_primary === true) || null;
    if (existingPrimary) {
      return Response.json({
        action: 'skipped',
        reason: 'Primary Contact existiert bereits. Kein Duplikat erstellt.',
        contact: existingPrimary,
      });
    }

    // Dedupe: gleiche email
    if (rawEmail) {
      const normalEmail = rawEmail.toLowerCase().trim();
      const emailMatch = existing.find(c => c.email && c.email.toLowerCase().trim() === normalEmail);
      if (emailMatch) {
        // Vorhandenen auf Primary setzen
        await base44.asServiceRole.entities.Contact.update(emailMatch.id, { is_primary: true });
        return Response.json({
          action: 'promoted_to_primary',
          reason: 'Bestehender Contact mit gleicher E-Mail als Primary gesetzt.',
          contact: { ...emailMatch, is_primary: true },
        });
      }
    }

    // Dedupe: gleicher name
    if (rawName) {
      const normalName = normalizeName(rawName);
      const nameMatch = existing.find(c => normalizeName(c.name) === normalName);
      if (nameMatch) {
        await base44.asServiceRole.entities.Contact.update(nameMatch.id, { is_primary: true });
        return Response.json({
          action: 'promoted_to_primary',
          reason: 'Bestehender Contact mit gleichem Namen als Primary gesetzt.',
          contact: { ...nameMatch, is_primary: true },
        });
      }
    }

    // Provenance aus Company.provenance_json auslesen
    let sourceType = 'manual';
    let confidence = 'high';
    let reviewStatus = 'confirmed';
    try {
      const prov = JSON.parse(company.provenance_json || '{}');
      const cpProv = prov.fields?.contact_person;
      if (cpProv?.source_type) {
        sourceType = cpProv.source_type === 'enrichment' ? 'enrichment' : cpProv.source_type;
        confidence = cpProv.confidence || 'medium';
        reviewStatus = cpProv.review_status || 'unreviewed';
      }
    } catch {}

    // Neuen Primary Contact anlegen
    const contactData = {
      organization_id: org_id,
      company_id,
      name: rawName || rawEmail,
      email: rawEmail || undefined,
      phone: rawPhone || undefined,
      is_primary: true,
      source_type: sourceType,
      source_function: 'buildPrimaryContactFromCompany',
      confidence,
      review_status: reviewStatus,
    };

    const created = await base44.asServiceRole.entities.Contact.create(contactData);

    console.info(`[buildPrimaryContactFromCompany] Created primary contact for company=${company_id} org=${org_id}`);
    return Response.json({ action: 'created', contact: created });

  } catch (error) {
    console.error('[buildPrimaryContactFromCompany] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});