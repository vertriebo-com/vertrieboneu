import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { company_id, organization_id, force_regenerate = false } = body;

    if (!company_id || !organization_id) {
      return Response.json({ error: 'company_id und organization_id sind Pflichtparameter' }, { status: 400 });
    }

    // ── 1. Company laden & Zugehörigkeit prüfen ──────────────────────────────
    let companies = [];
    try {
      companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id });
    } catch (sdkErr) {
      // SDK wirft bei ungültiger ID (z.B. "Invalid id value") → sauber als 404 zurückgeben
      console.warn(`[getKiRecommendation] Company-Lookup SDK-Fehler: ${sdkErr.message}`);
      return Response.json({ success: false, error: 'company_not_found' }, { status: 404 });
    }
    const company = companies[0] || null;
    if (!company) return Response.json({ success: false, error: 'company_not_found' }, { status: 404 });

    // ── 1a. Check: Organisation gesperrt? ─────────────────────────────────
    const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
    const org = orgs[0];
    if (!org) return Response.json({ success: false, error: 'organization_not_found' }, { status: 404 });
    if (org.platform_status === 'suspended') {
      console.warn(`[getKiRecommendation] Access denied: org suspended`);
      return Response.json({ error: 'Organisation ist gesperrt', organization_suspended: true }, { status: 403 });
    }

    // ── 2. Cache zurückgeben wenn vorhanden und kein force_regenerate ────────
    if (!force_regenerate && company.ki_recommendation) {
      let cached = null;
      try { cached = JSON.parse(company.ki_recommendation); } catch (_) {}
      if (cached) {
        console.info(`[getKiRecommendation] Cache hit für company=${company.name}`);
        return Response.json({ recommendation: cached, source: 'cache', ai_action_charged: false });
      }
    }

    // ── 3. KI-Limit prüfen ───────────────────────────────────────────────────
    const now = new Date();
    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let currentUsageLog = null;
    try {
      const logs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
      currentUsageLog = logs[0] || null;
    } catch (_) {}

    const aiUsed = currentUsageLog?.ai_actions_used || 0;

    let maxAi = 50;
    try {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
      const planId = orgs[0]?.plan_id;
      if (planId) {
        const plans = await base44.asServiceRole.entities.Plan.filter({ id: planId });
        if (plans[0]?.max_ai_scorings_per_month !== undefined) {
          maxAi = plans[0].max_ai_scorings_per_month;
        }
      }
    } catch (_) {}

    if (maxAi !== -1 && aiUsed >= maxAi) {
      console.warn(`[getKiRecommendation] KI-Limit erreicht: ${aiUsed}/${maxAi}`);
      // Return cached if available, else limit error
      if (company.ki_recommendation) {
        let cached = null;
        try { cached = JSON.parse(company.ki_recommendation); } catch (_) {}
        if (cached) return Response.json({ recommendation: cached, source: 'cache', ai_action_charged: false, limit_reached: true });
      }
      return Response.json({ error: `KI-Aktionslimit erreicht: ${aiUsed}/${maxAi}`, limit_reached: true }, { status: 403 });
    }

    // ── 4. Kontextdaten laden ────────────────────────────────────────────────
    const [contactLogs, tasks, settingsRecords] = await Promise.all([
      base44.asServiceRole.entities.ContactLog.filter({ company_id, organization_id }),
      base44.asServiceRole.entities.Task.filter({ company_id, organization_id }),
      base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id }),
    ]);

    const recentLogs = contactLogs
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 5);

    const openTasks = tasks.filter(t => !t.erledigt);
    const overdueTasks = openTasks.filter(t => t.faellig_am && new Date(t.faellig_am) < now);
    const callbackTask = openTasks.find(t => t.typ === 'Rückruf');

    const settingsMap = {};
    settingsRecords.forEach(s => { settingsMap[s.key] = s.value; });

    // Canonical Keys bevorzugen, Legacy-Fallbacks für Rückwärtskompatibilität
    const orgServices = settingsMap.services || settingsMap.dienstleistungen || '';
    const orgTargetCustomers = settingsMap.target_customer_types || settingsMap.zielkunden || '';
    const orgIndustry = settingsMap.industry_name || '';

    // Lead-Diagnostics aus engine_analysis_json komprimiert extrahieren
    let engineDiagnostics = '';
    if (company.engine_analysis_json) {
      try {
        const ea = JSON.parse(company.engine_analysis_json);
        const parts = [];
        if (ea.summary) parts.push(`Kurzfazit: ${ea.summary}`);
        if (ea.outreach_angle) parts.push(`Ansprache-Winkel: ${ea.outreach_angle}`);
        if (ea.signals?.fit?.filter(s => s.present).length > 0) {
          parts.push(`Fit-Signale: ${ea.signals.fit.filter(s => s.present).map(s => s.reason).join(', ')}`);
        }
        engineDiagnostics = parts.join(' | ');
      } catch (_) {}
    }

    const matchedServiceContext = company.matched_service_context || '';
    const relevanceReason = company.relevance_reason || '';

    const hasPhone = !!company.telefon;
    const hasEmail = !!company.email;
    const hasWebsite = !!company.website;
    const hasAnsprechpartner = !!company.ansprechpartner;

    const logSummary = recentLogs.map(l =>
      `${l.typ} (${l.ergebnis}): ${l.notiz || '–'}${l.naechster_schritt ? ' → ' + l.naechster_schritt : ''}`
    ).join('\n');

    // ── 5. LLM-Anfrage mit Timeout ───────────────────────────────────────────
    let recommendation = null;
    let source = 'llm';
    let aiCharged = false;

    try {
      console.info(`[getKiRecommendation] Starte LLM-Aufruf für company=${company.name}`);
      const llmPromise = base44.integrations.Core.InvokeLLM({
        model: 'claude_sonnet_4_6',
        prompt: `Du bist ein erfahrener B2B-Vertriebscoach. Analysiere diesen Lead und gib eine strukturierte Handlungsempfehlung zurück. Antworte NUR mit einem JSON-Objekt, kein Text davor oder danach.

EIGENES UNTERNEHMEN:
- Dienstleistungen: ${orgServices || 'nicht angegeben'}
- Zielkunden: ${orgTargetCustomers || 'nicht angegeben'}
- Branche: ${orgIndustry || 'nicht angegeben'}

LEAD-DATEN:
- Firma: ${company.name}
- Branche: ${company.branche || '–'}
- Ort: ${company.ort || '–'}
- Status: ${company.status}
- Telefon: ${hasPhone ? 'vorhanden' : 'fehlt'}
- E-Mail: ${hasEmail ? 'vorhanden' : 'fehlt'}
- Website: ${hasWebsite ? 'vorhanden' : 'fehlt'}
- Ansprechpartner: ${hasAnsprechpartner ? company.ansprechpartner : 'unbekannt'}
- Priorität-Score: ${company.priority_score || 0}
- Zielgruppen-Match: ${company.matched_target_customer_type || '–'}
- Service-Kontext (warum dieser Lead passt): ${matchedServiceContext || '–'}
- Relevanz-Begründung (aus Scoring): ${relevanceReason || '–'}
- Engine-Diagnostics: ${engineDiagnostics || '–'}
- Notizen: ${company.notizen || 'keine'}

KONTAKTHISTORIE (letzte 5):
${logSummary || 'Noch kein Kontakt dokumentiert'}

AUFGABEN:
- Offene Aufgaben: ${openTasks.length}
- Überfällige Aufgaben: ${overdueTasks.length}
- Rückruf geplant: ${callbackTask ? 'Ja – ' + (callbackTask.faellig_am ? new Date(callbackTask.faellig_am).toLocaleDateString('de-DE') : 'Datum offen') : 'Nein'}

WICHTIG: Die Empfehlung muss konkret auf die Kombination aus unseren Leistungen (${orgServices || 'nicht angegeben'}) und dem Lead-Typ (${company.matched_target_customer_type || company.branche || 'unbekannt'}) eingehen. Wenn Service-Kontext vorhanden ist: "${matchedServiceContext || 'n/a'}" – dann muss der suggested_message diesen Kontext nutzen. Keine generischen Formulierungen, wenn Branchendaten vorhanden sind.

Antworte EXAKT mit diesem JSON-Format (kein Markdown):
{
  "priority": "hoch" | "mittel" | "niedrig",
  "next_action": "anrufen" | "email_senden" | "wiedervorlage" | "daten_pruefen" | "nicht_priorisieren",
  "title": "Kurze Empfehlung (max. 6 Wörter)",
  "reason": "Konkrete Begründung warum genau diese Aktion (2-3 Sätze)",
  "suggested_message": "Kurzer Einstiegssatz für Telefon oder E-Mail (optional, leer lassen wenn nicht sinnvoll)",
  "follow_up_days": <Zahl: empfohlene Tage bis Follow-up>,
  "confidence": <0-100>
}`,
        response_json_schema: {
          type: 'object',
          properties: {
            priority: { type: 'string' },
            next_action: { type: 'string' },
            title: { type: 'string' },
            reason: { type: 'string' },
            suggested_message: { type: 'string' },
            follow_up_days: { type: 'number' },
            confidence: { type: 'number' },
          }
        }
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('KI-Timeout nach 45s')), 45000)
      );

      const result = await Promise.race([llmPromise, timeoutPromise]);

      console.info(`[getKiRecommendation] LLM result type=${typeof result}, keys=${result ? Object.keys(result).join(',') : 'null'}`);

      // SDK may wrap response_json_schema results in { response: {...} }
      const parsed = (result && result.response && typeof result.response === 'object') ? result.response : result;

      if (parsed && parsed.priority && parsed.next_action && parsed.title) {
        recommendation = parsed;
        source = 'llm';
        aiCharged = true;
      } else {
        console.warn(`[getKiRecommendation] Unvollständige KI-Antwort:`, JSON.stringify(result));
        throw new Error('Unvollständige KI-Antwort');
      }
    } catch (llmError) {
      console.warn(`[getKiRecommendation] LLM fehlgeschlagen: ${llmError?.message || String(llmError)} – verwende Fallback`);
      console.warn(`[getKiRecommendation] LLM error detail:`, JSON.stringify(llmError?.response?.data || llmError?.cause || {}));
      source = 'fallback';
      aiCharged = false;

      // Regelbasierter Fallback
      if (overdueTasks.length > 0) {
        recommendation = {
          priority: 'hoch', next_action: 'wiedervorlage',
          title: 'Überfällige Aufgabe bearbeiten',
          reason: `Sie haben ${overdueTasks.length} überfällige Aufgabe(n) für diesen Lead. Diese sollten dringend abgearbeitet werden.`,
          suggested_message: '', follow_up_days: 1, confidence: 85
        };
      } else if (callbackTask) {
        recommendation = {
          priority: 'hoch', next_action: 'anrufen',
          title: 'Rückruf durchführen',
          reason: 'Ein Rückruf wurde vereinbart und ist geplant. Halten Sie die Vereinbarung ein.',
          suggested_message: `Guten Tag, hier ist [Ihr Name]. Wir hatten einen Rückruf vereinbart.`,
          follow_up_days: 1, confidence: 90
        };
      } else if (company.status === 'Neu' && hasPhone) {
        recommendation = {
          priority: 'mittel', next_action: 'anrufen',
          title: 'Erstkontakt per Telefon',
          reason: 'Dieser Lead hat noch keinen Kontakt. Eine Telefonnummer ist vorhanden – Erstkontakt ist der sinnvollste nächste Schritt.',
          suggested_message: `Guten Tag, hier ist [Ihr Name] von [Ihrer Firma]. Darf ich kurz Ihre Aufmerksamkeit?`,
          follow_up_days: 3, confidence: 75
        };
      } else if (company.status === 'Neu' && hasEmail && !hasPhone) {
        recommendation = {
          priority: 'mittel', next_action: 'email_senden',
          title: 'E-Mail als Erstkontakt vorbereiten',
          reason: 'Keine Telefonnummer vorhanden, aber eine E-Mail-Adresse. E-Mail-Kontakt ist der beste Einstieg.',
          suggested_message: '',
          follow_up_days: 5, confidence: 70
        };
      } else if (!hasPhone && !hasEmail) {
        recommendation = {
          priority: 'niedrig', next_action: 'daten_pruefen',
          title: 'Kontaktdaten ergänzen',
          reason: 'Weder Telefon noch E-Mail sind vorhanden. Bitte zuerst Daten anreichern, bevor Kontakt aufgenommen werden kann.',
          suggested_message: '',
          follow_up_days: 7, confidence: 80
        };
      } else {
        recommendation = {
          priority: 'mittel', next_action: 'wiedervorlage',
          title: 'Lead erneut prüfen',
          reason: 'Bitte Kontakthistorie und Aufgaben prüfen und den nächsten Schritt manuell festlegen.',
          suggested_message: '',
          follow_up_days: 3, confidence: 50
        };
      }
    }

    // ── 6. Cache speichern ───────────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.Company.update(company_id, {
        ki_recommendation: JSON.stringify(recommendation),
        ki_recommendation_generated_at: now.toISOString(),
      });
    } catch (cacheErr) {
      console.warn('[getKiRecommendation] Cache-Speicherung fehlgeschlagen:', cacheErr.message);
    }

    // ── 7. ai_actions_used inkrementieren (nur bei echtem LLM-Erfolg) ────────
    if (aiCharged) {
      try {
        if (currentUsageLog) {
          await base44.asServiceRole.entities.UsageLog.update(currentUsageLog.id, {
            ai_actions_used: (currentUsageLog.ai_actions_used || 0) + 1,
          });
        } else {
          const periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
          const periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)).toISOString();
          await base44.asServiceRole.entities.UsageLog.create({
            organization_id, period_month: periodMonth,
            period_start: periodStart, period_end: periodEnd,
            ai_actions_used: 1,
          });
        }
        console.info(`[getKiRecommendation] ai_actions_used +1 für org=${organization_id}`);
      } catch (usageErr) {
        console.warn('[getKiRecommendation] UsageLog update fehlgeschlagen:', usageErr.message);
      }
    }

    console.info(`[getKiRecommendation] company=${company.name} source=${source} aiCharged=${aiCharged} priority=${recommendation.priority}`);
    return Response.json({ recommendation, source, ai_action_charged: aiCharged });

  } catch (error) {
    console.error('[getKiRecommendation] Unhandled error:', error.message);
    return Response.json({ success: false, error: 'internal_error', detail: error.message }, { status: 500 });
  }
});