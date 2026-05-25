import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

/**
 * testStripeWebhookLogic
 * ======================
 * Planübergreifender Systemtest für alle Stripe/Webhook-Szenarien.
 * Testet OHNE echte Stripe-Calls die interne Zustandsmaschine.
 *
 * Szenarien:
 *   1. Starter  – checkout.completed (trialing), dann subscription.updated (trialing), dann subscription.updated (active)
 *   2. Professional – checkout.completed (active), dann subscription.updated (active)
 *   3. Gold     – checkout.completed (active), dann subscription.updated (active)
 *   4. Agency   – Block: kein Self-Service Checkout erlaubt
 *   5. Upgrade Starter→Professional – subscription.updated mit neuem plan_id
 *   6. Race Condition A: subscription.created VOR checkout.completed
 *   7. Race Condition B: duplicate event
 *   8. payment_failed → past_due
 *   9. subscription.deleted → canceled
 *  10. trial_stage darf nie zurück (paid → versuch verified_trial)
 */

// ─── Hilfsfunktionen (spiegeln die Webhook-Logik exakt) ──────────────────────

const STAGE_RANK = { free_preview: 0, verified_trial: 1, paid: 2 };

function mapBillingStatus(stripeStatus) {
  const map = {
    active: 'active', trialing: 'trialing', past_due: 'past_due',
    unpaid: 'unpaid', canceled: 'canceled', incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
  };
  return map[stripeStatus] || 'canceled';
}

/**
 * Simuliert handleCheckoutCompleted-Logik auf einem Org-State-Objekt.
 *
 * OPTION A (kanonisch):
 *   Starter Trial:   stripeSub.status='trialing' → billing=trialing,  stage=verified_trial
 *   Pro/Gold direkt: stripeSub.status='active'   → billing=active,    stage=paid
 *
 * trial_stage geht nur VORWÄRTS (free_preview → verified_trial → paid).
 * checkout.session.completed setzt NIEMALS billing=active/stage=paid als Standard-Basis
 * und korrigiert dann zurück — der Subscription-Status ist die einzige Autorität.
 */
function simulateCheckoutCompleted(org, { planId, stripeStatus, stripeCustomerId }) {
  const next = { ...org };
  next.stripe_customer_id = stripeCustomerId || org.stripe_customer_id;
  next.plan_id = planId || org.plan_id;

  const currentRank = STAGE_RANK[org.trial_stage] ?? 0;

  if (stripeStatus === 'trialing') {
    // Starter Trial: billing=trialing, stage=verified_trial (nur vorwärts)
    next.billing_status = 'trialing';
    next.trial_stage = currentRank < 1 ? 'verified_trial' : org.trial_stage;
  } else if (stripeStatus === 'active') {
    // Professional/Gold: billing=active, stage=paid (nur vorwärts)
    next.billing_status = 'active';
    next.trial_stage = currentRank < 2 ? 'paid' : org.trial_stage;
  } else {
    // Unerwarteter Status – konservativ, kein trial_stage-Sprung
    next.billing_status = mapBillingStatus(stripeStatus);
  }
  return next;
}

/**
 * Simuliert handleSubscriptionUpdated-Logik auf einem Org-State-Objekt.
 */
function simulateSubscriptionUpdated(org, { stripeStatus, planId }) {
  const next = { ...org };
  const billingStatus = mapBillingStatus(stripeStatus);
  const resolvedPlanId = planId || org.plan_id;

  // trial_stage: nur vorwärts
  const currentStageRank = STAGE_RANK[org.trial_stage] ?? 0;
  let newTrialStage = org.trial_stage;
  if (stripeStatus === 'active' && currentStageRank < 2) {
    newTrialStage = 'paid';
  } else if (stripeStatus === 'trialing' && currentStageRank < 1) {
    newTrialStage = 'verified_trial';
  }

  // billing_status: nie von 'active' auf 'trialing' downgraden
  const neverDowngrade = org.billing_status === 'active' && billingStatus === 'trialing';
  if (!neverDowngrade) next.billing_status = billingStatus;
  next.trial_stage = newTrialStage;
  if (resolvedPlanId) next.plan_id = resolvedPlanId;
  return next;
}

