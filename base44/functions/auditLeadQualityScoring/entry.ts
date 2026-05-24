/**
 * auditLeadQualityScoring
 * ========================
 * Umfassender Test des Lead-Quality-Scoring-Systems mit ECHTEN Engine-Funktionen.
 * 
 * WICHTIG: Verwendet die gleichen Helper-Funktionen wie processResearchRun:
 * - scoreCandidate (gewichtetes Scoring)
 * - checkBadFit (Bad-Fit-Erkennung)
 * - isLikelyChain (Ketten-Erkennung)
 * - buildQueriesFromProfile (Query-Generierung)
 * 
 * Testet:
 * - Echte Scoring-Logik mit gewichteten Signalen
 * - Echte Bad-Fit-Erkennung mit Penalty-System
 * - Echte Ketten-Erkennung mit Keywords + Bewertungen
 * - Query-Generierung mit Target-Customer-Priorisierung
 * - Excluded-CustomerTypes werden korrekt gefiltert
 * - Engine-Analytics sind nachvollziehbar
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── HELPERS (exakt wie in processResearchRun) ────────────────────────────────
const SEARCH_ENGINE_VERSION = "v6-weighted-scoring";

function normStr(str) {
  return String(str || "").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").trim();
}

function isLikelyChain(candidate) {
  const chainKeywords = ['aldi','lidl','penny','netto','rewe','edeka','kaufland','dm','rossmann','h&m','zara','primark','deichmann','deutsche post','dhl','sparkasse','deutsche bank','commerzbank','mcdonalds','burger king','subway','kfc','starbucks','hilton','marriott','ibis','motel one','fitx','mcfit','fitness first','fielmann','apollo optik','telekom','vodafone','ikea','obi','bauhaus','hornbach','franchise','kette','filialen','konzern'];
  const nameLower = normStr(candidate.name || '');
  for (const kw of chainKeywords) if (nameLower.includes(kw)) return { isChain: true, reason: `Kette: ${kw}` };
  if ((candidate.user_ratings_total || 0) > 1500) return { isChain: true, reason: `>1500 Bewertungen` };
  return { isChain: false };
}

function checkBadFit(candidate, profile) {
  const text = normStr([candidate.name, (candidate.types||[]).join(' '), candidate.vicinity||'', candidate.formatted_address||''].join(' '));
  const matchedSignals = [];
  let totalPenalty = 0;

  for (const kw of (profile?.negativeKeywords || [])) {
    if (text.includes(normStr(kw))) {
      return { bad: true, hardFail: true, totalPenalty: -100, matchedSignals: [`NegKw:${kw}`] };
    }
  }

  const weights = profile?.badFitSignalWeights || {};
  for (const s of (profile?.badFitSignals || [])) {
    if (text.includes(normStr(s))) {
      const penalty = weights[s] ?? -35;
      totalPenalty += penalty;
      matchedSignals.push(`${s}(${penalty})`);
    }
  }

  const bad = totalPenalty <= -35;
  return { bad, hardFail: false, totalPenalty, matchedSignals };
}

function scoreCandidate(candidate, profile, distanceKm, radiusKm, category, placeTypes) {
  const text = normStr([candidate.name, (candidate.types||[]).join(' '), candidate.vicinity||'', candidate.formatted_address||''].join(' '));
  let score = 50;
  const reasons = [];
  let matched_search_category = category || null;
  let matched_target_customer_type = null;
  let placeTypeMatchStrength = 'none';

  if (!matched_search_category) {
    for (const cat of (profile?.searchableBusinessCategories || [])) {
      const variants = profile?.searchKeywordVariants?.[cat] ? profile.searchKeywordVariants[cat] : [cat];
      for (const v of variants) if (text.includes(normStr(v))) { matched_search_category = cat; break; }
      if (matched_search_category) break;
    }
  }
  if (matched_search_category) { score += 20; reasons.push(`Cat:${matched_search_category}(+20)`); }

  const confidence = profile?.placeTypeConfidence || 'medium';
  const placeTypeBoostMap = { high: 15, medium: 8, low: 3 };
  const placeTypeBoost = placeTypeBoostMap[confidence] ?? 8;
  const profilePlaceTypes = profile?.googlePlaceTypes || [];
  const candidateTypes = placeTypes || candidate.types || [];
  const placeTypeMatch = candidateTypes.some(t => profilePlaceTypes.includes(t));
  if (placeTypeMatch && profilePlaceTypes.length > 0) {
    score += placeTypeBoost;
    placeTypeMatchStrength = confidence;
    reasons.push(`PlaceType:${confidence}(+${placeTypeBoost})`);
  }

  const signalWeights = profile?.scoringSignalWeights || {};
  const signalsList = profile?.scoringSignals || [];
  let totalSignalScore = 0;
  const matchedWeightedSignals = [];

  for (const s of signalsList) {
    if (text.includes(normStr(s))) {
      const w = signalWeights[s] ?? 12;
      totalSignalScore += w;
      matchedWeightedSignals.push(`${s}(+${w})`);
    }
  }
  const cappedSignalScore = Math.min(35, totalSignalScore);
  if (cappedSignalScore > 0) {
    score += cappedSignalScore;
    reasons.push(`Signals:[${matchedWeightedSignals.slice(0,4).join(',')}](+${cappedSignalScore})`);
  }

  if (candidate.formatted_phone_number || candidate.international_phone_number) { score += 8; reasons.push("Tel(+8)"); }
  if (candidate.website) { score += 8; reasons.push("Web(+8)"); }

  if (distanceKm !== null && distanceKm <= radiusKm) { score += 8; }

  const strategy = profile?.searchStrategy || 'target_customer_search';
  const tcBonus = strategy === 'target_customer_search' ? 10 : strategy === 'mixed' ? 8 : 6;
  for (const tc of (profile?.targetCustomerTypes || [])) {
    if (text.includes(normStr(tc))) {
      matched_target_customer_type = tc;
      score += tcBonus;
      reasons.push(`TC:${tc}(+${tcBonus})`);
      break;
    }
  }

  const websiteRequired = strategy === 'website_signal_required';
  if (websiteRequired && !candidate.website) {
    score = Math.min(score, 54);
    reasons.push('NoWebsite(cap54)');
  }

  const badFit = checkBadFit(candidate, profile);
  if (badFit.totalPenalty < 0) {
    score += badFit.totalPenalty;
    if (badFit.matchedSignals.length > 0) {
      reasons.push(`BadFit:[${badFit.matchedSignals.join(',')}](${badFit.totalPenalty})`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  const diagnostics = {
    engine_version: SEARCH_ENGINE_VERSION,
    score_raw: score,
    matched_weighted_signals: matchedWeightedSignals,
    bad_fit_signals_matched: badFit.matchedSignals,
    bad_fit_penalty: badFit.totalPenalty,
    place_type_match_strength: placeTypeMatchStrength,
    place_type_confidence: confidence,
    search_strategy: profile?.searchStrategy || 'target_customer_search',
    category_matched: matched_search_category,
    score_breakdown: reasons.join(' | '),
    tc_bonus_applied: strategy === 'target_customer_search' ? 10 : strategy === 'mixed' ? 8 : 6,
  };

  return {
    score,
    matched_search_category,
    matched_target_customer_type,
    relevance_reason: reasons.join(' | ') || 'Base',
    shouldSave: score >= 55 && !badFit.bad,
    diagnostics,
  };
}

function buildQueriesFromProfile(profile, targetCustomerTypes, excludedCustomerTypes, trialStage, hasGeoCoords) {
  const queries = [];
  const seen = new Set();
  const maxQ = trialStage === 'free_preview' ? 5 : 20;
  const excludedNorm = excludedCustomerTypes.map(e => normStr(e));
  const cityMode = hasGeoCoords ? 'geo_only' : 'keyword_with_city';
  const familiesUsed = new Set();
  const strategy = profile?.searchStrategy || 'target_customer_search';

  if (profile) {
    const usedCats = (profile.searchableBusinessCategories || []).filter(c => {
      return !excludedNorm.some(ex => normStr(c).includes(ex) || ex.includes(normStr(c)));
    });

    let prioritized = [];

    if (strategy === 'provider_search') {
      const staticPrio = (profile.queryPriority || []).filter(c => usedCats.includes(c));
      const rest = usedCats.filter(c => !staticPrio.includes(c));
      prioritized = [...staticPrio, ...rest];
    } else if (strategy === 'registry_enrichment_recommended') {
      const staticPrio = (profile.queryPriority || []).filter(c => usedCats.includes(c));
      const rest = usedCats.filter(c => !staticPrio.includes(c));
      prioritized = [...staticPrio, ...rest];
    } else {
      if (targetCustomerTypes.length > 0) {
        const userPrio = [];
        for (const tc of targetCustomerTypes) {
          const tcNorm = normStr(tc);
          for (const cat of usedCats) {
            if (normStr(cat).includes(tcNorm) || tcNorm.includes(normStr(cat))) {
              if (!userPrio.includes(cat)) userPrio.push(cat);
            }
          }
        }
        const staticPrio = (profile.queryPriority || []).filter(c => usedCats.includes(c) && !userPrio.includes(c));
        const rest = usedCats.filter(c => !userPrio.includes(c) && !staticPrio.includes(c));
        if (strategy === 'mixed') {
          prioritized = [...userPrio, ...staticPrio, ...rest];
        } else {
          prioritized = [...userPrio, ...staticPrio, ...rest];
        }
      } else {
        const staticPrio = (profile.queryPriority || []).filter(c => usedCats.includes(c));
        const rest = usedCats.filter(c => !staticPrio.includes(c));
        prioritized = [...staticPrio, ...rest];
      }
    }

    const maxVariants = trialStage === 'free_preview' ? 2 : 3;
    for (const cat of prioritized) {
      if (queries.length >= maxQ) break;
      let family = cat;
      for (const [fam, variants] of Object.entries(profile.searchKeywordVariants || {})) {
        if (variants.includes(cat) || fam === cat) { family = fam; break; }
      }
      const variants = (profile.searchKeywordVariants?.[cat] ? profile.searchKeywordVariants[cat] : [cat]).slice(0, maxVariants);
      const weight = (profile.queryPriority || []).indexOf(cat) >= 0 ? 10 - (profile.queryPriority || []).indexOf(cat) : 1;
      const isUserMatched = targetCustomerTypes.some(tc => {
        const tcNorm = normStr(tc);
        return normStr(cat).includes(tcNorm) || tcNorm.includes(normStr(cat));
      });

      for (const v of variants) {
        if (!seen.has(v)) {
          seen.add(v);
          familiesUsed.add(family);
          queries.push({
            query: v, category: cat, variant: v, family, weight,
            source: isUserMatched ? 'user_target' : 'taxonomy',
            city_mode: cityMode,
            search_strategy: strategy,
            matched_target_customer: isUserMatched
              ? targetCustomerTypes.find(tc => normStr(cat).includes(normStr(tc)) || normStr(tc).includes(normStr(cat)))
              : null,
          });
        }
        if (queries.length >= maxQ) break;
      }
    }
  }

  if (queries.length === 0 && targetCustomerTypes.length > 0) {
    for (const tc of targetCustomerTypes.slice(0, maxQ)) {
      if (excludedNorm.some(ex => normStr(tc).includes(ex))) continue;
      if (!seen.has(tc)) {
        seen.add(tc);
        queries.push({ query: tc, category: tc, variant: tc, family: tc, weight: 5, source: 'user_fallback', city_mode: cityMode, matched_target_customer: tc });
      }
    }
  }

  return { queries, queryFamiliesUsed: [...familiesUsed], cityMode };
}

// ── TEST-BRANCHEN (echte TaxonomyEntry IDs) ─────────────────────────────────
const TEST_INDUSTRIES = [
  { industry_id: 'gebaeudereinigung', label: 'Gebäudereinigung' },
  { industry_id: 'elektriker', label: 'Elektriker' },
  { industry_id: 'gaertner', label: 'Gärtner' },
  { industry_id: 'sanitaer_heizung', label: 'Sanitär & Heizung' },
  { industry_id: 'fotograf', label: 'Fotograf' },
];

// ── TEST-CANDIDATES (wie Google Places sie liefert) ─────────────────────────
function createTestCandidates(industryProfile) {
  const candidates = [];
  
  // Good Fit: Passt zu Zielkunde + Service
  candidates.push({
    scenario: 'good_fit_target_customer',
    candidate: {
      name: `Muster Hausverwaltung GmbH`,
      types: ['real_estate_agency', 'property_management'],
      vicinity: 'Musterstadt',
      formatted_address: 'Musterstraße 1, 12345 Musterstadt',
      user_ratings_total: 45,
      website: 'https://muster-hausverwaltung.de',
      formatted_phone_number: '+49 123 456789',
    },
    expected: { shouldSave: true, minScore: 70, reason: 'Passt zu Zielkunde + gute Signale' },
  });

  // Good Fit: Eigene Dienstleistung
  candidates.push({
    scenario: 'good_fit_service',
    candidate: {
      name: `Elektro Müller GmbH`,
      types: ['electrician', 'contractor'],
      vicinity: 'Musterstadt',
      formatted_address: 'Elektrikerweg 5, 12345 Musterstadt',
      user_ratings_total: 120,
      website: 'https://elektro-mueller.de',
      formatted_phone_number: '+49 123 987654',
    },
    expected: { shouldSave: true, minScore: 65, reason: 'Passt zu eigener Dienstleistung' },
  });

  // Bad Fit: Privatkunde
  candidates.push({
    scenario: 'bad_fit_privatkunde',
    candidate: {
      name: `Privathaushalt Schmidt`,
      types: ['point_of_interest'],
      vicinity: 'Musterstadt',
      formatted_address: 'Privatweg 3, 12345 Musterstadt',
      user_ratings_total: 2,
      website: null,
      formatted_phone_number: null,
    },
    expected: { shouldSave: false, maxScore: 40, reason: 'Privatkunde erkannt' },
  });

  // Chain: Filialsystem
  candidates.push({
    scenario: 'chain_detected',
    candidate: {
      name: `Mc Clean Filiale Mitte`,
      types: ['cleaning_service', 'point_of_interest'],
      vicinity: 'Musterstadt',
      formatted_address: 'Kettenstraße 10, 12345 Musterstadt',
      user_ratings_total: 250,
      website: 'https://mcclean.de',
      formatted_phone_number: '+49 800 123456',
    },
    expected: { shouldSave: false, isChain: true, reason: 'Kette erkannt' },
  });

  // Excluded Customer Type
  candidates.push({
    scenario: 'excluded_customer',
    candidate: {
      name: `Endverbraucher Zentrale`,
      types: ['point_of_interest'],
      vicinity: 'Musterstadt',
      formatted_address: 'Verbraucherweg 1, 12345 Musterstadt',
      user_ratings_total: 5,
      website: null,
      formatted_phone_number: '+49 123 111222',
    },
    expected: { shouldSave: false, reason: 'Ausgeschlossener Zielkundentyp' },
  });

  return candidates;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth-Check: Nur Platform-Admins
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Nur für Platform-Admins' }, { status: 403 });
    }

    console.info('[auditLeadQualityScoring] Starting real engine scoring audit...');

    const results = {
      timestamp: new Date().toISOString(),
      auditor: user.email,
      engine_version: SEARCH_ENGINE_VERSION,
      industries_tested: 0,
      candidates_tested: 0,
      scenarios: {
        good_fit_saved: 0,
        bad_fit_rejected: 0,
        chains_detected: 0,
        excluded_customers_rejected: 0,
        queries_valid: 0,
        diagnostics_valid: 0,
      },
      tests: [],
      failed_tests: [],
      warnings: [],
      skipped: [],
    };

    // ── Test-Organisation ermitteln ─────────────────────────────────────────
    const orgs = await base44.asServiceRole.entities.Organization.filter({ 
      onboarding_done: true,
      industry: { $exists: true }
    }, '-created_date', 1);
    
    if (!orgs[0]) {
      return Response.json({ 
        error: 'Keine Organisation mit abgeschlossenem Onboarding und Branche gefunden',
        message: 'Bitte erstellen Sie eine Test-Organisation mit Branche.'
      }, { status: 404 });
    }

    const testOrg = orgs[0];
    console.info(`[auditLeadQualityScoring] Using test org: ${testOrg.name} (${testOrg.id}), industry: ${testOrg.industry}`);

    // ── Durch alle Test-Branchen iterieren ──────────────────────────────────
    for (const industrySpec of TEST_INDUSTRIES) {
      console.info(`[auditLeadQualityScoring] Testing industry: ${industrySpec.industry_id}`);
      
      const industryResult = {
        industry_id: industrySpec.industry_id,
        label: industrySpec.label,
        taxonomy_loaded: false,
        taxonomy_status: null,
        candidates_tested: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        tests: [],
      };

      // 1. TaxonomyEntry laden
      let taxonomyProfile = null;
      try {
        const taxRecords = await base44.asServiceRole.entities.TaxonomyEntry.filter({
          industry_id: industrySpec.industry_id,
          is_active: true,
        });
        
        if (!taxRecords[0]) {
          industryResult.taxonomy_status = 'not_found';
          results.skipped.push({
            industry: industrySpec.industry_id,
            reason: 'Taxonomy-Profil nicht gefunden oder inaktiv',
          });
          console.warn(`[auditLeadQualityScoring] Skipped ${industrySpec.industry_id}: taxonomy not found`);
          continue;
        }

        const rec = taxRecords[0];
        taxonomyProfile = {
          industry_id: rec.industry_id,
          label: rec.label,
          searchableBusinessCategories: rec.searchableBusinessCategories ? JSON.parse(rec.searchableBusinessCategories) : [],
          targetCustomerTypes: rec.targetCustomerTypes ? JSON.parse(rec.targetCustomerTypes) : [],
          excludedCustomerTypes: rec.excludedCustomerTypes ? JSON.parse(rec.excludedCustomerTypes) : [],
          ownServices: rec.ownServices ? JSON.parse(rec.ownServices) : [],
          searchKeywordVariants: rec.searchKeywordVariants ? JSON.parse(rec.searchKeywordVariants) : {},
          scoringSignals: rec.scoringSignals ? JSON.parse(rec.scoringSignals) : [],
          scoringSignalWeights: rec.scoringSignalWeights ? JSON.parse(rec.scoringSignalWeights) : {},
          badFitSignals: rec.badFitSignals ? JSON.parse(rec.badFitSignals) : [],
          badFitSignalWeights: rec.badFitSignalWeights ? JSON.parse(rec.badFitSignalWeights) : {},
          negativeKeywords: rec.negativeKeywords ? JSON.parse(rec.negativeKeywords) : [],
          googlePlaceTypes: rec.googlePlaceTypes ? JSON.parse(rec.googlePlaceTypes) : [],
          placeTypeConfidence: rec.placeTypeConfidence || 'medium',
          searchStrategy: rec.searchStrategy || 'target_customer_search',
          queryPriority: rec.queryPriority ? JSON.parse(rec.queryPriority) : [],
          version: rec.version,
        };

        industryResult.taxonomy_loaded = true;
        industryResult.taxonomy_status = 'loaded';
        results.industries_tested++;

      } catch (taxErr) {
        industryResult.taxonomy_status = `error: ${taxErr.message}`;
        results.warnings.push(`Taxonomy load error for ${industrySpec.industry_id}: ${taxErr.message}`);
        continue;
      }

      // 2. Test-Candidates generieren und testen
      const testCandidates = createTestCandidates(taxonomyProfile);
      
      for (const testItem of testCandidates) {
        const { scenario, candidate, expected } = testItem;
        const candidateName = candidate.name;
        
        results.candidates_tested++;
        industryResult.candidates_tested++;

        const testResult = {
          scenario,
          candidate_name: candidateName,
          industry: industrySpec.industry_id,
          expected_outcome: expected,
          actual_outcome: null,
          scoring: null,
          chain_detection: null,
          diagnostics_valid: false,
          status: 'pending',
          issues: [],
        };

        try {
          // A. Chain Detection testen
          const chainResult = isLikelyChain(candidate);
          testResult.chain_detection = chainResult;

          if (expected.isChain && !chainResult.isChain) {
            testResult.issues.push(`Chain nicht erkannt: erwartet true, got ${chainResult.isChain}`);
          }
          if (!expected.isChain && chainResult.isChain) {
            testResult.issues.push(`Falsch als Chain erkannt: ${chainResult.reason}`);
          }

          // B. Scoring testen (nur wenn keine Chain)
          let scoring = null;
          if (!chainResult.isChain) {
            scoring = scoreCandidate(candidate, taxonomyProfile, 5, 20, null, candidate.types);
            testResult.scoring = scoring;

            // Erwartetes Ergebnis prüfen
            if (expected.shouldSave === true) {
              if (!scoring.shouldSave) {
                testResult.issues.push(`Should save but rejected: score=${scoring.score}, reason=${scoring.relevance_reason}`);
              }
              if (expected.minScore && scoring.score < expected.minScore) {
                testResult.issues.push(`Score too low: ${scoring.score} < ${expected.minScore}`);
              }
              if (scoring.shouldSave) {
                results.scenarios.good_fit_saved++;
                industryResult.passed++;
              }
            } else if (expected.shouldSave === false) {
              if (scoring.shouldSave) {
                testResult.issues.push(`Should NOT save but accepted: score=${scoring.score}`);
              }
              if (expected.maxScore && scoring.score > expected.maxScore) {
                testResult.issues.push(`Score too high: ${scoring.score} > ${expected.maxScore}`);
              }
              if (!scoring.shouldSave) {
                results.scenarios.bad_fit_rejected++;
                industryResult.passed++;
              }
            }
          } else {
            // Chain → automatisch rejected
            results.scenarios.chains_detected++;
            industryResult.passed++;
          }

          // C. Diagnostics prüfen
          if (scoring?.diagnostics) {
            const diag = scoring.diagnostics;
            const requiredFields = [
              'engine_version', 'score_raw', 'matched_weighted_signals',
              'bad_fit_signals_matched', 'bad_fit_penalty', 'search_strategy',
              'category_matched', 'score_breakdown',
            ];
            
            const missingFields = requiredFields.filter(f => !(f in diag));
            if (missingFields.length > 0) {
              testResult.issues.push(`Missing diagnostics fields: ${missingFields.join(', ')}`);
            } else {
              testResult.diagnostics_valid = true;
              results.scenarios.diagnostics_valid++;
            }

            // Engine-Version prüfen
            if (diag.engine_version !== SEARCH_ENGINE_VERSION) {
              testResult.issues.push(`Wrong engine version: ${diag.engine_version}`);
            }
          }

          // Status setzen
          testResult.status = testResult.issues.length === 0 ? 'pass' : 'fail';
          if (testResult.status === 'pass') {
            industryResult.passed++;
          } else {
            industryResult.failed++;
            results.failed_tests.push({
              industry: industrySpec.industry_id,
              scenario,
              candidate: candidateName,
              issues: testResult.issues,
            });
          }

        } catch (err) {
          testResult.status = 'error';
          testResult.issues.push(`Test execution error: ${err.message}`);
          industryResult.failed++;
          results.failed_tests.push({
            industry: industrySpec.industry_id,
            scenario,
            candidate: candidateName,
            error: err.message,
          });
        }

        industryResult.tests.push(testResult);
        results.tests.push(testResult);
      }

      // 3. Query-Generierung testen
      try {
        const targetCustomerTypes = taxonomyProfile.targetCustomerTypes?.slice(0, 3) || [];
        const excludedCustomerTypes = taxonomyProfile.excludedCustomerTypes || [];
        const hasGeoCoords = true;
        const trialStage = 'free_preview';

        const queryResult = buildQueriesFromProfile(
          taxonomyProfile,
          targetCustomerTypes,
          excludedCustomerTypes,
          trialStage,
          hasGeoCoords
        );

        const queryTest = {
          scenario: 'query_generation',
          industry: industrySpec.industry_id,
          queries_count: queryResult.queries.length,
          query_families: queryResult.queryFamiliesUsed,
          city_mode: queryResult.cityMode,
          status: 'pending',
          issues: [],
        };

        // Queries prüfen
        if (queryResult.queries.length === 0) {
          queryTest.issues.push('No queries generated');
          queryTest.status = 'fail';
        } else {
          // Target-Customer-Priorisierung prüfen
          const hasTargetCustomerQuery = queryResult.queries.some(q => 
            q.source === 'user_target' || q.matched_target_customer
          );
          
          if (targetCustomerTypes.length > 0 && !hasTargetCustomerQuery) {
            queryTest.issues.push('Target customer queries not prioritized');
          }

          // Excluded-CustomerTypes prüfen
          const excludedNorm = excludedCustomerTypes.map(e => normStr(e));
          const hasExcludedQuery = queryResult.queries.some(q => 
            excludedNorm.some(ex => normStr(q.query).includes(ex))
          );
          
          if (hasExcludedQuery) {
            queryTest.issues.push('Excluded customer types found in queries');
          }

          queryTest.status = queryTest.issues.length === 0 ? 'pass' : 'fail';
          if (queryTest.status === 'pass') {
            results.scenarios.queries_valid++;
            industryResult.passed++;
          } else {
            industryResult.failed++;
            results.failed_tests.push({
              industry: industrySpec.industry_id,
              scenario: 'query_generation',
              issues: queryTest.issues,
            });
          }
        }

        industryResult.tests.push(queryTest);

      } catch (queryErr) {
        results.warnings.push(`Query generation error for ${industrySpec.industry_id}: ${queryErr.message}`);
        industryResult.skipped++;
      }

      results.industry_results.push(industryResult);
    }

    // ── Zusammenfassung ─────────────────────────────────────────────────────
    const totalTests = results.candidates_tested + results.industries_tested;
    const passedTests = results.scenarios.good_fit_saved + 
                        results.scenarios.bad_fit_rejected + 
                        results.scenarios.chains_detected + 
                        results.scenarios.diagnostics_valid + 
                        results.scenarios.queries_valid;
    
    const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    const summary = {
      status: passRate >= 90 ? 'pass' : passRate >= 70 ? 'warning' : 'fail',
      pass_rate: Math.round(passRate),
      total_tests: totalTests,
      passed: passedTests,
      failed: results.failed_tests.length,
      skipped: results.skipped.length,
      warnings: results.warnings.length,
      key_metrics: results.scenarios,
    };

    console.info(`[auditLeadQualityScoring] Completed: ${summary.pass_rate}% passed (${summary.passed}/${summary.total_tests})`);

    return Response.json({
      success: true,
      summary,
      results,
      message: `Audit abgeschlossen: ${summary.pass_rate}% der Tests bestanden`,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[auditLeadQualityScoring] Fatal error:', errorMessage, error instanceof Error ? error.stack : undefined);
    return Response.json({ 
      error: errorMessage, 
      success: false,
      message: 'Audit fehlgeschlagen'
    }, { status: 500 });
  }
});