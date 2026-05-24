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
 * 
 * Plan-Limits (Anzahl zurückgegebener Orte):
 * - Free Preview: max 3
 * - Starter (max_leads_per_month<=300): max 10
 * - Professional (max_leads_per_month<=500): max 25
 * - Gold (max_leads_per_month<=1000): max 50
 * - Agency / custom_monthly_lead_limit=-1: unlimited (gibt alle zurück)
 * 
 * Input: center_lat, center_lng, radius_km, organization_id (für Plan-Limit)
 * Output: aktive LocationIndex-Einträge im Radius mit distance_km, priority_score, selected_for_search
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

  // Agency: custom_monthly_lead_limit oder plan unlimited
  const maxLeads = plan.max_leads_per_month;
  if (maxLeads === -1) return 9999; // unlimited

  // Plan-basiert
  if (plan.plan_type === 'agency') return 9999;
  if (maxLeads >= 1000) return 50;   // Gold
  if (maxLeads >= 500)  return 25;   // Professional
  if (maxLeads >= 300)  return 10;   // Starter
  return 10; // default
}

// Prioritätsscore für einen Ort:
// - Nähe zum Zentrum: wichtigster Faktor (je näher, desto höher)
// - Qualitätsscore aus LocationIndex
// - Bevorzuge postal_code_city (gegenüber city_only / district_only)
function calcPriorityScore(distKm, radiusKm, qualityScore, locationType) {
  const proximityScore = Math.max(0, 100 - (distKm / radiusKm) * 60);
  const qualityWeight = (qualityScore || 80) * 0.3;
  const typeBonus = locationType === 'postal_code_city' ? 10 : locationType === 'city_only' ? 5 : 0;
  return Math.round(proximityScore + qualityWeight + typeBonus);
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
      // Optional: override für Tests
      trial_stage_override = null,
      plan_id_override = null,
      include_all = false, // true = alle im Radius zurückgeben (kein Plan-Limit, nur Admin)
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

    // ── Org + Plan laden für Limit-Berechnung ────────────────────────────
    let trialStage = trial_stage_override || 'free_preview';
    let plan = null;
    let maxLocations = 3;
    let org = null;

    if (organization_id) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      org = orgs[0] || null;
      if (org) {
        trialStage = trial_stage_override || org.trial_stage || 'free_preview';

        // custom_monthly_lead_limit=-1 = Agency unlimited
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
      // Kein org_id: nur für Admin/Test erlaubt
      if (!isPlatformAdmin) {
        return Response.json({ error: 'organization_id erforderlich' }, { status: 400 });
      }
      maxLocations = include_all ? 9999 : 25;
    }

    if (isPlatformAdmin && include_all) maxLocations = 9999;

    // ── LocationIndex-Einträge laden ──────────────────────────────────────
    // Wir laden in Batches und filtern clientseitig nach Radius
    // (Base44 hat keine GEO-Query → Haversine clientseitig)
    // Für DE: ~19.000 aktive Einträge → realistisch in 1-2 Batches
    console.info(`[resolveCoverageLocations] Suche: center=${lat},${lng} radius=${radius}km maxLocations=${maxLocations}`);

    // Base44 Boolean-Filter ist unsicher für true/false — clientseitig filtern nach is_active
    // Alle Einträge in Batches laden und dann filtern
    let allEntries = [];
    let batch = await base44.asServiceRole.entities.LocationIndex.list('-quality_score', 2000);
    allEntries.push(...batch);
    // Weitere Seiten laden bis alle da sind
    let offset = 2000;
    while (batch.length === 2000) {
      batch = await base44.asServiceRole.entities.LocationIndex.list('-quality_score', 2000, offset);
      allEntries.push(...batch);
      offset += 2000;
      if (offset > 30000) break; // Sicherheitslimit
    }

    // Clientseitig auf is_active=true filtern (Boolean-safe)
    const allActive = allEntries.filter(r => r.is_active === true || r.is_active === 'true' || r.is_active === 1);

    console.info(`[resolveCoverageLocations] ${allEntries.length} Einträge geladen, ${allActive.length} aktiv`);

    // ── Im Radius filtern ─────────────────────────────────────────────────
    const inRadius = [];
    for (const loc of allActive) {
      // Sicherheitscheck: special_postal_recipient niemals zurückgeben
      if (loc.location_type === 'special_postal_recipient') continue;
      if (!loc.lat || !loc.lng || loc.lat === 0 || loc.lng === 0) continue;

      const distKm = haversineKm(lat, lng, loc.lat, loc.lng);
      if (distKm > radius) continue;

      const priorityScore = calcPriorityScore(distKm, radius, loc.quality_score, loc.location_type);

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
        priority_score: priorityScore,
      });
    }

    // Nach Priorität sortieren
    inRadius.sort((a, b) => b.priority_score - a.priority_score);

    // Plan-Limit anwenden
    const selected = inRadius.slice(0, maxLocations);
    const notSelected = inRadius.slice(maxLocations);

    // Markierungen hinzufügen
    const result = [
      ...selected.map(loc => ({
        ...loc,
        selected_for_search: true,
        selection_reason: `Rang ${selected.indexOf(loc) + 1}/${inRadius.length} nach Nähe+Qualität (Plan-Limit: ${maxLocations === 9999 ? 'unlimited' : maxLocations})`,
      })),
      ...notSelected.map(loc => ({
        ...loc,
        selected_for_search: false,
        selection_reason: `Über Plan-Limit (${maxLocations === 9999 ? 'unlimited' : maxLocations} max, Rang ${inRadius.indexOf(loc) + 1}/${inRadius.length})`,
      })),
    ];

    // ── Statistiken ───────────────────────────────────────────────────────
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