/**
 * listCompanies
 * =============
 * Paginated, server-side filtered + sorted Company list for Leads.jsx.
 * Ersetzt client-side Full-Load + Browser-Filterung.
 *
 * Input:
 * {
 *   org_id,
 *   page = 1,
 *   page_size = 50 (max 100),
 *   filters: { search, status, temperature, quality_tier, quality_confidence, city, industry, has_phone, has_email, has_website, assigned_to, research_run_id, tags },
 *   sort: { field, direction }
 * }
 *
 * @supabase-migration
 * Future SQL:
 *   SELECT * FROM companies
 *   WHERE organization_id = $1
 *     AND (search IS NULL OR name ILIKE %search% OR branche ILIKE %search% OR ort ILIKE %search%)
 *     AND (status = $2 OR $2 IS NULL)
 *     AND (quality_tier = $3 OR $3 IS NULL)
 *     ...
 *   ORDER BY {sort_field} {sort_direction}
 *   LIMIT $page_size OFFSET ($page - 1) * $page_size;
 *
 * Future indexes:
 *   - idx_companies_org_id (organization_id)
 *   - idx_companies_status (organization_id, status)
 *   - idx_companies_quality (organization_id, quality_tier, quality_confidence)
 *   - idx_companies_created (organization_id, created_date DESC)
 *   - idx_companies_relevance (organization_id, relevance_score DESC)
 *   - idx_companies_contact (organization_id, last_contact_date DESC)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);

    const body = await req.json().catch(() => ({}));
    let {
      org_id,
      page = 1,
      page_size = 50,
      filters = {},
      sort = { field: 'created_date', direction: 'desc' }
    } = body;

    // ── Pagination Limits ────────────────────────────────────────────────────
    page = Math.max(1, Math.floor(page));
    page_size = Math.max(1, Math.min(100, Math.floor(page_size)));
    const offset = (page - 1) * page_size;

    // ── Org auflösen + AuthZ (identisch zu getDashboardData/getStatisticsSummary) ──
    let org = null;
    if (org_id) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: org_id });
      org = orgs?.[0] || null;
      if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });

      const memberships = isPlatformAdmin ? [] :
        await base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: org_id, user_email: user.email, status: 'active' });
      const isMember = memberships.length > 0;
      const isOwner = org.owner_email === user.email;

      if (!isOwner && !isMember && !isPlatformAdmin) {
        return Response.json({ error: 'Forbidden: no access to this organization' }, { status: 403 });
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

    // ── Filter-Validierung ───────────────────────────────────────────────────
    const {
      search,
      status,
      temperature,
      quality_tier,
      quality_confidence,
      city,
      industry,
      has_phone,
      has_email,
      has_website,
      assigned_to,
      research_run_id,
      tags
    } = filters;

    // ── Sort-Validierung ─────────────────────────────────────────────────────
    const VALID_SORT_FIELDS = new Set(['created_date', 'updated_date', 'relevance_score', 'quality_tier', 'last_contact_date', 'name', 'priority_score', 'lead_temperature_score']);
    const VALID_SORT_DIRECTIONS = new Set(['asc', 'desc']);

    const sortField = VALID_SORT_FIELDS.has(sort?.field) ? sort.field : 'created_date';
    const sortDirection = VALID_SORT_DIRECTIONS.has(sort?.direction) ? sort.direction : 'desc';
    const sortKey = sortDirection === 'desc' ? `-${sortField}` : sortField;

    // ── Companies laden (paginiert mit Max-Limit) ────────────────────────────
    // Base44 entities.filter() unterstützt kein OFFSET → wir laden bis max(1000) und slicen im Speicher
    // TODO Supabase: echtes OFFSET/LIMIT mit SQL
    const MAX_FETCH = 1000; // Hard cap für Performance
    const allCompanies = await base44.asServiceRole.entities.Company.filter(
      { organization_id: orgId },
      sortKey,
      MAX_FETCH
    );

    // ── Server-side Filtering ────────────────────────────────────────────────
    const filtered = allCompanies.filter(c => {
      // Search: name, branche, ort, plz, website, telefon, email
      if (search) {
        const s = search.toLowerCase();
        const searchable = [
          c.name, c.branche, c.ort, c.plz, c.website, c.telefon, c.email
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(s)) return false;
      }

      // Status (single oder array)
      if (status) {
        const statusList = Array.isArray(status) ? status : [status];
        if (!statusList.includes(c.status)) return false;
      }

      // Temperature (hot/warm/cold)
      if (temperature) {
        const temp = c.lead_temperature || (
          (c.lead_temperature_score || c.priority_score || 0) >= 60 ? 'hot' :
          (c.lead_temperature_score || c.priority_score || 0) >= 30 ? 'warm' : 'cold'
        );
        if (temperature === 'hot' && temp !== 'hot') return false;
        if (temperature === 'warm' && temp !== 'warm') return false;
        if (temperature === 'cold' && temp !== 'cold') return false;
      }

      // Quality tier
      if (quality_tier && c.quality_tier !== quality_tier) return false;

      // Quality confidence
      if (quality_confidence && c.quality_confidence !== quality_confidence) return false;

      // City
      if (city && c.ort?.toLowerCase() !== city.toLowerCase()) return false;

      // Industry
      if (industry && c.branche?.toLowerCase() !== industry.toLowerCase()) return false;

      // Has phone/email/website
      if (has_phone === true && !c.telefon) return false;
      if (has_email === true && !c.email) return false;
      if (has_website === true && !c.website) return false;

      // Assigned to
      if (assigned_to && c.assigned_to !== assigned_to) return false;

      // Research run ID
      if (research_run_id && c.research_run_id !== research_run_id) return false;

      // Tags (future feature - currently not implemented in Company entity)
      // Placeholder for future tag filtering

      return true;
    });

    // ── Total Count (nach Filtering, vor Pagination) ─────────────────────────
    const total = filtered.length;
    const totalPages = Math.ceil(total / page_size);

    // ── Pagination Slice ─────────────────────────────────────────────────────
    const paginatedCompanies = filtered.slice(offset, offset + page_size);

    // ── LeadOutcome Aggregation (nur für sichtbare Companies) ────────────────
    // Lade Outcomes nur für die paginierten Companies → reduziert DB-Last
    const visibleCompanyIds = new Set(paginatedCompanies.map(c => c.id));
    const allOutcomes = await base44.asServiceRole.entities.LeadOutcome.filter(
      { organization_id: orgId },
      '-created_date',
      500 // Limit für MVP
    );

    // Latest Outcome pro Company (für UI-Anzeige)
    const latestOutcomeByCompany = {};
    for (const o of allOutcomes) {
      if (visibleCompanyIds.has(o.company_id) && !latestOutcomeByCompany[o.company_id]) {
        latestOutcomeByCompany[o.company_id] = o;
      }
    }

    // Outcomes an Companies anhängen (für Frontend)
    const companiesWithOutcomes = paginatedCompanies.map(c => ({
      ...c,
      _latest_outcome: latestOutcomeByCompany[c.id] || null,
    }));

    // ── Blacklist-Filter (konsistent mit getDashboardData) ──────────────────
    const blacklist = await base44.entities.Blacklist.filter({ organization_id: orgId });
    const blacklistNames = blacklist.map(b => b.firmenname?.toLowerCase().trim());

    const isBlacklisted = (companyName) => {
      if (!companyName) return false;
      const normalized = companyName.toLowerCase().trim();
      return blacklistNames.some(bl => normalized.includes(bl) || bl.includes(normalized));
    };

    const finalCompanies = companiesWithOutcomes.filter(c => !isBlacklisted(c.name));

    // ── Response ─────────────────────────────────────────────────────────────
    return Response.json({
      companies: finalCompanies,
      total,
      page,
      page_size,
      total_pages: totalPages,
      has_more: offset + page_size < total,
      diagnostics: {
        source: 'backend_paginated',
        org_id: orgId,
        filters_applied: {
          search: search || null,
          status: status || null,
          temperature: temperature || null,
          quality_tier: quality_tier || null,
          quality_confidence: quality_confidence || null,
          city: city || null,
          industry: industry || null,
          has_phone: has_phone || false,
          has_email: has_email || false,
          has_website: has_website || false,
          assigned_to: assigned_to || null,
          research_run_id: research_run_id || null,
        },
        sort_applied: { field: sortField, direction: sortDirection },
        generated_at: new Date().toISOString(),
        supabase_migration: {
          ready: true,
          future_table: 'companies',
          future_indexes: [
            'organization_id',
            'status',
            'quality_tier',
            'created_date',
            'relevance_score',
            'last_contact_date',
            'lead_temperature',
          ],
          notes: 'MVP: Base44 entities.filter() mit in-memory slicing. Supabase: echtes OFFSET/LIMIT + Index-optimierte Queries.',
        },
      },
    });

  } catch (error) {
    console.error('[listCompanies] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});