/**
 * onWaitlistLeadCreated
 * =====================
 * Entity Automation: Trigger bei WaitlistLead create
 * Erstellt einen internen PlatformAuditLog-Eintrag.
 * Kein automatischer E-Mail-Versand an Interessenten.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Entity Automation Payload
    const { event, data } = body;
    const lead = data || {};

    console.info(`[onWaitlistLeadCreated] New waitlist lead: ${lead.email} (${lead.name})`);

    // PlatformAuditLog: interner Eintrag
    await base44.asServiceRole.entities.PlatformAuditLog.create({
      actor_email: lead.email || 'unknown',
      actor_role: 'public',
      action: 'waitlist_lead_created',
      target_type: 'waitlist_lead',
      target_id: lead.id || event?.entity_id || 'unknown',
      organization_id: 'platform',
      metadata: JSON.stringify({
        name: lead.name,
        email: lead.email,
        company_name: lead.company_name,
        industry: lead.industry,
        phone: lead.phone,
        source_page: lead.source_page,
        utm_source: lead.utm_source,
        utm_campaign: lead.utm_campaign,
        created_date: lead.created_date,
      }),
      reason: `Neuer Interessent: ${lead.name || 'Unbekannt'} (${lead.email}) – ${lead.company_name || 'Keine Firma'} · ${lead.industry || 'Keine Branche'} · ${lead.source_page || 'Unbekannte Quelle'}`,
    });

    console.info(`[onWaitlistLeadCreated] AuditLog created for ${lead.email}`);
    return Response.json({ success: true, email: lead.email });

  } catch (err) {
    console.error('[onWaitlistLeadCreated] Error:', err?.message);
    return Response.json({ error: err?.message, success: false }, { status: 500 });
  }
});