import { useEffect, useState, useCallback } from "react";
import { Download, ShieldCheck, FileText, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient.js";

export const TERMOS_VERSAO = "2026-11-18";
const DATA_BR = "18/11/2026";

const H = ({ children }) => <h3 style={{ margin: "18px 0 6px", fontSize: 15.5 }}>{children}</h3>;
const P = ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.55, fontSize: 14.5 }}>{children}</p>;
const L = ({ items }) => <ul style={{ margin: "0 0 8px", paddingLeft: 20, lineHeight: 1.55, fontSize: 14.5 }}>{items.map((i, k) => <li key={k}>{i}</li>)}</ul>;

function Privacidade() {
  return <>
    <P>Versão de {DATA_BR}. Esta política explica quais dados o GestCel guarda, para quê, com quem são compartilhados e como você exerce seus direitos pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).</P>
    <H>1. O que é o GestCel</H>
    <P>Sistema de gestão usado pela Cel Móveis e pelas empresas terceirizadas parceiras para controlar pedidos, estoque, almoxarifado, fichas técnicas e RH.</P>
    <H>2. Dados que guardamos</H>
    <L items={[
      "Conta: nome, nome de usuário, empresa e perfil de acesso. A senha é protegida pelo serviço de autenticação e não fica visível para ninguém.",
      "Registro de aceite: qual versão destes documentos você aceitou e quando.",
      "Dados de trabalho que você lança: pedidos, estoque, requisições, solicitações e fichas técnicas.",
      "Dados de RH lançados pela terceirizada: nome, função, datas de admissão e saída, salário, vales, cartão de ponto, atestados, exames e entrega de EPI dos funcionários."
    ]} />
    <H>3. Dados sensíveis</H>
    <P>Atestados (com CID) e exames podem revelar informações de saúde, que a LGPD trata como dados sensíveis. Registre o CID só quando for realmente necessário. Esses dados ficam visíveis apenas para a própria empresa que os lançou e para o administrador do sistema.</P>
    <H>4. Para que usamos</H>
    <P>Apenas para operar o sistema: organizar a produção e os pedidos, controlar o estoque e apoiar a rotina de RH. Não usamos seus dados para publicidade, perfilamento comercial nem venda a terceiros.</P>
    <H>5. Quem é responsável pelos dados</H>
    <P>Cada empresa terceirizada decide quais dados de seus funcionários lança e responde por ter base legal para isso (por exemplo, o contrato de trabalho e obrigações legais). O administrador do GestCel mantém a ferramenta e os acessos.</P>
    <H>6. Com quem os dados passam</H>
    <L items={[
      "Supabase: banco de dados e autenticação.",
      "Vercel: hospedagem do site.",
      "Não usamos ferramentas de análise, anúncios ou rastreadores de terceiros."
    ]} />
    <H>7. Cookies e armazenamento no navegador</H>
    <P>Usamos apenas o armazenamento essencial do navegador para manter você conectado. Não há cookies de marketing nem de análise, por isso não mostramos faixa de consentimento de cookies. A fonte do sistema é servida pelo próprio site, sem requisição ao Google.</P>
    <H>8. Inteligência artificial</H>
    <P>Não usamos os dados do GestCel para treinar modelos de inteligência artificial.</P>
    <H>9. Por quanto tempo guardamos</H>
    <P>Enquanto a conta ou o vínculo da empresa estiver ativo. Ao atender um pedido de exclusão, apagamos ou anonimizamos os dados, exceto o que a lei exigir manter.</P>
    <H>10. Seus direitos</H>
    <P>Você pode pedir confirmação de que tratamos seus dados, acesso, correção, anonimização ou eliminação, portabilidade, informação sobre compartilhamento e revogação de consentimento. Em <b>Minha conta</b> você baixa seus dados e registra pedidos de correção ou exclusão. O administrador responde pelo próprio sistema.</P>
    <H>11. Segurança</H>
    <P>Acesso por login, conexão criptografada e isolamento entre empresas: cada terceirizada enxerga somente os próprios dados. Nenhum sistema é 100% imune a falhas; se houver incidente com risco aos seus dados, avisaremos.</P>
    <H>12. Menores de idade</H>
    <P>O GestCel é para uso profissional por maiores de 18 anos. Não coletamos dados de crianças.</P>
    <H>13. Mudanças</H>
    <P>Se esta política mudar, pediremos um novo aceite no próximo acesso.</P>
  </>;
}
function Termos() {
  return <>
    <P>Versão de {DATA_BR}. Ao criar conta ou continuar usando o GestCel, você concorda com estes termos.</P>
    <H>1. Quem pode usar</H>
    <P>Profissionais maiores de 18 anos, com acesso liberado pelo administrador. Cada perfil enxerga apenas o que sua função permite.</P>
    <H>2. Sua conta</H>
    <P>A conta é pessoal. Não compartilhe sua senha e avise o administrador se suspeitar de uso indevido.</P>
    <H>3. Uso adequado</H>
    <L items={[
      "Lance informações verdadeiras e atualizadas.",
      "Não tente acessar dados de outras empresas nem burlar as permissões.",
      "Quem lança dados de funcionários é responsável por ter autorização legal para isso."
    ]} />
    <H>4. Valores e cálculos são estimativas</H>
    <P>Folha do mês, horas extras, descontos, 13º salário, saldo do banco de horas e cálculos de material são apoio à gestão. Não substituem a folha de pagamento oficial nem a orientação da contabilidade.</P>
    <H>5. Disponibilidade</H>
    <P>O sistema é oferecido sem garantia de funcionamento ininterrupto. Pode haver manutenções, atualizações e indisponibilidades eventuais. Guarde por conta própria o que for crítico para o seu negócio.</P>
    <H>6. Custos</H>
    <P>No momento o uso do sistema não tem cobrança. Se isso mudar, você será avisado antes e precisará aceitar novos termos.</P>
    <H>7. Suspensão</H>
    <P>O administrador pode suspender contas usadas de forma indevida ou que não tenham mais vínculo com a operação.</P>
    <H>8. Alterações e lei aplicável</H>
    <P>Estes termos podem ser atualizados; mudanças relevantes exigem novo aceite. Valem as leis do Brasil.</P>
  </>;
}
function Licencas() {
  const itens = [["React e React DOM", "MIT"], ["Vite", "MIT"], ["Supabase JS", "MIT"], ["Lucide (ícones)", "ISC"], ["qrcode", "MIT"], ["Fonte Exo 2", "SIL Open Font License 1.1"]];
  return <>
    <P>O GestCel é construído com software livre. Cada componente segue a licença do seu autor:</P>
    <table><tbody>{itens.map(([n, l]) => <tr key={n}><td>{n}</td><td>{l}</td></tr>)}</tbody></table>
    <P>Os direitos desses projetos pertencem aos respectivos autores.</P>
  </>;
}
export const DOCS = { privacidade: ["Política de Privacidade", Privacidade], termos: ["Termos de Uso", Termos], licencas: ["Licenças de código aberto", Licencas] };

