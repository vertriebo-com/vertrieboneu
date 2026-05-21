import { useState, useEffect, useMemo, useRef } from "react";
import { Check, Zap, ArrowRight, ChevronDown, Star, MapPin, Target, Phone, Mail, Users, TrendingUp, Shield, Brain, BarChart3, User, Search, Globe, Calendar, FileText, Layout, Lightbulb, CircleHelp } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import VertrieboLogo from "@/components/VertrieboLogo";
import AgencyDemoModal from "@/components/AgencyDemoModal";
import HowItWorks from "@/components/landing/HowItWorks";
import TargetIndustriesCompact from "@/components/landing/TargetIndustriesCompact";
import ProductShowcase from "@/components/landing/ProductShowcase";
import PricingFAQ from "@/components/landing/PricingFAQ";

const PLANS = [
{
  name: "Starter",
  slug: "starter",
  planId: "69fb1b37d7433caf98c34ff9",
  price: "99",
  description: "Für kleine Dienstleister, die regelmäßig neue Firmenkunden gewinnen möchten.",
  popular: false,
  features: ["300 Firmenkontakte/Monat", "100 Recherche-Läufe/Monat", "50 KI-Aktionen/Monat", "CRM & Pipeline", "500 E-Mails/Monat"],
  cta: "14 Tage kostenlos testen"
},
{
  name: "Professional",
  slug: "professional",
  planId: "69fb1b37d7433caf98c34ffa",
  price: "199",
  description: "Für Teams, die regelmäßig aktiv Vertrieb machen",
  popular: true,
  features: ["1.500 Firmenkontakte/Monat", "750 Recherche-Läufe/Monat", "300 KI-Aktionen/Monat", "Eigene E-Mail-Vorlagen", "Erweiterte Reports", "2.000 E-Mails/Monat"],
  cta: "Professional buchen"
},
{
  name: "Gold",
  slug: "gold",
  planId: "69fb7de571a0504da10ef985",
  price: "349",
  description: "Für wachsende Vertriebsteams mit hohem Kontaktvolumen",
  popular: false,
  features: ["5.000 Firmenkontakte/Monat", "2.000 Recherche-Läufe/Monat", "1.000 KI-Aktionen/Monat", "Eigene E-Mail-Vorlagen", "Erweiterte Reports", "5.000 E-Mails/Monat", "Priority Support"],
  cta: "Gold buchen"
},
{
  name: "Agency",
  slug: "agency",
  planId: "69fb1b37d7433caf98c34ffb",
  price: null,
  description: "Für Agenturen & größere Teams",
  popular: false,
  isAgency: true,
  features: ["Mehrere Kundenorganisationen", "Unbegrenzte Firmenkontakte", "Persönliches Onboarding", "Eigene Kundenverwaltung", "Priority Support"],
  cta: "Demo anfragen"
}];


const FAQS = [
{ q: "Was sind gespeicherte Firmenkontakte?", a: "Das sind alle Firmen, die Sie mit Vertriebo recherchieren oder manuell erfassen. Die monatlichen Limits zeigen, wie viele neue Kontakte Sie pro Monat speichern können. Alle Ihre Kontakte bleiben unbegrenzt abrufbar." },
{ q: "Wie funktionieren Recherche-Läufe?", a: "Mit einem Recherche-Lauf starten Sie eine automatische Firmensuche in Ihrer Region. Die Anzahl der Recherche-Läufe selbst ist nicht begrenzt – nur die Kontakte, die Sie speichern, werden gezählt." },
{ q: "Was sind KI-Aktionen?", a: "KI-Aktionen umfassen Lead-Bewertung, E-Mail-Entwürfe, Gesprächseinstiege, Follow-up-Vorschläge und Vertriebs-Coaching. Jede KI-gestützte Funktion verbraucht eine Aktion." },
{ q: "Kann ich monatlich kündigen?", a: "Ja, alle Self-Service-Pläne (Starter, Professional, Gold) sind monatlich kündbar. Keine langfristigen Verträge, keine versteckten Kosten." },
{ q: "Was passiert mit meinen Daten nach Kündigung?", a: "Ihre Firmenkontakte und Dokumentation bleiben 30 Tage nach Kündigung einsehbar. Alle Daten sind DSGVO-konform und können exportiert werden." }];


