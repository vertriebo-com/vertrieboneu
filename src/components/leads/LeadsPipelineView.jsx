/**
 * LeadsPipelineView – Professionelles Vertriebsboard
 * Grupiert geladene Leads nach Status, kein Drag & Drop.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Building2, Phone, Mail, ChevronDown, ChevronUp, MapPin, Sparkles, Loader2 } from "lucide-react";
import { isHotLead, isWarmLead } from "@/utils/leadTemperature";

const STAGES = [
  { key: "Neu",      label: "Neu",      desc: "Noch nicht kontaktiert",    color: "bg-blue-500",    border: "border-blue-100",    header: "bg-blue-50",    text: "text-blue-700",    badge: "bg-blue-100 text-blue-700"    },
  { key: "Kontakt",  label: "Kontakt",  desc: "Erster Kontakt erfolgt",    color: "bg-cyan-500",    border: "border-cyan-100",    header: "bg-cyan-50",    text: "text-cyan-700",    badge: "bg-cyan-100 text-cyan-700"    },
  { key: "Rückruf",  label: "Rückruf",  desc: "Wiedervorlage offen",       color: "bg-amber-500",   border: "border-amber-100",   header: "bg-amber-50",   text: "text-amber-700",   badge: "bg-amber-100 text-amber-700"  },
  { key: "Termin",   label: "Termin",   desc: "Gespräch geplant",          color: "bg-violet-500",  border: "border-violet-100",  header: "bg-violet-50",  text: "text-violet-700",  badge: "bg-violet-100 text-violet-700"},
  { key: "Angebot",  label: "Angebot",  desc: "Angebot läuft",             color: "bg-orange-500",  border: "border-orange-100",  header: "bg-orange-50",  text: "text-orange-700",  badge: "bg-orange-100 text-orange-700"},
  { key: "Gewonnen", label: "Gewonnen", desc: "Abgeschlossen",             color: "bg-emerald-500", border: "border-emerald-100", header: "bg-emerald-50", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700"},
];

const INITIAL_PER_STAGE = 8;

function PipelineCard({ company }) {
  const hot = isHotLead(company);
  const warm = isWarmLead(company);

  return (
    <Link
      to={`/leads/${company.id}`}
      className={`block px-3 py-2.5 hover:bg-slate-50 transition-colors group border-l-2 ${
        hot ? "border-orange-400" : warm ? "border-amber-300" : "border-transparent"
      }`}
    >
      {/* Firmenname */}
      <div className="flex items-start gap-1.5">
        {hot
          ? <Flame className="w-3 h-3 text-orange-500 shrink-0 mt-0.5" />
          : <Building2 className="w-3 h-3 text-slate-300 shrink-0 mt-0.5" />
        }
        <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 leading-tight line-clamp-2">
          {company.name}
        </p>
      </div>

      {/* Branche + Ort */}
      <div className="ml-4 mt-0.5 space-y-0.5">
        {company.branche && (
          <p className="text-[10px] text-slate-400 truncate">{company.branche}</p>
        )}
        {company.ort && (
          <div className="flex items-center gap-0.5">
            <MapPin className="w-2.5 h-2.5 text-slate-300 shrink-0" />
            <p className="text-[10px] text-slate-400 truncate">{company.ort}</p>
          </div>
        )}
      </div>

      {/* Icons + Score */}
      <div className="flex items-center gap-2 mt-1.5 ml-4">
        {company.telefon && <Phone className="w-2.5 h-2.5 text-slate-300" />}
        {company.email && <Mail className="w-2.5 h-2.5 text-slate-300" />}
        {company.next_best_action && (
          <span className="text-[9px] text-slate-400 truncate max-w-[80px]">{company.next_best_action}</span>
        )}
        {hot && (
          <span className="ml-auto text-[9px] font-bold text-orange-600 bg-orange-50 px-1 rounded">🔥 Heiß</span>
        )}
      </div>
    </Link>
  );
}

