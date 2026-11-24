import { useState } from "react";
import { supabase } from "./supabaseClient.js";
import { TERMOS_VERSAO, RodapeLegal } from "./Legal.jsx";

// Chama a função segura do servidor (só administrador). Devolve { link, email, nome, user_id }.
export async function chamarConvite(body) {
  const { data, error } = await supabase.functions.invoke("convidar-usuario", { body: { ...body, origin: window.location.origin } });
  if (error) {
    let m = "Não foi possível completar. Tente de novo.";
    try { const j = await error.context.json(); if (j?.erro) m = j.erro; } catch { /* mantém a mensagem padrão */ }
    throw new Error(m);
  }
  return data;
}

// Painel com o link gerado: copiar e mandar pelo WhatsApp.
export function LinkGerado({ info, onFechar }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Olá${info.nome ? ", " + info.nome.split(" ")[0] : ""}! Seu acesso ao GestCel foi liberado. Abra o link para definir sua senha (o link é de uso único e tem prazo de validade; se não abrir, peça outro): ${info.link}`;
  async function copiar() {
    try { await navigator.clipboard.writeText(info.link); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }
    catch { document.getElementById("link-convite")?.select(); }
  }
  return (
    <div className="card" style={{ display: "grid", gap: 10, border: "2px solid #1f8f4e" }} role="status">
      <h2 style={{ margin: 0 }}>Link de acesso pronto</h2>
      <p className="muted" style={{ margin: 0 }}>Envie para <b>{info.nome || info.email}</b> ({info.email}). A pessoa abre o link, define a senha e já entra. O link só funciona uma vez; se der problema, gere outro.</p>
      <input id="link-convite" readOnly value={info.link} onFocus={e => e.target.select()} aria-label="Link de acesso" />
      <div className="row">
        <button type="button" className="btn primary" onClick={copiar}>{copiado ? "Link copiado!" : "Copiar link"}</button>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">Enviar pelo WhatsApp</a>
        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

// Tela que a pessoa vê ao abrir o link: define a senha (convite novo ou senha redefinida).
export function ConviteSenha({ hash, tipo, abrirLegal }) {
  const novo = tipo === "invite";
  const [senha, setSenha] = useState(""); const [conf, setConf] = useState(""); const [aceito, setAceito] = useState(false);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [verificado, setVerificado] = useState(false);

  async function enviar(e) {
    e.preventDefault(); setMsg("");
    if (senha.length < 8) return setMsg("A senha precisa ter ao menos 8 caracteres.");
    if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha)) return setMsg("A senha precisa ter letra minúscula, maiúscula e número.");
    if (senha !== conf) return setMsg("A confirmação não confere com a senha.");
    if (novo && !aceito) return setMsg("Para continuar, aceite a Política de Privacidade e os Termos de Uso.");
    setBusy(true);
    try {
      if (!verificado) {
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: hash, type: novo ? "invite" : "recovery" });
        if (error || !data?.session) { setMsg("Este link é inválido, já foi usado ou expirou. Peça um novo link ao administrador."); return; }
        setVerificado(true);
      }
      const { error: e2 } = await supabase.auth.updateUser({ password: senha });
      if (e2) { setMsg(/same|different/i.test(e2.message) ? "Escolha uma senha diferente da anterior." : /pwned|leaked|weak|easy|password/i.test(e2.message) ? "Essa senha é fraca ou já apareceu em vazamentos. Escolha outra." : "Não foi possível salvar a senha. Tente outra."); return; }
      if (novo) await supabase.rpc("registrar_aceite", { p_versao: TERMOS_VERSAO });
      window.location.replace("/");
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth" onSubmit={enviar}>
        <img src="/logo.jpg" alt="GestCel — Gestão de Parceiros" style={{ width: "100%", borderRadius: 10 }} />
        <h2 style={{ margin: 0 }}>{novo ? "Bem-vindo! Defina sua senha" : "Defina a nova senha"}</h2>
        <p className="muted" style={{ margin: 0 }}>Mínimo de 8 caracteres, com letra minúscula, maiúscula e número.</p>
        <label>Nova senha<input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" /></label>
        <label>Repita a senha<input type="password" value={conf} onChange={e => setConf(e.target.value)} autoComplete="new-password" /></label>
        {novo && (
          <label className="row" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={aceito} onChange={e => setAceito(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Li e aceito a <button type="button" className="link" onClick={() => abrirLegal("privacidade")}>Política de Privacidade</button> e os <button type="button" className="link" onClick={() => abrirLegal("termos")}>Termos de Uso</button>.</span>
          </label>
        )}
        {msg && <div className="err" role="alert">{msg}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "Salvando..." : "Salvar senha e entrar"}</button>
      </form>
      <RodapeLegal abrir={abrirLegal} />
    </div>
  );
}
