import { useAuth } from "@/lib/AuthContext";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * PlatformRouteGuard
 * Schützt alle /platform/* Routen vor unbefugtem Zugriff.
 * Nur Platform-Admins dürfen Zugriff haben.
 * 
 * Security-Level:
 * 1. Auth-Loading → Loading-Screen (kein Content)
 * 2. Nicht authentisiert → Redirect zu "/" (Landing)
 * 3. Authentisiert aber keine Admin-Rolle → 403-Seite
 * 4. Admin → Zugriff erlaubt
 */
export default function PlatformRouteGuard({ children }) {
  const { user, isLoadingAuth } = useAuth();

  // 1. Auth-Loading: Kein Content rendern, nur Loading
  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // 2. Nicht authentisiert → Redirect zu Landing
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // 3. Authentisiert aber keine Admin-Rolle → 403-Seite
  const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>

          <h1 className="text-lg font-bold text-slate-900 text-center mb-2">
            Kein Zugriff
          </h1>

          <p className="text-sm text-slate-600 text-center mb-6">
            Du hast keine Berechtigung, auf das interne Plattform-Dashboard zuzugreifen.
          </p>

          <Link to="/dashboard">
            <Button className="w-full gap-2 bg-slate-800 hover:bg-slate-900 text-white">
              <ArrowLeft className="w-4 h-4" /> Zurück zum Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // 4. Admin → Zugriff erlaubt
  return children;
}