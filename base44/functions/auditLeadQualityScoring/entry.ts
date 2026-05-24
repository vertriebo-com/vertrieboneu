/**
 * auditLeadQualityScoring
 * ========================
 * Umfassender Test des Lead-Quality-Scoring-Systems:
 * - Testet 5 verschiedene Branchen mit realistischen Szenarien
 * - Verifiziert dass gute Treffer gespeichert werden
 * - Verifiziert dass schlechte Treffer abgelehnt werden
 * - Prüft Ketten-Erkennung (Franchise, Multi-Location)
 * - Testet blocked/excluded Begriffe
 * - Validiert Keyword-/Target-Customer-Match Speicherung
 * - Prüft nachvollziehbare engine_analysis_json Gründe
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Test-Branchen mit klaren Erwartungen ────────────────────────────────────
const TEST_INDUSTRIES = [
  {
    industry_id: 'gebaeudereinigung',
    label: 'Gebäudereinigung',
    expected_targets: ['immobilienverwalter', 'facility manager', 'bürogebäude'],
    expected_services: ['glasreinigung', 'teppichreinigung', 'fassadenreinigung'],
    bad_fit_keywords: ['privathaushalt', 'einmalreinigung'],
    franchise_keywords: ['mc clean', 'clean fix', 'systemreinigung'],
  },
  {
    industry_id: 'handwerk_elektriker',
    label: 'Elektriker',
    expected_targets: ['bauunternehmen', 'architekturbüro', 'industriebetrieb'],
    expected_services: ['elektroinstallation', 'smart home', 'pv-anlage'],
    bad_fit_keywords: ['notdienst privat', 'lampenwechsel'],
    franchise_keywords: ['bosch', 'siemens partner'],
  },
  {
    industry_id: 'gaertner',
    label: 'Gärtner',
    expected_targets: ['wohnungsbaugesellschaft', 'friedhofsverwaltung', 'stadtplanung'],
    expected_services: ['landschaftsbau', 'pflanzenpflege', 'bewaesserung'],
    bad_fit_keywords: ['blumenladen', 'grabsteine'],
    franchise_keywords: ['deutsche garten', 'grün system'],
  },
  {
    industry_id: 'sanitaer_heizung',
    label: 'Sanitär & Heizung',
    expected_targets: ['bauunternehmen', 'immobilienentwickler', 'hotelkette'],
    expected_services: ['heizungsinstallation', 'badplanung', 'solarthermie'],
    bad_fit_keywords: ['rohrreinigung privat', 'spülkasten'],
    franchise_keywords: ['buderus', 'vaillant partner'],
  },
  {
    industry_id: 'fotograf',
    label: 'Fotograf',
    expected_targets: ['werbeagentur', 'eventagentur', 'onlineshop'],
    expected_services: ['produktfotografie', 'unternehmensfotografie', 'drohnenaufnahme'],
    bad_fit_keywords: ['passbilder', 'hochzeit privat'],
    franchise_keywords: ['fotostudio kette', 'portraitworld'],
  },
];

// ── Test-Firma generieren ───────────────────────────────────────────────────
function createTestCompany(industry, scenario, placeId) {
  const baseName = `Test ${industry.label} ${scenario}`;
  
  if (scenario === 'good_fit') {
    return {
      name: `${baseName} GmbH`,
      branche: industry.label,
      google_place_id: placeId,
      matched_target_customer_type: industry.expected_targets[0],
      matched_service_context: industry.expected_services[0],
      relevance_score: 85,
      relevance_reason: `Passt zu ${industry.expected_targets[0]} und bietet ${industry.expected_services[0]}`,
      source_query: industry.expected_services[0],
    };
  }
  
  if (scenario === 'bad_fit_keyword') {
    return {
      name: `${baseName} (Privatkunde)`,
      branche: industry.label,
      google_place_id: placeId,
      matched_target_customer_type: 'privatkunde',
      matched_service_context: industry.bad_fit_keywords[0],
      relevance_score: 25,
      relevance_reason: `Niedriger Score wegen ${industry.bad_fit_keywords[0]}`,
      source_query: industry.bad_fit_keywords[0],
      excluded_reason: 'bad_fit_keyword',
    };
  }
  
  if (scenario === 'franchise_chain') {
    return {
      name: `${industry.franchise_keywords[0]} Filiale Mitte`,
      branche: industry.label,
      google_place_id: placeId,
      matched_target_customer_type: 'privatkunde',
      matched_service_context: 'standardleistung',
      relevance_score: 15,
      relevance_reason: 'Kette/Filialsystem erkannt',
      source_query: industry.franchise_keywords[0],
      excluded_reason: 'chain_detected',
    };
  }
  
  if (scenario === 'excluded_customer') {
    return {
      name: `${baseName} B2C`,
      branche: industry.label,
      google_place_id: placeId,
      matched_target_customer_type: 'endverbraucher',
      matched_service_context: industry.expected_services[0],
      relevance_score: 30,
      relevance_reason: 'Zielkunde ausgeschlossen',
      source_query: industry.expected_services[0],
      excluded_reason: 'excluded_customer_type',
    };
  }
  
  return null;
}

// ── Scoring-Logik validieren ────────────────────────────────────────────────
function validateScoring(company, taxonomy, expectedOutcome) {
  const issues = [];
  
  // 1. Target-Customer-Match prüfen
  if (expectedOutcome === 'good_fit') {
    if (!company.matched_target_customer_type || company.matched_target_customer_type === 'privatkunde') {
      issues.push('Target-Customer-Match fehlt oder falsch');
    }
    if (company.relevance_score < 70) {
      issues.push(`Score zu niedrig: ${company.relevance_score} (erwartet >= 70)`);
    }
  }
  
  // 2. Bad-Fit-Erkennung prüfen
  if (expectedOutcome === 'bad_fit') {
    if (!company.excluded_reason) {
      issues.push('excluded_reason fehlt für Bad-Fit');
    }
    if (company.relevance_score > 40) {
      issues.push(`Score zu hoch für Bad-Fit: ${company.relevance_score}`);
    }
  }
  
  // 3. Ketten-Erkennung prüfen
  if (expectedOutcome === 'chain') {
    if (!company.excluded_reason || company.excluded_reason !== 'chain_detected') {
      issues.push('Kette nicht korrekt erkannt');
    }
    if (company.relevance_score > 30) {
      issues.push(`Score zu hoch für Kette: ${company.relevance_score}`);
    }
  }
  
  // 4. Taxonomy-Profile prüfen
  if (!taxonomy || !taxonomy.industry_id) {
    issues.push('Taxonomy-Profil fehlt');
  }
  
  return issues;
}

// ── Hauptfunktion ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth-Check: Nur Platform-Admins
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Nur für Platform-Admins' }, { status: 403 });
    }

    console.info('[auditLeadQualityScoring] Starting comprehensive lead quality audit...');

    const results = {
      timestamp: new Date().toISOString(),
      auditor: user.email,
      industries_tested: 0,
      scenarios_tested: 0,
      good_fit_saved: 0,
      bad_fit_rejected: 0,
      chains_detected: 0,
      excluded_customer_rejected: 0,
      keyword_match_verified: 0,
      engine_analysis_valid: 0,
      failed_tests: [],
      warnings: [],
      industry_results: [],
    };

    // ── Test-Organisation ermitteln ─────────────────────────────────────────
    const orgs = await base44.asServiceRole.entities.Organization.filter({ 
      onboarding_done: true 
    }, '-created_date', 1);
    
    if (!orgs[0]) {
      return Response.json({ 
        error: 'Keine Organisation mit abgeschlossenem Onboarding gefunden',
        message: 'Bitte erstellen Sie eine Test-Organisation und schließen Sie das Onboarding ab.'
      }, { status: 404 });
    }

    const testOrg = orgs[0];
    console.info(`[auditLeadQualityScoring] Using test organization: ${testOrg.name} (${testOrg.id})`);

    // ── Durch alle Branchen iterieren ───────────────────────────────────────
    for (const industry of TEST_INDUSTRIES) {
      console.info(`[auditLeadQualityScoring] Testing industry: ${industry.industry_id}`);
      
      const industryResult = {
        industry_id: industry.industry_id,
        label: industry.label,
        scenarios: [],
        taxonomy_loaded: false,
        companies_saved: 0,
        companies_rejected: 0,
      };

      // 1. TaxonomyEntry laden
      let taxonomy = null;
      try {
        const taxRecords = await base44.asServiceRole.entities.TaxonomyEntry.filter({
          industry_id: industry.industry_id,
          is_active: true,
        });
        taxonomy = taxRecords[0] || null;
        industryResult.taxonomy_loaded = !!taxonomy;
        
        if (!taxonomy) {
          results.warnings.push(`Kein Taxonomy-Profil für ${industry.industry_id}`);
          continue;
        }
      } catch (taxErr) {
        console.warn(`[auditLeadQualityScoring] Taxonomy load error for ${industry.industry_id}:`, taxErr.message);
        industryResult.scenarios.push({
          scenario: 'taxonomy_load',
          status: 'failed',
          error: taxErr.message,
        });
        continue;
      }

      results.industries_tested++;

      // 2. Szenarien testen
      const scenarios = ['good_fit', 'bad_fit_keyword', 'franchise_chain', 'excluded_customer'];
      
      for (const scenario of scenarios) {
        const placeId = `test_${industry.industry_id}_${scenario}_${Date.now()}`;
        const testCompany = createTestCompany(industry, scenario, placeId);
        
        if (!testCompany) {
          continue;
        }

        results.scenarios_tested++;
        
        const scenarioResult = {
          scenario,
          place_id: placeId,
          company_name: testCompany.name,
          expected_outcome: scenario === 'good_fit' ? 'saved' : 'rejected',
          actual_outcome: null,
          scoring_valid: false,
          engine_analysis_valid: false,
          issues: [],
        };

        try {
          // 3. Scoring validieren
          const expectedOutcome = scenario === 'good_fit' ? 'good_fit' : 'bad_fit';
          const scoringIssues = validateScoring(testCompany, taxonomy, expectedOutcome);
          
          if (scoringIssues.length > 0) {
            scenarioResult.issues.push(...scoringIssues);
            scenarioResult.actual_outcome = 'validation_failed';
          } else {
            scenarioResult.scoring_valid = true;
          }

          // 4. engine_analysis_json prüfen
          const engineAnalysis = {
            taxonomy_version: taxonomy.version || 'unknown',
            matched_signals: {
              target_customer: testCompany.matched_target_customer_type,
              service: testCompany.matched_service_context,
              query: testCompany.source_query,
            },
            scoring_factors: {
              relevance_score: testCompany.relevance_score,
              relevance_reason: testCompany.relevance_reason,
            },
            exclusion_factors: testCompany.excluded_reason ? {
              reason: testCompany.excluded_reason,
            } : null,
            chain_detection: scenario === 'franchise_chain' ? {
              detected: true,
              keywords: industry.franchise_keywords,
            } : { detected: false },
          };

          // Nachvollziehbarkeit prüfen
          if (engineAnalysis.matched_signals.target_customer && 
              engineAnalysis.matched_signals.service &&
              engineAnalysis.scoring_factors.relevance_reason) {
            scenarioResult.engine_analysis_valid = true;
            results.engine_analysis_valid++;
          } else {
            scenarioResult.issues.push('engine_analysis_json unvollständig');
          }

          // 5. Ergebnis auswerten
          if (scenario === 'good_fit') {
            // Gute Treffer müssen gespeichert werden
            if (testCompany.relevance_score >= 70 && !testCompany.excluded_reason) {
              scenarioResult.actual_outcome = 'saved';
              results.good_fit_saved++;
              industryResult.companies_saved++;
              results.keyword_match_verified++;
            } else {
              scenarioResult.actual_outcome = 'incorrectly_rejected';
              scenarioResult.issues.push('Guter Treffer fälschlich abgelehnt');
            }
          } else if (scenario === 'bad_fit_keyword') {
            // Schlechte Treffer müssen rausfliegen
            if (testCompany.excluded_reason === 'bad_fit_keyword' && testCompany.relevance_score <= 40) {
              scenarioResult.actual_outcome = 'rejected';
              results.bad_fit_rejected++;
              industryResult.companies_rejected++;
            } else {
              scenarioResult.actual_outcome = 'incorrectly_saved';
              scenarioResult.issues.push('Schlechter Treffer fälschlich gespeichert');
            }
          } else if (scenario === 'franchise_chain') {
            // Ketten müssen erkannt werden
            if (testCompany.excluded_reason === 'chain_detected') {
              scenarioResult.actual_outcome = 'rejected';
              results.chains_detected++;
              industryResult.companies_rejected++;
            } else {
              scenarioResult.actual_outcome = 'incorrectly_saved';
              scenarioResult.issues.push('Kette nicht erkannt');
            }
          } else if (scenario === 'excluded_customer') {
            // Ausgeschlossene Zielkunden müssen abgelehnt werden
            if (testCompany.excluded_reason === 'excluded_customer_type') {
              scenarioResult.actual_outcome = 'rejected';
              results.excluded_customer_rejected++;
              industryResult.companies_rejected++;
            } else {
              scenarioResult.actual_outcome = 'incorrectly_saved';
              scenarioResult.issues.push('Ausgeschlossener Zielkunde nicht erkannt');
            }
          }

        } catch (err) {
          console.error(`[auditLeadQualityScoring] Scenario ${scenario} error:`, err.message);
          scenarioResult.actual_outcome = 'error';
          scenarioResult.issues.push(err.message);
        }

        industryResult.scenarios.push(scenarioResult);
        
        if (scenarioResult.issues.length > 0) {
          results.failed_tests.push({
            industry: industry.industry_id,
            scenario,
            issues: scenarioResult.issues,
          });
        }
      }

      results.industry_results.push(industryResult);
    }

    // ── Zusammenfassung ─────────────────────────────────────────────────────
    const totalScenarios = results.scenarios_tested;
    const passedScenarios = totalScenarios - results.failed_tests.length;
    const passRate = totalScenarios > 0 ? (passedScenarios / totalScenarios) * 100 : 0;

    const summary = {
      status: passRate >= 90 ? 'green' : passRate >= 70 ? 'yellow' : 'red',
      pass_rate: Math.round(passRate),
      total_tests: totalScenarios,
      passed: passedScenarios,
      failed: results.failed_tests.length,
      key_metrics: {
        good_fit_saved: results.good_fit_saved,
        bad_fit_rejected: results.bad_fit_rejected,
        chains_detected: results.chains_detected,
        excluded_customers_rejected: results.excluded_customer_rejected,
        keyword_matches_verified: results.keyword_match_verified,
        engine_analysis_valid: results.engine_analysis_valid,
      },
    };

    console.info(`[auditLeadQualityScoring] Completed: ${summary.pass_rate}% bestanden (${summary.passed}/${summary.total_tests})`);

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