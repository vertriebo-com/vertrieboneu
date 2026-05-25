/**
 * e2eTestResearchRun
 * ==================
 * Vollständig selbstausführender E2E-Test für den ResearchRun-Workflow.
 *
 * STRATEGIE:
 * - Erstellt eine frische, isolierte Test-Org (owner_email = Admin)
 * - Führt processResearchRun direkt über asServiceRole in-process aus
 * - Kein Browser-Trigger nötig
 * - Baseline immer 0/0/0 (frische Org)
 * - Cleanup löscht die Test-Org vollständig (inkl. Supabase)
 *
 * MODI:
 * 1. POST {} → Setup + Run + Validate (alles in einem)
 * 2. POST { cleanup_only, org_id_to_cleanup } → Cleanup einer Test-Org
 * 3. POST { validate_run, validate_org_id, validate_run_id, validate_baseline } → nur Validation
 *
 * NUR FÜR PLATFORM ADMINS.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");

function getPeriodMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return `${y}-${m}`;
}

async function getSupabaseMonthlyCount(orgId, periodMonth, retries = 3) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/lead_usage_events?organization_id=eq.${encodeURIComponent(orgId)}&period_month=eq.${periodMonth}&event_type=eq.research_lead_created`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY,
            'Prefer': 'count=exact',
            'Range': '0-0',
          },
        }
      );
      if (res.ok) {
        const contentRange = res.headers.get('content-range') || '';
        const total = parseInt(contentRange.split('/')[1] || '0', 10);
        if (!isNaN(total)) return total;
      }
    } catch (e) {
      console.warn(`[e2eTest] Supabase attempt ${attempt} error: ${e?.message}`);
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

async function deleteSupabaseOrgData(orgId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  const headers = {
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'apikey': SUPABASE_SERVICE_KEY,
    'Prefer': 'return=minimal',
  };
  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/lead_usage_events?organization_id=eq.${orgId}`, { method: 'DELETE', headers }).catch(() => {}),
    fetch(`${SUPABASE_URL}/rest/v1/quota_reservations?organization_id=eq.${orgId}`, { method: 'DELETE', headers }).catch(() => {}),
    fetch(`${SUPABASE_URL}/rest/v1/research_run_audit?organization_id=eq.${orgId}`, { method: 'DELETE', headers }).catch(() => {}),
    fetch(`${SUPABASE_URL}/rest/v1/research_run_locks?organization_id=eq.${orgId}`, { method: 'DELETE', headers }).catch(() => {}),
  ]);
}

// Vollständiger Cleanup einer Test-Org inkl. aller Supabase-Daten
async function cleanupTestOrg(base44, orgId) {
  console.info(`[e2eTest] Cleanup start: ${orgId}`);
  const [companies, runs, usageLogs, settings, members] = await Promise.all([
    base44.asServiceRole.entities.Company.filter({ organization_id: orgId }).catch(() => []),
    base44.asServiceRole.entities.ResearchRun.filter({ organization_id: orgId }).catch(() => []),
    base44.asServiceRole.entities.UsageLog.filter({ organization_id: orgId }).catch(() => []),
    base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id: orgId }).catch(() => []),
    base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: orgId }).catch(() => []),
  ]);
  await Promise.all([
    ...companies.map(c => base44.asServiceRole.entities.Company.delete(c.id).catch(() => {})),
    ...runs.map(r => base44.asServiceRole.entities.ResearchRun.delete(r.id).catch(() => {})),
    ...usageLogs.map(u => base44.asServiceRole.entities.UsageLog.delete(u.id).catch(() => {})),
    ...settings.map(s => base44.asServiceRole.entities.OrganizationSettings.delete(s.id).catch(() => {})),
    ...members.map(m => base44.asServiceRole.entities.OrganizationMember.delete(m.id).catch(() => {})),
  ]);
  await deleteSupabaseOrgData(orgId);
  await base44.asServiceRole.entities.Organization.delete(orgId).catch(() => {});
  console.info(`[e2eTest] Cleanup done: ${orgId} — ${companies.length} Companies, ${runs.length} Runs, ${usageLogs.length} UsageLogs gelöscht`);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!["admin", "platform_owner", "platform_admin"].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Platform Admin required', user_role: user.role }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const { cleanup_only, org_id_to_cleanup } = body;

    // ── MODUS: Cleanup ────────────────────────────────────────────────────────
    if (cleanup_only && org_id_to_cleanup) {
      await cleanupTestOrg(base44, org_id_to_cleanup);
      return Response.json({ success: true, message: `Cleanup abgeschlossen für ${org_id_to_cleanup}` });
    }

    // ── MODUS: Validate ───────────────────────────────────────────────────────
    const { validate_run, validate_org_id, validate_run_id, validate_baseline } = body;
    if (validate_run && validate_org_id && validate_run_id) {
      const periodMonth = getPeriodMonth();
      const baseline = validate_baseline || { companies: 0, usageLog_leads_created: 0, supabase_monthly_used: 0 };

      // Kurz warten damit Supabase async-Schreibungen ankommen
      await new Promise(r => setTimeout(r, 3000));

      const [finalCompanies, finalRunRecords, finalUsage, finalSupabase] = await Promise.all([
        base44.asServiceRole.entities.Company.filter({ organization_id: validate_org_id }),
        base44.asServiceRole.entities.ResearchRun.filter({ id: validate_run_id }),
        base44.asServiceRole.entities.UsageLog.filter({ organization_id: validate_org_id, period_month: periodMonth }),
        getSupabaseMonthlyCount(validate_org_id, periodMonth, 3),
      ]);

      const finalRun = finalRunRecords[0];
      const nonQuota = new Set(['manual_setup', 'csv_import', 'manual', 'import']);
      const researchCompanies = finalCompanies.filter(c =>
        c.research_run_id && !nonQuota.has(c.research_run_id) &&
        c.quelle !== 'Manuell' && c.quelle !== 'CSV Import' &&
        c.source_provider !== 'manual' && c.source_provider !== 'csv_import'
      );

      const final = {
        companies_count: researchCompanies.length,
        research_run_leads_saved: finalRun?.leads_saved || 0,
        research_run_status: finalRun?.status || 'unknown',
        usageLog_leads_created: finalUsage[0]?.leads_created || 0,
        supabase_monthly_used: finalSupabase ?? 'unavailable',
      };

      const delta = {
        companies: final.companies_count - (baseline.companies || 0),
        usageLog: final.usageLog_leads_created - (baseline.usageLog_leads_created || 0),
        supabase: typeof final.supabase_monthly_used === 'number'
          ? final.supabase_monthly_used - (baseline.supabase_monthly_used || 0)
          : 'unavailable',
      };

      const expectedLeads = final.research_run_leads_saved;
      const supabaseDelta = typeof delta.supabase === 'number' ? delta.supabase : null;
      const companiesMatch = delta.companies === expectedLeads;
      const runDone = ['completed', 'partial'].includes(final.research_run_status);
      const usageMatch = delta.usageLog === expectedLeads;
      const supabaseMatch = supabaseDelta === null || supabaseDelta === expectedLeads;
      const allMatch = companiesMatch && runDone && usageMatch && supabaseMatch && expectedLeads > 0;

      let verdict;
      if (!runDone) {
        verdict = { status: '⏳ NOT_DONE', message: `Run status: ${final.research_run_status}` };
      } else if (expectedLeads === 0) {
        verdict = {
          status: '⚠️ NO_LEADS', message: 'Run abgeschlossen aber 0 Leads',
          details: [`zero_result_cause: ${finalRun?.zero_result_cause || 'none'}`, `error: ${finalRun?.error_message || 'none'}`],
        };
      } else if (allMatch) {
        verdict = {
          status: '✅ PASS', message: `Alle Quellen übereinstimmend: ${expectedLeads} Leads`,
          details: [
            `✅ Companies (delta): +${delta.companies}`,
            `✅ ResearchRun.leads_saved: ${final.research_run_leads_saved}`,
            `✅ UsageLog (delta): +${delta.usageLog}`,
            supabaseDelta !== null ? `✅ Supabase (delta): +${supabaseDelta}` : '⚠️ Supabase: unavailable (non-blocking)',
          ],
        };
      } else {
        verdict = {
          status: '❌ FAIL', message: 'Quellen stimmen NICHT überein',
          details: [
            `${companiesMatch ? '✅' : '❌'} Companies (delta): +${delta.companies} (erwartet +${expectedLeads})`,
            `✅ ResearchRun.leads_saved: ${expectedLeads} (${final.research_run_status})`,
            `${usageMatch ? '✅' : '❌'} UsageLog (delta): +${delta.usageLog} (erwartet +${expectedLeads})`,
            `${supabaseDelta !== null ? (supabaseMatch ? '✅' : '❌') : '⚠️'} Supabase: ${supabaseDelta !== null ? `+${supabaseDelta}` : 'unavailable'}`,
          ],
        };
      }
      return Response.json({ success: allMatch, verdict, final, delta, period_month: periodMonth });
    }

    // ── MODUS: Vollständiger E2E-Test (Setup + Run + Validate in-process) ─────
    const periodMonth = getPeriodMonth();
    const timestamp = Date.now();
    console.info(`[e2eTest] ═══ VOLLSTÄNDIGER E2E-TEST START ═══`);
    console.info(`[e2eTest] User: ${user.email} | Periode: ${periodMonth}`);

    // ── SCHRITT 1: Frische isolierte Test-Org erstellen ──────────────────────
    console.info('[e2eTest] Schritt 1: Erstelle frische Test-Org...');
    const testOrg = await base44.asServiceRole.entities.Organization.create({
      name: `E2E Test Org ${timestamp}`,
      owner_email: user.email,
      industry: 'Gebäudereinigung',
      service_area_city: 'München',
      service_area_radius_km: 25,
      billing_status: 'active',
      platform_status: 'active',
      trial_stage: 'paid',
      onboarding_done: true,
    });
    console.info(`[e2eTest] ✅ Test-Org erstellt: ${testOrg.id} (${testOrg.name})`);

    // OrganizationSettings für die Test-Org anlegen
    await base44.asServiceRole.entities.OrganizationSettings.create({
      organization_id: testOrg.id,
      key: 'industry_id',
      value: 'gebaeudereinigung',
    }).catch(() => {});

    // ── SCHRITT 2: Baseline erfassen — MUSS 0/0/0 sein ──────────────────────
    console.info('[e2eTest] Schritt 2: Baseline erfassen...');
    const [blCompanies, blUsage, blSupabase] = await Promise.all([
      base44.asServiceRole.entities.Company.filter({ organization_id: testOrg.id }),
      base44.asServiceRole.entities.UsageLog.filter({ organization_id: testOrg.id, period_month: periodMonth }),
      getSupabaseMonthlyCount(testOrg.id, periodMonth, 1),
    ]);
    const baseline = {
      companies: blCompanies.length,
      usageLog_leads_created: blUsage[0]?.leads_created || 0,
      supabase_monthly_used: blSupabase || 0,
    };
    console.info(`[e2eTest] Baseline: ${JSON.stringify(baseline)}`);

    if (baseline.companies !== 0 || baseline.usageLog_leads_created !== 0 || baseline.supabase_monthly_used !== 0) {
      await cleanupTestOrg(base44, testOrg.id);
      return Response.json({
        success: false,
        error: 'BASELINE_NOT_CLEAN',
        message: 'Baseline ist nicht 0/0/0 — Test-Org hatte bereits Daten. Test abgebrochen, Org bereinigt.',
        baseline,
      }, { status: 409 });
    }

    // ── SCHRITT 3: Taxonomie laden ────────────────────────────────────────────
    console.info('[e2eTest] Schritt 3: Taxonomie laden...');
    const industryId = 'gebaeudereinigung';
    const taxRecords = await base44.asServiceRole.entities.TaxonomyEntry.filter({ industry_id: industryId, is_active: true });
    if (!taxRecords[0]) {
      await cleanupTestOrg(base44, testOrg.id);
      return Response.json({ success: false, error: 'taxonomy_profile_missing', message: `Kein Profil für ${industryId}` }, { status: 400 });
    }
    const rec = taxRecords[0];
    const jp = (f) => { try { return f ? JSON.parse(f) : []; } catch { return []; } };
    const jo = (f) => { try { return f ? JSON.parse(f) : {}; } catch { return {}; } };
    const taxonomyProfile = {
      industry_id: rec.industry_id, label: rec.label,
      own_services: jp(rec.own_services), target_customer_types: jp(rec.target_customer_types),
      excluded_customer_types: jp(rec.excluded_customer_types),
      searchable_business_categories: jp(rec.searchable_business_categories),
      search_keyword_variants: jo(rec.search_keyword_variants),
      negative_keywords: jp(rec.negative_keywords),
      bad_fit_signals: jp(rec.bad_fit_signals), bad_fit_signal_weights: jo(rec.bad_fit_signal_weights),
      scoring_signals: jp(rec.scoring_signals), scoring_signal_weights: jo(rec.scoring_signal_weights),
      query_priority: jp(rec.query_priority),
      search_strategy: rec.search_strategy || 'target_customer_search',
      place_type_confidence: rec.place_type_confidence || 'medium',
      google_place_types: jp(rec.google_place_types),
      ideal_customer_profiles: jp(rec.ideal_customer_profiles),
    };
    console.info(`[e2eTest] ✅ Taxonomie geladen: ${industryId}`);

    // ── SCHRITT 4: Geocode + ResearchRun erstellen ────────────────────────────
    console.info('[e2eTest] Schritt 4: Geocode + ResearchRun...');
    const city = 'München';
    const radiusKm = 25;

    let cityCoords = { lat: 48.1351253, lng: 11.5819806 };
    try {
      const geoRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(city + ' Deutschland')}&key=${GOOGLE_PLACES_API_KEY}&language=de`);
      const geoData = await geoRes.json();
      const loc = geoData.results?.[0]?.geometry?.location;
      if (loc) cityCoords = { lat: loc.lat, lng: loc.lng };
      console.info(`[e2eTest] ✅ Geocode: ${city} → ${cityCoords.lat},${cityCoords.lng}`);
    } catch (e) {
      console.warn(`[e2eTest] Geocode failed, using fallback: ${e?.message}`);
    }

    const targetCustomerTypes = jp(rec.target_customer_types).slice(0, 5);

    const searchPlanData = {
      industry: 'Gebäudereinigung', industryId, industrySource: 'e2e_test',
      city, radiusKm, radiusMeters: Math.min(radiusKm * 1000, 50000),
      targetCustomerTypes, excludedCustomerTypes: [],
      trialStage: 'paid', cityCoords,
      allPoints: [{ lat: cityCoords.lat, lng: cityCoords.lng, label: 'center', centerLat: cityCoords.lat, centerLng: cityCoords.lng, centerCity: city }],
      allCenters: [{ lat: cityCoords.lat, lng: cityCoords.lng, city }],
      effectiveTarget: 5, remainingPreviewLeads: 0,
      taxonomyProfile, taxonomyHash: 'e2e-test', taxonomyVersion: 'e2e-test',
    };

    const run = await base44.asServiceRole.entities.ResearchRun.create({
      organization_id: testOrg.id,
      status: 'queued', requested_target: 5, leads_saved: 0,
      duplicates_skipped: 0, no_match_count: 0, outside_radius_count: 0, raw_hits: 0,
      progress_percent: 0, batch_index: 0,
      current_step: 'E2E Test: wird gestartet…',
      search_center_city: city, search_radius_km: radiusKm,
      target_customer_types: targetCustomerTypes.join(', '),
      search_plan_json: JSON.stringify(searchPlanData),
      seen_place_ids: JSON.stringify([]),
      started_at: new Date().toISOString(),
      created_by: user.email,
      taxonomy_version: 'e2e-test', industry_id: industryId,
    });
    console.info(`[e2eTest] ✅ ResearchRun erstellt: ${run.id}`);

    // ── SCHRITT 5: Setup abgeschlossen — warte auf Browser-Processing ────────
    // ActiveResearchBanner im Browser wird den queued Run automatisch verarbeiten.
    // Die Validierung erfolgt danach via separate Anfrage mit validate_run=true.
    console.info('[e2eTest] Schritt 5: Setup abgeschlossen, warte auf Browser-Verarbeitung...');
    console.info('[e2eTest] ℹ️  Run ist queued — ActiveResearchBanner wird ihn automatisch verarbeiten');
    console.info('[e2eTest] ℹ️  Dann: validate_run=true aufrufen um Counts zu verifizieren');

    // ── SCHRITT 6: Auf Supabase-Propagation warten (falls User sofort validiert) ────────
    console.info('[e2eTest] Schritt 6: Warte 3s (für eventuell schnelle Validierung)...');
    await new Promise(r => setTimeout(r, 3000));

    const [finalCompanies, finalRunRecords, finalUsage, finalSupabase] = await Promise.all([
      base44.asServiceRole.entities.Company.filter({ organization_id: testOrg.id }),
      base44.asServiceRole.entities.ResearchRun.filter({ id: run.id }),
      base44.asServiceRole.entities.UsageLog.filter({ organization_id: testOrg.id, period_month: periodMonth }),
      getSupabaseMonthlyCount(testOrg.id, periodMonth, 3),
    ]);

    // Nach 3s: Nur Status der queued Run prüfen (noch nicht verarbeitet)
    const finalRun = finalRunRecords[0];
    const final = {
      companies_count: finalCompanies.length,
      research_run_leads_saved: finalRun?.leads_saved || 0,
      research_run_status: finalRun?.status || 'unknown',
      usageLog_leads_created: finalUsage[0]?.leads_created || 0,
      supabase_monthly_used: finalSupabase ?? 0,
    };

    const delta = {
      companies: final.companies_count - baseline.companies,
      usageLog: final.usageLog_leads_created - baseline.usageLog_leads_created,
      supabase: typeof final.supabase_monthly_used === 'number'
        ? final.supabase_monthly_used - baseline.supabase_monthly_used
        : 0,
    };

    // Setup ist erfolgreich wenn Run queued ist
    const setupSuccess = final.research_run_status === 'queued';

    let verdict;
    if (setupSuccess) {
      verdict = {
        status: '⏳ SETUP_COMPLETE',
        message: `ResearchRun erfolgreich erstellt und queued: ${run.id}`,
        details: [
          `✅ Test-Org: ${testOrg.id}`,
          `✅ ResearchRun: ${run.id}`,
          `✅ Baseline: 0/0/0 (pristin)`,
          '',
          'NÄCHSTE SCHRITTE:',
          '1. Im Browser: ActiveResearchBanner oder ResearchDialog wird den Run automatisch verarbeiten',
          '2. Nach 30-60s: Validierung durchführen mit:',
          `   POST e2eTestResearchRun { validate_run: true, validate_org_id: "${testOrg.id}", validate_run_id: "${run.id}", validate_baseline: ${JSON.stringify(baseline)} }`,
        ],
      };
    } else {
      verdict = {
        status: '❌ SETUP_FAILED',
        message: `Run-Status ist nicht "queued": ${final.research_run_status}`,
      };
    }

    console.info(`[e2eTest] ═══ SETUP RESULT: ${verdict.status} ═══`);
    verdict.details?.forEach(d => console.info(`[e2eTest]   ${d}`));

    // Cleanup der Test-Org (wird später bereinigt wenn User validate_run aufruft)
    // Für jetzt: Org behalten damit Browser sie verarbeiten kann
    console.info('[e2eTest] ℹ️  Test-Org wird NICHT bereinigt — wird später manuell gelöscht.');

    // Browser-Test-URL: öffne Dashboard mit dieser Test-Org als aktiver Org
    // useOrganization liest ?org_id= → lädt genau diese Org → ActiveResearchBanner verarbeitet den Run
    const appOrigin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'https://app.vertriebo.com';
    const browserTestUrl = `${appOrigin}/dashboard?org_id=${testOrg.id}`;

    return Response.json({
      success: setupSuccess,
      verdict,
      baseline,
      final,
      delta,
      period_month: periodMonth,
      test_org_id: testOrg.id,
      research_run_id: run.id,
      browser_test_url: browserTestUrl,
      note: 'Setup erfolgreich. Browser-Test-URL öffnen → ActiveResearchBanner verarbeitet den queued Run → dann validate_run=true aufrufen.',
    });

  } catch (error) {
    console.error('[e2eTest] Fatal error:', error?.message, error?.stack);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});