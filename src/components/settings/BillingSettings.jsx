import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TrialStatusBanner from "@/components/TrialStatusBanner";
import {
  CreditCard, Mail, Brain, Search, Database,
  AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, RefreshCw, Sparkles, ArrowRight, History, Info
} from "lucide-react";

const BILLING_STATUS_CONFIG = {
  active:             { label: "Aktiv",              color: "bg-green-100 text-green-700 border-green-200",   icon: CheckCircle2 },
  trialing:           { label: "Trial",              color: "bg-blue-100 text-blue-700 border-blue-200",     icon: Clock },
  past_due:           { label: "Zahlung überfällig", color: "bg-red-100 text-red-700 border-red-200",        icon: AlertTriangle },
  unpaid:             { label: "Unbezahlt",          color: "bg-red-100 text-red-700 border-red-200",        icon: AlertTriangle },
  canceled:           { label: "Gekündigt",          color: "bg-gray-100 text-gray-600 border-gray-200",     icon: AlertTriangle },
  incomplete:         { label: "Unvollständig",      color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: AlertTriangle },
  incomplete_expired: { label: "Abgelaufen",         color: "bg-gray-100 text-gray-600 border-gray-200",     icon: AlertTriangle },
};

function formatDate(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPeriodMonth(periodMonth) {
  if (!periodMonth) return "–";
  const [year, month] = periodMonth.split("-");
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" });
}

// Over-Limit Banner Component
function OverLimitBanner({ used, limit, resetDate }) {
  return (
    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-bold text-red-900 mb-1">Monatskontingent überschritten</h4>
          <p className="text-xs text-red-800 mb-2">
            Sie haben <strong>{used} von {limit} Leads</strong> genutzt ({Math.round((used / limit) * 100)}%). 
            Weitere Recherchen sind blockiert bis zum {resetDate}.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.location.href = "/settings?tab=billing#upgrade"}
              className="text-red-700 border-red-300 hover:bg-red-100"
            >
              Jetzt upgraden
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthlyLeadQuotaCard({ usageSummary, plan, subscription }) {
  const maxLeads = usageSummary?.monthly_limit ?? plan?.max_leads_per_month ?? -1;
  const usedLeads = usageSummary?.monthly_used || 0;
  const remaining = usageSummary?.monthly_remaining ?? (maxLeads === -1 ? null : Math.max(0, maxLeads - usedLeads));
  const isOverLimit = usageSummary?.is_over_limit ?? false;
  const pct = maxLeads === -1 ? 0 : Math.min(100, Math.round((usedLeads / maxLeads) * 100));
  const isWarning = maxLeads !== -1 && pct >= 80;
  const isDanger = maxLeads !== -1 && pct >= 95 || isOverLimit;

  const resetDate = usageSummary?.reset_date;
  const crmTotal = usageSummary?.crm_total || null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Monatskontingent · Leads</h3>
        <span className="text-[11px] font-medium text-slate-400">Wird am {resetDate} zurückgesetzt</span>
      </div>

      {/* Over-Limit Banner */}
      {isOverLimit && (
        <OverLimitBanner used={usedLeads} limit={maxLeads} resetDate={resetDate} />
      )}

      {maxLeads === -1 ? (
        <div className="flex items-center gap-2">
          <span className="text-2xl font-extrabold text-emerald-600">∞</span>
          <span className="text-sm font-semibold text-slate-700">Unbegrenzte Leads pro Monat</span>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className={`text-3xl font-extrabold ${isDanger ? "text-red-600" : isWarning ? "text-amber-600" : "text-slate-900"}`}>
                {usedLeads}
              </span>
              <span className="text-lg font-semibold text-slate-400"> / {maxLeads}</span>
              <p className="text-xs text-slate-500 mt-0.5">{usageSummary?.explanation?.monthly_used_description || "neue Leads diesen Monat genutzt"}</p>
            </div>
            <div className="text-right">
              <span className={`text-xl font-bold ${isDanger ? "text-red-600" : isWarning ? "text-amber-600" : "text-emerald-600"}`}>
                {remaining ?? '–'}
              </span>
              <p className="text-xs text-slate-500">verbleibend</p>
            </div>
          </div>

          <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all ${isDanger ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-blue-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Erklärung für Unterschied Monatsverbrauch vs. CRM-Bestand */}
          {crmTotal !== null && (
            <div className="bg-slate-50 rounded-lg px-3 py-2.5 mb-2 border border-slate-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-slate-600">CRM-Bestand:</span>
                <span className="text-sm font-bold text-slate-900">{crmTotal} Firmenkontakte</span>
              </div>
              {usageSummary?.explanation?.why_different && (
                <p className="text-[11px] text-slate-500 leading-relaxed">{usageSummary.explanation.why_different}</p>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-500">
              Neue Leads aus Vertriebo-Recherchen verbrauchen das Monatskontingent. Manuell angelegte Kontakte zählen nicht dazu.
              Nicht genutzte Leads verfallen am Monatsende – <strong>kein Rollover</strong>.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function UsageBar({ label, icon: Icon, used, max, color = "bg-blue-500" }) {
  const pct = max === -1 ? 0 : Math.min(100, Math.round((used / max) * 100));
  const isUnlimited = max === -1;
  const isWarning = !isUnlimited && pct >= 80;
  const isDanger = !isUnlimited && pct >= 95;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon className="w-4 h-4 text-slate-600" /> {label}
        </span>
        <span className={`text-sm font-bold ${isDanger ? "text-red-600" : isWarning ? "text-amber-600" : "text-slate-950"}`}>
          {isUnlimited ? <span className="text-emerald-600">∞ Unbegrenzt</span> : `${used} / ${max}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isDanger ? "bg-red-500" : isWarning ? "bg-amber-500" : color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {!isUnlimited && (
        <p className="text-[11px] font-medium text-slate-500">{Math.max(0, max - used)} verbleibend</p>
      )}
    </div>
  );
}

export default function BillingSettings({ org: orgProp, user }) {
  const [org, setOrg] = useState(orgProp);
  const [plan, setPlan] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [usageSummary, setUsageSummary] = useState(null); // Echter usageSummary-State
  const [usageHistory, setUsageHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [allPlans, setAllPlans] = useState([]);
  const [checkoutLoading, setCheckoutLoading] = useState(null); // plan_id being checked out

  const loadData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [orgs, subs, usageRes] = await Promise.all([
        base44.entities.Organization.filter({ id: org?.id || orgProp?.id }),
        base44.entities.Subscription.filter({ organization_id: org?.id || orgProp?.id }),
        // Single Source of Truth: getUsageSummary
        base44.functions.invoke('getUsageSummary', { org_id: org?.id || orgProp?.id }),
      ]);
      const freshOrg = orgs[0] || org;
      setOrg(freshOrg);

      const sub = subs[0] || null;
      setSubscription(sub);

      // Plan laden
      const planId = freshOrg?.plan_id;
      if (planId) {
        const plans = await base44.entities.Plan.filter({ id: planId });
        setPlan(plans[0] || null);
      }

      // Alle aktiven Pläne mit Stripe-Preis laden (für Plan-Auswahl)
      const availablePlans = await base44.entities.Plan.filter({ is_active: true });
      const plansWithPrice = availablePlans
        .filter(p => p.stripe_price_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setAllPlans(plansWithPrice);

      // usageSummary direkt speichern (nicht in usageLog umwandeln)
      const centralSummary = usageRes?.data?.usage_summary || null;
      setUsageSummary(centralSummary);

      // Historie laden (letzte 6 Monate)
      const allUsageLogs = await base44.entities.UsageLog.filter(
        { organization_id: freshOrg.id },
        "-period_month",
        6
      );
      setUsageHistory(allUsageLogs);
    } catch (e) {
      toast.error("Fehler beim Laden der Billing-Daten: " + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Auto-refresh nach erfolgreichem Checkout – mit Polling bis Webhook verarbeitet
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      let pollCount = 0;
      const maxPolls = 40; // max 60s polling (40 × 1.5s)
      
      const doRefresh = async () => {
        pollCount++;
        try {
          const orgs = await base44.entities.Organization.filter({ id: org?.id || orgProp?.id });
          const freshOrg = orgs[0];
          if (freshOrg) {
            setOrg(freshOrg);
            if (freshOrg.billing_status === 'active' && freshOrg.trial_stage === 'paid') {
              await loadData(true);
              window.dispatchEvent(new CustomEvent("checkout-success"));
              window.history.replaceState({}, document.title, window.location.pathname + "?tab=billing");
            } else if (pollCount < maxPolls) {
              // Noch nicht bereit, weiterpollen
              setTimeout(doRefresh, 1500);
            } else {
              await loadData(true);
            }
          }
        } catch { /* Polling-Fehler still ignorieren */ }
      };
      doRefresh();
    }
  }, []);

  const handleCheckout = async (planId) => {
    if (window.self !== window.top) {
      alert("Der Checkout funktioniert nur in der veröffentlichten App.");
      return;
    }
    setCheckoutLoading(planId);
    try {
      const res = await base44.functions.invoke("createCheckoutSession", {
        organization_id: org.id,
        plan_id: planId,
        success_url: window.location.origin + "/settings?tab=billing&checkout=success",
        cancel_url: window.location.origin + "/settings?tab=billing",
        allow_upgrade: false,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error(res.data?.error || "Fehler beim Starten des Checkouts.");
      }
    } catch (e) {
      toast.error("Fehler: " + e.message);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    if (window.self !== window.top) {
      alert("Das Kundenportal funktioniert nur in der veröffentlichten App.");
      return;
    }
    setPortalLoading(true);
    const res = await base44.functions.invoke("createPortalSession", {
      organization_id: org.id,
      return_url: window.location.origin + "/settings",
    });
    if (res.data?.url) {
      window.location.href = res.data.url;
    } else {
      toast.error(res.data?.error || "Fehler beim Öffnen des Kundenportals.");
    }
    setPortalLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Fallback: wenn billing_status undefined → nimm das Letzte aus dem State oder "preview"
  // (NICHT hardcoded "trialing", das war der Bug)
  const billingStatus = org?.billing_status || "preview";
  const statusCfg = BILLING_STATUS_CONFIG[billingStatus] || BILLING_STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;
  const isProblematic = ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"].includes(billingStatus);

  return (
    <div className="space-y-5">

      {/* Trial Status Banner */}
      <TrialStatusBanner 
        trial_stage={org?.trial_stage}
        billing_status={org?.billing_status}
        trial_leads_granted={org?.trial_leads_granted || 0}
        onUpgrade={() => window.location.href = "/settings#upgrade"}
        onManagePlan={handlePortal}
      />

      {/* Plan-Auswahl für Free Preview */}
      {org?.trial_stage === 'free_preview' && allPlans.length > 0 && (
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Plan auswählen & loslegen</h3>
              <p className="text-xs font-medium text-slate-600 mt-1">
                Wählen Sie Ihren Plan. Beim Starter-Plan erhalten Sie 14 Tage kostenlos zum Testen.
                <br />
                <span className="text-slate-500">Professional und Gold starten direkt. Alle Pläne sind monatlich kündbar.</span>
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {allPlans.map(p => (
              <div key={p.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {p.price_monthly ? `${(p.price_monthly / 100).toFixed(0)} € / Monat` : "–"}
                    </p>
                  </div>
                  {p.has_advanced_reports && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Beliebt</span>
                  )}
                </div>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>✓ {p.max_leads_per_month === -1 ? "Unbegrenzt" : p.max_leads_per_month} Leads/Monat</li>
                  <li>✓ {p.max_lead_generations_per_month === -1 ? "Unbegrenzt" : p.max_lead_generations_per_month} Recherchen/Monat</li>
                  <li>✓ {p.max_ai_scorings_per_month === -1 ? "Unbegrenzt" : p.max_ai_scorings_per_month} KI-Aktionen/Monat</li>
                </ul>
                <Button
                  onClick={() => handleCheckout(p.id)}
                  disabled={checkoutLoading !== null}
                  size="sm"
                  className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {checkoutLoading === p.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ArrowRight className="w-3.5 h-3.5" />}
                  {(p.name || '').toLowerCase().includes('starter') ? '14 Tage kostenlos testen' : `${p.name} buchen`}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Problematic billing warning */}
      {isProblematic && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <strong>Achtung:</strong> Ihr Abo ist <strong>{statusCfg.label}</strong>.{" "}
            {billingStatus === "past_due" || billingStatus === "unpaid"
              ? "Bitte aktualisieren Sie Ihre Zahlungsmethode, um den Zugang zu erhalten."
              : "Bitte schließen Sie ein neues Abonnement ab, um die Plattform weiter zu nutzen."}
          </div>
        </div>
      )}

      {/* Plan & Status Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Aktueller Plan</h3>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-extrabold text-slate-950">{plan?.name || "–"}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.color}`}>
                <StatusIcon className="w-3 h-3" /> {statusCfg.label}
              </span>
            </div>
            {plan?.price_monthly && (
              <p className="text-sm text-slate-600 font-medium mt-0.5">
                {(plan.price_monthly / 100).toFixed(0)} € / Monat
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              onClick={handlePortal}
              disabled={portalLoading || !org?.stripe_customer_id}
              size="sm"
              className="gap-1.5"
            >
              {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Abo verwalten
            </Button>
          </div>
        </div>

        {/* Subscription Period */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200">
          <div>
            <p className="text-xs text-slate-600 font-medium mb-0.5">Aktuelle Periode</p>
            <p className="text-sm font-semibold text-slate-900">
              {subscription?.current_period_start
                ? `${formatDate(subscription.current_period_start)} – ${formatDate(subscription.current_period_end)}`
                : "–"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600 font-medium mb-0.5">Nächste Abrechnung</p>
            <p className="text-sm font-semibold text-slate-900">{formatDate(subscription?.current_period_end)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 font-medium mb-0.5">Trial-Ende</p>
            <p className="text-sm font-semibold text-slate-900">{org?.trial_ends_at ? formatDate(org.trial_ends_at) : "–"}</p>
          </div>
        </div>

        {subscription?.cancel_at_period_end && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Abo wird zum {formatDate(subscription.cancel_at || subscription.current_period_end)} nicht verlängert.
          </div>
        )}
      </div>

      {/* Current Access Level – Trial states */}
      {org?.trial_stage === 'free_preview' && (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Aktueller Zugang</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-slate-700">Zugang:</span>
            <span className="text-blue-600 font-bold">Kostenlose Vorschau</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-slate-700">Vorschau-Leads:</span>
            <span className="text-slate-900 font-bold">{org?.trial_leads_granted || 0} / 10 genutzt</span>
          </div>
        </div>
      </div>
      )}

      {org?.trial_stage === 'verified_trial' && (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Aktueller Zugang</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-slate-700">Zugang:</span>
            <span className="text-amber-600 font-bold">Verifizierter Testzugang</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-slate-700">Max. Leads pro Recherche:</span>
            <span className="text-slate-900 font-bold">25 Leads</span>
          </div>
        </div>
      </div>
      )}

      {/* Monatskontingent – Lead-Quota */}
      {plan && usageSummary && (
      <MonthlyLeadQuotaCard
        usageSummary={usageSummary}
        plan={plan}
        subscription={subscription}
      />
      )}

      {/* Weitere Verbrauchswerte diesen Monat */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
        Weitere Nutzung diesen Monat
      </h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <UsageBar
          label="Recherche-Läufe"
          icon={Search}
          used={usageSummary?.research_runs_used || 0}
          max={plan?.max_lead_generations_per_month ?? -1}
          color="bg-indigo-500"
        />
        <UsageBar
          label="KI-Aktionen"
          icon={Brain}
          used={usageSummary?.ai_actions_used || 0}
          max={plan?.max_ai_scorings_per_month ?? -1}
          color="bg-purple-500"
        />
        <UsageBar
          label="E-Mails dokumentiert"
          icon={Mail}
          used={usageSummary?.manual_emails_logged || 0}
          max={-1}
          color="bg-green-500"
        />
      </div>
      {!usageSummary && (
        <p className="text-sm text-center text-slate-500 pt-4">Noch kein Verbrauch in diesem Monat erfasst.</p>
      )}
      </div>

      {/* Plan Limits Info */}
      {plan && (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Plan-Limits im Überblick</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: "Leads/Monat", value: plan.max_leads_per_month === -1 ? "∞" : plan.max_leads_per_month },
            { label: "Recherchen/Monat", value: plan.max_lead_generations_per_month === -1 ? "∞" : plan.max_lead_generations_per_month },
            { label: "KI-Aktionen/Monat", value: plan.max_ai_scorings_per_month === -1 ? "∞" : plan.max_ai_scorings_per_month },
            { label: "E-Mails/Monat", value: plan.max_emails_per_month === -1 ? "∞" : plan.max_emails_per_month },
          ].map(item => (
            <div key={item.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-2xl font-extrabold text-slate-950">{item.value}</div>
              <div className="text-[11px] font-semibold text-slate-600 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Leads = automatisch recherchierte Firmenkontakte. Manuell angelegte Kontakte verbrauchen kein Monatskontingent.
        </p>
      </div>
      )}

      {/* Nutzungshistorie */}
      {usageHistory.length > 0 && (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nutzungshistorie</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="pb-2">Monat</th>
                <th className="pb-2 text-right">Neue Leads</th>
                <th className="pb-2 text-right">Kontingent*</th>
                <th className="pb-2 text-right">Recherchen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {usageHistory.map(log => (
                <tr key={log.period_month} className="text-slate-700">
                  <td className="py-2 font-medium">{formatPeriodMonth(log.period_month)}</td>
                  <td className="py-2 text-right font-semibold">{log.leads_created || 0}</td>
                  <td className="py-2 text-right text-slate-400">
                    {plan?.max_leads_per_month === -1 ? "∞" : plan?.max_leads_per_month || "–"}
                  </td>
                  <td className="py-2 text-right">{log.lead_generations_used || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">* Kontingent = aktuelles Planlimit. Nicht genutzte Leads verfallen am Monatsende – kein Rollover.</p>
      </div>
      )}

      {/* Statusabhängiger Stripe-Hinweis */}
      {(() => {
        const ts = org?.trial_stage;
        const bs = org?.billing_status;
        // free_preview und verified_trial: keine Stripe-Warnung (TrialStatusBanner übernimmt)
        if (ts === 'free_preview' || ts === 'verified_trial') return null;
        // paid + active, aber stripe_customer_id fehlt oder keine Subscription → Sync-Hinweis
        if (ts === 'paid' && bs === 'active' && (!org?.stripe_customer_id || !subscription)) {
          return (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 font-medium">
                Abo aktiv, Zahlungsdaten werden noch synchronisiert. Falls dies länger bestehen bleibt, bitte Support kontaktieren.
              </p>
            </div>
          );
        }
        // paid + active + alles vorhanden: keine Warnung
        if (ts === 'paid' && bs === 'active') return null;
        // problematische Billing-Zustände werden bereits durch isProblematic-Block weiter oben abgedeckt
        return null;
      })()}
    </div>
  );
}