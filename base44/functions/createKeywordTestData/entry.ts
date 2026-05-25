/**
 * createKeywordTestData
 * ======================
 * Erstellt kontrollierte Testdaten für auditKeywordSettingsIntegration.
 * 
 * Erstellt:
 * 1. Test-Dienstleistung in OrganizationSettings (own_services)
 * 2. Active Keyword (OrganizationKeywordProfile status=active)
 * 3. Blocked Keyword (OrganizationKeywordProfile status=blocked)
 * 
 * Wichtig:
 * - Alle Testdaten mit "TEST_" Prefix markiert
 * - Nach Audit wieder löschbar
 * - Keine bestehende Produktlogik verändern
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Nicht eingeloggt', success: false }, { status: 401 });
    }

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);
    if (!isPlatformAdmin) {
      return Response.json({ error: 'Nur PlatformAdmin', success: false }, { status: 403 });
    }

    // Testorganisation finden (mit vollständigen Onboarding-Daten)
    const allOrgs = await base44.asServiceRole.entities.Organization.list('-created_date', 100);
    let testOrg = null;
    
    for (const org of allOrgs) {
      if (!org.onboarding_done) continue;
      const settings = await base44.asServiceRole.entities.OrganizationSettings.filter({ 
        organization_id: org.id 
      });
      const hasIndustry = settings.some(s => s.key === 'industry_id' && s.value);
      const hasTargets = settings.some(s => s.key === 'target_customer_types' && s.value);
      
      if (hasIndustry && hasTargets) {
        testOrg = org;
        break;
      }
    }

    if (!testOrg) {
      return Response.json({
        success: false,
        error: 'Keine Testorganisation gefunden',
        message: 'Bitte mindestens eine Organisation mit abgeschlossenem Onboarding erstellen.'
      }, { status: 400 });
    }

    const testPrefix = 'TEST_';
    const testService = `${testPrefix}Premium Beratung`;
    const testActiveKeyword = `${testPrefix}Express Service`;
    const testBlockedKeyword = `${testPrefix}Niedrigpreis`;

    const created = {
      organization_id: testOrg.id,
      settings_updated: [],
      keywords_created: [],
      keywords_updated: [],
    };

    // ── 1. Test-Dienstleistung in OrganizationSettings ───────────────────────
    const settingsRecords = await base44.asServiceRole.entities.OrganizationSettings.filter({ 
      organization_id: testOrg.id 
    });
    const settings = {};
    settingsRecords.forEach(s => { settings[s.key] = s.value; });

    const existingServices = (settings.own_services || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    
    if (!existingServices.some(s => s.includes(testPrefix))) {
      // TEST_ Service hinzufügen
      const newServices = [...existingServices, testService].join(', ');
      
      const existingSetting = await base44.asServiceRole.entities.OrganizationSettings.filter({ 
        organization_id: testOrg.id, 
        key: 'own_services' 
      });
      
      if (existingSetting[0]) {
        await base44.asServiceRole.entities.OrganizationSettings.update(existingSetting[0].id, {
          value: newServices
        });
        created.settings_updated.push({ key: 'own_services', action: 'updated', value: newServices });
      } else {
        await base44.asServiceRole.entities.OrganizationSettings.create({
          organization_id: testOrg.id,
          key: 'own_services',
          value: newServices
        });
        created.settings_updated.push({ key: 'own_services', action: 'created', value: newServices });
      }
      
      console.info(`[createKeywordTestData] TEST-Dienstleistung erstellt: ${testService}`);
    } else {
      console.info(`[createKeywordTestData] TEST-Dienstleistung existiert bereits`);
    }

    // ── 2. Active Keyword erstellen ──────────────────────────────────────────
    const existingActive = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ 
      organization_id: testOrg.id,
      keyword: testActiveKeyword
    });
    
    if (existingActive.length === 0) {
      await base44.asServiceRole.entities.OrganizationKeywordProfile.create({
        organization_id: testOrg.id,
        keyword: testActiveKeyword,
        keyword_type: 'manual',
        source: 'manual_user_added',
        status: 'active',
        score: 5,
        is_user_added: true,
        is_boosted: false,
        is_reduced: false,
        linked_setting: 'manual',
        total_count: 0,
        won_count: 0,
        relevant_count: 0,
        not_relevant_count: 0,
      });
      created.keywords_created.push({ keyword: testActiveKeyword, status: 'active' });
      console.info(`[createKeywordTestData] Active Keyword erstellt: ${testActiveKeyword}`);
    } else {
      console.info(`[createKeywordTestData] Active Keyword existiert bereits: ${testActiveKeyword}`);
    }

    // ── 3. Blocked Keyword erstellen ─────────────────────────────────────────
    const existingBlocked = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ 
      organization_id: testOrg.id,
      keyword: testBlockedKeyword
    });
    
    if (existingBlocked.length === 0) {
      await base44.asServiceRole.entities.OrganizationKeywordProfile.create({
        organization_id: testOrg.id,
        keyword: testBlockedKeyword,
        keyword_type: 'manual',
        source: 'manual_user_added',
        status: 'blocked',
        score: 1,
        is_user_added: true,
        is_boosted: false,
        is_reduced: true,
        linked_setting: 'manual',
        total_count: 0,
        won_count: 0,
        relevant_count: 0,
        not_relevant_count: 0,
      });
      created.keywords_created.push({ keyword: testBlockedKeyword, status: 'blocked' });
      console.info(`[createKeywordTestData] Blocked Keyword erstellt: ${testBlockedKeyword}`);
    } else {
      console.info(`[createKeywordTestData] Blocked Keyword existiert bereits: ${testBlockedKeyword}`);
    }

    // ── 4. generateKeywordSuggestions testen ─────────────────────────────────
    // Prüfen ob TEST_ Begriffe NICHT als Vorschläge erscheinen
    const suggestionsRes = await fetch('https://base44.app/functions/generateKeywordSuggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: testOrg.id })
    });
    const suggestionsData = await suggestionsRes.json();
    
    const testSuggestions = suggestionsData.suggestions?.filter(s => 
      s.keyword.includes(testPrefix)
    ) || [];
    
    const deduplicationWorks = testSuggestions.length === 0;

    return Response.json({
      success: true,
      test_data_created: created,
      test_organization: {
        id: testOrg.id,
        name: testOrg.name,
        industry: testOrg.industry,
      },
      deduplication_test: {
        passed: deduplicationWorks,
        test_suggestions_found: testSuggestions.length,
        expected: 0,
        message: deduplicationWorks 
          ? 'TEST_ Keywords werden NICHT doppelt vorgeschlagen (korrekt)' 
          : 'TEST_ Keywords erscheinen als Vorschlag (FEHLER)'
      },
      next_step: 'Jetzt auditKeywordSettingsIntegration ausführen',
    });

  } catch (error) {
    console.error('[createKeywordTestData] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});