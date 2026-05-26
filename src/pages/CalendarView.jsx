import { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { useLeadsFilter } from "../hooks/useLeadsFilter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Calendar, Plus,
  Clock, Building2, CheckCircle2, X,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";
import "moment/locale/de";
import AddTaskDialog from "@/components/AddTaskDialog";
import { toast } from "sonner";
moment.locale("de");

const DAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const TASK_CONFIG = {
  "Rückruf":          { color: "bg-amber-100 text-amber-800 border-amber-300",  dot: "bg-amber-400",  icon: "📞" },
  "Termin":           { color: "bg-purple-100 text-purple-800 border-purple-300", dot: "bg-purple-500", icon: "📅" },
  "Angebot erstellen":{ color: "bg-blue-100 text-blue-800 border-blue-300",    dot: "bg-blue-500",   icon: "📄" },
  "Nachfassen":       { color: "bg-orange-100 text-orange-800 border-orange-300",dot: "bg-orange-400", icon: "🔄" },
  "Sonstiges":        { color: "bg-slate-100 text-slate-700 border-slate-300",  dot: "bg-slate-400",  icon: "✓"  },
};

function TaskPill({ task, onToggle }) {
  const cfg = TASK_CONFIG[task.typ] || TASK_CONFIG["Sonstiges"];
  const isOverdue = !task.erledigt && task.faellig_am && moment(task.faellig_am).isBefore(moment(), "day");

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 border text-[11px] font-medium
        ${task.erledigt
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 line-through opacity-60"
          : isOverdue
            ? "bg-red-50 text-red-700 border-red-200"
            : cfg.color
        }`}
    >
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(task); }}
        className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full border-[1.5px] hover:scale-110 transition-transform"
        style={{ borderColor: task.erledigt ? "#059669" : isOverdue ? "#dc2626" : "currentColor" }}
      >
        {task.erledigt && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
      </button>
      <span className="truncate flex-1">{task.titel}</span>
      {isOverdue && !task.erledigt && <AlertCircle className="w-3 h-3 shrink-0 opacity-70" />}
    </div>
  );
}

function DayDetailSheet({ day, tasks, onClose, onToggle, onAddTask, isMobile }) {
  if (!day) return null;
  const isToday = day.isSame(moment(), "day");
  const isOverdue = day.isBefore(moment(), "day");
  const pendingCount = tasks.filter(t => !t.erledigt).length;
  const doneCount = tasks.filter(t => t.erledigt).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed z-50 bg-white shadow-2xl
        ${isMobile
          ? "bottom-0 left-0 right-0 rounded-t-2xl max-h-[80vh] overflow-y-auto"
          : "top-0 right-0 bottom-0 w-80 overflow-y-auto"
        }`}
      >
        {/* Handle (mobile only) */}
        {isMobile && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-300" />
          </div>
        )}

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-100
          ${isToday ? "bg-blue-50" : isOverdue ? "bg-red-50" : "bg-slate-50"}`}
        >
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {day.format("dddd")}
            </p>
            <p className={`text-xl font-bold ${isToday ? "text-blue-700" : "text-slate-900"}`}>
              {day.format("D. MMMM YYYY")}
            </p>
            {tasks.length > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">
                {pendingCount > 0 && `${pendingCount} offen`}
                {pendingCount > 0 && doneCount > 0 && " · "}
                {doneCount > 0 && `${doneCount} erledigt`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-black/10 transition-colors">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Tasks */}
        <div className="p-4 space-y-2">
          {tasks.length === 0 ? (
            <div className="text-center py-10">
              <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium text-slate-500">Keine Aufgaben</p>
              <p className="text-xs text-slate-400 mt-1">Klicke auf + um eine Aufgabe hinzuzufügen</p>
            </div>
          ) : (
            tasks.map(task => {
              const cfg = TASK_CONFIG[task.typ] || TASK_CONFIG["Sonstiges"];
              const isOverdueTask = !task.erledigt && task.faellig_am && moment(task.faellig_am).isBefore(moment(), "day");
              return (
                <Link
                  key={task.id}
                  to={task.company_id ? `/leads/${task.company_id}` : "/tasks"}
                  onClick={onClose}
                  className={`flex items-start gap-3 rounded-xl border p-3 hover:shadow-sm transition-all
                    ${task.erledigt
                      ? "bg-emerald-50 border-emerald-200 opacity-70"
                      : isOverdueTask
                        ? "bg-red-50 border-red-200"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                >
                  {/* Toggle button */}
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(task); }}
                    className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110
                      ${task.erledigt ? "bg-emerald-500 border-emerald-500" : isOverdueTask ? "border-red-400 hover:bg-red-50" : "border-slate-300 hover:border-blue-400"}`}
                  >
                    {task.erledigt && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${task.erledigt ? "line-through text-slate-400" : "text-slate-900"}`}>
                      {task.titel}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.color}`}>
                        {cfg.icon} {task.typ}
                      </span>
                      {task.company_name && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Building2 className="w-3 h-3" /> {task.company_name}
                        </span>
                      )}
                      {task.faellig_am && (
                        <span className={`flex items-center gap-0.5 text-[11px] ${isOverdueTask ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                          <Clock className="w-3 h-3" />
                          {moment(task.faellig_am).format("HH:mm")} Uhr
                        </span>
                      )}
                    </div>
                    {task.prioritaet === "Hoch" && !task.erledigt && (
                      <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                        🔥 Hoch
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Add Task Button */}
        <div className="px-4 pb-6">
          <Button
            onClick={() => onAddTask(day)}
            variant="outline"
            className="w-full gap-2 h-10 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400"
          >
            <Plus className="w-4 h-4" /> Aufgabe hinzufügen
          </Button>
        </div>
      </div>
    </>
  );
}

