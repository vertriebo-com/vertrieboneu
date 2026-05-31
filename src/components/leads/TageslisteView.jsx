/**
 * TageslisteView – Gruppierte Tagesliste für die Leads-Seite
 * Gruppen: Rückrufe → Termine/Angebote → Heiße Leads → Neue diese Woche
 * Kein Lead taucht doppelt auf (Set-basierte Deduplizierung).
 */
import { Link } from "react-router-dom";
import { Phone, Calendar, Flame, Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { isHotLead } from "@/utils/leadTemperature";
import moment from "moment";
import LeadRow from "./LeadRow";

const GROUPS = [
  {
    key: "callback",
    label: "Rückrufe offen",
    sub: "Wiedervorlagen, die heute oder schon früher fällig sind",
    icon: Phone,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    filter: c => c.status === "Rückruf",
    statusLink: "Rückruf",
  },
  {
    key: "termin",
    label: "Termine & Angebote",
    sub: "Aktive Gespräche und laufende Angebote",
    icon: Calendar,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    filter: c => c.status === "Termin" || c.status === "Angebot",
    statusLink: "Termin",
  },
  {
    key: "hot",
    label: "Heiße Leads",
    sub: "KI-priorisierte Kontakte mit hohem Potenzial",
    icon: Flame,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
    filter: c => isHotLead(c),
    statusLink: null,
  },
  {
    key: "new",
    label: "Neue diese Woche",
    sub: "Frisch recherchierte Kontakte der letzten 7 Tage",
    icon: Sparkles,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    filter: c => {
      const weekAgo = moment().subtract(7, "days").toISOString();
      return c.created_date && c.created_date >= weekAgo && c.status === "Neu";
    },
    statusLink: "Neu",
  },
];

const MAX_PER_GROUP = 5;

function GroupSection({ group, leads, isAdmin, onLogged }) {
  const Icon = group.icon;
  const shown = leads.slice(0, MAX_PER_GROUP);
  const overflow = leads.length - MAX_PER_GROUP;

  if (leads.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${group.iconBg}`}>
          <Icon className={`w-3.5 h-3.5 ${group.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">{group.label}</p>
          <p className="text-[11px] text-slate-400">{group.sub}</p>
        </div>
        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
          {leads.length}
        </span>
      </div>

      {/* Lead Rows */}
      <div className="divide-y divide-slate-50">
        {shown.map(company => (
          <LeadRow key={company.id} company={company} isAdmin={isAdmin} onLogged={onLogged} />
        ))}
      </div>

      {/* „Alle anzeigen"-Link bei overflow */}
      {overflow > 0 && group.statusLink && (
        <Link
          to={`/leads?status=${encodeURIComponent(group.statusLink)}`}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-blue-600 hover:text-blue-700 border-t border-slate-100 hover:bg-blue-50 transition-colors"
        >
          Alle {leads.length} {group.label} anzeigen <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
      {overflow > 0 && !group.statusLink && (
        <Link
          to="/leads?temperature=hot"
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-blue-600 hover:text-blue-700 border-t border-slate-100 hover:bg-blue-50 transition-colors"
        >
          Alle {leads.length} heißen Leads anzeigen <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

export default function TageslisteView({
  companies = [],
  totalCompanies = 0,
  isAdmin = false,
  onLogged,
  onLoadMore,
  isLoadingMore = false,
  pageSize = 50,
}) {
  // Deduplizierung: jeder Lead nur in der ersten passenden Gruppe
  const usedIds = new Set();
  const grouped = GROUPS.map(group => {
    const leads = companies.filter(c => {
      if (usedIds.has(c.id)) return false;
      return group.filter(c);
    });
    leads.forEach(c => usedIds.add(c.id));
    return { group, leads };
  });

  const totalShown = grouped.reduce((sum, g) => sum + g.leads.length, 0);
  const remainingContacts = Math.max(0, totalCompanies - companies.length);
  const nextLoadCount = Math.min(pageSize, remainingContacts);
  const hasAny = totalShown > 0;

  return (
    <div className="space-y-3">

      {/* Hinweis: nicht alle Kontakte geladen */}
      {remainingContacts > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-blue-700 flex-1">
            Tagesliste basiert auf den aktuell geladenen Kontakten. Laden Sie weitere Kontakte, um mehr Vorschläge zu sehen.
          </p>
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 shrink-0 px-4 py-2 text-xs font-semibold text-blue-600 border border-blue-300 rounded-xl hover:bg-blue-50 bg-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingMore
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lädt…</>
              : `Weitere ${nextLoadCount} Kontakte laden`}
          </button>
        </div>
      )}

      {/* Gruppen */}
      {grouped.map(({ group, leads }) => (
        <GroupSection
          key={group.key}
          group={group}
          leads={leads}
          isAdmin={isAdmin}
          onLogged={onLogged}
        />
      ))}

      {/* Leer-State */}
      {!hasAny && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <h3 className="text-base font-bold text-slate-700 mb-1">Heute alles erledigt 🎉</h3>
          <p className="text-sm text-slate-400">
            {companies.length === 0
              ? "Noch keine Firmenkontakte. Starten Sie Ihre erste Recherche."
              : "Keine Rückrufe, heißen Leads oder neuen Kontakte heute."}
          </p>
        </div>
      )}
    </div>
  );
}