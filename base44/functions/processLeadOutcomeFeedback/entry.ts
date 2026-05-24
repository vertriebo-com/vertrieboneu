import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Generische Begriffe die keine Keyword-Qualität haben
// Generische Begriffe ohne Branchenbezug – keine Zielgruppen, keine Suchbegriffe
// WICHTIG: Keine branchenspezifischen Begriffe hier – diese Liste nur für echte Non-Keywords
const GENERIC_TERMS = new Set([
  'dienstleister', 'firma', 'unternehmen', 'gmbh', 'service', 'deutschland',
  'unbekannt', 'sonstiges', 'betrieb', 'gesellschaft', 'co', 'kg', 'ag',
  'holding', 'gruppe', 'verbund', 'team', 'office', 'ug', 'inc', 'ltd'
]);

function isGenericTerm(kw) {
  if (!kw || kw.trim().length < 3) return true;
  const lower = kw.trim().toLowerCase();
  return GENERIC_TERMS.has(lower);
}

function normalizeKeyword(kw) {
  if (!kw) return null;
  // Saubere Normalisierung: trim, max 60 Zeichen, kein reiner Zahlen-String
  const cleaned = kw.trim().slice(0, 60);
  if (!cleaned || /^\d+$/.test(cleaned)) return null;
  if (isGenericTerm(cleaned)) return null;
  return cleaned;
}

