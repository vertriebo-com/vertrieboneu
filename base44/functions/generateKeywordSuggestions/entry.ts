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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);

    // Organisation ermitteln
    let orgId = organization_id;
    if (!orgId) {
      const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
      orgId = orgs?.[0]?.id;
    }
    if (!orgId) return Response.json({ error: 'Organisation nicht gefunden' }, { status: 404 });

    // Access Check
    if (!isPlatformAdmin) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: orgId });
      const org = orgs?.[0];
      if (!org || (org.owner_email !== user.email)) {
        return Response.json({ error: 'Kein Zugriff' }, { status: 403 });
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

    const industryId = settings.industry_id || org.industry || null;
    if (!industryId) {
      return Response.json({ 
        error: 'Keine Branche definiert',
        message: 'Bitte wählen Sie zuerst eine Branche im Onboarding oder in den Einstellungen.',
        suggestions: []
      }, { status: 400 });
    }

    // ── 3. TaxonomyEntry laden ───────────────────────────────────────────────
    let taxonomyProfile = null;
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
      console.warn('[generateKeywordSuggestions] Taxonomie-Ladefehler:', taxErr.message);
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
    try {
      const learnedRecords = await base44.asServiceRole.entities.OrgLearnedSignals.filter({ 
        organization_id: orgId 
      }, '-updated_date', 1);
      if (learnedRecords[0]) {
        learnedSignals = learnedRecords[0];
      }
    } catch {}

    // ── 5. Bestehende KeywordProfile laden (Duplikate vermeiden) ─────────────
    const existingProfiles = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ 
      organization_id: orgId 
    });
    const existingKeywords = new Set(existingProfiles.map(p => p.keyword.toLowerCase()));

    // ── 6. Vorschläge generieren ─────────────────────────────────────────────
    
    // 6a) Aus target_customer_types (Taxonomie)
    if (taxonomyProfile.target_customer_types) {
      for (const target of taxonomyProfile.target_customer_types.slice(0, 8)) {
        const kwLower = target.toLowerCase();
        if (existingKeywords.has(kwLower)) continue;
        
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

    // 6b) Aus search_keyword_variants (Taxonomie)
    if (taxonomyProfile.search_keyword_variants) {
      const variants = taxonomyProfile.search_keyword_variants;
      for (const [category, keywords] of Object.entries(variants)) {
        if (!Array.isArray(keywords)) continue;
        for (const kw of keywords.slice(0, 3)) {
          const kwLower = kw.toLowerCase();
          if (existingKeywords.has(kwLower)) continue;
          
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

    // 6c) Aus own_services (Taxonomie)
    if (taxonomyProfile.own_services) {
      for (const service of taxonomyProfile.own_services.slice(0, 5)) {
        const kwLower = service.toLowerCase();
        if (existingKeywords.has(kwLower)) continue;
        
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

    // 6d) Aus Onboarding-Einstellungen (falls vorhanden)
    const onboardingTargets = (settings.target_customer_types || '').split(/,|, /).map(x => x.trim()).filter(Boolean);
    for (const target of onboardingTargets) {
      const kwLower = target.toLowerCase();
      if (existingKeywords.has(kwLower)) continue;
      
      suggestions.push({
        keyword: target,
        source: 'onboarding',
        reason: 'Im Onboarding ausgewählt',
        priority_score: 75,
        status: 'suggested',
        metadata: { category: 'onboarding' }
      });
    }

    // 6e) Aus OrgLearnedSignals (bereits gelernte, aber noch nicht als Profile)
    if (learnedSignals && learnedSignals.boosted_keywords) {
      try {
        const boostedKws = JSON.parse(learnedSignals.boosted_keywords);
        for (const kwObj of boostedKws.slice(0, 5)) {
          const kw = typeof kwObj === 'string' ? kwObj : (kwObj.keyword || '');
          const kwLower = kw.toLowerCase();
          if (existingKeywords.has(kwLower) || !kw) continue;
          
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
      } catch {}
    }

    // ── 7. Duplikate entfernen und nach priority_score sortieren ────────────
    const uniqueSuggestions = [];
    const seenKeywords = new Set();
    for (const s of suggestions) {
      const kwLower = s.keyword.toLowerCase();
      if (seenKeywords.has(kwLower)) continue;
      seenKeywords.add(kwLower);
      uniqueSuggestions.push(s);
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
      source_breakdown: {
        taxonomy: uniqueSuggestions.filter(s => s.source === 'taxonomy').length,
        onboarding: uniqueSuggestions.filter(s => s.source === 'onboarding').length,
        outcome_feedback: uniqueSuggestions.filter(s => s.source === 'outcome_feedback').length,
      }
    });

  } catch (error) {
    console.error('[generateKeywordSuggestions] Error:', error.message);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});