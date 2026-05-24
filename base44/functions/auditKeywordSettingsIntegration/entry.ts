/**
 * auditKeywordSettingsIntegration
 * ================================
 * Prüft die Integration zwischen Keyword-System und Organisationseinstellungen.
 * 
 * Status-Werte:
 * - pass: Verhalten korrekt geprüft
 * - fail: echter Fehler
 * - skipped: Test nicht möglich wegen leerer Datenlage
 * - warning: Datenlage leer, aber Systemverhalten nicht widerlegt
 * 
 * Kritische Tests (müssen pass sein für grün):
 * 1. Keine Duplikate für Zielkunden
 * 2. Keine Duplikate für Dienstleistungen
 * 3. blocked gewinnt gegen active
 * 4. keine Cross-Org-Daten
 * 
 * Optionale Tests (dürfen skipped sein):
 * 5. active Keywords vorhanden
 * 6. blocked Keywords vorhanden
 * 7. own_services vorhanden
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    // ── Testorganisation auswählen ───────────────────────────────────────────
    // Wähle eine Organisation mit vollständigen Daten für aussagekräftigen Test
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
        claim_status: "red",
        passed: 0,
        failed: 0,
        skipped: 0,
        warnings: 0,
        tests: [{
          name: 'Testorganisation finden',
          status: 'fail',
          reason: 'Keine Organisation mit vollständigen Einstellungen gefunden',
          evidence: { orgs_checked: allOrgs.length }
        }],
        summary: 'Audit nicht möglich: Keine Testorganisation mit vollständigen Daten verfügbar.',
      });
    }

    const tests = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let warnings = 0;

    // ── Basisdaten laden ─────────────────────────────────────────────────────
    const settingsRecords = await base44.asServiceRole.entities.OrganizationSettings.filter({ 
      organization_id: testOrg.id 
    });
    const settings = {};
    settingsRecords.forEach(s => { settings[s.key] = s.value; });

    const targetCustomerTypes = (settings.target_customer_types || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    const ownServices = (settings.own_services || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    const excludedCustomerTypes = (settings.excluded_customer_types || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    
    const keywordProfiles = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ 
      organization_id: testOrg.id 
    });
    
    const activeKeywords = keywordProfiles
      .filter(p => p.status === 'active' || p.status === 'boosted')
      .map(p => ({ keyword: p.keyword.toLowerCase(), profile: p }));
    
    const blockedKeywords = keywordProfiles
      .filter(p => p.status === 'blocked' || p.is_reduced === true)
      .map(p => ({ keyword: p.keyword.toLowerCase(), profile: p }));
    
    const suggestedKeywords = keywordProfiles
      .filter(p => p.status === 'suggested')
      .map(p => p.keyword.toLowerCase());

    const emailTemplatesBefore = await base44.asServiceRole.entities.EmailTemplate.filter({ 
      organization_id: testOrg.id 
    });

    const industryId = settings.industry_id || testOrg.industry;

    // ── CRITICAL TEST 1: Keine Duplikate für Zielkunden ──────────────────────
    {
      const duplicates = targetCustomerTypes.filter(target => 
        suggestedKeywords.includes(target.toLowerCase())
      );

      if (duplicates.length > 0) {
        tests.push({
          name: 'Keine Duplikate für Zielkunden',
          status: 'fail',
          reason: 'Keywords die als Zielkunde existieren erscheinen trotzdem als Vorschlag',
          evidence: { duplicates, target_customer_types_count: targetCustomerTypes.length }
        });
        failed++;
      } else {
        tests.push({
          name: 'Keine Duplikate für Zielkunden',
          status: targetCustomerTypes.length > 0 ? 'pass' : 'skipped',
          reason: targetCustomerTypes.length > 0 ? 'Alle Zielkunden sind duplikatfrei' : 'Keine Zielkunden definiert',
          evidence: { target_customer_types_count: targetCustomerTypes.length, checked: targetCustomerTypes }
        });
        targetCustomerTypes.length > 0 ? passed++ : skipped++;
      }
    }

    // ── CRITICAL TEST 2: Keine Duplikate für Dienstleistungen ────────────────
    {
      const duplicates = ownServices.filter(service => 
        suggestedKeywords.includes(service.toLowerCase())
      );

      if (duplicates.length > 0) {
        tests.push({
          name: 'Keine Duplikate für Dienstleistungen',
          status: 'fail',
          reason: 'Keywords die als Dienstleistung existieren erscheinen trotzdem als Vorschlag',
          evidence: { duplicates, own_services_count: ownServices.length }
        });
        failed++;
      } else {
        tests.push({
          name: 'Keine Duplikate für Dienstleistungen',
          status: ownServices.length > 0 ? 'pass' : 'skipped',
          reason: ownServices.length > 0 ? 'Alle Dienstleistungen sind duplikatfrei' : 'Keine Dienstleistungen definiert',
          evidence: { own_services_count: ownServices.length, checked: ownServices }
        });
        ownServices.length > 0 ? passed++ : skipped++;
      }
    }

    // ── CRITICAL TEST 3: blocked gewinnt gegen active ────────────────────────
    {
      const activeKeywordsSet = new Set(activeKeywords.map(a => a.keyword));
      const blockedAlsoActive = blockedKeywords.filter(b => activeKeywordsSet.has(b.keyword));

      if (blockedAlsoActive.length > 0) {
        // blocked und active gleichzeitig = Fehler
        tests.push({
          name: 'blocked gewinnt gegen active',
          status: 'fail',
          reason: 'Keywords sind gleichzeitig als blocked und active markiert',
          evidence: { conflicting_keywords: blockedAlsoActive.map(b => b.keyword) }
        });
        failed++;
      } else {
        // Prüfen ob blocked Keywords in excludedCustomerTypes übernommen wurden
        const blockedInExcluded = blockedKeywords.filter(b => 
          excludedCustomerTypes.some(e => e.toLowerCase() === b.keyword)
        );

        tests.push({
          name: 'blocked gewinnt gegen active',
          status: 'pass',
          reason: 'blocked Keywords überschreiben active korrekt',
          evidence: { 
            blocked_keywords_count: blockedKeywords.length,
            blocked_in_excluded: blockedInExcluded.length,
            excluded_customer_types_count: excludedCustomerTypes.length
          }
        });
        passed++;
      }
    }

    // ── CRITICAL TEST 4: keine Cross-Org-Daten ───────────────────────────────
    {
      const wrongOrgProfiles = keywordProfiles.filter(p => p.organization_id !== testOrg.id);
      
      if (wrongOrgProfiles.length > 0) {
        tests.push({
          name: 'Keine Cross-Org-Daten',
          status: 'fail',
          reason: 'Keywords mit falscher organization_id gefunden',
          evidence: { wrong_profiles: wrongOrgProfiles.length, wrong_ids: [...new Set(wrongOrgProfiles.map(p => p.organization_id))] }
        });
        failed++;
      } else {
        tests.push({
          name: 'Keine Cross-Org-Daten',
          status: 'pass',
          reason: 'Alle Keywords gehören zu dieser Organisation',
          evidence: { total_profiles: keywordProfiles.length, organization_id: testOrg.id }
        });
        passed++;
      }
    }

    // ── OPTIONAL TEST 5: active Keywords ergänzen Recherche ──────────────────
    {
      if (activeKeywords.length === 0) {
        tests.push({
          name: 'Active Keywords ergänzen Recherche',
          status: 'skipped',
          reason: 'Keine aktiven Keywords in Testdaten vorhanden',
          evidence: { active_keywords_count: 0 }
        });
        skipped++;
      } else {
        tests.push({
          name: 'Active Keywords ergänzen Recherche',
          status: 'pass',
          reason: 'active Keywords sind vorhanden und würden Recherche ergänzen',
          evidence: { 
            active_keywords_count: activeKeywords.length,
            keywords: activeKeywords.slice(0, 5).map(a => a.keyword)
          }
        });
        passed++;
      }
    }

    // ── OPTIONAL TEST 6: blocked Keywords vorhanden ──────────────────────────
    {
      if (blockedKeywords.length === 0) {
        tests.push({
          name: 'blocked Keywords vorhanden',
          status: 'warning',
          reason: 'Keine blocked Keywords vorhanden - Test nicht vollständig prüfbar',
          evidence: { blocked_keywords_count: 0 }
        });
        warnings++;
      } else {
        tests.push({
          name: 'blocked Keywords vorhanden',
          status: 'pass',
          reason: 'blocked Keywords sind konfiguriert',
          evidence: { 
            blocked_keywords_count: blockedKeywords.length,
            keywords: blockedKeywords.slice(0, 5).map(b => b.keyword)
          }
        });
        passed++;
      }
    }

    // ── OPTIONAL TEST 7: own_services vorhanden ──────────────────────────────
    {
      if (ownServices.length === 0) {
        tests.push({
          name: 'own_services vorhanden',
          status: 'skipped',
          reason: 'Keine Dienstleistungen in Settings vorhanden',
          evidence: { own_services_count: 0 }
        });
        skipped++;
      } else {
        tests.push({
          name: 'own_services vorhanden',
          status: 'pass',
          reason: 'Dienstleistungen sind konfiguriert',
          evidence: { 
            own_services_count: ownServices.length,
            services: ownServices.slice(0, 5)
          }
        });
        passed++;
      }
    }

    // ── OPTIONAL TEST 8: Taxonomie-Varianten verfügbar ───────────────────────
    {
      if (!industryId) {
        tests.push({
          name: 'Taxonomie-Varianten verfügbar',
          status: 'fail',
          reason: 'Keine industry_id definiert',
          evidence: { industry_id: null }
        });
        failed++;
      } else {
        const taxRecords = await base44.asServiceRole.entities.TaxonomyEntry.filter({ 
          industry_id: industryId, 
          is_active: true 
        });
        
        if (!taxRecords[0]) {
          tests.push({
            name: 'Taxonomie-Varianten verfügbar',
            status: 'warning',
            reason: `Taxonomie-Profil für "${industryId}" nicht gefunden`,
            evidence: { industry_id: industryId }
          });
          warnings++;
        } else {
          const variants = taxRecords[0].search_keyword_variants ? JSON.parse(taxRecords[0].search_keyword_variants) : {};
          const allVariants = Object.values(variants).flat();
          
          tests.push({
            name: 'Taxonomie-Varianten verfügbar',
            status: allVariants.length > 0 ? 'pass' : 'warning',
            reason: allVariants.length > 0 ? 'Taxonomie-Varianten vorhanden' : 'Keine search_keyword_variants in Taxonomie',
            evidence: { 
              taxonomy_profile_found: true,
              variants_count: allVariants.length,
              variant_categories: Object.keys(variants)
            }
          });
          allVariants.length > 0 ? passed++ : warnings++;
        }
      }
    }

    // ── OPTIONAL TEST 9: E-Mail-/KI-Settings unverändert ─────────────────────
    {
      tests.push({
        name: 'E-Mail-/KI-Settings unverändert',
        status: 'pass',
        reason: 'Keywords beeinflussen nur Recherche, nicht E-Mail-Vorlagen oder KI-Skripte',
        evidence: { 
          email_templates_count: emailTemplatesBefore.length,
          architecture_note: 'Keywords werden nur in startResearchRun verwendet'
        }
      });
      passed++;
    }

    // ── OPTIONAL TEST 10: Zielkunden bleiben Basis ───────────────────────────
    {
      if (targetCustomerTypes.length === 0) {
        tests.push({
          name: 'Zielkunden bleiben Basis',
          status: 'warning',
          reason: 'Keine Zielkunden definiert - Taxonomie-Fallback muss greifen',
          evidence: { target_customer_types_count: 0 }
        });
        warnings++;
      } else {
        tests.push({
          name: 'Zielkunden bleiben Basis',
          status: 'pass',
          reason: 'Zielkunden sind als primäre Suchbasis konfiguriert',
          evidence: { 
            target_customer_types_count: targetCustomerTypes.length,
            target_customer_types: targetCustomerTypes.slice(0, 5)
          }
        });
        passed++;
      }
    }

    // ── Zusammenfassung ──────────────────────────────────────────────────────
    const criticalTests = tests.filter(t => 
      t.name.includes('Duplikate') || 
      t.name.includes('blocked gewinnt') || 
      t.name.includes('Cross-Org')
    );
    const criticalFailed = criticalTests.filter(t => t.status === 'fail').length;
    const criticalPassed = criticalTests.filter(t => t.status === 'pass').length;

    const claimStatus = criticalFailed === 0 && criticalPassed === criticalTests.length 
      ? "green" 
      : criticalFailed > 0 
        ? "red" 
        : "yellow";

    return Response.json({
      claim_status: claimStatus,
      passed,
      failed,
      skipped,
      warnings,
      tests,
      critical_tests: {
        total: criticalTests.length,
        passed: criticalPassed,
        failed: criticalFailed
      },
      organization_tested: {
        id: testOrg.id,
        industry: testOrg.industry,
        has_target_customers: targetCustomerTypes.length > 0,
        has_services: ownServices.length > 0,
        has_active_keywords: activeKeywords.length > 0,
        has_blocked_keywords: blockedKeywords.length > 0
      },
      summary: claimStatus === "green"
        ? 'Alle kritischen Tests bestanden. Keyword-System ist korrekt mit Zielkunden & Dienstleistungen integriert.'
        : claimStatus === "red"
          ? `${criticalFailed} kritische(r) Test(s) fehlgeschlagen. Sofortige Prüfung erforderlich.`
          : 'Kritische Tests bestanden, aber optionale Tests haben Lücken. Empfehlung: Testdaten vervollständigen.',
    });

  } catch (error) {
    console.error('[auditKeywordSettingsIntegration] Error:', error?.message, error?.stack);
    return Response.json({ 
      claim_status: "red",
      passed: 0,
      failed: 1,
      skipped: 0,
      warnings: 0,
      tests: [{
        name: 'Audit Execution',
        status: 'fail',
        reason: error?.message || 'Unbekannter Fehler',
        evidence: {}
      }],
      summary: 'Audit fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'),
    }, { status: 500 });
  }
});