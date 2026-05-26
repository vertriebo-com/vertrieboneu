import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, Upload, Trash2, Download, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const KATEGORIEN = ["Preisliste", "Präsentation", "Vertrag", "Angebot", "Sonstiges"];

const KATEGORIE_COLORS = {
  "Preisliste": "bg-blue-50 text-blue-700 border-blue-200",
  "Präsentation": "bg-purple-50 text-purple-700 border-purple-200",
  "Vertrag": "bg-red-50 text-red-700 border-red-200",
  "Angebot": "bg-orange-50 text-orange-700 border-orange-200",
  "Sonstiges": "bg-slate-50 text-slate-600 border-slate-200",
};

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [user, setUser] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [kategorie, setKategorie] = useState("Sonstiges");
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const me = await base44.auth.me();
    setUser(me);

    // Organisation ermitteln
    let orgId = null;
    const orgs = await base44.entities.Organization.filter({ owner_email: me.email });
    let org = orgs?.[0] || null;
    if (!org) {
      const memberships = await base44.entities.OrganizationMember.filter({ user_email: me.email, status: "active" });
      if (memberships?.[0]?.organization_id) {
        const memberOrgs = await base44.entities.Organization.filter({ id: memberships[0].organization_id });
        org = memberOrgs?.[0] || null;
      }
    }
    orgId = org?.id || null;
    setOrgId(orgId);

    const docs = orgId
      ? await base44.entities.Document.filter({ organization_id: orgId }, "-created_date", 100)
      : [];
    setDocuments(docs);
    setLoading(false);
  };

  const isAdmin = user?.role === "admin";

  const handleUpload = async () => {
    if (!titel.trim()) { toast.error("Bitte einen Titel eingeben."); return; }
    if (!selectedFile) { toast.error("Bitte eine PDF-Datei auswählen."); return; }

    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
    
    await base44.entities.Document.create({
      titel: titel.trim(),
      beschreibung: beschreibung.trim(),
      kategorie,
      file_url,
      dateiname: selectedFile.name,
      organization_id: orgId,
      source_type: "manual",
      document_type: "other",
    });
    toast.success("Dokument erfolgreich hochgeladen!");
    setTitel(""); setBeschreibung(""); setKategorie("Sonstiges"); setSelectedFile(null);
    loadData();
    setUploading(false);
  };

  const handleDelete = async (doc) => {
    if (!window.confirm("Dokument wirklich löschen?")) return;

    // orgId aus dem Dokument oder lokal gespeichert
    const docOrgId = doc.organization_id || orgId;
    const res = await base44.functions.invoke("deleteDocument", {
      document_id: doc.id,
      organization_id: docOrgId,
    });
    if (res.data?.error === "forbidden") {
      toast.error("Keine Berechtigung: Nur Admins dürfen Dokumente löschen.");
      return;
    }
    if (res.data?.error) {
      toast.error("Fehler: " + res.data.error);
      return;
    }
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
    toast.success("Dokument gelöscht.");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dokumente</h1>
          <p className="text-sm font-medium text-slate-700 mt-2">Verwaltung von Dokumenten und Unterlagen</p>
        </div>
      </div>

      {/* Upload (nur Admin) */}
      {isAdmin && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm">
          <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Dokument hochladen</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                placeholder="Titel des Dokuments"
                value={titel}
                onChange={e => setTitel(e.target.value)}
              />
              <Select value={kategorie} onValueChange={setKategorie}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  {KATEGORIEN.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Kurze Beschreibung (optional)"
              value={beschreibung}
              onChange={e => setBeschreibung(e.target.value)}
            />
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <label className="flex-1">
                <div className={`border-2 border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-colors ${selectedFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  {selectedFile ? (
                    <p className="text-sm font-medium text-primary truncate">{selectedFile.name}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">PDF-Datei auswählen</p>
                  )}
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={e => setSelectedFile(e.target.files[0] || null)}
                  />
                </div>
              </label>
              <Button onClick={handleUpload} disabled={uploading} className="gap-2 whitespace-nowrap">
                <Upload className="w-4 h-4" />
                {uploading ? "Lädt hoch..." : "Hochladen"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dokumentenliste */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-900">Dokumente ({documents.length})</h3>
        </div>
        <div className="divide-y divide-[#E2E8F0]">
          {documents.map(doc => (
            <div key={doc.id} className="px-5 py-4 flex items-center gap-3 hover:bg-slate-50 transition-colors">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0 border border-red-100">
                <FileText className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{doc.titel}</p>
                {doc.beschreibung && (
                  <p className="text-xs font-medium text-slate-700 truncate mt-0.5">{doc.beschreibung}</p>
                )}
                <p className="text-[11px] text-slate-500 mt-1">{doc.dateiname}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${KATEGORIE_COLORS[doc.kategorie] || KATEGORIE_COLORS["Sonstiges"]}`}>
                  {doc.kategorie}
                </span>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-foreground" title="Herunterladen">
                    <Download className="w-4 h-4" />
                  </Button>
                </a>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(doc)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {documents.length === 0 && (
            <div className="px-5 py-16 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-900">Keine Dokumente vorhanden</p>
              <p className="text-xs font-medium text-slate-700 mt-1">Laden Sie ein Dokument hoch, um es hier anzuzeigen</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}