import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Building2, Phone, Mail, Globe, MapPin, User, Plus, History, Trash2, Ban,
  Sparkles, MessageSquare, CheckCircle2, Circle, ChevronRight, PhoneCall, Flame, Target, Calendar,
  AlertTriangle, Loader2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import StatusBadge from "../components/StatusBadge";
import CallScriptDialog from "../components/CallScriptDialog";
import EngineBox from "../components/lead-detail/EngineBox";
import AddContactLogDialog from "../components/AddContactLogDialog";
import AddTaskDialog from "../components/AddTaskDialog";
import SendEmailDialog from "../components/SendEmailDialog";
import OutcomeFeedback from "../components/lead-detail/OutcomeFeedback";
import RelevanceSection from "../components/lead-detail/RelevanceSection";
import ContactsSection from "../components/lead-detail/ContactsSection";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import moment from "moment";
import { isHotLead, isWarmLead } from "@/utils/leadTemperature";
import ProvenanceBadge from "../components/lead-detail/ProvenanceBadge";
import { getFieldProvenance, parseProvenance } from "@/utils/provenance";
import LifecycleStageBadge from "../components/lead-detail/LifecycleStageBadge";
import OpportunitySection from "../components/lead-detail/OpportunitySection";
import UnifiedActivityFeed from "../components/lead-detail/UnifiedActivityFeed";

