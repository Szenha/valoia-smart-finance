import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Mic, PiggyBank, RefreshCw, Sparkles, Upload, Users } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { TiclioLogo } from "@/components/brand/ticlio-logo";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Ticlio — Entrar" },
      {
        name: "description",
        content:
          "Lance gastos por voz, organize as finanças da família e acompanhe tudo num só lugar.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  component: Login,
});

const FEATURES = [
  {
    icon: Mic,
    title: "Lance por voz",
    description: "Fale o gasto e a IA organiza sozinha — valor, categoria e data.",
  },
  {
    icon: Sparkles,
    title: "Categorização automática",
    description: "O sistema aprende com você e categoriza sem esforço.",
  },
  {
    icon: Users,
    title: "Toda a família junta",
    description: "Contas, cartões e lançamentos compartilhados entre os membros.",
  },
  {
    icon: Upload,
    title: "Importe extratos",
    description: "OFX do banco ou fatura em PDF, direto pro sistema.",
  },
  {
    icon: PiggyBank,
    title: "Planejamento anual",
    description: "Planeje por categoria, mês a mês, receitas e despesas separadas.",
  },
  {
    icon: RefreshCw,
    title: "Despesas fixas",
    description: "Cadastre uma vez (aluguel, escola…) e dê baixa todo mês.",
  },
];

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
        if (authErr) {
          setError(authErr.message);
          return;
        }
        await getOrCreateOrganization();
        navigate({ to: "/" });
      } else {
        const { data, error: authErr } = await supabase.auth.signUp({ email, password });
        if (authErr) {
          setError(authErr.message);
          return;
        }
        if (data.session) {
          await getOrCreateOrganization();
          navigate({ to: "/" });
        } else {
          setInfo(
            "Conta criada! Verifique seu email e clique no link de confirmação antes de entrar.",
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        WebkitFontSmoothing: "antialiased",
        minHeight: "100vh",
        background: "#F7FAF9",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Browser autofill (saved credentials) paints its own background,
          ignoring our light theme. Override it with the box-shadow-inset
          trick and a very long transition delay so it never flashes white. */}
      <style>{`
        .ticlio-auth-input:-webkit-autofill,
        .ticlio-auth-input:-webkit-autofill:hover,
        .ticlio-auth-input:-webkit-autofill:focus,
        .ticlio-auth-input:-webkit-autofill:active,
        .ticlio-auth-input:autofill {
          -webkit-box-shadow: 0 0 0 1000px #F3F5F4 inset !important;
          box-shadow: 0 0 0 1000px #F3F5F4 inset !important;
          -webkit-text-fill-color: #0B1B2A !important;
          caret-color: #0B1B2A;
          transition: background-color 5000s ease-in-out 0s, color 5000s ease-in-out 0s;
        }
        .ticlio-auth-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px rgba(3,92,58,0.06) inset !important;
          box-shadow: 0 0 0 1000px rgba(3,92,58,0.06) inset !important;
        }
      `}</style>

      {/* Ambient orbs */}
      <div
        style={{
          position: "absolute",
          top: "8%",
          left: "10%",
          width: 460,
          height: 460,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(52,211,153,0.16) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "4%",
          right: "8%",
          width: 380,
          height: 380,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(3,92,58,0.14) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Header: single centered logo */}
      <header
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "28px 16px 8px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <TiclioLogo variant="full-on-light" style={{ width: "clamp(140px, 30vw, 168px)" }} />
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 1,
          padding: "24px 16px 48px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1080,
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 48,
            alignItems: "center",
          }}
          className="ticlio-auth-grid"
        >
          <style>{`
            @media (min-width: 960px) {
              .ticlio-auth-grid { grid-template-columns: 1.1fr 0.9fr !important; }
            }
          `}</style>

          {/* Marketing / hero column */}
          <section>
            <h1
              style={{
                fontSize: "clamp(28px, 4vw, 40px)",
                fontWeight: 800,
                color: "#0B1B2A",
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                margin: "0 0 16px",
              }}
            >
              Suas finanças, contadas em voz alta.
            </h1>
            <p
              style={{
                fontSize: 17,
                color: "rgba(11,27,42,0.6)",
                lineHeight: 1.6,
                margin: "0 0 32px",
                maxWidth: 480,
              }}
            >
              Fale um gasto, a IA organiza sozinha. Toda a família compartilhando contas, cartões e
              planejamento — num só lugar, sem planilha.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: 12,
              }}
            >
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "16px",
                    background: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(11,27,42,0.06)",
                    borderRadius: 14,
                    boxShadow: "0 1px 2px rgba(11,27,42,0.03)",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "rgba(3,92,58,0.08)",
                      color: "#035C3A",
                    }}
                  >
                    <Icon size={17} />
                  </span>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#0B1B2A", margin: 0 }}>
                      {title}
                    </p>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "rgba(11,27,42,0.55)",
                        margin: "2px 0 0",
                        lineHeight: 1.4,
                      }}
                    >
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Auth card */}
          <section
            style={{
              width: "100%",
              maxWidth: 420,
              justifySelf: "center",
              background: "#ffffff",
              border: "1px solid rgba(11,27,42,0.08)",
              borderRadius: 20,
              padding: "36px 36px 32px",
              boxShadow: "0 24px 60px rgba(11,27,42,0.10), 0 0 0 1px rgba(11,27,42,0.02)",
              position: "relative",
            }}
          >
            {/* Top gradient line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "20%",
                right: "20%",
                height: 2,
                background: "linear-gradient(to right, transparent, #C6D627, #035C3A, transparent)",
                borderRadius: 2,
              }}
            />

            <h2
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0B1B2A",
                letterSpacing: "-0.025em",
                margin: "0 0 4px",
              }}
            >
              {mode === "login" ? "Bem-vindo de volta" : "Criar conta"}
            </h2>
            <p style={{ fontSize: 14, color: "rgba(11,27,42,0.5)", margin: "0 0 24px" }}>
              {mode === "login"
                ? "Entre na sua conta para continuar"
                : "Comece a controlar suas finanças hoje"}
            </p>

            {/* Mode toggle pills */}
            <div
              style={{
                display: "flex",
                gap: 0,
                marginBottom: 24,
                background: "#F3F5F4",
                borderRadius: 10,
                padding: 4,
              }}
            >
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 7,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    transition: "all .2s",
                    background: mode === m ? "#ffffff" : "transparent",
                    color: mode === m ? "#035C3A" : "rgba(11,27,42,0.45)",
                    boxShadow: mode === m ? "0 1px 4px rgba(11,27,42,0.12)" : "none",
                  }}
                >
                  {m === "login" ? "Entrar" : "Cadastrar"}
                </button>
              ))}
            </div>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              {/* Email */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "rgba(11,27,42,0.6)" }}>
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="ticlio-auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="seu@email.com"
                  style={{
                    padding: "11px 14px",
                    background: focusedField === "email" ? "rgba(3,92,58,0.05)" : "#F3F5F4",
                    border:
                      focusedField === "email"
                        ? "1px solid rgba(3,92,58,0.4)"
                        : "1px solid rgba(11,27,42,0.08)",
                    borderRadius: 10,
                    fontSize: 14,
                    color: "#0B1B2A",
                    outline: "none",
                    transition: "all .2s",
                  }}
                />
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "rgba(11,27,42,0.6)" }}>
                  Senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="ticlio-auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  style={{
                    padding: "11px 14px",
                    background: focusedField === "password" ? "rgba(3,92,58,0.05)" : "#F3F5F4",
                    border:
                      focusedField === "password"
                        ? "1px solid rgba(3,92,58,0.4)"
                        : "1px solid rgba(11,27,42,0.08)",
                    borderRadius: 10,
                    fontSize: 14,
                    color: "#0B1B2A",
                    outline: "none",
                    transition: "all .2s",
                  }}
                />
              </div>

              {/* Error / Info */}
              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    fontSize: 13,
                    color: "#b91c1c",
                  }}
                >
                  {error}
                </div>
              )}
              {info && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(52,211,153,0.1)",
                    border: "1px solid rgba(52,211,153,0.3)",
                    fontSize: 13,
                    color: "#047857",
                  }}
                >
                  {info}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 4,
                  padding: "13px 0",
                  borderRadius: 10,
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "white",
                  // Solid fill (not the full lime-to-petroleum gradient) so
                  // white text keeps reliable contrast — small filled
                  // buttons use --primary, the darker end of the brand
                  // gradient.
                  background: loading ? "rgba(3,92,58,0.5)" : "#035C3A",
                  boxShadow: loading ? "none" : "0 8px 20px rgba(3,92,58,0.25)",
                  transition: "all .2s",
                  letterSpacing: "-0.01em",
                }}
                onMouseEnter={(e) => {
                  if (!loading) (e.currentTarget as HTMLElement).style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = "1";
                }}
              >
                {loading ? "Aguarde…" : mode === "login" ? "Entrar →" : "Criar conta →"}
              </button>
            </form>

            {/* Footer note */}
            <p
              style={{
                marginTop: 24,
                textAlign: "center",
                fontSize: 13,
                color: "rgba(11,27,42,0.4)",
                lineHeight: 1.5,
              }}
            >
              {mode === "login" ? (
                <>
                  Não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#035C3A",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      padding: 0,
                    }}
                  >
                    Cadastre-se grátis
                  </button>
                </>
              ) : (
                <>
                  Já tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#035C3A",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      padding: 0,
                    }}
                  >
                    Entre aqui
                  </button>
                </>
              )}
            </p>
          </section>
        </div>
      </main>

      {/* Bottom badge */}
      <p
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "rgba(11,27,42,0.35)",
          padding: "0 16px 28px",
          position: "relative",
          zIndex: 1,
        }}
      >
        Dados protegidos · Conforme LGPD
      </p>
    </div>
  );
}
