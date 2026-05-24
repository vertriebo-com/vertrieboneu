import { Target, MapPin, Sparkles, Brain, Search, TrendingDown } from "lucide-react";

/**
 * RelevanceSection
 * Zeigt warum ein Lead gefunden wurde und – wenn Learning aktiv –
 * konkrete Lernhinweise basierend auf boosted_keywords und priority_categories.
 */
export default function RelevanceSection({ company, learnedSignals }) {
  if (!company) return null;

  const targetCustomer = company.matched_target_customer_type || company.branche || "–";
  const reason = company.relevance_reason || "Automatisch gefunden";
  const distance = company.distance_km != null ? `${Number(company.distance_km).toFixed(1)} km` : "–";
  const searchArea = company.search_center_city || "–";
  const searchRadius = company.search_radius_km || 25;

  // ── Learning-Analyse ──
  const totalOutcomes = learnedSignals?.total_outcomes_analyzed || 0;
  const learningActive = totalOutcomes >= 5;

  let matchesPriorityCategory = false;
  let matchedKeyword = null;
  let matchedKeywordStats = null;
  let isReducedCategory = false;

  if (learningActive && learnedSignals) {
    const parseArr = (json) => { try { return JSON.parse(json || "[]"); } catch { return []; } };

    // Priority Categories prüfen (object[] oder string[])
    const priorityCats = parseArr(learnedSignals.priority_categories);
    const topCats = priorityCats.filter(c => {
      if (typeof c === "string") return true; // Legacy: score unbekannt → immer anzeigen
      return c.score > 50 && (c.won > 0 || c.relevant > 0);
    });
    const tcLower = (company.matched_target_customer_type || '').toLowerCase();
    matchesPriorityCategory = topCats.some(c => {
      const catLower = (typeof c === "string" ? c : (c.category || '')).toLowerCase();
      return tcLower && catLower && (catLower === tcLower || catLower.includes(tcLower) || tcLower.includes(catLower));
    });

    // Boosted Keywords prüfen (object[] oder legacy string[])
    const boostedKws = parseArr(learnedSignals.boosted_keywords);
    const sourceQuery = (company.source_query || '').toLowerCase();
    const matchedCat = (company.matched_search_category || '').toLowerCase();

    for (const kw of boostedKws) {
      const kwStr = typeof kw === "string" ? kw : (kw.keyword || '');
      const kwLower = kwStr.toLowerCase();
      if (!kwLower) continue;
      if (
        (sourceQuery && (sourceQuery.includes(kwLower) || kwLower.includes(sourceQuery))) ||
        (matchedCat && (matchedCat.includes(kwLower) || kwLower.includes(matchedCat)))
      ) {
        matchedKeyword = kwStr;
        matchedKeywordStats = typeof kw === "string" ? { keyword: kw, won_count: 0, relevant_count: 1 } : kw;
        break;
      }
    }

    // Excluded Categories prüfen (object[] oder string[])
    const excludedCats = parseArr(learnedSignals.excluded_categories);
    const brancheLower = (company.branche || '').toLowerCase();
    isReducedCategory = excludedCats.some(c => {
      const catLower = (typeof c === "string" ? c : (c.category || '')).toLowerCase();
      return brancheLower && catLower && (catLower === brancheLower || brancheLower.includes(catLower));
    });
  }

  // ── Learning-Hinweis zusammenbauen ──
  let learningHint = null;
  if (learningActive) {
    if (matchesPriorityCategory && matchedKeyword) {
      learningHint = {
        text: `Diese Zielgruppe und der verwendete Suchbegriff „${matchedKeyword}" wurden in Ihrer Vergangenheit positiv bewertet.`,
        type: 'double_match',
      };
    } else if (matchesPriorityCategory) {
      learningHint = {
        text: `Diese Zielgruppe wurde bereits positiv bewertet und wird deshalb stärker priorisiert.`,
        type: 'category_match',
      };
    } else if (matchedKeyword) {
      const stats = matchedKeywordStats;
      const detail = stats?.won_count > 0
        ? ` (${stats.won_count}× gewonnen)`
        : stats?.relevant_count > 0
          ? ` (${stats.relevant_count}× relevant)`
          : '';
      learningHint = {
        text: `Der Suchbegriff „${matchedKeyword}"${detail} gehört zu Ihren stärkeren Mustern.`,
        type: 'keyword_match',
      };
    } else if (isReducedCategory && !matchesPriorityCategory) {
      learningHint = {
        text: `Diese Kategorie wird aktuell vorsichtiger bewertet – sie wurde häufiger als weniger passend markiert.`,
        type: 'reduced',
      };
    }
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <Target className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-blue-900 mb-2.5">Warum dieser Lead?</h3>
          <div className="space-y-2">
            {/* Zielkunde */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-800">Zielkunde:</span>
              <span className="text-sm font-semibold text-blue-900">{targetCustomer}</span>
            </div>

            {/* Passt wegen */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-blue-800 flex-shrink-0">Passt wegen:</span>
              <span className="text-sm text-blue-800 text-right leading-snug">{reason}</span>
            </div>

            {/* Suchbegriff */}
            {company.source_query && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-800 flex items-center gap-1">
                  <Search className="w-3 h-3" /> Suchbegriff:
                </span>
                <span className="text-xs font-semibold text-blue-900">{company.source_query}</span>
              </div>
            )}

            {/* Entfernung */}
            {distance !== "–" && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-800">Entfernung:</span>
                <span className="text-sm font-semibold text-blue-900 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" /> {distance}
                </span>
              </div>
            )}

            {/* Suchgebiet */}
            {searchArea !== "–" && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-800">Suchgebiet:</span>
                <span className="text-sm font-semibold text-blue-900">
                  {searchRadius} km um {searchArea}
                </span>
              </div>
            )}

            {/* Quelle */}
            <div className="flex items-center justify-between pt-1.5 border-t border-blue-200">
              <span className="text-xs font-medium text-blue-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Gefunden durch:
              </span>
              <span className="text-xs font-semibold text-blue-900">Vertriebo-Recherche</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lernhinweis (spezifisch) ── */}
      {learningHint && (
        <div className={`mt-3 flex items-start gap-2.5 p-3 rounded-lg border ${
          learningHint.type === 'reduced'
            ? "bg-amber-50 border-amber-200"
            : "bg-violet-50 border-violet-200"
        }`}>
          <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
            learningHint.type === 'reduced' ? "bg-amber-100" : "bg-violet-100"
          }`}>
            {learningHint.type === 'reduced'
              ? <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
              : <Brain className="w-3.5 h-3.5 text-violet-600" />
            }
          </div>
          <div>
            <p className={`text-xs font-bold ${learningHint.type === 'reduced' ? "text-amber-900" : "text-violet-900"}`}>
              Warum priorisiert?
            </p>
            <p className={`text-xs mt-0.5 leading-relaxed ${learningHint.type === 'reduced' ? "text-amber-700" : "text-violet-700"}`}>
              {learningHint.text}
            </p>
            <p className={`text-[10px] mt-1 ${learningHint.type === 'reduced' ? "text-amber-500" : "text-violet-500"}`}>
              Basierend auf {totalOutcomes} Rückmeldungen · Vertriebo erkennt Muster aus Ihrem Feedback
            </p>
          </div>
        </div>
      )}
    </div>
  );
}