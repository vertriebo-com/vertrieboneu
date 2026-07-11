import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  CheckCircle2, ArrowRight, Loader2, Sparkles, Star,
  CreditCard, Shield, Zap, ExternalLink, AlertTriangle, RefreshCw
} from "lucide-react";

const PLAN_HIGHLIGHTS = {
  starter:      { icon: "🚀", color: "blue",   badge: null,      tagline: "Perfekt zum Einstieg" },
  professional: { icon: "⚡", color: "violet",  badge: "Beliebt", tagline: "Für wachsende Teams" },
  gold:         { icon: "🏆", color: "amber",   badge: "Beste Leistung", tagline: "Maximum Output" },
};

const COLOR_CLASSES = {
  blue:   { border: "border-blue-200",   activeBorder: "border-blue-500",   bg: "bg-blue-50",   icon: "bg-blue-100 text-blue-600",   btn: "bg-blue-600 hover:bg-blue-700",   badge: "bg-blue-100 text-blue-700" },
  violet: { border: "border-violet-200", activeBorder: "border-violet-500", bg: "bg-violet-50", icon: "bg-violet-100 text-violet-600", btn: "bg-violet-600 hover:bg-violet-700", badge: "bg-violet-100 text-violet-700" },
  amber:  { border: "border-amber-200",  activeBorder: "border-amber-500",  bg: "bg-amber-50",  icon: "bg-amber-100 text-amber-600",  btn: "bg-amber-600 hover:bg-amber-700",  badge: "bg-amber-100 text-amber-700" },
};

