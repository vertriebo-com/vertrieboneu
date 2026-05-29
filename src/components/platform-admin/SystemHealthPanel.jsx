import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Activity, Loader2, Play, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function SystemHealthPanel({ systemConfig, googlePlacesEnabled, setGooglePlacesEnabled, disabledReason, setDisabledReason, onSaveSystemConfig, savingSystemConfig }) {
  const [running, setRunning] = useState({});
  const [results, setResults] = useState({});

  const runAction = async (key, fn, payload = {}) => {
    setRunning(prev => ({ ...prev, [key]: true }));
    try {
      const res = await base44.functions.invoke(fn, payload);
      setResults(prev => ({ ...prev, [key]: { data: res.data, ts: new Date().toISOString() } }));
      toast.success(`${key}: ausgeführt`);
    } catch (e) {
      toast.error(`${key} fehlgeschlagen: ${e.message}`);
    } finally {
      setRunning(prev => ({ ...prev, [key]: false }));
    }
  };

  const ACTIONS = [
    { key: 'watchdog', label: 'Watchdog: Stuck Runs', fn: 'watchdogStuckResearchRuns', payload: {} },
    { key: 'feedbackLoop', label: 'Feedback-Loop (Daily)', fn: 'processLeadOutcomeFeedback', payload: {} },
    { key: 'morningReport', label: 'Morning Report Test', fn: 'morningReport', payload: {} },
  ];

  return (
    <div className="space-y-6">
      {/* Google Places Control */}
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

      {/* Service Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Service Actions</h3>
        <div className="space-y-3">
          {ACTIONS.map(action => (
            <div key={action.key} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-900">{action.label}</p>
                {results[action.key] && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Ausgeführt um {new Date(results[action.key].ts).toLocaleTimeString('de-DE')}
                    {results[action.key].data?.success !== undefined && (
                      <span className={results[action.key].data.success ? ' text-emerald-600' : ' text-red-600'}>
                        {' '}· {results[action.key].data.success ? '✓ Erfolgreich' : '✗ Fehler'}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <Button onClick={() => runAction(action.key, action.fn, action.payload)} disabled={running[action.key]} variant="outline" size="sm" className="gap-1.5 ml-3">
                {running[action.key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Ausführen
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Status Overview */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-4">System-Status</h3>
        <div className="space-y-2">
          {[
            { label: 'Google Places API', ok: googlePlacesEnabled },
            { label: 'Stripe Webhook', ok: true, note: 'Manuell zu prüfen' },
            { label: 'Brevo E-Mail-MVP', ok: true, note: 'BREVO_API_KEY gesetzt' },
            { label: 'Learning-Loop Scheduler', ok: null, note: 'Automation prüfen' },
            { label: 'Morning Report Automation', ok: null, note: 'Automation prüfen' },
          ].map(({ label, ok, note }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-xs font-medium text-slate-900">{label}</p>
                {note && <p className="text-[10px] text-slate-400">{note}</p>}
              </div>
              {ok === true ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
               ok === false ? <XCircle className="w-4 h-4 text-red-500" /> :
               <AlertTriangle className="w-4 h-4 text-amber-400" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}