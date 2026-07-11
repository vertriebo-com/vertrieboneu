import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // ── Access Check ──────────────────────────────────────────────────────
    if (!user || !["admin", "platform_owner", "platform_admin"].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Platform admin access required' }, { status: 403 });
    }

    // ── Load Data via Service Role ────────────────────────────────────────
    const periodMonth = getPeriodMonth();
    const [orgs, plans, usageLogs, researchRuns, supportNotes, auditLogs, platformConfigs, orgSettings, learnedSignals, allCompanies, subscriptions] = await Promise.all([
      base44.asServiceRole.entities.Organization.list(),
      base44.asServiceRole.entities.Plan.list(),
      base44.asServiceRole.entities.UsageLog.filter({ period_month: periodMonth }),
      base44.asServiceRole.entities.ResearchRun.filter({}),
      base44.asServiceRole.entities.SupportNote.filter({}),
      base44.asServiceRole.entities.PlatformAuditLog.filter({}),
      base44.asServiceRole.entities.PlatformConfig.list(),
      base44.asServiceRole.entities.OrganizationSettings.filter({}),
      base44.asServiceRole.entities.OrgLearnedSignals.filter({}),
      base44.asServiceRole.entities.Company.list('-created_date', 5000),
      base44.asServiceRole.entities.Subscription.filter({}),
    ]);

    // ── Build Safe Response ───────────────────────────────────────────────
    const organizations = (orgs || []).map(org => {
      // Enrich org data from OrganizationSettings
      const orgSettingsForThisOrg = (orgSettings || []).filter(s => s.organization_id === org.id);
      
      // Get industry from multiple possible keys
      const industryFromSettings = orgSettingsForThisOrg.find(s => 
        ['own_industry', 'industry_name', 'industry', 'branche'].includes(s.key)
      )?.value;
      const industry = org.industry || industryFromSettings || null;
      
      // Get city/location from multiple possible keys
      const cityFromSettings = orgSettingsForThisOrg.find(s =>
        ['lead_plz_city', 'service_area_city', 'lead_plz', 'city', 'ort'].includes(s.key)
      )?.value;
      const serviceAreaCity = org.service_area_city || cityFromSettings || null;
      
      // Get radius from multiple possible keys
      const radiusFromSettings = orgSettingsForThisOrg.find(s =>
        ['lead_radius_km', 'service_area_radius_km', 'radius_km'].includes(s.key)
      )?.value;
      const serviceAreaRadiusKm = org.service_area_radius_km || (radiusFromSettings ? parseInt(radiusFromSettings) : 25);

      // ── Subscription-Abgleich: echte Daten haben Vorrang vor Organization-Snapshot ──
      const sub = (subscriptions || [])
        .filter(s => s.organization_id === org.id)
        .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date))[0];

      // Billing-Status: Subscription hat Vorrang, dann Organization-Feld
      const billingStatus = sub?.status || org.billing_status || 'preview';
      // Plan: Subscription-plan_id hat Vorrang, dann Organization
      const planId = sub?.plan_id || org.plan_id || null;
      // Stripe-Felder aus Subscription
      const stripeCustomerId = sub?.stripe_customer_id || org.stripe_customer_id || null;
      const stripeSubscriptionId = sub?.stripe_subscription_id || null;
      const currentPeriodEnd = sub?.current_period_end || null;
      const cancelAtPeriodEnd = sub?.cancel_at_period_end || false;
      const trialEnd = sub?.trial_end || org.trial_ends_at || null;

      return {
        id: org.id,
        name: org.name,
        owner_email: org.owner_email,
        organization_type: org.organization_type,
        parent_agency_id: org.parent_agency_id || null,
        platform_status: org.platform_status,
        billing_status: billingStatus,
        plan_id: planId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        trial_end: trialEnd,
        trial_stage: org.trial_stage || 'free_preview',
        trial_leads_granted: org.trial_leads_granted || 0,
        industry,
        service_area_city: serviceAreaCity,
        service_area_radius_km: serviceAreaRadiusKm,
        onboarding_done: org.onboarding_done,
        created_date: org.created_date,
        suspended_reason: org.platform_status === 'suspended' ? org.suspended_reason : null,
        suspended_at: org.platform_status === 'suspended' ? org.suspended_at : null,
        suspended_by: org.platform_status === 'suspended' ? org.suspended_by : null,
        // Aggregated metrics
        leads_count: 0,          // gesamt gespeicherte Leads (alle ResearchRuns)
        monthly_leads_created: 0, // neue Leads diesen Monat (UsageLog)
        research_runs_count: 0,  // Recherche-Läufe diesen Monat
        ai_actions_used: 0,
        manual_emails_logged: 0,
        last_lead_generation_at: null,
        estimated_external_cost_cent: 0,
        learned_categories_count: 0,
      };
    });

    // ── Add aggregated metrics ────────────────────────────────────────────
    for (const org of organizations) {
      // Get usage from current month
      const usage = usageLogs.find(u => u.organization_id === org.id);
      if (usage) {
        // monthly_leads_created = neue Leads diesen Monat (aus UsageLog)
        org.monthly_leads_created = usage.leads_created || 0;
        // leads_count bleibt 0 hier – wird unten durch ResearchRun-Summe aller Zeiten ersetzt
        org.ai_actions_used = usage.ai_actions_used || 0;
        org.manual_emails_logged = usage.manual_emails_logged || 0;
        org.estimated_external_cost_cent = usage.estimated_external_cost_cent || 0;
      }

      const orgResearchRuns = (researchRuns || []).filter(r => r.organization_id === org.id);
      // research_runs_count = nur Läufe diesen Monat
      const monthStart = new Date(periodMonth + '-01T00:00:00Z');
      const orgRunsThisMonth = orgResearchRuns.filter(r => new Date(r.created_date) >= monthStart);
      org.research_runs_count = orgRunsThisMonth.length;
      // leads_count = tatsächlicher Company-Bestand (inkl. manuell, importiert)
      org.leads_count = (allCompanies || []).filter(c => c.organization_id === org.id).length;
      org.last_lead_generation_at = orgResearchRuns.length > 0 
        ? orgResearchRuns.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0].created_date 
        : null;

      // Get learned signals count
      const signals = learnedSignals.find(s => s.organization_id === org.id);
      if (signals) {
        try {
          const cats = JSON.parse(signals.priority_categories || '[]');
          org.learned_categories_count = cats.length;
        } catch (e) {
          org.learned_categories_count = 0;
        }
      }
    }

    // ── Calculate Summary ─────────────────────────────────────────────────
    const summary = {
      organizations_total: organizations.length,
      active_organizations: organizations.filter(o => o.platform_status === 'active').length,
      suspended_organizations: organizations.filter(o => o.platform_status === 'suspended').length,
      onboarding_not_done: organizations.filter(o => !o.onboarding_done).length,
      active_subscriptions: organizations.filter(o => ['active', 'trialing'].includes(o.billing_status)).length,
      past_due: organizations.filter(o => o.billing_status === 'past_due').length,
      unpaid: organizations.filter(o => ['unpaid', 'canceled', 'incomplete_expired'].includes(o.billing_status)).length,
      research_runs_this_month: (researchRuns || []).filter(r => new Date(r.created_date) >= new Date(periodMonth + '-01T00:00:00Z')).length,
      leads_created_this_month: (usageLogs || []).reduce((sum, log) => sum + (log.leads_created || 0), 0),
      ai_actions_this_month: (usageLogs || []).reduce((sum, log) => sum + (log.ai_actions_used || 0), 0),
      manual_emails_this_month: (usageLogs || []).reduce((sum, log) => sum + (log.manual_emails_logged || 0), 0),
      audit_logs_recent: (auditLogs || []).length,
      support_notes_total: (supportNotes || []).length,
    };

    return Response.json({
      success: true,
      organizations,
      summary,
      plans: (plans || []).map(p => ({ id: p.id, name: p.name, type: p.plan_type })),
      supportNotes: (supportNotes || []),
      platform_config: (platformConfigs || [])[0] || null,
    });

  } catch (error) {
    console.error('[getPlatformAdminData] Error:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});

function getPeriodMonth() {
  // KANONISCH: Kalendermonat Europe/Berlin (YYYY-MM) — identisch zu allen anderen Usage-Funktionen
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()).split('.').reverse().join('-');
}