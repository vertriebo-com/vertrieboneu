/**
 * auditLocationIndex
 * ==================
 * Vollständiger Audit-Report für importierte LocationIndex-Daten.
 * Lädt ALLE Einträge paginiert (korrekt auch bei >2000 Einträgen).
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

const MATRIX_CENTERS = [
  { name: 'Berlin (Großstadt)',       lat: 52.520,  lng: 13.405 },
  { name: 'Köln (Großstadt)',         lat: 50.938,  lng: 6.960  },
  { name: 'Koblenz (Kreisstadt)',     lat: 50.356,  lng: 7.589  },
  { name: 'Hof/Saale (ländlich)',     lat: 50.312,  lng: 11.912 },
  { name: 'Flensburg (Grenzgebiet)', lat: 54.794,  lng: 9.434  },
];
const MATRIX_RADII = [5, 10, 25, 50, 100];

// Alle Einträge paginiert laden mit ID-Dedupe
// Base44 .list(sort, limit, skip) — skip ist 0-basierter Offset
async function loadAll(base44) {
  const seenIds = new Set();
  const all = [];
  const PAGE_SIZE = 2000;
  const MAX_PAGES = 25; // Max 50.000 Einträge

  for (let p = 0; p < MAX_PAGES; p++) {
    const skip = p * PAGE_SIZE;
    const batch = await base44.asServiceRole.entities.LocationIndex.list('-created_date', PAGE_SIZE, skip);
    for (const r of batch) { if (!seenIds.has(r.id)) { seenIds.add(r.id); all.push(r); } }
    console.info(`[auditLocationIndex] Seite ${p + 1}: ${batch.length} Einträge (gesamt: ${all.length})`);
    if (batch.length < PAGE_SIZE) break;
  }

  console.info(`[auditLocationIndex] Geladen: ${all.length} Einträge total`);
  return all;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin-only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { run_matrix = true } = body;

    // ── Alle Einträge laden ───────────────────────────────────────────────
    const allRecords = await loadAll(base44);
    const total = allRecords.length;

    // Boolean-safe Filterung
    const active = allRecords.filter(r =>
      (r.is_active === true || r.is_active === 'true' || r.is_active === 1) &&
      r.location_type !== 'special_postal_recipient'
    );
    const inactive = allRecords.filter(r =>
      r.is_active === false || r.is_active === 'false' || r.is_active === 0
    );
    const specialRecipients = allRecords.filter(r => r.location_type === 'special_postal_recipient');

    console.info(`[auditLocationIndex] total=${total} active=${active.length} inactive=${inactive.length} special=${specialRecipients.length}`);

    // ── Eindeutige Zählungen (auf aktiven Einträgen) ───────────────────────
    const statesSet = new Set(active.map(r => r.state_code).filter(Boolean));
    const postalCodesSet = new Set(active.map(r => r.postal_code).filter(Boolean));
    const citiesSet = new Set(active.map(r => r.normalized_name || (r.city || '').toLowerCase()).filter(Boolean));

    // ── Duplikate erkennen (composite key) ────────────────────────────────
    // Duplikat = gleiche country_code+postal_code+normalized_name+state_code Kombination
    const dedupeMap = {};
    for (const r of allRecords) {
      const key = `${r.country_code || 'DE'}|${r.postal_code || ''}|${r.normalized_name || (r.city || '').toLowerCase()}|${r.state_code || ''}`;
      dedupeMap[key] = (dedupeMap[key] || 0) + 1;
    }
    const duplicateEntries = Object.entries(dedupeMap).filter(([, count]) => count > 1);
    const duplicateCount = duplicateEntries.reduce((sum, [, count]) => sum + (count - 1), 0);

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
    // Sonderfaelle: Jungholz (state_code='', oesterr. Exklave) + Schneefernerhaus (state_code='02', GeoNames-Fehler)
    // states_count=17 erklaerung: 16 echte DE-Bundeslaender + 1 Sondergruppe (leer/nicht-ISO-2)
    const emptyStateCodes = active.filter(r => !r.state_code || r.state_code === '');
    const nonIsoStateCodes = active.filter(r => r.state_code && (r.state_code.length !== 2 || !/^[A-Z]{2}$/.test(r.state_code)));
    const specialStateEntries = [
      ...emptyStateCodes.slice(0, 3).map(r => ({ postal_code: r.postal_code, city: r.city, state_code: '(leer)', note: 'Exklave/Sonderfall ohne DE-Bundesland' })),
      ...nonIsoStateCodes.slice(0, 3).map(r => ({ postal_code: r.postal_code, city: r.city, state_code: r.state_code, note: 'Nicht-ISO-2-state_code (GeoNames-Datenfehler)' })),
    ];

    const stateDistrib = {};
    for (const r of active) {
      const sk = r.state_code || '(kein BL)';
      const isStandard = !!(r.state_code && r.state_code.length === 2 && /^[A-Z]{2}$/.test(r.state_code));
      if (!stateDistrib[sk]) stateDistrib[sk] = { count: 0, state: r.state || sk, is_standard: isStandard };
      stateDistrib[sk].count++;
    }
    const stateSorted = Object.entries(stateDistrib)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([code, v]) => ({ state_code: code, state: v.state, count: v.count, is_standard_de_bundesland: v.is_standard }));

    // ── Sample Einträge ────────────────────────────────────────────────────
    const sampleCities = ['koblenz', 'neuwied', 'bendorf', 'köln', 'koeln', 'berlin', 'münchen', 'muenchen'];
    const sampleEntries = active
      .filter(r => sampleCities.some(c =>
        (r.normalized_name || '').includes(c) || (r.city || '').toLowerCase().includes(c)
      ))
      .slice(0, 20)
      .map(r => ({
        postal_code: r.postal_code, city: r.city, state_code: r.state_code,
        lat: r.lat, lng: r.lng, quality_score: r.quality_score, location_type: r.location_type,
      }));

    const sampleInactive = inactive.slice(0, 10).map(r => ({
      postal_code: r.postal_code, city: r.city, location_type: r.location_type,
      filter_reasons: r.filter_reasons, is_active: r.is_active,
    }));

    const sampleSpecial = specialRecipients.slice(0, 5).map(r => ({
      postal_code: r.postal_code, city: r.city, location_type: r.location_type,
    }));

    // ── Fehlende Koordinaten / PLZ ─────────────────────────────────────────
    const missingCoords = active.filter(r => !r.lat || !r.lng || r.lat === 0 || r.lng === 0).length;
    const missingPostal = active.filter(r => !r.postal_code).length;

    // ── Matrix-Prüfung ─────────────────────────────────────────────────────
    // Deduplizierte aktive Einträge für Matrix-Berechnung
    const compositeSeenKeys = new Set();
    const dedupedActive = active.filter(r => {
      if (!r.lat || !r.lng || r.lat === 0 || r.lng === 0) return false;
      const key = `${r.country_code || 'DE'}|${r.postal_code || ''}|${r.normalized_name || (r.city || '').toLowerCase()}|${r.state_code || ''}`;
      if (compositeSeenKeys.has(key)) return false;
      compositeSeenKeys.add(key);
      return true;
    });

    let matrix = null;
    if (run_matrix && dedupedActive.length > 0) {
      matrix = [];
      for (const center of MATRIX_CENTERS) {
        const row = {
          center: center.name,
          lat: center.lat,
          lng: center.lng,
          radii: {},
        };
        for (const radius of MATRIX_RADII) {
          const inRadius = dedupedActive.filter(r =>
            haversineKm(center.lat, center.lng, r.lat, r.lng) <= radius
          );
          // Max-Distanz der gefundenen Einträge
          const maxDist = inRadius.length > 0
            ? Math.max(...inRadius.map(r => haversineKm(center.lat, center.lng, r.lat, r.lng)))
            : 0;
          row.radii[`${radius}km`] = {
            count: inRadius.length,
            max_dist_km: Math.round(maxDist * 10) / 10,
            unique_plz: new Set(inRadius.map(r => r.postal_code)).size,
            unique_cities: new Set(inRadius.map(r => r.city)).size,
            sample: inRadius.slice(0, 3).map(r => `${r.postal_code} ${r.city}`),
            status: inRadius.length === 0 ? '⚠️ LEER' : '✅ OK',
          };
        }
        matrix.push(row);
      }
    }

    // ── Plan-Matrix simulieren ─────────────────────────────────────────────
    // Zeigt wie viele Orte je Plan-Tier für Koblenz 25km verfügbar wären
    const planMatrixCenter = { lat: 50.356, lng: 7.589, name: 'Koblenz 25km' };
    const planMatrixRadius = 25;
    const planMatrixAll = dedupedActive
      .filter(r => haversineKm(planMatrixCenter.lat, planMatrixCenter.lng, r.lat, r.lng) <= planMatrixRadius)
      .sort((a, b) => {
        const da = haversineKm(planMatrixCenter.lat, planMatrixCenter.lng, a.lat, a.lng);
        const db = haversineKm(planMatrixCenter.lat, planMatrixCenter.lng, b.lat, b.lng);
        return da - db;
      });

    const planMatrix = {
      center: planMatrixCenter.name,
      total_in_radius: planMatrixAll.length,
      tiers: {
        'free_preview (max 3)':    planMatrixAll.slice(0, 3).map(r => `${r.postal_code} ${r.city}`),
        'verified_trial (max 5)':  planMatrixAll.slice(0, 5).map(r => `${r.postal_code} ${r.city}`),
        'starter (max 10)':        planMatrixAll.slice(0, 10).map(r => `${r.postal_code} ${r.city}`),
        'professional (max 25)':   planMatrixAll.slice(0, 25).map(r => `${r.postal_code} ${r.city}`),
        'gold (max 50)':           planMatrixAll.slice(0, 50).map(r => `${r.postal_code} ${r.city}`),
        'agency (unlimited)':      `${planMatrixAll.length} Orte verfügbar`,
      },
    };

    return Response.json({
      success: true,
      audit: {
        total_records: total,
        active_records: active.length,
        inactive_records: inactive.length,
        special_recipient_records: specialRecipients.length,
        deduped_active_records: dedupedActive.length,
        duplicate_count: duplicateCount,
        duplicate_examples: duplicateEntries.slice(0, 5).map(([key, count]) => ({ key, count })),
        states_count: statesSet.size,
        states_count_explanation: `${statesSet.size} = 16 echte DE-Bundeslaender + ${statesSet.size - 16} Sondergruppe (Exklave/GeoNames-Fehler)`,
        postal_codes_count: postalCodesSet.size,
        cities_count: citiesSet.size,
        missing_coords: missingCoords,
        missing_postal: missingPostal,
        quality_distribution: qualityBuckets,
        state_distribution: stateSorted,
        special_state_entries: specialStateEntries,
        sample_cities: sampleEntries,
        sample_inactive: sampleInactive,
        sample_special_recipients: sampleSpecial,
      },
      matrix: matrix || 'matrix nicht berechnet (run_matrix=false)',
      plan_matrix: planMatrix,
      generated_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[auditLocationIndex] FEHLER:', error?.message);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});