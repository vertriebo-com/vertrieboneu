import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import Stripe from 'npm:stripe@14.21.0';

// ─── SOURCE OF TRUTH ARCHITEKTUR ─────────────────────────────────────────────
//
//  Stripe  = Zahlungsquelle (Geld, Rechnungen, Zahlungsmethoden)
//  unsere DB = App-Zugriffsquelle (Rollen, Features, Limits)
//
//  REGEL: Die App fragt NIEMALS Stripe live ab, um Zugriffsrechte zu entscheiden.
//         Alle Berechtigungen basieren ausschließlich auf Organization.billing_status
//         und Subscription.status in unserer eigenen DB.
//         Stripe-Webhooks halten unsere DB synchron — sie sind der Sync-Mechanismus,
//         nicht die Runtime-Autorität.
//
//  Webhook-Fehlerstrategie:
//    - Echter Fehler (DB-Schreibfehler, unerwartete Exception) → 500
//      → Stripe retried automatisch bis zu 3 Tage (exponential backoff)
//    - duplicate Event (bereits erfolgreich verarbeitet) → 200 sofort
//    - ignored Event (unbekannter Typ, kein relevanter Handler) → 200
//    - NICHT 200 bei echtem Fehler (alter Ansatz war falsch — wir wollen Retries!)
//
//  Idempotenz (UsageLog-Perioden):
//    Eindeutiger Schlüssel: organization_id + period_start (ISO-String aus Stripe)
//    → verhindert doppelte Periodenerstellung bei Webhook-Retries
//
// ─────────────────────────────────────────────────────────────────────────────

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

// ─── Helper ───────────────────────────────────────────────────────────────────

async function logBillingEvent(base44, { stripe_event_id, event_type, organization_id, status, amount, currency, payload, error_message }) {
  try {
    await base44.asServiceRole.entities.BillingEventLog.create({
      stripe_event_id,
      event_type,
      organization_id: organization_id || null,
      status,
      amount: amount || null,
      currency: currency || null,
      payload: JSON.stringify(payload).slice(0, 4000),
      error_message: error_message || null,
    });
  } catch (e) {
    // Log-Fehler dürfen nie die eigentliche Response blockieren
    console.error('[stripeWebhook] BillingEventLog write failed:', e.message);
  }
}

async function findOrgByStripeCustomer(base44, stripeCustomerId) {
  if (!stripeCustomerId) return null;
  const orgs = await base44.asServiceRole.entities.Organization.filter({ stripe_customer_id: stripeCustomerId });
  return orgs[0] || null;
}

async function findOrgBySubscription(base44, stripeSubscriptionId) {
  if (!stripeSubscriptionId) return null;
  const subs = await base44.asServiceRole.entities.Subscription.filter({ stripe_subscription_id: stripeSubscriptionId });
  if (!subs[0]) return null;
  const orgs = await base44.asServiceRole.entities.Organization.filter({ id: subs[0].organization_id });
  return orgs[0] || null;
}

async function upsertSubscription(base44, { organization_id, stripeSub, plan_id }) {
  const existing = await base44.asServiceRole.entities.Subscription.filter({ organization_id });
  const data = {
    organization_id,
    stripe_subscription_id: stripeSub.id,
    stripe_customer_id: stripeSub.customer,
    stripe_price_id: stripeSub.items?.data?.[0]?.price?.id || null,
    plan_id: plan_id || existing[0]?.plan_id || null,
    status: stripeSub.status,
    current_period_start: stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000).toISOString() : null,
    current_period_end: stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: stripeSub.cancel_at_period_end || false,
    cancel_at: stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000).toISOString() : null,
    canceled_at: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000).toISOString() : null,
    ended_at: stripeSub.ended_at ? new Date(stripeSub.ended_at * 1000).toISOString() : null,
    trial_start: stripeSub.trial_start ? new Date(stripeSub.trial_start * 1000).toISOString() : null,
    trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
  };
  if (existing[0]) {
    await base44.asServiceRole.entities.Subscription.update(existing[0].id, data);
  } else {
    await base44.asServiceRole.entities.Subscription.create(data);
  }
}

// Stripe subscription status → unsere billing_status enum
function mapBillingStatus(stripeStatus) {
  const map = {
    active: 'active', trialing: 'trialing', past_due: 'past_due',
    unpaid: 'unpaid', canceled: 'canceled', incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
  };
  return map[stripeStatus] || 'canceled';
}

