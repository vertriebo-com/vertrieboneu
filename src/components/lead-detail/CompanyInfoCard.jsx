/**
 * CompanyInfoCard – strukturierte Firmendaten-Karte
 * Zeigt vorhandene Daten klar, fehlende kompakt.
 */
import { Phone, Mail, Globe, MapPin, User, Building2, Sparkles } from "lucide-react";
import ProvenanceBadge from "./ProvenanceBadge";
import { getFieldProvenance } from "@/utils/provenance";

function InfoRow({ icon: Icon, iconBg, iconColor, label, children, href, blank = false }) {
  const content = (
    <div className="flex items-start gap-2.5">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconBg}`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 leading-none">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} target={blank ? "_blank" : undefined} rel={blank ? "noopener noreferrer" : undefined}
        className="block hover:bg-slate-50 rounded-lg px-1 py-1.5 -mx-1 transition-colors group">
        {content}
      </a>
    );
  }
  return <div className="px-1 py-1.5">{content}</div>;
}

function MissingRow({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-1.5 opacity-40">
      <div className="w-7 h-7 rounded-lg border border-dashed border-slate-200 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-300" />
      </div>
      <p className="text-xs text-slate-400 italic">{label} fehlt</p>
    </div>
  );
}

export default function CompanyInfoCard({ company, onEnrich }) {
  if (!company) return null;

  const missingCount = [!company.telefon, !company.email, !company.ansprechpartner].filter(Boolean).length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5 text-slate-500" />
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Firmendaten</p>
        </div>
        {missingCount > 0 && (
          <button
            onClick={onEnrich}
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg border border-blue-100 hover:bg-blue-50 transition-colors"
          >
            <Sparkles className="w-3 h-3" /> Ergänzen
          </button>
        )}
      </div>

      <div className="p-3 divide-y divide-slate-50">
        {/* Ansprechpartner */}
        {company.ansprechpartner ? (
          <InfoRow icon={User} iconBg="bg-slate-100" iconColor="text-slate-500" label="Ansprechpartner">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-slate-900">{company.ansprechpartner}</p>
              <ProvenanceBadge provenance={getFieldProvenance(company, 'contact_person')} />
            </div>
          </InfoRow>
        ) : (
          <MissingRow icon={User} label="Ansprechpartner" />
        )}

        {/* Telefon */}
        {company.telefon ? (
          <InfoRow icon={Phone} iconBg="bg-emerald-50" iconColor="text-emerald-600" label="Telefon" href={`tel:${company.telefon}`}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-emerald-700 group-hover:underline">{company.telefon}</p>
              <ProvenanceBadge provenance={getFieldProvenance(company, 'phone')} />
            </div>
          </InfoRow>
        ) : (
          <MissingRow icon={Phone} label="Telefon" />
        )}

        {/* E-Mail */}
        {company.email ? (
          <InfoRow icon={Mail} iconBg="bg-blue-50" iconColor="text-blue-600" label="E-Mail" href={`mailto:${company.email}`}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-blue-700 group-hover:underline truncate">{company.email}</p>
              <ProvenanceBadge provenance={getFieldProvenance(company, 'email')} />
            </div>
          </InfoRow>
        ) : (
          <MissingRow icon={Mail} label="E-Mail" />
        )}

        {/* Website */}
        {company.website ? (
          <InfoRow icon={Globe} iconBg="bg-slate-100" iconColor="text-slate-600" label="Website"
            href={company.website.startsWith("http") ? company.website : `https://${company.website}`} blank>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-blue-600 group-hover:underline truncate">{company.website}</p>
              <ProvenanceBadge provenance={getFieldProvenance(company, 'website')} />
            </div>
          </InfoRow>
        ) : (
          <MissingRow icon={Globe} label="Website" />
        )}

        {/* Adresse */}
        {(company.adresse || company.ort) && (
          <InfoRow icon={MapPin} iconBg="bg-slate-100" iconColor="text-slate-500" label="Adresse">
            <p className="text-sm text-slate-700">{company.adresse}</p>
            {(company.plz || company.ort) && (
              <p className="text-xs text-slate-500">{[company.plz, company.ort].filter(Boolean).join(" ")}</p>
            )}
            {company.entfernung_km > 0 && (
              <p className="text-xs text-slate-400">{company.entfernung_km} km entfernt</p>
            )}
          </InfoRow>
        )}

        {/* Vertriebler */}
        {company.assigned_to && (
          <InfoRow icon={User} iconBg="bg-blue-50" iconColor="text-blue-600" label="Zuständig">
            <p className="text-sm font-semibold text-slate-800">{company.assigned_to}</p>
          </InfoRow>
        )}

        {/* Konkurrenz */}
        {company.aktueller_dienstleister && (
          <div className="px-1 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Aktueller Dienstleister</p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              <span className="text-xs font-semibold text-amber-800">🏢 {company.aktueller_dienstleister}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}