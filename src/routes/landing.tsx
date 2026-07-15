import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TiclioLogo } from "@/components/brand/ticlio-logo";

// Deactivated: this page predates the current brand/product and doesn't
// match it anymore (copy, visual identity, even some claimed features).
// /login now doubles as the public marketing page, so every /landing visit
// just goes there instead. Left in place (not deleted) in case any of this
// copy/layout is worth mining later.
export const Route = createFileRoute("/landing")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Ticlio — Inteligência Financeira Pessoal" },
      {
        name: "description",
        content:
          "Importe seus extratos bancários e transforme suas movimentações financeiras em inteligência financeira.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),
});

/* ── Global styles ─────────────────────────────────────────────────── */
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  @keyframes float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes glow    { 0%,100%{opacity:.35} 50%{opacity:.6} }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
  .fade-up           { opacity:0; animation: fadeUp .55s ease forwards; }
  .reveal            { opacity:0; transform:translateY(20px); transition:opacity .55s ease, transform .55s ease; }
  .reveal.in         { opacity:1; transform:translateY(0); }
  .float             { animation: float 3.8s ease-in-out infinite; }
  .glow              { animation: glow 4s ease-in-out infinite; }
  .ticlio-logo-header { width: 136px; flex: 0 0 auto; border-radius: 8px; overflow: hidden; }
  .ticlio-logo-footer { width: 144px; border-radius: 8px; overflow: hidden; }
  .ticlio-logo-mark   { width: 22px; border-radius: 6px; overflow: hidden; }
  @media (max-width: 720px) {
    .ticlio-logo-header { width: 116px; }
    .ticlio-logo-footer { width: 128px; }
  }
`;

/* ── Scroll-reveal helper ──────────────────────────────────────────── */
function RevealDiv({
  delay = 0,
  style,
  children,
  className: extra = "",
}: {
  delay?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = setTimeout(() => {
      const ob = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) {
            setVis(true);
            ob.disconnect();
          }
        },
        { threshold: 0.1 },
      );
      ob.observe(el);
      return () => ob.disconnect();
    }, delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div ref={ref} className={`reveal${vis ? " in" : ""} ${extra}`.trim()} style={style}>
      {children}
    </div>
  );
}

/* ── Gradient text ─────────────────────────────────────────────────── */
function GT({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: "linear-gradient(135deg,#3b9eff 0%,#00CDB8 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      {children}
    </span>
  );
}

/* ── Header ────────────────────────────────────────────────────────── */
function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 60,
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        background: scrolled ? "rgba(8,13,26,.88)" : "rgba(8,13,26,.3)",
        backdropFilter: "blur(18px)",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,.07)" : "1px solid transparent",
        transition: "all .25s",
      }}
    >
      <TiclioLogo variant="full" className="ticlio-logo-header" />
      <nav style={{ flex: 1, display: "flex", justifyContent: "center", gap: 36 }}>
        {["Como funciona", "Benefícios", "Insights", "Segurança"].map((n) => (
          <a
            key={n}
            href={`#${n.toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[̀-ͯ]/g, "")}`}
            style={{
              color: "rgba(255,255,255,.55)",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              transition: "color .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.55)")}
          >
            {n}
          </a>
        ))}
      </nav>
      <Link
        to="/login"
        style={{
          padding: "8px 20px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          color: "white",
          background: "linear-gradient(135deg,#1E6CF5,#00CDB8)",
          textDecoration: "none",
          boxShadow: "0 0 18px rgba(30,108,245,.35)",
          transition: "opacity .15s",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = ".88")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
      >
        Entrar
      </Link>
    </header>
  );
}

