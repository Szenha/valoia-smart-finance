import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, CreditCard, Mic, ShieldCheck, Sparkles } from "lucide-react";
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
      { title: "Ticlio, Entrar" },
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
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@700;800&display=swap",
      },
    ],
  }),
  component: Login,
});

const FEATURES = [
  {
    icon: Mic,
    title: "Lance por voz",
    description: "Sem abrir planilha ou digitar linha por linha.",
  },
  {
    icon: Sparkles,
    title: "IA organiza",
    description: "Valor, categoria, data e pagamento já vêm sugeridos.",
  },
  {
    icon: CreditCard,
    title: "Painel organizado",
    description: "Contas, cartões e despesas em um só painel.",
  },
];

const TRUST_ITEMS = ["30 dias grátis", "Sem cartão na inscrição", "Acesso beta individual"];

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

  async function handleGoogleSignIn() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const redirectTo =
        typeof window === "undefined" ? undefined : `${window.location.origin}/login`;
      const { error: authErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (authErr) {
        const providerDisabled = authErr.message.toLowerCase().includes("provider is not enabled");
        setError(
          providerDisabled
            ? "Login com Google ainda não está ativo. Entre com email e senha por enquanto."
            : authErr.message,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  const voicePreview = (
    <div
      className="ticlio-voice-preview"
      aria-hidden="true"
      style={{
        width: "100%",
        maxWidth: 560,
        borderRadius: 14,
        border: "1px solid rgba(3,92,58,0.12)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(247,250,249,0.84))",
        boxShadow: "0 18px 46px -38px rgba(3,92,58,0.54)",
        padding: "11px 12px",
        marginBottom: 18,
        position: "relative",
        zIndex: 1,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(130deg, rgba(198,214,39,0.14), transparent 42%, rgba(3,92,58,0.08))",
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#035C3A",
            color: "white",
            flexShrink: 0,
          }}
        >
          <Mic size={15} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <strong style={{ color: "#0B1B2A", fontSize: 13.5, fontWeight: 800 }}>
              “Gastei 82 reais no mercado hoje”
            </strong>
            <span style={{ color: "rgba(11,27,42,0.36)", fontSize: 12 }}>vira</span>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
            }}
          >
            {["R$ 82,00", "Mercado", "Cartão principal", "Hoje"].map((item) => (
              <span
                key={item}
                style={{
                  borderRadius: 999,
                  background: item === "R$ 82,00" ? "#035C3A" : "rgba(3,92,58,0.08)",
                  color: item === "R$ 82,00" ? "white" : "#035C3A",
                  padding: "5px 8px",
                  fontSize: 11,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                {item}
              </span>
            ))}
            <span style={{ color: "rgba(11,27,42,0.42)", fontSize: 11.5, fontWeight: 700 }}>
              pronto para confirmar
            </span>
          </div>
        </div>
      </div>
    </div>
  );

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
          .ticlio-auth-feature:hover {
            background: rgba(255,255,255,0.72);
            box-shadow: 0 12px 28px -20px rgba(11,27,42,0.32);
            transform: translateY(-1px);
          }
          @media (max-width: 959px) {
            .ticlio-voice-preview { display: none !important; }
            .ticlio-benefit-strip { grid-template-columns: 1fr !important; }
          }
      `}</style>

      {/* Subtle dot-grid texture behind the product story. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(11,27,42,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 20%, black 40%, transparent 90%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 20%, black 40%, transparent 90%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(120deg, rgba(3,92,58,0.08) 0%, transparent 34%, rgba(198,214,39,0.1) 63%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "auto 0 0 0",
          height: "34%",
          background: "linear-gradient(to top, rgba(3,92,58,0.08), transparent)",
          pointerEvents: "none",
        }}
      />

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 1,
          padding: "18px 16px 20px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1120,
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 40,
            alignItems: "center",
          }}
          className="ticlio-auth-grid"
        >
          <style>{`
            @media (min-width: 960px) {
              .ticlio-auth-grid { grid-template-columns: minmax(0, 1.16fr) minmax(380px, 0.84fr) !important; }
            }
          `}</style>

          {/* Marketing / hero column */}
          <section style={{ position: "relative", maxWidth: 610 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#035C3A",
                background: "rgba(3,92,58,0.08)",
                padding: "5px 12px",
                borderRadius: 999,
                marginBottom: 14,
              }}
            >
              Teste grátis por 30 dias
            </span>
            <h1
              style={{
                fontFamily: "Sora, Inter, system-ui, sans-serif",
                fontSize: "clamp(36px, 4.5vw, 52px)",
                fontWeight: 800,
                color: "#0B1B2A",
                letterSpacing: 0,
                lineHeight: 1.01,
                margin: "0 0 16px",
                position: "relative",
                zIndex: 1,
              }}
            >
              Suas finanças, contadas em <span style={{ color: "#035C3A" }}>voz alta.</span>
            </h1>
            <p
              style={{
                fontSize: 17,
                color: "rgba(11,27,42,0.62)",
                lineHeight: 1.45,
                margin: "0 0 16px",
                maxWidth: 520,
                position: "relative",
                zIndex: 1,
              }}
            >
              Fale o gasto uma vez. O Ticlio transforma voz em lançamento categorizado, pronto para
              você confirmar.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 16,
                position: "relative",
                zIndex: 1,
              }}
            >
              <button
                type="button"
                onClick={() => switchMode("signup")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  border: "none",
                  borderRadius: 999,
                  background: "#035C3A",
                  color: "white",
                  padding: "11px 16px",
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 16px 32px -18px rgba(3,92,58,0.72)",
                }}
              >
                Começar teste grátis
                <span aria-hidden="true">→</span>
              </button>
              {TRUST_ITEMS.slice(1).map((item) => (
                <span
                  key={item}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 999,
                    border: "1px solid rgba(3,92,58,0.16)",
                    background: "rgba(255,255,255,0.72)",
                    color: "#035C3A",
                    padding: "9px 11px",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <CheckCircle2 size={14} />
                  {item}
                </span>
              ))}
            </div>

            {voicePreview}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                position: "relative",
                zIndex: 1,
              }}
              className="ticlio-benefit-strip"
            >
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  style={{
                    display: "grid",
                    gap: 7,
                    paddingTop: 12,
                    borderTop: "1px solid rgba(3,92,58,0.16)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "rgba(3,92,58,0.08)",
                      color: "#035C3A",
                    }}
                  >
                    <Icon size={15} />
                  </span>
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: "#0B1B2A", margin: 0 }}>
                    {title}
                  </p>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "rgba(11,27,42,0.5)",
                      margin: 0,
                      lineHeight: 1.32,
                    }}
                  >
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Auth column: brand lockup sits directly above its card, not
              floating above the whole page, so it visually belongs to the
              form instead of just decorating the top of the layout. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              maxWidth: 420,
              justifySelf: "center",
              alignSelf: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                marginBottom: 14,
              }}
            >
              <TiclioLogo
                variant="full-on-light"
                style={{
                  width: "clamp(138px, 28vw, 166px)",
                  filter: "drop-shadow(0 6px 16px rgba(3,92,58,0.16))",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(11,27,42,0.38)",
                }}
              >
                Painel financeiro da família
              </span>
            </div>

            <section
              style={{
                width: "100%",
                background: "#ffffff",
                border: "1px solid rgba(11,27,42,0.07)",
                borderRadius: 20,
                padding: "28px 30px 24px",
                boxShadow:
                  "0 32px 80px -12px rgba(11,27,42,0.16), 0 0 0 1px rgba(11,27,42,0.02), 0 0 0 8px rgba(3,92,58,0.025)",
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
                  background:
                    "linear-gradient(to right, transparent, #C6D627, #035C3A, transparent)",
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
                  : "Seu teste grátis começa agora. Não precisa cadastrar cartão."}
              </p>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGoogleSignIn()}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "11px 0",
                  borderRadius: 10,
                  border: "1px solid rgba(11,27,42,0.1)",
                  background: "#ffffff",
                  color: "#0B1B2A",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: "0 8px 18px -16px rgba(11,27,42,0.5)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 21,
                    height: 21,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid rgba(11,27,42,0.1)",
                    fontWeight: 800,
                    color: "#4285F4",
                    fontSize: 13,
                  }}
                >
                  G
                </span>
                Continuar com Google
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                  gap: 10,
                  margin: "16px 0",
                  color: "rgba(11,27,42,0.34)",
                  fontSize: 12,
                }}
              >
                <span style={{ height: 1, background: "rgba(11,27,42,0.08)" }} />
                ou acesse com email
                <span style={{ height: 1, background: "rgba(11,27,42,0.08)" }} />
              </div>

              {/* Mode toggle pills */}
              <div
                style={{
                  display: "flex",
                  gap: 0,
                  marginBottom: 18,
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
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
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
                      padding: "10px 13px",
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
                      padding: "10px 13px",
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
                    padding: "12px 0",
                    borderRadius: 10,
                    border: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "white",
                    // Solid fill (not the full lime-to-petroleum gradient) so
                    // white text keeps reliable contrast. Small filled
                    // buttons use --primary, the darker end of the brand
                    // gradient.
                    background: loading ? "rgba(3,92,58,0.5)" : "#035C3A",
                    boxShadow: loading
                      ? "none"
                      : "0 10px 24px -6px rgba(3,92,58,0.4), 0 2px 6px rgba(3,92,58,0.15)",
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
                  marginTop: 16,
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
                    Ao criar conta, você seguirá para o aceite dos termos, privacidade e aviso de
                    IA. Já tem conta?{" "}
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
        </div>
      </main>

      {/* Bottom badge */}
      <p
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          textAlign: "center",
          fontSize: 12,
          color: "rgba(11,27,42,0.35)",
          padding: "0 16px 14px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <ShieldCheck size={13} />
        Teste grátis de 30 dias · Privacidade em revisão · Dados protegidos por autenticação
      </p>
    </div>
  );
}
