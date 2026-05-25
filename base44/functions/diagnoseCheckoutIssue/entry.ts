import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import Stripe from 'npm:stripe@14.21.0';

// ─── VOLLSTÄNDIGE LIVE-DIAGNOSE ────────────────────────────────────────────────
// Prüft: Stripe API direkt, DB-Status, User-Kontext, Webhooks, BillingEventLogs
// Nur Platform-Admin.
//
// POST { organization_id?, user_email?, checkout_session_id? }
// Wenn organization_id fehlt: sucht anhand user_email oder der eingeloggten Session

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Platform-Admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { organization_id, user_email, checkout_session_id } = body;

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const report = { timestamp: new Date().toISOString(), diagnosed_by: user.email };

    // ── 1. User Context ────────────────────────────────────────────────────────
    // Finde Organisation: direkt per ID, oder per user_email (owner_email oder Member)
    let org = null;
    let targetEmail = user_email;

    if (organization_id) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      org = orgs[0] || null;
      if (org) targetEmail = org.owner_email;
    } else if (user_email) {
      // Suche zuerst als Owner
      const ownerOrgs = await base44.asServiceRole.entities.Organization.filter({ owner_email: user_email });
      if (ownerOrgs.length > 0) {
        org = ownerOrgs[0];
      } else {
        // Suche als Member
        const members = await base44.asServiceRole.entities.OrganizationMember.filter({ user_email });
        if (members.length > 0) {
          const memberOrgs = await base44.asServiceRole.entities.Organization.filter({ id: members[0].organization_id });
          org = memberOrgs[0] || null;
        }
      }
    }

    // ── 1b. User-Rolle prüfen (warum "Vertriebler"?) ──────────────────────────
    let targetUser = null;
    let memberRecord = null;
    if (targetEmail) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ email: targetEmail });
        targetUser = users[0] || null;
      } catch (_) {}

      if (org) {
        try {
          const members = await base44.asServiceRole.entities.OrganizationMember.filter({
            organization_id: org.id,
            user_email: targetEmail
          });
          memberRecord = members[0] || null;
        } catch (_) {}
      }
    }

    report.user_context = {
      logged_in_admin: user.email,
      target_email: targetEmail,
      base44_role: targetUser?.role || 'unknown',
      is_org_owner: org ? org.owner_email === targetEmail : null,
      member_role: memberRecord?.role || null,
      member_status: memberRecord?.status || null,
      warning: (targetUser && !['admin', 'platform_admin'].includes(targetUser.role) && org?.owner_email !== targetEmail)
        ? '⚠️ User ist NICHT owner der Org und kein Platform-Admin — Checkout könnte auf falscher Org laufen!'
        : null,
    };

    // ── 2. Organization Status ─────────────────────────────────────────────────
    report.organization = org ? {
      id: org.id,
      name: org.name,
      owner_email: org.owner_email,
      billing_status: org.billing_status,
      trial_stage: org.trial_stage,
      trial_ends_at: org.trial_ends_at,
      trial_verified_at: org.trial_verified_at,
      plan_id: org.plan_id,
      stripe_customer_id: org.stripe_customer_id,
      onboarding_done: org.onboarding_done,
      updated_date: org.updated_date,
    } : null;

    // ── 3. Plan aus DB ─────────────────────────────────────────────────────────
    let plan = null;
    if (org?.plan_id) {
      try {
        const plans = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
        plan = plans[0] || null;
      } catch (_) {}
    }
    report.plan_db = plan ? {
      id: plan.id,
      name: plan.name,
      plan_type: plan.plan_type,
      stripe_price_id: plan.stripe_price_id,
      stripe_product_id: plan.stripe_product_id,
      price_monthly: plan.price_monthly,
      is_active: plan.is_active,
    } : null;

    // ── 4. Subscription Entity ─────────────────────────────────────────────────
    let subs = [];
    if (org) {
      subs = await base44.asServiceRole.entities.Subscription.filter({ organization_id: org.id });
    }
    const activeSub = subs.find(s => ['active', 'trialing'].includes(s.status));
    report.subscriptions_db = {
      count: subs.length,
      active: activeSub ? {
        id: activeSub.id,
        stripe_subscription_id: activeSub.stripe_subscription_id,
        stripe_price_id: activeSub.stripe_price_id,
        plan_id: activeSub.plan_id,
        status: activeSub.status,
        current_period_start: activeSub.current_period_start,
        current_period_end: activeSub.current_period_end,
        created_date: activeSub.created_date,
      } : null,
      all: subs.map(s => ({
        id: s.id,
        stripe_subscription_id: s.stripe_subscription_id,
        status: s.status,
        plan_id: s.plan_id,
        created_date: s.created_date,
      })),
    };

    // ── 5. Stripe API: Customer ────────────────────────────────────────────────
    report.stripe_customer = null;
    if (org?.stripe_customer_id) {
      try {
        const customer = await stripe.customers.retrieve(org.stripe_customer_id);
        report.stripe_customer = {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          created: new Date(customer.created * 1000).toISOString(),
          metadata: customer.metadata,
        };
      } catch (e) {
        report.stripe_customer = { error: e.message };
      }
    }

    // ── 6. Stripe API: Letzte Checkout Sessions für diesen Customer ──────────
    report.stripe_checkout_sessions = [];
    const stripeCustomerId = org?.stripe_customer_id;
    if (stripeCustomerId || checkout_session_id) {
      try {
        if (checkout_session_id) {
          // Spezifische Session
          const session = await stripe.checkout.sessions.retrieve(checkout_session_id, {
            expand: ['subscription', 'line_items']
          });
          report.stripe_checkout_sessions = [{
            id: session.id,
            status: session.status,
            payment_status: session.payment_status,
            customer: session.customer,
            subscription: session.subscription?.id || session.subscription,
            subscription_status: session.subscription?.status || null,
            amount_total: session.amount_total,
            currency: session.currency,
            created: new Date(session.created * 1000).toISOString(),
            metadata: session.metadata,
            line_items: session.line_items?.data?.map(i => ({
              description: i.description,
              price_id: i.price?.id,
              product_id: i.price?.product,
              amount: i.amount_total,
            })),
          }];
        } else if (stripeCustomerId) {
          // Letzte 5 Sessions für diesen Customer
          const sessions = await stripe.checkout.sessions.list({
            customer: stripeCustomerId,
            limit: 5,
          });
          report.stripe_checkout_sessions = sessions.data.map(s => ({
            id: s.id,
            status: s.status,
            payment_status: s.payment_status,
            subscription: s.subscription,
            amount_total: s.amount_total,
            created: new Date(s.created * 1000).toISOString(),
            metadata: s.metadata,
          }));
        }
      } catch (e) {
        report.stripe_checkout_sessions = [{ error: e.message }];
      }
    }

    // ── 7. Stripe API: Subscriptions für diesen Customer ──────────────────────
    report.stripe_subscriptions = [];
    if (stripeCustomerId) {
      try {
        const stripeSubs = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          limit: 5,
          expand: ['data.items.data.price'],
        });
        report.stripe_subscriptions = stripeSubs.data.map(s => ({
          id: s.id,
          status: s.status,
          created: new Date(s.created * 1000).toISOString(),
          current_period_start: new Date(s.current_period_start * 1000).toISOString(),
          current_period_end: new Date(s.current_period_end * 1000).toISOString(),
          trial_start: s.trial_start ? new Date(s.trial_start * 1000).toISOString() : null,
          trial_end: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
          price_id: s.items?.data?.[0]?.price?.id,
          product_id: s.items?.data?.[0]?.price?.product,
          metadata: s.metadata,
        }));
      } catch (e) {
        report.stripe_subscriptions = [{ error: e.message }];
      }
    }

    // ── 8. Stripe Webhook Secret prüfen ───────────────────────────────────────
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    report.webhook_secret = {
      is_set: !!webhookSecret,
      prefix: webhookSecret ? webhookSecret.substring(0, 8) + '...' : null,
      looks_like_live: webhookSecret?.startsWith('whsec_') ? true : false,
    };

    // ── 9. BillingEventLog ────────────────────────────────────────────────────
    let billingLogs = [];
    if (org) {
      billingLogs = await base44.asServiceRole.entities.BillingEventLog.filter({ organization_id: org.id });
    }
    const sortedLogs = billingLogs
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 15);

    report.billing_events = {
      total_count: billingLogs.length,
      checkout_completed_count: billingLogs.filter(l => l.event_type === 'checkout.session.completed').length,
      recent: sortedLogs.map(l => ({
        id: l.id,
        stripe_event_id: l.stripe_event_id,
        event_type: l.event_type,
        status: l.status,
        error_message: l.error_message,
        amount: l.amount,
        created_date: l.created_date,
      })),
    };

    // ── 10. Automatische Problemanalyse ───────────────────────────────────────
    const issues = [];

    if (!org) {
      issues.push({ severity: 'CRITICAL', code: 'NO_ORG_FOUND', message: 'Keine Organisation gefunden für diese Email/ID' });
    } else {
      // Webhook kam gar nicht an?
      const checkoutLogs = billingLogs.filter(l => l.event_type === 'checkout.session.completed');
      if (checkoutLogs.length === 0) {
        issues.push({
          severity: 'CRITICAL',
          code: 'NO_CHECKOUT_WEBHOOK',
          message: 'KEIN checkout.session.completed Webhook in BillingEventLog — Stripe sendet nicht an diesen Endpoint!',
          hint: 'Prüfen: 1) Webhook URL im Stripe Dashboard stimmt mit deployed Function URL überein, 2) STRIPE_WEBHOOK_SECRET korrekt, 3) Stripe Webhook aktiv (nicht deaktiviert)',
        });
      }

      // Checkout mit Fehler
      const failedCheckouts = checkoutLogs.filter(l => l.status === 'error');
      if (failedCheckouts.length > 0) {
        issues.push({
          severity: 'HIGH',
          code: 'CHECKOUT_WEBHOOK_ERROR',
          message: `${failedCheckouts.length} checkout.session.completed mit status=error`,
          details: failedCheckouts.slice(0, 3).map(l => ({ id: l.stripe_event_id, error: l.error_message, date: l.created_date })),
          hint: 'Webhook Funktion hat einen Fehler geworfen — Stripe retried bis zu 3 Tage',
        });
      }

      // Checkout ignored (z.B. Agency-Block, kein org_id in metadata)
      const ignoredCheckouts = checkoutLogs.filter(l => l.status === 'ignored');
      if (ignoredCheckouts.length > 0) {
        issues.push({
          severity: 'HIGH',
          code: 'CHECKOUT_WEBHOOK_IGNORED',
          message: `${ignoredCheckouts.length} checkout.session.completed mit status=ignored`,
          details: ignoredCheckouts.slice(0, 3).map(l => ({ id: l.stripe_event_id, error: l.error_message, date: l.created_date })),
          hint: 'Checkout hatte kein organization_id in metadata ODER Agency-Block aktiv',
        });
      }

      // Stripe hat Sub, DB nicht
      if (report.stripe_subscriptions.length > 0 && subs.length === 0) {
        issues.push({
          severity: 'HIGH',
          code: 'STRIPE_SUB_NOT_IN_DB',
          message: 'Stripe hat Subscription, aber keine Subscription Entity in DB',
          hint: 'upsertSubscription wurde nicht aufgerufen — Webhook-Fehler oder Subscription-Fetch fehlgeschlagen',
        });
      }

      // trial_stage/billing_status Mismatch
      if (org.trial_stage === 'free_preview' && ['active', 'trialing'].includes(org.billing_status)) {
        issues.push({
          severity: 'HIGH',
          code: 'STAGE_STATUS_MISMATCH',
          message: `trial_stage="${org.trial_stage}" aber billing_status="${org.billing_status}" — Webhook hat Org nicht korrekt aktualisiert`,
          hint: 'repairTrialStage aufrufen oder manuell korrigieren',
        });
      }

      // Stripe Sub active/trialing aber org.billing_status = preview
      const activeStripeSub = report.stripe_subscriptions.find(s => ['active', 'trialing'].includes(s.status));
      if (activeStripeSub && org.billing_status === 'preview') {
        issues.push({
          severity: 'CRITICAL',
          code: 'STRIPE_ACTIVE_ORG_PREVIEW',
          message: `Stripe Subscription ist "${activeStripeSub.status}" aber org.billing_status = "preview" — Webhook hat DB NICHT aktualisiert`,
          hint: 'Webhook kam entweder nicht an ODER hat keine organization_id in Session-Metadata gefunden',
          stripe_sub_id: activeStripeSub.id,
        });
      }

      // plan_id in DB ≠ Plan in Stripe Subscription
      if (activeStripeSub && plan) {
        const stripePriceId = activeStripeSub.price_id;
        if (stripePriceId && plan.stripe_price_id && stripePriceId !== plan.stripe_price_id) {
          issues.push({
            severity: 'MEDIUM',
            code: 'PLAN_PRICE_MISMATCH',
            message: `DB plan.stripe_price_id="${plan.stripe_price_id}" aber Stripe Sub price_id="${stripePriceId}"`,
            hint: 'Plan wurde nicht korrekt zugeordnet — plan_id in Checkout-Metadata fehlt oder falsch',
          });
        }
      }

      // User ist kein Owner und kein Admin
      if (report.user_context.warning) {
        issues.push({
          severity: 'HIGH',
          code: 'USER_NOT_ORG_OWNER',
          message: report.user_context.warning,
          hint: 'Checkout läuft unter einem User ohne manage_billing Berechtigung. checkAccess in createCheckoutSession erlaubt nur organization_admin oder owner.',
        });
      }

      // Kein stripe_customer_id aber Stripe hat Customer
      if (!org.stripe_customer_id && report.stripe_customer === null) {
        issues.push({
          severity: 'MEDIUM',
          code: 'NO_STRIPE_CUSTOMER_ID',
          message: 'org.stripe_customer_id ist leer — Customer wurde nicht in DB gespeichert',
          hint: 'createCheckoutSession hat keinen neuen Customer angelegt oder update fehlgeschlagen',
        });
      }
    }

    report.issues = issues;
    report.issues_count = issues.length;
    report.summary = issues.length === 0
      ? '✅ Keine kritischen Probleme erkannt'
      : `🚨 ${issues.length} Problem(e) gefunden — siehe issues[]`;

    // ── 11. Kurzfassung für schnelle Auswertung ───────────────────────────────
    const latestCheckoutSess = report.stripe_checkout_sessions[0] || null;
    const activeStripeSub2 = report.stripe_subscriptions.find(s => ['active', 'trialing'].includes(s.status));
    report.quick_summary = {
      checkout_session_id: latestCheckoutSess?.id || 'nicht gefunden',
      checkout_status: latestCheckoutSess?.status || 'n/a',
      payment_status: latestCheckoutSess?.payment_status || 'n/a',
      stripe_customer_id: org?.stripe_customer_id || 'FEHLT',
      stripe_subscription_id: activeStripeSub2?.id || 'nicht gefunden',
      stripe_subscription_status: activeStripeSub2?.status || 'n/a',
      price_id: activeStripeSub2?.price_id || 'n/a',
      metadata_org_id: latestCheckoutSess?.metadata?.organization_id || 'FEHLT',
      metadata_plan_id: latestCheckoutSess?.metadata?.plan_id || 'FEHLT',
      metadata_plan_name: latestCheckoutSess?.metadata?.plan_name || 'FEHLT',
      metadata_initiated_by: latestCheckoutSess?.metadata?.initiated_by_user || 'FEHLT',
      metadata_app_env: latestCheckoutSess?.metadata?.app_environment || 'FEHLT',
      webhook_received: billingLogs.filter(l => l.event_type === 'checkout.session.completed').length > 0,
      billing_event_log_ids: sortedLogs.filter(l => l.event_type === 'checkout.session.completed').map(l => l.stripe_event_id).slice(0, 3),
      org_update_success: org ? (org.billing_status !== 'preview' || false) : false,
      final_billing_status: org?.billing_status || 'n/a',
      final_trial_stage: org?.trial_stage || 'n/a',
      final_plan_id: org?.plan_id || 'n/a',
      subscription_entity_created: subs.length > 0,
    };

    console.info(`[diagnoseCheckoutIssue] Diagnose für org=${org?.id} user=${targetEmail} issues=${issues.length} by=${user.email}`);
    return Response.json(report);

  } catch (error) {
    console.error('[diagnoseCheckoutIssue] Error:', error.message, error.stack);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});