/* ── Dashboard Mockup (hero right side) ───────────────────────────── */
function DashMockup() {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {/* Desktop frame */}
      <div
        style={{
          width: 520,
          background: "#10182b",
          border: "1.5px solid rgba(255,255,255,.1)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,.55)",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Browser bar */}
        <div
          style={{
            height: 30,
            background: "#0c1220",
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: 6,
            borderBottom: "1px solid rgba(255,255,255,.06)",
          }}
        >
          {["#ff5f57", "#ffbd2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
          ))}
          <div
            style={{
              flex: 1,
              background: "rgba(255,255,255,.06)",
              borderRadius: 4,
              height: 16,
              marginLeft: 8,
            }}
          />
        </div>
        {/* App chrome */}
        <div style={{ display: "flex", height: 320 }}>
          {/* Sidebar */}
          <div
            style={{
              width: 48,
              background: "#080d1a",
              borderRight: "1px solid rgba(255,255,255,.06)",
              padding: "14px 8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <TiclioLogo variant="icon" className="ticlio-logo-mark" />
            {[0.7, 0.9, 0.6, 0.5, 0.5].map((o, i) => (
              <div
                key={i}
                style={{
                  width: 22,
                  height: 5,
                  borderRadius: 3,
                  background: `rgba(255,255,255,${o * 0.2})`,
                }}
              />
            ))}
          </div>
          {/* Main */}
          <div
            style={{
              flex: 1,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              overflow: "hidden",
            }}
          >
            {/* Greeting */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "white" }}>Olá, Samuel 👋</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)" }}>Julho 2025</div>
              </div>
              <div
                style={{
                  padding: "4px 10px",
                  background: "linear-gradient(135deg,#1E6CF5,#00CDB8)",
                  borderRadius: 6,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "white",
                }}
              >
                + Importar
              </div>
            </div>
            {/* Stats */}
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { l: "Saldo", v: "R$ 12.480", c: "#60a5fa" },
                { l: "Receitas", v: "R$ 9.850", c: "#34d399" },
                { l: "Despesas", v: "R$ 4.350", c: "#f87171" },
              ].map((s) => (
                <div
                  key={s.l}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,255,255,.07)",
                    borderRadius: 8,
                    padding: "7px 9px",
                  }}
                >
                  <div style={{ fontSize: 7.5, color: "rgba(255,255,255,.4)", marginBottom: 2 }}>
                    {s.l}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            {/* Chart + Donut row */}
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              {/* Line chart */}
              <div
                style={{
                  flex: 3,
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.06)",
                  borderRadius: 8,
                  padding: "9px 10px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ fontSize: 8, fontWeight: 600, color: "white", marginBottom: 6 }}>
                  Evolução patrimonial
                </div>
                <svg
                  viewBox="0 0 180 60"
                  style={{ flex: 1, width: "100%" }}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1E6CF5" stopOpacity=".22" />
                      <stop offset="100%" stopColor="#1E6CF5" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 15, 30, 45, 60].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="180"
                      y2={y}
                      stroke="rgba(255,255,255,.04)"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d="M0,55 L22,46 L44,49 L66,35 L88,38 L110,24 L132,27 L154,14 L180,10"
                    stroke="#1E6CF5"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M0,55 L22,46 L44,49 L66,35 L88,38 L110,24 L132,27 L154,14 L180,10 L180,60 L0,60Z"
                    fill="url(#area)"
                  />
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  {["Jan", "Mar", "Mai", "Jul", "Set"].map((m) => (
                    <span key={m} style={{ fontSize: 6.5, color: "rgba(255,255,255,.25)" }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
              {/* Donut */}
              <div
                style={{
                  flex: 2,
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.06)",
                  borderRadius: 8,
                  padding: "9px 10px",
                }}
              >
                <div style={{ fontSize: 8, fontWeight: 600, color: "white", marginBottom: 6 }}>
                  Categorias
                </div>
                <svg
                  viewBox="0 0 60 60"
                  width={60}
                  height={60}
                  style={{ display: "block", margin: "0 auto 4px" }}
                >
                  <circle
                    cx="30"
                    cy="30"
                    r="22"
                    fill="none"
                    stroke="rgba(255,255,255,.05)"
                    strokeWidth="10"
                  />
                  <circle
                    cx="30"
                    cy="30"
                    r="22"
                    fill="none"
                    stroke="#1E6CF5"
                    strokeWidth="10"
                    strokeDasharray="50 88"
                    strokeDashoffset="-6"
                  />
                  <circle
                    cx="30"
                    cy="30"
                    r="22"
                    fill="none"
                    stroke="#00CDB8"
                    strokeWidth="10"
                    strokeDasharray="32 106"
                    strokeDashoffset="-56"
                  />
                  <circle
                    cx="30"
                    cy="30"
                    r="22"
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="10"
                    strokeDasharray="22 116"
                    strokeDashoffset="-88"
                  />
                  <text
                    x="30"
                    y="28"
                    textAnchor="middle"
                    fill="white"
                    fontSize="8"
                    fontWeight="700"
                  >
                    68%
                  </text>
                  <text x="30" y="36" textAnchor="middle" fill="rgba(255,255,255,.4)" fontSize="5">
                    poupado
                  </text>
                </svg>
                {[
                  { c: "#1E6CF5", l: "Moradia", p: "34%" },
                  { c: "#00CDB8", l: "Alimentação", p: "26%" },
                  { c: "#a78bfa", l: "Lazer", p: "16%" },
                ].map((x) => (
                  <div
                    key={x.l}
                    style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}
                  >
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: x.c }} />
                    <span style={{ fontSize: 7, color: "rgba(255,255,255,.5)", flex: 1 }}>
                      {x.l}
                    </span>
                    <span style={{ fontSize: 7, fontWeight: 600, color: "white" }}>{x.p}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Insight + goal */}
            <div style={{ display: "flex", gap: 8 }}>
              <div
                style={{
                  flex: 2,
                  background: "rgba(30,108,245,.08)",
                  border: "1px solid rgba(30,108,245,.2)",
                  borderRadius: 8,
                  padding: "7px 9px",
                }}
              >
                <div style={{ fontSize: 7, color: "#93c5fd", fontWeight: 600, marginBottom: 2 }}>
                  ✦ Insight IA
                </div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,.6)", lineHeight: 1.4 }}>
                  Você gastou 18% mais com alimentação este mês.
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: "rgba(0,205,184,.07)",
                  border: "1px solid rgba(0,205,184,.2)",
                  borderRadius: 8,
                  padding: "7px 9px",
                }}
              >
                <div style={{ fontSize: 7, color: "#5eead4", fontWeight: 600, marginBottom: 4 }}>
                  Meta: Reserva
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2 }}>
                  <div
                    style={{
                      width: "64%",
                      height: "100%",
                      background: "linear-gradient(90deg,#1E6CF5,#00CDB8)",
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div style={{ fontSize: 7, color: "#00CDB8", marginTop: 3 }}>64% concluída</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile frame */}
      <div
        className="float"
        style={{
          position: "absolute",
          right: -52,
          bottom: -14,
          width: 158,
          height: 304,
          zIndex: 3,
          background: "#10182b",
          border: "2px solid rgba(255,255,255,.14)",
          borderRadius: 27,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,.58)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 18,
            flexShrink: 0,
            background: "#080d1a",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{ width: 42, height: 4, background: "rgba(255,255,255,.16)", borderRadius: 4 }}
          />
        </div>
        <div
          style={{
            padding: "10px 10px 7px",
            display: "flex",
            flex: 1,
            flexDirection: "column",
            gap: 7,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 6.5, color: "rgba(255,255,255,.38)" }}>Olá, Samuel</div>
              <div style={{ fontSize: 8, fontWeight: 700, color: "white" }}>Visão geral</div>
            </div>
            <div
              style={{
                width: 17,
                height: 17,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#1E6CF5,#00CDB8)",
                color: "white",
                fontSize: 6,
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              S
            </div>
          </div>
          <div
            style={{
              padding: "8px 9px",
              borderRadius: 9,
              background: "linear-gradient(145deg,rgba(30,108,245,.16),rgba(0,205,184,.07))",
              border: "1px solid rgba(96,165,250,.16)",
            }}
          >
            <div style={{ fontSize: 6.5, color: "rgba(255,255,255,.42)" }}>Saldo total</div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "white",
                letterSpacing: "-0.03em",
                marginTop: 2,
              }}
            >
              R$ 12.480
            </div>
            <div style={{ fontSize: 6, color: "#34d399", marginTop: 2 }}>
              ↑ 9% nos últimos 3 meses
            </div>
          </div>
          <svg
            viewBox="0 0 132 42"
            width="100%"
            height="42"
            style={{ display: "block" }}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="ma" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1E6CF5" stopOpacity=".25" />
                <stop offset="100%" stopColor="#1E6CF5" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,37 L21,29 L43,32 L65,20 L87,23 L109,11 L132,7"
              stroke="#1E6CF5"
              strokeWidth="1.7"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M0,37 L21,29 L43,32 L65,20 L87,23 L109,11 L132,7 L132,42 L0,42Z"
              fill="url(#ma)"
            />
          </svg>
          <div
            style={{
              padding: "7px 8px",
              borderRadius: 8,
              background: "rgba(30,108,245,.08)",
              border: "1px solid rgba(30,108,245,.18)",
            }}
          >
            <div style={{ fontSize: 6.5, color: "#93c5fd", fontWeight: 700, marginBottom: 2 }}>
              ✦ Insight Ticlio
            </div>
            <div style={{ fontSize: 6.5, lineHeight: 1.35, color: "rgba(255,255,255,.55)" }}>
              Sua reserva está 64% concluída.
            </div>
          </div>
          <div style={{ fontSize: 7, color: "white", fontWeight: 700 }}>Últimas movimentações</div>
          {[
            { d: "Salário", v: "+R$6.500", c: "#34d399" },
            { d: "Supermercado", v: "-R$342", c: "#f87171" },
            { d: "Streaming", v: "-R$89", c: "#f87171" },
          ].map((t) => (
            <div key={t.d} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 13,
                  height: 13,
                  flexShrink: 0,
                  borderRadius: 4,
                  background: "rgba(255,255,255,.06)",
                }}
              />
              <span style={{ fontSize: 6.5, color: "rgba(255,255,255,.48)", flex: 1 }}>{t.d}</span>
              <span style={{ fontSize: 6.5, fontWeight: 700, color: t.c }}>{t.v}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            height: 25,
            flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            background: "#0c1322",
          }}
        >
          {["●", "▥", "◎", "◉"].map((item, index) => (
            <span
              key={item}
              style={{ fontSize: 7, color: index === 0 ? "#60a5fa" : "rgba(255,255,255,.26)" }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section
      style={{
        minHeight: "100vh",
        background: "#080d1a",
        display: "flex",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        paddingTop: 60,
      }}
    >
      {/* Ambient orbs */}
      <div
        className="glow"
        style={{
          position: "absolute",
          top: "8%",
          left: "5%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(30,108,245,.13) 0%, transparent 70%)",
          filter: "blur(44px)",
          pointerEvents: "none",
        }}
      />
      <div
        className="glow"
        style={{
          position: "absolute",
          bottom: "10%",
          right: "2%",
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,205,184,.1) 0%, transparent 70%)",
          filter: "blur(44px)",
          pointerEvents: "none",
          animationDelay: "1.5s",
        }}
      />

      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "0 32px 80px",
          display: "flex",
          alignItems: "center",
          gap: 64,
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Left: copy */}
        <div style={{ flex: "0 0 46%" }}>
          <div
            className="fade-up"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 14px",
              borderRadius: 20,
              background: "rgba(30,108,245,.12)",
              border: "1px solid rgba(30,108,245,.25)",
              marginBottom: 26,
              color: "#93c5fd",
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#60a5fa" }} />
            Inteligência financeira pessoal
          </div>

          <h1
            className="fade-up"
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: "white",
              lineHeight: 1.06,
              letterSpacing: "-0.035em",
              marginBottom: 22,
              animationDelay: ".08s",
            }}
          >
            Entenda seus dados.
            <br />
            Planeje suas metas.
            <br />
            <GT>Conquiste seus resultados.</GT>
          </h1>

          <p
            className="fade-up"
            style={{
              fontSize: 17,
              color: "rgba(255,255,255,.52)",
              lineHeight: 1.68,
              marginBottom: 36,
              animationDelay: ".16s",
            }}
          >
            Importe seus extratos bancários e transforme suas movimentações financeiras em
            inteligência financeira para tomar decisões melhores todos os dias.
          </p>

          <div className="fade-up" style={{ display: "flex", gap: 12, animationDelay: ".24s" }}>
            <Link
              to="/login"
              style={{
                padding: "13px 26px",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 700,
                color: "white",
                background: "linear-gradient(135deg,#1E6CF5,#00CDB8)",
                textDecoration: "none",
                boxShadow: "0 0 26px rgba(30,108,245,.4)",
                transition: "all .2s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-2px)";
                el.style.boxShadow = "0 8px 36px rgba(30,108,245,.5)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "";
                el.style.boxShadow = "0 0 26px rgba(30,108,245,.4)";
              }}
            >
              Começar agora →
            </Link>
            <Link
              to="/login"
              style={{
                padding: "13px 26px",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                color: "rgba(255,255,255,.75)",
                background: "rgba(255,255,255,.07)",
                border: "1px solid rgba(255,255,255,.1)",
                textDecoration: "none",
                transition: "all .2s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.12)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)")
              }
            >
              Entrar
            </Link>
          </div>

          <p
            className="fade-up"
            style={{
              marginTop: 20,
              fontSize: 12.5,
              color: "rgba(255,255,255,.28)",
              animationDelay: ".32s",
            }}
          >
            Sem cartão de crédito · Dados protegidos · Conforme LGPD
          </p>
        </div>

        {/* Right: dashboard mockup */}
        <div
          className="fade-up"
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            paddingRight: 70,
            animationDelay: ".2s",
          }}
        >
          <DashMockup />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          background: "linear-gradient(to bottom, transparent, #080d1a)",
          pointerEvents: "none",
        }}
      />
    </section>
  );
}

