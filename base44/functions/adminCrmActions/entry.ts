/**
 * adminCrmActions
 * ===============
 * Sichere Admin-only Actions für Waitlist, Investor-Anfragen und Support-Notizen.
 * Schreibt PlatformAuditLog bei allen Statusänderungen.
 *
 * Auth: admin / platform_owner / platform_admin only
 *
 * Fehlercodes:
 *   400 – fehlende/ungültige Parameter oder unbekannte action
 *   403 – kein Admin
 *   404 – Datensatz nicht gefunden
 *   500 – echter unerwarteter Fehler
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

/** Lädt einen einzelnen Datensatz sicher und wirft 404 wenn nicht vorhanden. */
async function findOrThrow(entity, id, label) {
  if (!id || typeof id !== 'string') {
    throw { status: 400, message: `target_id fehlt oder ungültig` };
  }
  let records;
  try {
    records = await entity.filter({ id });
  } catch (_) {
    // SDK wirft bei ungültiger ID eine Exception → 404
    throw { status: 404, message: `${label} nicht gefunden (ungültige ID)` };
  }
  if (!records || records.length === 0) {
    throw { status: 404, message: `${label} nicht gefunden` };
  }
  return records[0];
}

Deno.serve(async (req) => {
  let action = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // 403 – kein Admin
    if (!user || !ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    action = payload.action;
    const { target_id } = payload;

    // 400 – fehlende Pflichtfelder
    if (!action) {
      return Response.json({ error: 'action ist erforderlich' }, { status: 400 });
    }
    if (!target_id) {
      return Response.json({ error: 'target_id ist erforderlich' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const db = base44.asServiceRole.entities;

    // ── WAITLIST LEAD ─────────────────────────────────────────────────────────

    if (action === 'updateWaitlistLeadStatus') {
      const { status } = payload;
      const allowed = ['new', 'contacted', 'demo_geplant', 'onboarded', 'abgelehnt'];
      if (!allowed.includes(status)) {
        return Response.json({ error: `Ungültiger Status. Erlaubt: ${allowed.join(', ')}` }, { status: 400 });
      }

      const old = await findOrThrow(db.WaitlistLead, target_id, 'WaitlistLead');

      const patch = { status, handled_by: user.email };
      if (status === 'contacted' && !old.contacted_at) patch.contacted_at = now;
      await db.WaitlistLead.update(target_id, patch);

      await db.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'update_waitlist_status',
        target_type: 'waitlist_lead',
        target_id,
        organization_id: target_id,
        metadata: JSON.stringify({ old_status: old.status, new_status: status }),
        reason: `Status ${old.status} → ${status}`,
      });

      console.info(`[adminCrmActions] waitlist status: ${target_id} ${old.status} → ${status}`);
      return Response.json({ success: true, action, new_status: status });
    }

    if (action === 'updateWaitlistLeadNote') {
      const { internal_note } = payload;
      await findOrThrow(db.WaitlistLead, target_id, 'WaitlistLead');
      await db.WaitlistLead.update(target_id, { internal_note: internal_note || '', handled_by: user.email });
      return Response.json({ success: true, action });
    }

    // ── INVESTOR INQUIRY ──────────────────────────────────────────────────────

    if (action === 'updateInvestorInquiryStatus') {
      const { status } = payload;
      const allowed = ['new', 'geprueft', 'contacted', 'gespraech', 'abgelehnt'];
      if (!allowed.includes(status)) {
        return Response.json({ error: `Ungültiger Status. Erlaubt: ${allowed.join(', ')}` }, { status: 400 });
      }

      const old = await findOrThrow(db.InvestorInquiry, target_id, 'InvestorInquiry');

      const patch = { status, handled_by: user.email };
      if (status === 'contacted' && !old.contacted_at) patch.contacted_at = now;
      await db.InvestorInquiry.update(target_id, patch);

      await db.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'update_investor_status',
        target_type: 'investor_inquiry',
        target_id,
        organization_id: target_id,
        metadata: JSON.stringify({ old_status: old.status, new_status: status }),
        reason: `Status ${old.status} → ${status}`,
      });

      console.info(`[adminCrmActions] investor status: ${target_id} ${old.status} → ${status}`);
      return Response.json({ success: true, action, new_status: status });
    }

    if (action === 'updateInvestorInquiryNote') {
      const { internal_note } = payload;
      await findOrThrow(db.InvestorInquiry, target_id, 'InvestorInquiry');
      await db.InvestorInquiry.update(target_id, { internal_note: internal_note || '', handled_by: user.email });
      return Response.json({ success: true, action });
    }

    // ── SUPPORT NOTE ──────────────────────────────────────────────────────────

    if (action === 'updateSupportNoteStatus') {
      const { status } = payload;
      const allowed = ['open', 'reviewed', 'resolved'];
      if (!allowed.includes(status)) {
        return Response.json({ error: `Ungültiger Status. Erlaubt: ${allowed.join(', ')}` }, { status: 400 });
      }

      const old = await findOrThrow(db.SupportNote, target_id, 'SupportNote');

      const patch = { status, reviewed_by: user.email };
      if (status === 'reviewed' && !old.reviewed_at) patch.reviewed_at = now;
      if (status === 'resolved' && !old.resolved_at) patch.resolved_at = now;
      await db.SupportNote.update(target_id, patch);

      await db.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'update_support_note_status',
        target_type: 'support_note',
        target_id,
        organization_id: old.organization_id || target_id,
        metadata: JSON.stringify({ old_status: old.status, new_status: status }),
        reason: `SupportNote Status ${old.status} → ${status}`,
      });

      return Response.json({ success: true, action, new_status: status });
    }

    if (action === 'updateSupportNotePriority') {
      const { priority } = payload;
      const allowed = ['low', 'medium', 'high', 'critical'];
      if (!allowed.includes(priority)) {
        return Response.json({ error: `Ungültige Priorität. Erlaubt: ${allowed.join(', ')}` }, { status: 400 });
      }

      const record = await findOrThrow(db.SupportNote, target_id, 'SupportNote');
      await db.SupportNote.update(target_id, { priority });

      await db.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'update_support_note_priority',
        target_type: 'support_note',
        target_id,
        organization_id: record.organization_id || target_id,
        metadata: JSON.stringify({ new_priority: priority }),
        reason: `Priorität gesetzt auf ${priority}`,
      });

      return Response.json({ success: true, action, priority });
    }

    if (action === 'updateSupportNoteInternalReply') {
      const { internal_reply_note } = payload;
      const record = await findOrThrow(db.SupportNote, target_id, 'SupportNote');
      await db.SupportNote.update(target_id, {
        internal_reply_note: internal_reply_note || '',
        reviewed_by: user.email,
        reviewed_at: now,
      });
      return Response.json({ success: true, action });
    }

    // 400 – unbekannte action
    return Response.json({ error: `Unbekannte action: ${action}` }, { status: 400 });

  } catch (err) {
    // Strukturierte Fehler aus findOrThrow (400/404)
    if (err && typeof err.status === 'number' && err.message) {
      console.warn(`[adminCrmActions] ${err.status} – ${err.message}`);
      return Response.json({ error: err.message }, { status: err.status });
    }
    // Echter unerwarteter Fehler → 500
    console.error(`[adminCrmActions] Unerwarteter Fehler (action=${action}):`, err?.message);
    return Response.json({ error: err?.message || 'Interner Fehler' }, { status: 500 });
  }
});