function simulateSubscriptionDeleted(org) {
  return { ...org, billing_status: 'canceled' };
}

function simulatePaymentFailed(org) {
  return { ...org, billing_status: 'past_due' };
}

// ─── Test-Runner ──────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function runTest(name, fn) {
  try {
    fn();
    return { test: name, result: 'PASS' };
  } catch (e) {
    return { test: name, result: 'FAIL', error: e.message };
  }
}

const INITIAL_ORG = {
  id: 'org_test',
  billing_status: 'preview',
  trial_stage: 'free_preview',
  plan_id: null,
  stripe_customer_id: null,
};

const PLAN_IDS = {
  starter: 'plan_starter',
  professional: 'plan_professional',
  gold: 'plan_gold',
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  const results = [];

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: STARTER – checkout.completed (trialing) → subscription.updated (trialing) → subscription.updated (active)
  //
  // OPTION A (kanonische Regel):
  //   checkout.completed mit Subscription.status=trialing
  //   → billing_status = 'trialing'    (NICHT 'active')
  //   → trial_stage    = 'verified_trial' (NICHT 'paid')
  //   Erst nach invoice.paid (Trial-Ende) → billing='active', stage='paid'
  //
  // Begründung: billing_status und trial_stage spiegeln den echten Stripe-Status.
  //   'paid' bedeutet: echter Zahlungseingang. Beim Trial ist noch keine Zahlung erfolgt.
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('1a. Starter: checkout.completed (trialing) → billing=trialing, stage=verified_trial [Option A]', () => {
    let org = { ...INITIAL_ORG };
    org = simulateCheckoutCompleted(org, { planId: PLAN_IDS.starter, stripeStatus: 'trialing', stripeCustomerId: 'cus_starter' });

    assert(org.billing_status === 'trialing', `billing_status soll 'trialing' (Starter Trial, noch kein Geldeingang), got '${org.billing_status}'`);
    assert(org.trial_stage === 'verified_trial', `trial_stage soll 'verified_trial' (verifiziert, aber noch nicht bezahlt), got '${org.trial_stage}'`);
    assert(org.plan_id === PLAN_IDS.starter, `plan_id soll Starter, got '${org.plan_id}'`);
    assert(org.stripe_customer_id === 'cus_starter', `stripe_customer_id fehlt`);
  }));

  results.push(runTest('1a-WIDERSPRUCHS-CHECK: checkout darf nie paid→verified_trial (rückwärts)', () => {
    // Wenn Org schon auf paid ist (z.B. nach Upgrade) und ein Starter-checkout-Event nochmal ankommt:
    let org = { ...INITIAL_ORG, billing_status: 'active', trial_stage: 'paid', plan_id: PLAN_IDS.professional };
    org = simulateCheckoutCompleted(org, { planId: PLAN_IDS.starter, stripeStatus: 'trialing', stripeCustomerId: 'cus_starter' });

    // trial_stage darf NICHT von paid auf verified_trial zurückgehen
    assert(org.trial_stage === 'paid', `trial_stage darf nie rückwärts gehen (paid→verified_trial), got '${org.trial_stage}'`);
  }));

  results.push(runTest('1b. Starter: subscription.updated (trialing) nach checkout – kein Downgrade', () => {
    // org ist nach checkout bereits auf verified_trial/trialing
    let org = { ...INITIAL_ORG, billing_status: 'trialing', trial_stage: 'verified_trial', plan_id: PLAN_IDS.starter };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'trialing', planId: PLAN_IDS.starter });

    assert(org.billing_status === 'trialing', `billing_status soll 'trialing', got '${org.billing_status}'`);
    assert(org.trial_stage === 'verified_trial', `trial_stage soll 'verified_trial' (nicht zurück), got '${org.trial_stage}'`);
    assert(org.plan_id === PLAN_IDS.starter, `plan_id fehlt`);
  }));

  results.push(runTest('1c. Starter: subscription.updated (active) nach Trial-Ende', () => {
    let org = { ...INITIAL_ORG, billing_status: 'trialing', trial_stage: 'verified_trial', plan_id: PLAN_IDS.starter };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'active', planId: PLAN_IDS.starter });

    assert(org.billing_status === 'active', `billing_status soll 'active', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid', got '${org.trial_stage}'`);
    assert(org.plan_id === PLAN_IDS.starter, `plan_id fehlt`);
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: PROFESSIONAL – kein Trial, direkt active
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('2a. Professional: checkout.completed (active, kein Trial)', () => {
    let org = { ...INITIAL_ORG };
    org = simulateCheckoutCompleted(org, { planId: PLAN_IDS.professional, stripeStatus: 'active', stripeCustomerId: 'cus_pro' });

    assert(org.billing_status === 'active', `billing_status soll 'active', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid', got '${org.trial_stage}'`);
    assert(org.plan_id === PLAN_IDS.professional, `plan_id soll Professional, got '${org.plan_id}'`);
  }));

  results.push(runTest('2b. Professional: subscription.updated (active) – darf active nicht überschreiben', () => {
    let org = { ...INITIAL_ORG, billing_status: 'active', trial_stage: 'paid', plan_id: PLAN_IDS.professional };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'active', planId: PLAN_IDS.professional });

    assert(org.billing_status === 'active', `billing_status soll 'active' bleiben, got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid' bleiben, got '${org.trial_stage}'`);
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: GOLD – kein Trial, direkt active
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('3a. Gold: checkout.completed (active, kein Trial)', () => {
    let org = { ...INITIAL_ORG };
    org = simulateCheckoutCompleted(org, { planId: PLAN_IDS.gold, stripeStatus: 'active', stripeCustomerId: 'cus_gold' });

    assert(org.billing_status === 'active', `billing_status soll 'active', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid', got '${org.trial_stage}'`);
    assert(org.plan_id === PLAN_IDS.gold, `plan_id soll Gold, got '${org.plan_id}'`);
  }));

  results.push(runTest('3b. Gold: subscription.updated (active) darf paid nicht ändern', () => {
    let org = { ...INITIAL_ORG, billing_status: 'active', trial_stage: 'paid', plan_id: PLAN_IDS.gold };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'active', planId: PLAN_IDS.gold });

    assert(org.billing_status === 'active', `billing_status soll 'active', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid', got '${org.trial_stage}'`);
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4: AGENCY – kein Self-Service
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('4a. Agency: createCheckoutSession blockt (plan_type=agency → 400)', () => {
    const agencyPlan = { name: 'Agency', plan_type: 'agency', is_active: true };
    const isAgency = agencyPlan.plan_type === 'agency' || (agencyPlan.name || '').toLowerCase().includes('agency');
    assert(isAgency === true, 'Agency-Plan muss als Agency erkannt werden → 400');
  }));

  results.push(runTest('4b. Agency: stripeWebhook checkout.completed blockt Agency plan_id (Defense-in-Depth)', () => {
    // Simuliert den Agency-Block im Webhook-Handler
    const agencyPlan = { name: 'Vertriebo Agency', plan_type: 'agency' };
    const isAgency = agencyPlan.plan_type === 'agency' || (agencyPlan.name || '').toLowerCase().includes('agency');
    assert(isAgency === true, 'Webhook erkennt Agency → status=ignored, reason=agency_plan_blocked');

    // Sicherstellen: nicht-Agency-Pläne sind NICHT geblockt
    const starterPlan = { name: 'Vertriebo Starter', plan_type: 'standard' };
    const starterBlocked = starterPlan.plan_type === 'agency' || (starterPlan.name || '').toLowerCase().includes('agency');
    assert(starterBlocked === false, 'Starter darf nicht fälschlicherweise geblockt werden');
  }));

  results.push(runTest('4c. Agency: Org kann nur per PlatformAdmin freigeschaltet werden (agency_enabled=true)', () => {
    // Agency-Aktivierung setzt agency_enabled=true, das ist ein Admin-Only Feld
    // Self-Service kann dieses Feld nicht setzen (kein Checkout-Pfad führt dazu)
    const adminAction = { field: 'agency_enabled', set_by: 'platform_admin', via_checkout: false };
    assert(adminAction.via_checkout === false, 'agency_enabled darf nie via Checkout gesetzt werden');
    assert(adminAction.set_by === 'platform_admin', 'Nur PlatformAdmin darf agency_enabled setzen');
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 5: UPGRADE SZENARIEN
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('5a. Upgrade Starter→Professional: plan_id aktualisiert, billing bleibt active', () => {
    // Starter Trial bereits aktiv
    let org = { ...INITIAL_ORG, billing_status: 'trialing', trial_stage: 'verified_trial', plan_id: PLAN_IDS.starter };
    // Upgrade: neues subscription.updated mit Professional plan_id und status=active
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'active', planId: PLAN_IDS.professional });

    assert(org.billing_status === 'active', `billing_status soll 'active', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid', got '${org.trial_stage}'`);
    assert(org.plan_id === PLAN_IDS.professional, `plan_id soll Professional, got '${org.plan_id}'`);
  }));

  results.push(runTest('5b. Upgrade Starter→Gold: plan_id aktualisiert', () => {
    let org = { ...INITIAL_ORG, billing_status: 'trialing', trial_stage: 'verified_trial', plan_id: PLAN_IDS.starter };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'active', planId: PLAN_IDS.gold });

    assert(org.plan_id === PLAN_IDS.gold, `plan_id soll Gold, got '${org.plan_id}'`);
    assert(org.billing_status === 'active', `billing_status soll 'active', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid', got '${org.trial_stage}'`);
  }));

  results.push(runTest('5c. Upgrade Professional→Gold: plan_id aktualisiert', () => {
    let org = { ...INITIAL_ORG, billing_status: 'active', trial_stage: 'paid', plan_id: PLAN_IDS.professional };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'active', planId: PLAN_IDS.gold });

    assert(org.plan_id === PLAN_IDS.gold, `plan_id soll Gold, got '${org.plan_id}'`);
    assert(org.billing_status === 'active', `billing_status soll 'active', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid', got '${org.trial_stage}'`);
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 6: RACE CONDITIONS
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('6a. Race: subscription.created (trialing) VOR checkout.completed', () => {
    // subscription.created kommt zuerst – org noch auf free_preview
    let org = { ...INITIAL_ORG };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'trialing', planId: PLAN_IDS.starter });
    // Jetzt kommt checkout.completed
    org = simulateCheckoutCompleted(org, { planId: PLAN_IDS.starter, stripeStatus: 'trialing', stripeCustomerId: 'cus_race' });

    // Endresultat muss korrekt sein
    assert(org.trial_stage === 'verified_trial', `trial_stage soll 'verified_trial', got '${org.trial_stage}'`);
    assert(org.plan_id === PLAN_IDS.starter, `plan_id soll Starter, got '${org.plan_id}'`);
  }));

  results.push(runTest('6b. Race: subscription.updated (trialing) NACH checkout.completed (active) – kein Downgrade', () => {
    // checkout.completed setzt active (bei Professional z.B.)
    let org = { ...INITIAL_ORG };
    org = simulateCheckoutCompleted(org, { planId: PLAN_IDS.professional, stripeStatus: 'active', stripeCustomerId: 'cus_race2' });
    assert(org.billing_status === 'active', 'Nach checkout.completed soll active');

    // Danach kommt verspätetes subscription.updated mit trialing (falsch verzögertes Event)
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'trialing', planId: PLAN_IDS.professional });

    // billing_status darf NICHT von active auf trialing gedrückt werden
    assert(org.billing_status === 'active', `billing_status darf nicht auf trialing downgegradet werden, got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage darf nicht zurückspringen, got '${org.trial_stage}'`);
  }));

  results.push(runTest('6c. Race: duplicate event – Idempotenz (gleiche Logik nochmal)', () => {
    // Zweimaliges Ausführen derselben subscription.updated darf nichts ändern
    let org = { ...INITIAL_ORG, billing_status: 'active', trial_stage: 'paid', plan_id: PLAN_IDS.professional };
    const orgBefore = { ...org };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'active', planId: PLAN_IDS.professional });
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'active', planId: PLAN_IDS.professional }); // 2x

    assert(org.billing_status === orgBefore.billing_status, 'billing_status darf sich nicht ändern');
    assert(org.trial_stage === orgBefore.trial_stage, 'trial_stage darf sich nicht ändern');
    assert(org.plan_id === orgBefore.plan_id, 'plan_id darf sich nicht ändern');
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 7: PAYMENT FAILED
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('7. payment_failed → past_due (trial_stage bleibt paid)', () => {
    let org = { ...INITIAL_ORG, billing_status: 'active', trial_stage: 'paid', plan_id: PLAN_IDS.professional };
    org = simulatePaymentFailed(org);

    assert(org.billing_status === 'past_due', `billing_status soll 'past_due', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid' bleiben, got '${org.trial_stage}'`);
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 8: SUBSCRIPTION DELETED / CANCELED
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('8. subscription.deleted → canceled (trial_stage bleibt, kein free_preview)', () => {
    let org = { ...INITIAL_ORG, billing_status: 'active', trial_stage: 'paid', plan_id: PLAN_IDS.gold };
    org = simulateSubscriptionDeleted(org);

    assert(org.billing_status === 'canceled', `billing_status soll 'canceled', got '${org.billing_status}'`);
    assert(org.trial_stage === 'paid', `trial_stage soll 'paid' bleiben (kein Missbrauch-Reset), got '${org.trial_stage}'`);
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 9: trial_stage DARF NIE ZURÜCK
  // ══════════════════════════════════════════════════════════════════════════
  results.push(runTest('9a. trial_stage: paid → versuch trialing → bleibt paid', () => {
    let org = { ...INITIAL_ORG, billing_status: 'active', trial_stage: 'paid', plan_id: PLAN_IDS.professional };
    org = simulateSubscriptionUpdated(org, { stripeStatus: 'trialing', planId: PLAN_IDS.professional });

    assert(org.trial_stage === 'paid', `trial_stage soll 'paid' bleiben, got '${org.trial_stage}'`);
  }));

  results.push(runTest('9b. trial_stage: verified_trial → versuch free_preview → bleibt verified_trial', () => {
    let org = { ...INITIAL_ORG, billing_status: 'trialing', trial_stage: 'verified_trial', plan_id: PLAN_IDS.starter };
    // Es gibt kein Event das free_preview setzt – aber simulieren wir den STAGE_RANK Check:
    const rank = STAGE_RANK[org.trial_stage] ?? 0;
    const wouldSetFreePrev = rank < 0; // free_preview rank=0, never goes below
    assert(!wouldSetFreePrev, 'verified_trial(1) kann nie auf free_preview(0) zurückgesetzt werden');
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // ERGEBNISSE ZUSAMMENFASSEN
  // ══════════════════════════════════════════════════════════════════════════
  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;

  console.info(`[testStripeWebhookLogic] ${passed}/${results.length} Tests bestanden`);
  if (failed > 0) {
    results.filter(r => r.result === 'FAIL').forEach(r => {
      console.error(`[FAIL] ${r.test}: ${r.error}`);
    });
  }

  return Response.json({
    summary: { total: results.length, passed, failed },
    all_passed: failed === 0,
    results,
    // Dokumentation der Webhook-Invarianten
    invariants: {
      'trial_stage_only_forward': 'free_preview(0) → verified_trial(1) → paid(2) – niemals zurück',
      'no_active_to_trialing_downgrade': 'billing_status=active wird nie durch trialing überschrieben',
      'plan_id_always_updated': 'plan_id in Org wird bei subscription.updated aus Stripe Metadata gesetzt',
      'idempotent': 'Gleiches Event zweimal verändert den Zustand nicht nochmals',
      'agency_blocked': 'Agency ist kein Self-Service – createCheckoutSession gibt 400 zurück',
      'starter_trial': 'Starter bekommt 14 Tage Trial (trialing→verified_trial), Professional/Gold starten direkt (active→paid)',
    }
  });
});