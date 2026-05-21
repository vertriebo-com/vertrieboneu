/**
 * EngineBox – KI-Empfehlung für den Lead
 * Kundenfreundlich: keine technischen Rohdaten, keine "Phase 1" Labels
 */

import { useState } from "react";
import { Lightbulb, CheckCircle2, Clock, RefreshCw, AlertTriangle, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { getLeadTemperature, isHotLead, isWarmLead } from "@/utils/leadTemperature";

function safeParseJSON(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function safeParseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; }
}



function extractSignals(json) {
  const signals = json?.signals || json?.signal_groups || {};
  return {
    fit: signals.fit || json?.fit_signals || [],
    contactability: signals.contactability || json?.contactability_signals || [],
    engagement: signals.engagement || json?.engagement_signals || [],
    timing: signals.timing || json?.timing_signals || [],
    risk: signals.risk || json?.risk_signals || [],
    missing_data: signals.missing_data || json?.missing_data || []
  };
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\[Ihr Name\]/g, 'ich')
    .replace(/\[Ihr Unternehmen\]/g, 'unserem Unternehmen')
    .replace(/\[Dein Name\]/g, 'ich')
    .replace(/\[Dein Unternehmen\]/g, 'unserem Unternehmen')
    .replace(/\[Thema\]/g, 'Ihrem aktuellen Bedarf')
    .replace(/\[Service\]/g, 'unsere Leistungen')
    .replace(/\$\{.*?\}/g, '[...]')
    .replace(/^Cat:/i, '')
    .trim();
}

const SIGNAL_LABELS = {
  phone_available: "Telefonnummer vorhanden",
  email_available: "E-Mail vorhanden",
  website_available: "Website vorhanden",
  contact_person_available: "Ansprechpartner vorhanden",
  contact_log_exists: "Kontakt wurde bereits dokumentiert",
  industry_match: "Passt zu Ihrer Zielgruppe",
  recent_contact: "Kürzlich kontaktiert",
  new_lead: "Neuer Kontakt",
  task_due_today: "Aufgabe heute fällig",
  task_overdue: "Aufgabe überfällig",
  offer_requested: "Angebot wurde angefordert",
  offer_sent: "Angebot wurde versendet",
  appointment_scheduled: "Termin vereinbart",
  callback_scheduled: "Rückruf vereinbart",
};

const RISK_LABELS = {
  lost_status: "Status: Verloren",
  no_contact_data: "Keine Kontaktdaten vorhanden",
  unknown_decision_maker: "Entscheider noch unbekannt",
  no_response: "Bisher keine positive Reaktion",
  poor_fit: "Zielgruppenpassung unklar",
  poor_data_quality: "Unvollständige Datenbasis",
  long_time_no_contact: "Lange kein Kontakt mehr",
};

const DUE_LABELS = {
  today: "Heute", tomorrow: "Morgen", this_week: "Diese Woche", next_week: "Nächste Woche"
};

// Datenlücken-bewusste NBA-Auswertung
function getEffectiveNextBestAction(company, nba) {
  const hasTelefon = !!company?.telefon;
  const hasEmail = !!company?.email;

  // Wenn NBA "Anrufen" vorschlägt, aber kein Telefon da → Daten anreichern
  if (nba?.type === 'call' && !hasTelefon) {
    return {
      ...nba,
      title: "Telefonnummer suchen",
      reason: "Kein Telefon vorhanden – Kontaktdaten anreichern, um anrufen zu können.",
      type: "enrich",
      due: nba.due,
    };
  }
  // Wenn NBA "E-Mail senden" vorschlägt, aber keine E-Mail da → Daten anreichern
  if (nba?.type === 'email' && !hasEmail) {
    return {
      ...nba,
      title: "E-Mail-Adresse suchen",
      reason: "Keine E-Mail vorhanden – Kontaktdaten anreichern, um eine E-Mail zu senden.",
      type: "enrich",
      due: nba.due,
    };
  }
  return nba;
}

