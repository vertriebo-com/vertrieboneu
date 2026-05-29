/**
 * adminCrmActions
 * ===============
 * Sichere Admin-only Actions für Waitlist, Investor-Anfragen und Support-Notizen.
 * Schreibt PlatformAuditLog bei allen Statusänderungen.
 *
 * Auth: admin / platform_owner / platform_admin only
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { action, target_id } = payload;

    if (!action || !target_id) {
      return Response.json({ error: 'action and target_id required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // ── WAITLIST LEAD ─────────────────────────────────────────────────────────

    if (action === 'updateWaitlistLeadStatus') {
      const { status } = payload;
      const allowed = ['new', 'contacted', 'demo_geplant', 'onboarded', 'abgelehnt'];
      if (!allowed.includes(status)) {
        return Response.json({ error: 'Invalid status for WaitlistLead' }, { status: 400 });
      }

      const records = await base44.asServiceRole.entities.WaitlistLead.filter({ id: target_id });
      if (!records[0]) return Response.json({ error: 'WaitlistLead not found' }, { status: 404 });
      const old = records[0];

      const patch = { status, handled_by: user.email };
      if (status === 'contacted' && !old.contacted_at) patch.contacted_at = now;
      await base44.asServiceRole.entities.WaitlistLead.update(target_id, patch);

      await base44.asServiceRole.entities.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'update_waitlist_status',
        target_type: 'waitlist_lead',
        target_id,
        organization_id: target_id,
        metadata: JSON.stringify({ old_status: old.status, new_status: status }),
        reason: `Status von ${old.status} → ${status}`,
      });

      console.info(`[adminCrmActions] waitlist status: ${target_id} ${old.status} → ${status}`);
      return Response.json({ success: true, action, new_status: status });
    }

    if (action === 'updateWaitlistLeadNote') {
      const { internal_note } = payload;
      const records = await base44.asServiceRole.entities.WaitlistLead.filter({ id: target_id });
      if (!records[0]) return Response.json({ error: 'WaitlistLead not found' }, { status: 404 });

      await base44.asServiceRole.entities.WaitlistLead.update(target_id, {
        internal_note: internal_note || '',
        handled_by: user.email,
      });

      return Response.json({ success: true, action });
    }

    // ── INVESTOR INQUIRY ──────────────────────────────────────────────────────

    if (action === 'updateInvestorInquiryStatus') {
      const { status } = payload;
      const allowed = ['new', 'geprueft', 'contacted', 'gespraech', 'abgelehnt'];
      if (!allowed.includes(status)) {
        return Response.json({ error: 'Invalid status for InvestorInquiry' }, { status: 400 });
      }

      const records = await base44.asServiceRole.entities.InvestorInquiry.filter({ id: target_id });
      if (!records[0]) return Response.json({ error: 'InvestorInquiry not found' }, { status: 404 });
      const old = records[0];

      const patch = { status, handled_by: user.email };
      if (status === 'contacted' && !old.contacted_at) patch.contacted_at = now;
      await base44.asServiceRole.entities.InvestorInquiry.update(target_id, patch);

      await base44.asServiceRole.entities.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'update_investor_status',
        target_type: 'investor_inquiry',
        target_id,
        organization_id: target_id,
        metadata: JSON.stringify({ old_status: old.status, new_status: status }),
        reason: `Status von ${old.status} → ${status}`,
      });

      console.info(`[adminCrmActions] investor status: ${target_id} ${old.status} → ${status}`);
      return Response.json({ success: true, action, new_status: status });
    }

    if (action === 'updateInvestorInquiryNote') {
      const { internal_note } = payload;
      const records = await base44.asServiceRole.entities.InvestorInquiry.filter({ id: target_id });
      if (!records[0]) return Response.json({ error: 'InvestorInquiry not found' }, { status: 404 });

      await base44.asServiceRole.entities.InvestorInquiry.update(target_id, {
        internal_note: internal_note || '',
        handled_by: user.email,
      });

      return Response.json({ success: true, action });
    }

    // ── SUPPORT NOTE ──────────────────────────────────────────────────────────

    if (action === 'updateSupportNoteStatus') {
      const { status } = payload;
      const allowed = ['open', 'reviewed', 'resolved'];
      if (!allowed.includes(status)) {
        return Response.json({ error: 'Invalid status for SupportNote' }, { status: 400 });
      }

      const records = await base44.asServiceRole.entities.SupportNote.filter({ id: target_id });
      if (!records[0]) return Response.json({ error: 'SupportNote not found' }, { status: 404 });
      const old = records[0];

      const patch = { status, reviewed_by: user.email };
      if (status === 'reviewed' && !old.reviewed_at) patch.reviewed_at = now;
      if (status === 'resolved' && !old.resolved_at) patch.resolved_at = now;
      await base44.asServiceRole.entities.SupportNote.update(target_id, patch);

      await base44.asServiceRole.entities.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'update_support_note_status',
        target_type: 'support_note',
        target_id,
        organization_id: old.organization_id || target_id,
        metadata: JSON.stringify({ old_status: old.status, new_status: status }),
        reason: `Support Note Status von ${old.status} → ${status}`,
      });

      return Response.json({ success: true, action, new_status: status });
    }

    if (action === 'updateSupportNotePriority') {
      const { priority } = payload;
      const allowed = ['low', 'medium', 'high', 'critical'];
      if (!allowed.includes(priority)) {
        return Response.json({ error: 'Invalid priority for SupportNote' }, { status: 400 });
      }

      const records = await base44.asServiceRole.entities.SupportNote.filter({ id: target_id });
      if (!records[0]) return Response.json({ error: 'SupportNote not found' }, { status: 404 });

      await base44.asServiceRole.entities.SupportNote.update(target_id, { priority });

      await base44.asServiceRole.entities.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'update_support_note_priority',
        target_type: 'support_note',
        target_id,
        organization_id: records[0].organization_id || target_id,
        metadata: JSON.stringify({ new_priority: priority }),
        reason: `Priorität gesetzt auf ${priority}`,
      });

      return Response.json({ success: true, action, priority });
    }

    if (action === 'updateSupportNoteInternalReply') {
      const { internal_reply_note } = payload;
      const records = await base44.asServiceRole.entities.SupportNote.filter({ id: target_id });
      if (!records[0]) return Response.json({ error: 'SupportNote not found' }, { status: 404 });

      await base44.asServiceRole.entities.SupportNote.update(target_id, {
        internal_reply_note: internal_reply_note || '',
        reviewed_by: user.email,
        reviewed_at: now,
      });

      return Response.json({ success: true, action });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    console.error('[adminCrmActions]', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});