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

const REASON_OPTIONS = {
  not_relevant: [
    { code: "falsche_branche",        label: "Falsche Branche" },
    { code: "zu_klein",               label: "Zu klein" },
    { code: "zu_weit_entfernt",       label: "Zu weit entfernt" },
    { code: "privatkunde_kein_b2b",   label: "Privatkunde / kein B2B" },
    { code: "kein_ansprechpartner",   label: "Kein passender Ansprechpartner" },
    { code: "schlechte_kontaktdaten", label: "Schlechte Kontaktdaten" },
    { code: "bereits_bekannt",        label: "Bereits bekannt / Kunde" },
    { code: "kein_bedarf",            label: "Kein Bedarf erkennbar" },
    { code: "sonstiges",              label: "Sonstiges" },
  ],
  relevant: [
    { code: "passt_zur_zielgruppe",       label: "Passt zur Zielgruppe" },
    { code: "gute_unternehmensgroesse",   label: "Gute Unternehmensgröße" },
    { code: "guter_standort",             label: "Guter Standort" },
    { code: "klare_b2b_firma",            label: "Klare B2B-Firma" },
    { code: "passende_branche",           label: "Passende Branche" },
    { code: "gute_kontaktdaten",          label: "Gute Kontaktdaten" },
    { code: "wiederkehrender_auftrag",    label: "Wiederkehrender Bedarf möglich" },
    { code: "sonstiges",                  label: "Sonstiges" },
  ],
  won: [
    { code: "richtige_branche",       label: "Richtige Branche" },
    { code: "guter_standort",         label: "Richtiger Standort" },
    { code: "hoher_bedarf",           label: "Hoher Bedarf" },
    { code: "guter_ansprechpartner",  label: "Guter Ansprechpartner" },
    { code: "wiederkehrender_auftrag",label: "Wiederkehrender Auftrag" },
    { code: "hoher_auftragswert",     label: "Hoher Auftragswert" },
    { code: "sonstiges",              label: "Sonstiges" },
  ],
};

export default function OutcomeFeedback({ companyId, organizationId, onStatusSync, company }) {
  const [currentOutcome, setCurrentOutcome] = useState(null);
  const [currentReasonCode, setCurrentReasonCode] = useState(null);
  const [outcomeId, setOutcomeId] = useState(null);
  const [pendingType, setPendingType] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [freeText, setFreeText] = useState("");
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
        setCurrentReasonCode(latest.outcome_reason_code || null);
        setOutcomeId(latest.id);
      }
    })();
  }, [companyId, organizationId]);

  const handleSelect = (type) => {
    if (currentOutcome === type) return;
    setPendingType(type);
    setSelectedCode(null);
    setFreeText("");
  };

  const handleReasonSelect = (code) => {
    setSelectedCode(prev => prev === code ? null : code);
  };

  const handleSave = async () => {
    if (!pendingType) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const reasonLabel = REASON_OPTIONS[pendingType]?.find(r => r.code === selectedCode)?.label || null;

      // outcome_reason (Legacy) aus label + freeText zusammensetzen
      const legacyReason = [reasonLabel, freeText.trim()].filter(Boolean).join(" – ") || null;

      const data = {
        company_id: companyId,
        organization_id: organizationId,
        outcome_type: pendingType,
        outcome_reason_code: selectedCode || null,
        outcome_reason_label: reasonLabel || null,
        outcome_reason_text: freeText.trim() || null,
        outcome_reason: legacyReason,
        recorded_at: now,
        recorded_by: user?.email || "",
      };

      if (outcomeId) {
        await base44.entities.LeadOutcome.update(outcomeId, data);
      } else {
        const created = await base44.entities.LeadOutcome.create(data);
        setOutcomeId(created.id);
      }

      // Status-Sync
      if (pendingType === "not_relevant") {
        await base44.entities.Company.update(companyId, { status: "Verloren" });
        onStatusSync?.("Verloren");
      } else if (pendingType === "won") {
        await base44.entities.Company.update(companyId, { status: "Gewonnen" });
        onStatusSync?.("Gewonnen");
      }

      // Feedback-Loop auslösen (asynchron, silent)
      base44.functions.invoke('processLeadOutcomeFeedback', { organization_id: organizationId })
        .catch(() => {});

      setCurrentOutcome(pendingType);
      setCurrentReasonCode(selectedCode);
      setPendingType(null);
      setSelectedCode(null);
      setFreeText("");
      toast.success("Feedback gespeichert");
    } catch (e) {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPendingType(null);
    setSelectedCode(null);
    setFreeText("");
  };

  const activeOption = OUTCOME_OPTIONS.find(o => o.type === currentOutcome);
  const activeReasonLabel = currentReasonCode
    ? REASON_OPTIONS[currentOutcome]?.find(r => r.code === currentReasonCode)?.label
    : null;

  const contextParts = [];
  if (company?.source_query) contextParts.push(`Suchbegriff „${company.source_query}"`);
  if (company?.matched_target_customer_type) contextParts.push(`Zielkunde: ${company.matched_target_customer_type}`);
  if (company?.matched_search_category && company.matched_search_category !== company.matched_target_customer_type)
    contextParts.push(`Kategorie: ${company.matched_search_category}`);

  const reasonOptions = pendingType ? REASON_OPTIONS[pendingType] || [] : [];

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
      {/* Kontext */}
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
        {currentOutcome && !pendingType && (
          <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            currentOutcome === "won" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            currentOutcome === "relevant" ? "bg-blue-50 text-blue-700 border-blue-200" :
            "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            {activeOption?.label}{activeReasonLabel ? ` · ${activeReasonLabel}` : ""}
          </span>
        )}
      </div>

      {/* Outcome-Buttons */}
      <div className="flex gap-2 flex-wrap">
        {OUTCOME_OPTIONS.map(({ type, label, icon: Icon, activeClass, inactiveClass }) => (
          <button
            key={type}
            onClick={() => handleSelect(type)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all min-h-[38px] ${
              (pendingType || currentOutcome) === type
                ? activeClass
                : inactiveClass
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Grundauswahl + Freitext */}
      {pendingType && (
        <div className="mt-3 space-y-3">
          {/* Chip-Auswahl */}
          <div className="flex flex-wrap gap-1.5">
            {reasonOptions.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => handleReasonSelect(code)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all ${
                  selectedCode === code
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Freitext (optional) */}
          <input
            type="text"
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            placeholder="Zusätzliche Anmerkung (optional)…"
            className="w-full rounded-lg border border-[#E2E8F0] bg-slate-50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            onKeyDown={e => e.key === "Enter" && handleSave()}
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