import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import CookieBanner from "@/components/CookieBanner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PlatformRouteGuard from './components/PlatformRouteGuard';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import PlatformAdmin from './pages/PlatformAdmin';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Tasks from './pages/Tasks';
import Statistics from './pages/Statistics';
import BlacklistPage from './pages/BlacklistPage';
import SettingsPage from './pages/SettingsPage';
import CalendarView from './pages/CalendarView';
import ExternalSourcesPage from './pages/ExternalSourcesPage';
import Landing from './pages/Landing';
import Start from './pages/Start';
import Onboarding from './pages/Onboarding';
import Impressum from './pages/Impressum';
import Datenschutz from './pages/Datenschutz';
import AGB from './pages/AGB';
import AccountSuspended from './pages/AccountSuspended';
import AnmeldenPage from './pages/AnmeldenPage';
import RegisterPage from './pages/RegisterPage';
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const AnimatedRoutes = ({ children }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
        className="contents"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

// Spinner helper
const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

// Public-only routes: Landing, Onboarding (no auth needed)
const PublicApp = () => {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/start" element={<Start />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/impressum" element={<Impressum />} />
      <Route path="/datenschutz" element={<Datenschutz />} />
      <Route path="/agb" element={<AGB />} />
      <Route path="/account-suspended" element={<AccountSuspended />} />
      <Route path="/anmelden" element={<AnmeldenPage />} />
      <Route path="/registrieren" element={<RegisterPage />} />
      {/* Everything else goes through the authenticated app */}
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
};


// Onboarding guard: checks per-organization onboarding status, platform role & suspension status
const OnboardingGuard = ({ children }) => {
  const [checked, setChecked] = useState(false);
  const [redirect, setRedirect] = useState(null);
  const [suspendedOrg, setSuspendedOrg] = useState(null);
  const location = useLocation();

  useEffect(() => {
    (async () => {
      try {
        const user = await base44.auth.me();
        if (!user) { setRedirect("/"); setChecked(true); return; }

        // Überprüfe globale Plattformrolle (höchste Priorität)
        const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);
        const isSupportRole = ["support_agent", "readonly_support"].includes(user.role);

        // Wenn Plattform-Admin auf "/" (oder Onboarding) landet, zu /platform/admin
        if ((isPlatformAdmin || isSupportRole) && (location.pathname === "/" || location.pathname === "/onboarding")) {
          setRedirect("/platform/admin");
          setChecked(true);
          return;
        }

        // Platform-Admins dürfen überall rein, auch zu gesperrten Orgs
        if (isPlatformAdmin || isSupportRole) {
          setRedirect(null);
          setChecked(true);
          return;
        }

        // MVP: Single-Account – nur Owner-Org
        let org = null;
        const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
        org = orgs?.[0] || null;

        if (!org) {
          // Keine Organisation → Onboarding (Plan auswählen & einrichten)
          setRedirect("/onboarding");
        } else {
          // Check: Organisation gesperrt?
          if (org.platform_status === "suspended") {
            setSuspendedOrg(org);
            setRedirect("/account-suspended");
            setChecked(true);
            return;
          }

          const billingOk = ["active", "trialing", "preview"].includes(org.billing_status);
          if (!billingOk) {
            // Kein aktives Abo → zurück zur Landing-Page zur Plan-Auswahl
            setRedirect("/");
          } else if (!org.onboarding_done) {
            setRedirect("/onboarding");
          } else {
            setRedirect(null); // alles ok
          }
        }
      } catch {
        // Bei Fehler nicht blockieren
      } finally {
        setChecked(true);
      }
    })();
  }, [location.pathname]);

  if (!checked) return <Spinner />;

  // Account Suspended page
  if (redirect === "/account-suspended" && location.pathname !== "/account-suspended") {
    return <Navigate to="/account-suspended" replace />;
  }

  if (location.pathname === "/account-suspended") {
    return <AccountSuspended suspendedReason={suspendedOrg?.suspended_reason} suspendedAt={suspendedOrg?.suspended_at} />;
  }

  if (redirect && location.pathname !== "/onboarding" && location.pathname !== redirect) {
    return <Navigate to={redirect} replace />;
  }

  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) return <Spinner />;

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  // Not authenticated → back to landing
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <OnboardingGuard>
      <Routes>
        <Route path="/platform/admin" element={<PlatformRouteGuard><PlatformAdmin /></PlatformRouteGuard>} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<AnimatedRoutes><Dashboard /></AnimatedRoutes>} />
          <Route path="/leads" element={<AnimatedRoutes><Leads /></AnimatedRoutes>} />
          <Route path="/leads/:id" element={<AnimatedRoutes><LeadDetail /></AnimatedRoutes>} />
          <Route path="/tasks" element={<AnimatedRoutes><Tasks /></AnimatedRoutes>} />
          <Route path="/statistics" element={<AnimatedRoutes><Statistics /></AnimatedRoutes>} />
          <Route path="/import" element={<Navigate to="/dashboard" replace />} />
          <Route path="/blacklist" element={<AnimatedRoutes><BlacklistPage /></AnimatedRoutes>} />
          <Route path="/settings" element={<AnimatedRoutes><SettingsPage /></AnimatedRoutes>} />
          <Route path="/calendar" element={<AnimatedRoutes><CalendarView /></AnimatedRoutes>} />
          <Route path="/import-kandidaten" element={<AnimatedRoutes><ExternalSourcesPage /></AnimatedRoutes>} />
          <Route path="/duplicates" element={<Navigate to="/dashboard" replace />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="*" element={<PageNotFound />} />
        </Route>
      </Routes>
    </OnboardingGuard>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <PublicApp />
        </Router>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
        <CookieBanner />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;