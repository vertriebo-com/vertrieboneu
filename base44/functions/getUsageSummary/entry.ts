import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Org-ID aus Request-Body oder User-Kontext
    let requestedOrgId = null;
    try {
      const body = await req.json();
      requestedOrgId = body?.org_id || null;
    } catch {}

    // ── MVP: 1 Paket = 1 Account = 1 Organisation ─────────────────────────
    // Keine OrganizationMember-Lookups. Zugriff nur über owner_email oder PlatformAdmin.
    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);

    let org = null;
    if (requestedOrgId) {
      const targetOrgs = await base44.asServiceRole.entities.Organization.filter({ id: requestedOrgId });
      const targetOrg = targetOrgs?.[0] || null;
      if (!targetOrg) {
        return Response.json({ error: 'no_organization_found' }, { status: 404 });
      }
      if (targetOrg.owner_email === user.email || isPlatformAdmin) {
        org = targetOrg;
      } else {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const ownerOrgs = await base44.entities.Organization.filter({ owner_email: user.email });
      org = ownerOrgs?.[0] || null;
      if (!org && isPlatformAdmin) {
        const anyOrg = await base44.asServiceRole.entities.Organization.list("-created_date", 1);
        org = anyOrg?.[0] || null;
      }
    }

    if (!org) {
      return Response.json({ error: 'no_organization_found' }, { status: 404 });
    }

    const orgId = org.id;

    // ── KANONISCHE PERIOD_MONTH-BERECHNUNG (Europe/Berlin) ─────────────────
    // Robuste Implementierung via formatToParts (vermeidet Invalid Date / Split-Fehler)
    const now = new Date();
    const periodParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
    const yearPart = periodParts.find(p => p.type === 'year');
    const monthPart = periodParts.find(p => p.type === 'month');
    const periodMonth = `${yearPart?.value}-${monthPart?.value}`; // z.B. "2026-05"

    // ── RESET-DATUM (erster Tag nächster Kalendermonat Berlin) ─────────────
    const py = parseInt(yearPart?.value || new Date().getFullYear());
    const pm = parseInt(monthPart?.value || 1);
    const resetDate = new Date(Date.UTC(py, pm, 1)); // pm ist 1-basiert → nächster Monat
    const resetDateFormatted = resetDate.toLocaleDateString('de-DE', { 
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' 
    });

    // ── ALLE QUELLEN PARALLEL LADEN ────────────────────────────────────────
    const [quotaSlots, usageLogs, allCompaniesRaw] = await Promise.all([
      base44.asServiceRole.entities.QuotaReservation.filter({
        organization_id: orgId,
        period_month: periodMonth,
      }),
      base44.asServiceRole.entities.UsageLog.filter({ 
        organization_id: orgId, 
        period_month: periodMonth 
      }),
      base44.asServiceRole.entities.Company.filter({ organization_id: orgId }, '-created_date', 2000),
    ]);

    const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
    const reservedSlots = quotaSlots.filter(s => s.status === 'reserved').length;

    // ── RECONCILIATION: Tatsächliche Research-Leads diesen Monat ──────────
    // SSOT-Formel (§E Merkliste): monthly_used = Math.max(committedSlots, usageLogValue, companiesThisMonth)
    // Alle drei Quellen werden reconciliert — niemals nur eine Quelle allein verwenden.
    //
    // ⚠️ MVP-RISIKO: periodStart/periodEnd als UTC-Mitternacht des Kalendermonats.
    // Berlin-Mitternacht ≠ UTC-Mitternacht: Differenz je nach Sommer-/Winterzeit +1h oder +2h.
    // Am Monatswechsel können Companies in den letzten 1-2h des Berlin-Monats noch in
    // period_month des Vormonats fallen (Berlin sagt "1. Juni", UTC sagt noch "31. Mai").
    // → companiesThisMonth kann am Monatswechsel um bis zu 2h Drift haben.
    // → max()-Formel kompensiert via usageLogValue (korrekte Berlin-Quelle).
    // Langfristig: Berlin-Grenzen exakt berechnen oder UsageEvent als SSOT verwenden.
    const periodStart = new Date(Date.UTC(py, pm - 1, 1));
    const periodEnd   = new Date(Date.UTC(py, pm, 1));

    // NON_QUOTA_RUN_IDS: research_run_id-Werte die KEIN echtes Monatskontingent verbrauchen.
    // Erweitern wenn neue Sonderwerte hinzukommen (§I Merkliste: Manuelle/Import-Leads nicht mischen).
    const NON_QUOTA_RUN_IDS = new Set(['manual_setup', 'csv_import', 'manual', 'import']);

    const companiesThisMonth = allCompaniesRaw.filter(c => {
      if (!c.research_run_id) return false;
      if (NON_QUOTA_RUN_IDS.has(c.research_run_id)) return false;
      // Doppelabsicherung via quelle/source_provider
      if (c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
      if (c.source_provider === 'manual' || c.source_provider === 'csv_import') return false;
      const created = new Date(c.created_date);
      return created >= periodStart && created < periodEnd;
    }).length;

    // Höchsten Wert aus allen Quellen nehmen (nie eine valide Quelle ignorieren)
    const usageLogValue = usageLogs?.[0]?.leads_created || 0;
    const monthlyUsed = Math.max(committedSlots, usageLogValue, companiesThisMonth);

    const usageLog = usageLogs?.[0] || null;
    const usageLogDiff = usageLogValue - committedSlots;

    // ── PLAN LADEN ─────────────────────────────────────────────────────────
    // Robuster Lookup: ungültige plan_id-Werte (z.B. "plan_starter" statt echter Entity-ID) werden abgefangen.
    let plan = null;
    let planLoadError = null; // "missing" | "invalid" | null
    if (org.plan_id) {
      try {
        const planResult = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
        plan = planResult?.[0] || null;
        if (!plan) planLoadError = 'missing'; // plan_id gesetzt aber Plan nicht in DB gefunden
      } catch {
        planLoadError = 'invalid'; // plan_id ist kein gültiger Entity-ID
        plan = null;
      }
    }

    // ── LIMIT-AUFLÖSUNG (PRODUKTREGEL) ─────────────────────────────────────
    // PRIORITÄT: custom_monthly_lead_limit (Admin-Override) > Plan-Wert
    // custom_monthly_lead_limit: nur PlatformAdmin kann setzen (enforced in platformAdmin.js)
    // -1 = Unlimited (bewusst durch Admin, nicht durch Plan-Default)
    // null/nicht gesetzt = Plan-Wert gilt
    const hasCustomLimit = org.custom_monthly_lead_limit != null;

    // unlimited gilt AUSSCHLIESSLICH wenn:
    // (a) custom_monthly_lead_limit === -1 (Admin-Override), ODER
    // (b) Plan existiert UND max_leads_per_month === -1
    // NIEMALS wenn plan === null, plan_id fehlt, oder Plan ungültig ist.
    //
    // Fallback-Hierarchie (identisch zu startResearchRun):
    //   plan vorhanden + max_leads_per_month === -1 → unlimited (-1)
    //   plan vorhanden + max_leads_per_month > 0   → festes Limit
    //   plan vorhanden + max_leads_per_month null  → Trial/Fehler → 50 (defensiv)
    //   plan_id fehlt + free_preview/verified_trial → Trial-Limits (getrennt vom Recherche-Block)
    //   plan_id fehlt + paid/active                → billing_plan_missing (Anzeige-Flag)
    //   plan_id gesetzt, Plan nicht gefunden        → billing_plan_missing
    //   plan_id gesetzt, Plan ungültig              → billing_plan_invalid
    const trialStage = org.trial_stage || 'free_preview';
    const isPaidCustomer = ['paid'].includes(trialStage) || ['active', 'trialing'].includes(org.billing_status || '');

    let monthlyLimit;
    let planStatus = 'ok'; // "ok" | "billing_plan_missing" | "billing_plan_invalid" | "trial_limit" | "no_plan_preview" | "custom_limit"
    if (hasCustomLimit) {
      // Admin-Override: custom_monthly_lead_limit hat höchste Priorität
      monthlyLimit = org.custom_monthly_lead_limit;
      planStatus = 'custom_limit';
      console.info(`[getUsageSummary] custom_monthly_lead_limit=${monthlyLimit} (Admin-Override) org=${orgId}`);
    } else if (plan) {
      // Plan geladen — max_leads_per_month auslesen
      // null wird NICHT als unlimited behandelt: defensiv auf 50 setzen (Admin-Fehler sichtbar machen)
      monthlyLimit = (plan.max_leads_per_month != null) ? plan.max_leads_per_month : 50;
      if (plan.max_leads_per_month == null) planStatus = 'plan_limit_null'; // Warnung: Admin sollte -1 setzen
    } else if (planLoadError === 'missing') {
      // plan_id gesetzt aber nicht gefunden
      planStatus = 'billing_plan_missing';
      monthlyLimit = isPaidCustomer ? 0 : 50; // paid → 0 (geblockt anzeigen), trial → 50
    } else if (planLoadError === 'invalid') {
      planStatus = 'billing_plan_invalid';
      monthlyLimit = isPaidCustomer ? 0 : 50;
    } else {
      // plan_id nicht gesetzt
      if (isPaidCustomer) {
        planStatus = 'billing_plan_missing';
        monthlyLimit = 0; // Zeige "Limit erreicht" an — Admin-Konfigurationsfehler
      } else if (trialStage === 'verified_trial') {
        planStatus = 'trial_limit';
        monthlyLimit = 50;
      } else {
        // free_preview
        planStatus = 'no_plan_preview';
        monthlyLimit = 10; // Preview-Limit
      }
    }

    // Unlimited: custom -1 ODER Plan mit -1 (beide explizit durch Admin)
    const isUnlimited = monthlyLimit === -1;
    const monthlyRemaining = isUnlimited ? null : Math.max(0, monthlyLimit - monthlyUsed);
    // IDENTISCH zu startResearchRun Zeile 255: >= (nicht >)
    // Bei used===limit: startResearchRun blockt (>=), getUsageSummary muss is_over_limit=true anzeigen.
    // Sonst: UI zeigt "Limit nicht erreicht", aber Recherche wird blockiert → Nutzerverwirrung.
    const isOverLimit = !isUnlimited && monthlyUsed >= monthlyLimit;

    // ── CRM-BESTAND (aktuell gespeicherte Companies, ohne Blacklist) ───────
    // allCompaniesRaw wird wiederverwendet — kein zweiter DB-Call
    const blacklist = await base44.entities.Blacklist.filter({ organization_id: orgId });
    const blacklistNames = blacklist.map(b => b.firmenname?.toLowerCase().trim());
    const isBlacklisted = (name) => {
      if (!name) return false;
      const normalized = name.toLowerCase().trim();
      return blacklistNames.some(bl => normalized.includes(bl) || bl.includes(normalized));
    };
    const crmTotal = allCompaniesRaw.filter(c => !isBlacklisted(c.name)).length;

    // ── ZENTRALE USAGE_SUMMARY ─────────────────────────────────────────────
    // SSOT-Formel (§E Merkliste): monthly_used = Math.max(committedSlots, usageLogValue, companiesThisMonth)
    const sourceUsed = monthlyUsed === committedSlots && committedSlots >= usageLogValue && committedSlots >= companiesThisMonth
      ? 'quota_reservation'
      : monthlyUsed === usageLogValue && usageLogValue >= companiesThisMonth
      ? 'usage_log'
      : 'companies_count';

    // ⚠️ MVP-Risiko: Company.filter limit=2000 — bei > 2000 Companies/Monat kann companiesThisMonth unvollständig sein
    const limitWarning = allCompaniesRaw.length >= 2000
      ? "ACHTUNG: Company-Filter hat Limit 2000 erreicht — companiesThisMonth könnte unvollständig sein."
      : null;

    const usage_summary = {
      period_month: periodMonth,
      plan_name: plan?.name || null,
      plan_status: planStatus, // "ok" | "billing_plan_missing" | "billing_plan_invalid" | "trial_limit" | "no_plan_preview" | "plan_limit_null"
      monthly_limit: monthlyLimit,
      monthly_used: monthlyUsed,
      monthly_remaining: monthlyRemaining,
      is_over_limit: isOverLimit,
      is_unlimited: isUnlimited,
      reset_date: resetDateFormatted,
      crm_total: crmTotal,
      explanation: {
        monthly_used_description: "Automatisch recherchierte Leads in diesem Kalendermonat (max aus QuotaReservation, UsageLog und Company-Zählung)",
        crm_total_description: "Aktuell gespeicherte Firmenkontakte (inkl. manuell angelegte)",
        why_different: monthlyUsed !== crmTotal
          ? "Monatsverbrauch = nur automatisch recherchierte Leads. CRM-Bestand enthält auch manuell angelegte Kontakte." 
          : null,
      },
      reconciliation: {
        committed_slots: committedSlots,
        reserved_slots: reservedSlots,
        usage_log_value: usageLogValue,
        companies_this_month: companiesThisMonth,
        source_used: sourceUsed,
        usage_log_diff: usageLogDiff,
        note: usageLogDiff !== 0 ? "UsageLog weicht von QuotaReservation ab — max()-Formel kompensiert." : null,
        limit_warning: limitWarning,
      },
      // Weitere Usage-Metriken (aus UsageLog)
      research_runs_used: usageLog?.lead_generations_used || 0,
      ai_actions_used: usageLog?.ai_actions_used || 0,
      manual_emails_logged: usageLog?.manual_emails_logged || 0,
      max_research_runs: plan?.max_lead_generations_per_month ?? -1,
      max_ai_actions: plan?.max_ai_scorings_per_month ?? -1,
    };

    return Response.json({
      success: true,
      usage_summary,
      org: {
        id: org.id,
        name: org.name,
        trial_stage: org.trial_stage,
        billing_status: org.billing_status,
      },
    });

  } catch (error) {
    console.error('[getUsageSummary] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});