function PlanCard({ plan, isCurrentPlan, hasActiveSub, onCheckout, checkoutLoading }) {
  const code = plan.plan_code || plan.name?.toLowerCase();
  const highlight = PLAN_HIGHLIGHTS[code] || { icon: "📦", color: "blue", badge: null, tagline: "" };
  const c = COLOR_CLASSES[highlight.color];
  const price = plan.price_monthly ? (plan.price_monthly / 100).toFixed(0) : "–";
  const hasTrialDays = plan.trial_days > 0;
  const isLoading = checkoutLoading === plan.id;

  return (
    <div className={`relative flex flex-col border-2 rounded-2xl p-5 transition-all shadow-sm hover:shadow-md ${
      isCurrentPlan ? `${c.activeBorder} ${c.bg}` : `${c.border} bg-white`
    }`}>
      {/* Badges */}
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${c.icon}`}>
          {highlight.icon}
        </div>
        <div className="flex flex-col items-end gap-1">
          {isCurrentPlan && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Ihr Plan
            </span>
          )}
          {highlight.badge && !isCurrentPlan && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
              {highlight.badge}
            </span>
          )}
          {hasTrialDays && !isCurrentPlan && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {plan.trial_days} Tage gratis
            </span>
          )}
        </div>
      </div>

      {/* Name & Price */}
      <h3 className="text-base font-extrabold text-slate-900 mb-0.5">{plan.name}</h3>
      <p className="text-xs text-slate-500 mb-3">{highlight.tagline}</p>
      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-3xl font-extrabold text-slate-950">{price} €</span>
        <span className="text-sm text-slate-500 font-medium">/ Monat</span>
      </div>

      {/* Features */}
      <ul className="space-y-2 mb-5 flex-1">
        {[
          { label: plan.max_leads_per_month === -1 ? "Unbegrenzte Leads/Monat" : `${plan.max_leads_per_month} Leads/Monat` },
          { label: plan.max_lead_generations_per_month === -1 ? "Unbegrenzte Recherchen" : `${plan.max_lead_generations_per_month} Recherchen/Monat` },
          { label: plan.max_ai_scorings_per_month === -1 ? "Unbegrenzte KI-Aktionen" : `${plan.max_ai_scorings_per_month} KI-Aktionen/Monat` },
          { label: `Bis zu ${plan.max_users === -1 ? "∞" : plan.max_users} Nutzer` },
          ...(plan.has_advanced_reports ? [{ label: "Erweiterte Berichte" }] : []),
          ...(plan.has_custom_email_templates ? [{ label: "Eigene E-Mail-Vorlagen" }] : []),
        ].map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            {f.label}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrentPlan ? (
        <div className="flex items-center justify-center gap-1.5 h-9 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5" /> Aktuell aktiv
        </div>
      ) : (
        <Button
          onClick={() => onCheckout(plan.id)}
          disabled={checkoutLoading !== null}
          className={`w-full gap-1.5 text-white ${c.btn}`}
          size="sm"
        >
          {isLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <ArrowRight className="w-3.5 h-3.5" />}
          {isLoading
            ? "Wird gestartet…"
            : hasTrialDays
            ? `${plan.trial_days} Tage kostenlos testen`
            : `${plan.name} wählen`}
        </Button>
      )}
    </div>
  );
}

export default function PlanSelection({ org, user }) {
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [availablePlans, subs] = await Promise.all([
        base44.entities.Plan.filter({ is_active: true }),
        base44.entities.Subscription.filter({ organization_id: org?.id }),
      ]);

      const selfServicePlans = availablePlans
        .filter(p => p.stripe_price_id && p.plan_type !== "agency" && p.allow_self_service !== false)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setPlans(selfServicePlans);

      const activeSub = subs.find(s => ["active", "trialing"].includes(s.status)) || null;
      setSubscription(activeSub);

      if (org?.plan_id) {
        const planMatches = availablePlans.filter(p => p.id === org.plan_id);
        setCurrentPlan(planMatches[0] || null);
      }
    } catch (e) {
      toast.error("Fehler beim Laden der Pläne: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [org?.id]);

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
        allow_upgrade: !!subscription,
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
      return_url: window.location.origin + "/settings?tab=billing",
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

  const hasActiveSub = !!subscription;
  const billingStatus = org?.billing_status;
  const isTrialing = billingStatus === "trialing";
  const isActive = billingStatus === "active";

  return (
    <div className="space-y-6">

      {/* Current Status Banner */}
      {(isActive || isTrialing) && currentPlan && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-900">
                {isTrialing ? `Testzeitraum aktiv – ${currentPlan.name}` : `Aktives Abo – ${currentPlan.name}`}
              </p>
              <p className="text-xs text-emerald-700">
                {isTrialing
                  ? `Ihr Trial läuft. Nach Ablauf wird automatisch abgerechnet.`
                  : `${(currentPlan.price_monthly / 100).toFixed(0)} € / Monat · Monatlich kündbar`}
              </p>
            </div>
          </div>
          {org?.stripe_customer_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePortal}
              disabled={portalLoading}
              className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-100 shrink-0"
            >
              {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Abo verwalten / kündigen
            </Button>
          )}
        </div>
      )}

      {/* Problematic status */}
      {["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"].includes(billingStatus) && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-900">Problem mit Ihrem Abonnement</p>
            <p className="text-xs text-red-700 mt-0.5">
              {billingStatus === "past_due" || billingStatus === "unpaid"
                ? "Zahlung fehlgeschlagen. Bitte aktualisieren Sie Ihre Zahlungsmethode."
                : "Ihr Abo ist nicht mehr aktiv. Bitte wählen Sie einen neuen Plan."}
            </p>
          </div>
        </div>
      )}

      {/* Plan Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              {hasActiveSub ? "Plan wechseln" : "Plan auswählen"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Alle Pläne monatlich kündbar · Keine Mindestlaufzeit</p>
          </div>
          <button onClick={() => loadData()} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={currentPlan?.id === plan.id && hasActiveSub}
              hasActiveSub={hasActiveSub}
              onCheckout={handleCheckout}
              checkoutLoading={checkoutLoading}
            />
          ))}
        </div>
      </div>

      {/* Trust Badges */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Shield, text: "DSGVO-konform", sub: "Daten bleiben in der EU" },
          { icon: CreditCard, text: "Sicher bezahlen", sub: "Powered by Stripe" },
          { icon: Zap, text: "Sofort aktiv", sub: "Direkt nach Buchung" },
        ].map(({ icon: Icon, text, sub }) => (
          <div key={text} className="flex flex-col items-center text-center p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <Icon className="w-4 h-4 text-slate-500 mb-1.5" />
            <p className="text-[11px] font-bold text-slate-700">{text}</p>
            <p className="text-[10px] text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      {/* Agency Note */}
      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Star className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600">
          <strong className="text-slate-800">Agency-Plan (ab 599 €/Monat):</strong>{" "}
          Unbegrenzte Leads, mehrere Kundenorganisationen, eigenes Branding.{" "}
          <a href="/kontakt" className="text-blue-600 font-semibold hover:underline">Jetzt anfragen →</a>
        </p>
      </div>
    </div>
  );
}