/**
 * UnifiedActivityFeed
 * ====================
 * Chronologischer Activity Feed für eine Company im LeadDetail.
 * Zeigt alle CRM-Ereignisse: Anrufe, E-Mails, Notizen, Tasks,
 * Lifecycle, Opportunities, Documents, Enrichment, Contacts.
 */
import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import moment from "moment";
import {
  Phone, Mail, MessageSquare, CheckSquare, Square, TrendingUp,
  User, Sparkles, FileText, History, Plus, ChevronDown, Trophy,
  XCircle, ArrowRightLeft, UserPlus, UserCheck, RefreshCw, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Event-Typ Konfiguration ──────────────────────────────────────────────────

const EVENT_CONFIG = {
  phone_call:              { icon: Phone,          color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200',  label: null },
  email:                   { icon: Mail,           color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',        label: null },
  visit:                   { icon: User,           color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-200',    label: null },
  appointment:             { icon: CheckSquare,    color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200',    label: null },
  offer:                   { icon: FileText,       color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200',    label: null },
  note:                    { icon: MessageSquare,  color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200',      label: null },
  task_created:            { icon: Square,         color: 'text-slate-500',   bg: 'bg-slate-50 border-slate-200',      label: 'Aufgabe' },
  task_completed:          { icon: CheckSquare,    color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200',  label: 'Erledigt' },
  lifecycle_changed:       { icon: ArrowRightLeft, color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200',    label: 'Lifecycle' },
  contact_created:         { icon: UserPlus,       color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',        label: 'Kontakt' },
  contact_updated:         { icon: UserCheck,      color: 'text-slate-600',   bg: 'bg-slate-100 border-slate-200',     label: 'Kontakt' },
  enrichment_done:         { icon: Sparkles,       color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',      label: 'KI' },
  opportunity_created:     { icon: TrendingUp,     color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',        label: 'Opportunity' },
  opportunity_stage_changed:{ icon: TrendingUp,   color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200',      label: 'Opportunity' },
  opportunity_won:         { icon: Trophy,         color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200',  label: '🎉 Gewonnen' },
  opportunity_lost:        { icon: XCircle,        color: 'text-red-500',     bg: 'bg-red-50 border-red-200',          label: 'Verloren' },
  document_uploaded:       { icon: FileText,       color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200',      label: 'Dokument' },
};

const DEFAULT_CONFIG = { icon: MessageSquare, color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', label: null };

// ── Einzelnes Event ──────────────────────────────────────────────────────────

function FeedEvent({ event }) {
  const cfg = EVENT_CONFIG[event.event_type] || DEFAULT_CONFIG;
  const Icon = cfg.icon;

  return (
    <div className="flex gap-3 group">
      {/* Icon */}
      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-3 border-b border-slate-100 last:border-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{event.title}</span>
            {cfg.label && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
                {cfg.label}
              </span>
            )}
            {event.is_system && (
              <span className="text-[10px] font-medium text-slate-400 border border-slate-200 px-1 py-0.5 rounded">
                System
              </span>
            )}
            {event.metadata?.ergebnis && !['Abgeschlossen', 'Daten ergänzt', 'Keine neuen Daten', 'Kontakt erstellt', 'Kontakt aktualisiert', 'Lifecycle-Stage-Wechsel'].includes(event.metadata.ergebnis) && (
              <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${
                event.metadata.ergebnis === 'Erreicht' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                event.metadata.ergebnis === 'Nicht erreicht' ? 'bg-red-50 text-red-600 border-red-200' :
                event.metadata.ergebnis === 'Rückruf vereinbart' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                event.metadata.ergebnis === 'Termin vereinbart' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                event.metadata.ergebnis === 'Kein Interesse' ? 'bg-red-50 text-red-500 border-red-200' :
                'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {event.metadata.ergebnis}
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 flex-shrink-0">{moment(event.created_date).format("DD.MM.YY HH:mm")}</span>
        </div>

        {event.description && (
          <p className="text-sm text-slate-700 mt-1 leading-relaxed">{event.description}</p>
        )}

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {event.actor_email && (
            <span className="text-[10px] text-slate-400">{event.actor_email}</span>
          )}
          {event.metadata?.naechster_schritt && (
            <span className="text-[10px] font-semibold text-slate-500">→ {event.metadata.naechster_schritt}</span>
          )}
          {event.metadata?.faellig_am && (
            <span className="text-[10px] text-slate-400">Fällig: {moment(event.metadata.faellig_am).format("DD.MM.YY")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export default function UnifiedActivityFeed({ companyId, organizationId, onAddLog, onAddTask }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [includeSystem, setIncludeSystem] = useState(true);

  const PAGE_SIZE = 25;

  const loadEvents = useCallback(async (pageNum = 1, replace = true) => {
    if (!companyId || !organizationId) return;
    if (pageNum === 1) setLoading(true); else setLoadingMore(true);

    const res = await base44.functions.invoke('getCompanyActivityFeed', {
      org_id: organizationId,
      company_id: companyId,
      page: pageNum,
      page_size: PAGE_SIZE,
      include_tasks: true,
      include_documents: true,
      include_system: includeSystem,
    });

    const data = res.data;
    if (data?.error) {
      toast.error('Feed konnte nicht geladen werden');
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    setTotal(data.total || 0);
    setHasMore(data.has_more || false);
    setPage(pageNum);

    if (replace) {
      setEvents(data.events || []);
    } else {
      setEvents(prev => [...prev, ...(data.events || [])]);
    }

    setLoading(false);
    setLoadingMore(false);
  }, [companyId, organizationId, includeSystem]);

  useEffect(() => {
    loadEvents(1, true);
  }, [loadEvents]);

  const handleLoadMore = () => loadEvents(page + 1, false);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Verlauf</h3>
          {total > 0 && (
            <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{total}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIncludeSystem(s => !s)}
            className={`text-[10px] font-semibold px-2 py-1 rounded border transition-colors ${
              includeSystem
                ? 'bg-slate-100 text-slate-600 border-slate-200'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            System
          </button>
          <button
            onClick={() => loadEvents(1, true)}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {onAddLog && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-white border-slate-200" onClick={onAddLog}>
              <Plus className="w-3 h-3" /> Kontakt
            </Button>
          )}
        </div>
      </div>

      {/* Events */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-10">
            <History className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Noch keine Aktivitäten</p>
            {onAddLog && (
              <button onClick={onAddLog} className="mt-2 text-xs font-semibold text-blue-600 hover:underline">
                Ersten Kontakt hinzufügen
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {events.map(event => (
              <FeedEvent key={event.id} event={event} />
            ))}
          </div>
        )}

        {hasMore && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {loadingMore ? 'Lädt…' : `Ältere Ereignisse laden (${total - events.length} mehr)`}
          </button>
        )}
      </div>
    </div>
  );
}