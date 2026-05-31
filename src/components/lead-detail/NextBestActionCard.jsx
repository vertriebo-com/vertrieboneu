/**
 * NextBestActionCard – bodenständige Handlungsempfehlung
 * Basiert auf Status, Kontaktdaten und Lead-Signalen.
 * Keine Fake-KI-Behauptungen.
 */
import { Phone, Mail, Sparkles, Target, Calendar, MessageSquare, CheckCircle2, Star } from "lucide-react";
import { isHotLead } from "@/utils/leadTemperature";

function getRecommendation(company) {
  const hasTelefon = !!company?.telefon;
  const hasEmail = !!company?.email;
  const isHot = isHotLead(company);
  const status = company?.status;

  if (status === "Rückruf") {
    return {
      title: "Rückruf durchführen",
      desc: "Es steht ein Rückruf aus. Jetzt anrufen und Gespräch dokumentieren.",
      action: "call",
    };
  }
  if (status === "Termin") {
    return {
      title: "Termin vorbereiten",
      desc: "Ein Termin ist vereinbart. Bereiten Sie sich vor und notieren Sie Gesprächspunkte.",
      action: "task",
    };
  }
  if (status === "Angebot") {
    return {
      title: "Angebot nachfassen",
      desc: "Ein Angebot wurde erstellt oder besprochen. Jetzt nachfassen und Entscheidung klären.",
      action: "call",
    };
  }
  if (hasTelefon && isHot) {
    return {
      title: "Heute anrufen",
      desc: "Dieser Lead zeigt starke Signale – ein Anruf jetzt hat hohe Erfolgschancen.",
      action: "call",
    };
  }
  if (!hasTelefon && !hasEmail) {
    return {
      title: "Kontaktdaten ergänzen",
      desc: "Ohne Telefon oder E-Mail ist eine direkte Kontaktaufnahme nicht möglich. Daten jetzt suchen.",
      action: "enrich",
    };
  }
  if (!company?.ki_recommendation && !company?.engine_analysis_json) {
    return {
      title: "Lead bewerten",
      desc: "Noch keine Bewertung vorhanden. Ihr Feedback hilft Vertriebo, künftige Recherchen zu verbessern.",
      action: "feedback",
    };
  }
  return {
    title: "Kontakt aufnehmen",
    desc: "Nehmen Sie Kontakt auf und dokumentieren Sie das Gespräch.",
    action: "call",
  };
}

function getReasonBullets(company) {
  const bullets = [];
  if (isHotLead(company)) bullets.push("Heißer Lead – starke Signale vorhanden");
  if ((company?.relevance_score || 0) >= 70) bullets.push(`Hoher Relevanz-Score (${company.relevance_score})`);
  if (company?.matched_target_customer_type) bullets.push(`Passt zu: ${company.matched_target_customer_type}`);
  if (company?.telefon) bullets.push("Telefonnummer vorhanden – direkter Anruf möglich");
  if (company?.email) bullets.push("E-Mail-Adresse vorhanden");
  if (company?.status === "Rückruf") bullets.push("Offener Rückruf wartet auf Erledigung");
  if (company?.status === "Termin") bullets.push("Termin ist eingetragen");
  if (company?.status === "Angebot") bullets.push("Angebot in Arbeit – Entscheidung steht aus");
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  if (company?.created_date && new Date(company.created_date) > weekAgo) bullets.push("Neue Firma aus Recherche");
  return bullets.slice(0, 4);
}

export default function NextBestActionCard({ company, onCall, onAddTask, onAddLog, onEnrich, onFeedback }) {
  if (!company) return null;

  const rec = getRecommendation(company);
  const bullets = getReasonBullets(company);

  const actionBg = {
    call:     "bg-emerald-600 hover:bg-emerald-700",
    task:     "bg-blue-600 hover:bg-blue-700",
    enrich:   "bg-amber-600 hover:bg-amber-700",
    feedback: "bg-violet-600 hover:bg-violet-700",
  }[rec.action] || "bg-blue-600 hover:bg-blue-700";

  const actionIcon = {
    call:     Phone,
    task:     Calendar,
    enrich:   Sparkles,
    feedback: Target,
  }[rec.action] || Phone;

  const ActionIcon = actionIcon;

  const handlePrimary = () => {
    if (rec.action === "call" && company.telefon) onCall?.();
    else if (rec.action === "task") onAddTask?.();
    else if (rec.action === "enrich") onEnrich?.();
    else if (rec.action === "feedback") onFeedback?.();
    else onCall?.();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Target className="w-4 h-4 text-blue-600 shrink-0" />
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Nächster sinnvoller Schritt</p>
      </div>

      <div className="p-4 space-y-3">
        {/* Empfehlung */}
        <div>
          <p className="text-base font-bold text-slate-900 leading-tight">{rec.title}</p>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{rec.desc}</p>
        </div>

        {/* Warum-Bullets */}
        {bullets.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Warum?</p>
            {bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">{b}</p>
              </div>
            ))}
          </div>
        )}

        {/* Primär-Button */}
        <button
          onClick={handlePrimary}
          className={`w-full flex items-center justify-center gap-2 h-9 rounded-xl ${actionBg} text-white text-sm font-bold transition-colors`}
        >
          <ActionIcon className="w-4 h-4" />
          {rec.title}
        </button>

        {/* Sekundäre Aktionen */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={onAddLog}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold leading-none">Kontakt</span>
          </button>
          <button
            onClick={onAddTask}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold leading-none">Aufgabe</span>
          </button>
          <button
            onClick={onEnrich}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold leading-none">Ergänzen</span>
          </button>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
          Vertriebo empfiehlt diesen Schritt auf Basis von Status, Kontaktdaten und Lead-Signalen.
        </p>
      </div>
    </div>
  );
}