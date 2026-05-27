/**
 * watchdogStuckResearchRuns
 * =========================
 * Scheduled Watchdog: Prüft ResearchRuns mit status queued/running
 * und beendet solche die > 30 Minuten ohne Fortschritt feststecken.
 *
 * IDEMPOTENT: Kann mehrfach laufen ohne Doppel-Effekte.
 * SAFE: Schreibt nur auf Runs die tatsächlich stuck sind.
 *
 * Stuck-Kriterien (BEIDE müssen zutreffen):
 * 1. status = 'queued' ODER 'running'
 * 2. started_at < jetzt - 30min ODER processing_lock_until < jetzt (Lock abgelaufen)
 *
 * Outcome:
 * - leads_saved > 0  → status = 'partial'
 * - leads_saved == 0 → status = 'failed'
 * - processing_lock_until und processing_by werden geleert
 * - error_message + stop_reason werden gesetzt
 * - PlatformAuditLog Eintrag
 * - sendCriticalErrorAlert wenn > 0 Runs repariert
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 Minuten

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Watchdog läuft als System-Job: Service-Role verwenden
    // Kein user.role-Check nötig da Scheduled Automation kein User-Kontext hat
    const now = new Date();
    const stuckCutoff = new Date(now.getTime() - STUCK_THRESHOLD_MS);

    console.info(`[watchdogStuckResearchRuns] Starting at ${now.toISOString()}, cutoff: ${stuckCutoff.toISOString()}`);

    // Alle queued/running Runs laden (max 100 – mehr sollte nie vorkommen)
    const activeRuns = await base44.asServiceRole.entities.ResearchRun.filter(
      {}, '-created_date', 100
    ).then(all => all.filter(r => ['queued', 'running'].includes(r.status)));

    console.info(`[watchdogStuckResearchRuns] Found ${activeRuns.length} active runs`);

    const stuckRuns = activeRuns.filter(run => {
      // Stuck wenn: started_at zu alt ODER processing_lock_until abgelaufen/fehlt
      const startedTooLongAgo = run.started_at
        ? new Date(run.started_at) < stuckCutoff
        : new Date(run.created_date) < stuckCutoff;

      const lockExpired = run.processing_lock_until
        ? new Date(run.processing_lock_until) < now
        : true; // kein Lock = auch stuck wenn started_at alt

      return startedTooLongAgo || (run.status === 'running' && lockExpired);
    });

    console.info(`[watchdogStuckResearchRuns] Found ${stuckRuns.length} stuck runs`);

    if (stuckRuns.length === 0) {
      return Response.json({
        success: true,
        repaired: 0,
        message: 'No stuck runs found.',
        checked: activeRuns.length,
      });
    }

    const repaired = [];
    const errors = [];

    for (const run of stuckRuns) {
      const ageMinutes = run.started_at
        ? Math.round((now - new Date(run.started_at)) / 60000)
        : '?';
      const newStatus = (run.leads_saved || 0) > 0 ? 'partial' : 'failed';
      const stopReason = `watchdog: stuck after ${ageMinutes}min, repaired at ${now.toISOString()}`;

      console.info(`[watchdogStuckResearchRuns] Repairing run ${run.id}: status=${run.status} → ${newStatus}, leads_saved=${run.leads_saved || 0}, age=${ageMinutes}min`);

      try {
        // Idempotenz-Guard: nochmals prüfen ob Run wirklich noch active ist
        const freshRuns = await base44.asServiceRole.entities.ResearchRun.filter({ id: run.id });
        const freshRun = freshRuns?.[0];
        if (!freshRun || !['queued', 'running'].includes(freshRun.status)) {
          console.info(`[watchdogStuckResearchRuns] Run ${run.id} already completed – skip`);
          continue;
        }

        await base44.asServiceRole.entities.ResearchRun.update(run.id, {
          status: newStatus,
          stop_reason: stopReason,
          error_message: newStatus === 'failed'
            ? `Recherche automatisch beendet: Zeitlimit überschritten (${ageMinutes} Minuten ohne Abschluss).`
            : null,
          processing_lock_until: null,
          processing_by: null,
          finished_at: now.toISOString(),
          progress_percent: newStatus === 'partial' ? 100 : (freshRun.progress_percent || 0),
          current_step: newStatus === 'partial'
            ? `${freshRun.leads_saved || 0} Leads gefunden (automatisch abgeschlossen)`
            : 'Automatisch beendet – Zeitlimit überschritten',
        });

        // PlatformAuditLog schreiben
        await base44.asServiceRole.entities.PlatformAuditLog.create({
          actor_email: 'system@vertriebo.watchdog',
          actor_role: 'system',
          action: `watchdog_stuck_run_repaired`,
          target_type: 'organization',
          target_id: run.id,
          organization_id: run.organization_id || 'unknown',
          metadata: JSON.stringify({
            run_id: run.id,
            old_status: run.status,
            new_status: newStatus,
            leads_saved: run.leads_saved || 0,
            age_minutes: ageMinutes,
            stop_reason: stopReason,
          }),
          reason: stopReason,
        });

        repaired.push({
          run_id: run.id,
          org_id: run.organization_id,
          old_status: run.status,
          new_status: newStatus,
          leads_saved: run.leads_saved || 0,
          age_minutes: ageMinutes,
        });
      } catch (updateError) {
        console.error(`[watchdogStuckResearchRuns] Failed to repair run ${run.id}:`, updateError?.message);
        errors.push({ run_id: run.id, error: updateError?.message });
      }
    }

    // Alert senden wenn Runs repariert wurden
    if (repaired.length > 0) {
      const alertMsg = `[Watchdog] ${repaired.length} stuck ResearchRun(s) automatisch beendet:\n` +
        repaired.map(r => `• Run ${r.run_id} (Org: ${r.org_id}): ${r.old_status} → ${r.new_status}, ${r.leads_saved} Leads, ${r.age_minutes}min alt`).join('\n');

      console.warn(alertMsg);

      // sendCriticalErrorAlert aufrufen
      await base44.asServiceRole.functions.invoke('sendCriticalErrorAlert', {
        subject: `[Watchdog] ${repaired.length} stuck ResearchRun(s) repariert`,
        message: alertMsg,
        severity: 'medium',
        source: 'watchdogStuckResearchRuns',
      }).catch(e => {
        console.warn('[watchdogStuckResearchRuns] Alert send failed (non-critical):', e?.message);
      });
    }

    console.info(`[watchdogStuckResearchRuns] Done: ${repaired.length} repaired, ${errors.length} errors`);

    return Response.json({
      success: true,
      checked: activeRuns.length,
      stuck_found: stuckRuns.length,
      repaired: repaired.length,
      errors: errors.length,
      repaired_details: repaired,
      error_details: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('[watchdogStuckResearchRuns] Fatal error:', error?.message);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});