function temperatureBadge(company) {
  if (isHotLead(company)) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">🔥 Heiß</span>;
  if (isWarmLead(company)) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚡ Warm</span>;
  return null;
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── Org-Kontext: konsistent mit Leads/Dashboard via useOrganization ──
  const { org, user: currentUser, loading: orgLoading } = useOrganization();
  const orgId = org?.id || null;
  const orgOwnerEmail = org?.owner_email || null;

  const [company, setCompany] = useState(null);
  const [contactLogs, setContactLogs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLog, setShowAddLog] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskDraft, setTaskDraft] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const enrichingRef = useRef(false);
  const [notizen, setNotizen] = useState("");
  const [notizenSaving, setNotizenSaving] = useState(false);
  const [showSonstigesDialog, setShowSonstigesDialog] = useState(false);
  const [sonstigesNotiz, setSonstigesNotiz] = useState("");
  const [sonstigesSaving, setSonstigesSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBlacklistConfirm, setShowBlacklistConfirm] = useState(false);
  const [learnedSignals, setLearnedSignals] = useState(null);

  // D) Wenn orgId wechselt oder id wechselt → State zurücksetzen und neu laden
  useEffect(() => {
    if (orgLoading) return; // Warten bis useOrganization fertig ist
    if (!orgId) { navigate("/"); return; }
    // Reset bei Kontextwechsel
    setCompany(null);
    setContactLogs([]);
    setTasks([]);
    setLearnedSignals(null);
    setLoading(true);
    loadData();
  }, [id, orgId, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      if (!orgId) { navigate("/"); return; }

      const [comp, logs, allTasks, signals] = await Promise.all([
        base44.entities.Company.filter({ id, organization_id: orgId }),
        base44.entities.ContactLog.filter({ company_id: id, organization_id: orgId }),
        base44.entities.Task.filter({ company_id: id, organization_id: orgId }),
        base44.entities.OrgLearnedSignals.filter({ organization_id: orgId }, '-updated_date', 1),
      ]);
      setLearnedSignals(signals?.[0] || null);

      if (!comp || comp.length === 0) {
        toast.error("Lead nicht gefunden oder kein Zugriff");
        navigate("/leads");
        return;
      }

      const loadedCompany = comp[0];

      // C) Sicherheitscheck: company muss zur aktiven Org gehören
      if (loadedCompany.organization_id && loadedCompany.organization_id !== orgId) {
        const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(currentUser?.role);
        if (!isPlatformAdmin) {
          toast.error("Kein Zugriff auf diesen Lead");
          navigate("/leads");
          return;
        }
      }

      const userIsPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(currentUser?.role);
      const userIsOwner = org?.owner_email === currentUser?.email;
      const userCanAccessAllLeads = userIsPlatformAdmin || userIsOwner;

      if (!userCanAccessAllLeads && loadedCompany.assigned_to && loadedCompany.assigned_to !== currentUser?.email) {
        toast.error("Dieses Lead ist einem anderen Vertriebler zugewiesen");
        navigate("/leads");
        return;
      }

      setCompany(loadedCompany);
      setNotizen(loadedCompany.notizen || "");
      setContactLogs(logs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setTasks(allTasks.sort((a, b) => new Date(a.faellig_am || 0) - new Date(b.faellig_am || 0)));
      setLoading(false);
    } catch (error) {
      console.error("Fehler beim Laden:", error);
      toast.error("Fehler beim Laden der Daten");
      navigate("/leads");
    }
  };

  // C) Org-Kontext-Guard für alle Mutationen
  const assertOrgMatch = () => {
    if (company?.organization_id && company.organization_id !== orgId) {
      const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(currentUser?.role);
      if (!isPlatformAdmin) {
        toast.error("Aktion nicht erlaubt: falscher Org-Kontext");
        navigate("/leads");
        return false;
      }
    }
    return true;
  };

  const handleStatusChange = async (newStatus) => {
    if (!assertOrgMatch()) return;
    if (newStatus === "__sonstiges__") { setSonstigesNotiz(""); setShowSonstigesDialog(true); return; }
    await base44.functions.invoke("updateCompanySafe", { company_id: id, patch: { status: newStatus } });
    setCompany(prev => ({ ...prev, status: newStatus }));
    toast.success(`Status auf "${newStatus}" geändert`);
  };

  const handleSonstigesSubmit = async () => {
    if (!assertOrgMatch()) return;
    setSonstigesSaving(true);
    await base44.entities.ContactLog.create({
      organization_id: orgId, company_id: id, typ: "Sonstiges", ergebnis: "Abgeschlossen",
      notiz: sonstigesNotiz, naechster_schritt: "Kunde meldet sich selbst", user_email: currentUser?.email,
    });
    await base44.functions.invoke("updateCompanySafe", { company_id: id, patch: { last_contact_date: new Date().toISOString() } });
    toast.success("Notiz gespeichert");
    setSonstigesSaving(false); setShowSonstigesDialog(false); setSonstigesNotiz(""); loadData();
  };

  const handleBlacklist = async () => {
    if (!assertOrgMatch()) return;
    const res = await base44.functions.invoke("blacklistCompany", { company_id: id, organization_id: orgId });
    if (res.data?.error) { toast.error("Fehler: " + res.data.error); return; }
    toast.success("Firma auf Blacklist gesetzt");
    setShowBlacklistConfirm(false);
    navigate("/leads");
  };

  const handleDelete = async () => {
    if (!assertOrgMatch()) return;
    const res = await base44.functions.invoke("deleteCompany", { company_id: id, organization_id: orgId });
    if (res.data?.error) { toast.error("Fehler: " + res.data.error); return; }
    toast.success("Firma gelöscht");
    setShowDeleteConfirm(false);
    navigate("/leads");
  };

  const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(currentUser?.role);
  const isOwner = orgOwnerEmail !== null && currentUser?.email === orgOwnerEmail;
  const canUseAdminActions = isPlatformAdmin || isOwner;

  const handleEnrich = async () => {
    if (!assertOrgMatch()) return;
    if (enrichingRef.current) return;
    enrichingRef.current = true;
    setEnriching(true);
    try {
      const currentOrgId = orgId;
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout nach 30 Sekunden")), 30000));
      const res = await Promise.race([
        base44.functions.invoke("enrichCompany", { companyId: id, organization_id: currentOrgId }),
        timeoutPromise,
      ]);
      const data = res.data;
      if (data?.success === false) {
        toast.error("Anreichern fehlgeschlagen: " + (data?.error || "Unbekannter Fehler"));
      } else {
        const found = data?.found || 0;
        if (found > 0) {
          const enriched = [
            data?.telefon_added && "Telefon",
            data?.website_added && "Website",
            data?.adresse_added && "Adresse",
            data?.ansprechpartner_added && "Ansprechpartner",
            data?.branche_added && "Branche",
          ].filter(Boolean);
          toast.success(enriched.length > 0 ? enriched.join(", ") + " ergänzt" : `${found} Felder ergänzt`);
          loadData();
        } else {
          toast.info("Keine zusätzlichen Daten gefunden.");
          loadData();
        }
      }
    } catch (e) {
      toast.error("Anreichern fehlgeschlagen: " + (e?.message || "Unbekannter Fehler"));
    } finally {
      setEnriching(false);
      enrichingRef.current = false;
    }
  };

  const handleSaveNotizen = async () => {
    if (!assertOrgMatch()) return;
    setNotizenSaving(true);
    await base44.functions.invoke("updateCompanySafe", { company_id: id, patch: { notizen } });
    setCompany(prev => ({ ...prev, notizen }));
    toast.success("Notiz gespeichert • " + moment().format("HH:mm"));
    setNotizenSaving(false);
  };

  const toggleTask = async (task) => {
    const nowDone = !task.erledigt;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, erledigt: nowDone } : t));
    await base44.functions.invoke("updateTaskSafe", { task_id: task.id, patch: { erledigt: nowDone } });
    toast.success(nowDone ? "Aufgabe erledigt ✓" : "Aufgabe wieder geöffnet");
  };

  const openTasks = tasks.filter(t => !t.erledigt);

  if (orgLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  if (!company) return (
    <div className="text-center py-16">
      <p className="text-slate-600">Firma nicht gefunden</p>
      <Link to="/leads"><Button variant="outline" className="mt-4">Zurück</Button></Link>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ═══ LEAD HERO HEADER ═══ */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Farbstreifen oben */}
        <div className={`h-1 w-full ${isHotLead(company) ? "bg-gradient-to-r from-orange-400 to-red-500" : "bg-gradient-to-r from-blue-500 to-violet-500"}`} />

        <div className="p-4 sm:p-5">
          {/* Zurück + Titel */}
          <div className="flex items-start gap-3 mb-4">
            <Link to="/leads" className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0 mt-0.5">
              <ArrowLeft className="w-4 h-4" /> Leads
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Firma Name + Meta */}
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isHotLead(company)
                  ? "bg-orange-100 border-2 border-orange-200"
                  : "bg-blue-100 border-2 border-blue-200"
              }`}>
                {isHotLead(company)
                  ? <Flame className="w-6 h-6 text-orange-600" />
                  : <Building2 className="w-6 h-6 text-blue-600" />
                }
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">{company.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {company.branche && <span className="text-sm font-medium text-slate-700">{company.branche}</span>}
                  {company.ort && (
                    <span className="flex items-center gap-1 text-sm text-slate-500">
                      <MapPin className="w-3 h-3" /> {company.ort}
                    </span>
                  )}
                  {company.last_contact_date && (
                    <span className="text-xs text-slate-500">· Letzter Kontakt: {moment(company.last_contact_date).fromNow()}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <StatusBadge status={company.status} />
                  {temperatureBadge(company)}
                  <LifecycleStageBadge
                    company={company}
                    organizationId={orgId}
                    canEdit={canUseAdminActions}
                    onChanged={(newStage) => {
                      setCompany(prev => ({ ...prev, lifecycle_stage: newStage }));
                      loadData();
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Primär-CTA rechts */}
            <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
              {company.telefon ? (
                <a href={`tel:${company.telefon}`}
                  aria-label={`${company.name} anrufen: ${company.telefon}`}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition-all">
                  <Phone className="w-4 h-4" /> Anrufen
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-100 text-slate-400 text-sm border border-slate-200 cursor-not-allowed">
                  <Phone className="w-3.5 h-3.5" /> Kein Telefon
                </span>
              )}
              <CallScriptDialog company={company} />
              <SendEmailDialog company={company} organizationId={orgId} />
            </div>
          </div>

          {/* Sekundäre Aktionen */}
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => setShowAddTask(true)}
              className="inline-flex items-center gap-1.5 h-8 text-xs font-semibold bg-white text-slate-700 border border-slate-200 px-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-500" /> Aufgabe
            </button>
            <button
              onClick={() => setShowAddLog(true)}
              className="inline-flex items-center gap-1.5 h-8 text-xs font-semibold bg-white text-slate-700 border border-slate-200 px-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" /> Kontakt
            </button>
            <button
              onClick={handleEnrich}
              disabled={enriching}
              className={`inline-flex items-center gap-1.5 h-8 text-xs font-semibold border px-3 rounded-lg transition-colors ${
                enriching ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {enriching
                ? <span className="w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                : <Sparkles className="w-3.5 h-3.5 text-slate-500" />
              }
              {enriching ? "Läuft…" : "Daten ergänzen"}
            </button>
            {canUseAdminActions && (
              <>
                <button onClick={() => setShowBlacklistConfirm(true)}
                  className="inline-flex items-center gap-1.5 h-8 text-xs font-semibold border border-slate-200 bg-white text-slate-600 px-3 rounded-lg hover:bg-slate-50 transition-colors ml-auto">
                  <Ban className="w-3 h-3" /> Blacklist
                </button>
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 h-8 text-xs font-semibold border border-red-200 bg-white text-red-600 px-3 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3 h-3" /> Löschen
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Datenlücken-Banner */}
      {(() => {
        const missing = [];
        if (!company.telefon) missing.push("Telefon");
        if (!company.email) missing.push("E-Mail");
        if (!company.ansprechpartner) missing.push("Ansprechpartner");
        if (!company.website) missing.push("Website");
        if (missing.length === 0) return null;
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-2.5 flex-1">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Kontaktdaten unvollständig</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Fehlend: <span className="font-semibold">{missing.join(", ")}</span>
                  {!company.telefon && " – Anruf nicht möglich"}
                  {company.telefon && !company.email && " – E-Mail-Kontakt nicht möglich"}
                </p>
              </div>
            </div>
            <button
              onClick={handleEnrich}
              disabled={enriching}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shrink-0 disabled:opacity-60"
            >
              {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {enriching ? "Sucht Daten…" : "Kontaktdaten suchen"}
            </button>
          </div>
        );
      })()}

      {/* Outcome Feedback */}
      {orgId && (
        <OutcomeFeedback
          companyId={id}
          organizationId={orgId}
          company={company}
          onStatusSync={(newStatus) => setCompany(prev => ({ ...prev, status: newStatus }))}
        />
      )}

      {/* ═══ 2-SPALTEN-LAYOUT ═══ */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">

        {/* ── LINKE SPALTE: Firmendaten + Notizen + Kontakthistorie ── */}
        <div className="space-y-4">

          {/* Firmendaten */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-3">
              <Building2 className="w-3.5 h-3.5" /> Firmendaten
            </h3>
            <div className="space-y-2.5">
              {company.ansprechpartner && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900">{company.ansprechpartner}</p>
                      <ProvenanceBadge provenance={getFieldProvenance(company, 'contact_person')} />
                    </div>
                    <p className="text-xs text-slate-500">Ansprechpartner</p>
                  </div>
                </div>
              )}
              {company.adresse && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-900">{company.adresse}</p>
                    <p className="text-xs text-slate-500">{[company.plz, company.ort].filter(Boolean).join(" ")}</p>
                    {company.entfernung_km > 0 && <p className="text-xs text-slate-500">{company.entfernung_km} km entfernt</p>}
                  </div>
                </div>
              )}
              {company.telefon && (
                <a href={`tel:${company.telefon}`} aria-label={`Telefon: ${company.telefon}`} className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 rounded-md bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-emerald-700 group-hover:underline">{company.telefon}</p>
                      <ProvenanceBadge provenance={getFieldProvenance(company, 'phone')} />
                    </div>
                    <p className="text-xs text-slate-500">Telefon</p>
                  </div>
                </a>
              )}
              {company.email && (
                <a href={`mailto:${company.email}`} aria-label={`E-Mail an: ${company.email}`} className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-blue-700 group-hover:underline truncate">{company.email}</p>
                      <ProvenanceBadge provenance={getFieldProvenance(company, 'email')} />
                    </div>
                    <p className="text-xs text-slate-500">E-Mail</p>
                  </div>
                </a>
              )}
              {company.website && (
                <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" aria-label={`Website öffnen: ${company.website}`} className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-blue-600 group-hover:underline truncate">{company.website}</p>
                      <ProvenanceBadge provenance={getFieldProvenance(company, 'website')} />
                    </div>
                    <p className="text-xs text-slate-500">Website</p>
                  </div>
                </a>
              )}
              {company.assigned_to && (
                <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{company.assigned_to}</p>
                    <p className="text-xs text-slate-500">Zuständiger Vertriebler</p>
                  </div>
                </div>
              )}
              {company.aktueller_dienstleister && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Aktueller Dienstleister (Konkurrenz)</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <span className="text-sm font-semibold text-amber-800">🏢 {company.aktueller_dienstleister}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notizen */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-3">
              <MessageSquare className="w-3.5 h-3.5" /> Notizen
            </h3>
            <textarea
              value={notizen}
              onChange={e => setNotizen(e.target.value)}
              rows={4}
              placeholder="Notizen, Beobachtungen, interne Hinweise…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent resize-none shadow-sm"
            />
            {notizen !== (company.notizen || "") && (
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" onClick={handleSaveNotizen} disabled={notizenSaving} className="flex-1">
                  {notizenSaving ? "Speichert..." : "Speichern"}
                </Button>
                <span className="text-xs text-slate-500">
                  {notizenSaving ? "Wird gespeichert…" : "Ungespeicherte Änderung"}
                </span>
              </div>
            )}
          </div>

          {/* Unified Activity Feed */}
          {orgId && (
            <UnifiedActivityFeed
              companyId={id}
              organizationId={orgId}
              onAddLog={() => setShowAddLog(true)}
              onAddTask={() => setShowAddTask(true)}
            />
          )}
        </div>

        {/* ── RECHTE SPALTE: Nächste beste Aktion + Aufgaben + Engine ── */}
        <div className="space-y-4">

          {/* Verkaufschancen */}
          <OpportunitySection company={company} organizationId={orgId} />

          {/* Ansprechpartner */}
          <ContactsSection company={company} organizationId={orgId} />

          {/* Warum dieser Lead? */}
          <RelevanceSection company={company} learnedSignals={learnedSignals} />

          {/* Aufgaben / Nächste Aktionen */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Nächste Schritte
              </h3>
              <Button variant="outline" size="sm" onClick={() => setShowAddTask(true)} className="h-7 text-xs gap-1 bg-white border-slate-200">
                <Plus className="w-3 h-3" /> Aufgabe
              </Button>
            </div>
            <div className="space-y-2">
              {openTasks.length > 0 ? (
                openTasks.slice(0, 5).map(task => {
                  const isOverdue = task.faellig_am && moment(task.faellig_am).isBefore(moment());
                  const isDueToday = task.faellig_am && moment(task.faellig_am).isSame(moment(), 'day');
                  return (
                    <div key={task.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${
                      isOverdue ? "bg-red-50 border-red-200" : isDueToday ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"
                    }`}>
                      <button onClick={() => toggleTask(task)} className="flex-shrink-0 mt-0.5">
                        {task.erledigt
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          : <Circle className={`w-4 h-4 ${isOverdue ? "text-red-500" : isDueToday ? "text-amber-500" : "text-slate-300"}`} />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${isOverdue ? "text-red-900" : "text-slate-900"}`}>{task.titel}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {task.typ && <span className="text-[10px] text-slate-500">{task.typ}</span>}
                          {task.faellig_am && (
                            <span className={`text-[10px] font-semibold ${isOverdue ? "text-red-600" : isDueToday ? "text-amber-600" : "text-slate-500"}`}>
                              {isOverdue ? "⚠ Überfällig: " : isDueToday ? "Heute: " : ""}{moment(task.faellig_am).format("DD.MM.")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-5">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-1" />
                  <p className="text-sm font-medium text-slate-600">Alle Aufgaben erledigt</p>
                </div>
              )}
            </div>
          </div>

          {/* Vertriebo KI / Engine */}
          <EngineBox
            company={company}
            contactLogs={contactLogs}
            tasks={tasks}
            orgId={orgId}
            onEnrich={handleEnrich}
            onAddTask={(nextBestAction) => {
              const TYPE_MAP = { call: "Rückruf", research: "Nachfassen", enrich: "Nachfassen", task: "Rückruf" };
              setTaskDraft({
                titel: nextBestAction?.title || "",
                beschreibung: nextBestAction?.reason || "",
                typ: TYPE_MAP[nextBestAction?.type] || "Rückruf",
                prioritaet: "Hoch",
                faellig_am: "",
              });
              setShowAddTask(true);
            }}
            onReanalyze={async () => { await loadData(); }}
          />
        </div>
      </div>

      {/* ── DIALOGE ── */}
      <Dialog open={showSonstigesDialog} onOpenChange={setShowSonstigesDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" /> Sonstiges – Notiz erfassen
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 -mt-1">{company?.name}</p>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs font-semibold mb-1 block">Was kam beim Anruf raus?</Label>
              <textarea
                value={sonstigesNotiz}
                onChange={e => setSonstigesNotiz(e.target.value)}
                placeholder="z.B. Möchten nur eine E-Mail mit Kontaktdaten..."
                rows={4} autoFocus
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSonstigesDialog(false)} className="text-sm px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50">Abbrechen</button>
              <button onClick={handleSonstigesSubmit} disabled={sonstigesSaving || !sonstigesNotiz.trim()}
                className="text-sm px-4 py-1.5 rounded-md bg-blue-600 text-white font-semibold disabled:opacity-50">
                {sonstigesSaving ? "Speichert..." : "Speichern"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddContactLogDialog open={showAddLog} onClose={() => setShowAddLog(false)} companyId={id} companyName={company.name} onCreated={loadData} organizationId={orgId} />
      <AddTaskDialog open={showAddTask} onClose={() => { setShowAddTask(false); setTaskDraft(null); }} companyId={id} companyName={company.name} onCreated={loadData} initialData={taskDraft} organizationId={orgId} />

      <Dialog open={showBlacklistConfirm} onOpenChange={setShowBlacklistConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Ban className="w-4 h-4 text-amber-600" /> Auf Blacklist setzen?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600"><strong>{company?.name}</strong> wird auf die Blacklist gesetzt und als „Verloren" markiert.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowBlacklistConfirm(false)}>Abbrechen</Button>
            <Button onClick={handleBlacklist} className="bg-amber-600 hover:bg-amber-700 text-white">Blacklist setzen</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Trash2 className="w-4 h-4 text-red-600" /> Firma löschen?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600"><strong>{company?.name}</strong> wird dauerhaft gelöscht.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Abbrechen</Button>
            <Button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Endgültig löschen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}