const FEATURES = [
{ icon: Search, title: "Automatische Firmenkontakt-Recherche", desc: "Legen Sie Zielgebiet, Branche und Kundentyp fest – Vertriebo findet passende Firmenkontakte für Ihren Vertrieb.", accent: "blue" },
{ icon: Globe, title: "Lückenlose Gebiets-Abdeckung", desc: "Nicht nur die Kreisstadt — Vertriebo durchsucht alle Orte in Ihrem Radius automatisch.", accent: "teal" },
{ icon: Star, title: "Priorisierte Tagesliste", desc: "Tagesprioritäten statt Chaos. Heute fällige Rückrufe, priorisierte Neuleads und offene Angebote – Ihr Team sieht auf einen Blick, wer heute angerufen werden sollte.", accent: "amber" },
{ icon: Phone, title: "Komplette Kontakthistorie", desc: "Alle Gespräche, E-Mails und Notizen zu jeder Firma an einem Ort. Anrufe dokumentiert, E-Mail-Verlauf, gespeicherte Notizen – nichts geht verloren.", accent: "emerald" },
{ icon: Mail, title: "E-Mails & Follow-ups", desc: "E-Mail-Vorlagen mit Ihrem Logo und Signatur, automatische Aufgaben und Follow-up-Erinnerungen – von Erstansprache bis Nachfassen alles organisiert.", accent: "purple" },
{ icon: Users, title: "Vertriebssteuerung für Teams", desc: "Admins sehen Fortschritt, offene Aufgaben, Aktivität und Ergebnisse. Vertriebler sehen nur ihre eigenen Leads.", accent: "indigo" },
{ icon: Layout, title: "Alles leicht bedienbar", desc: "Keine komplizierte CRM-Einrichtung. Zielgebiet festlegen, Kontakte recherchieren, losarbeiten.", accent: "slate" },
{ icon: Brain, title: "System das mitlernt", desc: "Je mehr Sie nutzen, desto besser wird Vertriebo. Erfolgreiche Branchen werden automatisch priorisiert.", accent: "orange" },
{ icon: BarChart3, title: "Echtzeit-Erfolgsquoten", desc: "Sehen Sie sofort, wie Ihr Team performt: Quote pro Vertriebler, beste Branchen, ROI der Recherche.", accent: "rose" }];

const ACCENT_COLORS = {
  blue: { bg: "rgba(37,99,235,0.06)", border: "rgba(37,99,235,0.2)", iconBg: "rgba(37,99,235,0.1)", iconColor: "#60a5fa" },
  teal: { bg: "rgba(20,184,166,0.06)", border: "rgba(20,184,166,0.2)", iconBg: "rgba(20,184,166,0.1)", iconColor: "#2dd4bf" },
  amber: { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.2)", iconBg: "rgba(245,158,11,0.1)", iconColor: "#fbbf24" },
  emerald: { bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.2)", iconBg: "rgba(16,185,129,0.1)", iconColor: "#34d399" },
  purple: { bg: "rgba(139,92,246,0.06)", border: "rgba(139,92,246,0.2)", iconBg: "rgba(139,92,246,0.1)", iconColor: "#a78bfa" },
  indigo: { bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.2)", iconBg: "rgba(99,102,241,0.1)", iconColor: "#818cf8" },
  slate: { bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.2)", iconBg: "rgba(100,116,139,0.1)", iconColor: "#94a3b8" },
  orange: { bg: "rgba(249,115,22,0.06)", border: "rgba(249,115,22,0.2)", iconBg: "rgba(249,115,22,0.1)", iconColor: "#fb923c" },
  rose: { bg: "rgba(244,63,94,0.06)", border: "rgba(244,63,94,0.2)", iconBg: "rgba(244,63,94,0.1)", iconColor: "#f472b6" }
};


// Stable Particles Component - Mobile Optimized
const Particles = ({ count = 30 }) => {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 3 + Math.random() * 4,
      opacity: 0.2 + Math.random() * 0.3,
      duration: 10 + Math.random() * 12,
      delay: Math.random() * 3
    }));
  }, [count]);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, overflow: "hidden" }}>
      {particles.map((p) =>
      <div key={p.id} className="particle" style={{
        position: "absolute", width: p.size, height: p.size,
        background: `radial-gradient(circle, rgba(96,165,250,${p.opacity}) 0%, rgba(139,92,246,${p.opacity * 0.5}) 100%)`,
        borderRadius: "50%",
        left: `${p.left}%`, top: `${p.top}%`,
        animation: `float ${p.duration}s ease-in-out infinite`,
        animationDelay: `${p.delay}s`,
        filter: "blur(1px)",
        boxShadow: `0 0 ${p.size * 2}px rgba(96,165,250,${p.opacity})`
      }} />
      )}
    </div>);

};