export function LegalModal({ doc, onClose }) {
  const [titulo, Corpo] = DOCS[doc];
  return (
    <div className="modal-bg" style={{ zIndex: 70 }} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="card modal" style={{ maxWidth: 640 }}>
        <h2 style={{ marginBottom: 6 }}>{titulo}</h2>
        <Corpo />
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary" onClick={onClose} autoFocus>Fechar</button></div>
      </div>
    </div>
  );
}

export function RodapeLegal({ abrir }) {
  return (
    <footer className="rodape">
      <span>GestCel</span>
      <button onClick={() => abrir("privacidade")}>Privacidade</button>
      <button onClick={() => abrir("termos")}>Termos de uso</button>
      <button onClick={() => abrir("licencas")}>Licenças</button>
    </footer>
  );
}

// aceite obrigatório quando a versão dos termos muda (ou no primeiro acesso de contas antigas)
export function AceiteModal({ onAceito, onSair, abrir }) {
  const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const [erro, setErro] = useState("");
  async function aceitar() {
    setBusy(true);
    const { error } = await supabase.rpc("registrar_aceite", { p_versao: TERMOS_VERSAO });
    setBusy(false); if (error) return setErro(error.message); onAceito();
  }
  return (
    <div className="modal-bg" style={{ zIndex: 60 }} role="dialog" aria-modal="true" aria-label="Aceite dos termos">
      <div className="card modal" style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Antes de continuar</h2>
        <p className="muted" style={{ margin: 0 }}>Atualizamos a Política de Privacidade e os Termos de Uso. Leia e aceite para usar o GestCel.</p>
        <div className="row"><button className="btn" onClick={() => abrir("privacidade")}><ShieldCheck size={14} /> Política de Privacidade</button><button className="btn" onClick={() => abrir("termos")}><FileText size={14} /> Termos de Uso</button></div>
        <label className="row" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} style={{ marginTop: 3 }} /> <span>Li e aceito a Política de Privacidade e os Termos de Uso.</span></label>
        {erro && <div className="err">{erro}</div>}
        <div className="row"><button className="btn primary" disabled={!ok || busy} onClick={aceitar}>{busy ? "Salvando..." : "Aceitar e continuar"}</button><button className="btn" onClick={onSair}>Sair</button></div>
      </div>
    </div>
  );
}