export default function EngineBox({ company, contactLogs = [], tasks = [], orgId, onAddTask, onReanalyze }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const engineJson = safeParseJSON(company?.engine_analysis_json);
  const hasAnalysis = !!engineJson || (company?.lead_temperature && company.lead_temperature !== "unknown");

  const signals = engineJson ? extractSignals(engineJson) : {};
  const canonicalTemp = getLeadTemperature(company);
  
  const analysis = engineJson ? {
    temperature: canonicalTemp,
    score: engineJson.vertriebo_score || company.lead_temperature_score || 0,
    summary: cleanText(engineJson.summary || ""),
    reason: cleanText(engineJson.reason || ""),
    nextBestAction: getEffectiveNextBestAction(company, engineJson.next_best_action || {}),
    topSignals: [
      ...((signals.fit || []).filter(s => s.present !== false)),
      ...((signals.contactability || []).filter(s => s.present !== false)),
      ...((signals.engagement || []).filter(s => s.present !== false)),
      ...((signals.timing || []).filter(s => s.present !== false)),
    ].slice(0, 4),
    riskSignals: (signals.risk || []).slice(0, 3),
    missingData: (signals.missing_data || []).slice(0, 3),
  } : {
    temperature: canonicalTemp,
    score: company?.lead_temperature_score || company.priority_score || 0,
    summary: "",
    reason: cleanText(company?.lead_temperature_reason || ""),
    nextBestAction: {},
    topSignals: [],
    riskSignals: safeParseArray(company?.risk_signals).slice(0, 3),
    missingData: safeParseArray(company?.missing_data).slice(0, 3),
  };

  const tempConfig = {
    hot:     { label: "Heiß",  bg: "bg-red-50 border-red-200",    text: "text-red-800",    badge: "bg-red-100 text-red-700 border-red-200" },
    warm:    { label: "Warm",  bg: "bg-amber-50 border-amber-200", text: "text-amber-800",  badge: "bg-amber-100 text-amber-700 border-amber-200" },
    cold:    { label: "Kalt",  bg: "bg-slate-50 border-slate-200", text: "text-slate-700",  badge: "bg-slate-100 text-slate-600 border-slate-200" },
    unknown: { label: "–",     bg: "bg-slate-50 border-slate-200", text: "text-slate-600",  badge: "bg-slate-100 text-slate-500 border-slate-200" },
  }[analysis.temperature] || { label: "–", bg: "bg-slate-50 border-slate-200", text: "text-slate-600", badge: "bg-slate-100 text-slate-500 border-slate-200" };

  // Mobile: Only show next best action + expand button by default
  const showAll = expanded;

  const handleAddTask = () => {
    if (onAddTask) {
      onAddTask(analysis.nextBestAction);
      toast.success("Aufgabe vorbereitet");
    }
  };

  const handleReanalyze = async () => {
    setAnalyzing(true);
    try {
      // P0-FIX: Org-ID Priorität: Props → company.organization_id → Owner-Org (kein Member-Fallback)
      let targetOrgId = orgId;
      if (!targetOrgId) {
        targetOrgId = company?.organization_id;
      }
      if (!targetOrgId) {
        const user = await base44.auth.me();
        if (user) {
          // MVP: 1 Account = 1 Organisation → nur Owner-Org prüfen
          const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
          targetOrgId = ownerOrgs?.[0]?.id;
        }
      }
      if (!targetOrgId) {
        toast.error("Keine Organisation gefunden");
        setAnalyzing(false);
        return;
      }
      await base44.functions.invoke("analyzeLeadEngine", {
        mode: "single",
        company_id: company.id,
        organization_id: targetOrgId
      });
      if (onReanalyze) await onReanalyze();
      toast.success("Analyse aktualisiert");
    } catch (error) {
      toast.error("Analyse fehlgeschlagen: " + error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Kein Analyse-Ergebnis
  if (!hasAnalysis) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-3">
          <Lightbulb className="w-3.5 h-3.5" /> Vertriebo KI
        </h3>
        <div className="text-center py-5">
          <Lightbulb className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600 mb-1">Noch keine KI-Analyse</p>
          <p className="text-xs text-slate-400 mb-3">Analysieren Sie diesen Lead für Empfehlungen und Priorisierung</p>
          <Button size="sm" onClick={handleReanalyze} disabled={analyzing} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? "Analysiert…" : "Jetzt analysieren"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-sm">
      {/* Header - Compact on mobile */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" /> Vertriebo KI
        </h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${tempConfig.badge}`}>{tempConfig.label}</span>
      </div>

      {/* Nächster bester Schritt - IMMER sichtbar */}
      {analysis.nextBestAction && Object.keys(analysis.nextBestAction).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 mb-1">Was jetzt tun?</p>
          <p className="text-sm font-bold text-blue-900 leading-snug">{analysis.nextBestAction.title}</p>
          {analysis.nextBestAction.reason && (
            <p className="text-xs text-blue-700 mt-1 leading-relaxed">{analysis.nextBestAction.reason}</p>
          )}
          {analysis.nextBestAction.due && (
            <p className="text-[10px] font-semibold text-blue-600 mt-1.5">
              Empfohlener Zeitpunkt: {DUE_LABELS[analysis.nextBestAction.due] || analysis.nextBestAction.due}
            </p>
          )}
          {analysis.nextBestAction.type === 'enrich' ? (
            <p className="mt-2 text-[10px] text-blue-700 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Nutzen Sie „Daten ergänzen" oben auf der Seite
            </p>
          ) : (
            <Button size="sm" onClick={handleAddTask} className="mt-2 w-full gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
              <Clock className="w-3.5 h-3.5" /> Als Aufgabe eintragen
            </Button>
          )}
        </div>
      )}

      {/* Zusammenfassung - nur wenn vorhanden */}
      {analysis.summary && (
        <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100 mb-2">
          {analysis.summary}
        </div>
      )}

      {/* Expand Button - nur mobil und wenn mehr Inhalt da ist */}
      {(analysis.topSignals.length > 0 || analysis.riskSignals.length > 0 || analysis.missingData.length > 0) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 mb-2 transition-colors"
        >
          {showAll ? "Weniger anzeigen" : "Mehr Details anzeigen"}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAll ? "rotate-90" : ""}`} />
        </button>
      )}

      {/* Erweiterte Details - nur wenn expanded */}
      {showAll && (
        <div className="space-y-2">
          {/* Positive Signale */}
          {analysis.topSignals.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-1.5">Gute Zeichen</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.topSignals.map((signal, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                    ✓ {SIGNAL_LABELS[signal.signal] || signal.signal}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Risiken */}
          {analysis.riskSignals.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-600 mb-1.5">Achtung</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.riskSignals.map((risk, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                    ⚠ {RISK_LABELS[risk.signal || risk] || risk.signal || risk}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fehlende Daten */}
          {analysis.missingData.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Noch nicht erfasst</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.missingData.map((item, i) => {
                  const MISSING = {
                    contact_person: "Ansprechpartner",
                    email: "E-Mail",
                    phone: "Telefon",
                    website: "Website",
                    target_customer_confirmation: "Zielgruppen-Match",
                    concrete_need: "Konkreter Bedarf",
                  };
                  const raw = item.field || item;
                  return (
                    <span key={i} className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                      {MISSING[raw] || raw}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer - Neu analysieren */}
      <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          {company?.engine_last_analyzed_at
            ? `Analysiert: ${new Date(company.engine_last_analyzed_at).toLocaleDateString('de-DE')}`
            : ""}
        </span>
        <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={analyzing}
          className="h-7 text-xs gap-1 bg-white border-slate-200">
          <RefreshCw className={`w-3 h-3 ${analyzing ? 'animate-spin' : ''}`} />
          {analyzing ? "Läuft…" : "Aktualisieren"}
        </Button>
      </div>
    </div>
  );
}