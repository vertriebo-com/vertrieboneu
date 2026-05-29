import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Copy, Check, Mail, Download, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

const STATUS_CONFIG = {
  new:        { label: "Neu",          color: "bg-blue-50 text-blue-700 border-blue-200" },
  geprueft:   { label: "Geprüft",      color: "bg-slate-100 text-slate-700 border-slate-200" },
  contacted:  { label: "Kontaktiert",  color: "bg-amber-50 text-amber-700 border-amber-200" },
  gespraech:  { label: "Gespräch",     color: "bg-purple-50 text-purple-700 border-purple-200" },
  abgelehnt:  { label: "Abgelehnt",   color: "bg-red-50 text-red-700 border-red-200" },
};

function exportCSV(items) {
  const header = ["Datum","Name","E-Mail","Firma","Rolle","Status","Quellseite","Notiz"];
  const rows = items.map(i => [
    moment(i.created_date).format("DD.MM.YYYY"),
    i.name || "",
    i.email || "",
    i.company_name || "",
    i.role || "",
    i.status || "",
    i.source_page || "",
    (i.internal_note || "").replace(/\n/g, " "),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "investoren.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function InvestorInquiriesPanel() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [noteEditing, setNoteEditing] = useState({});
  const [copied, setCopied] = useState(null);
  const queryClient = useQueryClient();

  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ["investor-inquiries"],
    queryFn: () => base44.entities.InvestorInquiry.list("-created_date", 200),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.functions.invoke("adminCrmActions", {
      action: "updateInvestorInquiryStatus", target_id: id, status,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investor-inquiries"] }); toast.success("Status aktualisiert"); },
    onError: e => toast.error("Fehler: " + e.message),
  });

  const noteMutation = useMutation({
    mutationFn: ({ id, note }) => base44.functions.invoke("adminCrmActions", {
      action: "updateInvestorInquiryNote", target_id: id, internal_note: note,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investor-inquiries"] }); toast.success("Notiz gespeichert"); },
    onError: e => toast.error("Fehler: " + e.message),
  });

  const filtered = useMemo(() => {
    let list = inquiries;
    if (statusFilter !== "all") list = list.filter(i => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.email || "").toLowerCase().includes(q) ||
        (i.company_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [inquiries, statusFilter, search]);

  const counts = useMemo(() => {
    const c = {};
    for (const s of Object.keys(STATUS_CONFIG)) c[s] = inquiries.filter(i => i.status === s).length;
    return c;
  }, [inquiries]);

  const copy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success("E-Mail kopiert");
    setTimeout(() => setCopied(null), 2000);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-slate-900">Investoren-Anfragen ({inquiries.length})</h2>
        <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> CSV Export ({filtered.length})
        </Button>
      </div>

      {/* Status Chips */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <button onClick={() => setStatusFilter("all")}
          className={`text-center py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${statusFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
          Alle<br /><span className="font-bold text-sm">{inquiries.length}</span>
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`text-center py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${statusFilter === key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {cfg.label}<br /><span className="font-bold text-sm">{counts[key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Suche */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Name, Firma, E-Mail suchen…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">Keine Anfragen gefunden.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inquiry => {
            const cfg = STATUS_CONFIG[inquiry.status] || STATUS_CONFIG.new;
            const isExpanded = expandedId === inquiry.id;
            return (
              <div key={inquiry.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpandedId(isExpanded ? null : inquiry.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900">{inquiry.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{inquiry.role}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {inquiry.email}
                      {inquiry.company_name ? ` · ${inquiry.company_name}` : ""}
                      {" · " + moment(inquiry.created_date).format("DD.MM.YYYY")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); copy(inquiry.email, inquiry.id); }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="E-Mail kopieren">
                      {copied === inquiry.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <a href={`mailto:${inquiry.email}`} onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="E-Mail öffnen">
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {/* Detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
                    {inquiry.message && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Nachricht</p>
                        <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-3 whitespace-pre-wrap">{inquiry.message}</p>
                      </div>
                    )}

                    {/* Status */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-2">Status ändern</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(STATUS_CONFIG).map(([s, c]) => (
                          <button key={s} onClick={() => statusMutation.mutate({ id: inquiry.id, status: s })}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${inquiry.status === s ? `${c.color}` : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Meeting-Datum Info */}
                    {inquiry.contacted_at && (
                      <p className="text-xs text-slate-500">📞 Kontaktiert am {moment(inquiry.contacted_at).format("DD.MM.YYYY HH:mm")}</p>
                    )}
                    {inquiry.meeting_date && (
                      <p className="text-xs text-slate-500">📅 Meeting: {moment(inquiry.meeting_date).format("DD.MM.YYYY HH:mm")}</p>
                    )}
                    {inquiry.handled_by && (
                      <p className="text-xs text-slate-500">👤 Bearbeitet von: {inquiry.handled_by}</p>
                    )}

                    {/* Interne Notiz */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-2">Interne Notiz</p>
                      <textarea rows={2}
                        value={noteEditing[inquiry.id] ?? inquiry.internal_note ?? ""}
                        onChange={e => setNoteEditing(prev => ({ ...prev, [inquiry.id]: e.target.value }))}
                        placeholder="Notiz hinzufügen…"
                        className="w-full text-sm border border-slate-200 rounded-lg p-2.5 resize-none bg-white focus:outline-none focus:border-blue-400 text-slate-800 placeholder:text-slate-400" />
                      <button onClick={() => noteMutation.mutate({ id: inquiry.id, note: noteEditing[inquiry.id] ?? inquiry.internal_note ?? "" })}
                        className="mt-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700">
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