// ─── UsageLog: idempotente Periodenerstellung ─────────────────────────────────
// Eindeutiger Schlüssel: organization_id + period_start
// Doppelter Webhook → kein zweites UsageLog, kein Reset
async function upsertUsageLogPeriod(base44, { organization_id, period_start, period_end }) {
  // Exakten period_start-String als Idempotenz-Schlüssel nutzen
  const existing = await base44.asServiceRole.entities.UsageLog.filter({
    organization_id,
    period_start,
  });
  if (!existing[0]) {
    await base44.asServiceRole.entities.UsageLog.create({
      organization_id,
      period_start,
      period_end,
      leads_created: 0,
      ai_scorings_used: 0,
      emails_sent: 0,
      lead_generations_used: 0,
      users_count: 0,
    });
    console.info(`[stripeWebhook] UsageLog erstellt für org=${organization_id} periode=${period_start}`);
  } else {
    console.info(`[stripeWebhook] UsageLog bereits vorhanden für org=${organization_id} periode=${period_start} – kein Reset`);
  }
}

// ─── Handler-Funktionen pro Event-Typ ─────────────────────────────────────────

async function handleCheckoutCompleted(base44, session) {
  const organizationId = session.metadata?.organization_id;
  const planId = session.metadata?.plan_id;
  const userEmail = session.metadata?.user_email;

  if (!organizationId) {
    console.warn('[stripeWebhook] checkout.session.completed: kein organization_id in metadata!');
    return { status: 'ignored', reason: 'no_organization_id' };
  }

  const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organizationId });
  const org = orgs[0] || null;
  // org_not_found = echter Fehler → throw, damit 500 und Stripe retried
  if (!org) throw new Error(`org_not_found: Organization "${organizationId}" nicht in DB`);

  // ── HARD-BLOCK: Agency darf kein Self-Service Checkout haben ─────────────
  // Schutz ist auch im Frontend und createCheckoutSession, aber Defense-in-Depth:
  if (planId) {
    try {
      const plans = await base44.asServiceRole.entities.Plan.filter({ id: planId });
      const p = plans[0];
      if (p) {
        const isAgency = p.plan_type === 'agency' || (p.name || '').toLowerCase().includes('agency');
        if (isAgency) {
          console.error(`[stripeWebhook] BLOCKED: Agency plan self-service checkout für org ${organizationId} plan ${planId}`);
          // Als ignored loggen (nicht als Fehler – wir wollen keinen Retry von Stripe)
          return { status: 'ignored', reason: 'agency_plan_blocked' };
        }
      }
    } catch (e) { console.warn('[stripeWebhook] Plan check failed (non-critical):', e.message); }
  }

  // Stripe Customer ID sichern
  if (session.customer && org.stripe_customer_id !== session.customer) {
    await base44.asServiceRole.entities.Organization.update(organizationId, {
      stripe_customer_id: session.customer,
    });
  }

  // Plan aus DB validieren
  let resolvedPlanId = planId;
  if (planId) {
    try {
      const plans = await base44.asServiceRole.entities.Plan.filter({ id: planId });
      if (!plans[0]) {
        console.warn(`[stripeWebhook] Plan ${planId} not found in DB – plan_id wird nicht gesetzt`);
        resolvedPlanId = null;
      }
    } catch (_) { resolvedPlanId = null; }
  }

  // ── OPTION A: Starter-Trial-Regel ────────────────────────────────────────
  //
  // billing_status und trial_stage werden AUSSCHLIESSLICH vom echten
  // Subscription-Status abgeleitet — nie vom bloßen checkout.session.completed.
  //
  // Starter  (trial):  stripeSub.status='trialing' → billing=trialing, stage=verified_trial
  // Pro/Gold (direkt): stripeSub.status='active'   → billing=active,   stage=paid
  //
  // trial_stage darf nur VORWÄRTS: free_preview → verified_trial → paid
  // invoice.paid setzt schließlich stage=paid für Starter (nach Trial-Ende)
  //
  // Regel: checkout.session.completed darf trial_stage NIE von verified_trial zurück auf paid
  //        setzen oder umgekehrt – der Subscription-Status ist die einzige Autorität.

  if (session.subscription) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
      await upsertSubscription(base44, { organization_id: organizationId, stripeSub, plan_id: resolvedPlanId });

      const STAGE_RANK = { free_preview: 0, verified_trial: 1, paid: 2 };
      const currentRank = STAGE_RANK[org.trial_stage] ?? 0;

      let newBillingStatus, newTrialStage;

      if (stripeSub.status === 'trialing') {
        // Starter Trial: billing=trialing, stage=verified_trial (nur vorwärts)
        newBillingStatus = 'trialing';
        newTrialStage = currentRank < 1 ? 'verified_trial' : org.trial_stage;
      } else if (stripeSub.status === 'active') {
        // Professional/Gold: billing=active, stage=paid (nur vorwärts)
        newBillingStatus = 'active';
        newTrialStage = currentRank < 2 ? 'paid' : org.trial_stage;
      } else {
        // Unerwarteter Status (incomplete etc.) – konservativ setzen
        newBillingStatus = mapBillingStatus(stripeSub.status);
        newTrialStage = org.trial_stage;
      }

      await base44.asServiceRole.entities.Organization.update(organizationId, {
        billing_status: newBillingStatus,
        trial_stage: newTrialStage,
        plan_id: resolvedPlanId || org.plan_id,
        stripe_customer_id: session.customer || org.stripe_customer_id,
        ...(stripeSub.status === 'trialing' && !org.trial_verified_at ? {
          trial_verified_at: new Date().toISOString(),
          trial_verified_by: org.owner_email,
          ...(stripeSub.trial_end ? { trial_ends_at: new Date(stripeSub.trial_end * 1000).toISOString() } : {}),
        } : {}),
      });

      console.info(`[stripeWebhook] checkout.completed org=${organizationId} plan=${resolvedPlanId} stripe_status=${stripeSub.status} → billing=${newBillingStatus} stage=${newTrialStage}`);
    } catch (e) {
      // Subscription fetch schlug fehl – Fallback: nur customer_id + plan_id sichern, Status nicht ändern
      console.warn('[stripeWebhook] Subscription fetch failed – nur customer_id gesichert:', e.message);
      await base44.asServiceRole.entities.Organization.update(organizationId, {
        plan_id: resolvedPlanId || org.plan_id,
        stripe_customer_id: session.customer || org.stripe_customer_id,
      });
    }
  } else {
    // Kein subscription object im session (Edge-Case) – nur IDs sichern
    await base44.asServiceRole.entities.Organization.update(organizationId, {
      plan_id: resolvedPlanId || org.plan_id,
      stripe_customer_id: session.customer || org.stripe_customer_id,
    });
    console.warn(`[stripeWebhook] checkout.completed ohne subscription object für org ${organizationId}`);
  }

  if (userEmail) {
    try {
      const planName = session.metadata?.plan_name || 'Premium';
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: userEmail,
        subject: `🎉 Willkommen beim ${planName}-Plan!`,
        from_name: 'Vertriebo',
        body: `<p>Hallo,<br/><br/>dein <strong>${planName}-Plan</strong> ist jetzt aktiv. Viel Erfolg beim Vertrieb!<br/><br/>– Das Vertriebo-Team</p>`,
      });
    } catch (e) { console.warn('[stripeWebhook] Welcome email failed:', e.message); }
  }

  console.info(`[stripeWebhook] checkout.completed org=${organizationId} plan=${resolvedPlanId}`);
  return { status: 'success' };
}

