import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Plus, Bell, Building2, Map, ListTodo, CalendarCheck, FileText, BarChart3, Upload, Ban, GitMerge, Settings, LayoutDashboard, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import VertrieboLogo from "@/components/VertrieboLogo";

// Sub-pages that should show a back button on mobile
const SUB_PAGES = ["/leads/", "/tasks/", "/documents/"];

// Header-Konfiguration pro Seite
const PAGE_CONFIG = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Ihr heutiger Vertriebsplan",
    icon: LayoutDashboard,
    showSearch: true,
    searchPlaceholder: "Firma, Kontakt oder Aufgabe suchen …",
  },
  "/leads": {
    title: "Leads",
    subtitle: "Alle Firmenkontakte und nächsten Schritte",
    icon: Building2,
    showSearch: true,
    searchPlaceholder: "Firmenname, PLZ oder Branche suchen …",
    primaryAction: { label: "+ Neuer Lead", href: "/leads?new=true" },
  },
  "/map": {
    title: "Karte",
    subtitle: "Firmenstandorte in Ihrer Region",
    icon: Map,
    showSearch: true,
    searchPlaceholder: "Firma oder Ort suchen …",
  },
  "/tasks": {
    title: "Aufgaben",
    subtitle: "Rückrufe, Follow-ups und offene To-dos",
    icon: ListTodo,
    showSearch: true,
    searchPlaceholder: "Aufgabe suchen …",
    primaryAction: { label: "+ Aufgabe", href: "/tasks?new=true" },
  },
  "/calendar": {
    title: "Kalender",
    subtitle: "Termine und Aufgaben im Überblick",
    icon: CalendarCheck,
    showSearch: false,
  },
  "/documents": {
    title: "Dokumente",
    subtitle: "Preislisten, Verträge und Präsentationen",
    icon: FileText,
    showSearch: true,
    searchPlaceholder: "Dokument suchen …",
    primaryAction: { label: "+ Dokument", href: "/documents?new=true" },
  },
  "/statistics": {
    title: "Statistiken",
    subtitle: "Umsatz, Conversion und Team-Performance",
    icon: BarChart3,
    showSearch: false,
  },
  "/import": {
    title: "Import",
    subtitle: "Kontakte aus CSV oder Excel importieren",
    icon: Upload,
    showSearch: false,
  },
  "/blacklist": {
    title: "Blacklist",
    subtitle: "Gesperrte Firmen und Kontakte",
    icon: Ban,
    showSearch: true,
    searchPlaceholder: "Firma auf Blacklist suchen …",
  },
  "/duplicates": {
    title: "Duplikate",
    subtitle: "Doppelte Einträge finden und zusammenführen",
    icon: GitMerge,
    showSearch: false,
  },
  "/settings": {
    title: "Einstellungen",
    subtitle: "Unternehmen, Kommunikation und Abonnement verwalten",
    icon: Settings,
    showSearch: false,
  },
};

export default function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [orgRole, setOrgRole] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isSubPage = SUB_PAGES.some(p => location.pathname.startsWith(p));

  // Aktuellen Pfad匹配 (exakt oder Basis-Pfad)
  const getCurrentPath = () => {
    const path = location.pathname;
    // Exakte Übereinstimmung oder Basis-Pfad (z.B. /leads/123 → /leads)
    for (const key of Object.keys(PAGE_CONFIG)) {
      if (path === key || path.startsWith(key + "/")) {
        return key;
      }
    }
    return "/dashboard";
  };

  const currentPath = getCurrentPath();
  const config = PAGE_CONFIG[currentPath] || PAGE_CONFIG["/dashboard"];
  const Icon = config.icon;

  // User laden
  useEffect(() => {
    (async () => {
      const me = await base44.auth.me();
      setUser(me);
      if (!me) return;
      if (me.role === "admin") { setOrgRole("organization_admin"); return; }
      const memberships = await base44.entities.OrganizationMember.filter({ user_email: me.email, status: "active" });
      setOrgRole(memberships?.[0]?.role || "sales_rep");
    })();
  }, []);

  const isAdmin = user?.role === "admin" || orgRole === "organization_admin";

  // Suche: bei Enter navigieren
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/leads?search=${encodeURIComponent(searchQuery)}`);
    setSearchOpen(false);
  };

  // Live-Suche: bei jedem Tastendruck navigieren wenn bereits auf Leads
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (location.pathname === "/leads") {
      const params = new URLSearchParams(window.location.search);
      if (val) { params.set("search", val); } else { params.delete("search"); }
      navigate(`/leads?${params.toString()}`, { replace: true });
    }
  };

  // Mobile Search Toggle
  const toggleSearch = () => setSearchOpen(!searchOpen);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[76px]">
          
          {/* Links: Logo + Titel */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Logo */}
            <Link to="/dashboard" className="shrink-0 hidden sm:flex">
              <VertrieboLogo size="sm" className="h-7 w-auto" />
            </Link>
            {/* Mobile Back Button für Sub-Pages */}
            {isSubPage && (
              <button onClick={() => navigate(-1)} className="sm:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            {/* Titel */}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 truncate">{config.title}</h1>
              <p className="text-xs font-medium text-slate-600 truncate">{config.subtitle}</p>
            </div>
          </div>

          {/* Mitte: Suche (Desktop immer sichtbar, Mobile nur als Icon) */}
          {config.showSearch && (
            <>
              {/* Desktop Suche */}
              <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
                <form onSubmit={handleSearch} className="w-full relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder={config.searchPlaceholder}
                    className="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                  />
                </form>
              </div>

              {/* Mobile Search Button */}
              <button onClick={toggleSearch} className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
              </button>
            </>
          )}

          {/* Rechts: Aktionen & User */}
          <div className="flex items-center gap-3">
            {/* Primary Action Button */}
            {config.primaryAction && (
              <Link to={config.primaryAction.href}>
                <Button size="sm" className="hidden sm:inline-flex gap-1.5">
                  <Plus className="w-4 h-4" />
                  {config.primaryAction.label}
                </Button>
                {/* Mobile: nur Icon */}
                <Button size="icon" variant="outline" className="sm:hidden h-9 w-9">
                  <Plus className="w-4 h-4" />
                </Button>
              </Link>
            )}

            {/* Notification Bell - removed (no fake notifications) */}

            {/* User Menu */}
            {user && (
              <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900 truncate max-w-[150px]">{user.full_name || "Benutzer"}</p>
                  <p className="text-[10px] font-medium text-slate-600 capitalize">
                    {orgRole === "organization_admin" ? "Admin" : orgRole === "sales_rep" ? "Vertriebler" : user.role || "Vertriebler"}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center text-sm font-bold text-blue-600 border border-blue-200">
                  {user.full_name?.charAt(0) || "U"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Search Bar (ausklappbar) */}
        {searchOpen && config.showSearch && (
          <div className="md:hidden pb-3">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder={config.searchPlaceholder}
                className="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white"
                autoFocus
              />
            </form>
          </div>
        )}
      </div>
    </header>
  );
}