// processLeadOutcomeFeedback v3 — 2026-05-29
// Security: Admin-Check Daily-Run, Tenant-Check Einzel-Org, Cron-Token für Scheduler
// Learning v2: reason_codes, konservative Schwellen (>=5 + >70%)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const GENERIC_TERMS = new Set([
  'dienstleister', 'firma', 'unternehmen', 'gmbh', 'service', 'deutschland',
  'unbekannt', 'sonstiges', 'betrieb', 'gesellschaft', 'co', 'kg', 'ag',
  'holding', 'gruppe', 'verbund', 'team', 'office', 'ug', 'inc', 'ltd'
]);

function isGenericTerm(kw) {
  if (!kw || kw.trim().length < 3) return true;
  return GENERIC_TERMS.has(kw.trim().toLowerCase());
}

function normalizeKeyword(kw) {
  if (!kw) return null;
  const cleaned = kw.trim().slice(0, 60);
  if (!cleaned || /^\d+$/.test(cleaned)) return null;
  if (isGenericTerm(cleaned)) return null;
  return cleaned;
}

// reason_code → Kategorie-Signal
function interpretReasonCode(code) {
  if (!code) return null;
  const map = {
    falsche_branche:          { categorySignal: 'reduce' },
    zu_klein:                 { categorySignal: 'reduce' },
    zu_weit_entfernt:         { categorySignal: 'neutral' },
    privatkunde_kein_b2b:     { categorySignal: 'reduce' },
    kein_ansprechpartner:     { categorySignal: 'neutral' },
    schlechte_kontaktdaten:   { categorySignal: 'neutral' },
    bereits_bekannt:          { categorySignal: 'neutral' },
    kein_bedarf:              { categorySignal: 'reduce' },
    passt_zur_zielgruppe:     { categorySignal: 'boost' },
    gute_unternehmensgroesse: { categorySignal: 'boost' },
    guter_standort:           { categorySignal: 'boost' },
    klare_b2b_firma:          { categorySignal: 'boost' },
    passende_branche:         { categorySignal: 'boost' },
    gute_kontaktdaten:        { categorySignal: 'boost' },
    richtige_branche:         { categorySignal: 'boost' },
    hoher_bedarf:             { categorySignal: 'boost' },
    guter_ansprechpartner:    { categorySignal: 'boost' },
    wiederkehrender_auftrag:  { categorySignal: 'boost' },
    hoher_auftragswert:       { categorySignal: 'boost' },
    sonstiges:                null,
  };
  return map[code] || null;
}

