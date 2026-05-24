import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Brain, Sparkles, Plus, CheckCircle2, XCircle, MinusCircle, 
  ShieldCheck, TrendingUp, TrendingDown, Search, Loader2 
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function KeywordProfilePanel({ organizationId }) {
  const [showAddKeyword, setShowAddKeyword] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const queryClient = useQueryClient();

  // Keyword-Vorschläge laden
  const { data: suggestionsData, isLoading: isLoadingSuggestions } = useQuery({
    queryKey: ['keyword-suggestions', organizationId],
    queryFn: async () => {
      const res = await base44.functions.invoke("generateKeywordSuggestions", { organization_id: organizationId });
      return res.data;
    },
    enabled: !!organizationId,
  });

  // Bestehende Keywords laden
  const { data: existingKeywords } = useQuery({
    queryKey: ['existing-keywords', organizationId],
    queryFn: async () => {
      const profiles = await base44.entities.OrganizationKeywordProfile.filter({ organization_id: organizationId });
      return profiles.sort((a, b) => b.score - a.score || b.total_count - a.total_count);
    },
    enabled: !!organizationId,
  });

  // Keyword aktivieren
  const activateMutation = useMutation({
    mutationFn: async ({ profileId, keyword }) => {
      await base44.entities.OrganizationKeywordProfile.update(profileId, {
        status: 'active',
        is_boosted: false,
        is_reduced: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['existing-keywords', organizationId]);
      queryClient.invalidateQueries(['keyword-suggestions', organizationId]);
      toast.success("Keyword aktiviert");
    },
  });

  // Keyword blockieren
  const blockMutation = useMutation({
    mutationFn: async ({ profileId, keyword }) => {
      await base44.entities.OrganizationKeywordProfile.update(profileId, {
        status: 'blocked',
        is_boosted: false,
        is_reduced: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['existing-keywords', organizationId]);
      queryClient.invalidateQueries(['keyword-suggestions', organizationId]);
      toast.success("Keyword blockiert");
    },
  });

  // Manuell Keyword hinzufügen
  const addKeywordMutation = useMutation({
    mutationFn: async (keyword) => {
      const me = await base44.auth.me();
      const orgs = await base44.entities.Organization.filter({ owner_email: me.email });
      const orgId = organizationId || orgs[0]?.id;
      
      await base44.entities.OrganizationKeywordProfile.create({
        organization_id: orgId,
        keyword,
        source: 'manual_user_added',
        status: 'active',
        score: 5,
        is_user_added: true,
        is_boosted: false,
        is_reduced: false,
        total_count: 0,
        won_count: 0,
        relevant_count: 0,
        not_relevant_count: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['existing-keywords', organizationId]);
      queryClient.invalidateQueries(['keyword-suggestions', organizationId]);
      toast.success("Keyword hinzugefügt");
      setShowAddKeyword(false);
      setNewKeyword("");
    },
  });

  const handleAddKeyword = () => {
    if (!newKeyword.trim()) return;
    addKeywordMutation.mutate(newKeyword.trim());
  };

  const statusConfig = {
    suggested: { color: "bg-slate-100 text-slate-700 border-slate-200", icon: Brain, label: "Vorschlag" },
    active: { color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2, label: "Aktiv" },
    boosted: { color: "bg-violet-100 text-violet-700 border-violet-200", icon: TrendingUp, label: "Boosted" },
    reduced: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: TrendingDown, label: "Reduziert" },
    blocked: { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, label: "Blockiert" },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Search className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Suchbegriffe</h3>
            <p className="text-xs text-slate-500">Keyword-Profil für bessere Recherche-Ergebnisse</p>
          </div>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => setShowAddKeyword(true)}
          className="h-8 text-xs gap-1 bg-white border-slate-200"
        >
          <Plus className="w-3 h-3" /> Keyword hinzufügen
        </Button>
      </div>

      {/* Bestehende Keywords */}
      {existingKeywords && existingKeywords.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {existingKeywords.filter(k => k.status === 'active' || k.status === 'boosted').length} aktiv
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {existingKeywords.filter(k => k.status === 'suggested').length} Vorschläge
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {existingKeywords.filter(k => k.status === 'blocked').length} blockiert
            </Badge>
          </div>

          <div className="grid gap-2">
            {existingKeywords.slice(0, 10).map((profile) => {
              const config = statusConfig[profile.status] || statusConfig.suggested;
              const Icon = config.icon;
              
              return (
                <div 
                  key={profile.id} 
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:border-violet-200 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                      profile.status === 'boosted' ? "bg-violet-100" :
                      profile.status === 'active' ? "bg-emerald-100" :
                      profile.status === 'blocked' ? "bg-red-100" :
                      "bg-slate-100"
                    }`}>
                      <Icon className={`w-3.5 h-3.5 ${
                        profile.status === 'boosted' ? "text-violet-600" :
                        profile.status === 'active' ? "text-emerald-600" :
                        profile.status === 'blocked' ? "text-red-600" :
                        "text-slate-500"
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{profile.keyword}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={`text-[10px] ${config.color}`}>
                          {config.label}
                        </Badge>
                        {profile.total_count > 0 && (
                          <span className="text-[10px] text-slate-500">
                            {profile.total_count}× genutzt · Score: {profile.score}
                          </span>
                        )}
                        {profile.source === 'manual_user_added' && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                            <ShieldCheck className="w-3 h-3" /> Manuell
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Aktionen für Vorschläge */}
                  {profile.status === 'suggested' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => activateMutation.mutate({ profileId: profile.id, keyword: profile.keyword })}
                        className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 transition-colors"
                        title="Aktivieren"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => blockMutation.mutate({ profileId: profile.id, keyword: profile.keyword })}
                        className="p-1.5 rounded-md hover:bg-red-50 text-red-600 transition-colors"
                        title="Blockieren"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg">
          <Brain className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Noch keine Keywords</p>
          <p className="text-xs text-slate-400 mt-1">
            {isLoadingSuggestions ? "Lade Vorschläge..." : "Fügen Sie manuell Keywords hinzu oder starten Sie eine Recherche"}
          </p>
        </div>
      )}

      {/* Vorschläge (wenn vorhanden) */}
      {suggestionsData?.suggestions && suggestionsData.suggestions.length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-violet-600" />
            Empfohlene Suchbegriffe
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {suggestionsData.suggestions.slice(0, 8).map((s, i) => (
              <Badge 
                key={i} 
                variant="outline" 
                className="text-[10px] bg-violet-50 border-violet-200 text-violet-700 cursor-pointer hover:bg-violet-100 transition-colors"
                onClick={() => {
                  setNewKeyword(s.keyword);
                  setShowAddKeyword(true);
                }}
              >
                {s.keyword}
              </Badge>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            {suggestionsData.total_suggestions} Vorschläge verfügbar · Klicken zum Hinzufügen
          </p>
        </div>
      )}

      {/* Dialog: Keyword hinzufügen */}
      <Dialog open={showAddKeyword} onOpenChange={setShowAddKeyword}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-600" /> Keyword hinzufügen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Suchbegriff</Label>
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="z.B. Büroreinigung, WEG-Verwaltung..."
                autoFocus
                className="text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Dieser Begriff wird aktiv für Ihre Recherchen genutzt.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddKeyword(false)}
                className="text-sm px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAddKeyword}
                disabled={!newKeyword.trim() || addKeywordMutation.isPending}
                className="text-sm px-4 py-1.5 rounded-md bg-violet-600 text-white font-semibold disabled:opacity-50"
              >
                {addKeywordMutation.isPending ? "Füge hinzu..." : "Hinzufügen"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}