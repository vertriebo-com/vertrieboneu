import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Setzt OrganizationSettings-Key "engagement_emails_unsubscribed" = "true"
// Wird via POST (SDK invoke) oder GET aufgerufen

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let org_id, email;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      org_id = url.searchParams.get('org_id');
      email  = url.searchParams.get('email');
    } else {
      const body = await req.json().catch(() => ({}));
      org_id = body.org_id;
      email  = body.email;
    }

    if (!org_id || !email) {
      return Response.json({ success: false, error: 'Missing org_id or email' }, { status: 400 });
    }

    // Prüfen ob bereits abgemeldet
    const existing = await base44.asServiceRole.entities.OrganizationSettings.filter({
      organization_id: org_id, key: 'engagement_emails_unsubscribed'
    });

    if (existing[0]?.value === 'true') {
      return Response.json({ success: true, already: true });
    }

    // Abmeldung speichern
    if (existing[0]) {
      await base44.asServiceRole.entities.OrganizationSettings.update(existing[0].id, { value: 'true' });
    } else {
      await base44.asServiceRole.entities.OrganizationSettings.create({
        organization_id: org_id,
        key: 'engagement_emails_unsubscribed',
        value: 'true',
        description: `Abgemeldet von automatischen Engagement-E-Mails (${email}) am ${new Date().toISOString()}`
      });
    }

    console.log(`[unsubscribeEngagementEmails] org=${org_id} email=${email} unsubscribed`);
    return Response.json({ success: true, already: false });

  } catch (error) {
    console.error('[unsubscribeEngagementEmails] Error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});