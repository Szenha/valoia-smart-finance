import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { CalcumLogo } from "@/components/brand/calcum-logo";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [{ title: "Calcum — Entrar" }],
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
        background: "#0B1220",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient orbs */}
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "20%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "15%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      {/* Back to landing */}
      <div style={{ position: "absolute", top: 24, left: 32 }}>
        <Link
          to="/landing"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "rgba(255,255,255,0.4)",
            fontSize: 14,
            textDecoration: "none",
            transition: "color .15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)";
          }}
        >
          ← Voltar
        </Link>
      </div>

      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 20,
          padding: "40px 40px 36px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
          position: "relative",
          zIndex: 1,
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
            background: "linear-gradient(to right, transparent, #3B82F6, #06B6D4, transparent)",
            borderRadius: 2,
          }}
        />

        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <CalcumLogo style={{ width: "clamp(144px, 42vw, 168px)" }} />
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: "white",
            letterSpacing: "-0.025em",
            margin: "0 0 4px",
          }}
        >
          {mode === "login" ? "Bem-vindo de volta" : "Criar conta"}
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: "0 0 28px" }}>
          {mode === "login"
            ? "Entre na sua conta para continuar"
            : "Comece a controlar suas finanças hoje"}
        </p>

        {/* Mode toggle pills */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 28,
            background: "rgba(255,255,255,0.05)",
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
                background: mode === m ? "rgba(59,130,246,0.25)" : "transparent",
                color: mode === m ? "#93c5fd" : "rgba(255,255,255,0.4)",
                boxShadow: mode === m ? "0 0 12px rgba(59,130,246,0.2)" : "none",
              }}
            >
              {m === "login" ? "Entrar" : "Cadastrar"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              placeholder="seu@email.com"
              style={{
                padding: "11px 14px",
                background:
                  focusedField === "email" ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.05)",
                border:
                  focusedField === "email"
                    ? "1px solid rgba(59,130,246,0.5)"
                    : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                fontSize: 14,
                color: "white",
                outline: "none",
                transition: "all .2s",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>
              Senha
            </label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              placeholder="••••••••"
              style={{
                padding: "11px 14px",
                background:
                  focusedField === "password" ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.05)",
                border:
                  focusedField === "password"
                    ? "1px solid rgba(59,130,246,0.5)"
                    : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                fontSize: 14,
                color: "white",
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
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                fontSize: 13,
                color: "#fca5a5",
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
                border: "1px solid rgba(52,211,153,0.25)",
                fontSize: 13,
                color: "#6ee7b7",
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
              background: loading
                ? "rgba(59,130,246,0.4)"
                : "linear-gradient(135deg, #3B82F6, #06B6D4)",
              boxShadow: loading ? "none" : "0 0 24px rgba(59,130,246,0.35)",
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
            color: "rgba(255,255,255,0.3)",
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
                  color: "#60a5fa",
                  cursor: "pointer",
                  fontSize: 13,
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
                  color: "#60a5fa",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 0,
                }}
              >
                Entre aqui
              </button>
            </>
          )}
        </p>
      </div>

      {/* Bottom badge */}
      <p
        style={{ marginTop: 28, fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center" }}
      >
        Dados protegidos · Conforme LGPD
      </p>
    </div>
  );
}
