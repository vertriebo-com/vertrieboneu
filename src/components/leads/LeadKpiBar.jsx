/**
 * LeadKpiBar – kompakte Sales-KPI-Leiste für die Leads-Seite
 */
import { Building2, Flame, Phone, CalendarClock } from "lucide-react";
import { isHotLead } from "@/utils/leadTemperature";
import moment from "moment";

export default function LeadKpiBar({ companies = [], totalCompanies = 0, isFetching = false }) {
  const hotCount = companies.filter(c => isHotLead(c)).length;
  const callbackCount = companies.filter(c => c.status === "Rückruf").length;
  const weekAgo = moment().subtract(7, "days").toISOString();
  const newThisWeek = companies.filter(c => c.created_date && c.created_date >= weekAgo).length;

  const items = [
    {
      label: "Geladen",
      value: `${companies.length}${totalCompanies > companies.length ? ` / ${totalCompanies}` : ""}`,
      icon: Building2,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      label: "Heiße Leads",
      value: hotCount,
      icon: Flame,
      iconBg: "bg-orange-50",
      iconColor: "text-orange-500",
    },
    {
      label: "Rückrufe offen",
      value: callbackCount,
      icon: Phone,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
    {
      label: "Neue diese Woche",
      value: newThisWeek,
      icon: CalendarClock,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map(({ label, value, icon: Icon, iconBg, iconColor }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
              <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-none">{label}</p>
              <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">
                {isFetching && value === 0 ? "…" : value}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 text-right">
        Kennzahlen beziehen sich auf aktuell geladene Kontakte.
      </p>
    </div>
  );
}