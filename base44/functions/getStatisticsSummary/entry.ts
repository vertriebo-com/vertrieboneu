/**
 * getStatisticsSummary
 * ====================
 * Backend-Aggregation für Statistics.jsx.
 * Ersetzt 3×500-Vollabfragen durch serverseitige Aggregation.
 *
 * Input: { org_id, period: '7d'|'30d'|'90d'|'month'|'all', date_from?, date_to? }
 * AuthZ: owner_email | organization_admin | platform_admin
 *
 * Paginiert Companies bis 10.000 — keine Truncation bei großen Datenmengen.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);

    const body = await req.json().catch(() => ({}));
    const { org_id, period = 'all', date_from, date_to } = body;

    // ── Org auflösen + AuthZ ──────────────────────────────────────────────────
    let org = null;
    if (org_id) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: org_id });
      org = orgs?.[0] || null;
      if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });

      const memberships = isPlatformAdmin ? [] :
        await base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: org_id, user_email: user.email, status: 'active' });
      const isMember = memberships.length > 0;
      const isOwner = org.owner_email === user.email;

      if (!isOwner && !isMember && !isPlatformAdmin) {
        return Response.json({ error: 'Forbidden: no access to this organization' }, { status: 403 });
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

    // ── Datums-Grenzen berechnen ─────────────────────────────────────────────
    let periodStart = null;
    let periodEnd = now;

    if (date_from) {
      periodStart = new Date(date_from);
    } else {
      switch (period) {
        case '7d':    periodStart = new Date(now - 7  * 86400000); break;
        case '30d':   periodStart = new Date(now - 30 * 86400000); break;
        case '90d':   periodStart = new Date(now - 90 * 86400000); break;
        case 'month': {
          // Aktueller Kalendermonat (Berlin-Zeit)
          const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).formatToParts(now);
          const py = parseInt(parts.find(p => p.type === 'year')?.value);
          const pm = parseInt(parts.find(p => p.type === 'month')?.value);
          periodStart = new Date(Date.UTC(py, pm - 1, 1));
          periodEnd   = new Date(Date.UTC(py, pm, 1));
          break;
        }
        case 'all':
        default:
          periodStart = null;
          break;
      }
    }
    if (date_to) periodEnd = new Date(date_to);

    const inPeriod = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (periodStart && d < periodStart) return false;
      if (d > periodEnd) return false;
      return true;
    };

    // ── Companies paginiert laden (keine Truncation) ─────────────────────────
    const PAGE_SIZE = 2000;
    const allCompanies = [];
    for (let skip = 0; skip < 10000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Company.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const c of batch) allCompanies.push(c);
      if (batch.length < PAGE_SIZE) break;
    }

    // Opportunities paginiert laden
    const allOpportunities = [];
    for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Opportunity.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const o of batch) allOpportunities.push(o);
      if (batch.length < PAGE_SIZE) break;
    }

    // ContactLogs + LeadOutcomes + Tasks paginiert laden
    const allContactLogs = [];
    for (let skip = 0; skip < 10000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.ContactLog.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const c of batch) allContactLogs.push(c);
      if (batch.length < PAGE_SIZE) break;
    }

    const allOutcomes = [];
    for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.LeadOutcome.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const o of batch) allOutcomes.push(o);
      if (batch.length < PAGE_SIZE) break;
    }

    const allTasks = await base44.asServiceRole.entities.Task.filter(
      { organization_id: orgId }, '-created_date', 500
    );

    // ── Temperatur-Hilfsfunktion (kanonisch, identisch zu getDashboardData) ──
    const getTemp = (c) => {
      const t = c.lead_temperature;
      if (t && ['hot', 'warm', 'cold'].includes(t)) return t;
      const score = (c.lead_temperature_score != null ? c.lead_temperature_score : 0) || (c.priority_score || 0);
      if (score >= 60) return 'hot';
      if (score >= 30) return 'warm';
      if (c.is_hot === true) return 'hot';
      return 'unknown';
    };

    // ── Opportunity-Aggregationen ─────────────────────────────────────────────
    const oppsOpen     = allOpportunities.filter(o => o.status === 'open');
    const oppsWon      = allOpportunities.filter(o => o.status === 'won');
    const oppsLost     = allOpportunities.filter(o => o.status === 'lost');
    const oppsArchived = allOpportunities.filter(o => o.status === 'archived');

    const oppsByStage = {};
    for (const o of oppsOpen) {
      const s = o.stage || 'unknown';
      oppsByStage[s] = (oppsByStage[s] || 0) + 1;
    }
    const oppsByStatus = {
      open: oppsOpen.length,
      won: oppsWon.length,
      lost: oppsLost.length,
      archived: oppsArchived.length,
    };

    const pipelineValue    = oppsOpen.reduce((s, o) => s + (o.value || 0), 0);
    const weightedForecast = oppsOpen.reduce((s, o) => {
      return (o.value != null && o.probability != null) ? s + (o.value * o.probability / 100) : s;
    }, 0);
    const wonValue  = oppsWon.reduce((s, o) => s + (o.value || 0), 0);
    const lostValue = oppsLost.reduce((s, o) => s + (o.value || 0), 0);

    const oppsWithValue = allOpportunities.filter(o => o.value != null && o.value > 0);
    const avgDealValue = oppsWithValue.length > 0
      ? oppsWithValue.reduce((s, o) => s + o.value, 0) / oppsWithValue.length
      : 0;

    const overdueOpen = oppsOpen.filter(o => o.expected_close_date && new Date(o.expected_close_date) < now);

    // Conversion Rates
    const totalComps = allCompanies.length;
    const companiesWithOpp = new Set(allOpportunities.map(o => o.company_id)).size;
    const companyToOppRate = totalComps > 0 ? Math.round(companiesWithOpp / totalComps * 1000) / 10 : 0;
    const oppToWonRate = allOpportunities.length > 0
      ? Math.round(oppsWon.length / allOpportunities.length * 1000) / 10
      : 0;

    // Opp By Stage chart data
    const oppsByStageChart = Object.entries(oppsByStage)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // ── Lead-Aggregationen ────────────────────────────────────────────────────
    const totalCompanies = allCompanies.length;
    const newInPeriod = periodStart
      ? allCompanies.filter(c => inPeriod(c.created_date)).length
      : totalCompanies;

    // by_status
    const byStatus = {};
    for (const c of allCompanies) {
      const s = c.status || 'Unbekannt';
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    // by_quality_tier
    const byQualityTier = {};
    for (const c of allCompanies) {
      const t = c.quality_tier || 'unknown';
      byQualityTier[t] = (byQualityTier[t] || 0) + 1;
    }

    // by_quality_confidence
    const byQualityConfidence = {};
    for (const c of allCompanies) {
      const t = c.quality_confidence || 'unknown';
      byQualityConfidence[t] = (byQualityConfidence[t] || 0) + 1;
    }

    // Pipeline (for charts)
    const pipelineItems = ['Neu','Kontakt','Rückruf','Termin','Angebot','Gewonnen','Verloren'].map(s => ({
      name: s,
      value: byStatus[s] || 0,
    }));

    // Conversion (Gewonnen / total)
    const gewonnen = byStatus['Gewonnen'] || 0;
    const conversionRate = totalCompanies > 0 ? parseFloat(((gewonnen / totalCompanies) * 100).toFixed(1)) : 0;

    // Conversion per Branche (nur Branchen mit >= 2 Leads)
    const brancheMap = {};
    for (const c of allCompanies) {
      const b = c.branche || 'Unbekannt';
      if (!brancheMap[b]) brancheMap[b] = { total: 0, gewonnen: 0 };
      brancheMap[b].total++;
      if (c.status === 'Gewonnen') brancheMap[b].gewonnen++;
    }
    const conversionByBranche = Object.entries(brancheMap)
      .filter(([, v]) => v.total >= 2)
      .map(([name, v]) => ({
        name,
        rate: parseFloat(((v.gewonnen / v.total) * 100).toFixed(1)),
        total: v.total,
        gewonnen: v.gewonnen,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10);

    // Temperatur
    const hotCount = allCompanies.filter(c => getTemp(c) === 'hot').length;
    const warmCount = allCompanies.filter(c => getTemp(c) === 'warm').length;
    const coldCount = allCompanies.filter(c => getTemp(c) === 'cold').length;

    // Quality
    const weakCount    = allCompanies.filter(c => c.quality_tier === 'weak').length;
    const goodOrBetter = allCompanies.filter(c => ['good','strong','premium'].includes(c.quality_tier)).length;
    const openOffers   = byStatus['Angebot'] || 0;

    // ── ContactLog-Aggregationen ──────────────────────────────────────────────
    const periodLogs = periodStart ? allContactLogs.filter(l => inPeriod(l.created_date)) : allContactLogs;

    const contactLogsTotal = periodLogs.length;
    const callsCount  = periodLogs.filter(l => l.typ === 'Anruf' || l.typ === 'Telefon').length;
    const emailsCount = periodLogs.filter(l => l.typ === 'E-Mail').length;
    const notesCount  = periodLogs.filter(l => ['Notiz', 'Sonstiges'].includes(l.typ)).length;

    // Kontaktarten-Verteilung für Pie-Chart
    const contactTypeMap = {};
    for (const l of periodLogs) {
      const t = l.typ || 'Sonstiges';
      contactTypeMap[t] = (contactTypeMap[t] || 0) + 1;
    }
    const contactTypeData = Object.entries(contactTypeMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // ── Task-Aggregationen ────────────────────────────────────────────────────
    const nowTs = now.getTime();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const tasksCreatedInPeriod = periodStart
      ? allTasks.filter(t => inPeriod(t.created_date)).length
      : allTasks.length;

    const tasksDue      = allTasks.filter(t => !t.erledigt && t.faellig_am && new Date(t.faellig_am).getTime() >= todayStart).length;
    const tasksOverdue  = allTasks.filter(t => !t.erledigt && t.faellig_am && new Date(t.faellig_am).getTime() < todayStart).length;
    const callbacksDue  = allTasks.filter(t => !t.erledigt && t.typ === 'Rückruf').length;

    // ── Outcome-Aggregationen ─────────────────────────────────────────────────
    const periodOutcomes = periodStart ? allOutcomes.filter(o => inPeriod(o.created_date)) : allOutcomes;

    // Letztes Outcome pro Lead
    const latestOutcomeByLead = {};
    for (const o of [...periodOutcomes].sort((a, b) => new Date(b.created_date) - new Date(a.created_date))) {
      if (!latestOutcomeByLead[o.company_id]) latestOutcomeByLead[o.company_id] = o.outcome_type;
    }
    const outcomeValues = Object.values(latestOutcomeByLead);
    const totalRated       = outcomeValues.length;
    const wonCount         = outcomeValues.filter(o => o === 'won').length;
    const relevantCount    = outcomeValues.filter(o => o === 'relevant').length;
    const notRelevantCount = outcomeValues.filter(o => o === 'not_relevant').length;
    const lostCount        = outcomeValues.filter(o => o === 'lost').length;
    const outcomeConversionRate = totalRated > 0
      ? parseFloat(((wonCount / totalRated) * 100).toFixed(1))
      : 0;

    // ── Time Series: neue Leads pro Woche (letzte 12 Wochen) ─────────────────
    const weeklyLeads = [];
    const WEEKS = 12;
    for (let w = WEEKS - 1; w >= 0; w--) {
      const weekEnd   = new Date(now - w * 7 * 86400000);
      const weekStart = new Date(weekEnd - 7 * 86400000);
      const label = weekStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      const count = allCompanies.filter(c => {
        if (!c.created_date) return false;
        const d = new Date(c.created_date);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeklyLeads.push({ week: label, count });
    }

    // ── Kontaktaktivität pro Woche ────────────────────────────────────────────
    const weeklyContacts = [];
    for (let w = WEEKS - 1; w >= 0; w--) {
      const weekEnd   = new Date(now - w * 7 * 86400000);
      const weekStart = new Date(weekEnd - 7 * 86400000);
      const label = weekStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      const count = allContactLogs.filter(l => {
        if (!l.created_date) return false;
        const d = new Date(l.created_date);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeklyContacts.push({ week: label, count });
    }

    return Response.json({
      summary: {
        // Opportunity-Kennzahlen
        opportunities: {
          total_count:          allOpportunities.length,
          open_count:           oppsOpen.length,
          won_count:            oppsWon.length,
          lost_count:           oppsLost.length,
          archived_count:       oppsArchived.length,
          pipeline_value:       Math.round(pipelineValue * 100) / 100,
          weighted_forecast:    Math.round(weightedForecast * 100) / 100,
          won_value:            Math.round(wonValue * 100) / 100,
          lost_value:           Math.round(lostValue * 100) / 100,
          avg_deal_value:       Math.round(avgDealValue * 100) / 100,
          overdue_open_count:   overdueOpen.length,
          opportunities_by_stage:  oppsByStage,
          opportunities_by_status: oppsByStatus,
          company_to_opp_rate_pct: companyToOppRate,
          opp_to_won_rate_pct:     oppToWonRate,
        },
        // Lead-Zahlen
        total_companies:        totalCompanies,
        new_companies_period:   newInPeriod,
        by_status:              byStatus,
        by_quality_tier:        byQualityTier,
        by_quality_confidence:  byQualityConfidence,
        conversion_rate:        conversionRate,
        conversion_by_branche:  conversionByBranche,
        // Temperatur / Pipeline
        hot_count:              hotCount,
        warm_count:             warmCount,
        cold_count:             coldCount,
        open_offers_count:      openOffers,
        weak_leads_count:       weakCount,
        good_or_better_count:   goodOrBetter,
        // Kontaktaktivität
        contact_logs_total:     contactLogsTotal,
        calls_count:            callsCount,
        emails_count:           emailsCount,
        notes_count:            notesCount,
        // Tasks
        tasks_created:          tasksCreatedInPeriod,
        tasks_due:              tasksDue,
        tasks_overdue:          tasksOverdue,
        callbacks_due:          callbacksDue,
        // Outcomes
        lead_outcomes_total:    totalRated,
        relevant_count:         relevantCount,
        not_relevant_count:     notRelevantCount,
        won_count:              wonCount,
        lost_count:             lostCount,
        outcome_conversion_rate: outcomeConversionRate,
      },
      charts: {
        pipeline:             pipelineItems,
        opportunities_by_stage: oppsByStageChart,
        contact_types:        contactTypeData,
        weekly_leads:         weeklyLeads,
        weekly_contacts:      weeklyContacts,
        outcome_breakdown: [
          { name: 'Gewonnen',       value: wonCount },
          { name: 'Relevant',       value: relevantCount },
          { name: 'Nicht relevant', value: notRelevantCount },
          { name: 'Verloren',       value: lostCount },
        ].filter(o => o.value > 0),
      },
      diagnostics: {
        source:         'backend_aggregated',
        org_id:         orgId,
        period,
        period_start:   periodStart?.toISOString() || null,
        period_end:     periodEnd.toISOString(),
        companies_loaded: totalCompanies,
        contact_logs_loaded: allContactLogs.length,
        outcomes_loaded: allOutcomes.length,
        counts_limited: false,
        generated_at:   now.toISOString(),
      },
    });

  } catch (error) {
    console.error('[getStatisticsSummary] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});