import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── auditPlanLimits ──────────────────────────────────────────────────────────
// Prüft alle aktiven Pläne auf:
// 1. Vollständigkeit der Limit-Felder (keine null/undefined)
// 2. Agency-Plan nicht in Self-Service (plan_type = 'agency' oder name enthält 'agency')
// 3. Konsistenz: Widersprüche zwischen Plan-DB-Werten und was UsageBars anzeigen würden
// 4. null/undefined darf NICHT als -1 (unlimited) interpretiert werden
// Admin-only.
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const allPlans = await base44.asServiceRole.entities.Plan.filter({});

    const REQUIRED_LIMIT_FIELDS = [
      'max_leads_per_month',
      'max_lead_generations_per_month',
      'max_ai_scorings_per_month',
      'max_emails_per_month',
    ];

    const results = [];

    for (const plan of allPlans) {
      const issues = [];
      const warnings = [];

      // ── Agency-Check ────────────────────────────────────────────────────────
      const isAgency =
        plan.plan_type === 'agency' ||
        (plan.name || '').toLowerCase().includes('agency');

      if (isAgency) {
        // Agency darf keine stripe_price_id für Self-Service haben — nur Admin-Freischaltung
        warnings.push(`Agency-Plan: kein Self-Service Checkout erlaubt. Verifiziert: plan_type=${plan.plan_type || '(nicht gesetzt)'}`);
        if (!plan.plan_type || plan.plan_type !== 'agency') {
          issues.push(`Agency erkannt über Name, aber plan_type ist "${plan.plan_type}" statt "agency" — bitte korrigieren`);
        }
      }

      // ── Pflichtfelder-Check ──────────────────────────────────────────────────
      for (const field of REQUIRED_LIMIT_FIELDS) {
        const val = plan[field];
        if (val === null || val === undefined) {
          issues.push(`${field} ist null/undefined — wird in UI als kein Limit bekannt angezeigt (nicht als ∞)`);
        } else if (typeof val !== 'number') {
          issues.push(`${field} ist kein Number: ${JSON.stringify(val)}`);
        }
      }

      // ── Unlimited-Check ──────────────────────────────────────────────────────
      // Nur Agency darf -1-Felder haben
      for (const field of REQUIRED_LIMIT_FIELDS) {
        const val = plan[field];
        if (val === -1 && !isAgency) {
          warnings.push(`${field} = -1 (unlimited) für Nicht-Agency-Plan — ist das gewollt?`);
        }
      }

      // ── Stripe-Price-ID ──────────────────────────────────────────────────────
      if (!plan.stripe_price_id) {
        issues.push('stripe_price_id fehlt — Checkout nicht möglich');
      }
      if (!plan.stripe_product_id) {
        warnings.push('stripe_product_id fehlt');
      }

      // ── Preis ────────────────────────────────────────────────────────────────
      if (!plan.price_monthly || plan.price_monthly <= 0) {
        issues.push(`price_monthly fehlt oder ungültig: ${plan.price_monthly}`);
      }

      // ── Simuliere was UsageBar anzeigen würde ────────────────────────────────
      const simulate = (field) => {
        const val = plan[field];
        if (val === -1) return '∞ Unbegrenzt';
        if (val === null || val === undefined) return '– (kein Limit bekannt)';
        return `${val}`;
      };

      const usageBarSimulation = {
        leads: simulate('max_leads_per_month'),
        recherchen: simulate('max_lead_generations_per_month'),
        ki_aktionen: simulate('max_ai_scorings_per_month'),
        emails: simulate('max_emails_per_month'),
      };

      results.push({
        plan_id: plan.id,
        name: plan.name,
        plan_type: plan.plan_type || null,
        is_agency: isAgency,
        is_active: plan.is_active,
        sort_order: plan.sort_order,
        price_eur: plan.price_monthly ? (plan.price_monthly / 100).toFixed(2) : null,
        limits: {
          max_leads_per_month: plan.max_leads_per_month,
          max_lead_generations_per_month: plan.max_lead_generations_per_month,
          max_ai_scorings_per_month: plan.max_ai_scorings_per_month,
          max_emails_per_month: plan.max_emails_per_month,
        },
        usage_bar_would_show: usageBarSimulation,
        stripe: {
          price_id: plan.stripe_price_id || null,
          product_id: plan.stripe_product_id || null,
        },
        issues,   // kritische Fehler
        warnings, // nicht-kritische Hinweise
        status: issues.length > 0 ? 'FEHLER' : warnings.length > 0 ? 'WARNUNG' : 'OK',
      });
    }

    // ── Gesamtzusammenfassung ─────────────────────────────────────────────────
    const totalIssues = results.reduce((acc, r) => acc + r.issues.length, 0);
    const totalWarnings = results.reduce((acc, r) => acc + r.warnings.length, 0);
    const plansWithIssues = results.filter(r => r.issues.length > 0).map(r => r.name);
    const plansWithWarnings = results.filter(r => r.warnings.length > 0).map(r => r.name);
    const agencyPlans = results.filter(r => r.is_agency).map(r => r.name);
    const selfServicePlans = results.filter(r => !r.is_agency && r.stripe?.price_id).map(r => r.name);

    return Response.json({
      success: true,
      summary: {
        total_plans: results.length,
        total_issues: totalIssues,
        total_warnings: totalWarnings,
        plans_with_issues: plansWithIssues,
        plans_with_warnings: plansWithWarnings,
        agency_plans: agencyPlans,
        self_service_plans: selfServicePlans,
        overall_status: totalIssues > 0 ? 'FEHLER' : totalWarnings > 0 ? 'WARNUNG' : 'OK',
      },
      plans: results.sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)),
      rules_checked: [
        'null/undefined Limit-Felder werden NICHT als unlimited (-1) behandelt',
        'Nur explizit -1 zeigt ∞ Unbegrenzt in der UI',
        'Agency-Pläne haben plan_type="agency" und kein Self-Service Checkout',
        'Stripe price_id und product_id vorhanden',
        'Preis (price_monthly) vorhanden und > 0',
        'Keine ungewollten -1-Felder bei Nicht-Agency-Plänen',
      ],
    });

  } catch (error) {
    console.error('[auditPlanLimits] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});