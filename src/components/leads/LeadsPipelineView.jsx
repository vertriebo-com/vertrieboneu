/**
 * LeadsPipelineView – Pipeline gruppiert nach Status
 * Zeigt geladene Leads (aktuelle Seite), kein Drag & Drop.
 */
import { Link } from "react-router-dom";
import { Flame, Building2, ArrowRight, Phone, Mail } from "lucide-react";
import { isHotLead } from "@/utils/leadTemperature";

const STAGES = [
  { key: "Neu",      color: "bg-blue-400",    border: "border-blue-100",   header: "bg-blue-50",  text: "text-blue-700"  },
  { key: "Kontakt",  color: "bg-cyan-400",     border: "border-cyan-100",   header: "bg-cyan-50",  text: "text-cyan-700"  },
  { key: "Rückruf",  color: "bg-amber-400",    border: "border-amber-100",  header: "bg-amber-50", text: "text-amber-700" },
  { key: "Termin",   color: "bg-violet-400",   border: "border-violet-100", header: "bg-violet-50",text: "text-violet-700"},
  { key: "Angebot",  color: "bg-orange-400",   border: "border-orange-100", header: "bg-orange-50",text: "text-orange-700"},
  { key: "Gewonnen", color: "bg-emerald-400",  border: "border-emerald-100",header: "bg-emerald-50",text: "text-emerald-700"},
];

const MAX_PER_STAGE = 5;

export default function LeadsPipelineView({ companies = [] }) {
  const byStatus = {};
  for (const stage of STAGES) {
    byStatus[stage.key] = companies.filter(c => c.status === stage.key);
  }

  return (
    <div>
      <p className="text-[11px] text-slate-400 text-center mb-3">
        Pipeline zeigt aktuell geladene Leads (max. {companies.length})
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAGES.map(stage => {
          const leads = byStatus[stage.key] || [];
          const shown = leads.slice(0, MAX_PER_STAGE);
          const rest = leads.length - shown.length;
          return (
            <div key={stage.key} className={`border ${stage.border} rounded-xl overflow-hidden`}>
              {/* Stage Header */}
              <div className={`${stage.header} px-3 py-2 flex items-center gap-2`}>
                <div className={`w-2 h-2 rounded-full ${stage.color} shrink-0`} />
                <span className={`text-xs font-bold ${stage.text}`}>{stage.key}</span>
                <span className={`ml-auto text-xs font-bold ${stage.text} opacity-70`}>{leads.length}</span>
              </div>
              {/* Leads */}
              <div className="bg-white divide-y divide-slate-50 min-h-[80px]">
                {shown.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[11px] text-slate-300">Keine Leads</div>
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
                      <div className="flex items-center gap-1.5 mt-1.5 ml-4">
                        {c.telefon && <Phone className="w-2.5 h-2.5 text-slate-300" />}
                        {c.email && <Mail className="w-2.5 h-2.5 text-slate-300" />}
                      </div>
                    </Link>
                  ))
                )}
                {rest > 0 && (
                  <Link
                    to={`/leads?status=${stage.key}`}
                    className="flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    +{rest} weitere <ArrowRight className="w-2.5 h-2.5" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}