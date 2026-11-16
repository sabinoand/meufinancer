import { useEffect, useState, useCallback } from "react";
import { Home, Building2, Users, LogOut, Clock, Hourglass } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import Auth from "./Auth.jsx";

const VERSION = "0.1.0";
const NOVIDADES = [
  "Login por usuário e senha",
  "Cadastro de empresas (Cel Móveis e terceirizadas)",
  "Administrador libera usuários e define a empresa de cada um",
  "Em breve: pedidos, calendário de entregas, QR code e ranking"
];
const PAPEIS = { pendente: "Aguardando liberação", admin: "Administrador", cel: "Cel Móveis", fornecedor: "Terceirizada" };

const css = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;color:#1c2330}
.muted{color:#6b7385;font-size:14px}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:0 0 12px}
.card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.auth{width:100%;max-width:380px;display:flex;flex-direction:column;gap:12px}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#4a5367}
input,select{padding:10px 12px;border:1px solid #d5d9e2;border-radius:8px;font-size:15px;background:#fff}
.btn{border:0;border-radius:8px;padding:10px 16px;font-size:15px;cursor:pointer;background:#e8ebf2;color:#1c2330}
.btn.primary{background:#1d4ed8;color:#fff}.btn.sm{padding:6px 10px;font-size:13px}
.link{background:none;border:0;color:#1d4ed8;cursor:pointer;font-size:14px}
.err{background:#fde8e8;color:#b42318;padding:8px 12px;border-radius:8px;font-size:14px}
.layout{display:flex;min-height:100vh}
.side{width:230px;background:#101828;color:#fff;padding:18px 12px;display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh}
.side .brand{font-weight:700;font-size:16px;padding:6px 10px 16px}
.nav{display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;color:#c7cdd9;background:none;border:0;font-size:15px;cursor:pointer;text-align:left}
.nav.on{background:#1d2939;color:#fff}.spacer{flex:1}
.main{flex:1;padding:24px;max-width:1000px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #eceef3;font-size:14px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.badge{font-size:12px;padding:2px 8px;border-radius:99px;background:#e8ebf2}.badge.ok{background:#d9f5e3;color:#0b6b32}.badge.off{background:#fde8e8;color:#b42318}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
.modal{max-width:420px;width:100%}.modal ul{padding-left:18px}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center}
@media(max-width:720px){.layout{flex-direction:column}.side{width:100%;height:auto;position:fixed;bottom:0;left:0;right:0;flex-direction:row;padding:6px;z-index:20;justify-content:space-around}
.side .brand,.spacer{display:none}.nav{flex-direction:column;gap:2px;font-size:11px;padding:6px 10px}.main{padding:16px 16px 90px}
.hide-m{display:none}}
`;

export default function App() {
  const [session, setSession] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const carregarPerfil = useCallback(async () => {
    if (!session) return setPerfil(null);
    const { data, error } = await supabase.from("perfis").select("*").eq("user_id", session.user.id).maybeSingle();
    if (error) setErro(error.message);
    setPerfil(data);
  }, [session]);

  useEffect(() => { carregarPerfil(); }, [carregarPerfil]);

  let body;
  if (session === undefined) body = <div className="center muted">Carregando...</div>;
  else if (!session) body = <Auth />;
  else if (!perfil) body = <div className="center">{erro ? <div className="err">{erro}</div> : <span className="muted">Carregando...</span>}</div>;
  else if (!perfil.ativo) body = <Bloqueio titulo="Acesso desativado" texto="Fale com o administrador." />;
  else if (perfil.papel === "pendente") body = <Bloqueio titulo="Aguardando liberação" texto={`Olá, ${perfil.nome}! Seu cadastro foi criado. O administrador precisa liberar seu acesso.`} />;
  else body = <Shell perfil={perfil} onPerfil={carregarPerfil} />;

  return <><style>{css}</style>{body}</>;
}

function Bloqueio({ titulo, texto }) {
  return (
    <div className="center"><div className="card" style={{ maxWidth: 380 }}>
      <Hourglass size={36} /><h1>{titulo}</h1><p className="muted">{texto}</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Sair</button>
    </div></div>
  );
}

function Shell({ perfil, onPerfil }) {
  const admin = perfil.papel === "admin";
  const [aba, setAba] = useState("inicio");
  const [novidades, setNovidades] = useState(perfil.ultima_versao_vista !== VERSION);

  async function fechar() {
    setNovidades(false);
    await supabase.rpc("marcar_versao_vista", { v: VERSION });
  }

  const itens = [{ id: "inicio", nome: "Início", icon: Home }];
  if (admin) itens.push({ id: "empresas", nome: "Empresas", icon: Building2 }, { id: "usuarios", nome: "Usuários", icon: Users });

  return (
    <div className="layout">
      <nav className="side">
        <div className="brand">GestCel<div style={{fontWeight:400,fontSize:12,color:"#98a2b3"}}>Gestão de Parceiros</div></div>
        {itens.map(i => (
          <button key={i.id} className={"nav" + (aba === i.id ? " on" : "")} onClick={() => setAba(i.id)}>
            <i.icon size={18} />{i.nome}
          </button>
        ))}
        <div className="spacer" />
        <button className="nav" onClick={() => supabase.auth.signOut()}><LogOut size={18} />Sair</button>
      </nav>
      <main className="main">
        {aba === "inicio" && <Inicio perfil={perfil} />}
        {aba === "empresas" && admin && <Empresas />}
        {aba === "usuarios" && admin && <Usuarios meuId={perfil.user_id} />}
      </main>
      {novidades && (
        <div className="modal-bg"><div className="card modal">
          <h2>Novidades (v{VERSION})</h2>
          <ul>{NOVIDADES.map(n => <li key={n}>{n}</li>)}</ul>
          <button className="btn primary" onClick={fechar}>Entendi</button>
        </div></div>
      )}
    </div>
  );
}

function Inicio({ perfil }) {
  return (
    <div className="card">
      <h1>Olá, {perfil.nome}!</h1>
      <p className="muted">Perfil: {PAPEIS[perfil.papel]}</p>
      <p><Clock size={14} /> As próximas partes (pedidos, entregas, QR code, ranking e controles internos) serão adicionadas aqui.</p>
    </div>
  );
}

function Empresas() {
  const [lista, setLista] = useState([]);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("empresas").select("*").order("tipo").order("nome");
    if (error) setErro(error.message); else setLista(data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function add(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    const { error } = await supabase.from("empresas").insert({ nome: nome.trim(), tipo: "terceirizada" });
    if (error) return setErro(error.message);
    setNome(""); setErro(""); carregar();
  }
  async function alternar(emp) {
    const { error } = await supabase.from("empresas").update({ ativo: !emp.ativo }).eq("id", emp.id);
    if (error) setErro(error.message); else carregar();
  }

  return (
    <div className="card">
      <h2>Empresas</h2>
      <form className="row" onSubmit={add} style={{ marginBottom: 12 }}>
        <input placeholder="Nome da terceirizada" value={nome} onChange={e => setNome(e.target.value)} />
        <button className="btn primary">Adicionar</button>
      </form>
      {erro && <div className="err">{erro}</div>}
      <table><tbody>
        {lista.map(e => (
          <tr key={e.id}>
            <td>{e.nome}</td>
            <td><span className="badge">{e.tipo === "cel" ? "Cel Móveis" : "Terceirizada"}</span></td>
            <td><span className={"badge " + (e.ativo ? "ok" : "off")}>{e.ativo ? "Ativa" : "Inativa"}</span></td>
            <td>{e.tipo !== "cel" && <button className="btn sm" onClick={() => alternar(e)}>{e.ativo ? "Desativar" : "Ativar"}</button>}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}

function Usuarios({ meuId }) {
  const [lista, setLista] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [u, e] = await Promise.all([
      supabase.from("perfis").select("*").order("created_at"),
      supabase.from("empresas").select("id,nome,tipo").eq("ativo", true).order("nome")
    ]);
    if (u.error || e.error) return setErro((u.error || e.error).message);
    setLista(u.data); setEmpresas(e.data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(p, patch) {
    const novo = { ...p, ...patch };
    // empresa coerente com o papel
    if (novo.papel === "admin" || novo.papel === "pendente") novo.empresa_id = null;
    if (novo.papel === "cel") novo.empresa_id = empresas.find(e => e.tipo === "cel")?.id || null;
    if (novo.papel === "fornecedor" && empresas.find(e => e.id === novo.empresa_id)?.tipo !== "terceirizada") novo.empresa_id = null;
    const { error } = await supabase.from("perfis").update({ papel: novo.papel, empresa_id: novo.empresa_id, ativo: novo.ativo }).eq("user_id", p.user_id);
    if (error) setErro(error.message); else { setErro(""); carregar(); }
  }

  return (
    <div className="card">
      <h2>Usuários</h2>
      {erro && <div className="err">{erro}</div>}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Nome</th><th>Usuário</th><th>Papel</th><th>Empresa</th><th>Ativo</th></tr></thead>
          <tbody>
            {lista.map(p => {
              const eu = p.user_id === meuId;
              return (
                <tr key={p.user_id}>
                  <td>{p.nome}</td>
                  <td>{p.username}</td>
                  <td>
                    <select value={p.papel} disabled={eu} onChange={e => salvar(p, { papel: e.target.value })}>
                      {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>
                    {p.papel === "fornecedor"
                      ? <select value={p.empresa_id || ""} onChange={e => salvar(p, { empresa_id: e.target.value || null })}>
                          <option value="">— escolha —</option>
                          {empresas.filter(e => e.tipo === "terceirizada").map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </select>
                      : p.papel === "cel" ? "Cel Móveis" : "—"}
                  </td>
                  <td><input type="checkbox" checked={p.ativo} disabled={eu} onChange={e => salvar(p, { ativo: e.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
