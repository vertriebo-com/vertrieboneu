import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle2, AlertCircle, AlertTriangle, Loader2, RefreshCw, Play } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const AUDIT_FUNCTIONS = [
  { key: 'auditGlobalTenantIsolation', label: 'Tenant-Isolation', fn: 'auditGlobalTenantIsolation', payload: {} },
  { key: 'auditMvpLaunchReadiness', label: 'MVP Launch Readiness', fn: 'auditMvpLaunchReadiness', payload: {} },
  { key: 'auditLearningLoop', label: 'Learning Loop', fn: 'auditLearningLoop', payload: {} },
  { key: 'auditEntityPermissionConsistency', label: 'Entity Permissions', fn: 'auditEntityPermissionConsistency', payload: {} },
  { key: 'auditAuthzConsistency', label: 'Auth-Konsistenz', fn: 'auditAuthzConsistency', payload: {} },
];

function StatusBadge({ status }) {
  if (!status) return null;
  const cfg = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    yellow: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {status === 'green' ? '✓ OK' : status === 'yellow' ? '⚠ Warnung' : '✗ Fehler'}
    </span>
  );
}

export default function SecurityAuditPanel() {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const runAudit = async (audit) => {
    setRunning(prev => ({ ...prev, [audit.key]: true }));
    try {
      const res = await base44.functions.invoke(audit.fn, audit.payload);
      setResults(prev => ({ ...prev, [audit.key]: { data: res.data, ts: new Date().toISOString() } }));
      toast.success(`${audit.label}: ${res.data?.overall_status || res.data?.claim_status || res.data?.status || 'ausgeführt'}`);
    } catch (e) {
      toast.error(`${audit.label} fehlgeschlagen: ${e.message}`);
    } finally {
      setRunning(prev => ({ ...prev, [audit.key]: false }));
    }
  };

  const runAllAudits = async () => {
    for (const audit of AUDIT_FUNCTIONS) {
      await runAudit(audit);
    }
  };

  const loadAuditLogs = async () => {
    setLogsLoading(true);
    try {
      const logs = await base44.entities.PlatformAuditLog.list('-created_date', 50);
      setAuditLogs(logs);
    } catch (e) {
      toast.error('AuditLog laden fehlgeschlagen: ' + e.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const ACTION_COLOR = {
    suspend_organization: 'text-red-700 bg-red-50',
    unsuspend_organization: 'text-emerald-700 bg-emerald-50',
    update_trial_stage: 'text-blue-700 bg-blue-50',
    activate_agency: 'text-purple-700 bg-purple-50',
    create_support_note: 'text-slate-700 bg-slate-50',
    update_agency_settings: 'text-indigo-700 bg-indigo-50',
    learning_loop_updated: 'text-teal-700 bg-teal-50',
  };

  return (
    <div className="space-y-6">
      {/* Security Audits */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-slate-700" />
            <h3 className="text-sm font-bold text-slate-900">Security Audits</h3>
          </div>
          <Button onClick={runAllAudits} variant="outline" size="sm" className="gap-1.5">
            <Play className="w-3 h-3" /> Alle ausführen
          </Button>
        </div>

        <div className="space-y-3">
          {AUDIT_FUNCTIONS.map(audit => {
            const result = results[audit.key];
            const isRunning = running[audit.key];
            const status = result?.data?.overall_status || result?.data?.claim_status || result?.data?.status;

            return (
              <div key={audit.key} className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-slate-900">{audit.label}</p>
                    {result && <StatusBadge status={status} />}
                    {result && <span className="text-[10px] text-slate-400">{moment(result.ts).format('HH:mm:ss')}</span>}
                  </div>

                  {result?.data && (
                    <div className="space-y-1">
                      {result.data.red_blockers?.length > 0 && (
                        <div className="text-[10px] text-red-700 bg-red-50 rounded px-2 py-1">
                          🔴 {result.data.red_blockers.map(b => b.detail || b.audit).join(' | ')}
                        </div>
                      )}
                      {result.data.yellow_warnings?.length > 0 && (
                        <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                          ⚠️ {result.data.yellow_warnings.map(w => w.detail || w.audit).join(' | ')}
                        </div>
                      )}
                      {result.data.green_checks?.length > 0 && (
                        <div className="text-[10px] text-emerald-700">
                          ✓ {result.data.green_checks.length} Checks bestanden
                        </div>
                      )}
                      {result.data.summary && (
                        <div className="text-[10px] text-slate-600">{result.data.summary}</div>
                      )}
                      {result.data.counts && (
                        <div className="text-[10px] text-slate-600">
                          ✓ {result.data.counts.green} · ⚠ {result.data.counts.yellow} · ✗ {result.data.counts.red}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Button onClick={() => runAudit(audit)} disabled={isRunning} variant="outline" size="sm" className="h-7 px-2 flex-shrink-0">
                  {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Platform Audit Logs */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Platform Audit Log</h3>
          <Button onClick={loadAuditLogs} disabled={logsLoading} variant="outline" size="sm" className="gap-1.5">
            {logsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Laden
          </Button>
        </div>

        {auditLogs.length === 0 && !logsLoading ? (
          <p className="text-xs text-slate-400 italic text-center py-6">Audit-Logs noch nicht geladen. Klicke "Laden".</p>
        ) : (
          <div className="space-y-1.5">
            {auditLogs.map(log => (
              <div key={log.id} className={`flex items-start gap-3 p-2.5 rounded-lg text-[10px] ${ACTION_COLOR[log.action] || 'bg-slate-50 text-slate-700'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{log.action}</span>
                    <span className="text-slate-500">·</span>
                    <span className="font-mono opacity-70 truncate max-w-[120px]">{log.target_id}</span>
                    {log.organization_id && <span className="opacity-60">org: {log.organization_id.slice(-6)}</span>}
                  </div>
                  {log.reason && <p className="opacity-80 mt-0.5 truncate">{log.reason}</p>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="font-semibold">{log.actor_email?.split('@')[0]}</p>
                  <p className="opacity-60">{moment(log.created_date).format('DD.MM HH:mm')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}