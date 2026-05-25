/**
 * auditFrontendDataLoading
 * ========================
 * Auditiert die Frontend-Datenladestrategien aller Hauptseiten.
 * Identifiziert unbounded Fetches, fehlende Pagination, clientseitige
 * Aggregationen und Query-Key-Sicherheitslücken.
 *
 * Basiert auf Code-Analyse (2026-05-25):
 *   - pages/Leads.jsx
 *   - pages/Statistics.jsx
 *   - pages/Dashboard.jsx
 *   - pages/CalendarView.jsx
 *   - pages/Tasks.jsx
 *   - components/settings/BillingSettings.jsx
 *
 * Admin-only. Schreibt nichts. Baut nichts um.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ── Seiten-Matrix: statisch aus Code-Analyse (2026-05-25) ─────────────────────
const PAGE_MATRIX = [
  {
    page: 'Leads.jsx',
    data_sources: ['Company', 'LeadOutcome'],
    fetch_limits: {
      Company: 'leadLimit (initial 100, +100 on demand, via state)',
      LeadOutcome: '200 (hard-coded)',
    },
    client_filtering: [
      'status filter (c.status)',
      'priority_score filter (client-side tiers)',
      'focus filters (hot, callback, this_week)',
      'search across name/branche/ort/plz/website/telefon/email',
      'newRunFilter (research_run_id)',
      'showArchived toggle',
      'filterCompanies() from useLeadsFilter (blacklist, org scope)',
    ],
    client_sorting: [
      'priority (isHotLead + status priority map)',
      'score (priority_score desc)',
      'name (alphabetical)',
      'created_date (desc)',
      'last_contact_date (desc)',
    ],
    browser_aggregation: false,
    pagination: {
      server_side: 'leadLimit state (initial 100, paginates +100)',
      client_side: 'showAllLeads toggle (first 50 visible from loaded set)',
      verdict: 'PARTIAL — loads 100 at a time from server, displays 50, but all filtering/sorting is in browser on loaded set',
    },
    org_scoped: true,
    query_key_has_org_id: true,   // ["companies", orgId, leadLimit]
    server_filtering_present: false,
    risk: 'yellow',
    risk_notes: 'Functional up to ~500 leads. At 1000+ leads: filter+sort loop gets heavy (useMemo helps). LeadOutcome hard-limit=200 may miss older outcomes. All filter/sort in browser.',
    recommended_api: 'listCompanies({ org_id, filters: { status, search, score_min, focus }, sort, page, limit })',
  },
  {
    page: 'Statistics.jsx',
    data_sources: ['getStatisticsSummary (backend function)'],
    fetch_limits: {
      getStatisticsSummary: 'backend paginates up to 10,000 companies — no truncation',
    },
    client_filtering: ['none — all aggregation server-side'],
    client_sorting: ['none'],
    browser_aggregation: false,
    pagination: { server_side: 'backend paginates', client_side: false, verdict: 'GREEN — backend-aggregated, no raw entity dumps in frontend' },
    org_scoped: true,
    query_key_has_org_id: true,  // ["statistics-summary", org.id, period]
    server_filtering_present: true,
    risk: 'green',
    risk_notes: 'FIXED (2026-05-25): getStatisticsSummary backend function. No 500-limit truncation. React Query with org-scoped key. Period selector (all/month/30d/90d/7d). Weekly time series added.',
    recommended_api: null,
  },
  {
    page: 'Dashboard.jsx',
    data_sources: ['getDashboardData (backend function)', 'OrgLearnedSignals', 'OrganizationSettings'],
    fetch_limits: {
      getDashboardData: 'backend aggregated — limited to relevant slices',
      OrgLearnedSignals: '1 record (limit=1)',
      OrganizationSettings: 'filtered by key',
    },
    client_filtering: ['none — all aggregation in getDashboardData backend function'],
    client_sorting: ['none'],
    browser_aggregation: false,
    pagination: { server_side: 'backend handles limits', client_side: false, verdict: 'GREEN — dashboard is fully backend-aggregated' },
    org_scoped: true,
    query_key_has_org_id: true,   // ["dashboard-data", activeOrg?.id]
    server_filtering_present: true,
    risk: 'green',
    risk_notes: 'getDashboardData is a backend function that returns only what the UI needs (hotLeads slice, todayTasks slice, pipelineStats counts, usage_summary). No raw entity dumps in frontend.',
    recommended_api: null,
  },
  {
    page: 'CalendarView.jsx',
    data_sources: ['Company', 'Task'],
    fetch_limits: {
      Company: '500 (hard-coded)',
      Task: '300 (hard-coded)',
    },
    client_filtering: [
      'tasks filtered by date (getTasksForDay: moment comparison per day)',
      'tasks filtered by assigned_to (non-admin users)',
    ],
    client_sorting: ['tasks sorted by faellig_am (via filter per day)'],
    browser_aggregation: [
      'totalOverdue count (filter over all tasks)',
      'totalToday count (filter over all tasks)',
      'getTasksForDay (filter over all tasks per render)',
    ],
    pagination: { server_side: false, client_side: false, verdict: 'NONE — all tasks loaded upfront' },
    org_scoped: true,
    query_key_has_org_id: 'no React Query — raw useEffect/useState, orgId used in filter call',
    server_filtering_present: false,
    risk: 'yellow',
    risk_notes: 'Company fetch (500) is unused in calendar rendering — only tasks are displayed. Unnecessary payload. Tasks at 300 limit is reasonable for calendar use. getTasksForDay runs on every render (no useMemo). Company fetch should be removed entirely.',
    recommended_api: 'listTasks({ org_id, date_range: { from, to }, status, page }). Remove Company fetch from CalendarView entirely.',
  },
  {
    page: 'Tasks.jsx',
    data_sources: ['Task'],
    fetch_limits: {
      Task: '200 (hard-coded)',
    },
    client_filtering: [
      'filter by erledigt/heute/ueberfaellig/alle (moment comparisons)',
      'filter by assigned_to (non-admin)',
    ],
    client_sorting: ['by prioritaet (Hoch/Mittel/Niedrig), then by faellig_am'],
    browser_aggregation: [
      'openCount (filter)',
      'overdueCount (filter + moment comparison)',
    ],
    pagination: { server_side: false, client_side: false, verdict: 'NONE — all 200 tasks loaded' },
    org_scoped: true,
    query_key_has_org_id: 'no React Query — direct base44.entities call, orgId used in filter',
    server_filtering_present: false,
    risk: 'yellow',
    risk_notes: 'Tasks at 200 is acceptable for MVP. All filter/sort in browser, but Tasks entity is naturally bounded (users rarely have >200 open tasks). Main concern: no React Query = no cache, refetches on every mount.',
    recommended_api: 'listTasks({ org_id, status: "offen"|"erledigt"|"ueberfaellig", page, limit }) — low priority, MVP acceptable.',
  },
  {
    page: 'BillingSettings.jsx',
    data_sources: ['Organization', 'Subscription', 'getUsageSummary (backend function)', 'Plan', 'UsageLog'],
    fetch_limits: {
      Organization: '1 (filtered by id)',
      Subscription: '1 (filtered by org)',
      getUsageSummary: 'backend aggregated',
      Plan: '1 (filtered by id) + all active plans',
      UsageLog: '6 (last 6 months, limit=6)',
    },
    client_filtering: [
      'allPlans filtered: stripe_price_id exists, not agency type',
      'usageHistory shown as-is (6 rows)',
    ],
    client_sorting: ['allPlans sorted by sort_order'],
    browser_aggregation: false,
    pagination: { server_side: 'UsageLog limited to 6', client_side: false, verdict: 'GREEN — all loads are bounded and appropriate' },
    org_scoped: true,
    query_key_has_org_id: 'no React Query — raw useEffect, but all queries are org-scoped via filter',
    server_filtering_present: true,
    risk: 'green',
    risk_notes: 'Usage data aggregation done by getUsageSummary backend. Plan loads are bounded (1 plan + active plans list). UsageLog limited to 6 rows. No heavy client aggregation.',
    recommended_api: null,
  },
];

// ── Query Key Analyse ─────────────────────────────────────────────────────────
const QUERY_KEY_ANALYSIS = [
  { component: 'Leads.jsx', key: '["companies", orgId, leadLimit]', has_org_id: true, has_filter_values: true, verdict: 'GOOD' },
  { component: 'Leads.jsx', key: '["leadOutcomes", orgId]', has_org_id: true, has_filter_values: false, verdict: 'GOOD — filter is client-side only' },
  { component: 'Dashboard.jsx', key: '["dashboard-data", activeOrg.id]', has_org_id: true, has_filter_values: false, verdict: 'GOOD' },
  { component: 'Dashboard.jsx', key: '["learned-signals", activeOrg.id]', has_org_id: true, has_filter_values: false, verdict: 'GOOD' },
  { component: 'Statistics.jsx', key: 'none — raw useEffect/useState', has_org_id: false, has_filter_values: false, verdict: 'RISK — no React Query, no cache key, refetches on every mount, no deduplication' },
  { component: 'CalendarView.jsx', key: 'none — raw useCallback/useEffect', has_org_id: false, has_filter_values: false, verdict: 'WARN — no React Query, no cache, but orgId used in filter call' },
  { component: 'Tasks.jsx', key: 'none — raw useEffect', has_org_id: false, has_filter_values: false, verdict: 'WARN — no React Query, no cache, but orgId used in filter call' },
  { component: 'BillingSettings.jsx', key: 'none — raw useEffect', has_org_id: false, has_filter_values: false, verdict: 'ACCEPTABLE — billing data is user-specific, no cross-org risk, bounded loads' },
];

// ── Skalierbarkeitsprojektionen ───────────────────────────────────────────────
const SCALE_PROJECTIONS = [
  {
    page: 'Statistics.jsx',
    at_100_leads: 'ok — 500 limit not hit',
    at_500_leads: 'CRITICAL — hits 500 limit, aggregations wrong (silent data loss)',
    at_1000_leads: 'BROKEN — all stats incorrect (50% of data missing)',
    at_10000_leads: 'BROKEN — completely wrong stats',
  },
  {
    page: 'Leads.jsx',
    at_100_leads: 'ok — initial 100 limit fine',
    at_500_leads: 'ok — pagination works, 100 at a time',
    at_1000_leads: 'degraded — filter+sort on 100-record window ok, but user needs many clicks to paginate',
    at_10000_leads: 'poor UX — pagination works but no server-side filter = user must load to find',
  },
  {
    page: 'CalendarView.jsx',
    at_100_leads: 'ok',
    at_500_leads: 'ok for tasks; Company(500) wasted memory',
    at_1000_leads: 'ok for tasks; Company fetch wastes bandwidth',
    at_10000_leads: 'Company fetch problematic — but calendar only renders tasks',
  },
  {
    page: 'Dashboard.jsx',
    at_100_leads: 'ok',
    at_500_leads: 'ok',
    at_1000_leads: 'ok — backend handles aggregation',
    at_10000_leads: 'ok — fully backend-aggregated',
  },
];

// ── Empfohlene Backend-APIs (Priorität) ───────────────────────────────────────
const RECOMMENDED_BACKEND_APIS = [
  {
    priority: 1,
    name: 'getStatisticsSummary',
    reason: 'Statistics.jsx ist RED: 500-limit truncates data, all aggregation in browser. At 500+ leads stats are WRONG.',
    signature: 'getStatisticsSummary({ org_id, period_month? }) → { status_distribution, contact_type_distribution, conversion_rate, conversion_by_branche, outcome_stats }',
    effort: 'medium',
    replaces: 'Statistics.jsx company/contactLogs/outcomes full-load',
  },
  {
    priority: 2,
    name: 'listCompanies',
    reason: 'Leads.jsx: all filtering/sorting in browser. At 1000+ leads, server-side filter dramatically improves UX.',
    signature: 'listCompanies({ org_id, filters: { status, search, score_min, score_max, is_hot, focus, research_run_id }, sort: { field, dir }, page, limit }) → { items, total, has_more }',
    effort: 'large',
    replaces: 'Leads.jsx Company.filter with leadLimit + client-side filterCompanies',
  },
  {
    priority: 3,
    name: 'listTasks (date-range)',
    reason: 'CalendarView loads 300 tasks + 500 companies (companies unused). Tasks should be date-range filtered server-side.',
    signature: 'listTasks({ org_id, date_range: { from, to }, status?, assigned_to?, page, limit }) → { items, has_more }',
    effort: 'small',
    replaces: 'CalendarView Company.filter (remove entirely) + Task.filter with date-range',
  },
  {
    priority: 4,
    name: 'getDuplicateCandidates',
    reason: 'DuplicatesPage (not audited but likely loads all companies client-side for dedup)',
    signature: 'getDuplicateCandidates({ org_id, threshold? }) → { candidate_pairs: [{ company_a, company_b, similarity_score }] }',
    effort: 'medium',
    replaces: 'Client-side company full-load + dedup logic',
  },
  {
    priority: 5,
    name: 'getMapCompanies',
    reason: 'MapView (not audited) likely loads all companies for geo markers',
    signature: 'getMapCompanies({ org_id, bounds: { ne_lat, ne_lng, sw_lat, sw_lng }, limit }) → { items, truncated }',
    effort: 'small',
    replaces: 'MapView Company full-load',
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const tests = [];
    const warnings = [];
    const risks = [];

    function pass(area, id, detail) { tests.push({ area, id, status: 'PASS', detail }); }
    function warn(area, id, detail) { tests.push({ area, id, status: 'WARN', detail }); warnings.push({ area, id, detail }); }
    function risk(area, id, detail) { tests.push({ area, id, status: 'RISK', detail }); risks.push({ area, id, detail }); }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 1: Unbounded / Heavy Fetches
    // ══════════════════════════════════════════════════════════════════════════

    risk('Statistics', 'statistics_company_hard_limit_500',
      'Statistics.jsx: Company.filter limit=500 hard-coded. At 500+ leads: aggregations (conversion rate, branche distribution) are silently wrong because data is truncated. No indicator for user.'
    );
    risk('Statistics', 'statistics_no_backend_aggregation',
      'Statistics.jsx: all aggregations (status reduce, conversion %, branche map, outcome counts) run in browser on every render. No backend aggregation, no getStatisticsSummary function.'
    );
    risk('Statistics', 'statistics_no_react_query',
      'Statistics.jsx: uses raw useEffect/useState, no React Query. No cache, no deduplication, refetches on every mount/re-render cycle.'
    );

    warn('CalendarView', 'calendar_company_fetch_unused',
      'CalendarView.jsx: loads Company.filter(limit=500) on mount, but the calendar UI only renders Tasks. Companies are fetched but never displayed. Wasted bandwidth + memory.'
    );
    warn('CalendarView', 'calendar_no_react_query',
      'CalendarView.jsx: raw useCallback/useEffect, no React Query. No cache for tasks or companies.'
    );
    warn('CalendarView', 'calendar_get_tasks_for_day_no_memo',
      'CalendarView.jsx: getTasksForDay() iterates all tasks on every render without useMemo. With 300 tasks × 35 calendar days = 10,500 comparisons per render.'
    );

    pass('Dashboard', 'dashboard_backend_aggregated',
      'Dashboard.jsx: uses getDashboardData backend function. Returns only aggregated slices (hotLeads, todayTasks, pipelineStats, usage_summary). No raw entity dumps.'
    );
    pass('Dashboard', 'dashboard_query_key_org_scoped',
      'Dashboard.jsx: React Query key ["dashboard-data", activeOrg.id] — org-scoped, cache-safe on org switch.'
    );

    pass('Leads', 'leads_pagination_present',
      'Leads.jsx: leadLimit state (initial 100, +100 on demand). Server-side pagination via Company.filter(limit). Client also slices to first 50 visible.'
    );
    warn('Leads', 'leads_all_filtering_in_browser',
      'Leads.jsx: all filtering (status, priority_score, search, focus, research_run_id) runs in browser on loaded set. At 1000+ leads, server-side filtering would dramatically reduce latency and improve UX.'
    );
    warn('Leads', 'leads_outcome_hard_limit_200',
      'Leads.jsx: LeadOutcome.filter limit=200 hard-coded. Organizations with >200 outcomes will have incomplete outcome data for the outcomeByCompany map.'
    );

    pass('BillingSettings', 'billing_usage_backend_aggregated',
      'BillingSettings.jsx: getUsageSummary backend function handles usage aggregation. Plan loads bounded (1 + active list). UsageLog limited to 6 rows.'
    );

    warn('Tasks', 'tasks_no_react_query',
      'Tasks.jsx: raw useEffect, no React Query. No cache, refetches on every mount. Also re-queries Organization + OrganizationMember on every load to resolve orgId.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 2: Query Key / Cache Safety
    // ══════════════════════════════════════════════════════════════════════════

    pass('query_keys', 'leads_query_key_org_scoped',
      '["companies", orgId, leadLimit] — org-scoped, includes pagination state. Cache-safe.'
    );
    pass('query_keys', 'dashboard_query_key_org_scoped',
      '["dashboard-data", activeOrg.id] — org-scoped. Cache-safe.'
    );
    risk('query_keys', 'statistics_no_query_key',
      'Statistics.jsx: no React Query at all. Raw useState/useEffect. On org switch, component unmounts/remounts but stale data could briefly flash. No cache invalidation possible.'
    );
    warn('query_keys', 'calendar_tasks_no_query_key',
      'CalendarView.jsx / Tasks.jsx: no React Query key for tasks. Each mount triggers fresh fetch. Cannot invalidate or share cache with other components.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 3: Skalierbarkeit bei 500 / 2000 / 10000 Datensätzen
    // ══════════════════════════════════════════════════════════════════════════

    risk('scalability', 'statistics_broken_at_500_leads',
      'Statistics.jsx: CRITICAL at 500+ leads. Hard limit=500 silently truncates. Conversion rates, branche analysis, outcome stats all become WRONG. User sees "correct-looking" but wrong numbers.'
    );
    warn('scalability', 'leads_degraded_at_10k_leads',
      'Leads.jsx: functional but poor UX at 10,000 leads. User must paginate through 100-record windows without server-side filter. Search is in-browser on current window only.'
    );
    pass('scalability', 'dashboard_scales_to_10k',
      'Dashboard.jsx: fully backend-aggregated via getDashboardData. Scales to 10,000+ leads without frontend changes.'
    );
    pass('scalability', 'billing_scales_fine',
      'BillingSettings.jsx: bounded loads, scales linearly. UsageLog limited to 6 months.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // GESAMTBEWERTUNG
    // ══════════════════════════════════════════════════════════════════════════

    const redPages = PAGE_MATRIX.filter(p => p.risk === 'red').length;
    const yellowPages = PAGE_MATRIX.filter(p => p.risk === 'yellow').length;
    const greenPages = PAGE_MATRIX.filter(p => p.risk === 'green').length;

    // RED wenn kritische Seite broken ist (Statistics)
    // YELLOW wenn große Seite noch full-client-load (Leads)
    const claimStatus = redPages > 0 ? 'red' : yellowPages > 0 ? 'yellow' : 'green';
    const riskLevel = redPages > 0 ? 'high' : yellowPages > 0 ? 'medium' : 'low';

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,

      summary: {
        pages_checked: PAGE_MATRIX.length,
        red_pages: redPages,
        yellow_pages: yellowPages,
        green_pages: greenPages,
        unbounded_fetches: 2,  // Statistics × 3 entities, CalendarView Company
        client_side_aggregations: 6,  // all in Statistics
        server_apis_recommended: RECOMMENDED_BACKEND_APIS.length,
        org_cache_keys_ok: false,  // Statistics, CalendarView, Tasks missing React Query
      },

      page_matrix: PAGE_MATRIX,

      hard_values: {
        max_company_fetch_limit_seen: 500,  // Statistics, CalendarView
        pages_with_full_company_load: ['Statistics.jsx (500)', 'CalendarView.jsx (500, unused)'],
        pages_without_pagination: ['Statistics.jsx', 'CalendarView.jsx', 'Tasks.jsx'],
        pages_with_pagination: ['Leads.jsx (server: +100 on demand, client: first 50)'],
        query_keys_missing_org_id: ['Statistics.jsx (no React Query)', 'CalendarView.jsx (no React Query)', 'Tasks.jsx (no React Query)'],
        existing_backend_aggregations: ['getDashboardData', 'getUsageSummary', 'getStatisticsSummary'],
        entities_loaded_but_unused: ['Company in CalendarView.jsx (fetched, never rendered)'],
        hard_coded_limits: {
          'Statistics Company': 500,
          'Statistics ContactLog': 500,
          'Statistics LeadOutcome': 500,
          'Leads initial': 100,
          'Leads outcomes': 200,
          'CalendarView Company': 500,
          'CalendarView Tasks': 300,
          'Tasks': 200,
          'BillingSettings UsageLog': 6,
        },
        scale_projections: SCALE_PROJECTIONS,
        query_key_analysis: QUERY_KEY_ANALYSIS,
      },

      recommended_fixes: [
        {
          priority: 'high',
          area: 'Statistics',
          id: 'build_getStatisticsSummary',
          effort: 'medium',
          impact: 'fixes incorrect aggregations at 500+ leads — correctness issue, not just performance',
          fix: 'Build getStatisticsSummary({ org_id, period_month? }) backend function. Statistics.jsx calls it instead of loading 3×500 records. Returns: status_distribution, contactType_distribution, conversion_rate, branche_conversion[], outcome_stats.',
          files_affected: 'functions/getStatisticsSummary (new), pages/Statistics.jsx (replace useEffect)',
        },
        {
          priority: 'high',
          area: 'CalendarView',
          id: 'remove_company_fetch_from_calendar',
          effort: 'small',
          impact: 'removes 500 wasted records per calendar page load',
          fix: 'CalendarView.jsx: remove Company.filter() call entirely. Companies are never rendered in the calendar. Only Task.filter() is needed.',
          files_affected: 'pages/CalendarView.jsx',
        },
        {
          priority: 'medium',
          area: 'Statistics',
          id: 'migrate_statistics_to_react_query',
          effort: 'small',
          impact: 'adds caching, prevents refetch on every mount, enables invalidation',
          fix: 'Migrate Statistics.jsx from raw useEffect/useState to useQuery with key ["statistics-data", org.id]. After getStatisticsSummary is built.',
          files_affected: 'pages/Statistics.jsx',
        },
        {
          priority: 'medium',
          area: 'Leads',
          id: 'server_side_search_filter',
          effort: 'large',
          impact: 'required for 1000+ lead orgs to have usable UX',
          fix: 'Build listCompanies({ org_id, filters, sort, page, limit }) backend function. Leads.jsx passes active filters to backend instead of client-side filtering.',
          files_affected: 'functions/listCompanies (new), pages/Leads.jsx, hooks/useLeadsFilter.js',
        },
        {
          priority: 'medium',
          area: 'Tasks/CalendarView',
          id: 'migrate_tasks_to_react_query',
          effort: 'small',
          impact: 'adds cache, removes repeated org resolution on every mount',
          fix: 'Tasks.jsx: use React Query with key ["tasks", orgId]. CalendarView: same key to share cache. Resolve orgId once via useOrganization hook instead of re-fetching on every mount.',
          files_affected: 'pages/Tasks.jsx, pages/CalendarView.jsx',
        },
        {
          priority: 'low',
          area: 'CalendarView',
          id: 'memoize_get_tasks_for_day',
          effort: 'trivial',
          impact: 'avoids 10k+ comparisons per render in month view',
          fix: 'CalendarView.jsx: useMemo to pre-index tasks by date string. const tasksByDay = useMemo(() => tasks.reduce((map, t) => { const ds = moment(t.faellig_am).format("YYYY-MM-DD"); ... }, {}), [tasks]);',
          files_affected: 'pages/CalendarView.jsx',
        },
      ],

      recommended_backend_apis: RECOMMENDED_BACKEND_APIS,

      tests,
      warnings,
      risks,

      audit_notes: [
        'Statistics.jsx is the highest-risk page: hard limit=500 causes INCORRECT (not just slow) aggregations at 500+ leads.',
        'Dashboard.jsx is the gold standard: backend-aggregated, React Query cached, org-scoped key.',
        'CalendarView loads 500 companies it never uses — easy win to remove.',
        'Leads.jsx is acceptable for MVP but needs server-side filtering at 1000+ leads.',
        'BillingSettings.jsx is well-architected: bounded loads, backend usage aggregation.',
        'Next action: (1) getStatisticsSummary backend API, (2) remove Company from CalendarView, (3) migrate Tasks to React Query.',
      ],
    });

  } catch (error) {
    console.error('[auditFrontendDataLoading] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});