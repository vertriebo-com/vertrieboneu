import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { document_id, organization_id } = await req.json();
    if (!document_id || !organization_id) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }

    // Prüfen: User gehört zur Organisation und ist Admin
    const members = await base44.asServiceRole.entities.OrganizationMember.filter({
      organization_id,
      user_email: user.email,
      status: 'active',
    });

    const isAdmin =
      user.role === 'admin' ||
      members.some(m => ['admin', 'organization_admin'].includes(m.role));

    if (!isAdmin) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    // Check: Organisation gesperrt? (nicht für platform admins)
    if (user.role !== 'admin') {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      const org = orgs[0];
      if (org && org.platform_status === 'suspended') {
        console.warn(`[deleteDocument] Access denied: org suspended`);
        return Response.json({ error: 'Organisation ist gesperrt', organization_suspended: true }, { status: 403 });
      }
    }

    // Prüfen: Dokument gehört zur Organisation
    const docs = await base44.asServiceRole.entities.Document.filter({
      id: document_id,
      organization_id,
    });

    if (!docs.length) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    // Löschen mit Service Role
    await base44.asServiceRole.entities.Document.delete(document_id);

    console.log(`[deleteDocument] OK: user=${user.email} doc=${document_id} org=${organization_id}`);
    return Response.json({ success: true });

  } catch (error) {
    console.error('[deleteDocument] Fehler:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});