import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, ArrowLeft, Copy, ExternalLink, CheckCircle2, Loader2, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { TEMPLATES, dbTemplateToRuntimeTemplate, buildSignature } from "./emailTemplates";

// Strip HTML tags for plain-text copy / mailto
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Email Editor ─────────────────────────────────────────────────────────────
function EmailEditor({ tpl, company, orgId, fromName, orgSettings, onBack, onDone }) {
  const [datum, setDatum] = useState("");
  const [uhrzeit, setUhrzeit] = useState("");
  const [notiz, setNotiz] = useState("");
  const [betreff, setBetreff] = useState(tpl.betreff(company));
  const [bodyHtml, setBodyHtml] = useState(() => tpl.body(company, { orgSettings }));
  const [bodyPlain, setBodyPlain] = useState(() => stripHtml(tpl.body(company, { orgSettings })));
  const [copied, setCopied] = useState(false);
  const [documenting, setDocumenting] = useState(false);
  const [createFollowup, setCreateFollowup] = useState(true);

  useEffect(() => {
    const html = tpl.body(company, { datum, uhrzeit, notiz, orgSettings });
    setBodyHtml(html);
    setBodyPlain(stripHtml(html));
  }, [datum, uhrzeit, notiz]);

  const handleCopy = () => {
    const text = `Betreff: ${betreff}\n\n${bodyPlain}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("E-Mail-Text kopiert! Jetzt in Ihr E-Mail-Programm einfügen.");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleMailto = () => {
    const mailto = `mailto:${company.email}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(bodyPlain)}`;
    window.open(mailto, "_blank");
  };

  const handleDocument = async () => {
    if (!orgId) {
      toast.error("Kein Org-Kontext – bitte Seite neu laden");
      return;
    }
    // Guard: Company muss zur selben Org gehören
    if (company?.organization_id && company.organization_id !== orgId) {
      toast.error("Org-Kontext stimmt nicht überein – Aktion abgebrochen");
      return;
    }
    setDocumenting(true);
    try {
      const me = await base44.auth.me();
      const orgIdForLog = orgId;
      await base44.entities.ContactLog.create({
        organization_id: orgIdForLog,
        company_id: company.id,
        typ: "E-Mail",
        ergebnis: "Manuell vorbereitet/gesendet",
        naechster_schritt: `E-Mail vorbereitet: ${betreff}`,
        notiz: `E-Mail wurde vorbereitet und manuell über das eigene E-Mail-Programm versendet. Vorlage: ${tpl.label}.`,
        user_email: me.email,
        betreff: betreff,
        sending_mode: "manual_email_client",
        is_manual: true,
        is_test_email: false,
      });

      // Increment manual_emails_logged in UsageLog (not emails_sent — no auto-send happened)
      // KANONISCH: period_month via Europe/Berlin – identisch zu processResearchRun / getDashboardData
      const periodMonth = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
      }).format(new Date()).split('.').reverse().join('-');
      const [py, pm] = periodMonth.split('-').map(Number);
      const periodStart = new Date(Date.UTC(py, pm - 1, 1)).toISOString();
      const periodEnd   = new Date(Date.UTC(py, pm, 0, 23, 59, 59)).toISOString();
      const existingUsage = await base44.entities.UsageLog.filter({ organization_id: orgIdForLog, period_month: periodMonth });
      if (existingUsage.length > 0) {
        await base44.entities.UsageLog.update(existingUsage[0].id, {
          manual_emails_logged: (existingUsage[0].manual_emails_logged || 0) + 1,
        });
      } else {
        await base44.entities.UsageLog.create({
          organization_id: orgIdForLog,
          period_month: periodMonth,
          period_start: periodStart,
          period_end: periodEnd,
          manual_emails_logged: 1,
        });
      }

      // Update last_contact_date on company – erst DB-seitig validieren
      const allowed = await base44.entities.Company.filter({ id: company.id, organization_id: orgIdForLog });
      if (!allowed?.[0]) {
        toast.error("Org-Kontext stimmt nicht überein – Company-Update abgebrochen");
        return;
      }
      await base44.entities.Company.update(company.id, {
        last_contact_date: new Date().toISOString(),
      });

      // Optional: Follow-up-Aufgabe erstellen (nur wenn keine offene Nachfassen-Task existiert)
      if (createFollowup) {
        const existingTasks = await base44.entities.Task.filter({ company_id: company.id, organization_id: orgIdForLog });
        const hasOpenFollowup = existingTasks.some(t =>
          !t.erledigt && (t.typ === 'Nachfassen' || (t.titel || '').toLowerCase().includes('nachfassen'))
        );
        if (!hasOpenFollowup) {
          // 3 Werktage voraus berechnen
          const due = new Date();
          let daysAdded = 0;
          while (daysAdded < 3) {
            due.setDate(due.getDate() + 1);
            const day = due.getDay();
            if (day !== 0 && day !== 6) daysAdded++; // Wochenenden überspringen
          }
          await base44.entities.Task.create({
            organization_id: orgIdForLog,
            company_id: company.id,
            company_name: company.name,
            titel: `E-Mail nachfassen – ${betreff}`,
            beschreibung: `Follow-up zur E-Mail (Vorlage: ${tpl.label})`,
            typ: 'Nachfassen',
            prioritaet: 'Mittel',
            faellig_am: due.toISOString(),
            erledigt: false,
            assigned_to: me.email,
          });
          toast.success("Kontakt dokumentiert + Follow-up-Aufgabe erstellt ✓");
        } else {
          toast.success("Kontakt dokumentiert ✓ (Follow-up-Aufgabe bereits vorhanden)");
        }
      } else {
        toast.success("Kontakt dokumentiert ✓");
      }
      onDone();
    } catch (e) {
      toast.error("Fehler beim Dokumentieren: " + e.message);
    } finally {
      setDocumenting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline self-start font-medium"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Vorlage wechseln
      </button>

      {/* Betreff */}
      <div>
        <Label className="text-xs mb-1.5 block font-semibold text-slate-700">Betreff</Label>
        <Input
          value={betreff}
          onChange={e => setBetreff(e.target.value)}
          className="text-sm bg-white border-slate-200 text-slate-900"
        />
      </div>

      {/* Datum / Uhrzeit (nur wenn Vorlage es braucht) */}
      {(tpl.hasDatum || tpl.hasUhrzeit) && (
        <div className="flex gap-3">
          {tpl.hasDatum && (
            <div className="flex-1">
              <Label className="text-xs mb-1.5 block font-semibold text-slate-700">Datum</Label>
              <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="text-sm bg-white border-slate-200 text-slate-900" />
            </div>
          )}
          {tpl.hasUhrzeit && (
            <div className="flex-1">
              <Label className="text-xs mb-1.5 block font-semibold text-slate-700">Uhrzeit</Label>
              <Input type="time" value={uhrzeit} onChange={e => setUhrzeit(e.target.value)} className="text-sm bg-white border-slate-200 text-slate-900" />
            </div>
          )}
        </div>
      )}

      {/* Persönliche Ergänzung */}
      <div>
        <Label className="text-xs mb-1.5 block font-semibold text-slate-800">
          Persönliche Ergänzung <span className="font-normal text-slate-500">(optional)</span>
        </Label>
        <Input
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          placeholder="z.B. Bezug auf unser Gespräch..."
          className="text-sm bg-white border-slate-300 text-slate-900 placeholder:text-slate-500"
        />
      </div>

      {/* Textvorschau */}
      <div>
        <Label className="text-xs mb-1.5 block font-semibold text-slate-700">E-Mail-Text</Label>
        <textarea
          value={bodyPlain}
          onChange={e => setBodyPlain(e.target.value)}
          rows={9}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 resize-none"
        />
      </div>

      {/* Empfänger-Info */}
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <Mail className="w-3.5 h-3.5 shrink-0" />
        <span>An:</span>
        <span className="font-semibold text-slate-900">{company.email}</span>
        {fromName && (
          <>
            <span className="text-slate-300">|</span>
            <span>Von: <span className="font-semibold text-slate-900">{fromName}</span></span>
          </>
        )}
      </div>

      {/* Follow-up Checkbox */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
        <input
          type="checkbox"
          checked={createFollowup}
          onChange={e => setCreateFollowup(e.target.checked)}
          className="w-4 h-4 accent-blue-600 cursor-pointer"
        />
        <div>
          <span className="text-sm font-semibold text-blue-900">Follow-up-Aufgabe in 3 Werktagen erstellen</span>
          <p className="text-[11px] text-blue-700 mt-0.5">Wird nur erstellt wenn noch keine offene Nachfassen-Aufgabe existiert.</p>
        </div>
        <CalendarPlus className="w-4 h-4 text-blue-500 shrink-0 ml-auto" />
      </label>

      {/* Actions */}
      <div className="border-t border-slate-200 pt-4 space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="w-full gap-2 h-9 bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          {copied
            ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Kopiert!</>
            : <><Copy className="w-3.5 h-3.5" /> E-Mail-Text kopieren</>
          }
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleMailto}
          disabled={!company.email}
          className="w-full gap-2 h-9 bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="w-3.5 h-3.5" /> In E-Mail-Programm öffnen
        </Button>

        <Button
          onClick={handleDocument}
          disabled={documenting}
          className="w-full gap-2 h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {documenting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird dokumentiert...</>
            : <><CheckCircle2 className="w-4 h-4" /> Als Kontakt dokumentieren</>
          }
        </Button>

        <p className="text-center text-[10px] text-slate-400 pt-1">
          Kopieren Sie den Text und senden Sie ihn aus Ihrem eigenen E-Mail-Programm.
        </p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SendEmailDialog({ company, organizationId }) {
  const [open, setOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [fromName, setFromName] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [orgLoaded, setOrgLoaded] = useState(false);
  const [runtimeTemplates, setRuntimeTemplates] = useState(TEMPLATES);
  const [orgSettings, setOrgSettings] = useState(null);
  const hasEmail = !!company?.email;

  useEffect(() => {
    if (open && !orgLoaded && organizationId) {
      (async () => {
        const user = await base44.auth.me();
        setOrgId(organizationId);

        const [settings, dbTemplates] = await Promise.all([
          base44.entities.OrganizationSettings.filter({ organization_id: organizationId }),
          base44.entities.EmailTemplate.filter({ organization_id: organizationId }),
        ]);

        const map = {};
        settings.forEach(s => { map[s.key] = s.value; });
        setFromName(map.email_from_name || map.company_name || null);
        setOrgSettings({
          services: map.services || map.dienstleistungen || '',
          targetCustomerTypes: map.target_customer_types || map.zielkunden || '',
          industryName: map.industry_name || '',
          logoUrl: map.email_logo_url || '',
        });

        // Canonical Keys bevorzugen, Legacy-Fallbacks für Rückwärtskompatibilität
        const sig = map.organization_email_signature || buildSignature({
          firmenname: map.company_name || null,
          absendername: map.email_from_name,
          telefon: map.email_telefon || map.phone,
          email: map.email_reply_to || map.email_sender_email || user.email,
          website: map.email_website || map.website,
          adresse: map.email_adresse || map.address,
        });

        if (dbTemplates?.length > 0) {
          setRuntimeTemplates(dbTemplates.map(t => dbTemplateToRuntimeTemplate(t, sig)));
        }

        setOrgLoaded(true);
      })();
    }
  }, [open]);

  const handleClose = () => { setOpen(false); setSelectedTemplate(null); };

  return (
    <>
      <button
        onClick={() => hasEmail ? setOpen(true) : toast.error("Keine E-Mail-Adresse hinterlegt")}
        title={hasEmail ? company.email : "Keine E-Mail vorhanden"}
        className="inline-flex items-center gap-1.5 h-9 text-sm font-semibold border border-slate-200 bg-white text-slate-800 px-3 rounded-lg hover:bg-slate-50 transition-colors"
      >
        <Mail className="w-3.5 h-3.5" /> E-Mail vorbereiten
      </button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[92vh] flex flex-col overflow-hidden bg-white border border-slate-200 shadow-xl rounded-2xl p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base text-slate-900">
              <Mail className="w-4 h-4 text-blue-600" />
              E-Mail an {company.name}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 px-6 pb-8">
            {!selectedTemplate ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-slate-500 font-medium mb-3">Vorlage auswählen:</p>
                {runtimeTemplates.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl)}
                    className="w-full text-left px-4 py-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-all group"
                  >
                    <div className="font-semibold text-sm text-slate-900 group-hover:text-blue-700">{tpl.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{tpl.description}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="pt-1">
                <EmailEditor
                  tpl={selectedTemplate}
                  company={company}
                  orgId={orgId}
                  fromName={fromName}
                  orgSettings={orgSettings}
                  onBack={() => setSelectedTemplate(null)}
                  onDone={handleClose}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}