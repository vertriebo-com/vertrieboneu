/**
 * backfillCompanyQualityAndLifecycle
 * ===================================
 * Führt Backfill für quality_tier / lifecycle_stage durch.
 * Verwendet dieselbe Planungslogik wie auditCompanyBackfillPlan.
 *
 * *** SHARED PLANNING LOGIC – START ***
 * Die Funktion buildCompanyBackfillPlan() ist in BEIDEN Functions
 * (auditCompanyBackfillPlan UND backfillCompanyQualityAndLifecycle) identisch.
 * Änderungen hier müssen dort übernommen werden und umgekehrt.
 * *** SHARED PLANNING LOGIC – END ***
 *
 * Input:  { org_id?, dry_run = true }
 * Output: { dry_run, stats, updates (wenn dry_run=true) }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ═══════════════════════════════════════════════════════════════════════════
// SHARED PLANNING LOGIC (identisch in auditCompanyBackfillPlan)
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
    if (!user || !["admin", "platform_owner", "platform_admin", "organization_admin"].includes(user.role)) {
      return Response.json({ error: "Forbidden: admin or org_admin required" }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { org_id, dry_run = true } = payload;

    // dry_run=false ist freigegeben (Freigabe 2026-05-26, Zahlen verifiziert)

    // ── Org auflösen ──────────────────────────────────────────────────────────
    let targetOrgId = org_id;
    if (!targetOrgId) {
      const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
      targetOrgId = orgs?.[0]?.id;
    }
    if (!targetOrgId) return Response.json({ error: "No organization found" }, { status: 404 });

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);
    const orgs = await base44.entities.Organization.filter({ id: targetOrgId });
    if (!orgs || orgs.length === 0) return Response.json({ error: "Organization not found" }, { status: 404 });
    const org = orgs[0];
    if (!isPlatformAdmin && org.owner_email !== user.email) {
      return Response.json({ error: "Forbidden: Not your organization" }, { status: 403 });
    }

    const PAGE_SIZE = 100;

    // ── Companies laden (vollständig, paginiert) ──────────────────────────────
    const allCompanies = [];
    for (let skip = 0; skip < 10000; skip += PAGE_SIZE) {
      const batch = await base44.entities.Company.filter(
        { organization_id: targetOrgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const c of batch) allCompanies.push(c);
      if (batch.length < PAGE_SIZE) break;
      await new Promise(r => setTimeout(r, 200));
    }

    // ── Opportunities (won) für lifecycle Konflikt-Check ─────────────────────
    const wonOppCompanyIds = new Set();
    for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
      const batch = await base44.entities.Opportunity.filter(
        { organization_id: targetOrgId, status: 'won' }, '-created_date', PAGE_SIZE, skip
      );
      for (const o of batch) { if (o.company_id) wonOppCompanyIds.add(o.company_id); }
      if (batch.length < PAGE_SIZE) break;
      await new Promise(r => setTimeout(r, 200));
    }

    // ── Plan berechnen ────────────────────────────────────────────────────────
    const plans = allCompanies.map(c => buildCompanyBackfillPlan(c, wonOppCompanyIds));

    // ── Aggregation ───────────────────────────────────────────────────────────
    const skipped          = plans.filter(p => p.skip_reason !== null);
    const active           = plans.filter(p => p.skip_reason === null);
    const actualUpdates    = active.filter(p => p.has_actual_update);
    const conflicts        = active.filter(p => p.conflict);
    const noChange         = active.filter(p => !p.has_actual_update && !p.conflict);
    const qualityUpdates   = active.filter(p => p.quality_changed);
    const lifecycleUpdates = active.filter(p => p.lifecycle_changed);

    const stats = {
      companies_checked:              allCompanies.length,
      skipped_archived_blacklisted:   skipped.length,
      active_checked:                 active.length,
      quality_tier_actual_updates:    qualityUpdates.length,
      lifecycle_stage_actual_updates: lifecycleUpdates.length,
      total_actual_updates:           actualUpdates.length,
      conflicts:                      conflicts.length,
      no_change:                      noChange.length,
    };

    // ── Ausführen wenn dry_run=false ──────────────────────────────────────────
    const errors = [];
    let updated_count = 0;

    if (!dry_run) {
      for (const plan of actualUpdates) {
        // Nur fehlende/ungültige Felder – keine bestehenden validen Werte überschreiben
        // (buildCompanyBackfillPlan garantiert das bereits, aber explizite Prüfung hier)
        if (!plan.has_actual_update || Object.keys(plan.changes).length === 0) continue;

        // Zusatz-Sicherheitsgate direkt vor dem Update
        const c = allCompanies.find(x => x.id === plan.company_id);
        if (!c) continue;
        if (c.is_blacklisted) { errors.push({ id: plan.company_id, reason: 'blacklisted – skip' }); continue; }
        if (c.lifecycle_stage === 'archived' || c.status === 'Archiviert') { errors.push({ id: plan.company_id, reason: 'archived – skip' }); continue; }
        if (plan.changes.lifecycle_stage === 'lead' && (c.lifecycle_stage === 'customer' || c.lifecycle_stage === 'lost')) {
          errors.push({ id: plan.company_id, reason: `prevented downgrade ${c.lifecycle_stage}→lead` }); continue;
        }

        const result = await base44.entities.Company.update(plan.company_id, plan.changes);
        if (result) updated_count++;
        // Rate-limit Schutz: kurze Pause nach je 10 Updates
        if (updated_count % 10 === 0) await new Promise(r => setTimeout(r, 300));
      }
    }

    return Response.json({
      dry_run,
      org_id: targetOrgId,
      stats: {
        ...stats,
        updated_count: dry_run ? 0 : updated_count,
        errors: errors.length,
      },
      updates: dry_run ? actualUpdates.slice(0, 50).map(p => ({
        company_id:   p.company_id,
        company_name: p.company_name,
        current:      p.current,
        proposed:     p.proposed,
        changes:      p.changes,
        reasons:      p.reasons,
        risk:         p.risk,
      })) : actualUpdates.slice(0, 10).map(p => ({
        company_id:   p.company_id,
        company_name: p.company_name,
        changes:      p.changes,
      })),
      error_details: errors.length > 0 ? errors : undefined,
      message: dry_run
        ? `Dry Run: ${stats.quality_tier_actual_updates} quality_tier, ${stats.lifecycle_stage_actual_updates} lifecycle_stage würden aktualisiert (${stats.total_actual_updates} total)`
        : `Executed: ${updated_count} Companies aktualisiert, ${errors.length} Fehler`,
    });

  } catch (error) {
    console.error('backfillCompanyQualityAndLifecycle error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});