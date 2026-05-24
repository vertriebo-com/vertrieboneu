import { Brain, TrendingUp, Star } from "lucide-react";

/**
 * LearningLoopBox
 * Zeigt den aktuellen Stand des lernenden Systems im Dashboard.
 * Basiert auf OrgLearnedSignals + total_outcomes_analyzed.
 */
export default function LearningLoopBox({ learnedSignals }) {
  if (!learnedSignals) return null;

  const total = learnedSignals.total_outcomes_analyzed || 0;
  const weight = total >= 15 ? "strong" : total >= 5 ? "light" : "none";

  const priorityCats = (() => {
    try { return JSON.parse(learnedSignals.priority_categories || "[]").slice(0, 3); }
    catch { return []; }
  })();

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
          Noch kein Feedback gespeichert. Bewerten Sie Leads als „Gewonnen" oder „Verloren", damit Vertriebo Ihre Präferenzen erlernt.
        </p>
        <div className="mt-3 flex items-center gap-1.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full bg-slate-100" />
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">0 / 5 Rückmeldungen bis erste Muster erkannt</p>
      </div>
    );
  }

  if (weight === "light") {
    return (
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-violet-600" />
          </div>
          <h3 className="text-sm font-bold text-violet-900">Erste Muster erkannt</h3>
          <span className="ml-auto text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full border border-violet-200">
            {total} Rückmeldungen
          </span>
        </div>
        <p className="text-xs text-violet-800 mb-2">Vertriebo lernt Ihre erfolgreichen Zielgruppen kennen.</p>
        {priorityCats.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {priorityCats.map((cat, i) => (
              <span key={i} className="text-[11px] bg-white border border-violet-200 text-violet-700 font-medium px-2 py-0.5 rounded-full">
                {cat}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-1.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i < Math.min(5, Math.round(total / 3)) ? "bg-violet-400" : "bg-violet-100"}`} />
          ))}
        </div>
        <p className="text-[10px] text-violet-600 mt-1.5">{total} / 15 Rückmeldungen bis starke Optimierung</p>
      </div>
    );
  }

  // weight === "strong"
  return (
    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-300 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
          <Star className="w-4 h-4 text-white fill-white" />
        </div>
        <h3 className="text-sm font-bold text-violet-900">Starke Optimierung aktiv</h3>
        <span className="ml-auto text-[10px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-full">
          {total} Rückmeldungen
        </span>
      </div>
      <p className="text-xs text-violet-800 mb-2">
        Ihre Recherchen werden jetzt automatisch auf Ihre erfolgreichsten Zielgruppen ausgerichtet.
      </p>
      {priorityCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {priorityCats.map((cat, i) => (
            <span key={i} className="text-[11px] bg-violet-100 border border-violet-300 text-violet-800 font-semibold px-2 py-0.5 rounded-full">
              ⭐ {cat}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}