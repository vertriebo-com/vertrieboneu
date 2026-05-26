/**
 * AddContactDialog
 * ================
 * Dialog zum Anlegen/Bearbeiten eines Ansprechpartners.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function AddContactDialog({ open, onClose, organizationId, companyId, onSaved, initialContact = null }) {
  const [form, setForm] = useState(initialContact || {
    name: '', first_name: '', last_name: '', role: '', department: '',
    email: '', phone: '', mobile: '', notes: '',
    is_primary: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const setCheck = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.checked }));

  const handleSave = async () => {
    if (!form.name && !form.email) {
      setError('Bitte Name oder E-Mail angeben.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await base44.functions.invoke('upsertContact', {
        org_id: organizationId,
        company_id: companyId,
        contact: {
          ...form,
          source_type: 'manual',
          confidence: 'high',
          review_status: 'confirmed',
        },
      });
      onSaved();
    } catch (e) {
      setError(e.message || 'Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-900">
            {initialContact ? 'Kontakt bearbeiten' : 'Ansprechpartner hinzufügen'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Vorname</Label>
              <Input value={form.first_name} onChange={set('first_name')} placeholder="Max" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Nachname</Label>
              <Input value={form.last_name} onChange={set('last_name')} placeholder="Mustermann" className="h-8 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 block">Vollständiger Name</Label>
            <Input value={form.name} onChange={set('name')} placeholder="Max Mustermann" className="h-8 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Rolle / Funktion</Label>
              <Input value={form.role} onChange={set('role')} placeholder="Geschäftsführer" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Abteilung</Label>
              <Input value={form.department} onChange={set('department')} placeholder="Einkauf" className="h-8 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 block">E-Mail</Label>
            <Input value={form.email} onChange={set('email')} placeholder="max@firma.de" type="email" className="h-8 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Telefon</Label>
              <Input value={form.phone} onChange={set('phone')} placeholder="+49 261 ..." className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Mobil</Label>
              <Input value={form.mobile} onChange={set('mobile')} placeholder="+49 170 ..." className="h-8 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700 mb-1 block">Notizen</Label>
            <Input value={form.notes} onChange={set('notes')} placeholder="Optionale Notiz" className="h-8 text-sm" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={setCheck('is_primary')}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-slate-700">Als Hauptkontakt setzen</span>
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Speichern…</> : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}