/**
 * onInvestorInquiryCreated
 * ========================
 * Entity Automation: Trigger bei InvestorInquiry create
 * Erstellt einen internen PlatformAuditLog-Eintrag.
 * Kein automatischer E-Mail-Versand an Investoren.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { event, data } = body;
    const inquiry = data || {};

    console.info(`[onInvestorInquiryCreated] New investor inquiry: ${inquiry.email} (${inquiry.name})`);

    await base44.asServiceRole.entities.PlatformAuditLog.create({
      actor_email: inquiry.email || 'unknown',
      actor_role: 'public',
      action: 'investor_inquiry_created',
      target_type: 'investor_inquiry',
      target_id: inquiry.id || event?.entity_id || 'unknown',
      organization_id: 'platform',
      metadata: JSON.stringify({
        name: inquiry.name,
        email: inquiry.email,
        company_name: inquiry.company_name,
        role: inquiry.role,
        source_page: inquiry.source_page,
        message_preview: (inquiry.message || '').slice(0, 200),
        created_date: inquiry.created_date,
      }),
      reason: `Neue Investoren-Anfrage: ${inquiry.name || 'Unbekannt'} (${inquiry.email}) – ${inquiry.company_name || 'Kein Unternehmen'} · Rolle: ${inquiry.role || 'Unbekannt'}`,
    });

    console.info(`[onInvestorInquiryCreated] AuditLog created for ${inquiry.email}`);
    return Response.json({ success: true, email: inquiry.email });

  } catch (err) {
    console.error('[onInvestorInquiryCreated] Error:', err?.message);
    return Response.json({ error: err?.message, success: false }, { status: 500 });
  }
});