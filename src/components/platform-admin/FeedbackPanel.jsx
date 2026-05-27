/**
 * FeedbackPanel – Zeigt alle SupportNote-Einträge im PlatformAdmin
 * Filter: critical / warning / info
 * Status-Update: open → reviewed → resolved
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Info, CheckCircle2, RefreshCw, MessageSquare, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

const SEVERITY_CONFIG = {
  critical: {
    label: "Kritisch",
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
    icon: AlertTriangle,
    iconColor: "text-red-600",
  },
  warning: {
    label: "Warnung",
    bg: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
  },
  info: {
    label: "Info",
    bg: "bg-slate-50 border-slate-200",
    badge: "bg-slate-100 text-slate-600",
    icon: Info,
    iconColor: "text-slate-500",
  },
};

const STATUS_CONFIG = {
  open: { label: "Offen", color: "bg-blue-100 text-blue-700" },
  reviewed: { label: "Gesehen", color: "bg-amber-100 text-amber-700" },
  resolved: { label: "Erledigt", color: "bg-emerald-100 text-emerald-700" },
};

const STATUS_CYCLE = { open: "reviewed", reviewed: "resolved", resolved: "open" };

export default function FeedbackPanel({ organizations = [] }) {
  const [severityFilter, setSeverityFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading, refetch } = useQuery({
    queryKey: ["support-notes-all"],
    queryFn: async () => {
      const res = await base44.entities.SupportNote.list("-created_date", 200);
      return res;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      await base44.entities.SupportNote.update(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-notes-all"] });
    },
    onError: (e) => toast.error("Fehler: " + e.message),
  });

  // Filter: keine System-Noise (no-reply.base44.com), dann severity-Filter
  const filtered = notes
    .filter(n => !n.created_by?.includes("no-reply.base44.com"))
    .filter(n => severityFilter === "all" || n.severity === severityFilter);

  const getOrgName = (orgId) => {
    const org = organizations.find(o => o.id === orgId);
    return org?.name || orgId || "—";
  };

  const counts = {
    all: notes.filter(n => !n.created_by?.includes("no-reply.base44.com")).length,
    critical: notes.filter(n => !n.created_by?.includes("no-reply.base44.com") && n.severity === "critical").length,
    warning: notes.filter(n => !n.created_by?.includes("no-reply.base44.com") && n.severity === "warning").length,
    info: notes.filter(n => !n.created_by?.includes("no-reply.base44.com") && n.severity === "info").length,
  };

  return (
    <div className="space-y-5">
      {/* Header + Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">Nutzer-Feedback & Support-Notizen</h2>
          <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{counts.all}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
        </Button>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "all", label: "Alle", count: counts.all },
          { key: "critical", label: "Kritisch", count: counts.critical, color: "text-red-700" },
          { key: "warning", label: "Warnung", count: counts.warning, color: "text-amber-700" },
          { key: "info", label: "Info", count: counts.info, color: "text-slate-600" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setSeverityFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              severityFilter === f.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
            <span className={`font-bold ${severityFilter === f.key ? "text-white" : f.color || "text-slate-500"}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Notes List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Keine Einträge</p>
          <p className="text-xs text-slate-500 mt-1">
            {severityFilter !== "all" ? "Kein Feedback in dieser Kategorie." : "Noch kein Nutzer-Feedback eingegangen."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(note => {
            const cfg = SEVERITY_CONFIG[note.severity] || SEVERITY_CONFIG.info;
            const Icon = cfg.icon;
            const currentStatus = note.status || "open";
            const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.open;
            const nextStatus = STATUS_CYCLE[currentStatus];

            return (
              <div
                key={note.id}
                className={`rounded-xl border p-4 ${cfg.bg} transition-opacity ${currentStatus === "resolved" ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  {/* Left: Icon + content */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.iconColor}`} />
                    <div className="flex-1 min-w-0">
                      {/* Severity + Status badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>

                      {/* Note text */}
                      <p className="text-sm font-medium text-slate-900 leading-relaxed mb-2 whitespace-pre-wrap break-words">
                        {note.note}
                      </p>

                      {/* Meta */}
                      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span className="font-semibold text-slate-700">{getOrgName(note.organization_id)}</span>
                        </div>
                        <span>von <span className="font-medium text-slate-700">{note.created_by}</span></span>
                        <span>{moment(note.created_date).format("DD.MM.YYYY HH:mm")}</span>
                        <span className="text-slate-400">{moment(note.created_date).fromNow()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status-Toggle Button */}
                  <button
                    onClick={() => updateStatus.mutate({ id: note.id, status: nextStatus })}
                    disabled={updateStatus.isPending}
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
                    title={`Als "${STATUS_CONFIG[nextStatus]?.label}" markieren`}
                  >
                    → {STATUS_CONFIG[nextStatus]?.label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}