import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { VertrieboDialog, VertrieboInput, VertrieboTextarea, DialogActions } from "@/components/VertrieboDialog";
import { Button } from "@/components/ui/button";
import MobileSelect from "@/components/MobileSelect";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

const TYPES = ["Anruf", "E-Mail", "Besuch", "Termin", "Angebot", "Sonstiges"];
const RESULTS = ["Erreicht", "Nicht erreicht", "Rückruf vereinbart", "Termin vereinbart", "Angebot gesendet", "Abgeschlossen", "Kein Interesse"];

// After these outcomes, a callback date is required
const REQUIRES_CALLBACK = ["Erreicht", "Nicht erreicht", "Rückruf vereinbart"];
// These mark the lead as "done" - no callback needed
const CLOSED_OUTCOMES = ["Abgeschlossen", "Kein Interesse"];

export default function AddContactLogDialog({ open, onClose, companyId, companyName, onCreated, organizationId }) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    typ: "Anruf",
    ergebnis: "",
    naechster_schritt: "",
    rueckruf_datum: "",
    notiz: "",
    kontakt_person: "",
  });

  const needsCallback = REQUIRES_CALLBACK.includes(form.ergebnis) && !CLOSED_OUTCOMES.includes(form.ergebnis);
  const isClosed = CLOSED_OUTCOMES.includes(form.ergebnis);

  const validate = () => {
    const e = {};
    if (!form.ergebnis) e.ergebnis = "Pflichtfeld: Ergebnis muss gewählt werden";
    if (!form.naechster_schritt.trim()) e.naechster_schritt = "Pflichtfeld: Nächster Schritt muss angegeben werden";
    if (needsCallback && !form.rueckruf_datum) e.rueckruf_datum = "Pflichtfeld: Rückrufdatum muss gesetzt werden";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }

    setLoading(true);
    const me = await base44.auth.me();
    const orgId = organizationId;

    if (!orgId) {
      toast.error("Kein Org-Kontext – bitte Seite neu laden");
      setLoading(false);
      return;
    }

    await base44.entities.ContactLog.create({
      ...form,
      organization_id: orgId,
      company_id: companyId,
      user_email: me.email,
      rueckruf_datum: form.rueckruf_datum ? new Date(form.rueckruf_datum).toISOString() : null,
    });

    // Auto-update company status based on outcome
    const statusMap = {
      "Rückruf vereinbart": "Rückruf",
      "Termin vereinbart": "Termin",
      "Angebot gesendet": "Angebot",
      "Abgeschlossen": "Gewonnen",
      "Kein Interesse": "Verloren",
      "Erreicht": "Kontakt",
      "Nicht erreicht": "Rückruf",
    };
    const newStatus = statusMap[form.ergebnis];
    if (newStatus) {
      await base44.entities.Company.update(companyId, {
        status: newStatus,
        last_contact_date: new Date().toISOString(),
      });
    }

    // Auto-create callback task if needed
    if (needsCallback && form.rueckruf_datum) {
      await base44.entities.Task.create({
        organization_id: orgId,
        company_id: companyId,
        company_name: companyName,
        titel: form.ergebnis === "Rückruf vereinbart"
          ? `Rückruf: ${companyName}`
          : `Nachfassen: ${companyName}`,
        typ: "Rückruf",
        prioritaet: "Hoch",
        faellig_am: new Date(form.rueckruf_datum).toISOString(),
        erledigt: false,
        assigned_to: me.email,
      });
    }

    toast.success("Kontakt dokumentiert");
    setForm({ typ: "Anruf", ergebnis: "", naechster_schritt: "", rueckruf_datum: "", notiz: "", kontakt_person: "" });
    setErrors({});
    setLoading(false);
    onClose();
    onCreated?.();
  };

  const fieldError = (field) => errors[field] ? (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertCircle className="w-3 h-3" /> {errors[field]}
    </p>
  ) : null;

  return (
    <VertrieboDialog 
      open={open} 
      onClose={onClose} 
      title="Kontakt dokumentieren"
      description={companyName}
    >
      {/* Pflichtfeld-Hinweis */}
      <div style={{
        background: 'rgba(245,158,11,0.08)',
        border: `1px solid rgba(245,158,11,0.2)`,
        borderRadius: '10px',
        padding: '12px 14px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <AlertCircle size={16} color="#EA580C" />
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#EA580C' }}>
          Alle markierten Felder sind Pflicht – keine Ausnahmen!
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">Kontaktart</label>
          <MobileSelect
            value={form.typ}
            onValueChange={v => setForm(p => ({ ...p, typ: v }))}
            options={TYPES.map(t => ({ value: t, label: t }))}
            placeholder="Kontaktart"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1">
            Ergebnis <span className="text-red-500">*</span>
          </label>
          <MobileSelect
            value={form.ergebnis}
            onValueChange={v => { setForm(p => ({ ...p, ergebnis: v })); setErrors(p => ({...p, ergebnis: null})); }}
            options={RESULTS.map(r => ({ value: r, label: r }))}
            placeholder="Ergebnis wählen..."
            triggerClassName={errors.ergebnis ? "border-destructive" : ""}
          />
          {fieldError("ergebnis")}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1">
            Nächster Schritt <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {["Erneut anrufen", "Angebot senden", "Termin bestätigen", "Kein Interesse – kein Nachfassen", "In 3 Monaten nochmal"].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => { setForm(p => ({ ...p, naechster_schritt: v })); setErrors(p => ({...p, naechster_schritt: null})); }}
                style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  border: form.naechster_schritt === v 
                    ? '1px solid #2563EB' 
                    : '1px solid #CBD5E1',
                  background: form.naechster_schritt === v 
                    ? '#2563EB' 
                    : '#F8FAFC',
                  color: form.naechster_schritt === v 
                    ? 'white' 
                    : '#1E293B',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (form.naechster_schritt !== v) {
                    e.target.style.borderColor = '#2563EB';
                    e.target.style.background = '#EFF6FF';
                    e.target.style.color = '#1D4ED8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (form.naechster_schritt !== v) {
                    e.target.style.borderColor = '#CBD5E1';
                    e.target.style.background = '#F8FAFC';
                    e.target.style.color = '#1E293B';
                  }
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <VertrieboInput
            value={form.naechster_schritt}
            onChange={e => { setForm(p => ({ ...p, naechster_schritt: e.target.value })); setErrors(p => ({...p, naechster_schritt: null})); }}
            placeholder="Oder eigenen Text eingeben..."
            error={errors.naechster_schritt}
            required
          />
        </div>

        {!isClosed && (
          <VertrieboInput
            label={
              <span className="flex items-center gap-1">
                Rückruf am {needsCallback && <span className="text-red-500">*</span>}
                {!needsCallback && <span className="text-xs text-slate-600 font-normal">(optional)</span>}
              </span>
            }
            type="datetime-local"
            value={form.rueckruf_datum}
            onChange={e => { setForm(p => ({ ...p, rueckruf_datum: e.target.value })); setErrors(p => ({...p, rueckruf_datum: null})); }}
            error={errors.rueckruf_datum}
            required={needsCallback}
          />
        )}

        <VertrieboInput
          label="Kontaktperson"
          value={form.kontakt_person}
          onChange={e => setForm(p => ({ ...p, kontakt_person: e.target.value }))}
          placeholder="Name"
        />

        <VertrieboTextarea
          label="Notiz / Details"
          value={form.notiz}
          onChange={e => setForm(p => ({ ...p, notiz: e.target.value }))}
          placeholder="Was wurde besprochen?"
          rows={3}
        />

        <DialogActions>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Speichern..." : "Dokumentieren"}
          </Button>
        </DialogActions>
      </div>
    </VertrieboDialog>
  );
}