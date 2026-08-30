import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search, Building2, Shield, AlertTriangle,
  DollarSign, Eye, Lock, Unlock,
  Wrench, CheckCircle2, AlertCircle, ArrowLeft,
  FlaskConical, Activity, BarChart3, FileText,
  MessageSquare, UserPlus, ShieldCheck, Monitor, ShoppingBag
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ResearchRunDiagnostics from '@/components/platform-admin/ResearchRunDiagnostics';
import AgencyPanel from '@/components/platform-admin/AgencyPanel';
import LeadScoringDiagnostics from '@/components/platform-admin/LeadScoringDiagnostics';
import LeadEngineDryTest from '@/components/platform-admin/LeadEngineDryTest';
import UsageBillingDiagnostics from '@/components/platform-admin/UsageBillingDiagnostics';
import FeedbackPanel from '@/components/platform-admin/FeedbackPanel';
import WaitlistLeadsPanel from '@/components/platform-admin/WaitlistLeadsPanel';
import InvestorInquiriesPanel from '@/components/platform-admin/InvestorInquiriesPanel';
import OrgDetailDrawer from '@/components/platform-admin/OrgDetailDrawer';
import SecurityAuditPanel from '@/components/platform-admin/SecurityAuditPanel';
import SystemHealthPanel from '@/components/platform-admin/SystemHealthPanel';
import Digistore24Panel from '@/components/platform-admin/Digistore24Panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  trialing: { label: 'Trial (Stripe)', color: 'bg-blue-50 text-blue-700' },
  preview: { label: 'Vorschau', color: 'bg-slate-100 text-slate-600' },
  past_due: { label: 'Zahlung offen', color: 'bg-amber-50 text-amber-700' },
  unpaid: { label: 'Unbezahlt', color: 'bg-red-50 text-red-700' },
  canceled: { label: 'Gekündigt', color: 'bg-slate-50 text-slate-700' },
  incomplete: { label: 'Unvollständig', color: 'bg-slate-50 text-slate-700' },
  incomplete_expired: { label: 'Abgelaufen', color: 'bg-red-50 text-red-700' },
};

const TRIAL_STAGE_LABELS = {
  free_preview: { label: 'Vorschau', color: 'bg-slate-100 text-slate-600' },
  verified_trial: { label: 'Verifizierter Trial', color: 'bg-cyan-50 text-cyan-700' },
  paid: { label: 'Bezahlt', color: 'bg-emerald-50 text-emerald-700' },
};

export default function PlatformAdmin() {
  // ── ALLE HOOKS MÜSSEN ANFANGS (React Rules of Hooks) ────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [showSystemControl, setShowSystemControl] = useState(false);
  const [systemConfig, setSystemConfig] = useState(null);
  const [googlePlacesEnabled, setGooglePlacesEnabled] = useState(true);
  const [disabledReason, setDisabledReason] = useState('');
  const [savingSystemConfig, setSavingSystemConfig] = useState(false);
  
  // Auth-Check VOR dem Datenladen
  const [authChecked, setAuthChecked] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // useQuery MIT enabled-Absicherung (Security-Fix)
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
    enabled: authChecked && isPlatformAdmin, // SECURITY: Query nur für Admins
    refetchInterval: 30000, // Alle 30s automatisch aktualisieren
    refetchOnWindowFocus: true,
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

  // Load System Config aus aggregiertem Response
  useEffect(() => {
    if (responseData.platform_config) {
      setSystemConfig(responseData.platform_config);
      setGooglePlacesEnabled(responseData.platform_config.google_places_api_enabled !== false);
      setDisabledReason(responseData.platform_config.disabled_reason || '');
    }
  }, [responseData.platform_config]);

  // Current User laden (für Diagnose-Tabs)
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
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

  const getPlanName = (planId) => {
    if (!planId) return 'Kein Plan';
    return plans.find(p => p.id === planId)?.name || 'Nicht zugeordnet';
  };

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
            <TabsTrigger value="feedback" className="gap-2 text-sm">
              <MessageSquare className="w-4 h-4" /> Feedback
            </TabsTrigger>
            <TabsTrigger value="waitlist" className="gap-2 text-sm">
              <UserPlus className="w-4 h-4" /> Interessenten
            </TabsTrigger>
            <TabsTrigger value="investors" className="gap-2 text-sm">
              <DollarSign className="w-4 h-4" /> Investoren
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-2 text-sm">
              <Activity className="w-4 h-4" /> Diagnose & Monitoring
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2 text-sm">
              <ShieldCheck className="w-4 h-4" /> Security
            </TabsTrigger>
            <TabsTrigger value="digistore24" className="gap-2 text-sm">
             <ShoppingBag className="w-4 h-4" /> Digistore24
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-2 text-sm">
             <Monitor className="w-4 h-4" /> System
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orgs">

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
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-600 uppercase">Trial-Stufe</th>
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
                      <td className="px-5 py-4 text-sm text-slate-700">{getPlanName(org.plan_id)}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded ${BILLING_LABELS[org.billing_status]?.color || 'bg-slate-100 text-slate-600'}`}>
                          {BILLING_LABELS[org.billing_status]?.label || org.billing_status || '–'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded ${TRIAL_STAGE_LABELS[org.trial_stage]?.color || 'bg-slate-100 text-slate-600'}`}>
                          {TRIAL_STAGE_LABELS[org.trial_stage]?.label || org.trial_stage || '–'}
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
                           {org.platform_status === 'suspended' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">Gesperrt</span>
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

        {/* Org Detail Drawer */}
        {selectedOrg && (
          <OrgDetailDrawer
            org={selectedOrg}
            plans={plans}
            onClose={() => setSelectedOrg(null)}
            onRefetch={() => { refetch(); setSelectedOrg(null); }}
          />
        )}
          </TabsContent>

          <TabsContent value="feedback">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <FeedbackPanel organizations={organizations} />
            </div>
          </TabsContent>

          <TabsContent value="waitlist">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <WaitlistLeadsPanel />
            </div>
          </TabsContent>

          <TabsContent value="investors">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Investor Relations</h2>
              <p className="text-sm text-slate-500 mb-6">Anfragen von potenziellen Investoren, Business Angels und strategischen Partnern.</p>
              <InvestorInquiriesPanel />
            </div>
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

          <TabsContent value="security">
            <div className="max-w-4xl">
              <SecurityAuditPanel />
            </div>
          </TabsContent>

          <TabsContent value="digistore24">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Digistore24 Affiliate-Verkäufe</h2>
              <p className="text-sm text-slate-500 mb-6">Alle Abonnements die über Digistore24-Affiliate-Links entstanden sind.</p>
              <Digistore24Panel />
            </div>
          </TabsContent>

          <TabsContent value="system">
            <div className="max-w-2xl">
              <SystemHealthPanel
                systemConfig={systemConfig}
                googlePlacesEnabled={googlePlacesEnabled}
                setGooglePlacesEnabled={setGooglePlacesEnabled}
                disabledReason={disabledReason}
                setDisabledReason={setDisabledReason}
                onSaveSystemConfig={handleSaveSystemConfig}
                savingSystemConfig={savingSystemConfig}
              />
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}