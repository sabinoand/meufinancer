import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Plus, ArrowDownToLine, ArrowUpFromLine, Pencil, Folder, FolderPlus, FileText } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const UNIDADES = ["un", "m", "m²", "kg", "g", "L", "mL", "rolo", "pacote", "caixa", "lata", "par", "folha"];
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const num = (v) => parseFloat(String(v).replace(",", "."));

const MAPA_UN = { UN: "un", UND: "un", UNID: "un", PC: "un", PÇ: "un", PCS: "un", KG: "kg", G: "g", GR: "g", M: "m", MT: "m", MTS: "m", M2: "m²", LT: "L", L: "L", ML: "mL", CX: "caixa", PCT: "pacote", PT: "pacote", RL: "rolo", PR: "par", FL: "folha" };
const unXml = (u) => MAPA_UN[String(u || "").toUpperCase().trim()] || String(u || "un").toLowerCase();
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const diaExtenso = (iso) => { const [a, m, d] = iso.split("-").map(Number); return `${DIAS[new Date(a, m - 1, d).getDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`; };

function lerXml(txt) {
  const doc = new DOMParser().parseFromString(txt, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Arquivo XML inválido.");
  const inf = doc.getElementsByTagName("infNFe")[0];
  if (!inf) throw new Error("Este XML não parece ser de uma NF-e.");
  const g = (el, tag) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
  const ide = inf.getElementsByTagName("ide")[0], emit = inf.getElementsByTagName("emit")[0];
  const chave = (inf.getAttribute("Id") || "").replace(/^NFe/, "") || g(doc, "chNFe");
  if (!chave) throw new Error("XML sem chave de acesso.");
  const meta = { chave, numero: g(ide, "nNF"), emissao: (g(ide, "dhEmi") || g(ide, "dEmi")).slice(0, 10), emitente: g(emit, "xNome"), cnpj: g(emit, "CNPJ") || g(emit, "CPF"), total: parseFloat(g(inf.getElementsByTagName("ICMSTot")[0], "vNF")) || 0 };
  const linhas = [...inf.getElementsByTagName("det")].map((det, i) => {
    const pr = det.getElementsByTagName("prod")[0];
    return { k: i, cprod: g(pr, "cProd"), desc: g(pr, "xProd"), un: g(pr, "uCom"), q: parseFloat(g(pr, "qCom")) || 0, vu: parseFloat(g(pr, "vUnCom")) || 0 };
  });
  if (!linhas.length) throw new Error("A nota não tem itens.");
  return { meta, linhas };
}

const css = `
.wide{max-width:680px !important;max-height:92vh;overflow-y:auto}
.diah{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin:16px 0 6px;padding-bottom:4px;border-bottom:2px solid #e3e7f0}
.diah b{text-transform:capitalize}
.xl{border:1px solid #eceef3;border-radius:10px;padding:10px;display:grid;gap:8px;background:#fff}
.xl.off{opacity:.45}
.subtabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #eceef3}
.subtabs button{border:0;background:none;padding:9px 14px;cursor:pointer;font-size:14px;color:#6b7385;border-bottom:2px solid transparent}
.subtabs button.on{color:#1d4ed8;border-color:#1d4ed8;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.kpi{border-radius:12px;padding:12px 14px;background:#f1f4fb}.kpi small{display:block;color:#6b7385;font-size:12px}.kpi b{font-size:22px}
.kpi.bad{background:#fee2e2}.kpi.bad b{color:#991b1b}.kpi.good{background:#dcfce7}.kpi.good b{color:#166534}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.bar .busca{display:flex;align-items:center;gap:6px;border:1px solid #d5d9e2;border-radius:8px;padding:0 10px;background:#fff;flex:1;min-width:180px}
.bar .busca input{border:0;outline:0;padding:9px 0;flex:1;font-size:14px;min-width:0}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.chip{border:1px solid #d5d9e2;background:#fff;border-radius:99px;padding:5px 12px;font-size:13px;cursor:pointer;color:#4a5367}
.chip.on{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
.pill{font-size:12px;padding:2px 9px;border-radius:99px;white-space:nowrap}
.pill.falta{background:#fee2e2;color:#991b1b}.pill.ok{background:#e8ebf2;color:#4a5367}
@media(max-width:720px){.kpis{grid-template-columns:1fr}}
`;

export default function Almoxarifado({ perfil, secao }) {
  const admin = perfil.papel === "admin";
  const aba = secao || "estoque";
  const [itens, setItens] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [vinc, setVinc] = useState([]);
  const [xml, setXml] = useState(null);
  const [hBusca, setHBusca] = useState("");
  const [hTipo, setHTipo] = useState("");
  const [hDe, setHDe] = useState("");
  const [hAte, setHAte] = useState("");
  const [busca, setBusca] = useState("");
  const [grupos, setGrupos] = useState([]);
  const [grupoAberto, setGrupoAberto] = useState(null);
  const [soBaixo, setSoBaixo] = useState(false);
  const [verInativos, setVerInativos] = useState(false);
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({});
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("almox_itens").select("*").order("nome"),
      supabase.from("almox_saldo").select("*"),
      supabase.from("almox_mov").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("almox_grupos").select("*").order("nome"),
      supabase.from("almox_xml_vinculos").select("*")
    ]);
    const er = rs.find(r => r.error);
    if (er) return setErro(er.error.message);
    setItens(rs[0].data); setSaldos(rs[1].data); setMovs(rs[2].data); setGrupos(rs[3].data); setVinc(rs[4].data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const linhas = useMemo(() => itens.map(i => {
    const saldo = Number(saldos.find(s => s.item_id === i.id)?.saldo || 0);
    return { ...i, saldo, baixo: i.ativo && Number(i.minimo) > 0 && saldo < Number(i.minimo) };
  }), [itens, saldos]);
  const ativos = linhas.filter(i => i.ativo);
  const vis = linhas.filter(i => {
    if (!verInativos && !i.ativo) return false;
    const t = busca.trim().toLowerCase();
    if (t && !i.nome.toLowerCase().includes(t)) return false;
    if (soBaixo && !i.baixo) return false;
    return true;
  });
  const kValor = ativos.reduce((a, i) => a + i.saldo * Number(i.valor), 0);
  const kBaixo = ativos.filter(i => i.baixo).length;
  const nome = (id) => itens.find(i => i.id === id);
  const nomeGrupo = (id) => grupos.find(g => g.id === id)?.nome || "";
  const filtrando = !!(busca.trim() || soBaixo);
  const grupoSel = grupoAberto && grupos.find(g => g.id === grupoAberto);
  const resumoGrupo = (g) => {
    const its = linhas.filter(i => i.grupo_id === g.id && i.ativo);
    return { n: its.length, total: its.reduce((a, i) => a + i.saldo * Number(i.valor), 0), baixo: its.filter(i => i.baixo).length };
  };
  const itensTabela = grupoSel ? vis.filter(i => i.grupo_id === grupoSel.id) : filtrando ? vis : vis.filter(i => !i.grupo_id);
  const gruposTabela = !grupoSel && !filtrando ? grupos : [];

  function abrirItem(i) {
    const un = i && !UNIDADES.includes(i.unidade) ? "__outra" : (i?.unidade || "un");
    setF(i ? { id: i.id, nome: i.nome, un, outra: un === "__outra" ? i.unidade : "", grupo: i.grupo_id || "", novoGrupo: "", valor: String(i.valor), minimo: String(i.minimo), ativo: i.ativo }
           : { nome: "", un: "un", outra: "", grupo: grupoAberto || "", novoGrupo: "", valor: "", minimo: "", ativo: true });
    setErro(""); setModal({ tipo: "item" });
  }
  function abrirMov(tipo, i) {
    setF({ item_id: i?.id || "", qtd: "", valor: tipo === "entrada" && i ? String(i.valor) : "", obs: "", data: hojeIso() });
    setErro(""); setModal({ tipo });
  }

  async function salvarItem(e) {
    e.preventDefault();
    const unidade = f.un === "__outra" ? f.outra.trim() : f.un;
    const valor = f.valor === "" ? 0 : num(f.valor), minimo = f.minimo === "" ? 0 : num(f.minimo);
    if (!f.nome.trim() || !unidade) return setErro("Informe o nome e a unidade de medida.");
    if (isNaN(valor) || valor < 0 || isNaN(minimo) || minimo < 0) return setErro("Valor e mínimo devem ser números positivos.");
    if (f.grupo === "__novo" && !f.novoGrupo.trim()) return setErro("Digite o nome do novo grupo.");
    setBusy(true);
    let grupo_id = f.grupo && f.grupo !== "__novo" ? f.grupo : null;
    if (f.grupo === "__novo") {
      const ja = grupos.find(g => g.nome.toLowerCase() === f.novoGrupo.trim().toLowerCase());
      if (ja) grupo_id = ja.id;
      else {
        const { data: g, error: eg } = await supabase.from("almox_grupos").insert({ nome: f.novoGrupo.trim() }).select().single();
        if (eg) { setBusy(false); return setErro(eg.message); }
        grupo_id = g.id;
      }
    }
    const dados = { nome: f.nome.trim(), unidade, valor, minimo, grupo_id };
    const { error } = f.id
      ? await supabase.from("almox_itens").update({ ...dados, ativo: f.ativo }).eq("id", f.id)
      : await supabase.from("almox_itens").insert(dados);
    setBusy(false);
    if (error) return setErro(/duplicate|unique/i.test(error.message) ? "Já existe um item com esse nome." : error.message);
    setModal(null); carregar();
  }
  function abrirGrupo(g) { setF({ gid: g?.id, gnome: g?.nome || "" }); setErro(""); setModal({ tipo: "grupo" }); }
  async function salvarGrupo(e) {
    e.preventDefault();
    if (!f.gnome.trim()) return setErro("Informe o nome do grupo.");
    setBusy(true);
    const { error } = f.gid
      ? await supabase.from("almox_grupos").update({ nome: f.gnome.trim() }).eq("id", f.gid)
      : await supabase.from("almox_grupos").insert({ nome: f.gnome.trim() });
    setBusy(false);
    if (error) return setErro(/duplicate|unique/i.test(error.message) ? "Já existe um grupo com esse nome." : error.message);
    setModal(null); carregar();
  }
  async function excluirGrupo() {
    const n = linhas.filter(i => i.grupo_id === f.gid).length;
    if (!confirm(`Excluir o grupo "${f.gnome}"? ${n ? `Os ${n} itens dele não serão apagados: ficam sem grupo.` : ""}`)) return;
    const { error } = await supabase.from("almox_grupos").delete().eq("id", f.gid);
    if (error) return setErro(error.message);
    setModal(null); setGrupoAberto(null); carregar();
  }
  async function salvarMov(e) {
    e.preventDefault();
    const q = num(f.qtd);
    if (!f.item_id || !q || q <= 0) return setErro("Escolha o item e informe a quantidade.");
    const v = modal.tipo === "entrada" && f.valor !== "" ? num(f.valor) : null;
    if (v !== null && (isNaN(v) || v < 0)) return setErro("Valor inválido.");
    setBusy(true);
    const { error } = await supabase.rpc("almox_movimentar", { p_item: f.item_id, p_tipo: modal.tipo, p_qtd: q, p_valor: v, p_obs: f.obs, p_data: f.data || null });
    setBusy(false);
    if (error) return setErro(error.message);
    setModal(null); carregar();
  }
  async function escolherXml(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setErro("");
    try {
      const { meta, linhas } = lerXml(await file.text());
      const lns = linhas.map(l => {
        const v = vinc.find(x => x.cnpj === meta.cnpj && x.cprod === l.cprod);
        const porNome = itens.find(i => i.ativo && norm(i.nome) === norm(l.desc));
        const sel = v && itens.find(i => i.id === v.item_id)?.id || porNome?.id || "__novo";
        return { ...l, incl: true, sel, novoNome: l.desc, novoUn: unXml(l.un), novoGrupo: grupoAberto || "" };
      });
      setXml(x => ({ ...x, etapa: "revisao", meta, linhas: lns, arquivo: file.name }));
    } catch (er) { setErro(er.message); }
    e.target.value = "";
  }
  const setLn = (k, patch) => setXml(x => ({ ...x, linhas: x.linhas.map(l => l.k === k ? { ...l, ...patch } : l) }));
  async function lancarXml() {
    const sel = xml.linhas.filter(l => l.incl);
    if (!sel.length) return setErro("Marque ao menos um item da nota.");
    for (const l of sel) {
      if (l.sel === "__novo" && (!l.novoNome.trim() || !l.novoUn.trim())) return setErro(`Informe nome e unidade do item novo "${l.desc}".`);
      if (!(l.q > 0)) return setErro(`Quantidade inválida em "${l.desc}".`);
    }
    setBusy(true); setErro("");
    const { error } = await supabase.rpc("almox_importar_nfe", {
      p_chave: xml.meta.chave, p_numero: xml.meta.numero, p_emitente: xml.meta.emitente, p_cnpj: xml.meta.cnpj,
      p_emissao: xml.meta.emissao || null, p_total: xml.meta.total, p_data: xml.data || null,
      p_itens: sel.map(l => l.sel === "__novo"
        ? { novo_nome: l.novoNome.trim(), novo_unidade: l.novoUn.trim(), novo_grupo: l.novoGrupo || null, quantidade: l.q, valor_unit: l.vu, cprod: l.cprod }
        : { item_id: l.sel, quantidade: l.q, valor_unit: l.vu, cprod: l.cprod })
    });
    setBusy(false);
    if (error) return setErro(error.message);
    setModal(null); setXml(null); carregar();
  }

  const movsFiltrados = useMemo(() => movs.filter(m => {
    if (hTipo && m.tipo !== hTipo) return false;
    if (hDe && m.data < hDe) return false;
    if (hAte && m.data > hAte) return false;
    const t = hBusca.trim().toLowerCase();
    if (t && !((itens.find(i => i.id === m.item_id)?.nome || "").toLowerCase().includes(t) || (m.observacao || "").toLowerCase().includes(t))) return false;
    return true;
  }), [movs, itens, hTipo, hDe, hAte, hBusca]);
  const dias = useMemo(() => {
    const por = new Map();
    movsFiltrados.forEach(m => por.set(m.data, [...(por.get(m.data) || []), m]));
    return [...por.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [movsFiltrados]);

  async function desfazer(m) {
    if (!confirm("Desfazer este lançamento?")) return;
    const { error } = await supabase.rpc("almox_excluir_mov", { p_id: m.id });
    if (error) setErro(error.message); else { setErro(""); carregar(); }
  }
  const itemForm = nome(f.item_id);

  return (
    <div className="card">
      <style>{css}</style>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h2 style={{ margin: 0 }}>Almoxarifado</h2><div className="muted">Itens e estoque de matéria-prima — os terceirizados solicitam a partir desta lista</div></div>
        {!admin && <div className="row">
          <button className="btn" onClick={() => abrirGrupo(null)}><FolderPlus size={14} /> Novo grupo</button>
          <button className="btn" onClick={() => abrirMov("entrada", null)}><ArrowDownToLine size={14} /> Entrada</button>
          <button className="btn" onClick={() => { setErro(""); setXml({ etapa: "arquivo", data: hojeIso() }); setModal({ tipo: "xml" }); }}><FileText size={14} /> Entrada por XML</button>
          <button className="btn" onClick={() => abrirMov("saida", null)}><ArrowUpFromLine size={14} /> Saída</button>
          <button className="btn primary" onClick={() => abrirItem(null)}><Plus size={14} /> Novo item</button>
        </div>}
      </div>
      
      {erro && !modal && <div className="err" style={{ marginBottom: 10 }}>{erro}</div>}

      {aba === "estoque" && (<>
        <div className="kpis">
          <div className="kpi"><small>Itens cadastrados</small><b>{ativos.length}</b></div>
          <div className="kpi"><small>Valor em estoque</small><b>{brl(kValor)}</b></div>
          <div className={"kpi " + (kBaixo ? "bad" : "good")}><small>Abaixo do mínimo</small><b>{kBaixo}</b></div>
        </div>
        <div className="bar">
          <div className="busca"><Search size={15} color="#6b7385" /><input placeholder="Buscar item..." value={busca} onChange={e => setBusca(e.target.value)} /></div>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><input type="checkbox" checked={soBaixo} onChange={e => setSoBaixo(e.target.checked)} />Abaixo do mínimo</label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><input type="checkbox" checked={verInativos} onChange={e => setVerInativos(e.target.checked)} />Inativos</label>
        </div>
        {grupoSel && (
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={() => setGrupoAberto(null)}>← Todos os itens</button>
            <Folder size={16} color="#d97706" /><strong style={{ fontSize: 16 }}>{grupoSel.nome}</strong>
            {!admin && <button className="btn sm" onClick={() => abrirGrupo(grupoSel)}><Pencil size={13} /> Renomear / excluir grupo</button>}
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Item</th><th>Grupo</th><th>Em estoque</th><th className="hide-m">Valor un. / total</th>{!admin && <th></th>}</tr></thead>
            <tbody>
              {gruposTabela.map(g => {
                const r = resumoGrupo(g);
                return (
                  <tr key={g.id} style={{ cursor: "pointer" }} onClick={() => setGrupoAberto(g.id)}>
                    <td><Folder size={15} color="#d97706" style={{ verticalAlign: "-2px" }} /> <b>{g.nome}</b></td>
                    <td className="muted">{r.n} {r.n === 1 ? "item" : "itens"}</td>
                    <td>{r.baixo ? <span className="pill falta">{r.baixo} abaixo do mínimo</span> : <span className="pill ok">OK</span>}</td>
                    <td className="hide-m">{brl(r.total)}</td>
                    {!admin && <td />}
                  </tr>
                );
              })}
              {itensTabela.map(i => (
                <tr key={i.id} style={i.ativo ? undefined : { opacity: .5 }}>
                  <td><b>{i.nome}</b>{!i.ativo && <span className="badge off" style={{ marginLeft: 6 }}>inativo</span>}</td>
                  <td className="muted">{i.grupo_id ? <><Folder size={11} /> {nomeGrupo(i.grupo_id)}</> : "—"}</td>
                  <td>{qtd(i.saldo)} {i.unidade} {i.baixo && <span className="pill falta">abaixo do mínimo</span>}</td>
                  <td className="hide-m">{brl(i.valor)}</td>
                  {!admin && <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn sm" title="Entrada" onClick={() => abrirMov("entrada", i)}><ArrowDownToLine size={13} /></button>{" "}
                    <button className="btn sm" title="Saída" onClick={() => abrirMov("saida", i)}><ArrowUpFromLine size={13} /></button>{" "}
                    <button className="btn sm" title="Editar" onClick={() => abrirItem(i)}><Pencil size={13} /></button>
                  </td>}
                </tr>
              ))}
              {itensTabela.length === 0 && gruposTabela.length === 0 && <tr><td colSpan={5} className="muted">{itens.length ? "Nenhum item encontrado." : admin ? "Nenhum item cadastrado ainda." : "Nenhum item ainda. Clique em \"Novo item\" para começar."}</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}

      {aba === "historico" && (<>
        <div className="bar">
          <div className="busca"><Search size={15} color="#6b7385" /><input placeholder="Buscar item ou observação..." value={hBusca} onChange={e => setHBusca(e.target.value)} /></div>
          <select value={hTipo} onChange={e => setHTipo(e.target.value)}><option value="">Entradas e saídas</option><option value="entrada">Só entradas</option><option value="saida">Só saídas</option></select>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>de<input type="date" value={hDe} onChange={e => setHDe(e.target.value)} /></label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>até<input type="date" value={hAte} onChange={e => setHAte(e.target.value)} /></label>
        </div>
        {dias.map(([dia, ms]) => {
          const ent = ms.filter(m => m.tipo === "entrada").length, sai = ms.length - ent;
          return (
            <div key={dia}>
              <div className="diah"><b>{diaExtenso(dia)}</b><span className="muted">{ent > 0 && `${ent} ${ent === 1 ? "entrada" : "entradas"}`}{ent > 0 && sai > 0 && " · "}{sai > 0 && `${sai} ${sai === 1 ? "saída" : "saídas"}`}</span></div>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <tbody>
                    {ms.map(m => { const it = nome(m.item_id); return (
                      <tr key={m.id}>
                        <td style={{ width: 52 }} className="muted">{m.created_at ? new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}</td>
                        <td><b>{it?.nome || "—"}</b></td>
                        <td><span className={"badge " + (m.tipo === "entrada" ? "ok" : "")}>{m.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
                        <td>{m.tipo === "entrada" ? "+" : "−"}{qtd(m.quantidade)} {it?.unidade}</td>
                        <td className="hide-m muted">{m.observacao}</td>
                        {!admin && <td><button className="btn sm" onClick={() => desfazer(m)}>Desfazer</button></td>}
                      </tr>); })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {dias.length === 0 && <p className="muted">{movs.length ? "Nada encontrado com esses filtros." : "Sem movimentações ainda."}</p>}
      </>)}

      {modal?.tipo === "item" && (
        <div className="modal-bg"><form onSubmit={salvarItem} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>{f.id ? "Editar item" : "Novo item do almoxarifado"}</h2>
          <label>Nome do item<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Cola 18kg, Espuma D28, Grampo..." autoFocus /></label>
          <label>Grupo (opcional)
            <select value={f.grupo} onChange={e => setF({ ...f, grupo: e.target.value })}>
              <option value="">Sem grupo</option>
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              <option value="__novo">+ Criar novo grupo...</option>
            </select>
          </label>
          {f.grupo === "__novo" && <input placeholder="Nome do novo grupo (ex.: Tecido, Espuma)" value={f.novoGrupo} onChange={e => setF({ ...f, novoGrupo: e.target.value })} />}
          <label>Unidade de medida
            <select value={f.un} onChange={e => setF({ ...f, un: e.target.value })}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}<option value="__outra">Outra...</option>
            </select>
          </label>
          {f.un === "__outra" && <input placeholder="Digite a unidade" value={f.outra} onChange={e => setF({ ...f, outra: e.target.value })} />}
          <div className="row">
            <label style={{ flex: 1 }}>Valor unitário (R$)<input type="number" step="any" min="0" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></label>
            <label style={{ flex: 1 }}>Estoque mínimo<input type="number" step="any" min="0" value={f.minimo} onChange={e => setF({ ...f, minimo: e.target.value })} /></label>
          </div>
          {f.id && <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={f.ativo} onChange={e => setF({ ...f, ativo: e.target.checked })} />Item ativo (aparece para as terceirizadas)</label>}
          {erro && <div className="err">{erro}</div>}
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button></div>
        </form></div>
      )}

      {modal?.tipo === "xml" && xml && (
        <div className="modal-bg"><div className="card modal wide" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Entrada por XML da nota fiscal</h2>
          {xml.etapa === "arquivo" && (<>
            <p className="muted" style={{ margin: 0 }}>Escolha o arquivo XML da NF-e (o mesmo que vem do fornecedor). O sistema lê os itens e você confere antes de lançar no estoque.</p>
            <input type="file" accept=".xml,text/xml,application/xml" onChange={escolherXml} />
            {erro && <div className="err">{erro}</div>}
            <div className="row"><button type="button" className="btn" onClick={() => { setModal(null); setXml(null); }}>Cancelar</button></div>
          </>)}
          {xml.etapa === "revisao" && (<>
            <div style={{ background: "#f7f9ff", borderRadius: 10, padding: 10, fontSize: 14 }}>
              <b>{xml.meta.emitente || "Fornecedor"}</b><br />
              NF-e nº {xml.meta.numero}{xml.meta.emissao && ` · emitida em ${fmtData(xml.meta.emissao)}`} · total {brl(xml.meta.total)}
            </div>
            <label>Data da entrada no estoque<input type="date" value={xml.data} onChange={e => setXml({ ...xml, data: e.target.value })} /></label>
            {xml.linhas.map(l => (
              <div key={l.k} className={"xl" + (l.incl ? "" : " off")}>
                <label style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <input type="checkbox" checked={l.incl} onChange={e => setLn(l.k, { incl: e.target.checked })} style={{ marginTop: 3 }} />
                  <span><b>{l.desc}</b><br /><span className="muted">{qtd(l.q)} {l.un} × {brl(l.vu)} = {brl(l.q * l.vu)}{l.cprod && ` · cód. ${l.cprod}`}</span></span>
                </label>
                {l.incl && (<>
                  <select value={l.sel} onChange={e => setLn(l.k, { sel: e.target.value })}>
                    <option value="__novo">+ Cadastrar como item novo</option>
                    {itens.filter(i => i.ativo).map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                  </select>
                  {l.sel === "__novo" && (
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      <input style={{ flex: "2 1 180px" }} value={l.novoNome} onChange={e => setLn(l.k, { novoNome: e.target.value })} placeholder="Nome do item" />
                      <input style={{ width: 80 }} value={l.novoUn} onChange={e => setLn(l.k, { novoUn: e.target.value })} placeholder="Unid." />
                      <select style={{ flex: "1 1 130px" }} value={l.novoGrupo} onChange={e => setLn(l.k, { novoGrupo: e.target.value })}>
                        <option value="">Sem grupo</option>{grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                      </select>
                    </div>
                  )}
                  {l.sel !== "__novo" && itens.find(i => i.id === l.sel) && l.un && unXml(l.un) !== itens.find(i => i.id === l.sel).unidade &&
                    <div style={{ color: "#92400e", fontSize: 12 }}>Atenção: a nota está em "{l.un}" e o item está em "{itens.find(i => i.id === l.sel).unidade}". Confira se a quantidade serve.</div>}
                </>)}
              </div>
            ))}
            {erro && <div className="err">{erro}</div>}
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={lancarXml}>{busy ? "Lançando..." : `Lançar ${xml.linhas.filter(l => l.incl).length} ${xml.linhas.filter(l => l.incl).length === 1 ? "item" : "itens"} no estoque`}</button>
              <button type="button" className="btn" onClick={() => { setModal(null); setXml(null); }}>Cancelar</button>
            </div>
          </>)}
        </div></div>
      )}

      {modal?.tipo === "grupo" && (
        <div className="modal-bg"><form onSubmit={salvarGrupo} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>{f.gid ? "Renomear grupo" : "Novo grupo"}</h2>
          <label>Nome do grupo<input value={f.gnome} onChange={e => setF({ ...f, gnome: e.target.value })} placeholder="Ex.: Tecido, Espuma, Ferragens" autoFocus /></label>
          {erro && <div className="err">{erro}</div>}
          <div className="row">
            <button className="btn primary" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
            <button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button>
            {f.gid && <button type="button" className="btn" style={{ marginLeft: "auto", color: "#b42318" }} onClick={excluirGrupo}>Excluir grupo</button>}
          </div>
        </form></div>
      )}

      {(modal?.tipo === "entrada" || modal?.tipo === "saida") && (
        <div className="modal-bg"><form onSubmit={salvarMov} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>{modal.tipo === "entrada" ? "Entrada de material" : "Saída de material"}</h2>
          <label>Item
            <select value={f.item_id} onChange={e => { const i = nome(e.target.value); setF({ ...f, item_id: e.target.value, valor: modal.tipo === "entrada" && i ? String(i.valor) : f.valor }); }}>
              <option value="">— escolha —</option>
              {itens.filter(i => i.ativo).map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
            </select>
          </label>
          <label>Quantidade{itemForm ? ` (${itemForm.unidade})` : ""}<input type="number" step="any" min="0" value={f.qtd} onChange={e => setF({ ...f, qtd: e.target.value })} /></label>
          {modal.tipo === "saida" && itemForm && <div className="muted">Em estoque: {qtd(linhas.find(l => l.id === itemForm.id)?.saldo)} {itemForm.unidade}</div>}
          {modal.tipo === "entrada" && <label>Valor unitário pago (R$) — atualiza o valor do item<input type="number" step="any" min="0" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></label>}
          <label>Data<input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
          <label>Observação (opcional)<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} placeholder={modal.tipo === "saida" ? "Ex.: entregue para a terceirizada X" : ""} /></label>
          {erro && <div className="err">{erro}</div>}
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Salvando..." : modal.tipo === "entrada" ? "Registrar entrada" : "Registrar saída"}</button><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button></div>
        </form></div>
      )}
    </div>
  );
}
