/**
 * OpportunitySection
 * ==================
 * Kompakter Verkaufschancen-Block im LeadDetail.
 * Zeigt Opportunities, ermöglicht Erstellen und Stage-Wechsel.
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Plus, ChevronDown, CheckCircle2, XCircle, Loader2, Euro } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

const STAGE_LABELS = {
  new: "Neu",
  contacted: "Kontaktiert",
  qualified: "Qualifiziert",
  offer_planned: "Angebot geplant",
  offer_sent: "Angebot gesendet",
  negotiation: "Verhandlung",
  won: "Gewonnen",
  lost: "Verloren",
};

const STAGE_COLORS = {
  new: "bg-slate-100 text-slate-600 border-slate-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  qualified: "bg-violet-50 text-violet-700 border-violet-200",
  offer_planned: "bg-amber-50 text-amber-700 border-amber-200",
  offer_sent: "bg-orange-50 text-orange-700 border-orange-200",
  negotiation: "bg-yellow-50 text-yellow-700 border-yellow-200",
  won: "bg-emerald-50 text-emerald-700 border-emerald-200",
  lost: "bg-red-50 text-red-600 border-red-200",
};

const VALID_STAGES = Object.keys(STAGE_LABELS);

function formatCurrency(value) {
  if (!value && value !== 0) return null;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

// ── Create Dialog ─────────────────────────────────────────────────────────────
function CreateOpportunityDialog({ open, onClose, companyId, organizationId, onCreated }) {
  const [form, setForm] = useState({ title: "", stage: "new", value: "", probability: "", expected_close_date: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Titel fehlt."); return; }
    setSaving(true);
    const res = await base44.functions.invoke("createOpportunity", {
      org_id: organizationId,
      company_id: companyId,
      title: form.title.trim(),
      stage: form.stage,
      value: form.value ? Number(form.value) : undefined,
      probability: form.probability ? Number(form.probability) : undefined,
      expected_close_date: form.expected_close_date || undefined,
      notes: form.notes || undefined,
    });
    setSaving(false);
    if (res.data?.error) { toast.error("Fehler: " + res.data.error); return; }
    toast.success("Opportunity erstellt");
    onCreated?.();
    onClose();
    setForm({ title: "", stage: "new", value: "", probability: "", expected_close_date: "", notes: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" /> Opportunity erstellen
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Titel *</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="z.B. Angebot Gebäudereinigung Q3 2026"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Stage</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.stage}
                onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
              >
                {VALID_STAGES.filter(s => s !== 'won' && s !== 'lost').map(s => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Wert (EUR)</label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Wahrscheinlichkeit (%)</label>
              <input
                type="number"
                min="0" max="100"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="50"
                value={form.probability}
                onChange={e => setForm(f => ({ ...f, probability: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Geplanter Abschluss</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.expected_close_date}
                onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Notizen</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Interne Notizen zum Deal…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? "Erstellt…" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Stage-Change-Row ──────────────────────────────────────────────────────────
function OpportunityCard({ opp, organizationId, onChanged }) {
  const [updating, setUpdating] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  const handleStageChange = async (newStage) => {
    if (newStage === opp.stage) return;
    if ((newStage === 'won' || newStage === 'lost') && !showReason) {
      setShowReason(true);
      return;
    }
    await doUpdate(newStage);
  };

  const doUpdate = async (newStage) => {
    setUpdating(true);
    setShowReason(false);
    const res = await base44.functions.invoke("updateOpportunityStage", {
      org_id: organizationId,
      opportunity_id: opp.id,
      stage: newStage,
      won_lost_reason: reason || undefined,
    });
    setUpdating(false);
    setReason("");
    if (res.data?.error) { toast.error("Fehler: " + res.data.error); return; }
    toast.success(`Stage: ${STAGE_LABELS[newStage]}`);
    onChanged?.();
  };

  const isTerminal = opp.status === 'won' || opp.status === 'lost';
  const isOverdue = opp.expected_close_date && moment(opp.expected_close_date).isBefore(moment()) && !isTerminal;

  return (
    <div className={`rounded-lg border p-3 ${isTerminal ? (opp.status === 'won' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200') : 'bg-white border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{opp.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STAGE_COLORS[opp.stage]}`}>
              {STAGE_LABELS[opp.stage]}
            </span>
            {opp.value > 0 && (
              <span className="text-[10px] font-semibold text-slate-600 flex items-center gap-0.5">
                <Euro className="w-2.5 h-2.5" />{formatCurrency(opp.value)}
              </span>
            )}
            {opp.probability > 0 && (
              <span className="text-[10px] text-slate-500">{opp.probability}%</span>
            )}
            {opp.expected_close_date && (
              <span className={`text-[10px] ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                {isOverdue ? "⚠ " : ""}{moment(opp.expected_close_date).format("DD.MM.YY")}
              </span>
            )}
          </div>
        </div>
        {opp.status === 'won' && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />}
        {opp.status === 'lost' && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
      </div>

      {/* Won/Lost Reason anzeigen */}
      {opp.won_lost_reason && (
        <p className="text-xs text-slate-600 italic mb-2">„{opp.won_lost_reason}"</p>
      )}

      {/* Stage-Wechsel nur für offene Opps */}
      {!isTerminal && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {updating ? (
            <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Aktualisiert…</span>
          ) : VALID_STAGES.filter(s => s !== opp.stage).map(s => (
            <button
              key={s}
              onClick={() => handleStageChange(s)}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors hover:opacity-80 ${
                s === 'won' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                s === 'lost' ? 'bg-red-50 text-red-600 border-red-200' :
                'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              → {STAGE_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {/* Won/Lost Reason Dialog */}
      {showReason && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-700 mb-1">Grund (optional):</p>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="z.B. Preis zu hoch, Wettbewerber gewonnen…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            autoFocus
          />
          <div className="flex gap-1.5 mt-1.5">
            <button onClick={() => { setShowReason(false); setReason(""); }} className="text-xs px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600">Abbrechen</button>
            <button onClick={() => doUpdate(opp.stage === 'won' ? 'won' : 'lost')} className="text-xs px-2 py-0.5 rounded bg-slate-800 text-white">Bestätigen</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function OpportunitySection({ company, organizationId }) {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadOpportunities = async () => {
    if (!organizationId || !company?.id) return;
    setLoading(true);
    const res = await base44.functions.invoke("listOpportunities", {
      org_id: organizationId,
      company_id: company.id,
    });
    setOpportunities(res.data?.opportunities || []);
    setLoading(false);
  };

  useEffect(() => {
    loadOpportunities();
  }, [organizationId, company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCount = opportunities.filter(o => o.status === 'open').length;
  const pipelineValue = opportunities.filter(o => o.status === 'open').reduce((s, o) => s + (o.value || 0), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Verkaufschancen
          {openCount > 0 && (
            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
              {openCount}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {pipelineValue > 0 && (
            <span className="text-xs font-semibold text-slate-600">{formatCurrency(pipelineValue)}</span>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="h-7 text-xs gap-1 bg-white border-slate-200">
            <Plus className="w-3 h-3" /> Opportunity
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
        </div>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-5">
          <TrendingUp className="w-7 h-7 text-slate-200 mx-auto mb-1.5" />
          <p className="text-sm text-slate-500">Noch keine Verkaufschancen</p>
          <button onClick={() => setShowCreate(true)} className="mt-1 text-xs font-semibold text-blue-600 hover:underline">
            Erste Opportunity erstellen
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.map(opp => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              organizationId={organizationId}
              onChanged={loadOpportunities}
            />
          ))}
        </div>
      )}

      <CreateOpportunityDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        companyId={company?.id}
        organizationId={organizationId}
        onCreated={loadOpportunities}
      />
    </div>
  );
}