const TIPOS = { correcao: "Correção de dados", exclusao: "Exclusão da conta e dos dados", acesso: "Acesso aos dados", outro: "Outro" };
function TrocarSenha({ perfil }) {
  const [atual, setAtual] = useState(""); const [nova, setNova] = useState(""); const [conf, setConf] = useState("");
  const [msg, setMsg] = useState(""); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  async function trocar(e) {
    e.preventDefault(); setErro(""); setMsg("");
    if (!atual) return setErro("Informe a senha atual.");
    if (nova.length < 8) return setErro("A nova senha precisa ter ao menos 8 caracteres.");
    if (!/[a-z]/.test(nova) || !/[A-Z]/.test(nova) || !/\d/.test(nova)) return setErro("A nova senha precisa ter letra minúscula, maiúscula e número.");
    if (perfil.username && nova.toLowerCase().includes(perfil.username.toLowerCase())) return setErro("A senha não pode conter o seu usuário.");
    if (nova === atual) return setErro("A nova senha precisa ser diferente da atual.");
    if (nova !== conf) return setErro("A confirmação não confere com a nova senha.");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const email = u?.user?.email;
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: atual });
    if (e1) { setBusy(false); return setErro("Senha atual incorreta."); }
    const { error: e2 } = await supabase.auth.updateUser({ password: nova });
    setBusy(false);
    if (e2) return setErro(/same|different/i.test(e2.message) ? "A nova senha precisa ser diferente da atual." : /pwned|leaked|weak|easy/i.test(e2.message) ? "Essa senha é fraca ou já apareceu em vazamentos. Escolha outra." : "Não foi possível trocar a senha. Tente outra senha.");
    setAtual(""); setNova(""); setConf(""); setMsg("Senha alterada com sucesso.");
  }
  return (
    <form className="card" onSubmit={trocar} style={{ display: "grid", gap: 10 }} autoComplete="off">
      <h2 style={{ margin: 0 }}>Trocar senha</h2>
      <label>Senha atual<input type="password" value={atual} onChange={e => setAtual(e.target.value)} autoComplete="current-password" /></label>
      <label>Nova senha<input type="password" value={nova} onChange={e => setNova(e.target.value)} autoComplete="new-password" /></label>
      <label>Repita a nova senha<input type="password" value={conf} onChange={e => setConf(e.target.value)} autoComplete="new-password" /></label>
      <p className="muted" style={{ margin: 0 }}>Mínimo de 8 caracteres, com letra minúscula, maiúscula e número. Senhas conhecidas de vazamentos são recusadas.</p>
      {erro && <div className="err" role="alert">{erro}</div>}{msg && <div className="ok-msg" role="status">{msg}</div>}
      <div><button className="btn primary" disabled={busy}>{busy ? "Salvando..." : "Trocar senha"}</button></div>
    </form>
  );
}

