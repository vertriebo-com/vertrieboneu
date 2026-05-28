/**
 * processResearchRun
 * ==================
 * v6-weighted-scoring: Gewichtete Signale, Place-Type-Confidence, Search-Strategy-Query-Steuerung.
 *
 * SCORING-MODELL:
 * - scoring_signal_weights: Objekt {signal: Gewicht} pro Profil. Fallback: pauschal 12.
 * - bad_fit_signal_weights: Objekt {signal: Abzug} pro Profil. Fallback: pauschal -35.
 * - place_type_confidence: high/medium/low → bestimmt wie stark google_place_types zählen.
 * - search_strategy: STEUERT AKTIV die Query-Generierung:
 *   - target_customer_search: Sucht nach Zielkunden (Hausverwaltungen, Praxen etc.) → Standard
 *   - provider_search: Sucht nach gleichartigen Anbietern (z.B. Konkurrenz-Analyse)
 *   - mixed: Kombiniert beides — erst Zielkunden, dann Provider
 *   - registry_enrichment_recommended: Fokus auf offizielle Registereinträge
 *   - website_signal_required: Nur Companies mit Website werden gespeichert
 *
 * QUERY-STEUERUNG via search_strategy:
 * - target_customer_search: queryPriority aus targetCustomerTypes, Score-Bonus für TC-Match (+10)
 * - provider_search: queryPriority direkt aus searchableBusinessCategories
 * - mixed: beide Listen kombiniert, Zielkunden zuerst
 * - website_signal_required: Normales Query-Building + shouldSave prüft website
 *
 * DIAGNOSTICS (pro Company):
 * - engine_analysis_json speichert matched_weighted_signals, bad_fit_signals,
 *   place_type_match_strength, search_strategy_used für spätere Analyse.
 *
 * IDEMPOTENZ-GARANTIEN (v5, unverändert):
 * 1. Processing-Lock + 2. Pre-Create-Dedupe + 3. Intra-Batch-Dedupe
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
const SEARCH_ENGINE_VERSION = "v6-weighted-scoring";

// ── SUPABASE SHADOW MODE (Phase 1) ───────────────────────────────────────────
// Schreibt nach jedem Company.create ein lead_usage_event in Supabase (RPC).
// Non-blocking: Fehler werden geloggt aber nie geworfen.
// Dokumentation: docs/SUPABASE_RPC_TEST_RESULTS_2026_05_20.md
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");

async function recordLeadUsageEvent(orgId, periodMonth, companyId, runId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_lead_usage_event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        p_organization_id: orgId,
        p_period_month: periodMonth,
        p_company_id: companyId,
        p_research_run_id: runId || null,
        p_source: 'research',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[processResearchRun][supabase] RPC failed: HTTP ${res.status} — ${text.slice(0, 150)}`);
    }
  } catch (e) {
    console.warn(`[processResearchRun][supabase] RPC error (non-blocking): ${e?.message}`);
  }
}

async function auditResearchEvent(runId, orgId, eventType, workerKey, eventData = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/audit_research_event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({
        p_research_run_id: runId,
        p_organization_id: orgId,
        p_event_type: eventType,
        p_worker_key: workerKey,
        p_event_data: eventData,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[processResearchRun][audit] RPC failed: HTTP ${res.status} — ${text.slice(0, 150)}`);
    }
  } catch (e) {
    console.warn(`[processResearchRun][audit] RPC error (non-blocking): ${e?.message}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normStr(str) {
  return String(str || "").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").trim();
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function isLikelyChain(candidate) {
  const chainKeywords = ['aldi','lidl','penny','netto','rewe','edeka','kaufland','dm','rossmann','h&m','zara','primark','deichmann','deutsche post','dhl','sparkasse','deutsche bank','commerzbank','mcdonalds','burger king','subway','kfc','starbucks','hilton','marriott','ibis','motel one','fitx','mcfit','fitness first','fielmann','apollo optik','telekom','vodafone','ikea','obi','bauhaus','hornbach','franchise','kette','filialen','konzern'];
  const nameLower = normStr(candidate.name || '');
  // Wortgrenz-sensitiver Match: keyword muss als eigenständiges Token vorkommen
  // Verhindert False Positives wie "STREETBOOSTER" → matched "obi" als Substring
  for (const kw of chainKeywords) {
    const idx = nameLower.indexOf(kw);
    if (idx === -1) continue;
    // Prüfe ob Zeichen vor und nach dem Treffer keine Wortzeichen sind (Wortgrenze)
    const before = idx === 0 ? true : /[\s\-_\/\(\)\.,]/.test(nameLower[idx - 1]);
    const after = idx + kw.length >= nameLower.length ? true : /[\s\-_\/\(\)\.,]/.test(nameLower[idx + kw.length]);
    if (before && after) {
      return {
        isChain: true,
        reason: `Kette: ${kw}`,
        matched_chain_keyword: kw,
        matched_in_field: 'name',
        raw_text_excerpt: nameLower.slice(Math.max(0, idx - 10), idx + kw.length + 10),
      };
    }
  }
  if ((candidate.user_ratings_total || 0) > 1500) return { isChain: true, reason: `>1500 Bewertungen`, matched_chain_keyword: null, matched_in_field: 'rating_count', raw_text_excerpt: `${candidate.user_ratings_total} Bewertungen` };
  return { isChain: false };
}

// ── GEWICHTETE BAD-FIT-PRÜFUNG ────────────────────────────────────────────────
// Gibt { bad: bool, totalPenalty: number, matchedSignals: string[] }
function checkBadFit(candidate, profile) {
  const text = normStr([candidate.name, (candidate.types||[]).join(' '), candidate.vicinity||'', candidate.formatted_address||''].join(' '));
  const matchedSignals = [];
  let totalPenalty = 0;

  // Negative Keywords → immer hard-fail (unverändert)
  for (const kw of (profile?.negativeKeywords || [])) {
    if (text.includes(normStr(kw))) {
      return { bad: true, hardFail: true, totalPenalty: -100, matchedSignals: [`NegKw:${kw}`] };
    }
  }

  // Bad-Fit-Signals → gewichtet
  const weights = profile?.badFitSignalWeights || {};
  for (const s of (profile?.badFitSignals || [])) {
    if (text.includes(normStr(s))) {
      const penalty = weights[s] ?? -35; // Default -35
      totalPenalty += penalty;
      matchedSignals.push(`${s}(${penalty})`);
    }
  }

  // Harter Ausschluss wenn Gesamt-Penalty sehr negativ
  const bad = totalPenalty <= -35;
  return { bad, hardFail: false, totalPenalty, matchedSignals };
}

// ── GEWICHTETES SCORING ───────────────────────────────────────────────────────
function scoreCandidate(candidate, profile, distanceKm, radiusKm, category, placeTypes) {
  const text = normStr([candidate.name, (candidate.types||[]).join(' '), candidate.vicinity||'', candidate.formatted_address||''].join(' '));
  let score = 50;
  const reasons = [];
  let matched_search_category = category || null;
  let matched_target_customer_type = null;
  let placeTypeMatchStrength = 'none';

  // ── EVIDENCE-ZÄHLER (starke vs. schwache Evidenzen) ──────────────────────
  // Distanz-in-Radius zählt NICHT als starke Evidenz (zu trivial).
  // strong_evidence: kategorie, place_type, scoring_signal, tc_match
  // weak_evidence:   telefon, website, adresse (kontaktierbar, aber kein semantischer Match)
  const evidenceFlags = {
    category_match: false,
    place_type_match: false,
    scoring_signal_match: false,
    target_customer_match: false,
    phone: !!(candidate.formatted_phone_number || candidate.international_phone_number),
    website: !!candidate.website,
    address: !!(candidate.formatted_address || candidate.vicinity),
  };


  // ── Kategorie-Match ──
  if (!matched_search_category) {
    for (const cat of (profile?.searchableBusinessCategories || [])) {
      const variants = profile?.searchKeywordVariants?.[cat] ? profile.searchKeywordVariants[cat] : [cat];
      for (const v of variants) if (text.includes(normStr(v))) { matched_search_category = cat; break; }
      if (matched_search_category) break;
    }
  }
  if (matched_search_category) { score += 20; reasons.push(`Cat:${matched_search_category}(+20)`); evidenceFlags.category_match = true; }

  // ── Google Place Types als Boost (confidence-gewichtet) ──
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
    evidenceFlags.place_type_match = true;
  }

  // ── GEWICHTETE Scoring-Signale ──
  const signalWeights = profile?.scoringSignalWeights || {};
  const signalsList = profile?.scoringSignals || [];
  let totalSignalScore = 0;
  const matchedWeightedSignals = [];

  for (const s of signalsList) {
    if (text.includes(normStr(s))) {
      const w = signalWeights[s] ?? 12; // Default 12 statt pauschaler 15
      totalSignalScore += w;
      matchedWeightedSignals.push(`${s}(+${w})`);
      // Kein break mehr: mehrere Signale können matchen, bis Cap
    }
  }
  // Cap: max. 35 Punkte aus Signalen (verhindert Überbewertung durch viele schwache Matches)
  const cappedSignalScore = Math.min(35, totalSignalScore);
  if (cappedSignalScore > 0) {
    score += cappedSignalScore;
    reasons.push(`Signals:[${matchedWeightedSignals.slice(0,4).join(',')}](+${cappedSignalScore})`);
    evidenceFlags.scoring_signal_match = true;
  }

  // ── Kontaktdaten (schwache Evidenz: zählt für Score, nicht für strong_evidence) ──
  if (candidate.formatted_phone_number || candidate.international_phone_number) { score += 8; reasons.push("Tel(+8)"); }
  if (candidate.website) { score += 8; reasons.push("Web(+8)"); }

  // ── Distanz ──
  if (distanceKm !== null && distanceKm <= radiusKm) { score += 8; }

  // ── Zielkunden-Match (Bonus abhängig von search_strategy) ──
  const strategy = profile?.searchStrategy || 'target_customer_search';
  const tcBonus = strategy === 'target_customer_search' ? 10 : strategy === 'mixed' ? 8 : 6;
  for (const tc of (profile?.targetCustomerTypes || [])) {
    if (text.includes(normStr(tc))) {
      matched_target_customer_type = tc;
      score += tcBonus;
      reasons.push(`TC:${tc}(+${tcBonus})`);
      evidenceFlags.target_customer_match = true;
      break;
    }
  }

  // ── Query-Intent-Match: Kandidat stammt aus einer vom Nutzer gewählten Zielkunden-Suche ──
  // Dies ist starke semantische Evidenz auch wenn TC-Keyword nicht im Firmennamen steht.
  // Unterschied zu target_customer_match: dieser prüft Namen/Text; query_intent_match prüft Query-Herkunft.
  // Wird von scoreCandidate nicht selbst befüllt – muss vom Aufrufer (outer scope) per qItem injiziert werden.
  // Wird als default false initialisiert; der Aufrufer setzt evidenceFlags.query_intent_match nach Aufruf.
  evidenceFlags.query_intent_match = false;
  // (Wird von scoreCandidate nicht gesetzt – der Aufrufer muss es setzen, da qItem hier nicht sichtbar ist)

  // ── Website-Signal für website_signal_required ──
  const websiteRequired = strategy === 'website_signal_required';
  if (websiteRequired && !candidate.website) {
    score = Math.min(score, 54); // Unter Schwellwert erzwingen wenn keine Website
    reasons.push('NoWebsite(cap54)');
  }

  // ── Bad-Fit prüfen ──
  const badFit = checkBadFit(candidate, profile);
  if (badFit.totalPenalty < 0) {
    score += badFit.totalPenalty; // negativ
    if (badFit.matchedSignals.length > 0) {
      reasons.push(`BadFit:[${badFit.matchedSignals.join(',')}](${badFit.totalPenalty})`);
    }
  }

  score = Math.max(0, Math.min(100, score));

  // ── EVIDENCE-AUSWERTUNG ──────────────────────────────────────────────────
  // strong_evidence: semantische Übereinstimmung (Kategorie, PlaceType, Signal, TC, Query-Intent)
  // weak_evidence:   Kontaktdaten (erreichbar, aber kein semantischer Match)
  // HINWEIS: evidenceFlags.query_intent_match wird vom Aufrufer NACH scoreCandidate gesetzt.
  // Hier als false initialisiert, danach im Aufrufer überschrieben bevor Tier-Berechnung.
  // Tier-Berechnung erfolgt daher NICHT hier, sondern nach dem query_intent_match-Inject im outer scope.
  // (Tier-Berechnung siehe unten nach dem scoreCandidate-Aufruf in der Batch-Schleife)
  const strongEvidenceKeys = ['category_match', 'place_type_match', 'scoring_signal_match', 'target_customer_match', 'query_intent_match'];
  const weakEvidenceKeys   = ['phone', 'website', 'address'];
  // Zähler werden nach query_intent_match-Inject in outer scope neu berechnet – hier als Zwischenstand
  const strongEvidenceCount = strongEvidenceKeys.filter(k => evidenceFlags[k]).length;
  const weakEvidenceCount   = weakEvidenceKeys.filter(k => evidenceFlags[k]).length;
  const positiveEvidenceCount = strongEvidenceCount + weakEvidenceCount;

  // ── QUALITY-TIER-MAPPING (Basis ohne query_intent_match – wird im outer scope neu berechnet) ─
  let qualityTier, qualityConfidence, qualityReasonDetail;
  if (score >= 85 && strongEvidenceCount >= 3) {
    qualityTier = 'premium'; qualityConfidence = 'high'; qualityReasonDetail = 'strong_match';
  } else if (score >= 75 && strongEvidenceCount >= 2) {
    qualityTier = 'strong'; qualityConfidence = 'high'; qualityReasonDetail = 'strong_match';
  } else if (score >= 65 && strongEvidenceCount >= 2) {
    qualityTier = 'good'; qualityConfidence = 'medium'; qualityReasonDetail = 'good_match';
  } else {
    qualityTier = 'weak'; qualityConfidence = 'low';
    qualityReasonDetail = evidenceFlags.category_match ? 'weak_category_address_only' : 'base_only';
  }

  // Save-Reason-Code: kurze lesbare Zusammenfassung der positiven Evidenzen
  const saveReasonParts = [];
  if (evidenceFlags.target_customer_match) saveReasonParts.push('tc_match');
  if (evidenceFlags.query_intent_match) saveReasonParts.push('target_query');
  if (evidenceFlags.category_match) saveReasonParts.push('cat_match');
  if (evidenceFlags.place_type_match) saveReasonParts.push('placetype');
  if (evidenceFlags.scoring_signal_match) saveReasonParts.push('signal');
  if (evidenceFlags.phone) saveReasonParts.push('phone');
  if (evidenceFlags.website) saveReasonParts.push('website');
  if (evidenceFlags.address) saveReasonParts.push('address');
  const saveReasonCode = saveReasonParts.join('+') || 'base_only';

  // ── Diagnostics-Objekt (query_intent_match wird nach Aufruf injiziert) ──
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
    // Evidence-Diagnostics (query_intent_match=false bis outer scope injiziert)
    evidence_flags: evidenceFlags,
    positive_evidence_count: positiveEvidenceCount,
    strong_evidence_count: strongEvidenceCount,
    weak_evidence_count: weakEvidenceCount,
    quality_tier: qualityTier,
    quality_confidence: qualityConfidence,
    quality_reason_detail: qualityReasonDetail,
    save_reason_code: saveReasonCode,
    // query_intent_match-Felder – werden vom Aufrufer befüllt
    query_intent_match: false,
    query_source: null,
    query_matched_target_customer: null,
  };

  return {
    score,
    matched_search_category,
    matched_target_customer_type,
    relevance_reason: reasons.join(' | ') || 'Base',
    shouldSave: score >= 55 && !badFit.bad,
    // Tier/Code/Confidence = Zwischenstand; wird nach query_intent_match-Inject neu gesetzt
    qualityTier,
    qualityConfidence,
    qualityReasonDetail,
    saveReasonCode,
    diagnostics,
    evidenceFlags, // zurückgeben damit outer scope query_intent_match injizieren kann
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

    // ── search_strategy steuert Query-Reihenfolge ──────────────────────────
    if (strategy === 'provider_search') {
      // Provider-Suche: direkt nach eigenen Kategorien suchen (kein TC-Match)
      const staticPrio = (profile.queryPriority || []).filter(c => usedCats.includes(c));
      const rest = usedCats.filter(c => !staticPrio.includes(c));
      prioritized = [...staticPrio, ...rest];
    } else if (strategy === 'registry_enrichment_recommended') {
      // Register-Modus: bevorzuge offizielle Kategorien mit formalen Namen
      const staticPrio = (profile.queryPriority || []).filter(c => usedCats.includes(c));
      const rest = usedCats.filter(c => !staticPrio.includes(c));
      prioritized = [...staticPrio, ...rest];
    } else {
      // target_customer_search / mixed / website_signal_required:
      // Zielkunden-Kategorien priorisieren
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
        // mixed: fügt provider-seitige Kategorien ans Ende
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

async function searchPlaces(query, coords, radiusMeters, apiKey) {
  const body = {
    textQuery: query, languageCode: "de",
    locationBias: { circle: { center: { latitude: coords.lat, longitude: coords.lng }, radius: Math.min(radiusMeters, 50000) } },
    maxResultCount: 20,
  };
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type":"application/json","X-Goog-Api-Key":apiKey,"X-Goog-FieldMask":"places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.places || []).map(p => ({
    place_id: p.id,
    name: p.displayName?.text || "",
    formatted_address: p.formattedAddress || "",
    geometry: { location: { lat: p.location?.latitude, lng: p.location?.longitude } },
    rating: p.rating,
    user_ratings_total: p.userRatingCount,
    types: p.types || [],
  }));
}

async function getPlaceDetails(placeId, apiKey) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=de`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,location,addressComponents,types",
    },
  });
  if (!res.ok) return null;
  const p = await res.json();
  if (!p || p.error) return null;
  return {
    place_id: p.id,
    name: p.displayName?.text || "",
    formatted_address: p.formattedAddress || "",
    formatted_phone_number: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
    website: p.websiteUri || "",
    geometry: { location: { lat: p.location?.latitude, lng: p.location?.longitude } },
    types: p.types || [],
    address_components: (p.addressComponents || []).map(c => ({ long_name: c.longText, types: c.types })),
  };
}

function extractAddress(components = []) {
  let plz = '', ort = '', strasse = '', hausnummer = '';
  for (const c of components) {
    if (c?.types?.includes('postal_code')) plz = c.long_name;
    if (c?.types?.includes('locality')) ort = c.long_name;
    if (c?.types?.includes('route')) strasse = c.long_name;
    if (c?.types?.includes('street_number')) hausnummer = c.long_name;
  }
  return { plz, ort, adresse: [strasse, hausnummer].filter(Boolean).join(' ') };
}

// KANONISCH: Kalendermonat Europe/Berlin (YYYY-MM)
// Phase-3: Vereinheitlicht mit getUsageSummary + startResearchRun (period-utils v1.0).
// Tech-Debt: Base44 kein Import → inline-Kopie. Version: period-utils v1.0 (2026-05-25)
function getPeriodMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return `${y}-${m}`; // z.B. "2026-05"
}

// QUOTA-RESERVIERUNG MIT CODE-BASEIERTER UNIQUE-PRÜFUNG
// WICHTIG: Base44 enforced unique_constraints NICHT atomar auf DB-Ebene!
// Daher müssen wir im Code prüfen ob der Slot schon existiert VOR dem Create.
async function reserveQuotaSlot(base44, organization_id, runId) {
  const periodMonth = getPeriodMonth();
  const now = new Date().toISOString();
  
  const org = await base44.asServiceRole.entities.Organization.filter({ id: organization_id }).catch(() => []);
  const planId = org[0]?.plan_id;
  if (!planId) return { success: false, error: 'Kein Plan gefunden' };
  
  const plan = await base44.asServiceRole.entities.Plan.filter({ id: planId }).catch(() => []);
  const monthlyLimit = plan[0]?.max_leads_per_month ?? -1;
  
  // Unlimited → kein Lock nötig
  if (monthlyLimit === -1) {
    return { success: true, unlimited: true };
  }
  
  // 1. ALLE Slots laden (nicht nur COUNT!)
  // Base44 unique_constraints werden NICHT enforced → wir müssen selbst prüfen
  const existingSlots = await base44.asServiceRole.entities.QuotaReservation.filter({ 
    organization_id, 
    period_month: periodMonth 
  });
  
  // 2. Nächste freie Slot-Nummer ermitteln
  const maxSlot = existingSlots.reduce((max, r) => Math.max(max, r.slot_number || 0), 0);
  const nextSlot = maxSlot + 1;
  
  // 3. Hard-Check: Slot > Limit?
  if (nextSlot > monthlyLimit) {
    console.warn(`[reserveQuotaSlot] QUOTA EXHAUSTED: Slot ${nextSlot}/${monthlyLimit} org=${organization_id}`);
    return { 
      success: false, 
      error: 'monthly_quota_reached',
      slot: nextSlot,
      limit: monthlyLimit 
    };
  }
  
  // 4. PRÜFEN ob Slot schon existiert (Race-Condition-Schutz im Code!)
  const slotExists = existingSlots.some(s => s.slot_number === nextSlot);
  if (slotExists) {
    // Slot wurde parallel erstellt → nächsten freien Slot finden
    console.warn(`[reserveQuotaSlot] Slot ${nextSlot} exists (race condition), finding next free slot org=${organization_id}`);
    
    // Alle belegten Slots
    const takenSlots = new Set(existingSlots.map(s => s.slot_number));
    
    // Nächsten freien Slot finden
    let freeSlot = nextSlot;
    while (takenSlots.has(freeSlot) && freeSlot <= monthlyLimit) {
      freeSlot++;
    }
    
    if (freeSlot > monthlyLimit) {
      return { 
        success: false, 
        error: 'monthly_quota_reached',
        slot: freeSlot,
        limit: monthlyLimit 
      };
    }
    
    console.info(`[reserveQuotaSlot] Using free slot ${freeSlot} instead of ${nextSlot}`);
    return await createQuotaReservation(base44, organization_id, periodMonth, freeSlot, runId, now, monthlyLimit);
  }
  
  // 5. Slot erstellen
  return await createQuotaReservation(base44, organization_id, periodMonth, nextSlot, runId, now, monthlyLimit);
}

// Helper: QuotaReservation erstellen mit abschließender Prüfung
async function createQuotaReservation(base44, organization_id, periodMonth, slotNumber, runId, now, monthlyLimit) {
  // Letzte Prüfung VOR Create
  const existingSlots = await base44.asServiceRole.entities.QuotaReservation.filter({ 
    organization_id, 
    period_month: periodMonth 
  });
  
  const slotExists = existingSlots.some(s => s.slot_number === slotNumber);
  if (slotExists) {
    console.warn(`[createQuotaReservation] Slot ${slotNumber} just taken, retrying...`);
    // Retry mit nächstem Slot
    const takenSlots = new Set(existingSlots.map(s => s.slot_number));
    let freeSlot = slotNumber;
    while (takenSlots.has(freeSlot) && freeSlot <= monthlyLimit) {
      freeSlot++;
    }
    
    if (freeSlot > monthlyLimit) {
      return { success: false, error: 'monthly_quota_reached', slot: freeSlot, limit: monthlyLimit };
    }
    
    return await createQuotaReservation(base44, organization_id, periodMonth, freeSlot, runId, now, monthlyLimit);
  }
  
  // Create
  await base44.asServiceRole.entities.QuotaReservation.create({
    organization_id,
    period_month: periodMonth,
    slot_number: slotNumber,
    research_run_id: runId,
    status: 'reserved',
    reserved_at: now,
  });
  
  console.info(`[createQuotaReservation] Created slot ${slotNumber}/${monthlyLimit} for run ${runId}`);
  
  return { 
    success: true, 
    reserved: true, 
    slot_number: slotNumber,
    remaining: monthlyLimit - slotNumber
  };
}

// Commit nach erfolgreichem Company.create: slot → committed, company_id setzen
async function commitQuotaSlot(base44, organization_id, periodMonth, slotNumber, companyId) {
  const slots = await base44.asServiceRole.entities.QuotaReservation.filter({
    organization_id,
    period_month: periodMonth,
    slot_number: slotNumber,
  });
  
  if (slots[0]) {
    await base44.asServiceRole.entities.QuotaReservation.update(slots[0].id, {
      status: 'committed',
      company_id: companyId,
      committed_at: new Date().toISOString(),
    });
  }
  
  // UsageLog synchron halten (für Reports/Backwards Compatibility)
  const now = new Date().toISOString();
  const usageRecords = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
  if (usageRecords[0]) {
    await base44.asServiceRole.entities.UsageLog.update(usageRecords[0].id, {
      leads_created: (usageRecords[0].leads_created || 0) + 1,
      last_lead_generation_at: now,
    });
  } else {
    const [y, m] = periodMonth.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString();
    await base44.asServiceRole.entities.UsageLog.create({
      organization_id, period_month: periodMonth,
      period_start: start, period_end: end,
      leads_created: 1, lead_generations_used: 1,
      last_lead_generation_at: now,
    });
  }
}

// Release bei Fallback: Slot freigeben wenn Company.create fehlschlägt
async function releaseQuotaSlot(base44, organization_id, periodMonth, slotNumber) {
  const slots = await base44.asServiceRole.entities.QuotaReservation.filter({
    organization_id,
    period_month: periodMonth,
    slot_number: slotNumber,
  });
  
  if (slots[0]) {
    await base44.asServiceRole.entities.QuotaReservation.update(slots[0].id, {
      status: 'released',
      released_at: new Date().toISOString(),
    });
  }
}

// upsertUsageLogBatch wurde entfernt - nicht mehr genutzt!
// UsageLog wird pro Lead via commitQuotaSlot synchron gehalten

// ── MAIN ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const MAX_BATCH_MS = 18000;
  const MAX_RUN_SECONDS = 180;
  const LOCK_DURATION_MS = 25000;

  // ── OUTER-SCOPE VARIABLEN FÜR CATCH-BLOCK (kritisch für Error-Handling) ────
  // Diese Variablen werden vor dem try deklariert damit sie im catch sicher verfügbar sind.
  // GitHub Lint: Vermeidet ReferenceError bei block-scoped const/let im try.
  let research_run_id = null;
  let organization_id = null;
  let workerKey = 'unknown';
  let runSnapshot = null;

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt', success: false }, { status: 401 });

    const body = await req.json();
    // SICHERHEIT: organization_id wird NICHT aus dem Body gelesen – immer aus dem validierten ResearchRun ermittelt
    const { research_run_id: run_id_from_body, force_finish } = body;
    if (!run_id_from_body) {
      return Response.json({ error: 'research_run_id erforderlich', success: false }, { status: 400 });
    }

    // ── ResearchRun laden ────────────────────────────────────────────────────
    const runs = await base44.asServiceRole.entities.ResearchRun.filter({ id: run_id_from_body }).catch(() => []);
    const run = runs[0];
    if (!run) return Response.json({ error: 'Nicht gefunden', success: false }, { status: 404 });

    // ── OUTER-SCOPE SNAPSHOTS SETZEN (für catch-Block) ───────────────────────
    research_run_id = run.id;
    organization_id = run.organization_id;
    runSnapshot = run;

    // ── Tenant-sicherer Ownership-Check ──────────────────────────────────────
    // SICHERHEIT: organization_id IMMER aus dem validierten ResearchRun, nie aus dem Request-Body
    const isPlatformAdmin = ["admin","platform_owner","platform_admin"].includes(user.role);

    if (!isPlatformAdmin) {
      // Org laden um owner_email direkt zu vergleichen (kein Filter-Bypass möglich)
      const orgRecords = await base44.asServiceRole.entities.Organization.filter({ id: organization_id }).catch(() => []);
      const orgRecord = orgRecords[0];
      if (!orgRecord) return Response.json({ error: 'Nicht gefunden', success: false }, { status: 404 });

      const isOwner = orgRecord.owner_email === user.email; // Direktvergleich: kein Filter-Vertrauensproblem
      const memberships = await base44.asServiceRole.entities.OrganizationMember.filter({ organization_id, user_email: user.email, status: 'active' }).catch(() => []);
      const isMember = memberships.length > 0;

      if (!isOwner && !isMember) {
        // 403: Zugriff verweigert. Keine Details über den fremden Run.
        return Response.json({ error: 'Kein Zugriff', success: false }, { status: 403 });
      }
    }

    // research_run_id für den error-handler setzen – erst NACH bestandenem Tenant-Check
    research_run_id = run.id;

    // ── force_finish ─────────────────────────────────────────────────────────
    if (force_finish) {
      const finishStatus = (run.leads_saved || 0) > 0 ? 'partial' : 'failed';
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: finishStatus, finished_at: new Date().toISOString(),
        current_step: finishStatus === 'partial'
          ? `Recherche abgeschlossen (Timeout): ${run.leads_saved || 0} Kontakte gefunden`
          : 'Recherche abgebrochen (Timeout)',
        stop_reason: 'stale_run_timeout',
        error_message: 'Run durch Stale-Watchdog beendet.',
        processing_lock_until: null, processing_by: null,
      });
      return Response.json({
        success: true, done: true, status: finishStatus,
        leads_saved: run.leads_saved || 0, progress_percent: 100,
        message: `Recherche beendet: ${run.leads_saved || 0} Kontakte gefunden`,
      });
    }

    // ── Max-Runtime-Guard ────────────────────────────────────────────────────
    if (run.started_at) {
      const runAgeSeconds = (Date.now() - new Date(run.started_at).getTime()) / 1000;
      if (runAgeSeconds > MAX_RUN_SECONDS) {
        const finishStatus = (run.leads_saved || 0) > 0 ? 'partial' : 'failed';
        console.warn(`[processResearchRun] Max-Runtime überschritten (${Math.round(runAgeSeconds)}s) run=${research_run_id}`);
        await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
          status: finishStatus, finished_at: new Date().toISOString(),
          current_step: finishStatus === 'partial'
            ? `Recherche abgeschlossen (Max-Zeit): ${run.leads_saved || 0} Kontakte gefunden`
            : 'Recherche abgebrochen (Max-Zeit)',
          stop_reason: 'max_runtime_exceeded',
          processing_lock_until: null, processing_by: null,
        });
        return Response.json({
          success: true, done: true, status: finishStatus,
          leads_saved: run.leads_saved || 0, progress_percent: 100,
          message: `Recherche beendet: ${run.leads_saved || 0} Kontakte gefunden`,
        });
      }
    }

    // ── PROCESSING LOCK (Run-Level) ───────────────────────────────────────────
    const lockUntil = run.processing_lock_until ? new Date(run.processing_lock_until).getTime() : 0;
    const lockBy = run.processing_by || null;
    workerKey = `${user.email}:${Date.now()}`; // outer-scope Variable zuweisen (kein const!)
    const isLockActive = lockUntil > Date.now() && lockBy !== null;

    if (isLockActive) {
      return Response.json({
        success: true, done: false, already_processing: true,
        status: run.status,
        leads_saved: run.leads_saved || 0,
        progress_percent: run.progress_percent || 5,
        current_step: run.current_step || 'Recherche läuft…',
        message: run.current_step || 'Recherche läuft…',
      });
    }

    // ── VITAL: Wenn Run bereits completed/failed/partial → nicht weiterverarbeiten ──
    // Diese prüfe NACH dem Lock-Check aber SOFORT danach, damit keine zweite Batch läuft
    if (['completed', 'partial', 'failed'].includes(run.status)) {
      return Response.json({
        success: true, done: true, status: run.status,
        leads_saved: run.leads_saved || 0,
        progress_percent: run.progress_percent || 100,
        message: run.status === 'completed'
          ? `Recherche abgeschlossen: ${run.leads_saved || 0} neue Firmenkontakte gefunden.`
          : run.status === 'partial'
          ? `Recherche teilweise abgeschlossen: ${run.leads_saved || 0} Kontakte gefunden.`
          : `Recherche fehlgeschlagen: ${run.error_message || 'Unbekannter Fehler'}`,
      });
    }

    // ── SERIAL LOCK: Keine anderen aktiven Runs dieser Org verarbeiten ────────
    const otherRunningRuns = await base44.asServiceRole.entities.ResearchRun.filter({ organization_id }, '-created_date', 5);
    const conflictRun = otherRunningRuns.find(r => 
      r.id !== research_run_id && 
      r.status === 'running' && 
      r.processing_lock_until && 
      new Date(r.processing_lock_until).getTime() > Date.now()
    );
    if (conflictRun) {
      console.warn(`[processResearchRun] Serial-Lock blocked: ${conflictRun.id}`);
      return Response.json({
        success: true, done: false, already_processing: true,
        status: run.status, leads_saved: run.leads_saved || 0,
        progress_percent: run.progress_percent || 5,
        current_step: 'Warte auf anderen Recherche-Lauf…',
        message: 'Ein anderer Recherche-Lauf läuft gerade. Bitte warten.',
      });
    }

    // ── OPTIMISTIC LOCK: Schreibe Lock + unique workerKey, dann nochmal lesen ──
    // Zwei parallele Workers schreiben beide ihren workerKey. Der zweite überschreibt
    // den ersten. Nach 300ms lesen beide nochmal — nur einer sieht seinen eigenen Key.
    const lockExpires = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
    await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
      processing_lock_until: lockExpires,
      processing_by: workerKey, // outer-scope Variable verwenden
      worker_attempts: (run.worker_attempts || 0) + 1,
    });

    // Warten damit DB-Write committed ist, dann nochmal lesen
    await new Promise(r => setTimeout(r, 300));
    const verifyRuns = await base44.asServiceRole.entities.ResearchRun.filter({ id: research_run_id });
    const verifiedRun = verifyRuns[0];

    // Wenn processing_by nicht unser Key → anderer Worker hat gewonnen
    if (!verifiedRun || verifiedRun.processing_by !== workerKey) {
      console.warn(`[processResearchRun] Lost optimistic lock. Owner: ${verifiedRun?.processing_by}, us: ${workerKey}`);
      return Response.json({
        success: true, done: false, already_processing: true,
        status: verifiedRun?.status || run.status,
        leads_saved: verifiedRun?.leads_saved || run.leads_saved || 0,
        progress_percent: verifiedRun?.progress_percent || run.progress_percent || 5,
        current_step: verifiedRun?.current_step || 'Recherche läuft…',
        message: verifiedRun?.current_step || 'Recherche läuft…',
      });
    }

    // Run inzwischen completed? → Lock freigeben und raus
    if (['completed', 'partial', 'failed'].includes(verifiedRun.status)) {
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        processing_lock_until: null, processing_by: null,
      });
      return Response.json({
        success: true, done: true, status: verifiedRun.status,
        leads_saved: verifiedRun.leads_saved || 0, progress_percent: 100,
        message: `Recherche abgeschlossen: ${verifiedRun.leads_saved || 0} Kontakte gefunden.`,
      });
    }

    // ── PUNKT 1+3: Frischer DB-Read nach Lock-Gewinn (Source of Truth) ───────
    // Nach dem Optimistic-Lock-Gewinn nochmal frisch lesen.
    // Verhindert: Worker liest alten batch_index/leads_saved aus cache-warmem Objekt.
    const freshRuns = await base44.asServiceRole.entities.ResearchRun.filter({ id: research_run_id });
    const freshRun = freshRuns[0];
    if (!freshRun) {
      return Response.json({ error: 'Run verschwunden nach Lock', success: false }, { status: 404 });
    }

    // Punkt 2: Nochmal Status prüfen (könnte sich zwischen Lock-Write und jetzt geändert haben)
    if (['completed', 'partial', 'failed'].includes(freshRun.status)) {
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        processing_lock_until: null, processing_by: null,
      });
      console.info(`[processResearchRun] Fresh-read: Run already ${freshRun.status}, releasing lock`);
      return Response.json({
        success: true, done: true, status: freshRun.status,
        leads_saved: freshRun.leads_saved || 0, progress_percent: 100,
        message: `Recherche abgeschlossen: ${freshRun.leads_saved || 0} Kontakte gefunden.`,
      });
    }

    // ── Suchplan lesen ───────────────────────────────────────────────────────
    let searchPlan;
    try {
      searchPlan = JSON.parse(freshRun.search_plan_json || '{}');
    } catch {
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: 'failed', error_message: 'Suchplan ungültig', finished_at: new Date().toISOString(),
        processing_lock_until: null, processing_by: null,
      });
      return Response.json({ success: false, error: 'Suchplan ungültig', done: true, status: 'failed' }, { status: 400 });
    }

    const {
      industry, industryId, city, radiusKm, radiusMeters,
      targetCustomerTypes = [], excludedCustomerTypes = [],
      trialStage, cityCoords, allPoints = [], allCenters = [],
      effectiveTarget, taxonomyProfile, taxonomyHash, taxonomyVersion,
      // LocationIndex Coverage
      coveredLocations = [],
      coverageMode = 'grid_only',
    } = searchPlan;

    // ── PUNKT 3: Batch-Index und Target frisch aus DB lesen ──────────────────
    // freshRun enthält den aktuellen Stand NACH dem Lock-Gewinn.
    // Nicht mehr aus dem alten `run`-Objekt lesen.
    const freshBatchIndex = freshRun.batch_index || 0;
    const freshLeadsSaved = freshRun.leads_saved || 0;

    const hasGeoCoords = !!(cityCoords?.lat && cityCoords?.lng);

    // ── PLATFORMCONFIG KILL-SWITCH (Phase 3) ──────────────────────────────────
    // Wenn Google Places oder Research systemweit deaktiviert ist → sauber abbrechen
    const configs = await base44.asServiceRole.entities.PlatformConfig.list();
    const platformConfig = configs[0] || null;
    const isGooglePlacesDisabled = platformConfig && !platformConfig.google_places_api_enabled;
    
    if (isGooglePlacesDisabled) {
      console.warn(`[processResearchRun] KILL-SWITCH: google_places_api_enabled=false run=${research_run_id}`);
      const disabledReason = platformConfig.disabled_reason || 'Die Lead-Recherche ist gerade in Wartung.';
      
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: 'failed',
        error_message: disabledReason,
        finished_at: new Date().toISOString(),
        zero_result_cause: 'platform_disabled',
        stop_reason: 'platform_config_kill_switch',
        processing_lock_until: null, processing_by: null,
      });
      
      // KEINE Companies erstellt, KEIN UsageLog geschrieben
      return Response.json({
        success: false,
        done: true,
        status: 'failed',
        error: 'platform_disabled',
        message: disabledReason,
      }, { status: 503 });
    }

    // ── Taxonomie-Profil Pflichtprüfung ──────────────────────────────────────
    if (!taxonomyProfile) {
      console.error(`[processResearchRun] taxonomy_profile_missing run=${research_run_id}`);
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: 'failed',
        error_message: `taxonomy_profile_missing: Kein Profil für "${industry}".`,
        finished_at: new Date().toISOString(),
        zero_result_cause: 'taxonomy_profile_missing',
        processing_lock_until: null, processing_by: null,
      });
      return Response.json({ success: false, done: true, status: 'failed', error: 'taxonomy_profile_missing' }, { status: 400 });
    }

    // ── Queries bauen ────────────────────────────────────────────────────────
    const { queries: allQueries, queryFamiliesUsed, cityMode } = buildQueriesFromProfile(
      taxonomyProfile, targetCustomerTypes, excludedCustomerTypes, trialStage, hasGeoCoords
    );

    if (allQueries.length === 0) {
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: 'failed', error_message: 'Keine Suchkategorien gefunden.', finished_at: new Date().toISOString(),
        zero_result_cause: 'no_queries_built', processing_lock_until: null, processing_by: null,
      });
      return Response.json({ success: false, error: 'Keine Suchkategorien.', done: true, status: 'failed' });
    }

    // ── Status auf running setzen ────────────────────────────────────────────
    if (freshRun.status === 'queued') {
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: 'running', current_step: 'Firmenprofile werden gesucht…', progress_percent: 5,
        started_at: new Date().toISOString(),
        taxonomy_version: taxonomyVersion || 'unknown',
        industry_id: industryId || industry, city_mode: cityMode,
        query_families_used: JSON.stringify(queryFamiliesUsed),
        selected_target_customer_types: targetCustomerTypes.join(', '),
        excluded_customer_types: excludedCustomerTypes.join(', '),
        search_centers_used: JSON.stringify(
          allCenters.length > 0 ? allCenters : cityCoords ? [{ lat: cityCoords.lat, lng: cityCoords.lng, city }] : []
        ),
      });
    }

    // ── Bereits gesehene Place-IDs (aus freshRun lesen!) ────────────────────
    let seenPlaceIds = new Set();
    try { seenPlaceIds = new Set(JSON.parse(freshRun.seen_place_ids || '[]')); } catch {}

    // ── Intra-Batch-Dedupe ───────────────────────────────────────────────────
    const existing = await base44.asServiceRole.entities.Company.filter({ organization_id }, '-created_date', 1000);
    const existingNames = new Set(existing.map(c => normStr(c.name || '')));
    const existingPlaceIds = new Set(existing.filter(c => c.google_place_id).map(c => c.google_place_id));
    const existingNameOrt = new Set(existing.map(c => `${normStr(c.name)}|${normStr(c.ort || '')}`).filter(k => k.length > 1));
    const existingNamePhone = new Set(
      existing
        .filter(c => c.telefon && normStr(c.telefon).length >= 6)
        .map(c => `${normStr(c.name)}|${normStr(c.telefon)}`)
    );

    // ── PUNKT 4: Run-spezifische Place-IDs deduplizieren ────────────────────
    // Verhindert, dass derselbe Place innerhalb desselben Runs zweimal gespeichert wird,
    // auch wenn zwei Worker kurz parallel liefen.
    const runCompanies = existing.filter(c => c.research_run_id === research_run_id && c.google_place_id);
    const runPlaceIds = new Set(runCompanies.map(c => c.google_place_id));
    console.info(`[processResearchRun] Run-Dedupe: ${runPlaceIds.size} Places bereits in diesem Run`);

    // ── PUNKT 3: currentLeadsSaved + batchIndex aus freshRun (nicht aus cache) ─
    const currentLeadsSaved = freshLeadsSaved;
    const batchTarget = effectiveTarget || 25;

    if (currentLeadsSaved >= batchTarget) {
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: 'completed', progress_percent: 100, current_step: `${currentLeadsSaved} Firmenkontakte gefunden`,
        finished_at: new Date().toISOString(), processing_lock_until: null, processing_by: null,
      });
      console.info(`[processResearchRun] GUARD: leads_saved(${currentLeadsSaved}) >= target(${batchTarget}), completing`);
      return Response.json({ success: true, done: true, status: 'completed', leads_saved: currentLeadsSaved, progress_percent: 100 });
    }

    // ── Batch ────────────────────────────────────────────────────────────────
    const batchIndex = freshBatchIndex;
    const QUERIES_PER_BATCH = trialStage === 'free_preview' ? 2 : 3;
    const PLACE_DETAILS_PER_BATCH = 15;

    // ── Search Points: Grid + LocationIndex-Orte kombiniert ─────────────────
    // Wenn coveredLocations aus LocationIndex vorhanden → Location-Punkte einmischen.
    // Strategie: coveredLocations als zusätzliche Named-Points mit city-Kontext.
    // Grid-Punkte bleiben als Fallback-Basis erhalten.

    const basePoint = cityCoords ? { lat: cityCoords.lat, lng: cityCoords.lng, label:'center', centerLat: cityCoords.lat, centerLng: cityCoords.lng, centerCity: city } : null;
    const gridPoints = allPoints.length > 0 ? allPoints : basePoint ? [basePoint] : [];

    // LocationIndex-Punkte: als Suchzentren mit PLZ/Stadt-Kontext
    // Nur wenn coverageMode = location_index_plus_grid und coveredLocations vorhanden
    const locationIndexPoints = (coverageMode === 'location_index_plus_grid' && coveredLocations.length > 0)
      ? coveredLocations.map(l => ({
          lat: l.lat,
          lng: l.lng,
          label: `loc_${l.postal_code}_${l.city}`,
          centerLat: l.lat,
          centerLng: l.lng,
          centerCity: l.city,
          // Zusatz-Kontext für Query-Building und Company-Tracking
          locationCity: l.city,
          locationPostalCode: l.postal_code,
          coverageSource: 'location_index',
        }))
      : [];

    // Kombination: erst LocationIndex-Punkte (Priorität), dann Grid als Ergänzung
    // Kein hartes Limit mehr: alle selected coveredLocations müssen erreichbar sein
    const allAvailablePoints = locationIndexPoints.length > 0
      ? [...locationIndexPoints, ...gridPoints]
      : gridPoints;

    // ── totalBatches: max(queryBatches, pointBatches) sichert vollständige Abdeckung ─
    // FIX: Vorher nur queryBatches → bei Professional/Gold wurden nicht alle Orte erreicht.
    // Jetzt: genug Batches damit jeder Punkt mindestens einmal als Suchzentrum dient.
    const POINTS_PER_BATCH = trialStage === 'free_preview' ? 1 : 3;
    const queryBatches = Math.ceil(allQueries.length / QUERIES_PER_BATCH);
    const pointBatches = Math.ceil(allAvailablePoints.length / POINTS_PER_BATCH);
    const totalBatches = Math.max(queryBatches, pointBatches);

    console.info(`[processResearchRun] Points: locationIndex=${locationIndexPoints.length} grid=${gridPoints.length} combined=${allAvailablePoints.length} coverageMode=${coverageMode}`);
    console.info(`[processResearchRun] Batches: queryBatches=${queryBatches} pointBatches=${pointBatches} totalBatches=${totalBatches} (max garantiert alle Orte)`);

    // GUARD: batch_index >= totalBatches → completed
    if (batchIndex >= totalBatches) {
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: 'completed', progress_percent: 100,
        current_step: currentLeadsSaved > 0 ? `${currentLeadsSaved} Firmenkontakte gefunden` : 'Keine neuen Kontakte gefunden',
        finished_at: new Date().toISOString(), processing_lock_until: null, processing_by: null,
        ...(currentLeadsSaved === 0 ? { zero_result_cause: 'all_queries_exhausted' } : {}),
      });
      console.info(`[processResearchRun] GUARD: batchIndex(${batchIndex}) >= totalBatches(${totalBatches}), completing`);
      return Response.json({ success: true, done: true, status: 'completed', leads_saved: currentLeadsSaved, progress_percent: 100 });
    }

    // ── Queries: Wrap-around Rotation ────────────────────────────────────────
    // Wenn pointBatches > queryBatches rotieren Queries durch → keine leeren batchQueries mehr.
    // Jede Query wird über alle nötigen Batches wiederholt für neue Orte.
    const queryOffset = (batchIndex * QUERIES_PER_BATCH) % allQueries.length;
    const batchQueries = [];
    for (let i = 0; i < QUERIES_PER_BATCH; i++) {
      batchQueries.push(allQueries[(queryOffset + i) % allQueries.length]);
    }

    if (allAvailablePoints.length === 0) {
      await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
        status: 'failed', error_message: 'Keine Suchkoordinaten.', finished_at: new Date().toISOString(),
        zero_result_cause: 'no_geo_coords', processing_lock_until: null, processing_by: null,
      });
      return Response.json({ success: false, error: 'Keine Suchkoordinaten.', done: true, status: 'failed' });
    }

    const pointOffset = (batchIndex * POINTS_PER_BATCH) % allAvailablePoints.length;
    const pointsToSearch = [];
    for (let i = 0; i < POINTS_PER_BATCH; i++) {
      pointsToSearch.push(allAvailablePoints[(pointOffset + i) % allAvailablePoints.length]);
    }

    // Suchradius pro Punkt: kleinerer Radius für dichtere Grid-Punkte, größer für wenige Punkte
    // Ziel: Überlappung zwischen benachbarten Grid-Punkten minimal halten
    const pointRadiusMeters = Math.min(
      radiusKm <= 10 ? 8000 : radiusKm <= 25 ? 12000 : 20000,
      Math.max(5000, (radiusMeters * 0.6) / Math.max(allAvailablePoints.length, 1) * POINTS_PER_BATCH)
    );

    console.info(`[processResearchRun] Search points: total=${allAvailablePoints.length} offset=${pointOffset} using=${pointsToSearch.length} pointRadiusMeters=${Math.round(pointRadiusMeters)} batchIndex=${batchIndex}`);
    let newLeadsSavedThisBatch = 0, rawHitsThisBatch = 0, dupSkippedThisBatch = 0, noMatchThisBatch = 0, outsideRadiusThisBatch = 0, placeDetailsUsed = 0;
    // Chain-Skip-Diagnostik (nur diese Batch – wird am Ende mit Run-Stand akkumuliert)
    let chainSkippedThisBatch = 0;
    const chainSkippedExamplesThisBatch = [];
    // Track welche LocationIndex-Orte tatsächlich durchsucht wurden
    const locationsSearchedSet = new Set();

    outer:
    for (const point of pointsToSearch) {
      const pointCenter = { lat: point.centerLat || cityCoords?.lat, lng: point.centerLng || cityCoords?.lng, city: point.centerCity || city };
      // LocationIndex-Tracking
      if (point.locationCity) locationsSearchedSet.add(`${point.locationPostalCode}_${point.locationCity}`);

      for (const qItem of batchQueries) {
        const { query, category, variant, family, matched_target_customer } = qItem;

        if (newLeadsSavedThisBatch + currentLeadsSaved >= batchTarget) break outer;
        if (Date.now() - startedAt > MAX_BATCH_MS) { console.warn('[processResearchRun] Batch time budget reached'); break outer; }

        // ── Punkt 5: Ortsbezogene Query für LocationIndex-Punkte ──────────────
        // Bei benannten Orten (city-level) wird eine Stadtname-Variante eingemischt:
        // "Hausverwaltung" + locationBias → zusätzlich "Hausverwaltung Neuwied" ohne Bias
        // Das verbessert die Trefferrate bei präzisen Ortssuchen erheblich.
        let allPlacesForQuery = [];
        const geoQuery = query;
        allPlacesForQuery = await searchPlaces(geoQuery, { lat: point.lat, lng: point.lng }, pointRadiusMeters, GOOGLE_PLACES_API_KEY);
        rawHitsThisBatch += allPlacesForQuery.length;

        // City-Keyword-Variante: nur für LocationIndex-Punkte mit bekanntem Ort
        if (point.locationCity && allPlacesForQuery.length < 5) {
          const cityQuery = `${query} ${point.locationCity}`;
          const cityPlaces = await searchPlaces(cityQuery, { lat: point.lat, lng: point.lng }, Math.min(pointRadiusMeters * 1.5, 25000), GOOGLE_PLACES_API_KEY);
          rawHitsThisBatch += cityPlaces.length;
          // Zusammenführen, Duplikate per place_id vermeiden
          const existingIds = new Set(allPlacesForQuery.map(p => p.place_id));
          for (const cp of cityPlaces) {
            if (!existingIds.has(cp.place_id)) { allPlacesForQuery.push(cp); existingIds.add(cp.place_id); }
          }
          if (cityPlaces.length > 0) {
            console.info(`[processResearchRun] City-Query "${cityQuery}" → +${cityPlaces.length} zusätzliche Treffer`);
          }
        }
        const places = allPlacesForQuery;

        for (const place of places) {
          if (newLeadsSavedThisBatch + currentLeadsSaved >= batchTarget) break outer;
          if (placeDetailsUsed >= PLACE_DETAILS_PER_BATCH) break outer;

          if (seenPlaceIds.has(place.place_id)) continue;
          seenPlaceIds.add(place.place_id);

          if (existingPlaceIds.has(place.place_id)) {
            dupSkippedThisBatch++;
            continue;
          }

          const placeLat = place.geometry?.location?.lat;
          const placeLng = place.geometry?.location?.lng;
          let distanceKm = null;
          if (placeLat && placeLng) {
            const centers = allCenters.length > 0 ? allCenters : (cityCoords ? [{ lat: cityCoords.lat, lng: cityCoords.lng }] : []);
            const nearAnyCenter = centers.some(sc => haversineKm(sc.lat, sc.lng, placeLat, placeLng) <= radiusKm * 1.05);
            if (!nearAnyCenter) { outsideRadiusThisBatch++; continue; }
            distanceKm = centers.length > 0 ? Math.min(...centers.map(sc => haversineKm(sc.lat, sc.lng, placeLat, placeLng))) : null;
          }

          const chainCheck = isLikelyChain(place);
          if (chainCheck.isChain) {
            noMatchThisBatch++;
            chainSkippedThisBatch++;
            // Diagnostik-Beispiel sammeln (max 10 pro Run gesamt – wird später auf Gesamt-Array geprüft)
            if (chainSkippedExamplesThisBatch.length < 5) {
              // would_match_target_customer: prüfen ob Kette zu TC oder Kategorie passen würde
              const candidateName = normStr(place.name || '');
              const tcTypes = taxonomyProfile?.targetCustomerTypes || [];
              const catList = taxonomyProfile?.searchableBusinessCategories || [];
              const wouldMatchTC = tcTypes.some(tc => candidateName.includes(normStr(tc)) || normStr(tc).includes(candidateName.slice(0, 6)));
              const wouldMatchCat = catList.some(c => candidateName.includes(normStr(c)) || normStr(c).includes(candidateName.slice(0, 6)));

              // Empfohlene Policy basierend auf would_match
              let recommendedPolicy = 'exclude';
              if (wouldMatchTC) recommendedPolicy = 'allow_if_target_customer';
              else if (wouldMatchCat) recommendedPolicy = 'downgrade';
              else if (chainCheck.reason === '>1500 Bewertungen') recommendedPolicy = 'manual_review';

              chainSkippedExamplesThisBatch.push({
                name: place.name,
                reason: chainCheck.reason,
                // Neu: präzise Chain-Match-Diagnostik für False-Positive-Prüfung
                matched_chain_keyword: chainCheck.matched_chain_keyword || null,
                matched_in_field: chainCheck.matched_in_field || 'name',
                raw_text_excerpt: chainCheck.raw_text_excerpt || null,
                source_query: qItem.variant || qItem.query,
                search_category: qItem.category,
                matched_target_customer: qItem.matched_target_customer || null,
                place_types: place.types || [],
                rating_count: place.user_ratings_total || 0,
                search_center_city: point.centerCity || city,
                coverage_source: point.coverageSource || 'grid',
                would_match_target_customer: wouldMatchTC,
                would_match_category: wouldMatchCat,
                recommended_policy: recommendedPolicy,
              });
            }
            continue;
          }

          if (existingNames.has(normStr(place.name || ''))) { dupSkippedThisBatch++; continue; }

          const scoring = scoreCandidate(place, taxonomyProfile, distanceKm, radiusKm, category, place.types);
          if (!scoring.shouldSave) { noMatchThisBatch++; continue; }

          // ── Query-Intent-Match: nach scoreCandidate injizieren ──────────────
          // query_intent_match = true wenn der Kandidat aus einer nutzer-gewählten Zielkunden-Suche stammt.
          // Unterschied zu target_customer_match (Textmatch im Namen): hier Herkunft der Query.
          const queryIntentMatch = qItem.source === 'user_target' || qItem.source === 'user_fallback' || !!qItem.matched_target_customer;
          if (queryIntentMatch) {
            scoring.evidenceFlags.query_intent_match = true;
            scoring.diagnostics.query_intent_match = true;
            scoring.diagnostics.query_source = qItem.source;
            scoring.diagnostics.query_matched_target_customer = qItem.matched_target_customer || null;

            // Tier neu berechnen mit query_intent_match als starke Evidenz
            const strongKeys = ['category_match','place_type_match','scoring_signal_match','target_customer_match','query_intent_match'];
            const weakKeys   = ['phone','website','address'];
            const sc = strongKeys.filter(k => scoring.evidenceFlags[k]).length;
            const wc = weakKeys.filter(k => scoring.evidenceFlags[k]).length;
            scoring.diagnostics.strong_evidence_count = sc;
            scoring.diagnostics.weak_evidence_count = wc;
            scoring.diagnostics.positive_evidence_count = sc + wc;

            // Tier-Mapping mit query_intent_match
            // query_intent allein zählt als starke Evidenz, aber:
            // strong/high erfordert zusätzlich mindestens eine weitere harte Evidenz
            // (place_type, scoring_signal, tc_match) ODER beide Kontaktdaten (phone+website).
            const hasAdditionalHardEvidence = scoring.evidenceFlags.place_type_match || scoring.evidenceFlags.scoring_signal_match || scoring.evidenceFlags.target_customer_match;
            const hasStrongContactEvidence = scoring.evidenceFlags.phone && scoring.evidenceFlags.website;
            const isTargetQueryCategory = scoring.evidenceFlags.query_intent_match && scoring.evidenceFlags.category_match;

            if (scoring.score >= 85 && sc >= 3 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
              scoring.qualityTier = 'premium'; scoring.qualityConfidence = 'high'; scoring.diagnostics.quality_reason_detail = 'strong_match';
            } else if (scoring.score >= 75 && sc >= 2 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
              scoring.qualityTier = 'strong'; scoring.qualityConfidence = 'high'; scoring.diagnostics.quality_reason_detail = 'strong_match';
            } else if (scoring.score >= 65 && sc >= 2 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
              scoring.qualityTier = 'good'; scoring.qualityConfidence = 'medium'; scoring.diagnostics.quality_reason_detail = 'good_match';
            } else if (isTargetQueryCategory && wc >= 1 && scoring.score >= 65) {
              // Sonderfall: query_intent + category + min. 1 Kontaktdatum → good/medium
              // (kein hasAdditionalHardEvidence nötig, aber kein automatic strong/high mehr)
              scoring.qualityTier = 'good'; scoring.qualityConfidence = 'medium'; scoring.diagnostics.quality_reason_detail = 'found_via_target_customer_query';
            } else {
              scoring.qualityTier = 'weak'; scoring.qualityConfidence = 'low';
              scoring.diagnostics.quality_reason_detail = scoring.evidenceFlags.category_match
                ? (wc >= 1 ? 'weak_category_address_only' : 'weak_category_only')
                : 'base_only';
            }
            scoring.diagnostics.quality_tier = scoring.qualityTier;
            scoring.diagnostics.quality_confidence = scoring.qualityConfidence;

            // Save-Reason-Code neu aufbauen mit target_query
            const src = [];
            if (scoring.evidenceFlags.target_customer_match) src.push('tc_match');
            src.push('target_query');
            if (scoring.evidenceFlags.category_match) src.push('cat_match');
            if (scoring.evidenceFlags.place_type_match) src.push('placetype');
            if (scoring.evidenceFlags.scoring_signal_match) src.push('signal');
            if (scoring.evidenceFlags.phone) src.push('phone');
            if (scoring.evidenceFlags.website) src.push('website');
            if (scoring.evidenceFlags.address) src.push('address');
            scoring.saveReasonCode = src.join('+') || 'target_query';
            scoring.diagnostics.save_reason_code = scoring.saveReasonCode;
          }

          const details = await getPlaceDetails(place.place_id, GOOGLE_PLACES_API_KEY);
          placeDetailsUsed++;
          const { plz, ort, adresse } = extractAddress(details?.address_components || []);
          const matchedServiceContext = matched_target_customer
            ? (taxonomyProfile?.ownServices?.slice(0, 3) || []).join(', ')
            : (taxonomyProfile?.ownServices?.[0] || '');

          // Dedupe nach Details
          const nameOrtKey = `${normStr(place.name)}|${normStr(ort || '')}`;
          if (ort && existingNameOrt.has(nameOrtKey)) { dupSkippedThisBatch++; continue; }
          const phoneNorm = normStr(details?.formatted_phone_number || '');
          const namePhoneKey = `${normStr(place.name)}|${phoneNorm}`;
          if (phoneNorm.length >= 6 && existingNamePhone.has(namePhoneKey)) { dupSkippedThisBatch++; continue; }

          // Pre-Create Final DB Check (org-weit)
          const alreadyExists = await base44.asServiceRole.entities.Company.filter({
            organization_id, google_place_id: place.place_id,
          });
          if (alreadyExists && alreadyExists.length > 0) {
            dupSkippedThisBatch++;
            existingPlaceIds.add(place.place_id);
            runPlaceIds.add(place.place_id);
            continue;
          }

          // PUNKT 4: Run-spezifischer Dedupe-Check (verhindert Doppelschreiben bei Race)
          if (runPlaceIds.has(place.place_id)) {
            console.warn(`[processResearchRun] Run-Dedupe: place_id ${place.place_id} bereits in diesem Run gespeichert`);
            dupSkippedThisBatch++;
            continue;
          }

          // ── MVP: Quota-Reservation entfernt aus kritischem Pfad ─────────────────
          // Quota-Reservation war nicht atomar und hat Companies blockiert.
          // Stattdessen: UsageLog wird direkt nach Company.create erhöht.
          // Quota-Prüfung erfolgt weiterhin vor Batch-Start (harter Quota-Check oben).

          // Diagnostics-JSON für Engine-Analyse
          const engineDiagnostics = {
            ...scoring.diagnostics,
            query_used: variant || query,
            query_category: category,
            query_family: family,
            place_types_from_google: place.types || [],
            matched_target_customer,
          };

          // ── PROVENANCE: Feldherkunft aus Google Places dokumentieren ─────────
          // Übergangsfeld provenance_json (Phase 1). Supabase-ready:
          // future table: lead_provenance(org_id, company_id, field_name, source_type, ...)
          const provenanceFields = {};
          const provenanceNow = new Date().toISOString();
          const provenanceBase = {
            source_type: 'google_places',
            source_function: 'processResearchRun',
            confidence: 'high',
            review_status: 'confirmed',
            updated_at: provenanceNow,
            updated_by: 'system',
          };
          // name, adresse, ort, plz immer von Google Places
          provenanceFields.name    = { ...provenanceBase };
          provenanceFields.address = { ...provenanceBase };
          // Kontaktfelder nur wenn tatsächlich vorhanden
          if (details?.formatted_phone_number) provenanceFields.phone   = { ...provenanceBase };
          if (details?.website)                provenanceFields.website = { ...provenanceBase };

// ── SCHRITT 1: Company.create (kritisch) ───────────────────────────────
          let companyId = null;
          let companyCreateError = null;
          try {
            const companyRes = await base44.asServiceRole.entities.Company.create({
              organization_id,
              name: place.name || '',
              branche: scoring.matched_target_customer_type || matched_target_customer || scoring.matched_search_category || category,
              ort: ort || city, plz: plz || '', adresse: adresse || '',
              telefon: details?.formatted_phone_number || '',
              email: '', website: details?.website || '',
              latitude: details?.geometry?.location?.lat || placeLat || null,
              longitude: details?.geometry?.location?.lng || placeLng || null,
              quelle: 'Google Places API', status: 'Neu', is_hot: false,
              relevance_score: scoring.score,
              relevance_reason: scoring.relevance_reason,
              source_query: variant || query,
              distance_km: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
              search_center_city: pointCenter.city || city,
              search_center_lat: pointCenter.lat,
              search_center_lng: pointCenter.lng,
              search_radius_km: radiusKm,
              research_run_id,
              matched_target_customer_type: scoring.matched_target_customer_type || matched_target_customer || null,
              matched_search_category: scoring.matched_search_category || category || null,
              matched_service_context: matchedServiceContext || null,
              google_place_id: place.place_id || null,
              source_provider: 'google_places',
              engine_analysis_json: JSON.stringify(engineDiagnostics),
              engine_version: SEARCH_ENGINE_VERSION,
              engine_confidence: scoring.score,
              engine_last_analyzed_at: new Date().toISOString(),
              // Quality-Tier (evidence-basiert, nicht nur score-basiert)
              quality_tier: scoring.qualityTier,
              quality_confidence: scoring.qualityConfidence,
              save_reason_code: scoring.saveReasonCode,
              // Provenance: Feldherkunft aus Google Places
              provenance_json: JSON.stringify({ fields: provenanceFields }),
              // LocationIndex Coverage-Diagnostik
              matched_location_city: point.locationCity || null,
              matched_location_postal_code: point.locationPostalCode || null,
              matched_location_distance_km: point.locationCity && placeLat && point.lat
                ? Math.round(haversineKm(point.lat, point.lng, placeLat, placeLng || point.lng) * 10) / 10
                : null,
              search_coverage_source: point.coverageSource || 'grid',
            });
            
            companyId = companyRes.id;
            console.info(`[processResearchRun] ✅ Company erstellt: "${place.name}" (ID: ${companyId})`);
            
          } catch (err) {
            companyCreateError = err;
            console.error(`[processResearchRun] ❌ Company.create failed: ${err.message}`);
          }
          
          // ── SCHRITT 2: Wenn Company.create erfolgreich → Counter +1 (kritisch) ──
          if (companyId && !companyCreateError) {
            // Dedupe-Sets aktualisieren + Counter erhöhen (IMMER nach erfolgreichem Create!)
            existingNames.add(normStr(place.name || ''));
            existingPlaceIds.add(place.place_id);
            runPlaceIds.add(place.place_id); // PUNKT 4: Run-Dedupe aktualisieren
            if (ort) existingNameOrt.add(nameOrtKey);
            if (phoneNorm.length >= 6) existingNamePhone.add(namePhoneKey);
            newLeadsSavedThisBatch++;
            console.info(`[processResearchRun] ✅ Counter erhöht: newLeadsSavedThisBatch=${newLeadsSavedThisBatch}`);
            
            // ── SCHRITT 3: UsageLog +1 (nicht-kritisch, eigener try/catch) ────────
            const periodMonth = getPeriodMonth();
            const now = new Date().toISOString();
            try {
              const usageRecords = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
              if (usageRecords[0]) {
                await base44.asServiceRole.entities.UsageLog.update(usageRecords[0].id, {
                  leads_created: (usageRecords[0].leads_created || 0) + 1,
                  last_lead_generation_at: now,
                });
              } else {
                const [y, m] = periodMonth.split('-').map(Number);
                const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
                const end = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString();
                await base44.asServiceRole.entities.UsageLog.create({
                  organization_id, period_month: periodMonth,
                  period_start: start, period_end: end,
                  leads_created: 1, lead_generations_used: 1,
                  last_lead_generation_at: now,
                });
              }
              console.info(`[processResearchRun] ✅ UsageLog aktualisiert (Periode: ${periodMonth})`);
            } catch (usageErr) {
              console.error(`[processResearchRun] ⚠️ UsageLog after create failed: ${usageErr.message} (nicht-blockierend, Company bleibt erhalten)`);
            }
            
            // ── SCHRITT 4: Supabase RPC (nicht-kritisch, aber await + Catch) ─────
            // Non-blocking: Fehler werden gefangen, aber Aufruf wird erwartet (kein Fire-and-Forget)
            try {
              await recordLeadUsageEvent(organization_id, periodMonth, companyId, research_run_id);
              console.info(`[processResearchRun] ✅ Supabase shadow write abgeschlossen`);
            } catch (supabaseErr) {
              console.error(`[processResearchRun] ⚠️ Supabase shadow write failed: ${supabaseErr.message} (nicht-blockierend)`);
            }
            
          } else {
            console.warn(`[processResearchRun] ⚠️ Company.create fehlgeschlagen, Counter NICHT erhöht`);
          }
        }
      }
    }

    // ── Fortschritt + Update ─────────────────────────────────────────────────
    const totalLeadsSaved = currentLeadsSaved + newLeadsSavedThisBatch;
    const nextBatchIndex = batchIndex + 1;
    const isDone = nextBatchIndex >= totalBatches || totalLeadsSaved >= batchTarget;
    const zeroResultCause = isDone && totalLeadsSaved === 0
      ? (rawHitsThisBatch === 0 ? 'no_google_results' : dupSkippedThisBatch > 0 ? 'all_duplicates' : 'no_match_score')
      : null;

    // ── Coverage-Diagnostik (IMMER ZUERST berechnen, bevor progress + current_step) ──
    const cumulativeLocationsSearched = (freshRun.locations_searched_count || 0) + locationsSearchedSet.size;
    const selectedLocationsCount = freshRun.selected_locations_count || coveredLocations.length || 0;
    const coveredLocationsTotal = freshRun.covered_locations_count || coveredLocations.length || 0;
    const locationsRemainingCount = Math.max(0, selectedLocationsCount - cumulativeLocationsSearched);
    const coverageComplete = selectedLocationsCount > 0
      ? cumulativeLocationsSearched >= selectedLocationsCount
      : true; // grid_only mode

    console.info(`[processResearchRun] Coverage: searched=${cumulativeLocationsSearched}/${selectedLocationsCount} (total in area: ${coveredLocationsTotal}) remaining=${locationsRemainingCount} complete=${coverageComplete}`);

    // ── Progress kombiniert: 60% Orts-Abdeckung + 40% Lead-Ziel ─────────────
    let progressPercent;
    if (isDone) {
      progressPercent = 100;
    } else if (selectedLocationsCount > 0) {
      // LocationIndex aktiv: kombinierter Fortschritt
      const coverageProgress = Math.min(1, cumulativeLocationsSearched / selectedLocationsCount);
      const leadProgress = Math.min(1, totalLeadsSaved / Math.max(1, batchTarget));
      progressPercent = Math.max(5, Math.min(95, Math.round((coverageProgress * 0.6 + leadProgress * 0.4) * 100)));
    } else {
      // Grid-only Fallback: Batch-basiert
      progressPercent = Math.min(95, Math.round((nextBatchIndex / totalBatches) * 90) + 5);
    }

    // UsageLog wird direkt nach Company.create pro Lead erhöht (nicht atomar, MVP)
    if (trialStage === 'free_preview' && newLeadsSavedThisBatch > 0) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      if (orgs[0]) {
        await base44.asServiceRole.entities.Organization.update(organization_id, { trial_leads_granted: (orgs[0].trial_leads_granted || 0) + newLeadsSavedThisBatch });
      }
    }

    console.info(`[processResearchRun] Batch ${batchIndex}/${totalBatches} done: newSaved=${newLeadsSavedThisBatch} totalSaved=${totalLeadsSaved} progress=${progressPercent}% done=${isDone}`);

    const newStatus = isDone ? 'completed' : 'running';

    // ── current_step: Orts-Zähler aus echten DB-Werten ────────────────────────
    const cityDisplayLabel = city ? `${city} Umgebung` : 'Suchgebiet';
    let newStep;
    if (isDone) {
      newStep = totalLeadsSaved > 0
        ? `${totalLeadsSaved} neue Firmenkontakte gefunden`
        : 'Keine neuen Kontakte gefunden';
    } else if (selectedLocationsCount > 0) {
      newStep = `${cityDisplayLabel} läuft… ${cumulativeLocationsSearched} / ${selectedLocationsCount} Orte geprüft`;
    } else {
      newStep = `${cityDisplayLabel} wird durchsucht… ${totalLeadsSaved} Kontakte bisher`;
    }

    // Chain-Skip-Diagnostik akkumulieren
    const prevChainSkipped = freshRun.chain_skipped_count || 0;
    const prevChainExamples = (() => { try { return JSON.parse(freshRun.chain_skipped_examples_json || '[]'); } catch { return []; } })();
    const newChainSkippedTotal = prevChainSkipped + chainSkippedThisBatch;
    const allChainExamples = [...prevChainExamples, ...chainSkippedExamplesThisBatch].slice(0, 10);

    // ── DB-Update: alle Coverage-Felder dauerhaft speichern ──────────────────
    await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
      status: newStatus,
      leads_saved: totalLeadsSaved,
      duplicates_skipped: (run.duplicates_skipped || 0) + dupSkippedThisBatch,
      no_match_count: (run.no_match_count || 0) + noMatchThisBatch,
      outside_radius_count: (run.outside_radius_count || 0) + outsideRadiusThisBatch,
      raw_hits: (run.raw_hits || 0) + rawHitsThisBatch,
      chain_skipped_count: newChainSkippedTotal,
      chain_skipped_examples_json: JSON.stringify(allChainExamples),
      // ── Fortschritt (echte Werte, nicht lokal) ──
      progress_percent: progressPercent,
      current_step: newStep,
      batch_index: nextBatchIndex,
      total_batches: totalBatches,
      // ── Coverage-Felder dauerhaft (werden vom Banner direkt gelesen) ──────
      locations_searched_count: cumulativeLocationsSearched,
      locations_remaining_count: locationsRemainingCount,
      coverage_complete: coverageComplete,
      search_points_used_count: (freshRun.search_points_used_count || 0) + pointsToSearch.length,
      // seen_place_ids: Dedupe-Persistenz
      seen_place_ids: JSON.stringify([...seenPlaceIds].slice(-500)),
      charged_lead_generation: totalLeadsSaved > 0,
      // VITAL: Lock aktiv halten bis Run completed
      processing_lock_until: isDone ? null : new Date(Date.now() + LOCK_DURATION_MS).toISOString(),
      processing_by: isDone ? null : workerKey,
      ...(isDone ? { finished_at: new Date().toISOString() } : {}),
      ...(isDone && zeroResultCause ? { zero_result_cause: zeroResultCause } : {}),
    });



    // ── AUDIT: Run-Batch-Complete (nicht-blockierend, aber await + Catch) ─────
    // Non-blocking: Fehler werden gefangen, aber Aufruf wird erwartet (kein Fire-and-Forget)
    try {
      await auditResearchEvent(
        research_run_id,
        organization_id,
        'batch_completed',
        workerKey,
        {
          batch_index: nextBatchIndex,
          leads_saved_this_batch: newLeadsSavedThisBatch,
          total_leads_saved: totalLeadsSaved,
          is_done: isDone,
          engine_version: SEARCH_ENGINE_VERSION,
        }
      );
      console.info(`[processResearchRun] ✅ Audit batch_completed geschrieben`);
    } catch (auditErr) {
      console.error(`[processResearchRun] ⚠️ Audit failed: ${auditErr.message} (nicht-blockierend)`);
    }

    return Response.json({
      success: true, done: isDone, status: newStatus,
      leads_saved: totalLeadsSaved, leads_saved_this_batch: newLeadsSavedThisBatch,
      duplicates_skipped: (run.duplicates_skipped || 0) + dupSkippedThisBatch,
      raw_hits: (run.raw_hits || 0) + rawHitsThisBatch,
      progress_percent: isDone ? 100 : progressPercent,
      current_step: newStep, batch_index: nextBatchIndex, total_batches: totalBatches, message: newStep,
      // Coverage (für Banner-Live-Update ohne extra DB-Read)
      locations_searched_count: cumulativeLocationsSearched,
      selected_locations_count: selectedLocationsCount,
      covered_locations_count: coveredLocationsTotal,
      coverage_complete: coverageComplete,
    });

  } catch (error) {
    console.error('[processResearchRun] Error:', error?.message, error?.stack);
    
    // ── AUDIT: Run-Error (nicht-blockierend, aber await + Catch) ─────────────
    // Non-blocking: Fehler werden gefangen, aber Aufruf wird erwartet
    // WICHTIG: Nur auf outer-scope Variablen zugreifen (research_run_id, organization_id, workerKey, runSnapshot)
    // Nicht auf block-scoped const run zugreifen → ReferenceError-Gefahr!
    if (research_run_id && organization_id) {
      try {
        await auditResearchEvent(
          research_run_id,
          organization_id,
          'run_error',
          workerKey, // outer-scope, immer verfügbar
          {
            error_message: error?.message,
            error_stack: error?.stack,
            batch_index: runSnapshot?.batch_index || 0,
            leads_saved: runSnapshot?.leads_saved || 0,
          }
        );
        console.info(`[processResearchRun] ✅ Audit run_error geschrieben`);
      } catch (auditErr) {
        console.error(`[processResearchRun] ⚠️ Audit run_error failed: ${auditErr.message} (nicht-blockierend)`);
      }
    }
    
    try {
      if (research_run_id) {
        const base44b = createClientFromRequest(req);
        const existingRuns = await base44b.asServiceRole.entities.ResearchRun.filter({ id: research_run_id }).catch(() => []);
        const existingRun = existingRuns[0];
        if (existingRun) {
          const finishStatus = (existingRun?.leads_saved || 0) > 0 ? 'partial' : 'failed';
          await base44b.asServiceRole.entities.ResearchRun.update(research_run_id, {
            status: finishStatus,
            error_message: error?.message,
            current_step: finishStatus === 'partial'
              ? `Recherche teilweise abgeschlossen: ${existingRun?.leads_saved || 0} Kontakte gefunden`
              : 'Recherche fehlgeschlagen',
            finished_at: new Date().toISOString(),
            stop_reason: 'exception',
            processing_lock_until: null, processing_by: null,
          });
        }
      }
    } catch {}
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});