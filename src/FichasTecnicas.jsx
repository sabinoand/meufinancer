import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, Printer, ArrowLeft, Copy, Check, AlertTriangle } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const num = (v) => parseFloat(String(v).replace(",", "."));
const qtd = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const UNID = ["un", "m", "m²", "kg", "g", "L", "mL", "rolo", "lata", "pacote", "par", "folha"];
const TIPOS = { tecido: "Tecido", espuma: "Espuma", estrutura: "Estrutura", cola: "Cola", outro: "Outro" };
const ORIGEM = { almoxarifado: "Almoxarifado Cel", externa: "Compra externa" };
const origemPadrao = (t) => (t === "espuma" || t === "estrutura") ? "externa" : "almoxarifado";
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const corTxt = (c) => c ? `Tecido ${c.numero}${c.nome ? " – " + c.nome : ""}` : "—";

const css = `
.subtabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #eceef3}
.subtabs button{border:0;background:none;padding:9px 14px;cursor:pointer;font-size:14px;color:#6b7385;border-bottom:2px solid transparent}
.subtabs button.on{color:#1d4ed8;border-color:#1d4ed8;font-weight:600}
.cadrow{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #eceef3;border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer;background:#fff}
.cadrow:hover{border-color:#1d4ed8;background:#f7f9ff}
.pill{font-size:12px;padding:2px 9px;border-radius:99px;white-space:nowrap}
.pill.falta{background:#fee2e2;color:#991b1b}.pill.ok{background:#dcfce7;color:#166534}.pill.cinza{background:#e8ebf2;color:#4a5367}
.folha{border:1px solid #d5d9e2;border-radius:10px;padding:16px;background:#fff;margin-top:14px}
.folha h3{margin:0;font-size:13px;letter-spacing:.06em;color:#4a5367}
.folha h1{margin:2px 0 8px}
.linha{border:1px solid #eceef3;border-radius:10px;padding:10px;background:#fff;display:grid;gap:8px}
.wide{max-width:560px !important;max-height:92vh;overflow-y:auto}
.chk{display:flex;gap:8px;align-items:center;border:1px solid #eceef3;border-radius:10px;padding:8px 12px;margin-bottom:6px}
.pre{white-space:pre-wrap;background:#f7f9ff;border-radius:8px;padding:10px;font-size:13px}
@media print{body *{visibility:hidden}.print-area,.print-area *{visibility:visible}.print-area{position:absolute;left:0;top:0;width:100%;border:0}.no-print{display:none !important}}
`;

