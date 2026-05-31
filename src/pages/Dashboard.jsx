import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import LearningLoopBox from "@/components/dashboard/LearningLoopBox";
import { useLeadsFilter } from "../hooks/useLeadsFilter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Building2, ArrowRight, Flame,
  TrendingUp, Calendar, RefreshCw, Search, AlertCircle, Zap,
  ChevronDown, ChevronUp, Phone
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import moment from "moment";
import "moment/locale/de";
moment.locale("de");
import DashboardSkeleton from "@/components/DashboardSkeleton";
import DailyActionList from "@/components/dashboard/DailyActionList";
import DashboardPrimaryAction from "@/components/dashboard/DashboardPrimaryAction";
import ActiveResearchBanner from "@/components/leads/ActiveResearchBanner";
import TrialStatusBanner from "@/components/TrialStatusBanner";
import ResearchObservabilityPanel from "@/components/research/ResearchObservabilityPanel";
import DashboardCard from "@/components/dashboard/DashboardCard";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import DashboardSectionHeader from "@/components/dashboard/DashboardSectionHeader";

export default function Dashboard() {
  const { user: authUser, org: authOrg, loading: orgLoading } = useLeadsFilter();
  const navigate = useNavigate();

  const orgData = authOrg;
  const [orgOverride, setOrgOverride] = useState(null);
  const activeOrg = orgOverride || orgData;

  // Auto-refresh Org nach erfolgreichem Checkout
  useEffect(() => {
    const handleCheckoutSuccess = async () => {
      if (activeOrg?.id) {
        try {
          const orgs = await base44.entities.Organization.filter({ id: activeOrg.id });
          if (orgs[0]) setOrgOverride(orgs[0]);
        } catch {}
      }
    };
    window.addEventListener('checkout-success', handleCheckoutSuccess);

    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success' && activeOrg?.id) {
      let pollCount = 0;
      const pollWebhookStatus = async () => {
        pollCount++;
        try {
          const orgs = await base44.entities.Organization.filter({ id: activeOrg.id });
          const freshOrg = orgs[0];
          if (freshOrg) {
            setOrgOverride(freshOrg);
            const isPaid = freshOrg.billing_status === 'active' && freshOrg.trial_stage === 'paid';
            if (isPaid || pollCount >= 40) {
              window.history.replaceState({}, document.title, window.location.pathname);
            } else {
              setTimeout(pollWebhookStatus, 1500);
            }
          }
        } catch {}
      };
      pollWebhookStatus();
    }
    return () => window.removeEventListener('checkout-success', handleCheckoutSuccess);
  }, [activeOrg?.id]);

  const { data: dashboardData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["dashboard-data", activeOrg?.id],
    queryFn: async () => {
      if (!activeOrg?.id) throw new Error('No organization');
      const response = await base44.functions.invoke('getDashboardData', { org_id: activeOrg.id });
      return response.data;
    },
    enabled: !orgLoading && !!activeOrg?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    placeholderData: null,
  });

  // Personalisierter Vorname
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    if (!orgData?.id) return;
    base44.entities.OrganizationSettings.filter({ organization_id: orgData.id, key: "contact_name" })
      .then(settings => {
        const saved = settings?.[0]?.value?.trim();
        if (saved) {
          setDisplayName(saved);
        } else {
          const authName = (dashboardData?.user?.full_name || authUser?.full_name)?.split(" ")[0]?.trim();
          setDisplayName(authName || "");
        }
      })
      .catch(() => {
        const authName = (dashboardData?.user?.full_name || authUser?.full_name)?.split(" ")[0]?.trim();
        setDisplayName(authName || "");
      });
  }, [orgData?.id, dashboardData?.user?.full_name]);

  // OrgLearnedSignals für LearningLoopBox
  const { data: learnedSignals } = useQuery({
    queryKey: ["learned-signals", activeOrg?.id],
    queryFn: async () => {
      if (!activeOrg?.id) return null;
      const res = await base44.entities.OrgLearnedSignals.filter({ organization_id: activeOrg.id }, '-updated_date', 1);
      return res?.[0] || null;
    },
    enabled: !!activeOrg?.id,
    staleTime: 60000,
  });

  // ResearchObservability nur für Owner/Admin – State für aufklappbaren Bereich
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const isFirstLoad = orgLoading || isLoading || (!activeOrg?.id) || (!!activeOrg?.id && !dashboardData && !error);
  if (isFirstLoad) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 font-semibold mb-2">Fehler beim Laden</p>
          <Button onClick={() => refetch()} size="sm">Neu laden</Button>
        </div>
      </div>
    );
  }

  const stats = dashboardData?.stats || {};
  const data = dashboardData?.data || {};
  const meta = dashboardData?.meta || {};
  const org = dashboardData?.org || activeOrg;

  const pipelineStats = stats.pipelineStats || {};
  const crmPipeline = dashboardData?.crm_pipeline || null;
  const hotLeads = data.hotLeads || [];
  const todayTasks = data.todayTasks || [];
  const overdueTasks = data.overdueTasks || [];
  const actionableLeads = data.actionableLeads || [];
  const newLeadsFromResearch = data.newLeadsFromResearch || [];
  const totalLeads = meta.totalCompanies || 0;
  const contactsThisWeek = stats.contactsThisWeek || 0;
  const weeklyGoal = stats.weeklyGoal || 20;
  const weeklyProgress = Math.min(100, Math.round((contactsThisWeek / weeklyGoal) * 100));

  const greeting = moment().hour() < 12 ? "Guten Morgen" : moment().hour() < 18 ? "Guten Tag" : "Guten Abend";

  const isOwnerOrAdmin =
    authUser?.role === 'admin' ||
    authUser?.role === 'organization_admin' ||
    dashboardData?.user?.role === 'organization_admin';

  const handleUpgrade = () => navigate('/settings?tab=billing');
  const handleManagePlan = () => navigate('/settings?tab=billing');

  const usage = meta?.usage_summary;
  const isUnlimited = usage?.is_unlimited || usage?.monthly_limit === -1;
  const isOverLimit = usage?.is_over_limit;
  const isFallback = usage?.reconciliation?.source_used === 'companies_count';
  const barWidth = !usage || isUnlimited ? 0 : Math.min(100, Math.round((usage.monthly_used || 0) / (usage.monthly_limit || 1) * 100));
  const barColor = isOverLimit ? 'bg-red-500' : barWidth >= 90 ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="space-y-6 pb-8 max-w-5xl mx-auto">

      {/* ── 1. HEADER ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">
            {greeting}{displayName ? `, ${displayName}` : ""} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Das ist heute im Vertrieb wichtig.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          aria-label="Dashboard aktualisieren"
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors px-2.5 py-1.5 rounded-xl hover:bg-blue-50 mt-1 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isFetching ? 'Lädt…' : 'Aktualisieren'}</span>
        </button>
      </div>

      {/* ── 2. SYSTEM BANNERS ─────────────────────────────────────────── */}
      {org && (org.trial_stage !== 'paid' || org.billing_status !== 'active') && (
        <TrialStatusBanner
          trial_stage={org.trial_stage}
          billing_status={org.billing_status}
          trial_leads_granted={org.trial_leads_granted || 0}
          onUpgrade={handleUpgrade}
          onManagePlan={handleManagePlan}
        />
      )}

      {activeOrg?.id && (
        <ActiveResearchBanner
          orgId={activeOrg.id}
          onNewLeads={() => refetch()}
        />
      )}

      {/* Neue Leads aus Recherche */}
      {newLeadsFromResearch.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  {stats.newLeadsFromResearchCount || newLeadsFromResearch.length} neue Leads bereit
                </p>
                <p className="text-xs text-emerald-700">Aus Ihrer letzten Recherche – bereit zur Bearbeitung</p>
              </div>
            </div>
            <Link to="/leads?new_run=latest">
              <Button variant="outline" size="sm" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs shrink-0">
                Ansehen <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* ── 3. PRIMARY ACTION – Hero ───────────────────────────────────── */}
      <DashboardPrimaryAction
        actionableLeads={actionableLeads}
        totalLeads={totalLeads}
      />

      {/* ── 4. KPI-LEISTE ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashboardMetricCard
          label="Firmen im CRM"
          value={totalLeads}
          to="/leads"
          icon={Building2}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          hoverBorder="hover:border-blue-200"
        />

        <DashboardMetricCard
          label="Heiße Leads"
          value={hotLeads.length}
          to="/leads?temperature=hot"
          icon={Flame}
          iconBg="bg-orange-50"
          iconColor="text-orange-500"
          hoverBorder="hover:border-orange-200"
        />

        <DashboardMetricCard
          label="Heute fällig"
          value={todayTasks.length}
          to="/tasks"
          icon={Calendar}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          hoverBorder="hover:border-amber-200"
          sub={overdueTasks.length > 0 ? `${overdueTasks.length} überfällig` : undefined}
        >
          {overdueTasks.length > 0 && (
            <p className="text-[11px] font-semibold text-red-500 mt-1">{overdueTasks.length} überfällig</p>
          )}
        </DashboardMetricCard>

        <DashboardMetricCard
          label="Diese Woche kontaktiert"
          value={`${weeklyProgress}%`}
          icon={TrendingUp}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        >
          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${weeklyProgress}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{contactsThisWeek} / {weeklyGoal}</p>
        </DashboardMetricCard>
      </div>

      {/* ── 5. ARBEITSBEREICH 2-Spalten ────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Tagesplan */}
        <DashboardCard>
          <DashboardSectionHeader icon={Zap} iconColor="text-amber-500" title="Heute wichtig" />
          <div className="p-4">
            <DailyActionList orgId={activeOrg?.id} />
          </div>
        </DashboardCard>

        {/* Heiße Leads */}
        <DashboardCard>
          <DashboardSectionHeader icon={Flame} iconColor="text-orange-500" title="Heiße Leads">
            <Link to="/leads">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7 text-slate-400 hover:text-slate-700">
                Alle <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </DashboardSectionHeader>
          <div className="divide-y divide-slate-100">
            {hotLeads.length > 0 ? (
              hotLeads.slice(0, 6).map(company => (
                <Link
                  key={company.id}
                  to={`/leads/${company.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                    <Flame className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{company.name}</p>
                    <p className="text-xs text-slate-400 truncate">{company.branche || company.ort || "Lead"}</p>
                  </div>
                  <StatusBadge status={company.status} />
                </Link>
              ))
            ) : (
              <div className="px-5 py-10 text-center">
                <Flame className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  {totalLeads > 0 ? "Noch keine heißen Leads" : "Noch keine Leads vorhanden"}
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  {totalLeads > 0
                    ? "Analysieren Sie Ihre Leads, damit Vertriebo heiße Kontakte erkennt."
                    : "Starten Sie eine Recherche, um erste Firmenkontakte zu finden."}
                </p>
                {totalLeads > 0 ? (
                  <Link to="/leads?analyze=true">
                    <Button size="sm" className="gap-2 text-xs bg-orange-500 hover:bg-orange-600 text-white">
                      <Zap className="w-3.5 h-3.5" /> Jetzt analysieren
                    </Button>
                  </Link>
                ) : (
                  <Link to="/leads">
                    <Button size="sm" variant="outline" className="gap-2 text-xs">
                      <Search className="w-3.5 h-3.5" /> Zur Lead-Übersicht
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </DashboardCard>
      </div>

      {/* ── 6. PIPELINE ───────────────────────────────────────────────── */}
      <DashboardCard>
        <DashboardSectionHeader icon={TrendingUp} iconColor="text-blue-500" title="Pipeline" />
        <div className="p-4 grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: "Neu",      count: pipelineStats.neu,      dot: "bg-blue-400",    hover: "hover:bg-blue-50 hover:border-blue-200" },
            { label: "Kontakt",  count: pipelineStats.kontakt,  dot: "bg-cyan-400",    hover: "hover:bg-cyan-50 hover:border-cyan-200" },
            { label: "Rückruf",  count: pipelineStats.rueckruf, dot: "bg-amber-400",   hover: "hover:bg-amber-50 hover:border-amber-200" },
            { label: "Termin",   count: pipelineStats.termin,   dot: "bg-violet-400",  hover: "hover:bg-violet-50 hover:border-violet-200" },
            { label: "Angebot",  count: pipelineStats.angebot,  dot: "bg-orange-400",  hover: "hover:bg-orange-50 hover:border-orange-200" },
            { label: "Gewonnen", count: pipelineStats.gewonnen, dot: "bg-emerald-400", hover: "hover:bg-emerald-50 hover:border-emerald-200" },
          ].map(stage => (
            <Link
              key={stage.label}
              to={`/leads?status=${stage.label}`}
              className={`flex flex-col items-center p-3 rounded-xl border border-slate-200 transition-all ${stage.hover}`}
            >
              <div className={`w-2 h-2 rounded-full ${stage.dot} mb-2`} />
              <p className="text-xl font-bold text-slate-900">{stage.count ?? 0}</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5 text-center">{stage.label}</p>
            </Link>
          ))}
        </div>
      </DashboardCard>

      {/* Opportunity-Pipeline – nur wenn Daten vorhanden */}
      {crmPipeline && crmPipeline.open_opportunities_count > 0 && (
        <DashboardCard>
          <DashboardSectionHeader icon={TrendingUp} iconColor="text-violet-500" title="Opportunity-Pipeline">
            {crmPipeline.overdue_opportunities_count > 0 && (
              <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                {crmPipeline.overdue_opportunities_count} überfällig
              </span>
            )}
          </DashboardSectionHeader>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { value: crmPipeline.open_opportunities_count, label: "Offen", bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", sub: "text-blue-500" },
              { value: `${(crmPipeline.pipeline_value || 0) >= 1000 ? `${((crmPipeline.pipeline_value) / 1000).toFixed(1)}k` : (crmPipeline.pipeline_value || 0).toFixed(0)}€`, label: "Pipeline", bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", sub: "text-emerald-500" },
              { value: `${(crmPipeline.weighted_forecast || 0) >= 1000 ? `${((crmPipeline.weighted_forecast) / 1000).toFixed(1)}k` : (crmPipeline.weighted_forecast || 0).toFixed(0)}€`, label: "Forecast", bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-700", sub: "text-violet-500" },
              { value: crmPipeline.won_this_period, label: "Gewonnen", bg: "bg-slate-50", border: "border-slate-100", text: "text-slate-700", sub: "text-slate-500" },
            ].map(({ value, label, bg, border, text, sub }) => (
              <div key={label} className={`${bg} border ${border} rounded-xl p-3 text-center`}>
                <p className={`text-xl font-bold ${text}`}>{value}</p>
                <p className={`text-[10px] font-semibold ${sub} uppercase tracking-wide mt-0.5`}>{label}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
      )}

      {/* ── 7. LEARNING INSIGHT ───────────────────────────────────────── */}
      <LearningLoopBox learnedSignals={learnedSignals} />

      {/* ── 8. USAGE / BILLING – kompakt ──────────────────────────────── */}
      {usage && (
        <div className={`border rounded-2xl px-5 py-4 ${isOverLimit ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-600">
                {usage.plan_name || "Plan"} · <span className="font-normal text-slate-400">Monatskontingent</span>
                {isFallback && <span className="ml-1 text-[10px] text-amber-600 font-normal">(geschätzt)</span>}
              </p>
              {isUnlimited ? (
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  Unbegrenzt · <span className="font-normal text-slate-500">{usage.monthly_used || 0} neue Leads diesen Monat</span>
                </p>
              ) : (
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  {usage.monthly_used || 0}
                  <span className="font-normal text-slate-500"> von {usage.monthly_limit} neuen Leads genutzt</span>
                </p>
              )}
              <p className="text-[10px] text-slate-400 mt-0.5">
                {!isUnlimited && `${usage.monthly_remaining ?? 0} verbleibend`}
                {!isUnlimited && usage.reset_date && ` · Reset am ${usage.reset_date}`}
                {isUnlimited && `${usage.monthly_used || 0} neue Leads diesen Monat`}
                {' · '}Gesamtbestand: {usage.crm_total ?? totalLeads} Leads
              </p>
            </div>
            {!isUnlimited && (
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-1.5 ${barColor} rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{barWidth}%</span>
              </div>
            )}
          </div>
          {isOverLimit && (
            <p className="text-xs font-semibold text-red-700 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Kontingent überschritten – weitere Recherche blockiert bis Reset oder Upgrade.
            </p>
          )}
        </div>
      )}

      {/* ── 9. RECHERCHE-DIAGNOSE – nur Owner/Admin, ausklappbar ──────── */}
      {isOwnerOrAdmin && activeOrg?.id && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowDiagnostics(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-slate-500">Recherche-Diagnose anzeigen</span>
            {showDiagnostics
              ? <ChevronUp className="w-4 h-4 text-slate-400" />
              : <ChevronDown className="w-4 h-4 text-slate-400" />
            }
          </button>
          {showDiagnostics && (
            <div className="bg-white p-4">
              <ResearchObservabilityPanel orgId={activeOrg.id} />
            </div>
          )}
        </div>
      )}

    </div>
  );
}