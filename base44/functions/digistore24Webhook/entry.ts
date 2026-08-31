import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// ─── Digistore24 IPN Webhook Handler ────────────────────────────────────────
// Webhook-URL in Digistore24 eintragen:
//   https://vertriebo.base44.app/functions/digistore24Webhook
//
// Secrets: DIGISTORE24_WEBHOOK_SECRET (SHA-512 IPN-Secret aus Digistore24 → Einstellungen → IPN)
//
// Echte Digistore24 IPN-Feldnamen (laut offizieller Doku):
//   event          → on_payment, on_refund, on_chargeback, on_payment_missed,
//                    last_paid_day, on_rebill_cancelled, connection_test, on_affiliation
//   email          → E-Mail aus Billing-Adresse
//   billing_status → completed, paying, aborted, unpaid, reminding
//   order_id       → eindeutige Order-ID
//   product_id     → Produkt-ID
//   affiliate_id   → Affiliate-ID (0 wenn kein Affiliate)
//   sha_sign       → SHA-512 HMAC Signatur
// ─────────────────────────────────────────────────────────────────────────────

// Mappt echte Digistore24 Events → Vertriebo billing_status
// Gibt null zurück wenn Event ignoriert werden soll
// Gibt 'cancel_at_period_end' zurück für on_rebill_cancelled (Abo läuft noch bis last_paid_day)
function mapEvent(event: string, billingStatus: string): string | null {
  switch (event) {
    case 'on_payment':
      // Nur aktiv setzen wenn Zahlung wirklich completed oder paying (Abo läuft)
      if (billingStatus === 'completed' || billingStatus === 'paying') return 'active';
      return null;
    case 'on_refund':
    case 'on_chargeback':
      return 'canceled';
    case 'last_paid_day':
      // Letzte bezahlte Periode abgelaufen → endgültig kündigen
      return 'canceled';
    case 'on_payment_missed':
      // Zahlung fehlt → temporär sperren, Digistore24 versucht es erneut
      return 'past_due';
    case 'on_rebill_cancelled':
      // Abo gekündigt, aber Zugang läuft noch bis last_paid_day → als 'cancel_at_period_end' behandeln
      return 'cancel_at_period_end';
    default:
      return null;
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Body parsen – Digistore24 sendet application/x-www-form-urlencoded ──
    const contentType = req.headers.get('content-type') || '';
    let params: Record<string, string> = {};
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      params = Object.fromEntries(new URLSearchParams(text));
    } else {
      params = await req.json().catch(() => ({}));
    }

    console.log('[digistore24Webhook] received params:', JSON.stringify(params));

    const event = params['event'] || '';

    // ── connection_test: Digistore24 "Verbindung testen"-Button ─────────────
    if (event === 'connection_test') {
      console.log('[digistore24Webhook] connection_test received – responding OK');
      return new Response('OK', { status: 200 });
    }

    // ── SHA-512 Signaturprüfung ───────────────────────────────────────────────
    const webhookSecret = secrets.get('DIGISTORE24_WEBHOOK_SECRET');
    if (webhookSecret) {
      const receivedSign = (params['sha_sign'] || '').toLowerCase();
      // Sortierte Parameter ohne sha_sign, verknüpft mit '|', dann '|' + Secret
      const sortedKeys = Object.keys(params).filter(k => k !== 'sha_sign').sort();
      const paramString = sortedKeys.map(k => `${k}=${params[k]}`).join('|');
      const msgToHash = paramString + '|' + webhookSecret;
      const encoder = new TextEncoder();
      const msgData = encoder.encode(msgToHash);
      const hashBuffer = await crypto.subtle.digest('SHA-512', msgData);
      const computedSign = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (computedSign !== receivedSign) {
        console.error('[digistore24Webhook] Invalid SHA-512 signature');
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.warn('[digistore24Webhook] DIGISTORE24_WEBHOOK_SECRET not set – skipping signature check');
    }

    // ── IPN-Felder lesen (echte Digistore24-Feldnamen) ───────────────────────
    const orderId       = params['order_id'] || '';
    const productId     = params['product_id'] || '';
    const billingStatus = params['billing_status'] || '';
    const affiliateId   = params['affiliate_id'] || '';

    // E-Mail: Digistore24 liefert 'email' im Billing-Address-Block
    const buyerEmail = (
      params['email'] ||
      params['customer_email'] ||
      params['buyer_email'] ||
      ''
    ).toLowerCase().trim();

    // Name: Digistore24 liefert billing_first_name + billing_last_name
    const buyerName = (
      [params['billing_first_name'] || params['__buyer_first_name__'], params['billing_last_name'] || params['__buyer_last_name__']]
        .filter(Boolean).join(' ')
    ) || params['customer_name'] || buyerEmail;

    // Käufer-ID
    const customerId = params['__buyer_id__'] || params['customer_id'] || orderId;

    if (!orderId || !buyerEmail) {
      console.error('[digistore24Webhook] Missing order_id or email. orderId:', orderId, 'email:', buyerEmail);
      return Response.json({ error: 'Missing required fields: order_id or email' }, { status: 400 });
    }

    // ── Event → Vertriebo-Status mappen ─────────────────────────────────────
    const mappedStatus = mapEvent(event, billingStatus);
    if (!mappedStatus) {
      console.log('[digistore24Webhook] Unhandled or ignored event:', event, '/ billing_status:', billingStatus);
      return Response.json({ ok: true, ignored: true, event });
    }

    // on_rebill_cancelled: Abo nur als "läuft aus" markieren, Billing bleibt 'active'
    const isCancelAtPeriodEnd = mappedStatus === 'cancel_at_period_end';
    const newBillingStatus = isCancelAtPeriodEnd ? 'active' : mappedStatus;

    // ── Idempotenz: bestehende Subscription mit dieser order_id? ─────────────
    const existingSubs = await base44.asServiceRole.entities.Subscription.filter({ digistore24_order_id: orderId });
    const existingSub = existingSubs?.[0] || null;

    // ── Plan via digistore24_product_id ermitteln ────────────────────────────
    let planId: string | null = existingSub?.plan_id || null;
    if (!planId && productId) {
      const plans = await base44.asServiceRole.entities.Plan.filter({ digistore24_product_id: productId });
      if (plans?.[0]) planId = plans[0].id;
    }

    // ── Organisation suchen oder anlegen ────────────────────────────────────
    let org: any = null;
    const existingOrgs = await base44.asServiceRole.entities.Organization.filter({ owner_email: buyerEmail });
    if (existingOrgs?.[0]) {
      org = existingOrgs[0];
    } else if (newBillingStatus === 'active') {
      org = await base44.asServiceRole.entities.Organization.create({
        name: buyerName || buyerEmail,
        owner_email: buyerEmail,
        billing_status: 'active',
        trial_stage: 'paid',
        platform_status: 'active',
        onboarding_done: false,
        plan_id: planId || undefined,
      });
      console.log('[digistore24Webhook] Created new org:', org.id);
    }

    if (!org) {
      console.error('[digistore24Webhook] Could not find or create org for', buyerEmail);
      return Response.json({ error: 'Org not found and status is not active' }, { status: 400 });
    }

    // ── Organisation aktualisieren ───────────────────────────────────────────
    const orgUpdate: Record<string, any> = { billing_status: newBillingStatus };
    if (planId) orgUpdate.plan_id = planId;

    if (newBillingStatus === 'active' && !isCancelAtPeriodEnd) {
      orgUpdate.platform_status = 'active';
      orgUpdate.trial_stage = 'paid';
    } else if (newBillingStatus === 'canceled') {
      orgUpdate.platform_status = 'suspended';
    } else if (newBillingStatus === 'past_due') {
      orgUpdate.platform_status = 'suspended';
    }

    if (isCancelAtPeriodEnd) {
      // Nur cancel_at_period_end setzen, Status bleibt active
      orgUpdate.billing_status = 'active';
    }

    await base44.asServiceRole.entities.Organization.update(org.id, orgUpdate);

    // ── Subscription erstellen oder aktualisieren ────────────────────────────
    const subFields: Record<string, any> = {
      organization_id: org.id,
      source: 'digistore24',
      digistore24_order_id: orderId,
      digistore24_customer_id: customerId,
      affiliate_id: affiliateId !== '0' ? affiliateId : undefined,
      status: newBillingStatus === 'active' ? 'active'
            : newBillingStatus === 'past_due' ? 'past_due'
            : 'canceled',
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
      subFields.cancel_at_period_end = false;
    }
    if (isCancelAtPeriodEnd) {
      subFields.cancel_at_period_end = true;
      subFields.status = 'active';
    }

    if (existingSub) {
      await base44.asServiceRole.entities.Subscription.update(existingSub.id, subFields);
      console.log('[digistore24Webhook] Updated subscription', existingSub.id, 'event:', event, 'status:', newBillingStatus);
    } else {
      const newSub = await base44.asServiceRole.entities.Subscription.create(subFields);
      console.log('[digistore24Webhook] Created subscription', newSub.id, 'event:', event, 'status:', newBillingStatus);
    }

    return Response.json({ ok: true, org_id: org.id, event, billing_status: newBillingStatus });

  } catch (error: any) {
    console.error('[digistore24Webhook] Error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}