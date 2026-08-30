import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// ─── Digistore24 IPN Webhook Handler ────────────────────────────────────────
// Webhook-URL in Digistore24 eintragen:
//   https://vertriebo.base44.app/functions/digistore24Webhook
//
// Secrets benötigt:
//   DIGISTORE24_WEBHOOK_SECRET – IPN-Secret aus Digistore24 → Einstellungen → IPN
// ─────────────────────────────────────────────────────────────────────────────

// Map Digistore24 payment status → Vertriebo billing_status
function mapStatus(ipnType, paymentStatus) {
  if (ipnType === 'order_completed' || paymentStatus === 'complete') return 'active';
  if (ipnType === 'subscription_canceled' || paymentStatus === 'canceled') return 'canceled';
  if (ipnType === 'on_payment_error' || paymentStatus === 'payment_failed') return 'past_due';
  if (ipnType === 'on_refund' || paymentStatus === 'refunded') return 'canceled';
  return null;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Parse body – Digistore24 sends application/x-www-form-urlencoded
    const contentType = req.headers.get('content-type') || '';
    let params = {};
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      params = Object.fromEntries(new URLSearchParams(text));
    } else {
      params = await req.json().catch(() => ({}));
    }

    console.log('[digistore24Webhook] received params:', JSON.stringify(params));

    // ── Signaturprüfung ──────────────────────────────────────────────────────
    // DIGISTORE24_WEBHOOK_SECRET muss in Settings → Secrets gesetzt sein.
    // Digistore24 sendet SHA1-HMAC über die sortierten POST-Parameter (ohne sha_sign).
    // Wenn das Secret noch nicht gesetzt ist, wird die Prüfung übersprungen (WARNUNG loggen).
    const webhookSecret = secrets.get('DIGISTORE24_WEBHOOK_SECRET');
    if (webhookSecret) {
      const receivedSign = params['sha_sign'] || '';
      // Build sorted param string excluding sha_sign itself
      const sortedKeys = Object.keys(params).filter(k => k !== 'sha_sign').sort();
      const paramString = sortedKeys.map(k => `${k}=${params[k]}`).join('|');
      const msgToHash = paramString + '|' + webhookSecret;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(webhookSecret);
      const msgData = encoder.encode(msgToHash);
      const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const signBuffer = await crypto.subtle.sign('HMAC', key, msgData);
      const computedSign = Array.from(new Uint8Array(signBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (computedSign.toLowerCase() !== receivedSign.toLowerCase()) {
        console.error('[digistore24Webhook] Invalid signature');
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.warn('[digistore24Webhook] DIGISTORE24_WEBHOOK_SECRET not set – skipping signature check');
    }

    // ── Parse IPN fields ─────────────────────────────────────────────────────
    const ipnType = params['order_event'] || params['event'] || 'order_completed';
    const orderId = params['order_id'] || params['transaction_id'] || '';
    const productId = params['product_id'] || '';
    const buyerEmail = (params['customer_email'] || params['buyer_email'] || '').toLowerCase().trim();
    const buyerName = params['customer_name'] || params['buyer_name'] || '';
    const customerId = params['customer_id'] || params['buyer_id'] || orderId;
    const affiliateId = params['affiliate_id'] || params['affiliate'] || '';
    const paymentStatus = params['payment_status'] || '';

    if (!orderId || !buyerEmail) {
      console.error('[digistore24Webhook] Missing order_id or buyer email');
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newBillingStatus = mapStatus(ipnType, paymentStatus);
    if (!newBillingStatus) {
      console.log('[digistore24Webhook] Unhandled IPN type, ignoring:', ipnType);
      return Response.json({ ok: true, ignored: true });
    }

    // ── Idempotenz-Check: existierende Subscription mit dieser order_id? ─────
    const existingSubs = await base44.asServiceRole.entities.Subscription.filter({ digistore24_order_id: orderId });
    const existingSub = existingSubs?.[0] || null;

    // ── Plan ermitteln via digistore24_product_id ────────────────────────────
    let planId = existingSub?.plan_id || null;
    if (!planId && productId) {
      const plans = await base44.asServiceRole.entities.Plan.filter({ digistore24_product_id: productId });
      if (plans?.[0]) planId = plans[0].id;
    }

    // ── Organisation suchen oder anlegen ────────────────────────────────────
    let org = null;
    const existingOrgs = await base44.asServiceRole.entities.Organization.filter({ owner_email: buyerEmail });
    if (existingOrgs?.[0]) {
      org = existingOrgs[0];
    } else if (newBillingStatus === 'active' || newBillingStatus === 'trialing') {
      // Neue Org anlegen
      const nameParts = buyerName.split(' ');
      org = await base44.asServiceRole.entities.Organization.create({
        name: buyerName || buyerEmail,
        owner_email: buyerEmail,
        billing_status: 'trialing',
        trial_stage: 'free_preview',
        platform_status: 'pending',
        onboarding_done: false,
        plan_id: planId || undefined,
      });
      console.log('[digistore24Webhook] Created new org:', org.id);
    }

    if (!org) {
      console.error('[digistore24Webhook] Could not find or create org for', buyerEmail);
      return Response.json({ error: 'Org not found' }, { status: 400 });
    }

    // ── Organisation billing_status aktualisieren ────────────────────────────
    const orgUpdate = { billing_status: newBillingStatus };
    if (planId) orgUpdate.plan_id = planId;
    if (newBillingStatus === 'active') {
      orgUpdate.platform_status = 'active';
      orgUpdate.trial_stage = 'paid';
    } else if (newBillingStatus === 'canceled') {
      orgUpdate.platform_status = 'suspended';
    }
    await base44.asServiceRole.entities.Organization.update(org.id, orgUpdate);

    // ── Subscription erstellen oder aktualisieren ────────────────────────────
    const subFields = {
      organization_id: org.id,
      source: 'digistore24',
      digistore24_order_id: orderId,
      digistore24_customer_id: customerId,
      affiliate_id: affiliateId,
      status: newBillingStatus === 'active' ? 'active' : newBillingStatus === 'past_due' ? 'past_due' : 'canceled',
      plan_id: planId || undefined,
    };

    if (newBillingStatus === 'active') {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      subFields.current_period_start = now.toISOString();
      subFields.current_period_end = periodEnd.toISOString();
    }
    if (newBillingStatus === 'canceled') {
      subFields.canceled_at = new Date().toISOString();
      subFields.ended_at = new Date().toISOString();
    }

    if (existingSub) {
      await base44.asServiceRole.entities.Subscription.update(existingSub.id, subFields);
      console.log('[digistore24Webhook] Updated subscription', existingSub.id);
    } else {
      const newSub = await base44.asServiceRole.entities.Subscription.create(subFields);
      console.log('[digistore24Webhook] Created subscription', newSub.id);
    }

    return Response.json({ ok: true, org_id: org.id, status: newBillingStatus });

  } catch (error) {
    console.error('[digistore24Webhook] Error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}