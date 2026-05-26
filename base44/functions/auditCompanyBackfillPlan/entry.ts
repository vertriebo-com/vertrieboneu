/**
 * auditCompanyBackfillPlan
 * =========================
 * Dry-run Audit für quality_tier / lifecycle_stage Backfill.
 * Verwendet dieselbe Planungslogik wie backfillCompanyQualityAndLifecycle.
 *
 * *** SHARED PLANNING LOGIC – START ***
 * Die Funktion buildCompanyBackfillPlan() ist in BEIDEN Functions
 * (auditCompanyBackfillPlan UND backfillCompanyQualityAndLifecycle) identisch.
 * Änderungen hier müssen dort übernommen werden und umgekehrt.
 * *** SHARED PLANNING LOGIC – END ***
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ═══════════════════════════════════════════════════════════════════════════
// SHARED PLANNING LOGIC (identisch in backfillCompanyQualityAndLifecycle)
// ═══════════════════════════════════════════════════════════════════════════

const VALID_QUALITY_TIERS   = ['premium', 'strong', 'good', 'weak'];
const VALID_LIFECYCLE_STAGES = ['lead', 'qualified', 'customer', 'lost', 'archived'];

function deriveQualityTier(company) {
  // Primär: engine_analysis_json.quality_tier
  const engineJson = company.engine_analysis_json;
  if (engineJson) {
    try {
      const engine = typeof engineJson === 'string' ? JSON.parse(engineJson) : engineJson;
      const tier = engine.quality_tier;
      if (tier && VALID_QUALITY_TIERS.includes(tier)) {
        return { tier, reason: `engine_json.quality_tier="${tier}"`, source: 'engine_json' };
      }
    } catch (_) { /* parse error – weiter mit Fallback */ }
  }
  // Fallback: bester verfügbarer Score
  const score = company.relevance_score || company.engine_confidence || 0;
  if (score >= 85) return { tier: 'premium', reason: `score ${score}>=85`, source: 'score' };
  if (score >= 75) return { tier: 'strong',  reason: `score ${score}>=75`, source: 'score' };
  if (score >= 65) return { tier: 'good',    reason: `score ${score}>=65`, source: 'score' };
  if (score >  0)  return { tier: 'weak',    reason: `score ${score}<65`,  source: 'score' };
  return { tier: null, reason: 'no data for quality_tier', source: 'none' };
}

function deriveLifecycleStage(company, wonOppCompanyIds) {
  if (wonOppCompanyIds.has(company.id))   return { stage: 'customer', reason: 'won opportunity' };
  if (company.status === 'Gewonnen')      return { stage: 'customer', reason: 'status=Gewonnen' };
  if (company.status === 'Verloren')      return { stage: 'lost',     reason: 'status=Verloren' };
  return { stage: 'lead', reason: 'default' };
}

/**
 * Zentrale Planungsfunktion.
 * Gibt exakt zurück was geändert werden soll – oder nicht.
 * has_actual_update = true NUR wenn mindestens ein Feld wirklich geändert wird.
 */
