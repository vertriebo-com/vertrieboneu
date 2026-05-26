/**
 * auditCompanyBackfillPlan
 * =========================
 * Erstellt einen Review-Report für backfillCompanyQualityAndLifecycle.
 * Zeigt welche Companies wie geändert würden – OHNE Daten zu ändern.
 *
 * Input: { org_id?, limit = 200, include_samples = true }
 * Output: { claim_status, risk_level, summary, quality_tier_plan, lifecycle_stage_plan, sample_changes, warnings, recommended_action }
 *
 * Sicherheitsregeln:
 * - dry_run only (keine Datenänderung)
 * - archived/blacklisted nicht aggressiv ändern
 * - Companies mit won Opportunity oder lifecycle=customer nicht auf lead setzen
 * - Companies mit lost status nicht auf lead setzen
 * - quality_tier nur aus vorhandenen Daten ableiten
 * - Wenn Daten unsicher: unknown oder nicht ändern
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);
    const body = await req.json().catch(() => ({}));
    const { org_id, limit = 200, include_samples = true } = body;

    // ── Org auflösen ──────────────────────────────────────────────────────────
    let org = null;
    if (org_id) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: org_id });
      org = orgs?.[0] || null;
      if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });
      if (org.owner_email !== user.email && !isPlatformAdmin) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
      org = ownerOrgs?.[0] || null;
      if (!org && isPlatformAdmin) {
        const anyOrg = await base44.asServiceRole.entities.Organization.list('-created_date', 1);
        org = anyOrg?.[0] || null;
      }
      if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });
    }

    const orgId = org.id;
    const now = new Date();
    const PAGE_SIZE = 100;

    // ── Companies laden (paginiert, org-scoped) ───────────────────────────────
    const allCompanies = [];
    for (let skip = 0; skip < limit && skip < 2000; skip += PAGE_SIZE) {
      const batchSize = Math.min(PAGE_SIZE, limit - skip);
      const batch = await base44.asServiceRole.entities.Company.filter(
        { organization_id: orgId }, '-created_date', batchSize, skip
      );
      for (const c of batch) allCompanies.push(c);
      if (batch.length < batchSize) break;
    }

    // ── Opportunities laden (für customer/won Konflikte) ──────────────────────
    const allOpportunities = [];
    for (let skip = 0; skip < 5000; skip += PAGE_SIZE) {
      const batch = await base44.asServiceRole.entities.Opportunity.filter(
        { organization_id: orgId }, '-created_date', PAGE_SIZE, skip
      );
      for (const o of batch) allOpportunities.push(o);
      if (batch.length < PAGE_SIZE) break;
    }

    // Company-IDs mit won Opportunities
    const wonOppCompanyIds = new Set(
      allOpportunities.filter(o => o.status === 'won').map(o => o.company_id)
    );

    // ── Analyse pro Company ───────────────────────────────────────────────────
    const qualityTierPlan = { premium: 0, strong: 0, good: 0, weak: 0, unknown: 0, no_change: 0 };
    const lifecycleStagePlan = { lead: 0, qualified: 0, customer: 0, lost: 0, archived: 0, no_change: 0 };
    
    const sampleChanges = [];
    const warnings = [];
    
    let qualityTierMissing = 0;
    let lifecycleStageMissing = 0;
    let excludedArchived = 0;
    let excludedBlacklisted = 0;
    let potentialCustomerConflicts = 0;
    let safeToApply = true;

    for (const company of allCompanies) {
      const currentQualityTier = company.quality_tier || null;
      const currentLifecycleStage = company.lifecycle_stage || 'lead';
      
      const isArchived = company.lifecycle_stage === 'archived' || company.status === 'Archiviert';
      const isBlacklisted = company.is_blacklisted === true;
      const isLost = company.lifecycle_stage === 'lost' || company.status === 'Verloren';
      const isCustomer = company.lifecycle_stage === 'customer' || company.status === 'Gewonnen';
      const hasWonOpp = wonOppCompanyIds.has(company.id);

      // Archivierte/blacklisted zählen aber nicht aggressiv ändern
      if (isArchived) {
        excludedArchived++;
        lifecycleStagePlan.no_change++;
        qualityTierPlan.no_change++;
        continue;
      }
      if (isBlacklisted) {
        excludedBlacklisted++;
        lifecycleStagePlan.no_change++;
        qualityTierPlan.no_change++;
        continue;
      }

      // ── quality_tier ableiten ───────────────────────────────────────────────
      let proposedQualityTier = currentQualityTier;
      let qualityReason = '';

      if (!currentQualityTier) {
        qualityTierMissing++;
        // Aus engine_analysis_json oder relevance_score ableiten
        const engineJson = company.engine_analysis_json;
        const relevanceScore = company.relevance_score || 0;
        const qualityConfidence = company.quality_confidence;

        if (engineJson) {
          try {
            const engine = typeof engineJson === 'string' ? JSON.parse(engineJson) : engineJson;
            proposedQualityTier = engine.quality_tier || null;
            qualityReason = `from engine_analysis_json (${engine.quality_tier || 'unknown'})`;
          } catch {
            proposedQualityTier = null;
            qualityReason = 'engine_analysis_json parse error';
          }
        } else if (relevanceScore >= 85) {
          proposedQualityTier = 'strong';
          qualityReason = `relevance_score ${relevanceScore} >= 85`;
        } else if (relevanceScore >= 70) {
          proposedQualityTier = 'good';
          qualityReason = `relevance_score ${relevanceScore} >= 70`;
        } else if (relevanceScore >= 50) {
          proposedQualityTier = 'weak';
          qualityReason = `relevance_score ${relevanceScore} >= 50`;
        } else {
          proposedQualityTier = 'unknown';
          qualityReason = 'insufficient data for quality_tier';
        }
      }

      // ── lifecycle_stage ableiten ────────────────────────────────────────────
      let proposedLifecycleStage = currentLifecycleStage;
      let lifecycleReason = '';

      if (currentLifecycleStage === 'lead' || !currentLifecycleStage) {
        // Prüfen ob Company eigentlich customer oder lost sein sollte
        if (hasWonOpp) {
          // Company mit won Opportunity sollte customer sein, nicht lead
          proposedLifecycleStage = 'customer';
          lifecycleReason = 'has won opportunity → should be customer';
          potentialCustomerConflicts++;
          warnings.push({
            type: 'lifecycle_conflict',
            company_id: company.id,
            company_name: company.name,
            issue: 'Company hat won Opportunity aber lifecycle_stage=lead',
            recommendation: 'Manuell prüfen: lifecycle_stage auf customer setzen oder Opportunity archivieren',
            severity: 'high',
          });
          safeToApply = false;
        } else if (isLost) {
          // status=Verloren aber lifecycle!=lost
          proposedLifecycleStage = 'lost';
          lifecycleReason = 'status=Verloren → should be lost';
        } else {
          // Bleibt lead (keine Änderung nötig)
          proposedLifecycleStage = 'lead';
          lifecycleReason = 'no change needed';
        }
      } else if (currentLifecycleStage === 'customer') {
        // Customer nicht auf lead zurücksetzen!
        if (hasWonOpp) {
          lifecycleReason = 'customer with won opportunity → keep as customer';
        } else {
          // Customer ohne won Opp → Warning aber nicht automatisch ändern
          warnings.push({
            type: 'customer_without_won_opp',
            company_id: company.id,
            company_name: company.name,
            issue: 'Company lifecycle_stage=customer aber keine won Opportunity',
            recommendation: 'Manuell prüfen: Customer-Status plausibel?',
            severity: 'medium',
          });
          lifecycleReason = 'customer without won opportunity → manual review recommended';
        }
      } else if (currentLifecycleStage === 'lost') {
        // Lost nicht auf lead zurücksetzen!
        lifecycleReason = 'lost → keep as lost (no downgrade to lead)';
      } else if (currentLifecycleStage === 'archived') {
        lifecycleReason = 'archived → no change';
      } else if (currentLifecycleStage === 'qualified') {
        lifecycleReason = 'qualified → keep as qualified';
      }

      // ── Konflikte prüfen ────────────────────────────────────────────────────
      // Customer/won nicht auf lead setzen
      if (currentLifecycleStage === 'customer' && proposedLifecycleStage === 'lead') {
        proposedLifecycleStage = 'customer';
        lifecycleReason = 'PREVENTED: customer → lead (would overwrite historical truth)';
        safeToApply = false;
        warnings.push({
          type: 'prevented_lifecycle_downgrade',
          company_id: company.id,
          company_name: company.name,
          issue: 'Backfill würde customer auf lead setzen',
          recommendation: 'Company manuell prüfen, nicht automatisch ändern',
          severity: 'critical',
        });
      }

      // Lost nicht auf lead setzen
      if (currentLifecycleStage === 'lost' && proposedLifecycleStage === 'lead') {
        proposedLifecycleStage = 'lost';
        lifecycleReason = 'PREVENTED: lost → lead (would overwrite historical truth)';
        safeToApply = false;
        warnings.push({
          type: 'prevented_lifecycle_downgrade',
          company_id: company.id,
          company_name: company.name,
          issue: 'Backfill würde lost auf lead setzen',
          recommendation: 'Company manuell prüfen, nicht automatisch ändern',
          severity: 'critical',
        });
      }

      // ── Zählen ──────────────────────────────────────────────────────────────
      if (proposedQualityTier && proposedQualityTier !== currentQualityTier) {
        qualityTierPlan[proposedQualityTier] = (qualityTierPlan[proposedQualityTier] || 0) + 1;
      } else {
        qualityTierPlan.no_change++;
      }

      if (proposedLifecycleStage && proposedLifecycleStage !== currentLifecycleStage) {
        lifecycleStagePlan[proposedLifecycleStage] = (lifecycleStagePlan[proposedLifecycleStage] || 0) + 1;
      } else {
        lifecycleStagePlan.no_change++;
      }

      // ── Samples (nur wenn include_samples) ──────────────────────────────────
      if (include_samples && (proposedQualityTier !== currentQualityTier || proposedLifecycleStage !== currentLifecycleStage)) {
        if (sampleChanges.length < 20) {
          sampleChanges.push({
            company_id: company.id,
            company_name: company.name,
            current_quality_tier: currentQualityTier || 'unknown',
            proposed_quality_tier: proposedQualityTier || 'unknown',
            current_lifecycle_stage: currentLifecycleStage || 'lead',
            proposed_lifecycle_stage: proposedLifecycleStage || 'lead',
            quality_reason: qualityReason,
            lifecycle_reason: lifecycleReason,
            risk: (currentLifecycleStage === 'customer' || currentLifecycleStage === 'lost') ? 'high' : 
                  (isArchived || isBlacklisted) ? 'medium' : 'low',
          });
        }
      }
    }

    // ── Risikobewertung ───────────────────────────────────────────────────────
    const criticalWarnings = warnings.filter(w => w.severity === 'critical');
    const highWarnings = warnings.filter(w => w.severity === 'high');

    let riskLevel, claimStatus;

    if (criticalWarnings.length > 0) {
      riskLevel = 'critical';
      claimStatus = 'red';
    } else if (highWarnings.length > 0 || potentialCustomerConflicts > 0) {
      riskLevel = 'high';
      claimStatus = 'yellow';
    } else if (!safeToApply) {
      riskLevel = 'medium';
      claimStatus = 'yellow';
    } else {
      riskLevel = 'low';
      claimStatus = 'green';
    }

    // ── Empfehlung ────────────────────────────────────────────────────────────
    let recommendedAction;
    if (claimStatus === 'red') {
      recommendedAction = 'NICHT AUSFÜHREN. Kritische Konflikte manuell prüfen. Backfill nur für unproblematische Companies mit org_id-Filter und expliziter Freigabe.';
    } else if (claimStatus === 'yellow') {
      recommendedAction = 'Eingeschränkt ausführen. Nur für Companies ohne Konflikte (exclude: customer, lost, archived, blacklisted). Dry-run Report speichern und manuell freigeben.';
    } else {
      recommendedAction = 'Sicher ausführen. Keine kritischen Konflikte erkannt. Backfill kann mit dry_run=false durchgeführt werden.';
    }

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,
      summary: {
        companies_checked: allCompanies.length,
        quality_tier_missing: qualityTierMissing,
        lifecycle_stage_missing: lifecycleStageMissing,
        excluded_archived: excludedArchived,
        excluded_blacklisted: excludedBlacklisted,
        potential_customer_conflicts: potentialCustomerConflicts,
        safe_to_apply: safeToApply,
      },
      quality_tier_plan: qualityTierPlan,
      lifecycle_stage_plan: lifecycleStagePlan,
      sample_changes: sampleChanges,
      warnings: warnings,
      recommended_action: recommendedAction,
      diagnostics: {
        org_id: orgId,
        generated_at: now.toISOString(),
        limit_requested: limit,
        companies_loaded: allCompanies.length,
        opportunities_checked: allOpportunities.length,
        won_opportunities_count: wonOppCompanyIds.size,
      },
    });

  } catch (error) {
    console.error('[auditCompanyBackfillPlan] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});