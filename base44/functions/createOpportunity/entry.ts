/**
 * createOpportunity
 * =================
 * Erstellt eine neue Opportunity mit AuthZ, Company-Match, Contact-Match und ContactLog.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

async function authorizeOrgAction(base44, org_id, user) {
  if (PLATFORM_ADMIN_ROLES.has(user.role)) return { allowed: true, org: null };
  const [orgs, members] = await Promise.all([
    base44.asServiceRole.entities.Organization.filter({ id: org_id }),
    base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: org_id, user_email: user.email }),
  ]);
  const org = orgs[0];
  if (!org) return { allowed: false, error: 'Organisation nicht gefunden.', status: 404 };
  if (org.platform_status === 'suspended') return { allowed: false, error: 'Organisation gesperrt.', status: 403 };
  if (org.owner_email === user.email) return { allowed: true, org, role: 'organization_admin' };
  const member = members[0];
  if (!member || member.status !== 'active') return { allowed: false, error: 'Kein aktives Mitglied.', status: 403 };
  return { allowed: true, org, role: member.role };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      org_id,
      company_id,
      primary_contact_id,
      title,
      stage = 'new',
      value,
      probability,
      expected_close_date,
      source_type = 'manual',
      source_research_run_id,
      notes,
      assigned_to,
    } = body;

    if (!org_id) return Response.json({ error: 'org_id fehlt.' }, { status: 400 });
    if (!company_id) return Response.json({ error: 'company_id fehlt.' }, { status: 400 });
    if (!title?.trim()) return Response.json({ error: 'Titel fehlt.' }, { status: 400 });

    // AuthZ
    const authz = await authorizeOrgAction(base44, org_id, user);
    if (!authz.allowed) return Response.json({ error: authz.error }, { status: authz.status || 403 });

    // Company org-match prüfen (mit ID-Format-Guard)
    let company;
    try {
      const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id: org_id });
      if (!companies[0]) return Response.json({ error: 'Company nicht gefunden oder gehört nicht zu dieser Organisation.' }, { status: 404 });
      company = companies[0];
    } catch {
      return Response.json({ error: 'Company nicht gefunden oder gehört nicht zu dieser Organisation.' }, { status: 404 });
    }

    // Contact org/company-match prüfen (optional, mit ID-Format-Guard)
    if (primary_contact_id) {
      try {
        const contacts = await base44.asServiceRole.entities.Contact.filter({ id: primary_contact_id, organization_id: org_id, company_id });
        if (!contacts[0]) return Response.json({ error: 'Kontakt nicht gefunden oder gehört nicht zu dieser Company/Organisation.' }, { status: 404 });
      } catch {
        return Response.json({ error: 'Kontakt nicht gefunden oder gehört nicht zu dieser Company/Organisation.' }, { status: 404 });
      }
    }

    // Status aus stage ableiten
    const status = ['won'].includes(stage) ? 'won' : ['lost'].includes(stage) ? 'lost' : 'open';

    // Opportunity erstellen
    const now = new Date().toISOString();
    const opportunity = await base44.asServiceRole.entities.Opportunity.create({
      organization_id: org_id,
      company_id,
      primary_contact_id: primary_contact_id || undefined,
      title: title.trim(),
      stage,
      status,
      value: value !== undefined ? Number(value) : undefined,
      probability: probability !== undefined ? Math.min(100, Math.max(0, Number(probability))) : undefined,
      expected_close_date: expected_close_date || undefined,
      source_type,
      source_research_run_id: source_research_run_id || undefined,
      notes: notes?.trim() || undefined,
      assigned_to: assigned_to || user.email,
      created_by: user.email,
      stage_changed_at: now,
      stage_changed_by: user.email,
    });

    // Company.lifecycle_stage auf qualified setzen (nur wenn aktuell lead)
    const currentStage = company.lifecycle_stage || 'lead';
    if (currentStage === 'lead') {
      await base44.asServiceRole.entities.Company.update(company_id, {
        lifecycle_stage: 'qualified',
        lifecycle_stage_changed_at: now,
        lifecycle_stage_changed_by: user.email,
      });
    }

    // ContactLog schreiben
    await base44.asServiceRole.entities.ContactLog.create({
      organization_id: org_id,
      company_id,
      typ: 'Sonstiges',
      ergebnis: 'Abgeschlossen',
      notiz: `Opportunity erstellt: "${title.trim()}" (Stage: ${stage}${value ? `, Wert: ${value} EUR` : ''})`,
      naechster_schritt: 'Opportunity weiterverfolgen',
      user_email: user.email,
    });

    console.log(`[createOpportunity] Created ${opportunity.id} for company ${company_id} org ${org_id} by ${user.email}`);

    return Response.json({ success: true, opportunity, lifecycle_stage_updated: currentStage === 'lead' ? 'qualified' : null });
  } catch (e) {
    console.error('[createOpportunity] Error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});