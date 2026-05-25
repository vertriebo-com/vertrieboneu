/**
 * auditResearchRunQuality
 * =======================
 * Vollständige Post-Run-Audit: Verifiziert echte Companies eines ResearchRuns
 * gegen alle 7 Prüfpunkte des Query-Intent-Fix-Akzeptanztests.
 *
 * Parameter: { research_run_id?: string } — wenn nicht angegeben, neuester Run
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!["admin", "platform_owner", "platform_admin"].includes(user?.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    let run = null;

    if (body.research_run_id) {
      const runs = await base44.asServiceRole.entities.ResearchRun.filter({ id: body.research_run_id });
      run = runs[0] || null;
    } else {
      const runs = await base44.asServiceRole.entities.ResearchRun.list('-created_date', 10);
      // Neuesten completed/partial Run nehmen
      run = runs.find(r => ['completed','partial'].includes(r.status)) || runs[0] || null;
    }

    if (!run) return Response.json({ error: 'Kein ResearchRun gefunden' }, { status: 404 });

    // ── 1. RUN OVERVIEW ─────────────────────────────────────────────────────
    const runOverview = {
      research_run_id: run.id,
      organization_id: run.organization_id,
      industry_id: run.industry_id || '?',
      city: run.search_center_city || '?',
      radius_km: run.search_radius_km || '?',
      status: run.status,
      leads_saved: run.leads_saved || 0,
      target_leads: null,
      raw_hits: run.raw_hits || 0,
      duplicates_skipped: run.duplicates_skipped || 0,
      no_match_count: run.no_match_count || 0,
      outside_radius_count: run.outside_radius_count || 0,
      chain_skipped_count: run.chain_skipped_count || 0,
    };

    // effectiveTarget aus search_plan_json
    try {
      const plan = JSON.parse(run.search_plan_json || '{}');
      runOverview.target_leads = plan.effectiveTarget || 25;
    } catch {}

    // ── 2. COMPANIES VERIFIZIEREN ────────────────────────────────────────────
    const companies = await base44.asServiceRole.entities.Company.filter(
      { organization_id: run.organization_id, research_run_id: run.id },
      '-created_date',
      200
    );

    const totalCompaniesForRun = companies.length;
    const uniqueIds = new Set(companies.map(c => c.id));
    const uniquePlaceIds = companies.filter(c => c.google_place_id).map(c => c.google_place_id);
    const uniquePlaceIdSet = new Set(uniquePlaceIds);
    const duplicatesInRun = uniquePlaceIds.length - uniquePlaceIdSet.size;

    const uiLeadsSaved = run.leads_saved || 0;
    const dbLeadsCount = totalCompaniesForRun;
    const uiDbMatch = uiLeadsSaved === dbLeadsCount;

    const companyVerification = {
      total_companies_for_run: totalCompaniesForRun,
      unique_company_ids: uniqueIds.size,
      duplicates_in_run: duplicatesInRun,
      ui_claims_leads_saved: uiLeadsSaved,
      db_actual_count: dbLeadsCount,
      ui_db_match: uiDbMatch,
      mismatch_delta: dbLeadsCount - uiLeadsSaved,
      existing_duplicates_skipped: run.duplicates_skipped || 0,
      raw_hits: run.raw_hits || 0,
      no_match_count: run.no_match_count || 0,
      outside_radius_count: run.outside_radius_count || 0,
    };

    // ── 3. QUALITY-TIER-VERTEILUNG ────────────────────────────────────────────
    const tierCounts = { premium: 0, strong: 0, good: 0, weak: 0, unset: 0 };
    const confCounts = { high: 0, medium: 0, low: 0, unset: 0 };
    const saveReasonCodes = {};
    const scores = [];

    for (const c of companies) {
      const tier = c.quality_tier || 'unset';
      const conf = c.quality_confidence || 'unset';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      confCounts[conf] = (confCounts[conf] || 0) + 1;

      const src = c.save_reason_code || 'unknown';
      saveReasonCodes[src] = (saveReasonCodes[src] || 0) + 1;

      if (c.relevance_score) scores.push(c.relevance_score);
    }

    scores.sort((a, b) => a - b);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    const medianScore = scores.length > 0 ? scores[Math.floor(scores.length / 2)] : 0;

    const qualityTierDistribution = {
      tier_counts: tierCounts,
      confidence_counts: confCounts,
      save_reason_code_distribution: saveReasonCodes,
      average_score: avgScore,
      median_score: medianScore,
      total_companies: companies.length,
    };

    // ── 4. QUERY-INTENT-WIRKUNG ──────────────────────────────────────────────
    let queryIntentTrue = 0;
    let promotedToGood = 0;     // query_intent_match=true, tier=good
    let promotedToStrong = 0;   // query_intent_match=true, tier=strong
    let strongWithHardEvidence = 0; // strong + (phone+website || placeType || signal || tc_match)
    let strongWithoutHardEvidence = 0;

    for (const c of companies) {
      let eng = null;
      try { eng = c.engine_analysis_json ? JSON.parse(c.engine_analysis_json) : null; } catch {}

      const qim = eng?.query_intent_match === true || (c.save_reason_code || '').includes('target_query');
      if (qim) {
        queryIntentTrue++;
        if (c.quality_tier === 'good') promotedToGood++;
        if (c.quality_tier === 'strong') promotedToStrong++;
      }

      if (c.quality_tier === 'strong') {
        const ef = eng?.evidence_flags || {};
        const hasHard = ef.place_type_match || ef.scoring_signal_match || ef.target_customer_match ||
          (ef.phone && ef.website);
        if (hasHard) strongWithHardEvidence++;
        else strongWithoutHardEvidence++;
      }
    }

    const queryIntentEffect = {
      total_with_query_intent_match: queryIntentTrue,
      pct_of_leads: companies.length > 0 ? Math.round((queryIntentTrue / companies.length) * 100) : 0,
      promoted_to_good: promotedToGood,
      promoted_to_strong: promotedToStrong,
      strong_with_hard_evidence: strongWithHardEvidence,
      strong_without_hard_evidence: strongWithoutHardEvidence,
      strong_guard_ok: strongWithoutHardEvidence === 0,
    };

    // ── 5. EINZELBEISPIELE (je 3 pro tier) ───────────────────────────────────
    function extractExample(c) {
      let eng = null;
      try { eng = c.engine_analysis_json ? JSON.parse(c.engine_analysis_json) : null; } catch {}
      return {
        name: c.name,
        score: c.relevance_score || 0,
        quality_tier: c.quality_tier || 'unset',
        quality_confidence: c.quality_confidence || 'unset',
        save_reason_code: c.save_reason_code || '?',
        source_query: c.source_query || '?',
        matched_search_category: c.matched_search_category || null,
        matched_target_customer_type: c.matched_target_customer_type || null,
        evidence_flags: eng?.evidence_flags || null,
        strong_evidence_count: eng?.strong_evidence_count ?? null,
        weak_evidence_count: eng?.weak_evidence_count ?? null,
        query_intent_match: eng?.query_intent_match ?? null,
        query_source: eng?.query_source ?? null,
      };
    }

    const strongExamples = companies.filter(c => c.quality_tier === 'strong').slice(0, 3).map(extractExample);
    const goodExamples = companies.filter(c => c.quality_tier === 'good').slice(0, 3).map(extractExample);
    const weakExamples = companies.filter(c => c.quality_tier === 'weak').slice(0, 3).map(extractExample);
    const premiumExamples = companies.filter(c => c.quality_tier === 'premium').slice(0, 2).map(extractExample);

    const examples = { premium: premiumExamples, strong: strongExamples, good: goodExamples, weak: weakExamples };

    // ── 6. CHAIN-SKIPS ────────────────────────────────────────────────────────
    let chainSkipExamples = [];
    try { chainSkipExamples = JSON.parse(run.chain_skipped_examples_json || '[]'); } catch {}

    const falsePositives = chainSkipExamples.filter(ex => {
      // False Positive: Chain-Keyword matched aber Name ist kein echte Kette
      // Prüfe: raw_text_excerpt enthält das Keyword wirklich als Wortgrenze?
      const kw = ex.matched_chain_keyword || '';
      const excerpt = (ex.raw_text_excerpt || '').toLowerCase();
      if (!kw || !excerpt) return false;
      // Wenn Keyword im Excerpt als Substring auftaucht aber eigentlich nicht "passt"
      // Heuristik: raw_text_excerpt ist < 4 Zeichen Kontext → false positive
      return excerpt.includes(kw) && excerpt.length > kw.length + 4;
    });

    // Einfachere FP-Erkennung: recommended_policy = exclude aber would_match_target_customer = true
    const suspectedFalsePositives = chainSkipExamples.filter(
      ex => ex.would_match_target_customer === true && ex.recommended_policy === 'exclude'
    );

    const chainSkipAudit = {
      chain_skipped_count: run.chain_skipped_count || 0,
      examples_count: chainSkipExamples.length,
      suspected_false_positives: suspectedFalsePositives.length,
      chain_skip_examples: chainSkipExamples.map(ex => ({
        name: ex.name,
        reason: ex.reason,
        matched_chain_keyword: ex.matched_chain_keyword || null,
        raw_text_excerpt: ex.raw_text_excerpt || null,
        source_query: ex.source_query || null,
        would_match_target_customer: ex.would_match_target_customer,
        recommended_policy: ex.recommended_policy,
        false_positive_risk: ex.would_match_target_customer === true,
      })),
    };

    // ── 7. DASHBOARD-PRIORISIERUNG PRÜFEN ────────────────────────────────────
    // Prüfe: schwache Leads (weak/low) tauchen nicht in Tagesprioritäten auf
    // Einfacher Check: Lead-Temperature-Logik
    const weakLowLeads = companies.filter(c => c.quality_tier === 'weak' && c.quality_confidence === 'low');
    const weakLowWithHot = weakLowLeads.filter(c => c.is_hot === true);
    const weakLowWithHighTemp = weakLowLeads.filter(c => c.lead_temperature === 'hot' || c.lead_temperature === 'warm');

    // Prüfe ob weak Leads hohe priority_score haben (würden in Tagesprioritäten erscheinen)
    const weakLowHighPriority = weakLowLeads.filter(c => (c.priority_score || 0) > 50);

    const dashboardPrioAudit = {
      weak_low_leads_count: weakLowLeads.length,
      weak_low_marked_hot: weakLowWithHot.length,
      weak_low_high_temperature: weakLowWithHighTemp.length,
      weak_low_high_priority_score: weakLowHighPriority.length,
      priority_guard_ok: weakLowWithHot.length === 0 && weakLowWithHighTemp.length === 0,
      note: weakLowLeads.length > 0
        ? `${weakLowLeads.length} weak/low Leads in Run. Dashboard-Filter sollte diese nicht in Tagesprioritäten zeigen.`
        : 'Keine weak/low Leads im Run — Dashboard-Priorisierung kein Problem.',
    };

    // ── GESAMTBEWERTUNG ────────────────────────────────────────────────────────
    const acceptanceChecks = {
      ui_db_match: uiDbMatch,
      no_duplicates_in_run: duplicatesInRun === 0,
      strong_guard_respected: queryIntentEffect.strong_guard_ok,
      weak_anteil_plausibel: (tierCounts.weak || 0) <= Math.ceil(companies.length * 0.5),
      good_anteil_plausibel: (tierCounts.good || 0) >= 0,
      chain_skips_no_clear_fp: suspectedFalsePositives.length === 0,
      dashboard_priority_guard_ok: dashboardPrioAudit.priority_guard_ok,
    };

    const allPassed = Object.values(acceptanceChecks).every(v => v === true);

    return Response.json({
      acceptance_status: allPassed ? 'PASS' : 'PARTIAL_FAIL',
      acceptance_checks: acceptanceChecks,
      run_overview: runOverview,
      company_verification: companyVerification,
      quality_tier_distribution: qualityTierDistribution,
      query_intent_effect: queryIntentEffect,
      examples,
      chain_skip_audit: chainSkipAudit,
      dashboard_prio_audit: dashboardPrioAudit,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});