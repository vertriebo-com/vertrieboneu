/**
 * listOpportunities
 * =================
 * Paginated, org-scoped Opportunity-Liste. Optional nach company_id / status / stage filterbar.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      org_id,
      company_id,
      status,
      stage,
      page = 1,
      page_size = 50,
      sort = '-created_date',
    } = body;

    if (!org_id) return Response.json({ error: 'org_id fehlt.' }, { status: 400 });

    // AuthZ: Platform-Admin oder Org-Member
    const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);
    if (!isPlatformAdmin) {
      const [orgs, members] = await Promise.all([
        base44.asServiceRole.entities.Organization.filter({ id: org_id }),
        base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: org_id, user_email: user.email }),
      ]);
      const org = orgs[0];
      if (!org) return Response.json({ error: 'Organisation nicht gefunden.' }, { status: 404 });
      if (org.owner_email !== user.email && (!members[0] || members[0].status !== 'active')) {
        return Response.json({ error: 'Kein Zugriff.' }, { status: 403 });
      }
    }

    // Filter bauen
    const filter = { organization_id: org_id };
    if (company_id) filter.company_id = company_id;
    if (status) filter.status = status;
    if (stage) filter.stage = stage;

    const effectivePageSize = Math.min(page_size, 100);
    const skip = (Math.max(page, 1) - 1) * effectivePageSize;

    // Alle Opps für Count, dann paginated
    const all = await base44.asServiceRole.entities.Opportunity.filter(filter, sort, 500);
    const total = all.length;
    const total_pages = Math.ceil(total / effectivePageSize);
    const opportunities = all.slice(skip, skip + effectivePageSize);

    // Pipeline-Metriken für Diagnostics
    const openOpps = all.filter(o => o.status === 'open');
    const pipeline_value = openOpps.reduce((s, o) => s + (o.value || 0), 0);
    const weighted_forecast = openOpps.reduce((s, o) => s + ((o.value || 0) * (o.probability || 0) / 100), 0);
    const won_value = all.filter(o => o.status === 'won').reduce((s, o) => s + (o.value || 0), 0);

    return Response.json({
      opportunities,
      total,
      page: Math.max(page, 1),
      page_size: effectivePageSize,
      total_pages,
      has_more: skip + effectivePageSize < total,
      diagnostics: {
        open_count: openOpps.length,
        won_count: all.filter(o => o.status === 'won').length,
        lost_count: all.filter(o => o.status === 'lost').length,
        pipeline_value,
        weighted_forecast: Math.round(weighted_forecast * 100) / 100,
        won_value,
      },
    });
  } catch (e) {
    console.error('[listOpportunities] Error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});