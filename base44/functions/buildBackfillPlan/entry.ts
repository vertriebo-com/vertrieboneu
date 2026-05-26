/**
 * buildBackfillPlan
 * =================
 * SHARED PLANNING LOGIC – wird von auditCompanyBackfillPlan UND
 * backfillCompanyQualityAndLifecycle verwendet.
 *
 * Exportiert eine pure Funktion buildCompanyQualityLifecycleBackfillPlan(company, wonOppCompanyIds)
 * die pro Company exakt zurückgibt was geändert werden soll – oder nicht.
 *
 * REGELN (kanonisch, keine Ausnahmen):
 *
 * quality_tier:
 *   1. Nur ändern wenn aktuelles Feld fehlt ODER keinen validen Wert hat
 *   2. Neuen Wert aus engine_analysis_json.quality_tier ableiten (primär)
 *      Fallback: relevance_score / engine_confidence
 *   3. Nur eintragen wenn neuer Wert != aktueller Wert
 *   4. Wenn aktueller Wert bereits valide: KEIN Update
 *
 * lifecycle_stage:
 *   1. Nur ändern wenn aktuelles Feld fehlt ODER keinen validen Wert hat
 *   2. Zielwert = 'lead' (default), außer Company hat won Opportunity → 'customer'
 *      oder Company hat status=Verloren → 'lost'
 *   3. Sicherheitsgate: customer/lost/archived NIEMALS auf lead zurücksetzen
 *   4. Nur eintragen wenn neuer Wert != aktueller Wert
 *   5. Wenn aktueller Wert bereits valide: KEIN Update
 *
 * Zähler:
 *   - has_actual_update = true NUR wenn mindestens ein Feld wirklich geändert wird
 *   - changes enthält NUR Felder die wirklich geändert werden
 */

const VALID_QUALITY_TIERS = ['premium', 'strong', 'good', 'weak'];
const VALID_LIFECYCLE_STAGES = ['lead', 'qualified', 'customer', 'lost', 'archived'];

/**
 * Leitet quality_tier aus vorhandenen Company-Daten ab.
 * Gibt { tier, reason, source } zurück oder { tier: null, reason, source } wenn nicht ableitbar.
 */
function deriveQualityTier(company) {
  // Primär: engine_analysis_json.quality_tier
  const engineJson = company.engine_analysis_json;
  if (engineJson) {
    try {
      const engine = typeof engineJson === 'string' ? JSON.parse(engineJson) : engineJson;
      const tier = engine.quality_tier;
      if (tier && VALID_QUALITY_TIERS.includes(tier)) {
        return { tier, reason: `engine_analysis_json.quality_tier = "${tier}"`, source: 'engine_json' };
      }
    } catch {
      // parse error – weiter mit Fallback
    }
  }

  // Fallback: relevance_score oder engine_confidence
  const score = company.relevance_score || company.engine_confidence || 0;
  if (score >= 85) return { tier: 'premium', reason: `score ${score} >= 85`, source: 'score_fallback' };
  if (score >= 75) return { tier: 'strong',  reason: `score ${score} >= 75`, source: 'score_fallback' };
  if (score >= 65) return { tier: 'good',    reason: `score ${score} >= 65`, source: 'score_fallback' };
  if (score >  0)  return { tier: 'weak',    reason: `score ${score} < 65`,  source: 'score_fallback' };

  return { tier: null, reason: 'no data available for quality_tier derivation', source: 'none' };
}

/**
 * Leitet lifecycle_stage aus Company-Daten + Opportunity-Context ab.
 * Gibt { stage, reason } zurück.
 */
function deriveLifecycleStage(company, wonOppCompanyIds) {
  if (wonOppCompanyIds && wonOppCompanyIds.has(company.id)) {
    return { stage: 'customer', reason: 'has won opportunity → customer' };
  }
  if (company.status === 'Verloren') {
    return { stage: 'lost', reason: 'status=Verloren → lost' };
  }
  if (company.status === 'Gewonnen') {
    return { stage: 'customer', reason: 'status=Gewonnen → customer' };
  }
  return { stage: 'lead', reason: 'default (no won opportunity, no lost status)' };
}

/**
 * Zentrale Planungslogik.
 *
 * @param {object} company - Company-Datensatz
 * @param {Set} wonOppCompanyIds - Set von company_id mit status=won in Opportunities
 * @returns {object} Plan-Objekt mit changes, has_actual_update, reasons, risk
 */
