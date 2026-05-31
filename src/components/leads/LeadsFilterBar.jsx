/**
 * LeadsFilterBar – sticky Filter-Leiste für die Leads-Seite
 */
import { Search, X, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS = ["Neu", "Kontakt", "Rückruf", "Termin", "Angebot", "Gewonnen", "Verloren"];

export default function LeadsFilterBar({
  search, setSearch,
  statusFilter, setStatusFilter,
  priorityFilter, setPriorityFilter,
  sortBy, setSortBy,
  newRunFilter, setNewRunFilter,
  isFetching,
  onReset,
}) {
  const hasActiveFilters = statusFilter || priorityFilter !== "Alle" || newRunFilter || search;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
      {/* Row 1: Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          {isFetching
            ? <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 animate-spin" />
            : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          }
          <Input
            placeholder="Suche: Name, Branche, Ort, PLZ…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-white border-slate-200 placeholder:text-slate-400"
            aria-label="Leads durchsuchen"
          />
        </div>
        <Select value={sortBy} onValueChange={v => { setSortBy(v); }}>
          <SelectTrigger className="w-full sm:w-44 h-9 text-sm bg-white border-slate-200">
            <SelectValue placeholder="Sortierung" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Priorität zuerst</SelectItem>
            <SelectItem value="score">Bester Score</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="created">Neueste zuerst</SelectItem>
            <SelectItem value="last_contact">Zuletzt kontaktiert</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Row 2: Status + Temperatur + Reset */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <Select value={statusFilter || "alle_status"} onValueChange={v => { setStatusFilter(v === "alle_status" ? null : v); }}>
          <SelectTrigger className="w-32 h-8 text-xs bg-white border-slate-200">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle_status">Alle Status</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={v => { setPriorityFilter(v); }}>
          <SelectTrigger className="w-36 h-8 text-xs bg-white border-slate-200">
            <SelectValue placeholder="Temperatur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Alle">Alle Temperaturen</SelectItem>
            <SelectItem value="Hoch">🔥 Heiß</SelectItem>
            <SelectItem value="Mittel">Warm</SelectItem>
            <SelectItem value="Niedrig">Kalt</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <X className="w-3 h-3" /> Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100">
          {statusFilter && (
            <Chip label={statusFilter} color="purple" onRemove={() => setStatusFilter(null)} />
          )}
          {priorityFilter !== "Alle" && (
            <Chip label={`Temp: ${priorityFilter}`} color="orange" onRemove={() => setPriorityFilter("Alle")} />
          )}
          {newRunFilter && (
            <Chip label="Neue Leads" color="emerald" onRemove={() => setNewRunFilter(null)} />
          )}
          {search && (
            <Chip label={`Suche: ${search}`} color="slate" onRemove={() => setSearch("")} />
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, color, onRemove }) {
  const colors = {
    purple: "bg-purple-100 text-purple-700 border-purple-200",
    orange: "bg-orange-100 text-orange-700 border-orange-200",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <button
      onClick={onRemove}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colors[color] || colors.slate} hover:opacity-80 transition-opacity`}
    >
      {label} <X className="w-2.5 h-2.5" />
    </button>
  );
}