/* ── Como funciona ─────────────────────────────────────────────────── */
const STEPS = [
  {
    n: "01",
    icon: "⬆",
    title: "Importe seus extratos OFX",
    desc: "Carregue arquivos OFX ou faturas PDF de qualquer banco. Leitura automática, zero digitação.",
  },
  {
    n: "02",
    icon: "⚙",
    title: "O Ticlio interpreta tudo",
    desc: "IA categoriza e organiza cada transação. Parcelamentos identificados e acompanhados automaticamente.",
  },
  {
    n: "03",
    icon: "📈",
    title: "Acompanhe sua evolução",
    desc: "Visualize fluxo de caixa, categorias, evolução patrimonial e metas em dashboards claros.",
  },
  {
    n: "04",
    icon: "🎯",
    title: "Suas metas viram decisões",
    desc: "Insights personalizados com base nos seus dados reais — não em médias genéricas.",
  },
];
function HowItWorks() {
  return (
    <section id="como-funciona" style={{ background: "#0a0f1e", padding: "100px 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
        <RevealDiv style={{ textAlign: "center", marginBottom: 64 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#1E6CF5",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Como funciona
          </p>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: "white", letterSpacing: "-0.03em" }}>
            De extrato a <GT>inteligência</GT> em 4 etapas
          </h2>
        </RevealDiv>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 2,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 34,
              left: "12%",
              right: "12%",
              height: 1,
              background:
                "linear-gradient(to right,transparent,rgba(30,108,245,.35),rgba(0,205,184,.35),transparent)",
              pointerEvents: "none",
            }}
          />
          {STEPS.map((s, i) => (
            <RevealDiv key={s.n} delay={i * 100} style={{ padding: "0 18px", textAlign: "center" }}>
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  background: "rgba(30,108,245,.09)",
                  border: "1px solid rgba(30,108,245,.22)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  fontSize: 26,
                  boxShadow: "0 0 20px rgba(30,108,245,.12)",
                }}
              >
                {s.icon}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  color: "#60a5fa",
                  marginBottom: 8,
                }}
              >
                {s.n}
              </div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "white",
                  marginBottom: 8,
                  letterSpacing: "-0.01em",
                }}
              >
                {s.title}
              </h3>
              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,.42)", lineHeight: 1.65 }}>
                {s.desc}
              </p>
            </RevealDiv>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Benefícios ────────────────────────────────────────────────────── */
