/**
 * getUsageSummary
 * ===============
 * USAGE TRUTH POLICY (2026-05-25):
 *
 * leads_used       → PRIMARY: companies_this_month (echte DB-Zählung, nicht manipulierbar)
 *                    SECONDARY: usage_log_leads (write-time-Tracking, kann drift haben)
 *                    TERTIARY: committed_slots (QuotaReservation, MVP-Bypass aktiv → oft 0)
 *                    RECONCILIATION: max() aller drei (nie eine Quelle ignorieren)
 *
 * research_runs    → PRIMARY: ResearchRun-Zählung (completed+partial diesen Monat)
 *                    SECONDARY: UsageLog.lead_generations_used (trust-based)
 *
 * ai_actions       → PRIMARY: UsageLog.ai_actions_used (server-side enforced in enrichCompany)
 *                    RISK: kein direkter Audit-Rückkanal, trust-based
 *
 * emails_used      → PRIMARY: UsageLog.emails_sent
 *                    RISK: trust-based, kein Brevo-Rückkanal, explizit markiert
 *
 * quota_reservation → DIAGNOSTIC only: QuotaReservation-Bypass aktiv (MVP).
 *                     Nicht als primäre Quelle verwenden solange orgs_without_quota > 0.
 *
 * periodMonth      → Europe/Berlin via formatToParts (kanonisch, identisch zu processResearchRun)
 * periodBounds     → getBerlinPeriodBounds() für Company-Zählung (UTC-Annäherung mit bekanntem Drift)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── PHASE 3: Kanonische Berlin-Period-Hilfsfunktionen ──────────────────────────
// Zentralisiert in allen Funktionen die periodMonth/periodBounds verwenden.
// Identische Logik in: getUsageSummary, startResearchRun, processResearchRun, auditUsageQuotaConsistency.
// Tech-Debt: Base44 erlaubt keine Imports → hier als inline-Kopie, aber explizit versioniert.
// Version: period-utils v1.0 (2026-05-25)

function getBerlinPeriodMonth(date = new Date()) {
  // Robuste Implementierung via formatToParts (vermeidet Invalid Date / Split-Fehler)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return { periodMonth: `${y}-${m}`, py: parseInt(y), pm: parseInt(m) };
}

function getBerlinPeriodBounds(py, pm) {
  // ⚠️ UTC-Annäherung: periodStart/End als UTC-Mitternacht des Kalendermonats.
  // Berlin ist UTC+1 (Winter) / UTC+2 (Sommer) → bis zu 2h Drift am Monatswechsel.
  // Bekanntes Tech-Debt — max()-Reconciliation kompensiert diesen Drift.
  const periodStart = new Date(Date.UTC(py, pm - 1, 1));
  const periodEnd   = new Date(Date.UTC(py, pm, 1));
  return { periodStart, periodEnd };
}

// ── NON_QUOTA_RUN_IDS: Research-only Filterung (kanonisch) ───────────────────
// Identisch in getUsageSummary, startResearchRun, processResearchRun.
// Version: non-quota-ids v1.0 (2026-05-25)
const NON_QUOTA_RUN_IDS = new Set(['manual_setup', 'csv_import', 'manual', 'import']);

function isResearchLead(c) {
  if (!c.research_run_id) return false;
  if (NON_QUOTA_RUN_IDS.has(c.research_run_id)) return false;
  if (c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
  if (c.source_provider === 'manual' || c.source_provider === 'csv_import') return false;
  return true;
}

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

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin", "support_agent", "readonly_support"].includes(user.role);

    let org = null;
    if (requestedOrgId) {
      const targetOrgs = await base44.asServiceRole.entities.Organization.filter({ id: requestedOrgId });
      const targetOrg = targetOrgs?.[0] || null;
      if (!targetOrg) return Response.json({ error: 'no_organization_found' }, { status: 404 });
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

    if (!org) return Response.json({ error: 'no_organization_found' }, { status: 404 });
    const orgId = org.id;

    // ── PERIOD (kanonisch, phase-3-zentralisiert) ─────────────────────────────
    const { periodMonth, py, pm } = getBerlinPeriodMonth();
    const { periodStart, periodEnd } = getBerlinPeriodBounds(py, pm);

    // Reset-Datum (erster Tag nächster Kalendermonat, Berlin-Anzeige)
    const resetDate = new Date(Date.UTC(py, pm, 1));
    const resetDateFormatted = resetDate.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin'
    });

    // ── ALLE QUELLEN PARALLEL LADEN ───────────────────────────────────────────
    const [quotaSlots, usageLogs, allCompaniesRaw, researchRunsRaw] = await Promise.all([
      base44.asServiceRole.entities.QuotaReservation.filter({ organization_id: orgId, period_month: periodMonth }),
      base44.asServiceRole.entities.UsageLog.filter({ organization_id: orgId, period_month: periodMonth }),
      base44.asServiceRole.entities.Company.filter({ organization_id: orgId }, '-created_date', 2000),
      base44.asServiceRole.entities.ResearchRun.filter({ organization_id: orgId }, '-created_date', 50),
    ]);

    // ── LEADS: alle 3 Quellen auswerten ──────────────────────────────────────
    const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
    const reservedSlots  = quotaSlots.filter(s => s.status === 'reserved').length;

    const usageLogValue = usageLogs?.[0]?.leads_created || 0;
    const usageLog = usageLogs?.[0] || null;

    // PRIMARY: Company-Zählung (echte DB-Zählung)
    const companiesThisMonth = allCompaniesRaw.filter(c => {
      if (!isResearchLead(c)) return false;
      const created = new Date(c.created_date);
      return created >= periodStart && created < periodEnd;
    }).length;

    // QuotaReservation Health: Duplicate-Slot-Check
    const slotNumbers = quotaSlots.map(s => s.slot_number);
    const hasDuplicateSlots = slotNumbers.length !== new Set(slotNumbers).size;
    const duplicateSlots = slotNumbers.filter((n, i) => slotNumbers.indexOf(n) !== i);

    // QuotaReservation Reliability Flag
    // "degraded" wenn: keine committed Slots aber Companies existieren, ODER duplicate slots
    const quotaReservationReliable = committedSlots > 0 && !hasDuplicateSlots;
    const quotaReservationStatus = hasDuplicateSlots
      ? 'corrupt'
      : committedSlots === 0 && companiesThisMonth > 0
        ? 'bypassed'
        : committedSlots > 0
          ? 'active'
          : 'empty';

    // RECONCILIATION per max() — führende Quelle je nach Reliability
    // Policy: Companies ist primär, außer wenn QuotaReservation höher ist (over-count guard)
    const monthlyUsed = Math.max(committedSlots, usageLogValue, companiesThisMonth);

    // source_of_truth je Counter (explizit, nicht stilles max())
    let leadsSourceOfTruth;
    let leadsSourceWarning = null;

    if (quotaReservationStatus === 'corrupt') {
      // Duplicate slots → QuotaReservation nicht vertrauenswürdig
      leadsSourceOfTruth = monthlyUsed === usageLogValue && usageLogValue >= companiesThisMonth
        ? 'usage_log'
        : 'companies_count';
      leadsSourceWarning = 'quota_reservation_corrupt: duplicate slots detected, excluded from primary source';
    } else if (quotaReservationStatus === 'bypassed') {
      // MVP-Bypass: QuotaReservation leer, obwohl Companies existieren
      leadsSourceOfTruth = usageLogValue >= companiesThisMonth ? 'usage_log' : 'companies_count';
      leadsSourceWarning = 'quota_reservation_bypassed: no committed slots despite existing companies';
    } else if (monthlyUsed === committedSlots && committedSlots >= usageLogValue && committedSlots >= companiesThisMonth) {
      leadsSourceOfTruth = 'quota_reservation';
    } else if (monthlyUsed === usageLogValue && usageLogValue >= companiesThisMonth) {
      leadsSourceOfTruth = 'usage_log';
    } else {
      leadsSourceOfTruth = 'companies_count';
    }

    // Reconciliation-Delta: Abweichungen zwischen allen Quellen
    const reconciliationDelta = {
      committed_vs_usagelog: committedSlots - usageLogValue,
      committed_vs_companies: committedSlots - companiesThisMonth,
      usagelog_vs_companies: usageLogValue - companiesThisMonth,
      max_delta: Math.max(
        Math.abs(committedSlots - usageLogValue),
        Math.abs(committedSlots - companiesThisMonth),
        Math.abs(usageLogValue - companiesThisMonth)
      ),
    };

    const sourcesAgree = reconciliationDelta.max_delta <= 1;

    // ── RESEARCH RUNS: primär aus ResearchRun, sekundär UsageLog ─────────────
    const completedRunsThisMonth = researchRunsRaw.filter(r => {
      if (!['completed', 'partial'].includes(r.status)) return false;
      const created = new Date(r.created_date);
      return created >= periodStart && created < periodEnd;
    });
    const researchRunsCount = completedRunsThisMonth.length;
    const researchRunsLogValue = usageLog?.lead_generations_used || 0;
    const researchRunsUsed = Math.max(researchRunsCount, researchRunsLogValue);
    const researchRunsSourceWarning = Math.abs(researchRunsCount - researchRunsLogValue) > 2
      ? `research_runs_drift: DB-count=${researchRunsCount} vs usagelog=${researchRunsLogValue}`
      : null;

    // ── PLAN LADEN ────────────────────────────────────────────────────────────
    let plan = null;
    let planLoadError = null;
    if (org.plan_id) {
      try {
        const planResult = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
        plan = planResult?.[0] || null;
        if (!plan) planLoadError = 'missing';
      } catch {
        planLoadError = 'invalid';
      }
    }

    // ── LIMIT-AUFLÖSUNG ───────────────────────────────────────────────────────
    const hasCustomLimit = org.custom_monthly_lead_limit != null;
    const trialStage = org.trial_stage || 'free_preview';
    const isPaidCustomer = ['paid'].includes(trialStage) || ['active', 'trialing'].includes(org.billing_status || '');

    let monthlyLimit;
    let planStatus = 'ok';
    if (hasCustomLimit) {
      monthlyLimit = org.custom_monthly_lead_limit;
      planStatus = 'custom_limit';
    } else if (plan) {
      monthlyLimit = (plan.max_leads_per_month != null) ? plan.max_leads_per_month : 50;
      if (plan.max_leads_per_month == null) planStatus = 'plan_limit_null';
    } else if (planLoadError === 'missing') {
      planStatus = 'billing_plan_missing';
      monthlyLimit = isPaidCustomer ? 0 : 50;
    } else if (planLoadError === 'invalid') {
      planStatus = 'billing_plan_invalid';
      monthlyLimit = isPaidCustomer ? 0 : 50;
    } else {
      if (isPaidCustomer) {
        planStatus = 'billing_plan_missing';
        monthlyLimit = 0;
      } else if (trialStage === 'verified_trial') {
        planStatus = 'trial_limit';
        monthlyLimit = 50;
      } else {
        planStatus = 'no_plan_preview';
        monthlyLimit = 10;
      }
    }

    const isUnlimited = monthlyLimit === -1;
    const monthlyRemaining = isUnlimited ? null : Math.max(0, monthlyLimit - monthlyUsed);
    const isOverLimit = !isUnlimited && monthlyUsed >= monthlyLimit;

    // ── CRM-BESTAND ───────────────────────────────────────────────────────────
    const blacklist = await base44.entities.Blacklist.filter({ organization_id: orgId });
    const blacklistNames = blacklist.map(b => b.firmenname?.toLowerCase().trim());
    const crmTotal = allCompaniesRaw.filter(c => {
      if (!c.name) return true;
      const n = c.name.toLowerCase().trim();
      return !blacklistNames.some(bl => n.includes(bl) || bl.includes(n));
    }).length;

    // ── LIMIT-WARNUNG bei Company-Filter-Grenze ───────────────────────────────
    const companyFilterAtLimit = allCompaniesRaw.length >= 2000;

    // ── ALLE WARNINGS SAMMELN ──────────────────────────────────────────────────
    const diagnosticWarnings = [];
    if (leadsSourceWarning) diagnosticWarnings.push(leadsSourceWarning);
    if (researchRunsSourceWarning) diagnosticWarnings.push(researchRunsSourceWarning);
    if (!sourcesAgree) diagnosticWarnings.push(`sources_diverge: max_delta=${reconciliationDelta.max_delta} (quota_reservation vs usagelog vs companies)`);
    if (companyFilterAtLimit) diagnosticWarnings.push('company_filter_at_2000_limit: companiesThisMonth may be incomplete');

    const usage_summary = {
      period_month: periodMonth,
      plan_name: plan?.name || null,
      plan_status: planStatus,
      monthly_limit: monthlyLimit,
      monthly_used: monthlyUsed,
      monthly_remaining: monthlyRemaining,
      is_over_limit: isOverLimit,
      is_unlimited: isUnlimited,
      reset_date: resetDateFormatted,
      crm_total: crmTotal,

      // ── USAGE TRUTH POLICY (Phase 1) ─────────────────────────────────────
      usage_source_policy: {
        leads: {
          primary: 'companies_this_month',
          secondary: 'usage_log_leads',
          tertiary: 'committed_slots (diagnostic only)',
          reconciliation: 'max(committed_slots, usage_log_leads, companies_this_month)',
          active_source: leadsSourceOfTruth,
          reliability: quotaReservationStatus === 'corrupt' ? 'degraded_quota_corrupt'
            : quotaReservationStatus === 'bypassed' ? 'degraded_quota_bypassed'
            : sourcesAgree ? 'high' : 'medium_sources_diverge',
        },
        research_runs: {
          primary: 'researchrun_db_count',
          secondary: 'usage_log_lead_generations',
          active_source: researchRunsCount >= researchRunsLogValue ? 'researchrun_db_count' : 'usage_log_lead_generations',
        },
        ai_actions: {
          primary: 'usage_log_ai_actions',
          risk: 'trust_based_no_audit_channel',
        },
        emails: {
          primary: 'usage_log_emails_sent',
          risk: 'trust_based_no_brevo_reconciliation',
        },
        quota_reservation: {
          role: 'diagnostic_only',
          status: quotaReservationStatus,
          note: quotaReservationStatus !== 'active'
            ? 'QuotaReservation not used as primary source: ' + quotaReservationStatus
            : 'QuotaReservation active and consistent',
        },
      },

      // ── RECONCILIATION DIAGNOSTICS (Phase 1) ─────────────────────────────
      reconciliation_diagnostics: {
        source_counts: {
          committed_slots: committedSlots,
          reserved_slots: reservedSlots,
          usage_log_leads: usageLogValue,
          companies_this_month: companiesThisMonth,
          monthly_used_reconciled: monthlyUsed,
          research_runs_db_count: researchRunsCount,
          research_runs_usagelog: researchRunsLogValue,
          research_runs_reconciled: researchRunsUsed,
          ai_actions: usageLog?.ai_actions_used || 0,
          emails_sent: usageLog?.emails_sent || 0,
        },
        source_deltas: reconciliationDelta,
        sources_agree: sourcesAgree,
        quota_reservation_status: quotaReservationStatus,
        quota_reservation_reliable: quotaReservationReliable,
        duplicate_slots: duplicateSlots.length > 0 ? duplicateSlots : null,
        period_bounds: {
          period_month: periodMonth,
          period_start_utc: periodStart.toISOString(),
          period_end_utc: periodEnd.toISOString(),
          boundary_note: 'UTC approximation: up to 2h drift at month boundary (known tech-debt)',
          period_utils_version: 'v1.0',
        },
        company_filter_note: companyFilterAtLimit
          ? 'WARN: Company filter at 2000 limit — companiesThisMonth may be incomplete'
          : null,
      },

      // ── DIAGNOSTIC WARNINGS ───────────────────────────────────────────────
      diagnostic_warnings: diagnosticWarnings,

      // ── WEITERE METRIKEN (aus UsageLog) ──────────────────────────────────
      research_runs_used: researchRunsUsed,
      ai_actions_used: usageLog?.ai_actions_used || 0,
      manual_emails_logged: usageLog?.manual_emails_logged || 0,
      max_research_runs: plan != null ? (plan.max_lead_generations_per_month ?? null) : null,
      max_ai_actions: plan != null ? (plan.max_ai_scorings_per_month ?? null) : null,
      max_emails_per_month: plan != null ? (plan.max_emails_per_month ?? null) : null,

      // Legacy-Feld für Abwärtskompatibilität (wird durch usage_source_policy ersetzt)
      explanation: {
        monthly_used_description: `Automatisch recherchierte Leads (Quelle: ${leadsSourceOfTruth})`,
        crm_total_description: 'Aktuell gespeicherte Firmenkontakte (inkl. manuell angelegte)',
        why_different: monthlyUsed !== crmTotal
          ? 'Monatsverbrauch = nur automatisch recherchierte Leads. CRM-Bestand enthält auch manuell angelegte Kontakte.'
          : null,
        active_source: leadsSourceOfTruth,
        source_warning: leadsSourceWarning,
      },
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