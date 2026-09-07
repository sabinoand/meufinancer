import React, { useState } from "react";
import { Wallet2 } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const COLORS = { bg: "#F6F4EE", ink: "#132119", accent: "#2E7A57", border: "#E4E0D3", text: "#1B1B17", textSoft: "#6E6E64", negative: "#B34A30" };

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [identifier, setIdentifier] = useState(""); // email OR username (login only)
  const [email, setEmail] = useState(""); // signup / reset always use email
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeySupported] = useState(() => typeof window !== "undefined" && !!window.PublicKeyCredential);

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
          const { data: resolvedEmail, error: lookupError } = await supabase.rpc("email_for_username", { identifier: loginEmail });
          if (lookupError || !resolvedEmail) throw new Error("Usuário não encontrado. Confira o nome de usuário ou use o e-mail.");
          loginEmail = resolvedEmail;
        }
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Conta criada! Verifique seu e-mail para confirmar o cadastro, depois faça login.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setMessage("Enviamos um link de recuperação para o seu e-mail.");
      }
    } catch (err) {
      setError(err.message || "Algo deu errado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, padding: 32, border: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 22, justifyContent: "center" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet2 size={17} color="#fff" />
          </div>
          <span style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 600, color: COLORS.ink }}>Meufinancer</span>
        </div>

        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 19, fontWeight: 600, textAlign: "center", margin: "0 0 20px", color: COLORS.text }}>
          {mode === "login" ? "Entrar na sua conta" : mode === "signup" ? "Criar sua conta" : "Recuperar senha"}
        </h1>

        <form onSubmit={submit}>
          {mode === "login" ? (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>E-mail ou nome de usuário</label>
              <input style={inputStyle} required value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="voce@email.com ou seu usuário" />
            </>
          ) : (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>E-mail</label>
              <input style={inputStyle} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
            </>
          )}

          {mode !== "reset" && (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSoft, display: "block", marginBottom: 6 }}>Senha</label>
              <input style={inputStyle} type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </>
          )}

          {error && <div style={{ color: COLORS.negative, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          {message && <div style={{ color: COLORS.accent, fontSize: 12.5, marginBottom: 10 }}>{message}</div>}

          <button disabled={loading} type="submit" style={{
            width: "100%", background: COLORS.accent, color: "#fff", border: "none", borderRadius: 10,
            padding: "12px 0", fontSize: 14.5, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1
          }}>
            {loading ? "Aguarde…" : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
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
              width: "100%", background: "#fff", color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 10,
              padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: passkeyLoading ? 0.7 : 1
            }}>
              {passkeyLoading ? "Aguarde…" : "🔓 Entrar com Face ID / Touch ID"}
            </button>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 12.8, color: COLORS.textSoft, display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "login" && (
            <>
              <button onClick={() => { setMode("reset"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: COLORS.textSoft, cursor: "pointer", textDecoration: "underline" }}>Esqueci minha senha</button>
              <span>Não tem conta? <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontWeight: 700 }}>Cadastre-se</button></span>
            </>
          )}
          {mode !== "login" && (
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