export function buildCompanyQualityLifecycleBackfillPlan(company, wonOppCompanyIds = new Set()) {
  const reasons = [];
  const changes = {};

  // ── Aktuelle Werte (KEIN Fallback-Default hier – null bleibt null) ──────────
  const currentQualityTier    = company.quality_tier    || null;
  const currentLifecycleStage = company.lifecycle_stage || null;

  // ── Sicherheitsgates: Skip-Kandidaten ─────────────────────────────────────
  const isArchived    = currentLifecycleStage === 'archived' || company.status === 'Archiviert';
  const isBlacklisted = company.is_blacklisted === true;

  if (isArchived || isBlacklisted) {
    return {
      company_id:   company.id,
      company_name: company.name,
      current:  { quality_tier: currentQualityTier, lifecycle_stage: currentLifecycleStage },
      proposed: { quality_tier: currentQualityTier, lifecycle_stage: currentLifecycleStage },
      changes:  {},
      has_actual_update: false,
      skip_reason: isArchived ? 'archived' : 'blacklisted',
      reasons:  [isArchived ? 'skip: archived' : 'skip: blacklisted'],
      risk:     'low',
    };
  }

  // ── quality_tier ──────────────────────────────────────────────────────────
  const hasValidQualityTier = currentQualityTier !== null && VALID_QUALITY_TIERS.includes(currentQualityTier);
  let proposedQualityTier = currentQualityTier;
  let qualityWillChange = false;

  if (!hasValidQualityTier) {
    // Feld fehlt oder ungültig → ableiten
    const derived = deriveQualityTier(company);
    if (derived.tier !== null) {
      // Nur wenn neuer Wert sich vom aktuellen unterscheidet
      if (derived.tier !== currentQualityTier) {
        proposedQualityTier = derived.tier;
        changes.quality_tier = derived.tier;
        qualityWillChange = true;
        reasons.push(`quality_tier: null → "${derived.tier}" (${derived.reason})`);
      } else {
        reasons.push(`quality_tier: already "${currentQualityTier}" (no change)`);
      }
    } else {
      reasons.push(`quality_tier: not derivable (${derived.reason})`);
    }
  } else {
    // Bereits valide → kein Update
    reasons.push(`quality_tier: already valid "${currentQualityTier}" (no change)`);
  }

  // ── lifecycle_stage ───────────────────────────────────────────────────────
  const hasValidLifecycleStage = currentLifecycleStage !== null && VALID_LIFECYCLE_STAGES.includes(currentLifecycleStage);
  let proposedLifecycleStage = currentLifecycleStage;
  let lifecycleWillChange = false;
  let lifecycleConflict = false;

  if (!hasValidLifecycleStage) {
    // Feld fehlt oder ungültig → ableiten
    const derived = deriveLifecycleStage(company, wonOppCompanyIds);

    // Sicherheitsgate: NIEMALS customer/lost/archived downgraden
    if (currentLifecycleStage === 'customer' || currentLifecycleStage === 'lost' || currentLifecycleStage === 'archived') {
      // Sollte durch isArchived oben bereits abgedeckt sein, aber defensive check
      reasons.push(`lifecycle_stage: BLOCKED downgrade from "${currentLifecycleStage}" to "${derived.stage}"`);
      lifecycleConflict = true;
    } else if (derived.stage !== currentLifecycleStage) {
      proposedLifecycleStage = derived.stage;
      changes.lifecycle_stage = derived.stage;
      lifecycleWillChange = true;
      reasons.push(`lifecycle_stage: null → "${derived.stage}" (${derived.reason})`);
    } else {
      reasons.push(`lifecycle_stage: already "${currentLifecycleStage}" (no change)`);
    }
  } else {
    // Bereits valide → kein Update
    reasons.push(`lifecycle_stage: already valid "${currentLifecycleStage}" (no change)`);
  }

  // ── Risikobewertung ───────────────────────────────────────────────────────
  const isCurrentCustomer = currentLifecycleStage === 'customer';
  const isCurrentLost     = currentLifecycleStage === 'lost';
  const hasWonOpp         = wonOppCompanyIds.has(company.id);

  let risk = 'low';
  if (lifecycleConflict) risk = 'high';
  else if (isCurrentCustomer || isCurrentLost) risk = 'medium';
  else if (hasWonOpp && proposedLifecycleStage !== 'customer') risk = 'medium';

  return {
    company_id:   company.id,
    company_name: company.name,
    current: {
      quality_tier:    currentQualityTier,
      lifecycle_stage: currentLifecycleStage,
    },
    proposed: {
      quality_tier:    proposedQualityTier,
      lifecycle_stage: proposedLifecycleStage,
    },
    changes,
    has_actual_update: qualityWillChange || lifecycleWillChange,
    quality_will_change:    qualityWillChange,
    lifecycle_will_change:  lifecycleWillChange,
    lifecycle_conflict:     lifecycleConflict,
    skip_reason:            null,
    reasons,
    risk,
  };
}