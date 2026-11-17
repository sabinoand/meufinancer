import { useEffect, useState, useCallback } from "react";
import { Home, Building2, Users, LogOut, Clock, Hourglass, ClipboardList, CalendarDays, Package, Layers, FileText, Warehouse, PackagePlus, Bell, Ruler, UserCheck, Search, ChevronRight } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import Auth from "./Auth.jsx";
import Calendario from "./Calendario.jsx";
import Estoque from "./Estoque.jsx";
import MateriaPrima from "./MateriaPrima.jsx";
import Requisicoes from "./Requisicoes.jsx";
import Almoxarifado from "./Almoxarifado.jsx";
import Solicitacoes from "./Solicitacoes.jsx";
import FichasTecnicas from "./FichasTecnicas.jsx";
import Rh from "./Rh.jsx";
import { SECOES } from "./secoes.js";

const VERSION = "0.18.0";
const NOVIDADES = [
  "Cada módulo agora tem menu lateral com as suas seções (no celular, ele vira uma faixa de atalhos)",
  "RH reorganizado em grupos: equipe, contratações, experiência, ausências, saúde, ponto e dinheiro"
];
const PAPEIS = { pendente: "Aguardando liberação", admin: "Administrador", cel: "Cel Móveis", fornecedor: "Terceirizada", almoxarife: "Almoxarife (Cel)" };

