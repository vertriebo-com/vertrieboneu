/**
 * generateKeywordSuggestions
 * ===========================
 * Generiert Keyword-Vorschläge für eine Organisation basierend auf:
 * - TaxonomyEntry (Branche)
 * - OrganizationSettings (Onboarding-Daten)
 * - OrgLearnedSignals (bereits gelernte Keywords)
 * - Optional: IndustryKeywordLibrary (falls vorhanden)
 *
 * Output: Keyword-Vorschläge mit source, reason, priority_score
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;

    // Organisation ermitteln
    let orgId = organization_id;
    if (!orgId) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'organisation_id erforderlich' }, { status: 400 });
      const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
      orgId = orgs?.[0]?.id;
    }
    if (!orgId) return Response.json({ error: 'Organisation nicht gefunden' }, { status: 404 });

    // Access Check nur wenn organization_id nicht direkt übergeben (Security)
    if (!organization_id) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 });
      const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);
      if (!isPlatformAdmin) {
        const orgs = await base44.asServiceRole.entities.Organization.filter({ id: orgId });
        const org = orgs?.[0];
        if (!org || (org.owner_email !== user.email)) {
          return Response.json({ error: 'Kein Zugriff' }, { status: 403 });
        }
      }
    }

    const suggestions = [];

    // ── 1. Organisation laden ────────────────────────────────────────────────
    const orgs = await base44.asServiceRole.entities.Organization.filter({ id: orgId });
    const org = orgs[0];
    if (!org) return Response.json({ error: 'Organisation nicht gefunden' }, { status: 404 });

    // ── 2. Industry-ID ermitteln ─────────────────────────────────────────────
    const settingsRecords = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id: orgId });
    const settings = {};
    settingsRecords.forEach(s => { settings[s.key] = s.value; });

    // ── Industry-ID normalisieren (identisch zu startResearchRun) ───────────
    // settings.industry_id ist kanonisch (z.B. "gebaeudereinigung")
    // org.industry ist ein Label-String (z.B. "Gebäudereinigung") → muss gemappt werden
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
      "Dachdecker":"dachdecker","Gerüstbau":"geruestbau","Trockenbau / Innenausbau":"trockenbau_innenausbau",
      "Fliesenleger":"fliesenleger","Bodenleger":"bodenleger",
      "Schlüsseldienst / Schließanlagen":"schluesseldienst_schliesanlagen","Schlüsseldienst":"schluesseldienst_schliesanlagen",
      "Schädlingsbekämpfung":"schaedlingsbekaempfung","Brandschutzservice":"brandschutzservice",
      "Aufzugservice":"aufzugservice","Tor- und Türtechnik":"tor_tuertechnik",
      "Photovoltaik-Service":"photovoltaik_service","Photovoltaik":"photovoltaik_service","Solar":"photovoltaik_service",
      "Umzugsunternehmen":"umzugsunternehmen","Druckerei / Werbetechnik":"druckerei_werbetechnik",
      "Aktenvernichtung / Dokumentenmanagement":"aktenvernichtung_dokumentenmanagement",
      "Energieberatung":"energieberatung","Arbeitsschutz / Arbeitssicherheit":"arbeitsschutz_arbeitssicherheit",
      "Arbeitsschutz":"arbeitsschutz_arbeitssicherheit","Datenschutz / Compliance":"datenschutz_compliance",
      "Datenschutz":"datenschutz_compliance","Messebau":"messebau",
      "Andere Branche / Sonstiges":"fallback_lokaler_dienstleister","Andere Branche":"fallback_lokaler_dienstleister",
      "Sonstiges":"fallback_lokaler_dienstleister","Druckerei / Werbetechnik":"druckerei_werbetechnik",
    };

    const rawIndustry = settings.industry_id || org.industry || null;
    if (!rawIndustry) {
      return Response.json({ 
        error: 'Keine Branche definiert',
        message: 'Bitte wählen Sie zuerst eine Branche im Onboarding oder in den Einstellungen.',
        suggestions: []
      }, { status: 400 });
    }
    // Normalisieren: wenn rawIndustry ein Label-String ist → kanonische ID ermitteln
    const industryId = LEGACY_INDUSTRY_MAP[rawIndustry] || rawIndustry;

    // ── 3. TaxonomyEntry laden ───────────────────────────────────────────────
    let taxonomyProfile = null;
    let taxonomyLoadError = null;
    try {
      const taxRecords = await base44.asServiceRole.entities.TaxonomyEntry.filter({ 
        industry_id: industryId, 
        is_active: true 
      });
      if (taxRecords[0]) {
        const rec = taxRecords[0];
        taxonomyProfile = {
          industry_id: rec.industry_id,
          label: rec.label,
          own_services: rec.own_services ? JSON.parse(rec.own_services) : [],
          target_customer_types: rec.target_customer_types ? JSON.parse(rec.target_customer_types) : [],
          search_keyword_variants: rec.search_keyword_variants ? JSON.parse(rec.search_keyword_variants) : {},
          negative_keywords: rec.negative_keywords ? JSON.parse(rec.negative_keywords) : [],
        };
      }
    } catch (taxErr) {
      taxonomyLoadError = taxErr instanceof Error ? taxErr.message : String(taxErr);
      console.warn('[generateKeywordSuggestions] Taxonomie-Ladefehler:', taxonomyLoadError);
    }

    if (!taxonomyProfile) {
      return Response.json({ 
        error: 'Taxonomie-Profil nicht gefunden',
        message: `Kein Taxonomie-Profil für Branche "${industryId}" verfügbar.`,
        suggestions: []
      }, { status: 404 });
    }

    // ── 4. OrgLearnedSignals laden (bereits gelernte Keywords) ───────────────
    let learnedSignals = null;
    let learnedLoadError = null;
    try {
      const learnedRecords = await base44.asServiceRole.entities.OrgLearnedSignals.filter({ 
        organization_id: orgId 
      }, '-updated_date', 1);
      if (learnedRecords[0]) {
        learnedSignals = learnedRecords[0];
      }
    } catch (learnedErr) {
      learnedLoadError = learnedErr instanceof Error ? learnedErr.message : String(learnedErr);
      console.warn('[generateKeywordSuggestions] OrgLearnedSignals-Ladefehler:', learnedLoadError);
    }

    // ── 5. Bestehende KeywordProfile laden (Duplikate vermeiden) ─────────────
    const existingProfiles = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ 
      organization_id: orgId 
    });
    const existingKeywords = new Set(existingProfiles.map(p => p.keyword.toLowerCase()));

    // ── 6. Vorschläge generieren ─────────────────────────────────────────────
    // WICHTIG: Nicht vorschlagen was bereits in Onboarding/Settings gewählt wurde!
    
    // Bereits in Onboarding/Settings gewählte Begriffe sammeln (Single Source of Truth)
    const onboardingTargets = (settings.target_customer_types || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    const onboardingServices = (settings.own_services || settings.services || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    const onboardingExcluded = (settings.excluded_customer_types || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    
    const alreadyChosenLower = new Set([
      ...onboardingTargets.map(t => t.toLowerCase()),
      ...onboardingServices.map(s => s.toLowerCase()),
      ...onboardingExcluded.map(e => e.toLowerCase()),
    ]);

    // 6a) Aus target_customer_types (Taxonomie) - NUR wenn NICHT bereits im Onboarding gewählt
    if (taxonomyProfile.target_customer_types) {
      for (const target of taxonomyProfile.target_customer_types.slice(0, 8)) {
        const kwLower = target.toLowerCase();
        if (existingKeywords.has(kwLower)) continue;
        if (alreadyChosenLower.has(kwLower)) continue; // NICHT doppelt vorschlagen!
        
        suggestions.push({
          keyword: target,
          source: 'taxonomy',
          reason: `Typische Zielgruppe für ${taxonomyProfile.label}`,
          priority_score: 80,
          status: 'suggested',
          metadata: { category: 'target_customer' }
        });
      }
    }

    // 6b) Aus search_keyword_variants (Taxonomie) - NUR wenn NICHT bereits gewählt
    if (taxonomyProfile.search_keyword_variants) {
      const variants = taxonomyProfile.search_keyword_variants;
      for (const [category, keywords] of Object.entries(variants)) {
        if (!Array.isArray(keywords)) continue;
        for (const kw of keywords.slice(0, 3)) {
          const kwLower = kw.toLowerCase();
          if (existingKeywords.has(kwLower)) continue;
          if (alreadyChosenLower.has(kwLower)) continue; // NICHT doppelt vorschlagen!
          
          suggestions.push({
            keyword: kw,
            source: 'taxonomy',
            reason: `Passender Suchbegriff aus Kategorie "${category}"`,
            priority_score: 70,
            status: 'suggested',
            metadata: { category: 'keyword_variant', variant_category: category }
          });
        }
      }
    }

    // 6c) Aus own_services (Taxonomie) - NUR wenn NICHT bereits im Onboarding gewählt
    if (taxonomyProfile.own_services) {
      for (const service of taxonomyProfile.own_services.slice(0, 5)) {
        const kwLower = service.toLowerCase();
        if (existingKeywords.has(kwLower)) continue;
        if (alreadyChosenLower.has(kwLower)) continue; // NICHT doppelt vorschlagen!
        
        suggestions.push({
          keyword: service,
          source: 'taxonomy',
          reason: `Typische Dienstleistung für ${taxonomyProfile.label}`,
          priority_score: 65,
          status: 'suggested',
          metadata: { category: 'own_service' }
        });
      }
    }

    // 6d) Aus OrgLearnedSignals (bereits gelernte, aber noch nicht als Profile) - NUR wenn NICHT bereits gewählt
    if (learnedSignals && learnedSignals.boosted_keywords) {
      try {
        const boostedKws = JSON.parse(learnedSignals.boosted_keywords);
        for (const kwObj of boostedKws.slice(0, 5)) {
          const kw = typeof kwObj === 'string' ? kwObj : (kwObj.keyword || '');
          const kwLower = kw.toLowerCase();
          if (existingKeywords.has(kwLower) || !kw) continue;
          if (alreadyChosenLower.has(kwLower)) continue; // NICHT doppelt vorschlagen!
          
          const stats = typeof kwObj === 'object' ? kwObj : { score: 1, total_count: 1 };
          
          suggestions.push({
            keyword: kw,
            source: 'outcome_feedback',
            reason: `Aus ${stats.total_count || 1} Lead-Ergebnissen gelernt`,
            priority_score: Math.min(100, 60 + (stats.score || 0) * 5),
            status: 'suggested',
            metadata: { 
              category: 'learned',
              won_count: stats.won_count || 0,
              score: stats.score || 0
            }
          });
        }
      } catch (parseErr) {
        const parseError = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.warn('[generateKeywordSuggestions] Boosted-Keywords-Parsefehler:', parseError);
      }
    }

    // ── 7. Duplikate entfernen und nach priority_score sortieren ────────────
    const uniqueSuggestions = [];
    const seenKeywords = new Set();
    for (const s of suggestions) {
      const kwLower = s.keyword.toLowerCase();
      if (seenKeywords.has(kwLower)) continue;
      seenKeywords.add(kwLower);
      
      // status_hint für UI: Bereits gewählte Begriffe markieren
      let statusHint = 'suggested';
      if (onboardingTargets.some(t => t.toLowerCase() === kwLower)) {
        statusHint = 'already_active_target_customer';
      } else if (onboardingServices.some(s => s.toLowerCase() === kwLower)) {
        statusHint = 'already_active_service';
      } else if (onboardingExcluded.some(e => e.toLowerCase() === kwLower)) {
        statusHint = 'blocked';
      }
      
      uniqueSuggestions.push({
        ...s,
        status_hint: statusHint,
        keyword_type: s.metadata?.category === 'target_customer' ? 'target_customer' :
                      s.metadata?.category === 'own_service' ? 'service' :
                      s.metadata?.category === 'keyword_variant' ? 'search_variant' :
                      s.metadata?.category === 'learned' ? 'learned_query' : 'manual'
      });
    }

    uniqueSuggestions.sort((a, b) => b.priority_score - a.priority_score);

    // ── 8. Antwort ───────────────────────────────────────────────────────────
    return Response.json({
      success: true,
      organization_id: orgId,
      industry_id: industryId,
      industry_label: taxonomyProfile.label,
      suggestions: uniqueSuggestions.slice(0, 20), // Max 20 Vorschläge
      total_suggestions: uniqueSuggestions.length,
      existing_keywords_count: existingKeywords.size,
      onboarding_data: {
        target_customer_types: onboardingTargets,
        own_services: onboardingServices,
        excluded_customer_types: onboardingExcluded,
      },
      source_breakdown: {
        taxonomy: uniqueSuggestions.filter(s => s.source === 'taxonomy').length,
        outcome_feedback: uniqueSuggestions.filter(s => s.source === 'outcome_feedback').length,
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[generateKeywordSuggestions] Error:', errorMessage, error instanceof Error ? error.stack : undefined);
    return Response.json({ error: errorMessage, success: false }, { status: 500 });
  }
});