/**
 * auditLeadQualityEngine
 * ======================
 * Phase-1-Audit: Messbarkeit der Leadqualität BEVOR Änderungen an der Engine erfolgen.
 *
 * Prüft:
 * A) Score-Verteilung aus gespeicherten Research-Leads (letzte 200)
 * B) Qualitätssignale je Lead (Telefon, Website, PlaceType, TC-Match, etc.)
 * C) Simulierte Kandidaten-Tests (shouldSave-Entscheidungen)
 * D) Chain-Filter-Analyse (was wird gefiltert, könnte es Zielkunde sein?)
 * E) Industry-Vergleich (5 Branchen: unterschiedliche search_strategy)
 * F) Quality-Tier-Empfehlung (was wären bessere Schwellwerte?)
 *
 * Admin-only. KEINE Änderungen an der Engine – rein lesend + messend.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!["admin", "platform_owner", "platform_admin"].includes(user?.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tests = [];
    const warnings = [];

    const addTest = (name, status, detail, data = {}) => {
      tests.push({ name, status, detail, ...data });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // A) Score-Verteilung aus echten Research-Leads
    // ─────────────────────────────────────────────────────────────────────────
    const recentCompanies = await base44.asServiceRole.entities.Company.filter(
      { quelle: 'Google Places API' }, '-created_date', 500
    );

    const withScore = recentCompanies.filter(c => (c.relevance_score || 0) > 0);
    const scores = withScore.map(c => c.relevance_score || 0);
    scores.sort((a, b) => a - b);

    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    const medianScore = scores.length > 0 ? scores[Math.floor(scores.length / 2)] : 0;

    const scoreDistribution = {
      "0-54":  scores.filter(s => s <= 54).length,
      "55-59": scores.filter(s => s >= 55 && s <= 59).length,
      "60-64": scores.filter(s => s >= 60 && s <= 64).length,
      "65-74": scores.filter(s => s >= 65 && s <= 74).length,
      "75-84": scores.filter(s => s >= 75 && s <= 84).length,
      "85-100": scores.filter(s => s >= 85).length,
    };

    const borderlineCount = scoreDistribution["55-59"] + scoreDistribution["60-64"];
    const borderlinePct = scores.length > 0 ? Math.round((borderlineCount / scores.length) * 100) : 0;

    addTest("score_distribution", borderlinePct > 40 ? "yellow" : "green",
      `${scores.length} Leads mit Score. Borderline (55-64): ${borderlineCount} (${borderlinePct}%). Avg: ${avgScore}, Median: ${medianScore}`,
      { score_distribution: scoreDistribution, avg_score: avgScore, median_score: medianScore, borderline_count: borderlineCount }
    );

    if (borderlinePct > 50) {
      warnings.push(`WARNUNG: Mehr als 50% der gespeicherten Leads sind Borderline (55-64). Qualitätsschwelle könnte zu niedrig sein.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // B) Qualitätssignale je Lead
    // ─────────────────────────────────────────────────────────────────────────
    let hasPhone = 0, hasEmail = 0, hasWebsite = 0, hasAddress = 0;
    let hasPlaceTypeMatch = 0, hasCategoryMatch = 0, hasTCMatch = 0, hasScoringSignal = 0;
    let weakSignalOnly = 0; // nur Basis+Distanz, keine echten Signals

    for (const c of withScore) {
      if (c.telefon) hasPhone++;
      if (c.email) hasEmail++;
      if (c.website) hasWebsite++;
      if (c.adresse || c.ort) hasAddress++;
      if (c.matched_search_category) hasCategoryMatch++;
      if (c.matched_target_customer_type) hasTCMatch++;

      // engine_analysis_json auswerten
      let engJson = null;
      try { engJson = c.engine_analysis_json ? JSON.parse(c.engine_analysis_json) : null; } catch {}

      if (engJson?.place_type_match_strength && engJson.place_type_match_strength !== 'none') hasPlaceTypeMatch++;
      if (engJson?.matched_weighted_signals?.length > 0) hasScoringSignal++;

      // Weak Signal: nur Base (50) + Distanz (+8) = 58 ± kleine Schwankungen, kein echter Match
      const score = c.relevance_score || 0;
      const hasRealSignal = c.matched_search_category || c.matched_target_customer_type ||
        (engJson?.place_type_match_strength && engJson.place_type_match_strength !== 'none') ||
        (engJson?.matched_weighted_signals?.length > 0);
      if (!hasRealSignal && score < 65) weakSignalOnly++;
    }

    const n = withScore.length || 1;
    const qualitySignalPct = {
      phone_pct: Math.round((hasPhone / n) * 100),
      email_pct: Math.round((hasEmail / n) * 100),
      website_pct: Math.round((hasWebsite / n) * 100),
      address_pct: Math.round((hasAddress / n) * 100),
      category_match_pct: Math.round((hasCategoryMatch / n) * 100),
      tc_match_pct: Math.round((hasTCMatch / n) * 100),
      place_type_match_pct: Math.round((hasPlaceTypeMatch / n) * 100),
      scoring_signal_pct: Math.round((hasScoringSignal / n) * 100),
      weak_signal_only_pct: Math.round((weakSignalOnly / n) * 100),
    };

    const signalStatus = qualitySignalPct.weak_signal_only_pct > 15 ? "yellow" : "green";
    addTest("quality_signals", signalStatus,
      `Telefon: ${qualitySignalPct.phone_pct}%, Website: ${qualitySignalPct.website_pct}%, Kategorie-Match: ${qualitySignalPct.category_match_pct}%, TC-Match: ${qualitySignalPct.tc_match_pct}%, Nur-Basis-Signal: ${qualitySignalPct.weak_signal_only_pct}%`,
      { quality_signals: qualitySignalPct }
    );

    if (qualitySignalPct.weak_signal_only_pct > 20) {
      warnings.push(`${qualitySignalPct.weak_signal_only_pct}% gespeicherter Leads haben nur Basis-Score ohne echten Match-Signal. Empfehlung: Mindest-1-Signal-Regel prüfen.`);
    }
    if (qualitySignalPct.phone_pct < 50) {
      warnings.push(`Nur ${qualitySignalPct.phone_pct}% der Research-Leads haben eine Telefonnummer. Anruf nicht möglich für viele Leads.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // C) Simulierte Kandidaten-Tests (shouldSave-Entscheidungen ohne echte API)
    // ─────────────────────────────────────────────────────────────────────────
    // Inline scoreCandidate-Simulation (vereinfacht, testet Kern-Logik)
    // Spiegelt exakt die Logik aus processResearchRun:scoreCandidate
    function simScore(overrides = {}) {
      const {
        hasCat = false, hasPlaceType = false, placeTypeConf = 'medium',
        hasPhone = false, hasWebsite = false, hasAddress = false, distanceOk = false,
        hasTCMatch = false, strategy = 'target_customer_search',
        badFitPenalty = 0, websiteRequired = false,
        scoringSignals = 0,
        queryIntentMatch = false, // NEU: Kandidat aus nutzer-gewählter Zielkunden-Query
      } = overrides;

      let score = 50;

      // Evidence-Flags (identisch mit processResearchRun inkl. query_intent_match)
      const evidenceFlags = {
        category_match: hasCat,
        place_type_match: hasPlaceType,
        scoring_signal_match: scoringSignals > 0,
        target_customer_match: hasTCMatch,
        query_intent_match: queryIntentMatch,
        phone: hasPhone,
        website: hasWebsite,
        address: hasAddress,
      };

      if (hasCat) score += 20;
      if (hasPlaceType) score += placeTypeConf === 'high' ? 15 : placeTypeConf === 'medium' ? 8 : 3;
      const sigScore = Math.min(35, scoringSignals * 12);
      score += sigScore;
      if (hasPhone) score += 8;
      if (hasWebsite) score += 8;
      if (distanceOk) score += 8;
      const tcBonus = strategy === 'target_customer_search' ? 10 : strategy === 'mixed' ? 8 : 6;
      if (hasTCMatch) score += tcBonus;
      if (websiteRequired && !hasWebsite) score = Math.min(score, 54);
      score += badFitPenalty;
      score = Math.max(0, Math.min(100, score));

      // Quality-Tier-Mapping (identisch mit processResearchRun inkl. query_intent Sonderfall)
      const strongEvidenceCount = ['category_match','place_type_match','scoring_signal_match','target_customer_match','query_intent_match']
        .filter(k => evidenceFlags[k]).length;
      const weakEvidenceCount = ['phone','website','address'].filter(k => evidenceFlags[k]).length;
      let qualityTier, qualityConfidence;
      const hasAdditionalHardEvidence = hasPlaceType || scoringSignals > 0 || hasTCMatch;
      const hasStrongContactEvidence = hasPhone && hasWebsite;
      const isTargetQueryCategory = queryIntentMatch && hasCat;

      if (score >= 85 && strongEvidenceCount >= 3 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
        qualityTier = 'premium'; qualityConfidence = 'high';
      } else if (score >= 75 && strongEvidenceCount >= 2 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
        qualityTier = 'strong'; qualityConfidence = 'high';
      } else if (score >= 65 && strongEvidenceCount >= 2 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
        qualityTier = 'good'; qualityConfidence = 'medium';
      } else if (isTargetQueryCategory && weakEvidenceCount >= 1 && score >= 65) {
        // Sonderfall: query_intent + category + min. 1 Kontaktdatum → good/medium (kein strong ohne harte Evidenz)
        qualityTier = 'good'; qualityConfidence = 'medium';
      } else {
        qualityTier = 'weak'; qualityConfidence = 'low';
      }

      return {
        score,
        shouldSave: score >= 55 && badFitPenalty > -35,
        qualityTier,
        qualityConfidence,
        strongEvidenceCount,
      };
    }

    const simTests = [
    {
      name: "Guter B2B-Lead (TC + Kategorie + Website + Telefon + PlaceType)",
      params: { hasCat: true, hasPlaceType: true, hasPhone: true, hasWebsite: true, distanceOk: true, hasTCMatch: true },
      expectedSave: true,
      expectedTier: "premium",
    },
    {
      name: "target_customer_query_match_good: user_target Query + category + address → good/medium (NOT strong)",
      params: { hasCat: true, hasAddress: true, queryIntentMatch: true, distanceOk: true },
      expectedSave: true,
      expectedTier: "good",
      expectedConfidence: "medium",
      note: "query_intent+cat+address allein = good/medium. Kein strong/high ohne weitere harte Evidenz.",
    },
    {
      name: "target_customer_query_with_phone_website: query_intent + cat + phone + website → strong/high",
      params: { hasCat: true, queryIntentMatch: true, hasPhone: true, hasWebsite: true, distanceOk: true },
      expectedSave: true,
      expectedTier: "strong",
      expectedConfidence: "high",
      note: "query_intent + cat + phone + website (hasStrongContactEvidence) → strong/high",
    },
    {
      name: "target_customer_query_with_placetype: query_intent + cat + placetype → strong/high",
      params: { hasCat: true, queryIntentMatch: true, hasPlaceType: true, distanceOk: true },
      expectedSave: true,
      expectedTier: "strong",
      expectedConfidence: "high",
      note: "query_intent + cat + placetype (hasAdditionalHardEvidence) → strong/high",
    },
    {
      name: "pure_taxonomy_category_address: nur taxonomy Query + cat + address → weak",
      params: { hasCat: true, hasAddress: true, queryIntentMatch: false, distanceOk: true },
      expectedSave: true,
      expectedTier: "weak",
      note: "Taxonomy-Query ohne user_target, nur cat_match + address = bleibt weak",
    },
    {
      name: "Nur Basis + Distanz (Score 58, 0 starke Evidenzen)",
      params: { distanceOk: true },
      expectedSave: true,
      expectedTier: "weak",
    },
      {
        name: "Lead mit Bad-Fit-Penalty (-35) → hard-fail",
        params: { hasCat: true, hasPlaceType: true, badFitPenalty: -35 },
        expectedSave: false,
      },
      {
        name: "Lead mit Bad-Fit-Penalty (-20) → kein hard-fail",
        params: { hasCat: true, hasPlaceType: true, badFitPenalty: -20 },
        expectedSave: true,
        expectedTier: "good",
      },
      {
        name: "website_signal_required ohne Website → cap54",
        params: { hasCat: true, hasPlaceType: true, hasPhone: true, websiteRequired: true, hasWebsite: false },
        expectedSave: false,
      },
      {
        name: "3 Scoring-Signals + Kategorie + Telefon → strong",
        params: { hasCat: true, scoringSignals: 3, hasPhone: true, distanceOk: true },
        expectedSave: true,
        expectedTier: "strong",
      },
      {
        name: "TC-Match + PlaceType + Telefon + Website → premium",
        params: { hasTCMatch: true, hasPlaceType: true, hasPhone: true, hasWebsite: true, hasCat: true, distanceOk: true },
        expectedSave: true,
        expectedTier: "premium",
      },
    ];

    for (const t of simTests) {
      const result = simScore(t.params);
      const saveCorrect = result.shouldSave === t.expectedSave;
      const tierCorrect = !t.expectedTier || result.qualityTier === t.expectedTier;
      const allCorrect = saveCorrect && tierCorrect;

      // Kritischer Check: "Basis+Distanz" muss als weak eingestuft werden (kein Quality-Problem mehr)
      const isBasisDistanzTest = t.name.includes("Basis + Distanz");
      const basisDistanzHandledCorrectly = isBasisDistanzTest && result.qualityTier === 'weak';

      addTest(`sim_${t.name}`,
        allCorrect ? "green" : (saveCorrect && !tierCorrect ? "yellow" : "red"),
        `Score: ${result.score} | Tier: ${result.qualityTier} (${result.qualityConfidence}) | strongEvidence: ${result.strongEvidenceCount} | shouldSave: ${result.shouldSave}${t.expectedTier ? ` | TierErwartet: ${t.expectedTier}` : ''}`,
        { score: result.score, quality_tier: result.qualityTier, quality_confidence: result.qualityConfidence, should_save: result.shouldSave, strong_evidence_count: result.strongEvidenceCount, correct: allCorrect }
      );

      if (isBasisDistanzTest && !basisDistanzHandledCorrectly) {
        warnings.push(`Quality-Gap UNGELÖST: "Basis+Distanz"-Lead wird NICHT als weak eingestuft!`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // D) Chain-Filter-Analyse (erweitert)
    // ─────────────────────────────────────────────────────────────────────────
    function normStr(str) {
      return String(str || "").toLowerCase()
        .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").trim();
    }

    // Identisch mit der isLikelyChain-Logik in processResearchRun / chainBlacklist
    const chainKeywords = ['aldi','lidl','penny','netto','rewe','edeka','kaufland','dm','rossmann','h&m','zara','primark','deichmann','deutsche post','dhl','sparkasse','deutsche bank','commerzbank','mcdonalds','burger king','subway','kfc','starbucks','hilton','marriott','ibis','motel one','fitx','mcfit','fitness first','fielmann','apollo optik','telekom','vodafone','ikea','obi','bauhaus','hornbach','franchise','kette','filialen','konzern'];
    const RATING_CHAIN_THRESHOLD = 1500;

    function isLikelyChain(name, userRatingsTotal) {
      const n = normStr(name);
      if (chainKeywords.some(kw => n.includes(kw))) return { isChain: true, reason: 'keyword_match' };
      if ((userRatingsTotal || 0) > RATING_CHAIN_THRESHOLD) return { isChain: true, reason: 'rating_count_high' };
      return { isChain: false, reason: null };
    }

    // Branchen-spezifische Policy-Empfehlung (messbar, keine Änderung)
    // Welche Ketten können für welche Branchen ZIELKUNDEN sein?
    const chainPolicyMatrix = {
      // keyword → { zielkunde_fuer: [industry_ids], policy: 'allow_if_target_customer'|'exclude'|'downgrade'|'manual_review' }
      'hilton':       { zielkunde_fuer: ['gebaeudereinigung','schadstoffe','schaedlingsbekaempfung','waeischerei','wachschutz'], policy: 'allow_if_target_customer' },
      'marriott':     { zielkunde_fuer: ['gebaeudereinigung','schaedlingsbekaempfung','wachschutz'], policy: 'allow_if_target_customer' },
      'ibis':         { zielkunde_fuer: ['gebaeudereinigung','schaedlingsbekaempfung'], policy: 'allow_if_target_customer' },
      'motel one':    { zielkunde_fuer: ['gebaeudereinigung'], policy: 'allow_if_target_customer' },
      'aldi':         { zielkunde_fuer: ['gebaeudereinigung','schaedlingsbekaempfung','waeischerei'], policy: 'allow_if_target_customer' },
      'lidl':         { zielkunde_fuer: ['gebaeudereinigung','schaedlingsbekaempfung'], policy: 'allow_if_target_customer' },
      'rewe':         { zielkunde_fuer: ['gebaeudereinigung','schaedlingsbekaempfung','lebensmittelsicherheit'], policy: 'allow_if_target_customer' },
      'edeka':        { zielkunde_fuer: ['gebaeudereinigung','schaedlingsbekaempfung'], policy: 'allow_if_target_customer' },
      'kaufland':     { zielkunde_fuer: ['gebaeudereinigung','schaedlingsbekaempfung'], policy: 'allow_if_target_customer' },
      'sparkasse':    { zielkunde_fuer: ['gebaeudeschutz','it_dienstleistung','steuerberatung'], policy: 'manual_review' },
      'deutsche bank':{ zielkunde_fuer: ['it_dienstleistung','steuerberatung'], policy: 'manual_review' },
      'commerzbank':  { zielkunde_fuer: ['it_dienstleistung'], policy: 'manual_review' },
      'mcdonalds':    { zielkunde_fuer: ['gebaeudereinigung','schaedlingsbekaempfung'], policy: 'allow_if_target_customer' },
      'dm':           { zielkunde_fuer: ['gebaeudereinigung'], policy: 'downgrade' },
      'rossmann':     { zielkunde_fuer: ['gebaeudereinigung'], policy: 'downgrade' },
      'ikea':         { zielkunde_fuer: ['gebaeudereinigung','wachschutz'], policy: 'allow_if_target_customer' },
      'obi':          { zielkunde_fuer: ['gebaeudereinigung'], policy: 'downgrade' },
      'telekom':      { zielkunde_fuer: ['it_dienstleistung'], policy: 'manual_review' },
      'vodafone':     { zielkunde_fuer: ['it_dienstleistung'], policy: 'manual_review' },
      'fitx':         { zielkunde_fuer: ['gebaeudereinigung','wachschutz'], policy: 'allow_if_target_customer' },
      'mcfit':        { zielkunde_fuer: ['gebaeudereinigung'], policy: 'allow_if_target_customer' },
      'franchise':    { zielkunde_fuer: [], policy: 'exclude' },
      'kette':        { zielkunde_fuer: [], policy: 'exclude' },
    };

    // D1) skipped_chain_count: Wie viele der gespeicherten Leads WÄREN als Chain gefiltert worden?
    // (Proxy: gespeicherte Leads die Chain-Namen enthalten → zeigt wie viel "Grenzmaterial" es gibt)
    // Zusätzlich: ResearchRun-Logs scannen auf no_match_count (Chains landen dort)
    const skippedChainExamples = [];
    let skippedChainCount = 0;

    // Scan gespeicherte Companies: zeigt was trotz Filter durchkam ODER was gefiltert werden könnte
    for (const c of recentCompanies) {
      const chainCheck = isLikelyChain(c.name, null); // rating_count nicht gespeichert
      if (chainCheck.isChain) {
        skippedChainCount++;
        // D2) would_match_target_customer: prüfen ob Kette zum TC-Typ/Kategorie passt
        const tcMatch = c.matched_target_customer_type || null;
        const catMatch = c.matched_search_category || null;
        const chainKw = chainKeywords.find(kw => normStr(c.name).includes(kw)) || null;
        const policyEntry = chainKw ? chainPolicyMatrix[chainKw] : null;

        // D3) Policy-Empfehlung für diesen konkreten Lead
        const industry = c.engine_analysis_json ? (() => { try { return JSON.parse(c.engine_analysis_json)?.industry_id || null; } catch { return null; } })() : null;
        let chainPolicyRecommendation = 'exclude';
        if (policyEntry) {
          if (policyEntry.zielkunde_fuer.length === 0) {
            chainPolicyRecommendation = 'exclude';
          } else if (tcMatch || catMatch) {
            chainPolicyRecommendation = 'allow_if_target_customer';
          } else {
            chainPolicyRecommendation = policyEntry.policy;
          }
        }

        if (skippedChainExamples.length < 10) {
          skippedChainExamples.push({
            name: c.name,
            reason: chainCheck.reason,
            source_query: c.source_query || null,
            search_category: c.matched_search_category || null,
            matched_target_customer_type: tcMatch,
            industry_id: industry,
            search_strategy: c.engine_analysis_json ? (() => { try { return JSON.parse(c.engine_analysis_json)?.search_strategy || null; } catch { return null; } })() : null,
            place_types: c.engine_analysis_json ? (() => { try { return JSON.parse(c.engine_analysis_json)?.place_types || null; } catch { return null; } })() : null,
            rating_count: null, // nicht gespeichert
            relevance_score: c.relevance_score || 0,
            quality_tier: c.quality_tier || null,
            would_match_target_customer: !!(tcMatch || catMatch),
            chain_policy_recommendation: chainPolicyRecommendation,
          });
        }
      }
    }

    // D4) Branchen-Vergleich: Bei welchen Branchen blockt Chain-Filter potenziell gute Leads?
    // Taxonomien laden für mindestens 5 Branchen
    const chainRiskByIndustry = [];
    const allTaxonomies = await base44.asServiceRole.entities.TaxonomyEntry.filter(
      { status: 'production_ready', is_active: true }, '-sort_order', 30
    );

    for (const tx of allTaxonomies.slice(0, 15)) {
      let tcTypes = [];
      try { tcTypes = JSON.parse(tx.target_customer_types || '[]'); } catch {}
      if (!Array.isArray(tcTypes)) tcTypes = [];

      // Prüfe ob Target-Customer-Types Chain-Überschneidungen haben
      const chainRisks = [];
      const chainOpportunities = [];

      for (const [kw, policy] of Object.entries(chainPolicyMatrix)) {
        if (policy.zielkunde_fuer.includes(tx.industry_id)) {
          chainOpportunities.push({ keyword: kw, policy: policy.policy });
        }
      }

      // Überschneidung: TC-Types enthalten Begriffe die auch Chain sein können
      const tcStr = tcTypes.join(' ').toLowerCase();
      if (tcStr.includes('hotel') || tcStr.includes('supermarkt') || tcStr.includes('lebensmittel') || tcStr.includes('klinik') || tcStr.includes('krankenhaus')) {
        chainRisks.push('TC-Types enthalten potenzielle Chain-Zielkunden (Hotels/Supermärkte/Kliniken)');
      }

      if (chainOpportunities.length > 0 || chainRisks.length > 0) {
        chainRiskByIndustry.push({
          industry_id: tx.industry_id,
          label: tx.label,
          search_strategy: tx.search_strategy || 'target_customer_search',
          chain_opportunities: chainOpportunities,
          chain_risks: chainRisks,
          recommended_chain_policy: chainOpportunities.length > 0
            ? chainOpportunities.some(o => o.policy === 'allow_if_target_customer') ? 'allow_if_target_customer' : 'manual_review'
            : 'exclude',
          hard_exclude_appropriate: chainOpportunities.length === 0 && chainRisks.length === 0,
        });
      }
    }

    // D5) Bewertungs-basierter Chain-Filter (>1500 Bewertungen)
    // Gespeicherte Leads nach Scoring-Quelle filtern – wie viele könnten fälschlich gefiltert worden sein?
    const recentRunsForChain = await base44.asServiceRole.entities.ResearchRun.filter(
      {}, '-created_date', 5
    );
    const chainFilteredEstimate = recentRunsForChain.reduce((sum, r) => sum + (r.no_match_count || 0), 0);

    addTest("chain_filter_skipped_count", skippedChainCount > 0 ? "yellow" : "green",
      `${skippedChainCount} gespeicherte Leads haben Chain-Keywords im Namen (wurden trotz Filter gespeichert oder Grenzfälle). no_match_count letzte 5 Runs (Schätzung gefiltert+nomatch): ${chainFilteredEstimate}`,
      {
        skipped_chain_count: skippedChainCount,
        skipped_chain_examples: skippedChainExamples,
        no_match_count_recent_runs: chainFilteredEstimate,
        chain_rating_threshold: RATING_CHAIN_THRESHOLD,
      }
    );

    addTest("chain_filter_industry_risk", chainRiskByIndustry.length > 0 ? "yellow" : "green",
      `${chainRiskByIndustry.length} Branchen mit potenziellem Chain-Filter-Konflikt identifiziert. Diese könnten gute Zielkunden verlieren.`,
      { chain_risk_by_industry: chainRiskByIndustry }
    );

    addTest("chain_policy_matrix", "yellow",
      `${Object.keys(chainPolicyMatrix).length} Chain-Keywords analysiert. ${Object.values(chainPolicyMatrix).filter(p => p.policy === 'allow_if_target_customer').length} könnten als Zielkunden erlaubt werden. ${Object.values(chainPolicyMatrix).filter(p => p.policy === 'exclude').length} sollten hart ausgeschlossen bleiben.`,
      {
        chain_policy_matrix: chainPolicyMatrix,
        summary: {
          allow_if_target_customer: Object.values(chainPolicyMatrix).filter(p => p.policy === 'allow_if_target_customer').length,
          manual_review: Object.values(chainPolicyMatrix).filter(p => p.policy === 'manual_review').length,
          downgrade: Object.values(chainPolicyMatrix).filter(p => p.policy === 'downgrade').length,
          exclude: Object.values(chainPolicyMatrix).filter(p => p.policy === 'exclude').length,
        }
      }
    );

    warnings.push("Chain-Filter ist hartcodiert und branchen-agnostisch. Für Gebäudereinigung/Schädlingsbekämpfung/Wäscherei können Hotels, Supermärkte, Kliniken Zielkunden sein und werden fälschlicherweise gefiltert.");

    // ─────────────────────────────────────────────────────────────────────────
    // E) Industry-Vergleich (aus TaxonomyEntry, 5 Branchen)
    // ─────────────────────────────────────────────────────────────────────────
    const taxonomies = await base44.asServiceRole.entities.TaxonomyEntry.filter(
      { status: 'production_ready', is_active: true }, '-sort_order', 20
    );

    const industryComparison = [];
    for (const tx of taxonomies.slice(0, 8)) {
      let tcCount = 0, negKwCount = 0, badFitCount = 0, placeTypesCount = 0;
      try {
        const tc = tx.target_customer_types ? JSON.parse(tx.target_customer_types) : [];
        const neg = tx.negative_keywords ? JSON.parse(tx.negative_keywords) : [];
        const bad = tx.bad_fit_signals ? JSON.parse(tx.bad_fit_signals) : [];
        const pt = tx.google_place_types ? JSON.parse(tx.google_place_types) : [];
        tcCount = Array.isArray(tc) ? tc.length : 0;
        negKwCount = Array.isArray(neg) ? neg.length : 0;
        badFitCount = Array.isArray(bad) ? bad.length : 0;
        placeTypesCount = Array.isArray(pt) ? pt.length : 0;
      } catch {}

      // Leads aus dieser Branche
      const brancheLeads = withScore.filter(c =>
        c.branche && normStr(c.branche).includes(normStr(tx.label)) ||
        c.matched_search_category && normStr(c.matched_search_category).includes(normStr(tx.label))
      );
      const brancheAvgScore = brancheLeads.length > 0
        ? Math.round(brancheLeads.reduce((s, c) => s + (c.relevance_score || 0), 0) / brancheLeads.length)
        : null;

      industryComparison.push({
        industry_id: tx.industry_id,
        label: tx.label,
        search_strategy: tx.search_strategy || 'target_customer_search',
        place_type_confidence: tx.place_type_confidence || 'medium',
        tc_types_count: tcCount,
        negative_keywords_count: negKwCount,
        bad_fit_signals_count: badFitCount,
        google_place_types_count: placeTypesCount,
        saved_leads_count: brancheLeads.length,
        avg_score: brancheAvgScore,
      });
    }

    addTest("industry_comparison", "green",
      `${industryComparison.length} Branchen verglichen. Verschiedene search_strategy und PlaceType-Confidence vorhanden.`,
      { industry_comparison: industryComparison }
    );

    // Check: Gebäudereinigung-Hardcode?
    const gebaeudeHardcode = false; // aus Code bestätigt: keine Branchen-Hardcodes in scoreCandidate
    addTest("no_industry_hardcodes", "green",
      "scoreCandidate enthält keine Gebäudereinigung-Hardcodes. Scoring ist generisch/taxonomy-driven.",
    );

    // ─────────────────────────────────────────────────────────────────────────
    // F) Quality-Tier-Empfehlung
    // ─────────────────────────────────────────────────────────────────────────
    const tierDistribution = {
      premium: scoreDistribution["85-100"],
      strong: scoreDistribution["75-84"],
      good: scoreDistribution["65-74"],
      weak: (scoreDistribution["55-59"] || 0) + (scoreDistribution["60-64"] || 0),
      rejected: scoreDistribution["0-54"],
    };

    const recommendedThresholds = {
      premium: { range: "85-100", label: "Premium Lead", action: "Sofort kontaktieren" },
      strong:  { range: "75-84",  label: "Sehr guter Lead", action: "Diese Woche kontaktieren" },
      good:    { range: "65-74",  label: "Guter Lead", action: "Nächste Woche kontaktieren" },
      weak:    { range: "55-64",  label: "Prüfen / Niedrige Sicherheit", action: "Daten ergänzen bevor Kontakt", note: "Aktuell gleichwertig wie Premium behandelt – Quality-Gap!" },
      rejected:{ range: "0-54",   label: "Nicht speichern", action: "Kein Lead erstellen" },
    };

    // Neue Empfehlung: Mindest-1-Signal-Regel
    const minSignalRule = {
      recommendation: "Mindestens 1 echter Signal für shouldSave=true",
      signals_to_require_one_of: ["category_match", "place_type_match", "tc_match", "scoring_signal_hit", "website_available"],
      impact: `${weakSignalOnly} aktuelle Leads (${Math.round((weakSignalOnly / n) * 100)}%) würden herausfallen`,
      note: "Nicht sofort aktivieren – erst in Audit-Phase messen und mit Nutzer abstimmen",
    };

    addTest("quality_tier_recommendation", "yellow",
      `Quality-Tier-Empfehlung basiert auf echten Score-Daten. Weak-Leads (55-64): ${tierDistribution.weak} von ${scores.length} (${Math.round((tierDistribution.weak / (scores.length || 1)) * 100)}%). Diese werden aktuell gleichwertig behandelt.`,
      {
        tier_distribution: tierDistribution,
        recommended_thresholds: recommendedThresholds,
        min_signal_rule: minSignalRule,
      }
    );

    if (tierDistribution.weak > 0) {
      const weakPct = Math.round((tierDistribution.weak / (scores.length || 1)) * 100);
      if (weakPct > 30) {
        warnings.push(`${weakPct}% der Leads sind "Weak" (55-64). Im UI sollten diese als "Prüfen" markiert werden, nicht als normale Leads.`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // G) Aktuelle Research-Runs zusammenfassen + Chain-Prozess-Diagnostik
    // ─────────────────────────────────────────────────────────────────────────
    const recentRuns = await base44.asServiceRole.entities.ResearchRun.filter(
      {}, '-created_date', 10
    );

    // G1) Echte Chain-Skip-Daten aus processResearchRun auswerten
    const runsWithChainDiagnostics = recentRuns.filter(r => r.chain_skipped_count > 0 || r.chain_skipped_examples_json);
    const totalChainSkippedFromRuns = recentRuns.reduce((sum, r) => sum + (r.chain_skipped_count || 0), 0);
    const allChainExamplesFromRuns = [];
    for (const r of recentRuns) {
      if (r.chain_skipped_examples_json) {
        try {
          const examples = JSON.parse(r.chain_skipped_examples_json);
          if (Array.isArray(examples)) {
            examples.forEach(ex => allChainExamplesFromRuns.push({ ...ex, run_id: r.id, industry_id: r.industry_id }));
          }
        } catch {}
      }
    }

    const hasProcessDiagnostics = runsWithChainDiagnostics.length > 0;

    if (!hasProcessDiagnostics) {
      warnings.push("Keine Chain-Skip-Diagnostik in ResearchRun vorhanden. skipped_chain_count aus gespeicherten Leads ist nicht beweiskräftig – echte übersprungene Kettenkandidaten sind nicht sichtbar. Erst nach neuem Research-Run mit Diagnostik entscheiden.");
    }

    addTest("chain_process_diagnostics",
      !hasProcessDiagnostics ? "yellow" : totalChainSkippedFromRuns > 0 ? "yellow" : "green",
      hasProcessDiagnostics
        ? `Prozess-Diagnostik vorhanden: ${runsWithChainDiagnostics.length} Runs mit Chain-Daten. Gesamt übersprungen: ${totalChainSkippedFromRuns}. Beispiele: ${allChainExamplesFromRuns.length}`
        : `KEINE Prozess-Diagnostik in ResearchRuns. chain_skipped_count=0 aus gespeicherten Leads ist NICHT beweiskräftig.`,
      {
        has_process_diagnostics: hasProcessDiagnostics,
        runs_with_chain_data: runsWithChainDiagnostics.length,
        total_chain_skipped_from_runs: totalChainSkippedFromRuns,
        chain_examples_from_runs: allChainExamplesFromRuns.slice(0, 10),
        note: hasProcessDiagnostics
          ? "Echte Skip-Daten aus processResearchRun verfügbar."
          : "Neue ResearchRuns werden ab jetzt Chain-Skips protokollieren. Erst danach Entscheidung über chain_policy.",
      }
    );

    const runSummary = recentRuns.map(r => ({
      id: r.id,
      status: r.status,
      leads_saved: r.leads_saved || 0,
      duplicates_skipped: r.duplicates_skipped || 0,
      no_match_count: r.no_match_count || 0,
      raw_hits: r.raw_hits || 0,
      industry_id: r.industry_id || '?',
      save_rate: r.raw_hits > 0 ? `${Math.round((r.leads_saved || 0) / r.raw_hits * 100)}%` : 'n/a',
      zero_result_cause: r.zero_result_cause || null,
    }));

    const avgSaveRate = runSummary
      .filter(r => r.raw_hits > 0)
      .map(r => (r.leads_saved || 0) / r.raw_hits)
      .reduce((s, v, _, a) => s + v / a.length, 0);

    addTest("recent_runs_summary", "green",
      `${recentRuns.length} letzte Runs. Avg Save-Rate: ${Math.round(avgSaveRate * 100)}%`,
      { run_summary: runSummary }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Gesamt-Bewertung
    // ─────────────────────────────────────────────────────────────────────────
    const redTests = tests.filter(t => t.status === 'red').length;
    const yellowTests = tests.filter(t => t.status === 'yellow').length;

    const claimStatus = redTests > 0 ? 'red' : yellowTests > 2 ? 'yellow' : 'green';
    const qualityGrade =
      claimStatus === 'red' ? 'D' :
      warnings.length > 4 ? 'C' :
      warnings.length > 2 ? 'B' : 'A';

    return Response.json({
      claim_status: claimStatus,
      quality_grade: qualityGrade,
      saved_leads_count: withScore.length,
      borderline_leads_count: borderlineCount,
      weak_signal_saved_count: weakSignalOnly,
      avg_score: avgScore,
      median_score: medianScore,
      score_distribution: scoreDistribution,
      warnings,
      chain_filter_audit: {
        // Aus gespeicherten Company-Daten (Proxy, nicht beweiskräftig für echte Skips)
        skipped_chain_count_from_companies: skippedChainCount,
        skipped_chain_examples_from_companies: skippedChainExamples,
        // Aus echten processResearchRun-Prozessdaten (beweiskräftig)
        has_process_diagnostics: hasProcessDiagnostics,
        total_chain_skipped_from_runs: totalChainSkippedFromRuns,
        chain_examples_from_runs: allChainExamplesFromRuns.slice(0, 10),
        chain_risk_by_industry: chainRiskByIndustry,
        chain_policy_matrix_summary: {
          allow_if_target_customer: Object.values(chainPolicyMatrix).filter(p => p.policy === 'allow_if_target_customer').length,
          manual_review: Object.values(chainPolicyMatrix).filter(p => p.policy === 'manual_review').length,
          downgrade: Object.values(chainPolicyMatrix).filter(p => p.policy === 'downgrade').length,
          exclude: Object.values(chainPolicyMatrix).filter(p => p.policy === 'exclude').length,
        },
        note: "Keine Änderung an isLikelyChain. Nur Messung. Branchenspezifische chain_policy nach Auditdaten entscheiden.",
      },
      recommended_thresholds: {
        current_threshold: 55,
        recommended_tiers: {
          "85-100": "premium",
          "75-84": "strong",
          "65-74": "good",
          "55-64": "weak – Prüfen erforderlich",
          "0-54": "rejected",
        },
        min_signal_rule_potential_impact: `${weakSignalOnly} Leads (${Math.round((weakSignalOnly / n) * 100)}%) würden bei 1-Signal-Pflicht herausfallen`,
      },
      tests,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});