async function handleSubscriptionUpdated(base44, stripeSub) {
  const organizationId = stripeSub.metadata?.organization_id;
  const planId = stripeSub.metadata?.plan_id;

  let org = null;
  if (organizationId) {
    try {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organizationId });
      org = orgs[0] || null;
    } catch (_) {}
  }
  if (!org) org = await findOrgByStripeCustomer(base44, stripeSub.customer);
  if (!org) {
    // Org genuinely not found → log as ignored, nicht als Fehler (kein Retry nötig)
    console.warn(`[stripeWebhook] subscription.updated: org nicht gefunden für customer ${stripeSub.customer} – ignoriert`);
    return { status: 'ignored', reason: 'org_not_found' };
  }

  // plan_id aus Metadata (Starter, Professional, Gold) oder bestehende org.plan_id
  const resolvedPlanId = planId || org.plan_id;
  await upsertSubscription(base44, { organization_id: org.id, stripeSub, plan_id: resolvedPlanId });
  const billingStatus = mapBillingStatus(stripeSub.status);

  // ── trial_stage: nur VORWÄRTS, nie zurück ─────────────────────────────────
  // free_preview(0) → verified_trial(1) → paid(2)
  //
  // Starter mit Trial:       trialing → verified_trial → (nach Trial-Ende) active → paid
  // Professional (direkt):   active → paid (sofort, kein Trial)
  // Gold (direkt):           active → paid (sofort, kein Trial)
  // Upgrade Starter→Pro/Gold: active → paid (korrekt hochgestuft)
  const STAGE_RANK = { free_preview: 0, verified_trial: 1, paid: 2 };
  const currentStageRank = STAGE_RANK[org.trial_stage] ?? 0;
  let newTrialStage = org.trial_stage;
  if (stripeSub.status === 'active' && currentStageRank < 2) {
    newTrialStage = 'paid';
  } else if (stripeSub.status === 'trialing' && currentStageRank < 1) {
    newTrialStage = 'verified_trial';
  }
  // past_due, canceled, unpaid → trial_stage unverändert lassen

  // ── billing_status: nie von 'active' auf 'trialing' downgraden ─────────────
  // Race Condition: subscription.created kommt manchmal vor checkout.completed.
  // checkout.completed setzt 'active' → subscription.created darf das nicht auf 'trialing' drehen.
  const neverDowngrade = org.billing_status === 'active' && billingStatus === 'trialing';

  await base44.asServiceRole.entities.Organization.update(org.id, {
    ...(!neverDowngrade ? { billing_status: billingStatus } : {}),
    trial_stage: newTrialStage,
    ...(resolvedPlanId ? { plan_id: resolvedPlanId } : {}),
    ...(stripeSub.status === 'trialing' && !org.trial_verified_at ? {
      trial_verified_at: new Date().toISOString(),
      trial_verified_by: org.owner_email
    } : {}),
  });

  console.info(`[stripeWebhook] subscription.updated org=${org.id} plan=${resolvedPlanId} stripe_status=${stripeSub.status} billing_status=${neverDowngrade ? org.billing_status + '(kept)' : billingStatus} trial_stage=${newTrialStage}`);
  return { status: 'success' };
}

