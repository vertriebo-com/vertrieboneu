/**
 * testLeadSearchEngine
 * ====================
 * v6-Live-Qualitätstest: Echte Google Places API + echte DB-Taxonomie.
 * KEIN Speichern in DB – reiner Diagnose-/Dry-Run-Modus.
 *
 * Testet DIESELBE Scoring-Logik wie processResearchRun v6:
 * - scoringSignalWeights (summiert, cap +35)
 * - badFitSignalWeights (abgestuft)
 * - placeTypeConfidence (high/medium/low)
 * - search_strategy (beeinflusst Query-Reihenfolge + TC-Bonus)
 * - shouldSave-Schwellwert: score >= 55 && !badFit
 *
 * Ergebnis-Format pro Test:
 * {
 *   profile_id, city, radius_km,
 *   raw_hits, saved_count, duplicates_skipped, no_match_count,
 *   search_strategy_used, place_type_confidence,
 *   queries_used: [{ query, category, search_strategy }],
 *   top_leads: [{ name, score, relevance_reason, engine_analysis, false_positive_risk }],
 *   quality_assessment: { target_customer_match_rate, avg_score, false_positive_estimate }
 * }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

// ── Helpers (identisch mit processResearchRun v6) ─────────────────────────────

function normStr(str) {
  return String(str || "").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").trim();
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function checkBadFit(candidate, profile) {
  const text = normStr([candidate.name, (candidate.types||[]).join(' '), candidate.formatted_address||''].join(' '));
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

  return { bad: totalPenalty <= -35, hardFail: false, totalPenalty, matchedSignals };
}

function scoreCandidate(candidate, profile, distanceKm, radiusKm, category) {
  const text = normStr([candidate.name, (candidate.types||[]).join(' '), candidate.formatted_address||''].join(' '));
  let score = 50;
  const reasons = [];
  let matched_search_category = category || null;
  let matched_target_customer_type = null;
  let placeTypeMatchStrength = 'none';
  const strategy = profile?.searchStrategy || 'target_customer_search';

  // Kategorie-Match
  if (!matched_search_category) {
    for (const cat of (profile?.searchableBusinessCategories || [])) {
      const variants = profile?.searchKeywordVariants?.[cat] ? profile.searchKeywordVariants[cat] : [cat];
      for (const v of variants) if (text.includes(normStr(v))) { matched_search_category = cat; break; }
      if (matched_search_category) break;
    }
  }
  if (matched_search_category) { score += 20; reasons.push(`Cat:${matched_search_category}(+20)`); }

  // Place Type Boost (confidence-gewichtet)
  const confidence = profile?.placeTypeConfidence || 'medium';
  const placeTypeBoostMap = { high: 15, medium: 8, low: 3 };
  const placeTypeBoost = placeTypeBoostMap[confidence] ?? 8;
  const profilePlaceTypes = profile?.googlePlaceTypes || [];
  const candidateTypes = candidate.types || [];
  const placeTypeMatch = candidateTypes.some(t => profilePlaceTypes.includes(t));
  if (placeTypeMatch && profilePlaceTypes.length > 0) {
    score += placeTypeBoost;
    placeTypeMatchStrength = confidence;
    reasons.push(`PlaceType:${confidence}(+${placeTypeBoost})`);
  }

  // Gewichtete Scoring-Signale
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

  // Kontaktdaten
  if (candidate.phone) { score += 8; reasons.push("Tel(+8)"); }
  if (candidate.website) { score += 8; reasons.push("Web(+8)"); }

  // Distanz
  if (distanceKm !== null && distanceKm <= radiusKm) { score += 8; }

  // TC-Match (strategy-abhängiger Bonus)
  const tcBonus = strategy === 'target_customer_search' ? 10 : strategy === 'mixed' ? 8 : 6;
  for (const tc of (profile?.targetCustomerTypes || [])) {
    if (text.includes(normStr(tc))) {
      matched_target_customer_type = tc;
      score += tcBonus;
      reasons.push(`TC:${tc}(+${tcBonus})`);
      break;
    }
  }

  // Website-Signal für website_signal_required
  if (strategy === 'website_signal_required' && !candidate.website) {
    score = Math.min(score, 54);
    reasons.push('NoWebsite(cap54)');
  }

  // Bad-Fit
  const badFit = checkBadFit(candidate, profile);
  if (badFit.totalPenalty < 0) {
    score += badFit.totalPenalty;
    if (badFit.matchedSignals.length > 0) reasons.push(`BadFit:[${badFit.matchedSignals.join(',')}](${badFit.totalPenalty})`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    matched_search_category,
    matched_target_customer_type,
    relevance_reason: reasons.join(' | ') || 'Base',
    shouldSave: score >= 55 && !badFit.bad,
    matchedWeightedSignals,
    badFitSignals: badFit.matchedSignals,
    placeTypeMatchStrength,
    search_strategy: strategy,
  };
}

function buildTestQueries(profile, maxQ = 12) {
  const queries = [];
  const seen = new Set();
  const strategy = profile?.searchStrategy || 'target_customer_search';

  const cats = profile?.searchableBusinessCategories || [];
  const prioritized = [
    ...(profile?.queryPriority || []).filter(c => cats.includes(c)),
    ...cats.filter(c => !(profile?.queryPriority || []).includes(c)),
  ];

  for (const cat of prioritized) {
    if (queries.length >= maxQ) break;
    const variants = (profile?.searchKeywordVariants?.[cat] ? profile.searchKeywordVariants[cat] : [cat]).slice(0, 2);
    for (const v of variants) {
      if (!seen.has(v)) {
        seen.add(v);
        queries.push({ query: v, category: cat, search_strategy: strategy });
      }
      if (queries.length >= maxQ) break;
    }
  }
  return queries;
}

async function searchPlaces(query, coords, radiusMeters, apiKey) {
  const body = {
    textQuery: query, languageCode: "de",
    locationBias: { circle: { center: { latitude: coords.lat, longitude: coords.lng }, radius: Math.min(radiusMeters, 30000) } },
    maxResultCount: 10,
  };
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.nationalPhoneNumber,places.websiteUri",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.places || []).map(p => ({
    place_id: p.id,
    name: p.displayName?.text || "",
    formatted_address: p.formattedAddress || "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating,
    user_ratings_total: p.userRatingCount,
    types: p.types || [],
    phone: p.nationalPhoneNumber || "",
    website: p.websiteUri || "",
  }));
}

async function geocodeCitySimple(city, apiKey) {
  const res = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.location,places.displayName",
    },
    body: JSON.stringify({ textQuery: city, languageCode: "de", maxResultCount: 1 }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const p = data.places?.[0];
  if (!p?.location) return null;
  return { lat: p.location.latitude, lng: p.location.longitude };
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin','platform_owner','platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Admin-Zugriff erforderlich', success: false }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      profile_id,         // z.B. "gebaeudereinigung"
      city,               // z.B. "Köln"
      radius_km = 25,
      max_queries = 6,    // max. Google-Queries (Kosten-Kontrolle)
      dry_run = true,     // immer true — kein DB-Speichern
      bypass_kill_switch = false, // Nur für Platform-Admin-Diagnose
    } = body;

    // ── PLATFORMCONFIG KILL-SWITCH (Phase 3) ──────────────────────────────────
    // testLeadSearchEngine respektiert Kill-Switch, außer Platform-Admin darf bewusst Diagnose machen
    if (!bypass_kill_switch) {
      const configs = await base44.asServiceRole.entities.PlatformConfig.list();
      const platformConfig = configs[0] || null;
      const isGooglePlacesDisabled = platformConfig && !platformConfig.google_places_api_enabled;
      
      if (isGooglePlacesDisabled) {
        console.warn(`[testLeadSearchEngine] KILL-SWITCH: google_places_api_enabled=false profile=${profile_id} city=${city}`);
        const disabledReason = platformConfig.disabled_reason || 'Die Lead-Recherche ist gerade in Wartung.';
        
        return Response.json({
          success: false,
          error: 'platform_disabled',
          message: disabledReason,
          dry_run: true,
          kill_switch_active: true,
        }, { status: 503 });
      }
    } else {
      console.info(`[testLeadSearchEngine] Bypass-Kill-Switch für Platform-Admin-Diagnose: profile=${profile_id} city=${city}`);
    }

    if (!profile_id || !city) {
      return Response.json({ error: 'profile_id und city erforderlich', success: false }, { status: 400 });
    }

    // ── Taxonomie-Profil laden (direkt aus DB, kein Function-Hop) ──────────
    const taxEntries = await base44.asServiceRole.entities.TaxonomyEntry.filter({ industry_id: profile_id, is_active: true });
    const taxEntry = taxEntries?.[0];
    if (!taxEntry) {
      return Response.json({ error: `Profil "${profile_id}" nicht in DB gefunden`, success: false }, { status: 404 });
    }

    function parseJsonField(val, fallback = []) {
      if (!val) return fallback;
      if (Array.isArray(val) || typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return fallback; }
    }

    const profile = {
      id: taxEntry.industry_id,
      label: taxEntry.label,
      ownServices: parseJsonField(taxEntry.own_services),
      targetCustomerTypes: parseJsonField(taxEntry.target_customer_types),
      excludedCustomerTypes: parseJsonField(taxEntry.excluded_customer_types),
      searchableBusinessCategories: parseJsonField(taxEntry.searchable_business_categories),
      searchKeywordVariants: parseJsonField(taxEntry.search_keyword_variants, {}),
      negativeKeywords: parseJsonField(taxEntry.negative_keywords),
      badFitSignals: parseJsonField(taxEntry.bad_fit_signals),
      badFitSignalWeights: parseJsonField(taxEntry.bad_fit_signal_weights, {}),
      scoringSignals: parseJsonField(taxEntry.scoring_signals),
      scoringSignalWeights: parseJsonField(taxEntry.scoring_signal_weights, {}),
      queryPriority: parseJsonField(taxEntry.query_priority),
      googlePlaceTypes: parseJsonField(taxEntry.google_place_types),
      placeTypeConfidence: taxEntry.place_type_confidence || 'medium',
      searchStrategy: taxEntry.search_strategy || 'target_customer_search',
      profileQualityScore: taxEntry.profile_quality_score || null,
    };
    if (!profile) {
      return Response.json({ error: `Profil "${profile_id}" nicht gefunden`, success: false }, { status: 404 });
    }

    // ── Stadt geocodieren ───────────────────────────────────────────────────
    const coords = await geocodeCitySimple(city, GOOGLE_PLACES_API_KEY);
    if (!coords) {
      return Response.json({ error: `Stadt "${city}" nicht geocodiert`, success: false }, { status: 400 });
    }

    const radiusMeters = radius_km * 1000;
    const queries = buildTestQueries(profile, Math.min(max_queries, 12));

    const results = {
      profile_id,
      profile_label: profile.label,
      city,
      radius_km,
      coords,
      search_strategy_used: profile.searchStrategy || 'target_customer_search',
      place_type_confidence: profile.placeTypeConfidence || 'medium',
      scoring_signal_count: (profile.scoringSignals || []).length,
      scoring_signal_weights_count: Object.keys(profile.scoringSignalWeights || {}).length,
      queries_used: queries,
      raw_hits: 0,
      saved_count: 0,
      no_match_count: 0,
      bad_fit_count: 0,
      top_leads: [],
      rejected_leads: [],
      quality_assessment: {},
      dry_run: true,
      tested_at: new Date().toISOString(),
    };

    const seenIds = new Set();
    const allCandidates = [];

    for (const qItem of queries) {
      const places = await searchPlaces(qItem.query, coords, radiusMeters, GOOGLE_PLACES_API_KEY);
      results.raw_hits += places.length;

      for (const place of places) {
        if (seenIds.has(place.place_id)) continue;
        seenIds.add(place.place_id);

        let distanceKm = null;
        if (place.lat && place.lng) {
          distanceKm = haversineKm(coords.lat, coords.lng, place.lat, place.lng);
          if (distanceKm > radius_km * 1.1) continue;
        }

        const scoring = scoreCandidate(place, profile, distanceKm, radius_km, qItem.category);

        // False-Positive-Risiko einschätzen
        const fpRisk = estimateFalsePositiveRisk(place, profile, scoring);

        const candidateResult = {
          name: place.name,
          formatted_address: place.formatted_address,
          types: place.types,
          phone: place.phone,
          website: place.website,
          distance_km: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
          score: scoring.score,
          relevance_reason: scoring.relevance_reason,
          matched_target_customer: scoring.matched_target_customer_type,
          matched_search_category: scoring.matched_search_category,
          should_save: scoring.shouldSave,
          engine_analysis: {
            matched_weighted_signals: scoring.matchedWeightedSignals,
            bad_fit_signals_matched: scoring.badFitSignals,
            place_type_match_strength: scoring.placeTypeMatchStrength,
            search_strategy: scoring.search_strategy,
          },
          false_positive_risk: fpRisk,
          query_used: qItem.query,
          query_category: qItem.category,
        };

        allCandidates.push(candidateResult);

        if (scoring.shouldSave) {
          results.saved_count++;
          results.top_leads.push(candidateResult);
        } else {
          results.no_match_count++;
          results.rejected_leads.push({ name: place.name, score: scoring.score, reason: scoring.relevance_reason });
        }
      }
    }

    // Top-Leads nach Score sortieren (max 15)
    results.top_leads.sort((a, b) => b.score - a.score);
    results.top_leads = results.top_leads.slice(0, 15);
    results.rejected_leads = results.rejected_leads.slice(0, 10);

    // ── Quality Assessment ──────────────────────────────────────────────────
    const savedLeads = allCandidates.filter(c => c.should_save);
    const tcMatchCount = savedLeads.filter(c => c.matched_target_customer).length;
    const avgScore = savedLeads.length > 0
      ? Math.round(savedLeads.reduce((s, c) => s + c.score, 0) / savedLeads.length)
      : 0;
    const highFpCount = savedLeads.filter(c => c.false_positive_risk === 'high').length;
    const fpRate = savedLeads.length > 0 ? Math.round((highFpCount / savedLeads.length) * 100) : 0;

    results.quality_assessment = {
      avg_score: avgScore,
      target_customer_match_rate: savedLeads.length > 0 ? Math.round((tcMatchCount / savedLeads.length) * 100) : 0,
      false_positive_estimate_percent: fpRate,
      quality_verdict: avgScore >= 70 && fpRate <= 20 ? 'GOOD' : avgScore >= 60 && fpRate <= 35 ? 'ACCEPTABLE' : 'NEEDS_TUNING',
      signals_fired: [...new Set(savedLeads.flatMap(c => c.engine_analysis?.matched_weighted_signals || []))].slice(0, 10),
      search_strategy_effectiveness: profile.searchStrategy === 'target_customer_search'
        ? (tcMatchCount > 0 ? 'target_customers_found' : 'no_tc_match_check_profile')
        : 'strategy_' + (profile.searchStrategy || 'unknown'),
    };

    console.info(`[testLeadSearchEngine] ${profile_id}@${city} | raw=${results.raw_hits} saved=${results.saved_count} noMatch=${results.no_match_count} avgScore=${avgScore} verdict=${results.quality_assessment.quality_verdict} strategy=${profile.searchStrategy}`);

    return Response.json({ success: true, ...results });

  } catch (error) {
    console.error('[testLeadSearchEngine] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Interner Fehler', success: false }, { status: 500 });
  }
});

// ── False-Positive-Risiko-Einschätzung ───────────────────────────────────────
// Heuristik: Ist dieser Lead wirklich ein Zielkunde der Branche?
function estimateFalsePositiveRisk(place, profile, scoring) {
  const text = normStr([place.name, (place.types||[]).join(' '), place.formatted_address||''].join(' '));
  const strategy = profile?.searchStrategy || 'target_customer_search';

  // Starke Signale = niedriges Risiko
  if (scoring.matchedWeightedSignals?.length >= 2) return 'low';
  if (scoring.matched_target_customer_type) return 'low';
  if (scoring.placeTypeMatchStrength === 'high') return 'low';

  // Keine Kategorie getroffen = erhöhtes Risiko
  if (!scoring.matched_search_category) return 'high';

  // Mittleres Risiko: Kategorie getroffen, aber keine weiteren Signale
  if (scoring.matchedWeightedSignals?.length === 0 && scoring.placeTypeMatchStrength === 'none') return 'medium';

  return 'low';
}