const BENEFITS = [
  {
    icon: "📥",
    title: "Extratos OFX organizados",
    desc: "Importe de qualquer banco. O Ticlio lê e organiza tudo em segundos, sem digitação.",
  },
  {
    icon: "📊",
    title: "Dashboards inteligentes",
    desc: "Visualize receitas, despesas, categorias e evolução patrimonial em tempo real.",
  },
  {
    icon: "🎯",
    title: "Metas personalizadas",
    desc: "Crie objetivos com data e valor alvo. Acompanhe o progresso mês a mês.",
  },
  {
    icon: "💡",
    title: "Insights para melhores decisões",
    desc: "IA analisa seus hábitos e gera alertas e recomendações com base nos seus dados.",
  },
  {
    icon: "📈",
    title: "Evolução patrimonial",
    desc: "Veja como seu patrimônio evolui ao longo do tempo com gráficos claros e precisos.",
  },
  {
    icon: "🗓",
    title: "Planejamento financeiro",
    desc: "Projeções realistas baseadas no seu histórico — para planejar com confiança.",
  },
];
function Benefits() {
  return (
    <section id="beneficios" style={{ background: "#080d1a", padding: "100px 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
        <RevealDiv style={{ textAlign: "center", marginBottom: 64 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#00CDB8",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Benefícios
          </p>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: "white", letterSpacing: "-0.03em" }}>
            Tudo que você precisa.
            <br />
            <GT>Nada que você não precisa.</GT>
          </h2>
        </RevealDiv>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {BENEFITS.map((b, i) => (
            <RevealDiv
              key={b.title}
              delay={i * 70}
              style={{
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 14,
                padding: "26px 26px 30px",
                transition: "all .25s",
                cursor: "default",
              }}
              className="benefit-card"
            >
              <div style={{ fontSize: 30, marginBottom: 14 }}>{b.icon}</div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "white",
                  marginBottom: 8,
                  letterSpacing: "-0.01em",
                }}
              >
                {b.title}
              </h3>
              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,.42)", lineHeight: 1.68 }}>
                {b.desc}
              </p>
            </RevealDiv>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Institutional quote ───────────────────────────────────────────── */
function InstitutionalQuote() {
  return (
    <section
      style={{ background: "#0a0f1e", padding: "90px 0", position: "relative", overflow: "hidden" }}
    >
      <div
        className="glow"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(30,108,245,.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <RevealDiv
        style={{
          maxWidth: 760,
          margin: "0 auto",
          textAlign: "center",
          padding: "0 32px",
          position: "relative",
        }}
      >
        <p
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.025em",
            lineHeight: 1.35,
            marginBottom: 24,
          }}
        >
          O Ticlio não apenas organiza suas finanças.
          <br />
          <GT>Ele ajuda você a entendê-las.</GT>
        </p>
        <p
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,.45)",
            lineHeight: 1.7,
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          O Ticlio transforma dados financeiros dispersos em uma visão clara sobre hábitos, metas,
          tendências e oportunidades de evolução.
        </p>
      </RevealDiv>
    </section>
  );
}

/* ── Insights ──────────────────────────────────────────────────────── */
const INSIGHTS_DATA = [
  {
    icon: "📊",
    color: "#f87171",
    label: "Alerta de gastos",
    text: "Você gastou 18% mais com alimentação este mês.",
  },
  {
    icon: "🎯",
    color: "#34d399",
    label: "Progresso de meta",
    text: "Sua meta de reserva de emergência está 64% concluída.",
  },
  {
    icon: "📅",
    color: "#60a5fa",
    label: "Projeção",
    text: "Se mantiver este ritmo, pode alcançar sua meta em novembro.",
  },
  {
    icon: "🔁",
    color: "#a78bfa",
    label: "Gastos recorrentes",
    text: "Seus gastos recorrentes representam 32% da sua renda.",
  },
  {
    icon: "📈",
    color: "#00CDB8",
    label: "Patrimônio",
    text: "Seu patrimônio evoluiu 9% nos últimos 3 meses.",
  },
];
function InsightsSection() {
  return (
    <section id="insights" style={{ background: "#080d1a", padding: "100px 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
        <RevealDiv style={{ textAlign: "center", marginBottom: 64 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#a78bfa",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Insights de IA
          </p>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: "white", letterSpacing: "-0.03em" }}>
            Insights que <GT>realmente importam</GT>
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,.42)",
              marginTop: 14,
              maxWidth: 480,
              margin: "14px auto 0",
            }}
          >
            Não alertas genéricos. Análises baseadas nos seus dados.
          </p>
        </RevealDiv>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {INSIGHTS_DATA.map((ins, i) => (
            <RevealDiv
              key={ins.label}
              delay={i * 80}
              style={{
                flex: "1 1 200px",
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 14,
                padding: "20px 20px 22px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: `linear-gradient(to right, transparent, ${ins.color}, transparent)`,
                  opacity: 0.65,
                }}
              />
              <div style={{ fontSize: 22, marginBottom: 10 }}>{ins.icon}</div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: ins.color,
                  marginBottom: 8,
                  letterSpacing: "0.04em",
                }}
              >
                {ins.label}
              </div>
              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,.65)", lineHeight: 1.65 }}>
                {ins.text}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 12 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: ins.color }} />
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.28)" }}>
                  Gerado pelo Ticlio
                </span>
              </div>
            </RevealDiv>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Segurança ─────────────────────────────────────────────────────── */
