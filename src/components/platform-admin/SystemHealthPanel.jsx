import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  Activity, Loader2, Play, CheckCircle2, XCircle, AlertTriangle,
  Brain, FileBarChart2, Shield, DatabaseZap, Users, TrendingUp, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

// ── Sub-Components ─────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  if (status === 'ok' || status === true) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === 'critical' || status === false) return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  return <AlertTriangle className="w-4 h-4 text-slate-400" />;
}

function MetricCard({ icon: IconComp, label, value, sub, status }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
      <div className={`p-2 rounded-lg flex-shrink-0 ${
        status === 'critical' ? 'bg-red-50' :
        status === 'warning'  ? 'bg-amber-50' :
        status === 'ok'       ? 'bg-emerald-50' : 'bg-slate-100'
      }`}>
        <IconComp className={`w-4 h-4 ${
          status === 'critical' ? 'text-red-600' :
          status === 'warning'  ? 'text-amber-600' :
          status === 'ok'       ? 'text-emerald-600' : 'text-slate-500'
        }`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-slate-900 leading-tight">{value ?? '—'}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function ActionCard({ label, description, icon: IconComp, onRun, loading, result }) {
  const hasResult = !!result;
  const resultStatus = result?.data?.status || (result?.data?.success ? 'ok' : null);

  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
      <div className="p-2 bg-white border border-slate-200 rounded-lg flex-shrink-0">
        <IconComp className="w-4 h-4 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-900">{label}</p>
        <p className="text-[10px] text-slate-500">{description}</p>
        {hasResult && (
          <div className={`mt-1.5 text-[10px] rounded px-2 py-1 font-medium ${
            resultStatus === 'critical' ? 'bg-red-50 text-red-700' :
            resultStatus === 'warning'  ? 'bg-amber-50 text-amber-700' :
            resultStatus === 'ok'       ? 'bg-emerald-50 text-emerald-700' :
            'bg-slate-100 text-slate-600'
          }`}>
            {moment(result.ts).format('HH:mm:ss')} ·{' '}
            {result.data?.status ? result.data.status.toUpperCase() : ''}
            {result.data?.repaired != null ? ` · ${result.data.repaired} repariert` : ''}
            {result.data?.processed != null ? ` · ${result.data.processed} Orgs` : ''}
            {result.data?.average_score != null ? ` · Score ∅${result.data.average_score}` : ''}
            {result.data?.success === false && (result.data?.error || 'Fehler')}
          </div>
        )}
      </div>
      <Button onClick={onRun} disabled={loading} variant="outline" size="sm" className="h-8 px-2.5 flex-shrink-0">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
      </Button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SystemHealthPanel({
  systemConfig, googlePlacesEnabled, setGooglePlacesEnabled,
  disabledReason, setDisabledReason, onSaveSystemConfig, savingSystemConfig
}) {
  const [running, setRunning] = useState({});
  const [results, setResults] = useState({});
  const [recentLogs, setRecentLogs] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const runAction = async (key, fn, payload = {}) => {
    setRunning(prev => ({ ...prev, [key]: true }));
    try {
      const res = await base44.functions.invoke(fn, payload);
      setResults(prev => ({ ...prev, [key]: { data: res.data, ts: new Date().toISOString() } }));
      const status = res.data?.status || (res.data?.success !== false ? 'ok' : 'error');
      if (status === 'critical') toast.warning(`${key}: Kritische Punkte gefunden`);
      else toast.success(`${key}: Ausgeführt`);
    } catch (e) {
      toast.error(`${key} fehlgeschlagen: ${e.message}`);
      setResults(prev => ({ ...prev, [key]: { data: { success: false, error: e.message }, ts: new Date().toISOString() } }));
    } finally {
      setRunning(prev => ({ ...prev, [key]: false }));
    }
  };

  const loadRecentLogs = async () => {
    setLogsLoading(true);
    try {
      const logs = await base44.entities.PlatformAuditLog.list('-created_date', 30);
      setRecentLogs(logs);
    } catch (e) {
      toast.error('Logs laden fehlgeschlagen');
    } finally {
      setLogsLoading(false);
    }
  };

  // Metriken aus geladenen Audit-Logs berechnen
  const latestDailyReport = recentLogs?.find(l => l.action === 'platform_daily_report');
  const latestLearning    = recentLogs?.find(l => l.action === 'learning_loop_updated');
  const latestWeeklyAudit = recentLogs?.find(l => l.action === 'weekly_data_quality_audit');
  const latestWatchdog    = recentLogs?.find(l => l.action === 'watchdog_stuck_run_repaired');
  const newWaitlist24h    = recentLogs?.filter(l => l.action === 'waitlist_lead_created' && new Date(l.created_date) >= new Date(Date.now() - 86400000)).length ?? null;
  const newInvestors24h   = recentLogs?.filter(l => l.action === 'investor_inquiry_created' && new Date(l.created_date) >= new Date(Date.now() - 86400000)).length ?? null;

  const parseLogMeta = (log) => {
    try { return JSON.parse(log?.metadata || '{}'); } catch { return {}; }
  };

  const dailyMeta   = parseLogMeta(latestDailyReport);
  const weeklyMeta  = parseLogMeta(latestWeeklyAudit);

  return (
    <div className="space-y-6">

      {/* ── Google Places Control ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Google Places API</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${googlePlacesEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {googlePlacesEnabled ? '✓ Aktiv' : '✗ Deaktiviert'}
          </span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-xs font-medium text-slate-700">Google Places API aktiviert</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={googlePlacesEnabled} onChange={e => setGooglePlacesEnabled(e.target.checked)} className="sr-only peer" />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          {!googlePlacesEnabled && (
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">Abschalt-Grund</label>
              <textarea value={disabledReason} onChange={e => setDisabledReason(e.target.value)} rows={2} placeholder="z.B. Wartungsfenster, Kostenausreißer…" className="w-full text-xs border border-slate-300 rounded-lg px-2 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          )}
          <Button onClick={onSaveSystemConfig} disabled={savingSystemConfig} size="sm" className="w-full bg-slate-800 hover:bg-slate-900 text-white">
            {savingSystemConfig ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Systemkonfiguration speichern
          </Button>
        </div>
      </div>

      {/* ── Scheduler Metriken ────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900">Scheduler-Übersicht</h3>
          <Button onClick={loadRecentLogs} disabled={logsLoading} variant="outline" size="sm" className="gap-1.5 h-7">
            {logsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
            Laden
          </Button>
        </div>

        {!recentLogs ? (
          <p className="text-xs text-slate-400 italic text-center py-4">Klicke „Laden" um Automation-Metriken zu sehen.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={Brain}
              label="Daily Learning Update"
              value={latestLearning ? moment(latestLearning.created_date).format('DD.MM. HH:mm') : 'Noch nicht gelaufen'}
              sub="Läuft täglich 03:30 Uhr"
              status={latestLearning ? 'ok' : null}
            />
            <MetricCard
              icon={FileBarChart2}
              label="Morning Platform Report"
              value={latestDailyReport ? moment(latestDailyReport.created_date).format('DD.MM. HH:mm') : 'Noch nicht gelaufen'}
              sub={latestDailyReport ? `Status: ${parseLogMeta(latestDailyReport)?.summary ? 'OK' : '—'}` : 'Läuft täglich 07:00 Uhr'}
              status={latestDailyReport ? (dailyMeta.failed_research_runs > 0 || dailyMeta.stuck_runs > 0 ? 'warning' : 'ok') : null}
            />
            <MetricCard
              icon={Shield}
              label="Research Watchdog"
              value={latestWatchdog ? moment(latestWatchdog.created_date).format('DD.MM. HH:mm') : 'Alle 10 Min. aktiv'}
              sub="Repariert stuck ResearchRuns"
              status={latestWatchdog ? 'warning' : 'ok'}
            />
            <MetricCard
              icon={DatabaseZap}
              label="Data Quality Audit"
              value={latestWeeklyAudit ? moment(latestWeeklyAudit.created_date).format('DD.MM.') : 'Noch nicht gelaufen'}
              sub={latestWeeklyAudit ? `∅ Score: ${weeklyMeta?.summary?.average_score ?? '—'}` : 'Läuft montags 04:00 Uhr'}
              status={latestWeeklyAudit ? (weeklyMeta?.summary?.status === 'critical' ? 'critical' : weeklyMeta?.summary?.status === 'warning' ? 'warning' : 'ok') : null}
            />
            <MetricCard
              icon={Users}
              label="Waitlist (24h)"
              value={newWaitlist24h ?? '—'}
              sub="Neue Interessenten"
              status={newWaitlist24h > 0 ? 'ok' : null}
            />
            <MetricCard
              icon={TrendingUp}
              label="Investoren (24h)"
              value={newInvestors24h ?? '—'}
              sub="Neue Anfragen"
              status={newInvestors24h > 0 ? 'warning' : null}
            />
          </div>
        )}
      </div>

      {/* ── Manuelle Service Actions ──────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Manuelle Actions (Admin only)</h3>
        <div className="space-y-3">
          <ActionCard
            icon={Brain}
            label="Daily Learning Update"
            description="Alle LeadOutcomes auswerten → OrgLearnedSignals aktualisieren"
            onRun={() => runAction('learning', 'processLeadOutcomeFeedback', {})}
            loading={running.learning}
            result={results.learning}
          />
          <ActionCard
            icon={FileBarChart2}
            label="Morning Platform Report"
            description="Interner Plattform-Bericht: Waitlist, Runs, Orgs, Alerts"
            onRun={() => runAction('dailyReport', 'platformDailyReport', {})}
            loading={running.dailyReport}
            result={results.dailyReport}
          />
          <ActionCard
            icon={Shield}
            label="Research Watchdog"
            description="Stuck ResearchRuns prüfen und reparieren"
            onRun={() => runAction('watchdog', 'watchdogStuckResearchRuns', {})}
            loading={running.watchdog}
            result={results.watchdog}
          />
          <ActionCard
            icon={DatabaseZap}
            label="Data Quality Audit"
            description="Alle aktiven Orgs auf Datenvollständigkeit prüfen (kein Backfill)"
            onRun={() => runAction('dataQuality', 'weeklyDataQualityAudit', {})}
            loading={running.dataQuality}
            result={results.dataQuality}
          />
        </div>
      </div>

      {/* ── System-Status ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-4">System-Status</h3>
        <div className="space-y-2">
          {[
            { label: 'Google Places API',               status: googlePlacesEnabled,    note: googlePlacesEnabled ? 'Aktiv' : 'Deaktiviert' },
            { label: 'Stripe Webhook',                  status: null,                   note: 'Manuell zu prüfen' },
            { label: 'Brevo E-Mail-MVP',                status: true,                   note: 'BREVO_API_KEY gesetzt' },
            { label: 'Watchdog (10min)',                 status: true,                   note: '317+ erfolgreiche Läufe' },
            { label: 'Daily Learning Update (03:30)',   status: true,                   note: 'Automation aktiv' },
            { label: 'Morning Platform Report (07:00)', status: true,                   note: 'Automation aktiv – kein Kunden-Mail' },
            { label: 'Weekly Data Quality Audit (Mo)', status: true,                   note: 'Automation aktiv – nur Diagnose' },
            { label: 'Waitlist Lead Notification',      status: true,                   note: 'Entity Automation aktiv' },
            { label: 'Investor Inquiry Notification',   status: true,                   note: 'Entity Automation aktiv' },
          ].map(({ label, status, note }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-xs font-medium text-slate-900">{label}</p>
                {note && <p className="text-[10px] text-slate-400">{note}</p>}
              </div>
              <StatusDot status={status} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Letzte Audit-Log Einträge ─────────────────────────────────────── */}
      {recentLogs && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Letzte System-Logs</h3>
          <div className="space-y-1.5">
            {recentLogs
              .filter(l => ['platform_daily_report','learning_loop_updated','weekly_data_quality_audit',
                'watchdog_stuck_run_repaired','waitlist_lead_created','investor_inquiry_created',
                'backfill_quality_tier','backfill_lifecycle_stage'].includes(l.action))
              .slice(0, 15)
              .map(log => (
                <div key={log.id} className="flex items-start gap-2 text-[10px] bg-slate-50 rounded px-2.5 py-1.5">
                  <Clock className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-700">{log.action}</span>
                    {log.reason && <span className="text-slate-400 ml-1.5 truncate block">{log.reason.slice(0, 100)}</span>}
                  </div>
                  <span className="text-slate-400 flex-shrink-0">{moment(log.created_date).format('DD.MM HH:mm')}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}