function buildCompanyBackfillPlan(company, wonOppCompanyIds) {
  const reasons = [];
  const changes = {};

  // Aktuelle Werte – KEIN Fallback-Default (null bleibt null)
  const currentQT  = company.quality_tier    || null;
  const currentLS  = company.lifecycle_stage || null;

  // Skip: archived oder blacklisted
  const isArchived    = currentLS === 'archived' || company.status === 'Archiviert';
  const isBlacklisted = company.is_blacklisted === true;

  if (isArchived || isBlacklisted) {
    return {
      company_id:        company.id,
      company_name:      company.name,
      current:           { quality_tier: currentQT, lifecycle_stage: currentLS },
      proposed:          { quality_tier: currentQT, lifecycle_stage: currentLS },
      changes:           {},
      has_actual_update: false,
      quality_changed:   false,
      lifecycle_changed: false,
      conflict:          false,
      skip_reason:       isArchived ? 'archived' : 'blacklisted',
      reasons:           [isArchived ? 'skip: archived' : 'skip: blacklisted'],
      risk:              'low',
    };
  }

  // ── quality_tier ──────────────────────────────────────────────────────────
  const hasValidQT = currentQT !== null && VALID_QUALITY_TIERS.includes(currentQT);
  let proposedQT = currentQT;
  let qualityChanged = false;

  if (!hasValidQT) {
    const d = deriveQualityTier(company);
    if (d.tier !== null && d.tier !== currentQT) {
      proposedQT = d.tier;
      changes.quality_tier = d.tier;
      qualityChanged = true;
      reasons.push(`quality_tier: "${currentQT}" → "${d.tier}" (${d.reason})`);
    } else if (d.tier !== null) {
      reasons.push(`quality_tier: already "${currentQT}" – no change`);
    } else {
      reasons.push(`quality_tier: not derivable – ${d.reason}`);
    }
  } else {
    reasons.push(`quality_tier: valid "${currentQT}" – no change`);
  }

  // ── lifecycle_stage ───────────────────────────────────────────────────────
  const hasValidLS = currentLS !== null && VALID_LIFECYCLE_STAGES.includes(currentLS);
  let proposedLS = currentLS;
  let lifecycleChanged = false;
  let conflict = false;

  if (!hasValidLS) {
    const d = deriveLifecycleStage(company, wonOppCompanyIds);

    // Sicherheitsgate: customer/lost/archived NIEMALS überschreiben
    if (currentLS === 'customer' || currentLS === 'lost' || currentLS === 'archived') {
      conflict = true;
      reasons.push(`lifecycle_stage: BLOCKED – "${currentLS}" → "${d.stage}" verboten`);
    } else if (d.stage !== currentLS) {
      proposedLS = d.stage;
      changes.lifecycle_stage = d.stage;
      lifecycleChanged = true;
      reasons.push(`lifecycle_stage: "${currentLS}" → "${d.stage}" (${d.reason})`);
    } else {
      reasons.push(`lifecycle_stage: already "${currentLS}" – no change`);
    }
  } else {
    reasons.push(`lifecycle_stage: valid "${currentLS}" – no change`);
  }

  // ── Risiko ────────────────────────────────────────────────────────────────
  let risk = 'low';
  if (conflict) risk = 'high';
  else if (currentLS === 'customer' || currentLS === 'lost') risk = 'medium';

  return {
    company_id:        company.id,
    company_name:      company.name,
    current:           { quality_tier: currentQT, lifecycle_stage: currentLS },
    proposed:          { quality_tier: proposedQT, lifecycle_stage: proposedLS },
    changes,
    has_actual_update: qualityChanged || lifecycleChanged,
    quality_changed:   qualityChanged,
    lifecycle_changed: lifecycleChanged,
    conflict,
    skip_reason:       null,
    reasons,
    risk,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);
    const body = await req.json().catch(() => ({}));
    const { org_id, include_samples = true } = body;

    // ── Org auflösen ──────────────────────────────────────────────────────────
    let org = null;
    if (org_id) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: org_id });
      org = orgs?.[0] || null;
      if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });
      if (org.owner_email !== user.email && !isPlatformAdmin) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
      org = ownerOrgs?.[0] || null;
      if (!org && isPlatformAdmin) {
        const anyOrg = await base44.asServiceRole.entities.Organization.list('-created_date', 1);
        org = anyOrg?.[0] || null;
      }
      if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });
    }

    const orgId = org.id;
    const now = new Date();
    const PAGE_SIZE = 500;

    // ── Companies laden (vollständig, paginiert) ──────────────────────────────
    const allCompanies = [];
    for (let skip = 0; skip < 10000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Company.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const c of batch) allCompanies.push(c);
      if (batch.length < PAGE_SIZE) break;
    }

    // ── Opportunities (won) für lifecycle Konflikt-Check ─────────────────────
    const wonOppCompanyIds = new Set();
    for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Opportunity.filter(
        { organization_id: orgId, status: 'won' }, '-created_date', PAGE_SIZE, skip
      );
      for (const o of batch) { if (o.company_id) wonOppCompanyIds.add(o.company_id); }
      if (batch.length < PAGE_SIZE) break;
    }

    // ── Plan berechnen ────────────────────────────────────────────────────────
    const plans = allCompanies.map(c => buildCompanyBackfillPlan(c, wonOppCompanyIds));

    // ── Aggregation ───────────────────────────────────────────────────────────
    const skipped        = plans.filter(p => p.skip_reason !== null);
    const active         = plans.filter(p => p.skip_reason === null);
    const actualUpdates  = active.filter(p => p.has_actual_update);
    const conflicts      = active.filter(p => p.conflict);
    const noChange       = active.filter(p => !p.has_actual_update && !p.conflict);

    const qualityUpdates   = active.filter(p => p.quality_changed);
    const lifecycleUpdates = active.filter(p => p.lifecycle_changed);

    const summary = {
      companies_checked:            allCompanies.length,
      skipped_archived_blacklisted: skipped.length,
      active_checked:               active.length,
      quality_tier_actual_updates:  qualityUpdates.length,
      lifecycle_stage_actual_updates: lifecycleUpdates.length,
      total_actual_updates:         actualUpdates.length,
      conflicts:                    conflicts.length,
      no_change:                    noChange.length,
      won_opportunity_companies:    wonOppCompanyIds.size,
    };

    // ── Risikobewertung ───────────────────────────────────────────────────────
    let risk_level = 'low';
    let claim_status = 'green';
    if (conflicts.length > 0) {
      risk_level = 'high';
      claim_status = 'yellow';
    }

    // ── Samples ───────────────────────────────────────────────────────────────
    let sample_changes = [];
    if (include_samples) {
      sample_changes = actualUpdates.slice(0, 20).map(p => ({
        company_id:           p.company_id,
        company_name:         p.company_name,
        current:              p.current,
        proposed:             p.proposed,
        changes:              p.changes,
        reasons:              p.reasons,
        risk:                 p.risk,
      }));
    }

    return Response.json({
      claim_status,
      risk_level,
      summary,
      sample_changes,
      conflict_details: conflicts.slice(0, 10).map(p => ({
        company_id:   p.company_id,
        company_name: p.company_name,
        current:      p.current,
        reasons:      p.reasons,
      })),
      diagnostics: {
        org_id:         orgId,
        generated_at:   now.toISOString(),
        companies_loaded: allCompanies.length,
        won_opp_ids_count: wonOppCompanyIds.size,
      },
    });

  } catch (error) {
    console.error('[auditCompanyBackfillPlan]', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});