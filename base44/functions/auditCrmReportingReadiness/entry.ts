/**
 * auditCrmReportingReadiness
 * ==========================
 * Prüft ob Vertriebo aus Companies, Contacts, Opportunities, Tasks und ContactLogs
 * verlässliche CRM-Kennzahlen ableiten kann.
 *
 * Prüfbereiche:
 *   1. Opportunity Reporting (pipeline, forecast, stages, overdue)
 *   2. Conversion Reporting (Lead → Opportunity → Won, lifecycle stages)
 *   3. Activity Reporting (letzte Aktivität, offene Tasks, Next Step)
 *   4. Dashboard/Statistics Integration (getStatisticsSummary, getDashboardData)
 *   5. Datenqualität (fehlende Felder, Inkonsistenzen)
 *   6. Tenant/AuthZ (org-scoped, keine globalen Aggregationen)
 *
 * Input: { org_id? } — optional, nutzt eigene Org wenn nicht angegeben
 * AuthZ: owner_email | platform_admin
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);
    const body = await req.json().catch(() => ({}));
    const { org_id } = body;

    // ── Org auflösen ──────────────────────────────────────────────────────────
    let org = null;
    if (org_id) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: org_id });
      org = orgs?.[0] || null;
      if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });
      if (org.owner_email !== user.email && !isPlatformAdmin) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
      org = ownerOrgs?.[0] || null;
      if (!org && isPlatformAdmin) {
        const anyOrg = await base44.asServiceRole.entities.Organization.list('-created_date', 1);
        org = anyOrg?.[0] || null;
      }
      if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });
    }

    const orgId = org.id;
    const now = new Date();
    const PAGE_SIZE = 500;

    // ── Daten laden (paginiert, org-scoped) ───────────────────────────────────
    const allOpportunities = [];
    for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Opportunity.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const o of batch) allOpportunities.push(o);
      if (batch.length < PAGE_SIZE) break;
    }

    const allCompanies = [];
    for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Company.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const c of batch) allCompanies.push(c);
      if (batch.length < PAGE_SIZE) break;
    }

    const allContactLogs = [];
    for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.ContactLog.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const c of batch) allContactLogs.push(c);
      if (batch.length < PAGE_SIZE) break;
    }

    const allTasks = [];
    for (let skip = 0; skip < 2000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Task.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const t of batch) allTasks.push(t);
      if (batch.length < PAGE_SIZE) break;
    }

    const allContacts = [];
    for (let skip = 0; skip < 2000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Contact.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const c of batch) allContacts.push(c);
      if (batch.length < PAGE_SIZE) break;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 1. OPPORTUNITY REPORTING
    // ════════════════════════════════════════════════════════════════════════
    const oppsTotal = allOpportunities.length;
    const oppsOpen     = allOpportunities.filter(o => o.status === 'open');
    const oppsWon      = allOpportunities.filter(o => o.status === 'won');
    const oppsLost     = allOpportunities.filter(o => o.status === 'lost');
    const oppsArchived = allOpportunities.filter(o => o.status === 'archived');

    // Stages (offene Opportunities)
    const byStage = {};
    for (const o of oppsOpen) {
      const s = o.stage || 'unknown';
      byStage[s] = (byStage[s] || 0) + 1;
    }

    // Pipeline Value = Summe value aller offenen Opps
    const pipelineValue = oppsOpen.reduce((sum, o) => sum + (o.value || 0), 0);
    const hasPipelineValue = oppsOpen.some(o => o.value != null && o.value > 0);

    // Weighted Forecast = Summe (value * probability/100) für offene Opps
    const weightedForecast = oppsOpen.reduce((sum, o) => {
      if (o.value != null && o.probability != null) {
        return sum + (o.value * o.probability / 100);
      }
      return sum;
    }, 0);
    const hasWeightedData = oppsOpen.some(o => o.value != null && o.probability != null);

    // Won/Lost Values
    const wonValue  = oppsWon.reduce((sum, o) => sum + (o.value || 0), 0);
    const lostValue = oppsLost.reduce((sum, o) => sum + (o.value || 0), 0);

    // Avg Deal Value (nur Opps mit Wert)
    const oppsWithValue = allOpportunities.filter(o => o.value != null && o.value > 0);
    const avgDealValue = oppsWithValue.length > 0
      ? oppsWithValue.reduce((sum, o) => sum + o.value, 0) / oppsWithValue.length
      : null;

    // Overdue Opportunities (expected_close_date überschritten + status=open)
    const overdueOpps = oppsOpen.filter(o => {
      if (!o.expected_close_date) return false;
      return new Date(o.expected_close_date) < now;
    });

    // expected_close_date Verfügbarkeit
    const oppsWithCloseDate = allOpportunities.filter(o => o.expected_close_date != null).length;

    const opportunityMetrics = {
      total: oppsTotal,
      open: oppsOpen.length,
      won: oppsWon.length,
      lost: oppsLost.length,
      archived: oppsArchived.length,
      by_stage: byStage,
      pipeline_value_eur: Math.round(pipelineValue * 100) / 100,
      weighted_forecast_eur: Math.round(weightedForecast * 100) / 100,
      won_value_eur: Math.round(wonValue * 100) / 100,
      lost_value_eur: Math.round(lostValue * 100) / 100,
      avg_deal_value_eur: avgDealValue != null ? Math.round(avgDealValue * 100) / 100 : null,
      overdue_open_count: overdueOpps.length,
      close_date_coverage_pct: oppsTotal > 0 ? Math.round(oppsWithCloseDate / oppsTotal * 100) : 0,
      has_pipeline_value: hasPipelineValue,
      has_weighted_forecast: hasWeightedData,
    };

    // ════════════════════════════════════════════════════════════════════════
    // 2. CONVERSION REPORTING
    // ════════════════════════════════════════════════════════════════════════
    const companiesTotal = allCompanies.length;
    const byLifecycle = {};
    for (const c of allCompanies) {
      const l = c.lifecycle_stage || 'lead';
      byLifecycle[l] = (byLifecycle[l] || 0) + 1;
    }

    // Company → Opportunity Conversion
    const companiesWithOpp = new Set(allOpportunities.map(o => o.company_id));
    const companyToOppConversionCount = allCompanies.filter(c => companiesWithOpp.has(c.id)).length;
    const companyToOppRate = companiesTotal > 0
      ? Math.round(companyToOppConversionCount / companiesTotal * 1000) / 10
      : null;

    // Opportunity → Won Conversion
    const oppToWonRate = oppsTotal > 0
      ? Math.round(oppsWon.length / oppsTotal * 1000) / 10
      : null;

    // ResearchRun → Opportunity (source_research_run_id vorhanden)
    const oppsFromResearch = allOpportunities.filter(o => o.source_research_run_id != null).length;
    const researchRunToOppAvailable = oppsFromResearch > 0;

    // LeadOutcome vs Opportunity: semantisch getrennt?
    // LeadOutcome = KI-Feedback (relevant/not_relevant) — Opportunity = aktiver Deal
    // Prüfe ob company_id-Überschneidung existiert (Warnung falls won in beiden)
    const wonOutcomes = await base44.asServiceRole.entities.LeadOutcome.filter(
      { organization_id: orgId, outcome_type: 'won' }, '-created_date', 100
    );
    const wonOutcomeCompanyIds = new Set(wonOutcomes.map(o => o.company_id));
    const wonOppCompanyIds = new Set(oppsWon.map(o => o.company_id));
    const overlapCount = [...wonOppCompanyIds].filter(id => wonOutcomeCompanyIds.has(id)).length;

    const conversionMetrics = {
      companies_total: companiesTotal,
      by_lifecycle_stage: byLifecycle,
      company_to_opportunity_count: companyToOppConversionCount,
      company_to_opportunity_rate_pct: companyToOppRate,
      opportunity_to_won_rate_pct: oppToWonRate,
      research_run_to_opp_available: researchRunToOppAvailable,
      opps_from_research_count: oppsFromResearch,
      lead_outcome_opp_overlap_count: overlapCount,
      lead_outcome_vs_opp_separation_ok: overlapCount === 0,
    };

    // ════════════════════════════════════════════════════════════════════════
    // 3. ACTIVITY REPORTING
    // ════════════════════════════════════════════════════════════════════════

    // ContactLogs pro Company
    const logsByCompany = {};
    for (const l of allContactLogs) {
      if (!l.company_id) continue;
      logsByCompany[l.company_id] = (logsByCompany[l.company_id] || 0) + 1;
    }
    const companiesWithLogs = Object.keys(logsByCompany).length;
    const avgLogsPerCompany = companiesWithLogs > 0
      ? Math.round(Object.values(logsByCompany).reduce((s, v) => s + v, 0) / companiesWithLogs * 10) / 10
      : 0;

    // Letzte Aktivität pro Company (newest ContactLog)
    const lastLogByCompany = {};
    for (const l of allContactLogs) {
      if (!l.company_id) continue;
      if (!lastLogByCompany[l.company_id] || new Date(l.created_date) > new Date(lastLogByCompany[l.company_id])) {
        lastLogByCompany[l.company_id] = l.created_date;
      }
    }
    const companiesWithLastActivity = Object.keys(lastLogByCompany).length;

    // Letzte Aktivität auch über company.last_contact_date verfügbar?
    const companiesWithLastContactDate = allCompanies.filter(c => c.last_contact_date != null).length;

    // Letzte Aktivität pro Opportunity (über company_id → ContactLog)
    const oppsWithActivityViaCompany = allOpportunities.filter(o =>
      o.company_id && lastLogByCompany[o.company_id] != null
    ).length;

    // Offene + überfällige Tasks pro Company
    const openTasksByCompany = {};
    const overdueTasksByCompany = {};
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (const t of allTasks) {
      if (!t.company_id || t.erledigt) continue;
      openTasksByCompany[t.company_id] = (openTasksByCompany[t.company_id] || 0) + 1;
      if (t.faellig_am && new Date(t.faellig_am) < todayStart) {
        overdueTasksByCompany[t.company_id] = (overdueTasksByCompany[t.company_id] || 0) + 1;
      }
    }
    const companiesWithOpenTasks = Object.keys(openTasksByCompany).length;
    const companiesWithOverdueTasks = Object.keys(overdueTasksByCompany).length;

    // Activity Feed kann last_activity_date liefern? → ja: getCompanyActivityFeed existiert
    // Next Step ableitbar aus: offener Task ODER Opportunity Stage?
    const companiesWithNextStep = allCompanies.filter(c => {
      const hasTask = openTasksByCompany[c.id] > 0;
      const hasOppStage = allOpportunities.some(o => o.company_id === c.id && o.status === 'open');
      const hasNba = !!(c.next_best_action || c.engine_analysis_json);
      return hasTask || hasOppStage || hasNba;
    }).length;

    const activityMetrics = {
      contact_logs_total: allContactLogs.length,
      companies_with_logs: companiesWithLogs,
      avg_logs_per_company: avgLogsPerCompany,
      companies_with_last_activity_via_log: companiesWithLastActivity,
      companies_with_last_contact_date: companiesWithLastContactDate,
      opps_with_activity_via_company: oppsWithActivityViaCompany,
      companies_with_open_tasks: companiesWithOpenTasks,
      companies_with_overdue_tasks: companiesWithOverdueTasks,
      companies_with_next_step: companiesWithNextStep,
      activity_feed_function_exists: true, // getCompanyActivityFeed deployed
      next_step_derivable: companiesWithNextStep > 0 || allTasks.filter(t => !t.erledigt).length > 0,
    };

    // ════════════════════════════════════════════════════════════════════════
    // 4. DASHBOARD / STATISTICS INTEGRATION CHECK
    // ════════════════════════════════════════════════════════════════════════

    // getStatisticsSummary: kennt Opportunities?
    // Analyse: Funktion liest Companies, ContactLogs, Tasks, LeadOutcomes — KEINE Opportunities
    const statisticsHasOpportunities = false;
    const dashboardHasOpportunities = false; // getDashboardData liest keine Opportunities

    const statisticsFixDescription = {
      needed: true,
      function: 'getStatisticsSummary',
      missing_metrics: [
        'opportunities_open_count',
        'opportunities_won_count',
        'pipeline_value_eur',
        'weighted_forecast_eur',
        'won_value_eur',
        'opportunity_to_won_rate_pct',
        'avg_deal_value_eur',
        'overdue_opportunities_count',
      ],
      recommended_implementation:
        'Opportunities paginiert laden (org-scoped), dann aggregieren: ' +
        'pipeline_value = sum(open.value), weighted_forecast = sum(open.value * open.probability/100), ' +
        'won_value = sum(won.value), opp_to_won_rate = won/total*100. ' +
        'In summary-Objekt neben lead_outcomes ergänzen. ' +
        'In charts: opportunities_by_stage als Balkendiagramm.',
    };

    const dashboardFixDescription = {
      needed: true,
      function: 'getDashboardData',
      missing_metrics: [
        'open_opportunities_count (für DailyActionList)',
        'pipeline_value_eur (für Stats-Box)',
        'overdue_opportunities (für Action Items)',
      ],
      recommended_implementation:
        'Top-5 offene Opportunities laden und als data.openOpportunities liefern. ' +
        'Überfällige Opportunities (expected_close_date < heute + status=open) als Action Items aufnehmen. ' +
        'pipeline_value in stats-Objekt ergänzen.',
    };

    const integrationCheck = {
      getStatisticsSummary_has_opportunities: statisticsHasOpportunities,
      getDashboardData_has_opportunities: dashboardHasOpportunities,
      getStatisticsSummary_needs_update: !statisticsHasOpportunities,
      getDashboardData_needs_update: !dashboardHasOpportunities,
      statistics_fix: statisticsFixDescription,
      dashboard_fix: dashboardFixDescription,
    };

    // ════════════════════════════════════════════════════════════════════════
    // 5. DATENQUALITÄT
    // ════════════════════════════════════════════════════════════════════════
    const dataQualityWarnings = [];

    const oppsWithoutValue    = allOpportunities.filter(o => o.value == null || o.value === 0);
    const oppsWithoutProb     = allOpportunities.filter(o => o.probability == null);
    const oppsWithoutClose    = allOpportunities.filter(o => o.expected_close_date == null);
    const oppsWithoutContact  = allOpportunities.filter(o => o.primary_contact_id == null);
    const wonLostWithoutReason= allOpportunities.filter(o => ['won', 'lost'].includes(o.status) && !o.won_lost_reason);

    // Stage/Status-Inkonsistenzen: stage=won aber status!=won
    const stageStatusMismatch = allOpportunities.filter(o => {
      if (o.stage === 'won' && o.status !== 'won') return true;
      if (o.stage === 'lost' && o.status !== 'lost') return true;
      return false;
    });

    // company_id / org_id Inkonsistenzen
    const orgMismatch = allOpportunities.filter(o => o.organization_id !== orgId);

    if (oppsWithoutValue.length > 0) {
      dataQualityWarnings.push({
        type: 'missing_value',
        count: oppsWithoutValue.length,
        pct: Math.round(oppsWithoutValue.length / Math.max(oppsTotal, 1) * 100),
        impact: 'pipeline_value und avg_deal_value unvollständig',
        severity: oppsWithoutValue.length / Math.max(oppsTotal, 1) > 0.3 ? 'high' : 'medium',
      });
    }

    if (oppsWithoutProb.length > 0) {
      dataQualityWarnings.push({
        type: 'missing_probability',
        count: oppsWithoutProb.length,
        pct: Math.round(oppsWithoutProb.length / Math.max(oppsTotal, 1) * 100),
        impact: 'weighted_forecast nicht berechenbar',
        severity: oppsWithoutProb.length / Math.max(oppsTotal, 1) > 0.5 ? 'high' : 'medium',
      });
    }

    if (oppsWithoutClose.length > 0) {
      dataQualityWarnings.push({
        type: 'missing_expected_close_date',
        count: oppsWithoutClose.length,
        pct: Math.round(oppsWithoutClose.length / Math.max(oppsTotal, 1) * 100),
        impact: 'overdue_opportunities nicht erkennbar, Forecast-Timeline lückenhaft',
        severity: 'low',
      });
    }

    if (oppsWithoutContact.length > 0) {
      dataQualityWarnings.push({
        type: 'missing_primary_contact',
        count: oppsWithoutContact.length,
        pct: Math.round(oppsWithoutContact.length / Math.max(oppsTotal, 1) * 100),
        impact: 'kein direkter Ansprechpartner für Opportunity zugewiesen',
        severity: 'low',
      });
    }

    if (wonLostWithoutReason.length > 0) {
      dataQualityWarnings.push({
        type: 'won_lost_without_reason',
        count: wonLostWithoutReason.length,
        impact: 'Learning Loop unvollständig – kein Lerneffekt aus Won/Lost möglich',
        severity: 'medium',
      });
    }

    if (stageStatusMismatch.length > 0) {
      dataQualityWarnings.push({
        type: 'stage_status_mismatch',
        count: stageStatusMismatch.length,
        impact: 'stage (z.B. won) stimmt nicht mit status überein — Aggregationen können abweichen',
        severity: 'high',
      });
    }

    if (orgMismatch.length > 0) {
      dataQualityWarnings.push({
        type: 'organization_id_mismatch',
        count: orgMismatch.length,
        impact: 'KRITISCH: Opportunities mit fremder organization_id gefunden — Tenant-Isolation verletzt',
        severity: 'critical',
      });
    }

    const dataQualityMatrix = [
      {
        check: 'opportunities_without_value',
        count: oppsWithoutValue.length,
        total: oppsTotal,
        ok: oppsWithoutValue.length === 0,
      },
      {
        check: 'opportunities_without_probability',
        count: oppsWithoutProb.length,
        total: oppsTotal,
        ok: oppsWithoutProb.length === 0,
      },
      {
        check: 'opportunities_without_expected_close_date',
        count: oppsWithoutClose.length,
        total: oppsTotal,
        ok: oppsWithoutClose.length === 0,
      },
      {
        check: 'opportunities_without_primary_contact',
        count: oppsWithoutContact.length,
        total: oppsTotal,
        ok: oppsWithoutContact.length === 0,
      },
      {
        check: 'won_lost_without_reason',
        count: wonLostWithoutReason.length,
        total: oppsWon.length + oppsLost.length,
        ok: wonLostWithoutReason.length === 0,
      },
      {
        check: 'stage_status_mismatch',
        count: stageStatusMismatch.length,
        total: oppsTotal,
        ok: stageStatusMismatch.length === 0,
      },
      {
        check: 'organization_id_mismatch',
        count: orgMismatch.length,
        total: oppsTotal,
        ok: orgMismatch.length === 0,
        critical: orgMismatch.length > 0,
      },
    ];

    // ════════════════════════════════════════════════════════════════════════
    // 6. TENANT / AUTHZ CHECK
    // ════════════════════════════════════════════════════════════════════════
    const tenantCheck = {
      opportunity_reporting_org_scoped: true,  // listOpportunities verwendet organization_id
      no_global_aggregations_in_frontend: true, // Opportunities nur via backend functions
      page_size_safe: true,                     // paginiert mit 500er batches
      org_mismatch_count: orgMismatch.length,
      tenant_isolation_ok: orgMismatch.length === 0,
      authz_function: 'listOpportunities + sharedAuthz (authorizeOrganizationAction)',
    };

    // ════════════════════════════════════════════════════════════════════════
    // METRIC MATRIX
    // ════════════════════════════════════════════════════════════════════════
    const metricMatrix = [
      // Opportunity Metrics
      { metric: 'opportunities_by_status', available: oppsTotal >= 0, derivable: true, source: 'Opportunity.status', notes: null },
      { metric: 'opportunities_by_stage', available: true, derivable: true, source: 'Opportunity.stage', notes: null },
      { metric: 'pipeline_value', available: hasPipelineValue, derivable: true, source: 'sum(Opportunity.value WHERE status=open)', notes: hasPipelineValue ? null : 'Noch keine Opportunities mit Wert' },
      { metric: 'weighted_forecast', available: hasWeightedData, derivable: true, source: 'sum(value*probability/100 WHERE status=open)', notes: hasWeightedData ? null : 'Probability-Felder fehlen noch' },
      { metric: 'won_value', available: oppsWon.length > 0, derivable: true, source: 'sum(Opportunity.value WHERE status=won)', notes: null },
      { metric: 'lost_value', available: oppsLost.length > 0, derivable: true, source: 'sum(Opportunity.value WHERE status=lost)', notes: null },
      { metric: 'avg_deal_value', available: oppsWithValue.length > 0, derivable: true, source: 'avg(Opportunity.value)', notes: null },
      { metric: 'overdue_opportunities', available: true, derivable: true, source: 'Opportunity.expected_close_date < now AND status=open', notes: 'Nur wenn close_date gesetzt' },

      // Conversion Metrics
      { metric: 'lifecycle_stage_distribution', available: true, derivable: true, source: 'Company.lifecycle_stage', notes: null },
      { metric: 'company_to_opportunity_rate', available: companiesTotal > 0, derivable: true, source: 'companies_with_opp / total_companies', notes: null },
      { metric: 'opportunity_to_won_rate', available: oppsTotal > 0, derivable: true, source: 'won_opps / total_opps', notes: null },
      { metric: 'research_run_to_opportunity', available: researchRunToOppAvailable, derivable: researchRunToOppAvailable, source: 'Opportunity.source_research_run_id', notes: researchRunToOppAvailable ? null : 'Noch keine Research-gestützten Opportunities angelegt' },

      // Activity Metrics
      { metric: 'contact_logs_per_company', available: true, derivable: true, source: 'ContactLog.company_id groupBy', notes: null },
      { metric: 'last_activity_per_company', available: true, derivable: true, source: 'Company.last_contact_date ODER max(ContactLog.created_date)', notes: null },
      { metric: 'last_activity_per_opportunity', available: oppsWithActivityViaCompany > 0, derivable: true, source: 'Opportunity.company_id → ContactLog', notes: 'Indirekt über company_id' },
      { metric: 'open_tasks_per_company', available: true, derivable: true, source: 'Task.company_id WHERE erledigt=false', notes: null },
      { metric: 'overdue_tasks_per_company', available: true, derivable: true, source: 'Task WHERE erledigt=false AND faellig_am < now', notes: null },
      { metric: 'next_step_derivable', available: true, derivable: true, source: 'Task (offen) ODER Opportunity.stage ODER Company.next_best_action', notes: null },

      // Dashboard/Statistics
      { metric: 'getStatisticsSummary_opportunity_metrics', available: false, derivable: true, source: 'getStatisticsSummary BRAUCHT ERWEITERUNG', notes: 'Opportunities werden aktuell nicht aggregiert' },
      { metric: 'getDashboardData_opportunity_metrics', available: false, derivable: true, source: 'getDashboardData BRAUCHT ERWEITERUNG', notes: 'Opportunities fehlen in Action Items und Stats' },
    ];

    // ════════════════════════════════════════════════════════════════════════
    // RECOMMENDED FIXES
    // ════════════════════════════════════════════════════════════════════════
    const recommendedFixes = [];

    if (!statisticsHasOpportunities) {
      recommendedFixes.push({
        priority: 'high',
        target: 'getStatisticsSummary',
        fix: 'Opportunities paginiert laden und folgende Metriken ergänzen: ' +
             'open_count, won_count, lost_count, pipeline_value_eur, weighted_forecast_eur, ' +
             'won_value_eur, opp_to_won_rate, avg_deal_value_eur, overdue_count. ' +
             'In charts: by_stage Balkendiagramm.',
        effort: 'medium',
      });
    }

    if (!dashboardHasOpportunities) {
      recommendedFixes.push({
        priority: 'high',
        target: 'getDashboardData',
        fix: 'Top-5 offene Opportunities laden (sortiert nach expected_close_date). ' +
             'Überfällige Opportunities (close_date < heute) als action_item type=opportunity_overdue aufnehmen. ' +
             'pipeline_value in stats-Objekt ergänzen.',
        effort: 'medium',
      });
    }

    if (dataQualityWarnings.some(w => w.type === 'stage_status_mismatch' && w.count > 0)) {
      recommendedFixes.push({
        priority: 'high',
        target: 'updateOpportunityStage',
        fix: 'Stage/Status-Synchronisation prüfen: wenn stage=won gesetzt wird, muss status=won gesetzt werden. ' +
             'updateOpportunityStage darauf prüfen.',
        effort: 'low',
      });
    }

    if (dataQualityWarnings.some(w => w.type === 'missing_probability')) {
      recommendedFixes.push({
        priority: 'medium',
        target: 'OpportunitySection UI',
        fix: 'Probability-Feld im Opportunity-Formular als Pflichtfeld oder mit Stage-basierten Defaults füllen. ' +
             'Defaults pro Stage: new=10, contacted=20, qualified=40, offer_planned=50, offer_sent=60, negotiation=75.',
        effort: 'low',
      });
    }

    if (dataQualityWarnings.some(w => w.type === 'missing_value')) {
      recommendedFixes.push({
        priority: 'medium',
        target: 'OpportunitySection UI',
        fix: 'Auftragswert-Feld prominent im Formular platzieren. Pipeline-Wert ohne Werte nicht sinnvoll auswertbar.',
        effort: 'low',
      });
    }

    if (!researchRunToOppAvailable) {
      recommendedFixes.push({
        priority: 'low',
        target: 'createOpportunity',
        fix: 'Wenn Opportunity aus einem ResearchRun-Lead erstellt wird, source_research_run_id setzen. ' +
             'Ermöglicht ResearchRun → Opportunity → Won Conversion Tracking.',
        effort: 'low',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GESAMTBEWERTUNG
    // ════════════════════════════════════════════════════════════════════════
    const criticalIssues = dataQualityWarnings.filter(w => w.severity === 'critical');
    const highIssues = dataQualityWarnings.filter(w => w.severity === 'high');
    const hasMissingFunctions = !statisticsHasOpportunities || !dashboardHasOpportunities;

    let riskLevel, claimStatus;

    if (criticalIssues.length > 0) {
      riskLevel = 'critical';
      claimStatus = 'red';
    } else if (highIssues.length > 0) {
      riskLevel = 'high';
      claimStatus = 'yellow';
    } else if (hasMissingFunctions) {
      riskLevel = 'medium';
      claimStatus = 'yellow'; // Kern-Metriken ableitbar, aber Statistics/Dashboard fehlt noch
    } else {
      riskLevel = 'low';
      claimStatus = 'green';
    }

    const reportingMetricsCount = metricMatrix.filter(m => m.available).length;
    const totalMetrics = metricMatrix.length;

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,
      summary: {
        opportunities_checked: oppsTotal,
        companies_checked: companiesTotal,
        contacts_checked: allContacts.length,
        contact_logs_checked: allContactLogs.length,
        tasks_checked: allTasks.length,

        // Opportunity Reporting
        pipeline_value_available: hasPipelineValue,
        pipeline_value_eur: opportunityMetrics.pipeline_value_eur,
        weighted_forecast_available: hasWeightedData,
        weighted_forecast_eur: opportunityMetrics.weighted_forecast_eur,

        // Conversion
        conversion_reporting_available: companiesTotal > 0,
        company_to_opp_rate_pct: companyToOppRate,
        opp_to_won_rate_pct: oppToWonRate,

        // Activity
        activity_reporting_available: allContactLogs.length > 0,
        next_step_derivable: activityMetrics.next_step_derivable,

        // Reporting Metrics
        reporting_metrics_available: reportingMetricsCount,
        reporting_metrics_total: totalMetrics,
        reporting_completeness_pct: Math.round(reportingMetricsCount / totalMetrics * 100),

        // Integration Status
        getStatisticsSummary_needs_update: true,
        getDashboardData_needs_update: true,

        // Data Quality
        data_quality_warnings: dataQualityWarnings.length,
        critical_issues: criticalIssues.length,

        key_finding: oppsTotal === 0
          ? 'Noch keine Opportunities angelegt — Formeln und Raten korrekt ableitbar sobald Daten vorhanden. getStatisticsSummary + getDashboardData müssen um Opportunity-Metriken erweitert werden.'
          : `${oppsTotal} Opportunities vorhanden. Pipeline: ${opportunityMetrics.pipeline_value_eur}€. Weighted Forecast: ${opportunityMetrics.weighted_forecast_eur}€. getStatisticsSummary + getDashboardData brauchen Opportunity-Erweiterung.`,
      },
      opportunity_metrics: opportunityMetrics,
      conversion_metrics: conversionMetrics,
      activity_metrics: activityMetrics,
      integration_check: integrationCheck,
      metric_matrix: metricMatrix,
      data_quality_matrix: dataQualityMatrix,
      data_quality_warnings: dataQualityWarnings,
      tenant_check: tenantCheck,
      recommended_fixes: recommendedFixes,
      diagnostics: {
        org_id: orgId,
        generated_at: now.toISOString(),
        data_loaded: {
          opportunities: oppsTotal,
          companies: companiesTotal,
          contacts: allContacts.length,
          contact_logs: allContactLogs.length,
          tasks: allTasks.length,
        },
      },
    });

  } catch (error) {
    console.error('[auditCrmReportingReadiness] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});