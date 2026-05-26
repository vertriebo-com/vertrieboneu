/**
 * ContactsSection
 * ===============
 * Zeigt Ansprechpartner einer Firma:
 * - Primary Contact prominent
 * - weitere Contacts kompakt
 * - Legacy-Fallback auf Company.ansprechpartner wenn keine Contact-Entity
 * - Button "Ansprechpartner hinzufügen" → AddContactDialog
 * - Button "Als Hauptkontakt setzen"
 */
import { useState, useEffect } from "react";
import { Users, Plus, Star, Phone, Mail, Building2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import AddContactDialog from "./AddContactDialog";

function ContactCard({ contact, onSetPrimary, onRefresh, isPrimary }) {
  const [loading, setLoading] = useState(false);

  const handleSetPrimary = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('upsertContact', {
        org_id: contact.organization_id,
        company_id: contact.company_id,
        contact: { ...contact, is_primary: true },
      });
      onRefresh();
    } catch (e) {
      console.error('[ContactCard] setPrimary fehlgeschlagen:', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-lg border p-3 ${isPrimary ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isPrimary ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            {(contact.name || contact.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-900 truncate">{contact.name || contact.email || '—'}</p>
              {isPrimary && (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0">
                  <Star className="w-2.5 h-2.5" /> Haupt
                </span>
              )}
            </div>
            {(contact.role || contact.department) && (
              <p className="text-xs text-slate-500 truncate">{[contact.role, contact.department].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </div>
        {!isPrimary && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-500 h-7 px-2 flex-shrink-0"
            onClick={handleSetPrimary}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
          </Button>
        )}
      </div>
      <div className="mt-2 space-y-1 pl-9">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            <Mail className="w-3 h-3" /> {contact.email}
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs text-emerald-700 hover:underline">
            <Phone className="w-3 h-3" /> {contact.phone}
          </a>
        )}
        {contact.mobile && (
          <a href={`tel:${contact.mobile}`} className="flex items-center gap-1.5 text-xs text-emerald-700 hover:underline">
            <Phone className="w-3 h-3" /> {contact.mobile} (Mobil)
          </a>
        )}
      </div>
      {contact.review_status === 'unreviewed' && contact.source_type !== 'manual' && (
        <div className="mt-2 pl-9">
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            KI-Daten – ungeprüft
          </span>
        </div>
      )}
    </div>
  );
}

export default function ContactsSection({ company, organizationId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const loadContacts = async () => {
    if (!company?.id || !organizationId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('listContacts', {
        org_id: organizationId,
        company_id: company.id,
      });
      setContacts(res.data?.contacts || []);
    } catch (e) {
      console.error('[ContactsSection] Fehler beim Laden:', e.message);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [company?.id, organizationId]);

  const primaryContact = contacts.find(c => c.is_primary) || contacts[0] || null;
  const otherContacts = contacts.filter(c => c.id !== primaryContact?.id);
  const visibleOthers = showAll ? otherContacts : otherContacts.slice(0, 2);

  // Legacy-Fallback: Company.ansprechpartner anzeigen wenn keine Contacts
  const hasLegacyContact = !loading && contacts.length === 0 && company?.ansprechpartner;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" />
          Ansprechpartner
          {contacts.length > 0 && (
            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{contacts.length}</span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-slate-600"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="w-3 h-3 mr-1" /> Hinzufügen
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Lade Kontakte…
        </div>
      )}

      {!loading && contacts.length === 0 && !hasLegacyContact && (
        <p className="text-xs text-slate-400 italic">Noch kein Ansprechpartner erfasst.</p>
      )}

      {/* Legacy-Fallback: Company.ansprechpartner */}
      {hasLegacyContact && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-600">
              {company.ansprechpartner[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{company.ansprechpartner}</p>
              <p className="text-[10px] text-slate-400">Legacy-Feld · noch nicht als Kontakt gespeichert</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-xs text-blue-600 h-6 px-2"
            onClick={async () => {
              try {
                await base44.functions.invoke('buildPrimaryContactFromCompany', {
                  org_id: organizationId,
                  company_id: company.id,
                });
                loadContacts();
              } catch (e) {
                console.error('[ContactsSection] buildPrimary fehlgeschlagen:', e.message);
              }
            }}
          >
            Als Kontakt übernehmen
          </Button>
        </div>
      )}

      {/* Primary Contact */}
      {primaryContact && (
        <div className="mb-2">
          <ContactCard
            contact={primaryContact}
            isPrimary={true}
            onSetPrimary={() => {}}
            onRefresh={loadContacts}
          />
        </div>
      )}

      {/* Weitere Contacts */}
      {visibleOthers.map(c => (
        <div key={c.id} className="mb-2">
          <ContactCard
            contact={c}
            isPrimary={false}
            onSetPrimary={() => {}}
            onRefresh={loadContacts}
          />
        </div>
      ))}

      {otherContacts.length > 2 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-slate-500 h-7 mt-1"
          onClick={() => setShowAll(v => !v)}
        >
          {showAll ? <><ChevronUp className="w-3 h-3 mr-1" /> Weniger</> : <><ChevronDown className="w-3 h-3 mr-1" /> {otherContacts.length - 2} weitere</>}
        </Button>
      )}

      {showAddDialog && (
        <AddContactDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          organizationId={organizationId}
          companyId={company?.id}
          onSaved={() => { setShowAddDialog(false); loadContacts(); }}
        />
      )}
    </div>
  );
}