import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Info, User, Building, FileCheck, Zap, CreditCard } from "lucide-react";
import CompanySettings from "@/components/settings/CompanySettings";
import EmailSettings from "@/components/settings/EmailSettings";
import EmailTemplateSettings from "@/components/settings/EmailTemplateSettings";
import BillingSettings from "@/components/settings/BillingSettings";
import PlanSelection from "@/components/settings/PlanSelection";
import LearnedIntelligencePanel from "@/components/settings/LearnedIntelligencePanel";
import KeywordProfilePanel from "@/components/settings/KeywordProfilePanel";
import { Button } from "@/components/ui/button";

// ─── Navigation Items ─────────────────────────────────────────────────────────────
const ADMIN_NAV_ITEMS = [
  { 
    id: "company", 
    label: "Unternehmen", 
    description: "Firmendaten, Suchgebiet und Zielkunden",
    icon: Building 
  },
  { 
    id: "keywords", 
    label: "Suchbegriffe", 
    description: "Keyword-Profil für bessere Recherche",
    icon: Zap 
  },
  { 
    id: "templates", 
    label: "Vorlagen", 
    description: "E-Mail-Vorlagen für alle Anlässe",
    icon: FileCheck 
  },
  { 
    id: "plans", 
    label: "Pläne & Preise", 
    description: "Abo auswählen & wechseln",
    icon: CreditCard 
  },
  { 
    id: "billing", 
    label: "Nutzung & Billing", 
    description: "Verbrauch, Kontingente & Rechnungen",
    icon: Zap 
  },
];

const SALES_REP_NAV_ITEMS = [
  { 
    id: "profile", 
    label: "Profil", 
    description: "Ihre persönlichen Kontodaten",
    icon: User 
  },
];

// Spinner helper
const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(null);
  const [org, setOrg] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = role === "organization_admin" || currentUser?.role === "admin";

  const loadData = async () => {
    setLoading(true);
    const user = await base44.auth.me();
    setCurrentUser(user);

    let foundOrg = null;
    let foundRole = null;

    if (user.role === "admin") foundRole = "organization_admin";

    // MVP: Single-Account – Owner ist immer organization_admin
    const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
    if (orgs?.[0]) {
      foundOrg = orgs[0];
      foundRole = foundRole || "organization_admin";
    }

    setOrg(foundOrg);
    setRole(foundRole);

    // Set default tab based on role or URL param
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    const adminDefault = "company";
    const salesRepDefault = "profile";
    const resolvedRole = foundRole || "sales_rep";
    const isAdminUser = resolvedRole === "organization_admin" || user.role === "admin";
    const validAdminTabs = ["company", "keywords", "templates", "plans", "billing"];
    const defaultTab = isAdminUser ? adminDefault : salesRepDefault;
    if (tabParam && isAdminUser && validAdminTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    } else {
      setActiveTab(defaultTab);
    }

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  if (loading) return <Spinner />;

  // Build visible tabs (removed - using card navigation now)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900">Einstellungen</h1>
        <p className="text-sm font-semibold text-slate-800 mt-2">
          {isAdmin
            ? "Verwalten Sie Ihr Unternehmen, Kommunikation und Abonnement."
            : "Verwalten Sie Ihr persönliches Profil."}
        </p>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-6 sm:mb-8 overflow-x-auto pb-2">
        {(isAdmin ? ADMIN_NAV_ITEMS : SALES_REP_NAV_ITEMS).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left shadow-sm ${
                isActive
                  ? "border-blue-500 bg-blue-50 shadow-md"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
                isActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-xs sm:text-sm font-bold ${isActive ? "text-blue-700" : "text-slate-900"}`}>
                {item.label}
              </span>
              <span className={`text-[10px] sm:text-[11px] font-medium mt-0.5 line-clamp-2 ${isActive ? "text-blue-600" : "text-slate-600"}`}>
                {item.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="space-y-4 sm:space-y-6 pb-20">
        {/* Admin Content */}
        {activeTab === "company" && isAdmin && (
          <>
            <LearnedIntelligencePanel organizationId={org?.id} />
            <CompanySettings org={org} />
          </>
        )}

        {activeTab === "keywords" && isAdmin && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <KeywordProfilePanel organizationId={org?.id} />
          </div>
        )}

        {activeTab === "templates" && isAdmin && <EmailTemplateSettings />}
        {activeTab === "plans" && isAdmin && <PlanSelection org={org} user={currentUser} />}
        {activeTab === "billing" && isAdmin && <BillingSettings org={org} user={currentUser} />}

        {/* Sales Rep: Mein Profil */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Mein Konto</h3>
              <p className="text-xs font-medium text-slate-600 mb-4">Ihre persönlichen Kontodaten.</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-slate-700 w-28 shrink-0 font-medium">Name:</span>
                  <span className="font-semibold text-slate-900">{currentUser?.full_name || "—"}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-slate-700 w-28 shrink-0 font-medium">E-Mail:</span>
                  <span className="font-semibold text-slate-900">{currentUser?.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-slate-700 w-28 shrink-0 font-medium">Rolle:</span>
                  <span className="font-semibold text-slate-900">{role === "organization_admin" ? "Admin" : "Vertriebler"}</span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
              <p className="text-sm font-medium text-blue-900">
                Unternehmensprofil, E-Mail-Vorlagen und Abonnement werden vom Kontoinhaber verwaltet.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}