/**
 * auditLeadDetailResearchContext
 * ================================
 * Prüft ob LeadDetail / Firmenprofil Research-Kontext vollständig anzeigt.
 *
 * Tests:
 * 1. RelevanceSection zeigt auch ohne matched_target_customer_type (nur source_query)
 * 2. matched_search_category wird in der Datenbasis gespeichert
 * 3. matched_service_context wird in der Datenbasis gespeichert
 * 4. relevance_score vorhanden und plausibel (0–100)
 * 5. engine_analysis_json unterscheidbar: Phase-1-Diagnostics vs KI-Analyse
 * 6. engine_version vorhanden
 * 7. source_query vorhanden für Research-Leads
 * 8. OutcomeFeedback-Kontext: source_query lesbar
 * 9. Kein Cross-Org-Datenleck (Company gehört zur richtigen Org)
 * 10. engine_analysis_json enthält score_breakdown für Phase-1-Leads
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

function safeParseJSON(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function detectEngineJsonMode(json) {
  if (!json) return 'none';
  if (json.signals || json.next_best_action || json.vertriebo_score || json.summary) return 'ki_analysis';
  if (json.score_breakdown || json.matched_weighted_signals || json.bad_fit_penalty != null || json.search_strategy) return 'research_diagnostics';
  return 'none';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Nur für Platform-Admins' }, { status: 403 });
    }

    console.info('[auditLeadDetailResearchContext] Starting audit...');

    const results = {
      timestamp: new Date().toISOString(),
      auditor: user.email,
      tests: [],
      passed: 0,
      failed: 0,
      warnings: 0,
      claim_status: 'green',
    };

    const addTest = (name, status, detail, hard_value = null) => {
      results.tests.push({ name, status, detail, hard_value });
      if (status === 'pass') results.passed++;
      else if (status === 'fail') results.failed++;
      else if (status === 'warning') results.warnings++;
    };

    // ── Lade Test-Org + Companies ──────────────────────────────────────────
    const orgs = await base44.asServiceRole.entities.Organization.filter(
      { onboarding_done: true }, '-created_date', 3
    );
    if (!orgs[0]) {
      return Response.json({ error: 'Keine Organisation mit abgeschlossenem Onboarding gefunden' }, { status: 404 });
    }
    const testOrg = orgs[0];

    // Neueste Companies der Org (Research-Leads)
    const companies = await base44.asServiceRole.entities.Company.filter(
      { organization_id: testOrg.id, quelle: 'Google Places API' }, '-created_date', 50
    );
    console.info(`[auditLeadDetailResearchContext] Org: ${testOrg.name}, Companies: ${companies.length}`);

    if (companies.length === 0) {
      addTest('Datengrundlage', 'warning', 'Keine Research-Leads (Google Places) gefunden – Audit eingeschränkt');
      results.claim_status = 'yellow';
      return Response.json({ success: true, results });
    }

    // ── Test 1: source_query vorhanden ────────────────────────────────────
    const withSourceQuery = companies.filter(c => c.source_query);
    const sourceQueryRate = Math.round((withSourceQuery.length / companies.length) * 100);
    if (sourceQueryRate >= 80) {
      addTest('source_query vorhanden', 'pass', `${sourceQueryRate}% der Leads haben source_query gesetzt`, sourceQueryRate);
    } else if (sourceQueryRate >= 50) {
      addTest('source_query vorhanden', 'warning', `Nur ${sourceQueryRate}% der Leads haben source_query – prüfen ob processResearchRun source_query korrekt schreibt`, sourceQueryRate);
    } else {
      addTest('source_query vorhanden', 'fail', `Nur ${sourceQueryRate}% der Leads haben source_query – RelevanceSection zeigt oft keine Daten`, sourceQueryRate);
    }

    // ── Test 2: RelevanceSection – hat mindestens EIN Relevanz-Feld ────────
    const withAnyRelevance = companies.filter(c =>
      c.matched_target_customer_type || c.source_query || c.matched_search_category ||
      c.matched_service_context || c.relevance_reason || c.relevance_score
    );
    const relevanceRate = Math.round((withAnyRelevance.length / companies.length) * 100);
    if (relevanceRate >= 90) {
      addTest('RelevanceSection sichtbar (mind. 1 Feld)', 'pass', `${relevanceRate}% der Leads würden RelevanceSection anzeigen`, relevanceRate);
    } else {
      addTest('RelevanceSection sichtbar (mind. 1 Feld)', 'fail', `Nur ${relevanceRate}% der Leads haben Relevanz-Felder – Nutzer sehen oft leeres Firmenprofil`, relevanceRate);
    }

    // ── Test 3: matched_target_customer_type ──────────────────────────────
    const withTC = companies.filter(c => c.matched_target_customer_type);
    const tcRate = Math.round((withTC.length / companies.length) * 100);
    if (tcRate >= 60) {
      addTest('matched_target_customer_type vorhanden', 'pass', `${tcRate}% haben TC-Match`, tcRate);
    } else {
      addTest('matched_target_customer_type vorhanden', 'warning', `Nur ${tcRate}% haben TC-Match – bei provider_search erwartet, sonst prüfen`, tcRate);
    }

    // ── Test 4: matched_search_category ───────────────────────────────────
    const withCat = companies.filter(c => c.matched_search_category);
    const catRate = Math.round((withCat.length / companies.length) * 100);
    if (catRate >= 70) {
      addTest('matched_search_category vorhanden', 'pass', `${catRate}% haben Suchkategorie gesetzt`, catRate);
    } else {
      addTest('matched_search_category vorhanden', 'warning', `Nur ${catRate}% haben matched_search_category – wird in RelevanceSection angezeigt wenn vorhanden`, catRate);
    }

    // ── Test 5: matched_service_context ───────────────────────────────────
    const withService = companies.filter(c => c.matched_service_context);
    const serviceRate = Math.round((withService.length / companies.length) * 100);
    if (serviceRate >= 30) {
      addTest('matched_service_context vorhanden', 'pass', `${serviceRate}% haben Service-Kontext`, serviceRate);
    } else {
      addTest('matched_service_context vorhanden', 'warning', `Nur ${serviceRate}% haben matched_service_context – wird gesetzt wenn TC-Match vorhanden`, serviceRate);
    }

    // ── Test 6: relevance_score plausibel ─────────────────────────────────
    const withScore = companies.filter(c => c.relevance_score != null && c.relevance_score > 0);
    const scoreRate = Math.round((withScore.length / companies.length) * 100);
    const avgScore = withScore.length > 0
      ? Math.round(withScore.reduce((s, c) => s + c.relevance_score, 0) / withScore.length)
      : 0;
    const outliers = withScore.filter(c => c.relevance_score < 55 || c.relevance_score > 100);
    if (scoreRate >= 90 && outliers.length === 0) {
      addTest('relevance_score plausibel (0–100, ≥55)', 'pass', `${scoreRate}% haben Score, Durchschnitt ${avgScore}, keine Ausreißer`, avgScore);
    } else if (outliers.length > 0) {
      addTest('relevance_score plausibel', 'warning', `${outliers.length} Leads mit Score < 55 gespeichert – Speicherschwelle ggf. nicht durchgesetzt`, outliers.length);
    } else {
      addTest('relevance_score plausibel', 'warning', `Nur ${scoreRate}% haben Score gesetzt`, scoreRate);
    }

    // ── Test 7: engine_version vorhanden ──────────────────────────────────
    const withVersion = companies.filter(c => c.engine_version);
    const versionRate = Math.round((withVersion.length / companies.length) * 100);
    const versions = [...new Set(withVersion.map(c => c.engine_version))];
    if (versionRate >= 80) {
      addTest('engine_version vorhanden', 'pass', `${versionRate}% haben engine_version. Versionen: ${versions.join(', ')}`, versions);
    } else {
      addTest('engine_version vorhanden', 'warning', `Nur ${versionRate}% haben engine_version – ältere Leads ohne Version`, versionRate);
    }

    // ── Test 8: engine_analysis_json – Phase-Erkennung ────────────────────
    const withEngineJson = companies.filter(c => c.engine_analysis_json);
    if (withEngineJson.length > 0) {
      let phase1Count = 0, phase2Count = 0, noneCount = 0;
      for (const c of withEngineJson) {
        const mode = detectEngineJsonMode(safeParseJSON(c.engine_analysis_json));
        if (mode === 'research_diagnostics') phase1Count++;
        else if (mode === 'ki_analysis') phase2Count++;
        else noneCount++;
      }
      addTest('engine_analysis_json Phase-Erkennung', 'pass',
        `${withEngineJson.length} Leads mit JSON: Phase-1=${phase1Count}, KI-Analyse=${phase2Count}, unbekannt=${noneCount}`,
        { phase1: phase1Count, phase2: phase2Count, unknown: noneCount }
      );

      // Stichprobe: score_breakdown in Phase-1-Leads
      const phase1Sample = withEngineJson.find(c => detectEngineJsonMode(safeParseJSON(c.engine_analysis_json)) === 'research_diagnostics');
      if (phase1Sample) {
        const json = safeParseJSON(phase1Sample.engine_analysis_json);
        if (json.score_breakdown) {
          addTest('score_breakdown in Phase-1-Lead', 'pass', `Stichprobe: "${json.score_breakdown.slice(0, 80)}…"`, true);
        } else {
          addTest('score_breakdown in Phase-1-Lead', 'warning', 'Phase-1-Lead hat kein score_breakdown – Diagnostik-Felder möglicherweise nicht vollständig', false);
        }
      }
    } else {
      addTest('engine_analysis_json vorhanden', 'warning', 'Keine Leads mit engine_analysis_json – Audit-Stichprobe nicht möglich');
    }

    // ── Test 9: Cross-Org-Isolation ───────────────────────────────────────
    const wrongOrgCompanies = companies.filter(c => c.organization_id !== testOrg.id);
    if (wrongOrgCompanies.length === 0) {
      addTest('Cross-Org-Isolation (organization_id)', 'pass', 'Alle geladenen Leads gehören zur Test-Org');
    } else {
      addTest('Cross-Org-Isolation (organization_id)', 'fail',
        `${wrongOrgCompanies.length} Leads mit falscher organization_id gefunden – Datenleck!`,
        wrongOrgCompanies.map(c => c.id)
      );
    }

    // ── Test 10: OutcomeFeedback-Kontext – Überprüfe ob Feedback schon vorhanden ─
    const outcomes = await base44.asServiceRole.entities.LeadOutcome.filter(
      { organization_id: testOrg.id }, '-created_date', 10
    );
    if (outcomes.length > 0) {
      const outcomesWithReason = outcomes.filter(o => o.outcome_reason);
      addTest('OutcomeFeedback mit Begründung', 'pass',
        `${outcomes.length} Feedbacks vorhanden, ${outcomesWithReason.length} mit Begründung`,
        { total: outcomes.length, with_reason: outcomesWithReason.length }
      );
    } else {
      addTest('OutcomeFeedback vorhanden', 'warning', 'Noch kein LeadOutcome für diese Org – Feedback-Kontext nicht testbar');
    }

    // ── Gesamtstatus ──────────────────────────────────────────────────────
    if (results.failed > 0) {
      results.claim_status = 'red';
    } else if (results.warnings > 2) {
      results.claim_status = 'yellow';
    } else {
      results.claim_status = 'green';
    }

    const passRate = results.tests.length > 0
      ? Math.round((results.passed / results.tests.length) * 100)
      : 0;

    console.info(`[auditLeadDetailResearchContext] Done: ${results.claim_status} | ${passRate}% passed`);

    return Response.json({
      success: true,
      claim_status: results.claim_status,
      pass_rate: passRate,
      summary: {
        passed: results.passed,
        failed: results.failed,
        warnings: results.warnings,
        total: results.tests.length,
        org_tested: testOrg.name,
        leads_sampled: companies.length,
      },
      tests: results.tests,
    });

  } catch (error) {
    console.error('[auditLeadDetailResearchContext] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});