import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !["admin", "platform_owner", "platform_admin", "organization_admin"].includes(user.role)) {
      return Response.json({ error: "Forbidden: admin or org_admin required" }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { org_id, dry_run = true, limit = 100 } = payload;

    // ── AUTH / TENANT ──
    let targetOrgId = org_id;
    if (!targetOrgId) {
      const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
      targetOrgId = orgs?.[0]?.id;
    }
    if (!targetOrgId) {
      return Response.json({ error: "No organization found" }, { status: 404 });
    }

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);
    const orgs = await base44.entities.Organization.filter({ id: targetOrgId });
    if (!orgs || orgs.length === 0) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }
    const org = orgs[0];
    if (!isPlatformAdmin && org.owner_email !== user.email) {
      return Response.json({ error: "Forbidden: Not your organization" }, { status: 403 });
    }

    // ── COMPANIES LADEN ──
    const companies = await base44.entities.Company.filter({ organization_id: targetOrgId }, '-created_date', limit);
    const now = new Date();

    const updates = [];
    const stats = {
      total: companies.length,
      quality_tier_backfilled: 0,
      lifecycle_backfilled: 0,
      no_action_needed: 0,
    };

    for (const company of companies) {
      const changes = {};
      let willUpdate = false;

      // 1. QUALITY_TIER BACKFILL – nur wenn Feld fehlt ODER invalid
      const validQualityTiers = ['premium', 'strong', 'good', 'weak'];
      const hasValidQualityTier = company.quality_tier && validQualityTiers.includes(company.quality_tier);
      
      if (!hasValidQualityTier) {
        // Aus relevance_score + engine_confidence ableiten
        const score = company.relevance_score || 0;
        const engineConf = company.engine_confidence || 0;
        const combinedScore = (score + engineConf) / 2;

        let proposedTier;
        if (combinedScore >= 85) proposedTier = 'premium';
        else if (combinedScore >= 75) proposedTier = 'strong';
        else if (combinedScore >= 65) proposedTier = 'good';
        else proposedTier = 'weak';

        // Nur ändern wenn neuer Wert anders ist als aktueller
        if (proposedTier !== company.quality_tier) {
          changes.quality_tier = proposedTier;
          stats.quality_tier_backfilled++;
          willUpdate = true;
        }
      }

      // 2. LIFECYCLE_STAGE BACKFILL – nur wenn Feld fehlt ODER invalid
      const validLifecycleStages = ['lead', 'qualified', 'customer', 'lost', 'archived'];
      const hasValidLifecycleStage = company.lifecycle_stage && validLifecycleStages.includes(company.lifecycle_stage);
      
      if (!hasValidLifecycleStage) {
        // Default: lead
        const proposedStage = 'lead';
        
        // Nur ändern wenn neuer Wert anders ist als aktueller
        if (proposedStage !== company.lifecycle_stage) {
          changes.lifecycle_stage = proposedStage;
          changes.lifecycle_stage_changed_at = now.toISOString();
          changes.lifecycle_stage_changed_by = user.email;
          stats.lifecycle_backfilled++;
          willUpdate = true;
        }
      }

      // UPDATE QUEUEN – nur wenn echte Änderungen
      if (willUpdate && Object.keys(changes).length > 0) {
        updates.push({
          company_id: company.id,
          company_name: company.name,
          changes,
        });
      } else {
        stats.no_action_needed++;
      }
    }

    // ── AUSFÜHREN (wenn nicht dry_run) ──
    if (!dry_run && updates.length > 0) {
      for (const update of updates) {
        await base44.entities.Company.update(update.company_id, update.changes);
      }
    }

    return Response.json({
      dry_run,
      org_id: targetOrgId,
      stats,
      updates: dry_run ? updates : undefined,
      message: dry_run
        ? `Dry Run: ${stats.quality_tier_backfilled} quality_tier, ${stats.lifecycle_backfilled} lifecycle_stage würden aktualisiert`
        : `${updates.length} Companies aktualisiert`,
    });
  } catch (error) {
    console.error('backfillCompanyQualityAndLifecycle error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});