// Feedback für eine einzelne Organisation verarbeiten
async function processFeedbackForOrg(base44, organization_id) {
  const outcomes = await base44.asServiceRole.entities.LeadOutcome.filter(
    { organization_id }, '-created_date', 500
  );
  if (outcomes.length === 0) {
    return { success: true, updated: false, message: 'Keine Outcomes vorhanden.' };
  }

  const companies = await base44.asServiceRole.entities.Company.filter(
    { organization_id }, '-created_date', 500
  );
  const companyMap = {};
  companies.forEach(c => { companyMap[c.id] = c; });

  const reasonCodeSignals = {};
  const categoryStats = {};
  const keywordStats = {};
  const signalWins = {};

  for (const outcome of outcomes) {
    const company = companyMap[outcome.company_id];
    if (!company) continue;

    const otype = outcome.outcome_type;
    const ts = outcome.created_date || new Date().toISOString();
    const rcEffect = interpretReasonCode(outcome.outcome_reason_code);
    const category = company.matched_search_category || company.matched_target_customer_type || company.source_query || null;

    if (category && rcEffect?.categorySignal) {
      if (!reasonCodeSignals[category]) reasonCodeSignals[category] = { boost: 0, reduce: 0 };
      if (rcEffect.categorySignal === 'boost') reasonCodeSignals[category].boost++;
      if (rcEffect.categorySignal === 'reduce') reasonCodeSignals[category].reduce++;
    }

    if (category) {
      if (!categoryStats[category]) categoryStats[category] = { won: 0, relevant: 0, not_relevant: 0, total: 0 };
      categoryStats[category].total++;
      if (otype === 'won') categoryStats[category].won++;
      else if (otype === 'relevant') categoryStats[category].relevant++;
      else if (otype === 'not_relevant') categoryStats[category].not_relevant++;
    }

    const rawKeywords = [];
    if (company.source_query) rawKeywords.push(company.source_query);
    if (company.matched_target_customer_type) rawKeywords.push(company.matched_target_customer_type);
    if (company.matched_search_category && company.matched_search_category !== company.source_query) rawKeywords.push(company.matched_search_category);
    if (company.branche && company.branche !== company.matched_target_customer_type) rawKeywords.push(company.branche);

    for (const rawKw of rawKeywords) {
      const kw = normalizeKeyword(rawKw);
      if (!kw) continue;
      if (!keywordStats[kw]) keywordStats[kw] = { won_count: 0, relevant_count: 0, not_relevant_count: 0, total_count: 0, last_seen_at: ts };
      keywordStats[kw].total_count++;
      if (otype === 'won') keywordStats[kw].won_count++;
      else if (otype === 'relevant') keywordStats[kw].relevant_count++;
      else if (otype === 'not_relevant') keywordStats[kw].not_relevant_count++;
      if (ts > keywordStats[kw].last_seen_at) keywordStats[kw].last_seen_at = ts;
    }

    if (otype === 'won') {
      const signals = (company.relevance_reason || '').split(' | ');
      for (const signal of signals) {
        const s = signal.replace('Signal: ', '').replace(/"/g, '').trim();
        if (s && s.length > 2 && !isGenericTerm(s)) signalWins[s] = (signalWins[s] || 0) + 1;
      }
    }
  }

  const categoryScores = Object.entries(categoryStats).map(([cat, stats]) => {
    const rcBoost = (reasonCodeSignals[cat]?.boost || 0) * 2;
    const rcReduce = (reasonCodeSignals[cat]?.reduce || 0) * 2;
    return {
      category: cat, ...stats,
      rc_boost: reasonCodeSignals[cat]?.boost || 0,
      rc_reduce: reasonCodeSignals[cat]?.reduce || 0,
      score: Math.max(0, Math.min(100,
        50 + (stats.won * 3) + (stats.relevant * 1) - (stats.not_relevant * 2) + rcBoost - rcReduce
      ))
    };
  }).sort((a, b) => b.score - a.score);

  // Konservative Schwellen v2: >=5 Feedbacks UND >70% not_relevant
  const badCategories = categoryScores
    .filter(c => c.total >= 5 && (c.not_relevant / c.total) > 0.7)
    .map(c => c.category);

  // Weiche Schwelle: >=3 + >60% → nur für Transparenz, kein automatischer Ausschluss
  const suggestedExcludedCategories = categoryScores
    .filter(c => c.total >= 3 && (c.not_relevant / c.total) > 0.6 && !badCategories.includes(c.category))
    .map(c => c.category);

  const badCategorySet = new Set(badCategories.map(c => c.toLowerCase()));

  const boostedKeywords = Object.entries(keywordStats)
    .map(([keyword, stats]) => {
      const score = (stats.won_count * 3) + (stats.relevant_count * 1) - (stats.not_relevant_count * 2);
      return { keyword, ...stats, score, source: 'outcome_feedback' };
    })
    .filter(k => k.total_count >= 2 && k.score > 0 && !badCategorySet.has(k.keyword.toLowerCase()))
    .sort((a, b) => b.score - a.score || b.won_count - a.won_count)
    .slice(0, 15);

  const winningSignals = Object.entries(signalWins)
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([signal, won_count]) => ({ signal, won_count }));

  // OrgLearnedSignals speichern
  const learnedData = {
    organization_id,
    priority_categories: JSON.stringify(categoryScores),
    boosted_keywords: JSON.stringify(boostedKeywords),
    excluded_categories: JSON.stringify(badCategories),
    winning_signals: JSON.stringify(winningSignals),
    last_computed_at: new Date().toISOString(),
    total_outcomes_analyzed: outcomes.length,
    version: 2,
  };
  if (suggestedExcludedCategories.length > 0) {
    learnedData.suggested_excluded_categories = JSON.stringify(suggestedExcludedCategories);
  }

  const existing = await base44.asServiceRole.entities.OrgLearnedSignals.filter({ organization_id });
  if (existing[0]) {
    await base44.asServiceRole.entities.OrgLearnedSignals.update(existing[0].id, learnedData);
  } else {
    await base44.asServiceRole.entities.OrgLearnedSignals.create(learnedData);
  }

  // Nur harte Ausschlüsse (>=5 + >70%) in OrganizationSettings schreiben
  if (badCategories.length > 0) {
    const settingsRecords = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id });
    const settings = {};
    settingsRecords.forEach(s => { settings[s.key] = s; });
    const currentExcluded = (settings['excluded_customer_types']?.value || '').split(', ').filter(x => x.trim());
    const newExcluded = [...new Set([...currentExcluded, ...badCategories])];
    if (settings['excluded_customer_types']) {
      await base44.asServiceRole.entities.OrganizationSettings.update(settings['excluded_customer_types'].id, { value: newExcluded.join(', ') });
    } else {
      await base44.asServiceRole.entities.OrganizationSettings.create({ organization_id, key: 'excluded_customer_types', value: newExcluded.join(', ') });
    }
  }

  // Audit-Log
  try {
    await base44.asServiceRole.entities.PlatformAuditLog.create({
      actor_email: 'system_feedback_loop',
      actor_role: 'system',
      action: 'learning_loop_updated',
      target_type: 'organization',
      target_id: organization_id,
      organization_id,
      reason: `v3 outcomes=${outcomes.length} hard_excluded=${badCategories.length} suggested=${suggestedExcludedCategories.length} boosted=${boostedKeywords.slice(0,3).map(k=>k.keyword).join(', ')}`
    });
  } catch (auditErr) {
    console.warn('[processLeadOutcomeFeedback] Audit-Log-Fehler:', auditErr.message);
  }

  console.info(`[processLeadOutcomeFeedback] org=${organization_id} outcomes=${outcomes.length} categories=${categoryScores.length} hard_excluded=${badCategories.length} suggested=${suggestedExcludedCategories.length} keywords=${boostedKeywords.length}`);

  // OrganizationKeywordProfile aktualisieren
  try {
    const existingProfiles = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ organization_id });
    const profileMap = {};
    existingProfiles.forEach(p => { profileMap[p.keyword.toLowerCase()] = p; });
    const settingsRecords2 = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id });
    const settingsMap = {};
    settingsRecords2.forEach(s => { settingsMap[s.key] = s.value; });
    const now = new Date().toISOString();
    const updates = [];
    for (const [keyword, stats] of Object.entries(keywordStats)) {
      const kwLower = keyword.toLowerCase();
      const score = (stats.won_count * 3) + (stats.relevant_count * 1) - (stats.not_relevant_count * 2);
      let status = 'suggested';
      let isBoosted = false;
      let isReduced = false;
      if (score >= 5 && stats.total_count >= 2) { status = 'boosted'; isBoosted = true; }
      else if (score <= -3 && stats.total_count >= 3) { status = 'reduced'; isReduced = true; }
      else if (score > 0 && stats.total_count >= 1) { status = 'active'; }
      const existingProfile = profileMap[kwLower];
      const profileData = {
        organization_id,
        industry_id: settingsMap['industry_id'] || '',
        keyword,
        source: existingProfile?.source || 'outcome_feedback',
        status, score,
        won_count: stats.won_count,
        relevant_count: stats.relevant_count,
        not_relevant_count: stats.not_relevant_count,
        total_count: stats.total_count,
        last_feedback_at: now,
        is_boosted: isBoosted,
        is_reduced: isReduced,
        is_user_added: existingProfile?.is_user_added || false,
      };
      if (existingProfile) {
        updates.push(base44.asServiceRole.entities.OrganizationKeywordProfile.update(existingProfile.id, profileData));
      } else {
        updates.push(base44.asServiceRole.entities.OrganizationKeywordProfile.create({ ...profileData, used_in_research_count: 0 }));
      }
    }
    if (updates.length > 0) await Promise.all(updates);
    console.info(`[processLeadOutcomeFeedback] KeywordProfile: ${updates.length} Keywords aktualisiert`);
  } catch (profileErr) {
    console.warn(`[processLeadOutcomeFeedback] KeywordProfile-Fehler (non-blocking): ${profileErr.message}`);
  }

  return {
    success: true,
    updated: true,
    categories_analyzed: categoryScores.length,
    hard_excluded_categories: badCategories,
    suggested_excluded_categories: suggestedExcludedCategories,
    boosted_keywords: boostedKeywords.length,
    boosted_keywords_preview: boostedKeywords.slice(0, 5).map(k => `${k.keyword} (score=${k.score})`),
    winning_signals: winningSignals.length,
    total_outcomes: outcomes.length,
    keyword_profiles_updated: Object.keys(keywordStats).length,
    reason_codes_processed: outcomes.filter(o => o.outcome_reason_code).length,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;

    // Auth prüfen
    const user = await base44.auth.me().catch(() => null);

    // Daily-Run (kein organization_id): nur PlatformAdmin darf das
    if (!organization_id) {
      if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
        return Response.json({ error: 'Forbidden: Admin-Rechte erforderlich für Daily-Run' }, { status: 403 });
      }
      const allOrgs = await base44.asServiceRole.entities.Organization.list('-created_date', 1000);
      const activeOrgs = allOrgs.filter(o => o.platform_status !== 'suspended' && o.abuse_status !== 'blocked');
      const results = [];
      for (const org of activeOrgs) {
        try {
          const result = await processFeedbackForOrg(base44, org.id);
          results.push({ org_id: org.id, ...result });
        } catch (e) {
          console.error(`[processLeadOutcomeFeedback] org=${org.id} error:`, e.message);
          results.push({ org_id: org.id, error: e.message, success: false });
        }
      }
      console.info(`[processLeadOutcomeFeedback] daily_run: ${activeOrgs.length} orgs`);
      return Response.json({ success: true, mode: 'all_orgs', processed: results.length, results });
    }

    // Einzel-Org: Tenant-Check wenn User vorhanden
    if (user) {
      const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin', 'support_agent'].includes(user.role);
      if (!isPlatformAdmin) {
        const [ownerOrgs, memberRecords] = await Promise.all([
          base44.asServiceRole.entities.Organization.filter({ owner_email: user.email, id: organization_id }),
          base44.asServiceRole.entities.OrganizationMember.filter({ organization_id, user_email: user.email }),
        ]);
        const isOwner = ownerOrgs?.length > 0;
        const isMember = memberRecords?.some(m => m.status === 'active');
        if (!isOwner && !isMember) {
          return Response.json({ error: 'Forbidden: Kein Zugriff auf diese Organisation' }, { status: 403 });
        }
      }
    } else {
      // Kein User → Scheduler/Automation: Cron-Token prüfen
      const cronToken = req.headers.get('x-cron-secret') || body.cron_secret;
      const expectedToken = Deno.env.get('BASE44_APP_ID');
      if (!cronToken || cronToken !== expectedToken) {
        return Response.json({ error: 'Forbidden: Auth erforderlich' }, { status: 403 });
      }
    }

    const result = await processFeedbackForOrg(base44, organization_id);
    return Response.json(result);

  } catch (error) {
    console.error('[processLeadOutcomeFeedback] Error:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});