export default function FichasTecnicas({ perfil, secao }) {
  const aba = secao || "fichas";
  const [cadeiras, setCadeiras] = useState([]);
  const [fichas, setFichas] = useState([]);
  const [pecas, setPecas] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedItens, setPedItens] = useState([]);
  const [cores, setCores] = useState([]);
  const [almoxItens, setAlmoxItens] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({});
  const [marcados, setMarcados] = useState(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState("");

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("cadeiras").select("*").order("nome"),
      supabase.from("fichas").select("*"),
      supabase.from("ficha_pecas").select("*").order("numero").order("created_at"),
      supabase.from("materias").select("*").order("nome"),
      supabase.from("materia_grupos").select("*").order("nome"),
      supabase.from("materia_saldo").select("*"),
      supabase.from("pedidos").select("*").in("status", ["aberto", "parcial"]).order("data_entrega"),
      supabase.from("pedido_itens").select("*"),
      supabase.from("cores").select("*"),
      supabase.from("almox_itens").select("*").order("nome"),
      supabase.from("empresas").select("id,nome")
    ]);
    const er = rs.find(r => r.error);
    if (er) return setErro(er.error.message);
    setCadeiras(rs[0].data); setFichas(rs[1].data); setPecas(rs[2].data); setMaterias(rs[3].data); setGrupos(rs[4].data);
    setSaldos(rs[5].data); setPedidos(rs[6].data); setPedItens(rs[7].data); setCores(rs[8].data); setAlmoxItens(rs[9].data);
    setEmpresa(rs[10].data.find(e => e.id === perfil.empresa_id) || null);
  }, [perfil.empresa_id]);
  useEffect(() => { carregar(); }, [carregar]);

  const fichaDe = (cid) => fichas.find(x => x.cadeira_id === cid);
  const pecasDe = (cid) => { const fi = fichaDe(cid); return fi ? pecas.filter(p => p.ficha_id === fi.id) : []; };
  const cadSel = sel && cadeiras.find(c => c.id === sel);
  const fichaSel = cadSel && fichaDe(cadSel.id);
  const pecasSel = cadSel ? pecasDe(cadSel.id) : [];
  const saldoDe = (mid) => Number(saldos.find(s => s.materia_id === mid)?.saldo || 0);
  const mat = (id) => materias.find(m => m.id === id);

  async function garantirFicha(cadeira_id, por_caixa) {
    const ex = fichaDe(cadeira_id);
    if (ex) return ex;
    const { data, error } = await supabase.from("fichas").insert({ empresa_id: perfil.empresa_id, cadeira_id, por_caixa: por_caixa || 1 }).select().single();
    if (error) throw error;
    return data;
  }
  function abrirPeca(p) {
    setF(p ? { id: p.id, nome: p.nome, tipo: p.tipo, materia_id: p.materia_id || "", qtd: String(p.quantidade), un: p.unidade, origem: p.origem, fornecedor: p.fornecedor || "", obs: p.observacao || "" }
           : { nome: "", tipo: "espuma", materia_id: "", qtd: "", un: "un", origem: "externa", fornecedor: "", obs: "" });
    setErro(""); setModal({ tipo: "peca" });
  }
  function mudarTipo(t) { setF(x => ({ ...x, tipo: t, origem: origemPadrao(t), un: t === "tecido" ? "m" : x.un, materia_id: t === "tecido" ? "" : x.materia_id })); }
  function escolherMateria(id) { const m = mat(id); setF(x => ({ ...x, materia_id: id, un: m ? m.unidade : x.un, nome: x.nome || (m ? m.nome : "") })); }

  async function salvarPeca(e) {
    e.preventDefault();
    const q = num(f.qtd);
    if (!f.nome.trim()) return setErro("Dê um nome para a peça.");
    if (!q || q <= 0) return setErro("Informe a quantidade por caixa.");
    if (!f.un) return setErro("Informe a unidade.");
        setBusy(true);
    try {
      const fi = await garantirFicha(cadSel.id);
      const dados = { nome: f.nome.trim(), tipo: f.tipo, materia_id: f.tipo === "tecido" ? null : (f.materia_id || null), quantidade: q, unidade: f.un, origem: f.origem,
        fornecedor: f.origem === "externa" ? (f.fornecedor.trim() || null) : null, observacao: f.obs.trim() || null };
      const { error } = f.id
        ? await supabase.from("ficha_pecas").update(dados).eq("id", f.id)
        : await supabase.from("ficha_pecas").insert({ ...dados, ficha_id: fi.id, empresa_id: perfil.empresa_id, numero: pecas.filter(p => p.ficha_id === fi.id).length + 1 });
      if (error) throw error;
      setModal(null); carregar();
    } catch (er) { setErro(er.message); }
    setBusy(false);
  }
  async function excluirPeca(p) {
    if (!confirm(`Remover a peça "${p.nome}" da ficha?`)) return;
    const { error } = await supabase.from("ficha_pecas").delete().eq("id", p.id);
    if (error) setErro(error.message); else carregar();
  }

  // ---------- cálculo ----------
  const marcadosEf = marcados || pedidos.map(p => p.id);
  const calc = useMemo(() => {
    const linhas = new Map(); const semFicha = new Set(); let cadeirasTot = 0;
    for (const ped of pedidos.filter(p => marcadosEf.includes(p.id))) {
      for (const it of pedItens.filter(i => i.pedido_id === ped.id)) {
        const rest = it.caixas - it.caixas_recebidas; if (rest <= 0) continue;
        const cad = cadeiras.find(c => c.id === it.cadeira_id); const fi = fichaDe(it.cadeira_id);
        const ps = fi ? pecas.filter(p => p.ficha_id === fi.id) : [];
        if (!fi || !ps.length) { semFicha.add(cad?.nome || "?"); continue; }
        const nCad = rest; cadeirasTot += nCad;
        const cor = cores.find(c => c.id === it.cor_id);
        for (const p of ps) {
          const q = nCad * Number(p.quantidade);
          let chave, rotulo, materia = null;
          if (p.tipo === "tecido") {
            chave = `T|${cor?.id}|${p.unidade}`; rotulo = corTxt(cor);
            const re = cor ? new RegExp(`(^|\\D)${String(cor.numero).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\D|$)`) : null;
            materia = re ? materias.find(m => m.ativo && re.test(m.nome)) : null;
          } else {
            chave = p.materia_id ? `M|${p.materia_id}` : `N|${norm(p.nome)}|${p.unidade}`;
            rotulo = p.materia_id ? (mat(p.materia_id)?.nome || p.nome) : p.nome; materia = p.materia_id ? mat(p.materia_id) : null;
          }
          const l = linhas.get(chave) || { chave, rotulo, numero: p.tipo === "tecido" ? cor?.numero : null, tipo: p.tipo, un: p.unidade, origem: p.origem, fornecedor: p.fornecedor, materia, necessario: 0, usos: new Set() };
          l.necessario += q; l.usos.add(`${cad?.nome} (${nCad} cx)`); linhas.set(chave, l);
        }
      }
    }
    const lista = [...linhas.values()].map(l => {
      const saldo = l.materia ? saldoDe(l.materia.id) : 0;
      return { ...l, saldo, falta: Math.max(l.necessario - saldo, 0), vinculado: !!l.materia };
    }).sort((a, b) => (b.falta > 0) - (a.falta > 0) || a.rotulo.localeCompare(b.rotulo));
    return { lista, semFicha: [...semFicha], cadeirasTot };
  }, [pedidos, pedItens, marcadosEf, cadeiras, fichas, pecas, cores, materias, saldos]);

  const faltasAlmox = calc.lista.filter(l => l.falta > 0 && l.origem === "almoxarifado");
  const faltasExt = calc.lista.filter(l => l.falta > 0 && l.origem === "externa");
  const reNum = (n) => new RegExp(`(^|\\D)${String(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\D|$)`);
  const casaAlmox = (l) => almoxItens.find(a => a.ativo && norm(a.nome) === norm(l.materia?.nome || l.rotulo))
    || (l.numero ? almoxItens.find(a => a.ativo && reNum(l.numero).test(a.nome)) : null);
  const comMatch = faltasAlmox.filter(casaAlmox), semMatch = faltasAlmox.filter(l => !casaAlmox(l));
  const textoCompra = useMemo(() => {
    const por = new Map();
    faltasExt.forEach(l => { const k = l.fornecedor || "Fornecedor não informado"; por.set(k, [...(por.get(k) || []), l]); });
    return [...por.entries()].map(([forn, ls]) => `PEDIDO DE COMPRA — ${forn}${empresa ? ` (${empresa.nome})` : ""}\n` + ls.map(l => `• ${l.rotulo}: ${qtd(Math.ceil(l.falta * 1000) / 1000)} ${l.un}`).join("\n"));
  }, [faltasExt, empresa]);

  function abrirSolicitar() { setF({ tipo: "coleta", obs: "Material para os pedidos: " + pedidos.filter(p => marcadosEf.includes(p.id)).map(p => "#" + p.numero).join(", ") }); setErro(""); setModal({ tipo: "solicitar" }); }
  async function enviarSolicitacao(e) {
    e.preventDefault(); setBusy(true); setErro("");
    const { error } = await supabase.rpc("criar_solicitacao", {
      p_tipo: f.tipo, p_data: null, p_obs: f.obs,
      p_itens: comMatch.map(l => ({ item_id: casaAlmox(l).id, quantidade: Math.ceil(l.falta * 1000) / 1000 }))
    });
    setBusy(false);
    if (error) return setErro(error.message);
    setModal(null); setOk("Solicitação enviada ao almoxarife! Acompanhe na aba Solicitações."); setTimeout(() => setOk(""), 7000);
  }
  async function copiar(txt, k) { try { await navigator.clipboard.writeText(txt); setCopiado(k); setTimeout(() => setCopiado(""), 2000); } catch { setErro("Não consegui copiar. Selecione o texto e copie manualmente."); } }

  const gruposMat = [...new Set(materias.filter(m => m.ativo).map(m => m.grupo_id || ""))];
  const nomeGr = (id) => grupos.find(g => g.id === id)?.nome || "Sem grupo";

  // ---------- telas ----------
  if (cadSel) {
    return (
      <div className="card">
        <style>{css}</style>
        <div className="row no-print" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <button className="btn sm" onClick={() => { setSel(null); setErro(""); }}><ArrowLeft size={14} /> Fichas</button>
          <div className="row">
            <button className="btn" onClick={() => window.print()} disabled={!pecasSel.length}><Printer size={14} /> Imprimir ficha</button>
            <button className="btn primary" onClick={() => abrirPeca(null)}><Plus size={14} /> Adicionar peça</button>
          </div>
        </div>
        {erro && !modal && <div className="err no-print" style={{ marginBottom: 10 }}>{erro}</div>}
        <div className="folha print-area">
          <h3>COMPOSIÇÃO DA CAIXA{empresa ? ` · ${empresa.nome.toUpperCase()}` : ""}</h3>
          <h1>{cadSel.nome}</h1>
          <div className="muted">Composição de 1 caixa · {pecasSel.length} {pecasSel.length === 1 ? "peça" : "peças"}</div>
          {pecasSel.length === 0 && <p className="muted no-print">Ainda não há peças. Clique em "Adicionar peça" (tecido, espuma do assento, espuma do encosto, estrutura, cola...) — tudo por caixa.</p>}
          {pecasSel.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table>
                <thead><tr><th>Nº</th><th>Peça</th><th>Por caixa</th><th>Origem</th><th>Item do estoque</th><th className="no-print"></th></tr></thead>
                <tbody>
                  {pecasSel.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td><b>{p.nome}</b><div className="muted">{TIPOS[p.tipo]}</div></td>
                      <td>{qtd(p.quantidade)} {p.unidade}</td>
                      <td>{ORIGEM[p.origem]}{p.fornecedor && <div className="muted">{p.fornecedor}</div>}</td>
                      <td>{p.tipo === "tecido" ? <span className="muted">conforme o tecido do pedido</span> : p.materia_id ? mat(p.materia_id)?.nome : <span className="pill falta">sem vínculo</span>}</td>
                      <td className="no-print" style={{ whiteSpace: "nowrap" }}>
                        <button className="btn sm" onClick={() => abrirPeca(p)}><Pencil size={13} /></button>{" "}
                        <button className="btn sm" onClick={() => excluirPeca(p)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {modal?.tipo === "peca" && (
          <div className="modal-bg"><form onSubmit={salvarPeca} className="card modal wide" style={{ display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0 }}>{f.id ? "Editar peça" : "Nova peça"} — {cadSel.nome}</h2>
            <label>Tipo
              <select value={f.tipo} onChange={e => mudarTipo(e.target.value)}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label>Nome da peça<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Espuma do assento D23, Estrutura, Tecido, Cola" autoFocus /></label>
            {f.tipo === "tecido"
              ? <div className="muted">O tecido (número e cor) vem do pedido. O sistema procura no seu estoque o item que tenha o número do tecido no nome (ex.: "TECIDO 168").</div>
              : <label>Item do seu estoque de matéria-prima
                  <select value={f.materia_id} onChange={e => escolherMateria(e.target.value)}>
                    <option value="">— sem vínculo (não compara com o estoque) —</option>
                    {gruposMat.map(g => <optgroup key={g || "_"} label={nomeGr(g)}>{materias.filter(m => m.ativo && (m.grupo_id || "") === g).map(m => <option key={m.id} value={m.id}>{m.nome} ({m.unidade})</option>)}</optgroup>)}
                  </select>
                </label>}
            <div className="row">
              <label style={{ flex: 1 }}>Quantidade por caixa<input type="number" step="any" min="0" value={f.qtd} onChange={e => setF({ ...f, qtd: e.target.value })} placeholder="Ex.: 1,2" /></label>
              <label style={{ width: 110 }}>Unidade
                <select value={f.un} onChange={e => setF({ ...f, un: e.target.value })} disabled={!!f.materia_id}>{[...new Set([...UNID, f.un])].map(u => <option key={u} value={u}>{u}</option>)}</select>
              </label>
            </div>
            <label>De onde vem?
              <select value={f.origem} onChange={e => setF({ ...f, origem: e.target.value })}>{Object.entries(ORIGEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            {f.origem === "externa" && <label>Fornecedor (opcional — agrupa o pedido de compra)<input value={f.fornecedor} onChange={e => setF({ ...f, fornecedor: e.target.value })} placeholder="Ex.: fornecedor de espuma" /></label>}
            {erro && <div className="err">{erro}</div>}
            <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button></div>
          </form></div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <style>{css}</style>
      <h2 style={{ margin: 0 }}>Fichas técnicas</h2>
      <div className="muted">Composição de cada caixa e cálculo do material dos pedidos</div>
      
      {erro && <div className="err" style={{ marginBottom: 10 }}>{erro}</div>}
      {ok && <div style={{ background: "#dcfce7", color: "#166534", padding: "8px 12px", borderRadius: 8, marginBottom: 10, fontSize: 14 }}>{ok}</div>}

      {aba === "fichas" && (<>
        {cadeiras.filter(c => c.ativo).map(c => {
          const n = pecasDe(c.id).length, fi = fichaDe(c.id);
          return (
            <div key={c.id} className="cadrow" onClick={() => { setSel(c.id); setErro(""); }}>
              <div><b>{c.nome}</b><div className="muted">{n ? `${n} ${n === 1 ? "peça" : "peças"} na composição` : "Sem ficha ainda"}</div></div>
              <span className={"pill " + (n ? "ok" : "cinza")}>{n ? "Ficha pronta" : "Montar ficha"}</span>
            </div>
          );
        })}
        {!cadeiras.filter(c => c.ativo).length && <p className="muted">Nenhuma cadeira cadastrada ainda. As cadeiras aparecem aqui quando a Cel as cadastra em um pedido.</p>}
      </>)}

      {aba === "calcular" && (<>
        <p className="muted" style={{ marginTop: 0 }}>Escolha os pedidos em aberto. O sistema calcula o material do que ainda falta chegar (caixas pedidas menos as já recebidas) e compara com o seu estoque.</p>
        {!pedidos.length && <p className="muted">Nenhum pedido em aberto.</p>}
        {pedidos.map(p => {
          const its = pedItens.filter(i => i.pedido_id === p.id);
          return (
            <label key={p.id} className="chk" style={{ flexDirection: "row" }}>
              <input type="checkbox" checked={marcadosEf.includes(p.id)} onChange={e => setMarcados(e.target.checked ? [...marcadosEf, p.id] : marcadosEf.filter(x => x !== p.id))} />
              <span><b>Pedido #{p.numero}</b> · entrega {fmtData(p.data_entrega)}<span className="muted"> · {its.map(i => `${cadeiras.find(c => c.id === i.cadeira_id)?.nome} ${corTxt(cores.find(c => c.id === i.cor_id)).replace("Tecido ", "")} (${i.caixas - i.caixas_recebidas} cx)`).join(", ")}</span></span>
            </label>
          );
        })}

        {calc.semFicha.length > 0 && <div className="err" style={{ margin: "10px 0" }}><AlertTriangle size={14} /> Sem ficha técnica (não entram no cálculo): {calc.semFicha.join(", ")}</div>}

        {calc.lista.length > 0 && (<>
          <h3 style={{ margin: "16px 0 6px" }}>Material necessário — {calc.cadeirasTot} caixas</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Material</th><th>Precisa</th><th>No estoque</th><th>Falta</th><th>Origem</th></tr></thead>
              <tbody>
                {calc.lista.map(l => (
                  <tr key={l.chave}>
                    <td><b>{l.rotulo}</b><div className="muted" style={{ fontSize: 12 }}>{[...l.usos].join(" · ")}</div>
                      {!l.vinculado && <div style={{ fontSize: 12, color: "#92400e" }}>sem item no estoque{l.tipo === "tecido" ? " com o número deste tecido" : " vinculado"}</div>}</td>
                    <td>{qtd(l.necessario)} {l.un}</td>
                    <td>{l.vinculado ? `${qtd(l.saldo)} ${l.un}` : "—"}</td>
                    <td>{l.falta > 0 ? <span className="pill falta">{qtd(Math.ceil(l.falta * 1000) / 1000)} {l.un}</span> : <span className="pill ok">Ok</span>}</td>
                    <td>{ORIGEM[l.origem]}{l.fornecedor && <div className="muted">{l.fornecedor}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {faltasAlmox.length > 0 && (
            <div className="linha" style={{ marginTop: 14 }}>
              <b>Falta material que o almoxarife da Cel fornece</b>
              <div className="muted">{faltasAlmox.map(l => `${l.rotulo}: ${qtd(Math.ceil(l.falta * 1000) / 1000)} ${l.un}`).join(" · ")}</div>
              {semMatch.length > 0 && <div style={{ color: "#92400e", fontSize: 13 }}>Não estão no catálogo do almoxarife (peça para ele cadastrar): {semMatch.map(l => l.rotulo).join(", ")}</div>}
              <div><button className="btn primary" disabled={!comMatch.length} onClick={abrirSolicitar}>Gerar solicitação ao almoxarife ({comMatch.length} {comMatch.length === 1 ? "item" : "itens"})</button></div>
            </div>
          )}
          {textoCompra.map((t, i) => (
            <div className="linha" key={i} style={{ marginTop: 10 }}>
              <div className="pre">{t}</div>
              <div><button className="btn sm" onClick={() => copiar(t, i)}>{copiado === i ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar para enviar ao fornecedor</>}</button></div>
            </div>
          ))}
          {faltasAlmox.length === 0 && faltasExt.length === 0 && <div className="pill ok" style={{ display: "inline-block", marginTop: 12 }}>Tudo que os pedidos precisam está no estoque.</div>}
        </>)}
      </>)}

      {modal?.tipo === "solicitar" && (
        <div className="modal-bg"><form onSubmit={enviarSolicitacao} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Solicitar ao almoxarife</h2>
          <div className="muted">{comMatch.map(l => `${l.rotulo}: ${qtd(Math.ceil(l.falta * 1000) / 1000)} ${l.un}`).join(" · ")}</div>
          <label>Como vai receber?
            <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="coleta">Solicitar coleta (eu busco)</option><option value="entrega">Mandar entregar</option></select>
          </label>
          <label>Observação<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
          {erro && <div className="err">{erro}</div>}
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Enviando..." : "Enviar solicitação"}</button><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button></div>
        </form></div>
      )}
    </div>
  );
}