const SEC = [
  {
    icon: "🔐",
    title: "Seus dados protegidos",
    desc: "Criptografia TLS 1.3 em trânsito e AES-256 em repouso. Seus extratos nunca ficam expostos.",
  },
  {
    icon: "⬆",
    title: "Importação segura",
    desc: "Você importa manualmente seus extratos. O Ticlio não acessa sua conta bancária.",
  },
  {
    icon: "🛡",
    title: "Privacidade em primeiro lugar",
    desc: "Você controla seus dados. Exporte ou exclua tudo a qualquer momento.",
  },
  {
    icon: "⚖",
    title: "Preparado para LGPD",
    desc: "Operamos em conformidade com a Lei Geral de Proteção de Dados. Sem pegadinhas.",
  },
];
function SecuritySection() {
  return (
    <section id="seguranca" style={{ background: "#0a0f1e", padding: "100px 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}
        >
          <RevealDiv>
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "#34d399",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Segurança
            </p>
            <h2
              style={{
                fontSize: 42,
                fontWeight: 800,
                color: "white",
                letterSpacing: "-0.03em",
                marginBottom: 16,
              }}
            >
              Seus dados,
              <br />
              <GT>protegidos.</GT>
            </h2>
            <p
              style={{
                fontSize: 15.5,
                color: "rgba(255,255,255,.45)",
                lineHeight: 1.7,
                marginBottom: 28,
              }}
            >
              Segurança não é um recurso — é a base de tudo. Projetamos o Ticlio com privacidade em
              cada camada.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {["LGPD", "TLS 1.3", "AES-256"].map((t) => (
                <div
                  key={t}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 7,
                    background: "rgba(52,211,153,.1)",
                    border: "1px solid rgba(52,211,153,.25)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#34d399",
                  }}
                >
                  ✓ {t}
                </div>
              ))}
            </div>
          </RevealDiv>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {SEC.map((s, i) => (
              <RevealDiv
                key={s.title}
                delay={i * 80}
                style={{
                  background: "rgba(52,211,153,.04)",
                  border: "1px solid rgba(52,211,153,.12)",
                  borderRadius: 12,
                  padding: "18px 18px 22px",
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 10 }}>{s.icon}</div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 6 }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.4)", lineHeight: 1.65 }}>
                  {s.desc}
                </p>
              </RevealDiv>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ─────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section style={{ background: "#080d1a", padding: "100px 0" }}>
      <RevealDiv
        style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", padding: "0 32px" }}
      >
        <h2
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: "white",
            letterSpacing: "-0.035em",
            marginBottom: 18,
            lineHeight: 1.08,
          }}
        >
          Comece a transformar
          <br />
          seus dados em <GT>decisões.</GT>
        </h2>
        <p
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,.45)",
            marginBottom: 34,
            lineHeight: 1.65,
          }}
        >
          Importe seus extratos e descubra uma nova forma de entender sua vida financeira.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link
            to="/login"
            style={{
              padding: "14px 30px",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              color: "white",
              background: "linear-gradient(135deg,#1E6CF5,#00CDB8)",
              textDecoration: "none",
              boxShadow: "0 0 28px rgba(30,108,245,.42)",
              transition: "all .2s",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "translateY(-2px)";
              el.style.boxShadow = "0 10px 40px rgba(30,108,245,.52)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.transform = "";
              el.style.boxShadow = "0 0 28px rgba(30,108,245,.42)";
            }}
          >
            Começar agora →
          </Link>
          <Link
            to="/login"
            style={{
              padding: "14px 30px",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              color: "rgba(255,255,255,.72)",
              background: "rgba(255,255,255,.07)",
              border: "1px solid rgba(255,255,255,.1)",
              textDecoration: "none",
              transition: "background .2s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.12)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)")
            }
          >
            Entrar
          </Link>
        </div>
      </RevealDiv>
    </section>
  );
}

