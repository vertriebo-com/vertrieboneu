import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Phone, Mail, Ban, Trash2, Sparkles, MessageSquare,
  CheckCircle2, Circle, Calendar, AlertTriangle, Loader2, Target
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "../components/StatusBadge";
import CallScriptDialog from "../components/CallScriptDialog";
import EngineBox from "../components/lead-detail/EngineBox";
import AddContactLogDialog from "../components/AddContactLogDialog";
import AddTaskDialog from "../components/AddTaskDialog";
import SendEmailDialog from "../components/SendEmailDialog";
import OutcomeFeedback from "../components/lead-detail/OutcomeFeedback";
import RelevanceSection from "../components/lead-detail/RelevanceSection";
import ContactsSection from "../components/lead-detail/ContactsSection";
import CompanyInfoCard from "../components/lead-detail/CompanyInfoCard";
import NextBestActionCard from "../components/lead-detail/NextBestActionCard";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import moment from "moment";
import { isHotLead, isWarmLead } from "@/utils/leadTemperature";
import LifecycleStageBadge from "../components/lead-detail/LifecycleStageBadge";
import OpportunitySection from "../components/lead-detail/OpportunitySection";
import UnifiedActivityFeed from "../components/lead-detail/UnifiedActivityFeed";

function TemperatureBadge({ company }) {
  if (isHotLead(company)) return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">🔥 Heiß</span>
  );
  if (isWarmLead(company)) return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚡ Warm</span>
  );
  return null;
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [notizenDirty, setNotizenDirty] = useState(false);
  const [showSonstigesDialog, setShowSonstigesDialog] = useState(false);
  const [sonstigesNotiz, setSonstigesNotiz] = useState("");
  const [sonstigesSaving, setSonstigesSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBlacklistConfirm, setShowBlacklistConfirm] = useState(false);
  const [learnedSignals, setLearnedSignals] = useState(null);
  // Scroll to outcome feedback (mobile)
  const outcomeFeedbackRef = useRef(null);

  useEffect(() => {
    if (orgLoading) return;
    if (!orgId) { navigate("/"); return; }
    setCompany(null); setContactLogs([]); setTasks([]); setLearnedSignals(null); setLoading(true);
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
      if (!comp || comp.length === 0) { toast.error("Lead nicht gefunden"); navigate("/leads"); return; }
      const loadedCompany = comp[0];
      if (loadedCompany.organization_id && loadedCompany.organization_id !== orgId) {
        const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(currentUser?.role);
        if (!isPlatformAdmin) { toast.error("Kein Zugriff auf diesen Lead"); navigate("/leads"); return; }
      }
      const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(currentUser?.role);
      const isOwner = org?.owner_email === currentUser?.email;
      if (!isPlatformAdmin && !isOwner && loadedCompany.assigned_to && loadedCompany.assigned_to !== currentUser?.email) {
        toast.error("Dieses Lead ist einem anderen Vertriebler zugewiesen");
        navigate("/leads"); return;
      }
      setCompany(loadedCompany);
      setNotizen(loadedCompany.notizen || "");
      setNotizenDirty(false);
      setContactLogs(logs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setTasks(allTasks.sort((a, b) => new Date(a.faellig_am || 0) - new Date(b.faellig_am || 0)));
      setLoading(false);
    } catch (error) {
      console.error("Fehler beim Laden:", error);
      toast.error("Fehler beim Laden");
      navigate("/leads");
    }
  };

  const assertOrgMatch = () => {
    if (company?.organization_id && company.organization_id !== orgId) {
      const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(currentUser?.role);
      if (!isPlatformAdmin) { toast.error("Aktion nicht erlaubt: falscher Org-Kontext"); navigate("/leads"); return false; }
    }
    return true;
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

  const handleEnrich = async () => {
    if (!assertOrgMatch()) return;
    if (enrichingRef.current) return;
    enrichingRef.current = true; setEnriching(true);
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout nach 30 Sekunden")), 30000));
      const res = await Promise.race([
        base44.functions.invoke("enrichCompany", { companyId: id, organization_id: orgId }),
        timeoutPromise,
      ]);
      const data = res.data;
      if (data?.success === false) {
        toast.error("Anreichern fehlgeschlagen: " + (data?.error || "Unbekannter Fehler"));
      } else {
        const found = data?.found || 0;
        if (found > 0) {
          const enriched = [data?.telefon_added && "Telefon", data?.website_added && "Website", data?.adresse_added && "Adresse", data?.ansprechpartner_added && "Ansprechpartner"].filter(Boolean);
          toast.success(enriched.length > 0 ? enriched.join(", ") + " ergänzt" : `${found} Felder ergänzt`);
        } else {
          toast.info("Keine zusätzlichen Daten gefunden.");
        }
        loadData();
      }
    } catch (e) {
      toast.error("Anreichern fehlgeschlagen: " + (e?.message || "Unbekannter Fehler"));
    } finally {
      setEnriching(false); enrichingRef.current = false;
    }
  };

  const handleSaveNotizen = async () => {
    if (!assertOrgMatch()) return;
    setNotizenSaving(true);
    await base44.functions.invoke("updateCompanySafe", { company_id: id, patch: { notizen } });
    setCompany(prev => ({ ...prev, notizen }));
    setNotizenDirty(false);
    toast.success("Notiz gespeichert · " + moment().format("HH:mm"));
    setNotizenSaving(false);
  };

  const handleSonstigesSubmit = async () => {
    if (!assertOrgMatch()) return;
    setSonstigesSaving(true);
    await base44.functions.invoke("createContactLogSafe", {
      organization_id: orgId, company_id: id, typ: "Sonstiges", ergebnis: "Abgeschlossen",
      notiz: sonstigesNotiz, naechster_schritt: "Kunde meldet sich selbst",
    });
    await base44.functions.invoke("updateCompanySafe", { company_id: id, patch: { last_contact_date: new Date().toISOString() } });
    toast.success("Notiz gespeichert");
    setSonstigesSaving(false); setShowSonstigesDialog(false); setSonstigesNotiz(""); loadData();
  };

  const toggleTask = async (task) => {
    const nowDone = !task.erledigt;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, erledigt: nowDone } : t));
    await base44.functions.invoke("updateTaskSafe", { task_id: task.id, patch: { erledigt: nowDone } });
    toast.success(nowDone ? "Aufgabe erledigt ✓" : "Aufgabe wieder geöffnet");
  };

  const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(currentUser?.role);
  const isOwner = orgOwnerEmail !== null && currentUser?.email === orgOwnerEmail;
  const canUseAdminActions = isPlatformAdmin || isOwner;

  const openTasks = tasks.filter(t => !t.erledigt);
  const doneTasks = tasks.filter(t => t.erledigt);

  // Only show top banner if ALL contact channels missing
  const allContactMissing = !company?.telefon && !company?.email && !company?.website;

  if (orgLoading || loading) return <PageSkeleton />;

  if (!company) return (
    <div className="text-center py-16">
      <p className="text-slate-600">Firma nicht gefunden</p>
      <Link to="/leads"><Button variant="outline" className="mt-4">Zurück</Button></Link>
    </div>
  );

  return (
    <div className="space-y-4 pb-8">

      {/* ═══ 1. LEAD HERO HEADER ═══════════════════════════════════════ */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Farbstreifen */}
        <div className={`h-1 w-full ${isHotLead(company) ? "bg-gradient-to-r from-orange-400 to-red-500" : "bg-gradient-to-r from-blue-500 to-violet-500"}`} />

        <div className="p-4 sm:p-5">
          {/* Zurück */}
          <Link to="/leads" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors mb-3">
            <ArrowLeft className="w-4 h-4" /> Zurück zu Leads
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Firmenname + Meta */}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">{company.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-500">
                {company.branche && <span className="font-medium text-slate-700">{company.branche}</span>}
                {company.ort && <span>· {company.ort}</span>}
                {company.last_contact_date && (
                  <span className="text-xs">· Kontakt {moment(company.last_contact_date).fromNow()}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <StatusBadge status={company.status} />
                <TemperatureBadge company={company} />
                <LifecycleStageBadge
                  company={company} organizationId={orgId} canEdit={canUseAdminActions}
                  onChanged={(newStage) => { setCompany(prev => ({ ...prev, lifecycle_stage: newStage })); loadData(); }}
                />
              </div>
            </div>

            {/* Primäraktionen */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {company.telefon ? (
                <a href={`tel:${company.telefon}`} aria-label={`${company.name} anrufen`}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition-all">
                  <Phone className="w-4 h-4" /> Anrufen
                </a>
              ) : null}
              <SendEmailDialog company={company} organizationId={orgId} />
              <CallScriptDialog company={company} />
            </div>
          </div>

          {/* Sekundäraktionen */}
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
            <button onClick={() => setShowAddTask(true)}
              className="inline-flex items-center gap-1.5 h-8 text-xs font-semibold bg-white text-slate-700 border border-slate-200 px-3 rounded-xl hover:bg-slate-50 transition-colors">
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Aufgabe
            </button>
            <button onClick={() => setShowAddLog(true)}
              className="inline-flex items-center gap-1.5 h-8 text-xs font-semibold bg-white text-slate-700 border border-slate-200 px-3 rounded-xl hover:bg-slate-50 transition-colors">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" /> Kontakt
            </button>
            <button onClick={handleEnrich} disabled={enriching}
              className={`inline-flex items-center gap-1.5 h-8 text-xs font-semibold border px-3 rounded-xl transition-colors ${enriching ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
              {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-slate-400" />}
              {enriching ? "Läuft…" : "Daten ergänzen"}
            </button>
            {canUseAdminActions && (
              <div className="ml-auto flex items-center gap-1.5">
                <button onClick={() => setShowBlacklistConfirm(true)}
                  className="inline-flex items-center gap-1 h-8 text-xs font-semibold bg-white text-slate-500 border border-slate-200 px-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                  <Ban className="w-3 h-3" /> Blacklist
                </button>
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1 h-8 text-xs font-semibold bg-white text-red-600 border border-red-200 px-2.5 rounded-xl hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3 h-3" /> Löschen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kritisches Banner nur wenn ALLE Kanäle fehlen */}
      {allContactMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-2.5 flex-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Keine Kontaktdaten vorhanden</p>
              <p className="text-xs text-amber-700 mt-0.5">Telefon, E-Mail und Website fehlen – Kontaktaufnahme aktuell nicht möglich.</p>
            </div>
          </div>
          <button onClick={handleEnrich} disabled={enriching}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors shrink-0 disabled:opacity-60">
            {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Kontaktdaten suchen
          </button>
        </div>
      )}

      {/* ═══ 2-SPALTEN-LAYOUT ══════════════════════════════════════════ */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">

        {/* ── LINKE SPALTE ────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Firmendaten */}
          <CompanyInfoCard company={company} onEnrich={handleEnrich} />

          {/* Kontakte */}
          <ContactsSection company={company} organizationId={orgId} />

          {/* Interne Notizen */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Interne Notizen</p>
            </div>
            <div className="p-4">
              <textarea
                value={notizen}
                onChange={e => { setNotizen(e.target.value); setNotizenDirty(e.target.value !== (company.notizen || "")); }}
                rows={4}
                placeholder="Notizen, Beobachtungen, interne Hinweise…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent resize-none"
              />
              {notizenDirty && (
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" onClick={handleSaveNotizen} disabled={notizenSaving} className="gap-1.5">
                    {notizenSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {notizenSaving ? "Speichert…" : "Speichern"}
                  </Button>
                  <span className="text-xs text-slate-400">Ungespeicherte Änderung</span>
                </div>
              )}
            </div>
          </div>

          {/* Verlauf / ActivityFeed */}
          {orgId && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Verlauf</p>
              </div>
              <div className="p-1">
                <UnifiedActivityFeed
                  companyId={id}
                  organizationId={orgId}
                  onAddLog={() => setShowAddLog(true)}
                  onAddTask={() => setShowAddTask(true)}
                />
              </div>
            </div>
          )}

          {/* Aufgaben */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nächste Schritte</p>
                {openTasks.length > 0 && (
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{openTasks.length}</span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowAddTask(true)} className="h-7 text-xs gap-1 bg-white border-slate-200">
                <Calendar className="w-3 h-3" /> Aufgabe
              </Button>
            </div>
            <div className="p-3 space-y-2">
              {openTasks.length === 0 && doneTasks.length === 0 && (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-7 h-7 text-emerald-300 mx-auto mb-1" />
                  <p className="text-sm font-medium text-slate-500">Keine offenen Aufgaben</p>
                </div>
              )}
              {openTasks.map(task => {
                const isOverdue = task.faellig_am && moment(task.faellig_am).isBefore(moment());
                const isDueToday = task.faellig_am && moment(task.faellig_am).isSame(moment(), 'day');
                return (
                  <div key={task.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${isOverdue ? "bg-red-50 border-red-200" : isDueToday ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
                    <button onClick={() => toggleTask(task)} className="shrink-0 mt-0.5">
                      <Circle className={`w-4 h-4 ${isOverdue ? "text-red-400" : isDueToday ? "text-amber-400" : "text-slate-300"}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isOverdue ? "text-red-900" : "text-slate-900"}`}>{task.titel}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {task.typ && <span className="text-[10px] text-slate-400">{task.typ}</span>}
                        {task.faellig_am && (
                          <span className={`text-[10px] font-semibold ${isOverdue ? "text-red-600" : isDueToday ? "text-amber-600" : "text-slate-400"}`}>
                            {isOverdue ? "⚠ Überfällig: " : isDueToday ? "Heute: " : ""}{moment(task.faellig_am).format("DD.MM.")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Erledigte Aufgaben sekundär */}
              {doneTasks.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">Erledigt ({doneTasks.length})</p>
                  {doneTasks.slice(0, 3).map(task => (
                    <div key={task.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg opacity-50">
                      <button onClick={() => toggleTask(task)} className="shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </button>
                      <p className="text-xs text-slate-500 line-through">{task.titel}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Opportunity */}
          <OpportunitySection company={company} organizationId={orgId} />
        </div>

        {/* ── RECHTE SPALTE (sticky auf Desktop) ──────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">

          {/* NextBestActionCard */}
          <NextBestActionCard
            company={company}
            onCall={() => company.telefon && window.open(`tel:${company.telefon}`, '_self')}
            onAddTask={() => setShowAddTask(true)}
            onAddLog={() => setShowAddLog(true)}
            onEnrich={handleEnrich}
            onFeedback={() => outcomeFeedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          />

          {/* Warum dieser Lead? */}
          <RelevanceSection company={company} learnedSignals={learnedSignals} />

          {/* Outcome Feedback */}
          <div ref={outcomeFeedbackRef}>
            {orgId && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">War dieser Lead passend?</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Ihre Rückmeldung verbessert künftige Recherchen.</p>
                </div>
                <div className="p-3">
                  <OutcomeFeedback
                    companyId={id}
                    organizationId={orgId}
                    company={company}
                    onStatusSync={(newStatus) => setCompany(prev => ({ ...prev, status: newStatus }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Datenqualität (kompakt, nur wenn Lücken vorhanden) */}
          {(() => {
            const missing = [];
            if (!company.telefon) missing.push("Telefon");
            if (!company.email) missing.push("E-Mail");
            if (!company.ansprechpartner) missing.push("Ansprechpartner");
            if (!company.website) missing.push("Website");
            if (missing.length === 0) return null;
            return (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Datenqualität</p>
                </div>
                <div className="p-3 space-y-1.5">
                  {missing.map(m => (
                    <div key={m} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <p className="text-xs text-slate-600">{m} fehlt</p>
                    </div>
                  ))}
                  <button onClick={handleEnrich} disabled={enriching}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 h-8 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60">
                    {enriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Daten ergänzen
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Vertriebo KI / Engine */}
          <EngineBox
            company={company}
            contactLogs={contactLogs}
            tasks={tasks}
            orgId={orgId}
            onEnrich={handleEnrich}
            onAddTask={(nextBestAction) => {
              const TYPE_MAP = { call: "Rückruf", research: "Nachfassen", enrich: "Nachfassen", task: "Rückruf" };
              setTaskDraft({ titel: nextBestAction?.title || "", beschreibung: nextBestAction?.reason || "", typ: TYPE_MAP[nextBestAction?.type] || "Rückruf", prioritaet: "Hoch", faellig_am: "" });
              setShowAddTask(true);
            }}
            onReanalyze={async () => { await loadData(); }}
          />
        </div>
      </div>

      {/* ── DIALOGE ─────────────────────────────────────────────────────── */}
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
                placeholder="z.B. Möchten nur eine E-Mail mit Kontaktdaten…"
                rows={4} autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSonstigesDialog(false)} className="text-sm px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50">Abbrechen</button>
              <button onClick={handleSonstigesSubmit} disabled={sonstigesSaving || !sonstigesNotiz.trim()}
                className="text-sm px-4 py-1.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">
                {sonstigesSaving ? "Speichert…" : "Speichern"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddContactLogDialog open={showAddLog} onClose={() => setShowAddLog(false)} companyId={id} companyName={company.name} onCreated={loadData} organizationId={orgId} />
      <AddTaskDialog open={showAddTask} onClose={() => { setShowAddTask(false); setTaskDraft(null); }} companyId={id} companyName={company.name} onCreated={loadData} initialData={taskDraft} organizationId={orgId} />

      <Dialog open={showBlacklistConfirm} onOpenChange={setShowBlacklistConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-slate-900"><Ban className="w-4 h-4 text-amber-600" /> Auf Blacklist setzen?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600"><strong>{company?.name}</strong> wird auf die Blacklist gesetzt und als „Verloren" markiert.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowBlacklistConfirm(false)}>Abbrechen</Button>
            <Button onClick={handleBlacklist} className="bg-amber-600 hover:bg-amber-700 text-white">Blacklist setzen</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-slate-900"><Trash2 className="w-4 h-4 text-red-600" /> Firma löschen?</DialogTitle></DialogHeader>
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