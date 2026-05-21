import { Building2, Phone, Mail, Calendar, User, TrendingUp, Star, Check, X, PhoneCall, MessageSquare, FileText, Clock, MapPin, Briefcase } from "lucide-react";
import VertrieboLogo from "@/components/VertrieboLogo";

const PRIORITIZED_LEADS = [
  { name: "Schmidt Gebäudereinigung GmbH", branche: "Gebäudereinigung", ort: "Berlin", prio: "Hoch", status: "Rückruf" },
  { name: "Hausmeisterdienst Müller", branche: "Facility Management", ort: "Potsdam", prio: "Hoch", status: "Erstkontakt" },
  { name: "Security Services Nord", branche: "Sicherheitsdienst", ort: "Hamburg", prio: "Mittel", status: "Angebot" },
  { name: "Gartenbau Schmidt GmbH", branche: "Garten- und Landschaftsbau", ort: "Berlin", prio: "Mittel", status: "Termin" },
];

const TODAY_TASKS = [
  { time: "09:00", type: "Rückruf", company: "Schmidt Gebäudereinigung", status: "offen" },
  { time: "11:30", type: "Angebot senden", company: "Müller Facility", status: "offen" },
  { time: "14:00", type: "Termin", company: "Security Services Nord", status: "bestätigt" },
  { time: "16:00", type: "Nachfassen", company: "Gartenbau Schmidt", status: "offen" },
];

export default function ProductShowcase() {
  return (
    <div style={{ background: "#020617", padding: "60px 20px", overflowX: "hidden" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 4px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 16 }}>
            So arbeiten Sie mit Vertriebo
          </h2>
          <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", maxWidth: 700, margin: "0 auto" }}>
            Vertriebo führt Sie durch den Vertriebsalltag – von neuen Firmenkontakten über Rückrufe bis zum Nachfassen.
          </p>
        </div>

        {/* Haupt-Mockup */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20,
          overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.8),0 0 0 1px rgba(37,99,235,0.2)"
        }}>
          {/* Browser Header */}
          <div style={{ background: "#0f172a", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(239,68,68,0.6)" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(245,158,11,0.6)" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(34,197,94,0.6)" }} />
            </div>
            <div style={{ fontSize: 11, color: "rgba(100,116,139,1)", fontFamily: "monospace" }}>app.vertriebo.com/dashboard</div>
            <div style={{ width: 40 }} />
          </div>

          {/* App Header */}
          <div style={{ background: "#0c1428", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <VertrieboLogo variant="outline" size="sm" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "white" }}>Dashboard</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(148,163,184,1)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "white" }}>
                MM
              </div>
              <span>Max Mustermann</span>
            </div>
          </div>

          {/* Dashboard Content */}
          <div style={{ padding: "16px 12px", overflowX: "auto" }}>
            {/* Stats Row - Realistische Zahlen */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 16 }}>
              <div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: "#93c5fd", textTransform: "uppercase" }}>Heute fällig</span>
                  <Calendar size={12} color="#60a5fa" />
                </div>
                <p style={{ fontSize: 22, fontWeight: 900, color: "#60a5fa" }}>8</p>
                <p style={{ fontSize: 9, color: "rgba(148,163,184,1)", marginTop: 3 }}>Rückrufe</p>
              </div>
              <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: "#86efac", textTransform: "uppercase" }}>Offen</span>
                  <Building2 size={12} color="#4ade80" />
                </div>
                <p style={{ fontSize: 22, fontWeight: 900, color: "#4ade80" }}>34</p>
                <p style={{ fontSize: 9, color: "rgba(148,163,184,1)", marginTop: 3 }}>Leads</p>
              </div>
              <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: "#c4b5fd", textTransform: "uppercase" }}>Woche</span>
                  <TrendingUp size={12} color="#a78bfa" />
                </div>
                <p style={{ fontSize: 22, fontWeight: 900, color: "#a78bfa" }}>18</p>
                <p style={{ fontSize: 9, color: "rgba(148,163,184,1)", marginTop: 3 }}>Anrufe</p>
              </div>
              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "10px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: "#fcd34d", textTransform: "uppercase" }}>Quote</span>
                  <Star size={12} color="#fbbfbbf24" />
                </div>
                <p style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>22%</p>
                <p style={{ fontSize: 9, color: "rgba(148,163,184,1)", marginTop: 3 }}>Ø</p>
              </div>
            </div>

            {/* Main Content */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              {/* Prioritized Leads */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 800, color: "white", display: "flex", alignItems: "center", gap: 4 }}>
                    <Star size={10} fill="#fbbf24" color="#fbbf24" />
                    Priorisierte Leads
                  </h3>
                  <button style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Alle →</button>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {PRIORITIZED_LEADS.map((lead, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px",
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8, transition: "all 0.2s", cursor: "pointer"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        <div style={{ width: 28, height: 28, background: "rgba(37,99,235,0.1)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Building2 size={14} color="#60a5fa" />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.name}</p>
                          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, color: "rgba(100,116,139,1)" }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.branche}</span>
                            <span>·</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.ort}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 999, whiteSpace: "nowrap",
                          background: lead.prio === "Hoch" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                          color: lead.prio === "Hoch" ? "#f87171" : "#fbbf24",
                          border: `1px solid ${lead.prio === "Hoch" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`
                        }}>
                          {lead.prio}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's Tasks */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 800, color: "white", display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={10} color="#60a5fa" />
                    Heute
                  </h3>
                  <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(100,116,139,1)" }}>4 Aufgaben</span>
                </div>
                
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 8 }}>
                  {TODAY_TASKS.map((task, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: i < TODAY_TASKS.length - 1 ? 6 : 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,1)", width: 32, flexShrink: 0 }}>{task.time}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.type}</p>
                        <p style={{ fontSize: 8, color: "rgba(100,116,139,1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.company}</p>
                      </div>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: task.status === "bestätigt" ? "#22c55e" : "#f59e0b", flexShrink: 0, marginTop: 2 }} />
                    </div>
                  ))}
                </div>

                {/* Quick Actions */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
                  <button style={{
                    padding: "8px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)",
                    borderRadius: 8, color: "#93c5fd", fontSize: 9, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "inherit"
                  }}>
                    <PhoneCall size={10} /> Anrufen
                  </button>
                  <button style={{
                    padding: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, color: "rgba(148,163,184,1)", fontSize: 9, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "inherit"
                  }}>
                    <MessageSquare size={10} /> Loggen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}