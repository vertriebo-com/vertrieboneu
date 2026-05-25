import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Target, Flame, CheckCircle2, PhoneCall } from "lucide-react";
import StatCard from "../components/StatCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useOrganization } from "@/hooks/useOrganization";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_COLORS = {
  "Neu":       "#3b82f6",
  "Kontakt":   "#06b6d4",
  "Rückruf":   "#f59e0b",
  "Termin":    "#8b5cf6",
  "Angebot":   "#f97316",
  "Gewonnen":  "#10b981",
  "Verloren":  "#ef4444",
};

export default function Statistics() {
  const { org, loading: orgLoading } = useOrganization();
  const [period, setPeriod] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["statistics-summary", org?.id, period],
    queryFn: async () => {
      const res = await base44.functions.invoke("getStatisticsSummary", {
        org_id: org.id,
        period,
      });
      return res.data;
    },
    enabled: !!org?.id,
    staleTime: 60_000,
  });

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-600 font-medium">Fehler beim Laden der Statistiken.</p>
      </div>
    );
  }

  const summary = data?.summary || {};
  const charts  = data?.charts  || {};

  const statusData = (charts.pipeline || [])
    .filter(s => s.value > 0)
    .map(s => ({ ...s, fill: STATUS_COLORS[s.name] || "#94a3b8" }));

  const contactTypeData = charts.contact_types || [];
  const weeklyLeads     = charts.weekly_leads   || [];
  const weeklyContacts  = charts.weekly_contacts || [];
  const outcomeBreakdown = charts.outcome_breakdown || [];

  const conversionByBranche = summary.conversion_by_branche || [];
  const totalRated           = summary.lead_outcomes_total   || 0;
  const wonCount             = summary.won_count             || 0;
  const relevantCount        = summary.relevant_count        || 0;
  const notRelevantCount     = summary.not_relevant_count    || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Statistiken</h1>
          <p className="text-sm font-medium text-slate-700 mt-1">Übersicht über alle Vertriebsaktivitäten</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44 bg-white border border-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Gesamter Zeitraum</SelectItem>
            <SelectItem value="month">Aktueller Monat</SelectItem>
            <SelectItem value="30d">Letzte 30 Tage</SelectItem>
            <SelectItem value="90d">Letzte 90 Tage</SelectItem>
            <SelectItem value="7d">Letzte 7 Tage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Leads gesamt"  value={summary.total_companies || 0}          icon={BarChart3} />
        <StatCard title="Kontakte"      value={summary.contact_logs_total || 0}        icon={TrendingUp} />
        <StatCard title="Gewonnen"      value={summary.won_count || (summary.by_status?.Gewonnen || 0)} />
        <StatCard title="Conversion"    value={`${summary.conversion_rate || 0}%`} />
      </div>

      {/* Temperatur-Karten */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <Flame className="w-5 h-5 text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-red-700">{summary.hot_count || 0}</p>
          <p className="text-xs font-semibold text-red-600 mt-0.5">Heiße Leads</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <Target className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-amber-700">{summary.warm_count || 0}</p>
          <p className="text-xs font-semibold text-amber-600 mt-0.5">Warme Leads</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <CheckCircle2 className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-blue-700">{summary.tasks_overdue || 0}</p>
          <p className="text-xs font-semibold text-blue-600 mt-0.5">Überfällige Aufgaben</p>
        </div>
      </div>

      {/* Charts: Pipeline + Kontaktarten */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Status Pie */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Lead-Status Verteilung</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Contact Type Bar */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Kontaktarten</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contactTypeData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Time Series: Neue Leads + Kontaktaktivität */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Neue Leads pro Woche (letzte 12 Wochen)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyLeads}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Kontaktaktivität pro Woche (letzte 12 Wochen)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyContacts}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Lead-Qualität Outcomes */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Lead-Qualität (Feedback)</h3>
        <p className="text-xs font-medium text-slate-500 mb-4">Basierend auf manuell bewerteten Leads</p>
        {totalRated === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm font-semibold text-slate-900">Noch keine Bewertungen</p>
            <p className="text-xs font-medium text-slate-500 mt-1">Bewerte Leads im Lead-Detail, um hier Daten zu sehen.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-[#E2E8F0] text-center">
                <p className="text-2xl font-bold text-slate-900">{totalRated}</p>
                <p className="text-xs font-medium text-slate-600 mt-1">Bewertete Leads</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 text-center">
                <p className="text-2xl font-bold text-emerald-700">{wonCount}</p>
                <p className="text-xs font-medium text-emerald-700 mt-1">Gewonnen</p>
                <p className="text-xs text-emerald-600">{totalRated > 0 ? ((wonCount/totalRated)*100).toFixed(1) : 0}%</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-center">
                <p className="text-2xl font-bold text-blue-700">{relevantCount}</p>
                <p className="text-xs font-medium text-blue-700 mt-1">Relevant</p>
                <p className="text-xs text-blue-600">{totalRated > 0 ? ((relevantCount/totalRated)*100).toFixed(1) : 0}%</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-4 border border-slate-200 text-center">
                <p className="text-2xl font-bold text-slate-600">{notRelevantCount}</p>
                <p className="text-xs font-medium text-slate-600 mt-1">Nicht relevant</p>
                <p className="text-xs text-slate-500">{totalRated > 0 ? ((notRelevantCount/totalRated)*100).toFixed(1) : 0}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-semibold text-blue-900">Conversion Rate (Gewonnen / Bewertet):</span>
              <span className="text-lg font-bold text-emerald-700">{summary.outcome_conversion_rate || 0}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Conversion per Branche */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Conversion-Rate nach Branche</h3>
        <p className="text-xs font-medium text-slate-700 mb-4">Nur Branchen mit mind. 2 Leads</p>
        {conversionByBranche.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm font-semibold text-slate-900">Noch nicht genug Daten</p>
            <p className="text-xs font-medium text-slate-700 mt-1">Mehr Leads erforderlich für Statistiken</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversionByBranche.map(b => (
              <div key={b.name} className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-700 w-44 truncate shrink-0">{b.name}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${b.rate}%` }} />
                </div>
                <span className="text-xs font-bold text-slate-900 w-12 text-right">{b.rate}%</span>
                <span className="text-xs text-slate-600 w-16 text-right">{b.gewonnen}/{b.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}