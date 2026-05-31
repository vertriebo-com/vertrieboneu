import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLeadsFilter } from "../hooks/useLeadsFilter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Building2, Sparkles, TrendingUp, Upload, X, Target, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import AddCompanyDialog from "../components/AddCompanyDialog";
import LeadRow from "../components/leads/LeadRow";
import ResearchDialog from "../components/leads/ResearchDialog";
import ActiveResearchBanner from "../components/leads/ActiveResearchBanner";
import LeadKpiBar from "../components/leads/LeadKpiBar";
import LeadsFilterBar from "../components/leads/LeadsFilterBar";
import LeadsPipelineView from "../components/leads/LeadsPipelineView";
import moment from "moment";
import { isHotLead } from "@/utils/leadTemperature";

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: "today",    label: "Tagesliste" },
  { key: "all",      label: "Alle Leads" },
  { key: "pipeline", label: "Pipeline"   },
  { key: "archive",  label: "Archiv"     },
];

// ── Skeleton ──────────────────────────────────────────────────────────────────
function LeadListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function Leads() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, org, filterCompanies, loading: filterLoading } = useLeadsFilter();

  // ── States ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState("Alle");
  const [sortBy, setSortBy] = useState("created");
  const [showAdd, setShowAdd] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [researching, setResearching] = useState(false);
  const [newRunFilter, setNewRunFilter] = useState(null);
  const [showOnboardingZeroLeads, setShowOnboardingZeroLeads] = useState(false);
  const [showOnboardingFailed, setShowOnboardingFailed] = useState(false);

  // ── Debounce Search ───────────────────────────────────────────────────────
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // Page-Reset passiert automatisch durch queryKey-Wechsel bei useInfiniteQuery

  // ── URL Params ────────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    const validStatuses = ["Neu", "Kontakt", "Rückruf", "Termin", "Angebot", "Gewonnen", "Verloren"];
    const statusParam = params.get("status");
    if (statusParam && validStatuses.includes(statusParam)) {
      setStatusFilter(statusParam);
      // Archiv-Status → direkt zum Archiv-Tab wechseln
      if (["Gewonnen", "Verloren"].includes(statusParam)) setActiveTab("archive");
    }

    const tempParam = params.get("temperature");
    if (tempParam === "hot") setPriorityFilter("Hoch");
    else if (tempParam === "warm") setPriorityFilter("Mittel");
    else if (tempParam === "cold") setPriorityFilter("Niedrig");

    const newRun = params.get("new_run");
    if (!newRun || newRun === "undefined" || newRun === "null" || newRun === "latest") {
      setNewRunFilter(null);
      if (newRun === "latest") setSortBy("created");
    } else {
      setNewRunFilter(newRun);
      setSortBy("created");
    }

    const searchParam = params.get("search");
    setSearch(searchParam || "");
    setDebouncedSearch(searchParam || "");

    if (params.get("onboarding_zero_leads") === "true") setShowOnboardingZeroLeads(true);
    if (params.get("onboarding_failed") === "true") setShowOnboardingFailed(true);
  }, [location.search]);

  const orgId = org?.id || null;
  const PAGE_SIZE = 50;

  // ── Data Fetching (useInfiniteQuery → Seiten anhängen) ────────────────────
  const {
    data,
    isLoading: loading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["companies-list", orgId, PAGE_SIZE, statusFilter, priorityFilter, debouncedSearch, sortBy, newRunFilter, activeTab],
    initialPageParam: 1,
    queryFn: async ({ pageParam = 1 }) => {
      const backendFilters = {};

      if (statusFilter) {
        backendFilters.status = statusFilter;
      } else if (activeTab === "archive") {
        backendFilters.status = ["Gewonnen", "Verloren"];
      } else if (activeTab === "all" || activeTab === "today" || activeTab === "pipeline") {
        // Aktive Leads: schließe Archiv serverseitig aus, wenn kein Statusfilter gesetzt
        backendFilters.status = ["Neu", "Kontakt", "Rückruf", "Termin", "Angebot"];
      }

      if (priorityFilter !== "Alle") {
        backendFilters.temperature = priorityFilter === "Hoch" ? "hot" : priorityFilter === "Mittel" ? "warm" : "cold";
      }
      if (debouncedSearch) backendFilters.search = debouncedSearch;
      if (newRunFilter) backendFilters.research_run_id = newRunFilter;

      const sortMap = {
        "priority":     { field: "priority_score",   direction: "desc" },
        "score":        { field: "relevance_score",  direction: "desc" },
        "name":         { field: "name",             direction: "asc"  },
        "created":      { field: "created_date",     direction: "desc" },
        "last_contact": { field: "last_contact_date",direction: "desc" },
      };
      const sort = sortMap[sortBy] || { field: "created_date", direction: "desc" };

      const result = await base44.functions.invoke("listCompanies", {
        org_id: orgId,
        page: pageParam,
        page_size: PAGE_SIZE,
        filters: backendFilters,
        sort,
      });
      return result?.data || { companies: [], total: 0, page: pageParam, has_more: false };
    },
    getNextPageParam: (lastPage) => lastPage.has_more ? (lastPage.page + 1) : undefined,
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const companies = data?.pages.flatMap(page => page.companies || []) || [];
  const totalCompanies = data?.pages[0]?.total || 0;
  const hasMorePages = hasNextPage ?? false;

  // ── handleAnalyzeLatest ───────────────────────────────────────────────────
  const handleAnalyzeLatest = useCallback(async () => {
    if (!orgId || researching) return;
    try {
      setResearching(true);
      toast.info("Vertriebo Engine analysiert die neuesten Leads…");
      const result = await base44.functions.invoke("analyzeLeadEngine", {
        organization_id: orgId,
        mode: "latest",
        limit: 10,
      });
      if (result?.data?.success) {
        toast.success(`${result.data.analyzed_count || 0} Leads analysiert.`);
        await refetch();
      } else {
        toast.error(result?.data?.error || "Analyse konnte nicht gestartet werden.");
      }
    } catch (error) {
      toast.error(error?.message || "Analyse fehlgeschlagen.");
    } finally {
      setResearching(false);
    }
  }, [orgId, researching, refetch]);

  // Auto-analyze from Dashboard CTA
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("analyze") === "true" && companies.length > 0 && !researching) {
      handleAnalyzeLatest();
      params.delete("analyze");
      navigate("/leads?" + params.toString(), { replace: true });
    }
  }, [companies.length, location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = user?.role === "admin" || (org && org.owner_email === user?.email);
  const loadData = () => refetch();

  const applySort = (arr) => {
    const sorted = [...arr];
    switch (sortBy) {
      case "name":         return sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      case "score":        return sorted.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
      case "created":      return sorted.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      case "last_contact": return sorted.sort((a, b) => new Date(b.last_contact_date || 0) - new Date(a.last_contact_date || 0));
      default: return sorted.sort((a, b) => {
        if (isHotLead(a) && !isHotLead(b)) return -1;
        if (!isHotLead(a) && isHotLead(b)) return 1;
        const prio = { "Rückruf": 0, "Termin": 1, "Angebot": 2, "Kontakt": 3, "Neu": 4, "Gewonnen": 5, "Verloren": 6 };
        return (prio[a.status] ?? 9) - (prio[b.status] ?? 9);
      });
    }
  };

  // Frontend-Filter: nur noch leichte Zusatzfilterung (Archiv/Tagesliste already handled server-side)
  const filtered = useMemo(() => {
    const weekAgo = moment().subtract(7, "days").toISOString();
    return applySort(
      filterCompanies(companies).filter(c => {
        // Tagesliste: nur Hot, Rückruf, Termin oder neu diese Woche
        if (activeTab === "today") {
          return isHotLead(c) || c.status === "Rückruf" || c.status === "Termin"
            || (c.created_date && c.created_date >= weekAgo);
        }
        return true;
      })
    );
  }, [companies, filterCompanies, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetFilters = () => {
    setStatusFilter(null);
    setPriorityFilter("Alle");
    setSearch("");
    setDebouncedSearch("");
    setNewRunFilter(null);
  };

  const handleCsvExport = () => {
    const headers = ["Name", "Branche", "Telefon", "E-Mail", "Status", "Priorität"];
    const rows = filtered.map(c => [c.name, c.branche, c.telefon, c.email, c.status, c.priority_score].map(v => `"${v || ""}"`).join(","));
    const blob = new Blob(["\uFEFF" + [headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "leads.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Erstes Laden ──────────────────────────────────────────────────────────
  if ((loading && !data) || filterLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-20 mb-1 rounded-xl" />
            <Skeleton className="h-4 w-56 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <LeadListSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">

      {/* ── 1. HEADER ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ihre Firmenkontakte, priorisiert für den nächsten Vertriebsschritt.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowResearch(true)}
            size="sm"
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm shrink-0"
            aria-label="Firmen automatisch recherchieren"
          >
            <Sparkles className="w-3.5 h-3.5" /> Firmen recherchieren
          </Button>
        )}
      </div>

      {/* ── 2. ACTIVE RESEARCH BANNER ────────────────────────────────── */}
      <ActiveResearchBanner orgId={orgId} onNewLeads={() => refetch()} />

      {/* New run success notice */}
      {newRunFilter && filtered.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-emerald-800">
            ✨ {filtered.length} {filtered.length === 1 ? "Firmenkontakt" : "Firmenkontakte"} aus letzter Recherche
          </p>
          <button onClick={() => setNewRunFilter(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── 3. KPI BAR ───────────────────────────────────────────────── */}
      <LeadKpiBar companies={companies} totalCompanies={totalCompanies} isFetching={isFetching} />

      {/* ── 4. TABS ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
              activeTab === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 5. FILTER BAR (nicht auf Pipeline-Tab) ───────────────────── */}
      {activeTab !== "pipeline" && (
        <LeadsFilterBar
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          newRunFilter={newRunFilter}
          setNewRunFilter={setNewRunFilter}
          isFetching={isFetching}
          onReset={handleResetFilters}
          setPage={() => {}} // no-op: reset passiert über queryKey
        />
      )}

      {/* ── 6. ONBOARDING STATES ─────────────────────────────────────── */}
      {showOnboardingZeroLeads && companies.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <Target className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-amber-900 mb-2">Keine passenden Firmenkontakte gefunden</h3>
          <p className="text-sm text-amber-800 mb-6 max-w-lg mx-auto">Das kann an zu engen Einstellungen liegen.</p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto mb-4">
            <Button onClick={() => navigate("/settings?tab=company")} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
              <Target className="w-4 h-4" /> Suchradius erhöhen
            </Button>
            <Button onClick={() => { setShowResearch(true); setShowOnboardingZeroLeads(false); }} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white sm:col-span-2">
              <Sparkles className="w-4 h-4" /> Erneut recherchieren
            </Button>
          </div>
          <Button variant="outline" onClick={() => { setShowOnboardingZeroLeads(false); navigate("/dashboard"); }}>Zum Dashboard</Button>
        </div>
      )}

      {showOnboardingFailed && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <Activity className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-red-900 mb-2">Recherche konnte nicht abgeschlossen werden</h3>
          <p className="text-sm text-red-800 mb-6">Bitte prüfen Sie Ihre Einstellungen oder starten Sie die Recherche erneut.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => { setShowResearch(true); setShowOnboardingFailed(false); }} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              <Sparkles className="w-4 h-4" /> Erneut versuchen
            </Button>
            <Button variant="outline" onClick={() => { setShowOnboardingFailed(false); navigate("/dashboard"); }}>Zum Dashboard</Button>
          </div>
        </div>
      )}

      {/* ── 7. TAB CONTENT ───────────────────────────────────────────── */}

      {/* PIPELINE TAB */}
      {activeTab === "pipeline" && (
        <LeadsPipelineView companies={companies} />
      )}

      {/* LIST TABS: today / all / archive */}
      {activeTab !== "pipeline" && (
        <>
          {/* Tagesliste – leer */}
          {activeTab === "today" && filtered.length === 0 && !isFetching && (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <h3 className="text-base font-bold text-slate-700 mb-1">Heute alles erledigt 🎉</h3>
              <p className="text-sm text-slate-400">
                {companies.length === 0
                  ? "Noch keine Firmenkontakte. Starten Sie Ihre erste Recherche."
                  : "Keine heißen Leads, Rückrufe oder neuen Kontakte heute."}
              </p>
              {companies.length === 0 && (
                <Button size="sm" onClick={() => setShowResearch(true)} className="gap-2 mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                  <Sparkles className="w-3.5 h-3.5" /> Firmen recherchieren
                </Button>
              )}
            </div>
          )}

          {/* Alle Leads / Archiv – leer */}
          {activeTab !== "today" && filtered.length === 0 && !isFetching && (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <h3 className="text-base font-bold text-slate-700 mb-1">
                {companies.length === 0
                  ? "Noch keine Firmenkontakte vorhanden."
                  : "Keine Leads zu diesen Filtern."}
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                {companies.length === 0
                  ? "Starten Sie eine Recherche und Vertriebo baut Ihre erste Leadliste auf."
                  : "Passen Sie die Filter an oder setzen Sie sie zurück."}
              </p>
              {companies.length === 0 ? (
                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                  <Button size="sm" onClick={() => setShowResearch(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    <Sparkles className="w-3.5 h-3.5" /> Firmen automatisch recherchieren
                  </Button>
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => navigate("/import")} className="gap-2">
                      <Upload className="w-3.5 h-3.5" /> CSV importieren
                    </Button>
                  )}
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={handleResetFilters} className="gap-2">
                  <X className="w-3.5 h-3.5" /> Filter zurücksetzen
                </Button>
              )}
            </div>
          )}

          {/* Loading skeleton while fetching without existing data */}
          {isFetching && !data && <LeadListSkeleton />}

          {/* Lead list */}
          {filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map(company => (
                <LeadRow key={company.id} company={company} isAdmin={isAdmin} onLogged={loadData} />
              ))}

              {hasMorePages && (
                <div className="flex flex-col items-center pt-4 gap-2">
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-300 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isFetchingNextPage && (
                      <span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                    )}
                    {isFetchingNextPage ? "Lädt weitere Kontakte…" : "Weitere 50 Kontakte laden"}
                  </button>
                  <p className="text-xs text-slate-400">
                    {companies.length} von {totalCompanies} Kontakten geladen
                  </p>
                </div>
              )}
              {!hasMorePages && companies.length > PAGE_SIZE && (
                <p className="text-xs text-slate-400 text-center pt-4">
                  Alle {companies.length} sichtbaren Kontakte geladen
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
      <AddCompanyDialog open={showAdd} onClose={() => setShowAdd(false)} onCreated={loadData} organizationId={orgId} />
      <ResearchDialog
        open={showResearch}
        orgId={orgId}
        onClose={() => setShowResearch(false)}
        onSuccess={() => {
          setSortBy("created");
          setNewRunFilter(null);
          setStatusFilter(null);
          refetch();
        }}
      />
    </div>
  );
}