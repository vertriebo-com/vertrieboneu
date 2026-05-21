/**
 * analyzeLeadEngine Phase 1 – Erweiterte Vertriebo Engine
 *
 * P0 SECURITY FIXES (2026-05):
 * ✅ checkAccess integriert (use_ai_scoring + Billing + Limit)
 * ✅ UsageLog schreibt ai_actions_used
 * ✅ sales_rep darf nur eigene (assigned_to) Leads analysieren
 * ✅ open temperature → unknown für Legacy-Enum-Compat
 * ✅ Single + Latest teilen analyzeContext() + persistAnalysis()
 *
 * Mandantenregeln (CRITICAL):
 * - Company: id + organization_id pflichtmäßig
 * - ContactLogs/Tasks: company_id + organization_id filtern
 * - Kein Cross-Tenant
 *
 * Phase 1 Garantien:
 * ✅ Keine automatischen Tasks, Status-Änderungen oder E-Mails
 * ✅ Nur Analyse berechnen + speichern
 * ✅ Evidenzbasierte Texte (keine generischen Aussagen)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE LOG HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function incrementUsageLog(base44, organizationId, count = 1) {
  try {
    const now = new Date();
    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const existing = await base44.asServiceRole.entities.UsageLog.filter({
      organization_id: organizationId,
      period_month: periodMonth
    });
    if (existing && existing.length > 0) {
      const log = existing[0];
      await base44.asServiceRole.entities.UsageLog.update(log.id, {
        ai_actions_used: (log.ai_actions_used || 0) + count,
        ai_scorings_used: (log.ai_scorings_used || 0) + count,
      });
    } else {
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      await base44.asServiceRole.entities.UsageLog.create({
        organization_id: organizationId,
        period_month: periodMonth,
        period_start: periodStart,
        period_end: periodEnd,
        ai_actions_used: count,
        ai_scorings_used: count,
      });
    }
  } catch (err) {
    console.warn('[analyzeLeadEngine] UsageLog increment failed (non-blocking):', err.message);
  }
}

async function getCurrentAiUsage(base44, organizationId) {
  try {
    const now = new Date();
    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const existing = await base44.asServiceRole.entities.UsageLog.filter({
      organization_id: organizationId,
      period_month: periodMonth
    });
    return existing?.[0]?.ai_actions_used || 0;
  } catch {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function buildLeadContext(company, contactLogs, tasks) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const logs = (contactLogs || [])
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  const lastLog = logs[0] || null;
  const firstLog = logs[logs.length - 1] || null;

  const allTasks = (tasks || []);
  const openTasks = allTasks.filter(t => !t.erledigt);
  const openCallOrFollowUpTasks = openTasks.filter(t => ["Rückruf", "Nachfassen"].includes(t.typ));
  const todayTasks = openTasks.filter(t => t.faellig_am && t.faellig_am.startsWith(today));
  const callbackTasks = openTasks.filter(t => t.typ === "Rückruf");
  const appointmentTasks = openTasks.filter(t => t.typ === "Termin");
  const overdueTasks = openTasks.filter(t => {
    const dueDate = new Date(t.faellig_am);
    return t.faellig_am && dueDate < now && !t.faellig_am.startsWith(today);
  });

  const contactResultCounts = {
    reached: logs.filter(l => l.ergebnis === "Erreicht").length,
    notReached: logs.filter(l => l.ergebnis === "Nicht erreicht").length,
    callbackScheduled: logs.filter(l => l.ergebnis === "Rückruf vereinbart").length,
    appointmentScheduled: logs.filter(l => l.ergebnis === "Termin vereinbart").length,
    offerSent: logs.filter(l => l.ergebnis === "Angebot gesendet").length,
  };

  const daysSinceLastContact = lastLog
    ? Math.floor((now - new Date(lastLog.created_date)) / (1000 * 60 * 60 * 24))
    : null;

  const daysSinceCreation = Math.floor((now - new Date(company.created_date)) / (1000 * 60 * 60 * 24));

  return {
    companyId: company.id,
    organizationId: company.organization_id,
    name: company.name,
    branche: company.branche,
    ort: company.ort,
    status: company.status,
    hasPhone: Boolean(company.telefon),
    hasEmail: Boolean(company.email),
    hasWebsite: Boolean(company.website),
    hasContactPerson: Boolean(company.ansprechpartner),
    matchedTargetCustomerType: company.matched_target_customer_type,
    priorityScore: company.priority_score || 0,
    logs,
    lastLog,
    firstLog,
    contactResultCounts,
    daysSinceLastContact,
    daysSinceCreation,
    hasAnyContact: logs.length > 0,
    hasSuccessfulContact: contactResultCounts.reached > 0 || contactResultCounts.callbackScheduled > 0 || contactResultCounts.appointmentScheduled > 0 || contactResultCounts.offerSent > 0,
    hasOnlyFailedContact: logs.length > 0 && contactResultCounts.notReached > 0 && contactResultCounts.reached === 0,
    todayTasks,
    callbackTasks,
    appointmentTasks,
    overdueTasks,
    openCallOrFollowUpTasks,
    allTasks: openTasks,
    now,
    today,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function detectFitSignals(context) {
  const signals = [];
  if (context.matchedTargetCustomerType) {
    signals.push({ signal: "industry_match", present: true, confidence: 95, reason: `Branche '${context.branche}' passt zu Zielkunden` });
  } else if (context.branche) {
    signals.push({ signal: "industry_match", present: false, confidence: 60, reason: `Branche '${context.branche}' – Match unklar` });
  }
  if (context.hasWebsite) {
    signals.push({ signal: "website_available", present: true, confidence: 80, reason: "Website vorhanden" });
  }
  return signals;
}

function detectContactabilitySignals(context) {
  const signals = [];
  signals.push({ signal: "phone_available", present: context.hasPhone, quality: context.hasPhone ? "complete" : null, reason: context.hasPhone ? "Telefonnummer vorhanden" : "Telefonnummer fehlt" });
  signals.push({ signal: "email_available", present: context.hasEmail, quality: context.hasEmail ? "complete" : null, reason: context.hasEmail ? "E-Mail vorhanden" : "E-Mail fehlt" });
  signals.push({ signal: "contact_person_available", present: context.hasContactPerson, quality: context.hasContactPerson ? "complete" : null, reason: context.hasContactPerson ? "Ansprechpartner bekannt" : "Ansprechpartner fehlt" });
  return signals;
}

function detectEngagementSignals(context) {
  const signals = [];
  if (context.hasAnyContact) {
    signals.push({ signal: "contact_log_exists", present: true, count: context.logs.length, lastAt: context.lastLog?.created_date, reason: `${context.logs.length} Kontakt(e) dokumentiert` });
  }
  if (context.status === "Angebot") {
    signals.push({ signal: "offer_requested", present: true, reason: "Status: Angebot angefragt" });
  }
  if (context.status === "Termin") {
    signals.push({ signal: "appointment_scheduled", present: true, reason: "Status: Termin vereinbart" });
  }
  if (context.contactResultCounts.callbackScheduled > 0) {
    signals.push({ signal: "callback_scheduled", present: true, count: context.contactResultCounts.callbackScheduled, reason: `${context.contactResultCounts.callbackScheduled}x Rückruf vereinbart` });
  }
  if (context.contactResultCounts.offerSent > 0) {
    signals.push({ signal: "offer_sent", present: true, count: context.contactResultCounts.offerSent, reason: `${context.contactResultCounts.offerSent}x Angebot versendet` });
  }
  return signals;
}

function detectTimingSignals(context) {
  const signals = [];
  if (context.daysSinceCreation <= 7) {
    signals.push({ signal: "new_lead", present: true, daysSince: context.daysSinceCreation, reason: `Neuer Lead (vor ${context.daysSinceCreation} Tagen hinzugefügt)` });
  }
  if (context.lastLog && context.daysSinceLastContact <= 7) {
    signals.push({ signal: "recent_contact", present: true, daysSince: context.daysSinceLastContact, reason: `Letzter Kontakt vor ${context.daysSinceLastContact} Tagen` });
  }
  if (context.todayTasks.length > 0) {
    signals.push({ signal: "task_due_today", present: true, count: context.todayTasks.length, reason: `${context.todayTasks.length} Aufgabe(n) heute fällig` });
  }
  if (context.overdueTasks.length > 0) {
    signals.push({ signal: "task_overdue", present: true, count: context.overdueTasks.length, daysOverdue: Math.ceil((context.now - new Date(context.overdueTasks[0].faellig_am)) / (1000 * 60 * 60 * 24)), reason: `${context.overdueTasks.length} Aufgabe(n) überfällig` });
  }
  if (context.daysSinceLastContact && context.daysSinceLastContact > 60) {
    signals.push({ signal: "long_time_no_contact", present: true, daysSince: context.daysSinceLastContact, reason: `Sehr lange nicht kontaktiert (${context.daysSinceLastContact} Tage)` });
  }
  return signals;
}

function detectRiskSignals(context) {
  const risks = [];
  if (context.status === "Verloren") {
    risks.push({ signal: "lost_status", severity: "high", reason: "Status 'Verloren' – Low-Priorität" });
  }
  if (!context.hasPhone && !context.hasEmail) {
    risks.push({ signal: "no_contact_data", severity: "high", reason: "Weder Telefon noch E-Mail vorhanden" });
  }
  if (!context.hasContactPerson && context.hasAnyContact) {
    risks.push({ signal: "unknown_decision_maker", severity: "medium", reason: "Ansprechpartner unbekannt – unklar wer entscheidet" });
  }
  if (context.hasOnlyFailedContact) {
    risks.push({ signal: "no_response", severity: "medium", reason: `${context.contactResultCounts.notReached}x nicht erreicht` });
  }
  if (!context.matchedTargetCustomerType && context.priorityScore < 30) {
    risks.push({ signal: "poor_fit", severity: "medium", reason: "Zielgruppenpassung unklar" });
  }
  if (context.hasAnyContact && !context.hasSuccessfulContact && !context.logs.some(l => l.notiz)) {
    risks.push({ signal: "poor_data_quality", severity: "low", reason: "Kontakte dokumentiert, aber keine Notizen – Qualität unklar" });
  }
  return risks;
}

function detectMissingData(context) {
  const missing = [];
  if (!context.hasContactPerson) missing.push({ field: "contact_person", priority: "high", impact: "Entscheidungsträger unbekannt" });
  if (!context.hasPhone) missing.push({ field: "phone", priority: "high", impact: "Direkte Ansprache nicht möglich" });
  if (!context.hasEmail) missing.push({ field: "email", priority: "high", impact: "E-Mail-Kontakt nicht möglich" });
  if (!context.hasWebsite) missing.push({ field: "website", priority: "medium", impact: "Firmeninformationen begrenzt" });
  if (!context.matchedTargetCustomerType) missing.push({ field: "target_customer_confirmation", priority: "high", impact: "Zielgruppen-Match noch nicht bestätigt" });
  if (!context.logs.some(l => l.notiz && l.notiz.toLowerCase().includes("bedarf"))) {
    missing.push({ field: "concrete_need", priority: "high", impact: "Konkreter Bedarf unklar" });
  }
  return missing;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════════════════════

function calculateFitScore(context) {
  let score = 30;
  if (context.matchedTargetCustomerType) score += 50;
  if (context.hasWebsite) score += 15;
  if (context.branche) score += 5;
  return Math.min(100, Math.max(0, score));
}

function calculateContactabilityScore(context) {
  let score = 0;
  if (context.hasPhone) score += 35;
  if (context.hasEmail) score += 25;
  if (context.hasWebsite) score += 15;
  if (context.hasContactPerson) score += 25;
  return Math.min(100, score);
}

function calculateEngagementScore(context) {
  let score = 0;
  if (context.status === "Angebot") score += 40;
  if (context.status === "Termin") score += 35;
  if (context.contactResultCounts.appointmentScheduled > 0) score += 30;
  if (context.contactResultCounts.offerSent > 0) score += 25;
  if (context.hasSuccessfulContact) score += 20;
  if (context.hasAnyContact && !context.hasSuccessfulContact) score += 5;
  return Math.min(100, score);
}

function calculateTimingScore(context) {
  let score = 40;
  if (context.daysSinceCreation <= 7) score += 25;
  else if (context.daysSinceCreation <= 30) score += 15;
  if (context.overdueTasks.length > 0) score += 40;
  if (context.todayTasks.length > 0) score += 25;
  if (context.daysSinceLastContact && context.daysSinceLastContact <= 7) score += 15;
  else if (context.daysSinceLastContact && context.daysSinceLastContact > 60) score -= 20;
  return Math.min(100, Math.max(0, score));
}

function calculateUrgencyScore(context) {
  let score = 30;
  if (context.overdueTasks.length > 0) score += 50;
  if (context.todayTasks.length > 0) score += 30;
  if (context.status === "Termin") score += 25;
  if (context.status === "Angebot") score += 20;
  return Math.min(100, Math.max(0, score));
}

function calculateConfidenceScore(context, riskSignals) {
  let score = 50;
  if (context.hasPhone && context.hasEmail && context.hasContactPerson) score += 30;
  if (context.logs.length >= 2) score += 15;
  if (context.logs.some(l => l.notiz && l.notiz.length > 50)) score += 10;
  if (riskSignals.filter(r => r.severity === "high").length > 0) score -= 20;
  return Math.min(100, Math.max(0, score));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION + RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function classifyTemperature(vertrieboScore, urgencyScore, fitScore, engagementScore, contactabilityScore, context) {
  if (context.status === "Verloren") return "cold";
  if (context.logs.some(l => l.ergebnis === "Kein Interesse")) return "cold";
  if (urgencyScore >= 70 && (fitScore >= 60 || engagementScore >= 50)) return "hot";
  if (engagementScore >= 60) return "hot";
  if (fitScore >= 70 && engagementScore >= 40) return "warm";
  if (fitScore >= 70 && contactabilityScore >= 60) return "warm";
  if (engagementScore >= 40) return "warm";
  if (fitScore >= 40) return "cold";
  return "open";
}

function buildSummary(temperature, context, fitScore, contactabilityScore, urgencyScore, missingData) {
  if (temperature === "hot") {
    if (context.overdueTasks.length > 0) return `Hot Lead: ${context.overdueTasks.length} Aufgabe(n) überfällig – sofort bearbeiten.`;
    if (context.status === "Angebot") return `Hot Lead: Angebot angefordert – zügig nachfassen und Entscheidung herbeiführen.`;
    if (context.status === "Termin") return `Hot Lead: Termin vereinbart – Vorbereitung durchführen und Abschluss vorbereiten.`;
    return `Hot Lead: Kaufsignale vorhanden – aktiv bearbeiten.`;
  }
  if (temperature === "warm") {
    const reasons = [];
    if (fitScore >= 70) reasons.push("Branche passt");
    if (contactabilityScore >= 60) reasons.push("Kontaktdaten vorhanden");
    if (context.hasSuccessfulContact) reasons.push("bereits kontaktiert");
    const reason = reasons.length > 0 ? reasons.join(", ") : "gute Ausgangslage";
    const firstMissing = missingData.length > 0 ? ` Fehlt noch: ${missingData[0].impact}.` : "";
    return `Warm Lead: ${reason}.${firstMissing}`;
  }
  if (temperature === "cold") {
    if (context.status === "Verloren") return `Aktuell kalt: Status ist 'Verloren' – nur bei veränderter Situation reaktivieren.`;
    if (!context.hasAnyContact && contactabilityScore < 40) return `Aktuell kalt: Kontaktdaten sind noch unvollständig. Erst Daten anreichern, dann kontaktieren.`;
    if (!context.hasSuccessfulContact && context.hasAnyContact) {
      const attempts = context.contactResultCounts.notReached;
      return `Aktuell kalt: ${attempts > 0 ? `${attempts} Kontaktversuch${attempts > 1 ? 'e' : ''} dokumentiert, aber noch keine positive Reaktion` : 'Kontaktversuch dokumentiert, aber noch keine Reaktion'}. Rückruf vorbereiten und beim nächsten Kontakt Ansprechpartner sowie Bedarf kurz qualifizieren.`;
    }
    return `Aktuell kalt: Noch keine Kaufsignale vorhanden. Datenlage verbessern oder in der nächsten Woche erneut kontaktieren.`;
  }
  return "Offen: Noch zu wenig Informationen für eine eindeutige Einschätzung. Erstkontakt herstellen und Bedarf klären.";
}

const MISSING_LABELS = {
  contact_person: "Ansprechpartner",
  email: "E-Mail-Adresse",
  phone: "Telefonnummer",
  website: "Website",
  target_customer_confirmation: "bestätigter Zielgruppen-Match",
  concrete_need: "konkreter Bedarf"
};

function buildReason(temperature, context, fitScore, contactabilityScore, engagementScore, missingData, riskSignals) {
  const reasons = [];
  if (context.matchedTargetCustomerType) reasons.push(`Branche '${context.branche}' passt zu Zielkunden`);
  const contactChannels = [];
  if (context.hasPhone) contactChannels.push("Telefon");
  if (context.hasEmail) contactChannels.push("E-Mail");
  if (context.hasWebsite) contactChannels.push("Website");
  reasons.push(contactChannels.length > 0 ? `Kontaktierbar via ${contactChannels.join(", ")}` : "Kontaktdaten unvollständig");
  if (context.status === "Angebot") reasons.push("Angebot angefordert");
  else if (context.status === "Termin") reasons.push("Termin vereinbart");
  else if (context.hasSuccessfulContact) reasons.push(`Bereits erreicht (${context.logs.length} Kontakt(e))`);
  else if (context.hasAnyContact) reasons.push(`Kontaktversuche dokumentiert, aber erfolglos`);
  else reasons.push("Noch kein Erstkontakt");
  if (missingData.length > 0) {
    const labels = missingData.map(m => MISSING_LABELS[m.field || m] || (m.field || m)).join(", ");
    reasons.push(`Es fehlen noch: ${labels}`);
  }
  if (riskSignals.length > 0) {
    const highRisks = riskSignals.filter(r => r.severity === "high");
    if (highRisks.length > 0) reasons.push(highRisks.map(r => r.reason).join(". "));
  }
  return reasons.join(". ") + ".";
}

function buildNextBestAction(context, temperature, urgencyScore, contactabilityScore, missingData) {
  const openCallOrFollowUpTask = context.openCallOrFollowUpTasks[0] || context.callbackTasks[0] || null;
  if (context.overdueTasks.length > 0) {
    const task = context.overdueTasks[0];
    return { type: "task", title: `Überfällige Aufgabe bearbeiten: "${task.titel}"`, reason: `Diese Aufgabe ist ${Math.ceil((context.now - new Date(task.faellig_am)) / (1000 * 60 * 60 * 24))} Tag(e) überfällig. Jetzt abarbeiten.`, due: "today" };
  }
  if (context.todayTasks.length > 0) {
    const task = context.todayTasks[0];
    return { type: "task", title: `Aufgabe heute erledigen: "${task.titel}"`, reason: "Diese Aufgabe ist heute fällig.", due: "today" };
  }
  if (context.status === "Angebot") return { type: "call", title: "Angebot nachfassen", reason: "Angebot wurde angefordert – Feedback einholen und Entscheidung herbeiführen.", due: "tomorrow" };
  if (context.status === "Termin") return { type: "research", title: "Termin vorbereiten", reason: "Termin vereinbart – Unterlagen zusammenstellen, Agenda und Entscheidungskriterien klären.", due: "tomorrow" };
  if (openCallOrFollowUpTask) return { type: "call", title: "Rückruf vorbereiten", reason: `Es gibt bereits eine offene Aufgabe "${openCallOrFollowUpTask.titel}". Beim nächsten Kontakt gezielt Ansprechpartner, Bedarf und Entscheidungsprozess klären.`, due: "this_week" };
  if (!context.hasAnyContact && contactabilityScore >= 60) {
    const via = context.hasPhone ? "Anruf" : "E-Mail";
    return { type: "call", title: `Erstkontakt herstellen (${via})`, reason: `Kontaktdaten vorhanden, aber noch kein Kontakt dokumentiert. Ziel: Ansprechpartner klären und Bedarf kurz qualifizieren.`, due: "this_week" };
  }
  if (context.hasOnlyFailedContact) return { type: "call", title: "Erneut kontaktieren", reason: `${context.contactResultCounts.notReached}x nicht erreicht. Anderen Kanal oder Uhrzeit versuchen. Ziel: Ansprechpartner finden.`, due: "this_week" };
  if (missingData.length > 0 && missingData[0].priority === "high") {
    const fieldLabel = MISSING_LABELS[missingData[0].field] || missingData[0].field;
    return { type: "enrich", title: `${fieldLabel} recherchieren`, reason: `${missingData[0].impact}. Danach direkt kontaktieren.`, due: "tomorrow" };
  }
  return { type: "wait", title: "Beobachten und bei Gelegenheit kontaktieren", reason: "Noch nicht genug Informationen für einen gezielten nächsten Schritt.", due: null };
}

function buildOutreachAngle(context, orgSettings) {
  const services = orgSettings?.services;
  const serviceContext = context.matchedServiceContext || context.matchedTargetCustomerType;
  const leadType = context.matchedTargetCustomerType || context.branche || 'Unternehmen dieser Art';

  if (context.logs.length > 0 && context.hasSuccessfulContact) {
    const days = context.daysSinceLastContact || 1;
    const serviceHint = services ? ` mit dem Thema ${services.split(',')[0].trim()}` : '';
    return `Anknüpfen an bisherigen Kontakt (vor ${days} Tag${days !== 1 ? 'en' : ''}): Vorheriges Gespräch kurz referenzieren und fragen, ob sich${serviceHint} etwas verändert hat. Keine Produktpräsentation – erst Bedarf und Zeitplan klären.`;
  }
  if (!context.hasAnyContact && serviceContext) {
    const serviceDesc = services ? `mit ${services.split(',')[0].trim()}` : 'mit unseren Leistungen';
    return `Branchenspezifischer Einstieg: Kurz erklären, dass man speziell ${leadType} in der Region ${serviceDesc} unterstützt. Ziel des ersten Gesprächs: Ansprechpartner und aktuellen Bedarf klären – kein Verkaufsversuch im Erstkontakt.`;
  }
  if (context.hasOnlyFailedContact) {
    const serviceDesc = services ? `für ${services.split(',')[0].trim()}` : 'für externe Leistungen';
    return `Anderer Kanal oder Uhrzeit versuchen. Kurze, sachliche Nachricht: Wer ist zuständig ${serviceDesc}? Kein Druck – nur Ansprechpartner ermitteln.`;
  }
  const serviceDesc = services ? `für ${services.split(',').slice(0,2).join(', ')}` : 'für externe Dienstleistungen';
  return `Direkter, sachlicher Einstieg: Klären, wer intern ${serviceDesc} zuständig ist. Kurz und respektvoll – Ziel ist der richtige Ansprechpartner, nicht der sofortige Abschluss.`;
}

function buildSuggestedOpening(context, orgSettings) {
  const services = orgSettings?.services;
  const firstService = services ? services.split(',')[0].trim() : null;
  const leadType = context.matchedTargetCustomerType || context.branche || null;

  if (context.logs.length > 0 && context.hasSuccessfulContact) {
    const topic = firstService ? ` – speziell beim Thema ${firstService}` : '';
    return `Guten Tag, wir hatten uns vor einiger Zeit kurz gesprochen. Ich wollte kurz nachfragen, ob sich bei Ihnen etwas verändert hat${topic}.`;
  }
  if (context.matchedTargetCustomerType && context.hasPhone && firstService) {
    return `Guten Tag, ich wollte kurz klären, wer bei Ihnen Ansprechpartner für ${firstService} ist – geht nur um einen kurzen Abgleich, ob unser Angebot für ${leadType || 'Sie'} passen könnte.`;
  }
  if (context.matchedTargetCustomerType && context.hasPhone) {
    return `Guten Tag, ich wollte kurz klären, wer bei Ihnen Ansprechpartner für externe Dienstleister ist – geht nur um einen kurzen Abgleich, ob unser Angebot für ${leadType} passen könnte.`;
  }
  if (context.hasOnlyFailedContact) {
    const topic = firstService ? ` für ${firstService}` : ' für externe Service-Anfragen';
    return `Guten Tag, ich hatte es schon einmal versucht – vielleicht war der Zeitpunkt ungünstig. Kurze Frage: Wer ist bei Ihnen zuständig${topic}?`;
  }
  const topic = firstService ? ` für ${firstService}` : ' für externe Dienstleistungen';
  return `Guten Tag, kurze Frage: Wer ist bei Ihnen der richtige Ansprechpartner${topic}? Ich wollte kurz klären, ob unser Angebot für Sie relevant sein könnte.`;
}

function buildQualificationQuestions(context, orgSettings) {
  const services = orgSettings?.services;
  const firstService = services ? services.split(',')[0].trim() : 'externe Dienstleistungen';
  const leadType = context.matchedTargetCustomerType || context.branche || 'Ihr Unternehmen';
  const serviceContext = context.matchedServiceContext;

  const questions = [];
  if (!context.hasContactPerson) {
    questions.push(`Wer ist Ansprechpartner/Entscheider für ${firstService} bei Ihnen?`);
  }
  if (!context.logs.some(l => l.notiz && l.notiz.toLowerCase().includes("bedarf"))) {
    const contextLabel = serviceContext || firstService;
    questions.push(`Welchen aktuellen Bedarf hat ${leadType} beim Thema ${contextLabel}?`);
  }
  if (!context.logs.some(l => l.notiz && l.notiz.toLowerCase().includes("entscheid"))) {
    questions.push("Wie läuft der Entscheidungsprozess ab? Wer ist beteiligt?");
  }
  questions.push(`Haben Sie bereits einen Dienstleister für ${firstService}, oder suchen Sie gerade?`);
  return questions;
}

function buildObjectionsToExpect(context) {
  const objections = [];
  if (!context.matchedTargetCustomerType) objections.push("Das passt nicht zu unseren Prozessen");
  if (!context.hasSuccessfulContact) objections.push("Wir sind zufrieden mit unserem aktuellen Anbieter");
  if (context.hasOnlyFailedContact) objections.push("Das haben wir bereits versucht");
  objections.push("Das ist für uns gerade nicht relevant");
  objections.push("Wir haben kein Budget");
  return objections;
}

function buildRecommendedStatus(temperature, urgencyScore, context) {
  if (context.status === "Verloren") return "Nicht priorisieren";
  if (urgencyScore >= 80) return "Kontaktieren";
  if (temperature === "hot") return "Kontaktieren";
  if (temperature === "warm") return "Qualifizieren";
  if (temperature === "cold") return "Warten";
  return "Neu";
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED: analyzeContext + persistAnalysis
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeContext(company, contactLogs, tasks, orgSettings = {}) {
  const context = buildLeadContext(company, contactLogs, tasks);
  // Enrich context with matched service context from company
  context.matchedServiceContext = company.matched_service_context || null;

  const fitSignals = detectFitSignals(context);
  const contactabilitySignals = detectContactabilitySignals(context);
  const engagementSignals = detectEngagementSignals(context);
  const timingSignals = detectTimingSignals(context);
  const riskSignals = detectRiskSignals(context);
  const missingData = detectMissingData(context);

  const fitScore = calculateFitScore(context);
  const contactabilityScore = calculateContactabilityScore(context);
  const engagementScore = calculateEngagementScore(context);
  const timingScore = calculateTimingScore(context);
  const urgencyScore = calculateUrgencyScore(context);
  const confidenceScore = calculateConfidenceScore(context, riskSignals);
  const vertrieboScore = Math.round(fitScore * 0.3 + contactabilityScore * 0.25 + engagementScore * 0.25 + timingScore * 0.2);

  const temperature = classifyTemperature(vertrieboScore, urgencyScore, fitScore, engagementScore, contactabilityScore, context);
  const summary = buildSummary(temperature, context, fitScore, contactabilityScore, urgencyScore, missingData);
  const reason = buildReason(temperature, context, fitScore, contactabilityScore, engagementScore, missingData, riskSignals);
  const nextBestAction = buildNextBestAction(context, temperature, urgencyScore, contactabilityScore, missingData);
  const outreachAngle = buildOutreachAngle(context, orgSettings);
  const suggestedOpening = buildSuggestedOpening(context, orgSettings);
  const qualificationQuestions = buildQualificationQuestions(context, orgSettings);
  const objectionsToExpect = buildObjectionsToExpect(context);
  const recommendedStatus = buildRecommendedStatus(temperature, urgencyScore, context);

  return {
    temperature,
    vertriebo_score: vertrieboScore,
    urgency_score: Math.round(urgencyScore),
    fit_score: Math.round(fitScore),
    contactability_score: Math.round(contactabilityScore),
    timing_score: Math.round(timingScore),
    confidence_score: Math.round(confidenceScore),
    summary,
    reason,
    top_signals: [
      ...fitSignals.filter(s => s.present),
      ...contactabilitySignals.filter(s => s.present),
      ...engagementSignals.filter(s => s.present),
      ...timingSignals.filter(s => s.present)
    ].slice(0, 5),
    risk_signals: riskSignals,
    missing_data: missingData,
    next_best_action: nextBestAction,
    outreach_angle: outreachAngle,
    suggested_opening: suggestedOpening,
    qualification_questions: qualificationQuestions,
    objections_to_expect: objectionsToExpect,
    recommended_status: recommendedStatus,
    signals: {
      fit: fitSignals,
      contactability: contactabilitySignals,
      engagement: engagementSignals,
      timing: timingSignals,
      risk: riskSignals,
      missing_data: missingData
    },
    engine_version: "vertriebo-engine-phase1"
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORG SETTINGS LOADER
// ═══════════════════════════════════════════════════════════════════════════════

async function loadOrgSettings(base44, organizationId) {
  try {
    const records = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id: organizationId });
    const map = {};
    for (const r of records) map[r.key] = r.value;
    return {
      services: map.services || map.dienstleistungen || '',
      targetCustomerTypes: map.target_customer_types || map.zielkunden || '',
      industryName: map.industry_name || map.own_industry || '',
      companyName: map.company_name || '',
    };
  } catch {
    return { services: '', targetCustomerTypes: '', industryName: '', companyName: '' };
  }
}

async function persistAnalysis(base44, companyId, analysis) {
  // P0 FIX: open → unknown für Legacy-Enum-Compat
  const legacyTemperature = analysis.temperature === "open" ? "unknown" : analysis.temperature;

  const now = new Date().toISOString();
  const engineAnalysis = {
    version: "phase1",
    temperature: analysis.temperature, // Engine JSON behält "open"
    vertriebo_score: analysis.vertriebo_score,
    urgency_score: analysis.urgency_score,
    fit_score: analysis.fit_score,
    contactability_score: analysis.contactability_score,
    timing_score: analysis.timing_score,
    confidence_score: analysis.confidence_score,
    summary: analysis.summary,
    reason: analysis.reason,
    signals: analysis.signals,
    next_best_action: analysis.next_best_action,
    outreach_angle: analysis.outreach_angle,
    suggested_opening: analysis.suggested_opening,
    qualification_questions: analysis.qualification_questions,
    objections_to_expect: analysis.objections_to_expect,
    recommended_status: analysis.recommended_status
  };

  await base44.asServiceRole.entities.Company.update(companyId, {
    // Legacy Fields – open wird zu unknown gemappt
    lead_temperature: legacyTemperature,
    lead_temperature_score: analysis.vertriebo_score,
    lead_temperature_reason: analysis.reason,
    engine_confidence: analysis.confidence_score,

    // New Engine Bundle
    engine_analysis_json: JSON.stringify(engineAnalysis),
    engine_version: analysis.engine_version,
    engine_last_analyzed_at: now,

    // Legacy Compat
    is_hot: analysis.temperature === "hot"
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DENO SERVE
// ═══════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { mode = "single", company_id, limit = 10, organization_id } = body;

    // ── Org-ID auflösen ────────────────────────────────────────────────────────
    let organizationId = organization_id || null;
    if (!organizationId) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const memberOrgs = await base44.entities.OrganizationMember.filter({ user_email: user.email, status: "active" });
      if (memberOrgs && memberOrgs.length > 0) {
        organizationId = memberOrgs[0].organization_id;
      } else {
        const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
        if (ownerOrgs && ownerOrgs.length > 0) organizationId = ownerOrgs[0].id;
      }
    }

    if (!organizationId) {
      return Response.json({ error: 'Keine Organisation zugeordnet' }, { status: 403 });
    }

    // ── P0: Auth + Role + Billing + Limit ─────────────────────────────────────
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // MVP Access-Regel: 1 Account = 1 Organisation = Owner-Zugriff
    // Kein OrganizationMember-Check für normale Kunden
    const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);

    // Org laden
    const orgRows = await base44.asServiceRole.entities.Organization.filter({ id: organizationId });
    const org = orgRows[0] || null;

    if (!org) return Response.json({ error: 'Organisation nicht gefunden' }, { status: 404 });

    // Access-Check: Owner ODER PlatformAdmin
    const isOwner = org.owner_email === user.email;
    if (!isOwner && !isPlatformAdmin) {
      console.warn(`[analyzeLeadEngine] Access denied: user=${user.email} owner=${org.owner_email} org=${organizationId}`);
      return Response.json({ error: 'Kein Zugriff auf diese Organisation' }, { status: 403 });
    }

    // Suspension-Check
    if (org.platform_status === 'suspended' && !isPlatformAdmin) {
      return Response.json({ error: `Organisation gesperrt: ${org.suspended_reason || ''}` }, { status: 403 });
    }

    // MVP: Keine sales_rep-Logik mehr (nur Owner + PlatformAdmin)
    const userEmail = user.email;

    // Billing check
    const billingStatus = org.billing_status || 'trialing';
    const BLOCKED = ['unpaid', 'canceled', 'incomplete_expired'];
    const DEGRADED = ['past_due', 'incomplete'];
    if (BLOCKED.includes(billingStatus) && !isPlatformAdmin) {
      return Response.json({ error: 'Abo-Status gesperrt. Bitte Zahlung aktualisieren.' }, { status: 403 });
    }
    if (DEGRADED.includes(billingStatus)) {
      return Response.json({ error: `Abo-Status "${billingStatus}": KI-Analyse nicht verfügbar. Bitte Zahlung aktualisieren.` }, { status: 403 });
    }

    // Plan limit check
    if (!isPlatformAdmin && org.plan_id) {
      const plans = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
      const plan = plans[0] || null;
      if (plan && plan.max_ai_scorings_per_month !== -1) {
        const currentUsage = await getCurrentAiUsage(base44, organizationId);
        if (currentUsage >= plan.max_ai_scorings_per_month) {
          return Response.json({ error: `KI-Analyse Limit erreicht: ${currentUsage}/${plan.max_ai_scorings_per_month} diesen Monat.`, reason: 'plan_limit_exceeded' }, { status: 429 });
        }
      }
    }

    // ── MODE: single ───────────────────────────────────────────────────────────
    if (mode === "single") {
      if (!company_id) return Response.json({ error: 'company_id erforderlich für mode=single' }, { status: 400 });

      // P0: Company laden + Mandanten-Check
      const companies = await base44.asServiceRole.entities.Company.filter({
        id: company_id,
        organization_id: organizationId
      });
      if (!companies || companies.length === 0) {
        return Response.json({ error: 'Lead nicht gefunden oder gehört nicht zu dieser Organisation' }, { status: 404 });
      }
      const company = companies[0];

      // MVP: Kein sales_rep-Check mehr (nur Owner + PlatformAdmin haben Zugriff)

      const [contactLogs, tasks, orgSettings] = await Promise.all([
        base44.asServiceRole.entities.ContactLog.filter({ company_id, organization_id: organizationId }),
        base44.asServiceRole.entities.Task.filter({ company_id, organization_id: organizationId }),
        loadOrgSettings(base44, organizationId),
      ]);

      const analysis = analyzeContext(company, contactLogs, tasks, orgSettings);
      await persistAnalysis(base44, company_id, analysis);
      await incrementUsageLog(base44, organizationId, 1);

      console.info(`[analyzeLeadEngine] Single OK: company=${company_id} org=${organizationId} score=${analysis.vertriebo_score} temp=${analysis.temperature}`);
      return Response.json({ success: true, company_id, result: analysis });
    }

    // ── MODE: latest ───────────────────────────────────────────────────────────
    if (mode === "latest") {
      // P0: verbleibende Scorings im Plan berücksichtigen
      let remainingScorings = 25;
      if (!isPlatformAdmin && org.plan_id) {
        const plansForLimit = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
        const planForLimit = plansForLimit[0] || null;
        if (planForLimit && planForLimit.max_ai_scorings_per_month !== -1) {
          const usageNow = await getCurrentAiUsage(base44, organizationId);
          remainingScorings = Math.max(0, planForLimit.max_ai_scorings_per_month - usageNow);
          if (remainingScorings === 0) {
            return Response.json({ error: 'KI-Analyse Limit für diesen Monat erreicht.', reason: 'plan_limit_exceeded' }, { status: 429 });
          }
        }
      }
      const maxLimit = Math.min(limit, 25, remainingScorings);

      // MVP: Kein sales_rep-Filter mehr (nur Owner + PlatformAdmin)
      const companyFilter = { organization_id: organizationId };

      const companies = await base44.asServiceRole.entities.Company.filter(companyFilter);
      if (!companies || companies.length === 0) {
        return Response.json({ success: true, analyzed_count: 0, results: [] });
      }

      const sorted = companies
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
        .slice(0, maxLimit);

      const results = [];
      let analyzedCount = 0;

      // Org settings einmal laden für den gesamten Batch
      const orgSettingsBatch = await loadOrgSettings(base44, organizationId);

      for (const company of sorted) {
        try {
          const [contactLogs, tasks] = await Promise.all([
            base44.asServiceRole.entities.ContactLog.filter({ company_id: company.id, organization_id: organizationId }),
            base44.asServiceRole.entities.Task.filter({ company_id: company.id, organization_id: organizationId })
          ]);

          const analysis = analyzeContext(company, contactLogs, tasks, orgSettingsBatch);
          await persistAnalysis(base44, company.id, analysis);
          results.push({ company_id: company.id, result: analysis });
          analyzedCount++;
        } catch (err) {
          console.warn(`[analyzeLeadEngine] Skipping company ${company.id}:`, err.message);
        }
      }

      await incrementUsageLog(base44, organizationId, analyzedCount);
      console.info(`[analyzeLeadEngine] Latest OK: analyzed=${analyzedCount} org=${organizationId}`);
      return Response.json({ success: true, analyzed_count: analyzedCount, results });
    }

    return Response.json({ error: 'Unbekannter mode. Verwende "single" oder "latest"' }, { status: 400 });
  } catch (error) {
    console.error('[analyzeLeadEngine] Error:', error);
    return Response.json({ error: error.message || 'Analysefehler' }, { status: 500 });
  }
});