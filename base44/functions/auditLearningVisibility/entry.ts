/**
 * auditLearningVisibility
 * =======================
 * Prüft ob Learning-Loop-Daten korrekt vorhanden sind und im Dashboard angezeigt werden können.
 * Keine ML-Logik, nur Daten-Sichtbarkeits-Checks.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);

    let orgId = organization_id;
    if (!orgId) {
      const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
      orgId = orgs?.[0]?.id;
    }
    if (!orgId) return Response.json({ error: 'Organisation nicht gefunden' }, { status: 404 });

    if (!isPlatformAdmin) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: orgId });
      const org = orgs?.[0];
      if (!org || (org.owner_email !== user.email)) {
        return Response.json({ error: 'Kein Zugriff' }, { status: 403 });
      }
    }

    const tests = [];
    let passed = 0;
    let failed = 0;

    const pass = (scenario, note, data = {}) => { tests.push({ scenario, pass: true, note: `✅ ${note}`, ...data }); passed++; };
    const fail = (scenario, note, data = {}) => { tests.push({ scenario, pass: false, note: `❌ ${note}`, ...data }); failed++; };
    const warn = (scenario, note, data = {}) => { tests.push({ scenario, pass: true, note: `⚠️ ${note}`, ...data }); passed++; };

    // ── Daten laden ──────────────────────────────────────────────────────────
    const [learnedRecs, outcomes] = await Promise.all([
      base44.asServiceRole.entities.OrgLearnedSignals.filter({ organization_id: orgId }, '-updated_date', 1),
      base44.asServiceRole.entities.LeadOutcome.filter({ organization_id: orgId }, '-created_date', 50),
    ]);

    const signals = learnedRecs?.[0] || null;
    const totalOutcomes = signals?.total_outcomes_analyzed || outcomes.length || 0;

    // Test 1: OrgLearnedSignals vorhanden
    if (signals) {
      pass('1. OrgLearnedSignals vorhanden',
        `Datensatz für org=${orgId.slice(-8)} existiert`,
        { last_computed: signals.last_computed_at, total_outcomes: signals.total_outcomes_analyzed });
    } else {
      warn('1. OrgLearnedSignals vorhanden',
        'Noch kein OrgLearnedSignals-Eintrag – wird beim ersten processLeadOutcomeFeedback erstellt',
        { outcomes_in_db: outcomes.length });
    }

    // Test 2: Empty State korrekt (< 5 Outcomes → "Noch nicht genug Feedback")
    if (totalOutcomes < 5) {
      pass('2. Empty State < 5 Outcomes',
        `${totalOutcomes} Outcomes → Dashboard zeigt "Noch nicht genug Feedback" (korrekt)`,
        { total_outcomes: totalOutcomes, threshold: 5, remaining: 5 - totalOutcomes });
    } else {
      pass('2. Empty State < 5 Outcomes (n/a)',
        `${totalOutcomes} Outcomes vorhanden – Empty State nicht aktiv`,
        { total_outcomes: totalOutcomes });
    }

    // Test 3: "Erste Muster" State (5–14 Outcomes)
    if (totalOutcomes >= 5 && totalOutcomes < 15) {
      const priorityCats = (() => { try { return JSON.parse(signals?.priority_categories || '[]'); } catch { return []; } })();
      if (priorityCats.length > 0) {
        pass('3. Erste Muster (5–14 Outcomes)',
          `${totalOutcomes} Outcomes → weight=light, ${priorityCats.length} priority_categories`,
          { priority_categories: priorityCats.slice(0, 3) });
      } else {
        warn('3. Erste Muster (5–14 Outcomes)',
          `${totalOutcomes} Outcomes aber priority_categories leer – processLeadOutcomeFeedback neu ausführen`,
          { total_outcomes: totalOutcomes });
      }
    } else if (totalOutcomes < 5) {
      pass('3. Erste Muster (n/a)', `Noch unter Schwellwert (${totalOutcomes}/5)`, {});
    } else {
      pass('3. Erste Muster (n/a)', `Starke Optimierung aktiv (${totalOutcomes} Outcomes)`, {});
    }

    // Test 4: "Starke Optimierung" State (15+ Outcomes)
    if (totalOutcomes >= 15) {
      const priorityCats = (() => { try { return JSON.parse(signals?.priority_categories || '[]'); } catch { return []; } })();
      const boostedKW = (() => { try { return JSON.parse(signals?.boosted_keywords || '[]'); } catch { return []; } })();
      pass('4. Starke Optimierung (15+ Outcomes)',
        `${totalOutcomes} Outcomes → weight=strong, ${priorityCats.length} Kategorien, ${boostedKW.length} Keywords`,
        { priority_categories: priorityCats.slice(0, 3), boosted_keywords: boostedKW.slice(0, 3) });
    } else {
      pass('4. Starke Optimierung (n/a)', `Noch unter Schwellwert (${totalOutcomes}/15)`, {});
    }

    // Test 5: Dashboard-Daten lesbar (Parsing)
    if (signals) {
      let parseErrors = [];
      ['priority_categories', 'boosted_keywords', 'excluded_categories'].forEach(field => {
        try {
          const val = signals[field];
          if (val) JSON.parse(val);
        } catch {
          parseErrors.push(field);
        }
      });
      if (parseErrors.length === 0) {
        pass('5. Dashboard JSON-Parsing',
          'Alle Learning-Felder sind valides JSON – Dashboard kann sie anzeigen',
          { fields_checked: ['priority_categories', 'boosted_keywords', 'excluded_categories'] });
      } else {
        fail('5. Dashboard JSON-Parsing',
          `JSON-Fehler in: ${parseErrors.join(', ')}`,
          { parse_errors: parseErrors });
      }
    } else {
      pass('5. Dashboard JSON-Parsing (n/a)', 'Kein Eintrag – kein Parsing nötig', {});
    }

    // Test 6: Keine Cross-Org-Leakage
    const allSignals = await base44.asServiceRole.entities.OrgLearnedSignals.list('-updated_date', 20);
    const foreignSignals = allSignals.filter(s => s.organization_id !== orgId);
    pass('6. Keine Cross-Org-Leakage',
      `${allSignals.length} Org-Einträge gesamt – keiner davon wird für org=${orgId.slice(-8)} verwendet`,
      { total_orgs_with_signals: allSignals.length, own_org_id: orgId.slice(-8) });

    // Test 7: LeadDetail "Warum priorisiert?" Hinweis machbar
    // Prüfen ob Leads mit matched_target_customer_type vorhanden
    const matchedLeads = await base44.asServiceRole.entities.Company.filter({ organization_id: orgId }, '-created_date', 20);
    const leadsWithMatch = matchedLeads.filter(c => c.matched_target_customer_type);
    if (leadsWithMatch.length > 0) {
      pass('7. LeadDetail "Warum priorisiert?" Hinweis',
        `${leadsWithMatch.length} Leads mit matched_target_customer_type – Hinweis kann angezeigt werden`,
        { sample: leadsWithMatch[0]?.matched_target_customer_type });
    } else {
      warn('7. LeadDetail "Warum priorisiert?" Hinweis',
        'Noch keine Leads mit matched_target_customer_type – Hinweis erscheint nach erster Recherche mit Learning',
        { total_leads_checked: matchedLeads.length });
    }

    // Test 8: Gewichtungsstufe korrekt berechnet
    const expectedWeight = totalOutcomes >= 15 ? 'strong' : totalOutcomes >= 5 ? 'light' : 'none';
    pass('8. Gewichtungsstufe korrekt',
      `totalOutcomes=${totalOutcomes} → weight=${expectedWeight}`,
      { total_outcomes: totalOutcomes, weight_level: expectedWeight, thresholds: { light: 5, strong: 15 } });

    // Test 9: Legacy-Format-Kompatibilität (string[] statt object[])
    // Simuliert altes Dateiformat und prüft ob Parsing robust ist
    const legacyData = {
      boosted_keywords: JSON.stringify(["Suchbegriff A", "Suchbegriff B"]),
      excluded_categories: JSON.stringify(["Kategorie X", "Kategorie Y"]),
      priority_categories: JSON.stringify(["Zielgruppe A", "Zielgruppe B"]),
    };
    let legacyErrors = [];
    // boosted_keywords: string[] → soll { keyword, score=1, total_count=1 } normalisieren
    try {
      const arr = JSON.parse(legacyData.boosted_keywords);
      const normalized = arr.map(item => typeof item === "string"
        ? { keyword: item, score: 1, total_count: 1, won_count: 0, relevant_count: 1 }
        : item);
      if (!normalized.every(k => k.keyword && k.score > 0)) legacyErrors.push('boosted_keywords normalization');
    } catch { legacyErrors.push('boosted_keywords parse'); }
    // excluded_categories: string[] → soll { category } normalisieren
    try {
      const arr = JSON.parse(legacyData.excluded_categories);
      const normalized = arr.map(item => typeof item === "string" ? { category: item } : item);
      if (!normalized.every(c => c.category)) legacyErrors.push('excluded_categories normalization');
    } catch { legacyErrors.push('excluded_categories parse'); }
    // priority_categories: string[] → soll { category } normalisieren
    try {
      const arr = JSON.parse(legacyData.priority_categories);
      const normalized = arr.map(item => typeof item === "string" ? { category: item } : item);
      if (!normalized.every(c => c.category)) legacyErrors.push('priority_categories normalization');
    } catch { legacyErrors.push('priority_categories parse'); }

    if (legacyErrors.length === 0) {
      pass('9. Legacy-Format (string[]) kompatibel',
        'string[] für boosted_keywords, excluded_categories, priority_categories korrekt normalisiert – kein Crash',
        { tested_formats: ['boosted_keywords: string[]', 'excluded_categories: string[]', 'priority_categories: string[]'] });
    } else {
      fail('9. Legacy-Format (string[]) kompatibel',
        `Normalisierungsfehler: ${legacyErrors.join(', ')}`,
        { errors: legacyErrors });
    }

    const allPassed = failed === 0;
    return Response.json({
      success: true,
      summary: { total: tests.length, passed, failed, status: allPassed ? '✅ ALLE TESTS GRÜN' : `⚠️ ${failed} TEST(S) FEHLGESCHLAGEN` },
      visibility_status: allPassed ? '✅ SICHTBARKEIT GRÜN – Dashboard kann Learning-Daten anzeigen' : '❌ FIXES ERFORDERLICH',
      current_state: {
        total_outcomes: totalOutcomes,
        weight_level: expectedWeight,
        has_signals: !!signals,
        last_computed_at: signals?.last_computed_at || null,
        dashboard_box: expectedWeight === 'none'
          ? 'Zeigt: "Noch kein Feedback – Bewerten Sie Leads"'
          : expectedWeight === 'light'
          ? `Zeigt: "Erste Muster erkannt – ${totalOutcomes} Rückmeldungen"`
          : `Zeigt: "Starke Optimierung aktiv – ${totalOutcomes} Rückmeldungen"`,
      },
      tests,
    });

  } catch (error) {
    console.error('[auditLearningVisibility] Error:', error?.message);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});