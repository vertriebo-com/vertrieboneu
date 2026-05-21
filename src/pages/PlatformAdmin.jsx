import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search, Filter, ChevronDown, Building2, Shield, AlertTriangle,
  Clock, DollarSign, Plus, MoreVertical, Eye, Lock, Unlock,
  Zap, Wrench, CheckCircle2, AlertCircle, ArrowLeft
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ResearchRunDiagnostics from '@/components/platform-admin/ResearchRunDiagnostics';
import AgencyPanel from '@/components/platform-admin/AgencyPanel';
import LeadScoringDiagnostics from '@/components/platform-admin/LeadScoringDiagnostics';
import LeadEngineDryTest from '@/components/platform-admin/LeadEngineDryTest';
import UsageBillingDiagnostics from '@/components/platform-admin/UsageBillingDiagnostics';
import { FlaskConical, Activity, BarChart3, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import moment from 'moment';

const TYPE_LABELS = {
  direct_customer: { label: 'Direktkunde', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  agency: { label: 'Agentur', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  agency_client: { label: 'Agentur-Kunde', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

const STATUS_LABELS = {
  active: { label: 'Aktiv', color: 'bg-emerald-50 text-emerald-700' },
  suspended: { label: 'Gesperrt', color: 'bg-red-50 text-red-700' },
  pending: { label: 'Ausstehend', color: 'bg-amber-50 text-amber-700' },
  null: { label: 'Aktiv', color: 'bg-emerald-50 text-emerald-700' },
  undefined: { label: 'Aktiv', color: 'bg-emerald-50 text-emerald-700' },
};

const BILLING_LABELS = {
  active: { label: 'Aktiv / Zahlend', color: 'bg-emerald-50 text-emerald-700' },
  trialing: { label: 'Testphase', color: 'bg-blue-50 text-blue-700' },
  past_due: { label: 'Zahlung offen', color: 'bg-amber-50 text-amber-700' },
  unpaid: { label: 'Unbezahlt', color: 'bg-red-50 text-red-700' },
  canceled: { label: 'Gekündigt', color: 'bg-slate-50 text-slate-700' },
  incomplete: { label: 'Unvollständig', color: 'bg-slate-50 text-slate-700' },
  incomplete_expired: { label: 'Abgelaufen', color: 'bg-red-50 text-red-700' },
};

export default function PlatformAdmin() {
  // ── ALLE HOOKS MÜSSEN ANFANGS (React Rules of Hooks) ────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);
  const [showNewNoteForm, setShowNewNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSeverity, setNoteSeverity] = useState('info');
  const [savingNote, setSavingNote] = useState(false);
  const [showDiagnosisTab, setShowDiagnosisTab] = useState(false);
  const [diagnosisData, setDiagnosisData] = useState(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [repairingTrialStage, setRepairingTrialStage] = useState(false);
  const [showSystemControl, setShowSystemControl] = useState(false);
  const [systemConfig, setSystemConfig] = useState(null);
  const [googlePlacesEnabled, setGooglePlacesEnabled] = useState(true);
  const [disabledReason, setDisabledReason] = useState('');
  const [savingSystemConfig, setSavingSystemConfig] = useState(false);
  const [showTrialStageDropdown, setShowTrialStageDropdown] = useState(false);
  const [changingTrialStage, setChangingTrialStage] = useState(false);
  
  // Auth-Check VOR dem Datenladen
  const [authChecked, setAuthChecked] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // useQuery IMMER aufrufen (nicht conditional)
  const { data: responseData = {}, isLoading, refetch } = useQuery({
    queryKey: ['platform-organizations'],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('getPlatformAdminData', {});
        if (res.data?.success) {
          return res.data;
        }
        if (res.status === 403) {
          throw new Error('Kein Zugriff auf das interne Plattform-Dashboard.');
        }
        throw new Error(res.data?.error || 'Fehler beim Laden der Organisationen');
      } catch (e) {
        console.error('[PlatformAdmin] getPlatformAdminData error:', e.message);
        throw e;
      }
    },
  });

  // Auth-Check useEffect
  useEffect(() => {
    (async () => {
      try {
        const user = await base44.auth.me();
        const isAdmin = ["admin", "platform_owner", "platform_admin"].includes(user?.role);
        setIsPlatformAdmin(isAdmin);
        setAuthChecked(true);
      } catch {
        setIsPlatformAdmin(false);
        setAuthChecked(true);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  // ── CONDITIONAL RENDERS NACH ALLEN HOOKS ───────────────────────────────
  // Auth-Loading: Kein Content
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // Nicht-Admin: 403-Seite
  if (!authChecked || !isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 text-center mb-2">
            Kein Zugriff
          </h1>
          <p className="text-sm text-slate-600 text-center mb-6">
            Du hast keine Berechtigung, auf das interne Plattform-Dashboard zuzugreifen.
          </p>
          <Link to="/dashboard">
            <Button className="w-full gap-2 bg-slate-800 hover:bg-slate-900 text-white">
              <ArrowLeft className="w-4 h-4" /> Zurück zum Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Load System Config aus aggregiertem Response
  useEffect(() => {
    if (responseData.platform_config) {
      setSystemConfig(responseData.platform_config);
      setGooglePlacesEnabled(responseData.platform_config.google_places_api_enabled !== false);
      setDisabledReason(responseData.platform_config.disabled_reason || '');
    }
  }, [responseData.platform_config]);

  const organizations = responseData.organizations || [];
  const platformSummary = responseData.summary || {};

  // All data now comes from getPlatformAdminData backend function
  const plans = responseData.plans || [];

  // Filter organizations
  const filteredOrgs = organizations.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.owner_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || org.organization_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleSuspend = async () => {
    if (!selectedOrg || !suspendReason.trim()) {
      toast.error('Grund erforderlich');
      return;
    }
    setSuspending(true);
    try {
      await base44.functions.invoke('platformAdmin', {
        action: 'suspendOrganization',
        organization_id: selectedOrg.id,
        reason: suspendReason,
      });
      toast.success('Organisation gesperrt');
      refetch();
      setShowSuspendDialog(false);
      setSelectedOrg(null);
      setSuspendReason('');
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setSuspending(false);
    }
  };

  const handleUnsuspend = async (org) => {
    try {
      await base44.functions.invoke('platformAdmin', {
        action: 'unsuspendOrganization',
        organization_id: org.id,
      });
      toast.success('Organisation entsperrt');
      refetch();
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    }
  };

  const handleCreateSupportNote = async (noteText, severity) => {
    if (!selectedOrg || !noteText.trim()) {
      toast.error('Notiz erforderlich');
      return;
    }
    try {
      await base44.functions.invoke('platformAdmin', {
        action: 'createSupportNote',
        organization_id: selectedOrg.id,
        note: noteText,
        severity: severity,
      });
      toast.success('Support-Notiz gespeichert');
      refetch();
      return true;
    } catch (e) {
      toast.error('Fehler: ' + e.message);
      return false;
    }
  };

  const handleDiagnose = async () => {
    if (!selectedOrg) return;
    setDiagnosisLoading(true);
    try {
      const res = await base44.functions.invoke('diagnoseCheckoutIssue', { organization_id: selectedOrg.id });
      setDiagnosisData(res.data);
      setShowDiagnosisTab(true);
    } catch (e) {
      toast.error('Diagnose fehlgeschlagen: ' + e.message);
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const handleRepairTrialStage = async () => {
    if (!selectedOrg) return;
    setRepairingTrialStage(true);
    try {
      const res = await base44.functions.invoke('repairTrialStage', {
        organization_id: selectedOrg.id,
        trial_stage: 'paid',
        billing_status: 'active',
        reason: 'Admin repair: webhook fehlgeschlagen',
      });
      toast.success('Account repariert: ' + res.data.message);
      refetch();
      setSelectedOrg(null);
    } catch (e) {
      toast.error('Reparatur fehlgeschlagen: ' + e.message);
    } finally {
      setRepairingTrialStage(false);
    }
  };

  const handleChangeTrialStage = async (newStage) => {
    if (!selectedOrg) return;
    setChangingTrialStage(true);
    try {
      await base44.functions.invoke('platformAdmin', {
        action: 'updateTrialStage',
        organization_id: selectedOrg.id,
        trial_stage: newStage,
      });
      toast.success(`Trial-Stage zu "${newStage}" geändert`);
      refetch();
      setShowTrialStageDropdown(false);
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setChangingTrialStage(false);
    }
  };

  const handleSaveSystemConfig = async () => {
    setSavingSystemConfig(true);
    try {
      const res = await base44.functions.invoke('updateSystemConfig', {
        google_places_api_enabled: googlePlacesEnabled,
        disabled_reason: disabledReason,
      });
      if (res.data?.success) {
        setSystemConfig(res.data.config);
        toast.success(res.data.message || 'Systemkonfiguration aktualisiert');
      } else {
        toast.error(res.data?.error || 'Fehler beim Speichern');
      }
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setSavingSystemConfig(false);
    }
  };

  const getPlanName = (planId, billingStatus) => {
    if (billingStatus === 'trialing') return 'Testphase';
    if (!planId) return 'Kein Plan';
    return plans.find(p => p.id === planId)?.name || 'Nicht zugeordnet';
  };

  const [currentUser, setCurrentUser] = useState(null);
  
  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  const getAgencyStats = (agencyId) => {
    const clientOrgs = organizations.filter(org => org.parent_agency_id === agencyId);
    return {
      clientCount: clientOrgs.length,
      clients: clientOrgs,
    };
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
         <div className="mb-6">
           <div className="flex items-center gap-3 mb-2">
             <Shield className="w-8 h-8 text-slate-900" />
             <h1 className="text-3xl font-bold text-slate-900">Platform Admin Center</h1>
           </div>
           <p className="text-sm text-slate-600">Verwaltung aller Organisationen und Agenturen</p>
         </div>

        <Tabs defaultValue="orgs" className="space-y-6">
          <TabsList className="bg-white border border-slate-200 p-1 h-auto gap-1">
            <TabsTrigger value="orgs" className="gap-2 text-sm">
              <Building2 className="w-4 h-4" /> Organisationen
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-2 text-sm">
              <Activity className="w-4 h-4" /> Diagnose & Monitoring
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orgs">
         {/* System Control Button */}
        <div className="mb-6">
          <Button
            onClick={() => setShowSystemControl(!showSystemControl)}
            variant="outline"
            className="gap-2 bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200"
          >
            <Wrench className="w-4 h-4" />
            System Control
          </Button>
        </div>

        {/* System Control Panel */}
        {showSystemControl && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 mb-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Google Places API</h3>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={googlePlacesEnabled}
                  onChange={(e) => setGooglePlacesEnabled(e.target.checked)}
                  className="w-5 h-5 rounded border border-slate-300"
                />
              </div>
            </div>
            {!googlePlacesEnabled && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2">Abschalt-Grund</label>
                <textarea
                  value={disabledReason}
                  onChange={(e) => setDisabledReason(e.target.value)}
                  placeholder="z.B. Wartungsfenster, Kostenausreißer..."
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => setShowSystemControl(false)}
                variant="outline"
                size="sm"
                className="flex-1 bg-white"
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleSaveSystemConfig}
                disabled={savingSystemConfig}
                size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {savingSystemConfig ? 'Speichert...' : 'Speichern'}
              </Button>
            </div>
          </div>
        )}

        {/* KPI Overview */}
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
           <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
             <p className="text-xs text-slate-500 font-medium mb-1">Gesamt Organisationen</p>
             <p className="text-2xl font-bold text-slate-900">{organizations.length}</p>
           </div>
           <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
             <p className="text-xs text-slate-500 font-medium mb-1">Aktiv</p>
             <p className="text-2xl font-bold text-emerald-700">{organizations.filter(o => !o.platform_status || o.platform_status === 'active').length}</p>
           </div>
           <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
             <p className="text-xs text-slate-500 font-medium mb-1">Gesperrt</p>
             <p className="text-2xl font-bold text-red-700">{organizations.filter(o => o.platform_status === 'suspended').length}</p>
           </div>
           <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
             <p className="text-xs text-slate-500 font-medium mb-1">Onboarding offen</p>
             <p className="text-2xl font-bold text-amber-700">{organizations.filter(o => !o.onboarding_done).length}</p>
           </div>
           <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
             <p className="text-xs text-slate-500 font-medium mb-1">Testphase</p>
             <p className="text-2xl font-bold text-blue-700">{organizations.filter(o => o.billing_status === 'trialing').length}</p>
           </div>
           <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
             <p className="text-xs text-slate-500 font-medium mb-1">Aktive Abos</p>
             <p className="text-2xl font-bold text-emerald-700">{organizations.filter(o => o.billing_status === 'active').length}</p>
           </div>
           <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
             <p className="text-xs text-slate-500 font-medium mb-1">Zahlung offen</p>
             <p className="text-2xl font-bold text-amber-700">{organizations.filter(o => o.billing_status === 'past_due').length}</p>
           </div>
           <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm">
             <p className="text-xs text-slate-500 font-medium mb-1">Gesamt Leads</p>
             <p className="text-2xl font-bold text-slate-900">{organizations.reduce((sum, o) => sum + (o.leads_count || 0), 0)}</p>
           </div>
         </div>

        {/* Search & Filter */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Firma oder E-Mail suchen…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[#E2E8F0] bg-white text-sm font-medium text-slate-700"
            >
              <option value="all">Alle Typen</option>
              <option value="direct_customer">Direktkunden</option>
              <option value="agency">Agenturen</option>
              <option value="agency_client">Agentur-Kunden</option>
            </select>
          </div>
        </div>

        {/* Organizations Table */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Firma</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Typ</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Owner</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Plan</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Billing</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Leads</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.map(org => {
                  const typeInfo = TYPE_LABELS[org.organization_type] || TYPE_LABELS.direct_customer;
                  return (
                    <tr key={org.id} className="border-b border-[#E2E8F0] hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{org.name}</p>
                            {org.parent_agency_id && (
                              <p className="text-xs text-slate-500">→ Agentur-Kunde</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{org.owner_email}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{getPlanName(org.plan_id, org.billing_status)}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded ${BILLING_LABELS[org.billing_status]?.color || 'bg-slate-100 text-slate-600'}`}>
                          {BILLING_LABELS[org.billing_status]?.label || org.billing_status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded ${STATUS_LABELS[org.platform_status || 'active']?.color}`}>
                          {STATUS_LABELS[org.platform_status || 'active']?.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-900">{org.leads_count}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                           <button
                             onClick={() => setSelectedOrg(org)}
                             className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                             title="Details ansehen"
                           >
                             <Eye className="w-4 h-4 text-slate-600" />
                           </button>
                           {(org.platform_status === 'active' || !org.platform_status) && (
                             <button
                               onClick={() => {
                                 setSelectedOrg(org);
                                 setShowSuspendDialog(true);
                               }}
                               className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                               title="Organisation sperren"
                             >
                               <Lock className="w-4 h-4 text-red-600" />
                             </button>
                           )}
                           {org.platform_status === 'suspended' && (
                             <button
                               onClick={() => handleUnsuspend(org)}
                               className="p-2 hover:bg-emerald-50 rounded-lg transition-colors"
                               title="Organisation entsperren"
                             >
                               <Unlock className="w-4 h-4 text-emerald-600" />
                             </button>
                           )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredOrgs.length === 0 && (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">Keine Organisationen gefunden</p>
            </div>
          )}
        </div>

        {/* Organization Detail Modal */}
        {selectedOrg && !showSuspendDialog && (
          <Dialog open={!!selectedOrg} onOpenChange={() => setSelectedOrg(null)}>
            <DialogContent className="max-w-2xl bg-white border border-slate-200 shadow-xl rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
                  <Building2 className="w-5 h-5 text-slate-900" />
                  {selectedOrg.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                 {/* Diagnose & Reparatur - nur bei echtem Bug-Zustand */}
                 {selectedOrg.trial_stage === 'free_preview' && selectedOrg.billing_status === 'active' && (
                   <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                     <div className="flex items-start gap-3 mb-3">
                       <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                       <div>
                         <p className="text-sm font-bold text-red-900">⚠️ Trial-Stage Bug erkannt</p>
                         <p className="text-xs text-red-800 mt-1">
                           billing_status=active aber trial_stage=free_preview — Webhook-Fehler wahrscheinlich
                         </p>
                       </div>
                     </div>
                     <div className="flex gap-2">
                       <Button
                         onClick={handleDiagnose}
                         disabled={diagnosisLoading}
                         variant="outline"
                         size="sm"
                         className="flex-1"
                       >
                         {diagnosisLoading ? 'Diagnose läuft…' : '🔍 Diagnose'}
                       </Button>
                       <Button
                         onClick={handleRepairTrialStage}
                         disabled={repairingTrialStage}
                         size="sm"
                         className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                       >
                         <Wrench className="w-3.5 h-3.5" />
                         {repairingTrialStage ? 'Repariert…' : 'Reparieren'}
                       </Button>
                     </div>
                   </div>
                 )}

                 {showDiagnosisTab && diagnosisData && (
                   <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                     <div>
                       <h4 className="text-xs font-bold text-slate-700 mb-2">Diagnose-Ergebnis</h4>
                       {diagnosisData.issues && diagnosisData.issues.length > 0 ? (
                         <div className="space-y-2">
                           {diagnosisData.issues.map((issue, idx) => (
                             <div key={idx} className={`text-xs p-2 rounded border ${
                               issue.severity === 'HIGH' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                             }`}>
                               <p className="font-bold text-slate-900">{issue.code}</p>
                               <p className="text-slate-700 mt-0.5">{issue.message}</p>
                               <p className="text-slate-600 mt-1">💡 {issue.hint}</p>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 flex items-center gap-2">
                           <CheckCircle2 className="w-4 h-4" />
                           Kein Problem erkannt
                         </div>
                       )}
                     </div>
                     <Button
                       onClick={() => setShowDiagnosisTab(false)}
                       variant="outline"
                       size="sm"
                       className="w-full"
                     >
                       Diagnose schließen
                     </Button>
                   </div>
                 )}

                 {/* Stammdaten */}
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-600 mb-3">Stammdaten</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Owner E-Mail</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedOrg.owner_email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Organisationstyp</p>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${TYPE_LABELS[selectedOrg.organization_type || 'direct_customer']?.color}`}>
                        {TYPE_LABELS[selectedOrg.organization_type || 'direct_customer']?.label}
                      </span>
                    </div>
                    {selectedOrg.parent_agency_id && (
                      <div className="col-span-2">
                        <p className="text-xs text-slate-500 font-medium">Übergeordnete Agentur</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {organizations.find(o => o.id === selectedOrg.parent_agency_id)?.name || 'N/A'}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Branche</p>
                      <p className="text-sm font-semibold text-slate-900 bg-emerald-50 px-2 py-1 rounded inline-block border border-emerald-200">{selectedOrg.industry ? selectedOrg.industry : '(noch nicht angegeben)'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Website</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedOrg.website || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Billing */}
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-600 mb-3">Billing</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Billing-Status</p>
                      <p className={`text-sm font-semibold px-2 py-1 rounded inline-block ${BILLING_LABELS[selectedOrg.billing_status]?.color}`}>
                        {BILLING_LABELS[selectedOrg.billing_status]?.label}
                      </p>
                    </div>
                    <div>
                       <p className="text-xs text-slate-500 font-medium">Plan</p>
                       <p className="text-sm font-semibold text-slate-900">{getPlanName(selectedOrg.plan_id, selectedOrg.billing_status)} {selectedOrg.trial_stage === 'paid' && selectedOrg.billing_status === 'active' && !selectedOrg.plan_id && '(Trial-Stage = paid, kein Plan zugewiesen)'}</p>
                     </div>
                    {selectedOrg.trial_ends_at && (
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Trial endet</p>
                        <p className="text-sm font-semibold text-slate-900">{moment(selectedOrg.trial_ends_at).format('DD.MM.YYYY')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Platform Status */}
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-600 mb-3">Plattform-Status</h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-2">Status</p>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_LABELS[selectedOrg.platform_status || 'active']?.color}`}>
                        {STATUS_LABELS[selectedOrg.platform_status || 'active']?.label}
                      </span>
                    </div>
                    {selectedOrg.suspended_reason && (
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Sperrungsgrund</p>
                        <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-2">{selectedOrg.suspended_reason}</p>
                      </div>
                    )}
                    {selectedOrg.suspended_at && (
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Gesperrt am</p>
                        <p className="text-sm text-slate-900">{moment(selectedOrg.suspended_at).format('DD.MM.YYYY HH:mm')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Nutzung */}
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-600 mb-3">Nutzung</h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <p className="text-xs text-slate-500 font-medium">Gespeicherte Leads gesamt</p>
                      <p className="text-lg font-bold text-slate-900">{selectedOrg.leads_count ?? 0}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <p className="text-xs text-slate-500 font-medium">Neue Leads diesen Monat</p>
                      <p className="text-lg font-bold text-blue-700">{selectedOrg.monthly_leads_created ?? 0}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                      <p className="text-xs text-slate-500 font-medium">Recherche-Läufe diesen Monat</p>
                      <p className="text-lg font-bold text-purple-700">{selectedOrg.research_runs_count ?? 0}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <p className="text-xs text-slate-500 font-medium">KI-Aktionen diesen Monat</p>
                      <p className="text-lg font-bold text-amber-700">{selectedOrg.ai_actions_used ?? 0}</p>
                    </div>
                  </div>
                </div>

                {/* System-Details */}
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-600 mb-3">System-Details</h3>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">

                    {/* Trial-Stage mit Dropdown */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Trial-Stage</p>
                        <p className="text-sm font-semibold text-slate-900">{selectedOrg.trial_stage || 'free_preview'}</p>
                      </div>
                      <select
                        defaultValue={selectedOrg.trial_stage || 'free_preview'}
                        onChange={async (e) => {
                          try {
                            await base44.functions.invoke('platformAdmin', {
                              action: 'updateTrialStage',
                              organization_id: selectedOrg.id,
                              trial_stage: e.target.value,
                            });
                            toast.success(`Trial-Stage → ${e.target.value}`);
                            refetch();
                          } catch (err) {
                            toast.error('Fehler: ' + err.message);
                          }
                        }}
                        className="text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 font-medium"
                      >
                        <option value="free_preview">free_preview</option>
                        <option value="verified_trial">verified_trial</option>
                        <option value="paid">paid</option>
                      </select>
                    </div>

                    {/* Trial-Leads */}
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Trial-Leads gewährt</span>
                      <span className="font-semibold text-slate-900">{selectedOrg.trial_leads_granted || 0} / 10</span>
                    </div>

                    {/* Letzter Run */}
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Letzter Recherche-Run</span>
                      <span className="font-semibold text-slate-900">
                        {selectedOrg.last_lead_generation_at 
                          ? moment(selectedOrg.last_lead_generation_at).format('DD.MM.YYYY HH:mm')
                          : 'Noch keiner'}
                      </span>
                    </div>

                    {/* API-Kosten diesen Monat */}
                     <div className="flex justify-between text-xs">
                       <span className="text-slate-500">API-Kosten (Monat)</span>
                       <span className="font-semibold text-slate-900">
                         ${Number.isFinite(Number(selectedOrg.estimated_external_cost_cent)) ? (Number(selectedOrg.estimated_external_cost_cent) / 100).toFixed(2) : "0.00"}
                       </span>
                     </div>

                    {/* OrgLearnedSignals */}
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">System gelernt</span>
                      <span className="font-semibold text-slate-900">
                        {selectedOrg.learned_categories_count > 0 
                          ? `${selectedOrg.learned_categories_count} Kategorien`
                          : 'Noch keine Daten'}
                      </span>
                    </div>

                    {/* Grid-Punkte & Suchgebiet */}
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Suchgebiet</span>
                      <span className="font-semibold text-slate-900">
                        {selectedOrg.service_area_city ? `${selectedOrg.service_area_city} · ${selectedOrg.service_area_radius_km}km` : '(noch nicht konfiguriert)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Agency-Verwaltung — für alle Orgs sichtbar (Admin kann jede Org zur Agency machen) */}
                <AgencyPanel
                  org={selectedOrg}
                  plans={plans}
                  onRefetch={() => { refetch(); setSelectedOrg(null); }}
                />

                {/* Agency-Kunden (falls bereits Agency mit Kunden) */}
                {selectedOrg.organization_type === 'agency' && getAgencyStats(selectedOrg.id).clientCount > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-600 mb-3">Agentur-Kunden ({getAgencyStats(selectedOrg.id).clientCount})</h3>
                    <div className="space-y-2">
                      {getAgencyStats(selectedOrg.id).clients.map(client => (
                        <div key={client.id} className="text-xs bg-white rounded px-2 py-1.5 border border-slate-200 flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-slate-900">{client.name}</p>
                            <p className="text-slate-500">{client.owner_email}</p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {client.leads_count || 0} Leads
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Support Notes */}
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-600 mb-3">Support-Notizen</h3>
                  
                  {/* Existing Notes */}
                  {(responseData.supportNotes || []).filter(n => n.organization_id === selectedOrg.id && !n.created_by?.includes('no-reply.base44.com')).length > 0 && (
                    <div className="space-y-2 mb-4">
                      {(responseData.supportNotes || []).filter(n => n.organization_id === selectedOrg.id && !n.created_by?.includes('no-reply.base44.com')).map(note => (
                        <div key={note.id} className={`rounded-lg p-3 border text-xs ${
                          note.severity === 'critical' ? 'bg-red-50 border-red-200' :
                          note.severity === 'warning' ? 'bg-amber-50 border-amber-200' :
                          'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              note.severity === 'critical' ? 'bg-red-100 text-red-700' :
                              note.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {note.severity === 'critical' ? 'Kritisch' : note.severity === 'warning' ? 'Warnung' : 'Info'}
                            </span>
                            <span className="text-slate-500">{moment(note.created_date).format('DD.MM.YYYY HH:mm')}</span>
                          </div>
                          <p className="font-semibold text-slate-900 mb-1">{note.note}</p>
                          <p className="text-slate-500">{note.created_by}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* New Note Form */}
                  {!showNewNoteForm ? (
                    <Button
                      onClick={() => setShowNewNoteForm(true)}
                      variant="outline"
                      size="sm"
                      className="w-full bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      + Neue Notiz
                    </Button>
                  ) : (
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-2">Schweregrad</label>
                        <select
                          value={noteSeverity}
                          onChange={e => setNoteSeverity(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          <option value="info">Info</option>
                          <option value="warning">Warnung</option>
                          <option value="critical">Kritisch</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-2">Notiz</label>
                        <textarea
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="Support-Notiz schreiben…"
                          rows={3}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setShowNewNoteForm(false);
                            setNoteText('');
                            setNoteSeverity('info');
                          }}
                          variant="outline"
                          size="sm"
                          className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                          disabled={savingNote}
                        >
                          Abbrechen
                        </Button>
                        <Button
                          onClick={async () => {
                            setSavingNote(true);
                            const success = await handleCreateSupportNote(noteText, noteSeverity);
                            if (success) {
                              setShowNewNoteForm(false);
                              setNoteText('');
                              setNoteSeverity('info');
                            }
                            setSavingNote(false);
                          }}
                          size="sm"
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                          disabled={savingNote || !noteText.trim()}
                        >
                          {savingNote ? 'Wird gespeichert…' : 'Support-Notiz speichern'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-200">
                <Button onClick={() => setSelectedOrg(null)} className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer opacity-100">
                  Schließen
                </Button>
                {(selectedOrg.platform_status === 'active' || !selectedOrg.platform_status) && (
                  <Button onClick={() => setShowSuspendDialog(true)} className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2">
                    <Lock className="w-4 h-4" /> Sperren
                  </Button>
                )}
                {selectedOrg.platform_status === 'suspended' && (
                  <Button onClick={() => handleUnsuspend(selectedOrg)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                    <Unlock className="w-4 h-4" /> Entsperren
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Suspend Dialog */}
        {showSuspendDialog && selectedOrg && (
          <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
            <DialogContent className="max-w-sm bg-white border border-slate-200 shadow-xl rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5" /> Organisation sperren
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Sie sperren: <strong>{selectedOrg.name}</strong>
                </p>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-2">Sperrungsgrund</label>
                  <textarea
                    value={suspendReason}
                    onChange={e => setSuspendReason(e.target.value)}
                    placeholder="z.B. Zahlungsausfall, AGB-Verstoß, Sicherheitsbedenken…"
                    rows={4}
                    className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 resize-none"
                  />
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-700">
                    <strong>Hinweis:</strong> Die Organisation wird in der Plattform als gesperrt gekennzeichnet. Kundenorganisationen werden nicht automatisch gesperrt.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowSuspendDialog(false);
                      setSuspendReason('');
                    }}
                    disabled={suspending}
                    className="flex-1 bg-white"
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={handleSuspend}
                    disabled={suspending || !suspendReason.trim()}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    {suspending ? 'Wird gesperrt…' : 'Sperren'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
          </TabsContent>

          <TabsContent value="diagnostics">
            <Tabs defaultValue="research-runs" className="space-y-4">
              <TabsList className="bg-white border border-slate-200 p-1 h-auto gap-1">
                <TabsTrigger value="research-runs" className="gap-2 text-xs">
                  <FileText className="w-3.5 h-3.5" /> Research Runs
                </TabsTrigger>
                <TabsTrigger value="lead-scoring" className="gap-2 text-xs">
                  <Activity className="w-3.5 h-3.5" /> Lead Scoring
                </TabsTrigger>
                <TabsTrigger value="dry-test" className="gap-2 text-xs">
                  <FlaskConical className="w-3.5 h-3.5" /> Dry-Test
                </TabsTrigger>
                <TabsTrigger value="usage-billing" className="gap-2 text-xs">
                  <BarChart3 className="w-3.5 h-3.5" /> Usage/Billing
                </TabsTrigger>
              </TabsList>

              <TabsContent value="research-runs">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <ResearchRunDiagnostics
                    userRole={currentUser?.role}
                    userEmail={currentUser?.email}
                    orgId={currentUser ? organizations.find(o => o.owner_email === currentUser.email)?.id : null}
                  />
                </div>
              </TabsContent>

              <TabsContent value="lead-scoring">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <LeadScoringDiagnostics
                    userRole={currentUser?.role}
                    userEmail={currentUser?.email}
                    orgId={currentUser ? organizations.find(o => o.owner_email === currentUser.email)?.id : null}
                  />
                </div>
              </TabsContent>

              <TabsContent value="dry-test">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <LeadEngineDryTest userRole={currentUser?.role} />
                </div>
              </TabsContent>

              <TabsContent value="usage-billing">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <UsageBillingDiagnostics
                    userRole={currentUser?.role}
                    userEmail={currentUser?.email}
                    orgId={currentUser ? organizations.find(o => o.owner_email === currentUser.email)?.id : null}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}