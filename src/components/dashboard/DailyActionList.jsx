/**
 * DailyActionList – "Heute wichtig" im Dashboard
 *
 * WHY: Vertriebo soll nicht leer wirken wenn Leads vorhanden sind.
 *      Statt "Keine Aufgaben" soll der Nutzer konkrete Handlungen sehen.
 *
 * LOGIC: Nutzt getDailyActions backend function mit Scoring + Deduplizierung.
 *   Action Types: call_lead, follow_up, prepare_email, create_opportunity,
 *   update_opportunity_stage, add_contact, review_enrichment, schedule_task
 *
 * DATA: actions aus getDailyActions (serverseitig priorisiert, max 25)
 * UX: Klick → direkt zur Firma (/leads/:id) oder Aufgabe
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Phone, ArrowRight, CheckCircle2, Zap, Flame, Star, FileText, UserPlus, RefreshCw, Calendar, AlertCircle } from "lucide-react";

const ACTION_CONFIG = {
  schedule_task: {
    icon: AlertCircle,
    iconColor: "text-red-600",
    bg: "bg-red-50 border-red-200",
    textColor: "text-red-900",
    subColor: "text-red-700",
    label: "Überfällige Aufgabe",
  },
  update_opportunity_stage: {
    icon: FileText,
    iconColor: "text-violet-600",
    bg: "bg-violet-50 border-violet-200",
    textColor: "text-violet-900",
    subColor: "text-violet-700",
    label: "Opportunity",
  },
  follow_up: {
    icon: Phone,
    iconColor: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    textColor: "text-blue-900",
    subColor: "text-blue-700",
    label: "Follow-up",
  },
  call_lead: {
    icon: Phone,
    iconColor: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    textColor: "text-emerald-900",
    subColor: "text-emerald-700",
    label: "Anrufen",
  },
  create_opportunity: {
    icon: Star,
    iconColor: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    textColor: "text-amber-900",
    subColor: "text-amber-700",
    label: "Opportunity anlegen",
  },
  add_contact: {
    icon: UserPlus,
    iconColor: "text-indigo-600",
    bg: "bg-indigo-50 border-indigo-200",
    textColor: "text-indigo-900",
    subColor: "text-indigo-700",
    label: "Ansprechpartner",
  },
  review_enrichment: {
    icon: RefreshCw,
    iconColor: "text-slate-600",
    bg: "bg-slate-50 border-slate-200",
    textColor: "text-slate-900",
    subColor: "text-slate-700",
    label: "Daten prüfen",
  },
  prepare_email: {
    icon: FileText,
    iconColor: "text-cyan-600",
    bg: "bg-cyan-50 border-cyan-200",
    textColor: "text-cyan-900",
    subColor: "text-cyan-700",
    label: "E-Mail",
  },
  mark_lost_or_archive: {
    icon: AlertCircle,
    iconColor: "text-orange-600",
    bg: "bg-orange-50 border-orange-200",
    textColor: "text-orange-900",
    subColor: "text-orange-700",
    label: "Archivieren",
  },
};

const DEFAULT_CONFIG = {
  icon: Zap,
  iconColor: "text-slate-600",
  bg: "bg-slate-50 border-slate-200",
  textColor: "text-slate-900",
  subColor: "text-slate-600",
  label: "Aktion",
};

export default function DailyActionList({ orgId }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    base44.functions.invoke('getDailyActions', { org_id: orgId, limit: 6 })
      .then(res => {
        setActions(res.data?.actions || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 p-3 border rounded-lg bg-slate-50 border-slate-200">
            <div className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-slate-200 rounded animate-pulse w-3/4" />
              <div className="h-2 bg-slate-200 rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (actions.length === 0) {
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
      {actions.map((action) => {
        const cfg = ACTION_CONFIG[action.action_type] || DEFAULT_CONFIG;
        const Icon = cfg.icon;

        return (
          <Link
            key={action.id}
            to={`/leads/${action.company_id}`}
            className={`flex items-center gap-3 p-3 border rounded-lg hover:brightness-95 transition-all ${cfg.bg}`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${cfg.iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${cfg.textColor}`}>
                {action.company_name}
              </p>
              <p className={`text-xs mt-0.5 truncate ${cfg.subColor}`}>
                <span className="font-medium">{cfg.label}</span>
                {action.reason ? ` · ${action.reason}` : ""}
              </p>
            </div>
            <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${cfg.iconColor} opacity-60`} />
          </Link>
        );
      })}
    </div>
  );
}