export default function CalendarView() {
  const { user, loading: filterLoading, org } = useLeadsFilter();
  const orgId = org?.id || null;
  const queryClient = useQueryClient();

  const [view, setView]               = useState("week");
  const [weekOffset, setWeekOffset]   = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [isMobile, setIsMobile]       = useState(window.innerWidth < 768);

  // New task dialog
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDate, setAddTaskDate] = useState(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Sichtbaren Datumsbereich berechnen ───────────────────────────────────────
  const startOfWeek   = moment().startOf("isoWeek").add(weekOffset, "weeks");
  const currentMonth  = moment().startOf("month").add(monthOffset, "months");

  // Lade-Bereich: für Woche ±1 Woche, für Monat ±1 Monat (Buffer für smooth navigation)
  const dateFrom = useMemo(() => {
    if (view === "week") return startOfWeek.clone().subtract(1, "week").toISOString();
    return currentMonth.clone().subtract(1, "month").startOf("isoWeek").toISOString();
  }, [view, weekOffset, monthOffset]);

  const dateTo = useMemo(() => {
    if (view === "week") return startOfWeek.clone().add(2, "weeks").endOf("isoWeek").toISOString();
    return currentMonth.clone().add(1, "month").endOf("month").endOf("isoWeek").toISOString();
  }, [view, weekOffset, monthOffset]);

  // ── React Query: listTasks mit date-range ────────────────────────────────────
  const { data: tasksResult, isLoading: tasksLoading, refetch } = useQuery({
    queryKey: ["calendar-tasks", orgId, dateFrom, dateTo],
    queryFn: async () => {
      const res = await base44.functions.invoke("listTasks", {
        org_id: orgId,
        page: 1,
        page_size: 100,
        date_from: dateFrom,
        date_to: dateTo,
        status: "all",
      });
      return res?.data || { tasks: [] };
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const tasks = tasksResult?.tasks || [];

  // ── Optimistic Toggle mit Org-Guard ──────────────────────────────────────────
  const handleToggleTask = async (task) => {
    if (task.organization_id && task.organization_id !== orgId) {
      toast.error("Org-Kontext stimmt nicht überein – Aktion abgebrochen");
      return;
    }
    const updated = { erledigt: !task.erledigt };
    await base44.entities.Task.update(task.id, updated);
    // Optimistic update im Query-Cache
    queryClient.setQueryData(["calendar-tasks", orgId, dateFrom, dateTo], (old) => {
      if (!old) return old;
      return { ...old, tasks: old.tasks.map(t => t.id === task.id ? { ...t, ...updated } : t) };
    });
    toast.success(updated.erledigt ? "Aufgabe erledigt ✓" : "Aufgabe wieder geöffnet");
  };

  const myTasks = user?.role === "admin" ? tasks : tasks.filter(t => t.assigned_to === user?.email);

  // useMemo: Tasks nach Tag indexieren (vermeidet O(n×35) Iteration pro Render)
  const tasksByDay = useMemo(() => {
    const map = {};
    for (const t of myTasks) {
      if (!t.faellig_am) continue;
      const ds = moment(t.faellig_am).format("YYYY-MM-DD");
      if (!map[ds]) map[ds] = [];
      map[ds].push(t);
    }
    return map;
  }, [myTasks]);

  const getTasksForDay = useCallback((day) => {
    return tasksByDay[day.format("YYYY-MM-DD")] || [];
  }, [tasksByDay]);

  const weekDays = Array.from({ length: 7 }, (_, i) => startOfWeek.clone().add(i, "days"));

  const startOfMonthGrid = currentMonth.clone().startOf("isoWeek");
  const endOfMonthGrid   = currentMonth.clone().endOf("month").endOf("isoWeek");
  const monthDays = [];
  let cursor = startOfMonthGrid.clone();
  while (cursor.isSameOrBefore(endOfMonthGrid, "day")) {
    monthDays.push(cursor.clone());
    cursor.add(1, "day");
  }

  const selectedDayTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  const totalOverdue = useMemo(() =>
    myTasks.filter(t => !t.erledigt && t.faellig_am && moment(t.faellig_am).isBefore(moment(), "day")).length,
    [myTasks]
  );
  const totalToday = getTasksForDay(moment()).length;

  const loading = tasksLoading || filterLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 md:pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900">
            <Calendar className="w-6 h-6 text-blue-600" /> Kalender
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {view === "week"
              ? `KW ${startOfWeek.isoWeek()} · ${startOfWeek.format("D. MMM")} – ${startOfWeek.clone().add(6, "days").format("D. MMM YYYY")}`
              : currentMonth.format("MMMM YYYY")}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Stats chips */}
          {totalToday > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
              <Clock className="w-3 h-3" /> {totalToday} heute
            </span>
          )}
          {totalOverdue > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full">
              <AlertCircle className="w-3 h-3" /> {totalOverdue} überfällig
            </span>
          )}

          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold bg-white shadow-sm">
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 transition-colors ${view === "week" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >Woche</button>
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 transition-colors ${view === "month" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >Monat</button>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => view === "week" ? setWeekOffset(v => v - 1) : setMonthOffset(v => v - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => { setWeekOffset(0); setMonthOffset(0); setSelectedDay(null); }}>
              Heute
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => view === "week" ? setWeekOffset(v => v + 1) : setMonthOffset(v => v + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button size="sm" className="h-8 gap-1.5"
            onClick={() => { setAddTaskDate(null); setShowAddTask(true); }}>
            <Plus className="w-3.5 h-3.5" /> Aufgabe
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7">
        {DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      {view === "week" ? (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((day, i) => {
            const isToday    = day.isSame(moment(), "day");
            const isSelected = selectedDay?.isSame(day, "day");
            const isPast     = day.isBefore(moment(), "day");
            const items      = getTasksForDay(day);
            const overdueItems = items.filter(t => !t.erledigt && isPast);
            const pendingItems = items.filter(t => !t.erledigt && !isPast);
            const doneItems  = items.filter(t => t.erledigt);

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`rounded-xl border text-left min-h-[110px] sm:min-h-[140px] flex flex-col transition-all duration-150 group
                  ${isSelected ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50 shadow-sm" :
                    isToday   ? "border-blue-400 bg-blue-50 shadow-sm" :
                    isPast && items.length > 0 ? "border-red-200 bg-red-50/30" :
                    isPast    ? "border-slate-200 bg-slate-50/50 opacity-60" :
                               "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"}`}
              >
                {/* Day number header */}
                <div className={`px-2 pt-2 pb-1.5 flex items-center justify-between`}>
                  <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold transition-colors
                    ${isToday ? "bg-blue-600 text-white shadow-sm" :
                      isSelected ? "bg-blue-100 text-blue-700" :
                      "text-slate-700 group-hover:text-blue-600"}`}>
                    {day.format("D")}
                  </div>
                  {items.length > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                      ${overdueItems.length > 0 && !isToday ? "bg-red-100 text-red-700" :
                        isToday ? "bg-blue-100 text-blue-700" :
                        "bg-slate-100 text-slate-500"}`}>
                      {items.length}
                    </span>
                  )}
                </div>

                {/* Task pills - desktop shows more */}
                <div className="flex-1 px-1.5 pb-1.5 space-y-0.5 overflow-hidden">
                  {items.slice(0, isMobile ? 2 : 3).map(task => {
                    const cfg = TASK_CONFIG[task.typ] || TASK_CONFIG["Sonstiges"];
                    const isOverdueTask = !task.erledigt && isPast;
                    return (
                      <div
                        key={task.id}
                        className={`text-[10px] rounded px-1.5 py-0.5 truncate border font-medium
                          ${task.erledigt ? "bg-emerald-50 text-emerald-600 border-emerald-200 line-through" :
                            isOverdueTask ? "bg-red-100 text-red-700 border-red-200" :
                            cfg.color}`}
                        title={task.titel}
                      >
                        {task.titel}
                      </div>
                    );
                  })}
                  {items.length > (isMobile ? 2 : 3) && (
                    <p className="text-[9px] text-slate-400 px-1 font-medium">+{items.length - (isMobile ? 2 : 3)} mehr</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* Month View */
        <div className="grid grid-cols-7 gap-1">
          {monthDays.map((day, i) => {
            const isToday     = day.isSame(moment(), "day");
            const isSelected  = selectedDay?.isSame(day, "day");
            const isThisMonth = day.isSame(currentMonth, "month");
            const isPast      = day.isBefore(moment(), "day");
            const items       = getTasksForDay(day);
            const hasOverdue  = items.some(t => !t.erledigt && isPast);

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`rounded-lg border text-left min-h-[60px] sm:min-h-[80px] flex flex-col p-1.5 transition-all
                  ${isSelected ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50" :
                    isToday   ? "border-blue-400 bg-blue-50" :
                    !isThisMonth ? "border-slate-100 bg-slate-50/30 opacity-40" :
                    hasOverdue   ? "border-red-200 bg-red-50/20" :
                                  "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"}`}
              >
                <div className={`text-xs font-bold mb-1
                  ${isToday ? "text-blue-600" :
                    isThisMonth ? "text-slate-700" : "text-slate-400"}`}>
                  {day.format("D")}
                </div>
                {/* Dot indicators */}
                <div className="flex flex-wrap gap-0.5">
                  {items.slice(0, 4).map(task => {
                    const cfg = TASK_CONFIG[task.typ] || TASK_CONFIG["Sonstiges"];
                    const isOverdueTask = !task.erledigt && isPast;
                    return (
                      <span
                        key={task.id}
                        className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full
                          ${task.erledigt ? "bg-emerald-400" :
                            isOverdueTask ? "bg-red-400" :
                            cfg.dot}`}
                        title={task.titel}
                      />
                    );
                  })}
                  {items.length > 4 && (
                    <span className="text-[8px] text-slate-400 font-medium">+{items.length - 4}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 pt-1">
        {Object.entries(TASK_CONFIG).map(([typ, cfg]) => (
          <span key={typ} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${cfg.color}`}>
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            {typ}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
          <span className="w-2 h-2 rounded-full bg-red-400" /> Überfällig
        </span>
        <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> Erledigt
        </span>
      </div>

      {/* Day Detail Sheet */}
      <DayDetailSheet
        day={selectedDay}
        tasks={selectedDayTasks}
        onClose={() => setSelectedDay(null)}
        onToggle={handleToggleTask}
        onAddTask={(day) => {
          const dateStr = day.format("YYYY-MM-DDTHH:mm");
          setAddTaskDate(dateStr);
          setShowAddTask(true);
        }}
        isMobile={isMobile}
      />

      {/* Add Task Dialog */}
      <AddTaskDialog
        open={showAddTask}
        onClose={() => setShowAddTask(false)}
        onCreated={() => refetch()}
        organizationId={orgId}
        initialData={addTaskDate ? { faellig_am: addTaskDate } : undefined}
      />
    </div>
  );
}