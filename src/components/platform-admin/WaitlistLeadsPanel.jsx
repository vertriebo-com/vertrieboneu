import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Copy, Check, Mail, Phone, Download, Users, Search, Building2 } from "lucide-react";
import moment from "moment";
import { toast } from "sonner";

const STATUS_CONFIG = {
  new:          { label: "Neu",           color: "bg-blue-50 text-blue-700 border-blue-200" },
  contacted:    { label: "Kontaktiert",   color: "bg-amber-50 text-amber-700 border-amber-200" },
  demo_geplant: { label: "Demo geplant", color: "bg-purple-50 text-purple-700 border-purple-200" },
  onboarded:    { label: "Onboarded",    color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  abgelehnt:    { label: "Abgelehnt",    color: "bg-red-50 text-red-700 border-red-200" },
};

function exportCSV(leads) {
  const header = ["Datum","Name","E-Mail","Telefon","Firma","Branche","Status","Quellseite","Einwilligung","Notiz"];
  const rows = leads.map(l => [
    moment(l.created_date).format("DD.MM.YYYY"),
    l.name || "",
    l.email || "",
    l.phone || "",
    l.company_name || "",
    l.industry || "",
    l.status || "",
    l.source_page || "",
    l.consent_accepted ? "Ja" : "Nein",
    (l.internal_note || "").replace(/\n/g, " "),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "waitlist.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function WaitlistLeadsPanel() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [convertDialog, setConvertDialog] = useState(null);
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["waitlist-leads"],
    queryFn: () => base44.entities.WaitlistLead.list("-created_date", 500),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.functions.invoke("adminCrmActions", {
      action: "updateWaitlistLeadStatus", target_id: id, status,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["waitlist-leads"] }); toast.success("Status aktualisiert"); },
    onError: e => toast.error("Fehler: " + e.message),
  });

  const noteMutation = useMutation({
    mutationFn: ({ id, note }) => base44.functions.invoke("adminCrmActions", {
      action: "updateWaitlistLeadNote", target_id: id, internal_note: note,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["waitlist-leads"] }); setEditingNoteId(null); toast.success("Notiz gespeichert"); },
    onError: e => toast.error("Fehler: " + e.message),
  });

  const filtered = useMemo(() => {
    let list = leads;
    if (statusFilter !== "all") list = list.filter(l => l.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        (l.name || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.company_name || "").toLowerCase().includes(q) ||
        (l.industry || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [leads, statusFilter, search]);

  const counts = useMemo(() => {
    const c = {};
    for (const s of Object.keys(STATUS_CONFIG)) c[s] = leads.filter(l => l.status === s).length;
    return c;
  }, [leads]);

  const copy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Kopiert");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-600" />
          <h2 className="text-base font-bold text-slate-900">Interessenten ({leads.length})</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> CSV Export ({filtered.length})
        </Button>
      </div>

      {/* Status Chips */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatusFilter("all")}
          className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${statusFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
          Alle ({leads.length})
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${statusFilter === key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            {cfg.label} ({counts[key] || 0})
          </button>
        ))}
      </div>

      {/* Suche */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Name, Firma, E-Mail, Branche suchen…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>

      {/* Tabelle */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Keine Einträge gefunden.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Name / Firma","Kontakt","Branche","Status","Notiz","Datum","Aktionen"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => (
                  <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    {/* Name / Firma */}
                    <td className="px-3 py-3 min-w-[140px]">
                      <p className="font-semibold text-slate-900">{lead.name || "—"}</p>
                      {lead.company_name && <p className="text-xs text-slate-500 flex items-center gap-1"><Building2 className="w-3 h-3" />{lead.company_name}</p>}
                    </td>

                    {/* Kontakt */}
                    <td className="px-3 py-3 min-w-[160px]">
                      <p className="text-slate-700 text-xs">{lead.email}</p>
                      {lead.phone && <p className="text-slate-500 text-xs">{lead.phone}</p>}
                    </td>

                    {/* Branche */}
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{lead.industry || "—"}</td>

                    {/* Status */}
                    <td className="px-3 py-3">
                      <select
                        value={lead.status || "new"}
                        onChange={e => statusMutation.mutate({ id: lead.id, status: e.target.value })}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded border cursor-pointer focus:outline-none ${STATUS_CONFIG[lead.status]?.color || STATUS_CONFIG.new.color}`}
                      >
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Notiz */}
                    <td className="px-3 py-3 max-w-[180px]">
                      {editingNoteId === lead.id ? (
                        <div className="flex gap-1">
                          <input value={noteText} onChange={e => setNoteText(e.target.value)} autoFocus
                            className="text-xs border border-slate-300 rounded px-2 py-1 flex-1 focus:outline-none"
                            placeholder="Interne Notiz…" />
                          <button onClick={() => noteMutation.mutate({ id: lead.id, note: noteText })}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded">✓</button>
                          <button onClick={() => setEditingNoteId(null)}
                            className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded">✕</button>
                        </div>
                      ) : (
                        <div onClick={() => { setEditingNoteId(lead.id); setNoteText(lead.internal_note || ""); }}
                          className="cursor-pointer text-xs min-h-[20px]">
                          {lead.internal_note
                            ? <span className="text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 line-clamp-2">📝 {lead.internal_note}</span>
                            : <span className="text-slate-400 hover:text-slate-600">+ Notiz</span>}
                        </div>
                      )}
                    </td>

                    {/* Datum */}
                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {moment(lead.created_date).format("DD.MM.YYYY")}
                      {lead.contacted_at && <p className="text-slate-400">📞 {moment(lead.contacted_at).format("DD.MM")}</p>}
                    </td>

                    {/* Aktionen */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => copy(lead.email, lead.id + "_email")}
                          title="E-Mail kopieren"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                          {copiedId === lead.id + "_email" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Mail className="w-3.5 h-3.5" />}
                        </button>
                        {lead.phone && (
                          <button onClick={() => copy(lead.phone, lead.id + "_phone")}
                            title="Telefon kopieren"
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
                            {copiedId === lead.id + "_phone" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Phone className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button onClick={() => setConvertDialog(lead)}
                          title="In Organisation umwandeln"
                          className="text-[10px] font-semibold px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 whitespace-nowrap">
                          Umwandeln →
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Umwandeln-Dialog (vorbereitet, kein Auto-Create) */}
      {convertDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">In Organisation umwandeln</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">⚠️ Vorbereitung: Phase B</p>
              <p>Die automatische Org-Erstellung ist noch nicht aktiviert. Bitte Nutzer manuell einladen:</p>
              <div className="mt-2 space-y-1 text-xs">
                <p><strong>Name:</strong> {convertDialog.name}</p>
                <p><strong>E-Mail:</strong> {convertDialog.email}</p>
                <p><strong>Firma:</strong> {convertDialog.company_name || "—"}</p>
                <p><strong>Branche:</strong> {convertDialog.industry || "—"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(convertDialog.email); toast.success("E-Mail kopiert"); }}
                className="flex-1 text-sm border border-slate-300 rounded-lg py-2 hover:bg-slate-50">
                E-Mail kopieren
              </button>
              <button onClick={() => setConvertDialog(null)}
                className="flex-1 text-sm bg-slate-800 text-white rounded-lg py-2 hover:bg-slate-900">
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}