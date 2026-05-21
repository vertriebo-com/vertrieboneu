/**
 * EngineBox – KI-Empfehlung für den Lead
 * Kundenfreundlich: keine technischen Rohdaten, keine "Phase 1" Labels
 */

import { useState } from "react";
import { Lightbulb, CheckCircle2, Clock, RefreshCw, AlertTriangle, ChevronRight, Sparkles, Zap } from "lucide-react";
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
      {/* Header mit Temperatur-Legende */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" /> Vertriebo KI
          </h3>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${tempConfig.badge}`}>{tempConfig.label}</span>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed mb-2">
          Vertriebo bewertet diesen Lead anhand von Zielgruppen-Fit, Kontaktdaten, Aufgaben und bisherigen Aktivitäten.
        </p>
        {/* Temperatur-Legende */}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1 text-red-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500"></span> Heiß
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1 text-amber-700 font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Warm
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1 text-slate-600 font-semibold">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span> Kalt
          </span>
        </div>
      </div>

      {/* Temperatur-Erklärung */}
      {analysis.temperature && analysis.temperature !== 'unknown' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-1">Was bedeutet {tempConfig.label}?</p>
          <p className="text-xs text-slate-700 leading-relaxed">
            {analysis.temperature === 'hot' && 'Heiß = sofort nachfassen. Dieser Lead zeigt klare Kaufsignale und sollte priorität behandelt werden.'}
            {analysis.temperature === 'warm' && 'Warm = guter Kontakt, aber noch nicht abschlussreif. Weiter qualifizieren und Vertrauen aufbauen.'}
            {analysis.temperature === 'cold' && 'Kalt = später kontaktieren oder erst Daten ergänzen. Aktuell keine Kaufsignale vorhanden.'}
          </p>
        </div>
      )}

      {/* Nächster bester Schritt - IMMER sichtbar */}
      {analysis.nextBestAction && Object.keys(analysis.nextBestAction).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 mb-1">Nächster Schritt</p>
          <p className="text-sm font-bold text-blue-900 leading-snug mb-1">{analysis.nextBestAction.title}</p>
          {analysis.nextBestAction.reason && (
            <p className="text-xs text-blue-700 leading-relaxed mb-2">
              {analysis.nextBestAction.reason}
            </p>
          )}
          {analysis.nextBestAction.due && (
            <p className="text-[10px] font-semibold text-blue-600 mb-2">
              Empfohlener Zeitpunkt: {DUE_LABELS[analysis.nextBestAction.due] || analysis.nextBestAction.due}
            </p>
          )}
          {analysis.nextBestAction.type === 'enrich' ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-blue-700 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Nutzen Sie „Daten ergänzen" oben auf der Seite
              </p>
              {/* Fehlende Infos als Aktionen */}
              {analysis.missingData && analysis.missingData.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {analysis.missingData.slice(0, 3).map((item, i) => {
                    const ACTION_MAP = {
                      contact_person: { label: "Ansprechpartner ergänzen", icon: "👤" },
                      concrete_need: { label: "Bedarf notieren", icon: "📝" },
                      phone: { label: "Telefonnummer suchen", icon: "📞" },
                      email: { label: "E-Mail-Adresse suchen", icon: "✉️" },
                      website: { label: "Website prüfen", icon: "🌐" },
                    };
                    const action = ACTION_MAP[item.field || item] || { label: item.field || item, icon: "📋" };
                    return (
                      <button
                        key={i}
                        onClick={() => handleAddTask()}
                        className="text-[10px] font-semibold bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors flex items-center gap-1"
                      >
                        <span>{action.icon}</span>
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : analysis.nextBestAction.type === 'call' || analysis.nextBestAction.type === 'email' ? (
            <div className="space-y-2">
              <Button size="sm" onClick={handleAddTask} className="w-full gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
                <Clock className="w-3.5 h-3.5" /> Als Aufgabe eintragen
              </Button>
              {/* Zusätzliche Aktionen für Kontakt */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleAddTask({ type: 'log', title: 'Gespräch dokumentieren' })}
                  className="text-[10px] font-semibold bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors flex items-center gap-1"
                >
                  <span>📝</span> Gespräch dokumentieren
                </button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={handleAddTask} className="mt-2 w-full gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
              <Clock className="w-3.5 h-3.5" /> Als Aufgabe eintragen
            </Button>
          )}
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
        <div className="space-y-3">
          {/* Positive Signale */}
          {analysis.topSignals.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-1.5">Das spricht für den Lead</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.topSignals.map((signal, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                    ✓ {SIGNAL_LABELS[signal.signal] || signal.signal}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fehlende Daten - verständlicher */}
          {analysis.missingData.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 mb-1.5">Diese Infos fehlen noch</p>
              <div className="space-y-1.5">
                {analysis.missingData.map((item, i) => {
                  const MISSING_TEXT = {
                    contact_person: "Wir brauchen den richtigen Ansprechpartner",
                    email: "E-Mail-Adresse fehlt für direkte Kommunikation",
                    phone: "Telefonnummer fehlt für direkten Anruf",
                    website: "Website-Informationen könnten helfen",
                    target_customer_confirmation: "Noch nicht bekannt, ob das Unternehmen zur Zielgruppe passt",
                    concrete_need: "Noch nicht bekannt, ob und wobei das Unternehmen Bedarf hat",
                  };
                  const raw = item.field || item;
                  return (
                    <div key={i} className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                      <span className="font-semibold">{MISSING_TEXT[raw] || raw}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Risiken - nur wenn vorhanden */}
          {analysis.riskSignals.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-600 mb-1.5">Mögliche Hindernisse</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.riskSignals.map((risk, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                    ⚠ {RISK_LABELS[risk.signal || risk] || risk.signal || risk}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer mit Erklärung */}
      <div className="pt-3 mt-3 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-slate-500">
            {company?.engine_last_analyzed_at
              ? `Letzte Analyse: ${new Date(company.engine_last_analyzed_at).toLocaleDateString('de-DE')}`
              : "Noch nicht analysiert"}
          </span>
          <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={analyzing}
            className="h-7 text-xs gap-1 bg-white border-slate-200 hover:bg-slate-50">
            <RefreshCw className={`w-3 h-3 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? "Analysiert…" : "Aktualisieren"}
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
            <Sparkles className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] text-slate-600 leading-relaxed">
                <strong>Aktualisieren</strong> bewertet den Lead neu basierend auf aktuellen Kontaktdaten, Aufgaben und Notizen.
              </p>
              <p className="text-[10px] text-slate-500">
                Ihr Feedback wird gespeichert und hilft uns bei der Verbesserung der Lead-Qualität.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <Zap className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-800 font-medium">
              Verbraucht 1 KI-Aktion aus Ihrem Monatskontingent
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}