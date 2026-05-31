/**
 * LeadsPipelineView – Pipeline gruppiert nach Status
 * Zeigt geladene Leads, mit Expand pro Spalte und Load-more.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Building2, Phone, Mail, ChevronDown } from "lucide-react";
import { isHotLead } from "@/utils/leadTemperature";

const STAGES = [
  { key: "Neu",      color: "bg-blue-400",    border: "border-blue-100",    header: "bg-blue-50",   text: "text-blue-700"   },
  { key: "Kontakt",  color: "bg-cyan-400",     border: "border-cyan-100",    header: "bg-cyan-50",   text: "text-cyan-700"   },
  { key: "Rückruf",  color: "bg-amber-400",    border: "border-amber-100",   header: "bg-amber-50",  text: "text-amber-700"  },
  { key: "Termin",   color: "bg-violet-400",   border: "border-violet-100",  header: "bg-violet-50", text: "text-violet-700" },
  { key: "Angebot",  color: "bg-orange-400",   border: "border-orange-100",  header: "bg-orange-50", text: "text-orange-700" },
  { key: "Gewonnen", color: "bg-emerald-400",  border: "border-emerald-100", header: "bg-emerald-50",text: "text-emerald-700"},
];

const INITIAL_PER_STAGE = 8;

export default function LeadsPipelineView({
  companies = [],
  loadedCount = 0,
  totalCount = 0,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
}) {
  const [expanded, setExpanded] = useState({});

  const byStatus = {};
  for (const stage of STAGES) {
    byStatus[stage.key] = companies.filter(c => c.status === stage.key);
  }

  const remainingContacts = Math.max(0, totalCount - loadedCount);
  const nextLoadCount = Math.min(50, remainingContacts);

  return (
    <div>
      {/* Pipeline info hint */}
      <p className="text-[11px] text-slate-400 text-center mb-3">
        {remainingContacts > 0
          ? `Pipeline zeigt ${loadedCount} von ${totalCount} geladenen Kontakten. Laden Sie weitere, um die Pipeline zu vervollständigen.`
          : `Pipeline zeigt alle ${totalCount} Kontakte.`}
      </p>

      {/* Kanban columns – horizontal scroll on mobile */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: `${STAGES.length * 240}px` }}>
          {STAGES.map(stage => {
            const leads = byStatus[stage.key] || [];
            const isExpanded = !!expanded[stage.key];
            const shown = isExpanded ? leads : leads.slice(0, INITIAL_PER_STAGE);
            const hiddenCount = leads.length - shown.length;

            return (
              <div
                key={stage.key}
                className={`flex-1 min-w-[220px] max-w-[260px] border ${stage.border} rounded-xl overflow-hidden`}
              >
                {/* Stage Header */}
                <div className={`${stage.header} px-3 py-2 flex items-center gap-2`}>
                  <div className={`w-2 h-2 rounded-full ${stage.color} shrink-0`} />
                  <span className={`text-xs font-bold ${stage.text}`}>{stage.key}</span>
                  <span className={`ml-auto text-xs font-bold ${stage.text} opacity-70`}>{leads.length}</span>
                </div>

                {/* Leads */}
                <div className="bg-white divide-y divide-slate-50">
                  {shown.length === 0 ? (
                    <div className="px-3 py-3 text-center text-[11px] text-slate-300">Keine Leads</div>
                  ) : (
                    shown.map(c => (
                      <Link
                        key={c.id}
                        to={`/leads/${c.id}`}
                        className="block px-3 py-2.5 hover:bg-slate-50 transition-colors group"
                      >
                        <div className="flex items-start gap-1.5">
                          {isHotLead(c)
                            ? <Flame className="w-3 h-3 text-orange-500 shrink-0 mt-0.5" />
                            : <Building2 className="w-3 h-3 text-slate-300 shrink-0 mt-0.5" />
                          }
                          <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 leading-tight line-clamp-2">{c.name}</p>
                        </div>
                        {c.branche && <p className="text-[10px] text-slate-400 truncate mt-0.5 ml-4">{c.branche}</p>}
                        <div className="flex items-center gap-1.5 mt-1 ml-4">
                          {c.telefon && <Phone className="w-2.5 h-2.5 text-slate-300" />}
                          {c.email && <Mail className="w-2.5 h-2.5 text-slate-300" />}
                        </div>
                      </Link>
                    ))
                  )}

                  {/* Expand button */}
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => setExpanded(prev => ({ ...prev, [stage.key]: true }))}
                      className="w-full flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <ChevronDown className="w-3 h-3" />
                      Alle {leads.length} in {stage.key} anzeigen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Load-more im Pipeline-Tab */}
      <div className="flex flex-col items-center pt-4 gap-1.5">
        {remainingContacts > 0 ? (
          <>
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-300 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoadingMore && (
                <span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
              )}
              {isLoadingMore
                ? "Lädt weitere Kontakte…"
                : nextLoadCount === 1
                ? "Weiteren Kontakt laden"
                : `Weitere ${nextLoadCount} Kontakte laden`}
            </button>
            <p className="text-xs text-slate-400">
              {loadedCount} von {totalCount} Kontakten geladen
            </p>
          </>
        ) : (
          totalCount > 0 && (
            <p className="text-xs text-slate-400">Alle {totalCount} Kontakte geladen</p>
          )
        )}
      </div>
    </div>
  );
}