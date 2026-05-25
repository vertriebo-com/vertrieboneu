import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ThumbsUp, Trophy, ThumbsDown, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const OUTCOME_OPTIONS = [
  {
    type: "relevant",
    label: "Relevant",
    icon: ThumbsUp,
    activeClass: "bg-blue-600 text-white border-blue-600",
    inactiveClass: "bg-white text-blue-700 border-blue-300 hover:bg-blue-50",
  },
  {
    type: "won",
    label: "Gewonnen",
    icon: Trophy,
    activeClass: "bg-emerald-600 text-white border-emerald-600",
    inactiveClass: "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50",
  },
  {
    type: "not_relevant",
    label: "Nicht relevant",
    icon: ThumbsDown,
    activeClass: "bg-slate-500 text-white border-slate-500",
    inactiveClass: "bg-white text-slate-600 border-slate-300 hover:bg-slate-50",
  },
];

export default function OutcomeFeedback({ companyId, organizationId, onStatusSync, company }) {
  const [currentOutcome, setCurrentOutcome] = useState(null);
  const [outcomeId, setOutcomeId] = useState(null);
  const [reason, setReason] = useState("");
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!companyId || !organizationId) return;
    (async () => {
      const me = await base44.auth.me();
      setUser(me);
      const existing = await base44.entities.LeadOutcome.filter({
        company_id: companyId,
        organization_id: organizationId,
      });
      if (existing?.length > 0) {
        const latest = existing.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
        setCurrentOutcome(latest.outcome_type);
        setReason(latest.outcome_reason || "");
        setOutcomeId(latest.id);
      }
    })();
  }, [companyId, organizationId]);

  const handleSelect = (type) => {
    if (currentOutcome === type) return; // bereits gesetzt
    setPendingType(type);
    setReason("");
    setShowReasonInput(true);
  };

  const handleSave = async () => {
    if (!pendingType) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const data = {
        company_id: companyId,
        organization_id: organizationId,
        outcome_type: pendingType,
        outcome_reason: reason.trim() || null,
        recorded_at: now,
        recorded_by: user?.email || "",
      };

      if (outcomeId) {
        await base44.entities.LeadOutcome.update(outcomeId, data);
      } else {
        const created = await base44.entities.LeadOutcome.create(data);
        setOutcomeId(created.id);
      }

      // Status-Sync (Aufgabe 4)
      if (pendingType === "not_relevant") {
        await base44.entities.Company.update(companyId, { status: "Verloren" });
        onStatusSync?.("Verloren");
      } else if (pendingType === "won") {
        await base44.entities.Company.update(companyId, { status: "Gewonnen" });
        onStatusSync?.("Gewonnen");
      }

      // Feedback-Loop direkt auslösen (asynchron, wartet nicht auf Ergebnis)
      base44.functions.invoke('processLeadOutcomeFeedback', { organization_id: organizationId })
        .catch(() => {}); // silent fail, nicht kritisch

      setCurrentOutcome(pendingType);
      setShowReasonInput(false);
      setPendingType(null);
      toast.success("Feedback gespeichert");
    } catch (e) {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setShowReasonInput(false);
    setPendingType(null);
    setReason("");
  };

  const activeOption = OUTCOME_OPTIONS.find(o => o.type === currentOutcome);

  // Kontext für den Nutzer zusammenstellen
  const contextParts = [];
  if (company?.source_query) contextParts.push(`Suchbegriff „${company.source_query}"`);
  if (company?.matched_target_customer_type) contextParts.push(`Zielkunde: ${company.matched_target_customer_type}`);
  if (company?.matched_search_category && company.matched_search_category !== company.matched_target_customer_type)
    contextParts.push(`Kategorie: ${company.matched_search_category}`);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
      {/* Kontext-Zeile: zeigt dem Nutzer was er dem System beibringt */}
      {contextParts.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
            Dieser Lead wurde über {contextParts[0]} gefunden.{contextParts.length > 1 && ` ${contextParts.slice(1).join(' · ')}`}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Ihr Feedback verbessert künftige Recherchen für diese Kategorie.</p>
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">War dieser Lead hilfreich?</h3>
        {currentOutcome && (
          <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            currentOutcome === "won" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            currentOutcome === "relevant" ? "bg-blue-50 text-blue-700 border-blue-200" :
            "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            {activeOption?.label}
          </span>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {OUTCOME_OPTIONS.map(({ type, label, icon: Icon, activeClass, inactiveClass }) => (
          <button
            key={type}
            onClick={() => handleSelect(type)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all min-h-[38px] ${
              currentOutcome === type ? activeClass : inactiveClass
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {showReasonInput && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Grund (optional) — z.B. zu klein, falscher Ansprechpartner..."
            className="w-full rounded-lg border border-[#E2E8F0] bg-slate-50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            onKeyDown={e => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Speichert…" : "Speichern"}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}