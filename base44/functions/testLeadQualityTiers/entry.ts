/**
 * testLeadQualityTiers
 * Minimalistischer Test für die 3 neuen Simtests aus auditLeadQualityEngine
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!["admin", "platform_owner", "platform_admin"].includes(user?.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Inline simScore aus auditLeadQualityEngine
    function simScore(overrides = {}) {
      const {
        hasCat = false, hasPlaceType = false, placeTypeConf = 'medium',
        hasPhone = false, hasWebsite = false, hasAddress = false, distanceOk = false,
        hasTCMatch = false, strategy = 'target_customer_search',
        badFitPenalty = 0, websiteRequired = false,
        scoringSignals = 0,
        queryIntentMatch = false,
      } = overrides;

      let score = 50;
      const evidenceFlags = {
        category_match: hasCat,
        place_type_match: hasPlaceType,
        scoring_signal_match: scoringSignals > 0,
        target_customer_match: hasTCMatch,
        query_intent_match: queryIntentMatch,
        phone: hasPhone,
        website: hasWebsite,
        address: hasAddress,
      };

      if (hasCat) score += 20;
      if (hasPlaceType) score += placeTypeConf === 'high' ? 15 : placeTypeConf === 'medium' ? 8 : 3;
      const sigScore = Math.min(35, scoringSignals * 12);
      score += sigScore;
      if (hasPhone) score += 8;
      if (hasWebsite) score += 8;
      if (distanceOk) score += 8;
      const tcBonus = strategy === 'target_customer_search' ? 10 : strategy === 'mixed' ? 8 : 6;
      if (hasTCMatch) score += tcBonus;
      if (websiteRequired && !hasWebsite) score = Math.min(score, 54);
      score += badFitPenalty;
      score = Math.max(0, Math.min(100, score));

      const strongEvidenceCount = ['category_match','place_type_match','scoring_signal_match','target_customer_match','query_intent_match']
        .filter(k => evidenceFlags[k]).length;
      const weakEvidenceCount = ['phone','website','address'].filter(k => evidenceFlags[k]).length;

      const hasAdditionalHardEvidence = hasPlaceType || scoringSignals > 0 || hasTCMatch;
      const hasStrongContactEvidence = hasPhone && hasWebsite;
      const isTargetQueryCategory = queryIntentMatch && hasCat;

      let qualityTier, qualityConfidence;

      if (score >= 85 && strongEvidenceCount >= 3 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
        qualityTier = 'premium'; qualityConfidence = 'high';
      } else if (score >= 75 && strongEvidenceCount >= 2 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
        qualityTier = 'strong'; qualityConfidence = 'high';
      } else if (score >= 65 && strongEvidenceCount >= 2 && (hasAdditionalHardEvidence || hasStrongContactEvidence)) {
        qualityTier = 'good'; qualityConfidence = 'medium';
      } else if (isTargetQueryCategory && weakEvidenceCount >= 1 && score >= 65) {
        qualityTier = 'good'; qualityConfidence = 'medium';
      } else {
        qualityTier = 'weak'; qualityConfidence = 'low';
      }

      return { score, qualityTier, qualityConfidence, strongEvidenceCount, weakEvidenceCount };
    }

    // Drei Tests
    const tests = [
      {
        name: "target_customer_query_match_good",
        params: { hasCat: true, hasAddress: true, queryIntentMatch: true, distanceOk: true },
        expectedTier: "good",
        expectedConfidence: "medium",
      },
      {
        name: "target_customer_query_with_phone_website",
        params: { hasCat: true, queryIntentMatch: true, hasPhone: true, hasWebsite: true, distanceOk: true },
        expectedTier: "strong",
        expectedConfidence: "high",
      },
      {
        name: "pure_taxonomy_category_address",
        params: { hasCat: true, hasAddress: true, queryIntentMatch: false, distanceOk: true },
        expectedTier: "weak",
        expectedConfidence: "low",
      },
    ];

    const results = [];
    for (const t of tests) {
      const result = simScore(t.params);
      const tierMatch = result.qualityTier === t.expectedTier;
      const confMatch = result.qualityConfidence === t.expectedConfidence;
      const pass = tierMatch && confMatch;

      results.push({
        test: t.name,
        expected: `${t.expectedTier}/${t.expectedConfidence}`,
        actual: `${result.qualityTier}/${result.qualityConfidence}`,
        score: result.score,
        strongEvidence: result.strongEvidenceCount,
        weakEvidence: result.weakEvidenceCount,
        pass,
      });
    }

    return Response.json({ results });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});