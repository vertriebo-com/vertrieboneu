/**
 * FeedbackPanel – PlatformAdmin-only
 * Zeigt alle SupportNote-Einträge mit Filter nach Status + Priorität.
 * Statusänderungen und Priorität via adminCrmActions (PlatformAuditLog-gesichert).
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Info, CheckCircle2, RefreshCw, MessageSquare, Building2, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

const SEVERITY_CONFIG = {
  critical: { label: "Kritisch", bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700", icon: AlertTriangle, iconColor: "text-red-600" },
  warning:  { label: "Warnung",  bg: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700", icon: AlertTriangle, iconColor: "text-amber-500" },
  info:     { label: "Info",     bg: "bg-slate-50 border-slate-200", badge: "bg-slate-100 text-slate-600", icon: Info, iconColor: "text-slate-500" },
};

const STATUS_CONFIG = {
  open:     { label: "Offen",   color: "bg-blue-100 text-blue-700" },
  reviewed: { label: "Gesehen", color: "bg-amber-100 text-amber-700" },
  resolved: { label: "Erledigt", color: "bg-emerald-100 text-emerald-700" },
};

const PRIORITY_CONFIG = {
  low:      { label: "Niedrig",  color: "bg-slate-100 text-slate-600" },
  medium:   { label: "Mittel",   color: "bg-blue-100 text-blue-700" },
  high:     { label: "Hoch",     color: "bg-orange-100 text-orange-700" },
  critical: { label: "Kritisch", color: "bg-red-100 text-red-700" },
};

function exportCSV(notes) {
  const header = ["Datum","Org-ID","Erstellt von","Priorität","Status","Notiz","Interne Antwort"];
  const rows = notes.map(n => [
    moment(n.created_date).format("DD.MM.YYYY HH:mm"),
    n.organization_id || "",
    n.created_by || "",
    n.priority || "",
    n.status || "",
    (n.note || "").replace(/\n/g, " "),
    (n.internal_reply_note || "").replace(/\n/g, " "),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "feedback.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function FeedbackPanel({ organizations = [] }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [replyEditing, setReplyEditing] = useState({});
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading, refetch } = useQuery({
    queryKey: ["support-notes-all"],
    queryFn: () => base44.entities.SupportNote.list("-created_date", 300),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.functions.invoke("adminCrmActions", {
      action: "updateSupportNoteStatus", target_id: id, status,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["support-notes-all"] }); toast.success("Status aktualisiert"); },
    onError: e => toast.error("Fehler: " + e.message),
  });

  const priorityMutation = useMutation({
    mutationFn: ({ id, priority }) => base44.functions.invoke("adminCrmActions", {
      action: "updateSupportNotePriority", target_id: id, priority,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["support-notes-all"] }); toast.success("Priorität aktualisiert"); },
    onError: e => toast.error("Fehler: " + e.message),
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, reply }) => base44.functions.invoke("adminCrmActions", {
      action: "updateSupportNoteInternalReply", target_id: id, internal_reply_note: reply,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["support-notes-all"] }); toast.success("Antwortnotiz gespeichert"); },
    onError: e => toast.error("Fehler: " + e.message),
  });

  // Keine System-Noise
  const allVisible = useMemo(() =>
    notes.filter(n => !n.created_by?.includes("no-reply.base44.com")),
    [notes]
  );

  const filtered = useMemo(() => {
    let list = allVisible;
    if (statusFilter !== "all") list = list.filter(n => (n.status || "open") === statusFilter);
    if (priorityFilter !== "all") list = list.filter(n => n.priority === priorityFilter);
    return list;
  }, [allVisible, statusFilter, priorityFilter]);

  const counts = useMemo(() => ({
    status: Object.keys(STATUS_CONFIG).reduce((acc, s) => {
      acc[s] = allVisible.filter(n => (n.status || "open") === s).length;
      return acc;
    }, {}),
    priority: Object.keys(PRIORITY_CONFIG).reduce((acc, p) => {
      acc[p] = allVisible.filter(n => n.priority === p).length;
      return acc;
    }, {}),
  }), [allVisible]);

  const getOrgName = (orgId) => organizations.find(o => o.id === orgId)?.name || orgId || "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">Nutzer-Feedback & Support-Notizen</h2>
          <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{allVisible.length}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> CSV ({filtered.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
          </Button>
        </div>
      </div>

      {/* Status-Filter */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Status</p>
        <div className="flex flex-wrap gap-2">
          {[{ key: "all", label: "Alle", count: allVisible.length }, ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ key: k, label: v.label, count: counts.status[k] || 0 }))].map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${statusFilter === f.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
              {f.label} <span className="font-bold ml-1">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Priorität-Filter */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Priorität</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPriorityFilter("all")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${priorityFilter === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
            Alle
          </button>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
            <button key={k} onClick={() => setPriorityFilter(k)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${priorityFilter === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
              {v.label} ({counts.priority[k] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Notizen-Liste */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Keine Einträge</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(note => {
            const cfg = SEVERITY_CONFIG[note.severity] || SEVERITY_CONFIG.info;
            const Icon = cfg.icon;
            const currentStatus = note.status || "open";
            const currentPriority = note.priority || "medium";
            const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.open;
            const priorityCfg = PRIORITY_CONFIG[currentPriority] || PRIORITY_CONFIG.medium;

            return (
              <div key={note.id} className={`rounded-xl border p-4 ${cfg.bg} ${currentStatus === "resolved" ? "opacity-70" : ""}`}>
                {/* Top Row */}
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusCfg.color}`}>{statusCfg.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${priorityCfg.color}`}>{priorityCfg.label}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 leading-relaxed whitespace-pre-wrap break-words mb-2">{note.note}</p>
                      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span className="font-semibold text-slate-700">{getOrgName(note.organization_id)}</span>
                          {note.organization_id && (
                            <button onClick={() => window.open(`/platform/admin?org=${note.organization_id}`, '_self')}
                              className="ml-1 text-blue-600 hover:text-blue-700" title="Im PlatformAdmin öffnen">
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <span>von <span className="font-medium text-slate-700">{note.created_by}</span></span>
                        <span>{moment(note.created_date).format("DD.MM.YYYY HH:mm")}</span>
                        <span className="text-slate-400">{moment(note.created_date).fromNow()}</span>
                      </div>
                      {note.reviewed_by && (
                        <p className="text-xs text-slate-400 mt-1">
                          👁 Geprüft von {note.reviewed_by} {note.reviewed_at ? `am ${moment(note.reviewed_at).format("DD.MM.YYYY")}` : ""}
                        </p>
                      )}
                      {note.resolved_at && (
                        <p className="text-xs text-slate-400">✓ Erledigt am {moment(note.resolved_at).format("DD.MM.YYYY")}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {/* Status */}
                    <select value={currentStatus} onChange={e => statusMutation.mutate({ id: note.id, status: e.target.value })}
                      className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white focus:outline-none">
                      {Object.entries(STATUS_CONFIG).map(([s, c]) => <option key={s} value={s}>{c.label}</option>)}
                    </select>
                    {/* Priorität */}
                    <select value={currentPriority} onChange={e => priorityMutation.mutate({ id: note.id, priority: e.target.value })}
                      className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white focus:outline-none">
                      {Object.entries(PRIORITY_CONFIG).map(([p, c]) => <option key={p} value={p}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Interne Antwortnotiz */}
                <div className="border-t border-slate-200/60 pt-3 mt-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Interne Antwortnotiz</p>
                  <textarea rows={2}
                    value={replyEditing[note.id] ?? note.internal_reply_note ?? ""}
                    onChange={e => setReplyEditing(prev => ({ ...prev, [note.id]: e.target.value }))}
                    placeholder="Interne Notiz / nächste Aktion…"
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 resize-none bg-white/80 focus:outline-none focus:border-blue-400 text-slate-800 placeholder:text-slate-400" />
                  <button onClick={() => replyMutation.mutate({ id: note.id, reply: replyEditing[note.id] ?? note.internal_reply_note ?? "" })}
                    className="mt-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                    Antwortnotiz speichern
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