function StageColumn({ stage, leads }) {
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? leads : leads.slice(0, INITIAL_PER_STAGE);
  const hiddenCount = leads.length - INITIAL_PER_STAGE;

  return (
    <div className={`flex flex-col border ${stage.border} rounded-xl overflow-hidden bg-white`} style={{ minWidth: "240px", maxWidth: "280px", flex: "1 0 240px" }}>
      {/* Stage Header */}
      <div className={`${stage.header} px-3 py-2.5`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${stage.color} shrink-0`} />
          <span className={`text-xs font-bold ${stage.text}`}>{stage.label}</span>
          {leads.length > 0 && (
            <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stage.badge}`}>
              {leads.length} geladen
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5 ml-4">{stage.desc}</p>
      </div>

      {/* Leads */}
      <div className="divide-y divide-slate-50 flex-1">
        {shown.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-[11px] text-slate-300 font-medium">Keine Leads</p>
            <p className="text-[10px] text-slate-200 mt-0.5">Hier landen Kontakte nach dem ersten Schritt.</p>
          </div>
        ) : (
          shown.map(c => <PipelineCard key={c.id} company={c} />)
        )}
      </div>

      {/* Expand / Collapse */}
      {leads.length > INITIAL_PER_STAGE && (
        <button
          onClick={() => setExpanded(e => !e)}
          className={`w-full flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-semibold transition-colors border-t ${stage.border} ${stage.text} hover:bg-slate-50`}
        >
          {expanded ? (
            <><ChevronUp className="w-3 h-3" /> Weniger anzeigen</>
          ) : (
            <><ChevronDown className="w-3 h-3" /> Alle {leads.length} in {stage.label} anzeigen</>
          )}
        </button>
      )}

      {/* Stage Quick-Action */}
      {leads.length > 0 && (
        <Link
          to={`/leads?status=${encodeURIComponent(stage.key)}`}
          className={`w-full flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] font-semibold transition-colors border-t ${stage.border} text-slate-400 hover:text-slate-600 hover:bg-slate-50`}
        >
          {stage.label === "Rückruf" ? "Rückrufe öffnen" : `${stage.label}-Leads öffnen`} →
        </Link>
      )}
    </div>
  );
}

export default function LeadsPipelineView({
  companies = [],
  loadedCount = 0,
  totalCount = 0,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  pageSize = 50,
}) {
  const byStatus = {};
  for (const stage of STAGES) {
    byStatus[stage.key] = companies.filter(c => c.status === stage.key);
  }

  const remainingContacts = Math.max(0, totalCount - loadedCount);
  const nextLoadCount = Math.min(pageSize, remainingContacts);
  const totalActive = companies.length;
  const allEmpty = STAGES.every(s => (byStatus[s.key] || []).length === 0);
  const onlyNewFilled = byStatus["Neu"]?.length > 0 && STAGES.slice(1).every(s => (byStatus[s.key] || []).length === 0);

  return (
    <div className="space-y-3">

      {/* ── Pipeline Header Info-Card ─────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          {remainingContacts > 0 ? (
            <>
              <p className="text-sm font-semibold text-slate-800">
                Pipeline zeigt {loadedCount} von {totalCount} geladenen Kontakten.
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Laden Sie weitere Kontakte, um die Pipeline vollständig zu sehen.
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-slate-800">
              Pipeline zeigt alle {totalCount} Kontakte.
            </p>
          )}
        </div>
        {remainingContacts > 0 && (
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 shrink-0 px-4 py-2 text-xs font-semibold text-blue-600 border border-blue-300 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingMore
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lädt weitere Kontakte…</>
              : `Weitere ${nextLoadCount} Kontakte laden`}
          </button>
        )}
      </div>

      {/* ── Ganzkomplett leer ─────────────────────────────────────── */}
      {allEmpty && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <h3 className="text-sm font-bold text-slate-600 mb-1">Noch keine aktiven Leads in der Pipeline.</h3>
          <p className="text-xs text-slate-400">Starten Sie eine Recherche, um Ihre Pipeline zu füllen.</p>
        </div>
      )}

      {/* ── Nur Neu gefüllt – Hinweis ─────────────────────────────── */}
      {!allEmpty && onlyNewFilled && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Starten Sie mit den neuen Leads. Sobald Sie Kontakte bearbeiten, füllt sich Ihre Pipeline automatisch.
          </p>
        </div>
      )}

      {/* ── Kanban Columns ────────────────────────────────────────── */}
      <div className="overflow-x-auto pb-3 -mx-1 px-1">
        <div className="flex gap-3" style={{ minWidth: `${STAGES.length * 256}px` }}>
          {STAGES.map(stage => (
            <StageColumn
              key={stage.key}
              stage={stage}
              leads={byStatus[stage.key] || []}
            />
          ))}
        </div>
      </div>

      {/* ── Load-more Footer ──────────────────────────────────────── */}
      {totalActive > 0 && (
        <div className="flex flex-col items-center gap-1 pt-1">
          {remainingContacts > 0 ? (
            <>
              <button
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-300 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isLoadingMore
                  ? "Lädt weitere Kontakte…"
                  : nextLoadCount === 1
                  ? "Weiteren Kontakt laden"
                  : `Weitere ${nextLoadCount} Kontakte laden`}
              </button>
              <p className="text-xs text-slate-400">{loadedCount} von {totalCount} Kontakten geladen</p>
            </>
          ) : (
            <p className="text-xs text-slate-400">Alle {totalCount} Kontakte geladen</p>
          )}
        </div>
      )}
    </div>
  );
}