const INDUSTRIES = [
{ icon: "🏢", name: "Gebäudereinigung" }, { icon: "🛡️", name: "Sicherheitsdienst" }, { icon: "🏠", name: "Facility Service" }, { icon: "📦", name: "Entrümpelung" },
{ icon: "🔨", name: "Handwerk" }, { icon: "💻", name: "IT-Service" }, { icon: "🌿", name: "Gartenbau" }, { icon: "🚚", name: "Spedition" },
{ icon: "🔧", name: "SHK / Heizung" }, { icon: "⚡", name: "Elektro" }, { icon: "🍽️", name: "Catering" }, { icon: "👥", name: "Personal / Zeitarbeit" },
{ icon: "⚙️", name: "Industrieservice" }, { icon: "🧹", name: "Maler / Renovierung" }, { icon: "💰", name: "Buchhaltung" }, { icon: "🏥", name: "Gesundheit / Pflege" }];


// Reveal Animation Component - Mobile Optimized with Fallback
const RevealOnScroll = ({ children, delay = 0 }) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    // Mobile fallback: show content immediately
    setIsVisible(true);
    
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "50px" });
    
    if (ref.current) {
      observer.observe(ref.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <div
      ref={ref}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(0)",
        transition: `opacity 0.4s ease ${delay}ms`
      }}>
      
      {children}
    </div>);

};

