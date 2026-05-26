/**
 * updateContactFieldReviewStatus
 * ================================
 * Setzt den Review-Status eines Kontaktfelds in provenance_json.
 * Erlaubt Nutzer unreviewed KI-Daten als confirmed/rejected zu markieren
 * oder mit einem korrigierten Wert zu überschreiben.
 *
 * Input: { org_id, company_id, field_name, review_status, corrected_value?, note? }
 * field_name: 'phone' | 'email' | 'website' | 'contact_person' | 'address'
 * review_status: 'confirmed' | 'rejected' | 'unreviewed'
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// Mapping von provenance field_name → Company-Feldname
const FIELD_TO_COMPANY_PROP = {
  phone:          'telefon',
  email:          'email',
  website:        'website',
  contact_person: 'ansprechpartner',
  address:        'adresse',
};

const VALID_FIELD_NAMES = new Set(Object.keys(FIELD_TO_COMPANY_PROP));
const VALID_REVIEW_STATUSES = new Set(['confirmed', 'rejected', 'unreviewed']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);

    const body = await req.json();
    const { org_id, company_id, field_name, review_status, corrected_value, note } = body;

    // ── 2. Input-Validierung ─────────────────────────────────────────────────
    if (!org_id)      return Response.json({ error: 'org_id ist Pflichtparameter.' }, { status: 400 });
    if (!company_id)  return Response.json({ error: 'company_id ist Pflichtparameter.' }, { status: 400 });
    if (!field_name)  return Response.json({ error: 'field_name ist Pflichtparameter.' }, { status: 400 });
    if (!review_status) return Response.json({ error: 'review_status ist Pflichtparameter.' }, { status: 400 });

    if (!VALID_FIELD_NAMES.has(field_name)) {
      return Response.json({ error: `Ungültiger field_name. Erlaubt: ${[...VALID_FIELD_NAMES].join(', ')}` }, { status: 400 });
    }
    if (!VALID_REVIEW_STATUSES.has(review_status)) {
      return Response.json({ error: `Ungültiger review_status. Erlaubt: confirmed, rejected, unreviewed` }, { status: 400 });
    }

    // ── 3. Org-Zugriffsprüfung ───────────────────────────────────────────────
    if (!isPlatformAdmin) {
      const [orgs, members] = await Promise.all([
        base44.asServiceRole.entities.Organization.filter({ id: org_id }),
        base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: org_id, user_email: user.email }),
      ]);
      const org = orgs[0];
      if (!org) return Response.json({ error: 'Organisation nicht gefunden.' }, { status: 404 });
      if (org.platform_status === 'suspended') return Response.json({ error: 'Organisation gesperrt.' }, { status: 403 });

      const isOwner = org.owner_email === user.email;
      const member = members[0];
      const isOrgAdmin = member?.role === 'organization_admin' && member?.status === 'active';

      if (!isOwner && !isOrgAdmin) {
        return Response.json({ error: 'Nur Organization Admin darf Review-Status ändern.' }, { status: 403 });
      }
    }

    // ── 4. Company laden ─────────────────────────────────────────────────────
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id: org_id });
    const company = companies[0];
    if (!company) return Response.json({ error: 'Firma nicht gefunden oder falsche Organisation.' }, { status: 404 });

    // ── 5. Provenance updaten ────────────────────────────────────────────────
    const existingProv = (() => {
      try { return JSON.parse(company.provenance_json || '{}'); } catch { return {}; }
    })();
    const fields = existingProv.fields || {};
    const now = new Date().toISOString();

    const currentField = fields[field_name] || {};
    const oldStatus = currentField.review_status || null;

    fields[field_name] = {
      ...currentField,
      review_status,
      reviewed_by: user.email,
      reviewed_at: now,
    };

    const companyUpdates = {
      provenance_json: JSON.stringify({ fields }),
    };

    // ── 6. Korrektur: Wenn corrected_value gesetzt → Feld überschreiben ──────
    const companyProp = FIELD_TO_COMPANY_PROP[field_name];
    if (corrected_value !== undefined && corrected_value !== null && corrected_value.trim() !== '') {
      // Alten Wert als previous_value sichern
      fields[field_name] = {
        ...fields[field_name],
        source_type: 'manual',
        source_function: 'updateContactFieldReviewStatus',
        confidence: 'high',
        review_status: 'confirmed',
        previous_source: currentField.source_type || null,
        previous_value: company[companyProp] || null,
        updated_at: now,
        updated_by: user.email,
      };
      companyUpdates.provenance_json = JSON.stringify({ fields });
      companyUpdates[companyProp] = corrected_value.trim();
    }

    await base44.asServiceRole.entities.Company.update(company_id, companyUpdates);

    // ── 7. AuditLog ──────────────────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: `contact_field_review_${review_status}`,
        target_type: 'organization',
        target_id: company_id,
        organization_id: org_id,
        metadata: JSON.stringify({
          field_name,
          old_status: oldStatus,
          new_status: review_status,
          has_corrected_value: !!corrected_value,
          note: note || null,
          company_name: company.name,
        }),
        reason: note || `${field_name} → ${review_status}`,
      });
    } catch (auditErr) {
      console.warn('[updateContactFieldReviewStatus] AuditLog failed:', auditErr.message);
    }

    console.info(`[updateContactFieldReviewStatus] org=${org_id} user=${user.email} company=${company.name} field=${field_name} ${oldStatus}→${review_status} corrected=${!!corrected_value}`);

    return Response.json({
      success: true,
      field_name,
      review_status,
      reviewed_by: user.email,
      reviewed_at: now,
      corrected_value_applied: !!(corrected_value?.trim()),
    });

  } catch (error) {
    console.error('[updateContactFieldReviewStatus] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});