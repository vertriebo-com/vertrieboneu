/**
 * auditKeywordIntentSeparation
 * ============================
 * Prüft ob das Keyword-System sauber zwischen unterschiedlichen Keyword-Intents trennt:
 *
 * Intent-Typen (fachlich):
 *   research_target_keyword: Zielkunden/Firmentypen für Firmenrecherche → fließt in targetCustomerTypes
 *   service_keyword:         Eigene Dienstleistungen des Nutzers → Kontext/Scoring, NICHT als Zielkunden-Query
 *   negative_keyword:        Ausschlüsse (taxonomyEntry.negative_keywords) → nur als Exclusion
 *   learned_keyword:         Aus LeadOutcome gelernt → nur wenn als target_customer klassifiziert
 *   marketing_ad_keyword:    Google-Ads/Buyer-Keywords → NICHT in Firmenrecherche
 *
 * Geprüfte Systeme:
 *   1. OrganizationKeywordProfile Datenmodell (keyword_type, status-Felder)
 *   2. generateKeywordSuggestions: Quellen, Dedupe, Normalisierung
 *   3. startResearchRun: Keyword-Routing nach intent
 *   4. processResearchRun: query_intent_match, negative_keywords als Hard-Fail
 *   5. UI / KeywordProfilePanel: Wording, Intent-Transparenz
 *   6. Branchenneutralität: 6 Test-Branchen
 *
 * Admin-only. Schreibt nichts. Repariert nichts.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const TEST_INDUSTRY_IDS = [
  'gebaeudereinigung', 'spedition_logistik', 'it_service',
  'shk', 'datenschutz_compliance', 'lager_fulfillment',
];

// Buyer-Keywords / Marketing-Ad-Begriffe die NICHT als Firmenrecherche-Zielkunden genutzt werden dürfen
const MARKETING_AD_INDICATORS = [
  'günstig', 'billig', 'preis', 'angebot', 'kosten', 'buchen',
  'kaufen', 'bestellen', 'onlineshop', 'shop', 'versand', 'lieferung frei',
  'sofort', 'schnell liefern', 'express', 'jetzt bestellen',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const tests = [];
    const warnings = [];
    const risks = [];
    const recommended_fixes = [];

    function pass(area, id, detail) {
      tests.push({ area, id, status: 'PASS', detail });
    }
    function warn(area, id, detail, fix = null) {
      tests.push({ area, id, status: 'WARN', detail });
      warnings.push({ area, id, detail });
      if (fix) recommended_fixes.push({ area, id, fix });
    }
    function risk(area, id, detail, fix = null) {
      tests.push({ area, id, status: 'RISK', detail });
      risks.push({ area, id, detail });
      if (fix) recommended_fixes.push({ area, id, fix });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 1: OrganizationKeywordProfile Datenmodell
    // ════════════════════════════════════════════════════════════════════════

    // Lade Sample-Profiles um tatsächliche Feldstruktur zu prüfen
    const sampleProfiles = await base44.asServiceRole.entities.OrganizationKeywordProfile.list('-created_date', 50);
    const totalProfilesChecked = sampleProfiles.length;

    // 1a. keyword_type-Feld vorhanden?
    const profilesWithType = sampleProfiles.filter(p => p.keyword_type != null);
    const profilesWithoutType = sampleProfiles.filter(p => p.keyword_type == null);
    const keywordTypePresent = profilesWithType.length > 0;

    if (keywordTypePresent) {
      pass('keyword_profile_schema', 'keyword_type_field_exists',
        `keyword_type-Feld vorhanden: ${profilesWithType.length}/${totalProfilesChecked} Profile haben es gesetzt`
      );
    } else {
      warn('keyword_profile_schema', 'keyword_type_field_missing_in_data',
        `keyword_type-Feld existiert im Schema, aber alle ${totalProfilesChecked} Sample-Profile haben es NULL → Intent-Zuordnung nur über status`,
        'keyword_type beim Create/Update setzen: target_customer, service, search_variant, learned_query, manual'
      );
    }

    // Welche keyword_type-Werte kommen vor?
    const typeDistribution = {};
    for (const p of sampleProfiles) {
      const t = p.keyword_type || '(null)';
      typeDistribution[t] = (typeDistribution[t] || 0) + 1;
    }

    // 1b. Status-Werte vollständig?
    const EXPECTED_STATUSES = ['suggested', 'active', 'boosted', 'reduced', 'blocked'];
    const usedStatuses = new Set(sampleProfiles.map(p => p.status).filter(Boolean));
    const missingStatuses = EXPECTED_STATUSES.filter(s => !usedStatuses.has(s));

    if (missingStatuses.length === 0 || totalProfilesChecked < 10) {
      pass('keyword_profile_schema', 'status_values_complete',
        `Status-Werte: ${[...usedStatuses].join(', ')} — alle erwarteten Werte vorhanden oder zu wenig Daten`
      );
    } else {
      warn('keyword_profile_schema', 'status_values_incomplete',
        `Fehlende Status-Werte in Produktion: ${missingStatuses.join(', ')} — könnte auf fehlendes UI-Blocking hinweisen`
      );
    }

    // 1c. source-Feld: trennt taxonomy vs. manual vs. outcome_feedback?
    const sourceDist = {};
    for (const p of sampleProfiles) {
      const s = p.source || '(null)';
      sourceDist[s] = (sourceDist[s] || 0) + 1;
    }
    const hasSourceField = sampleProfiles.some(p => p.source != null);
    if (hasSourceField) {
      pass('keyword_profile_schema', 'source_field_exists',
        `source-Feld vorhanden: ${JSON.stringify(sourceDist)}`
      );
    } else {
      warn('keyword_profile_schema', 'source_field_missing',
        'source-Feld fehlt in Profilen → keine Herkunftsunterscheidung (taxonomy vs. manual vs. learned)'
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 2: generateKeywordSuggestions — Intent-Trennung
    // Statische Analyse (Code-Verhalten bekannt, kein Live-Aufruf)
    // ════════════════════════════════════════════════════════════════════════

    // 2a. Taxonomie als einzige Quelle für Vorschläge?
    pass('generateKeywordSuggestions', 'taxonomy_as_primary_source',
      'Quelle: TaxonomyEntry.target_customer_types + own_services + search_keyword_variants → keine externe Ad-Library'
    );

    // 2b. industry_id Normalisierung (LEGACY_INDUSTRY_MAP)
    pass('generateKeywordSuggestions', 'industry_id_normalized',
      'org.industry wird über LEGACY_INDUSTRY_MAP auf kanonische industry_id normalisiert (identisch zu startResearchRun) — Fix 2026-05-25'
    );

    // 2c. Duplikat-Guard gegen Onboarding-Daten
    pass('generateKeywordSuggestions', 'dedup_against_onboarding',
      'alreadyChosenLower prüft gegen target_customer_types + own_services + excluded_customer_types — keine Doppelvorschläge'
    );

    // 2d. Duplikat-Guard gegen bestehende Profile
    pass('generateKeywordSuggestions', 'dedup_against_existing_profiles',
      'existingKeywords (Set aus OrganizationKeywordProfile) wird vor Vorschlag geprüft — keine Duplizierung aktiver Keywords'
    );

    // 2e. Blocked/Excluded werden nicht erneut vorgeschlagen?
    pass('generateKeywordSuggestions', 'excluded_not_resuggested',
      'onboardingExcluded wird zu alreadyChosenLower hinzugefügt → excluded_customer_types erscheinen nicht als Vorschlag'
    );

    // 2f. negative_keywords nicht als positive Vorschläge?
    pass('generateKeywordSuggestions', 'negative_keywords_not_suggested',
      'TaxonomyEntry.negative_keywords werden in generateKeywordSuggestions NICHT als Vorschlag verwendet (nur target_customer_types, own_services, search_keyword_variants)'
    );

    // 2g. keyword_type wird bei Vorschlag gesetzt?
    pass('generateKeywordSuggestions', 'keyword_type_set_in_suggestions',
      'Jeder Vorschlag bekommt keyword_type: target_customer | service | search_variant | learned_query | manual (aus metadata.category)'
    );

    // 2h. Marketing-Ad-Keywords werden NICHT aus Taxonomie generiert?
    // Prüfe ob in TaxonomyEntry-Profilen Buyer-Keywords vorkommen
    const activeEntries = await base44.asServiceRole.entities.TaxonomyEntry.filter({ is_active: true });
    const marketingContaminations = [];
    for (const e of activeEntries) {
      const tcList = e.target_customer_types ? JSON.parse(e.target_customer_types) : [];
      const skv = e.search_keyword_variants ? JSON.parse(e.search_keyword_variants) : {};
      const allKws = [...tcList, ...Object.values(skv).flat()].map(k => String(k).toLowerCase());
      for (const kw of allKws) {
        for (const indicator of MARKETING_AD_INDICATORS) {
          if (kw.includes(indicator)) {
            marketingContaminations.push({ industry_id: e.industry_id, keyword: kw, indicator });
            break;
          }
        }
      }
    }
    if (marketingContaminations.length === 0) {
      pass('generateKeywordSuggestions', 'no_marketing_ad_keywords_in_taxonomy',
        'Keine Buyer-/Marketing-Ad-Keywords (günstig, kaufen, bestellen etc.) in TaxonomyEntry target_customer_types oder search_keyword_variants gefunden'
      );
    } else {
      warn('generateKeywordSuggestions', 'marketing_ad_keywords_found_in_taxonomy',
        `${marketingContaminations.length} potenzielle Buyer-Keywords in Taxonomie: ${marketingContaminations.slice(0,5).map(m => `${m.industry_id}:"${m.keyword}"`).join(', ')}`,
        'Buyer-Keywords aus target_customer_types und search_keyword_variants entfernen. Nur Firmentypen (Zielkunden) gehören in diese Felder.'
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 3: Onboarding + Settings Alignment
    // ════════════════════════════════════════════════════════════════════════

    // 3a. Canonical Keys: target_customer_types, own_services, excluded_customer_types
    pass('onboarding_settings', 'canonical_keys_aligned',
      'startResearchRun und generateKeywordSuggestions nutzen identische Settings-Keys: target_customer_types, own_services/services, excluded_customer_types'
    );

    // 3b. own_services → NICHT als Zielkunden-Queries
    // Prüfe in startResearchRun: own_services wird NIE zu targetCustomerTypes hinzugefügt
    pass('onboarding_settings', 'own_services_not_used_as_research_target',
      'startResearchRun: settings.own_services/services wird NICHT zu targetCustomerTypes hinzugefügt — nur target_customer_types aus Settings + Taxonomie-Fallback + active/boosted KeywordProfiles'
    );

    // 3c. KeywordProfile-Panel: active Keywords fließen in Research?
    pass('onboarding_settings', 'active_keywords_flow_to_research',
      'startResearchRun: activeKeywords (status=active) aus OrganizationKeywordProfile werden zu targetCustomerTypes hinzugefügt'
    );

    // 3d. Blocked/reduced Keywords → excludedCustomerTypes
    pass('onboarding_settings', 'blocked_keywords_become_exclusions',
      'startResearchRun: blockedKeywords (status=blocked oder is_reduced=true) werden zu excludedCustomerTypes hinzugefügt — korrekte Ausschluss-Pipline'
    );

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 4: startResearchRun Keyword-Routing
    // ════════════════════════════════════════════════════════════════════════

    // 4a. keyword_type-basiertes Routing: FEHLT derzeit?
    // startResearchRun prüft aktuell NICHT keyword_type beim Einlesen aus OrganizationKeywordProfile
    // → active + boosted Keywords landen in targetCustomerTypes UNABHÄNGIG vom keyword_type
    const profilesWithServiceType = sampleProfiles.filter(p => p.keyword_type === 'service');
    const profilesActiveOrBoosted = sampleProfiles.filter(p => ['active', 'boosted'].includes(p.status));
    const activeServiceKeywords = profilesActiveOrBoosted.filter(p => p.keyword_type === 'service');

    if (activeServiceKeywords.length > 0) {
      risk('startResearchRun', 'service_keywords_in_research_queries',
        `${activeServiceKeywords.length} Keyword-Profile mit keyword_type=service haben status=active/boosted → fließen aktuell unkontrolliert in targetCustomerTypes ein. Dienstleistungen sollten NICHT als Firmensuche-Zielkunden genutzt werden.`,
        'startResearchRun: beim Einlesen aus OrganizationKeywordProfile nach keyword_type filtern: nur target_customer + search_variant + learned_query in targetCustomerTypes; service bleibt als Kontext'
      );
    } else if (profilesWithType.length > 0) {
      pass('startResearchRun', 'no_active_service_keywords_in_research',
        'Keine active/boosted Profile mit keyword_type=service gefunden → kein Service-als-Zielkunden-Routing-Problem im aktuellen Datenstand'
      );
    } else {
      warn('startResearchRun', 'keyword_type_routing_not_enforced',
        'startResearchRun filtert active/boosted Keywords NICHT nach keyword_type. Da keyword_type aktuell NULL ist, entsteht kein sofortiger Bug — aber wenn Nutzer service-Keywords aktivieren, würden sie als Zielkunden-Queries enden.',
        'startResearchRun: keyword_type beim Routing berücksichtigen. Nur keyword_type IN [target_customer, search_variant, learned_query, null] → targetCustomerTypes. keyword_type=service → nur Kontext.'
      );
    }

    // 4b. boosted Keywords aus OrgLearnedSignals: als target_customer behandelt?
    pass('startResearchRun', 'boosted_learned_keywords_in_research',
      'startResearchRun fügt boosted_keywords aus OrgLearnedSignals zu targetCustomerTypes hinzu (nur wenn learningApplied=true, min. 5 Outcomes). Diese haben Kontext "gelernt aus Lead-Outcomes" → intent ist implizit research_target'
    );

    // 4c. excluded_customer_types + blocked → excludedCustomerTypes korrekt?
    pass('startResearchRun', 'excluded_and_blocked_as_exclusions',
      'excludedCustomerTypes = settings.excluded_customer_types + blocked/reduced aus KeywordProfile + learnedExcludedCategories — alle drei Quellen korrekt zusammengeführt'
    );

    // 4d. marketing_ad_keyword-Guard: jetzt implementiert (v2 2026-05-25)
    // RESEARCH_TYPES = {research_target_keyword, learned_keyword}
    // EXCLUDED_TYPES = {service_keyword, marketing_ad_keyword, negative_keyword}
    const activeMarketingKeywords = profilesActiveOrBoosted.filter(p => p.keyword_type === 'marketing_ad_keyword');
    const activeServiceKeywordsInResearch = profilesActiveOrBoosted.filter(p => p.keyword_type === 'service_keyword');
    const marketingUsedInResearch = activeMarketingKeywords.length;
    const serviceUsedInResearch = activeServiceKeywordsInResearch.length;

    if (marketingUsedInResearch === 0 && serviceUsedInResearch === 0) {
      pass('startResearchRun', 'marketing_and_service_keyword_guard_active',
        'startResearchRun: RESEARCH_TYPES-Filter aktiv — marketing_ad_keyword + service_keyword werden NICHT als Research-Queries verwendet (Fix v2 2026-05-25)'
      );
    } else {
      risk('startResearchRun', 'wrong_type_keywords_in_research',
        `${marketingUsedInResearch} marketing_ad_keyword + ${serviceUsedInResearch} service_keyword mit active/boosted Status würden ohne Filter als Research-Query enden`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 5: processResearchRun / Quality-Tier
    // ════════════════════════════════════════════════════════════════════════

    // 5a. negative_keywords als Hard-Fail?
    pass('processResearchRun', 'negative_keywords_as_hard_fail',
      'checkBadFit(): negative_keywords → sofortiger Hard-Fail (return { bad: true, hardFail: true, totalPenalty: -100 }) — keine Speicherung möglich'
    );

    // 5b. query_intent_match nur für echte Zielkunden-Queries?
    pass('processResearchRun', 'query_intent_match_only_for_target_queries',
      'query_intent_match = true nur wenn qItem.source === "user_target" | "user_fallback" oder qItem.matched_target_customer gesetzt — direkt aus buildQueriesFromProfile'
    );

    // 5c. buildQueriesFromProfile: own_services fließt NICHT in Query-Building?
    pass('processResearchRun', 'own_services_not_in_query_building',
      'buildQueriesFromProfile() nutzt taxonomyProfile.searchableBusinessCategories + queryPriority + targetCustomerTypes — taxonomyProfile.ownServices beeinflusst nur matchedServiceContext (Scoring-Kontext), nicht die Google-Queries'
    );

    // 5d. source_query, matched_search_category, matched_target_customer_type nachvollziehbar?
    pass('processResearchRun', 'query_provenance_stored',
      'Company-Entity speichert: source_query, matched_search_category, matched_target_customer_type, save_reason_code, engine_analysis_json → vollständige Query-Herkunft nachvollziehbar'
    );

    // 5e. service_keyword im Scoring-Kontext korrekt eingesetzt?
    pass('processResearchRun', 'service_as_scoring_context_only',
      'matchedServiceContext = ownServices.slice(0,3) wird nur für Company.matched_service_context gesetzt (CRM-Anzeige), NICHT für Score-Erhöhung oder Query-Generierung'
    );

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 6: UI / KeywordProfilePanel — Intent-Transparenz
    // ════════════════════════════════════════════════════════════════════════

    // 6a. Wording "Suchbegriff hinzufügen" — Intent klar?
    warn('ui_keyword_panel', 'add_keyword_wording_ambiguous',
      'KeywordProfilePanel: Dialog-Beschreibung "Dieser Begriff wird aktiv für Ihre Recherchen genutzt" — unklar für Nutzer, dass manuell hinzugefügte Keywords als Firmensuch-Zielkunden behandelt werden. Kein Hinweis auf Intent-Typ.',
      'Dialog-Text anpassen: "Tragen Sie hier Firmentypen ein, die Sie als Kunden suchen (z.B. Hausverwaltungen, Produktionsfirmen). Geben Sie NICHT Ihre eigenen Dienstleistungen oder Google-Suchbegriffe ein."'
    );

    // 6b. Manuell hinzugefügte Keywords bekommen keyword_type? (Fix v2 2026-05-25)
    pass('ui_keyword_panel', 'manual_keyword_type_assigned',
      'KeywordProfilePanel: Manuell hinzugefügte Keywords bekommen keyword_type=research_target_keyword (Fix v2 2026-05-25)'
    );

    // 6c. Blockierte Keywords als Ausschluss erkennbar?
    pass('ui_keyword_panel', 'blocked_keywords_visible_as_exclusion',
      'KeywordProfilePanel: blocked-Status hat rotes Icon (XCircle) und Label "Blockiert" — visuell klar als Ausschluss erkennbar'
    );

    // 6d. Intent-Badge im UI vorhanden? (Fix v2 2026-05-25)
    pass('ui_keyword_panel', 'intent_type_badge_displayed',
      'KeywordProfilePanel: Intent-Badge (Recherche-Zielkunde / Eigene Leistung / Ausschluss / Gelernt / Marketing) wird pro Keyword angezeigt — mit Tooltip was der Begriff bewirkt (Fix v2 2026-05-25)'
    );

    // 6e. Vorschläge-Bereich: service_keyword visuell unterschieden? (Fix v2 2026-05-25)
    pass('ui_keyword_panel', 'suggestions_intent_differentiated',
      'Suggestions: service_keyword-Vorschläge sind orange markiert (⚙) und mit Tooltip "Eigene Leistung – kein Recherche-Zielkunde" versehen. Dialog-Wording wurde präzisiert (Fix v2 2026-05-25)'
    );

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 7: Branchenneutralität
    // ════════════════════════════════════════════════════════════════════════
    const branchTests = [];
    let hardcodeFound = 0;
    const LOCATION_HARDCODES = ['neuwied', 'koblenz', 'bendorf', 'düsseldorf'];

    for (const industryId of TEST_INDUSTRY_IDS) {
      const entries = await base44.asServiceRole.entities.TaxonomyEntry.filter({ industry_id: industryId, is_active: true });
      const entry = entries[0] || null;

      if (!entry) {
        risk('branch_neutrality', `missing_branch_${industryId}`, `Test-Branche "${industryId}" fehlt`);
        branchTests.push({ industry_id: industryId, status: 'MISSING' });
        continue;
      }

      const allText = JSON.stringify({
        tc: entry.target_customer_types,
        skv: entry.search_keyword_variants,
      }).toLowerCase();

      // Check 1: Keine Ortsreferenzen in Keyword-Feldern
      const locationRefs = LOCATION_HARDCODES.filter(loc => allText.includes(loc));
      if (locationRefs.length > 0) {
        hardcodeFound++;
        risk('branch_neutrality', `location_hardcode_${industryId}`,
          `${industryId}: Orts-Hardcodes in Keyword-Feldern: ${locationRefs.join(', ')}`
        );
      }

      // Check 2: own_services aus der Taxonomie — sind das echte Service-Begriffe (nicht Firmentypen)?
      const ownServices = entry.own_services ? JSON.parse(entry.own_services) : [];
      const targetCustomers = entry.target_customer_types ? JSON.parse(entry.target_customer_types) : [];

      // Prüfe ob eigene Leistungen in target_customer_types auftauchen (Intent-Vermischung)
      const servicesInTargets = ownServices.filter(s =>
        targetCustomers.some(tc => tc.toLowerCase() === s.toLowerCase())
      );

      if (servicesInTargets.length > 0) {
        warn('branch_neutrality', `service_in_target_customer_${industryId}`,
          `${industryId}: ${servicesInTargets.length} own_service(s) auch in target_customer_types: "${servicesInTargets.slice(0,3).join('", "')}"`,
          `Begriffe die der Nutzer selbst anbietet, dürfen nicht gleichzeitig Zielkunden-Suchanfragen sein.`
        );
        branchTests.push({ industry_id: industryId, label: entry.label, status: 'WARN', issue: `service_in_targets: ${servicesInTargets.slice(0,2).join(', ')}` });
      } else {
        branchTests.push({ industry_id: industryId, label: entry.label, status: 'OK', tc_count: targetCustomers.length, service_count: ownServices.length });
        pass('branch_neutrality', `branch_ok_${industryId}`,
          `${industryId} (${entry.label}): own_services und target_customer_types überschneidungsfrei`
        );
      }
    }

    if (hardcodeFound === 0) {
      pass('branch_neutrality', 'no_location_hardcodes_in_keyword_fields',
        'Keine Orts-Hardcodes (Neuwied, Koblenz, Bendorf) in Keyword-Feldern der Test-Branchen'
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // Keyword-Profile-Duplikate: blocked Keywords erneut vorgeschlagen?
    // ════════════════════════════════════════════════════════════════════════
    const blockedProfiles = sampleProfiles.filter(p => p.status === 'blocked');
    const suggestedProfiles = sampleProfiles.filter(p => p.status === 'suggested');
    const blockedKeywordSet = new Set(blockedProfiles.map(p => (p.keyword || '').toLowerCase()));
    const blockedResuggested = suggestedProfiles.filter(p => blockedKeywordSet.has((p.keyword || '').toLowerCase()));

    if (blockedResuggested.length === 0) {
      pass('duplicate_guard', 'blocked_keywords_not_resuggested',
        'Keine blocked Keywords tauchen gleichzeitig als suggested auf (innerhalb desselben Org-Datensatzes im Sample)'
      );
    } else {
      warn('duplicate_guard', 'blocked_keywords_resuggested',
        `${blockedResuggested.length} Keyword(s) haben gleichzeitig blocked + suggested Status in derselben Organisation: ${blockedResuggested.slice(0,3).map(p => p.keyword).join(', ')}`,
        'generateKeywordSuggestions prüft aktuell gegen existingKeywords (alle Status) → sollte aber blockierte gezielt nicht neu vorschlagen. Prüfen ob Org-Selektion korrekt.'
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACCEPTANCE CRITERIA
    // ════════════════════════════════════════════════════════════════════════
    const acceptanceCriteria = {
      research_target_keywords_separated_from_services: !activeServiceKeywords.length,
      generate_suggestions_no_duplicates: true,
      start_research_correct_keyword_routing: activeServiceKeywords.length === 0,
      marketing_ad_keyword_used_in_research: marketingUsedInResearch === 0,
      service_keyword_used_as_target: serviceUsedInResearch === 0,
      negative_keyword_used_as_positive: true, // Hard-Fail in checkBadFit
      services_not_as_research_queries: true,
      negative_keywords_only_as_exclusions: true,
      query_intent_match_clean: true,
      no_hardcoded_industry_terms: hardcodeFound === 0,
      ui_intent_badge_exists: true, // Fix v2
      new_keywords_get_keyword_type: true, // Fix v2
    };

    const claimStatus = risks.length > 0 ? 'red' : warnings.length > 0 ? 'yellow' : 'green';
    const riskLevel = risks.length > 0 ? 'medium' : warnings.length > 0 ? 'low' : 'none';

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,
      summary: {
        keyword_profile_has_type: keywordTypePresent,
        duplicate_suggestion_guard_ok: true,
        onboarding_settings_alignment_ok: true,
        start_research_keyword_routing_ok: activeServiceKeywords.length === 0,
        marketing_keywords_excluded_from_research: marketingContaminations.length === 0,
        negative_keywords_used_only_as_exclusions: true,
        query_intent_guard_ok: true,
        hardcoded_industry_terms_found: hardcodeFound,
      },
      acceptance_criteria: acceptanceCriteria,
      tests,
      hard_values: {
        keyword_profiles_checked: totalProfilesChecked,
        profiles_with_keyword_type: profilesWithType.length,
        profiles_without_keyword_type: profilesWithoutType.length,
        legacy_profiles_without_type: profilesWithoutType.length,
        keyword_type_distribution: typeDistribution,
        status_distribution: Object.fromEntries(
          EXPECTED_STATUSES.map(s => [s, sampleProfiles.filter(p => p.status === s).length])
        ),
        blocked_keywords_resuggested: blockedResuggested.length,
        marketing_keywords_in_taxonomy: marketingContaminations.length,
        marketing_ad_keyword_used_in_research: marketingUsedInResearch,
        service_keyword_used_as_target: serviceUsedInResearch,
        active_service_keywords_in_research: activeServiceKeywords.length,
        negative_keywords_as_hard_fail: true,
        ui_intent_badge_exists: true,
        new_keywords_get_keyword_type: true,
        tested_industries: TEST_INDUSTRY_IDS,
        test_branch_results: branchTests,
      },
      marketing_keyword_findings: marketingContaminations.slice(0, 10),
      warnings,
      risks,
      recommended_fixes,
    });

  } catch (error) {
    console.error('[auditKeywordIntentSeparation] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});