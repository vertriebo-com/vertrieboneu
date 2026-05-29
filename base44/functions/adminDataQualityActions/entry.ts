/**
 * adminDataQualityActions
 * =======================
 * Admin-only Datenqualitäts-Diagnose und Backfill-Actions für Companies.
 *
 * Actions:
 *   auditCompanyDataQuality   – Übersicht Datenqualität (eine Org oder alle)
 *   backfillQualityTier       – quality_tier nachträglich setzen
 *   backfillLifecycleStage    – lifecycle_stage nachträglich setzen
 *   detectDuplicateCompanies  – Duplikatgruppen finden (kein Auto-Merge)
 *   auditCompaniesMissingFields – fehlende Felder zählen
 *
 * Auth: admin / platform_owner / platform_admin only
 * AuditLog: bei backfill-Actions
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);
const PAGE = 500; // max companies per filter-call

async function loadCompanies(db, orgId) {
  if (orgId) {
    return db.Company.filter({ organization_id: orgId }, '-created_date', PAGE);
  }
  // all_orgs: load up to 2000 companies
  const [a, b, c, d] = await Promise.all([
    db.Company.list('-created_date', 500),
    db.Company.list('-created_date', 500).then(r => r).catch(() => []),
  ]);
  // Base44 list doesn't support offset, so we use a reasonable ceiling
  return db.Company.list('-created_date', 2000);
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !ADMIN_ROLES.has(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { action } = payload;

    if (!action) {
      return Response.json({ error: 'action ist erforderlich' }, { status: 400 });
    }

    const db = base44.asServiceRole.entities;
    const now = new Date().toISOString();

    // ── auditCompanyDataQuality ───────────────────────────────────────────────
    if (action === 'auditCompanyDataQuality') {
      const { organization_id, mode = 'single_org' } = payload;

      let companies;
      if (mode === 'all_orgs') {
        companies = await db.Company.list('-created_date', 2000);
      } else {
        if (!organization_id) return Response.json({ error: 'organization_id erforderlich für single_org mode' }, { status: 400 });
        companies = await db.Company.filter({ organization_id }, '-created_date', 1000);
      }

      const total = companies.length;

      const noOrgId       = companies.filter(c => !c.organization_id);
      const noQualTier    = companies.filter(c => !c.quality_tier);
      const noLifecycle   = companies.filter(c => !c.lifecycle_stage);
      const noPlaceId     = companies.filter(c => !c.google_place_id);
      const noPlz         = companies.filter(c => !c.plz && !c.ort);
      const noContact     = companies.filter(c => !c.telefon && !c.website);

      // Duplikate: gleiche google_place_id innerhalb org
      const placeIdMap = {};
      companies.forEach(c => {
        if (!c.google_place_id) return;
        const key = `${c.organization_id}::${c.google_place_id}`;
        if (!placeIdMap[key]) placeIdMap[key] = [];
        placeIdMap[key].push(c.id);
      });
      const dupByPlaceId = Object.values(placeIdMap).filter(ids => ids.length > 1);

      // Duplikate: gleicher name + city
      const nameMap = {};
      companies.forEach(c => {
        if (!c.name || !c.ort) return;
        const key = `${c.organization_id}::${normalize(c.name)}::${normalize(c.ort)}`;
        if (!nameMap[key]) nameMap[key] = [];
        nameMap[key].push(c.id);
      });
      const dupByNameCity = Object.values(nameMap).filter(ids => ids.length > 1);

      const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
      const severity = (n) => {
        const p = pct(n);
        if (p >= 50) return 'critical';
        if (p >= 20) return 'warning';
        return 'ok';
      };

      const sample = (arr, max = 20) => arr.slice(0, max).map(c => ({
        id: c.id, name: c.name, org: c.organization_id, city: c.ort, plz: c.plz,
      }));

      // Overall score: 100 - weighted penalties
      const qualTierPct    = pct(noQualTier.length);
      const lifecyclePct   = pct(noLifecycle.length);
      const contactPct     = pct(noContact.length);
      const dupCount       = dupByPlaceId.length + dupByNameCity.length;
      const score = Math.max(0, 100 - Math.round(
        qualTierPct * 0.25 + lifecyclePct * 0.2 + contactPct * 0.15 + Math.min(dupCount * 5, 30)
      ));

      return Response.json({
        success: true,
        action,
        mode,
        organization_id: organization_id || 'all',
        total_companies: total,
        score,
        checks: {
          no_organization_id:   { count: noOrgId.length,     pct: pct(noOrgId.length),     severity: severity(noOrgId.length),     examples: sample(noOrgId) },
          no_quality_tier:      { count: noQualTier.length,  pct: pct(noQualTier.length),  severity: severity(noQualTier.length),  examples: sample(noQualTier) },
          no_lifecycle_stage:   { count: noLifecycle.length, pct: pct(noLifecycle.length), severity: severity(noLifecycle.length), examples: sample(noLifecycle) },
          no_google_place_id:   { count: noPlaceId.length,   pct: pct(noPlaceId.length),   severity: severity(noPlaceId.length),   examples: sample(noPlaceId) },
          no_plz_or_city:       { count: noPlz.length,       pct: pct(noPlz.length),       severity: severity(noPlz.length),       examples: sample(noPlz) },
          no_phone_or_website:  { count: noContact.length,   pct: pct(noContact.length),   severity: severity(noContact.length),   examples: sample(noContact) },
          duplicates_place_id:  { count: dupByPlaceId.length, severity: dupByPlaceId.length > 0 ? 'warning' : 'ok', groups: dupByPlaceId.slice(0, 20) },
          duplicates_name_city: { count: dupByNameCity.length, severity: dupByNameCity.length > 0 ? 'warning' : 'ok', groups: dupByNameCity.slice(0, 20) },
        },
      });
    }

    // ── backfillQualityTier ───────────────────────────────────────────────────
    if (action === 'backfillQualityTier') {
      const { organization_id, force = false } = payload;
      if (!organization_id) return Response.json({ error: 'organization_id erforderlich' }, { status: 400 });

      const companies = await db.Company.filter({ organization_id }, '-created_date', 1000);
      const candidates = force ? companies : companies.filter(c => !c.quality_tier);

      let updated = 0;
      const errors = [];
      const BATCH = 8;
      const DELAY_MS = 500;

      for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH);
        await Promise.all(batch.map(async c => {
          const hasPhone    = !!(c.telefon || '').trim();
          const hasWebsite  = !!(c.website || '').trim();
          const hasAddress  = !!(c.adresse || c.ort || c.plz || '').trim();
          const hasCategory = !!(c.branche || c.matched_target_customer_type || '').trim();

          let tier;
          if ((hasPhone || hasWebsite) && (hasAddress || hasCategory)) {
            tier = 'good';
          } else if (hasPhone || hasWebsite || hasAddress) {
            tier = 'medium';
          } else if (c.name) {
            tier = 'low';
          } else {
            tier = 'unknown';
          }

          try {
            await db.Company.update(c.id, { quality_tier: tier });
            updated++;
          } catch (e) {
            errors.push({ id: c.id, error: e.message });
          }
        }));
        if (i + BATCH < candidates.length) {
          await new Promise(r => setTimeout(r, DELAY_MS));
        }
      }

      const failed = errors.length;
      const skipped = companies.length - candidates.length;
      const remaining_candidates = failed; // rate-limit failures can be retried

      await db.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'backfill_quality_tier',
        target_type: 'organization',
        target_id: organization_id,
        organization_id,
        metadata: JSON.stringify({ attempted: candidates.length, updated, failed, skipped, force, action, organization_id }),
        reason: `Backfill quality_tier: ${updated}/${candidates.length} aktualisiert, ${failed} Fehler, ${skipped} übersprungen (force=${force})`,
      });

      console.info(`[adminDataQualityActions] backfillQualityTier: org=${organization_id} updated=${updated} failed=${failed} skipped=${skipped} force=${force}`);
      return Response.json({
        success: true, action,
        total: companies.length,
        candidates: candidates.length,
        updated,
        failed,
        skipped,
        remaining_candidates,
        retry_hint: failed > 0 ? `${updated} Datensätze aktualisiert, ${failed} wegen Plattform-Limit übersprungen. Bitte erneut ausführen.` : null,
        errors,
      });
    }

    // ── backfillLifecycleStage ────────────────────────────────────────────────
    if (action === 'backfillLifecycleStage') {
      const { organization_id, force = false } = payload;
      if (!organization_id) return Response.json({ error: 'organization_id erforderlich' }, { status: 400 });

      const companies = await db.Company.filter({ organization_id }, '-created_date', 1000);
      const candidates = force ? companies : companies.filter(c => !c.lifecycle_stage);

      // Load contact logs + opportunities for this org
      let contactLogs = [];
      let opportunities = [];
      try {
        contactLogs   = await db.ContactLog.filter({ organization_id }, '-created_date', 2000);
        opportunities = await db.Opportunity.filter({ organization_id }, '-created_date', 500);
      } catch { /* optional */ }

      const contactedIds  = new Set(contactLogs.map(l => l.company_id));
      const opportunityMap = {};
      opportunities.forEach(o => { opportunityMap[o.company_id] = o.stage || o.status; });

      let updated = 0;
      const errors = [];
      const BATCH = 8;
      const DELAY_MS = 500;

      for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH);
        await Promise.all(batch.map(async c => {
          const status   = c.status || '';
          const oppStage = opportunityMap[c.id] || '';

          let stage;
          if (status === 'Gewonnen' || oppStage === 'won') {
            stage = 'customer';
          } else if (status === 'Verloren' || oppStage === 'lost') {
            stage = 'lost';
          } else if (['Angebot', 'Termin'].includes(status) || ['offer_sent', 'negotiation', 'qualified'].includes(oppStage)) {
            stage = 'qualified';
          } else if (contactedIds.has(c.id) || ['Kontakt', 'Rückruf'].includes(status)) {
            stage = 'lead';
          } else {
            stage = 'lead';
          }

          try {
            await db.Company.update(c.id, { lifecycle_stage: stage });
            updated++;
          } catch (e) {
            errors.push({ id: c.id, error: e.message });
          }
        }));
        if (i + BATCH < candidates.length) {
          await new Promise(r => setTimeout(r, DELAY_MS));
        }
      }

      const failed = errors.length;
      const skipped = companies.length - candidates.length;
      const remaining_candidates = failed;

      await db.PlatformAuditLog.create({
        actor_email: user.email,
        actor_role: user.role,
        action: 'backfill_lifecycle_stage',
        target_type: 'organization',
        target_id: organization_id,
        organization_id,
        metadata: JSON.stringify({ attempted: candidates.length, updated, failed, skipped, force, action, organization_id }),
        reason: `Backfill lifecycle_stage: ${updated}/${candidates.length} aktualisiert, ${failed} Fehler, ${skipped} übersprungen (force=${force})`,
      });

      console.info(`[adminDataQualityActions] backfillLifecycleStage: org=${organization_id} updated=${updated} failed=${failed} skipped=${skipped} force=${force}`);
      return Response.json({
        success: true, action,
        total: companies.length,
        candidates: candidates.length,
        updated,
        failed,
        skipped,
        remaining_candidates,
        retry_hint: failed > 0 ? `${updated} Datensätze aktualisiert, ${failed} wegen Plattform-Limit übersprungen. Bitte erneut ausführen.` : null,
        errors,
      });
    }

    // ── detectDuplicateCompanies ──────────────────────────────────────────────
    if (action === 'detectDuplicateCompanies') {
      const { organization_id } = payload;
      if (!organization_id) return Response.json({ error: 'organization_id erforderlich' }, { status: 400 });

      const companies = await db.Company.filter({ organization_id }, '-created_date', 1000);

      const groups = [];

      // 1. By google_place_id
      const placeMap = {};
      companies.forEach(c => {
        if (!c.google_place_id) return;
        if (!placeMap[c.google_place_id]) placeMap[c.google_place_id] = [];
        placeMap[c.google_place_id].push(c);
      });
      Object.entries(placeMap).forEach(([pid, cs]) => {
        if (cs.length < 2) return;
        cs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        groups.push({
          reason: 'same_google_place_id',
          key: pid,
          group_size: cs.length,
          recommended_keep_id: cs[0].id,
          candidate_company_ids: cs.map(c => c.id),
          companies: cs.map(c => ({ id: c.id, name: c.name, created_date: c.created_date, status: c.status })),
        });
      });

      // 2. By normalized name + city
      const nameMap = {};
      companies.forEach(c => {
        if (!c.name || !c.ort) return;
        const key = `${normalize(c.name)}::${normalize(c.ort)}`;
        if (!nameMap[key]) nameMap[key] = [];
        nameMap[key].push(c);
      });
      Object.entries(nameMap).forEach(([key, cs]) => {
        if (cs.length < 2) return;
        // Skip if already covered by place_id group
        const alreadyCovered = groups.some(g => g.candidate_company_ids.some(id => cs.map(c => c.id).includes(id)));
        if (alreadyCovered) return;
        cs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        groups.push({
          reason: 'same_name_city',
          key,
          group_size: cs.length,
          recommended_keep_id: cs[0].id,
          candidate_company_ids: cs.map(c => c.id),
          companies: cs.map(c => ({ id: c.id, name: c.name, ort: c.ort, created_date: c.created_date, status: c.status })),
        });
      });

      // 3. By phone
      const phoneMap = {};
      companies.forEach(c => {
        const phone = normalize(c.telefon).replace(/[\s\-\(\)]/g, '');
        if (!phone || phone.length < 6) return;
        if (!phoneMap[phone]) phoneMap[phone] = [];
        phoneMap[phone].push(c);
      });
      Object.entries(phoneMap).forEach(([phone, cs]) => {
        if (cs.length < 2) return;
        const alreadyCovered = groups.some(g => g.candidate_company_ids.some(id => cs.map(c => c.id).includes(id)));
        if (alreadyCovered) return;
        cs.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        groups.push({
          reason: 'same_phone',
          key: phone,
          group_size: cs.length,
          recommended_keep_id: cs[0].id,
          candidate_company_ids: cs.map(c => c.id),
          companies: cs.map(c => ({ id: c.id, name: c.name, telefon: c.telefon, created_date: c.created_date })),
        });
      });

      console.info(`[adminDataQualityActions] detectDuplicates: org=${organization_id} total=${companies.length} groups=${groups.length}`);
      return Response.json({
        success: true,
        action,
        organization_id,
        total_companies: companies.length,
        duplicate_groups_count: groups.length,
        duplicate_companies_count: groups.reduce((s, g) => s + g.group_size, 0),
        groups,
      });
    }

    // ── auditCompaniesMissingFields ───────────────────────────────────────────
    if (action === 'auditCompaniesMissingFields') {
      const { organization_id } = payload;
      if (!organization_id) return Response.json({ error: 'organization_id erforderlich' }, { status: 400 });

      const companies = await db.Company.filter({ organization_id }, '-created_date', 1000);
      const total = companies.length;
      const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

      const fields = [
        { key: 'missing_phone',           filter: c => !c.telefon },
        { key: 'missing_website',         filter: c => !c.website },
        { key: 'missing_city',            filter: c => !c.ort },
        { key: 'missing_postal_code',     filter: c => !c.plz },
        { key: 'missing_google_place_id', filter: c => !c.google_place_id },
        { key: 'missing_research_run_id', filter: c => !c.research_run_id },
        { key: 'missing_relevance_score', filter: c => c.relevance_score == null || c.relevance_score === 0 },
        { key: 'missing_quality_tier',    filter: c => !c.quality_tier },
        { key: 'missing_lifecycle_stage', filter: c => !c.lifecycle_stage },
      ];

      const results = {};
      for (const f of fields) {
        const matched = companies.filter(f.filter);
        results[f.key] = { count: matched.length, pct: pct(matched.length) };
      }

      return Response.json({ success: true, action, organization_id, total_companies: total, fields: results });
    }

    return Response.json({ error: `Unbekannte action: ${action}` }, { status: 400 });

  } catch (err) {
    console.error('[adminDataQualityActions]', err?.message);
    return Response.json({ error: err?.message || 'Interner Fehler' }, { status: 500 });
  }
});