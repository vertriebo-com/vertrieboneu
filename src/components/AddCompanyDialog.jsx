import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { VertrieboDialog, VertrieboInput, VertrieboTextarea, DialogActions } from "@/components/VertrieboDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

const EMPTY_FORM = {
  name: "", branche: "", adresse: "", plz: "", ort: "",
  telefon: "", email: "", website: "", ansprechpartner: "",
  notizen: "", status: "Neu", quelle: "Manuell",
};

export default function AddCompanyDialog({ open, onClose, onCreated, organizationId }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [duplicateWarning, setDuplicateWarning] = useState("");

  const handleChange = async (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === "name" && value.trim().length >= 3) {
      // Duplicate check ist immer org-scoped
      const filter = organizationId
        ? { organization_id: organizationId, name: value.trim() }
        : { name: value.trim() };
      const existing = await base44.entities.Company.filter(filter);
      setDuplicateWarning(existing.length > 0 ? `⚠️ "${value.trim()}" existiert bereits!` : "");
    } else if (field === "name") {
      setDuplicateWarning("");
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Bitte Firmennamen eingeben");
      return;
    }
    setLoading(true);

    const me = await base44.auth.me();
    const orgId = organizationId;
    if (!orgId) { toast.error("Keine Organisation gefunden."); setLoading(false); return; }

    // Dublettencheck (nur innerhalb der Org)
    const existing = await base44.entities.Company.filter({ organization_id: orgId, name: form.name.trim() });
    if (existing.length > 0) {
      toast.error("Diese Firma existiert bereits!");
      setLoading(false);
      return;
    }

    // Blacklist check (nur innerhalb der Org)
    const blacklisted = await base44.entities.Blacklist.filter({ organization_id: orgId, firmenname: form.name.trim() });
    if (blacklisted.length > 0) {
      toast.error("Diese Firma ist auf der Blacklist!");
      setLoading(false);
      return;
    }

    await base44.entities.Company.create({ ...form, organization_id: orgId, assigned_to: me.email });

    toast.success("Firma erstellt");
    setForm(EMPTY_FORM);
    setDuplicateWarning("");
    setLoading(false);
    onClose();
    onCreated?.();
  };

  return (
    <VertrieboDialog 
      open={open} 
      onClose={onClose} 
      title="Neue Firma anlegen"
      description="Fügen Sie einen neuen Firmenkontakt hinzu"
    >
      <div className="space-y-4">
        <VertrieboInput
          label="Firmenname"
          value={form.name}
          onChange={e => handleChange("name", e.target.value)}
          placeholder="Firma GmbH"
          error={duplicateWarning}
          required
        />
        
        <div className="grid grid-cols-2 gap-3">
          <VertrieboInput
            label="Branche"
            value={form.branche}
            onChange={e => handleChange("branche", e.target.value)}
            placeholder="z.B. Einzelhandel"
          />
          <VertrieboInput
            label="Ansprechpartner"
            value={form.ansprechpartner}
            onChange={e => handleChange("ansprechpartner", e.target.value)}
            placeholder="Max Mustermann"
          />
        </div>
        
        <VertrieboInput
          label="Adresse"
          value={form.adresse}
          onChange={e => handleChange("adresse", e.target.value)}
          placeholder="Musterstr. 1"
        />
        
        <div className="grid grid-cols-2 gap-3">
          <VertrieboInput
            label="PLZ"
            value={form.plz}
            onChange={e => handleChange("plz", e.target.value)}
            placeholder="56564"
          />
          <VertrieboInput
            label="Ort"
            value={form.ort}
            onChange={e => handleChange("ort", e.target.value)}
            placeholder="Neuwied"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <VertrieboInput
            label="Telefon"
            value={form.telefon}
            onChange={e => handleChange("telefon", e.target.value)}
            placeholder="+49 2631 ..."
          />
          <VertrieboInput
            label="E-Mail"
            value={form.email}
            onChange={e => handleChange("email", e.target.value)}
            placeholder="info@firma.de"
          />
        </div>
        
        <VertrieboInput
          label="Website"
          value={form.website}
          onChange={e => handleChange("website", e.target.value)}
          placeholder="www.firma.de"
        />
        
        <VertrieboTextarea
          label="Notizen"
          value={form.notizen}
          onChange={e => handleChange("notizen", e.target.value)}
          placeholder="Anmerkungen..."
          rows={3}
        />
        
        <DialogActions>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Wird erstellt..." : "Erstellen"}
          </Button>
        </DialogActions>
      </div>
    </VertrieboDialog>
  );
}