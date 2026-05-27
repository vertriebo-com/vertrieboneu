import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Mail, Copy, Check, Users, Filter } from "lucide-react";
import moment from "moment";
import { toast } from "sonner";

const STATUS_CONFIG = {
  new:       { label: "Neu",         color: "bg-blue-50 text-blue-700 border-blue-200" },
  contacted: { label: "Kontaktiert", color: "bg-amber-50 text-amber-700 border-amber-200" },
  invited:   { label: "Eingeladen",  color: "bg-purple-50 text-purple-700 border-purple-200" },
  converted: { label: "Gewonnen",    color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  archived:  { label: "Archiviert",  color: "bg-slate-50 text-slate-600 border-slate-200" },
};

const STATUS_CYCLE = { new: "contacted", contacted: "invited", invited: "converted", converted: "archived", archived: "new" };

export default function WaitlistLeadsPanel() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [copiedId, setCopiedId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteText, setNoteText] = useState("");
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["waitlist-leads"],
    queryFn: () => base44.entities.WaitlistLead.list("-created_date", 500),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WaitlistLead.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["waitlist-leads"] }),
  });

  const filtered = statusFilter === "all" ? leads : leads.filter(l => l.status === statusFilter);

  const handleCopyEmail = (lead) => {
    navigator.clipboard.writeText(lead.email);
    setCopiedId(lead.id);
    toast.success("E-Mail kopiert");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStatusCycle = (lead) => {
    const next = STATUS_CYCLE[lead.status] || "new";
    updateMutation.mutate({ id: lead.id, data: { status: next } });
  };

  const handleSaveNote = (lead) => {
    updateMutation.mutate({ id: lead.id, data: { internal_note: noteText } });
    setEditingNoteId(null);
    setNoteText("");
  };

  const counts = {};
  for (const s of Object.keys(STATUS_CONFIG)) counts[s] = leads.filter(l => l.status === s).length;

  return (
    <div className="space-y-4">
      {/* Header & Stats */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-600" />
          <h2 className="text-base font-bold text-slate-900">Interessenten ({leads.length})</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <span key={key} className={`text-[11px] font-bold px-2 py-0.5 rounded border ${cfg.color}`}>
              {cfg.label}: {counts[key] || 0}
            </span>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        {["all", ...Object.keys(STATUS_CONFIG)].map(key => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              statusFilter === key
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {key === "all" ? "Alle" : STATUS_CONFIG[key].label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium">Noch keine Interessenten eingetragen.</p>
          <p className="text-sm mt-1">Sobald sich jemand auf /landing einträgt, erscheint er hier.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Name", "E-Mail", "Firma", "Branche", "Nachricht", "Status", "Datum", "Aktionen"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => (
                  <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">{lead.name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{lead.email}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{lead.company_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{lead.industry || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[180px]">
                      {lead.message ? (
                        <span className="line-clamp-2 text-xs">{lead.message}</span>
                      ) : "—"}
                      {/* Interne Notiz */}
                      {editingNoteId === lead.id ? (
                        <div className="mt-1 flex gap-1">
                          <input
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            placeholder="Interne Notiz…"
                            className="text-xs border border-slate-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            autoFocus
                          />
                          <button onClick={() => handleSaveNote(lead)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded">✓</button>
                          <button onClick={() => setEditingNoteId(null)} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">✕</button>
                        </div>
                      ) : lead.internal_note ? (
                        <div
                          className="mt-1 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 cursor-pointer"
                          onClick={() => { setEditingNoteId(lead.id); setNoteText(lead.internal_note); }}
                        >
                          📝 {lead.internal_note}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingNoteId(lead.id); setNoteText(""); }}
                          className="mt-1 text-xs text-slate-400 hover:text-slate-600"
                        >
                          + Notiz
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleStatusCycle(lead)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded border cursor-pointer hover:opacity-80 transition-opacity ${STATUS_CONFIG[lead.status]?.color || STATUS_CONFIG.new.color}`}
                        title="Klicken um Status weiterzuschalten"
                      >
                        {STATUS_CONFIG[lead.status]?.label || lead.status}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {moment(lead.created_date).format("DD.MM.YYYY")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyEmail(lead)}
                          className="h-7 px-2 text-xs gap-1"
                          title="E-Mail kopieren"
                        >
                          {copiedId === lead.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </Button>
                        <a
                          href={`mailto:${lead.email}?subject=Vertriebo Early Access`}
                          className="inline-flex items-center h-7 px-2 text-xs gap-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                          title="E-Mail öffnen"
                        >
                          <Mail className="w-3 h-3" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}