async function handleSubscriptionDeleted(base44, stripeSub) {
  const organizationId = stripeSub.metadata?.organization_id;
  let org = null;
  if (organizationId) {
    try {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organizationId });
      org = orgs[0] || null;
    } catch (_) {}
  }
  if (!org) org = await findOrgByStripeCustomer(base44, stripeSub.customer);
  if (!org) return { status: 'ignored', reason: 'org_not_found' };

  await upsertSubscription(base44, { organization_id: org.id, stripeSub });
  await base44.asServiceRole.entities.Organization.update(org.id, { billing_status: 'canceled' });

  console.info(`[stripeWebhook] subscription.deleted org=${org.id}`);
  return { status: 'success' };
}

async function handleInvoicePaid(base44, invoice) {
  const stripeSubId = invoice.subscription;
  if (!stripeSubId) return { status: 'ignored', reason: 'no_subscription' };

  let org = await findOrgBySubscription(base44, stripeSubId);
  if (!org) org = await findOrgByStripeCustomer(base44, invoice.customer);
  if (!org) return { status: 'ignored', reason: 'org_not_found' };

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  await upsertSubscription(base44, { organization_id: org.id, stripeSub });
  await base44.asServiceRole.entities.Organization.update(org.id, { 
    billing_status: 'active',
    trial_stage: 'paid'
  });

  // ── Idempotente UsageLog-Periode (org_id + period_start als Schlüssel) ────
  if (invoice.period_start && invoice.period_end) {
    const periodStart = new Date(invoice.period_start * 1000).toISOString();
    const periodEnd = new Date(invoice.period_end * 1000).toISOString();
    await upsertUsageLogPeriod(base44, { organization_id: org.id, period_start: periodStart, period_end: periodEnd });
  }

  // stripe_latest_invoice_id auf Subscription speichern
  try {
    const subs = await base44.asServiceRole.entities.Subscription.filter({ organization_id: org.id });
    if (subs[0]) {
      await base44.asServiceRole.entities.Subscription.update(subs[0].id, {
        stripe_latest_invoice_id: invoice.id,
        stripe_payment_intent_id: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : null,
      });
    }
  } catch (_) {}

  console.info(`[stripeWebhook] invoice.paid org=${org.id} amount=${invoice.amount_paid} period=${invoice.period_start}-${invoice.period_end}`);
  return { status: 'success', amount: invoice.amount_paid };
}

