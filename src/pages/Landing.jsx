import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowRight, CheckCircle2, Star } from "lucide-react";

// ─── APP MOCKUPS – Dark Premium WOW Design ──────────────────────────────────

// Sidebar-Icons der echten App (SVG-Shapes statt Emoji für Präzision)
const SidebarIcon = ({ active, children }) => (
  <div style={{
    width: 34, height: 34, borderRadius: 9,
    background: active ? "rgba(37,99,235,0.35)" : "rgba(255,255,255,0.04)",
    border: active ? "1px solid rgba(37,99,235,0.6)" : "1px solid transparent",
    boxShadow: active ? "0 0 12px rgba(37,99,235,0.3)" : "none",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
    transition: "all 0.15s",
  }}>{children}</div>
);

// Gemeinsame App-Shell: dunkle Titelbar + echte dunkle Sidebar
const AppShell = ({ url, activeIdx = 1, children }) => (
  <div style={{
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(37,99,235,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
    background: "#0c1525",
  }}>
    {/* Browser-Chrome */}
    <div style={{ background: "#060d1a", padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", gap: 5 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
      </div>
      <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "3px 10px", fontSize: 10, color: "rgba(100,116,139,1)", textAlign: "center", fontFamily: "monospace", letterSpacing: 0.3 }}>
        🔒 {url}
      </div>
    </div>
    {/* Layout: Sidebar + Content */}
    <div style={{ display: "flex" }}>
      {/* ─── SIDEBAR wie echte App (dunkel, #0f172a) ─── */}
      <div style={{
        width: 52, background: "#070d1b",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: 12, gap: 5, flexShrink: 0,
      }}>
        {/* Logo-Dot */}
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#2563eb,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, fontSize: 13 }}>V</div>
        <SidebarIcon active={false}>📊</SidebarIcon>
        <SidebarIcon active={activeIdx === 1}>👥</SidebarIcon>
        <SidebarIcon active={activeIdx === 2}>📋</SidebarIcon>
        <SidebarIcon active={false}>✉️</SidebarIcon>
        <div style={{ flex: 1 }} />
        <SidebarIcon active={false}>⚙️</SidebarIcon>
        <div style={{ height: 10 }} />
      </div>
      {/* ─── Page Content (dunkel wie App-BG) ─── */}
      <div style={{ flex: 1, background: "#0f1a2e", overflow: "hidden", minHeight: 360 }}>
        {children}
      </div>
    </div>
  </div>
);

// Status-Badge (dunkle Variante für dunkles BG)
const DarkStatusBadge = ({ status }) => {
  const m = {
    "Rückruf": { bg: "rgba(217,119,6,0.15)", color: "#fbbf24", border: "rgba(217,119,6,0.4)" },
    "Termin":  { bg: "rgba(124,58,237,0.15)", color: "#c4b5fd", border: "rgba(124,58,237,0.4)" },
    "Kontakt": { bg: "rgba(13,148,136,0.15)", color: "#5eead4", border: "rgba(13,148,136,0.4)" },
    "Neu":     { bg: "rgba(37,99,235,0.15)", color: "#93c5fd", border: "rgba(37,99,235,0.4)" },
    "Angebot": { bg: "rgba(67,56,202,0.15)", color: "#a5b4fc", border: "rgba(67,56,202,0.4)" },
  };
  const s = m[status] || m["Neu"];
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{status}</span>;
};

// ── LEADS MOCKUP ──────────────────────────────────────────────────────────────
const LeadsMockup = () => (
  <AppShell url="app.vertriebo.com/leads" activeIdx={1}>
    <div style={{ padding: "14px 14px 10px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: "white", letterSpacing: -0.3 }}>Leads</p>
          <p style={{ fontSize: 10, color: "rgba(100,116,139,1)", marginTop: 1 }}>47 Firmenkontakte · <span style={{ color: "#fbbf24" }}>3 Rückrufe offen</span></p>
        </div>
        <div style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius: 8, padding: "6px 11px", fontSize: 10, fontWeight: 700, color: "white", boxShadow: "0 0 16px rgba(37,99,235,0.5)", display: "flex", alignItems: "center", gap: 5 }}>
          ✨ Recherche starten
        </div>
      </div>

      {/* Pipeline Balken */}
      <div style={{ display: "flex", gap: 3, marginBottom: 11 }}>
        {[{ l: "Neu", n: 23, c: "#3b82f6", w: "35%" }, { l: "Kontakt", n: 12, c: "#14b8a6", w: "22%" }, { l: "Rückruf", n: 3, c: "#f59e0b", w: "10%" }, { l: "Termin", n: 5, c: "#a78bfa", w: "16%" }, { l: "Angebot", n: 4, c: "#6366f1", w: "14%" }].map(s => (
          <div key={s.l} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "5px 4px", textAlign: "center", borderTop: `2px solid ${s.c}` }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.n}</p>
            <p style={{ fontSize: 8, color: "rgba(100,116,139,1)", fontWeight: 600, marginTop: 2 }}>{s.l}</p>
          </div>
        ))}
      </div>

      {/* Lead Rows */}
      {[
        { name: "Schmidt Gebäudedienste GmbH", branche: "Gebäudereinigung", ort: "Frankfurt", score: 94, status: "Rückruf", hot: true },
        { name: "IT-Systemhaus Müller & Co.", branche: "IT-Service", ort: "Darmstadt", score: 87, status: "Termin", hot: false },
        { name: "Hausmeisterdienst Koch KG", branche: "Facility Service", ort: "Wiesbaden", score: 71, status: "Kontakt", hot: false },
        { name: "Facility Pro GmbH", branche: "Gebäudeservice", ort: "Offenbach", score: 65, status: "Neu", hot: false },
      ].map((lead, i) => (
        <div key={i} style={{
          background: i === 0 ? "rgba(37,99,235,0.08)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${i === 0 ? "rgba(37,99,235,0.25)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 10, padding: "8px 11px", marginBottom: 5,
          display: "flex", alignItems: "center", gap: 9,
          boxShadow: i === 0 ? "0 0 20px rgba(37,99,235,0.08)" : "none",
        }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: lead.hot ? "rgba(251,191,36,0.15)" : "rgba(37,99,235,0.12)", border: `1px solid ${lead.hot ? "rgba(251,191,36,0.4)" : "rgba(37,99,235,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
            {lead.hot ? "🔥" : "🏢"}
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.name}</p>
            <p style={{ fontSize: 9.5, color: "rgba(100,116,139,1)", marginTop: 2 }}>{lead.branche} · 📍 {lead.ort}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            {lead.hot && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>🔥 Heiß</span>}
            <DarkStatusBadge status={lead.status} />
            <span style={{ fontSize: 12, fontWeight: 900, color: lead.score >= 90 ? "#4ade80" : lead.score >= 80 ? "#60a5fa" : "#a78bfa" }}>{lead.score}</span>
          </div>
        </div>
      ))}
    </div>
  </AppShell>
);

// ── DASHBOARD MOCKUP ──────────────────────────────────────────────────────────
const DashboardMockup = () => (
  <AppShell url="app.vertriebo.com/dashboard" activeIdx={0}>
    <div style={{ padding: "14px 14px 10px" }}>
      <p style={{ fontSize: 15, fontWeight: 800, color: "white", letterSpacing: -0.3 }}>Guten Morgen 👋</p>
      <p style={{ fontSize: 10, color: "rgba(100,116,139,1)", marginBottom: 12, marginTop: 1 }}>6 Prioritäten warten auf Sie heute.</p>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginBottom: 12 }}>
        {[
          { t: "Heute", v: "6", s: "Aktionen", bg: "rgba(37,99,235,0.12)", border: "rgba(37,99,235,0.3)", c: "#93c5fd", glow: "rgba(37,99,235,0.2)" },
          { t: "Leads", v: "47", s: "Aktiv", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.28)", c: "#4ade80", glow: "rgba(34,197,94,0.15)" },
          { t: "Pipeline", v: "€18k", s: "Monat", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.28)", c: "#c4b5fd", glow: "rgba(139,92,246,0.15)" },
        ].map(item => (
          <div key={item.t} style={{ background: item.bg, border: `1px solid ${item.border}`, borderRadius: 10, padding: "9px 6px", textAlign: "center", boxShadow: `0 0 16px ${item.glow}` }}>
            <p style={{ fontSize: 8, fontWeight: 700, color: item.c, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, opacity: 0.8 }}>{item.t}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: item.c, lineHeight: 1 }}>{item.v}</p>
            <p style={{ fontSize: 8.5, color: "rgba(100,116,139,1)", marginTop: 3 }}>{item.s}</p>
          </div>
        ))}
      </div>

      {/* Heute wichtig – wie DailyActionList */}
      <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,1)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>⭐ Heute wichtig</p>
      {[
        { company: "Reinigung Bauer KG", label: "Anrufen", sub: "🔥 Heiß · Score 94", bg: "rgba(34,197,94,0.07)", border: "rgba(34,197,94,0.22)", c: "#4ade80", icon: "📞" },
        { company: "Facility Pro GmbH", label: "Follow-up", sub: "Rückruf fällig · Heute 14 Uhr", bg: "rgba(37,99,235,0.08)", border: "rgba(37,99,235,0.22)", c: "#93c5fd", icon: "🔄" },
        { company: "SHK Heinze & Söhne", label: "Opportunity", sub: "Angebot vorbereiten", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.22)", c: "#c4b5fd", icon: "⭐" },
        { company: "Koch Hausmeisterdienst", label: "E-Mail", sub: "Vorlage senden", bg: "rgba(20,184,166,0.07)", border: "rgba(20,184,166,0.22)", c: "#5eead4", icon: "✉️" },
      ].map((item, i) => (
        <div key={i} style={{ background: item.bg, border: `1px solid ${item.border}`, borderRadius: 9, padding: "7px 10px", marginBottom: 5, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{item.icon}</div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.company}</p>
            <p style={{ fontSize: 9.5, color: item.c, marginTop: 1, opacity: 0.85 }}><b>{item.label}</b> · {item.sub}</p>
          </div>
          <span style={{ fontSize: 11, color: item.c, opacity: 0.5 }}>›</span>
        </div>
      ))}
    </div>
  </AppShell>
);

// ── RESEARCH MOCKUP ───────────────────────────────────────────────────────────
const ResearchMockup = () => (
  <AppShell url="app.vertriebo.com/leads" activeIdx={1}>
    <div style={{ padding: "14px 14px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: "white", letterSpacing: -0.3 }}>Automatische Recherche</p>
          <p style={{ fontSize: 10, color: "rgba(100,116,139,1)", marginTop: 1 }}>KI durchsucht Frankfurt · 25km</p>
        </div>
        <div style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 20, padding: "3px 10px", fontSize: 9.5, fontWeight: 700, color: "#4ade80", display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} /> Live
        </div>
      </div>

      {/* Recherche-Fortschritt */}
      <div style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.22)", borderRadius: 12, padding: "12px 13px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", boxShadow: "0 0 8px rgba(59,130,246,0.8)", flexShrink: 0 }} />
            <p style={{ fontSize: 11, fontWeight: 700, color: "#93c5fd" }}>Frankfurt Umgebung läuft…</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 900, color: "#4ade80" }}>✨ 23 neu</span>
        </div>
        <div style={{ background: "rgba(37,99,235,0.15)", borderRadius: 5, height: 6, overflow: "hidden", marginBottom: 7 }}>
          <div style={{ width: "68%", height: "100%", background: "linear-gradient(90deg,#2563eb,#7c3aed)", borderRadius: 5, boxShadow: "0 0 8px rgba(37,99,235,0.6)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <p style={{ fontSize: 10, color: "rgba(100,116,139,1)" }}>47 / 70 Orte durchsucht</p>
          <p style={{ fontSize: 10, color: "rgba(100,116,139,1)" }}>68%</p>
        </div>
        {/* Mini-Statistik */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginTop: 9 }}>
          {[{ l: "Gefunden", v: "142", c: "#60a5fa" }, { l: "Gespeichert", v: "23", c: "#4ade80" }, { l: "Duplikate", v: "11", c: "rgba(100,116,139,1)" }].map(s => (
            <div key={s.l} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: "5px 6px", textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</p>
              <p style={{ fontSize: 8, color: "rgba(100,116,139,1)", marginTop: 2 }}>{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Neue Leads */}
      <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(100,116,139,1)", marginBottom: 7, textTransform: "uppercase", letterSpacing: 1 }}>✨ Gerade gefunden</p>
      {[
        { name: "Reinigungsservice Weber GmbH", ort: "Frankfurt-Nord", branche: "Gebäudereinigung", score: 91, c: "#4ade80" },
        { name: "Hausmeister & Mehr GmbH", ort: "Offenbach", branche: "Facility Service", score: 84, c: "#60a5fa" },
        { name: "Facility Max KG", ort: "Hanau", branche: "Hausmeisterdienst", score: 76, c: "#a78bfa" },
      ].map((l, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 9, padding: "8px 11px", marginBottom: 5, display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>🏢</div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</p>
            <p style={{ fontSize: 9.5, color: "rgba(100,116,139,1)", marginTop: 2 }}>{l.branche} · 📍 {l.ort}</p>
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: l.c, lineHeight: 1 }}>{l.score}</p>
            <p style={{ fontSize: 7.5, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: 0.5 }}>Score</p>
          </div>
        </div>
      ))}
    </div>
  </AppShell>
);

// ─── SECTIONS ────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: "🔍", title: "Automatische Firmenkontakt-Recherche", desc: "Vertriebo durchsucht täglich Ihr Suchgebiet nach neuen B2B-Kontakten – vollautomatisch auf Basis Ihres Kundenprofils. Kein manuelles Googeln mehr.", detail: "Google Places · Alle Orte im Radius · Täglich aktuell", ac: { bg: "rgba(37,99,235,0.06)", bd: "rgba(37,99,235,0.18)", ic: "#60a5fa" } },
  { icon: "🔥", title: "KI-Lead-Scoring & Priorisierung", desc: "Die Vertriebo-KI bewertet jeden Lead 0–100. Heiße Leads landen automatisch oben – Sie kontaktieren immer zuerst den vielversprechendsten Ansprechpartner.", detail: "Score 0–100 · Hot/Warm/Cold · Täglich aktualisiert", ac: { bg: "rgba(239,68,68,0.05)", bd: "rgba(239,68,68,0.15)", ic: "#f87171" } },
  { icon: "📋", title: "Priorisierte Tagesliste", desc: "Jeden Morgen sehen Sie: Wer muss heute angerufen werden? Welche Angebote warten? Welche Follow-ups sind fällig? Einfach losarbeiten.", detail: "Auto-Sortierung · Rückruf-Erinnerungen · To-Do's", ac: { bg: "rgba(245,158,11,0.05)", bd: "rgba(245,158,11,0.15)", ic: "#fbbf24" } },
  { icon: "📞", title: "Vollständige Kontakthistorie", desc: "Alle Gespräche, E-Mails, Notizen und Aufgaben zu jeder Firma – chronologisch und übersichtlich. Auch nach Wochen wissen Sie sofort, was besprochen wurde.", detail: "Anruf-Log · Notizen · E-Mail-Verlauf · Aufgaben", ac: { bg: "rgba(16,185,129,0.05)", bd: "rgba(16,185,129,0.15)", ic: "#34d399" } },
  { icon: "✉️", title: "E-Mail-Vorlagen & Follow-ups", desc: "Professionelle E-Mail-Vorlagen mit Ihrem Branding. Automatische Follow-up-Erinnerungen damit kein Kontakt verloren geht.", detail: "Eigene Vorlagen · Automatische Erinnerungen · Brevo", ac: { bg: "rgba(139,92,246,0.05)", bd: "rgba(139,92,246,0.15)", ic: "#a78bfa" } },
  { icon: "📊", title: "Vertriebscontrolling", desc: "Sehen Sie wie Ihr Vertrieb läuft: Kontaktquote, Conversion-Rate, beste Branchen, ROI der Recherche. Alle Zahlen live, klar und ohne Excel.", detail: "Live-Dashboard · Konversionsrate · ROI-Tracking", ac: { bg: "rgba(99,102,241,0.05)", bd: "rgba(99,102,241,0.15)", ic: "#818cf8" } },
  { icon: "🧠", title: "System das mitlernt", desc: "Vertriebo analysiert Ihre Erfolge: Welche Zielgruppen konvertieren? Welche Suchkategorien bringen die besten Leads? Je mehr Sie nutzen, desto besser wird es.", detail: "Outcome-Feedback · Keyword-Lernen · Optimierung", ac: { bg: "rgba(249,115,22,0.05)", bd: "rgba(249,115,22,0.15)", ic: "#fb923c" } },
  { icon: "🗺️", title: "Lückenlose Gebiets-Abdeckung", desc: "Nicht nur die Kreisstadt – Vertriebo durchsucht alle Orte und Gemeinden in Ihrem Radius. So entgehen Ihnen keine potenziellen Kunden.", detail: "LocationIndex · Alle PLZ · Grid-Suche", ac: { bg: "rgba(20,184,166,0.05)", bd: "rgba(20,184,166,0.15)", ic: "#2dd4bf" } },
];

const TESTIMONIALS = [
  { text: "Ich verbringe täglich 2–3 Stunden damit, Firmenkontakte per Google zu suchen. Ein System das das automatisch erledigt und mir sagt wen ich anrufen soll – genau das fehlt mir.", name: "Markus B.", role: "Geschäftsführer, Gebäudereinigung", city: "Frankfurt am Main", emoji: "🏢", type: "pain" },
  { text: "Rückrufe vergessen, Leads die kalt werden weil wir zu spät nachgefasst haben – das kostet uns jeden Monat bares Geld. Vertriebo klingt wie die Lösung die wir gesucht haben.", name: "Sandra K.", role: "Vertriebsleiterin, IT-Service", city: "München", emoji: "💻", type: "pain" },
  { text: "Ich habe Excel-Listen, ein altes CRM und Sticky Notes. Aber nichts sagt mir morgens: Das sind deine 5 wichtigsten Anrufe heute. Genau das will ich.", name: "Thomas H.", role: "Inhaber, Facility & Hausmeisterservice", city: "Wiesbaden", emoji: "🏠", type: "pain" },
  { text: "Als Dienstleister muss ich ständig neue Kunden akquirieren. Die Idee, dass ein System passende Firmen in meinem Umkreis automatisch findet und nach Potenzial bewertet – das ist genau richtig.", name: "Petra M.", role: "Geschäftsführerin, Catering & Events", city: "Stuttgart", emoji: "🍽️", type: "pain" },
];

const COMPARE_ROWS = [
  { f: "Automatische Firmenrecherche", v: true, c: false, e: false },
  { f: "KI-Lead-Scoring (0–100)", v: true, c: false, e: false },
  { f: "Priorisierte Tagesliste", v: true, c: false, e: false },
  { f: "In 5 Min. startklar", v: true, c: false, e: true },
  { f: "Lückenlose Gebietsabdeckung", v: true, c: false, e: false },
  { f: "Kontakthistorie & CRM", v: true, c: true, e: false },
  { f: "System lernt mit", v: true, c: false, e: false },
  { f: "DSGVO Made in Germany", v: true, c: false, e: false },
  { f: "Monatlich kündbar", v: true, c: false, e: true },
];

const INDUSTRIES = ["🏢 Gebäudereinigung", "🛡️ Sicherheitsdienst", "🏠 Facility Service", "📦 Entrümpelung", "🔨 Handwerk", "💻 IT-Service", "🌿 Gartenbau", "🚚 Spedition", "🔧 SHK / Heizung", "⚡ Elektro", "🍽️ Catering", "👥 Zeitarbeit", "⚙️ Industrieservice", "🧹 Maler", "💰 Buchhaltung", "🏥 Pflege", "🚗 Kfz-Service", "🏗️ Bau"];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function Landing() {
  const [form, setForm] = useState({ name: "", email: "", company_name: "", phone: "", industry: "", message: "", consent_accepted: false, website_hidden: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setUtmSource(p.get("utm_source") || "");
    setUtmCampaign(p.get("utm_campaign") || "");
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim()) { setError("Bitte geben Sie Ihre E-Mail-Adresse ein."); return; }
    if (!form.consent_accepted) { setError("Bitte akzeptieren Sie die Einwilligung."); return; }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitWaitlistLead", { ...form, source_page: "/landing", utm_source: utmSource, utm_campaign: utmCampaign });
      if (res?.data?.success) { setSubmitted(true); } else { setError(res?.data?.error || "Fehler aufgetreten."); }
    } catch { setError("Verbindungsfehler. Bitte erneut versuchen."); }
    finally { setSubmitting(false); }
  };

  const scrollToForm = () => document.getElementById("waitlist-form")?.scrollIntoView({ behavior: "smooth" });

  const inp = { width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white", overflowX: "hidden" }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::placeholder { color: rgba(100,116,139,0.7) !important; }
        @media (max-width: 768px) { .hero-grid { grid-template-columns: 1fr !important; } .feat-grid { grid-template-columns: 1fr !important; } .compare-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: "rgba(2,6,23,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.07)", height: 62 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 180, width: "auto", objectFit: "contain" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={() => document.getElementById("wie-es-funktioniert")?.scrollIntoView({ behavior: "smooth" })} style={{ color: "rgba(148,163,184,1)", fontSize: 13, background: "none", border: "none", cursor: "pointer", fontWeight: 500, fontFamily: "inherit" }}>Funktionen</button>
            <button onClick={scrollToForm} style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "9px 18px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", boxShadow: "0 0 20px rgba(37,99,235,0.35)" }}>
              Frühen Zugang sichern →
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", paddingTop: 62, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", width: 700, height: 700, background: "rgba(37,99,235,0.12)", borderRadius: "50%", filter: "blur(120px)", top: -200, left: -100 }} />
          <div style={{ position: "absolute", width: 500, height: 500, background: "rgba(124,58,237,0.1)", borderRadius: "50%", filter: "blur(100px)", bottom: -100, right: 0 }} />
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>
        <div className="hero-grid" style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 24px", position: "relative", zIndex: 1, width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#93c5fd", fontSize: 12, fontWeight: 700, marginBottom: 24 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3b82f6", boxShadow: "0 0 8px #3b82f6", display: "inline-block" }} /> Early Access – Jetzt Platz sichern
            </div>
            <h1 style={{ fontSize: "clamp(36px,5vw,66px)", fontWeight: 900, lineHeight: 1.08, letterSpacing: -2.5, marginBottom: 22 }}>
              Mehr Firmenkunden.{" "}<br />
              <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "shimmer 5s linear infinite" }}>
                Weniger Zeitverschwendung.
              </span>
            </h1>
            <p style={{ fontSize: "clamp(15px,1.8vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.75, marginBottom: 32 }}>
              Vertriebo ist das erste aktive Vertriebssystem für lokale B2B-Dienstleister: Es findet automatisch passende Firmenkontakte, bewertet sie per KI und sagt Ihnen täglich, wen Sie als Nächstes anrufen sollten.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", color: "#c4b5fd" }}>
                <span style={{ fontSize: 14 }}>🚀</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Jetzt in der Beta-Phase – limitierte Plätze</span>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <button onClick={scrollToForm} style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 26px", borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 40px rgba(37,99,235,0.5)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                Frühen Zugang sichern <ArrowRight size={16} />
              </button>
              <button onClick={() => document.getElementById("wie-es-funktioniert")?.scrollIntoView({ behavior: "smooth" })} style={{ color: "rgba(148,163,184,1)", fontWeight: 600, fontSize: 14, padding: "14px 20px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Wie es funktioniert ↓
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["In 5 Min. startklar", "Keine Kreditkarte", "DSGVO-konform", "Monatlich kündbar"].map(c => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <CheckCircle2 size={10} color="#4ade80" /><span style={{ fontSize: 11, fontWeight: 600, color: "rgba(203,213,225,1)" }}>{c}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
            <div style={{ position: "absolute", width: "70%", height: "70%", background: "rgba(37,99,235,0.12)", borderRadius: "50%", filter: "blur(60px)" }} />
            <div style={{ position: "relative", zIndex: 1, transform: "perspective(1200px) rotateY(-5deg) rotateX(2deg)", width: "100%" }}>
              <LeadsMockup />
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section style={{ background: "#060d1f", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 0 }}>
          {[{ v: "40+", l: "Branchen unterstützt", s: "Von Reinigung bis IT-Service" }, { v: "< 5 Min", l: "bis zum ersten Lead", s: "Kein langer Setup-Prozess" }, { v: "KI-Score", l: "für jeden Lead", s: "Priorität auf Knopfdruck" }, { v: "100%", l: "DSGVO-orientiert", s: "Made for Germany" }].map((s, i, arr) => (
            <div key={i} style={{ textAlign: "center", padding: "12px 20px", borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <p style={{ fontSize: "clamp(22px,2.5vw,34px)", fontWeight: 900, background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 4 }}>{s.v}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 2 }}>{s.l}</p>
              <p style={{ fontSize: 11, color: "rgba(100,116,139,1)" }}>{s.s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="wie-es-funktioniert" style={{ padding: "88px 24px", background: "#020617" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>So funktioniert Vertriebo</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 14, letterSpacing: -1 }}>Von der Recherche zum Abschluss –<br />alles in einem System</h2>
            <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", maxWidth: 540, margin: "0 auto", lineHeight: 1.7 }}>Vertriebo ist kein klassisches CRM. Es arbeitet aktiv mit Ihnen – täglich, automatisch, intelligent.</p>
          </div>

          {/* Step 1 */}
          <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center", marginBottom: 72 }}>
            <div>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#60a5fa", marginBottom: 16 }}>01</div>
              <h3 style={{ fontSize: "clamp(20px,2.5vw,28px)", fontWeight: 800, lineHeight: 1.25, marginBottom: 14, letterSpacing: -0.5 }}>Einrichten in 5 Minuten</h3>
              <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.75, marginBottom: 18 }}>Tragen Sie Ihre Branche, Ihr Suchgebiet und Ihren Zielkunden ein. Vertriebo konfiguriert sich automatisch – keine komplizierte Einrichtung, kein IT-Aufwand.</p>
              {["Branche auswählen (40+ verfügbar)", "Suchgebiet & Radius festlegen", "Zielkundenprofil definieren"].map(b => (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 9, color: "#60a5fa" }}>✓</span></div>
                  <span style={{ fontSize: 13, color: "rgba(203,213,225,1)", fontWeight: 500 }}>{b}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {[{ label: "Branche", value: "Gebäudereinigung", icon: "🏢" }, { label: "Suchgebiet", value: "Frankfurt · 25km Radius", icon: "📍" }, { label: "Zielkunde", value: "Bürogebäude, Hotels, Industrie", icon: "🎯" }, { label: "Status", value: "Bereit zum Starten ✓", icon: "✅" }].map((item, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: j === 3 ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)", borderRadius: 10, border: `1px solid ${j === 3 ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)"}` }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <div><p style={{ fontSize: 9, color: "rgba(100,116,139,1)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{item.label}</p><p style={{ fontSize: 12, fontWeight: 700, color: j === 3 ? "#4ade80" : "white" }}>{item.value}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Step 2 */}
          <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center", marginBottom: 72 }}>
            <div style={{ order: 2 }}>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", inset: "-20px", background: "rgba(124,58,237,0.08)", borderRadius: 24, filter: "blur(40px)" }} />
                <div style={{ position: "relative", zIndex: 1 }}><ResearchMockup /></div>
              </div>
            </div>
            <div style={{ order: 1 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#a78bfa", marginBottom: 16 }}>02</div>
              <h3 style={{ fontSize: "clamp(20px,2.5vw,28px)", fontWeight: 800, lineHeight: 1.25, marginBottom: 14, letterSpacing: -0.5 }}>Vertriebo recherchiert für Sie</h3>
              <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.75, marginBottom: 18 }}>Mit einem Klick startet eine vollautomatische Firmenrecherche in Ihrem Gebiet. Die KI filtert unpassende Treffer heraus und bewertet jeden Lead nach Ihrem Profil.</p>
              {["Automatische Google-Places-Suche", "KI-Filterung & Qualitätsbewertung", "Score 0–100 für jeden Lead"].map(b => (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 9, color: "#a78bfa" }}>✓</span></div>
                  <span style={{ fontSize: 13, color: "rgba(203,213,225,1)", fontWeight: 500 }}>{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Step 3 */}
          <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
            <div>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "1px solid rgba(5,150,105,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#34d399", marginBottom: 16 }}>03</div>
              <h3 style={{ fontSize: "clamp(20px,2.5vw,28px)", fontWeight: 800, lineHeight: 1.25, marginBottom: 14, letterSpacing: -0.5 }}>Ihre Tagesprioritäten auf einen Blick</h3>
              <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.75, marginBottom: 18 }}>Jeden Morgen zeigt Vertriebo die wichtigsten Aufgaben: Rückrufe, heiße Leads, offene Angebote. Kein Herumsuchen – einfach losarbeiten.</p>
              {["KI-priorisierte Tagesliste", "Rückruf-Erinnerungen & Aufgaben", "Automatische Follow-up-Vorschläge"].map(b => (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(5,150,105,0.15)", border: "1px solid rgba(5,150,105,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 9, color: "#34d399" }}>✓</span></div>
                  <span style={{ fontSize: 13, color: "rgba(203,213,225,1)", fontWeight: 500 }}>{b}</span>
                </div>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", inset: "-20px", background: "rgba(5,150,105,0.08)", borderRadius: 24, filter: "blur(40px)" }} />
              <div style={{ position: "relative", zIndex: 1 }}><DashboardMockup /></div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: "88px 24px", background: "#080e1e", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>Was Vertriebo kann</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 14, letterSpacing: -1 }}>Alles was aktiver B2B-Vertrieb braucht</h2>
            <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", maxWidth: 540, margin: "0 auto", lineHeight: 1.7 }}>Kein Feature-Overload. Nur das, was wirklich hilft – jeden Tag.</p>
          </div>
          <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ background: f.ac.bg, border: `1px solid ${f.ac.bd}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 10, transition: "transform 0.2s", cursor: "default" }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                <div style={{ fontSize: 24 }}>{f.icon}</div>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: "white", lineHeight: 1.35 }}>{f.title}</h3>
                <p style={{ fontSize: 12, color: "rgba(148,163,184,1)", lineHeight: 1.6, flex: 1 }}>{f.desc}</p>
                <div style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize: 9, color: f.ac.ic, fontWeight: 600 }}>{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VS COMPARISON */}
      <section style={{ padding: "80px 24px", background: "#020617" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>Warum Vertriebo?</p>
            <h2 style={{ fontSize: "clamp(24px,3.5vw,40px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 12, letterSpacing: -1 }}>
              Kein CRM macht Vertrieb.{" "}
              <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Vertriebo schon.</span>
            </h2>
          </div>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "12px 20px" }}>
              <div />
              <div style={{ textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 800, color: "#93c5fd", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 6, padding: "4px 10px" }}>⚡ Vertriebo</span></div>
              <div style={{ textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 700, color: "rgba(100,116,139,1)" }}>Klassisches CRM</span></div>
              <div style={{ textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 700, color: "rgba(100,116,139,1)" }}>Excel / Listen</span></div>
            </div>
            {COMPARE_ROWS.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "11px 20px", borderBottom: i < COMPARE_ROWS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "rgba(203,213,225,1)", fontWeight: 500 }}>{row.f}</span>
                <div style={{ textAlign: "center" }}>{row.v ? <span style={{ fontSize: 15, color: "#4ade80" }}>✓</span> : <span style={{ color: "rgba(100,116,139,0.3)" }}>–</span>}</div>
                <div style={{ textAlign: "center" }}>{row.c ? <span style={{ fontSize: 13, color: "rgba(148,163,184,0.5)" }}>✓</span> : <span style={{ color: "rgba(100,116,139,0.3)" }}>–</span>}</div>
                <div style={{ textAlign: "center" }}>{row.e ? <span style={{ fontSize: 13, color: "rgba(148,163,184,0.5)" }}>✓</span> : <span style={{ color: "rgba(100,116,139,0.3)" }}>–</span>}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: "80px 24px", background: "#080e1e", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
              💬 Aus echten Gesprächen mit potenziellen Nutzern
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 12 }}>Das sagen Vertriebsverantwortliche</p>
            <h2 style={{ fontSize: "clamp(24px,3.5vw,38px)", fontWeight: 900, lineHeight: 1.2, letterSpacing: -1 }}>Wir kennen Ihr Problem – denn wir hören zu</h2>
            <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", marginTop: 12, maxWidth: 520, margin: "12px auto 0" }}>Diese Rückmeldungen haben wir in Interviews & Gesprächen mit lokalen B2B-Dienstleistern gesammelt. Sie waren der Antrieb für Vertriebo.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)", width: "fit-content" }}>
                  <span style={{ fontSize: 10 }}>💬</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24" }}>Aus einem echten Gespräch</span>
                </div>
                <p style={{ fontSize: 13, color: "rgba(203,213,225,1)", lineHeight: 1.7, flex: 1, fontStyle: "italic" }}>„{t.text}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(37,99,235,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{t.emoji}</div>
                  <div><p style={{ fontSize: 11, fontWeight: 700, color: "white" }}>{t.name}</p><p style={{ fontSize: 10, color: "rgba(100,116,139,1)" }}>{t.role} · {t.city}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section style={{ padding: "64px 24px", background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 900, marginBottom: 12, letterSpacing: -0.5 }}>Für 40+ Dienstleistungsbranchen</h2>
          <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", marginBottom: 28, lineHeight: 1.6 }}>Vertriebo kennt Ihre Branche und findet die richtigen Kunden – egal ob Gebäudereinigung, IT-Service oder Handwerk.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {INDUSTRIES.map(ind => (
              <span key={ind} style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 999, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.18)", color: "rgba(147,197,253,1)" }}>{ind}</span>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: "80px 24px", background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.2), rgba(124,58,237,0.12), #020617)", borderTop: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.02) 1px,transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <h2 style={{ fontSize: "clamp(26px,4.5vw,50px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16, letterSpacing: -1.5 }}>
            Kein vergessener Rückruf mehr.<br />
            <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Kein Lead mehr verloren.</span>
          </h2>
          <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", marginBottom: 32, lineHeight: 1.7 }}>Starten Sie mit Vertriebo. Die ersten Early-Access-Plätze sind limitiert.</p>
          <button onClick={scrollToForm} style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 16, padding: "16px 34px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 50px rgba(37,99,235,0.5)", display: "inline-flex", alignItems: "center", gap: 10 }}>
            Frühen Zugang sichern <ArrowRight size={18} />
          </button>
          <p style={{ fontSize: 12, color: "rgba(71,85,105,1)", marginTop: 14 }}>Kostenlos eintragen · Persönlicher Kontakt · Keine Kreditkarte</p>
        </div>
      </section>

      {/* WAITLIST FORM */}
      <section id="waitlist-form" style={{ padding: "88px 24px", background: "#020617", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 580, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80", fontSize: 12, fontWeight: 700, marginBottom: 18 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80", display: "inline-block" }} />Limitierte Early-Access-Plätze
            </div>
            <h2 style={{ fontSize: "clamp(24px,3.5vw,38px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 12, letterSpacing: -1 }}>Frühen Zugang sichern</h2>
            <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>Tragen Sie sich jetzt ein. Wir melden uns persönlich bei Ihnen – bevor Vertriebo öffentlich verfügbar wird.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
            {[{ icon: "🚀", text: "Erster Zugang vor dem offiziellen Launch" }, { icon: "💰", text: "Frühbucherkonditionen sichern" }, { icon: "🤝", text: "Persönliches Onboarding durch unser Team" }, { icon: "🎁", text: "Kostenloser Setup & Konfiguration" }].map(p => (
              <div key={p.icon} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
                <span style={{ fontSize: 15 }}>{p.icon}</span>
                <span style={{ fontSize: 11, color: "rgba(203,213,225,1)", fontWeight: 500 }}>{p.text}</span>
              </div>
            ))}
          </div>

          {submitted ? (
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, padding: 44, textAlign: "center" }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 26 }}>🎉</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "white", marginBottom: 10 }}>Sie sind dabei!</h3>
              <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.7 }}>Unser Team meldet sich persönlich bei Ihnen. Sie erhalten als einer der Ersten Zugang zu Vertriebo.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 }}>
                <CheckCircle2 size={13} color="#4ade80" /><span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Anmeldung erfolgreich</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 28, display: "flex", flexDirection: "column", gap: 13 }}>
              <input type="text" name="website_hidden" value={form.website_hidden} onChange={e => set("website_hidden", e.target.value)} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</label>
                  <input type="text" placeholder="Max Mustermann" value={form.name} onChange={e => set("name", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>E-Mail <span style={{ color: "#f87171" }}>*</span></label>
                  <input type="email" placeholder="max@firma.de" value={form.email} onChange={e => set("email", e.target.value)} required style={inp} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Firma</label>
                  <input type="text" placeholder="Muster GmbH" value={form.company_name} onChange={e => set("company_name", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Telefon</label>
                  <input type="tel" placeholder="+49 123 456 789" value={form.phone} onChange={e => set("phone", e.target.value)} style={inp} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Ihre Branche</label>
                <input type="text" placeholder="z.B. Gebäudereinigung, IT-Service, Handwerk…" value={form.industry} onChange={e => set("industry", e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Was ist Ihr größtes Vertriebsproblem?</label>
                <textarea placeholder="z.B. Ich finde keine neuen Firmenkunden. Rückrufe werden vergessen…" value={form.message} onChange={e => set("message", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} />
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.consent_accepted} onChange={e => set("consent_accepted", e.target.checked)} style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, accentColor: "#2563eb" }} />
                <span style={{ fontSize: 11, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>
                  Ich bin damit einverstanden, dass Vertriebo mich bezüglich Early Access kontaktiert.{" "}
                  <a href="/datenschutz" style={{ color: "#60a5fa", textDecoration: "none" }}>Datenschutz</a>
                </span>
              </label>
              {error && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, padding: "9px 13px", fontSize: 12, color: "#fca5a5" }}>{error}</div>}
              <button type="submit" disabled={submitting} style={{ background: submitting ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 14, padding: "14px 20px", borderRadius: 11, border: "none", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: submitting ? "none" : "0 0 30px rgba(37,99,235,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {submitting ? (<><span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Wird gespeichert…</>) : (<>Frühen Zugang sichern <ArrowRight size={15} /></>)}
              </button>
              <p style={{ textAlign: "center", fontSize: 11, color: "rgba(71,85,105,1)" }}>🔒 Kein Spam · Keine Weitergabe an Dritte · Jederzeit abmeldbar</p>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "36px 24px", textAlign: "center" }}>
        <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 90, width: "auto", objectFit: "contain", marginBottom: 14, opacity: 0.6 }} />
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20, marginBottom: 12 }}>
          {[["Impressum", "/impressum"], ["Datenschutz", "/datenschutz"], ["AGB", "/agb"], ["Preise & Pläne", "/start"], ["Kontakt", "mailto:info@huwa-gebaeudedienste.de"]].map(([label, href]) => (
            <a key={label} href={href} style={{ color: "rgba(71,85,105,1)", fontSize: 12, textDecoration: "none" }}>{label}</a>
          ))}
        </div>
        <p style={{ color: "rgba(51,65,85,1)", fontSize: 11 }}>© 2026 Vertriebo · Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
      </footer>
    </div>
  );
}