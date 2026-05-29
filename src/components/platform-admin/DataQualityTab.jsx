/**
 * DataQualityTab – Admin-only
 * Datenqualitäts-Diagnose und Backfill für eine Organisation im OrgDetailDrawer.
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  DatabaseZap, Search, RefreshCw, CheckCircle2, AlertTriangle,
  XCircle, Loader2, ChevronDown, ChevronRight, Zap
} from 'lucide-react';
import { toast } from 'sonner';

function SeverityBadge({ severity }) {
  const cfg = {
    ok:       'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning:  'bg-amber-50 text-amber-700 border-amber-200',
    critical: 'bg-red-50 text-red-700 border-red-200',
  };
  const icons = { ok: CheckCircle2, warning: AlertTriangle, critical: XCircle };
  const Icon = icons[severity] || CheckCircle2;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${cfg[severity] || cfg.ok}`}>
      <Icon className="w-3 h-3" /> {severity?.toUpperCase()}
    </span>
  );
}

function ScoreRing({ score }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const r = 36, c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform="rotate(-90 48 48)" />
        <text x="48" y="53" textAnchor="middle" fontSize="20" fontWeight="bold" fill={color}>{score}</text>
      </svg>
      <p className="text-xs font-semibold text-slate-600 mt-1">Qualitäts-Score</p>
    </div>
  );
}

function CheckRow({ label, data, expandable = true }) {
  const [open, setOpen] = useState(false);
  const hasExamples = data.examples?.length > 0 || data.groups?.length > 0;
  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between py-2.5 px-3 hover:bg-slate-50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {expandable && hasExamples ? (
            <button onClick={() => setOpen(!open)} className="text-slate-400">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-3.5" />}
          <span className="text-xs font-semibold text-slate-800">{label}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-bold text-slate-900">{data.count ?? 0}</span>
          {data.pct != null && <span className="text-xs text-slate-400">{data.pct}%</span>}
          {data.severity && <SeverityBadge severity={data.severity} />}
        </div>
      </div>
      {open && hasExamples && (
        <div className="bg-slate-50 px-6 pb-3 space-y-1">
          {(data.examples || data.groups || []).slice(0, 10).map((item, i) => (
            <div key={i} className="text-[10px] text-slate-600 font-mono bg-white border border-slate-200 rounded px-2 py-1">
              {Array.isArray(item) ? item.join(', ') : `${item.name || ''} · ${item.city || item.ort || ''} · ${(item.id || '').slice(-8)}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DataQualityTab({ org }) {
  const [auditResult, setAuditResult]     = useState(null);
  const [missingResult, setMissingResult] = useState(null);
  const [dupResult, setDupResult]         = useState(null);
  const [loading, setLoading]             = useState({});
  const [forceBackfill, setForceBackfill] = useState(false);
  const [showDupGroups, setShowDupGroups] = useState(false);

  const run = async (key, fn) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      return await fn();
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleAudit = () => run('audit', async () => {
    const res = await base44.functions.invoke('adminDataQualityActions', {
      action: 'auditCompanyDataQuality', organization_id: org.id, mode: 'single_org',
    });
    setAuditResult(res.data);
    toast.success(`Audit abgeschlossen: ${res.data?.total_companies ?? 0} Companies geprüft`);
  });

  const handleMissingFields = () => run('missing', async () => {
    const res = await base44.functions.invoke('adminDataQualityActions', {
      action: 'auditCompaniesMissingFields', organization_id: org.id,
    });
    setMissingResult(res.data);
    toast.success(`Missing Fields geprüft: ${res.data?.total_companies ?? 0} Companies`);
  });

  const handleBackfillQuality = () => run('bfQual', async () => {
    if (forceBackfill && !confirm(`Force-Backfill: Alle ${auditResult?.total_companies ?? '?'} Companies werden überschrieben. Fortfahren?`)) return;
    const res = await base44.functions.invoke('adminDataQualityActions', {
      action: 'backfillQualityTier', organization_id: org.id, force: forceBackfill,
    });
    toast.success(`quality_tier: ${res.data?.updated ?? 0} Companies aktualisiert`);
    handleAudit();
  });

  const handleBackfillLifecycle = () => run('bfLife', async () => {
    if (forceBackfill && !confirm(`Force-Backfill: Alle lifecycle_stage werden überschrieben. Fortfahren?`)) return;
    const res = await base44.functions.invoke('adminDataQualityActions', {
      action: 'backfillLifecycleStage', organization_id: org.id, force: forceBackfill,
    });
    toast.success(`lifecycle_stage: ${res.data?.updated ?? 0} Companies aktualisiert`);
    handleAudit();
  });

  const handleDetectDuplicates = () => run('dup', async () => {
    const res = await base44.functions.invoke('adminDataQualityActions', {
      action: 'detectDuplicateCompanies', organization_id: org.id,
    });
    setDupResult(res.data);
    toast.success(`Duplikate: ${res.data?.duplicate_groups_count ?? 0} Gruppen gefunden`);
  });

  const checks = auditResult?.checks;

  return (
    <div className="space-y-5">
      {/* Action Buttons */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase">Diagnose & Backfill</h4>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleAudit} disabled={loading.audit} variant="outline" size="sm" className="gap-1.5 text-xs">
            {loading.audit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Datenqualität prüfen
          </Button>
          <Button onClick={handleMissingFields} disabled={loading.missing} variant="outline" size="sm" className="gap-1.5 text-xs">
            {loading.missing ? <Loader2 className="w-3 h-3 animate-spin" /> : <DatabaseZap className="w-3 h-3" />}
            Missing Fields prüfen
          </Button>
          <Button onClick={handleBackfillQuality} disabled={loading.bfQual} variant="outline" size="sm" className="gap-1.5 text-xs">
            {loading.bfQual ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            quality_tier Backfill
          </Button>
          <Button onClick={handleBackfillLifecycle} disabled={loading.bfLife} variant="outline" size="sm" className="gap-1.5 text-xs">
            {loading.bfLife ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            lifecycle_stage Backfill
          </Button>
          <Button onClick={handleDetectDuplicates} disabled={loading.dup} variant="outline" size="sm" className="gap-1.5 text-xs col-span-2">
            {loading.dup ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Duplikate prüfen
          </Button>
        </div>

        {/* Force-Toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
          <input type="checkbox" checked={forceBackfill} onChange={e => setForceBackfill(e.target.checked)}
            className="rounded border-slate-300" />
          <span>Force-Backfill (bestehende Werte überschreiben) — Bestätigung erforderlich</span>
        </label>
      </div>

      {/* Audit Ergebnis */}
      {auditResult && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-4 p-4 border-b border-slate-100">
            <ScoreRing score={auditResult.score ?? 0} />
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">{auditResult.total_companies} Companies geprüft</p>
              <p className="text-xs text-slate-500">{org.name} · Einzelne Org</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {checks && Object.entries(checks).map(([k, v]) => v.severity && v.severity !== 'ok' && (
                  <span key={k} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${v.severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {k.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {checks && (
            <div className="divide-y divide-slate-100">
              <CheckRow label="Ohne organization_id"   data={checks.no_organization_id} />
              <CheckRow label="Ohne quality_tier"      data={checks.no_quality_tier} />
              <CheckRow label="Ohne lifecycle_stage"   data={checks.no_lifecycle_stage} />
              <CheckRow label="Ohne google_place_id"   data={checks.no_google_place_id} />
              <CheckRow label="Ohne PLZ / Ort"         data={checks.no_plz_or_city} />
              <CheckRow label="Ohne Telefon / Website" data={checks.no_phone_or_website} />
              <CheckRow label="Duplikate (Place-ID)"   data={checks.duplicates_place_id} />
              <CheckRow label="Duplikate (Name+City)"  data={checks.duplicates_name_city} />
            </div>
          )}
        </div>
      )}

      {/* Missing Fields Ergebnis */}
      {missingResult && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900">Missing Fields ({missingResult.total_companies} Companies)</h4>
          </div>
          <div className="divide-y divide-slate-100">
            {missingResult.fields && Object.entries(missingResult.fields).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-700">{k.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">{v.count}</span>
                  <span className="text-xs text-slate-400">{v.pct}%</span>
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${v.pct > 50 ? 'bg-red-400' : v.pct > 20 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${v.pct}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplikate */}
      {dupResult && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Duplikat-Gruppen: <span className={dupResult.duplicate_groups_count > 0 ? 'text-amber-700' : 'text-emerald-700'}>{dupResult.duplicate_groups_count}</span>
              </h4>
              <p className="text-[10px] text-slate-500">{dupResult.duplicate_companies_count} betroffene Companies · {dupResult.total_companies} gesamt</p>
            </div>
            {dupResult.duplicate_groups_count > 0 && (
              <button onClick={() => setShowDupGroups(!showDupGroups)} className="text-xs text-blue-600 hover:underline">
                {showDupGroups ? 'Einklappen' : 'Gruppen anzeigen'}
              </button>
            )}
          </div>
          {showDupGroups && dupResult.groups?.map((g, i) => (
            <div key={i} className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">{g.reason}</span>
                <span className="text-[10px] text-slate-500">{g.group_size} Duplikate · Empfehlung: {g.recommended_keep_id?.slice(-8)}</span>
              </div>
              <div className="space-y-1">
                {g.companies?.map((c, j) => (
                  <div key={j} className={`text-[10px] font-mono px-2 py-1 rounded ${c.id === g.recommended_keep_id ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                    {c.id === g.recommended_keep_id ? '✓ behalten: ' : '✗ Duplikat: '}
                    {c.name} · {c.ort || ''} · {c.id?.slice(-8)}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {dupResult.duplicate_groups_count === 0 && (
            <div className="flex items-center gap-2 px-4 py-4 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Keine Duplikate gefunden.
            </div>
          )}
        </div>
      )}

      {!auditResult && !missingResult && !dupResult && (
        <div className="text-center py-12 text-slate-400">
          <DatabaseZap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Noch keine Diagnose gestartet.</p>
          <p className="text-xs mt-1">Klicke auf „Datenqualität prüfen" um zu beginnen.</p>
        </div>
      )}
    </div>
  );
}