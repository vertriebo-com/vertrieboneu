/**
 * auditLocationIndex
 * ==================
 * Audit-Report für importierte LocationIndex-Daten.
 * 
 * Gibt aus:
 * - total_records, active_records, inactive_records
 * - states_count, postal_codes_count, cities_count
 * - duplicate_count (PLZ+Ort mehrfach)
 * - sample Koblenz / Neuwied / Bendorf
 * - sample inactive special recipients
 * - Qualitätsverteilung
 * - Matrix 5/10/25/50/100km × Großstadt/Kreisstadt/ländlich
 * 
 * Admin-only
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

// Testpunkte für Matrix-Prüfung
const MATRIX_CENTERS = [
  { name: 'Köln (Großstadt)', lat: 50.938, lng: 6.960 },
  { name: 'Koblenz (Kreisstadt)', lat: 50.356, lng: 7.589 },
  { name: 'Neuwied (Kreisstadt)', lat: 50.433, lng: 7.461 },
  { name: 'Bendorf (ländlich)', lat: 50.428, lng: 7.573 },
  { name: 'Hof/Saale (ländlich)', lat: 50.312, lng: 11.912 },
];
const MATRIX_RADII = [5, 10, 25, 50, 100];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin-only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { run_matrix = true } = body;

    // ── Alle Einträge laden (in Batches) ──────────────────────────────────
    console.info('[auditLocationIndex] Lade LocationIndex-Einträge...');
    const allRecords = [];
    let page = await base44.asServiceRole.entities.LocationIndex.list('-created_date', 2000);
    allRecords.push(...page);
    // Weitere Seiten
    while (page.length === 2000) {
      page = await base44.asServiceRole.entities.LocationIndex.list('-created_date', 2000, allRecords.length);
      allRecords.push(...page);
    }
    console.info(`[auditLocationIndex] Geladen: ${allRecords.length} Einträge`);

    const total = allRecords.length;
    const active = allRecords.filter(r => r.is_active === true);
    const inactive = allRecords.filter(r => r.is_active === false);
    const specialRecipients = allRecords.filter(r => r.location_type === 'special_postal_recipient');

    // ── Eindeutige Zählungen ──────────────────────────────────────────────
    const statesSet = new Set(active.map(r => r.state_code).filter(Boolean));
    const postalCodesSet = new Set(active.map(r => r.postal_code).filter(Boolean));
    const citiesSet = new Set(active.map(r => r.normalized_name || r.city).filter(Boolean));

    // ── Duplikate erkennen ────────────────────────────────────────────────
    const dedupeMap = {};
    for (const r of active) {
      const key = `${r.country_code || 'DE'}|${r.postal_code}|${r.normalized_name || r.city}|${r.state_code || ''}`;
      dedupeMap[key] = (dedupeMap[key] || 0) + 1;
    }
    const duplicateKeys = Object.entries(dedupeMap).filter(([, count]) => count > 1);
    const duplicateCount = duplicateKeys.reduce((sum, [, count]) => sum + (count - 1), 0);

    // ── Qualitätsverteilung ────────────────────────────────────────────────
    const qualityBuckets = { '90-100': 0, '80-89': 0, '70-79': 0, '<70': 0 };
    for (const r of active) {
      const qs = r.quality_score || 0;
      if (qs >= 90) qualityBuckets['90-100']++;
      else if (qs >= 80) qualityBuckets['80-89']++;
      else if (qs >= 70) qualityBuckets['70-79']++;
      else qualityBuckets['<70']++;
    }

    // ── Bundesland-Verteilung ─────────────────────────────────────────────
    const stateDistrib = {};
    for (const r of active) {
      const sk = r.state_code || 'unbekannt';
      if (!stateDistrib[sk]) stateDistrib[sk] = { count: 0, state: r.state || sk };
      stateDistrib[sk].count++;
    }
    const stateSorted = Object.entries(stateDistrib)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([code, v]) => ({ state_code: code, state: v.state, count: v.count }));

    // ── Sample: Koblenz / Neuwied / Bendorf ───────────────────────────────
    const sampleCities = ['koblenz', 'neuwied', 'bendorf', 'köln', 'koeln', 'berlin', 'münchen', 'muenchen'];
    const sampleEntries = active
      .filter(r => {
        const n = (r.normalized_name || '').toLowerCase();
        return sampleCities.some(c => n.includes(c) || (r.city || '').toLowerCase().includes(c));
      })
      .slice(0, 20)
      .map(r => ({
        postal_code: r.postal_code,
        city: r.city,
        state_code: r.state_code,
        lat: r.lat,
        lng: r.lng,
        quality_score: r.quality_score,
        location_type: r.location_type,
      }));

    // ── Sample inactive / special recipients ──────────────────────────────
    const sampleInactive = inactive.slice(0, 10).map(r => ({
      postal_code: r.postal_code,
      city: r.city,
      location_type: r.location_type,
      filter_reasons: r.filter_reasons,
      is_active: r.is_active,
    }));

    const sampleSpecial = specialRecipients.slice(0, 5).map(r => ({
      postal_code: r.postal_code,
      city: r.city,
      location_type: r.location_type,
    }));

    // ── Matrix-Prüfung ────────────────────────────────────────────────────
    let matrix = null;
    if (run_matrix && active.length > 0) {
      matrix = [];
      for (const center of MATRIX_CENTERS) {
        const row = { center: center.name, lat: center.lat, lng: center.lng, radii: {} };
        for (const radius of MATRIX_RADII) {
          const inRadius = active.filter(r => {
            if (!r.lat || !r.lng) return false;
            return haversineKm(center.lat, center.lng, r.lat, r.lng) <= radius;
          });
          row.radii[`${radius}km`] = {
            count: inRadius.length,
            sample: inRadius.slice(0, 3).map(r => `${r.postal_code} ${r.city}`),
          };
        }
        matrix.push(row);
      }
    }

    // ── Fehlende Koordinaten ──────────────────────────────────────────────
    const missingCoords = active.filter(r => !r.lat || !r.lng || r.lat === 0 || r.lng === 0).length;
    const missingPostal = active.filter(r => !r.postal_code).length;

    return Response.json({
      success: true,
      audit: {
        total_records: total,
        active_records: active.length,
        inactive_records: inactive.length,
        special_recipient_records: specialRecipients.length,
        states_count: statesSet.size,
        postal_codes_count: postalCodesSet.size,
        cities_count: citiesSet.size,
        duplicate_count: duplicateCount,
        duplicate_examples: duplicateKeys.slice(0, 5).map(([key, count]) => ({ key, count })),
        missing_coords: missingCoords,
        missing_postal: missingPostal,
        quality_distribution: qualityBuckets,
        state_distribution: stateSorted,
        sample_cities: sampleEntries,
        sample_inactive: sampleInactive,
        sample_special_recipients: sampleSpecial,
      },
      matrix: matrix || 'matrix nicht berechnet (run_matrix=false)',
      generated_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[auditLocationIndex] FEHLER:', error?.message);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});