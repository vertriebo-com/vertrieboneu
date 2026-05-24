/**
 * DailyActionList – "Heute wichtig" im Dashboard
 *
 * WHY: Vertriebo soll nicht leer wirken wenn Leads vorhanden sind.
 *      Statt "Keine Aufgaben" soll der Nutzer konkrete Handlungen sehen.
 *
 * LOGIC: Zeigt priorisierte Aktionsliste aus getDashboardData.actionableLeads:
 *   Priority 0 – task_overdue:       Überfällige Aufgaben (allgemein) → rot
 *   Priority 0 – callback_overdue:   Überfälliger Rückruf → rot + Telefon-Icon
 *   Priority 1 – task_today:         Heute fällige Aufgaben (allgemein) → blau
 *   Priority 1 – callback_due_today: Heute fälliger Rückruf → blau + Telefon-Icon
 *   Priority 2 – hot_lead:           Heißer Lead ohne offene Task → orange 🔥
 *   Priority 2.5 – offer_followup:   Offenes Angebot ohne offene Task → indigo
 *   Priority 3 – warm_lead_action:   Warmer Lead mit KI-Empfehlung → amber
 *   Priority 3 – callback_pending:   Rückruf-Status ohne Task → violet
 *   Priority 4 – new_contactable:    Neuer Lead (Score ≥65, kontaktierbar) → grün
 *
 * DATA: actionableLeads aus getDashboardData (serverseitig priorisiert, max 6)
 * UX: Klick → direkt zur Firma (/leads/:id) oder Aufgabenansicht (/tasks)
 */
import { Link } from "react-router-dom";
import { AlertCircle, Phone, ArrowRight, CheckCircle2, Zap, Flame, Star, FileText } from "lucide-react";

const TYPE_CONFIG = {
  task_overdue: {
    icon: AlertCircle,
    iconColor: "text-red-600",
    bg: "bg-red-50 border-red-200",
    textColor: "text-red-900",
    subColor: "text-red-700",
    dot: "bg-red-500",
  },
  callback_overdue: {
    icon: Phone,
    iconColor: "text-red-600",
    bg: "bg-red-50 border-red-200",
    textColor: "text-red-900",
    subColor: "text-red-700",
    dot: "bg-red-500",
  },
  task_today: {
    icon: Zap,
    iconColor: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    textColor: "text-blue-900",
    subColor: "text-blue-700",
    dot: "bg-blue-500",
  },
  callback_due_today: {
    icon: Phone,
    iconColor: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    textColor: "text-blue-900",
    subColor: "text-blue-700",
    dot: "bg-blue-500",
  },
  hot_lead: {
    icon: Flame,
    iconColor: "text-orange-600",
    bg: "bg-orange-50 border-orange-200",
    textColor: "text-orange-900",
    subColor: "text-orange-700",
    dot: "bg-orange-500",
  },
  offer_followup: {
    icon: FileText,
    iconColor: "text-indigo-600",
    bg: "bg-indigo-50 border-indigo-200",
    textColor: "text-indigo-900",
    subColor: "text-indigo-700",
    dot: "bg-indigo-500",
  },
  warm_lead_action: {
    icon: Star,
    iconColor: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    textColor: "text-amber-900",
    subColor: "text-amber-700",
    dot: "bg-amber-500",
  },
  callback_pending: {
    icon: Phone,
    iconColor: "text-violet-600",
    bg: "bg-violet-50 border-violet-200",
    textColor: "text-violet-900",
    subColor: "text-violet-700",
    dot: "bg-violet-500",
  },
  new_contactable: {
    icon: ArrowRight,
    iconColor: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    textColor: "text-emerald-900",
    subColor: "text-emerald-700",
    dot: "bg-emerald-500",
  },
};

const DEFAULT_CONFIG = {
  icon: Zap,
  iconColor: "text-slate-600",
  bg: "bg-slate-50 border-slate-200",
  textColor: "text-slate-900",
  subColor: "text-slate-600",
  dot: "bg-slate-400",
};

export default function DailyActionList({ actionableLeads = [], todayTasksCount = 0, overdueTasksCount = 0 }) {
  if (actionableLeads.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-900">Alles erledigt!</p>
        <p className="text-xs font-medium text-slate-600 mt-1">Keine dringenden Aktionen für heute.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actionableLeads.map((item, idx) => {
        const cfg = TYPE_CONFIG[item.type] || DEFAULT_CONFIG;
        const Icon = cfg.icon;

        // Ziel-URL: Task → /tasks, Company → /leads/:id
        const href = item.company_id
          ? `/leads/${item.company_id}`
          : `/tasks`;

        return (
          <Link
            key={`${item.type}-${item.company_id || item.task_id || idx}`}
            to={href}
            className={`flex items-center gap-3 p-3 border rounded-lg hover:brightness-95 transition-all ${cfg.bg}`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${cfg.iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${cfg.textColor}`}>
                {item.company_name}
              </p>
              <p className={`text-xs mt-0.5 truncate ${cfg.subColor}`}>
                <span className="font-medium">{item.action}</span>
                {item.reason ? ` · ${item.reason}` : ""}
              </p>
            </div>
            <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${cfg.iconColor} opacity-60`} />
          </Link>
        );
      })}
    </div>
  );
}