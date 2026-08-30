import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ExternalLink } from "lucide-react";

const STATUS_COLORS = {
  active: { bg: "bg-green-100", text: "text-green-700", label: "Aktiv" },
  trialing: { bg: "bg-blue-100", text: "text-blue-700", label: "Trial" },
  past_due: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Zahlung offen" },
  canceled: { bg: "bg-red-100", text: "text-red-700", label: "Gekündigt" },
};

export default function Digistore24Panel() {
  const [subs, setSubs] = useState([]);
  const [orgs, setOrgs] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Load all digistore24 subscriptions
        const allSubs = await base44.entities.Subscription.filter({ source: "digistore24" }, "-created_date", 200);
        setSubs(allSubs || []);

        // Load orgs for display
        const orgIds = [...new Set((allSubs || []).map(s => s.organization_id).filter(Boolean))];
        if (orgIds.length > 0) {
          const orgList = await base44.entities.Organization.filter({});
          const orgMap = {};
          (orgList || []).forEach(o => { orgMap[o.id] = o; });
          setOrgs(orgMap);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeSubs = subs.filter(s => s.status === "active");
  const mrrEst = activeSubs.reduce((acc, s) => {
    const plan = s.plan_id; // Plan name not loaded here, use flat estimate
    return acc; // MRR calculation requires plan data — shown as count-based
  }, 0);

  const statusCounts = subs.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Lade Digistore24-Daten…</div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Gesamt", value: subs.length, color: "text-slate-800" },
          { label: "Aktiv", value: activeSubs.length, color: "text-green-700" },
          { label: "Past Due", value: statusCounts["past_due"] || 0, color: "text-yellow-700" },
          { label: "Gekündigt", value: statusCounts["canceled"] || 0, color: "text-red-600" },
        ].map((kpi, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
            <p className={`text-3xl font-black ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wide">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Subscription Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Digistore24 Abonnements</h3>
          <a href="https://www.digistore24.com" target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            Digistore24 öffnen <ExternalLink size={11} />
          </a>
        </div>

        {subs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm font-medium">Noch keine Digistore24-Käufe</p>
            <p className="text-xs mt-1">Sobald ein Kunde über einen Affiliate-Link kauft, erscheint er hier.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Organisation</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Order ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Affiliate ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Erstellt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {subs.map((sub, i) => {
                  const org = orgs[sub.organization_id];
                  const sc = STATUS_COLORS[sub.status] || { bg: "bg-slate-100", text: "text-slate-600", label: sub.status };
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{org?.name || sub.organization_id?.slice(0, 8) + "…"}</p>
                        <p className="text-slate-400">{org?.owner_email || "—"}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{sub.digistore24_order_id || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{sub.affiliate_id || <span className="text-slate-300">Direkt</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${sc.bg} ${sc.text}`}>{sc.label}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {sub.created_date ? new Date(sub.created_date).toLocaleDateString("de-DE") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Setup Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <p className="text-sm font-bold text-blue-800 mb-2">⚙️ Einrichtung</p>
        <div className="space-y-1 text-xs text-blue-700">
          <p>1. <strong>Webhook-URL</strong> in Digistore24 → Einstellungen → IPN eintragen:</p>
          <code className="block bg-blue-100 px-3 py-1.5 rounded font-mono text-blue-900 mt-1 mb-2">
            https://vertriebo.base44.app/functions/digistore24Webhook
          </code>
          <p>2. <strong>Secret</strong> als <code className="bg-blue-100 px-1 rounded">DIGISTORE24_WEBHOOK_SECRET</code> in Settings → Secrets hinterlegen.</p>
          <p>3. <strong>Plan-Mapping</strong>: In der Plan-Verwaltung jedem Plan die <code className="bg-blue-100 px-1 rounded">digistore24_product_id</code> zuweisen.</p>
          <p>4. <strong>Affiliates-Seite</strong>: <a href="/affiliates" className="underline" target="_blank">/affiliates</a> – Promo-Link für Partner.</p>
        </div>
      </div>
    </div>
  );
}