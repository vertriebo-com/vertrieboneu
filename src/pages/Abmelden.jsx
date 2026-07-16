import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function Abmelden() {
  const [status, setStatus] = useState("loading"); // loading | success | already | error | invalid

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orgId = params.get("org_id");
    const email = params.get("email");

    if (!orgId || !email) {
      setStatus("invalid");
      return;
    }

    base44.functions.invoke("unsubscribeEngagementEmails", { org_id: orgId, email })
      .then((res) => {
        const d = res?.data;
        if (d?.already) setStatus("already");
        else if (d?.success) setStatus("success");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));
  }, []);

  const content = {
    loading: { icon: "⏳", title: "Einen Moment…", msg: "Deine Abmeldung wird verarbeitet.", color: "#6b7280" },
    success: { icon: "✅", title: "Erfolgreich abgemeldet", msg: "Du erhältst keine automatischen Erinnerungs-E-Mails mehr von Vertriebo.", color: "#16a34a" },
    already:  { icon: "✅", title: "Bereits abgemeldet", msg: "Du warst bereits von automatischen E-Mail-Erinnerungen abgemeldet.", color: "#16a34a" },
    invalid:  { icon: "❌", title: "Ungültiger Link", msg: "Der Abmelde-Link ist ungültig oder abgelaufen.", color: "#dc2626" },
    error:    { icon: "❌", title: "Fehler aufgetreten", msg: "Bitte versuche es erneut oder wende dich an den Support.", color: "#dc2626" },
  };

  const c = content[status];

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: "#f1f5f9", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 4px 24px rgba(0,0,0,0.10)", padding: "48px 40px", maxWidth: "460px", width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "52px", marginBottom: "16px" }}>{c.icon}</div>
        <h1 style={{ fontSize: "22px", fontWeight: "900", color: "#111827", marginBottom: "12px" }}>{c.title}</h1>
        <p style={{ fontSize: "14px", color: "#6b7280", lineHeight: "1.6", marginBottom: "28px" }}>{c.msg}</p>
        {(status === "success" || status === "already") && (
          <p style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "20px" }}>
            Du kannst diese Einstellung jederzeit in deinen Vertriebo-Einstellungen ändern.
          </p>
        )}
        <a href="https://app.vertriebo.com" style={{ display: "inline-block", marginTop: "8px", background: "#2563eb", color: "#fff", fontWeight: "700", fontSize: "14px", textDecoration: "none", padding: "12px 28px", borderRadius: "8px" }}>
          Zurück zu Vertriebo
        </a>
      </div>
    </div>
  );
}