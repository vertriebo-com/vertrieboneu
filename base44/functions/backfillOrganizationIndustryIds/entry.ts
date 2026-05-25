/**
 * backfillOrganizationIndustryIds
 * ================================
 * Maintenance-Funktion: Schreibt canonical industry_id für bestehende Organisationen
 * die noch kein industry_id-Setting haben (Bestandsdaten vor dem IndustryAutocomplete-Fix).
 *
 * Aufruf: POST { dry_run: true }   → Vorschau ohne Schreibzugriff
 *         POST { dry_run: false }  → Schreibt industry_id in OrganizationSettings
 *
 * Logik:
 *  1. Alle Orgs laden
 *  2. Orgs ohne industry_id-Setting ermitteln
 *  3. industry_name / own_industry / org.industry → LEGACY_MAP → TaxonomyEntry-Label-Match
 *  4. Eindeutige Treffer: industry_id schreiben (oder dry_run melden)
 *  5. Unklare Fälle: needs_review melden
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// Gleiche Map wie in startResearchRun – Single Source of Truth wäre besser, aber
// no local imports erlaubt, daher hier dupliziert.
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
  "Druckerei / Werbetechnik":"marketing_webdesign_werbung","Druckerei":"marketing_webdesign_werbung",
};

function normStr(s) {
  return String(s || "").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();
}

/**
 * Versucht, einen Label-String auf eine TaxonomyEntry-ID zu mappen.
 * Gibt { id, confidence } zurück oder null.
 */
function resolveIndustryId(label, taxonomyEntries) {
  if (!label) return null;

  // 1. Direkt aus Legacy-Map
  if (LEGACY_INDUSTRY_MAP[label]) {
    return { id: LEGACY_INDUSTRY_MAP[label], confidence: "legacy_map" };
  }

  const normLabel = normStr(label);

  // 2. Exakter Treffer auf TaxonomyEntry.label (normalisiert)
  const exactMatch = taxonomyEntries.find(e => normStr(e.label) === normLabel);
  if (exactMatch) {
    return { id: exactMatch.industry_id, confidence: "exact_label" };
  }

  // 3. Teilstring-Treffer auf TaxonomyEntry.label
  const partialMatches = taxonomyEntries.filter(e => {
    const norm = normStr(e.label);
    return norm.includes(normLabel) || normLabel.includes(norm);
  });
  if (partialMatches.length === 1) {
    return { id: partialMatches[0].industry_id, confidence: "partial_label" };
  }

  // 4. Alias-Treffer
  for (const entry of taxonomyEntries) {
    let aliases = [];
    try { aliases = JSON.parse(entry.aliases || "[]"); } catch {}
    if (aliases.some(a => normStr(a) === normLabel)) {
      return { id: entry.industry_id, confidence: "alias_match" };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !["admin","platform_owner","platform_admin"].includes(user.role)) {
      return Response.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run !== false; // default: true (sicher)

    console.info(`[backfill] START dry_run=${dry_run} user=${user.email}`);

    // ── 1. Alle Taxonomy-Einträge laden (als Matching-Basis) ─────────────────
    const taxonomyEntries = await base44.asServiceRole.entities.TaxonomyEntry.list('-sort_order', 200);
    console.info(`[backfill] ${taxonomyEntries.length} Taxonomy-Einträge geladen`);

    // ── 2. Alle Organisationen laden ─────────────────────────────────────────
    const allOrgs = await base44.asServiceRole.entities.Organization.list('-created_date', 500);
    console.info(`[backfill] ${allOrgs.length} Organisationen gefunden`);

    // ── 3. Alle industry_id-Settings auf einmal laden ─────────────────────────
    const industryIdSettings = await base44.asServiceRole.entities.OrganizationSettings.filter({ key: 'industry_id' });
    const orgsWithIndustryId = new Set(industryIdSettings.map(s => s.organization_id));
    console.info(`[backfill] ${orgsWithIndustryId.size} Orgs haben bereits industry_id`);

    // ── 4. Alle industry_name + own_industry Settings laden ───────────────────
    const [industryNameSettings, ownIndustrySettings] = await Promise.all([
      base44.asServiceRole.entities.OrganizationSettings.filter({ key: 'industry_name' }),
      base44.asServiceRole.entities.OrganizationSettings.filter({ key: 'own_industry' }),
    ]);
    const industryNameMap = {};
    industryNameSettings.forEach(s => { industryNameMap[s.organization_id] = s.value; });
    const ownIndustryMap = {};
    ownIndustrySettings.forEach(s => { ownIndustryMap[s.organization_id] = s.value; });

    // ── 5. Für jede Org ohne industry_id: Branche auflösen ────────────────────
    const results = {
      total_orgs: allOrgs.length,
      already_have_industry_id: orgsWithIndustryId.size,
      processed: 0,
      written: 0,
      skipped_no_industry: 0,
      needs_review: [],
      mapped: [],
      dry_run,
    };

    const orgsToProcess = allOrgs.filter(o => !orgsWithIndustryId.has(o.id));
    results.processed = orgsToProcess.length;
    console.info(`[backfill] ${orgsToProcess.length} Orgs zu verarbeiten`);

    for (const org of orgsToProcess) {
      // Branchenwert ermitteln (Priorität: Settings > org.industry)
      const industryLabel =
        industryNameMap[org.id] ||
        ownIndustryMap[org.id] ||
        org.industry ||
        null;

      if (!industryLabel || industryLabel.trim() === '') {
        results.skipped_no_industry++;
        continue;
      }

      const resolved = resolveIndustryId(industryLabel, taxonomyEntries);

      if (!resolved) {
        results.needs_review.push({
          org_id: org.id,
          org_name: org.name,
          industry_label: industryLabel,
          reason: "no_match_found",
        });
        console.warn(`[backfill] needs_review: org=${org.id} label="${industryLabel}"`);
        continue;
      }

      results.mapped.push({
        org_id: org.id,
        org_name: org.name,
        industry_label: industryLabel,
        resolved_id: resolved.id,
        confidence: resolved.confidence,
        written: !dry_run,
      });

      if (!dry_run) {
        // industry_id schreiben
        await base44.asServiceRole.entities.OrganizationSettings.create({
          organization_id: org.id,
          key: 'industry_id',
          value: resolved.id,
        });
        // industry_name sicherstellen falls fehlt
        if (!industryNameMap[org.id]) {
          await base44.asServiceRole.entities.OrganizationSettings.create({
            organization_id: org.id,
            key: 'industry_name',
            value: industryLabel,
          });
        }
        results.written++;
        console.info(`[backfill] Written: org=${org.id} industry_id=${resolved.id} (${resolved.confidence})`);
      }
    }

    const summary = {
      dry_run,
      total_orgs: results.total_orgs,
      already_have_industry_id: results.already_have_industry_id,
      to_process: results.processed,
      skipped_no_industry: results.skipped_no_industry,
      mapped_count: results.mapped.length,
      needs_review_count: results.needs_review.length,
      written: results.written,
      needs_review: results.needs_review,
      mapped: results.mapped,
    };

    console.info(`[backfill] DONE: ${JSON.stringify({
      dry_run, mapped: results.mapped.length, needs_review: results.needs_review.length, written: results.written
    })}`);

    return Response.json({ success: true, ...summary });

  } catch (error) {
    console.error('[backfillOrganizationIndustryIds] Error:', error?.message);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});