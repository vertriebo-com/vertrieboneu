import React from 'react';
import { AlertTriangle, Info, CheckCircle2, Clock, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function TrialStatusBanner({ 
  trial_stage, 
  billing_status, 
  trial_leads_granted = 0,
  onUpgrade,
  onManagePlan,
  plan = null,
  usageInfo = null,
  className = ''
}) {
  const getFreePreviewContent = () => ({
    icon: <Info className="w-5 h-5" />,
    title: 'Kostenlose Vorschau',
    description: 'Sie nutzen Vertriebo kostenlos mit bis zu 10 Leads. Danach Plan auswählen.',
    stats: `Vorschau-Leads: ${trial_leads_granted} / 10 genutzt`,
    ctaLabel: 'Plan auswählen',
    ctaAction: onUpgrade,
    bgColor: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-900',
    iconColor: 'text-blue-500',
  });

  const getVerifiedTrialContent = () => {
    const planLimit = plan?.max_leads_per_month ?? 300;
    const planName = plan?.name || 'Starter';
    
    // usageInfo kann null sein während des Ladens → nicht 0 anzeigen!
    if (usageInfo === null || usageInfo === undefined) {
      return {
        icon: <Clock className="w-5 h-5" />,
        title: `${planName}-Testphase`,
        description: `Sie testen den ${planName}-Plan kostenlos. Nach der Testphase monatlich kündbar.`,
        stats: 'Nutzung wird geladen…',
        ctaLabel: 'Abo verwalten',
        ctaAction: onManagePlan,
        bgColor: 'bg-amber-50 border-amber-200',
        textColor: 'text-amber-900',
        iconColor: 'text-amber-500',
      };
    }
    
    // Zentrale UsageSummary verwenden (monthly_used = nur Plan-Leads, OHNE Preview)
    const usedContacts = usageInfo?.monthly_used ?? usageInfo?.leads_created ?? 0;
    const available = planLimit === -1 ? 'unbegrenzt' : Math.max(0, planLimit - usedContacts);
    
    return {
      icon: <Clock className="w-5 h-5" />,
      title: `${planName}-Testphase`,
      description: `Sie testen den ${planName}-Plan kostenlos. Nach der Testphase monatlich kündbar.`,
      stats: planLimit === -1 
        ? 'Unbegrenzte Leads im Testzeitraum'
        : `${usedContacts} von ${planLimit} Leads genutzt · ${available} verbleibend`,
      ctaLabel: 'Abo verwalten',
      ctaAction: onManagePlan,
      bgColor: 'bg-amber-50 border-amber-200',
      textColor: 'text-amber-900',
      iconColor: 'text-amber-500',
    };
  };

  const getPaidContent = () => ({
    icon: <CheckCircle2 className="w-5 h-5" />,
    title: 'Aktives Abo',
    description: 'Sie nutzen Vertriebo mit vollem Umfang.',
    stats: null,
    ctaLabel: null,
    ctaAction: null,
    bgColor: 'bg-emerald-50 border-emerald-200',
    textColor: 'text-emerald-900',
    iconColor: 'text-emerald-500',
  });

  const getPastDueContent = () => ({
    icon: <AlertTriangle className="w-5 h-5" />,
    title: 'Zahlung offen',
    description: 'Bitte aktualisieren Sie Ihre Zahlungsmethode, damit Vertriebo ohne Unterbrechung weiter genutzt werden kann.',
    stats: null,
    ctaLabel: 'Zahlung verwalten',
    ctaAction: onManagePlan,
    bgColor: 'bg-red-50 border-red-200',
    textColor: 'text-red-900',
    iconColor: 'text-red-500',
  });

  const getCanceledContent = () => ({
    icon: <Lock className="w-5 h-5" />,
    title: 'Abo beendet',
    description: 'Ihr Zugang ist eingeschränkt. Wählen Sie einen Plan, um Vertriebo weiter zu nutzen.',
    stats: null,
    ctaLabel: 'Plan auswählen',
    ctaAction: onUpgrade,
    bgColor: 'bg-slate-50 border-slate-200',
    textColor: 'text-slate-900',
    iconColor: 'text-slate-500',
  });

  let content;
  if (trial_stage === 'free_preview') {
    content = getFreePreviewContent();
  } else if (trial_stage === 'verified_trial') {
    content = getVerifiedTrialContent();
  } else if (trial_stage === 'paid' && billing_status === 'active') {
    content = getPaidContent();
  } else if (billing_status === 'past_due') {
    content = getPastDueContent();
  } else if (billing_status === 'canceled') {
    content = getCanceledContent();
  } else {
    content = getPaidContent();
  }

  // Für paid mit active status kein Banner anzeigen
  if (trial_stage === 'paid' && billing_status === 'active') {
    return null;
  }

  return (
    <div className={cn(
      'rounded-lg border px-5 py-4 flex items-start gap-4',
      content.bgColor,
      className
    )}>
      <div className={cn('flex-shrink-0 mt-0.5', content.iconColor)}>
        {content.icon}
      </div>
      <div className="flex-grow">
        <h3 className={cn('font-semibold text-sm mb-1', content.textColor)}>
          {content.title}
        </h3>
        <p className={cn('text-xs mb-2', content.textColor, 'opacity-90')}>
          {content.description}
        </p>
        {content.stats && (
          <p className={cn('text-xs font-medium mb-3', content.textColor, 'opacity-80')}>
            {content.stats}
          </p>
        )}
        {content.ctaAction && (
          <Button
            onClick={content.ctaAction}
            size="sm"
            className={cn(
              'text-xs',
              trial_stage === 'free_preview' ? 'bg-blue-600 hover:bg-blue-700 text-white' :
              trial_stage === 'verified_trial' ? 'bg-amber-600 hover:bg-amber-700 text-white' :
              billing_status === 'past_due' ? 'bg-red-600 hover:bg-red-700 text-white' :
              'bg-slate-600 hover:bg-slate-700 text-white'
            )}
          >
            {content.ctaLabel}
          </Button>
        )}
      </div>
    </div>
  );
}