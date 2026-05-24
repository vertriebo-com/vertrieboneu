/**
 * startResearchRun
 * ================
 * Erstellt sofort einen ResearchRun mit status=queued und gibt zurück.
 * Keine Google-Schleife hier – nur Setup + Plan-Checks.
 *
 * TAXONOMIE-ARCHITEKTUR:
 * - Lädt Taxonomie via getTaxonomy (DB-Quelle, kanonisch).
 * - Bettet das Profil der gewählten Branche in search_plan_json ein.
 * - processResearchRun liest das Profil aus dem Plan → kein eigener DB-Call nötig.
 * - taxonomy_hash + taxonomy_version werden im ResearchRun gespeichert.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

const LEGACY_INDUSTRY_MAP = {
  "Gebäudereinigung":"gebaeudereinigung","Gartenbau / Gartenpflege":"gartenbau","Gartenbau":"gartenbau",
  "Hausmeisterdienst / Facility Service":"facility_service","Facility Service":"facility_service","Hausmeisterdienst":"facility_service",
  "Entrümpelung / Entsorgung":"entruempelung","Entrümpelung":"entruempelung",
  "Buchhaltung / Büroservice":"buchhaltung_steuernahe_dienste","Buchhaltung":"buchhaltung_steuernahe_dienste",
  "Maschinenwartung / Industrieservice":"industrieservice","Industrieservice":"industrieservice",
  "Sicherheitsdienst":"sicherheitsdienst","IT-Service":"it_service","Catering":"catering","Handwerk":"handwerk",
  "Spedition / Logistik":"spedition_logistik","Spedition":"spedition_logistik","Logistik":"spedition_logistik",
  "Gesundheit / Medizin":"gesundheit_medizin","Gesundheit":"gesundheit_medizin","Medizin":"gesundheit_medizin",
  "Immobilien":"immobilien","Lager / Fulfillment":"lager_fulfillment","Fulfillment":"lager_fulfillment",
  "Maler / Renovierung":"maler_renovierung","Maler":"maler_renovierung","Renovierung":"maler_renovierung",
  "Elektro / Gebäudetechnik":"elektro_gebaeudetechnik","Elektro":"elektro_gebaeudetechnik",
  "SHK / Sanitär / Heizung / Klima":"shk","SHK":"shk","Sanitär":"shk","Heizung":"shk",
  "Eventservice":"eventservice","Marketing / Webdesign / Werbung":"marketing_webdesign_werbung",
  "Marketing":"marketing_webdesign_werbung","Webdesign":"marketing_webdesign_werbung",
  "Personal / Zeitarbeit":"personal_zeitarbeit","Zeitarbeit":"personal_zeitarbeit",
  "Fuhrparkservice / Fahrzeugpflege":"fuhrparkservice_fahrzeugpflege","Fuhrparkservice":"fuhrparkservice_fahrzeugpflege",
  "Pflege / Betreuung":"pflege_betreuung","Pflege":"pflege_betreuung",
  "Schulungen / Weiterbildung":"schulungen_weiterbildung","Schulungen":"schulungen_weiterbildung",
};

// KANONISCH: Kalendermonat Europe/Berlin (YYYY-MM)
// Identisch zu processResearchRun – alle UsageLog-Reads/Writes müssen dieselbe Logik nutzen.
function getPeriodMonth() {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()).split('.').reverse().join('-');
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── RADIUS-ADAPTIVE GRID ──────────────────────────────────────────────────────
// Erzeugt ein Hex-Grid das den Suchradius lückenlos abdeckt.
// stepKm = Abstand zwischen Gitterpunkten (adaptiv je nach Radius).
// Nur Punkte die tatsächlich im Radius liegen werden zurückgegeben.
//
// Radius-Matrix (stepKm → Punkte):
//  ≤ 5km  → stepKm=4   → ~1-7 Punkte (enger Grid für dichten Raum)
//  ≤ 10km → stepKm=6   → ~7 Punkte
//  ≤ 25km → stepKm=10  → ~7-19 Punkte
//  ≤ 50km → stepKm=15  → ~19 Punkte
//  > 50km → stepKm=20  → ~19-37 Punkte
function generateSearchGrid(centerLat, centerLng, radiusKm, trialStage) {
  const center = { lat: centerLat, lng: centerLng, label: 'center' };
  if (trialStage === 'free_preview') return [center];

  // Adaptiver Step je nach Radius
  let stepKm;
  if (radiusKm <= 5)       stepKm = 4;
  else if (radiusKm <= 10) stepKm = 6;
  else if (radiusKm <= 25) stepKm = 10;
  else if (radiusKm <= 50) stepKm = 15;
  else                     stepKm = 20;

  const points = [center];

  // Maximale Anzahl Ringe die in den Radius passen
  const maxRings = Math.floor(radiusKm / stepKm);

  for (let ring = 1; ring <= maxRings; ring++) {
    const ringRadiusKm = ring * stepKm;
    const pointsInRing = 6 * ring;
    for (let i = 0; i < pointsInRing; i++) {
      const angle = (2 * Math.PI * i) / pointsInRing;
      const dLat = (ringRadiusKm / 111) * Math.cos(angle);
      const dLng = (ringRadiusKm / (111 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle);
      const pLat = centerLat + dLat, pLng = centerLng + dLng;
      // Nur Punkte die tatsächlich innerhalb des Radius liegen
      if (haversineKm(centerLat, centerLng, pLat, pLng) <= radiusKm) {
        points.push({ lat: pLat, lng: pLng, label: `grid_${ring}_${i}` });
      }
    }
  }

  console.info(`[generateSearchGrid] radiusKm=${radiusKm} stepKm=${stepKm} maxRings=${maxRings} points=${points.length}`);
  return points;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt', success: false }, { status: 401 });

    const body = await req.json();
    const { organization_id, target_count = 25 } = body;
    if (!organization_id) return Response.json({ error: 'organization_id fehlt', success: false }, { status: 400 });

    // ── Tenant-sicherer Access Check ─────────────────────────────────────────
    const isPlatformAdmin = ["admin","platform_owner","platform_admin"].includes(user.role);

    const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id }).catch(() => []);
    const org = orgs[0];
    if (!org) return Response.json({ error: 'Organisation nicht gefunden', success: false }, { status: 404 });

    if (!isPlatformAdmin) {
      // Prüfen: User ist Owner oder aktives Mitglied dieser Organisation
      const isOwner = org.owner_email === user.email;
      const memberships = await base44.asServiceRole.entities.OrganizationMember.filter({ organization_id, user_email: user.email, status: 'active' }).catch(() => []);
      const isMember = memberships.length > 0;
      if (!isOwner && !isMember) {
        return Response.json({ error: 'Kein Zugriff auf diese Organisation', success: false }, { status: 403 });
      }
    }

    if (!isPlatformAdmin) {
      if (org.platform_status === 'suspended') return Response.json({ error: 'organization_suspended', success: false }, { status: 403 });
      if (org.abuse_status === 'blocked') return Response.json({ error: 'abuse_blocked', success: false }, { status: 403 });
      const billingOk = ['preview','active','trialing'].includes(org.billing_status);
      if (!billingOk) return Response.json({ error: `Billing-Status "${org.billing_status}" nicht erlaubt.`, success: false }, { status: 402 });
    }

    // ── PlatformConfig ───────────────────────────────────────────────────────
    const configs = await base44.asServiceRole.entities.PlatformConfig.list();
    if (configs[0] && !configs[0].google_places_api_enabled) {
      return Response.json({
        success: false, error: 'service_temporarily_unavailable',
        message: configs[0].disabled_reason || 'Die Lead-Recherche ist gerade in Wartung.'
      }, { status: 503 });
    }

    const trialStage = org.trial_stage || 'free_preview';
    const remainingPreviewLeads = Math.max(0, 10 - (org.trial_leads_granted || 0));

    // ── Preview Limit ────────────────────────────────────────────────────────
    if (trialStage === 'free_preview') {
      if (remainingPreviewLeads <= 0) {
        return Response.json({
          success: false, error: 'trial_preview_limit_reached',
          message: 'Kostenlose Vorschau aufgebraucht.', trial_stage: trialStage
        }, { status: 403 });
      }
      // Rate-Limit: max 3 Runs pro 24h im Preview
      const last24h = new Date(Date.now() - 24*60*60*1000);
      const recentRuns = await base44.asServiceRole.entities.ResearchRun.filter({ organization_id }, '-created_date', 10);
      const runsLast24h = recentRuns.filter(r => new Date(r.created_date) >= last24h && r.status !== 'failed').length;
      if (runsLast24h >= 3) {
        return Response.json({
          success: false, error: 'free_preview_daily_limit',
          message: 'Kostenlose Vorschau-Recherchen für heute aufgebraucht.'
        }, { status: 429 });
      }
    }

    // ── SERIAL RUN LOCK: Nur ein aktiver Run pro Organisation ───────────────
    // Da Base44 keine atomaren DB-Operationen bietet, verhindert dieser Lock parallele
    // ResearchRuns auf Org-Ebene. Das eliminiert den kritischsten Race-Condition-Pfad.
    const activeRuns = await base44.asServiceRole.entities.ResearchRun.filter({ organization_id }, '-created_date', 10);
    const activeRun = activeRuns.find(r => ['queued', 'running'].includes(r.status));
    if (activeRun) {
      // Stale-Check: Run älter als 5 Minuten ohne Fortschritt gilt als stale
      const runAge = activeRun.started_at ? (Date.now() - new Date(activeRun.started_at).getTime()) / 1000 : 999;
      if (runAge < 300) {
        return Response.json({
          success: false,
          error: 'research_run_already_active',
          message: 'Eine Recherche läuft bereits. Bitte warten bis diese abgeschlossen ist.',
          active_run_id: activeRun.id,
          active_run_status: activeRun.status,
        }, { status: 409 });
      }
      // Stale Run: als failed markieren damit neuer Run starten kann
      console.warn(`[startResearchRun] Stale run detected (${Math.round(runAge)}s old), marking as failed: ${activeRun.id}`);
      await base44.asServiceRole.entities.ResearchRun.update(activeRun.id, {
        status: 'failed',
        error_message: 'Run durch Serial-Lock als stale markiert (>5min ohne Abschluss)',
        stop_reason: 'stale_serial_lock',
        finished_at: new Date().toISOString(),
        processing_lock_until: null,
        processing_by: null,
      });
    }

    // ── Monthly Limit Check — SSOT: max(committedSlots, usageLogValue, companiesThisMonth) ──────
    // IDENTISCH zu getDashboardData und getUsageSummary — keine einzelne Quelle allein!
    // Kein functions.invoke → kein Rate-Limit-Risiko.
    //
    // WICHTIG: plan_id=null ist KEIN "unlimited". Regeln:
    // - plan_id vorhanden + max_leads_per_month=-1 → echter Unlimited-Plan → erlaubt
    // - plan_id vorhanden + max_leads_per_month>0 → Limit gilt
    // - plan_id=null + trial_stage=free_preview/verified_trial → Trial-Limit (oben bereits geprüft)
    // - plan_id=null + trial_stage=paid → billing_setup_required → blockieren
    // - PlatformAdmin → überspringt diesen Block komplett (isPlatformAdmin=true)
    let monthlyContactLimit = -1; // -1 = wird unten weiter aufgelöst

    if (!isPlatformAdmin && trialStage !== 'free_preview') {
      // ── CUSTOM LIMIT (Agency / individuell durch Admin gesetzt) ────────────
      // custom_monthly_lead_limit überschreibt den Plan-Wert vollständig.
      // -1 = Unlimited (nur wenn bewusst durch Admin gesetzt).
      // null/nicht gesetzt = Plan-Wert gilt.
      // Sicherheit: nur PlatformAdmin kann dieses Feld setzen (enforced in platformAdmin.js).
      if (org.custom_monthly_lead_limit != null) {
        monthlyContactLimit = org.custom_monthly_lead_limit;
        console.info(`[startResearchRun] custom_monthly_lead_limit=${monthlyContactLimit} (Admin-Override)`);
      } else if (!org.plan_id) {
        // Kein Plan gesetzt → prüfen ob das erlaubt ist
        if (trialStage === 'paid') {
          // Paid-Kunde ohne Plan: Konfigurationsfehler → blockieren
          console.warn(`[startResearchRun] billing_setup_required: org=${organization_id} trial_stage=paid plan_id=null`);
          return Response.json({
            success: false,
            error: 'billing_setup_required',
            message: 'Ihr Abonnement ist aktiv, aber kein Plan zugewiesen. Bitte kontaktieren Sie den Support.',
          }, { status: 402 });
        }
        // verified_trial ohne Plan: Trial-Limit von 50 Leads
        monthlyContactLimit = 50;
        console.info(`[startResearchRun] Kein Plan (trial_stage=${trialStage}) → Trial-Limit ${monthlyContactLimit}`);
      } else {
        // Plan geladen — max_leads_per_month auslesen
        const plans = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
        if (!plans[0]) {
          // Plan-ID gesetzt aber Plan nicht gefunden → blockieren
          console.warn(`[startResearchRun] Plan ${org.plan_id} nicht gefunden für org=${organization_id}`);
          return Response.json({
            success: false,
            error: 'billing_plan_missing',
            message: 'Ihr gebuchter Plan konnte nicht geladen werden. Bitte kontaktieren Sie den Support.',
          }, { status: 402 });
        }
        // PRODUKTREGEL: unlimited gilt NUR wenn Plan existiert UND max_leads_per_month === -1.
        // null → defensiv auf 50 (Admin-Konfigurationsfehler sichtbar machen).
        // -1 → echter Unlimited-Plan (Agency etc.)
        const rawLimit = plans[0].max_leads_per_month;
        monthlyContactLimit = (rawLimit != null) ? rawLimit : 50;
        if (rawLimit == null) {
          console.warn(`[startResearchRun] Plan ${plans[0].name} hat max_leads_per_month=null → defensiv auf 50 gesetzt (Admin-Konfigurationsfehler)`);
        }
        console.info(`[startResearchRun] Plan geladen: ${plans[0].name} max_leads_per_month=${monthlyContactLimit}`);
      }
    } else if (isPlatformAdmin) {
      // Platform-Admin: kein Limit (bewusst erlaubt, klar markiert)
      monthlyContactLimit = -1;
      console.info(`[startResearchRun] PlatformAdmin → kein Monatslimit`);
    }
    let monthlyRemaining = -1; // -1 = unbegrenzt
    let monthlyUsedForCheck = 0;
    if (monthlyContactLimit !== -1) {
      const periodMonth = getPeriodMonth();
      const [py, pm] = periodMonth.split('-').map(Number);

      // Alle 3 Quellen parallel laden
      const [quotaSlots, usageLogs, companiesRaw] = await Promise.all([
        base44.asServiceRole.entities.QuotaReservation.filter({ organization_id, period_month: periodMonth }),
        base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth }),
        base44.asServiceRole.entities.Company.filter({ organization_id }, '-created_date', 2000),
      ]);

      const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
      const usageLogValue = usageLogs?.[0]?.leads_created || 0;

      // Manuell/Import-Leads ausschließen — identisch zu getDashboardData
      const NON_QUOTA_RUN_IDS = new Set(['manual_setup', 'csv_import', 'manual', 'import']);
      const periodStart = new Date(Date.UTC(py, pm - 1, 1));
      const periodEnd   = new Date(Date.UTC(py, pm, 1));
      const companiesThisMonth = companiesRaw.filter(c => {
        if (!c.research_run_id) return false;
        if (NON_QUOTA_RUN_IDS.has(c.research_run_id)) return false;
        if (c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
        if (c.source_provider === 'manual' || c.source_provider === 'csv_import') return false;
        const created = new Date(c.created_date);
        return created >= periodStart && created < periodEnd;
      }).length;

      // SSOT-Formel: höchsten Wert nehmen
      monthlyUsedForCheck = Math.max(committedSlots, usageLogValue, companiesThisMonth);
      monthlyRemaining = Math.max(0, monthlyContactLimit - monthlyUsedForCheck);

      console.info(`[startResearchRun] Monthly limit check: committed=${committedSlots} usageLog=${usageLogValue} companies=${companiesThisMonth} → used=${monthlyUsedForCheck}/${monthlyContactLimit}`);

      if (monthlyUsedForCheck >= monthlyContactLimit) {
        const resetDate = new Date(Date.UTC(py, pm, 1));
        const resetDateFormatted = resetDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
        return Response.json({
          success: false,
          error: 'monthly_contact_limit_reached',
          reason: 'monthly_lead_quota_reached',
          message: `Monatskontingent erreicht: ${monthlyUsedForCheck} von ${monthlyContactLimit} Leads genutzt.`,
          monthly_usage: { monthly_limit: monthlyContactLimit, monthly_used: monthlyUsedForCheck, remaining: 0, reset_date: resetDateFormatted }
        }, { status: 402 });
      }
    }

    // ── Settings Resolver ────────────────────────────────────────────────────
    const settingsRecords = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id });
    const settings = {};
    settingsRecords.forEach(s => { settings[s.key] = s.value; });

    const city = org.service_area_city || settings.service_area_city || settings.lead_plz_city || settings.lead_plz || '';
    if (!city) return Response.json({ error: 'Kein Suchgebiet definiert.', success: false }, { status: 400 });

    const radiusKm = parseFloat(
      (org.service_area_radius_km > 0 ? org.service_area_radius_km : null) ||
      settings.service_area_radius_km || settings.lead_radius_km || '25'
    ) || 25;

    // ── INDUSTRY SOURCE-OF-TRUTH (Priorisierung) ──────────────────────────────
    // 1. OrganizationSettings.industry_id (kanonisch, z.B. "gebaeudereinigung")
    // 2. OrganizationSettings.industry_name (Legacy, z.B. "Gebäudereinigung") → Mapping
    // 3. Organization.industry (Fallback, z.B. "Entrümpelung") → Mapping
    // KEINE stillen Überschreibungen — explizite Priorisierung
    const settingsIndustryId = settings.industry_id || null;
    const settingsIndustryName = settings.industry_name || settings.own_industry || settings.industry || null;
    const orgIndustry = org.industry || null;
    
    // Canonical industry_id ermitteln
    let industryId = null;
    let industry = null;
    let industrySource = null;
    
    if (settingsIndustryId) {
      // Priorität 1: industry_id aus Settings (kanonisch)
      industryId = settingsIndustryId;
      industry = settingsIndustryName || orgIndustry || settingsIndustryId;
      industrySource = 'settings.industry_id';
    } else if (settingsIndustryName) {
      // Priorität 2: industry_name aus Settings → Mapping
      industryId = LEGACY_INDUSTRY_MAP[settingsIndustryName] || settingsIndustryName;
      industry = settingsIndustryName;
      industrySource = 'settings.industry_name';
    } else if (orgIndustry) {
      // Priorität 3: org.industry → Mapping
      industryId = LEGACY_INDUSTRY_MAP[orgIndustry] || orgIndustry;
      industry = orgIndustry;
      industrySource = 'organization.industry';
    } else {
      industry = '';
      industryId = '';
      industrySource = 'none';
    }
    
    console.info(`[startResearchRun] Industry: "${industry}" (id=${industryId}, source=${industrySource})`);

    // ── Taxonomie laden (kanonische DB-Quelle — DIREKT aus Entity) ───────────
    let taxonomyProfile = null;
    let taxonomyHash = null;
    let taxonomyVersion = null;
    let usedFallbackProfile = false;
    
    try {
      // Einzelnes Profil laden
      const taxRecords = await base44.asServiceRole.entities.TaxonomyEntry.filter({ industry_id: industryId, is_active: true });
      if (taxRecords[0]) {
        const rec = taxRecords[0];
        // Profil aus DB-Feldern rekonstruieren — identische Struktur wie getTaxonomy
        taxonomyProfile = {
          industry_id: rec.industry_id,
          label: rec.label,
          own_services: rec.own_services ? JSON.parse(rec.own_services) : [],
          target_customer_types: rec.target_customer_types ? JSON.parse(rec.target_customer_types) : [],
          excluded_customer_types: rec.excluded_customer_types ? JSON.parse(rec.excluded_customer_types) : [],
          searchable_business_categories: rec.searchable_business_categories ? JSON.parse(rec.searchable_business_categories) : [],
          search_keyword_variants: rec.search_keyword_variants ? JSON.parse(rec.search_keyword_variants) : {},
          negative_keywords: rec.negative_keywords ? JSON.parse(rec.negative_keywords) : [],
          bad_fit_signals: rec.bad_fit_signals ? JSON.parse(rec.bad_fit_signals) : [],
          bad_fit_signal_weights: rec.bad_fit_signal_weights ? JSON.parse(rec.bad_fit_signal_weights) : {},
          scoring_signals: rec.scoring_signals ? JSON.parse(rec.scoring_signals) : [],
          scoring_signal_weights: rec.scoring_signal_weights ? JSON.parse(rec.scoring_signal_weights) : {},
          query_priority: rec.query_priority ? JSON.parse(rec.query_priority) : [],
          search_strategy: rec.search_strategy || 'target_customer_search',
          place_type_confidence: rec.place_type_confidence || 'medium',
          google_place_types: rec.google_place_types ? JSON.parse(rec.google_place_types) : [],
          ideal_customer_profiles: rec.ideal_customer_profiles ? JSON.parse(rec.ideal_customer_profiles) : [],
        };
        console.info(`[startResearchRun] Taxonomie geladen: ${industryId} (source=${industrySource})`);
      } else {
        console.warn(`[startResearchRun] Keine Taxonomie für Branche "${industry}" (id=${industryId})`);
      }
    } catch (taxErr) {
      console.error('[startResearchRun] Taxonomie-Ladefehler:', taxErr?.message);
    }

    // FALLBACK: Wenn kein exaktes Profil → Fallback-Profil laden
    if (!taxonomyProfile) {
      console.warn(`[startResearchRun] Kein exaktes Profil für "${industry}" (id=${industryId}) — versuche Fallback`);
      const fallbackId = 'fallback_lokaler_dienstleister';
      try {
        const fbRecords = await base44.asServiceRole.entities.TaxonomyEntry.filter({ industry_id: fallbackId, is_active: true });
        if (fbRecords[0]) {
          const rec = fbRecords[0];
          taxonomyProfile = {
            industry_id: rec.industry_id,
            label: rec.label,
            own_services: rec.own_services ? JSON.parse(rec.own_services) : [],
            target_customer_types: rec.target_customer_types ? JSON.parse(rec.target_customer_types) : [],
            excluded_customer_types: rec.excluded_customer_types ? JSON.parse(rec.excluded_customer_types) : [],
            searchable_business_categories: rec.searchable_business_categories ? JSON.parse(rec.searchable_business_categories) : [],
            search_keyword_variants: rec.search_keyword_variants ? JSON.parse(rec.search_keyword_variants) : {},
            negative_keywords: rec.negative_keywords ? JSON.parse(rec.negative_keywords) : [],
            bad_fit_signals: rec.bad_fit_signals ? JSON.parse(rec.bad_fit_signals) : [],
            bad_fit_signal_weights: rec.bad_fit_signal_weights ? JSON.parse(rec.bad_fit_signal_weights) : {},
            scoring_signals: rec.scoring_signals ? JSON.parse(rec.scoring_signals) : [],
            scoring_signal_weights: rec.scoring_signal_weights ? JSON.parse(rec.scoring_signal_weights) : {},
            query_priority: rec.query_priority ? JSON.parse(rec.query_priority) : [],
            search_strategy: rec.search_strategy || 'target_customer_search',
            place_type_confidence: rec.place_type_confidence || 'medium',
            google_place_types: rec.google_place_types ? JSON.parse(rec.google_place_types) : [],
            ideal_customer_profiles: rec.ideal_customer_profiles ? JSON.parse(rec.ideal_customer_profiles) : [],
          };
          usedFallbackProfile = true;
          console.info(`[startResearchRun] Fallback-Profil geladen: ${fallbackId}`);
        }
      } catch (fbErr) {
        console.error('[startResearchRun] Fallback-Profil Ladefehler:', fbErr?.message);
      }
    }

    // taxonomy_hash + version aus allen Profilen ableiten (für Audit-Trail)
    try {
      const allTax = await base44.asServiceRole.entities.TaxonomyEntry.filter({ is_active: true });
      // Hash aus Anzahl + Versionen der aktiven Profile berechnen (vereinfacht)
      taxonomyHash = `v${allTax.length}-${allTax[0]?.version || 'unknown'}`;
      taxonomyVersion = allTax[0]?.version || 'unknown';
    } catch {}

    // HARD FAIL: Auch Fallback nicht verfügbar
    if (!taxonomyProfile) {
      console.error(`[startResearchRun] taxonomy_profile_missing: industry="${industry}" industryId="${industryId}"`);
      return Response.json({
        success: false,
        error: 'taxonomy_profile_missing',
        message: `Kein Taxonomie-Profil für Branche "${industry}" (id="${industryId}"). Bitte Branche in den Einstellungen prüfen.`,
      }, { status: 400 });
    }

    // ── OrgLearnedSignals laden ──────────────────────────────────────────────
    // Learning Loop: Nutzerverhalten (LeadOutcome) fließt in Suchplanung ein.
    // Mindestdaten-Regel: < 5 Outcomes → nur speichern, nicht priorisieren
    //                      5–14 Outcomes → leichte Gewichtung
    //                     15+ Outcomes → stärkere Gewichtung
    let learnedSignals = null;
    let learningApplied = false;
    let learningWeightLevel = 'none';
    let learningTotalOutcomes = 0;
    let learnedPriorityCategories = [];
    let learnedBoostedKeywords = [];
    let learnedExcludedCategories = [];

    try {
      const learnedRecords = await base44.asServiceRole.entities.OrgLearnedSignals.filter({ organization_id }, '-updated_date', 1);
      if (learnedRecords[0]) {
        const rec = learnedRecords[0];
        learningTotalOutcomes = rec.total_outcomes_analyzed || 0;
        learnedPriorityCategories = rec.priority_categories ? JSON.parse(rec.priority_categories) : [];
        learnedBoostedKeywords = rec.boosted_keywords ? JSON.parse(rec.boosted_keywords) : [];
        learnedExcludedCategories = rec.excluded_categories ? JSON.parse(rec.excluded_categories) : [];

        // Gewichtungsstufe bestimmen
        if (learningTotalOutcomes >= 15) {
          learningWeightLevel = 'strong';
          learningApplied = true;
        } else if (learningTotalOutcomes >= 5) {
          learningWeightLevel = 'light';
          learningApplied = true;
        } else {
          learningWeightLevel = 'none';
          learningApplied = false; // < 5 Outcomes: speichern aber nicht anwenden
        }
        learnedSignals = rec;
        console.info(`[startResearchRun] LearnedSignals: outcomes=${learningTotalOutcomes} weight=${learningWeightLevel} priorityCats=${learnedPriorityCategories.length} boostedKW=${learnedBoostedKeywords.length} excludedCats=${learnedExcludedCategories.length}`);
      }
    } catch (learningErr) {
      console.warn(`[startResearchRun] OrgLearnedSignals Ladefehler (non-blocking): ${learningErr?.message}`);
    }

    // ── Target Customer Types: Settings ODER Taxonomie-Fallback ─────────────
    // WICHTIG: Wenn Settings leer → Taxonomie-Profil als Fallback nutzen
    // Verhindert "Keine Suchkategorien"-Fehler bei unvollständigem Onboarding
    let targetCustomerTypes = (settings.target_customer_types || settings.zielkunden || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    let excludedCustomerTypes = (settings.excluded_customer_types || settings.zielkunden_ausschluss || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    
    // Fallback: Wenn Settings leer → Taxonomie-Profil nutzen (JETZT SICHER: taxonomyProfile ist geladen)
    if (targetCustomerTypes.length === 0 && taxonomyProfile?.target_customer_types?.length > 0) {
      targetCustomerTypes = taxonomyProfile.target_customer_types.slice(0, 5); // Max 5 für initiale Suche
      console.info(`[startResearchRun] Fallback: targetCustomerTypes aus Taxonomie (${targetCustomerTypes.length})`);
    }

    // ── Learning Loop anwenden (wenn genug Outcomes vorhanden) ───────────────
    let boostedKeywordsForPlan = [];
    if (learningApplied) {
      // 1. targetCustomerTypes nach priority_categories sortieren
      //    Gelernte Prioritäts-Kategorien kommen nach vorne
      if (learnedPriorityCategories.length > 0) {
        const prioritySet = new Set(learnedPriorityCategories.map(c => (c.category || c).toLowerCase()));
        const prioritized = targetCustomerTypes.filter(t => prioritySet.has(t.toLowerCase()));
        const rest = targetCustomerTypes.filter(t => !prioritySet.has(t.toLowerCase()));
        // Für "strong": gelernte Kategorien zusätzlich hinzufügen wenn noch nicht vorhanden
        const extraCats = learningWeightLevel === 'strong'
          ? learnedPriorityCategories
              .map(c => c.category || c)
              .filter(c => !targetCustomerTypes.map(t => t.toLowerCase()).includes(c.toLowerCase()))
              .slice(0, 2)
          : [];
        targetCustomerTypes = [...prioritized, ...extraCats, ...rest];
        console.info(`[startResearchRun] Learning: targetCustomerTypes neu sortiert (${learningWeightLevel}): ${targetCustomerTypes.slice(0,3).join(', ')}`);
      }

      // 2. boosted_keywords als zusätzliche Suchbegriffe aufnehmen
      if (learnedBoostedKeywords.length > 0) {
        const maxKW = learningWeightLevel === 'strong' ? 3 : 2;
        boostedKeywordsForPlan = learnedBoostedKeywords
          .map(k => k.keyword || k)
          .filter(Boolean)
          .slice(0, maxKW);
        console.info(`[startResearchRun] Learning: boostedKeywords aufgenommen: ${boostedKeywordsForPlan.join(', ')}`);
      }

      // 3. excluded_categories zu excludedCustomerTypes hinzufügen
      //    Nur wenn total >= 3 und not_relevant > 60% (bereits durch processLeadOutcomeFeedback gefiltert)
      if (learnedExcludedCategories.length > 0) {
        const excludedFromLearning = learnedExcludedCategories
          .map(c => c.category || c)
          .filter(c => c && !excludedCustomerTypes.map(e => e.toLowerCase()).includes(c.toLowerCase()));
        if (excludedFromLearning.length > 0) {
          excludedCustomerTypes = [...excludedCustomerTypes, ...excludedFromLearning];
          console.info(`[startResearchRun] Learning: ${excludedFromLearning.length} Kategorien ausgeschlossen`);
        }
      }
    }

    // ── Koordinaten auflösen ─────────────────────────────────────────────────
    let cityCoords = null;
    const savedLat = parseFloat(settings.service_area_lat || settings.lead_lat || '0');
    const savedLng = parseFloat(settings.service_area_lng || settings.lead_lng || '0');
    if (savedLat && savedLng && Math.abs(savedLat) > 0.001) {
      cityCoords = { lat: savedLat, lng: savedLng };
    } else {
      if (!GOOGLE_PLACES_API_KEY) return Response.json({ error: 'GOOGLE_PLACES_API_KEY fehlt', success: false }, { status: 500 });
      const geoRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(city + ' Deutschland')}&key=${GOOGLE_PLACES_API_KEY}&language=de`);
      const geoData = await geoRes.json();
      const loc = geoData.results?.[0]?.geometry?.location;
      if (!loc) return Response.json({ error: `Stadt "${city}" nicht gefunden.`, success: false }, { status: 400 });
      cityCoords = { lat: loc.lat, lng: loc.lng };
    }

    // ── Zusatzorte ───────────────────────────────────────────────────────────
    let additionalCityObjects = [];
    if (settings.target_locations_json) {
      try {
        const parsed = JSON.parse(settings.target_locations_json);
        if (Array.isArray(parsed)) additionalCityObjects = parsed.filter(o => o && o.city);
      } catch {}
    }

    // ── Suchplan zusammenbauen ───────────────────────────────────────────────
    // effectiveTarget: verhindert Überbuchung bei knappem Kontingent (z.B. 299/300 → max 1 neuer Lead)
    const effectiveTarget = trialStage === 'free_preview'
      ? Math.min(remainingPreviewLeads, 10)
      : monthlyRemaining === -1
        ? Math.min(target_count, 25)
        : Math.min(target_count, 25, monthlyRemaining);

    // Grid-Punkte für alle Such-Zentren
    const mainGrid = generateSearchGrid(cityCoords.lat, cityCoords.lng, radiusKm, trialStage).map(p => ({
      ...p, centerLat: cityCoords.lat, centerLng: cityCoords.lng, centerCity: city
    }));

    const additionalPoints = [];
    for (const loc of additionalCityObjects.filter(o => o.lat && o.lng).slice(0, 4)) {
      const grid = generateSearchGrid(loc.lat, loc.lng, radiusKm, trialStage);
      for (const p of grid) {
        additionalPoints.push({ ...p, label: `extra_${loc.city}_${p.label}`, centerLat: loc.lat, centerLng: loc.lng, centerCity: loc.city });
      }
    }

    const allPoints = [...mainGrid, ...additionalPoints];
    const allCenters = [
      { lat: cityCoords.lat, lng: cityCoords.lng, city },
      ...additionalCityObjects.filter(o => o.lat && o.lng).map(o => ({ lat: o.lat, lng: o.lng, city: o.city }))
    ];

    // Custom-Industry-Tracking: Speichern wenn Nutzer "Andere Branche" oder unbekannte Branche nutzt
    if (usedFallbackProfile || industry === 'Andere Branche / Sonstiges' || !industryId) {
      try {
        const orgSettings = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id, key: 'custom_industry_requested' });
        const existing = orgSettings[0];
        const trackData = { industry_label: industry, industry_id_attempted: industryId, fallback_used: usedFallbackProfile, requested_at: new Date().toISOString() };
        if (existing) {
          await base44.asServiceRole.entities.OrganizationSettings.update(existing.id, { value: JSON.stringify(trackData) });
        } else {
          await base44.asServiceRole.entities.OrganizationSettings.create({ organization_id, key: 'custom_industry_requested', value: JSON.stringify(trackData) });
        }
        console.info(`[startResearchRun] Custom-Industry getrackt: ${industry}`);
      } catch {}
    }

    // ── LocationIndex: Coverage für diesen Suchbereich auflösen (INLINE) ──────
    // Direkt per asServiceRole statt functions.invoke — verhindert Auth-Fehler wenn
    // User-Token nicht durchgereicht wird (z.B. Service-Role-Kontext).
    // Identische Schwellwert-Logik wie resolveCoverageLocations (SSOT unten).
    let coveredLocations = [];
    let coveredLocationsTotal = 0;
    let selectedLocationsCount = 0;
    let coverageMode = 'grid_only';

    try {
      // Plan-Limit für Locations (identisch zu resolveCoverageLocations)
      function resolveMaxLocations(ts, planObj) {
        if (!ts || ts === 'free_preview') return 3;
        if (ts === 'verified_trial') return 5;
        if (!planObj) return 10;
        const ml = planObj.max_leads_per_month;
        if (ml === -1) return 9999;
        if (planObj.plan_type === 'agency') return 9999;
        if (ml >= 2000) return 50;  // Gold (5000 leads)
        if (ml >= 500)  return 25;  // Professional (1500 leads)
        if (ml >= 100)  return 10;  // Starter (300 leads)
        return 10;
      }

      // Plan für Org laden (nur wenn noch nicht geladen)
      let planForCoverage = null;
      if (org.plan_id) {
        const planRecs = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
        planForCoverage = planRecs[0] || null;
      }
      const maxLocs = org.custom_monthly_lead_limit === -1
        ? 9999
        : resolveMaxLocations(trialStage, planForCoverage);

      // LocationIndex paginiert laden
      const PAGE_SIZE_LOC = 2000;
      const seenLocIds = new Set();
      const allLocEntries = [];
      for (let pg = 0; pg < 20; pg++) {
        const batch = await base44.asServiceRole.entities.LocationIndex.list('-quality_score', PAGE_SIZE_LOC, pg * PAGE_SIZE_LOC);
        for (const r of batch) { if (!seenLocIds.has(r.id)) { seenLocIds.add(r.id); allLocEntries.push(r); } }
        if (batch.length < PAGE_SIZE_LOC) break;
      }

      // Aktive Einträge filtern + Composite-Dedupe
      const compositeSeenLoc = new Set();
      const dedupedLoc = [];
      for (const r of allLocEntries) {
        if (!(r.is_active === true || r.is_active === 'true') || r.location_type === 'special_postal_recipient') continue;
        if (!r.lat || !r.lng || r.lat === 0 || r.lng === 0) continue;
        const ck = `${r.country_code||'DE'}|${r.postal_code||''}|${r.normalized_name||(r.city||'').toLowerCase()}|${r.state_code||''}`;
        if (compositeSeenLoc.has(ck)) continue;
        compositeSeenLoc.add(ck);
        dedupedLoc.push(r);
      }

      // Im Radius filtern + sortieren
      const inRadiusLoc = dedupedLoc
        .map(r => ({ ...r, dist: haversineKm(cityCoords.lat, cityCoords.lng, r.lat, r.lng) }))
        .filter(r => r.dist <= radiusKm)
        .sort((a, b) => (b.quality_score || 80) - (a.quality_score || 80) || a.dist - b.dist);

      coveredLocationsTotal = inRadiusLoc.length;
      const selectedLoc = inRadiusLoc.slice(0, maxLocs);
      coveredLocations = selectedLoc.map(l => ({
        city: l.city,
        postal_code: l.postal_code,
        lat: l.lat,
        lng: l.lng,
        state_code: l.state_code,
        distance_km: Math.round(l.dist * 10) / 10,
        priority_score: l.quality_score || 80,
      }));
      selectedLocationsCount = coveredLocations.length;
      coverageMode = selectedLocationsCount > 0 ? 'location_index_plus_grid' : 'grid_only';
      console.info(`[startResearchRun] LocationIndex (inline): total=${coveredLocationsTotal} selected=${selectedLocationsCount} maxLocs=${maxLocs} mode=${coverageMode}`);
    } catch (coverageErr) {
      console.warn(`[startResearchRun] LocationIndex inline Fehler (non-blocking): ${coverageErr?.message} → fallback grid_only`);
    }

    // ── Suchplan zusammenbauen (Taxonomie-Profil + LocationIndex + Learning eingebettet) ─
    const searchPlanData = {
      industry,
      industryId,
      industrySource,
      usedFallbackProfile: usedFallbackProfile || false,
      city,
      radiusKm,
      radiusMeters: Math.min(radiusKm * 1000, 50000),
      targetCustomerTypes,
      excludedCustomerTypes,
      trialStage,
      cityCoords,
      allPoints,
      allCenters,
      effectiveTarget,
      remainingPreviewLeads,
      taxonomyProfile,
      taxonomyHash,
      taxonomyVersion,
      // LocationIndex Coverage
      coverageMode,
      coveredLocations,
      coveredLocationsTotal,
      selectedLocationsCount,
      locationSource: 'LocationIndex',
      // ── Learning Loop Transparenz ──────────────────────────────────────────
      learning_applied: learningApplied,
      learning_weight_level: learningWeightLevel,
      learning_total_outcomes: learningTotalOutcomes,
      learned_priority_categories: learnedPriorityCategories,
      learned_boosted_keywords: boostedKeywordsForPlan,
      learned_excluded_categories: learnedExcludedCategories,
    };

    // ── ResearchRun erstellen ────────────────────────────────────────────────
    const now = new Date().toISOString();
    const run = await base44.asServiceRole.entities.ResearchRun.create({
      organization_id,
      status: 'queued',
      requested_target: effectiveTarget,
      leads_saved: 0,
      duplicates_skipped: 0,
      no_match_count: 0,
      outside_radius_count: 0,
      raw_hits: 0,
      progress_percent: 0,
      batch_index: 0,
      current_step: 'Recherche wird gestartet…',
      search_center_city: city,
      search_radius_km: radiusKm,
      target_customer_types: targetCustomerTypes.join(', '),
      excluded_customer_types: excludedCustomerTypes.join(', '),
      search_plan_json: JSON.stringify(searchPlanData),
      seen_place_ids: JSON.stringify([]),
      started_at: now,
      created_by: user.email,
      taxonomy_version: taxonomyVersion || 'unknown',
      industry_id: industryId,
      // LocationIndex Coverage-Diagnostik
      coverage_mode: coverageMode,
      covered_locations_count: coveredLocationsTotal,
      selected_locations_count: selectedLocationsCount,
      locations_searched_count: 0,
      search_points_used_count: 0,
    });

    console.info(`[startResearchRun] Created run=${run.id} org=${organization_id} target=${effectiveTarget} city=${city}`);

    return Response.json({
      success: true,
      research_run_id: run.id,
      status: 'queued',
      message: 'Recherche gestartet. Erste Kontakte erscheinen automatisch in Ihrer Leadliste.',
      effective_target: effectiveTarget,
      // monthly_usage mitgeben wenn Kontingent begrenzt – Frontend zeigt sanften Hinweis bei knappem Kontingent
      monthly_usage: monthlyRemaining !== -1 ? {
        remaining: monthlyRemaining,
        monthly_limit: monthlyContactLimit,
      } : null,
      searchConfig: { city, radiusKm, trialStage, targetCustomerTypes: targetCustomerTypes.slice(0, 3) }
    });

  } catch (error) {
    console.error('[startResearchRun] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});