// ── Hilfsfunktion: Feedback für eine einzelne Organisation verarbeiten ──
async function processFeedbackForOrg(base44, organization_id) {
  // Alle Outcomes dieser Organisation laden
  const outcomes = await base44.asServiceRole.entities.LeadOutcome.filter(
    { organization_id },
    '-created_date',
    500
  );

  if (outcomes.length === 0) {
    return { success: true, updated: false, message: 'Keine Outcomes vorhanden.' };
  }

  // Alle zugehörigen Companies laden
  const companies = await base44.asServiceRole.entities.Company.filter(
    { organization_id },
    '-created_date',
    500
  );
  const companyMap = {};
  companies.forEach(c => { companyMap[c.id] = c; });

  // ── Kategorie-Stats, Keywords, Signals ──────────────────────────
  const categoryStats = {};
  // keyword → { won_count, relevant_count, not_relevant_count, total_count, last_seen_at }
  const keywordStats = {};
  const signalWins = {};

  for (const outcome of outcomes) {
    const company = companyMap[outcome.company_id];
    if (!company) continue;

    const otype = outcome.outcome_type; // 'won' | 'relevant' | 'not_relevant'
    const now = outcome.created_date || new Date().toISOString();

    // ── Kategorie für Ausschluss/Priorisierung ──
    const category = company.matched_search_category || company.matched_target_customer_type || company.source_query || null;
    if (category) {
      if (!categoryStats[category]) {
        categoryStats[category] = { won: 0, relevant: 0, not_relevant: 0, total: 0 };
      }
      categoryStats[category].total++;
      if (otype === 'won') categoryStats[category].won++;
      else if (otype === 'relevant') categoryStats[category].relevant++;
      else if (otype === 'not_relevant') categoryStats[category].not_relevant++;
    }

    // ── Keyword-Quellen sammeln ──
    const rawKeywords = [];
    if (company.source_query) rawKeywords.push(company.source_query);
    if (company.matched_target_customer_type) rawKeywords.push(company.matched_target_customer_type);
    if (company.matched_search_category && company.matched_search_category !== company.source_query) rawKeywords.push(company.matched_search_category);
    // branche nur wenn nicht generisch
    if (company.branche && company.branche !== company.matched_target_customer_type) rawKeywords.push(company.branche);

    for (const rawKw of rawKeywords) {
      const kw = normalizeKeyword(rawKw);
      if (!kw) continue;

      if (!keywordStats[kw]) {
        keywordStats[kw] = { won_count: 0, relevant_count: 0, not_relevant_count: 0, total_count: 0, last_seen_at: now };
      }
      keywordStats[kw].total_count++;
      if (otype === 'won') keywordStats[kw].won_count++;
      else if (otype === 'relevant') keywordStats[kw].relevant_count++;
      else if (otype === 'not_relevant') keywordStats[kw].not_relevant_count++;
      // last_seen_at = neuestes Datum
      if (now > keywordStats[kw].last_seen_at) keywordStats[kw].last_seen_at = now;
    }

    // ── Scoring-Signale aus Abschlüssen ──
    if (otype === 'won') {
      const signals = (company.relevance_reason || '').split(' | ');
      for (const signal of signals) {
        const s = signal.replace('Signal: ', '').replace(/"/g, '').trim();
        if (s && s.length > 2 && !isGenericTerm(s)) {
          signalWins[s] = (signalWins[s] || 0) + 1;
        }
      }
    }
  }

  // ── Kategorie-Score berechnen ──────────────────────────────────
  // Score 0-100: Basis 50 + won×3 + relevant×1 - not_relevant×2
  const categoryScores = Object.entries(categoryStats).map(([cat, stats]) => ({
    category: cat,
    ...stats,
    score: Math.max(0, Math.min(100,
      50 + (stats.won * 3) + (stats.relevant * 1) - (stats.not_relevant * 2)
    ))
  })).sort((a, b) => b.score - a.score);

  // ── Ausschlüsse (min 3 Feedbacks UND >60% not_relevant) ───────
  const badCategories = categoryScores
    .filter(c => c.total >= 3 && (c.not_relevant / c.total) > 0.6)
    .map(c => c.category);

  const badCategorySet = new Set(badCategories.map(c => c.toLowerCase()));

  // ── Keyword-Scoring (won=+3, relevant=+1, not_relevant=-2) ─────
  // Mindestbedingungen: total_count >= 2, score > 0, nicht generisch, nicht excluded
  const boostedKeywords = Object.entries(keywordStats)
    .map(([keyword, stats]) => {
      const score = (stats.won_count * 3) + (stats.relevant_count * 1) - (stats.not_relevant_count * 2);
      return {
        keyword,
        won_count: stats.won_count,
        relevant_count: stats.relevant_count,
        not_relevant_count: stats.not_relevant_count,
        total_count: stats.total_count,
        score,
        source: 'outcome_feedback',
        last_seen_at: stats.last_seen_at,
      };
    })
    .filter(k => k.total_count >= 2 && k.score > 0 && !badCategorySet.has(k.keyword.toLowerCase()))
    .sort((a, b) => b.score - a.score || b.won_count - a.won_count)
    .slice(0, 15);

  // ── Winning Signals nach Abschlüssen ────────────────────────────
  const winningSignals = Object.entries(signalWins)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([signal, won_count]) => ({ signal, won_count }));

  // ── OrgLearnedSignals speichern ─────────────────────────────────
  const learnedData = {
    organization_id,
    priority_categories: JSON.stringify(categoryScores),
    boosted_keywords: JSON.stringify(boostedKeywords),
    excluded_categories: JSON.stringify(badCategories),
    winning_signals: JSON.stringify(winningSignals),
    last_computed_at: new Date().toISOString(),
    total_outcomes_analyzed: outcomes.length,
    version: 1
  };

  const existing = await base44.asServiceRole.entities.OrgLearnedSignals.filter(
    { organization_id }
  );
  if (existing[0]) {
    await base44.asServiceRole.entities.OrgLearnedSignals.update(
      existing[0].id,
      learnedData
    );
  } else {
    await base44.asServiceRole.entities.OrgLearnedSignals.create(learnedData);
  }

  // ── excluded_customer_types in OrganizationSettings aktualisieren ──
  const settingsRecords = await base44.asServiceRole.entities.OrganizationSettings.filter(
    { organization_id }
  );
  const settings = {};
  settingsRecords.forEach(s => { settings[s.key] = s; });

  const currentExcluded = (settings['excluded_customer_types']?.value || '')
    .split(', ')
    .filter(x => x.trim());
  const newExcluded = [...new Set([...currentExcluded, ...badCategories])];

  if (settings['excluded_customer_types']) {
    await base44.asServiceRole.entities.OrganizationSettings.update(
      settings['excluded_customer_types'].id,
      { value: newExcluded.join(', ') }
    );
  } else if (newExcluded.length > 0) {
    await base44.asServiceRole.entities.OrganizationSettings.create({
      organization_id,
      key: 'excluded_customer_types',
      value: newExcluded.join(', ')
    });
  }

  // Audit-Eintrag für Transparenz
  try {
    await base44.asServiceRole.entities.PlatformAuditLog.create({
      actor_email: 'system_feedback_loop',
      actor_role: 'system',
      action: 'auto_excluded_categories',
      target_type: 'organization',
      target_id: organization_id,
      organization_id: organization_id,
      reason: `Auto-ausgeschlossen: ${badCategories.join(', ')} | boosted_keywords: ${boostedKeywords.slice(0,3).map(k=>k.keyword).join(', ')}`
    });
  } catch (auditErr) {
    console.warn('[processLeadOutcomeFeedback] Audit-Log-Fehler:', auditErr.message);
  }

  console.info(`[processLeadOutcomeFeedback] org=${organization_id} categories=${categoryScores.length} keywords=${boostedKeywords.length} won=${outcomes.filter(o=>o.outcome_type==='won').length} excluded=${badCategories.length}`);

  // ── OrganizationKeywordProfile aktualisieren (Phase 2) ─────────────────────
  try {
    // Bestehende Profile laden
    const existingProfiles = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ organization_id });
    const profileMap = {};
    existingProfiles.forEach(p => { profileMap[p.keyword.toLowerCase()] = p; });

    const now = new Date().toISOString();
    const updates = [];

    // Keywords aus Feedback verarbeiten
    for (const [keyword, stats] of Object.entries(keywordStats)) {
      const kwLower = keyword.toLowerCase();
      const score = (stats.won_count * 3) + (stats.relevant_count * 1) - (stats.not_relevant_count * 2);
      
      // Status-Regeln
      let status = 'suggested';
      let isBoosted = false;
      let isReduced = false;
      
      if (score >= 5 && stats.total_count >= 2) {
        status = 'boosted';
        isBoosted = true;
      } else if (score <= -3 && stats.total_count >= 3) {
        status = 'reduced';
        isReduced = true;
      } else if (score > 0 && stats.total_count >= 1) {
        status = 'active';
      }

      // Source bestimmen
      let source = 'outcome_feedback';
      let isUserAdded = false;
      if (profileMap[kwLower]) {
        source = profileMap[kwLower].source;
        isUserAdded = profileMap[kwLower].is_user_added || false;
      }

      const profileData = {
        organization_id,
        industry_id: settings.industry_id || org.industry || '',
        keyword,
        source,
        status,
        score,
        won_count: stats.won_count,
        relevant_count: stats.relevant_count,
        not_relevant_count: stats.not_relevant_count,
        total_count: stats.total_count,
        last_feedback_at: now,
        is_boosted: isBoosted,
        is_reduced: isReduced,
        is_user_added: isUserAdded,
      };

      if (profileMap[kwLower]) {
        // Update bestehend
        updates.push(
          base44.asServiceRole.entities.OrganizationKeywordProfile.update(
            profileMap[kwLower].id,
            profileData
          )
        );
      } else {
        // Create neu
        updates.push(
          base44.asServiceRole.entities.OrganizationKeywordProfile.create({
            ...profileData,
            used_in_research_count: 0,
            last_used_at: null,
          })
        );
      }
    }

    // Alle Updates parallel ausführen
    if (updates.length > 0) {
      await Promise.all(updates);
      console.info(`[processLeadOutcomeFeedback] KeywordProfile aktualisiert: ${updates.length} Keywords`);
    }
  } catch (profileErr) {
    console.warn(`[processLeadOutcomeFeedback] KeywordProfile-Fehler (non-blocking): ${profileErr.message}`);
  }

  return {
    success: true,
    updated: true,
    categories_analyzed: categoryScores.length,
    bad_categories: badCategories,
    boosted_keywords: boostedKeywords.length,
    boosted_keywords_preview: boostedKeywords.slice(0, 5).map(k => `${k.keyword} (score=${k.score})`),
    winning_signals: winningSignals.length,
    total_outcomes: outcomes.length,
    keyword_profiles_updated: Object.keys(keywordStats).length
  };
}

// ── Main Handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;

    // ── Daily-Run Modus: alle aktiven Organisationen durchlaufen ──────
    if (!organization_id) {
      const allOrgs = await base44.asServiceRole.entities.Organization.list(
        '-created_date',
        1000
      );
      const activeOrgs = allOrgs.filter(o => 
        o.platform_status !== 'suspended' && 
        o.abuse_status !== 'blocked'
      );
      
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
      
      console.info(`[processLeadOutcomeFeedback] daily_run completed: ${activeOrgs.length} orgs processed`);
      
      return Response.json({ 
        success: true, 
        mode: 'all_orgs', 
        processed: results.length,
        results 
      });
    }

    // ── Einzel-Org Modus (Frontend-Trigger) ──────────────────────────
    const result = await processFeedbackForOrg(base44, organization_id);
    return Response.json(result);

  } catch (error) {
    console.error('[processLeadOutcomeFeedback] Error:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});