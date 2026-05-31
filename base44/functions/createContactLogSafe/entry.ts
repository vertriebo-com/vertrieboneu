/**
 * createContactLogSafe
 * Sicheres Erstellen eines ContactLogs mit vollständiger Tenant-Isolation.
 * Verhindert Cross-Org Writes durch serverseitige company.organization_id Prüfung.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Auth: User muss eingeloggt sein
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { organization_id, company_id, typ, ergebnis, notiz, naechster_schritt } = body;

    if (!company_id || !typ || !ergebnis) {
      return Response.json({ error: 'company_id, typ und ergebnis sind Pflichtfelder' }, { status: 400 });
    }

    // 2. Company laden – serverseitig verifizieren (Cross-Org-Schutz)
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id });
    const company = companies?.[0];

    if (!company) {
      return Response.json({ error: 'Firma nicht gefunden' }, { status: 404 });
    }

    const companyOrgId = company.organization_id;

    // 3. organization_id aus Body darf nicht von der echten abweichen
    if (organization_id && organization_id !== companyOrgId) {
      return Response.json({ error: 'Forbidden: organization_id stimmt nicht überein' }, { status: 403 });
    }

    // 4. Berechtigungsprüfung: Owner, OrganizationMember oder PlatformAdmin
    const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);

    if (!isPlatformAdmin) {
      // Owner-Check
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: companyOrgId });
      const org = orgs?.[0];
      const isOwner = org?.owner_email === user.email;

      if (!isOwner) {
        // OrganizationMember-Check
        const members = await base44.asServiceRole.entities.OrganizationMember.filter({
          organization_id: companyOrgId,
          user_email: user.email,
          status: 'active',
        });
        const isMember = members?.length > 0;

        if (!isMember) {
          return Response.json({ error: 'Forbidden: Kein Zugriff auf diese Organisation' }, { status: 403 });
        }
      }
    }

    // 5. ContactLog serverseitig mit verifizierter organization_id erstellen
    const log = await base44.asServiceRole.entities.ContactLog.create({
      organization_id: companyOrgId,
      company_id,
      typ,
      ergebnis,
      notiz: notiz || '',
      naechster_schritt: naechster_schritt || 'Kunde meldet sich selbst',
      user_email: user.email,
    });

    return Response.json({ success: true, contact_log_id: log.id });
  } catch (error) {
    console.error('[createContactLogSafe] Error:', error?.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});