export default function Landing() {
  const [loading, setLoading] = useState(null);
  const [showAgencyModal, setShowAgencyModal] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Detect mobile for optimizations
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
    
    // Force reload for mobile testing
    const handleHashChange = () => window.location.reload();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      window.location.href = "/onboarding?checkout=success";
    }
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleLogin = () => base44.auth.redirectToLogin(window.location.origin + "/dashboard");
  const handleRegister = () => base44.auth.redirectToLogin(window.location.origin + "/onboarding");

  const handleCheckout = async (plan) => {
    if (plan.slug === "agency") {setShowAgencyModal(true);return;}
    if (window.self !== window.top) {
      alert("Der Checkout funktioniert nur in der veröffentlichten App, nicht in der Vorschau.");
      return;
    }
    setLoading(plan.name);
    const isAuthed = await base44.auth.isAuthenticated().catch(() => false);
    if (!isAuthed) {
      base44.auth.redirectToLogin(`${window.location.origin}/onboarding?plan_id=${plan.planId}&plan_name=${encodeURIComponent(plan.name)}`);
      return;
    }
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      base44.auth.redirectToLogin(`${window.location.origin}/onboarding?plan_id=${plan.planId}&plan_name=${encodeURIComponent(plan.name)}`);
      return;
    }
    try {
      const orgs = await base44.entities.Organization.filter({ owner_email: user.email });
      const org = orgs?.[0];
      if (!org) {window.location.href = `/onboarding?plan_id=${plan.planId}&plan_name=${encodeURIComponent(plan.name)}`;return;}
      const res = await base44.functions.invoke("createCheckoutSession", { organization_id: org.id, plan_id: plan.planId });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else if (res.data?.subscription_status) {
        // Aktive Subscription vorhanden → Kundenportal öffnen
        toast.info("Sie haben bereits ein aktives Abo. Sie werden zum Kundenportal weitergeleitet...");
        const portalRes = await base44.functions.invoke("createPortalSession", { organization_id: org.id });
        if (portalRes.data?.url) window.location.href = portalRes.data.url;
        else window.location.href = "/settings";
      } else {
        toast.error(res.data?.error || "Kein Checkout-Link erhalten.");
      }
    } catch (e) {
      toast.error("Fehler beim Starten des Checkouts: " + e.message);
    }
    setLoading(null);
  };

  return (
    <div style={{ background: "#020617", minHeight: "100vh", fontFamily: "'Inter', sans-serif", overflowX: "hidden", position: "relative" }}>

      {/* NOISE TEXTURE OVERLAY - Disabled on mobile for performance */}
      {!isMobile && <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        mixBlendMode: "overlay"
      }} />}

      {/* FLOATING PARTICLES - Disabled on mobile for performance */}
      {!isMobile && <Particles count={30} />}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          25% { transform: translate(40px, -60px) scale(1.2); opacity: 0.5; }
          50% { transform: translate(-35px, -80px) scale(1.1); opacity: 0.4; }
          75% { transform: translate(45px, -50px) scale(1.15); opacity: 0.5; }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
        /* Desktop-only Elemente */
        @media (min-width: 769px) {
          .desktop-only { display: flex !important; }
        }
        @media (max-width: 768px) {
          .desktop-only { display: none !important; }
          .feature-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .feature-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        /* Reduce blur on mobile for performance */
        @media (max-width: 768px) {
          .glow-effect { filter: blur(60px) !important; }
          .particle { filter: blur(1px) !important; }
        }
      `}</style>

      {/* GLOW ORBS - Disabled on mobile for performance */}
      {!isMobile && <>
        <div className="glow-effect" style={{
          position: "fixed", width: 600, height: 600, background: "rgba(37,99,235,0.08)", borderRadius: "50%",
          filter: "blur(100px)", top: -200, left: -200, pointerEvents: "none", zIndex: 0,
          animation: "pulse-glow 8s ease-in-out infinite"
        }} />
        <div className="glow-effect" style={{
          position: "fixed", width: 500, height: 500, background: "rgba(124,58,237,0.06)", borderRadius: "50%",
          filter: "blur(100px)", bottom: -150, right: -150, pointerEvents: "none", zIndex: 0,
          animation: "pulse-glow 10s ease-in-out infinite reverse"
        }} />
      </>}

      {/* NAVBAR - Desktop + Mobile separat */}
      <nav style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: "#020617",
        backgroundImage: "none",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        height: "60px",
        width: "100%",
        overflow: "hidden"
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", boxSizing: "border-box" }}>
          
          {/* LOGO CONTAINER - Links, begrenzt */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            flexShrink: 0,
            maxWidth: "1600px",
            overflow: "hidden"
          }}>
            <img 
              src="https://media.base44.com/images/public/69d8fb5b8dde510755b29a7e/8e6400f40_ChatGPTImage18Mai202615_39_07.png"
              alt="Vertriebo"
              style={{ height: "200px", width: "auto", display: "block", objectFit: "contain" }}
            />
          </div>
          
          {/* DESKTOP NAVIGATION - Mitte */}
          <div className="desktop-only" style={{ 
            display: "none", 
            alignItems: "center", 
            gap: 32,
            flex: 1, 
            justifyContent: "center",
            marginLeft: 24,
            marginRight: 24
          }}>
            <button
              onClick={() => scrollToSection("how-it-works")}
              style={{ color: "rgba(148,163,184,1)", fontSize: 14, background: "none", border: "none", cursor: "pointer", fontWeight: 500, fontFamily: "inherit", transition: "color 0.3s" }}
              onMouseEnter={(e) => e.target.style.color = "white"}
              onMouseLeave={(e) => e.target.style.color = "rgba(148,163,184,1)"}>
              Wie es funktioniert
            </button>
            <button
              onClick={() => scrollToSection("pricing")}
              style={{ color: "rgba(148,163,184,1)", fontSize: 14, background: "none", border: "none", border: "none", cursor: "pointer", fontWeight: 500, fontFamily: "inherit", transition: "color 0.3s" }}
              onMouseEnter={(e) => e.target.style.color = "white"}
              onMouseLeave={(e) => e.target.style.color = "rgba(148,163,184,1)"}>
              Preise
            </button>
            <button
              onClick={() => scrollToSection("faq")}
              style={{ color: "rgba(148,163,184,1)", fontSize: 14, background: "none", border: "none", cursor: "pointer", fontWeight: 500, fontFamily: "inherit", transition: "color 0.3s" }}
              onMouseEnter={(e) => e.target.style.color = "white"}
              onMouseLeave={(e) => e.target.style.color = "rgba(148,163,184,1)"}>
              FAQ
            </button>
          </div>
          
          {/* LOGIN + CTA - Rechts, begrenzt */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 12, 
            flexShrink: 0,
            justifyContent: "flex-end"
          }}>
            <button onClick={handleLogin} style={{ 
              color: "rgba(148,163,184,1)", 
              fontSize: 14, 
              padding: "8px 12px", 
              background: "none", 
              border: "none", 
              cursor: "pointer", 
              fontWeight: 500, 
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              transition: "color 0.3s" 
            }}
            onMouseEnter={(e) => e.target.style.color = "white"}
            onMouseLeave={(e) => e.target.style.color = "rgba(148,163,184,1)"}>
              Login
            </button>
            <button className="desktop-only" onClick={handleRegister} style={{
              display: "none",
              background: "linear-gradient(135deg,#2563eb,#7c3aed)", 
              color: "white", 
              fontWeight: 700, 
              fontSize: 14,
              padding: "10px 16px", 
              borderRadius: 10, 
              border: "none", 
              cursor: "pointer", 
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              boxShadow: "0 0 30px rgba(37,99,235,0.4)",
              transition: "all 0.3s"
            }}
            onMouseEnter={(e) => e.target.style.boxShadow = "0 0 40px rgba(37,99,235,0.6)"}
            onMouseLeave={(e) => e.target.style.boxShadow = "0 0 30px rgba(37,99,235,0.4)"}>
              🚀 14 Tage testen
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#020617",
        position: "relative", overflow: "hidden", paddingTop: 80
      }}>
        {/* Premium Background: Noise + Glows */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(37,99,235,0.15), transparent 70%),
            radial-gradient(ellipse 60% 40% at 70% 60%, rgba(124,58,237,0.12), transparent 70%),
            radial-gradient(ellipse 50% 30% at 30% 80%, rgba(59,130,246,0.08), transparent 70%)
          `,
          filter: "blur(40px)"
        }} />
        
        {/* Noise Texture Overlay */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
        }} />

        <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto", padding: isMobile ? "0 16px" : "0 24px" }}>
          {/* Responsive Grid: 1 column mobile, 2 columns tablet+ */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 48, alignItems: "center" }}>
            {/* Left: Content */}
            <div>
            {/* Badge */}
            <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999,
                background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.4)",
                color: "#93c5fd", fontSize: 13, fontWeight: 600, marginBottom: 24
              }}>
              <Zap size={14} color="#3b82f6" fill="white" /> Für lokale Dienstleister
            </div>

            {/* Headline - Original Text */}
            <h1 style={{
                fontSize: "clamp(40px,5vw,64px)", fontWeight: 900, color: "white",
                lineHeight: 1.1, letterSpacing: -2, marginBottom: 20
              }}>
              Neue Firmenkunden finden.{" "}
              <span style={{
                  background: "linear-gradient(135deg,#60a5fa 0%,#a78bfa 50%,#60a5fa 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  animation: "shimmer 4s linear infinite"
                }}>
                Leads priorisieren.
              </span>{" "}
              Vertrieb einfacher steuern.
            </h1>

            {/* Subheadline - Original Text */}
            <p style={{ fontSize: "clamp(16px,2vw,18px)", color: "rgba(148,163,184,1)", lineHeight: 1.7, marginBottom: 32 }}>
              Vertriebo findet passende B2B-Kontakte, priorisiert heiße Leads und zeigt Ihrem Team, wen es als Nächstes kontaktieren sollte.
            </p>

            {/* Context line - Original */}
            <p style={{ fontSize: 14, color: "rgba(100,116,139,1)", marginBottom: 32 }}>
              Für B2B-Dienstleister in ganz Deutschland – z. B. Gebäudereinigung, IT-Service, Handwerk, Logistik, Pflege, Catering und viele weitere Branchen.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <button
                  onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
                  style={{
                    background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800,
                    fontSize: 15, padding: "14px 28px", borderRadius: 12, border: "none", cursor: "pointer",
                    fontFamily: "inherit", boxShadow: "0 0 40px rgba(37,99,235,0.5)",
                    transition: "all 0.3s"
                  }}>
                  
                14 Tage kostenlos testen
              </button>
              <a
                  href="#how-it-works"
                  style={{
                    color: "rgba(148,163,184,1)", fontSize: 15, fontWeight: 600, padding: "14px 24px",
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
                    textDecoration: "none", fontFamily: "inherit", transition: "all 0.2s"
                  }}>
                  
                So funktioniert Vertriebo
              </a>
            </div>

            {/* Trust Chips - Elegant & Clean */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <Check size={12} color="#22c55e" strokeWidth={3} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#86efac" }}>10 Kontakte gratis</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)" }}>
                <Check size={12} color="#60a5fa" strokeWidth={3} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd" }}>Keine Kreditkarte</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}>
                <Check size={12} color="#a78bfa" strokeWidth={3} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#c4b5fd" }}>Monatlich kündbar</span>
              </div>
            </div>

            {/* Subtle Trust Line */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "rgba(100,116,139,1)", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Shield size={12} color="rgba(148,163,184,0.5)" />
                DSGVO-orientiert
              </span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(148,163,184,0.3)" }} />
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Check size={12} color="rgba(148,163,184,0.5)" />
                Für deutsche B2B-Dienstleister
              </span>
            </div>
          </div>

          {/* Right: App Mockup - Mobile Optimized */}
          <div style={{ position: "relative", width: "100%", overflowX: "hidden" }}>
            <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
                overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6),0 0 0 1px rgba(37,99,235,0.15)",
                maxWidth: "100%"
              }}>
              {/* Browser Chrome */}
              <div style={{ background: "#0f172a", padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(239,68,68,0.5)" }} />
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(245,158,11,0.5)" }} />
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(34,197,94,0.5)" }} />
                </div>
                <div style={{ fontSize: 9, color: "rgba(100,116,139,1)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>app.vertriebo.com</div>
                <div style={{ width: 24 }} />
              </div>

              {/* App Content */}
              <div style={{ background: "#0c1428", padding: "10px 8px", overflowX: "auto" }}>
                {/* App Header mit Logo */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <VertrieboLogo variant="outline" size="sm" />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,1)" }}>Dashboard</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "linear-gradient(135deg,#2563eb,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9, color: "white" }}>
                      MM
                    </div>
                  </div>
                </div>

                {/* Stats Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
                  <div style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: 8, padding: "6px 4px" }}>
                    <p style={{ fontSize: 7, fontWeight: 700, color: "#93c5fd", textTransform: "uppercase", marginBottom: 2 }}>Heute</p>
                    <p style={{ fontSize: 18, fontWeight: 900, color: "#60a5fa" }}>8</p>
                    <p style={{ fontSize: 7, color: "rgba(148,163,184,1)" }}>Rückrufe</p>
                  </div>
                  <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8, padding: "6px 4px" }}>
                    <p style={{ fontSize: 7, fontWeight: 700, color: "#86efac", textTransform: "uppercase", marginBottom: 2 }}>Offen</p>
                    <p style={{ fontSize: 18, fontWeight: 900, color: "#4ade80" }}>34</p>
                    <p style={{ fontSize: 7, color: "rgba(148,163,184,1)" }}>Leads</p>
                  </div>
                  <div style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 8, padding: "6px 4px" }}>
                    <p style={{ fontSize: 7, fontWeight: 700, color: "#c4b5fd", textTransform: "uppercase", marginBottom: 2 }}>Woche</p>
                    <p style={{ fontSize: 18, fontWeight: 900, color: "#a78bfa" }}>18</p>
                    <p style={{ fontSize: 7, color: "rgba(148,163,184,1)" }}>Anrufe</p>
                  </div>
                </div>

                {/* Prioritized Leads */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(148,163,184,1)", display: "flex", alignItems: "center", gap: 3 }}>
                      <Star size={8} fill="#fbbf24" color="#fbbf24" /> Leads
                    </p>
                    <button style={{ fontSize: 8, fontWeight: 700, color: "#60a5fa", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Alle →</button>
                  </div>

                  {/* Lead 1 */}
                  <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <p style={{ fontSize: 7, fontWeight: 700, color: "#f87171", textTransform: "uppercase" }}>Priorität: Hoch</p>
                      <span style={{ fontSize: 7, fontWeight: 700, color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.15)", padding: "1px 4px", borderRadius: 999 }}>Rückruf</span>
                    </div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "white", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Schmidt Gebäudereinigung</p>
                    <p style={{ fontSize: 8, color: "rgba(100,116,139,1)" }}>Berlin</p>
                  </div>

                  {/* Lead 2 */}
                  <div style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)", borderRadius: 8, padding: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <p style={{ fontSize: 7, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase" }}>Priorität: Hoch</p>
                      <span style={{ fontSize: 7, fontWeight: 700, color: "#60a5fa", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.15)", padding: "1px 4px", borderRadius: 999 }}>Neu</span>
                    </div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Hausmeisterdienst Müller</p>
                    <p style={{ fontSize: 8, color: "rgba(100,116,139,1)" }}>Potsdam</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* TRUST BAR - Clean & Structured */}
      <section style={{ background: "#080e1e", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Trust Pillars */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 20, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🏢</div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>40+ Branchen</p>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,1)" }}>Für lokale Dienstleister</p>
            </div>
            <div>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>In 5 Min. startklar</p>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,1)" }}>Erste Leads sofort</p>
            </div>
            <div>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🛡️</div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>DSGVO-orientiert</p>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,1)" }}>Made for Germany</p>
            </div>
            <div>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>Flexibel</p>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,1)" }}>Monatlich kündbar</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES - Original Text */}
      <section id="features" style={{ padding: "96px 24px", background: "#020617" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <RevealOnScroll delay={0}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <h2 style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 16 }}>
                Mehr Struktur im B2B-Vertrieb
              </h2>
              <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", maxWidth: 700, margin: "0 auto" }}>
                Vertriebo ist kein normales CRM. Es hilft Ihnen aktiv, neue Firmenkunden zu finden und Ihren Vertrieb jeden Tag zu steuern – von der Recherche bis zum Nachfassen.
              </p>
            </div>
          </RevealOnScroll>

          <div className="feature-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(3,1fr)", 
            gap: 20,
          }}>
            {FEATURES.map((f, i) => {
              const colors = ACCENT_COLORS[f.accent];
              const IconComponent = f.icon;
              return (
              <RevealOnScroll key={i} delay={i * 80}>
                  <div style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 16,
                    padding: 24,
                    transition: "all 0.3s",
                    cursor: "default",
                    minHeight: 280,
                    display: "flex",
                    flexDirection: "column",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.borderColor = colors.iconColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.borderColor = colors.border;
                  }}>
                    {/* Icon Container */}
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: colors.iconBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 16,
                      flexShrink: 0
                    }}>
                      <IconComponent size={24} color={colors.iconColor} strokeWidth={2} />
                    </div>
                    
                    {/* Content */}
                    <h3 style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "white",
                      marginBottom: 8,
                      lineHeight: 1.4
                    }}>{f.title}</h3>
                    <p style={{
                      fontSize: 13,
                      color: "rgba(148,163,184,1)",
                      lineHeight: 1.6,
                      flex: 1
                    }}>{f.desc}</p>
                  </div>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS - Original Component */}
      <section id="how-it-works">
        <HowItWorks />
      </section>

      {/* PRODUCT SHOWCASE - Original Component */}
      <ProductShowcase />

      {/* INDUSTRIES - Original Text */}
      <section style={{ background: "#080e1e", padding: "72px 24px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <RevealOnScroll delay={0}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h2 style={{ fontSize: 32, fontWeight: 900, color: "white", marginBottom: 12 }}>Für lokale Dienstleister</h2>
              <p style={{ color: "rgba(148,163,184,1)", maxWidth: 700, margin: "0 auto" }}>
                Vertriebo wurde von Vertriebsprofis entwickelt – für Betriebe, die aktiv neue Firmenkunden gewinnen wollen. Gebäudereinigung, IT-Service, Handwerk, Facility Service, Spedition, Pflege, Catering und 20+ weitere Branchen nutzen Vertriebo bereits.
              </p>
            </div>
          </RevealOnScroll>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, maxWidth: 800, margin: "0 auto" }}>
            {INDUSTRIES.map((ind) =>
            <div key={ind.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", cursor: "default", justifyContent: "center" }}>
                <span style={{ fontSize: 14 }}>{ind.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(148,163,184,1)", whiteSpace: "nowrap" }}>{ind.name}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* PRICING - Original Text */}
      <section id="pricing" style={{ background: "#020617", padding: "96px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <RevealOnScroll delay={0}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <h2 style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 900, color: "white", marginBottom: 16 }}>Wählen Sie den passenden Vertriebo-Plan</h2>
              <p style={{ fontSize: 16, color: "rgba(148,163,184,1)", maxWidth: 600, margin: "0 auto" }}>
                Starter können Sie 14 Tage kostenlos testen. Alle Pläne monatlich kündbar. Keine versteckten Kosten.
              </p>
            </div>
          </RevealOnScroll>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, alignItems: "start" }}>
            {PLANS.map((plan) =>
            <RevealOnScroll key={plan.name} delay={100}>
                <div style={{
                background: plan.popular ? "linear-gradient(135deg,#1d4ed8,#2563eb)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${plan.popular ? "rgba(37,99,235,0.6)" : plan.isAgency ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 20, padding: 28, position: "relative",
                transform: plan.popular ? "scale(1.03)" : "none",
                boxShadow: plan.popular ? "0 30px 80px rgba(37,99,235,0.3)" : "none"
              }}>
                  {plan.popular &&
                <div style={{
                  position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#1c1917",
                  fontSize: 11, fontWeight: 900, padding: "4px 14px", borderRadius: 999, whiteSpace: "nowrap"
                }}>Beliebtester Plan</div>
                }
                  <div style={{ fontSize: 17, fontWeight: 800, color: "white", marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontSize: 13, color: plan.popular ? "rgba(147,197,253,0.8)" : "rgba(148,163,184,1)", marginBottom: 20, lineHeight: 1.5 }}>{plan.description}</div>
                  <div style={{ marginBottom: 24 }}>
                    {plan.isAgency ?
                  <span style={{ fontSize: 20, fontWeight: 800, color: "white" }}>Individuelle Preisgestaltung</span> :

                  <><span style={{ fontSize: 40, fontWeight: 900, color: "white" }}>€{plan.price}</span><span style={{ fontSize: 13, color: plan.popular ? "rgba(147,197,253,0.7)" : "rgba(148,163,184,1)", marginLeft: 4 }}>/Monat</span></>
                  }
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {plan.features.map((f) =>
                  <div key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: plan.popular ? "rgba(191,219,254,1)" : "rgba(148,163,184,1)" }}>
                        <Check size={14} color={plan.popular ? "rgba(147,197,253,0.8)" : "#22c55e"} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                        {f}
                      </div>
                  )}
                  </div>
                  <button
                  onClick={() => handleCheckout(plan)}
                  disabled={loading === plan.name}
                  style={{
                    width: "100%", padding: "13px", borderRadius: 12,
                    background: plan.popular ? "white" : plan.isAgency ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.06)",
                    border: plan.popular ? "none" : plan.isAgency ? "1px solid rgba(124,58,237,0.25)" : "1px solid rgba(255,255,255,0.1)",
                    color: plan.popular ? "#1d4ed8" : plan.isAgency ? "#a78bfa" : "white",
                    fontWeight: plan.popular ? 800 : 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                    opacity: loading === plan.name ? 0.5 : 1, transition: "all 0.2s"
                  }}>
                  
                    {loading === plan.name ? "Wird geladen..." : plan.cta}
                  </button>
                </div>
              </RevealOnScroll>
            )}
          </div>

          <RevealOnScroll delay={200}>
           <section id="faq">
             <PricingFAQ />
           </section>
          </RevealOnScroll>

          <p style={{ textAlign: "center", color: "rgba(71,85,105,1)", fontSize: 13, marginTop: 28 }}>
            Alle Preise zzgl. MwSt. · Monatlich kündbar · Fair-Use für Agency-Plan
          </p>
        </div>
      </section>

      {/* FINAL CTA - Original Text */}
      <section style={{
        padding: "96px 24px", position: "relative", overflow: "hidden",
        background: "radial-gradient(ellipse 80% 60% at 50% 50%,rgba(37,99,235,0.2),rgba(124,58,237,0.1),#020617)"
      }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, background: "rgba(37,99,235,0.08)", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none", animation: "pulse-glow 8s ease-in-out infinite" }} />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <RevealOnScroll delay={0}>
            <h2 style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 16 }}>
              Starten Sie mit Vertriebo und bringen Sie Struktur in Ihre Neukundengewinnung.
            </h2>
            <p style={{ fontSize: 18, color: "rgba(148,163,184,1)", marginBottom: 40, lineHeight: 1.6 }}>
              Keine Excel-Listen mehr. Keine vergessenen Rückrufe. Ein klares System für Ihren Vertriebserfolg.
            </p>
            <button
              onClick={handleRegister}
              style={{
                background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", fontWeight: 800,
                fontSize: 17, padding: "18px 40px", borderRadius: 14, border: "none", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 10, fontFamily: "inherit",
                boxShadow: "0 0 40px rgba(37,99,235,0.5)", transition: "all 0.3s"
              }}>
              
              14 Tage kostenlos testen →
            </button>
            <p style={{ color: "rgba(100,116,139,1)", fontSize: 14, marginTop: 20 }}>
              Ohne langfristige Bindung · Monatlich kündbar
            </p>
          </RevealOnScroll>
        </div>
      </section>

      {/* FOOTER - Original Text */}
      <footer style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "48px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center" }}>
          <p style={{ color: "rgba(71,85,105,1)", fontSize: 13, marginBottom: 16 }}>© 2026 Vertriebo</p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, marginBottom: 16 }}>
            <a href="/impressum" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Impressum</a>
            <a href="/datenschutz" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Datenschutz</a>
            <a href="/agb" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>AGB</a>
            <a href="mailto:info@huwa-gebaeudedienste.de" style={{ color: "rgba(71,85,105,1)", fontSize: 13, textDecoration: "none" }}>Kontakt</a>
          </div>
          <p style={{ color: "rgba(51,65,85,1)", fontSize: 12 }}>
            Ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste
          </p>
        </div>
      </footer>

      <AgencyDemoModal isOpen={showAgencyModal} onClose={() => setShowAgencyModal(false)} />
    </div>);

}