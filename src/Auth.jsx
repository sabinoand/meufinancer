import React, { useState } from "react";
import { supabase } from "./supabaseClient.js";

const COLORS = {
  bg: "#0A0C0B", surface: "#151815", border: "#262A26",
  accent: "#22C55E", text: "#F4F5F3", textSoft: "#9B9F98", negative: "#EF5350"
};

const EMAIL_DOMAIN = "meufinancer.app";
const slug = (v) => v.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | signup
  const [identifier, setIdentifier] = useState(""); // username OR email, login only
  const [username, setUsername] = useState(""); // signup only
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeySupported] = useState(() => typeof window !== "undefined" && !!window.PublicKeyCredential);

  const signInWithGoogle = async () => {
    setError(""); setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setError(error.message);
  };

  const signInWithFaceId = async () => {
    setError(""); setMessage(""); setPasskeyLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
    } catch (err) {
      setError(err.message || "Não foi possível entrar com Face ID / Touch ID.");
    } finally {
      setPasskeyLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    try {
      if (mode === "login") {
        let loginEmail = identifier.trim();
        if (!loginEmail.includes("@")) {
          const { data: resolvedEmail, error: lookupError } = await supabase.rpc("email_for_username", { identifier: slug(loginEmail) });
          if (lookupError || !resolvedEmail) throw new Error("Usuário não encontrado. Confira o nome digitado.");
          loginEmail = resolvedEmail;
        }
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw new Error("Usuário ou senha incorretos.");
      } else {
        const clean = slug(username);
        if (!clean) throw new Error("Escolha um nome de usuário.");
        const syntheticEmail = `${clean}@${EMAIL_DOMAIN}`;
        const { data, error } = await supabase.auth.signUp({
          email: syntheticEmail, password, options: { data: { username: clean } }
        });
        if (error) throw new Error(error.message.includes("already") ? "Esse nome de usuário já está em uso." : error.message);
        if (data.session) {
          // signed in immediately, App will pick it up
        } else {
          setMessage("Conta criada! Já pode entrar com seu usuário e senha.");
          setMode("login");
          setIdentifier(clean);
        }
      }
    } catch (err) {
      setError(err.message || "Algo deu errado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${COLORS.border}`,
    fontSize: 14, marginBottom: 12, background: "#0F1210", color: COLORS.text
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 20 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
        ::placeholder { color: #5C605A; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 380, background: COLORS.surface, borderRadius: 20, padding: "28px 32px 32px", border: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
          <img src="/logo.png" alt="Meufinancer" style={{ width: 92, height: 92, objectFit: "contain" }} />
        </div>
        <div style={{ textAlign: "center", fontSize: 10.5, letterSpacing: 1.5, color: COLORS.textSoft, textTransform: "uppercase", marginBottom: 22 }}>
          Seu dinheiro, no seu controle
        </div>

        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 600, textAlign: "center", margin: "0 0 20px", color: COLORS.text }}>
          {mode === "login" ? "Entrar na sua conta" : "Criar sua conta"}
        </h1>

        <button type="button" onClick={signInWithGoogle} style={{
          width: "100%", background: "#fff", color: "#1F1F1F", border: `1px solid ${COLORS.border}`, borderRadius: 10,
          padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", gap: 10, marginBottom: 16
        }}>
          <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.4 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.8-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.4 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.4 0 10.3-2.1 14-5.5l-6.5-5.3C29.5 35.9 26.9 37 24 37c-5.3 0-9.7-3.1-11.3-7.8l-6.5 5C9.6 40.5 16.2 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-1 3-3.3 5.4-6.3 6.9l6.5 5.3C39.7 37.1 44 31.2 44 24c0-1.4-.1-2.8-.4-3.5z"/></svg>
          Continuar com Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 16px" }}>
          <div style={{ flex: 1, height: 1, background: COLORS.border }} />
          <span style={{ fontSize: 11.5, color: COLORS.textSoft }}>ou</span>
          <div style={{ flex: 1, height: 1, background: COLORS.border }} />
        </div>

        <form onSubmit={submit}>
          {mode === "login" ? (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>Usuário</label>
              <input style={inputStyle} required value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="seu usuário" />
            </>
          ) : (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>Escolha um usuário</label>
              <input style={inputStyle} required value={username} onChange={e => setUsername(e.target.value)} placeholder="ex: joao.silva" />
            </>
          )}

          <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>Senha</label>
          <input style={inputStyle} type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />

          {error && <div style={{ color: COLORS.negative, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          {message && <div style={{ color: COLORS.accent, fontSize: 12.5, marginBottom: 10 }}>{message}</div>}

          <button disabled={loading} type="submit" style={{
            width: "100%", background: COLORS.accent, color: "#0A0C0B", border: "none", borderRadius: 10,
            padding: "12px 0", fontSize: 14.5, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1
          }}>
            {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {mode === "login" && passkeySupported && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
              <div style={{ flex: 1, height: 1, background: COLORS.border }} />
              <span style={{ fontSize: 11.5, color: COLORS.textSoft }}>ou</span>
              <div style={{ flex: 1, height: 1, background: COLORS.border }} />
            </div>
            <button type="button" disabled={passkeyLoading} onClick={signInWithFaceId} style={{
              width: "100%", background: "transparent", color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 10,
              padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: passkeyLoading ? 0.7 : 1
            }}>
              {passkeyLoading ? "Aguarde…" : "🔓 Entrar com Face ID / Touch ID"}
            </button>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 12.8, color: COLORS.textSoft }}>
          {mode === "login" ? (
            <span>Não tem conta? <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontWeight: 700 }}>Cadastre-se</button></span>
          ) : (
            <span>Já tem conta? <button onClick={() => { setMode("login"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontWeight: 700 }}>Entrar</button></span>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 22, fontSize: 11, color: COLORS.textSoft, opacity: 0.7 }}>
          Elaborado por Sabino
        </div>
      </div>
    </div>
  );
}
