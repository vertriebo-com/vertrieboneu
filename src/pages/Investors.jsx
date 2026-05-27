import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowRight, CheckCircle2, Shield, TrendingUp, ChevronDown } from "lucide-react";

const ROLES = ["Investor", "Business Angel", "Strategischer Partner", "Presse", "Sonstiges"];

// ── Animated Counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ target, suffix = "", prefix = "", duration = 1800 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = Date.now();
        const tick = () => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setVal(Math.round(eased * target));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{prefix}{val.toLocaleString("de")}{suffix}</span>;
}

const inp = {
  width: "100%", padding: "12px 16px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  color: "white", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

const labelStyle = {
  display: "block", fontSize: 10, fontWeight: 700,
  color: "rgba(148,163,184,1)", marginBottom: 6,
  textTransform: "uppercase", letterSpacing: 0.8,
};

export default function Investors() {
  const [form, setForm] = useState({
    name: "", email: "", company_name: "", role: "Investor",
    message: "", consent_accepted: false, website_hidden: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim()) { setError("Bitte Name und E-Mail angeben."); return; }
    if (!form.consent_accepted) { setError("Bitte akzeptieren Sie die Datenschutzeinwilligung."); return; }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitInvestorInquiry", { ...form, source_page: "/investors" });
      if (res?.data?.success) setSubmitted(true);
      else setError(res?.data?.error || "Fehler beim Absenden.");
    } catch { setError("Verbindungsfehler. Bitte erneut versuchen."); }
    finally { setSubmitting(false); }
  };

  const scrollToContact = () => document.getElementById("investor-contact")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", color: "white", overflowX: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::placeholder { color: rgba(100,116,139,0.7) !important; }
        @keyframes shimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glow { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        .inv-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .inv-grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
        .inv-grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
        .roadmap-line { position: relative; }
        .roadmap-line::before { content: ''; position: absolute; left: 15px; top: 32px; bottom: -8px; width: 1px; background: rgba(37,99,235,0.3); }
        @media (max-width: 768px) {
          .inv-grid-2 { grid-template-columns: 1fr !important; }
          .inv-grid-3 { grid-template-columns: 1fr 1fr !important; }
          .inv-grid-4 { grid-template-columns: repeat(2,1fr) !important; }
          .hero-cta-group { flex-direction: column !important; }
          .hero-cta-group button, .hero-cta-group a { width: 100% !important; text-align: center !important; }
          .section-pad { padding: 40px 16px !important; }
          .card-pad { padding: 24px 16px !important; }
          .main-wrap { padding: 80px 16px 60px !important; }
          .form-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: "rgba(2,6,23,0.96)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)", height: 58 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <img src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png" alt="Vertriebo" style={{ height: 130, width: "auto", objectFit: "contain" }} />
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/" style={{ color: "rgba(148,163,184,1)", fontSize: 13, textDecoration: "none", fontWeight: 500 }}>← Zurück</a>
            <button onClick={scrollToContact} style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 20px rgba(37,99,235,0.3)" }}>
              Gespräch anfragen
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section style={{ minHeight: "100svh", display: "flex", alignItems: "center", paddingTop: 58, position: "relative", overflow: "hidden" }}>
        {/* BG Blobs */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", width: 800, height: 800, background: "rgba(37,99,235,0.1)", borderRadius: "50%", filter: "blur(140px)", top: -300, left: -200 }} />
          <div style={{ position: "absolute", width: 600, height: 600, background: "rgba(124,58,237,0.08)", borderRadius: "50%", filter: "blur(120px)", bottom: -200, right: -100 }} />
          <div style={{ position: "absolute", width: 400, height: 400, background: "rgba(244,114,182,0.05)", borderRadius: "50%", filter: "blur(100px)", top: "30%", right: "20%" }} />
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.02) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 20px 80px", width: "100%", position: "relative", zIndex: 1, animation: "fadeUp 0.8s ease both" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(212,175,116,0.1)", border: "1px solid rgba(212,175,116,0.3)", color: "#d4a574", fontSize: 11, fontWeight: 700, marginBottom: 24, letterSpacing: 1.5, textTransform: "uppercase" }}>
              🏦 Investor Relations · Vertriebo GmbH
            </div>

            <h1 style={{ fontSize: "clamp(32px,5vw,64px)", fontWeight: 900, lineHeight: 1.08, letterSpacing: -2, marginBottom: 22 }}>
              Die Vertriebsplattform<br />
              <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "shimmer 5s linear infinite" }}>
                für 3,5 Millionen Betriebe.
              </span>
            </h1>

            <p style={{ fontSize: "clamp(15px,1.8vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.75, maxWidth: 620, margin: "0 auto 36px" }}>
              Vertriebo löst ein massives, bisher ungelöstes Problem: B2B-Dienstleister in Deutschland haben kein professionelles System zur Neukundengewinnung. Wir bauen genau das.
            </p>

            <div className="hero-cta-group" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={scrollToContact} style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "14px 28px", borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 40px rgba(37,99,235,0.4)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                Gespräch anfragen <ArrowRight size={16} />
              </button>
              <button onClick={() => document.getElementById("kpis")?.scrollIntoView({ behavior: "smooth" })} style={{ color: "rgba(148,163,184,1)", fontWeight: 600, fontSize: 14, padding: "14px 22px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Mehr erfahren ↓
              </button>
            </div>

            {/* Trust badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 28 }}>
              {["🇩🇪 Made in Germany", "DSGVO-konform", "Early Access läuft", "Gespräche auf Anfrage"].map(b => (
                <div key={b} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "rgba(203,213,225,0.8)", fontWeight: 500 }}>
                  {b}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", animation: "glow 2s ease-in-out infinite", opacity: 0.5 }}>
          <ChevronDown size={22} color="#60a5fa" />
        </div>
      </section>

      {/* ── DISCLAIMER ────────────────────────────────────────────────────────── */}
      <div style={{ background: "rgba(245,158,11,0.05)", borderTop: "1px solid rgba(245,158,11,0.15)", borderBottom: "1px solid rgba(245,158,11,0.15)", padding: "14px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Shield size={15} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11.5, color: "rgba(203,213,225,0.7)", lineHeight: 1.6 }}>
            <strong style={{ color: "rgba(203,213,225,0.9)" }}>Rechtlicher Hinweis:</strong> Diese Seite dient der allgemeinen Information über Vertriebo. Sie stellt kein öffentliches Angebot, keine Aufforderung zur Kapitalanlage und keine Renditeversprechen dar. Alle Angaben sind ohne Gewähr und spiegeln den aktuellen Entwicklungsstand wider.
          </p>
        </div>
      </div>

      {/* ── KEY METRICS ───────────────────────────────────────────────────────── */}
      <section id="kpis" className="section-pad" style={{ padding: "72px 20px", background: "#060d1f" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#d4a574", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Die Chance</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, letterSpacing: -1 }}>Ein Markt mit enormem Potenzial</h2>
          </div>

          <div className="inv-grid-4" style={{ marginBottom: 32 }}>
            {[
              { prefix: "", v: 3500000, suffix: "+", l: "Zielunternehmen", sub: "KMU-Dienstleister in DE", c: "#60a5fa", bg: "rgba(37,99,235,0.08)", bd: "rgba(37,99,235,0.2)" },
              { prefix: "€", v: 99, suffix: "–349", l: "MRR pro Kunde", sub: "Monatliche Subscription", c: "#a78bfa", bg: "rgba(124,58,237,0.08)", bd: "rgba(124,58,237,0.2)" },
              { prefix: "~€", v: 35, suffix: "Mrd.", l: "Marktvolumen", sub: "Adressierbarer TAM DE", c: "#4ade80", bg: "rgba(34,197,94,0.07)", bd: "rgba(34,197,94,0.2)" },
              { prefix: "", v: 40, suffix: "+", l: "Branchen", sub: "Direkt adressierbar", c: "#fbbf24", bg: "rgba(245,158,11,0.07)", bd: "rgba(245,158,11,0.2)" },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, border: `1px solid ${s.bd}`, borderRadius: 16, padding: "24px 20px", textAlign: "center", boxShadow: `0 0 30px ${s.bg}` }}>
                <p style={{ fontSize: "clamp(22px,2.5vw,34px)", fontWeight: 900, color: s.c, lineHeight: 1, marginBottom: 6 }}>
                  {s.suffix === "–349" ? (
                    <span>€99<span style={{ opacity: 0.6 }}>–349</span></span>
                  ) : s.suffix === "Mrd." ? (
                    <span>~€<AnimatedNumber target={35} suffix="" duration={2000} />Mrd.</span>
                  ) : (
                    <AnimatedNumber target={s.v} suffix={s.suffix} prefix={s.prefix} />
                  )}
                </p>
                <p style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 4 }}>{s.l}</p>
                <p style={{ fontSize: 11, color: "rgba(100,116,139,1)" }}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue projection bar */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "28px 32px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 20 }}>Illustratives ARR-Potenzial (bei Marktdurchdringung)</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "0,01% Marktanteil", customers: "350 Kunden", arr: "€415k ARR", pct: 8, c: "#60a5fa" },
                { label: "0,1% Marktanteil", customers: "3.500 Kunden", arr: "€4,15 Mio. ARR", pct: 30, c: "#a78bfa" },
                { label: "1% Marktanteil", customers: "35.000 Kunden", arr: "€41,5 Mio. ARR", pct: 70, c: "#f472b6" },
                { label: "5% Marktanteil", customers: "175.000 Kunden", arr: "€207 Mio. ARR", pct: 100, c: "#fbbf24" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 130, flexShrink: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(148,163,184,1)" }}>{r.label}</p>
                    <p style={{ fontSize: 10, color: "rgba(100,116,139,1)" }}>{r.customers}</p>
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 4, height: 10, overflow: "hidden" }}>
                    <div style={{ width: `${r.pct}%`, height: "100%", background: `linear-gradient(90deg, ${r.c}, ${r.c}88)`, borderRadius: 4, boxShadow: `0 0 8px ${r.c}66` }} />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 800, color: r.c, width: 130, textAlign: "right", flexShrink: 0 }}>{r.arr}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: "rgba(71,85,105,1)", marginTop: 16 }}>* Illustrativ. Ø ARPU €99/Monat angenommen. Keine Renditeversprechen.</p>
          </div>
        </div>
      </section>

      {/* ── PROBLEM & SOLUTION ────────────────────────────────────────────────── */}
      <section className="section-pad" style={{ padding: "72px 20px", background: "#020617" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Problem & Lösung</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, letterSpacing: -1 }}>Warum dieser Markt unerschlossen ist</h2>
          </div>

          <div className="inv-grid-2" style={{ marginBottom: 48 }}>
            {/* Problem */}
            <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 18, padding: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>❌</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#f87171" }}>Das heutige Problem</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { icon: "📋", text: "Excel-Listen & Sticky Notes als \"CRM\"" },
                  { icon: "🔍", text: "Stundenlange manuelle Google-Suche täglich" },
                  { icon: "☎️", text: "Rückrufe vergessen, Leads kalt werden lassen" },
                  { icon: "😕", text: "Keine Priorisierung: Wer wird heute kontaktiert?" },
                  { icon: "💸", text: "Enterprise-CRMs: zu teuer, zu komplex, falscher Fokus" },
                  { icon: "🕐", text: "Keine Zeit für aktive Neukundengewinnung" },
                ].map(p => (
                  <div key={p.text} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{p.icon}</span>
                    <p style={{ fontSize: 13, color: "rgba(203,213,225,0.85)", lineHeight: 1.5 }}>{p.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Solution */}
            <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 18, padding: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✅</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#4ade80" }}>Die Vertriebo-Lösung</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { icon: "🔍", text: "Automatische Firmenrecherche im definierten Radius" },
                  { icon: "🤖", text: "KI-Lead-Scoring 0–100 mit Priorisierung" },
                  { icon: "📋", text: "Tagesplan: Die 5 wichtigsten Anrufe heute" },
                  { icon: "📞", text: "Kontakthistorie & Follow-up-Erinnerungen" },
                  { icon: "🧠", text: "System lernt mit – wird täglich besser" },
                  { icon: "💶", text: "€99–349/Monat: erschwinglich für KMUs" },
                ].map(p => (
                  <div key={p.text} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{p.icon}</span>
                    <p style={{ fontSize: 13, color: "rgba(203,213,225,0.85)", lineHeight: 1.5 }}>{p.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Unique insight */}
          <div style={{ background: "linear-gradient(135deg,rgba(37,99,235,0.08),rgba(124,58,237,0.08))", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 16, padding: "28px 32px", display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ fontSize: 32, flexShrink: 0 }}>💡</div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 8 }}>Der entscheidende Vorteil</p>
              <p style={{ fontSize: 14, color: "rgba(203,213,225,0.9)", lineHeight: 1.75 }}>
                Vertriebo ist aus einem echten Betrieb heraus gebaut – der Gründer betreibt selbst ein B2B-Dienstleistungsunternehmen. Dieses Insider-Wissen über tägliche Vertriebsarbeit ist unser stärkster Differenziator gegenüber technikgetriebenen Konkurrenten, die diesen Markt nie wirklich verstanden haben.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRODUCT STATUS ────────────────────────────────────────────────────── */}
      <section className="section-pad" style={{ padding: "72px 20px", background: "#080e1e", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Produktstand</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, letterSpacing: -1 }}>Kein Konzept – ein funktionierendes Produkt</h2>
          </div>

          {/* Status badge */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRadius: 999, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>Early Access aktiv · Erste zahlende Kunden · Aktive Weiterentwicklung</p>
            </div>
          </div>

          <div className="inv-grid-2" style={{ marginBottom: 40 }}>
            {/* Completed */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>✅ Bereits produktiv</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  "Automatische Firmenrecherche (Google Places API)",
                  "KI-Lead-Scoring & Temperatureinstufung",
                  "Vollständiges CRM mit Kontakthistorie",
                  "Priorisierte Tagesliste & Aufgabenverwaltung",
                  "E-Mail-Vorlagen & Follow-up-System",
                  "Pipeline-Übersicht & Vertriebscontrolling",
                  "Multi-Tenant Architektur mit Agentur-Modul",
                  "Subscription-Billing via Stripe",
                  "Vollständige DSGVO-Konformität",
                ].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <CheckCircle2 size={14} color="#4ade80" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: "rgba(203,213,225,0.9)", lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Roadmap */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>🗺️ Roadmap (geplant)</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { phase: "Q3 2026", items: ["Brevo E-Mail-Automation", "Telefonintegration (Click-to-Call)", "Mobil-App (iOS/Android)"] },
                  { phase: "Q4 2026", items: ["KI-Gesprächsvorbereitung", "Angebots-Generator", "WhatsApp-Follow-up"] },
                  { phase: "2027+", items: ["DACH-Expansion (AT, CH)", "Open API für Integrationen", "Vertriebo für Agenturen (White-Label)"] },
                ].map(r => (
                  <div key={r.phase} style={{ display: "flex", gap: 14 }}>
                    <div style={{ flexShrink: 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#60a5fa" }}>📍</div>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 5 }}>{r.phase}</p>
                      {r.items.map(it => (
                        <p key={it} style={{ fontSize: 12, color: "rgba(148,163,184,1)", marginBottom: 3, lineHeight: 1.4 }}>→ {it}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tech stack */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "22px 28px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(100,116,139,1)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Technologie-Stack</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["React SaaS Frontend", "Deno Backend Functions", "Google Places API", "OpenAI / Gemini (KI-Scoring)", "Stripe Payments", "Brevo E-Mail", "DSGVO-konformes Hosting", "Multi-Tenant Architektur"].map(t => (
                <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 999, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", color: "#93c5fd" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── BUSINESS MODEL ────────────────────────────────────────────────────── */}
      <section className="section-pad" style={{ padding: "72px 20px", background: "#020617" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Geschäftsmodell</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, letterSpacing: -1 }}>Skalierbar. Wiederkehrend. Profitabel.</h2>
          </div>

          <div className="inv-grid-3" style={{ marginBottom: 40 }}>
            {[
              { name: "Starter", price: "€99", mo: "/Monat", desc: "Für Einzelkämpfer & kleine Teams", features: ["1–2 Nutzer", "300 gespeicherte Leads", "5 Recherche-Credits/Monat", "E-Mail-Vorlagen"], c: "#60a5fa", bg: "rgba(37,99,235,0.06)", bd: "rgba(37,99,235,0.18)" },
              { name: "Professional", price: "€199", mo: "/Monat", desc: "Für aktive Vertriebsteams", features: ["Bis 5 Nutzer", "1.000 Leads", "Unbegrenzte Recherche", "Erweiterte KI-Features"], c: "#a78bfa", bg: "rgba(124,58,237,0.08)", bd: "rgba(124,58,237,0.25)", highlight: true },
              { name: "Agency", price: "€599", mo: "/Monat", desc: "Für Agenturen & Reseller", features: ["Unbegrenzt Nutzer", "Multi-Mandant", "White-Label Option", "Dedizierter Support"], c: "#fbbf24", bg: "rgba(245,158,11,0.06)", bd: "rgba(245,158,11,0.2)" },
            ].map((plan, i) => (
              <div key={i} style={{ background: plan.bg, border: `1px solid ${plan.bd}`, borderRadius: 18, padding: 28, position: "relative", boxShadow: plan.highlight ? `0 0 40px rgba(124,58,237,0.15)` : "none" }}>
                {plan.highlight && (
                  <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#7c3aed,#2563eb)", borderRadius: 999, padding: "3px 14px", fontSize: 10, fontWeight: 800, color: "white", whiteSpace: "nowrap" }}>BELIEBTESTER PLAN</div>
                )}
                <p style={{ fontSize: 12, fontWeight: 700, color: plan.c, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{plan.name}</p>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 34, fontWeight: 900, color: "white" }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: "rgba(148,163,184,1)" }}>{plan.mo}</span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(148,163,184,1)", marginBottom: 18, lineHeight: 1.5 }}>{plan.desc}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle2 size={13} color={plan.c} />
                      <span style={{ fontSize: 12, color: "rgba(203,213,225,0.9)" }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Revenue drivers */}
          <div className="inv-grid-2">
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 14 }}>📈 Wachstumstreiber</p>
              {[
                { driver: "Organic SEO & Content", desc: "Branchen-spezifische Landingpages (40+ Branchen)" },
                { driver: "Direktvertrieb", desc: "Persönliche Outreach an Verbände & Branchen-Communities" },
                { driver: "Empfehlungsprogramm", desc: "Monat gratis für jede erfolgreiche Empfehlung" },
                { driver: "Agentur-Kanal", desc: "Agenturen resellen Vertriebo an ihre Kunden (White-Label)" },
              ].map(d => (
                <div key={d.driver} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 12, marginBottom: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", marginBottom: 3 }}>{d.driver}</p>
                  <p style={{ fontSize: 12, color: "rgba(148,163,184,1)", lineHeight: 1.5 }}>{d.desc}</p>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 28 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 14 }}>🎯 Unit Economics (Ziel)</p>
              {[
                { k: "Ø ARPU", v: "€149 / Monat" },
                { k: "Ø LTV (24 Mo. Retention)", v: "€3.576" },
                { k: "CAC-Ziel", v: "< €300" },
                { k: "LTV:CAC Ratio", v: "> 12:1" },
                { k: "Gross Margin (SaaS)", v: "~75–85%" },
                { k: "Payback Period", v: "< 24 Monate" },
              ].map(r => (
                <div key={r.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "rgba(148,163,184,1)" }}>{r.k}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{r.v}</span>
                </div>
              ))}
              <p style={{ fontSize: 10, color: "rgba(71,85,105,1)", marginTop: 8 }}>* Zielwerte – keine Garantien.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPETITIVE MOAT ──────────────────────────────────────────────────── */}
      <section className="section-pad" style={{ padding: "72px 20px", background: "#080e1e", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Wettbewerbsposition</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, letterSpacing: -1 }}>Kein Wettbewerber denkt so wie wir</h2>
          </div>

          {/* Comparison table */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, overflow: "hidden", marginBottom: 40 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 20px" }}>
              <div />
              {["⚡ Vertriebo", "Salesforce", "HubSpot", "Excel / Listen"].map(c => (
                <div key={c} style={{ textAlign: "center" }}>
                  <span style={{ fontSize: c === "⚡ Vertriebo" ? 11 : 10, fontWeight: 700, color: c === "⚡ Vertriebo" ? "#93c5fd" : "rgba(100,116,139,1)", background: c === "⚡ Vertriebo" ? "rgba(37,99,235,0.15)" : "transparent", border: c === "⚡ Vertriebo" ? "1px solid rgba(37,99,235,0.3)" : "none", borderRadius: 6, padding: c === "⚡ Vertriebo" ? "3px 8px" : 0 }}>{c}</span>
                </div>
              ))}
            </div>
            {[
              { f: "Automatische Firmenrecherche", v: [true, false, false, false] },
              { f: "KI-Priorisierung für KMUs", v: [true, false, false, false] },
              { f: "Für lokale Dienstleister gebaut", v: [true, false, false, false] },
              { f: "In 5 Min. startklar", v: [true, false, false, true] },
              { f: "Preis erschwinglich (< €350)", v: [true, false, false, true] },
              { f: "CRM & Kontakthistorie", v: [true, true, true, false] },
              { f: "DSGVO / Made in Germany", v: [true, false, false, false] },
              { f: "System lernt mit", v: [true, false, false, false] },
            ].map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "11px 20px", borderBottom: i < 7 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "rgba(203,213,225,1)", fontWeight: 500 }}>{row.f}</span>
                {row.v.map((v, j) => (
                  <div key={j} style={{ textAlign: "center" }}>
                    {v ? <span style={{ fontSize: 16, color: j === 0 ? "#4ade80" : "rgba(148,163,184,0.5)" }}>✓</span> : <span style={{ color: "rgba(100,116,139,0.3)", fontSize: 14 }}>–</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Moat cards */}
          <div className="inv-grid-3">
            {[
              { icon: "🏭", title: "Operative Herkunft", desc: "Gegründet von einem Betreiber — nicht einem Techniker. Das Produkt löst echte Probleme aus erster Hand.", c: "#60a5fa" },
              { icon: "🧠", title: "Lernender Algorithmus", desc: "Je mehr Kunden Vertriebo nutzen, desto besser werden Scoring und Empfehlungen. Starker Netzwerkeffekt.", c: "#a78bfa" },
              { icon: "🗂️", title: "Taxonomie-Moat", desc: "Tiefe Branchentaxonomie mit 40+ spezialisierten Profilen. Aufwendig zu replizieren, schwer zu kopieren.", c: "#4ade80" },
            ].map(m => (
              <div key={m.title} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{m.icon}</div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 8 }}>{m.title}</p>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.65 }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRACTION ──────────────────────────────────────────────────────────── */}
      <section className="section-pad" style={{ padding: "72px 20px", background: "#020617" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Traction & Validierung</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, letterSpacing: -1 }}>Erste Signale bestätigen die Nachfrage</h2>
          </div>

          <div className="inv-grid-4" style={{ marginBottom: 40 }}>
            {[
              { icon: "✅", v: "Produktiv", l: "Vollständige Plattform live", c: "#4ade80", bg: "rgba(34,197,94,0.07)", bd: "rgba(34,197,94,0.2)" },
              { icon: "🧑‍💼", v: "Erste Kunden", l: "Early Access aktiv", c: "#60a5fa", bg: "rgba(37,99,235,0.07)", bd: "rgba(37,99,235,0.2)" },
              { icon: "💳", v: "Stripe aktiv", l: "Live-Zahlungen laufen", c: "#a78bfa", bg: "rgba(124,58,237,0.07)", bd: "rgba(124,58,237,0.2)" },
              { icon: "🏗️", v: "40+ Branchen", l: "Taxonomie vollständig", c: "#fbbf24", bg: "rgba(245,158,11,0.07)", bd: "rgba(245,158,11,0.2)" },
            ].map(t => (
              <div key={t.l} style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 16, padding: "20px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
                <p style={{ fontSize: 18, fontWeight: 900, color: t.c, marginBottom: 4 }}>{t.v}</p>
                <p style={{ fontSize: 11, color: "rgba(148,163,184,1)" }}>{t.l}</p>
              </div>
            ))}
          </div>

          {/* Voice of customer */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: "32px 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <div style={{ padding: "4px 12px", borderRadius: 999, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>💬 Aus echten Gesprächen mit Dienstleistern</div>
            </div>
            <div className="inv-grid-2">
              {[
                { q: `\u201eIch verbringe täglich 2–3 Stunden damit, Firmenkontakte per Google zu suchen. Ein System das das automatisch erledigt – genau das fehlt mir.\u201c`, name: "Markus B.", role: "GF, Gebäudereinigung · Frankfurt" },
                { q: `\u201eRückrufe vergessen, Leads die kalt werden – das kostet uns jeden Monat bares Geld. Vertriebo klingt wie die Lösung.\u201c`, name: "Sandra K.", role: "Vertriebsleiterin, IT-Service · München" },
              ].map(t => (
                <div key={t.name} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 22 }}>
                  <p style={{ fontSize: 13, color: "rgba(203,213,225,0.9)", lineHeight: 1.7, fontStyle: "italic", marginBottom: 14 }}>{t.q}</p>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "white" }}>{t.name}</p>
                    <p style={{ fontSize: 11, color: "rgba(100,116,139,1)" }}>{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TEAM ──────────────────────────────────────────────────────────────── */}
      <section className="section-pad" style={{ padding: "72px 20px", background: "#080e1e", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Das Team</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, letterSpacing: -1 }}>Gründer mit Skin in the Game</h2>
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ maxWidth: 600, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "36px 40px", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 18px" }}>👨‍💼</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "white", marginBottom: 6 }}>Gründer & CEO</h3>
              <p style={{ fontSize: 13, color: "#93c5fd", marginBottom: 18, fontWeight: 600 }}>Huwa Gebäudereinigung & Hausmeisterdienste</p>
              <p style={{ fontSize: 14, color: "rgba(203,213,225,0.9)", lineHeight: 1.75, marginBottom: 20 }}>
                Inhaber eines B2B-Dienstleistungsunternehmens mit aktiver Vertriebserfahrung. Vertriebo wurde aus einem echten, täglichen Problem heraus entwickelt – nicht als abstraktes Startup-Konzept. Dieses Insider-Wissen ist unser stärkster Vorteil.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {["Operative B2B-Erfahrung", "Domänen-Expertise", "Gründer-geführt", "Bootstrapped → Profitabel geplant"].map(t => (
                  <span key={t} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", color: "#93c5fd", fontWeight: 600 }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INVESTMENT OPPORTUNITY ────────────────────────────────────────────── */}
      <section className="section-pad" style={{ padding: "72px 20px", background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.12), rgba(124,58,237,0.08), #020617)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#d4a574", textTransform: "uppercase", letterSpacing: 3, marginBottom: 10 }}>Investitions-Möglichkeit</p>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, lineHeight: 1.15, letterSpacing: -1 }}>Wofür wir Kapital einsetzen würden</h2>
            <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", maxWidth: 560, margin: "16px auto 0", lineHeight: 1.7 }}>Details werden in einem persönlichen Gespräch besprochen. Diese Übersicht dient der ersten Orientierung.</p>
          </div>

          <div className="inv-grid-2" style={{ marginBottom: 40 }}>
            {[
              { icon: "👩‍💻", pct: "40%", title: "Produkt & Engineering", desc: "Vollzeit-Entwickler, Mobile App, KI-Optimierung, Infrastruktur", c: "#60a5fa", bg: "rgba(37,99,235,0.07)", bd: "rgba(37,99,235,0.2)" },
              { icon: "📣", pct: "30%", title: "Marketing & Wachstum", desc: "SEO, Content, Branchen-Direktmarketing, Empfehlungsprogramm", c: "#a78bfa", bg: "rgba(124,58,237,0.07)", bd: "rgba(124,58,237,0.2)" },
              { icon: "🤝", pct: "20%", title: "Vertrieb & Partnerschaften", desc: "Direktvertrieb, Agentur-Kanal aufbauen, Verbands-Kooperationen", c: "#4ade80", bg: "rgba(34,197,94,0.06)", bd: "rgba(34,197,94,0.2)" },
              { icon: "🏗️", pct: "10%", title: "Infrastruktur & Compliance", desc: "Skalierbarkeit, DSGVO-Audit, Rechtssicherheit für Expansion", c: "#fbbf24", bg: "rgba(245,158,11,0.06)", bd: "rgba(245,158,11,0.2)" },
            ].map(r => (
              <div key={r.title} style={{ background: r.bg, border: `1px solid ${r.bd}`, borderRadius: 16, padding: 28, display: "flex", gap: 18, alignItems: "flex-start" }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>{r.icon}</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: r.c }}>{r.pct}</span>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{r.title}</p>
                  </div>
                  <p style={{ fontSize: 13, color: "rgba(148,163,184,1)", lineHeight: 1.6 }}>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Why now */}
          <div style={{ background: "rgba(212,175,116,0.05)", border: "1px solid rgba(212,175,116,0.2)", borderRadius: 18, padding: "32px 36px", display: "flex", gap: 24, alignItems: "flex-start" }}>
            <div style={{ fontSize: 36, flexShrink: 0 }}>⏰</div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: "#d4a574", marginBottom: 12 }}>Warum ist jetzt der richtige Zeitpunkt?</h3>
              <div className="inv-grid-2">
                {[
                  "KI-Kosten sind erstmals auf KMU-Niveau gefallen – Scoring wurde erschwinglich",
                  "Kein etablierter Player hat diesen Nischenmarkt systematisch adressiert",
                  "Marktfenster: Wer jetzt skaliert, baut echte Marktführerschaft auf",
                  "Erste Kunden & Produkt bereits live – kein reines Konzept-Investment",
                ].map(r => (
                  <div key={r} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <CheckCircle2 size={14} color="#d4a574" style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 13, color: "rgba(203,213,225,0.9)", lineHeight: 1.6 }}>{r}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT FORM ──────────────────────────────────────────────────────── */}
      <section id="investor-contact" className="section-pad" style={{ padding: "80px 20px", background: "#020617", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999, background: "rgba(212,175,116,0.1)", border: "1px solid rgba(212,175,116,0.25)", color: "#d4a574", fontSize: 11, fontWeight: 700, marginBottom: 18, textTransform: "uppercase", letterSpacing: 1.5 }}>
              🤝 Kontakt für Investoren
            </div>
            <h2 style={{ fontSize: "clamp(24px,3.5vw,40px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 14, letterSpacing: -1 }}>Interesse? Sprechen wir.</h2>
            <p style={{ fontSize: 15, color: "rgba(148,163,184,1)", lineHeight: 1.75 }}>
              Wenn Sie mehr über Vertriebo erfahren möchten, hinterlassen Sie Ihre Kontaktdaten. Wir antworten persönlich innerhalb von 1–2 Werktagen.
            </p>
          </div>

          {/* Process steps */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 36, justifyContent: "center" }}>
            {[["1.", "Anfrage senden"], ["2.", "Persönliches Gespräch"], ["3.", "Pitch Deck & Details"], ["4.", "Entscheidung"]].map(([n, t]) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#60a5fa" }}>{n}</span>
                <span style={{ fontSize: 11, color: "rgba(203,213,225,0.8)", fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>

          {submitted ? (
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, padding: 52, textAlign: "center" }}>
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 20px" }}>🎉</div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 10 }}>Vielen Dank!</h3>
              <p style={{ fontSize: 14, color: "rgba(148,163,184,1)", lineHeight: 1.75 }}>Wir melden uns persönlich innerhalb von 1–2 Werktagen. Wir freuen uns auf das Gespräch.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 }}>
                <CheckCircle2 size={14} color="#4ade80" />
                <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Anfrage erfolgreich gesendet</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: 32, display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="text" name="website_hidden" value={form.website_hidden} onChange={e => set("website_hidden", e.target.value)} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

              <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Name <span style={{ color: "#f87171" }}>*</span></label>
                  <input type="text" placeholder="Vorname Nachname" value={form.name} onChange={e => set("name", e.target.value)} style={inp} required />
                </div>
                <div>
                  <label style={labelStyle}>E-Mail <span style={{ color: "#f87171" }}>*</span></label>
                  <input type="email" placeholder="name@fonds.de" value={form.email} onChange={e => set("email", e.target.value)} style={inp} required />
                </div>
              </div>

              <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Unternehmen / Fonds</label>
                  <input type="text" placeholder="z.B. Musterfonds GmbH" value={form.company_name} onChange={e => set("company_name", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={labelStyle}>Rolle</label>
                  <select value={form.role} onChange={e => set("role", e.target.value)} style={{ ...inp, appearance: "none" }}>
                    {ROLES.map(r => <option key={r} value={r} style={{ background: "#0f172a" }}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Nachricht & Interesse</label>
                <textarea placeholder="Was interessiert Sie an Vertriebo? Welche Art von Investition/Zusammenarbeit stellen Sie sich vor?" value={form.message} onChange={e => set("message", e.target.value)} rows={4} style={{ ...inp, resize: "vertical" }} />
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.consent_accepted} onChange={e => set("consent_accepted", e.target.checked)} style={{ width: 15, height: 15, marginTop: 2, flexShrink: 0, accentColor: "#2563eb" }} />
                <span style={{ fontSize: 11, color: "rgba(148,163,184,1)", lineHeight: 1.65 }}>
                  Ich bin damit einverstanden, dass Vertriebo meine Angaben zur Beantwortung meiner Anfrage verwendet.{" "}
                  <a href="/datenschutz" style={{ color: "#60a5fa", textDecoration: "none" }}>Datenschutzerklärung</a>
                </span>
              </label>

              {error && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#fca5a5" }}>{error}</div>
              )}

              <button type="submit" disabled={submitting} style={{ background: submitting ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800, fontSize: 15, padding: "15px 20px", borderRadius: 12, border: "none", cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: submitting ? "none" : "0 0 30px rgba(37,99,235,0.35)" }}>
                {submitting ? (
                  <><span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Wird gesendet…</>
                ) : (
                  <>Gespräch anfragen <ArrowRight size={15} /></>
                )}
              </button>
              <p style={{ textAlign: "center", fontSize: 11, color: "rgba(71,85,105,1)" }}>🔒 Vertraulich · Keine Weitergabe · Persönliche Antwort garantiert</p>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "32px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20, marginBottom: 10 }}>
          {[["Impressum", "/impressum"], ["Datenschutz", "/datenschutz"], ["AGB", "/agb"], ["Zur Landing Page", "/"], ["Investor Relations", "/investors"]].map(([label, href]) => (
            <a key={label} href={href} style={{ color: "rgba(71,85,105,1)", fontSize: 12, textDecoration: "none" }}>{label}</a>
          ))}
        </div>
        <p style={{ color: "rgba(51,65,85,1)", fontSize: 11 }}>© 2026 Vertriebo · Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
      </footer>
    </div>
  );
}