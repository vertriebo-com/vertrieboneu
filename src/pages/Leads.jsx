import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLeadsFilter } from "../hooks/useLeadsFilter";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, X, TrendingUp, Building2, Upload, Sparkles, Activity, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import AddCompanyDialog from "../components/AddCompanyDialog";
import PipelineBar from "../components/leads/PipelineBar";
import LeadRow from "../components/leads/LeadRow";
import ResearchDialog from "../components/leads/ResearchDialog";
import ActiveResearchBanner from "../components/leads/ActiveResearchBanner";
import CompactStats from "../components/leads/CompactStats";
import moment from "moment";
import { isHotLead } from "@/utils/leadTemperature";

export default function Leads() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, org, filterCompanies, loading: filterLoading } = useLeadsFilter();
  
  // ═ States
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [focusFilter, setFocusFilter] = useState(null);
  const [sortBy, setSortBy] = useState("priority");
  const [showAdd, setShowAdd] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("Alle");
  const [assignedFilter, setAssignedFilter] = useState("Alle");
  const [showArchived, setShowArchived] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [researching, setResearching] = useState(false);
  const [newRunFilter, setNewRunFilter] = useState(null);
  const [showAllLeads, setShowAllLeads] = useState(false);
  const [leadLimit, setLeadLimit] = useState(100);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showOnboardingZeroLeads, setShowOnboardingZeroLeads] = useState(false);
  const [showOnboardingFailed, setShowOnboardingFailed] = useState(false);

  // ═ Effects
  // Parse query parameters: new_run, search, onboarding_zero_leads, onboarding_failed, analyze
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newRun = params.get("new_run");
    // P0-FIX: "undefined" als String oder null → nicht setzen
    setNewRunFilter(newRun && newRun !== "undefined" && newRun !== "null" ? newRun : null);
    const searchParam = params.get("search");
    setSearch(searchParam || "");
    
    // Onboarding-Zustände anzeigen
    const onboardingZeroLeads = params.get("onboarding_zero_leads");
    const onboardingFailed = params.get("onboarding_failed");
    
    if (onboardingZeroLeads === 'true') {
      // Zeige Empty-State mit Alternativen
      setShowOnboardingZeroLeads(true);
    }
    if (onboardingFailed === 'true') {
      // Zeige Recovery-Message
      setShowOnboardingFailed(true);
    }
  }, [location.search]);

  

  const orgId = org?.id || null;
  const { data: companies = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["companies", orgId, leadLimit],
    queryFn: () => {
      console.time("[Leads] Company query");
      const result = orgId
        ? base44.entities.Company.filter({ organization_id: orgId }, "-created_date", leadLimit)
        : Promise.resolve([]);
      console.timeEnd("[Leads] Company query");
      return result;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: outcomes = [] } = useQuery({
    queryKey: ["leadOutcomes", orgId],
    queryFn: () => {
      console.time("[Leads] Outcome query");
      const result = orgId
        ? base44.entities.LeadOutcome.filter({ organization_id: orgId }, "-created_date", 200)
        : Promise.resolve([]);
      console.timeEnd("[Leads] Outcome query");
      return result;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const outcomeByCompany = {};
  for (const o of [...outcomes].sort((a, b) => new Date(b.created_date) - new Date(a.created_date))) {
    if (!outcomeByCompany[o.company_id]) outcomeByCompany[o.company_id] = o.outcome_type;
  }





  // ═ Auto-analyze when coming from Dashboard CTA
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("analyze") === 'true' && companies.length > 0 && !researching) {
      handleAnalyzeLatest();
      params.delete("analyze");
      navigate("/leads?" + params.toString(), { replace: true });
    }
  }, [companies.length, location.search]);

  // ═ Helpers & Derived Values
  const loadData = () => refetch();
  // MVP: 1 Account = 1 Owner → Admin = Owner oder PlatformAdmin
  const isAdmin = user?.role === "admin" || (org && org.owner_email === user?.email);

  const applySort = (arr) => {
    const sorted = [...arr];
    switch (sortBy) {
      case "name": return sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      case "score": return sorted.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
      case "created": return sorted.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      case "last_contact": return sorted.sort((a, b) => new Date(b.last_contact_date || 0) - new Date(a.last_contact_date || 0));
      default: return sorted.sort((a, b) => {
        if (isHotLead(a) && !isHotLead(b)) return -1;
        if (!isHotLead(a) && isHotLead(b)) return 1;
        const statusPrio = { "Rückruf": 0, "Termin": 1, "Angebot": 2, "Kontakt": 3, "Neu": 4, "Gewonnen": 5, "Verloren": 6 };
        return (statusPrio[a.status] ?? 9) - (statusPrio[b.status] ?? 9);
      });
    }
  };

  const filtered = useMemo(() => {
    console.time("[Leads] filter + sort");
    const result = applySort(
      filterCompanies(companies).filter(c => {
        if (!showArchived && ["Gewonnen", "Verloren"].includes(c.status)) return false;
        if (statusFilter && c.status !== statusFilter) return false;
        if (priorityFilter !== "Alle") {
          const score = c.priority_score || 0;
          if (priorityFilter === "Hoch" && score < 60) return false;
          if (priorityFilter === "Mittel" && (score < 30 || score >= 60)) return false;
          if (priorityFilter === "Niedrig" && score >= 30) return false;
        }
        if (assignedFilter !== "Alle" && c.assigned_to !== assignedFilter) return false;
        if (newRunFilter && c.research_run_id !== newRunFilter) return false;
        
        // Focus Filters
        const today = moment().format("YYYY-MM-DD");
        const weekAgo = moment().subtract(7, "days").toISOString();
        if (focusFilter === "call_today" && !(c.last_contact_date && c.last_contact_date.startsWith(today))) return false;
        if (focusFilter === "callback_open" && c.status !== "Rückruf") return false;
        if (focusFilter === "hot_leads" && !isHotLead(c)) return false;
        if (focusFilter === "new_this_week" && !(c.created_date && c.created_date >= weekAgo)) return false;
        
        if (search) {
          const s = search.toLowerCase();
          return (
            c.name?.toLowerCase().includes(s) ||
            c.branche?.toLowerCase().includes(s) ||
            c.ort?.toLowerCase().includes(s) ||
            c.plz?.toLowerCase().includes(s) ||
            c.website?.toLowerCase().includes(s) ||
            c.telefon?.toLowerCase().includes(s) ||
            c.email?.toLowerCase().includes(s)
          );
        }
        return true;
      })
    );
    console.timeEnd("[Leads] filter + sort");
    return result;
  }, [companies, filterCompanies, showArchived, statusFilter, priorityFilter, assignedFilter, newRunFilter, focusFilter, search]);

  // Pagination: Nur erste 50 initial, danach alle
  const visibleLeads = useMemo(() => {
    console.time("[Leads] visibleLeads slice");
    const result = showAllLeads ? filtered : filtered.slice(0, 50);
    console.timeEnd("[Leads] visibleLeads slice");
    return result;
  }, [filtered, showAllLeads]);

  const handleCsvExport = () => {
    const headers = ["Name","Branche","Telefon","E-Mail","Status","Priorität"];
    const rows = filtered.map(c => [c.name, c.branche, c.telefon, c.email, c.status, c.priority_score].map(v => `"${v || ""}"`).join(","));
    const blob = new Blob(["\uFEFF" + [headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "leads.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleAnalyzeLatest = async () => {
    if (!orgId || researching) return;
    try {
      setResearching(true);
      toast.info("Vertriebo Engine analysiert die neuesten Leads…");

      const result = await base44.functions.invoke("analyzeLeadEngine", {
        organization_id: orgId,
        mode: "latest",
        limit: 10
      });

      if (result?.data?.success) {
        const analyzed = result.data.analyzed_count || result.data.analyzed || 0;
        toast.success(`${analyzed} Leads analysiert. Hot/Warm/Cold wurde aktualisiert.`);
        await refetch();
      } else {
        toast.error(result?.data?.error || "Die Vertriebo Engine konnte nicht gestartet werden.");
      }
    } catch (error) {
      console.error("[Leads] Engine analysis error:", error);
      toast.error(error?.message || "Analyse fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setResearching(false);
    }
  };



  if (loading || filterLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Hero Zone - Kompakt */}
      <div className="bg-gradient-to-r from-white to-blue-50/30 border border-slate-200 rounded-xl shadow-sm p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-0.5">Leads</h1>
            <p className="text-sm font-medium text-slate-700">
              {companies.length} {companies.length === 1 ? 'Firmenkontakt' : 'Firmenkontakte'}
              {filtered.filter(c => c.status === "Rückruf").length > 0 && (
                <span className="ml-2 text-amber-700">· {filtered.filter(c => c.status === "Rückruf").length} Rückrufe offen</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button onClick={() => setShowResearch(true)} size="sm" className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-sm">
                <Sparkles className="w-3.5 h-3.5" /> Firmen recherchieren
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Aktiver ResearchRun Banner */}
      <ActiveResearchBanner orgId={orgId} onNewLeads={() => refetch()} />

      {/* Success Box for new_run filter */}
      {newRunFilter && filtered.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">✨ Recherche abgeschlossen</p>
              <p className="text-lg font-bold text-emerald-900 mt-1">
                {filtered.length} {filtered.length === 1 ? 'Firmenkontakt' : 'Firmenkontakte'} gefunden
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setNewRunFilter(null)} 
              className="gap-2 bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              Filter aufheben <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Compact Stats – nur wenn mehrere KPIs sichtbar */}
      <CompactStats companies={filtered} />

      {/* Pipeline - Kompakt */}
      <PipelineBar companies={companies} activeStatus={statusFilter} onStatusClick={setStatusFilter} />

      {/* Filterbar */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-3.5">
        <div className="flex flex-col gap-3">
          {/* Suche + Sortierung */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Suche: Name, Branche, Ort, PLZ, Telefon, E-Mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white border border-[#E2E8F0] text-slate-900 placeholder:text-slate-500 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-48 bg-white border border-[#E2E8F0] text-slate-900">
                <SelectValue placeholder="Sortieren nach…" />
              </SelectTrigger>
              <SelectContent>
                {[
                  {value:"priority",label:"Höchste Priorität zuerst"},
                  {value:"score",label:"Bester Score zuerst"},
                  {value:"name",label:"Name A–Z"},
                  {value:"created",label:"Neueste zuerst"},
                  {value:"last_contact",label:"Zuletzt kontaktiert"},
                ].map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filter-Gruppe */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36 bg-white border border-[#E2E8F0]"><SelectValue placeholder="Temperatur" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Alle">Alle Temperaturen</SelectItem>
                <SelectItem value="Hoch">🔥 Heiß (Score ≥60)</SelectItem>
                <SelectItem value="Mittel">Warm (30–59)</SelectItem>
                <SelectItem value="Niedrig">Kalt (&lt;30)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter || "alle_status"} onValueChange={v => setStatusFilter(v === "alle_status" ? null : v)}>
              <SelectTrigger className="w-32 bg-white border border-[#E2E8F0]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle_status">Alle Status</SelectItem>
                {["Neu","Kontakt","Rückruf","Termin","Angebot","Gewonnen","Verloren"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Vertriebler-Filter deaktiviert für MVP (1 Account = 1 Owner) */}
            {/* <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="w-40 bg-white border border-[#E2E8F0]"><SelectValue placeholder="Vertriebler" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Alle">Alle Vertriebler</SelectItem>
                {members.map(m => <SelectItem key={m.id} value={m.user_email}>{m.user_email}</SelectItem>)}
              </SelectContent>
            </Select> */}
            <div className="flex-1" />
          </div>
        </div>

        {/* Aktive Filter */}
        {(statusFilter || priorityFilter !== "Alle" || search || newRunFilter) && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-200">
            {statusFilter && <button onClick={() => setStatusFilter(null)} className="inline-flex items-center gap-1 text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full hover:bg-purple-200"><span>{statusFilter}</span><X className="w-3 h-3"/></button>}
            {priorityFilter !== "Alle" && <button onClick={() => setPriorityFilter("Alle")} className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full hover:bg-orange-200"><span>Temperatur: {priorityFilter}</span><X className="w-3 h-3"/></button>}
            {newRunFilter && <button onClick={() => setNewRunFilter(null)} className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full hover:bg-emerald-200"><span>Neue Leads</span><X className="w-3 h-3"/></button>}
            {search && <button onClick={() => setSearch("")} className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full hover:bg-slate-200"><span>Suche</span><X className="w-3 h-3"/></button>}
          </div>
        )}
      </div>

      {/* Onboarding Zero-Leads State */}
      {showOnboardingZeroLeads && companies.length === 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8 mb-6 text-center">
          <div className="flex items-center justify-center mb-4">
            <Target className="w-12 h-12 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-amber-900 mb-2">Keine passenden Firmenkontakte gefunden</h3>
          <p className="text-sm text-amber-800 mb-6 max-w-lg mx-auto">
            Das kann an zu engen Einstellungen liegen. Hier sind konkrete Optionen um mehr Treffer zu erhalten:
          </p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto mb-6">
            <Button 
              onClick={() => navigate('/settings?tab=company')} 
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Target className="w-4 h-4" /> Suchradius erhöhen
            </Button>
            <Button 
              onClick={() => navigate('/settings?tab=targeting')} 
              className="gap-2 bg-white border border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Filter className="w-4 h-4" /> Zielkunden anpassen
            </Button>
            <Button 
              onClick={() => { setShowResearch(true); setShowOnboardingZeroLeads(false); }} 
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white sm:col-span-2"
            >
              <Sparkles className="w-4 h-4" /> Erneut recherchieren
            </Button>
          </div>
          <Button 
            variant="outline" 
            onClick={() => { setShowOnboardingZeroLeads(false); navigate('/dashboard'); }} 
            className="text-slate-600"
          >
            Zum Dashboard
          </Button>
        </div>
      )}

      {/* Onboarding Failed State */}
      {showOnboardingFailed && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-8 mb-6 text-center">
          <div className="flex items-center justify-center mb-4">
            <Activity className="w-12 h-12 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-red-900 mb-2">Recherche konnte nicht abgeschlossen werden</h3>
          <p className="text-sm text-red-800 mb-6">
            Bitte prüfen Sie Ihre Einstellungen oder starten Sie die Recherche erneut.
          </p>
          <div className="flex gap-3 justify-center">
            <Button 
              onClick={() => { setShowResearch(true); setShowOnboardingFailed(false); }} 
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Sparkles className="w-4 h-4" /> Erneut versuchen
            </Button>
            <Button 
              variant="outline" 
              onClick={() => { setShowOnboardingFailed(false); navigate('/dashboard'); }} 
              className="text-slate-600"
            >
              Zum Dashboard
            </Button>
          </div>
        </div>
      )}

      {/* Leads List - Früher sichtbar */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Building2 className="w-14 h-14 mx-auto mb-3 text-slate-300" />
          <h3 className="text-lg font-bold text-slate-900 mb-1.5">Keine Leads gefunden</h3>
          <p className="text-sm text-slate-600 mb-5">
            {companies.length === 0 ? "Noch keine Firmenkontakte vorhanden." : "Filter anpassen oder neuen Lead hinzufügen."}
          </p>
          {companies.length === 0 ? (
           <div className="flex flex-col gap-2.5 max-w-sm mx-auto">
             <Button size="lg" onClick={() => setShowResearch(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full">
               <TrendingUp className="w-4 h-4" /> Firmen automatisch recherchieren
             </Button>
             {isAdmin && (
               <a href="/import" className="w-full">
                 <Button variant="outline" size="lg" className="gap-2 border border-slate-200 w-full">
                   <Upload className="w-4 h-4" /> CSV/Excel importieren
                 </Button>
               </a>
             )}
           </div>
          ) : (
            <Button variant="outline" onClick={() => { setStatusFilter(null); setFocusFilter(null); setSearch(""); }} className="gap-2 border border-slate-200">Filter zurücksetzen</Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleLeads.map(company => (
            <LeadRow key={company.id} company={company} isAdmin={isAdmin} onLogged={loadData} />
          ))}

          {/* Seitenweise anzeigen (innerhalb geladener Kontakte) */}
          {!showAllLeads && filtered.length > 50 && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => setShowAllLeads(true)}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
              >
                {filtered.length - 50} weitere angezeigte Kontakte einblenden
              </button>
            </div>
          )}

          {/* Weitere Kontakte vom Server nachladen */}
          {companies.length >= leadLimit && (
            <div className="flex flex-col items-center pt-6 gap-2">
              <button
                onClick={() => { setLeadLimit(l => l + 100); setShowAllLeads(false); }}
                disabled={loadingMore}
                className="px-5 py-2.5 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-300 rounded-xl hover:bg-blue-50 disabled:opacity-50"
              >
                {loadingMore ? "Wird geladen…" : "Weitere 100 Kontakte laden"}
              </button>
              <p className="text-xs text-slate-500">Aktuell {companies.length} Kontakte geladen</p>
            </div>
          )}
        </div>
      )}

      <AddCompanyDialog open={showAdd} onClose={() => setShowAdd(false)} onCreated={loadData} />
      <ResearchDialog
        open={showResearch}
        orgId={orgId}
        onClose={() => setShowResearch(false)}
        onSuccess={() => { refetch(); setNewRunFilter(null); setStatusFilter(null); setFocusFilter(null); }}
      />
    </div>
  );
}