const css = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#eef2fb;color:#1c2330}button,input,select{font-family:inherit}
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
.app{min-height:100vh;display:flex;flex-direction:column}
.top{position:sticky;top:0;z-index:30;background:#071433;color:#fff;display:flex;align-items:center;gap:14px;padding:0 20px;height:58px;border-bottom:1px solid rgba(79,140,255,.35)}
.brandbtn{display:flex;align-items:center;gap:9px;background:none;border:0;color:#fff;cursor:pointer;padding:0;font:italic 800 21px "Exo 2",system-ui,sans-serif;letter-spacing:.01em}
.brandbtn svg{width:30px;height:30px;filter:drop-shadow(0 0 8px rgba(79,140,255,.7))}
.crumb{display:flex;align-items:center;gap:8px;font-size:14px;color:#9fb3e8;min-width:0}
.crumb button{background:none;border:0;color:#9fb3e8;cursor:pointer;font-size:14px;padding:4px 6px;border-radius:6px}.crumb button:hover{color:#fff;background:rgba(255,255,255,.08)}
.crumb b{color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top .grow{flex:1}
.user{display:flex;align-items:center;gap:9px;font-size:14px}
.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(145deg,#4f8cff,#1747e6);display:grid;place-items:center;font-weight:700;font-size:14px}
.sair{background:rgba(255,255,255,.08);border:0;color:#dbe6ff;border-radius:8px;padding:7px 10px;cursor:pointer;display:flex;gap:6px;align-items:center;font-size:13px}.sair:hover{background:rgba(255,255,255,.16)}
.hero{position:relative;overflow:hidden;background:radial-gradient(1200px 380px at 85% -20%,#1d4fd8 0%,rgba(29,79,216,0) 60%),#071433;color:#fff;padding:38px 0 46px}
.hero .arc{position:absolute;right:0;top:0;width:min(900px,100%);height:100%;pointer-events:none;opacity:.9}
.hero-in{position:relative;max-width:1180px;margin:0 auto;padding:0 24px}
.hero h1{font:italic 800 clamp(30px,4.6vw,48px)/1.05 "Exo 2",system-ui,sans-serif;margin:0 0 6px;color:#fff}
.hero p{margin:0 0 20px;color:#9fb3e8;font-size:15px}
.busca{display:flex;flex-direction:row;align-items:center;gap:8px;background:rgba(255,255,255,.09);border:1px solid rgba(159,179,232,.3);border-radius:12px;padding:0 12px;max-width:420px}
.busca input{flex:1;background:none;border:0;color:#fff;padding:12px 0;font-size:15px;outline:none;min-width:0}.busca input::placeholder{color:#8ea2d6}
.aviso{max-width:1180px;margin:18px auto 0;padding:0 24px;width:100%}
.aviso>div{background:#fff7d6;color:#7a5a00;border:1px solid #f3dd8a;border-radius:12px;padding:11px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:14px}
.home{max-width:1180px;width:100%;margin:0 auto;padding:6px 24px 48px}
.home h2{font-size:16px;font-weight:700;color:#14213d;margin:26px 0 12px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:16px}
.tile{position:relative;overflow:hidden;text-align:left;cursor:pointer;background:#fff;border:1px solid #dfe7f6;border-radius:18px;padding:18px 18px 20px;min-height:158px;display:flex;flex-direction:column;gap:14px;color:#14213d;font:inherit;transition:transform .16s,box-shadow .16s,border-color .16s}
.tile:hover,.tile:focus-visible{transform:translateY(-3px);border-color:var(--c2);box-shadow:0 14px 28px -14px var(--c2);outline:none}
.tile:focus-visible{outline:2px solid var(--c2);outline-offset:2px}
.chip{width:52px;height:52px;border-radius:15px;background:linear-gradient(145deg,var(--c1),var(--c2));color:#fff;display:grid;place-items:center;box-shadow:0 8px 16px -8px var(--c2)}
.tile .nm{font-weight:700;font-size:16.5px}.tile .ds{font-size:13px;color:#5d6b86;line-height:1.35;margin-top:2px}
.tile svg.sp{position:absolute;right:14px;bottom:14px;width:22px;height:22px;color:var(--c1);opacity:0;transform:rotate(-25deg) scale(.6);transition:all .25s}
.tile:hover svg.sp,.tile:focus-visible svg.sp{opacity:.9;transform:none}
.tile .bd{position:absolute;top:14px;right:14px;background:#ef4444;color:#fff;border-radius:99px;font-size:12px;font-weight:700;padding:2px 8px}
.main{flex:1;width:100%;padding:24px;max-width:1100px;margin:0 auto}
.modulo{display:flex;gap:22px;align-items:flex-start;width:100%;max-width:1320px;margin:0 auto;padding:24px}
.conteudo{flex:1;min-width:0}
.lateral{width:236px;flex:none;position:sticky;top:82px;background:#fff;border:1px solid #dfe7f6;border-radius:18px;padding:12px;display:flex;flex-direction:column;gap:2px;max-height:calc(100vh - 100px);overflow-y:auto}
.lat-h{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;padding:4px 6px 12px;border-bottom:1px solid #eef1f8;margin-bottom:6px;color:#14213d}
.chip.sm{width:34px;height:34px;border-radius:10px;box-shadow:0 6px 12px -8px var(--c2)}
.lat-g{font-size:12.5px;font-weight:600;color:#7a869f;padding:12px 10px 4px}
.lateral button{text-align:left;border:0;background:none;padding:9px 12px;border-radius:10px;font-size:14.5px;color:#34415c;cursor:pointer;position:relative}
.lateral button:hover{background:#f1f5fd}
.lateral button.on{background:#e6eeff;color:#1236b8;font-weight:600}
.lateral button.on::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:3px;background:#1747e6}
@media(max-width:900px){.modulo{flex-direction:column;gap:12px;padding:12px 16px 40px}.lateral{width:100%;position:static;max-height:none;flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:6px;border-radius:14px;gap:4px}.lat-h,.lat-g{display:none}.lateral button{white-space:nowrap;flex:0 0 auto}.lateral button.on::before{display:none}}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #eceef3;font-size:14px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.badge{font-size:12px;padding:2px 8px;border-radius:99px;background:#e8ebf2}.badge.ok{background:#d9f5e3;color:#0b6b32}.badge.off{background:#fde8e8;color:#b42318}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
.modal{max-width:420px;width:100%;max-height:85vh;overflow-y:auto}.modal ul{padding-left:18px}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center}
@media(max-width:640px){.top{padding:0 12px;gap:8px}.user .nome{display:none}.hero{padding:26px 0 32px}.hero-in{padding:0 16px}.home{padding:2px 16px 40px}.aviso{padding:0 16px}.main{padding:16px}.tiles{grid-template-columns:repeat(2,1fr);gap:12px}.tile{padding:14px;min-height:140px}.tile .ds{display:none}.chip{width:46px;height:46px}.hide-m{display:none}}
@media(prefers-reduced-motion:reduce){.tile,.tile svg.sp{transition:none}.tile:hover{transform:none}}
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

  const almox = perfil.papel === "almoxarife";
  const [novas, setNovas] = useState(0);
  const atualizarNovas = useCallback(async () => {
    // almoxarife: pedidos novos; terceirizada: pedidos concluídos ainda não lançados no estoque
    if (!almox && perfil.papel !== "fornecedor") return;
    const q = supabase.from("solicitacoes").select("id", { count: "exact", head: true }).eq("status", almox ? "solicitado" : "concluido");
    const { count } = await (almox ? q : q.is("no_estoque_em", null));
    setNovas(count || 0);
  }, [almox, perfil.papel]);
  useEffect(() => { atualizarNovas(); const t = setInterval(atualizarNovas, 30000); return () => clearInterval(t); }, [atualizarNovas]);

  const itens = [];
  const add = (id, nome, desc, icon, g, badge) => itens.push({ id, nome, desc, icon, g, badge });
  if (!almox) { add("pedidos", "Pedidos", "Pedidos de cadeiras e prazos de entrega", ClipboardList, "ped"); add("calendario", "Calendário", "Entregas organizadas por data", CalendarDays, "ped"); }
  if (perfil.papel === "fornecedor" || admin) { add("estoque", "Estoque", "Produtos prontos e movimentações", Package, "mat"); add("materia", "Matéria-prima", "Tecidos, espumas e insumos", Layers, "mat"); }
  if (perfil.papel === "fornecedor") { add("requisicoes", "Requisições", "Pedidos de material", FileText, "mat"); add("fichas", "Fichas técnicas", "Composição de cada caixa e cálculo do pedido", Ruler, "mat"); }
  if (almox || admin) add("almoxarifado", "Almoxarifado", "Itens, entradas, saídas e notas fiscais", Warehouse, "mat");
  if (perfil.papel === "fornecedor" || almox || admin) add("solicitacoes", "Solicitações", "Coletas e entregas de material", PackagePlus, "mat", novas);
  if (perfil.papel === "fornecedor") add("rh", "RH", "Equipe, ponto, EPI, vales e 13º", UserCheck, "pes");
  if (admin) { add("empresas", "Empresas", "Terceirizadas cadastradas", Building2, "adm"); add("usuarios", "Usuários", "Acessos e permissões", Users, "adm"); }
  const atual = itens.find(i => i.id === aba);
  const [secs, setSecs] = useState({});
  const lista = SECOES[aba];
  const chaves = (lista || []).filter(x => x.k);
  const secAtual = chaves.some(x => x.k === secs[aba]) ? secs[aba] : chaves[0]?.k;
  const irSecao = (k) => setSecs(o => ({ ...o, [aba]: k }));

  return (
    <div className="app">
      <header className="top">
        <button className="brandbtn" onClick={() => setAba("inicio")} aria-label="GestCel — voltar aos módulos"><Estrela />GestCel</button>
        {atual && <div className="crumb"><button onClick={() => setAba("inicio")}>Módulos</button><ChevronRight size={14} /><b>{atual.nome}</b></div>}
        <div className="grow" />
        <div className="user"><div className="avatar">{(perfil.nome || "?").trim()[0].toUpperCase()}</div><span className="nome">{perfil.nome}</span></div>
        <button className="sair" onClick={() => supabase.auth.signOut()}><LogOut size={15} />Sair</button>
      </header>
      {aba === "inicio" && <Inicio perfil={perfil} novas={novas} itens={itens} irPara={setAba} />}
      {aba !== "inicio" && (lista ? (
        <div className="modulo">
          <nav className="lateral" aria-label={"Seções de " + atual?.nome}>
            {atual && <div className="lat-h"><span className="chip sm" style={{ "--c1": GRUPOS[atual.g].c1, "--c2": GRUPOS[atual.g].c2 }}><atual.icon size={18} strokeWidth={1.9} /></span>{atual.nome}</div>}
            {lista.map((x, i) => x.h ? <div key={i} className="lat-g">{x.h}</div> :
              <button key={x.k} className={secAtual === x.k ? "on" : ""} onClick={() => irSecao(x.k)}>{x.n}</button>)}
          </nav>
          <main className="conteudo">
        {aba === "pedidos" && !almox && <Pedidos perfil={perfil} />}
        {aba === "calendario" && !almox && <Calendario perfil={perfil} />}
        {aba === "estoque" && <Estoque perfil={perfil} secao={secAtual} />}
        {aba === "materia" && <MateriaPrima perfil={perfil} secao={secAtual} />}
        {aba === "requisicoes" && perfil.papel === "fornecedor" && <Requisicoes perfil={perfil} />}
        {aba === "fichas" && perfil.papel === "fornecedor" && <FichasTecnicas perfil={perfil} secao={secAtual} />}
        {aba === "rh" && perfil.papel === "fornecedor" && <Rh perfil={perfil} secao={secAtual} irPara={irSecao} />}
        {aba === "almoxarifado" && (almox || admin) && <Almoxarifado perfil={perfil} secao={secAtual} />}
        {aba === "solicitacoes" && <Solicitacoes perfil={perfil} onMudou={atualizarNovas} />}
        {aba === "empresas" && admin && <Empresas />}
        {aba === "usuarios" && admin && <Usuarios meuId={perfil.user_id} />}
          </main>
        </div>
      ) : <main className="main">
        {aba === "pedidos" && !almox && <Pedidos perfil={perfil} />}
        {aba === "calendario" && !almox && <Calendario perfil={perfil} />}
        {aba === "estoque" && <Estoque perfil={perfil} secao={secAtual} />}
        {aba === "materia" && <MateriaPrima perfil={perfil} secao={secAtual} />}
        {aba === "requisicoes" && perfil.papel === "fornecedor" && <Requisicoes perfil={perfil} />}
        {aba === "fichas" && perfil.papel === "fornecedor" && <FichasTecnicas perfil={perfil} secao={secAtual} />}
        {aba === "rh" && perfil.papel === "fornecedor" && <Rh perfil={perfil} secao={secAtual} irPara={irSecao} />}
        {aba === "almoxarifado" && (almox || admin) && <Almoxarifado perfil={perfil} secao={secAtual} />}
        {aba === "solicitacoes" && <Solicitacoes perfil={perfil} onMudou={atualizarNovas} />}
        {aba === "empresas" && admin && <Empresas />}
        {aba === "usuarios" && admin && <Usuarios meuId={perfil.user_id} />}
      </main>)}
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

const GRUPOS = {
  ped: { nome: "Pedidos e entregas", c1: "#4f8cff", c2: "#1747e6" },
  mat: { nome: "Material e estoque", c1: "#2dd4ee", c2: "#0e7fb5" },
  pes: { nome: "Pessoas", c1: "#a78bfa", c2: "#6d3fe0" },
  adm: { nome: "Administração", c1: "#94a3b8", c2: "#475569" }
};
const STAR_PTS = "16.00,3.00 19.70,11.90 29.31,12.67 21.99,18.95 24.23,28.33 16.00,23.30 7.77,28.33 10.01,18.95 2.69,12.67 12.30,11.90";
function Estrela() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="gst" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7fb0ff" /><stop offset="1" stopColor="#1747e6" /></linearGradient></defs>
      <polygon points={STAR_PTS} fill="url(#gst)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
  );
}
const Brilho = ({ className }) => <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z" fill="currentColor" /></svg>;

function Inicio({ perfil, novas, itens, irPara }) {
  const [q, setQ] = useState("");
  const h = new Date().getHours(); const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const primeiro = (perfil.nome || "").trim().split(/\s+/)[0];
  const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const vis = itens.filter(i => !q.trim() || norm(i.nome + " " + i.desc).includes(norm(q.trim())));
  const grupos = Object.keys(GRUPOS).filter(g => vis.some(i => i.g === g));
  return (
    <div>
      <section className="hero">
        <svg className="arc" viewBox="0 0 900 220" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="arcg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#22c7ff" stopOpacity="0" /><stop offset=".6" stopColor="#4f8cff" stopOpacity=".9" /><stop offset="1" stopColor="#bcd6ff" /></linearGradient></defs>
          <path d="M-40 230 C 220 60, 560 -10, 860 70" fill="none" stroke="url(#arcg)" strokeWidth="3" />
          <path d="M-40 250 C 240 100, 580 20, 880 100" fill="none" stroke="url(#arcg)" strokeWidth="1.2" opacity=".5" />
          <path d="M862 40 l5 17 17 5 -17 5 -5 17 -5 -17 -17 -5 17 -5z" fill="#cfe2ff" />
        </svg>
        <div className="hero-in">
          <h1>{saud}, {primeiro}</h1>
          <p>{PAPEIS[perfil.papel]} · escolha um módulo para começar</p>
          <label className="busca"><Search size={17} color="#8ea2d6" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar módulo" aria-label="Buscar módulo" /></label>
        </div>
      </section>
      {novas > 0 && (perfil.papel === "almoxarife" || perfil.papel === "fornecedor") && (
        <div className="aviso"><div><Bell size={16} />
          {perfil.papel === "almoxarife" ? (novas === 1 ? "1 solicitação nova aguardando confirmação." : `${novas} solicitações novas aguardando confirmação.`) : (novas === 1 ? "1 pedido de material concluído para lançar no seu estoque." : `${novas} pedidos de material concluídos para lançar no seu estoque.`)}
          <button className="btn sm" onClick={() => irPara("solicitacoes")}>Abrir Solicitações</button></div></div>
      )}
      <div className="home">
        {grupos.length === 0 && <p className="muted" style={{ marginTop: 24 }}>Nenhum módulo com "{q}". Tente outra palavra.</p>}
        {grupos.map(g => (
          <section key={g}>
            <h2>{GRUPOS[g].nome}</h2>
            <div className="tiles">
              {vis.filter(i => i.g === g).map(i => (
                <button key={i.id} className="tile" style={{ "--c1": GRUPOS[g].c1, "--c2": GRUPOS[g].c2 }} onClick={() => irPara(i.id)}>
                  {i.badge > 0 && <span className="bd">{i.badge}</span>}
                  <span className="chip"><i.icon size={25} strokeWidth={1.9} /></span>
                  <span><div className="nm">{i.nome}</div><div className="ds">{i.desc}</div></span>
                  <Brilho className="sp" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
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
    if (novo.papel === "cel" || novo.papel === "almoxarife") novo.empresa_id = empresas.find(e => e.tipo === "cel")?.id || null;
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
                      : (p.papel === "cel" || p.papel === "almoxarife") ? "Cel Móveis" : "—"}
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

const STATUS = { aberto: "Em aberto", parcial: "Recebido parcial", entregue: "Entregue", cancelado: "Cancelado" };
const fmtData = (d) => d ? d.split("-").reverse().join("/") : "";
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const corTxt = (c) => c ? `Tecido ${c.numero}${c.nome ? " – " + c.nome : ""}` : "—";

/* Seletor com cadastro rápido: escolhe da lista ou clica em "+" para criar na hora */
function SeletorNovo({ label, valor, opcoes, onChange, onCriar, campos }) {
  const [novo, setNovo] = useState(false);
  const [v, setV] = useState({});
  const [msg, setMsg] = useState("");
  async function criar() {
    const r = await onCriar(v);
    if (r?.erro) return setMsg(r.erro);
    setNovo(false); setV({}); setMsg("");
  }
  return (
    <label style={{ flex: 1, minWidth: 150 }}>{label}
      {!novo ? (
        <span className="row" style={{ flexWrap: "nowrap" }}>
          <select style={{ flex: 1, minWidth: 0 }} value={valor} onChange={e => onChange(e.target.value)}>
            <option value="">— escolha —</option>
            {opcoes.map(o => <option key={o.id} value={o.id}>{o.texto}</option>)}
          </select>
          <button type="button" className="btn sm" title="Cadastrar novo" onClick={() => setNovo(true)}>+</button>
        </span>
      ) : (
        <span style={{ display: "grid", gap: 6 }}>
          {campos.map(c => <input key={c.k} placeholder={c.ph} value={v[c.k] || ""} onChange={e => setV({ ...v, [c.k]: e.target.value })} />)}
          <span className="row">
            <button type="button" className="btn sm primary" onClick={criar}>Salvar</button>
            <button type="button" className="btn sm" onClick={() => { setNovo(false); setMsg(""); }}>Cancelar</button>
          </span>
          {msg && <span className="err">{msg}</span>}
        </span>
      )}
    </label>
  );
}

function Pedidos({ perfil }) {
  const podeLancar = perfil.papel === "admin" || perfil.papel === "cel";
  const [pedidos, setPedidos] = useState([]);
  const [itens, setItens] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [cadeiras, setCadeiras] = useState([]);
  const [cores, setCores] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");
  const novaLinha = () => ({ k: Math.random(), cadeira_id: "", cor_id: "", caixas: "" });
  const vazio = { empresa_id: "", data_entrega: "", observacao: "", linhas: [novaLinha()] };
  const [f, setF] = useState(vazio);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    const [p, i, e, c, co] = await Promise.all([
      supabase.from("pedidos").select("*").order("data_entrega").order("numero"),
      supabase.from("pedido_itens").select("*").order("created_at"),
      supabase.from("empresas").select("id,nome").eq("tipo", "terceirizada").order("nome"),
      supabase.from("cadeiras").select("*").order("nome"),
      supabase.from("cores").select("*").order("numero")
    ]);
    const er = [p, i, e, c, co].find(r => r.error);
    if (er) return setErro(er.error.message);
    setPedidos(p.data); setItens(i.data); setEmpresas(e.data); setCadeiras(c.data); setCores(co.data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const nomeEmpresa = (id) => empresas.find(e => e.id === id)?.nome || "—";
  const nomeCadeira = (id) => cadeiras.find(c => c.id === id)?.nome || "—";

  async function criarCadeira({ nome }) {
    if (!nome?.trim()) return { erro: "Digite o nome da cadeira." };
    const { data, error } = await supabase.from("cadeiras").insert({ nome: nome.trim() }).select().single();
    if (error) return { erro: /duplicate|unique/i.test(error.message) ? "Essa cadeira já existe." : error.message };
    setCadeiras(l => [...l, data].sort((a, b) => a.nome.localeCompare(b.nome)));
    return {};
  }
  async function criarCor({ numero, nome }) {
    if (!numero?.trim()) return { erro: "Digite o número do tecido." };
    const { data, error } = await supabase.from("cores").insert({ numero: numero.trim(), nome: nome?.trim() || null }).select().single();
    if (error) return { erro: /duplicate|unique/i.test(error.message) ? "Esse número de tecido já existe." : error.message };
    setCores(l => [...l, data].sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true })));
    return {};
  }
  const setLinha = (k, patch) => setF(x => ({ ...x, linhas: x.linhas.map(l => l.k === k ? { ...l, ...patch } : l) }));

  async function salvar(e) {
    e.preventDefault();
    const linhas = f.linhas.map(l => ({ ...l, n: parseInt(l.caixas, 10) }));
    if (!f.empresa_id || !f.data_entrega) return setErro("Escolha a terceirizada e a data de entrega.");
    if (linhas.some(l => !l.cadeira_id || !l.cor_id || !l.n || l.n < 1)) return setErro("Em cada item, escolha a cadeira, o tecido e a quantidade de caixas.");
    const { data: ped, error } = await supabase.from("pedidos").insert({
      empresa_id: f.empresa_id, data_entrega: f.data_entrega, observacao: f.observacao.trim() || null
    }).select().single();
    if (error) return setErro(error.message);
    const { error: e2 } = await supabase.from("pedido_itens").insert(
      linhas.map(l => ({ pedido_id: ped.id, cadeira_id: l.cadeira_id, cor_id: l.cor_id, caixas: l.n }))
    );
    if (e2) {
      await supabase.from("pedidos").delete().eq("id", ped.id); // não deixa pedido sem itens
      return setErro(e2.message);
    }
    setErro(""); setF({ ...vazio, linhas: [novaLinha()] }); setAberto(false); carregar();
  }
  async function cancelar(p) {
    if (!confirm(`Cancelar o pedido #${p.numero}?`)) return;
    const { error } = await supabase.from("pedidos").update({ status: "cancelado" }).eq("id", p.id);
    if (error) setErro(error.message); else carregar();
  }
  async function excluir(p) {
    if (!confirm(`Excluir o pedido #${p.numero}? Não dá para desfazer.`)) return;
    const { error } = await supabase.from("pedidos").delete().eq("id", p.id);
    if (error) setErro(error.message); else carregar();
  }

  const visiveis = pedidos.filter(p => !filtro || p.status === filtro);
  const atrasado = (p) => (p.status === "aberto" || p.status === "parcial") && p.data_entrega < hoje();
  const opCad = cadeiras.filter(c => c.ativo).map(c => ({ id: c.id, texto: c.nome }));
  const opCor = cores.filter(c => c.ativo).map(c => ({ id: c.id, texto: corTxt(c) }));

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Pedidos</h2>
        <div className="row">
          <select value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {podeLancar && <button className="btn primary" onClick={() => setAberto(!aberto)}>+ Novo pedido</button>}
        </div>
      </div>

      {aberto && podeLancar && (
        <form onSubmit={salvar} className="card" style={{ background: "#f8f9fc", marginBottom: 14, display: "grid", gap: 10 }}>
          <div className="row">
            <label style={{ flex: 1, minWidth: 150 }}>Terceirizada
              <select value={f.empresa_id} onChange={e => setF({ ...f, empresa_id: e.target.value })}>
                <option value="">— escolha —</option>
                {empresas.filter(e => e.ativo !== false).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
            <label style={{ flex: 1, minWidth: 150 }}>Data de entrega<input type="date" value={f.data_entrega} onChange={e => setF({ ...f, data_entrega: e.target.value })} /></label>
          </div>

          <strong>Itens do pedido</strong>
          {f.linhas.map((l, idx) => (
            <div key={l.k} className="row" style={{ alignItems: "flex-end", padding: 10, background: "#fff", borderRadius: 10 }}>
              <SeletorNovo label="Cadeira" valor={l.cadeira_id} opcoes={opCad} campos={[{ k: "nome", ph: "Nome da cadeira" }]}
                onChange={v => setLinha(l.k, { cadeira_id: v })} onCriar={criarCadeira} />
              <SeletorNovo label="Tecido (número)" valor={l.cor_id} opcoes={opCor} campos={[{ k: "numero", ph: "Número do tecido" }, { k: "nome", ph: "Nome do tecido (opcional)" }]}
                onChange={v => setLinha(l.k, { cor_id: v })} onCriar={criarCor} />
              <label style={{ width: 110 }}>Caixas<input type="number" min="1" value={l.caixas} onChange={e => setLinha(l.k, { caixas: e.target.value })} /></label>
              {f.linhas.length > 1 && <button type="button" className="btn sm" onClick={() => setF(x => ({ ...x, linhas: x.linhas.filter(y => y.k !== l.k) }))}>Remover</button>}
            </div>
          ))}
          <div><button type="button" className="btn sm" onClick={() => setF(x => ({ ...x, linhas: [...x.linhas, novaLinha()] }))}>+ Adicionar outro item</button></div>

          <label>Observação (opcional)<input value={f.observacao} onChange={e => setF({ ...f, observacao: e.target.value })} /></label>
          <button className="btn primary">Enviar pedido</button>
        </form>
      )}

      {erro && <div className="err" style={{ marginBottom: 10 }}>{erro}</div>}
      {!visiveis.length && <p className="muted">Nenhum pedido{podeLancar ? " ainda. Clique em “+ Novo pedido”." : "."}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {visiveis.map(p => {
          const its = itens.filter(i => i.pedido_id === p.id);
          const total = its.reduce((a, i) => a + i.caixas, 0);
          const rec = its.reduce((a, i) => a + i.caixas_recebidas, 0);
          return (
            <div key={p.id} className="card" style={{ border: "1px solid #eceef3", boxShadow: "none" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>Pedido #{p.numero}{podeLancar && ` — ${nomeEmpresa(p.empresa_id)}`}</strong>
                <span className={"badge " + (p.status === "entregue" ? "ok" : p.status === "cancelado" ? "off" : "")}>{STATUS[p.status]}</span>
              </div>
              <div className="muted">Entrega: {fmtData(p.data_entrega)} {atrasado(p) && <span className="badge off">Atrasado</span>} · {rec}/{total} caixas recebidas</div>
              <table style={{ marginTop: 8 }}><tbody>
                {its.map(i => (
                  <tr key={i.id}><td>{nomeCadeira(i.cadeira_id)}</td><td>{corTxt(cores.find(c => c.id === i.cor_id))}</td><td>{i.caixas} cx</td></tr>
                ))}
              </tbody></table>
              {p.observacao && <div className="muted" style={{ marginTop: 6 }}>Obs.: {p.observacao}</div>}
              {podeLancar && (
                <div className="row" style={{ marginTop: 8 }}>
                  {p.status !== "cancelado" && p.status !== "entregue" && <button className="btn sm" onClick={() => cancelar(p)}>Cancelar</button>}
                  <button className="btn sm" onClick={() => excluir(p)}>Excluir</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