/* ── Footer ────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer
      style={{
        background: "#050a14",
        borderTop: "1px solid rgba(255,255,255,.06)",
        padding: "48px 32px 32px",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 32,
          }}
        >
          <div>
            <TiclioLogo variant="full" className="ticlio-logo-footer" />
            <p
              style={{
                marginTop: 10,
                fontSize: 13.5,
                color: "rgba(255,255,255,.3)",
                maxWidth: 280,
                lineHeight: 1.6,
              }}
            >
              Inteligência financeira pessoal a partir dos seus próprios dados.
            </p>
          </div>
          <div style={{ display: "flex", gap: 28 }}>
            {["Privacidade", "Termos", "Contato"].map((l) => (
              <a
                key={l}
                href="#"
                style={{
                  fontSize: 13.5,
                  color: "rgba(255,255,255,.35)",
                  textDecoration: "none",
                  transition: "color .15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.75)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.35)")}
              >
                {l}
              </a>
            ))}
          </div>
        </div>
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,.05)",
            paddingTop: 20,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.2)" }}>
            © 2025 Ticlio. Todos os direitos reservados.
          </p>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.2)" }}>Feito no Brasil 🇧🇷</p>
        </div>
      </div>
    </footer>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */
function LandingPage() {
  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <style>{CSS}</style>
      <Header />
      <Hero />
      <HowItWorks />
      <Benefits />
      <InstitutionalQuote />
      <InsightsSection />
      <SecuritySection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
