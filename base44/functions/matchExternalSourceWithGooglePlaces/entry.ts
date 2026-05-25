/**
 * matchExternalSourceWithGooglePlaces – OpenRegister Phase C
 *
 * Liest ExternalCompanySource-Einträge (source=openregister, enrichment_status=pending),
 * sucht sie bei Google Places, bewertet den Match, ergänzt Geo/Website/Telefon/PlaceId
 * und setzt enrichment_status + radius_status.
 *
 * Erstellt KEINE Companies/Leads.
 *
 * Flow:
 *   ExternalCompanySource (pending) → Google Places Text Search → Match-Score →
 *   Radius-Check → Update ExternalCompanySource
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

// ── HELPERS ───────────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function normStr(s) {
  return String(s || '').toLowerCase().replace(/[äöüß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c])).replace(/[^a-z0-9]/g, '');
}

// Berechnet Match-Confidence (0–100) zwischen OpenRegister-Name und Google-Result
function calcMatchConfidence(sourceEntry, googlePlace) {
  const sourceName = normStr(sourceEntry.company_name);
  const googleName = normStr(googlePlace.name || '');

  let score = 0;

  // Namens-Ähnlichkeit (wichtigstes Signal)
  if (sourceName === googleName) {
    score += 60;
  } else if (googleName.includes(sourceName) || sourceName.includes(googleName)) {
    score += 40;
  } else {
    // Wort-Overlap
    const sourceWords = sourceName.split(/\s+/).filter(w => w.length > 3);
    const googleWords = googleName.split(/\s+/).filter(w => w.length > 3);
    const overlap = sourceWords.filter(w => googleWords.includes(w)).length;
    const overlapRatio = sourceWords.length > 0 ? overlap / sourceWords.length : 0;
    score += Math.round(overlapRatio * 35);
  }

  // Stadt-Match
  const sourceCity = normStr(sourceEntry.city || '');
  const googleAddress = normStr(googlePlace.formattedAddress || '');
  if (sourceCity && googleAddress.includes(sourceCity)) {
    score += 20;
  }

  // Rechtsform-Match im Google-Namen
  const legalForm = normStr(sourceEntry.legal_form || '');
  if (legalForm && (googleName.includes(normStr(legalForm)) || googleAddress.includes(normStr(legalForm)))) {
    score += 10;
  }

  // Telefon/Website vorhanden → Bonus für Datenvollständigkeit (nicht Match-Signal)
  if (googlePlace.nationalPhoneNumber) score += 5;
  if (googlePlace.websiteUri) score += 5;

  return Math.min(100, score);
}

// ── GOOGLE PLACES TEXT SEARCH (New API) ───────────────────────────────────────

async function searchGooglePlaces(companyName, city, apiCounters) {
  const query = `${companyName} ${city || ''}`.trim();
  apiCounters.textSearch++;

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.websiteUri,places.types',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'de',
      maxResultCount: 3,
    }),
  });

  if (!res.ok) {
    console.warn(`[matchGP] Google Places error ${res.status} for "${query}"`);
    return [];
  }

  const data = await res.json();
  return (data.places || []).map(p => ({
    place_id: p.id,
    name: p.displayName?.text || '',
    formattedAddress: p.formattedAddress || '',
    lat: p.location?.latitude || null,
    lng: p.location?.longitude || null,
    phone: p.nationalPhoneNumber || null,
    website: p.websiteUri || null,
    types: p.types || [],
  }));
}

// ── ACCESS CHECK ─────────────────────────────────────────────────────────────

async function checkOrgAccess(base44, user, organizationId) {
  if (!user) return false;
  if (['admin', 'platform_owner', 'platform_admin'].includes(user.role)) return true;
  const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organizationId });
  const org = orgs[0];
  if (!org) return false;
  if (org.owner_email === user.email) return true;
  const members = await base44.asServiceRole.entities.OrganizationMember.filter({
    organization_id: organizationId,
    user_email: user.email,
    status: 'active',
  });
  return members.some(m => ['organization_admin', 'sales_rep'].includes(m.role));
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      organization_id,
      limit = 10,         // Wie viele pending-Einträge pro Lauf verarbeiten
      dry_run = true,     // true = nur analysieren, nichts schreiben
      min_confidence = 50, // Unter diesem Score → needs_review statt matched
    } = body;

    if (!organization_id) return Response.json({ error: 'organization_id fehlt', success: false }, { status: 400 });

    if (!GOOGLE_PLACES_API_KEY) {
      return Response.json({ success: false, error: 'google_places_api_key_missing', message: 'Google Places API nicht konfiguriert.' }, { status: 500 });
    }

    if (!(await checkOrgAccess(base44, user, organization_id))) {
      return Response.json({ error: 'Forbidden', success: false }, { status: 403 });
    }

    const effectiveLimit = Math.min(Number(limit), 25); // max 25 pro Lauf (API-Kosten)

    // ── Pending-Einträge laden ────────────────────────────────────────────────
    const pendingEntries = await base44.asServiceRole.entities.ExternalCompanySource.filter(
      { organization_id, source: 'openregister', enrichment_status: 'pending' },
      '-created_date',
      effectiveLimit
    );

    console.log(`[matchGP] org=${organization_id} pending=${pendingEntries.length} limit=${effectiveLimit} dry_run=${dry_run}`);

    if (pendingEntries.length === 0) {
      return Response.json({
        success: true,
        dry_run,
        organization_id,
        message: 'Keine pending ExternalCompanySource-Einträge gefunden.',
        processed_count: 0,
        matched_count: 0,
        needs_review_count: 0,
        no_result_count: 0,
      });
    }

    // ── Suchzentrum für Radius-Check ─────────────────────────────────────────
    // Nehme die search_center_city des ersten Eintrags für Geocoding
    const searchCenterCity = pendingEntries[0]?.search_center_city || pendingEntries[0]?.city || '';
    let centerCoords = null;

    if (searchCenterCity) {
      try {
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchCenterCity + ' Deutschland')}&key=${GOOGLE_PLACES_API_KEY}&language=de`
        );
        const geoData = await geoRes.json();
        if (geoData.results?.[0]?.geometry?.location) {
          centerCoords = geoData.results[0].geometry.location;
        }
      } catch (e) {
        console.warn(`[matchGP] Geocoding für "${searchCenterCity}" fehlgeschlagen:`, e.message);
      }
    }

    const radiusKm = pendingEntries[0]?.radius_km || 25;
    console.log(`[matchGP] Suchzentrum: ${searchCenterCity} → ${centerCoords ? `${centerCoords.lat},${centerCoords.lng}` : 'unbekannt'} radius=${radiusKm}km`);

    // ── Matching-Loop ─────────────────────────────────────────────────────────
    const apiCounters = { textSearch: 0, geocoding: centerCoords !== null ? 1 : 0 };
    const results = [];
    let matchedCount = 0, needsReviewCount = 0, noResultCount = 0, savedCount = 0;

    for (const entry of pendingEntries) {
      const places = await searchGooglePlaces(entry.company_name, entry.city, apiCounters);

      if (places.length === 0) {
        noResultCount++;
        // Kein Google-Treffer → wirklich failed
        const update = {
          enrichment_status: 'failed',
          match_status: 'imported', // zurück auf Ausgangsstatus, kein Match möglich
        };
        if (!dry_run) {
          await base44.asServiceRole.entities.ExternalCompanySource.update(entry.id, update);
          savedCount++;
        }
        results.push({ id: entry.id, company_name: entry.company_name, enrichment_status: 'failed', match_status: 'imported', match_confidence: 0, google_place_id: null });
        continue;
      }

      // Besten Kandidaten wählen (höchste Confidence)
      let bestPlace = null;
      let bestConfidence = 0;

      for (const place of places) {
        const conf = calcMatchConfidence(entry, place);
        if (conf > bestConfidence) {
          bestConfidence = conf;
          bestPlace = place;
        }
      }

      // Radius-Check
      let radiusStatus = 'unknown_geo';
      let distanceKm = null;

      if (bestPlace?.lat && bestPlace?.lng && centerCoords) {
        distanceKm = Math.round(haversineKm(centerCoords.lat, centerCoords.lng, bestPlace.lat, bestPlace.lng) * 10) / 10;
        radiusStatus = distanceKm <= radiusKm * 1.05 ? 'inside_radius' : 'outside_radius';
      }

      // Enrichment-Status nach Confidence + Radius
      //
      // Logik:
      //   confidence >= min_confidence + inside_radius  → enriched / ready_for_review
      //   confidence >= min_confidence + outside_radius → enriched / outside_radius
      //   confidence < min_confidence  (aber Treffer da) → needs_review / needs_review
      //   kein Google-Treffer                           → failed / imported  (oben)
      let enrichmentStatus;
      let matchStatus;

      if (bestConfidence >= min_confidence) {
        enrichmentStatus = 'enriched';
        matchStatus = radiusStatus === 'outside_radius' ? 'outside_radius' : 'ready_for_review';
        matchedCount++;
      } else {
        // Treffer vorhanden, aber Confidence zu niedrig → nicht wegwerfen
        enrichmentStatus = 'needs_review';
        matchStatus = 'needs_review';
        needsReviewCount++;
      }

      const update = {
        google_place_id: bestPlace.place_id,
        lat: bestPlace.lat,
        lng: bestPlace.lng,
        distance_km: distanceKm,
        radius_status: radiusStatus,
        enrichment_status: enrichmentStatus,
        match_status: matchStatus,
        enrichment_confidence: bestConfidence,
        // Kontaktdaten ergänzen falls vorhanden
        ...(bestPlace.phone ? { address: entry.address || null } : {}), // address bleibt, phone wird separat behandelt
        local_match_score: bestConfidence,
      };

      // Phone/Website in raw_data ergänzen (ExternalCompanySource hat kein phone-Feld direkt)
      // Speichere via raw_data-Erweiterung
      let enrichedRawData = null;
      try {
        const raw = JSON.parse(entry.raw_data || '{}');
        raw._google_match = {
          place_id: bestPlace.place_id,
          name: bestPlace.name,
          address: bestPlace.formattedAddress,
          phone: bestPlace.phone || null,
          website: bestPlace.website || null,
          confidence: bestConfidence,
          distance_km: distanceKm,
          matched_at: new Date().toISOString(),
        };
        enrichedRawData = JSON.stringify(raw);
      } catch {
        enrichedRawData = entry.raw_data;
      }

      if (enrichedRawData) update.raw_data = enrichedRawData;

      if (!dry_run) {
        await base44.asServiceRole.entities.ExternalCompanySource.update(entry.id, update);
        savedCount++;
      }

      results.push({
        id: entry.id,
        company_name: entry.company_name,
        city: entry.city,
        google_place_id: bestPlace.place_id,
        google_name: bestPlace.name,
        google_address: bestPlace.formattedAddress,
        phone: bestPlace.phone,
        website: bestPlace.website,
        lat: bestPlace.lat,
        lng: bestPlace.lng,
        distance_km: distanceKm,
        radius_status: radiusStatus,
        enrichment_status: enrichmentStatus,
        match_status: matchStatus,
        match_confidence: bestConfidence,
      });
    }

    console.log(`[matchGP] DONE: processed=${pendingEntries.length} matched=${matchedCount} needs_review=${needsReviewCount} no_result=${noResultCount} saved=${savedCount} textSearch=${apiCounters.textSearch}`);

    return Response.json({
      success: true,
      dry_run,
      organization_id,
      search_center: searchCenterCity,
      radius_km: radiusKm,
      summary: {
        processed_count: pendingEntries.length,
        matched_count: matchedCount,
        needs_review_count: needsReviewCount,
        no_result_count: noResultCount,
        saved_count: dry_run ? 0 : savedCount,
      },
      google_api_requests: apiCounters,
      results,
      next_step: dry_run ? 'set_dry_run_false_to_save' : 'promote_to_company_when_ready',
    });

  } catch (error) {
    console.error('[matchExternalSourceWithGooglePlaces] Error:', error.message);
    return Response.json({ success: false, error: 'internal_error', message: 'Interner Fehler.' }, { status: 500 });
  }
});