import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import MobileBottomNav from "./MobileBottomNav";
import AppHeader from "./AppHeader";
import VertrieboLogo from "./VertrieboLogo";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard,
  Users,
  ListTodo,
  BarChart3,
  Ban,
  Settings,
  Menu,
  X,
  Building2,
  LogOut,
  ChevronRight,
  CalendarCheck } from
"lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
{ path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
{ path: "/leads", label: "Leads", icon: Building2 },
{ path: "/tasks", label: "Aufgaben", icon: ListTodo },
{ path: "/calendar", label: "Kalender", icon: CalendarCheck },
{ path: "/blacklist", label: "Blacklist", icon: Ban },
{ path: "/statistics", label: "Statistiken", icon: BarChart3, adminOnly: true },
{ path: "/settings", label: "Einstellungen", icon: Settings, adminOnly: true }];


// Sub-pages that should show a back button on mobile
const SUB_PAGES = ["/leads/", "/tasks/"];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [orgRole, setOrgRole] = useState(null);

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me();
      setUser(me);
      if (!me) return;
      // MVP: 1 Account = 1 Owner → Owner ist automatisch Admin
      if (me.role === "admin") {setOrgRole("organization_admin");return;}
      // Owner-Status prüfen
      const orgs = await base44.entities.Organization.filter({ owner_email: me.email });
      setOrgRole(orgs?.[0] ? "organization_admin" : "sales_rep");
    })();
  }, []);

  const isAdmin = user?.role === "admin" || orgRole === "organization_admin";

  // Einstellungen immer zeigen für Admin/OrgAdmin, Statistiken nur für Admin
  const filteredNav = NAV_ITEMS.filter(
    (item) => item.path !== "/statistics" || isAdmin
  );

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F6F8FB]">
      {/* Mobile overlay */}
      {sidebarOpen &&
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={() => setSidebarOpen(false)} />

      }

      {/* Sidebar - Clean Light CRM */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E2E8F0] flex flex-col transition-transform duration-300 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`
        }>
        
        {/* Logo - Sauber dargestellt */}
        <div className="px-4 py-5 border-b border-[#E2E8F0]">
          <Link to="/dashboard" className="flex items-center justify-center">
            <img
              src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/cd7488d03_ChatGPTImage18Mai202615_41_39.png"
              alt="Vertriebo"
              className="w-auto object-contain h-28" />
            
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive ?
                "bg-blue-50 text-blue-700 border border-blue-200 shadow-sm" :
                "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`
                }>
                
                <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                <span className="flex-1">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-600" />}
              </Link>);

          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-[#E2E8F0]">
          {user &&
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center text-sm font-bold text-blue-600 border border-blue-200">
                  {user.full_name?.charAt(0) || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{user.full_name || "Benutzer"}</p>
                  <p className="text-[10px] font-medium text-slate-600 capitalize">
                    {orgRole === "organization_admin" ? "Admin" : orgRole === "sales_rep" ? "Vertriebler" : user.role || "Vertriebler"}
                  </p>
                </div>
                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-200/50 rounded-lg">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          }
        </div>
      </aside>

      {/* Main Content - Clean Light Background */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F6F8FB]">
        {/* App Header - Zentrale Header-Komponente */}
        <AppHeader />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-5 lg:p-8" style={{ overscrollBehavior: "none", paddingLeft: "max(1.25rem, env(safe-area-inset-left))", paddingRight: "max(1.25rem, env(safe-area-inset-right))" }}>
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileBottomNav />
    </div>);

}