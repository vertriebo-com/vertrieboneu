import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "../hooks/useOrganization";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  CheckCircle2,
  Clock,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PriorityBadge from "../components/PriorityBadge";
import moment from "moment";
import { toast } from "sonner";

export default function Tasks() {
  const { org, user, loading: orgLoading } = useOrganization();
  const orgId = org?.id || null;
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState("offen");
  const [page, setPage] = useState(1);
  const [pendingDone, setPendingDone] = useState(new Set());
  const PAGE_SIZE = 50;

  // Status-Mapping: UI-Filter → listTasks status
  const statusMap = { offen: "open", erledigt: "done", ueberfaellig: "overdue", heute: "today", alle: "all" };

  const { data: result, isLoading: tasksLoading, refetch } = useQuery({
    queryKey: ["tasks", orgId, page, PAGE_SIZE, filter],
    queryFn: async () => {
      const res = await base44.functions.invoke("listTasks", {
        org_id: orgId,
        page,
        page_size: PAGE_SIZE,
        status: statusMap[filter] || "all",
        sort: { field: "prioritaet", direction: "asc" },
      });
      return res?.data || { tasks: [], total: 0, has_more: false };
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const tasks = result?.tasks || [];
  const hasMore = result?.has_more || false;
  const total = result?.total || 0;

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tasks", orgId] });
  }, [queryClient, orgId]);

  const { containerRef, isRefreshing } = usePullToRefresh(refetchAll);

  // Filter-Wechsel → zurück zu Seite 1
  const handleFilterChange = (val) => { setFilter(val); setPage(1); };

  const toggleTask = async (task) => {
    const nowDone = !task.erledigt;
    // Optimistic update im Cache
    queryClient.setQueryData(["tasks", orgId, page, PAGE_SIZE, filter], (old) => {
      if (!old) return old;
      return { ...old, tasks: old.tasks.map(t => t.id === task.id ? { ...t, erledigt: nowDone } : t) };
    });
    if (nowDone) {
      setPendingDone(prev => new Set([...prev, task.id]));
      setTimeout(() => {
        setPendingDone(prev => { const n = new Set(prev); n.delete(task.id); return n; });
      }, 1500);
      toast.success("Aufgabe erledigt ✓");
    }
    await base44.functions.invoke("updateTaskSafe", { task_id: task.id, patch: { erledigt: nowDone } });
  };

  const isAdmin = user?.role === "admin";
  // Für nicht-Admins: client-seitig eigene Tasks filtern (server kann assigned_to nicht kennen ohne extra param)
  const myTasks = isAdmin ? tasks : tasks.filter(t => t.assigned_to === user?.email);

  const filtered = myTasks.filter(t => {
    if (filter === "offen") return !t.erledigt || pendingDone.has(t.id);
    return true; // Server hat bereits gefiltert
  });

  const loading = orgLoading || (tasksLoading && tasks.length === 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5" ref={containerRef}>
      {isRefreshing && (
        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground gap-2">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Aktualisieren...
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Aufgaben</h1>
          <p className="text-xs sm:text-sm font-medium text-slate-700 mt-1">
            {total > 0 ? `${total} Aufgaben` : "Keine Aufgaben"}
          </p>
        </div>
        <Select value={filter} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="offen">Offen</SelectItem>
            <SelectItem value="heute">Heute</SelectItem>
            <SelectItem value="ueberfaellig">Überfällig</SelectItem>
            <SelectItem value="erledigt">Erledigt</SelectItem>
            <SelectItem value="alle">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.map(task => {
          const isOverdue = !task.erledigt && task.faellig_am && moment(task.faellig_am).isBefore(moment());
          return (
            <div
              key={task.id}
              className={`bg-white border rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3 transition-all ${
                isOverdue ? "border-red-200 bg-red-50/50" : "border-[#E2E8F0]"
              }`}
            >
              <input
                type="checkbox"
                checked={task.erledigt}
                onChange={() => toggleTask(task)}
                className="w-4 h-4 rounded border-border mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${task.erledigt ? "line-through text-slate-400" : "text-slate-900"}`}>
                    {task.titel}
                  </p>
                  <PriorityBadge priority={task.prioritaet} />
                  <span className="text-[9px] sm:text-[10px] font-bold bg-slate-100 text-slate-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded whitespace-nowrap">{task.typ}</span>
                </div>
                {task.company_name && (
                  <Link to={`/leads/${task.company_id}`} className="text-xs font-medium text-blue-600 hover:underline mt-1 block truncate">
                    {task.company_name}
                  </Link>
                )}
                {task.faellig_am && (
                  <div className="flex items-center gap-1 mt-1.5 sm:mt-2 flex-wrap">
                    {isOverdue ? (
                      <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                    <span className={`text-xs font-medium ${isOverdue ? "text-red-600" : "text-slate-600"}`}>
                      {moment(task.faellig_am).format("DD.MM. HH:mm")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && !tasksLoading && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl text-center py-16">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-900">Alle Aufgaben erledigt!</p>
            <p className="text-xs font-medium text-slate-700 mt-1">Keine ausstehenden Aufgaben</p>
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={tasksLoading}
              className="px-5 py-2.5 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-300 rounded-xl hover:bg-blue-50 disabled:opacity-50"
            >
              {tasksLoading ? "Wird geladen…" : `Weitere ${PAGE_SIZE} laden`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}