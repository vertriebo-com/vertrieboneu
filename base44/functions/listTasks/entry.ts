/**
 * listTasks
 * =========
 * Server-side paginated Task-Abfrage mit Datums-, Status- und Org-Filterung.
 * Ersetzt direkte base44.entities.Task.filter(limit=200/300) in CalendarView + Tasks.jsx.
 *
 * AuthZ: gleiche Logik wie getDashboardData / getStatisticsSummary / listCompanies.
 *   - owner_email → eigene Org
 *   - organization_admin Member → eigene Org
 *   - platform_admin / admin → beliebige org_id
 *   - fremde org_id wird blockiert
 *
 * Supabase-Migration: vorbereitet
 *   future_table: tasks
 *   future_indexes: organization_id, faellig_am, erledigt, company_id, assigned_to
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

const VALID_SORT_FIELDS = ['faellig_am', 'created_date', 'updated_date', 'prioritaet', 'titel'];
const VALID_SORT_DIRS = ['asc', 'desc'];

const PRIORITY_ORDER = { Hoch: 0, Mittel: 1, Niedrig: 2 };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      org_id,
      page = 1,
      page_size: rawPageSize = DEFAULT_PAGE_SIZE,
      date_from,
      date_to,
      status,          // 'open' | 'done' | 'overdue' | 'today' | 'all'
      type: taskType,  // Rückruf | Termin | Angebot erstellen | Nachfassen | Sonstiges
      assigned_to,
      company_id,
      include_company = false,
      sort: rawSort = { field: 'faellig_am', direction: 'asc' },
    } = body;

    // ── Seite & Größe normalisieren ────────────────────────────────────────────
    const pageNum  = Math.max(1, Math.floor(Number(page) || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(rawPageSize) || DEFAULT_PAGE_SIZE)));

    // ── Sortierung validieren ──────────────────────────────────────────────────
    const sortField = VALID_SORT_FIELDS.includes(rawSort?.field) ? rawSort.field : 'faellig_am';
    const sortDir   = VALID_SORT_DIRS.includes(rawSort?.direction) ? rawSort.direction : 'asc';
    const sortApplied = `${sortField} ${sortDir}`;

    // ── AuthZ: Org-ID auflösen ─────────────────────────────────────────────────
    const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);

    let resolvedOrgId = org_id || null;

    if (!resolvedOrgId || !isPlatformAdmin) {
      // Immer eigene Org prüfen
      const ownerOrgs = await base44.asServiceRole.entities.Organization.filter({ owner_email: user.email });
      let userOrg = ownerOrgs?.[0] || null;

      if (!userOrg) {
        const memberships = await base44.asServiceRole.entities.OrganizationMember.filter({
          user_email: user.email, status: 'active'
        });
        if (memberships?.[0]?.organization_id) {
          const memberOrgs = await base44.asServiceRole.entities.Organization.filter({
            id: memberships[0].organization_id
          });
          userOrg = memberOrgs?.[0] || null;
        }
      }

      if (!userOrg) return Response.json({ error: 'Keine Organisation gefunden' }, { status: 403 });

      // Fremde org_id blockieren (außer Platform-Admin)
      if (resolvedOrgId && resolvedOrgId !== userOrg.id) {
        return Response.json({ error: 'Forbidden: Kein Zugriff auf diese Organisation' }, { status: 403 });
      }

      resolvedOrgId = userOrg.id;
    }

    // ── Filter-Parameter aufbauen ─────────────────────────────────────────────
    const filterParams = { organization_id: resolvedOrgId };
    if (company_id) filterParams.company_id = company_id;
    if (assigned_to) filterParams.assigned_to = assigned_to;
    if (taskType) filterParams.typ = taskType;

    // Status-Filter: erledigt (boolean) wenn eindeutig möglich
    if (status === 'done') filterParams.erledigt = true;
    if (status === 'open' || status === 'overdue' || status === 'today') filterParams.erledigt = false;
    // 'all' → kein erledigt-Filter

    const filtersApplied = Object.keys(filterParams).filter(k => k !== 'organization_id');
    const dateRangeApplied = !!(date_from || date_to);

    // ── Fetch: server-seitig begrenzt ─────────────────────────────────────────
    // Base44 gibt keine native date-range Filterung → wir fetchen mit großem Limit
    // und filtern server-seitig. MAX_FETCH schützt vor unbounded Abfragen.
    const MAX_FETCH = 1000;
    const sortPrefix = sortDir === 'desc' ? '-' : '';
    const apiSortField = sortField === 'prioritaet' ? 'created_date' : sortField; // Priorität = client-side sort

    const allTasks = await base44.asServiceRole.entities.Task.filter(
      filterParams,
      `${sortPrefix}${apiSortField}`,
      MAX_FETCH
    );

    // ── Post-fetch Filter: date_range + status (overdue/today) ────────────────
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dateFromTs = date_from ? new Date(date_from).getTime() : null;
    const dateToTs   = date_to   ? new Date(date_to).getTime()   : null;

    let tasks = allTasks.filter(t => {
      // Date range
      if (dateFromTs || dateToTs) {
        if (!t.faellig_am) return false;
        const ts = new Date(t.faellig_am).getTime();
        if (dateFromTs && ts < dateFromTs) return false;
        if (dateToTs   && ts > dateToTs)   return false;
      }

      // Status refinements
      if (status === 'overdue') {
        if (!t.faellig_am) return false;
        return new Date(t.faellig_am) < now;
      }
      if (status === 'today') {
        if (!t.faellig_am) return false;
        return t.faellig_am.slice(0, 10) === todayStr;
      }

      return true;
    });

    // Priorität-sort client-seitig (kein DB-Feld-Sort möglich)
    if (sortField === 'prioritaet') {
      tasks = tasks.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.prioritaet] ?? 1;
        const pb = PRIORITY_ORDER[b.prioritaet] ?? 1;
        if (pa !== pb) return sortDir === 'asc' ? pa - pb : pb - pa;
        return new Date(a.faellig_am || '9999') - new Date(b.faellig_am || '9999');
      });
    }

    // ── Pagination ────────────────────────────────────────────────────────────
    const total      = tasks.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage   = Math.min(pageNum, totalPages);
    const offset     = (safePage - 1) * pageSize;
    const paginated  = tasks.slice(offset, offset + pageSize);
    const hasMore    = offset + pageSize < total;

    // ── include_company: Firmenname enrichen (org-scoped, nur für sichtbare Tasks) ──
    let tasksWithCompany = paginated;
    if (include_company && paginated.length > 0) {
      const companyIds = [...new Set(paginated.map(t => t.company_id).filter(Boolean))];
      if (companyIds.length > 0) {
        // Nur Firmen dieser Org laden (kein globaler Dump)
        const companies = await base44.asServiceRole.entities.Company.filter(
          { organization_id: resolvedOrgId },
          'name',
          500
        );
        const companyMap = {};
        for (const c of companies) companyMap[c.id] = c;
        tasksWithCompany = paginated.map(t => ({
          ...t,
          _company: t.company_id ? companyMap[t.company_id] || null : null,
        }));
      }
    }

    return Response.json({
      tasks: tasksWithCompany,
      total,
      page: safePage,
      page_size: pageSize,
      total_pages: totalPages,
      has_more: hasMore,
      diagnostics: {
        source: 'backend_paginated',
        org_id: resolvedOrgId,
        date_range_applied: dateRangeApplied,
        date_from: date_from || null,
        date_to: date_to || null,
        filters_applied: filtersApplied,
        status_filter: status || null,
        sort_applied: sortApplied,
        total_fetched: allTasks.length,
        total_after_filter: total,
        page_returned: safePage,
        generated_at: new Date().toISOString(),
        supabase_migration: {
          ready: true,
          future_table: 'tasks',
          future_indexes: [
            'organization_id',
            'faellig_am',
            'erledigt',
            'company_id',
            'assigned_to',
          ],
          note: 'Date-range and status filters will be pushed to SQL WHERE clauses in Supabase phase',
        },
      },
    });

  } catch (error) {
    console.error('[listTasks] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});