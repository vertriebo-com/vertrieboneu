/**
 * ProvenanceBadge
 * ===============
 * Kleines Badge neben Kontaktfeldern im LeadDetail.
 * Zeigt Datenherkunft: Google Places | KI-Recherche | Manuell | Import | Unbekannt
 * Bei review_status='unreviewed' + source='enrichment': dezenter Warnhinweis.
 *
 * Bewusst minimal: nur erklärend, kein Modal, keine Pflichtbestätigung.
 */
import { useState } from "react";
import { Info } from "lucide-react";

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
 * @param {{ provenance: object|null, showUnknown?: boolean }} props
 * provenance = { source_type, confidence, review_status, ... }
 * showUnknown = ob auch bei fehlender Provenance ein Badge gezeigt wird (default false)
 */
export default function ProvenanceBadge({ provenance, showUnknown = false }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!provenance) {
    if (!showUnknown) return null;
    provenance = { source_type: "unknown", review_status: "unreviewed" };
  }

  const config = SOURCE_CONFIG[provenance.source_type] || SOURCE_CONFIG.unknown;
  const isUnreviewed = provenance.source_type === "enrichment" && provenance.review_status !== "confirmed";

  return (
    <span className="relative inline-flex items-center gap-0.5">
      <span
        className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${config.bg} ${config.text} ${config.border} leading-none cursor-default select-none`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {config.shortLabel}
        {isUnreviewed && (
          <span className="ml-0.5 text-[9px] opacity-70">⚠</span>
        )}
        <Info className="w-2.5 h-2.5 opacity-60 ml-0.5" />
      </span>

      {showTooltip && (
        <span className="absolute bottom-full left-0 mb-1 z-50 w-48 text-[11px] bg-slate-900 text-white rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none leading-snug">
          {config.tooltip}
          {provenance.confidence && (
            <span className="block mt-0.5 opacity-70">
              Konfidenz: {provenance.confidence === "high" ? "Hoch" : provenance.confidence === "medium" ? "Mittel" : "Niedrig"}
            </span>
          )}
          {isUnreviewed && (
            <span className="block mt-0.5 text-amber-300">Noch nicht geprüft</span>
          )}
        </span>
      )}
    </span>
  );
}