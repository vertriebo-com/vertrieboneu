import { useRef } from "react";
import LandingHero from "@/components/landing/LandingHero.jsx";
import LandingStats from "@/components/landing/LandingStats.jsx";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks.jsx";
import LandingFeatures from "@/components/landing/LandingFeatures.jsx";
import LandingVsComparison from "@/components/landing/LandingVsComparison.jsx";
import LandingTestimonials from "@/components/landing/LandingTestimonials.jsx";
import LandingIndustries from "@/components/landing/LandingIndustries.jsx";
import LandingWaitlistForm from "@/components/landing/LandingWaitlistForm.jsx";
import LandingFinalCTA from "@/components/landing/LandingFinalCTA.jsx";

export default function Landing() {
  const scrollToForm = () => {
    document.getElementById("waitlist-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", overflowX: "hidden" }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
        * { box-sizing: border-box; }
        ::placeholder { color: rgba(100,116,139,0.7) !important; }
      `}</style>

      {/* NAVBAR */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
        background: "rgba(2,6,23,0.92)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)", height: 62,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img
            src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png"
            alt="Vertriebo" style={{ height: 180, width: "auto", objectFit: "contain" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={() => document.getElementById("wie-es-funktioniert")?.scrollIntoView({ behavior: "smooth" })}
              style={{ color: "rgba(148,163,184,1)", fontSize: 14, background: "none", border: "none", cursor: "pointer", fontWeight: 500, fontFamily: "inherit", display: "none" }}
              className="nav-link"
            >
              Funktionen
            </button>
            <button
              onClick={scrollToForm}
              style={{
                background: "linear-gradient(135deg,#2563eb,#7c3aed)",
                color: "white", fontWeight: 700, fontSize: 13,
                padding: "9px 18px", borderRadius: 9, border: "none",
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                boxShadow: "0 0 20px rgba(37,99,235,0.35)",
              }}
            >
              Frühen Zugang sichern →
            </button>
          </div>
        </div>
      </nav>

      {/* ALL SECTIONS */}
      <LandingHero onScrollToForm={scrollToForm} />
      <LandingStats />
      <LandingHowItWorks />
      <LandingFeatures />
      <LandingVsComparison />
      <LandingTestimonials />
      <LandingIndustries />
      <LandingFinalCTA onScrollToForm={scrollToForm} />
      <LandingWaitlistForm />

      {/* FOOTER */}
      <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
          <img
            src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png"
            alt="Vertriebo" style={{ height: 100, width: "auto", objectFit: "contain", marginBottom: 16, opacity: 0.7 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, marginBottom: 16 }}>
            <a href="/impressum" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Impressum</a>
            <a href="/datenschutz" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Datenschutz</a>
            <a href="/agb" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>AGB</a>
            <a href="/start" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Preise & Pläne</a>
            <a href="mailto:info@huwa-gebaeudedienste.de" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Kontakt</a>
          </div>
          <p style={{ color: "rgba(51,65,85,1)", fontSize: 12 }}>© 2026 Vertriebo · Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
        </div>
      </footer>
    </div>
  );
}