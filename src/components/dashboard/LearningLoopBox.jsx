import { Brain, TrendingUp, Star, Search, MinusCircle } from "lucide-react";

/**
 * LearningLoopBox
 * Zeigt den aktuellen Stand des lernenden Systems im Dashboard.
 * 3 Bereiche: Beste Zielgruppen · Starke Suchbegriffe · Weniger passend
 */
export default function LearningLoopBox({ learnedSignals }) {
  if (!learnedSignals) return null;

  const total = learnedSignals.total_outcomes_analyzed || 0;
  const weight = total >= 15 ? "strong" : total >= 5 ? "light" : "none";

  // ── Daten parsen (unterstützt object[] und legacy string[]) ──
  const parseLearningArray = (json) => {
    try { return JSON.parse(json || "[]"); } catch { return []; }
  };

  // Normalisiert string oder object → { category: string }
  const normalizeCat = (item) =>
    typeof item === "string" ? { category: item } : item;

  // Normalisiert string oder object → { keyword, score, total_count, won_count, relevant_count, not_relevant_count }
  const normalizeKw = (item) =>
    typeof item === "string"
      ? { keyword: item, score: 1, total_count: 1, won_count: 0, relevant_count: 1, not_relevant_count: 0 }
      : item;

  const priorityCats = parseLearningArray(learnedSignals.priority_categories)
    .map(normalizeCat)
    .filter(c => (c.score == null || c.score > 50) && (c.won > 0 || c.relevant > 0 || c.score == null))
    .slice(0, 3);

  const boostedKws = parseLearningArray(learnedSignals.boosted_keywords)
    .map(normalizeKw)
    .filter(k => k.keyword && (k.score == null || k.score > 0) && (k.total_count == null || k.total_count >= 1))
    .slice(0, 5);

  const excludedCats = parseLearningArray(learnedSignals.excluded_categories)
    .map(normalizeCat)
    .slice(0, 3);

  const hasAnyData = priorityCats.length > 0 || boostedKws.length > 0 || excludedCats.length > 0;

  // ── Empty State (none) ──
  if (weight === "none") {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
            <Brain className="w-4 h-4 text-violet-500" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">System das mitlernt</h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Noch nicht genug Feedback. Markieren Sie Leads als relevant, gewonnen oder ungeeignet, damit Vertriebo erste Muster erkennt.
        </p>
        <div className="mt-3 flex items-center gap-1.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full bg-slate-100" />
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">{total} / 5 Rückmeldungen bis erste Muster erkannt</p>
      </div>
    );
  }

  const isStrong = weight === "strong";
  const borderColor = isStrong ? "border-violet-300" : "border-violet-200";
  const bgGradient = isStrong ? "from-violet-50 to-indigo-50" : "from-violet-50 to-purple-50";
  const titleColor = "text-violet-900";
  const bodyColor = "text-violet-800";

  return (
    <div className={`bg-gradient-to-r ${bgGradient} border ${borderColor} rounded-xl p-4 shadow-sm`}>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg ${isStrong ? "bg-violet-600" : "bg-violet-100"} flex items-center justify-center`}>
          {isStrong
            ? <Star className="w-4 h-4 text-white fill-white" />
            : <TrendingUp className="w-4 h-4 text-violet-600" />
          }
        </div>
        <h3 className={`text-sm font-bold ${titleColor}`}>
          {isStrong ? "Starke Optimierung aktiv" : "Erste Muster erkannt"}
        </h3>
        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isStrong ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-700 border border-violet-200"}`}>
          {total} Rückmeldungen
        </span>
      </div>

      <p className={`text-xs ${bodyColor} mb-3 leading-relaxed`}>
        {isStrong
          ? "Starke Optimierung aktiv: Vertriebo berücksichtigt Ihre erfolgreichsten Zielgruppen und Suchbegriffe automatisch bei neuen Recherchen."
          : "Erste Muster erkannt: Vertriebo testet, welche Zielgruppen und Suchbegriffe besser funktionieren."
        }
      </p>

      {!hasAnyData ? (
        <p className="text-xs text-violet-600 italic">Noch keine konkreten Muster vorhanden.</p>
      ) : (
        <div className="space-y-3">

          {/* A) Beste Zielgruppen */}
          {priorityCats.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 mb-1.5 flex items-center gap-1">
                <Star className="w-3 h-3" /> Beste Zielgruppen
              </p>
              <div className="flex flex-wrap gap-1.5">
                {priorityCats.map((cat, i) => (
                  <span key={i} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    isStrong
                      ? "bg-violet-100 border-violet-300 text-violet-800"
                      : "bg-white border-violet-200 text-violet-700"
                  }`}>
                    {isStrong ? "⭐ " : ""}{cat.category || cat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* B) Starke Suchbegriffe */}
          {boostedKws.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 mb-1.5 flex items-center gap-1">
                <Search className="w-3 h-3" /> Starke Suchbegriffe
              </p>
              <div className="space-y-1">
                {boostedKws.map((kw, i) => {
                  const label = kw.won_count > 0
                    ? `${kw.won_count}× gewonnen`
                    : kw.relevant_count > 0
                      ? `${kw.relevant_count}× relevant`
                      : `Score ${kw.score}`;
                  return (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-violet-900">{kw.keyword}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        kw.won_count > 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>{label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-violet-600 mt-1.5 leading-relaxed">
                Diese Begriffe führten bereits zu positiven Rückmeldungen und werden bei künftigen Recherchen stärker berücksichtigt.
              </p>
            </div>
          )}

          {/* C) Weniger passend */}
          {excludedCats.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 mb-1.5 flex items-center gap-1">
                <MinusCircle className="w-3 h-3" /> Weniger passend
              </p>
              <div className="flex flex-wrap gap-1.5">
                {excludedCats.map((cat, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 line-through decoration-slate-400">
                    {cat.category || cat}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-violet-600 mt-1.5 leading-relaxed">
                Diese Kategorien wurden häufiger als ungeeignet markiert und werden künftig reduziert.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Progress Bar (nur light) */}
      {!isStrong && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i < Math.min(5, Math.round(total / 3)) ? "bg-violet-400" : "bg-violet-100"}`} />
            ))}
          </div>
          <p className="text-[10px] text-violet-600 mt-1.5">{total} / 15 Rückmeldungen bis starke Optimierung</p>
        </div>
      )}
    </div>
  );
}