/**
 * LifecycleStageBadge
 * ===================
 * Zeigt Company.lifecycle_stage als Badge.
 * Optional: Dropdown für Admin/Owner/Sales-Rep zum Ändern.
 * Stage-Change wird via updateLifecycleStage (Backend) geloggt.
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STAGES = [
  { value: "lead",      label: "Lead",        color: "bg-slate-100 text-slate-700 border-slate-300" },
  { value: "qualified", label: "Qualifiziert", color: "bg-blue-50 text-blue-700 border-blue-300" },
  { value: "customer",  label: "Kunde",        color: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  { value: "lost",      label: "Verloren",     color: "bg-red-50 text-red-600 border-red-300" },
  { value: "archived",  label: "Archiviert",   color: "bg-gray-100 text-gray-500 border-gray-300" },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.value, s]));

export default function LifecycleStageBadge({ company, organizationId, canEdit = false, onChanged }) {
  const [saving, setSaving] = useState(false);
  const [currentStage, setCurrentStage] = useState(company?.lifecycle_stage || "lead");

  const stageConfig = STAGE_MAP[currentStage] || STAGE_MAP["lead"];

  const handleChange = async (newStage) => {
    if (newStage === currentStage || saving) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke("updateLifecycleStage", {
        company_id: company.id,
        organization_id: organizationId,
        new_stage: newStage,
      });
      if (res.data?.error) {
        toast.error("Fehler: " + res.data.error);
        return;
      }
      setCurrentStage(newStage);
      toast.success(`Lifecycle-Stage: ${STAGE_MAP[newStage]?.label}`);
      if (onChanged) onChanged(newStage);
    } catch (e) {
      toast.error("Fehler beim Speichern: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full ${stageConfig.color}`}>
        {stageConfig.label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={saving}
          className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full transition-opacity hover:opacity-80 ${stageConfig.color} ${saving ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {saving
            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
            : null
          }
          {stageConfig.label}
          {!saving && <ChevronDown className="w-2.5 h-2.5 opacity-60" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STAGES.map(s => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => handleChange(s.value)}
            className={`text-xs font-semibold ${s.value === currentStage ? "opacity-40 cursor-default pointer-events-none" : ""}`}
          >
            <span className={`inline-block w-2 h-2 rounded-full mr-2 border ${s.color}`} />
            {s.label}
            {s.value === currentStage && " ✓"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}