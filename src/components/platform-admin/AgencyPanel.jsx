import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Building2, Infinity, Calendar, FileText, Save, CheckCircle2 } from 'lucide-react';
import moment from 'moment';

export default function AgencyPanel({ org, plans, onRefetch }) {
  const agencyPlan = plans.find(p => p.plan_type === 'agency' || p.name?.toLowerCase().includes('agency'));

  const [planId, setPlanId] = useState(org.plan_id || agencyPlan?.id || '');
  const [billingStatus, setBillingStatus] = useState(org.billing_status || 'active');
  const [trialStage, setTrialStage] = useState(org.trial_stage || 'paid');
  const [customLimit, setCustomLimit] = useState(
    org.custom_monthly_lead_limit != null ? String(org.custom_monthly_lead_limit) : ''
  );
  const [contractNotes, setContractNotes] = useState(org.agency_contract_notes || '');
  const [validFrom, setValidFrom] = useState(
    org.agency_valid_from ? moment(org.agency_valid_from).format('YYYY-MM-DD') : ''
  );
  const [validUntil, setValidUntil] = useState(
    org.agency_valid_until ? moment(org.agency_valid_until).format('YYYY-MM-DD') : ''
  );
  const [saving, setSaving] = useState(false);

  const isAgencyActive = org.agency_enabled === true;

  const getEffectiveLimit = () => {
    if (customLimit === '-1') return 'Unlimited (bewusst gesetzt)';
    if (customLimit && customLimit !== '') return `${customLimit} Leads/Monat (individuell)`;
    const selectedPlan = plans.find(p => p.id === planId);
    if (!selectedPlan) return '(Plan nicht gefunden)';
    if (selectedPlan.max_leads_per_month === -1) return 'Unlimited (Plan-Default)';
    return `${selectedPlan.max_leads_per_month} Leads/Monat (Plan-Default)`;
  };

  const handleActivate = async () => {
    if (!planId) { toast.error('Bitte einen Plan auswählen'); return; }
    setSaving(true);
    try {
      const payload = {
        action: 'activateAgency',
        organization_id: org.id,
        plan_id: planId,
        billing_status: billingStatus,
        trial_stage: trialStage,
        agency_contract_notes: contractNotes,
      };
      if (customLimit !== '') payload.custom_monthly_lead_limit = customLimit === '' ? null : Number(customLimit);
      if (validFrom) payload.agency_valid_from = new Date(validFrom).toISOString();
      if (validUntil) payload.agency_valid_until = new Date(validUntil).toISOString();

      const res = await base44.functions.invoke('platformAdmin', payload);
      if (res.data?.success) {
        toast.success(res.data.message || 'Agency aktiviert');
        onRefetch();
      } else {
        toast.error(res.data?.error || 'Fehler');
      }
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const payload = {
        action: 'updateAgencySettings',
        organization_id: org.id,
        plan_id: planId,
        billing_status: billingStatus,
        agency_contract_notes: contractNotes,
        custom_monthly_lead_limit: customLimit === '' ? null : Number(customLimit),
        agency_valid_from: validFrom ? new Date(validFrom).toISOString() : null,
        agency_valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      };
      const res = await base44.functions.invoke('platformAdmin', payload);
      if (res.data?.success) {
        toast.success('Agency-Settings gespeichert');
        onRefetch();
      } else {
        toast.error(res.data?.error || 'Fehler');
      }
    } catch (e) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-purple-600" />
          <h3 className="text-xs font-bold uppercase text-slate-600">Agency-Verwaltung</h3>
        </div>
        {isAgencyActive && (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Aktiv
          </span>
        )}
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-4">

        {/* Plan */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">Plan zuweisen</label>
          <select
            value={planId}
            onChange={e => setPlanId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">— Plan wählen —</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.max_leads_per_month === -1 ? '∞' : p.max_leads_per_month} Leads/Mo)
              </option>
            ))}
          </select>
        </div>

        {/* Billing Status + Trial Stage */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Billing-Status</label>
            <select
              value={billingStatus}
              onChange={e => setBillingStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="active">active</option>
              <option value="trialing">trialing</option>
              <option value="past_due">past_due</option>
              <option value="canceled">canceled</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Trial-Stage</label>
            <select
              value={trialStage}
              onChange={e => setTrialStage(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="paid">paid</option>
              <option value="verified_trial">verified_trial</option>
              <option value="free_preview">free_preview</option>
            </select>
          </div>
        </div>

        {/* Custom Lead Limit */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">
            Individuelles Lead-Limit/Monat
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={customLimit}
              onChange={e => setCustomLimit(e.target.value)}
              placeholder="leer = Plan-Default"
              className="flex-1 text-sm"
            />
            <button
              type="button"
              onClick={() => setCustomLimit('-1')}
              title="Unlimited setzen"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-300 bg-purple-100 text-purple-700 text-xs font-bold hover:bg-purple-200 transition-colors"
            >
              <Infinity className="w-3.5 h-3.5" /> ∞
            </button>
            <button
              type="button"
              onClick={() => setCustomLimit('')}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Reset
            </button>
          </div>
          <p className="text-[11px] text-purple-700 mt-1.5 font-medium">
            Effektiv: {getEffectiveLimit()}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            -1 = Unlimited (nur bewusst durch Admin setzen). Leer = Plan-Wert gilt.
          </p>
        </div>

        {/* Gültigkeitszeitraum */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" />Gültig ab
            </label>
            <Input
              type="date"
              value={validFrom}
              onChange={e => setValidFrom(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" />Gültig bis
            </label>
            <Input
              type="date"
              value={validUntil}
              onChange={e => setValidUntil(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        {/* Kontrakt-Notizen */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">
            <FileText className="w-3 h-3 inline mr-1" />Kontrakt-Notizen (intern)
          </label>
          <textarea
            value={contractNotes}
            onChange={e => setContractNotes(e.target.value)}
            placeholder="Preis, Konditionen, Sondervereinbarungen, Laufzeit…"
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500"
          />
        </div>

        {/* Bereits aktiviert von */}
        {isAgencyActive && org.agency_activated_by && (
          <div className="text-[11px] text-slate-500 bg-white rounded px-3 py-2 border border-slate-200">
            Aktiviert von <strong>{org.agency_activated_by}</strong>
            {org.agency_activated_at && ` am ${moment(org.agency_activated_at).format('DD.MM.YYYY HH:mm')}`}
          </div>
        )}

        {/* Aktions-Button */}
        <Button
          onClick={isAgencyActive ? handleUpdate : handleActivate}
          disabled={saving || !planId}
          size="sm"
          className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Wird gespeichert…' : isAgencyActive ? 'Agency-Settings speichern' : 'Agency freischalten'}
        </Button>
      </div>
    </div>
  );
}