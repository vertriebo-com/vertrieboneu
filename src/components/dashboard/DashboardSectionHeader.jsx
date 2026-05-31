/**
 * DashboardSectionHeader – konsistenter Card-Header
 */
import { cn } from "@/lib/utils";

export default function DashboardSectionHeader({ icon: Icon, iconColor = "text-slate-500", title, children, className }) {
  return (
    <div className={cn("px-5 py-3.5 border-b border-slate-100 flex items-center gap-2", className)}>
      {Icon && <Icon className={cn("w-4 h-4 shrink-0", iconColor)} />}
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}