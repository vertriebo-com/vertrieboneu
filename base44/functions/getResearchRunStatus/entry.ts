/**
 * getResearchRunStatus
 * Gibt den aktuellen Status eines ResearchRun zurück.
 * Leichtgewichtig – nur Entity-Lesen, kein Google-API-Call.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt', success: false }, { status: 401 });

    const body = await req.json();
    const { research_run_id } = body;
    if (!research_run_id) {
      return Response.json({ error: 'research_run_id erforderlich', success: false }, { status: 400 });
    }

    const runs = await base44.asServiceRole.entities.ResearchRun.filter({ id: research_run_id }).catch(() => []);
    const run = runs[0];
    if (!run) return Response.json({ error: 'Nicht gefunden', success: false }, { status: 404 });

    // ── Tenant-sicherer Ownership-Check ──────────────────────────────────────
    // organization_id IMMER aus dem validierten ResearchRun nehmen, nie aus dem Request-Body
    const organization_id = run.organization_id;
    const isPlatformAdmin = ["admin","platform_owner","platform_admin"].includes(user.role);

    if (!isPlatformAdmin) {
      const orgsOwned = await base44.asServiceRole.entities.Organization.filter({ id: organization_id, owner_email: user.email }).catch(() => []);
      const isOwner = orgsOwned.length > 0;
      const memberships = await base44.asServiceRole.entities.OrganizationMember.filter({ organization_id, user_email: user.email, status: 'active' }).catch(() => []);
      const isMember = memberships.length > 0;
      if (!isOwner && !isMember) {
        return Response.json({ error: 'Nicht gefunden', success: false }, { status: 404 }); // 404 statt 403: kein Info-Leak über fremde Run-IDs
      }
    }

    // ── Stale-Run-Watchdog ────────────────────────────────────────────────────
    // Run ist running/queued aber kein Update seit >90s → automatisch beenden
    if (run.status === 'running' || run.status === 'queued') {
      const lastUpdate = run.updated_date ? new Date(run.updated_date).getTime() : new Date(run.started_at || run.created_date).getTime();
      const staleMs = Date.now() - lastUpdate;
      if (staleMs > 90000) {
        const finishStatus = (run.leads_saved || 0) > 0 ? 'partial' : 'failed';
        console.warn(`[getResearchRunStatus] Stale run detected (${Math.round(staleMs/1000)}s idle), forcing ${finishStatus}: ${research_run_id}`);
        await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
          status: finishStatus,
          finished_at: new Date().toISOString(),
          current_step: finishStatus === 'partial'
            ? `Recherche abgeschlossen: ${run.leads_saved || 0} Kontakte gefunden`
            : 'Recherche abgebrochen (keine Antwort)',
          stop_reason: 'stale_run_timeout',
          error_message: `Run war ${Math.round(staleMs/1000)}s ohne Fortschritt.`,
        });
        // Aktualisiertes Objekt simulieren
        run.status = finishStatus;
        run.finished_at = new Date().toISOString();
        run.current_step = finishStatus === 'partial'
          ? `Recherche abgeschlossen: ${run.leads_saved || 0} Kontakte gefunden`
          : 'Recherche abgebrochen (keine Antwort)';
      }
    }

    const isDone = ['completed', 'failed', 'partial'].includes(run.status);
    let message = run.current_step || 'Recherche läuft…';

    if (run.status === 'completed') {
      message = (run.leads_saved || 0) > 0
        ? `${run.leads_saved} neue Firmenkontakte gefunden`
        : 'Keine neuen passenden Firmenkontakte gefunden';
    } else if (run.status === 'partial') {
      message = `Recherche teilweise abgeschlossen: ${run.leads_saved || 0} Kontakte gefunden`;
    } else if (run.status === 'failed') {
      message = run.error_message || 'Recherche fehlgeschlagen';
    }

    // Monatliche Nutzung (organization_id aus validiertem ResearchRun)
    // KANONISCH: Europe/Berlin – identisch zu processResearchRun / getDashboardData
    const periodMonth = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).format(new Date()).split('.').reverse().join('-');
    const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
    const monthlyUsage = usageLogs[0] ? {
      monthly_used: usageLogs[0].leads_created || 0,
    } : null;

    return Response.json({
      success: true,
      research_run_id,
      status: run.status,
      progress_percent: run.progress_percent || 0,
      current_step: run.current_step || '',
      leads_saved: run.leads_saved || 0,
      raw_hits: run.raw_hits || 0,
      duplicates_skipped: run.duplicates_skipped || 0,
      done: isDone,
      message,
      monthly_usage: monthlyUsage,
      started_at: run.started_at,
      finished_at: run.finished_at,
    });

  } catch (error) {
    console.error('[getResearchRunStatus] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});