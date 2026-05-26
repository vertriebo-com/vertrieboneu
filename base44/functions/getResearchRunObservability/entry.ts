/**
 * getResearchRunObservability
 * ============================
 * Liefert vollständige Observability-Daten für ResearchRuns einer Organisation:
 * - Funnel (raw_hits → saved, duplicates, outside_radius, chain_skips, no_match)
 * - Quality-Verteilung (premium/strong/good/weak) pro Run via Company.filter
 * - Coverage (coverage_complete, locations, batches)
 * - Chain-Skip-Beispiele
 * - Error / Retry Diagnostik
 *
 * Input:
 *   { org_id, research_run_id?: string, limit?: number }
 *
 * AuthZ: identisch zu getDashboardData / listCompanies
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

function safeParseJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function calcMedian(arr) {
  if (!arr || !arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function countDist(items, key) {
  const dist = {};
  for (const item of items) {
    const val = item[key] || 'unknown';
    dist[val] = (dist[val] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 10));
}

function isLegacyRun(run) {
  return (run.coverage_complete === undefined || run.coverage_complete === null)
    && (run.chain_skipped_count === undefined || run.chain_skipped_count === null);
}

async function buildRunDetail(base44, run, orgId) {
  // Quality-Metriken aus Companies dieses Runs
  const companies = await base44.asServiceRole.entities.Company.filter(
    { research_run_id: run.id, organization_id: orgId },
    '-created_date',
    300
  ).catch(() => []);

  const scores = companies.map(c => c.relevance_score || 0).filter(s => s > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const medianScore = calcMedian(scores);

  const tierDist = { premium: 0, strong: 0, good: 0, weak: 0, unknown: 0 };
  const confDist = { high: 0, medium: 0, low: 0, unknown: 0 };
  let queryIntentMatchCount = 0;

  for (const c of companies) {
    const tier = c.quality_tier || 'unknown';
    tierDist[tier] = (tierDist[tier] || 0) + 1;
    const conf = c.quality_confidence || 'unknown';
    confDist[conf] = (confDist[conf] || 0) + 1;
    const eng = safeParseJson(c.engine_analysis_json);
    if (eng?.query_intent_match === true) queryIntentMatchCount++;
  }

  // Search plan extras
  const plan = safeParseJson(run.search_plan_json) || {};
  const combinedPointsCount = (plan.allPoints?.length || 0) + (plan.coveredLocations?.length || 0);

  // Missing metrics
  const missingMetrics = [];
  if (run.raw_hits === null || run.raw_hits === undefined) missingMetrics.push('raw_hits');
  if (run.duplicates_skipped === null || run.duplicates_skipped === undefined) missingMetrics.push('duplicates_skipped');
  if (run.no_match_count === null || run.no_match_count === undefined) missingMetrics.push('no_match_count');
  if (run.outside_radius_count === null || run.outside_radius_count === undefined) missingMetrics.push('outside_radius_count');
  if (run.chain_skipped_count === null || run.chain_skipped_count === undefined) missingMetrics.push('chain_skipped_count');

  const chainExamples = safeParseJson(run.chain_skipped_examples_json) || [];
  const legacy = isLegacyRun(run);

  // Runtime
  const runtimeSeconds = run.started_at && run.finished_at
    ? Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000)
    : null;

  return {
    research_run: {
      id: run.id,
      status: run.status,
      industry_id: run.industry_id || null,
      city: run.search_center_city || null,
      radius_km: run.search_radius_km || null,
      target_leads: run.requested_target || null,
      leads_saved: run.leads_saved || 0,
      leads_saved_verified: companies.length,
      discrepancy: Math.abs((run.leads_saved || 0) - companies.length),
      created_date: run.created_date || null,
      started_at: run.started_at || null,
      finished_at: run.finished_at || null,
      runtime_seconds: runtimeSeconds,
      batch_index: run.batch_index || 0,
      total_batches: run.total_batches || null,
      coverage_complete: run.coverage_complete ?? null,
      locations_remaining_count: run.locations_remaining_count ?? null,
      stop_reason: run.stop_reason || null,
      zero_result_cause: run.zero_result_cause || null,
      error_message: run.error_message || null,
      last_error: run.error_message || run.stop_reason || null,
      worker_attempts: run.worker_attempts || 0,
      taxonomy_version: run.taxonomy_version || null,
      target_customer_types: run.selected_target_customer_types || run.target_customer_types || null,
    },
    funnel: {
      raw_hits_count: run.raw_hits || 0,
      saved: run.leads_saved || 0,
      duplicates_skipped: run.duplicates_skipped || 0,
      existing_duplicates_skipped: null, // nicht separat gespeichert; in duplicates_skipped enthalten
      outside_radius_count: run.outside_radius_count || 0,
      chain_skipped_count: run.chain_skipped_count || 0,
      no_match_count: run.no_match_count || 0,
      funnel_total_accounted: (run.leads_saved || 0) + (run.duplicates_skipped || 0) + (run.outside_radius_count || 0) + (run.chain_skipped_count || 0) + (run.no_match_count || 0),
      unaccounted: Math.max(0, (run.raw_hits || 0) - ((run.leads_saved || 0) + (run.duplicates_skipped || 0) + (run.outside_radius_count || 0) + (run.chain_skipped_count || 0) + (run.no_match_count || 0))),
    },
    quality: {
      total_companies_for_run: companies.length,
      premium_count: tierDist.premium,
      strong_count: tierDist.strong,
      good_count: tierDist.good,
      weak_count: tierDist.weak,
      unknown_tier_count: tierDist.unknown,
      high_confidence_count: confDist.high,
      medium_confidence_count: confDist.medium,
      low_confidence_count: confDist.low,
      avg_relevance_score: avgScore,
      median_relevance_score: medianScore,
      query_intent_match_count: queryIntentMatchCount,
      save_reason_code_distribution: countDist(companies, 'save_reason_code'),
      matched_target_customer_distribution: countDist(companies, 'matched_target_customer_type'),
      matched_search_category_distribution: countDist(companies, 'matched_search_category'),
      source_query_distribution: countDist(companies, 'source_query'),
    },
    coverage: {
      coverage_complete: run.coverage_complete ?? null,
      locations_remaining_count: run.locations_remaining_count ?? null,
      locations_searched_count: run.locations_searched_count ?? null,
      covered_locations_count: run.covered_locations_count ?? null,
      selected_locations_count: run.selected_locations_count ?? null,
      search_points_used_count: run.search_points_used_count ?? null,
      coverage_mode: run.coverage_mode || null,
      combined_points_count: combinedPointsCount || null,
      batch_index: run.batch_index || 0,
      total_batches: run.total_batches || null,
    },
    chain_skips: {
      count: run.chain_skipped_count || 0,
      examples: chainExamples.slice(0, 10),
    },
    diagnostics: {
      source: 'backend_aggregated',
      org_id: orgId,
      research_run_id: run.id,
      generated_at: new Date().toISOString(),
      legacy_run: legacy,
      missing_metrics: missingMetrics,
      supabase_migration: {
        ready: true,
        future_tables: ['research_runs', 'research_run_metrics', 'research_run_events', 'research_run_quality_summary'],
        effort: 'low',
      },
    },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 });

    const body = await req.json();
    const { org_id, research_run_id, limit = 10 } = body;

    if (!org_id) return Response.json({ error: 'org_id erforderlich' }, { status: 400 });

    // ── AuthZ: Owner, Member oder PlatformAdmin ──────────────────────────────
    const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);
    if (!isPlatformAdmin) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: org_id }).catch(() => []);
      const org = orgs[0];
      if (!org) return Response.json({ error: 'Nicht gefunden' }, { status: 404 });
      const isOwner = org.owner_email === user.email;
      const memberships = await base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: org_id, user_email: user.email, status: 'active' }).catch(() => []);
      const isMember = memberships.length > 0;
      if (!isOwner && !isMember) return Response.json({ error: 'Kein Zugriff' }, { status: 403 });
    }

    // ── Single Run Detail ────────────────────────────────────────────────────
    if (research_run_id) {
      const runs = await base44.asServiceRole.entities.ResearchRun.filter({ id: research_run_id, organization_id: org_id }).catch(() => []);
      const run = runs[0];
      if (!run) return Response.json({ error: 'Nicht gefunden' }, { status: 404 });
      const detail = await buildRunDetail(base44, run, org_id);
      return Response.json({ success: true, mode: 'single', detail });
    }

    // ── List: letzte N Runs der Org ──────────────────────────────────────────
    const safeLimit = Math.min(Math.max(1, limit || 10), 20);
    const runs = await base44.asServiceRole.entities.ResearchRun.filter(
      { organization_id: org_id },
      '-created_date',
      safeLimit
    ).catch(() => []);

    // Für Liste: nur leichte Aggregation ohne Company-Load für jede (Performance)
    const list = runs.map(run => {
      const chainExamples = safeParseJson(run.chain_skipped_examples_json) || [];
      const runtimeSeconds = run.started_at && run.finished_at
        ? Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000)
        : null;
      return {
        id: run.id,
        status: run.status,
        industry_id: run.industry_id || null,
        city: run.search_center_city || null,
        radius_km: run.search_radius_km || null,
        target_leads: run.requested_target || null,
        leads_saved: run.leads_saved || 0,
        raw_hits: run.raw_hits || 0,
        duplicates_skipped: run.duplicates_skipped || 0,
        outside_radius_count: run.outside_radius_count || 0,
        chain_skipped_count: run.chain_skipped_count || 0,
        no_match_count: run.no_match_count || 0,
        coverage_complete: run.coverage_complete ?? null,
        locations_remaining_count: run.locations_remaining_count ?? null,
        batch_progress: run.total_batches > 0 ? `${run.batch_index || 0}/${run.total_batches}` : null,
        runtime_seconds: runtimeSeconds,
        error_message: run.error_message || null,
        stop_reason: run.stop_reason || null,
        zero_result_cause: run.zero_result_cause || null,
        has_errors: !!(run.error_message || run.stop_reason),
        chain_examples_count: chainExamples.length,
        is_legacy_run: isLegacyRun(run),
        created_date: run.created_date || null,
        started_at: run.started_at || null,
        finished_at: run.finished_at || null,
        target_customer_types: run.selected_target_customer_types || run.target_customer_types || null,
      };
    });

    return Response.json({ success: true, mode: 'list', runs: list, total: list.length });

  } catch (error) {
    console.error('[getResearchRunObservability] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});