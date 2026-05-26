/**
 * ProvenanceBadge
 * ===============
 * Badge neben Kontaktfeldern im LeadDetail.
 * Zeigt Datenherkunft + Review-Status.
 * Optional: onConfirm/onReject Props für inline Review-Aktionen.
 */
import { useState } from "react";
import { Info, Check, X } from "lucide-react";

const SOURCE_CONFIG = {
  google_places: {
    label: "Google Places",
    shortLabel: "Google",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    tooltip: "Aus Google Places API – verifizierte Quelle.",
  },
  enrichment: {
    label: "KI-Recherche",
    shortLabel: "KI",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    tooltip: "Von Vertriebo-KI recherchiert – bitte prüfen bevor Kontaktaufnahme.",
  },
  manual: {
    label: "Manuell",
    shortLabel: "Manuell",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    tooltip: "Manuell eingetragen.",
  },
  import: {
    label: "Import",
    shortLabel: "Import",
    bg: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-200",
    tooltip: "Aus CSV- oder API-Import.",
  },
  unknown: {
    label: "Unbekannt",
    shortLabel: "?",
    bg: "bg-slate-100",
    text: "text-slate-400",
    border: "border-slate-200",
    tooltip: "Herkunft nicht bekannt (Altdaten).",
  },
};

/**
 * @param {{
 *   provenance: object|null,
 *   showUnknown?: boolean,
 *   onConfirm?: () => void,
 *   onReject?: () => void,
 *   loading?: boolean
 * }} props
 */
export default function ProvenanceBadge({
  provenance,
  showUnknown = false,
  onConfirm,
  onReject,
  loading = false,
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!provenance) {
    if (!showUnknown) return null;
    provenance = { source_type: "unknown", review_status: "unreviewed" };
  }

  const config = SOURCE_CONFIG[provenance.source_type] || SOURCE_CONFIG.unknown;
  const isUnreviewed = provenance.source_type === "enrichment" && provenance.review_status !== "confirmed" && provenance.review_status !== "rejected";
  const isConfirmed = provenance.review_status === "confirmed";
  const isRejected = provenance.review_status === "rejected";
  const showActions = isUnreviewed && (onConfirm || onReject);

  return (
    <span className="relative inline-flex items-center gap-1">
      {/* Badge */}
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${config.bg} ${config.text} ${config.border} leading-none cursor-default select-none`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {config.shortLabel}
        {isUnreviewed && <span className="ml-0.5 text-[9px] opacity-70">⚠</span>}
        {isConfirmed && <span className="ml-0.5 text-[9px]">✓</span>}
        {isRejected && <span className="ml-0.5 text-[9px] opacity-60">✗</span>}
        <Info className="w-2.5 h-2.5 opacity-60 ml-0.5" />
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <span className="absolute bottom-full left-0 mb-1 z-50 w-52 text-[11px] bg-slate-900 text-white rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none leading-snug">
          {config.tooltip}
          {provenance.confidence && (
            <span className="block mt-0.5 opacity-70">
              Konfidenz: {provenance.confidence === "high" ? "Hoch" : provenance.confidence === "medium" ? "Mittel" : "Niedrig"}
            </span>
          )}
          {isUnreviewed && (
            <span className="block mt-0.5 text-amber-300">Noch nicht geprüft</span>
          )}
          {isConfirmed && provenance.reviewed_by && (
            <span className="block mt-0.5 text-emerald-300">Bestätigt von {provenance.reviewed_by}</span>
          )}
          {isRejected && (
            <span className="block mt-0.5 text-red-300">Als falsch markiert</span>
          )}
        </span>
      )}

      {/* Confirm / Reject Aktionen — nur bei unreviewed enrichment */}
      {showActions && !loading && (
        <>
          {onConfirm && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConfirm(); }}
              title="Bestätigen – Daten korrekt"
              className="w-4 h-4 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition-colors"
            >
              <Check className="w-2.5 h-2.5 text-emerald-700" />
            </button>
          )}
          {onReject && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReject(); }}
              title="Verwerfen – Daten falsch"
              className="w-4 h-4 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
            >
              <X className="w-2.5 h-2.5 text-red-700" />
            </button>
          )}
        </>
      )}

      {/* Loading spinner */}
      {loading && (
        <span className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin inline-block" />
      )}
    </span>
  );
}