export function MinhaConta({ perfil, abrir }) {
  const [pedidos, setPedidos] = useState([]); const [tipo, setTipo] = useState("correcao"); const [detalhe, setDetalhe] = useState(""); const [msg, setMsg] = useState(""); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  const carregar = useCallback(async () => { const { data } = await supabase.from("pedidos_lgpd").select("*").eq("user_id", perfil.user_id).order("created_at", { ascending: false }); setPedidos(data || []); }, [perfil.user_id]);
  useEffect(() => { carregar(); }, [carregar]);
  async function baixar() {
    setErro(""); const { data, error } = await supabase.rpc("meus_dados");
    if (error) return setErro(error.message);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "meus-dados-gestcel.json"; a.click(); URL.revokeObjectURL(url);
  }
  async function pedir(e) {
    e.preventDefault(); setErro(""); setMsg("");
    if (tipo === "exclusao" && !confirm("Pedir a exclusão da sua conta e dos seus dados? O administrador vai analisar e, depois de atendido, você perde o acesso.")) return;
    setBusy(true); const { error } = await supabase.rpc("criar_pedido_lgpd", { p_tipo: tipo, p_detalhe: detalhe }); setBusy(false);
    if (error) return setErro(error.message); setDetalhe(""); setMsg("Pedido registrado. O administrador vai responder pelo sistema."); carregar();
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card">
        <h1>Minha conta</h1>
        <p className="muted">{perfil.nome} · usuário <b>{perfil.username}</b></p>
        <div className="row"><button className="btn" onClick={() => abrir("privacidade")}><ShieldCheck size={14} /> Política de Privacidade</button><button className="btn" onClick={() => abrir("termos")}><FileText size={14} /> Termos de Uso</button></div>
      </div>
      <TrocarSenha perfil={perfil} />
      <div className="card">
        <h2>Meus dados</h2>
        <p className="muted">Baixe uma cópia dos dados da sua conta (nome, usuário, perfil, aceites e pedidos). Os dados de RH dos funcionários pertencem à empresa e ficam no módulo RH.</p>
        <button className="btn" onClick={baixar}><Download size={14} /> Baixar meus dados</button>
      </div>
      <form className="card" onSubmit={pedir} style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Pedidos de privacidade</h2>
        <label>O que você precisa?<select value={tipo} onChange={e => setTipo(e.target.value)}>{Object.entries(TIPOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Detalhes (opcional)<input value={detalhe} onChange={e => setDetalhe(e.target.value)} /></label>
        {erro && <div className="err">{erro}</div>}{msg && <div className="ok-msg">{msg}</div>}
        <div><button className="btn primary" disabled={busy}>{tipo === "exclusao" ? <><Trash2 size={14} /> Pedir exclusão</> : "Enviar pedido"}</button></div>
        {pedidos.length > 0 && <div>{pedidos.map(p => <div key={p.id} className="item"><span>{TIPOS[p.tipo]}{p.detalhe ? ` — ${p.detalhe}` : ""}</span><span className={"badge " + (p.status === "atendido" ? "ok" : "")}>{p.status === "atendido" ? "Atendido" : "Em aberto"}</span></div>)}</div>}
      </form>
    </div>
  );
}

export function PedidosPrivacidade() {
  const [lista, setLista] = useState([]); const [nomes, setNomes] = useState({}); const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    const [p, u] = await Promise.all([supabase.from("pedidos_lgpd").select("*").order("created_at", { ascending: false }), supabase.from("perfis").select("user_id,nome,username")]);
    if (p.error) return setErro(p.error.message);
    setLista(p.data); setNomes(Object.fromEntries((u.data || []).map(x => [x.user_id, `${x.nome} (${x.username})`])));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  async function atender(id) { const { error } = await supabase.rpc("atender_pedido_lgpd", { p_id: id }); if (error) setErro(error.message); else carregar(); }
  return (
    <div className="card">
      <h1>Pedidos de privacidade</h1>
      <p className="muted">Pedidos feitos pelos usuários em Minha conta. Para exclusão, desative o usuário em Usuários e depois marque como atendido.</p>
      {erro && <div className="err">{erro}</div>}
      {lista.length === 0 && <p className="muted">Nenhum pedido.</p>}
      {lista.map(p => <div className="item" key={p.id}><div><b>{nomes[p.user_id] || "Usuário"}</b><div className="muted">{TIPOS[p.tipo]}{p.detalhe ? ` — ${p.detalhe}` : ""} · {new Date(p.created_at).toLocaleDateString("pt-BR")}</div></div>
        {p.status === "aberto" ? <button className="btn sm primary" onClick={() => atender(p.id)}>Marcar como atendido</button> : <span className="badge ok">Atendido</span>}</div>)}
    </div>
  );
}
