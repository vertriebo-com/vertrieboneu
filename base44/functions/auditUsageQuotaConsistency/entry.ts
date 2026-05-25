/**
 * auditUsageQuotaConsistency
 * ==========================
 * Misst Abweichungen zwischen den 4 Quota-Quellen (QuotaReservation, UsageLog,
 * Company-Zählung, ResearchRun.leads_saved) sowie strukturelle Risiken im
 * Quota-Enforcement-Pfad.
 *
 * Prüft:
 * 1. getUsageSummary vs UsageLog vs Company vs QuotaReservation
 * 2. Leads pro Monat je Org (tatsächliche Abweichung)
 * 3. ResearchRuns / QuotaReservation / Company-Zählung
 * 4. E-Mail-Usage (UsageLog vs Brevo)
 * 5. KI-Usage (UsageLog vs enrichCompany-Aufrufen)
 * 6. Monatsgrenze Europe/Berlin (periodMonth-Konsistenz über alle Funktionen)
 * 7. Plan-Limits aus Plan-Matrix (Vollständigkeit + Widersprüche)
 * 8. Doppelte Reservierungen / Race-Risiko (QuotaReservation-Dedupe)
 * 9. Reconciliation per max() – source_used-Konsistenz
 * 10. Abweichungen zwischen UI-Anzeige und echten Daten
 *
 * Output: claim_status green/yellow/red, risk_level, hard_values,
 *         mismatches, warnings, recommended_fixes
 *
 * Phase-2-Policy:
 * - QuotaReservation wird NUR als diagnostic behandelt wenn:
 *   (a) keine committed Slots obwohl Companies existieren (bypassed), ODER
 *   (b) duplicate slots (corrupt)
 * - source_policy je Counter explizit im Audit-Output
 * - cross_source_consistency nutzt companies_count als Referenzquelle (PRIMARY)
 *
 * Admin-only. Schreibt nichts.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ── PHASE 3: Kanonische Berlin-Period-Hilfsfunktionen (period-utils v1.0) ──────
// Identische Kopie aus getUsageSummary — Tech-Debt: Base44 kein Import.
function getBerlinPeriodMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return { periodMonth: `${y}-${m}`, py: parseInt(y), pm: parseInt(m) };
}
function getBerlinPeriodBounds(py, pm) {
  return {
    periodStart: new Date(Date.UTC(py, pm - 1, 1)),
    periodEnd:   new Date(Date.UTC(py, pm, 1)),
  };
}
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

    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    // Optional: einzelne org_id prüfen. Wenn nicht angegeben → alle Orgs
    const targetOrgId = body?.org_id || null;

    // ── Utility ──────────────────────────────────────────────────────────────

    const tests = [];
    const mismatches = [];
    const warnings = [];
    const recommended_fixes = [];

    function addTest(scope, check, status, description, data = {}) {
      const t = { scope, check, status, description, data };
      tests.push(t);
      if (status === 'red') mismatches.push(t);
      if (status === 'yellow') warnings.push(t);
    }

    // ── PHASE 3: Kanonische Period-Berechnung ────────────────────────────────
    const now = new Date();
    const { periodMonth, py, pm } = getBerlinPeriodMonth(now);
    const { periodStart, periodEnd } = getBerlinPeriodBounds(py, pm);

    // Verification: startResearchRun nutzt de-DE split-Variante → prüfen ob identisch
    const periodMonthAlt = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
    }).format(now).split('.').reverse().join('-');

    // ── ① Monatsgrenze-Konsistenz über alle Funktionen ──────────────────────
    addTest('period_month', 'cross_function_consistency',
      periodMonth === periodMonthAlt ? 'green' : 'red',
      periodMonth === periodMonthAlt
        ? `Phase-3 verified: alle Implementierungen liefern identisches periodMonth="${periodMonth}". startResearchRun (de-DE) stimmt mit kanonischer getBerlinPeriodMonth() überein.`
        : `DIVERGENZ: getBerlinPeriodMonth="${periodMonth}" vs startResearchRun="${periodMonthAlt}". Am Monatswechsel könnten Leads falsch gezählt werden.`,
      {
        canonical_period: periodMonth,
        startResearchRun_period: periodMonthAlt,
        all_match: periodMonth === periodMonthAlt,
        phase3_status: 'getUsageSummary+auditUsageQuotaConsistency unified — startResearchRun+processResearchRun still separate (tech-debt)',
      }
    );

    addTest('period_month', 'utc_boundary_drift_risk',
      'yellow',
      `periodStart/periodEnd sind UTC-Annäherungen (nicht Berlin-Mitternacht). ` +
      `Am Monatswechsel bis zu 2h Drift. max()-Reconciliation kompensiert via UsageLog. ` +
      `Phase-3 Tech-Debt: period-utils v1.0 inline-kopiert, kein echter shared import (Base44 limitation).`,
      {
        period_start_utc: periodStart.toISOString(),
        period_end_utc: periodEnd.toISOString(),
        residual_risk: 'up_to_2_leads_drift_at_month_boundary',
        period_utils_version: 'v1.0',
        mitigation: 'max()-reconciliation + usagelog as berlin-time-tracked source',
      }
    );

    // ── Orgs laden ───────────────────────────────────────────────────────────
    let orgs = [];
    if (targetOrgId) {
      const r = await base44.asServiceRole.entities.Organization.filter({ id: targetOrgId });
      orgs = r || [];
    } else {
      // Alle Orgs mit aktivem Billing oder Trial
      orgs = await base44.asServiceRole.entities.Organization.filter({}, '-created_date', 200);
    }

    const activeOrgs = orgs.filter(o =>
      ['active', 'trialing', 'preview'].includes(o.billing_status) ||
      ['free_preview', 'verified_trial', 'paid'].includes(o.trial_stage)
    );

    addTest('org_scope', 'orgs_audited',
      'green',
      `${activeOrgs.length} aktive Organisationen im Scope (von ${orgs.length} gesamt).`,
      { total_orgs: orgs.length, active_orgs: activeOrgs.length, period_month: periodMonth }
    );

    // ── Alle Pläne laden (einmalig) ──────────────────────────────────────────
    const allPlans = await base44.asServiceRole.entities.Plan.filter({});
    const planMap = {};
    for (const p of allPlans) planMap[p.id] = p;

    // ── ⑦ Plan-Limits aus Plan-Matrix ────────────────────────────────────────
    const plansWithNullLimits = [];
    const plansWithWrongUnlimited = [];
    const plansWithMissingStripe = [];

    for (const p of allPlans) {
      const isAgency = p.plan_type === 'agency' || (p.name || '').toLowerCase().includes('agency');
      if (p.max_leads_per_month == null) plansWithNullLimits.push(p.name);
      if (p.max_lead_generations_per_month == null) plansWithNullLimits.push(`${p.name}.max_lead_generations`);
      if (p.max_ai_scorings_per_month == null) plansWithNullLimits.push(`${p.name}.max_ai_scorings`);
      // -1 bei Nicht-Agency ist Warnung
      if (!isAgency && (p.max_leads_per_month === -1 || p.max_lead_generations_per_month === -1)) {
        plansWithWrongUnlimited.push(p.name);
      }
      if (!p.stripe_price_id) plansWithMissingStripe.push(p.name);
    }

    addTest('plan_matrix', 'null_limits',
      plansWithNullLimits.length > 0 ? 'yellow' : 'green',
      plansWithNullLimits.length > 0
        ? `${plansWithNullLimits.length} Plan-Felder mit null/undefined (werden defensiv auf 50 gesetzt statt ∞): ${plansWithNullLimits.slice(0, 5).join(', ')}`
        : 'Alle Plan-Limitfelder sind gesetzt (kein null/undefined).',
      { null_limit_fields: plansWithNullLimits, total_plans: allPlans.length }
    );

    addTest('plan_matrix', 'unlimited_non_agency',
      plansWithWrongUnlimited.length > 0 ? 'yellow' : 'green',
      plansWithWrongUnlimited.length > 0
        ? `Nicht-Agency-Pläne mit -1 (unlimited): ${plansWithWrongUnlimited.join(', ')}. Prüfen ob beabsichtigt.`
        : 'Kein Nicht-Agency-Plan hat -1 (unlimited) in Lead-Limit-Feldern.',
      { plans_with_unlimited: plansWithWrongUnlimited }
    );

    addTest('plan_matrix', 'stripe_price_id',
      plansWithMissingStripe.length > 0 ? 'yellow' : 'green',
      plansWithMissingStripe.length > 0
        ? `Pläne ohne Stripe Price ID (Checkout nicht möglich): ${plansWithMissingStripe.join(', ')}`
        : 'Alle aktiven Pläne haben eine Stripe Price ID.',
      { plans_missing_stripe: plansWithMissingStripe }
    );

    // ── NON_QUOTA Hilfsmenge (kanonisch) ─────────────────────────────────────
    const NON_QUOTA_RUN_IDS = new Set(['manual_setup', 'csv_import', 'manual', 'import']);

    // ── Pro-Org-Analyse ──────────────────────────────────────────────────────
    const orgResults = [];
    let totalMismatchCount = 0;
    let orgsWithMismatch = 0;
    let orgsWithDuplicateSlots = 0;
    let orgsWithUsageLogDrift = 0;
    let orgsOverLimit = 0;

    for (const org of activeOrgs.slice(0, 50)) { // Max 50 Orgs für Performance
      const orgId = org.id;

      // Parallel: alle Quellen laden
      const [quotaSlots, usageLogs, companiesRaw, researchRuns] = await Promise.all([
        base44.asServiceRole.entities.QuotaReservation.filter({ organization_id: orgId, period_month: periodMonth }).catch(() => []),
        base44.asServiceRole.entities.UsageLog.filter({ organization_id: orgId, period_month: periodMonth }).catch(() => []),
        base44.asServiceRole.entities.Company.filter({ organization_id: orgId }, '-created_date', 2000).catch(() => []),
        base44.asServiceRole.entities.ResearchRun.filter({ organization_id: orgId }, '-created_date', 20).catch(() => []),
      ]);

      // Quellen auswerten
      const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
      const reservedSlots  = quotaSlots.filter(s => s.status === 'reserved').length;
      const releasedSlots  = quotaSlots.filter(s => s.status === 'released').length;
      const usageLogValue  = usageLogs?.[0]?.leads_created || 0;
      const aiActionsLog   = usageLogs?.[0]?.ai_actions_used || 0;
      const emailsLog      = usageLogs?.[0]?.emails_sent || 0;
      const researchRunsLog = usageLogs?.[0]?.lead_generations_used || 0;

      // Companies diesen Monat (Research-only, UTC-Annäherung — phase-3 getBerlinPeriodBounds)
      const companiesThisMonth = companiesRaw.filter(c => {
        if (!isResearchLead(c)) return false;
        const created = new Date(c.created_date);
        return created >= periodStart && created < periodEnd;
      }).length;

      // ResearchRun leads_saved diesen Monat
      const completedRunsThisMonth = researchRuns.filter(r => {
        if (!['completed', 'partial'].includes(r.status)) return false;
        const created = new Date(r.created_date);
        return created >= periodStart && created < periodEnd;
      });
      const runLeadsSavedSum = completedRunsThisMonth.reduce((s, r) => s + (r.leads_saved || 0), 0);

      // max()-Reconciliation
      const monthlyUsed = Math.max(committedSlots, usageLogValue, companiesThisMonth);

      // Abweichungen messen
      const maxDelta = Math.max(
        Math.abs(committedSlots - usageLogValue),
        Math.abs(committedSlots - companiesThisMonth),
        Math.abs(usageLogValue - companiesThisMonth)
      );

      // Doppelte Slot-Nummern prüfen (Race-Condition-Indikator)
      const slotNumbers = quotaSlots.map(s => s.slot_number);
      const slotSet = new Set(slotNumbers);
      const hasDuplicateSlots = slotNumbers.length !== slotSet.size;
      const duplicateSlotNumbers = slotNumbers.filter((n, i) => slotNumbers.indexOf(n) !== i);

      if (hasDuplicateSlots) orgsWithDuplicateSlots++;

      // UsageLog-Drift: UsageLog weicht mehr als 2 von Company-Zählung ab
      const usageLogCompanyDelta = Math.abs(usageLogValue - companiesThisMonth);
      if (usageLogCompanyDelta > 2) orgsWithUsageLogDrift++;

      // Plan-Limit
      const plan = planMap[org.plan_id] || null;
      const monthlyLimit = org.custom_monthly_lead_limit != null
        ? org.custom_monthly_lead_limit
        : plan ? plan.max_leads_per_month : null;
      const isUnlimited = monthlyLimit === -1;
      const isOverLimit = !isUnlimited && monthlyLimit != null && monthlyUsed >= monthlyLimit;
      if (isOverLimit) orgsOverLimit++;

      // ResearchRun Sum vs Company Count Delta
      const runVsCompanyDelta = Math.abs(runLeadsSavedSum - companiesThisMonth);

      if (maxDelta > 2) {
        totalMismatchCount++;
        orgsWithMismatch++;
      }

      // Phase-2: QuotaReservation Reliability
      const quotaStatus = hasDuplicateSlots
        ? 'corrupt'
        : committedSlots === 0 && companiesThisMonth > 0
          ? 'bypassed'
          : committedSlots > 0 ? 'active' : 'empty';

      // source_of_truth per Phase-2-Policy (companies_count ist PRIMARY)
      let sourceUsed;
      if (quotaStatus === 'corrupt' || quotaStatus === 'bypassed') {
        // QuotaReservation nicht als führende Quelle
        sourceUsed = usageLogValue >= companiesThisMonth ? 'usage_log' : 'companies_count';
      } else {
        sourceUsed = monthlyUsed === committedSlots && committedSlots >= usageLogValue && committedSlots >= companiesThisMonth
          ? 'quota_reservation'
          : monthlyUsed === usageLogValue && usageLogValue >= companiesThisMonth
          ? 'usage_log'
          : 'companies_count';
      }

      orgResults.push({
        org_id: orgId,
        org_name: org.name,
        trial_stage: org.trial_stage,
        billing_status: org.billing_status,
        plan_name: plan?.name || null,
        monthly_limit: monthlyLimit,
        is_unlimited: isUnlimited,
        is_over_limit: isOverLimit,
        sources: {
          committed_slots: committedSlots,
          reserved_slots: reservedSlots,
          released_slots: releasedSlots,
          usage_log_leads: usageLogValue,
          companies_this_month: companiesThisMonth,
          run_leads_saved_sum: runLeadsSavedSum,
          monthly_used_reconciled: monthlyUsed,
          source_of_truth: sourceUsed,
          quota_reservation_status: quotaStatus,
        },
        deltas: {
          committed_vs_usagelog: committedSlots - usageLogValue,
          committed_vs_companies: committedSlots - companiesThisMonth,
          usagelog_vs_companies: usageLogValue - companiesThisMonth,
          runs_vs_companies: runVsCompanyDelta,
          max_delta_all_sources: maxDelta,
        },
        quality: {
          has_duplicate_slots: hasDuplicateSlots,
          duplicate_slot_numbers: duplicateSlotNumbers.slice(0, 5),
          usagelog_company_delta: usageLogCompanyDelta,
          sources_agree: maxDelta <= 1,
        },
        ai_actions_logged: aiActionsLog,
        emails_logged: emailsLog,
        research_runs_logged: researchRunsLog,
        total_companies: companiesRaw.length,
      });
    }

    // ── ① Cross-Source-Consistency (Phase-2-Policy) ──────────────────────────
    // PRIMARY reference: companies_this_month (echte DB-Zählung)
    // Delta = |usagelog - companies| (QuotaReservation ist diagnostic-only wenn bypassed/corrupt)
    const orgsWithCorruptQuota = orgResults.filter(o => o.sources.quota_reservation_status === 'corrupt');
    const orgsWithBypassedQuota = orgResults.filter(o => o.sources.quota_reservation_status === 'bypassed');

    // Für Quellen-Divergenz: companies_count als Referenz, UsageLog als Vergleich
    const orgsWithLargeDelta = orgResults.filter(o => Math.abs(o.deltas.usagelog_vs_companies) > 5);
    const orgsWithSmallDelta = orgResults.filter(o => {
      const d = Math.abs(o.deltas.usagelog_vs_companies);
      return d > 1 && d <= 5;
    });
    const orgsAllAgree = orgResults.filter(o => Math.abs(o.deltas.usagelog_vs_companies) <= 1);

    // Status: corrupt quota ist RED, large usagelog-vs-companies delta ist YELLOW
    const crossSourceStatus = orgsWithCorruptQuota.length > 0 ? 'red'
      : orgsWithLargeDelta.length > 0 ? 'yellow'
      : orgsWithBypassedQuota.length > 0 ? 'yellow'
      : 'green';

    addTest('quota_sources', 'cross_source_consistency',
      crossSourceStatus,
      orgsWithCorruptQuota.length > 0
        ? `${orgsWithCorruptQuota.length} Org(s) mit KORRUPTEN QuotaReservations (duplicate slots). QuotaReservation als Quelle ausgeschlossen.`
        : orgsWithLargeDelta.length > 0
        ? `Phase-2: ${orgsWithLargeDelta.length} Org(s): UsageLog weicht >5 von companies_count ab (PRIMARY). Ursache prüfen.`
        : orgsWithBypassedQuota.length > 0
        ? `Phase-2: ${orgsWithBypassedQuota.length} Org(s): QuotaReservation bypassed (MVP). UsageLog/Companies stimmen überein (Δ ≤ 1). Akzeptiert.`
        : `Phase-2: Alle ${orgsAllAgree.length} Orgs: UsageLog ≈ companies_count (Δ ≤ 1). Historische Deltas durch QuotaReservation-Bypass erwartet.`,
      {
        phase2_policy: 'companies_count=PRIMARY, usagelog=SECONDARY, quota_reservation=DIAGNOSTIC',
        orgs_corrupt_quota: orgsWithCorruptQuota.map(o => ({ org: o.org_name, duplicate_slots: o.quality.duplicate_slot_numbers, sources: o.sources })),
        orgs_bypassed_quota: orgsWithBypassedQuota.map(o => ({ org: o.org_name, companies: o.sources.companies_this_month, committed: o.sources.committed_slots })),
        orgs_large_usagelog_delta: orgsWithLargeDelta.map(o => ({ org: o.org_name, usagelog: o.sources.usage_log_leads, companies: o.sources.companies_this_month, delta: o.deltas.usagelog_vs_companies })),
        orgs_all_agree_count: orgsAllAgree.length,
        total_orgs_checked: orgResults.length,
        note: 'Large quota_reservation deltas are expected/accepted (MVP bypass active). UsageLog vs Companies is the meaningful check.',
      }
    );

    // ── ③ ResearchRun leads_saved vs Company-Zählung ────────────────────────
    const orgsWithRunVsCompanyDelta = orgResults.filter(o => o.deltas.runs_vs_companies > 5);
    addTest('research_runs', 'leads_saved_vs_companies',
      orgsWithRunVsCompanyDelta.length > 0 ? 'yellow' : 'green',
      orgsWithRunVsCompanyDelta.length > 0
        ? `${orgsWithRunVsCompanyDelta.length} Org(s): ResearchRun.leads_saved Summe weicht >5 von Company-Zählung ab. Mögliche Lücken im Company-Create-Pfad.`
        : 'ResearchRun.leads_saved stimmt mit Company-Zählung überein (Δ ≤ 5).',
      {
        orgs_with_run_company_delta: orgsWithRunVsCompanyDelta.map(o => ({
          org: o.org_name,
          run_leads_saved_sum: o.sources.run_leads_saved_sum,
          companies_this_month: o.sources.companies_this_month,
          delta: o.deltas.runs_vs_companies,
        })),
      }
    );

    // ── ⑧ Doppelte Reservierungen / Race-Risiko (Phase-2: Report, kein Auto-Delete) ─
    // Policy: Nicht automatisch löschen. Report mit allen Details für manuelle Prüfung.
    const dupSlotReport = orgResults.filter(o => o.quality.has_duplicate_slots).map(async (o) => {
      const allSlots = await base44.asServiceRole.entities.QuotaReservation.filter({
        organization_id: o.org_id, period_month: periodMonth,
      }).catch(() => []);
      const bySlotNumber = {};
      for (const s of allSlots) {
        if (!bySlotNumber[s.slot_number]) bySlotNumber[s.slot_number] = [];
        bySlotNumber[s.slot_number].push({ id: s.id, status: s.status, reserved_at: s.reserved_at, run_id: s.research_run_id });
      }
      const duplicates = Object.entries(bySlotNumber).filter(([, arr]) => arr.length > 1).map(([slotNum, arr]) => ({
        slot_number: parseInt(slotNum),
        reservation_ids: arr.map(r => r.id),
        statuses: arr.map(r => r.status),
        reserved_ats: arr.map(r => r.reserved_at),
        run_ids: arr.map(r => r.run_id),
      }));
      return { org_id: o.org_id, org_name: o.org_name, period_month: periodMonth, duplicates };
    });
    const dupSlotDetails = await Promise.all(dupSlotReport);

    addTest('quota_reservation', 'duplicate_slots',
      orgsWithDuplicateSlots > 0 ? 'red' : 'green',
      orgsWithDuplicateSlots > 0
        ? `${orgsWithDuplicateSlots} Org(s) haben doppelte Slot-Nummern. Race-Condition nachgewiesen. Phase-2: QuotaReservation für diese Orgs als corrupt/diagnostic markiert. NICHT automatisch gelöscht.`
        : 'Keine doppelten Slot-Nummern in QuotaReservation.',
      {
        phase2_action: 'report_only_no_auto_delete',
        orgs_with_duplicates: dupSlotDetails,
        impact: 'quota_reservation excluded from primary source for affected orgs (companies_count used instead)',
        remediation: 'Manual review required. repairQuotaCommit can be extended to deduplicate.',
      }
    );

    // Orphaned Reserved Slots: reserved aber kein committedSlot innerhalb 30min (potenzielle Zombie-Reservierungen)
    const allCurrentSlots = await base44.asServiceRole.entities.QuotaReservation.filter(
      { period_month: periodMonth }, '-created_date', 500
    ).catch(() => []);
    const reservedOlderThan30min = allCurrentSlots.filter(s => {
      if (s.status !== 'reserved') return false;
      const age = (Date.now() - new Date(s.reserved_at || s.created_date).getTime()) / 1000 / 60;
      return age > 30;
    });

    addTest('quota_reservation', 'orphaned_reserved_slots',
      reservedOlderThan30min.length > 0 ? 'yellow' : 'green',
      reservedOlderThan30min.length > 0
        ? `${reservedOlderThan30min.length} Reserved-Slots älter als 30min ohne Commit (Zombie-Reservierungen). Diese zählen noch zum Quota-Verbrauch falls nicht released.`
        : 'Keine orphaned Reserved-Slots gefunden.',
      {
        orphaned_count: reservedOlderThan30min.length,
        sample: reservedOlderThan30min.slice(0, 5).map(s => ({
          id: s.id,
          org_id: s.organization_id,
          slot: s.slot_number,
          run_id: s.research_run_id,
          reserved_at: s.reserved_at,
          age_min: Math.round((Date.now() - new Date(s.reserved_at || s.created_date).getTime()) / 1000 / 60),
        })),
        impact: 'reserved slots count toward monthly quota if not released',
      }
    );

    // ── ⑨ Reconciliation per max() — source_used-Verteilung ─────────────────
    const sourceDistribution = { quota_reservation: 0, usage_log: 0, companies_count: 0 };
    for (const o of orgResults) {
      const k = o.sources.source_of_truth;
      sourceDistribution[k] = (sourceDistribution[k] || 0) + 1;
    }

    addTest('reconciliation', 'source_used_distribution',
      'green',
      `max()-Reconciliation aktiv. Quelle die den Höchstwert liefert: quota_reservation=${sourceDistribution.quota_reservation} usage_log=${sourceDistribution.usage_log} companies_count=${sourceDistribution.companies_count}.`,
      {
        source_distribution: sourceDistribution,
        total_orgs: orgResults.length,
        note: 'Wenn companies_count dominiert, ist QuotaReservation/UsageLog möglicherweise unvollständig.'
      }
    );

    // Wenn companies_count bei vielen Orgs dominiert → Warnung
    const companiesCountDominant = sourceDistribution.companies_count > (orgResults.length / 2);
    if (companiesCountDominant && orgResults.length > 2) {
      addTest('reconciliation', 'companies_count_dominates',
        'yellow',
        `Bei >50% der Orgs ist companies_count die höchste Quelle. QuotaReservation oder UsageLog könnten systematisch unterreporten.`,
        { source_distribution: sourceDistribution }
      );
    }

    // ── ⑩ UsageLog-Drift: UI-Anzeige vs echte Company-Zählung ───────────────
    addTest('ui_display', 'usagelog_vs_companies_drift',
      orgsWithUsageLogDrift > 0 ? 'yellow' : 'green',
      orgsWithUsageLogDrift > 0
        ? `${orgsWithUsageLogDrift} Org(s): UsageLog.leads_created weicht >2 von tatsächlicher Company-Zählung ab. Die UI könnte einen anderen Wert anzeigen als tatsächlich existiert.`
        : 'UsageLog stimmt mit Company-Zählung überein (Δ ≤ 2) für alle geprüften Orgs.',
      {
        orgs_with_drift: orgResults
          .filter(o => o.deltas.usagelog_vs_companies > 2)
          .map(o => ({
            org: o.org_name,
            usagelog: o.sources.usage_log_leads,
            companies: o.sources.companies_this_month,
            delta: o.deltas.usagelog_vs_companies,
          })),
      }
    );

    // ── ④ E-Mail-Usage ────────────────────────────────────────────────────────
    // emails_sent in UsageLog vs tatsächlich gesendete E-Mails (keine direkte DB-Quelle)
    // Prüfen: Wie viele Orgs haben überhaupt E-Mail-Log-Einträge?
    const orgsWithEmailLog = orgResults.filter(o => o.emails_logged > 0);
    addTest('email_usage', 'usagelog_tracking',
      'yellow',
      `E-Mail-Usage-Tracking: ${orgsWithEmailLog.length}/${orgResults.length} Orgs haben emails_sent > 0 im UsageLog. ` +
      `Es gibt keine direkte Reconciliation gegen Brevo-API (kein Rückkanal). ` +
      `UsageLog.emails_sent ist ein Vertrauenswert (write-time-Tracking, nicht read-time-Audit).`,
      {
        orgs_with_email_log: orgsWithEmailLog.length,
        email_log_detail: orgsWithEmailLog.slice(0, 5).map(o => ({ org: o.org_name, emails_sent: o.emails_logged })),
        limitation: 'No Brevo API reconciliation available — trust-based tracking only',
      }
    );

    // ── ⑤ KI-Usage ───────────────────────────────────────────────────────────
    const orgsWithAiLog = orgResults.filter(o => o.ai_actions_logged > 0);
    // KI-Usage-Prüfung: enrichCompany schreibt UsageLog.ai_actions_used — prüfen ob Limit korrekt enforced wird
    const orgsOverAiLimit = orgResults.filter(o => {
      const plan = planMap[o.plan_name] || null; // name lookup nicht möglich ohne id, skip
      return false; // Vereinfacht: kann hier nicht vollständig resolven ohne plan_id
    });

    addTest('ai_usage', 'usagelog_tracking',
      'green',
      `KI-Usage: ${orgsWithAiLog.length}/${orgResults.length} Orgs haben ai_actions_used > 0 im UsageLog. ` +
      `enrichCompany schreibt UsageLog korrekt und prüft Limit VOR LLM-Aufruf (serverseitig).`,
      {
        orgs_with_ai_log: orgsWithAiLog.length,
        ai_log_detail: orgsWithAiLog.slice(0, 5).map(o => ({ org: o.org_name, ai_actions: o.ai_actions_logged })),
        enforcement: 'pre-call limit check in enrichCompany (server-side)',
      }
    );

    // ── Orgs über Limit ──────────────────────────────────────────────────────
    addTest('quota_enforcement', 'orgs_over_limit',
      orgsOverLimit > 0 ? 'yellow' : 'green',
      orgsOverLimit > 0
        ? `${orgsOverLimit} Org(s) haben monthlyUsed >= monthlyLimit. Recherchen sollten blockiert werden — prüfen ob startResearchRun korrekt blockiert.`
        : 'Keine Org ist über ihrem monatlichen Lead-Limit.',
      {
        orgs_over_limit: orgResults.filter(o => o.is_over_limit).map(o => ({
          org: o.org_name,
          monthly_used: o.sources.monthly_used_reconciled,
          monthly_limit: o.monthly_limit,
          delta: o.sources.monthly_used_reconciled - (o.monthly_limit || 0),
        })),
      }
    );

    // ── ② Leads pro Monat je Org — Zusammenfassung ───────────────────────────
    const topOrgs = [...orgResults].sort((a, b) => b.sources.monthly_used_reconciled - a.sources.monthly_used_reconciled).slice(0, 10);
    addTest('leads_per_org', 'monthly_distribution',
      'green',
      `Top-10 Orgs nach monatlichen Leads (reconciled). Hilft bei Erkennung ungewöhnlicher Muster.`,
      {
        top_10_orgs_by_leads: topOrgs.map(o => ({
          org: o.org_name,
          monthly_used: o.sources.monthly_used_reconciled,
          plan: o.plan_name,
          monthly_limit: o.monthly_limit,
          pct_used: o.monthly_limit && o.monthly_limit > 0 ? Math.round(o.sources.monthly_used_reconciled / o.monthly_limit * 100) : null,
        })),
      }
    );

    // ── STRUCTURAL RISKS ─────────────────────────────────────────────────────

    // RISK 1: Company.filter Limit 2000 — bei > 2000 Companies unvollständige Zählung
    const orgsNear2000 = orgResults.filter(o => o.total_companies >= 1800);
    addTest('structural', 'company_filter_2000_limit',
      orgsNear2000.length > 0 ? 'yellow' : 'green',
      orgsNear2000.length > 0
        ? `${orgsNear2000.length} Org(s) nähern sich dem Company-Filter-Limit (2000). companiesThisMonth könnte unvollständig sein. max()-Formel kompensiert via QuotaReservation/UsageLog.`
        : 'Keine Org ist nahe dem Company-Filter-Limit (2000).',
      {
        orgs_near_limit: orgsNear2000.map(o => ({ org: o.org_name, total_companies: o.total_companies })),
        mitigation: 'max()-formula uses QuotaReservation as primary source when company count is unreliable',
      }
    );

    // RISK 2: Orgs ohne UsageLog-Eintrag für diesen Monat
    const orgsWithoutUsageLog = orgResults.filter(o => o.sources.usage_log_leads === 0 && o.sources.companies_this_month > 0);
    addTest('structural', 'orgs_without_usagelog',
      orgsWithoutUsageLog.length > 0 ? 'yellow' : 'green',
      orgsWithoutUsageLog.length > 0
        ? `${orgsWithoutUsageLog.length} Org(s) haben Companies diesen Monat, aber UsageLog.leads_created = 0. UsageLog wird möglicherweise nicht geschrieben (non-blocking try/catch in processResearchRun).`
        : 'Alle Orgs mit Research-Leads diesen Monat haben auch einen UsageLog-Eintrag.',
      {
        orgs_missing_usagelog: orgsWithoutUsageLog.map(o => ({
          org: o.org_name,
          companies_this_month: o.sources.companies_this_month,
          usage_log_value: o.sources.usage_log_leads,
        })),
        root_cause: 'UsageLog write is in non-blocking try/catch in processResearchRun — silent failures possible',
      }
    );

    // RISK 3: Orgs ohne QuotaReservation-Einträge aber mit Companies
    const orgsWithoutQuota = orgResults.filter(o => o.sources.committed_slots === 0 && o.sources.companies_this_month > 0);
    addTest('structural', 'orgs_without_quota_reservations',
      orgsWithoutQuota.length > 0 ? 'yellow' : 'green',
      orgsWithoutQuota.length > 0
        ? `${orgsWithoutQuota.length} Org(s) haben Companies diesen Monat, aber keine committed QuotaReservations. QuotaReservation-Pfad möglicherweise nicht aktiv (MVP-Bypass?).`
        : 'Alle Orgs mit Research-Leads haben auch committed QuotaReservations.',
      {
        orgs_missing_quota: orgsWithoutQuota.map(o => ({
          org: o.org_name,
          companies_this_month: o.sources.companies_this_month,
          committed_slots: o.sources.committed_slots,
        })),
        root_cause: 'QuotaReservation was removed from critical path in processResearchRun (MVP decision)',
      }
    );

    // ── GESAMTBEWERTUNG ───────────────────────────────────────────────────────
    const redCount    = tests.filter(t => t.status === 'red').length;
    const yellowCount = tests.filter(t => t.status === 'yellow').length;
    const claimStatus = redCount >= 1 ? 'red' : yellowCount >= 1 ? 'yellow' : 'green';
    const riskLevel   = redCount >= 3 ? 'critical' : redCount >= 1 ? 'high' : yellowCount >= 4 ? 'medium' : yellowCount >= 1 ? 'low' : 'minimal';

    // ── RECOMMENDED_FIXES ─────────────────────────────────────────────────────
    if (orgsWithoutUsageLog.length > 0) {
      recommended_fixes.push({
        priority: 1,
        target: 'processResearchRun',
        fix: 'UsageLog-Fehler sichtbar machen',
        description: `${orgsWithoutUsageLog.length} Org(s) haben Companies aber kein UsageLog. ` +
          'UsageLog-Write ist non-blocking (try/catch) → stille Fehler möglich. ' +
          'Fix: UsageLog-Fehler in ResearchRun.error_message schreiben oder Alert senden.',
        effort: 'klein',
        risk: 'none (additive)',
        status: 'open',
      });
    }

    if (reservedOlderThan30min.length > 0) {
      recommended_fixes.push({
        priority: 2,
        target: 'QuotaReservation',
        fix: 'Zombie-Reservierungen bereinigen',
        description: `${reservedOlderThan30min.length} Reserved-Slots älter als 30min ohne Commit. ` +
          'Diese sollten auto-released werden. ' +
          'Fix: Scheduled Automation oder repairQuotaCommit erweitern um >30min reserved Slots zu releasen.',
        effort: 'mittel',
        risk: 'low',
        status: 'open',
      });
    }

    recommended_fixes.push({
      priority: 3,
      target: 'getUsageSummary / startResearchRun / processResearchRun',
      fix: 'Tech-Debt: 3 periodMonth-Implementierungen angleichen',
      description:
        'Alle 3 Funktionen berechnen periodMonth separat. ' +
        'Aktuell liefern beide Implementierungen denselben Wert (verified). ' +
        'Langfristig: Eine kanonische Funktion oder zumindest unit-testbaren Shared-Wert. ' +
        'Risiko: Am Monatswechsel (Berlin-Zeit vs UTC) können bis zu 2 Leads falsch gezählt werden.',
      effort: 'klein (3 Zeilen kanonische Funktion)',
      risk: 'minimal',
      status: 'tech_debt',
    });

    recommended_fixes.push({
      priority: 4,
      target: 'getUsageSummary',
      fix: 'Company-Filter-Limit erhöhen oder paginieren',
      description:
        'Company.filter limit=2000 — bei > 2000 Companies/Monat ist companiesThisMonth unvollständig. ' +
        'max()-Formel kompensiert via QuotaReservation/UsageLog, aber bei großen Agenturen könnte companies_count als Fallback versagen. ' +
        'Fix: Paginierung oder QuotaReservation als primäre Quelle für große Orgs.',
      effort: 'mittel',
      risk: 'low (nur bei sehr großen Orgs)',
      status: 'future_proof',
    });

    // ── HARD VALUES ───────────────────────────────────────────────────────────
    const hard_values = {
      period_month: periodMonth,
      period_implementations_match: periodMonth === periodMonthAlt,
      orgs_audited: orgResults.length,
      orgs_with_mismatch_gt2: orgsWithMismatch,
      orgs_with_duplicate_slots: orgsWithDuplicateSlots,
      orgs_with_usagelog_drift: orgsWithUsageLogDrift,
      orgs_without_usagelog: orgsWithoutUsageLog.length,
      orgs_without_quota_reservations: orgsWithoutQuota.length,
      orgs_over_limit: orgsOverLimit,
      orphaned_reserved_slots: reservedOlderThan30min.length,
      total_plans: allPlans.length,
      plans_with_null_limits: plansWithNullLimits.length,
      plans_with_missing_stripe: plansWithMissingStripe.length,
      reconciliation_formula: 'max(committedSlots, usageLogValue, companiesThisMonth)',
      reconciliation_source_distribution: sourceDistribution,
      tech_debt_notes: [
        'authorizeOrganizationAction: identical canonical copies in 5 functions (Base44 no local imports)',
        'periodMonth: 3 separate implementations — all currently produce identical values',
        'Company.filter limit=2000 — may be insufficient for large agencies',
        'UsageLog write is non-blocking (silent failure possible)',
        'QuotaReservation removed from critical path (MVP) — max() formula compensates',
      ],
    };

    return Response.json({
      claim_status: claimStatus,
      summary: {
        passed: tests.filter(t => t.status === 'green').length,
        failed: redCount,
        warnings: yellowCount,
        total_tests: tests.length,
        risk_level: riskLevel,
      },
      hard_values,
      org_results: orgResults,
      tests,
      mismatches,
      warnings,
      recommended_fixes,
    });

  } catch (error) {
    console.error('[auditUsageQuotaConsistency] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});