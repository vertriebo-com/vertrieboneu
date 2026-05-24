/**
 * resolveCoverageLocations
 * ========================
 * Gibt aktive LocationIndex-Einträge zurück, die in einem Radius um center_lat/center_lng liegen.
 *
 * REGELN:
 * - Nur is_active=true Einträge
 * - Niemals location_type=special_postal_recipient
 * - Google Places bleibt für Firmen/Leads → dieser Service nur für Orts-/PLZ-Abdeckung
 * - Keine Live-API-Calls pro Recherche (nur DB)
 * - Deduplizierung: primär nach ID, fallback nach country_code+postal_code+normalized_name+state_code
 *
 * Plan-Limits (Anzahl zurückgegebener Orte):
 * - Free Preview: max 3
 * - Verified Trial: max 5
 * - Starter (max_leads_per_month<=300): max 10
 * - Professional (max_leads_per_month<=500): max 25
 * - Gold (max_leads_per_month<=1000): max 50
 * - Agency / custom_monthly_lead_limit=-1: unlimited
 *
 * Input: center_lat, center_lng, radius_km, organization_id (für Plan-Limit)
 * Output: aktive, deduplizierte LocationIndex-Einträge im Radius
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Planlimit: Anzahl max. zurückgegebener Orte für Suche
function resolveMaxLocations(trialStage, plan) {
  if (!trialStage || trialStage === 'free_preview') return 3;
  if (trialStage === 'verified_trial') return 5;
  if (!plan) return 10; // fallback Starter-ähnlich

  const maxLeads = plan.max_leads_per_month;
  if (maxLeads === -1) return 9999; // unlimited
  if (plan.plan_type === 'agency') return 9999;
  if (maxLeads >= 1000) return 50;   // Gold
  if (maxLeads >= 500)  return 25;   // Professional
  if (maxLeads >= 300)  return 10;   // Starter
  return 10;
}

// Prioritätsscore: Nähe + Qualität + Typ-Bonus
function calcPriorityScore(distKm, radiusKm, qualityScore, locationType) {
  const proximityScore = Math.max(0, 100 - (distKm / radiusKm) * 60);
  const qualityWeight = (qualityScore || 80) * 0.3;
  const typeBonus = locationType === 'postal_code_city' ? 10 : locationType === 'city_only' ? 5 : 0;
  return Math.round(proximityScore + qualityWeight + typeBonus);
}

// Alle LocationIndex-Einträge paginiert laden (mit ID-Dedupe)
// Base44 .list(sort, limit, skip) — skip ist 0-basierter Offset
async function loadAllLocationEntries(base44) {
  const seenIds = new Set();
  const allEntries = [];
  const PAGE_SIZE = 2000;
  const MAX_PAGES = 20; // Max 40.000 Einträge

  for (let page = 0; page < MAX_PAGES; page++) {
    const skip = page * PAGE_SIZE;
    const batch = await base44.asServiceRole.entities.LocationIndex.list('-quality_score', PAGE_SIZE, skip);
    let added = 0;
    for (const r of batch) {
      if (!seenIds.has(r.id)) { seenIds.add(r.id); allEntries.push(r); added++; }
    }
    // Fertig wenn Seite nicht voll war
    if (batch.length < PAGE_SIZE) break;
  }

  console.info(`[resolveCoverageLocations] Geladen: ${allEntries.length} Einträge`);
  return allEntries;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      center_lat,
      center_lng,
      radius_km,
      organization_id,
      trial_stage_override = null,
      plan_id_override = null,
      include_all = false,
    } = body;

    if (!center_lat || !center_lng || !radius_km) {
      return Response.json({ error: 'center_lat, center_lng, radius_km sind Pflichtfelder' }, { status: 400 });
    }

    const lat = parseFloat(center_lat);
    const lng = parseFloat(center_lng);
    const radius = parseFloat(radius_km);

    if (isNaN(lat) || isNaN(lng) || isNaN(radius) || radius <= 0) {
      return Response.json({ error: 'Ungültige Koordinaten oder Radius' }, { status: 400 });
    }

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);

    // ── Org + Plan laden für Limit-Berechnung ──────────────────────────────
    let trialStage = trial_stage_override || 'free_preview';
    let plan = null;
    let maxLocations = 3;
    let org = null;

    if (organization_id) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      org = orgs[0] || null;
      if (org) {
        trialStage = trial_stage_override || org.trial_stage || 'free_preview';
        if (org.custom_monthly_lead_limit === -1) {
          maxLocations = 9999;
        } else {
          const planId = plan_id_override || org.plan_id;
          if (planId) {
            const plans = await base44.asServiceRole.entities.Plan.filter({ id: planId });
            plan = plans[0] || null;
          }
          maxLocations = resolveMaxLocations(trialStage, plan);
        }
      }
    } else {
      if (!isPlatformAdmin) {
        return Response.json({ error: 'organization_id erforderlich' }, { status: 400 });
      }
      maxLocations = include_all ? 9999 : 25;
    }

    if (isPlatformAdmin && include_all) maxLocations = 9999;

    console.info(`[resolveCoverageLocations] Suche: center=${lat},${lng} radius=${radius}km maxLocations=${maxLocations}`);

    // ── Alle LocationIndex-Einträge laden (paginiert, ID-dedupliziert) ──────
    const allEntries = await loadAllLocationEntries(base44);

    // Aktive Einträge (Boolean-safe, ohne special_postal_recipient)
    const allActive = allEntries.filter(r =>
      (r.is_active === true || r.is_active === 'true' || r.is_active === 1) &&
      r.location_type !== 'special_postal_recipient'
    );

    console.info(`[resolveCoverageLocations] ${allEntries.length} Einträge geladen, ${allActive.length} aktiv+gültig`);

    // ── Fallback-Dedupe: country_code+postal_code+normalized_name+state_code ─
    // (schützt vor doppelten Importreihen, die unterschiedliche IDs haben)
    const compositeSeenKeys = new Set();
    const dedupedActive = [];
    for (const r of allActive) {
      if (!r.lat || !r.lng || r.lat === 0 || r.lng === 0) continue;
      const compositeKey = `${r.country_code || 'DE'}|${r.postal_code || ''}|${r.normalized_name || (r.city || '').toLowerCase()}|${r.state_code || ''}`;
      if (compositeSeenKeys.has(compositeKey)) continue;
      compositeSeenKeys.add(compositeKey);
      dedupedActive.push(r);
    }

    console.info(`[resolveCoverageLocations] ${dedupedActive.length} Einträge nach Dedupe (vorher ${allActive.length})`);

    // ── Im Radius filtern + Priorität berechnen ───────────────────────────
    const inRadius = [];
    for (const loc of dedupedActive) {
      const distKm = haversineKm(lat, lng, loc.lat, loc.lng);
      if (distKm > radius) continue;

      inRadius.push({
        id: loc.id,
        postal_code: loc.postal_code,
        city: loc.city,
        state: loc.state,
        state_code: loc.state_code,
        district: loc.district,
        lat: loc.lat,
        lng: loc.lng,
        location_type: loc.location_type,
        quality_score: loc.quality_score,
        distance_km: Math.round(distKm * 10) / 10,
        priority_score: calcPriorityScore(distKm, radius, loc.quality_score, loc.location_type),
      });
    }

    // Nach Priorität sortieren
    inRadius.sort((a, b) => b.priority_score - a.priority_score);

    // Plan-Limit anwenden
    const selected = inRadius.slice(0, maxLocations);
    const notSelected = inRadius.slice(maxLocations);

    const limitLabel = maxLocations === 9999 ? 'unlimited' : String(maxLocations);

    const result = [
      ...selected.map((loc, i) => ({
        ...loc,
        selected_for_search: true,
        selection_reason: `Rang ${i + 1}/${inRadius.length} nach Nähe+Qualität (Plan-Limit: ${limitLabel})`,
      })),
      ...notSelected.map((loc, i) => ({
        ...loc,
        selected_for_search: false,
        selection_reason: `Über Plan-Limit (${limitLabel} max, Rang ${maxLocations + i + 1}/${inRadius.length})`,
      })),
    ];

    // ── Statistiken ────────────────────────────────────────────────────────
    const uniquePostalCodes = new Set(selected.map(l => l.postal_code)).size;
    const uniqueCities = new Set(selected.map(l => l.city)).size;
    const statesRepresented = [...new Set(selected.map(l => l.state_code).filter(Boolean))];

    return Response.json({
      success: true,
      input: { center_lat: lat, center_lng: lng, radius_km: radius },
      plan_context: {
        trial_stage: trialStage,
        plan_name: plan?.name || null,
        max_locations: maxLocations === 9999 ? 'unlimited' : maxLocations,
      },
      summary: {
        total_in_radius: inRadius.length,
        selected_count: selected.length,
        not_selected_count: notSelected.length,
        unique_postal_codes: uniquePostalCodes,
        unique_cities: uniqueCities,
        states: statesRepresented,
        radius_coverage_pct: inRadius.length > 0
          ? Math.round((selected.length / inRadius.length) * 100)
          : 0,
      },
      locations: result,
    });

  } catch (error) {
    console.error('[resolveCoverageLocations] FEHLER:', error?.message);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});