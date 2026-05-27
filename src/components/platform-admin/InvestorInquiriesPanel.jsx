import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Copy, Mail, ChevronDown } from "lucide-react";

const STATUS_CONFIG = {
  new:       { label: "Neu",           bg: "bg-blue-100",   text: "text-blue-800" },
  contacted: { label: "Kontaktiert",   bg: "bg-yellow-100", text: "text-yellow-800" },
  in_talks:  { label: "Im Gespräch",   bg: "bg-purple-100", text: "text-purple-800" },
  closed:    { label: "Abgeschlossen", bg: "bg-green-100",  text: "text-green-800" },
  archived:  { label: "Archiviert",    bg: "bg-slate-100",  text: "text-slate-600" },
};

const STATUS_ORDER = ["new", "contacted", "in_talks", "closed", "archived"];

export default function InvestorInquiriesPanel() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [noteEditing, setNoteEditing] = useState({});
  const queryClient = useQueryClient();

  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ["investor-inquiries"],
    queryFn: () => base44.entities.InvestorInquiry.list("-created_date", 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.InvestorInquiry.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["investor-inquiries"] }),
  });

  const filtered = statusFilter === "all" ? inquiries : inquiries.filter(i => i.status === statusFilter);

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = inquiries.filter(i => i.status === s).length;
    return acc;
  }, {});

  const handleStatusChange = (id, status) => {
    updateMutation.mutate({ id, data: { status } });
    toast.success("Status aktualisiert");
  };

  const handleSaveNote = (id) => {
    const note = noteEditing[id] ?? "";
    updateMutation.mutate({ id, data: { internal_note: note } });
    toast.success("Notiz gespeichert");
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {STATUS_ORDER.map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`text-center p-3 rounded-xl border transition-all ${statusFilter === s ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            >
              <p className="text-xl font-bold text-slate-900">{counts[s]}</p>
              <p className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ${cfg.bg} ${cfg.text}`}>{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{filtered.length} Anfrage{filtered.length !== 1 ? "n" : ""} {statusFilter !== "all" ? `· ${STATUS_CONFIG[statusFilter]?.label}` : ""}</p>
        {statusFilter !== "all" && <button onClick={() => setStatusFilter("all")} className="text-xs text-blue-600 hover:underline">Alle anzeigen</button>}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">Keine Anfragen in dieser Kategorie.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inquiry => {
            const cfg = STATUS_CONFIG[inquiry.status] || STATUS_CONFIG.new;
            const isExpanded = expandedId === inquiry.id;
            return (
              <div key={inquiry.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpandedId(isExpanded ? null : inquiry.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900">{inquiry.name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{inquiry.role}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {inquiry.email}
                      {inquiry.company_name ? ` · ${inquiry.company_name}` : ""}
                      {inquiry.created_date ? ` · ${new Date(inquiry.created_date).toLocaleDateString("de-DE")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(inquiry.email); toast.success("E-Mail kopiert"); }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      title="E-Mail kopieren"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={`mailto:${inquiry.email}`}
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                      title="E-Mail öffnen"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
                    {inquiry.message && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nachricht</p>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3">{inquiry.message}</p>
                      </div>
                    )}

                    {/* Status change */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Status ändern</p>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_ORDER.map(s => {
                          const c = STATUS_CONFIG[s];
                          return (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(inquiry.id, s)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${inquiry.status === s ? `${c.bg} ${c.text} border-transparent` : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Internal note */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Interne Notiz</p>
                      <textarea
                        rows={2}
                        value={noteEditing[inquiry.id] ?? inquiry.internal_note ?? ""}
                        onChange={e => setNoteEditing(prev => ({ ...prev, [inquiry.id]: e.target.value }))}
                        placeholder="Notiz hinzufügen…"
                        className="w-full text-sm border border-slate-200 rounded-lg p-2.5 resize-none bg-white focus:outline-none focus:border-blue-400 text-slate-800 placeholder:text-slate-400"
                      />
                      <button
                        onClick={() => handleSaveNote(inquiry.id)}
                        className="mt-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        Notiz speichern
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}