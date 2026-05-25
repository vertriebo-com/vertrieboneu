import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart3, TrendingUp } from "lucide-react";
import StatCard from "../components/StatCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useOrganization } from "@/hooks/useOrganization";

const STATUS_COLORS = {
  "Neu": "#3b82f6",
  "Kontakt": "#06b6d4",
  "Rückruf": "#f59e0b",
  "Termin": "#8b5cf6",
  "Angebot": "#f97316",
  "Gewonnen": "#10b981",
  "Verloren": "#ef4444",
};

export default function Statistics() {
  const { org, loading: orgLoading } = useOrganization();
  const [companies, setCompanies] = useState([]);
  const [contactLogs, setContactLogs] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgLoading) return;
    if (!org?.id) { setLoading(false); return; }
    (async () => {
      const [comps, logs, outs] = await Promise.all([
        base44.entities.Company.filter({ organization_id: org.id }, "-created_date", 500),
        base44.entities.ContactLog.filter({ organization_id: org.id }, "-created_date", 500),
        base44.entities.LeadOutcome.filter({ organization_id: org.id }, "-created_date", 500),
      ]);
      setCompanies(comps);
      setContactLogs(logs);
      setOutcomes(outs);
      setLoading(false);
    })();
  }, [org?.id, orgLoading]);

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Status Distribution
  const statusData = Object.entries(
    companies.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || "#94a3b8" }));

  // Contact Type Distribution
  const contactTypeData = Object.entries(
    contactLogs.reduce((acc, l) => {
      acc[l.typ] = (acc[l.typ] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Conversion
  const total = companies.length;
  const gewonnen = companies.filter(c => c.status === "Gewonnen").length;
  const conversionRate = total > 0 ? ((gewonnen / total) * 100).toFixed(1) : 0;

  // Conversion per Branche
  const brancheMap = {};
  for (const c of companies) {
    const b = c.branche || "Unbekannt";
    if (!brancheMap[b]) brancheMap[b] = { total: 0, gewonnen: 0 };
    brancheMap[b].total++;
    if (c.status === "Gewonnen") brancheMap[b].gewonnen++;
  }
  const brancheData = Object.entries(brancheMap)
    .filter(([, v]) => v.total >= 2)
    .map(([name, v]) => ({ name, rate: Math.round((v.gewonnen / v.total) * 100), total: v.total, gewonnen: v.gewonnen }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  // Outcome Stats
  const latestOutcomeByLead = {};
  for (const o of [...outcomes].sort((a, b) => new Date(b.created_date) - new Date(a.created_date))) {
    if (!latestOutcomeByLead[o.company_id]) latestOutcomeByLead[o.company_id] = o.outcome_type;
  }
  const outcomeValues = Object.values(latestOutcomeByLead);
  const totalRated = outcomeValues.length;
  const wonCount = outcomeValues.filter(o => o === "won").length;
  const relevantCount = outcomeValues.filter(o => o === "relevant").length;
  const notRelevantCount = outcomeValues.filter(o => o === "not_relevant").length;
  const outcomeConversionRate = totalRated > 0 ? ((wonCount / totalRated) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-slate-900">Statistiken</h1>
        <p className="text-sm font-medium text-slate-700 mt-2">Übersicht über alle Vertriebsaktivitäten</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Leads gesamt" value={total} icon={BarChart3} />
        <StatCard title="Kontakte" value={contactLogs.length} icon={TrendingUp} />
        <StatCard title="Gewonnen" value={gewonnen} />
        <StatCard title="Conversion" value={`${conversionRate}%`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Status Pie */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Lead-Status Verteilung</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Contact Bar */}
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
              <span className="text-lg font-bold text-emerald-700">{outcomeConversionRate}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Conversion per Branche */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Conversion-Rate nach Branche</h3>
        <p className="text-xs font-medium text-slate-700 mb-4">Nur Branchen mit mind. 2 Leads</p>
        {brancheData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm font-semibold text-slate-900">Noch nicht genug Daten</p>
            <p className="text-xs font-medium text-slate-700 mt-1">Mehr Leads erforderlich für Statistiken</p>
          </div>
        ) : (
          <div className="space-y-3">
            {brancheData.map(b => (
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