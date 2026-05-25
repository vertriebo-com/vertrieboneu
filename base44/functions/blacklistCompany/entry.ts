import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { company_id, organization_id } = await req.json();
    if (!company_id || !organization_id) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }

    // Org laden für owner_email-Check und suspension-Check
    const [orgs, members] = await Promise.all([
      base44.asServiceRole.entities.Organization.filter({ id: organization_id }),
      base44.asServiceRole.entities.OrganizationMember.filter({ organization_id, user_email: user.email, status: 'active' }),
    ]);
    const org = orgs[0] || null;
    if (!org) return Response.json({ error: 'organisation_not_found' }, { status: 404 });

    // Suspension-Check (nicht für platform admins)
    if (user.role !== 'admin' && org.platform_status === 'suspended') {
      console.warn(`[blacklistCompany] Access denied: org suspended`);
      return Response.json({ error: 'Organisation ist gesperrt', organization_suspended: true }, { status: 403 });
    }

    const isAdmin =
      user.role === 'admin' ||
      org.owner_email === user.email ||
      members.some(m => ['admin', 'organization_admin'].includes(m.role));

    if (!isAdmin) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    // Prüfen: Firma gehört zur Organisation
    const companies = await base44.asServiceRole.entities.Company.filter({
      id: company_id,
      organization_id,
    });

    if (!companies.length) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const company = companies[0];

    // Duplikatprüfung: Blacklist-Eintrag nur erstellen, wenn nicht bereits vorhanden
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

    // Firma trotzdem als blacklisted und Verloren markieren
    await base44.asServiceRole.entities.Company.update(company_id, {
      is_blacklisted: true,
      status: 'Verloren',
    });

    // AuditLog schreiben
    try {
      await base44.asServiceRole.entities.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role === 'admin' ? 'platform_admin' : (org.owner_email === user.email ? 'org_owner' : 'org_admin'),
        action: 'company_blacklisted',
        target_type: 'organization',
        target_id: company_id,
        organization_id,
        metadata: JSON.stringify({ company_name: company.name, company_id, blacklisted_at: new Date().toISOString() }),
      });
    } catch (auditErr) {
      console.warn(`[blacklistCompany] AuditLog failed (non-blocking): ${auditErr.message}`);
    }

    console.log(`[blacklistCompany] OK: user=${user.email} company=${company_id} org=${organization_id}`);
    return Response.json({ success: true });

  } catch (error) {
    console.error('[blacklistCompany] Fehler:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});