/**
 * auditResearchSettingsSync
 * ==========================
 * Live-Test-Blocker Audit: Prüft ob nach einem Branchenwechsel die nächste
 * Recherche garantiert den neuen Branchen-/Keyword-Kontext nutzt.
 *
 * CHECKS:
 * 1. Settings-Quellen: settings.industry_id, settings.industry_name, org.industry
 * 2. Prioritätskette in startResearchRun (Prio 1: settings.industry_id)
 * 3. Letzter ResearchRun: industry_id korrekt?
 * 4. search_plan_json: Zielkunden passend zur Branche?
 * 5. Gespeicherte Companies: source_query / matched_target_customer_type passend?
 * 6. Cache/Invalidierung: Was muss nach Branchenwechsel neu geladen werden?
 * 7. KeywordProfile: industry_id stimmt mit Settings überein?
 *
 * Input: { org_id? }
 * Output: { claim_status, bug_confirmed, stale_context_detected, evidence, recommended_fix, ... }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const LEGACY_INDUSTRY_MAP = {
  "Gebäudereinigung":"gebaeudereinigung","Gartenbau / Gartenpflege":"gartenbau","Gartenbau":"gartenbau",
  "Hausmeisterdienst / Facility Service":"facility_service","Facility Service":"facility_service",
  "Entrümpelung / Entsorgung":"entruempelung","Entrümpelung":"entruempelung",
  "Buchhaltung / Büroservice":"buchhaltung_steuernahe_dienste","Buchhaltung":"buchhaltung_steuernahe_dienste",
  "Spedition / Logistik":"spedition_logistik","Spedition":"spedition_logistik","Logistik":"spedition_logistik",
  "Gesundheit / Medizin":"gesundheit_medizin","Sicherheitsdienst":"sicherheitsdienst",
  "IT-Service":"it_service","Catering":"catering","Handwerk":"handwerk",
  "Immobilien":"immobilien","Maler / Renovierung":"maler_renovierung",
  "Elektro / Gebäudetechnik":"elektro_gebaeudetechnik","SHK / Sanitär / Heizung / Klima":"shk",
  "Personal / Zeitarbeit":"personal_zeitarbeit","Pflege / Betreuung":"pflege_betreuung",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);

    // Org auflösen
    let payload = {};
    try { payload = await req.json(); } catch {}
    let { org_id } = payload;

    if (!org_id) {
      const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
      org_id = orgs?.[0]?.id;
    }
    if (!org_id && isPlatformAdmin) {
      const allOrgs = await base44.asServiceRole.entities.Organization.list('-created_date', 1);
      org_id = allOrgs?.[0]?.id;
    }
    if (!org_id) return Response.json({ error: 'Keine Organisation gefunden' }, { status: 404 });

    const orgRecs = await base44.asServiceRole.entities.Organization.filter({ id: org_id });
    const org = orgRecs[0];
    if (!org) return Response.json({ error: 'Organisation nicht gefunden' }, { status: 404 });

    const evidence = [];
    const issues = [];
    const warnings = [];

    // ── 1. SETTINGS-QUELLEN AUSLESEN ─────────────────────────────────────────
    const settingsRecs = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id: org_id });
    const settings = {};
    settingsRecs.forEach(s => { settings[s.key] = s.value; });

    const settingsIndustryId   = settings.industry_id || null;
    const settingsIndustryName = settings.industry_name || settings.own_industry || settings.industry || null;
    const orgIndustry          = org.industry || null;

    // Kanonische industry_id ermitteln (identische Logik wie startResearchRun)
    let resolvedIndustryId = null;
    let resolvedSource = null;
    if (settingsIndustryId) {
      resolvedIndustryId = settingsIndustryId;
      resolvedSource = 'settings.industry_id';
    } else if (settingsIndustryName) {
      resolvedIndustryId = LEGACY_INDUSTRY_MAP[settingsIndustryName] || settingsIndustryName;
      resolvedSource = 'settings.industry_name';
    } else if (orgIndustry) {
      resolvedIndustryId = LEGACY_INDUSTRY_MAP[orgIndustry] || orgIndustry;
      resolvedSource = 'organization.industry';
    }

    evidence.push({
      check: 'settings_sources',
      settings_industry_id:   settingsIndustryId,
      settings_industry_name: settingsIndustryName,
      org_industry:           orgIndustry,
      resolved_industry_id:   resolvedIndustryId,
      resolved_source:        resolvedSource,
    });

    // ── 2. TAXONOMIE-PROFIL FÜR ERWARTETE BRANCHE LADEN ──────────────────────
    let taxonomyProfile = null;
    if (resolvedIndustryId) {
      const taxRecs = await base44.asServiceRole.entities.TaxonomyEntry.filter({ industry_id: resolvedIndustryId, is_active: true });
      taxonomyProfile = taxRecs[0] || null;
    }

    const expectedTargetCustomers = taxonomyProfile?.target_customer_types
      ? JSON.parse(taxonomyProfile.target_customer_types)
      : [];
    evidence.push({
      check: 'taxonomy_profile',
      industry_id: resolvedIndustryId,
      profile_found: !!taxonomyProfile,
      expected_target_customer_count: expectedTargetCustomers.length,
      expected_target_customers_sample: expectedTargetCustomers.slice(0, 5),
    });

    // ── 3. LETZTEN RESEARCHRUN LADEN ──────────────────────────────────────────
    const recentRuns = await base44.asServiceRole.entities.ResearchRun.filter(
      { organization_id: org_id }, '-created_date', 5
    );
    const latestRun = recentRuns[0] || null;
    let latestRunIndustryId = null;
    let latestRunTargetCustomers = [];
    let searchPlanIndustryId = null;
    let searchPlanTargetCustomers = [];
    let searchPlanSource = null;

    if (latestRun) {
      latestRunIndustryId = latestRun.industry_id || null;

      // search_plan_json parsen
      if (latestRun.search_plan_json) {
        try {
          const plan = JSON.parse(latestRun.search_plan_json);
          searchPlanIndustryId     = plan.industryId || plan.industry_id || null;
          searchPlanSource         = plan.industrySource || null;
          searchPlanTargetCustomers = plan.targetCustomerTypes || [];
        } catch {}
      }

      // target_customer_types-Feld direkt (Redundanz-Check)
      if (latestRun.target_customer_types) {
        latestRunTargetCustomers = latestRun.target_customer_types.split(',').map(x => x.trim()).filter(Boolean);
      }

      evidence.push({
        check: 'latest_research_run',
        run_id:                    latestRun.id,
        run_status:                latestRun.status,
        run_created_at:            latestRun.created_date,
        run_industry_id:           latestRunIndustryId,
        run_target_customers:      latestRunTargetCustomers.slice(0, 5),
        search_plan_industry_id:   searchPlanIndustryId,
        search_plan_industry_source: searchPlanSource,
        search_plan_target_customers: searchPlanTargetCustomers.slice(0, 5),
      });
    } else {
      evidence.push({ check: 'latest_research_run', run_id: null, note: 'Kein ResearchRun gefunden' });
    }

    // ── 4. STALE CONTEXT DETECTION ────────────────────────────────────────────
    let staleContextDetected = false;
    let staleSource = null;

    // Check A: run.industry_id ≠ resolved settings industry_id
    if (latestRun && resolvedIndustryId && latestRunIndustryId && latestRunIndustryId !== resolvedIndustryId) {
      staleContextDetected = true;
      staleSource = `run.industry_id="${latestRunIndustryId}" ≠ settings="${resolvedIndustryId}"`;
      issues.push({
        severity: 'RED',
        check: 'run_industry_mismatch',
        detail: `Letzter ResearchRun hat industry_id="${latestRunIndustryId}", aber Settings sagen "${resolvedIndustryId}". Branchenwechsel wurde NICHT übernommen.`,
      });
    }

    // Check B: search_plan_json.industryId ≠ resolved
    if (latestRun && resolvedIndustryId && searchPlanIndustryId && searchPlanIndustryId !== resolvedIndustryId) {
      staleContextDetected = true;
      if (!staleSource) staleSource = `search_plan_json.industryId="${searchPlanIndustryId}" ≠ settings="${resolvedIndustryId}"`;
      issues.push({
        severity: 'RED',
        check: 'search_plan_industry_mismatch',
        detail: `search_plan_json.industryId="${searchPlanIndustryId}" stimmt nicht mit aktuellen Settings "${resolvedIndustryId}" überein.`,
      });
    }

    // Check C: Zielkunden im search_plan nicht zur erwarteten Branche passend
    if (searchPlanTargetCustomers.length > 0 && expectedTargetCustomers.length > 0) {
      const planSet      = new Set(searchPlanTargetCustomers.map(x => x.toLowerCase()));
      const expectedSet  = new Set(expectedTargetCustomers.map(x => x.toLowerCase()));
      const matchCount   = [...expectedSet].filter(x => planSet.has(x)).length;
      const matchPercent = Math.round((matchCount / expectedSet.size) * 100);

      evidence.push({
        check: 'target_customer_match',
        plan_target_count:     searchPlanTargetCustomers.length,
        expected_target_count: expectedTargetCustomers.length,
        match_count:           matchCount,
        match_percent:         matchPercent,
        verdict: matchPercent >= 50 ? 'ok' : matchPercent >= 25 ? 'partial' : 'mismatch',
      });

      if (matchPercent < 25) {
        staleContextDetected = true;
        if (!staleSource) staleSource = `targetCustomerTypes nur ${matchPercent}% übereinstimmung mit erwarteter Branche`;
        issues.push({
          severity: 'RED',
          check: 'target_customers_wrong_industry',
          detail: `search_plan_json.targetCustomerTypes passen nur zu ${matchPercent}% zur erwarteten Branche "${resolvedIndustryId}". Vermutlich alter Branchen-Kontext.`,
        });
      } else if (matchPercent < 50) {
        warnings.push({
          severity: 'YELLOW',
          check: 'target_customers_partial_mismatch',
          detail: `${matchPercent}% der Zielkunden passen zur erwarteten Branche. Könnte Learning-Loop-Ergänzung sein, aber prüfen.`,
        });
      }
    }

    // ── 5. GESPEICHERTE COMPANIES AUS LETZTEM RUN PRÜFEN ─────────────────────
    let companySourceEvidence = null;
    if (latestRun?.id) {
      const companiesFromRun = await base44.asServiceRole.entities.Company.filter(
        { organization_id: org_id, research_run_id: latestRun.id }, '-created_date', 20
      );
      const sourceQueries   = [...new Set(companiesFromRun.map(c => c.source_query).filter(Boolean))].slice(0, 10);
      const matchedTypes    = [...new Set(companiesFromRun.map(c => c.matched_target_customer_type).filter(Boolean))].slice(0, 10);
      const missingMatchedType = companiesFromRun.filter(c => !c.matched_target_customer_type).length;
      const branchen        = [...new Set(companiesFromRun.map(c => c.branche).filter(Boolean))].slice(0, 10);

      // Prüfen ob source_query Spedition/Logistik enthält obwohl Gebäudereinigung erwartet
      const WRONG_INDUSTRY_SIGNALS = ['spedition', 'logistik', 'transport', 'lager', 'fulfillment', 'spediteur'];
      const suspiciousSourceQueries = sourceQueries.filter(q =>
        WRONG_INDUSTRY_SIGNALS.some(sig => q.toLowerCase().includes(sig))
      );
      const suspiciousBranchen = branchen.filter(b =>
        WRONG_INDUSTRY_SIGNALS.some(sig => b.toLowerCase().includes(sig))
      );

      companySourceEvidence = {
        companies_from_run: companiesFromRun.length,
        source_queries_sample: sourceQueries,
        matched_target_customer_types: matchedTypes,
        missing_matched_type_count: missingMatchedType,
        branchen_sample: branchen,
        suspicious_source_queries: suspiciousSourceQueries,
        suspicious_branchen: suspiciousBranchen,
      };

      evidence.push({
        check: 'company_source_queries',
        ...companySourceEvidence,
      });

      if (suspiciousSourceQueries.length > 0 || suspiciousBranchen.length > 0) {
        staleContextDetected = true;
        if (!staleSource) staleSource = 'company source_query/branche enthält Signale der alten Branche';
        issues.push({
          severity: 'RED',
          check: 'companies_wrong_industry_signals',
          detail: `${suspiciousSourceQueries.length} source_queries und ${suspiciousBranchen.length} Branchen-Einträge enthalten Spedition/Logistik-Signale obwohl Gebäudereinigung erwartet. Alter Kontext wurde genutzt.`,
          suspicious_queries: suspiciousSourceQueries,
          suspicious_branchen: suspiciousBranchen,
        });
      }
    }

    // ── 6. KEYWORDPROFILE INDUSTRY CHECK ─────────────────────────────────────
    const kwProfiles = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ organization_id: org_id });
    const kwIndustryIds = [...new Set(kwProfiles.map(p => p.industry_id).filter(Boolean))];
    const staleKwProfiles = kwIndustryIds.filter(id => id !== resolvedIndustryId);

    evidence.push({
      check: 'keyword_profile_industry',
      total_profiles:       kwProfiles.length,
      industries_in_profile: kwIndustryIds,
      stale_industry_ids:   staleKwProfiles,
      profiles_for_expected_industry: kwProfiles.filter(p => p.industry_id === resolvedIndustryId).length,
    });

    if (staleKwProfiles.length > 0 && kwProfiles.filter(p => p.industry_id === resolvedIndustryId).length === 0) {
      warnings.push({
        severity: 'YELLOW',
        check: 'keyword_profiles_stale_industry',
        detail: `KeywordProfile enthält nur Einträge für: ${staleKwProfiles.join(', ')}. Kein Eintrag für neue Branche "${resolvedIndustryId}". Beim nächsten Run werden Taxonomie-Defaults statt gelernte Keywords verwendet.`,
      });
    }

    // ── 7. SETTINGS-KONSISTENZ: Kein widersprüchlicher Legacy-Wert ───────────
    // Prüfen ob settings.industry_name zu einer ANDEREN Branche als settings.industry_id mappt
    if (settingsIndustryId && settingsIndustryName) {
      const mappedFromName = LEGACY_INDUSTRY_MAP[settingsIndustryName] || settingsIndustryName;
      if (mappedFromName !== settingsIndustryId) {
        warnings.push({
          severity: 'YELLOW',
          check: 'settings_industry_name_id_mismatch',
          detail: `settings.industry_name="${settingsIndustryName}" mappt zu "${mappedFromName}", aber settings.industry_id="${settingsIndustryId}". startResearchRun priorisiert industry_id – kein Funktionsfehler, aber verwirrend.`,
          note: 'startResearchRun nutzt Priorität 1: industry_id → kein Bug, nur Cleanup empfohlen',
        });
      }
    }

    // ── 8. CACHE / INVALIDIERUNG – FRONTEND-ANALYSE ──────────────────────────
    // Diese Checks sind statisch (Code-Review), nicht laufzeit-prüfbar
    const cacheChecks = {
      useOrganization_refetches_after_save: {
        verdict: 'unknown_requires_code_review',
        note: 'useOrganization hat kein explizites refetch nach Settings-Save. Org-Objekt cached bis Page-Reload.',
        risk: 'medium',
        where: 'hooks/useOrganization.js – kein queryClient.invalidate nach settings-save',
      },
      researchDialog_uses_org_from_prop: {
        verdict: 'ok',
        note: 'ResearchDialog bekommt orgId als Prop – nutzt keinen Cache, liest org.id korrekt.',
        risk: 'low',
      },
      startResearchRun_reads_fresh_settings: {
        verdict: 'ok',
        note: 'startResearchRun liest OrganizationSettings via asServiceRole frisch aus DB – kein Memory-Cache.',
        risk: 'low',
      },
      processResearchRun_reads_from_search_plan_json: {
        verdict: 'ok_if_startRun_correct',
        note: 'processResearchRun liest ausschließlich aus search_plan_json des ResearchRun – keine eigenen DB-Calls für industry. Wenn startResearchRun korrekt schreibt, ist processResearchRun safe.',
        risk: 'low',
      },
      settings_page_saves_industry_id: {
        verdict: 'needs_verification',
        note: 'Prüfen ob CompanySettings beim Branchenwechsel settings.industry_id UND settings.industry_name UND settings.target_customer_types korrekt neu setzt.',
        risk: 'high_if_missing',
        action_required: 'Einstellungsseite beim Branchenwechsel prüfen: Werden alle 3 Keys neu gespeichert?',
      },
      queryClient_invalidation_after_industry_change: {
        verdict: 'unknown',
        note: 'Kein explizites queryClient.invalidateQueries nach industry-save sichtbar. ResearchDialog zeigt möglicherweise alte org-Daten wenn Seite nicht neugeladen wird.',
        risk: 'medium',
        action_required: 'Nach settings.industry_id save: queryClient.invalidateQueries([organization, settings, keyword-profile]) aufrufen',
      },
    };

    evidence.push({ check: 'cache_invalidation_analysis', cache_checks: cacheChecks });

    // ── 9. GESAMTBEWERTUNG ────────────────────────────────────────────────────
    // Kernfrage: Zeigen die Live-Daten einen tatsächlichen Context-Sync-Bug?
    const bugConfirmed = issues.some(i => i.severity === 'RED');

    // Wenn kein RED-Bug: war der Nutzer-Report möglicherweise ein Missverständnis?
    let userReportAnalysis = null;
    if (!bugConfirmed && latestRun) {
      const hasGebaeudereinigungContext = resolvedIndustryId === 'gebaeudereinigung'
        && searchPlanIndustryId === 'gebaeudereinigung'
        && searchPlanTargetCustomers.some(t => ['hausverwaltungen','arztpraxen','pflegeheime','bürogebäude'].includes(t.toLowerCase()));

      if (hasGebaeudereinigungContext) {
        userReportAnalysis = {
          verdict: 'likely_misunderstanding',
          explanation: [
            'Settings.industry_id="gebaeudereinigung" ✅',
            'ResearchRun.industry_id="gebaeudereinigung" ✅',
            'search_plan_json enthält Gebäudereinigung-Zielkunden (Hausverwaltungen, Arztpraxen etc.) ✅',
            'ABER: Zielkunden wie "Arztpraxen" oder "Hotels" SIND Kunden der Gebäudereinigung – nicht Konkurrenten.',
            'Ein Ergebnis "Arztpraxis Müller" ist KORREKT: Arztpraxen buchen Gebäudereinigungsdienstleistungen.',
            'KEIN Context-Sync-Bug. Die Engine sucht WER putzen lässt, nicht WER putzt.',
          ],
          if_actual_logistics_companies_appeared: {
            possible_cause_1: 'Keyword-Matching: Ein Query-Begriff wie "Logistik" erscheint in einem Arztpraxis-Firmenname oder Beschreibung.',
            possible_cause_2: 'Google Places liefert broad matches – scoring hat nicht ausreichend gefiltert.',
            possible_cause_3: 'matched_target_customer_type gesetzt, branche-Feld zeigt aber alten Wert (Enrichment-Drift).',
            recommended_check: 'Bitte konkrete Beispielfirmen-Namen aus dem Run nennen die falsch erscheinen. Dann kann direkt source_query geprüft werden.',
          },
        };
      }
    }

    // ── 10. RECOMMENDED FIX ───────────────────────────────────────────────────
    const recommendedFix = bugConfirmed ? [
      {
        priority: 'BLOCKER',
        fix: 'Single Source of Truth sicherstellen',
        detail: 'Beim Speichern der Branche: settings.industry_id, settings.industry_name UND settings.target_customer_types gleichzeitig neu setzen.',
      },
      {
        priority: 'BLOCKER',
        fix: 'queryClient.invalidateQueries nach industry-save',
        detail: 'CompanySettings: Nach erfolgreichem Save queryClient.invalidateQueries(["organization", "org-settings", "keyword-profile"]) aufrufen.',
      },
      {
        priority: 'HIGH',
        fix: 'KeywordProfile bei Branchenwechsel löschen/neu initialisieren',
        detail: 'Alte KeywordProfiles der vorherigen Branche blocken oder industry_id updaten. initOrgEmailTemplates-Pattern verwenden.',
      },
    ] : [
      {
        priority: 'MEDIUM',
        fix: 'queryClient.invalidateQueries nach industry-save als Präventivmaßnahme',
        detail: 'Auch wenn kein Bug gefunden: Cache-Invalidierung nach Settings-Save verhindert zukünftige Stale-Data-Probleme.',
      },
      {
        priority: 'LOW',
        fix: 'settings.industry_name und settings.industry_id synchron halten',
        detail: 'Cleanup: Beim Branchenwechsel beide Keys gleichzeitig schreiben. Verhindert Verwirrung bei Debugging.',
      },
      {
        priority: 'LOW',
        fix: 'UI: Im ResearchDialog Branche anzeigen',
        detail: 'Zeige "Recherche für: Gebäudereinigung" im Dialog – Nutzer sieht sofort ob der richtige Kontext verwendet wird.',
      },
    ];

    // ── CLAIM STATUS ──────────────────────────────────────────────────────────
    const claimStatus = issues.some(i => i.severity === 'RED') ? 'red'
      : warnings.some(w => w.severity === 'YELLOW') ? 'yellow'
      : 'green';
    const riskLevel = claimStatus === 'red' ? 'high' : claimStatus === 'yellow' ? 'medium' : 'low';

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,
      bug_confirmed: bugConfirmed,
      org_id,
      expected_industry_id: resolvedIndustryId,
      actual_research_run_industry_id: latestRunIndustryId,
      org_industry_id: orgIndustry ? (LEGACY_INDUSTRY_MAP[orgIndustry] || orgIndustry) : null,
      settings_industry_id: settingsIndustryId,
      settings_industry_name: settingsIndustryName,
      keyword_profile_industry_id: kwIndustryIds[0] || null,
      stale_context_detected: staleContextDetected,
      stale_source: staleSource,
      latest_research_run_id: latestRun?.id || null,
      issues,
      warnings,
      evidence,
      user_report_analysis: userReportAnalysis,
      recommended_fix: recommendedFix,
      summary: {
        settings_industry_id_set:   !!settingsIndustryId,
        settings_source:            resolvedSource,
        run_industry_matches:       latestRunIndustryId === resolvedIndustryId,
        search_plan_matches:        searchPlanIndustryId === resolvedIndustryId,
        companies_suspicious:       (companySourceEvidence?.suspicious_source_queries?.length || 0) + (companySourceEvidence?.suspicious_branchen?.length || 0),
        keyword_profiles_stale:     staleKwProfiles.length,
        context_sync_verdict:       bugConfirmed ? 'BUG_CONFIRMED' : staleContextDetected ? 'PARTIAL_STALE' : 'CLEAN',
      },
    });

  } catch (error) {
    console.error('[auditResearchSettingsSync] Fatal:', error?.message);
    return Response.json({ error: error?.message, claim_status: 'red', bug_confirmed: false }, { status: 500 });
  }
});