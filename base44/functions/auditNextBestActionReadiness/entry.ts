import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || !["admin", "platform_owner", "platform_admin"].includes(user.role)) {
    return Response.json({ error: "Forbidden: platform_admin required" }, { status: 403 });
  }

  // ── Daten laden (org-agnostisch für Audit-Zwecke) ──
  const [companies, opportunities, tasks, contactLogs, leadOutcomes] = await Promise.all([
    base44.asServiceRole.entities.Company.list('-updated_date', 200),
    base44.asServiceRole.entities.Opportunity.list('-updated_date', 200),
    base44.asServiceRole.entities.Task.list('-updated_date', 200),
    base44.asServiceRole.entities.ContactLog.list('-updated_date', 200),
    base44.asServiceRole.entities.LeadOutcome.list('-updated_date', 100),
  ]);

  const now = new Date();
  const dayMs = 86400000;

  // ── QUELLEN-ANALYSE ──
  const sources = {};

  // 1. Company – Qualität & Kontaktdaten
  const companiesActive = companies.filter(c =>
    !c.is_blacklisted &&
    c.lifecycle_stage !== 'archived' &&
    c.lifecycle_stage !== 'lost' &&
    c.status !== 'Verloren'
  );
  const withQualityTier = companies.filter(c => c.quality_tier).length;
  const withRelevanceScore = companies.filter(c => c.relevance_score > 0).length;
  const withLifecycle = companies.filter(c => c.lifecycle_stage).length;
  const withLastContact = companies.filter(c => c.last_contact_date).length;
  const withPhone = companies.filter(c => c.telefon).length;
  const withEmail = companies.filter(c => c.email).length;
  const withContact = companies.filter(c => c.ansprechpartner).length;
  const blacklisted = companies.filter(c => c.is_blacklisted).length;
  const archived = companies.filter(c => c.lifecycle_stage === 'archived' || c.lifecycle_stage === 'lost').length;
  const premiumLeads = companiesActive.filter(c => c.quality_tier === 'premium').length;
  const strongLeads = companiesActive.filter(c => c.quality_tier === 'strong').length;
  const weakLeads = companiesActive.filter(c => c.quality_tier === 'weak').length;
  const hotLeads = companiesActive.filter(c => c.lead_temperature === 'hot').length;
  const warmLeads = companiesActive.filter(c => c.lead_temperature === 'warm').length;
  const noContactData = companiesActive.filter(c => !c.telefon && !c.email).length;
  const neverContacted = companiesActive.filter(c => !c.last_contact_date).length;

  sources.company = {
    available: companies.length > 0,
    total: companies.length,
    active_for_nba: companiesActive.length,
    excluded_blacklisted: blacklisted,
    excluded_archived_lost: archived,
    quality_tier_coverage_pct: companies.length ? Math.round(withQualityTier / companies.length * 100) : 0,
    relevance_score_coverage_pct: companies.length ? Math.round(withRelevanceScore / companies.length * 100) : 0,
    lifecycle_coverage_pct: companies.length ? Math.round(withLifecycle / companies.length * 100) : 0,
    last_contact_coverage_pct: companies.length ? Math.round(withLastContact / companies.length * 100) : 0,
    phone_coverage_pct: companies.length ? Math.round(withPhone / companies.length * 100) : 0,
    email_coverage_pct: companies.length ? Math.round(withEmail / companies.length * 100) : 0,
    contact_person_coverage_pct: companies.length ? Math.round(withContact / companies.length * 100) : 0,
    premium_strong_leads: premiumLeads + strongLeads,
    weak_leads: weakLeads,
    hot_warm_leads: hotLeads + warmLeads,
    no_contact_data_count: noContactData,
    never_contacted_count: neverContacted,
    usable_for_nba: true,
    nba_inputs: ["quality_tier", "relevance_score", "lifecycle_stage", "lead_temperature", "last_contact_date", "telefon", "email", "ansprechpartner"],
  };

  // 2. Opportunity
  const openOpps = opportunities.filter(o => o.status === 'open');
  const wonOpps = opportunities.filter(o => o.status === 'won');
  const withValue = opportunities.filter(o => o.value > 0).length;
  const withProbability = opportunities.filter(o => o.probability > 0).length;
  const withCloseDate = opportunities.filter(o => o.expected_close_date).length;
  const overdueOpenOpps = openOpps.filter(o =>
    o.expected_close_date && new Date(o.expected_close_date) < now
  );
  const urgentOpps = openOpps.filter(o => {
    if (!o.expected_close_date) return false;
    const daysLeft = (new Date(o.expected_close_date) - now) / dayMs;
    return daysLeft >= 0 && daysLeft <= 14;
  });
  const highValueOpps = openOpps.filter(o => (o.value || 0) >= 5000);

  sources.opportunity = {
    available: opportunities.length > 0,
    total: opportunities.length,
    open: openOpps.length,
    won: wonOpps.length,
    value_coverage_pct: opportunities.length ? Math.round(withValue / opportunities.length * 100) : 0,
    probability_coverage_pct: opportunities.length ? Math.round(withProbability / opportunities.length * 100) : 0,
    close_date_coverage_pct: opportunities.length ? Math.round(withCloseDate / opportunities.length * 100) : 0,
    overdue_open_count: overdueOpenOpps.length,
    urgent_14days_count: urgentOpps.length,
    high_value_count: highValueOpps.length,
    usable_for_nba: true,
    nba_inputs: ["stage", "status", "value", "probability", "expected_close_date"],
    nba_actions: ["update_opportunity_stage", "follow_up", "prepare_email", "mark_lost_or_archive"],
  };

  // 3. Task
  const openTasks = tasks.filter(t => !t.erledigt);
  const overdueTasks = openTasks.filter(t =>
    t.faellig_am && new Date(t.faellig_am) < now
  );
  const dueTodayTasks = openTasks.filter(t => {
    if (!t.faellig_am) return false;
    const d = new Date(t.faellig_am);
    return d >= new Date(now.toDateString()) && d < new Date(now.getTime() + dayMs);
  });
  const highPrioTasks = openTasks.filter(t => t.prioritaet === 'Hoch');

  sources.task = {
    available: tasks.length > 0,
    total: tasks.length,
    open: openTasks.length,
    overdue_count: overdueTasks.length,
    due_today_count: dueTodayTasks.length,
    high_priority_count: highPrioTasks.length,
    has_company_link: tasks.filter(t => t.company_id).length,
    usable_for_nba: true,
    nba_inputs: ["faellig_am", "prioritaet", "typ", "company_id"],
    nba_actions: ["schedule_task", "call_lead", "follow_up"],
  };

  // 4. ContactLog
  const recentLogs = contactLogs.filter(l => {
    const d = new Date(l.created_date);
    return (now - d) / dayMs <= 30;
  });
  const followUpLogs = contactLogs.filter(l =>
    l.ergebnis === 'Rückruf vereinbart' || l.naechster_schritt?.toLowerCase().includes('rückruf')
  );
  const emailLogs = contactLogs.filter(l => l.typ === 'E-Mail');

  sources.contact_log = {
    available: contactLogs.length > 0,
    total: contactLogs.length,
    recent_30d: recentLogs.length,
    followup_signals: followUpLogs.length,
    email_logs: emailLogs.length,
    has_org_link: contactLogs.filter(l => l.organization_id).length,
    has_company_link: contactLogs.filter(l => l.company_id).length,
    usable_for_nba: contactLogs.length > 0,
    nba_inputs: ["ergebnis", "naechster_schritt", "created_date", "typ"],
    nba_actions: ["call_lead", "follow_up", "prepare_email"],
  };

  // 5. LeadOutcome
  sources.lead_outcome = {
    available: leadOutcomes.length > 0,
    total: leadOutcomes.length,
    usable_for_nba: leadOutcomes.length > 0,
    nba_inputs: ["outcome_type", "company_id"],
    note: "Kann als Feedback-Signal genutzt werden (bereits gewonnen/verloren → nicht mehr prioritär)",
  };

  // ── ACTION-TYPE MATRIX ──
  const actionTypeMatrix = [
    {
      action: "call_lead",
      description: "Lead anrufen – hat Telefonnummer, noch nie/lange nicht kontaktiert",
      inputs_available: ["telefon", "last_contact_date", "quality_tier", "lifecycle_stage"],
      data_sources: ["Company"],
      feasibility: withPhone > 0 ? "high" : "low",
      candidate_count: companiesActive.filter(c =>
        c.telefon &&
        (!c.last_contact_date || (now - new Date(c.last_contact_date)) / dayMs > 14) &&
        c.quality_tier !== 'weak'
      ).length,
    },
    {
      action: "prepare_email",
      description: "E-Mail vorbereiten – hat E-Mail, noch kein Kontakt oder Follow-up offen",
      inputs_available: ["email", "last_contact_date", "ergebnis"],
      data_sources: ["Company", "ContactLog"],
      feasibility: withEmail > 0 ? "high" : "low",
      candidate_count: companiesActive.filter(c =>
        c.email && c.quality_tier !== 'weak'
      ).length,
    },
    {
      action: "follow_up",
      description: "Follow-up – Rückruf vereinbart, offene Opportunity, oder TaskFällig",
      inputs_available: ["ergebnis", "naechster_schritt", "faellig_am", "expected_close_date"],
      data_sources: ["ContactLog", "Task", "Opportunity"],
      feasibility: followUpLogs.length > 0 || overdueTasks.length > 0 ? "high" : "medium",
      candidate_count: followUpLogs.length + overdueTasks.length,
    },
    {
      action: "create_opportunity",
      description: "Opportunity anlegen – qualifizierter Lead ohne offene Opportunity",
      inputs_available: ["lifecycle_stage", "quality_tier", "company_id"],
      data_sources: ["Company", "Opportunity"],
      feasibility: companiesActive.length > 0 ? "high" : "low",
      candidate_count: (() => {
        const oppCompanyIds = new Set(openOpps.map(o => o.company_id));
        return companiesActive.filter(c =>
          (c.lifecycle_stage === 'qualified' || c.lifecycle_stage === 'customer') &&
          !oppCompanyIds.has(c.id)
        ).length;
      })(),
    },
    {
      action: "update_opportunity_stage",
      description: "Opportunity-Stage aktualisieren – überfällig oder stagnierende Stage",
      inputs_available: ["stage", "expected_close_date", "stage_changed_at"],
      data_sources: ["Opportunity"],
      feasibility: openOpps.length > 0 ? "high" : "none",
      candidate_count: overdueOpenOpps.length + urgentOpps.length,
    },
    {
      action: "add_contact",
      description: "Ansprechpartner fehlt – Lead hat keine Kontaktperson",
      inputs_available: ["ansprechpartner", "contacts_count"],
      data_sources: ["Company", "Contact"],
      feasibility: "high",
      candidate_count: companiesActive.filter(c => !c.ansprechpartner && c.quality_tier !== 'weak').length,
    },
    {
      action: "review_enrichment",
      description: "Datenanreicherung prüfen – Felder mit review_status=unreviewed/AI-Quelle",
      inputs_available: ["provenance_json", "review_status"],
      data_sources: ["Company", "Contact"],
      feasibility: "medium",
      note: "provenance_json Coverage noch ausstehend – Einzel-Review-Status pro Feld nötig",
    },
    {
      action: "schedule_task",
      description: "Aufgabe erstellen – keine offene Aufgabe für priorisierten Lead",
      inputs_available: ["company_id", "faellig_am", "erledigt"],
      data_sources: ["Task", "Company"],
      feasibility: "high",
      candidate_count: (() => {
        const taskCompanyIds = new Set(openTasks.map(t => t.company_id));
        return companiesActive.filter(c =>
          c.quality_tier !== 'weak' &&
          !taskCompanyIds.has(c.id) &&
          (hotLeads > 0 ? c.lead_temperature === 'hot' : true)
        ).length;
      })(),
    },
    {
      action: "mark_lost_or_archive",
      description: "Lead verloren/archivieren – long-overdue, kein Fortschritt, weak quality",
      inputs_available: ["lifecycle_stage", "quality_tier", "last_contact_date", "status"],
      data_sources: ["Company"],
      feasibility: "high",
      candidate_count: companiesActive.filter(c =>
        c.quality_tier === 'weak' &&
        (!c.last_contact_date || (now - new Date(c.last_contact_date)) / dayMs > 60)
      ).length,
    },
  ];

  // ── RANKING-MATRIX ──
  const rankingInputs = [
    { signal: "quality_tier", available: withQualityTier > 0, weight: "high", description: "premium/strong priorisieren, weak ausblenden" },
    { signal: "relevance_score", available: withRelevanceScore > 0, weight: "high", description: "0-100 Score, direkt als Basis-Ranking nutzbar" },
    { signal: "lead_temperature", available: hotLeads + warmLeads > 0, weight: "high", description: "hot/warm → sofortige Aktion" },
    { signal: "lifecycle_stage", available: withLifecycle > 0, weight: "medium", description: "qualified/customer > lead" },
    { signal: "opportunity_value", available: withValue > 0, weight: "high", description: "Hohe Werte früh bearbeiten" },
    { signal: "opportunity_probability", available: withProbability > 0, weight: "medium", description: "Weighted = value * probability" },
    { signal: "expected_close_date_urgency", available: withCloseDate > 0, weight: "high", description: "< 14 Tage = dringend" },
    { signal: "task_due_date", available: tasks.length > 0, weight: "high", description: "Überfällige Tasks = sofort" },
    { signal: "last_contact_age", available: withLastContact > 0, weight: "medium", description: "Lange kein Kontakt = Follow-up" },
    { signal: "contact_completeness", available: withPhone > 0 || withEmail > 0, weight: "medium", description: "Ohne Telefon/E-Mail = enrich first" },
    { signal: "blacklist_exclusion", available: blacklisted > 0, weight: "critical", description: "Blacklisted immer ausblenden" },
    { signal: "archived_lost_exclusion", available: archived > 0, weight: "critical", description: "archived/lost nie priorisieren" },
  ];

  const rankingFeasibility = rankingInputs.filter(r => r.available).length >= 6 ? "high" :
    rankingInputs.filter(r => r.available).length >= 3 ? "medium" : "low";

  // ── DAILY ACTION LIST BEWERTUNG ──
  const dailyActionListAudit = {
    exists: true,
    component: "components/dashboard/DailyActionList",
    current_logic_sources: ["Task (overdue)", "Company (hot/warm)", "ContactLog (last_contact_date)"],
    missing_logic: [
      "Opportunity urgency (expected_close_date < 14d) nicht eingebunden",
      "quality_tier weak Leads nicht gefiltert",
      "lifecycle_stage archived/lost nicht ausgeblendet",
      "Ranking/Scoring: keine Gewichtung der Aktionen",
      "Action-Typ Mapping: kein explizites call_lead/follow_up/create_opportunity Label",
      "Duplicate action risk: gleicher Lead kann in mehreren Kategorien erscheinen",
    ],
    verdict: "partial – liefert Grundlage, aber keine priorisierte Next-Best-Action-Liste",
    recommended_upgrade: "getDailyActions backend function mit Scoring-Logik + Deduplizierung",
  };

  // ── GAPS ──
  const gaps = [];

  if (withQualityTier / Math.max(companies.length, 1) < 0.5)
    gaps.push({ severity: "yellow", area: "quality_tier", msg: `Nur ${sources.company.quality_tier_coverage_pct}% der Companies haben quality_tier – NBA-Ranking eingeschränkt` });

  if (openOpps.length === 0)
    gaps.push({ severity: "info", area: "opportunity", msg: "Noch keine offenen Opportunities – opportunity-basierte Actions noch nicht testbar" });

  if (withCloseDate / Math.max(opportunities.length, 1) < 0.5 && opportunities.length > 0)
    gaps.push({ severity: "yellow", area: "close_date", msg: `Nur ${sources.opportunity.close_date_coverage_pct}% der Opportunities haben expected_close_date – Urgency-Scoring eingeschränkt` });

  if (followUpLogs.length === 0)
    gaps.push({ severity: "info", area: "followup_signals", msg: "Keine offenen Follow-up-Signale in ContactLogs – ggf. noch keine Erstkontakte dokumentiert" });

  gaps.push({ severity: "yellow", area: "daily_action_list", msg: "DailyActionList nutzt kein Opportunity-Signal und kein quality_tier-Filtering – veraltet" });
  gaps.push({ severity: "yellow", area: "duplicate_action_risk", msg: "Gleicher Lead kann als hot_lead UND als follow_up UND als overdue_task erscheinen – Deduplizierung fehlt" });
  gaps.push({ severity: "yellow", area: "nba_backend_function", msg: "Keine getDailyActions / getNextBestActions backend function – Logik ist nur client-side und unvollständig" });

  // ── RECOMMENDED FIXES ──
  const recommendedFixes = [
    {
      priority: 1,
      fix: "getDailyActions backend function",
      description: "Neue backend function die org-scoped NBA ableitet: Tasks (overdue+today), Opportunities (urgent+overdue), hot/warm Leads ohne Kontakt, qualified Leads ohne Opportunity. Output: sortierte Liste mit action_type, company_id, company_name, reason, urgency_score.",
      inputs: ["Task", "Opportunity", "Company (quality_tier, lifecycle_stage, last_contact_date, lead_temperature)"],
      replaces: "DailyActionList client-side Logik",
    },
    {
      priority: 2,
      fix: "NBA Scoring Formula",
      description: "Urgency Score = (overdue_task: +40) + (hot_lead: +30) + (opp_close_soon: +25) + (quality_premium: +20) + (quality_strong: +10) + (quality_weak: -50) + (blacklisted/archived: excluded). Max 100.",
      inputs: ["quality_tier", "lead_temperature", "expected_close_date", "task_due_date"],
    },
    {
      priority: 3,
      fix: "DailyActionList Upgrade",
      description: "DailyActionList auf getDailyActions umstellen. Deduplizierung per company_id, action_type Label (call_lead / follow_up / update_opp / etc.), weak/archived/lost ausblenden.",
      component: "components/dashboard/DailyActionList",
    },
    {
      priority: 4,
      fix: "quality_tier Backfill",
      description: `Aktuell haben nur ${sources.company.quality_tier_coverage_pct}% der Leads quality_tier. Backfill via analyzeLeadQualityScoring für alle aktiven Leads ohne Tier.`,
    },
  ];

  // ── SUMMARY ──
  const sourcesAvailable = Object.values(sources).filter(s => s.available).length;
  const nbaPossible = sources.company.available && sources.task.available;
  const rankingInputsAvailable = rankingInputs.filter(r => r.available).length;

  const summary = {
    sources_available: sourcesAvailable,
    sources_total: Object.keys(sources).length,
    next_best_action_possible: nbaPossible,
    ranking_inputs_available: rankingInputsAvailable,
    ranking_inputs_total: rankingInputs.length,
    ranking_feasibility: rankingFeasibility,
    opportunity_actions_supported: sources.opportunity.available,
    lead_quality_actions_supported: withQualityTier > 0,
    followup_actions_supported: followUpLogs.length > 0 || overdueTasks.length > 0,
    enrichment_review_actions_supported: "partial",
    blacklist_exclusion_available: blacklisted > 0,
    archived_lost_exclusion_available: archived > 0,
    duplicate_action_risk: "present – no deduplication logic exists yet",
    daily_action_list_verdict: dailyActionListAudit.verdict,
    recommended_next_build: "getDailyActions backend function mit Scoring, Deduplizierung, action_type Labels",
    active_nba_candidates: companiesActive.filter(c =>
      c.quality_tier !== 'weak' && !c.is_blacklisted
    ).length,
    immediate_actions_count: overdueTasks.length + overdueOpenOpps.length + hotLeads,
  };

  const claimStatus = nbaPossible && rankingInputsAvailable >= 5 ? "green" :
    nbaPossible ? "yellow" : "red";

  return Response.json({
    claim_status: claimStatus,
    risk_level: claimStatus === "green" ? "low" : claimStatus === "yellow" ? "medium" : "high",
    summary,
    source_matrix: sources,
    action_type_matrix: actionTypeMatrix,
    ranking_matrix: {
      feasibility: rankingFeasibility,
      inputs: rankingInputs,
      formula_draft: "urgency_score = (overdue_task?40:0) + (hot?30:0) + (opp_close_14d?25:0) + (premium?20:strong?10:0) + (relevant_score/10) - (weak?50:0)",
      deduplication_needed: true,
    },
    daily_action_list_audit: dailyActionListAudit,
    gaps,
    recommended_fixes: recommendedFixes,
  });
});