import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Rollenauflösung ────────────────────────────────────────────────────
    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);

    // org_id aus Request-Body lesen (vom Frontend explizit übergeben)
    let requestedOrgId = null;
    try {
      const body = await req.json();
      requestedOrgId = body?.org_id || null;
    } catch {}

    // ── MVP: 1 Paket = 1 Account = 1 Organisation ─────────────────────────
    // Keine OrganizationMember-Lookups mehr. Zugriff nur über owner_email oder PlatformAdmin.
    let org = null;

    if (requestedOrgId) {
      // Explizite org_id: nur Owner oder PlatformAdmin erlaubt
      const targetOrgs = await base44.asServiceRole.entities.Organization.filter({ id: requestedOrgId });
      const targetOrg = targetOrgs?.[0] || null;
      if (!targetOrg) {
        return Response.json({ error: 'no_organization_found' }, { status: 404 });
      }
      if (targetOrg.owner_email === user.email || isPlatformAdmin) {
        org = targetOrg;
      } else {
        return Response.json({ error: 'Forbidden: no access to this organization' }, { status: 403 });
      }
    } else {
      // Keine org_id → eigene Org über owner_email laden
      const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
      org = ownerOrgs?.[0] || null;

      // PlatformAdmin ohne eigene Org: Support-Ansicht (erste Org)
      if (!org && isPlatformAdmin) {
        const anyOrg = await base44.asServiceRole.entities.Organization.list("-created_date", 1);
        org = anyOrg?.[0] || null;
      }
    }

    if (!org) {
      return Response.json({ error: 'no_organization_found' }, { status: 404 });
    }

    const orgId = org.id;
    const isOrgOwner = org.owner_email === user.email;
    const isOrgAdmin = isPlatformAdmin || isOrgOwner;
    const isAdmin = isOrgAdmin;

    // Blacklist laden für Filter
    const blacklist = await base44.entities.Blacklist.filter({ organization_id: orgId });
    const blacklistNames = blacklist.map(b => b.firmenname?.toLowerCase().trim());

    // Helper: Blacklist-Check
    const isBlacklisted = (companyName) => {
      if (!companyName) return false;
      const normalized = companyName.toLowerCase().trim();
      return blacklistNames.some(bl => normalized.includes(bl) || bl.includes(normalized));
    };

    // Companies laden - alle aktiven (kein 500er-Limit damit Zähler mit Leads-Page übereinstimmen)
    const allCompanies = await base44.entities.Company.filter({ organization_id: orgId }, "-created_date", 2000);
    const companies = allCompanies.filter(c => !isBlacklisted(c.name));
    const crmTotal = companies.length;

    // Tasks laden
    const allTasks = await base44.entities.Task.filter({ organization_id: orgId }, "-faellig_am", 100);
    const tasks = isAdmin ? allTasks : allTasks.filter(t => t.assigned_to === user.email);

    // Dashboard-Statistiken serverseitig aggregieren
    const openTasks = tasks.filter(t => !t.erledigt);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const todayTasks = openTasks.filter(t => {
      if (!t.faellig_am) return false;
      const dueDate = new Date(t.faellig_am);
      return dueDate >= todayStart && dueDate < todayEnd;
    });

    const overdueTasks = openTasks.filter(t => {
      if (!t.faellig_am) return false;
      return new Date(t.faellig_am) < todayStart;
    });

    // KANONISCHE LOGIK – identisch zu utils/leadTemperature.js getLeadTemperature():
    // 1. Primär: lead_temperature ('hot' | 'warm' | 'cold')
    // 2. Fallback: lead_temperature_score >= 60 ODER priority_score >= 60
    // 3. Legacy-Fallback: is_hot === true
    const getLeadTemperatureCanonical = (c) => {
      const temp = c.lead_temperature;
      if (temp && ['hot', 'warm', 'cold'].includes(temp)) return temp;
      const score = (c.lead_temperature_score != null ? c.lead_temperature_score : 0) || (c.priority_score || 0);
      if (score >= 60) return 'hot';
      if (score >= 30) return 'warm';
      if (c.is_hot === true) return 'hot';
      return 'unknown';
    };

    const hotLeads = companies
      .filter(c => getLeadTemperatureCanonical(c) === 'hot')
      .sort((a, b) => {
        const scoreA = a.lead_temperature_score || a.priority_score || 0;
        const scoreB = b.lead_temperature_score || b.priority_score || 0;
        return scoreB - scoreA;
      })
      .slice(0, 5);

    const recentActivities = companies.slice(0, 5);

    // PUNKT 7: newLeadsFromResearch run_id-basiert — nur letzter abgeschlossener Run
    // Verhindert, dass alte + neue Runs zusammengezählt werden.
    const recentRuns = await base44.asServiceRole.entities.ResearchRun.filter(
      { organization_id: orgId }, '-created_date', 5
    );
    const latestDoneRun = recentRuns.find(r => ['completed', 'partial'].includes(r.status));
    const latestRunId = latestDoneRun?.id || null;
    const newLeadsFromResearch = latestRunId
      ? companies.filter(c => c.research_run_id === latestRunId)
      : [];

    // ── Actionable Leads für "Heute wichtig" ────────────────────────────────
    // WHY: Dashboard soll konkrete tagesaktuelle Handlungen zeigen, nicht nur Zahlen.
    // LOGIC: Priorisierung: 1. Tasks (überfällig/heute) → 2. heiße Leads → 3. warme + next_best_action
    //        → 4. Neue ohne Aufgabe → 5. Leads mit hohem Score ohne Kontakt
    // EVIDENCE: engine_analysis_json, lead_temperature, lead_temperature_score, status, tasks, telefon/email

    // Task-Lookup: Welche Companies haben offene Tasks?
    const tasksByCompanyId = {};
    for (const t of openTasks) {
      if (t.company_id && !t.erledigt) {
        if (!tasksByCompanyId[t.company_id]) tasksByCompanyId[t.company_id] = [];
        tasksByCompanyId[t.company_id].push(t);
      }
    }

    // Task-Typ-Hilfsfunktion: Ist Task ein Rückruf?
    const isCallbackTask = (t) => {
      const typ = (t.typ || '').toLowerCase();
      const titel = (t.titel || '').toLowerCase();
      return typ.includes('rückruf') || titel.includes('rückruf') || typ === 'rückruf';
    };

    // Überfällige Tasks → als Aktionen (Rückrufe separat taggen)
    const overdueActionItems = overdueTasks.slice(0, 3).map(t => ({
      type: isCallbackTask(t) ? 'callback_overdue' : 'task_overdue',
      company_id: t.company_id || null,
      company_name: t.company_name || t.titel,
      action: isCallbackTask(t) ? 'Rückruf durchführen' : (t.typ || 'Aufgabe'),
      reason: `Überfällig seit ${t.faellig_am ? new Date(t.faellig_am).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) : '?'}`,
      priority: 0,
      task_id: t.id,
    }));

    const todayActionItems = todayTasks.slice(0, 3).map(t => ({
      type: isCallbackTask(t) ? 'callback_due_today' : 'task_today',
      company_id: t.company_id || null,
      company_name: t.company_name || t.titel,
      action: isCallbackTask(t) ? 'Rückruf durchführen' : (t.typ || 'Aufgabe'),
      reason: isCallbackTask(t) ? 'Rückruf heute fällig' : 'Heute fällig',
      priority: 1,
      task_id: t.id,
    }));

    // Company-basierte Aktionen (ohne Task-Duplikate)
    const companiesWithTasks = new Set(Object.keys(tasksByCompanyId));

    const companyActionItems = [];
    const activeStatuses = ['Neu', 'Kontakt', 'Rückruf', 'Termin', 'Angebot'];

    for (const company of companies) {
      if (!activeStatuses.includes(company.status)) continue;
      if (company.is_blacklisted) continue;
      if (companyActionItems.length >= 8) break;

      // Engine-Daten parsen + next_best_action normalisieren
      // next_best_action kann sein: string (legacy) | { title, reason, type } (engine v2)
      let engineData = null;
      try {
        if (company.engine_analysis_json) engineData = JSON.parse(company.engine_analysis_json);
      } catch {}

      const rawNba = engineData?.next_best_action || company.next_best_action || null;
      let nbaTitle = null, nbaReason = null, nbaType = null;
      if (rawNba) {
        if (typeof rawNba === 'string') {
          nbaTitle = rawNba;
        } else if (typeof rawNba === 'object') {
          nbaTitle = rawNba.title || rawNba.action || null;
          nbaReason = rawNba.reason || null;
          nbaType = rawNba.type || null;
        }
      }

      const leadTemp = getLeadTemperatureCanonical(company); // kanonisch aufgelöst
      const hasContact = !!(company.telefon || company.email);

      // Heiße Leads ohne Task - KANONISCHE LOGIK (identisch zu getLeadTemperatureCanonical oben)
      const isHot = getLeadTemperatureCanonical(company) === 'hot';
      if (isHot && !companiesWithTasks.has(company.id)) {
        const action = nbaTitle || (company.telefon ? 'Anrufen' : company.email ? 'E-Mail senden' : 'Recherchieren');
        companyActionItems.push({
          type: 'hot_lead',
          company_id: company.id,
          company_name: company.name,
          action,
          reason: nbaReason || 'Heißer Lead',
          action_type: nbaType || null,
          priority: 2,
          lead_temperature: leadTemp,
          has_contact: hasContact,
        });
        continue;
      }

      // Warme Leads mit next_best_action
      if (leadTemp === 'warm' && nbaTitle && !companiesWithTasks.has(company.id)) {
        companyActionItems.push({
          type: 'warm_lead_action',
          company_id: company.id,
          company_name: company.name,
          action: nbaTitle,
          reason: nbaReason || 'Warmer Lead mit Empfehlung',
          action_type: nbaType || null,
          priority: 3,
          lead_temperature: leadTemp,
          has_contact: hasContact,
        });
        continue;
      }

      // Offenes Angebot ohne offene Task → Nachfassen
      if (company.status === 'Angebot' && !companiesWithTasks.has(company.id)) {
        // Alter des Angebots bestimmen (je älter, desto dringlicher)
        const offerDate = company.last_contact_date || company.updated_date || null;
        const offerAgeDays = offerDate
          ? Math.floor((now - new Date(offerDate)) / (1000 * 60 * 60 * 24))
          : null;
        const offerReason = offerAgeDays !== null
          ? (offerAgeDays > 7 ? `Angebot seit ${offerAgeDays} Tagen offen` : 'Offenes Angebot')
          : 'Offenes Angebot';
        companyActionItems.push({
          type: 'offer_followup',
          company_id: company.id,
          company_name: company.name,
          action: 'Angebot nachfassen',
          reason: offerReason,
          priority: 2.5, // Nach heißen Leads, vor warmen
          lead_temperature: leadTemp,
          has_contact: hasContact,
          offer_age_days: offerAgeDays,
        });
        continue;
      }

      // Rückruf-Status ohne offene Task → Nachfassen
      if (company.status === 'Rückruf' && !companiesWithTasks.has(company.id)) {
        companyActionItems.push({
          type: 'callback_pending',
          company_id: company.id,
          company_name: company.name,
          action: 'Rückruf durchführen',
          reason: 'Rückruf ausstehend',
          priority: 3,
          lead_temperature: leadTemp,
          has_contact: hasContact,
        });
        continue;
      }

      // Neue Leads mit gutem Score, kontaktierbar, keine Task
      // quality_tier='weak' oder quality_confidence='low' → nicht als priorisierter Kontakt-Lead anzeigen
      const isQualityWeak = company.quality_tier === 'weak' || company.quality_confidence === 'low';
      if (company.status === 'Neu' && hasContact && !isQualityWeak && (company.relevance_score || 0) >= 65 && !companiesWithTasks.has(company.id)) {
        const action = company.telefon ? 'Erstgespräch führen' : 'E-Mail vorbereiten';
        companyActionItems.push({
          type: 'new_contactable',
          company_id: company.id,
          company_name: company.name,
          action,
          reason: `Neuer Lead · ${company.branche || 'Dienstleister'}`,
          priority: 4,
          lead_temperature: leadTemp,
          has_contact: hasContact,
        });
      }
    }

    // Alle Action Items zusammenführen, sortieren und auf 6 begrenzen
    const allActionItems = [
      ...overdueActionItems,
      ...todayActionItems,
      ...companyActionItems.sort((a, b) => a.priority - b.priority),
    ].slice(0, 6);

    // Pipeline-Statistiken
    const pipelineStats = {
      neu: companies.filter(c => c.status === "Neu").length,
      kontakt: companies.filter(c => c.status === "Kontakt").length,
      rueckruf: companies.filter(c => c.status === "Rückruf").length,
      termin: companies.filter(c => c.status === "Termin").length,
      angebot: companies.filter(c => c.status === "Angebot").length,
      gewonnen: companies.filter(c => c.status === "Gewonnen").length,
    };

    // Weekly progress
    const contactsThisWeek = companies.filter(c => {
      if (!c.last_contact_date) return false;
      return new Date(c.last_contact_date) >= weekStart;
    }).length;

    // Weekly goal aus OrganizationSettings laden
    const allSettings = await base44.entities.OrganizationSettings.filter({ organization_id: orgId });
    const settingsMap = {};
    allSettings.forEach(s => { settingsMap[s.key] = s.value; });
    const weeklyGoal = parseInt(settingsMap['weekly_contact_goal'] || '20', 10);

    // ── USAGE_SUMMARY — direkt inline berechnet (kein functions.invoke → kein Rate-Limit-Risiko) ──
    // Identische Logik wie getUsageSummary: monthly_used = Math.max(committedSlots, usageLogValue, companiesThisMonth)
    const periodParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    const pyU = parseInt(periodParts.find(p => p.type === 'year')?.value || now.getFullYear());
    const pmU = parseInt(periodParts.find(p => p.type === 'month')?.value || 1);
    const periodMonthU = `${pyU}-${String(pmU).padStart(2, '0')}`;
    const resetDateU = new Date(Date.UTC(pyU, pmU, 1));
    const resetDateFormatted = resetDateU.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
    });

    const [quotaSlots, usageLogsU] = await Promise.all([
      base44.asServiceRole.entities.QuotaReservation.filter({ organization_id: orgId, period_month: periodMonthU }),
      base44.asServiceRole.entities.UsageLog.filter({ organization_id: orgId, period_month: periodMonthU }),
    ]);

    // Plan-Lookup mit try/catch absichern (ungültige plan_id crasht nicht Dashboard)
    let plan = null;
    let planLoadError = null;
    if (org.plan_id) {
      try {
        const planResult = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
        plan = planResult?.[0] || null;
        if (!plan) planLoadError = 'missing';
      } catch {
        planLoadError = 'invalid';
        plan = null;
      }
    }

    // ── LIMIT-AUFLÖSUNG (IDENTISCH zu getUsageSummary) ─────────────────────
    // PRIORITÄT: custom_monthly_lead_limit (Admin-Override) > Plan-Wert
    const hasCustomLimit = org.custom_monthly_lead_limit != null;
    const trialStage = org.trial_stage || 'free_preview';
    const isPaidCustomer = ['paid'].includes(trialStage) || ['active', 'trialing'].includes(org.billing_status || '');

    let monthlyLimit;
    let planStatus = 'ok'; // "ok" | "billing_plan_missing" | "billing_plan_invalid" | "trial_limit" | "no_plan_preview" | "custom_limit" | "plan_limit_null"

    if (hasCustomLimit) {
      monthlyLimit = org.custom_monthly_lead_limit;
      planStatus = 'custom_limit';
    } else if (plan) {
      monthlyLimit = (plan.max_leads_per_month != null) ? plan.max_leads_per_month : 50;
      if (plan.max_leads_per_month == null) planStatus = 'plan_limit_null';
    } else if (planLoadError === 'missing') {
      planStatus = 'billing_plan_missing';
      monthlyLimit = isPaidCustomer ? 0 : 50;
    } else if (planLoadError === 'invalid') {
      planStatus = 'billing_plan_invalid';
      monthlyLimit = isPaidCustomer ? 0 : 50;
    } else {
      if (isPaidCustomer) {
        planStatus = 'billing_plan_missing';
        monthlyLimit = 0;
      } else if (trialStage === 'verified_trial') {
        planStatus = 'trial_limit';
        monthlyLimit = 50;
      } else {
        planStatus = 'no_plan_preview';
        monthlyLimit = 10;
      }
    }

    const isUnlimited = monthlyLimit === -1;

    const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
    const usageLogValue = usageLogsU?.[0]?.leads_created || 0;

    // ⚠️ companiesThisMonth als Sicherheitsnetz — UTC-Grenzen (±1-2h Drift am Monatswechsel)
    const NON_QUOTA_RUN_IDS = new Set(['manual_setup', 'csv_import', 'manual', 'import']);
    const periodStartU = new Date(Date.UTC(pyU, pmU - 1, 1));
    const periodEndU   = new Date(Date.UTC(pyU, pmU, 1));
    const companiesThisMonth = allCompanies.filter(c => {
      if (!c.research_run_id) return false;
      if (NON_QUOTA_RUN_IDS.has(c.research_run_id)) return false;
      if (c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
      if (c.source_provider === 'manual' || c.source_provider === 'csv_import') return false;
      const created = new Date(c.created_date);
      return created >= periodStartU && created < periodEndU;
    }).length;

    const monthlyUsed = Math.max(committedSlots, usageLogValue, companiesThisMonth);
    const monthlyRemaining = isUnlimited ? null : Math.max(0, monthlyLimit - monthlyUsed);
    const isOverLimit = !isUnlimited && monthlyUsed >= monthlyLimit; // IDENTISCH zu getUsageSummary

    const sourceUsed = monthlyUsed === committedSlots && committedSlots >= usageLogValue && committedSlots >= companiesThisMonth
      ? 'quota_reservation'
      : monthlyUsed === usageLogValue && usageLogValue >= companiesThisMonth
      ? 'usage_log'
      : 'companies_count';

    const usage_summary = {
      period_month: periodMonthU,
      plan_name: plan?.name || null,
      plan_status: planStatus, // IDENTISCH zu getUsageSummary
      monthly_limit: monthlyLimit,
      monthly_used: monthlyUsed,
      monthly_remaining: monthlyRemaining,
      is_over_limit: isOverLimit,
      is_unlimited: isUnlimited,
      reset_date: resetDateFormatted,
      crm_total: crmTotal,
      explanation: {
        monthly_used_description: "Automatisch recherchierte Leads in diesem Kalendermonat (max aus QuotaReservation, UsageLog, Company-Zählung)",
        crm_total_description: "Aktuell gespeicherte Firmenkontakte (inkl. manuell angelegte)",
        why_different: monthlyUsed !== crmTotal
          ? "Monatsverbrauch = nur automatisch recherchierte Leads."
          : null,
      },
      reconciliation: {
        committed_slots: committedSlots,
        usage_log_value: usageLogValue,
        companies_this_month: companiesThisMonth,
        source_used: sourceUsed,
        org_id: orgId,
        period_month: periodMonthU,
      },
      // Weitere Usage-Metriken — REGEL: null/undefined ≠ -1 (unlimited)
      research_runs_used: usageLogsU?.[0]?.lead_generations_used || 0,
      ai_actions_used: usageLogsU?.[0]?.ai_actions_used || 0,
      manual_emails_logged: usageLogsU?.[0]?.manual_emails_logged || 0,
      max_research_runs: plan != null ? (plan.max_lead_generations_per_month ?? null) : null,
      max_ai_actions: plan != null ? (plan.max_ai_scorings_per_month ?? null) : null,
      max_emails_per_month: plan != null ? (plan.max_emails_per_month ?? null) : null,
    };

    return Response.json({
      org,
      user: {
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        org_role: isOrgAdmin ? 'organization_admin' : null,
        is_platform_admin: isPlatformAdmin,
        is_org_admin: isOrgAdmin,
        org,
      },
      stats: {
        pipelineStats,
        hotLeadsCount: hotLeads.length,
        todayTasksCount: todayTasks.length,
        overdueTasksCount: overdueTasks.length,
        contactsThisWeek,
        weeklyGoal,
        newLeadsFromResearchCount: newLeadsFromResearch.length,
      },
      data: {
        hotLeads,
        todayTasks,
        overdueTasks,
        recentActivities,
        newLeadsFromResearch,
        actionableLeads: allActionItems,
      },
      meta: {
        totalCompanies: allCompanies.length,
        totalTasks: tasks.length,
        loadedAt: new Date().toISOString(),
        usage_summary, // ← Single Source of Truth für alle Usage-Anzeigen
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});