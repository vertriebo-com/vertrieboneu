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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
        keyword_type: 'research_target_keyword', // Manuell hinzugefügt = immer Recherche-Zielkunde
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

  // Intent-Badge: Zeigt dem Nutzer wofür ein Keyword genutzt wird
  // Fallback-Logik für Legacy-Profile ohne keyword_type
  const getIntentBadge = (profile) => {
    // Expliziter Typ
    const type = profile.keyword_type;
    if (type === 'research_target_keyword') return { label: "Recherche-Zielkunde", color: "bg-blue-50 text-blue-700 border-blue-200", title: "Wird für Firmensuche verwendet" };
    if (type === 'service_keyword') return { label: "Eigene Leistung", color: "bg-orange-50 text-orange-700 border-orange-200", title: "Kontext für Scoring – nicht als Suchzielkunde" };
    if (type === 'learned_keyword') return { label: "Gelernt", color: "bg-teal-50 text-teal-700 border-teal-200", title: "Aus Lead-Ergebnissen gelernt" };
    if (type === 'marketing_ad_keyword') return { label: "Marketing", color: "bg-yellow-50 text-yellow-700 border-yellow-200", title: "Marketing-Keyword – nicht für Firmenrecherche" };
    if (type === 'negative_keyword' || profile.status === 'blocked' || profile.status === 'reduced') {
      return { label: "Ausschluss", color: "bg-red-50 text-red-700 border-red-200", title: "Wird ausgeschlossen" };
    }
    // Legacy: kein keyword_type gesetzt → Fallback
    return { label: "Recherche-Zielkunde", color: "bg-blue-50 text-blue-600 border-blue-100", title: "Wird für Firmensuche verwendet (Standard)" };
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
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge className={`text-[10px] ${config.color}`}>
                          {config.label}
                        </Badge>
                        {(() => {
                          const intent = getIntentBadge(profile);
                          return (
                            <span title={intent.title} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${intent.color}`}>
                              {intent.label}
                            </span>
                          );
                        })()}
                        {profile.total_count > 0 && (
                          <span className="text-[10px] text-slate-500">
                            {profile.total_count}× · Score: {profile.score}
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
            {suggestionsData.suggestions.slice(0, 8).map((s, i) => {
              const isService = s.keyword_type === 'service_keyword';
              return (
                <Badge 
                  key={i} 
                  variant="outline" 
                  title={isService ? "Eigene Leistung – kein Recherche-Zielkunde" : "Als Recherche-Zielkunde hinzufügen"}
                  className={`text-[10px] cursor-pointer transition-colors ${
                    isService
                      ? "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                      : "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100"
                  }`}
                  onClick={() => {
                    setNewKeyword(s.keyword);
                    setShowAddKeyword(true);
                  }}
                >
                  {s.keyword}{isService ? " ⚙" : ""}
                </Badge>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            {suggestionsData.total_suggestions} Vorschläge · Klicken zum Hinzufügen · <span className="text-orange-600">⚙ = eigene Leistung</span>
          </p>
        </div>
      )}

      {/* Dialog: Keyword hinzufügen */}
      <Dialog open={showAddKeyword} onOpenChange={setShowAddKeyword}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                <Plus className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-base font-bold text-slate-900">
                  Keyword hinzufügen
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600 mt-0.5">
                  Fügen Sie einen Suchbegriff hinzu der aktiv für Ihre Recherchen genutzt wird.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold text-slate-800 mb-1.5 block">Suchbegriff</Label>
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="z.B. Zielgruppe, Suchbegriff oder Kundentyp..."
                autoFocus
                className="text-sm bg-white border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Tragen Sie Firmentypen ein, die Sie als Kunden suchen (z.B. „Hausverwaltung", „Produktionsfirma"). Geben Sie <strong>nicht</strong> Ihre eigenen Leistungen oder Google-Werbebegriffe ein.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddKeyword(false)}
                disabled={addKeywordMutation.isPending}
                className="text-sm px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAddKeyword}
                disabled={!newKeyword.trim() || addKeywordMutation.isPending}
                className="text-sm px-5 py-2 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
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