async function handleInvoicePaymentFailed(base44, invoice) {
  const stripeSubId = invoice.subscription;
  let org = null;
  if (stripeSubId) org = await findOrgBySubscription(base44, stripeSubId);
  if (!org) org = await findOrgByStripeCustomer(base44, invoice.customer);
  if (!org) return { status: 'ignored', reason: 'org_not_found' };

  await base44.asServiceRole.entities.Organization.update(org.id, { billing_status: 'past_due' });

  if (stripeSubId) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
      await upsertSubscription(base44, { organization_id: org.id, stripeSub });
    } catch (_) {}
  }

  if (org.owner_email) {
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: org.owner_email,
        subject: '⚠️ Zahlung fehlgeschlagen – Bitte Zahlungsmethode aktualisieren',
        from_name: 'Vertriebo',
        body: `<p>Hallo,<br/><br/>leider ist die Zahlung für dein Abonnement fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode im Kundenportal, um deinen Zugang zu erhalten.<br/><br/>– Das Vertriebo-Team</p>`,
      });
    } catch (e) { console.warn('[stripeWebhook] Payment failed email error:', e.message); }
  }

  console.warn(`[stripeWebhook] invoice.payment_failed org=${org.id}`);
  return { status: 'success' };
}

// ─── Main Webhook Handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // ── 1. Stripe Signature Verification ─────────────────────────────────────
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripeWebhook] Signature verification failed:", err.message);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── 2. Base44 Client (erst nach Signature-Verifikation!) ─────────────────
  const base44 = createClientFromRequest(req);
  const obj = event.data.object;

  console.log(`[stripeWebhook] Event received: ${event.type} (${event.id})`);

  // ── 3. Idempotenz: bereits erfolgreich verarbeitete Events sofort ablehnen
  try {
    const existingLogs = await base44.asServiceRole.entities.BillingEventLog.filter({ stripe_event_id: event.id });
    if (existingLogs.length > 0 && existingLogs[0].status === 'success') {
      console.log(`[stripeWebhook] Duplicate event ${event.id} – bereits verarbeitet. Skipping.`);
      // Duplicate-Log schreiben, aber KEINEN zweiten Duplicate-Log auf Duplicate
      return Response.json({ received: true, status: 'duplicate' });
    }
  } catch (e) {
    // Wenn Idempotenz-Check fehlschlägt, lieber weiterverarbeiten als blockieren
    console.warn('[stripeWebhook] Idempotency check failed (proceeding):', e.message);
  }

  // ── 4. Event verarbeiten ──────────────────────────────────────────────────
  let result = { status: 'ignored' };

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        result = await handleCheckoutCompleted(base44, obj);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        result = await handleSubscriptionUpdated(base44, obj);
        break;
      case 'customer.subscription.deleted':
        result = await handleSubscriptionDeleted(base44, obj);
        break;
      case 'invoice.paid':
        result = await handleInvoicePaid(base44, obj);
        break;
      case 'invoice.payment_failed':
        result = await handleInvoicePaymentFailed(base44, obj);
        break;
      default:
        console.log(`[stripeWebhook] Unhandled event type: ${event.type}`);
        result = { status: 'ignored', reason: 'unhandled_event_type' };
    }
  } catch (err) {
    // ── ECHTER FEHLER → 500 → Stripe retried ────────────────────────────────
    // (Vorher war hier 200 — das ist falsch, weil Stripe dann nicht retried)
    console.error(`[stripeWebhook] Processing error for ${event.type} (${event.id}):`, err.message);
    // Fehler loggen (best-effort, darf nicht nochmal werfen)
    await logBillingEvent(base44, {
      stripe_event_id: event.id,
      event_type: event.type,
      organization_id: obj?.metadata?.organization_id || null,
      status: 'error',
      amount: obj?.amount_paid || obj?.amount_total || null,
      currency: obj?.currency || null,
      payload: obj,
      error_message: err.message,
    });
    // ── FIX 2: Error-Alert an Plattform-Admin ────────────────────
    try {
      await base44.asServiceRole.functions.invoke('sendCriticalErrorAlert', {
        function_name: 'stripeWebhook',
        error_message: err.message,
        stack: err.stack,
        organization_id: obj?.metadata?.organization_id || null,
        user_email: null,
        timestamp: new Date().toISOString(),
      });
    } catch (alertErr) {
      console.error('[stripeWebhook] Alert-Fehler:', alertErr.message);
    }
    // 500 → Stripe retried (bis zu 3 Tage, exponential backoff)
    return Response.json({ error: err.message }, { status: 500 });
  }

  // ── 5. BillingEventLog schreiben (nur bei success/ignored, nicht bei error) ─
  await logBillingEvent(base44, {
    stripe_event_id: event.id,
    event_type: event.type,
    organization_id: obj?.metadata?.organization_id || null,
    status: result.status === 'success' ? 'success' : 'ignored',
    amount: obj?.amount_paid || obj?.amount_total || result.amount || null,
    currency: obj?.currency || null,
    payload: obj,
    error_message: null,
  });

  return Response.json({ received: true, status: result.status });
});