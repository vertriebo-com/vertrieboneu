import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ─── Reparatur-Funktion für kaputte trial_stage ─────────────────────────────
// Nur für Platform-Admins: Setzt trial_stage + billing_status auf bezahlter Status
// Use Case: Webhook ist fehlgeschlagen, Account sitzt auf free_preview obwohl bezahlt
// 
// Beispiel-Payload:
// {
//   "organization_id": "org_123",
//   "trial_stage": "paid",
//   "billing_status": "active",
//   "reason": "Webhook repair: checkout.session.completed fehlgeschlagen"
// }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // ─ Nur Platform-Admins dürfen das ──────────────────────────────────────
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Platform-Admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { organization_id, trial_stage = 'paid', billing_status = 'active', reason = '' } = body;

    if (!organization_id) {
      return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });
    }

    // ─ Organisation laden ──────────────────────────────────────────────────
    const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
    const org = orgs[0];

    if (!org) {
      return Response.json({ error: `Organization "${organization_id}" nicht gefunden` }, { status: 404 });
    }

    // ─ Alte Werte vor Änderung loggen ──────────────────────────────────────
    const oldTrialStage = org.trial_stage;
    const oldBillingStatus = org.billing_status;

    // ─ Update durchführen ──────────────────────────────────────────────────
    await base44.asServiceRole.entities.Organization.update(organization_id, {
      trial_stage,
      billing_status,
    });

    console.info(`[repairTrialStage] Repariert org=${organization_id} von trial_stage="${oldTrialStage}" → "${trial_stage}" billing_status="${oldBillingStatus}" → "${billing_status}" reason="${reason}" by=${user.email}`);

    // ─ Audit Log schreiben (falls vorhanden) ────────────────────────────────
    try {
      await base44.asServiceRole.entities.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'repair_trial_stage',
        target_type: 'organization',
        target_id: organization_id,
        organization_id: organization_id,
        metadata: JSON.stringify({
          old_trial_stage: oldTrialStage,
          new_trial_stage: trial_stage,
          old_billing_status: oldBillingStatus,
          new_billing_status: billing_status,
        }),
        reason,
      });
    } catch (e) {
      console.warn('[repairTrialStage] AuditLog write failed:', e.message);
    }

    return Response.json({
      success: true,
      message: `Account repariert: trial_stage="${oldTrialStage}" → "${trial_stage}" billing_status="${oldBillingStatus}" → "${billing_status}"`,
      organization: {
        id: organization_id,
        name: org.name,
        owner_email: org.owner_email,
        old_trial_stage: oldTrialStage,
        new_trial_stage: trial_stage,
        old_billing_status: oldBillingStatus,
        new_billing_status: billing_status,
      },
    });
  } catch (error) {
    console.error('[repairTrialStage] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});