import { Search, Tag, Zap } from "lucide-react";

export default function RelevanceSection({ company, learnedSignals }) {
  if (!company) return null;

  const hasContext =
    company.source_query ||
    company.matched_search_category ||
    company.matched_target_customer_type ||
    company.matched_service_context ||
    company.relevance_score > 0 ||
    company.relevance_reason;

  if (!hasContext) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-3">
        <Search className="w-3.5 h-3.5" /> Warum dieser Lead?
      </h3>

      <div className="space-y-2">
        {company.source_query && (
          <div className="flex items-start gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Suchbegriff</p>
              <p className="text-sm font-medium text-slate-800">{company.source_query}</p>
            </div>
          </div>
        )}

        {company.matched_target_customer_type && (
          <div className="flex items-start gap-2">
            <Tag className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Zielkundentyp</p>
              <p className="text-sm font-medium text-blue-700">{company.matched_target_customer_type}</p>
            </div>
          </div>
        )}

        {company.matched_search_category && company.matched_search_category !== company.matched_target_customer_type && (
          <div className="flex items-start gap-2">
            <Tag className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Suchkategorie</p>
              <p className="text-sm font-medium text-slate-700">{company.matched_search_category}</p>
            </div>
          </div>
        )}

        {company.matched_service_context && (
          <div className="flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Leistungsbezug</p>
              <p className="text-sm font-medium text-slate-700">{company.matched_service_context}</p>
            </div>
          </div>
        )}

        {company.relevance_score > 0 && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Relevanz-Score</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
              company.relevance_score >= 75
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : company.relevance_score >= 50
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}>
              {company.relevance_score}
            </span>
          </div>
        )}

        {company.relevance_reason && (
          <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2 mt-1">
            {company.relevance_reason}
          </p>
        )}
      </div>
    </div>
  );
}