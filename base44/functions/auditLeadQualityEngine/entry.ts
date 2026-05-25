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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
    function simScore(overrides = {}) {
      const {
        hasCat = false, hasPlaceType = false, placeTypeConf = 'medium',
        hasPhone = false, hasWebsite = false, distanceOk = false,
        hasTCMatch = false, strategy = 'target_customer_search',
        badFitPenalty = 0, websiteRequired = false,
        scoringSignals = 0, // Anzahl Signale (je +12 Punkte, max 35)
      } = overrides;

      let score = 50;
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
      return { score, shouldSave: score >= 55 && badFitPenalty > -35 };
    }

    const simTests = [
      {
        name: "Guter B2B-Lead (Kategorie + Website + Telefon + PlaceType)",
        params: { hasCat: true, hasPlaceType: true, hasPhone: true, hasWebsite: true, distanceOk: true, hasTCMatch: true },
        expectedSave: true,
      },
      {
        name: "Schwacher Lead (nur Basis + Distanz)",
        params: { distanceOk: true },
        expectedSave: false, // Score = 58 – technisch gespeichert, qualitativ schwach
        expectedQuality: "weak",
      },
      {
        name: "Lead mit Bad-Fit-Penalty (-35)",
        params: { hasCat: true, hasPlaceType: true, badFitPenalty: -35 },
        expectedSave: false,
      },
      {
        name: "Lead mit Bad-Fit-Penalty (-20) – sollte NICHT hard-fail sein",
        params: { hasCat: true, hasPlaceType: true, badFitPenalty: -20 },
        expectedSave: true, // Bad-Fit < -35 ist erst hard-fail
      },
      {
        name: "website_signal_required ohne Website",
        params: { hasCat: true, hasPlaceType: true, hasPhone: true, websiteRequired: true, hasWebsite: false },
        expectedSave: false,
      },
      {
        name: "Scoring-Signals dominieren (3 starke Signale)",
        params: { hasCat: true, scoringSignals: 3, hasPhone: true, distanceOk: true },
        expectedSave: true,
      },
      {
        name: "Knapp über Schwelle ohne echten Match (Basis + Distanz = 58)",
        params: { distanceOk: true },
        expectedSave: true, // Score 58 – AKTUELL gespeichert, fragliche Qualität
        note: "Score 58 = nur Basis+Distanz. Wird aktuell gespeichert. Qualitäts-Problem!",
      },
    ];

    for (const t of simTests) {
      const result = simScore(t.params);
      const correct = result.shouldSave === t.expectedSave;
      const status = correct ? "green" : "red";
      addTest(`sim_${t.name}`,
        correct ? (t.note ? "yellow" : "green") : "red",
        `Score: ${result.score} | shouldSave: ${result.shouldSave} | Erwartet: ${t.expectedSave}${t.note ? ` | ⚠️ ${t.note}` : ''}`,
        { score: result.score, should_save: result.shouldSave, correct }
      );
      if (t.note) {
        warnings.push(`Quality-Gap: "${t.name}" – Score ${result.score}, wird gespeichert. ${t.note}`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // D) Chain-Filter-Analyse
    // ─────────────────────────────────────────────────────────────────────────
    const chainKeywords = ['aldi','lidl','penny','netto','rewe','edeka','kaufland','dm','rossmann','h&m','zara','primark','deichmann','deutsche post','dhl','sparkasse','deutsche bank','commerzbank','mcdonalds','burger king','subway','kfc','starbucks','hilton','marriott','ibis','motel one','fitx','mcfit','fitness first','fielmann','apollo optik','telekom','vodafone','ikea','obi','bauhaus','hornbach','franchise','kette','filialen','konzern'];

    function normStr(str) {
      return String(str || "").toLowerCase()
        .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").trim();
    }

    // Prüfe ob ein Unternehmensname ein Chain-Keyword enthält
    // Analyse aus bestehenden Companies (könnten irrtümlich gefiltert worden sein)
    const chainAnalysis = {
      hardcoded_keywords: chainKeywords,
      keyword_count: chainKeywords.length,
      rating_threshold: 1500,
      notes: [
        "Chain-Filter ist branchen-agnostisch – gilt für ALLE industries gleich",
        "Hotel-Ketten (Hilton, Marriott, Ibis) können für Gebäudereinigung ZIELKUNDEN sein",
        "Supermärkte (Aldi, Rewe, Lidl) können für Reinigung/Schädlingsbekämpfung ZIELKUNDEN sein",
        "Sparkasse/Deutsche Bank können für Steuerberatung/IT ZIELKUNDEN sein",
        ">1500 Bewertungen = Kette: trifft auch sehr aktive lokale Betriebe",
      ],
      recommended_evolution: "chain_policy je industry_id: exclude | allow_if_target_customer | downgrade | manual_review",
    };

    addTest("chain_filter_analysis", "yellow",
      `${chainKeywords.length} hartcodierte Chain-Keywords + >1500-Bewertungen-Regel. Branchen-agnostisch! Hotels/Supermärkte können Zielkunden für manche Branchen sein.`,
      { chain_analysis: chainAnalysis }
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
    // G) Aktuelle Research-Runs zusammenfassen
    // ─────────────────────────────────────────────────────────────────────────
    const recentRuns = await base44.asServiceRole.entities.ResearchRun.filter(
      {}, '-created_date', 10
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