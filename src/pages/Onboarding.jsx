import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, Building2, Target, Zap, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import CompanyStep from "@/components/onboarding/CompanyStep";
import TargetingStep from "@/components/onboarding/TargetingStep";
import LaunchStep from "@/components/onboarding/LaunchStep";

const STEPS = [
  { id: "company", label: "Unternehmen", icon: Building2 },
  { id: "targeting", label: "Zielkunden", icon: Target },
  { id: "launch", label: "Los geht's", icon: Zap },
];

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

export default function Onboarding() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Company
  const [vorname, setVorname] = useState("");
  const [firmenname, setFirmenname] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  // Strukturiertes Ortsobjekt: { city, label, place_id, lat, lng }
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(25);

  // Step 2: Targeting
  const [targetCustomers, setTargetCustomers] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [services, setServices] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!me) { navigate("/"); return; }
        setUser(me);

        const orgs = await base44.entities.Organization.filter({ owner_email: me.email });
        if (orgs?.[0]) {
          const existingOrg = orgs[0];
          setOrg(existingOrg);
          setFirmenname(existingOrg.name || "");
          if (existingOrg.onboarding_done) {
            navigate("/dashboard");
            return;
          }
        }
      } catch (e) {
        console.error("Onboarding init error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Step 1: Company ──────────────────────────────────────────
  const handleCompanyNext = async (data) => {
    setSaving(true);
    try {
      const loc = data.location || {};
      const cityName = loc.city || "";
      const cityLat = loc.lat || null;
      const cityLng = loc.lng || null;
      const cityPlaceId = loc.place_id || null;

      // selectedIndustry: normalisiertes Objekt mit canonical industry_id + Profil
      const industryName = data.selectedIndustry.name || data.selectedIndustry.label || "";
      const industryCanonicalId = data.selectedIndustry.industry_id || data.selectedIndustry.id || industryName;

      let currentOrg = org;
      if (!currentOrg) {
        currentOrg = await base44.entities.Organization.create({
          name: data.firmenname.trim(),
          owner_email: user.email,
          status: "active",
          billing_status: "preview",
          trial_stage: "free_preview",
          onboarding_done: false,
          industry: industryName,
          service_area_city: cityName,
          service_area_radius_km: data.radius,
        });
        setOrg(currentOrg);
      } else {
        await base44.entities.Organization.update(currentOrg.id, {
          name: data.firmenname.trim(),
          industry: industryName,
          service_area_city: cityName,
          service_area_radius_km: data.radius,
        });
      }

      // Settings: Branche (canonical + legacy) + Ortsdaten
      const isFallback = data.selectedIndustry.isFallback || false;
      const settingsToSave = [
        { key: "contact_name",           value: data.vorname || "" },
        { key: "industry_name",          value: industryName },
        { key: "industry_id",            value: industryCanonicalId },
        { key: "own_industry",           value: industryName },
        // Fallback-Tracking: persistent in OrganizationSettings auswertbar
        ...(isFallback ? [
          { key: "custom_industry_requested", value: "true" },
          { key: "custom_industry_label",     value: data.selectedIndustry.fallbackLabel || industryName },
          { key: "fallback_profile_used",     value: industryCanonicalId || "fallback_lokaler_dienstleister" },
        ] : []),
        { key: "lead_plz_city",          value: cityName },
        { key: "lead_radius_km",         value: String(data.radius) },
        { key: "service_area_city",      value: cityName },
        { key: "service_area_radius_km", value: String(data.radius) },
        { key: "service_area_place_id",  value: cityPlaceId || "" },
        { key: "service_area_lat",       value: cityLat ? String(cityLat) : "" },
        { key: "service_area_lng",       value: cityLng ? String(cityLng) : "" },
      ];

      await Promise.all(settingsToSave.map(async (s) => {
        const existing = await base44.entities.OrganizationSettings.filter({ 
          organization_id: currentOrg.id, key: s.key 
        });
        if (existing?.[0]) {
          await base44.entities.OrganizationSettings.update(existing[0].id, { value: s.value });
        } else if (s.value) {
          await base44.entities.OrganizationSettings.create({ 
            organization_id: currentOrg.id, key: s.key, value: s.value 
          });
        }
      }));

      setVorname(data.vorname || "");
      setFirmenname(data.firmenname);
      setSelectedIndustry(data.selectedIndustry);
      setLocation(data.location);
      setRadius(data.radius);
      setCurrentStep(1);
    } catch (e) {
      toast.error("Fehler: " + e.message);
    }
    setSaving(false);
  };

  // ── Step 2: Targeting ────────────────────────────────────────
  const handleTargetingNext = async (data) => {
    setSaving(true);
    try {
      const settings = [
        { key: "target_customer_types", value: data.targetCustomers.join(", ") },
        { key: "excluded_customer_types", value: data.excluded.join(", ") },
        { key: "services", value: data.services.join(", ") },
      ];

      for (const s of settings) {
        const existing = await base44.entities.OrganizationSettings.filter({ 
          organization_id: org.id, 
          key: s.key 
        });
        if (existing?.[0]) {
          await base44.entities.OrganizationSettings.update(existing[0].id, { value: s.value });
        } else {
          await base44.entities.OrganizationSettings.create({ 
            organization_id: org.id, 
            key: s.key, 
            value: s.value 
          });
        }
      }

      setTargetCustomers(data.targetCustomers);
      setExcluded(data.excluded);
      setServices(data.services);
      setCurrentStep(2);
    } catch (e) {
      toast.error("Fehler: " + e.message);
    }
    setSaving(false);
  };

  // ── Step 3: Launch ──────────────────────────────────────────
  const handleLaunch = async (researchResult) => {
    // researchResult comes from LaunchStep after research completes
    if (researchResult?.error) {
      // "Eine Recherche läuft bereits" ist KEIN harter Fehler → Dashboard mit Banner
      if (researchResult.error.includes('bereits')) {
        toast.info(researchResult.error);
        navigate("/dashboard?research_started=1");
        return;
      }
      toast.error("Recherche fehlgeschlagen: " + researchResult.error);
      navigate("/dashboard");
      return;
    }

    // QUOTA REACHED: Auch weiter zu Dashboard
    if (researchResult?.quota_reached) {
      navigate("/dashboard");
      return;
    }

    setSaving(true);
    try {
      // Mark onboarding as done
      await base44.entities.Organization.update(org.id, {
        onboarding_done: true,
        onboarding_completed_at: new Date().toISOString(),
      });

      const leadsFound = researchResult?.leads_saved || 0;
      const status = researchResult?.status;
      const runId = researchResult?.research_run_id;

      // SOFORT: Nach erfolgreichem startResearchRun ins Dashboard (nicht warten bis Leads fertig!)
      // processResearchRun läuft im Hintergrund weiter
      if (runId) {
        toast.success('Recherche gestartet! Wir zeigen Ihnen den Fortschritt im Dashboard.');
        navigate(`/dashboard?research_started=1&run_id=${runId}`);
        return;
      }

      // Fallback: Wenn keine runId (sollte nicht passieren)
      navigate("/dashboard");
    } catch (e) {
      toast.error("Fehler: " + e.message);
      navigate("/dashboard");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center gap-3 shadow-sm">
        <img
          src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/7fe9f4d4d_Logo1HUWA.png"
          alt="Vertriebo"
          className="w-7 h-7 object-contain"
        />
        <span className="font-bold text-lg text-slate-900">Vertriebo</span>
        <span className="text-slate-600 text-sm ml-1 font-medium">– Schnellstart</span>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-12 overflow-x-auto pb-2">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const done = idx < currentStep;
            const active = idx === currentStep;
            return (
              <div key={step.id} className="flex items-center flex-shrink-0">
                <div className={`flex flex-col items-center gap-1 ${active ? "opacity-100" : done ? "opacity-80" : "opacity-30"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${active ? "bg-blue-600 text-white" : done ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className="text-[10px] font-medium hidden sm:block text-slate-700">{step.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`h-0.5 w-6 sm:w-10 mx-1 ${idx < currentStep ? "bg-green-400" : "bg-slate-300"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 0: Company */}
        {currentStep === 0 && (
          <CompanyStep
            onNext={handleCompanyNext}
            loading={saving}
            initialData={{ vorname, firmenname, selectedIndustry, location, radius }}
          />
        )}

        {/* Step 1: Targeting */}
        {currentStep === 1 && (
          <TargetingStep
            onBack={() => setCurrentStep(0)}
            onNext={handleTargetingNext}
            loading={saving}
            // Vollständiges Industrie-Objekt mit Profil weitergeben für direkten Preset-Zugriff
            industry={selectedIndustry}
            initialData={{ targetCustomers, excluded, services }}
          />
        )}

        {/* Step 2: Launch */}
        {currentStep === 2 && (
          <LaunchStep
            onBack={() => setCurrentStep(1)}
            onLaunch={handleLaunch}
            loading={saving}
            organization={{ name: firmenname, industry: selectedIndustry?.name }}
            orgId={org?.id}
          />
        )}
      </div>
    </div>
  );
}