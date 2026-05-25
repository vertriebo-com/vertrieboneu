import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { VertrieboDialog, VertrieboInput, VertrieboTextarea, DialogActions } from "@/components/VertrieboDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const TYPES = ["Rückruf", "Termin", "Angebot erstellen", "Nachfassen", "Sonstiges"];
const PRIORITIES = ["Hoch", "Mittel", "Niedrig"];

export default function AddTaskDialog({ open, onClose, companyId, companyName, onCreated, initialData, organizationId }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    titel: "",
    beschreibung: "",
    typ: "Rückruf",
    prioritaet: "Mittel",
    faellig_am: "",
  });

  // Prefill from initialData (e.g. nextBestAction from EngineBox)
  useEffect(() => {
    if (open && initialData) {
      setForm(prev => ({
        ...prev,
        titel: initialData.titel || prev.titel,
        beschreibung: initialData.beschreibung || prev.beschreibung,
        typ: initialData.typ || prev.typ,
        prioritaet: initialData.prioritaet || prev.prioritaet,
        faellig_am: initialData.faellig_am || prev.faellig_am,
      }));
    }
    if (!open) {
      setForm({ titel: "", beschreibung: "", typ: "Rückruf", prioritaet: "Mittel", faellig_am: "" });
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    if (!form.titel.trim()) { toast.error("Bitte Titel eingeben"); return; }
    setLoading(true);
    const me = await base44.auth.me();
    const orgId = organizationId;

    if (!orgId) {
      toast.error("Kein Org-Kontext – bitte Seite neu laden");
      setLoading(false);
      return;
    }

    await base44.entities.Task.create({
      ...form,
      organization_id: orgId,
      company_id: companyId,
      company_name: companyName,
      assigned_to: me.email,
      faellig_am: form.faellig_am ? new Date(form.faellig_am).toISOString() : null,
    });
    toast.success("Aufgabe erstellt");
    setForm({ titel: "", beschreibung: "", typ: "Rückruf", prioritaet: "Mittel", faellig_am: "" });
    setLoading(false);
    onClose();
    onCreated?.();
  };

  return (
    <VertrieboDialog 
      open={open} 
      onClose={onClose} 
      title="Neue Aufgabe"
      description={companyName}
    >
      <div className="space-y-4">
        <VertrieboInput
          label="Titel"
          value={form.titel}
          onChange={e => setForm(p => ({ ...p, titel: e.target.value }))}
          placeholder="z.B. Rückruf nächste Woche"
          required
        />
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">Typ</label>
            <Select value={form.typ} onValueChange={v => setForm(p => ({ ...p, typ: v }))}>
              <SelectTrigger className="bg-white text-slate-900 border-slate-300"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">
                {TYPES.map(t => <SelectItem key={t} value={t} className="text-slate-900">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">Priorität</label>
            <Select value={form.prioritaet} onValueChange={v => setForm(p => ({ ...p, prioritaet: v }))}>
              <SelectTrigger className="bg-white text-slate-900 border-slate-300"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">
                {PRIORITIES.map(p => <SelectItem key={p} value={p} className="text-slate-900">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <VertrieboInput
          label="Fällig am"
          type="datetime-local"
          value={form.faellig_am}
          onChange={e => setForm(p => ({ ...p, faellig_am: e.target.value }))}
        />
        
        <VertrieboTextarea
          label="Beschreibung"
          value={form.beschreibung}
          onChange={e => setForm(p => ({ ...p, beschreibung: e.target.value }))}
          placeholder="Optional: Details zur Aufgabe..."
          rows={2}
        />
        
        <DialogActions>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Speichern..." : "Erstellen"}
          </Button>
        </DialogActions>
      </div>
    </VertrieboDialog>
  );
}