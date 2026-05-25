/**
 * syncOpenRegister – Phase B
 *
 * Ruft echte OpenRegister-Daten ab, normalisiert und speichert sie in ExternalCompanySource.
 * Erstellt KEINE Companies/Leads.
 *
 * Flow:
 *   OpenRegister API → Normalisierung → Dedupe (ExternalCompanySource + Company) → ExternalCompanySource speichern
 *
 * dry_run=true  → API wird getestet, normalisierter Preview zurück, NICHTS gespeichert
 * dry_run=false → echte Treffer werden gespeichert (kein Fake/Simulation)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ── NORMALISIERUNG ────────────────────────────────────────────────────────────

function normStr(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeOpenRegisterItem(item, fallbackCity) {
  const sourceId = item.company_id || item.id || item.register_number || item.slug || null;
  const companyName = (item.name || item.company_name || item.current_name || '').trim();
  const city = (item.city || item.location || fallbackCity || '').trim();
  const address = (item.address || item.street || '').trim();
  const postalCode = (item.zip || item.postal_code || '').trim();
  const legalForm = (item.legal_form || '').trim();
  const registerNumber = (item.register_number || '').trim();
  const registerCourt = (item.register_court || '').trim();
  const incorporatedAt = item.incorporated_at || item.registration_date || null;

  const hasMissingData = !companyName;
  const matchStatus = hasMissingData ? 'missing_data' : 'imported';

  return {
    source_id: sourceId,
    company_name: companyName,
    legal_form: legalForm || null,
    city: city || null,
    address: address || null,
    postal_code: postalCode || null,
    register_number: registerNumber || null,
    register_court: registerCourt || null,
    registration_date: incorporatedAt ? new Date(incorporatedAt).toISOString() : null,
    raw_data: JSON.stringify(item),
    source_confidence: 70,
    match_status: matchStatus,
    enrichment_status: 'pending',
    radius_status: 'unknown_geo',
    geo_confidence: 'unknown',
    _hasMissingData: hasMissingData,
  };
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
  const OPENREGISTER_API_KEY = Deno.env.get('OPENREGISTER_API_KEY');

  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { organization_id, city, radius_km, since_date, legal_forms, limit, dry_run = true } = body;

    // ── Pflichtvalidierung ───────────────────────────────────────────────────
    if (!organization_id) return Response.json({ error: 'organization_id fehlt', success: false }, { status: 400 });
    if (!city || !String(city).trim()) return Response.json({ error: 'city fehlt', success: false }, { status: 400 });

    if (!OPENREGISTER_API_KEY) {
      return Response.json({ success: false, error: 'openregister_api_key_missing', message: 'OpenRegister ist noch nicht konfiguriert.' }, { status: 500 });
    }

    // ── Zugriff ──────────────────────────────────────────────────────────────
    if (!(await checkOrgAccess(base44, user, organization_id))) {
      return Response.json({ error: 'Forbidden', success: false }, { status: 403 });
    }

    // ── Parameter ────────────────────────────────────────────────────────────
    const resolvedCity = String(city).trim();
    const resolvedRadius = Math.min(Math.max(Number(radius_km || 25), 1), 100);
    const effectiveLimit = Math.min(Number(limit || 25), 50);
    const resolvedLegalForms = Array.isArray(legal_forms) && legal_forms.length
      ? legal_forms
      : ['GmbH', 'UG', 'GmbH & Co. KG'];
    const resolvedSinceDate = since_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    console.log(`[syncOpenRegister] START org=${organization_id} city=${resolvedCity} radius=${resolvedRadius}km limit=${effectiveLimit} dry_run=${dry_run}`);

    // ── OpenRegister API-Call ────────────────────────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let apiResponse;
    try {
      apiResponse = await fetch('https://api.openregister.de/v1/search/company', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENREGISTER_API_KEY}`,
        },
        body: JSON.stringify({
          query: { value: resolvedCity },
          filters: [
            { field: 'city', value: resolvedCity },
            { field: 'legal_form', values: resolvedLegalForms.map(lf => lf.toLowerCase()) },
            { field: 'incorporated_at', min: resolvedSinceDate },
          ],
          pagination: { per_page: effectiveLimit },
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return Response.json({ success: false, error: 'openregister_timeout', message: 'OpenRegister hat nicht rechtzeitig geantwortet. Bitte später erneut versuchen.' }, { status: 504 });
      }
      return Response.json({ success: false, error: 'openregister_api_failed', message: 'OpenRegister konnte aktuell nicht abgefragt werden. Bitte später erneut versuchen.' }, { status: 502 });
    }
    clearTimeout(timeoutId);

    if (!apiResponse.ok) {
      console.error(`[syncOpenRegister] API error status=${apiResponse.status}`);
      return Response.json({ success: false, error: 'openregister_api_failed', message: 'OpenRegister konnte aktuell nicht abgefragt werden. Bitte später erneut versuchen.' }, { status: 502 });
    }

    const searchData = await apiResponse.json();
    const rawItems = (searchData.results || searchData.data || searchData.companies || []).slice(0, effectiveLimit);
    console.log(`[syncOpenRegister] API returned ${rawItems.length} items`);

    // ── Normalisieren ────────────────────────────────────────────────────────
    const normalized = rawItems.map(item => normalizeOpenRegisterItem(item, resolvedCity));

    // ── Existierende Datensätze laden für Dedupe ─────────────────────────────
    const [existingSources, existingCompanies] = await Promise.all([
      base44.asServiceRole.entities.ExternalCompanySource.filter({ organization_id, source: 'openregister' }),
      base44.asServiceRole.entities.Company.filter({ organization_id }),
    ]);

    const sourceIdSet = new Set(existingSources.map(s => s.source_id).filter(Boolean));
    const sourceRegNumSet = new Set(existingSources.map(s => s.register_number).filter(Boolean));
    const sourceNameCitySet = new Set(existingSources.map(s => `${normStr(s.company_name)}__${normStr(s.city || '')}`));
    const companyNameCitySet = new Set(existingCompanies.map(c => `${normStr(c.name)}__${normStr(c.ort || '')}`));

    // ── Dedupe + Kategorisieren ──────────────────────────────────────────────
    let importedCount = 0, duplicateCount = 0, missingDataCount = 0, skippedCount = 0;
    const toSave = [];
    const preview = [];

    for (const item of normalized) {
      if (item._hasMissingData) {
        missingDataCount++;
        skippedCount++;
        if (preview.length < 10) preview.push({ company_name: item.company_name || '(leer)', city: item.city, match_status: 'missing_data', radius_status: item.radius_status, enrichment_status: item.enrichment_status });
        continue;
      }

      // Dedupe: ExternalCompanySource
      const isDupSource =
        (item.source_id && sourceIdSet.has(item.source_id)) ||
        (item.register_number && sourceRegNumSet.has(item.register_number)) ||
        sourceNameCitySet.has(`${normStr(item.company_name)}__${normStr(item.city || '')}`);

      // Dedupe: Company
      const isDupCompany = companyNameCitySet.has(`${normStr(item.company_name)}__${normStr(item.city || '')}`);

      if (isDupSource || isDupCompany) {
        duplicateCount++;
        skippedCount++;
        if (preview.length < 10) preview.push({ company_name: item.company_name, city: item.city, match_status: 'duplicate', radius_status: item.radius_status, enrichment_status: item.enrichment_status });
        continue;
      }

      toSave.push(item);
      if (preview.length < 10) preview.push({ company_name: item.company_name, city: item.city, match_status: item.match_status, radius_status: item.radius_status, enrichment_status: item.enrichment_status });
    }

    // wouldImportCount = was dedupe-clean ist (für dry_run)
    const wouldImportCount = toSave.length;

    // ── Speichern (nur bei dry_run=false) ───────────────────────────────────
    let savedCount = 0;
    let saveErrorCount = 0;

    if (!dry_run && toSave.length > 0) {
      console.log(`[syncOpenRegister] Saving ${toSave.length} ExternalCompanySource entries`);
      for (const item of toSave) {
        try {
          await base44.asServiceRole.entities.ExternalCompanySource.create({
            organization_id,
            source: 'openregister',
            source_id: item.source_id || null,
            company_name: item.company_name,
            legal_form: item.legal_form || null,
            city: item.city || null,
            address: item.address || null,
            register_number: item.register_number || null,
            register_court: item.register_court || null,
            registration_date: item.registration_date || null,
            search_center_city: resolvedCity,
            radius_km: resolvedRadius,
            match_status: item.match_status,
            enrichment_status: 'pending',
            radius_status: 'unknown_geo',
            geo_confidence: 'unknown',
            source_confidence: item.source_confidence,
            raw_data: item.raw_data,
          });
          savedCount++;
        } catch (saveErr) {
          console.error(`[syncOpenRegister] Save error for "${item.company_name}":`, saveErr.message);
          saveErrorCount++;
        }
      }
      console.log(`[syncOpenRegister] DONE: saved=${savedCount} errors=${saveErrorCount} dup=${duplicateCount} missing=${missingDataCount}`);
    }

    // ── Response ─────────────────────────────────────────────────────────────
    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        source: 'openregister',
        city: resolvedCity,
        radius_km: resolvedRadius,
        limit: effectiveLimit,
        would_import_count: wouldImportCount,
        duplicate_count: duplicateCount,
        missing_data_count: missingDataCount,
        skipped_count: skippedCount,
        fetched_count: rawItems.length,
        preview,
        next_step: 'set_dry_run_false_to_save',
      });
    }

    return Response.json({
      success: true,
      dry_run: false,
      source: 'openregister',
      city: resolvedCity,
      radius_km: resolvedRadius,
      limit: effectiveLimit,
      summary: {
        fetched_count: rawItems.length,
        would_import_count: wouldImportCount,
        saved_count: savedCount,
        save_error_count: saveErrorCount,
        duplicate_count: duplicateCount,
        missing_data_count: missingDataCount,
        skipped_count: skippedCount,
      },
      preview,
      next_step: 'google_matching_required',
    });

  } catch (error) {
    console.error('[syncOpenRegister] Unexpected error:', error.message);
    return Response.json({ success: false, error: 'internal_error', message: 'Interner Fehler. Bitte Support kontaktieren.' }, { status: 500 });
  }
});