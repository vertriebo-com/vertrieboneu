import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const {
    org_id,
    limit = 25,
    include_opportunities = true,
    include_tasks = true,
    include_leads = true,
    include_reviews = true,
  } = payload;

  // ── AUTH / TENANT ISOLATION ──
  let targetOrgId = org_id;
  if (!targetOrgId) {
    const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
    targetOrgId = orgs?.[0]?.id;
  }
  if (!targetOrgId) {
    return Response.json({ error: "No organization found" }, { status: 404 });
  }

  const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);
  const orgs = await base44.entities.Organization.filter({ id: targetOrgId });
  if (!orgs || orgs.length === 0) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }
  const org = orgs[0];
  if (!isPlatformAdmin && org.owner_email !== user.email) {
    return Response.json({ error: "Forbidden: Not your organization" }, { status: 403 });
  }

  // ── DATEN LADEN ──
  const [companies, opportunities, tasks, contactLogs, contacts] = await Promise.all([
    base44.entities.Company.filter({ organization_id: targetOrgId }, '-updated_date', 500),
    include_opportunities ? base44.entities.Opportunity.filter({ organization_id: targetOrgId }, '-updated_date', 200) : [],
    include_tasks ? base44.entities.Task.filter({ organization_id: targetOrgId }, '-updated_date', 200) : [],
    base44.entities.ContactLog.filter({ organization_id: targetOrgId, company_id: { $exists: true } }, '-created_date', 200),
    base44.entities.Contact.filter({ organization_id: targetOrgId }, '-created_date', 200),
  ]);

  const now = new Date();
  const dayMs = 86400000;

  // ── HELPER ──
  const hasConfirmedContact = (companyId) => {
    const comps = contacts.filter(c => c.company_id === companyId);
    return comps.some(c => c.review_status === 'confirmed' || c.confidence === 'high');
  };
  
  const getLastContactDate = (companyId) => {
    const logs = contactLogs.filter(l => l.company_id === companyId);
    if (logs.length === 0) return null;
    return new Date(Math.max(...logs.map(l => new Date(l.created_date).getTime())));
  };

  // ── EXCLUSION FILTERS ──
  const isExcluded = (company) => {
    if (company.is_blacklisted) return 'blacklisted';
    if (company.lifecycle_stage === 'archived' || company.lifecycle_stage === 'lost') return 'archived_or_lost';
    if (company.status === 'Verloren') return 'lost';
    if (company.quality_tier === 'weak') return 'weak_quality';
    return null;
  };

  // ── SCORING ──
  const scoreAction = (action, company) => {
    let score = 0;
    if (!company) return 0;

    // Task-Scoring
    if (action.task_id) {
      const task = tasks.find(t => t.id === action.task_id);
      if (task) {
        if (task.faellig_am && new Date(task.faellig_am) < now) score += 40;
        else if (task.faellig_am && new Date(task.faellig_am).toDateString() === now.toDateString()) score += 35;
        if (task.prioritaet === 'Hoch') score += 15;
      }
    }

    // Opportunity-Scoring
    if (action.opportunity_id) {
      const opp = opportunities.find(o => o.id === action.opportunity_id);
      if (opp) {
        if (opp.expected_close_date) {
          const daysUntilClose = (new Date(opp.expected_close_date) - now) / dayMs;
          if (daysUntilClose < 0) score += 25;
          else if (daysUntilClose <= 14) score += 25;
        }
        if (opp.value >= 5000) score += 20;
        if (opp.probability >= 70) score += 15;
        else if (opp.probability >= 50) score += 10;
      }
    }

    // Lead-Quality-Scoring
    if (company.quality_tier === 'premium') score += 20;
    else if (company.quality_tier === 'strong') score += 15;
    else if (company.quality_tier === 'good') score += 8;

    if (company.lead_temperature === 'hot') score += 30;
    else if (company.lead_temperature === 'warm') score += 15;

    if (company.relevance_score) score += Math.round(company.relevance_score / 10);

    // Contact-Scoring
    if (hasConfirmedContact(company.id)) score += 10;
    if (!company.ansprechpartner && action.action_type === 'add_contact') score += 8;

    // Last-Contact-Age
    const lastContact = getLastContactDate(company.id);
    if (lastContact) {
      const daysSinceContact = (now - lastContact) / dayMs;
      if (daysSinceContact > 30) score += 15;
      else if (daysSinceContact > 14) score += 10;
    } else if (company.telefon || company.email) {
      score += 10;
    }

    // Review-Enrichment
    if (action.action_type === 'review_enrichment') score += 12;

    return Math.max(0, score);
  };

  // ── ACTION GENERATION ──
  const actions = [];
  const excludedCounts = { weak_quality: 0, archived_or_lost: 0, blacklisted: 0, duplicate_action: 0, lost: 0 };
  const companyActionCount = {};

  // 1. OVERDUE TASKS
  if (include_tasks) {
    const overdueTasks = tasks.filter(t =>
      !t.erledigt && t.company_id && t.faellig_am && new Date(t.faellig_am) < now
    );
    for (const task of overdueTasks) {
      const company = companies.find(c => c.id === task.company_id);
      if (!company) continue;
      const exclusionReason = isExcluded(company);
      if (exclusionReason) {
        excludedCounts[exclusionReason]++;
        continue;
      }
      actions.push({
        id: `task_${task.id}`,
        organization_id: targetOrgId,
        company_id: company.id,
        company_name: company.name,
        task_id: task.id,
        action_type: 'schedule_task',
        title: `Überfällige Aufgabe: ${task.titel}`,
        reason: `Aufgabe seit ${Math.round((now - new Date(task.faellig_am)) / dayMs)} Tagen überfällig`,
        priority_score: 0,
        urgency: 'critical',
        due_date: task.faellig_am,
        recommended_channel: task.typ === 'Rückruf' ? 'phone' : 'email',
        source: 'task',
        metadata: { task_typ: task.typ, prioritaet: task.prioritaet },
      });
      companyActionCount[company.id] = (companyActionCount[company.id] || 0) + 1;
    }
  }

  // 2. CRITICAL OPPORTUNITIES
  if (include_opportunities) {
    const criticalOpps = opportunities.filter(o =>
      o.status === 'open' && o.company_id && o.expected_close_date &&
      new Date(o.expected_close_date) < new Date(now.getTime() + 14 * dayMs)
    );
    for (const opp of criticalOpps) {
      const company = companies.find(c => c.id === opp.company_id);
      if (!company) continue;
      const exclusionReason = isExcluded(company);
      if (exclusionReason) {
        excludedCounts[exclusionReason]++;
        continue;
      }
      const daysUntilClose = Math.round((new Date(opp.expected_close_date) - now) / dayMs);
      actions.push({
        id: `opp_${opp.id}`,
        organization_id: targetOrgId,
        company_id: company.id,
        company_name: company.name,
        opportunity_id: opp.id,
        action_type: 'update_opportunity_stage',
        title: `Opportunity: ${opp.title || company.name}`,
        reason: daysUntilClose < 0
          ? `Abschluss seit ${Math.abs(daysUntilClose)} Tagen überfällig`
          : `Abschluss in ${daysUntilClose} Tagen erwartet`,
        priority_score: 0,
        urgency: daysUntilClose < 0 ? 'critical' : 'high',
        due_date: opp.expected_close_date,
        recommended_channel: 'phone',
        source: 'opportunity',
        metadata: { stage: opp.stage, value: opp.value, probability: opp.probability },
      });
      companyActionCount[company.id] = (companyActionCount[company.id] || 0) + 1;
    }
  }

  // 3. FOLLOW-UP
  if (include_leads) {
    const followUpSignals = contactLogs.filter(l =>
      l.ergebnis === 'Rückruf vereinbart' || l.naechster_schritt?.toLowerCase().includes('rückruf')
    );
    const companiesWithFollowUp = new Set(followUpSignals.map(l => l.company_id));

    for (const companyId of companiesWithFollowUp) {
      const company = companies.find(c => c.id === companyId);
      if (!company) continue;
      const exclusionReason = isExcluded(company);
      if (exclusionReason) {
        excludedCounts[exclusionReason]++;
        continue;
      }
      const lastLog = followUpSignals.filter(l => l.company_id === companyId)[0];
      actions.push({
        id: `followup_${company.id}`,
        organization_id: targetOrgId,
        company_id: company.id,
        company_name: company.name,
        action_type: 'follow_up',
        title: `Follow-up: ${company.name}`,
        reason: lastLog?.naechster_schritt || 'Rückruf vereinbart',
        priority_score: 0,
        urgency: 'high',
        due_date: lastLog?.rueckruf_datum || null,
        recommended_channel: 'phone',
        source: 'contact_log',
        metadata: { last_contact: lastLog?.created_date },
      });
      companyActionCount[company.id] = (companyActionCount[company.id] || 0) + 1;
    }

    // Heiße Leads ohne Kontakt
    const hotLeads = companies.filter(c => c.lead_temperature === 'hot' && !getLastContactDate(c.id));
    for (const company of hotLeads.slice(0, 10)) {
      const exclusionReason = isExcluded(company);
      if (exclusionReason) {
        excludedCounts[exclusionReason]++;
        continue;
      }
      actions.push({
        id: `hot_${company.id}`,
        organization_id: targetOrgId,
        company_id: company.id,
        company_name: company.name,
        action_type: 'call_lead',
        title: `Heißer Lead: ${company.name}`,
        reason: 'Heißer Lead noch nicht kontaktiert',
        priority_score: 0,
        urgency: 'high',
        due_date: null,
        recommended_channel: company.telefon ? 'phone' : 'email',
        source: 'lead_temperature',
        metadata: { lead_temperature: company.lead_temperature, quality_tier: company.quality_tier },
      });
      companyActionCount[company.id] = (companyActionCount[company.id] || 0) + 1;
    }
  }

  // 4. CREATE OPPORTUNITY
  if (include_opportunities) {
    const oppCompanyIds = new Set(opportunities.map(o => o.company_id));
    const qualifiedLeads = companies.filter(c =>
      (c.lifecycle_stage === 'qualified' || c.lifecycle_stage === 'customer' || c.lead_temperature === 'hot') &&
      !oppCompanyIds.has(c.id)
    );
    for (const company of qualifiedLeads.slice(0, 10)) {
      const exclusionReason = isExcluded(company);
      if (exclusionReason) {
        excludedCounts[exclusionReason]++;
        continue;
      }
      actions.push({
        id: `create_opp_${company.id}`,
        organization_id: targetOrgId,
        company_id: company.id,
        company_name: company.name,
        action_type: 'create_opportunity',
        title: `Opportunity anlegen: ${company.name}`,
        reason: `Qualifizierter Lead (${company.lifecycle_stage || company.lead_temperature}) ohne Opportunity`,
        priority_score: 0,
        urgency: 'medium',
        due_date: null,
        recommended_channel: 'phone',
        source: 'lifecycle_stage',
        metadata: { lifecycle_stage: company.lifecycle_stage, lead_temperature: company.lead_temperature },
      });
      companyActionCount[company.id] = (companyActionCount[company.id] || 0) + 1;
    }
  }

  // 5. ADD CONTACT (max 3)
  if (include_leads) {
    const noContact = companies.filter(c =>
      !c.ansprechpartner &&
      (c.quality_tier === 'premium' || c.quality_tier === 'strong' || c.lead_temperature === 'hot')
    );
    for (const company of noContact.slice(0, 3)) {
      const exclusionReason = isExcluded(company);
      if (exclusionReason) {
        excludedCounts[exclusionReason]++;
        continue;
      }
      actions.push({
        id: `add_contact_${company.id}`,
        organization_id: targetOrgId,
        company_id: company.id,
        company_name: company.name,
        action_type: 'add_contact',
        title: `Ansprechpartner ergänzen: ${company.name}`,
        reason: 'Kein Ansprechpartner hinterlegt',
        priority_score: 0,
        urgency: 'medium',
        due_date: null,
        recommended_channel: 'research',
        source: 'contact_completeness',
        metadata: { has_phone: !!company.telefon, has_email: !!company.email },
      });
      companyActionCount[company.id] = (companyActionCount[company.id] || 0) + 1;
    }
  }

  // 6. REVIEW ENRICHMENT
  if (include_reviews) {
    const needsReview = companies.filter(c =>
      c.provenance_json && c.provenance_json.includes('"review_status":"unreviewed"')
    );
    for (const company of needsReview.slice(0, 2)) {
      const exclusionReason = isExcluded(company);
      if (exclusionReason) {
        excludedCounts[exclusionReason]++;
        continue;
      }
      actions.push({
        id: `review_${company.id}`,
        organization_id: targetOrgId,
        company_id: company.id,
        company_name: company.name,
        action_type: 'review_enrichment',
        title: `Daten prüfen: ${company.name}`,
        reason: 'KI-angereicherte Daten benötigen Review',
        priority_score: 0,
        urgency: 'low',
        due_date: null,
        recommended_channel: 'review',
        source: 'provenance',
        metadata: { provenance_json: company.provenance_json },
      });
      companyActionCount[company.id] = (companyActionCount[company.id] || 0) + 1;
    }
  }

  // ── SCORING + DEDUPLICATION ──
  for (const action of actions) {
    const company = companies.find(c => c.id === action.company_id);
    action.priority_score = scoreAction(action, company);
  }

  // Prioritäts-Gewichtung: kritische Typen bekommen feste Bonus-Punkte
  // damit add_contact/review_enrichment nie übergeordnete Actions verdrängen
  const URGENCY_BONUS = { critical: 1000, high: 200, medium: 0, low: -50 };
  for (const action of actions) {
    action.priority_score += (URGENCY_BONUS[action.urgency] || 0);
  }

  actions.sort((a, b) => b.priority_score - a.priority_score);

  // Deduplizierung: max 2 Actions pro Company (außer critical)
  const dedupedActions = [];
  const finalCompanyCount = {};
  const typeCaps = { add_contact: 3, review_enrichment: 2 };
  const typeCount = {};

  for (const action of actions) {
    const currentCount = finalCompanyCount[action.company_id] || 0;
    const isCritical = action.urgency === 'critical';
    const cap = typeCaps[action.action_type];
    const tCount = typeCount[action.action_type] || 0;

    if (cap !== undefined && tCount >= cap) {
      excludedCounts.duplicate_action++;
      continue;
    }
    if (!isCritical && currentCount >= 2) {
      excludedCounts.duplicate_action++;
      continue;
    }
    dedupedActions.push(action);
    finalCompanyCount[action.company_id] = currentCount + 1;
    typeCount[action.action_type] = tCount + 1;
  }

  const limitedActions = dedupedActions.slice(0, limit);

  return Response.json({
    actions: limitedActions,
    total_candidates: actions.length,
    returned_count: limitedActions.length,
    diagnostics: {
      source: 'backend_ranked',
      org_id: targetOrgId,
      generated_at: new Date().toISOString(),
      scoring_version: '1.0',
      dedupe_applied: true,
      excluded_counts: excludedCounts,
      company_action_distribution: finalCompanyCount,
    },
  });
});