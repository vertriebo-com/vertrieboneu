import { Search, Tag, Zap, TrendingUp, TrendingDown, Award, AlertTriangle, CheckCircle2 } from "lucide-react";

function safeParseArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}

function safeParseObject(v) {
  if (!v) return {};
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return {}; }
}

function normStr(s) {
  return String(s || "").toLowerCase().trim();
}

// Unterstützt string[] und object[] (mit .label / .keyword)
function extractKeyword(item) {
  if (typeof item === "string") return item;
  if (item?.label) return item.label;
  if (item?.keyword) return item.keyword;
  return String(item);
}

// ── Quality-Tier aus relevance_score ableiten ──────────────────────────────
function getQualityTier(score) {
  if (!score || score <= 0) return null;
  if (score >= 85) return { tier: "premium",  label: "Premium Lead",          color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Award };
  if (score >= 75) return { tier: "strong",   label: "Sehr guter Lead",       color: "bg-blue-50 text-blue-700 border-blue-200", icon: CheckCircle2 };
  if (score >= 65) return { tier: "good",     label: "Guter Lead",            color: "bg-sky-50 text-sky-700 border-sky-200", icon: CheckCircle2 };
  if (score >= 55) return { tier: "weak",     label: "Prüfen",                color: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle };
  return null;
}

function getLearningHints(company, learnedSignals) {
  if (!learnedSignals) return [];
  if ((learnedSignals.total_outcomes_analyzed || 0) < 5) return [];

  const hints = [];
  const tc = normStr(company.matched_target_customer_type);
  const cat = normStr(company.matched_search_category);
  const query = normStr(company.source_query);
  const matchKey = tc || cat || query;

  if (!matchKey) return [];

  // priority_categories
  const prios = safeParseArray(learnedSignals.priority_categories);
  const isPrioritized = prios.some(p => normStr(extractKeyword(p)).includes(matchKey) || matchKey.includes(normStr(extractKeyword(p))));
  if (isPrioritized) hints.push({ type: "priority", label: "Priorisierte Kategorie", icon: TrendingUp });

  // boosted_keywords
  const boosted = safeParseArray(learnedSignals.boosted_keywords);
  const isBoosted = boosted.some(b => normStr(extractKeyword(b)).includes(matchKey) || matchKey.includes(normStr(extractKeyword(b))));
  if (isBoosted) hints.push({ type: "boosted", label: "Geboostetes Keyword", icon: TrendingUp });

  // excluded_categories / reduced
  const excluded = safeParseArray(learnedSignals.excluded_categories);
  const isExcluded = excluded.some(e => normStr(extractKeyword(e)).includes(matchKey) || matchKey.includes(normStr(extractKeyword(e))));
  if (isExcluded) hints.push({ type: "excluded", label: "Kategorie wird reduziert", icon: TrendingDown });

  return hints;
}

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

  const learningHints = getLearningHints(company, learnedSignals);
  const qualityTier = getQualityTier(company.relevance_score);

  // engine_version: direkt oder aus engine_analysis_json
  let engineVersion = company.engine_version || null;
  if (!engineVersion && company.engine_analysis_json) {
    try {
      const parsed = typeof company.engine_analysis_json === "string"
        ? JSON.parse(company.engine_analysis_json)
        : company.engine_analysis_json;
      engineVersion = parsed?.engine_version || null;
    } catch { /* ignore */ }
  }

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

        {/* Quality-Tier + Score */}
        {(company.relevance_score > 0 || engineVersion) && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-2 flex-wrap">
            {qualityTier && (() => {
              const TierIcon = qualityTier.icon;
              return (
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${qualityTier.color}`}>
                  <TierIcon className="w-3 h-3" />
                  {qualityTier.label}
                </span>
              );
            })()}
            {company.relevance_score > 0 && (
              <span className="text-[10px] font-semibold text-slate-500">
                Score: <span className="font-bold text-slate-700">{company.relevance_score}</span>
              </span>
            )}
            {engineVersion && (
              <span className="ml-auto text-[10px] text-slate-400 font-mono">{engineVersion}</span>
            )}
          </div>
        )}
        {/* Hinweis bei "Prüfen"-Qualität */}
        {qualityTier?.tier === "weak" && (
          <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-medium">Niedrige Sicherheit – Kontaktdaten prüfen und ergänzen bevor Kontaktaufnahme.</p>
          </div>
        )}

        {company.relevance_reason && (
          <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-2 mt-1">
            {company.relevance_reason}
          </p>
        )}

        {/* Learning-Hinweise */}
        {learningHints.length > 0 && (
          <div className="border-t border-slate-100 pt-2 mt-1 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Warum priorisiert?</p>
            {learningHints.map((hint, i) => {
              const Icon = hint.icon;
              const colorClass = hint.type === "excluded"
                ? "text-amber-600"
                : "text-emerald-600";
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <Icon className={`w-3 h-3 ${colorClass} flex-shrink-0`} />
                  <span className={`text-[11px] font-semibold ${colorClass}`}>{hint.label}</span>
                </div>
              );
            })}
            <p className="text-[10px] text-slate-400">Basiert auf {learnedSignals.total_outcomes_analyzed} ausgewerteten Ergebnissen</p>
          </div>
        )}
      </div>
    </div>
  );
}