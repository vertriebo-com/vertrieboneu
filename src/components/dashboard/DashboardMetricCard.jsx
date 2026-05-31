/**
 * DashboardMetricCard – kompakte KPI-Karte
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function DashboardMetricCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg = "bg-slate-50",
  iconColor = "text-slate-500",
  to,
  hoverBorder = "hover:border-slate-300",
  children,
}) {
  const inner = (
    <div className={cn(
      "bg-white border border-slate-200 rounded-2xl p-4 shadow-sm transition-all",
      to && `cursor-pointer ${hoverBorder} hover:shadow-md`
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">{label}</p>
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-4 h-4", iconColor)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>}
      {children}
    </div>
  );

  return to ? <Link to={to}>{inner}</Link> : inner;
}