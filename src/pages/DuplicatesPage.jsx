import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { GitMerge, Trash2, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/useOrganization";

function similarity(a, b) {
  a = a.toLowerCase().replace(/gmbh|kg|ag|ug|e\.v\.|gbr|\s+/g, " ").trim();
  b = b.toLowerCase().replace(/gmbh|kg|ag|ug|e\.v\.|gbr|\s+/g, " ").trim();
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  // Levenshtein-based similarity
  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastVal = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) { costs[j] = j; continue; }
      if (j === 0) { lastVal = i; continue; }
      const newVal = longer[i - 1] === shorter[j - 1]
        ? costs[j - 1]
        : 1 + Math.min(costs[j - 1], lastVal, costs[j]);
      costs[j - 1] = lastVal;
      lastVal = newVal;
    }
    costs[shorter.length] = lastVal;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

export default function DuplicatesPage() {
  const { org, loading: orgLoading } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [merging, setMerging] = useState(null);

  useEffect(() => {
    if (!orgLoading && org?.id) findDuplicates();
    else if (!orgLoading) setLoading(false);
  }, [org?.id, orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const findDuplicates = async () => {
    setLoading(true);
    const companies = await base44.entities.Company.filter({ organization_id: org.id }, "-created_date", 1000);
    const found = [];
    const used = new Set();

    for (let i = 0; i < companies.length; i++) {
      if (used.has(companies[i].id)) continue;
      const group = [companies[i]];
      for (let j = i + 1; j < companies.length; j++) {
        if (used.has(companies[j].id)) continue;
        const sim = similarity(companies[i].name, companies[j].name);
        if (sim >= 0.75) {
          group.push(companies[j]);
          used.add(companies[j].id);
        }
      }
      if (group.length > 1) {
        used.add(companies[i].id);
        found.push(group);
      }
    }
    setGroups(found);
    setLoading(false);
  };

  const assertOrgMatch = (company) => {
    if (company?.organization_id && company.organization_id !== org?.id) {
      toast.error("Org-Kontext stimmt nicht überein – Aktion abgebrochen");
      return false;
    }
    return true;
  };

  const handleMerge = async (group) => {
    // Guard: alle Companies müssen zur aktiven Org gehören
    for (const c of group) {
      if (!assertOrgMatch(c)) return;
    }

    const primary = group.reduce((best, c) => {
      const score = [c.telefon, c.email, c.website, c.ansprechpartner, c.adresse].filter(Boolean).length;
      const bestScore = [best.telefon, best.email, best.website, best.ansprechpartner, best.adresse].filter(Boolean).length;
      return score > bestScore ? c : best;
    });

    setMerging(primary.id);

    const merged = { ...primary };
    for (const dup of group) {
      if (dup.id === primary.id) continue;
      if (!merged.telefon && dup.telefon) merged.telefon = dup.telefon;
      if (!merged.email && dup.email) merged.email = dup.email;
      if (!merged.website && dup.website) merged.website = dup.website;
      if (!merged.ansprechpartner && dup.ansprechpartner) merged.ansprechpartner = dup.ansprechpartner;
      if (!merged.adresse && dup.adresse) merged.adresse = dup.adresse;
      if (!merged.notizen && dup.notizen) merged.notizen = dup.notizen;
    }

    await base44.entities.Company.update(primary.id, merged);
    for (const dup of group) {
      if (dup.id !== primary.id) await base44.entities.Company.delete(dup.id);
    }

    toast.success(`Zusammengeführt: "${primary.name}" behalten, ${group.length - 1} Duplikat(e) gelöscht`);
    setMerging(null);
    findDuplicates();
  };

  const handleDelete = async (id, name, company) => {
    if (!assertOrgMatch(company)) return;
    if (!window.confirm(`"${name}" wirklich löschen?`)) return;
    await base44.entities.Company.delete(id);
    toast.success("Gelöscht");
    findDuplicates();
  };

  if (orgLoading || loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-slate-900">Duplikate</h1>
        <p className="text-sm font-medium text-slate-700 mt-2">
          {groups.length === 0 ? "Keine Duplikate gefunden ✓" : `${groups.length} Gruppe(n) ähnlicher Firmen gefunden`}
        </p>
      </div>

      {groups.length === 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center shadow-sm">
          <GitMerge className="w-12 h-12 mx-auto mb-3 text-emerald-600" />
          <p className="text-sm font-semibold text-slate-900">Keine möglichen Duplikate gefunden</p>
          <p className="text-xs font-medium text-slate-700 mt-1">Deine Daten sind sauber organisiert</p>
        </div>
      )}

      {groups.map((group, gi) => (
        <div key={gi} className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-[#E2E8F0] bg-amber-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">
              ⚠️ {group.length} ähnliche Firmen
            </span>
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 bg-primary hover:bg-primary/90"
              onClick={() => handleMerge(group)}
              disabled={merging === group[0].id}
            >
              {merging ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
              Zusammenführen
            </Button>
          </div>
          <div className="divide-y divide-[#E2E8F0]">
            {group.map(c => (
              <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      {[c.ort, c.telefon, c.email].filter(Boolean).join(" · ") || "Keine weiteren Daten"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Status: {c.status} · Erstellt: {new Date(c.created_date).toLocaleDateString("de-DE")}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(c.id, c.name, c)}
                  className="p-1.5 rounded text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
                  title="Löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}