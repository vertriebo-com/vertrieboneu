/**
 * DashboardCard – einheitliche Card-Basis für alle Dashboard-Bereiche
 */
import { cn } from "@/lib/utils";

export default function DashboardCard({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-2xl shadow-sm",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}