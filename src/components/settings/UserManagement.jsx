/**
 * UserManagement – MVP: zeigt nur den aktuellen Account-Inhaber.
 * Keine Team-Einladungen, keine Mitgliederverwaltung für normale Kunden.
 * PlatformAdmin-Verwaltung erfolgt separat über /platform/admin.
 */
import { User, Mail, Crown } from "lucide-react";
import SettingsSection from "./SettingsSection";

export default function UserManagement({ currentUser }) {
  return (
    <div className="space-y-4">
      <SettingsSection
        icon={User}
        title="Mein Konto"
        description="Ihr persönlicher Zugang zu Vertriebo."
      >
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700 shrink-0">
              {currentUser?.full_name?.charAt(0)?.toUpperCase() || currentUser?.email?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900 truncate">{currentUser?.full_name || "—"}</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                  <Crown className="w-2.5 h-2.5" /> Inhaber
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">{currentUser?.email}</p>
            </div>
          </div>
        </div>
      </SettingsSection>

      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Mail className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
        <p className="text-sm font-medium text-slate-700">
          Im MVP hat jedes Vertriebo-Paket genau einen Nutzeraccount. Wenn ein weiterer Vertriebler
          einen eigenen Zugang benötigt, registriert er sich separat mit eigener E-Mail und eigenem Plan.
        </p>
      </div>
    </div>
  );
}