import { useState } from "react";
import { supabase } from "./supabaseClient.js";
import { TERMOS_VERSAO, RodapeLegal } from "./Legal.jsx";

const toEmail = (u) => `${u}@gestao.app`;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const clean = (u) => u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");

export default function Auth({ abrirLegal }) {
  const [aceito, setAceito] = useState(false);
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [nome, setNome] = useState("");
  const [emailCad, setEmailCad] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    const digitado = username.trim().toLowerCase();
    const porEmail = mode === "login" && digitado.includes("@");
    if (porEmail && !EMAIL_RE.test(digitado)) return setMsg("Digite um e-mail válido ou o seu usuário.");
    const u = porEmail ? digitado : clean(username);
    if (!porEmail && u.length < 3) return setMsg("Usuário precisa ter ao menos 3 letras/números (sem espaços).");
    if (mode !== "login" && emailCad.trim() && !EMAIL_RE.test(emailCad.trim().toLowerCase())) return setMsg("Esse e-mail não parece válido. Corrija ou deixe em branco.");
    if (mode !== "login") {
      if (password.length < 8) return setMsg("A senha precisa ter ao menos 8 caracteres.");
      if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return setMsg("A senha precisa ter letra minúscula, maiúscula e número.");
      if (password.toLowerCase().includes(u)) return setMsg("A senha não pode conter o seu usuário.");
    } else if (!password) return setMsg("Informe a senha.");
    setBusy(true);
    try {
      if (mode === "login") {
        const { data: email } = await supabase.rpc("email_for_username", { identifier: u });
        const { error } = await supabase.auth.signInWithPassword({ email: email || (porEmail ? "nao-existe@invalid.invalid" : toEmail(u)), password });
        if (error) setMsg("Usuário/e-mail ou senha incorretos.");
      } else {
        if (!nome.trim()) { setMsg("Informe seu nome."); setBusy(false); return; }
        if (!aceito) { setMsg("Para criar a conta, aceite a Política de Privacidade e os Termos de Uso."); setBusy(false); return; }
        const { data: cad, error } = await supabase.auth.signUp({
          email: toEmail(u), password,
          options: { data: { username: u, nome: nome.trim(), email: emailCad.trim().toLowerCase() || undefined } }
        });
        if (!error && cad?.session) await supabase.rpc("registrar_aceite", { p_versao: TERMOS_VERSAO });
        if (error) setMsg(/registered|already/i.test(error.message) ? "Esse usuário já existe." : /pwned|leaked|weak|easy|password/i.test(error.message) ? "Essa senha é fraca ou já apareceu em vazamentos. Escolha outra." : "Não foi possível criar a conta. Tente de novo.");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth" onSubmit={submit}>
        <img src="/logo.jpg" alt="GestCel — Gestão de Parceiros" style={{ width: "100%", borderRadius: 10 }} />
        <p className="muted">{mode === "login" ? "Entre com seu usuário ou e-mail e a senha" : "Crie sua conta — o administrador precisa liberar seu acesso"}</p>
        {mode === "signup" && (
          <label>Nome<input value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" /></label>
        )}
        <label>{mode === "login" ? "Usuário ou e-mail" : "Usuário"}<input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" /></label>
        {mode === "signup" && (
          <label>E-mail (opcional)<input type="email" value={emailCad} onChange={e => setEmailCad(e.target.value)} autoCapitalize="none" autoComplete="email" placeholder="para entrar também pelo e-mail" /></label>
        )}
        <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {mode === "signup" && (
          <label className="row" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={aceito} onChange={e => setAceito(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Li e aceito a <button type="button" className="link" onClick={() => abrirLegal("privacidade")}>Política de Privacidade</button> e os <button type="button" className="link" onClick={() => abrirLegal("termos")}>Termos de Uso</button>.</span>
          </label>
        )}
        {msg && <div className="err" role="alert">{msg}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</button>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Ainda não tem acesso? Peça um convite ao administrador.</p>
      </form>
      <RodapeLegal abrir={abrirLegal} />
    </div>
  );
}
