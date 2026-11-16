import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, X, ArrowDownToLine, ArrowUpFromLine, Plus, Pencil, Folder, FolderPlus } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const UNIDADES = ["un", "m", "m²", "kg", "g", "L", "mL", "rolo", "pacote", "caixa", "par", "folha", "metro linear"];
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const num = (v) => parseFloat(String(v).replace(",", "."));

const css = `
.subtabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #eceef3}
.subtabs button{border:0;background:none;padding:9px 14px;cursor:pointer;font-size:14px;color:#6b7385;border-bottom:2px solid transparent}
.subtabs button.on{color:#1d4ed8;border-color:#1d4ed8;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.kpi{border-radius:12px;padding:12px 14px;background:#f1f4fb}.kpi small{display:block;color:#6b7385;font-size:12px}.kpi b{font-size:22px}
.kpi.bad{background:#fee2e2}.kpi.bad b{color:#991b1b}.kpi.good{background:#dcfce7}.kpi.good b{color:#166534}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.bar .busca{display:flex;align-items:center;gap:6px;border:1px solid #d5d9e2;border-radius:8px;padding:0 10px;background:#fff;flex:1;min-width:180px}
.bar .busca input{border:0;outline:0;padding:9px 0;flex:1;font-size:14px;min-width:0}
.rowclick{cursor:pointer}.rowclick:hover{background:#f7f9ff}
.pill{font-size:12px;padding:2px 9px;border-radius:99px;white-space:nowrap}
.pill.falta{background:#fee2e2;color:#991b1b}.pill.ok{background:#e8ebf2;color:#4a5367}
.sidep{position:fixed;top:0;right:0;bottom:0;width:min(460px,100%);background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.15);z-index:60;overflow-y:auto;padding:18px}
.big3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.big3 div{background:#f1f4fb;border-radius:10px;padding:10px;text-align:center}.big3 small{display:block;color:#6b7385;font-size:11px}.big3 b{font-size:18px}
@media(max-width:720px){.kpis{grid-template-columns:1fr}}
`;

export default function MateriaPrima({ perfil }) {
  const admin = perfil.papel === "admin";
  const [aba, setAba] = useState("estoque");
  const [materias, setMaterias] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [grupoAberto, setGrupoAberto] = useState(null);
  const [saldos, setSaldos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [busca, setBusca] = useState("");
  const [fUn, setFUn] = useState("");
  const [soBaixo, setSoBaixo] = useState(false);
  const [soComEstoque, setSoComEstoque] = useState(false);
  const [verInativos, setVerInativos] = useState(false);
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null); // {tipo:"item"|"entrada"|"saida", materia?}
  const [f, setF] = useState({});
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [hTipo, setHTipo] = useState("");
  const [hBusca, setHBusca] = useState("");

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("materias").select("*").order("nome"),
      supabase.from("materia_saldo").select("*"),
      supabase.from("materia_mov").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("empresas").select("id,nome"),
      supabase.from("materia_grupos").select("*").order("nome")
    ]);
    const er = rs.find(r => r.error);
    if (er) return setErro(er.error.message);
    setMaterias(rs[0].data); setSaldos(rs[1].data); setMovs(rs[2].data); setEmpresas(rs[3].data); setGrupos(rs[4].data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const emp = (id) => empresas.find(e => e.id === id)?.nome || "—";
  const nomeMat = (id) => materias.find(m => m.id === id);
  const linhas = useMemo(() => materias.map(m => {
    const saldo = Number(saldos.find(s => s.materia_id === m.id)?.saldo || 0);
    return { ...m, saldo, total: saldo * Number(m.valor), baixo: m.ativo && Number(m.minimo) > 0 && saldo < Number(m.minimo) };
  }), [materias, saldos]);

  const vis = linhas.filter(m => {
    if (!verInativos && !m.ativo) return false;
    const t = busca.trim().toLowerCase();
    if (t && !m.nome.toLowerCase().includes(t)) return false;
    if (fUn && m.unidade !== fUn) return false;
    if (soBaixo && !m.baixo) return false;
    if (soComEstoque && m.saldo <= 0) return false;
    return true;
  });
  const ativos = linhas.filter(m => m.ativo);
  const kValor = ativos.reduce((a, m) => a + m.total, 0);
  const kBaixo = ativos.filter(m => m.baixo).length;
  const unidadesUsadas = [...new Set(materias.map(m => m.unidade))].sort();
  const selM = sel && linhas.find(m => m.id === sel);
  const nomeGrupo = (id) => grupos.find(g => g.id === id)?.nome || "";
  const filtrando = !!(busca.trim() || fUn || soBaixo || soComEstoque);
  const grupoSel = grupoAberto && grupos.find(g => g.id === grupoAberto);
  const resumoGrupo = (g) => {
    const its = linhas.filter(m => m.grupo_id === g.id && m.ativo);
    return { n: its.length, total: its.reduce((a, m) => a + m.total, 0), baixo: its.filter(m => m.baixo).length };
  };
  // o que aparece na tabela: dentro de um grupo, busca/filtro (lista plana) ou grupos + itens sem grupo
  const itensTabela = grupoSel ? vis.filter(m => m.grupo_id === grupoSel.id) : filtrando ? vis : vis.filter(m => !m.grupo_id);
  const gruposTabela = !grupoSel && !filtrando ? grupos.filter(g => !admin || true) : [];

  function abrirItem(m) {
    const un = m && !UNIDADES.includes(m.unidade) ? "__outra" : (m?.unidade || "un");
    setF(m ? { id: m.id, nome: m.nome, un, outra: un === "__outra" ? m.unidade : "", valor: String(m.valor), minimo: String(m.minimo), ativo: m.ativo, grupo: m.grupo_id || "", novoGrupo: "" }
           : { nome: "", un: "un", outra: "", valor: "", minimo: "", ativo: true, grupo: grupoAberto || "", novoGrupo: "" });
    setErro(""); setModal({ tipo: "item" });
  }
  function abrirMov(tipo, m) {
    setF({ materia_id: m?.id || "", qtd: "", valor: tipo === "entrada" && m ? String(m.valor) : "", obs: "", data: hojeIso() });
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
        const { data: g, error: eg } = await supabase.from("materia_grupos").insert({ nome: f.novoGrupo.trim(), empresa_id: perfil.empresa_id }).select().single();
        if (eg) { setBusy(false); return setErro(eg.message); }
        grupo_id = g.id;
      }
    }
    const dados = { nome: f.nome.trim(), unidade, valor, minimo, grupo_id };
    const { error } = f.id
      ? await supabase.from("materias").update({ ...dados, ativo: f.ativo }).eq("id", f.id)
      : await supabase.from("materias").insert({ ...dados, empresa_id: perfil.empresa_id });
    setBusy(false);
    if (error) return setErro(/duplicate|unique/i.test(error.message) ? "Já existe um item com esse nome." : error.message);
    setModal(null); carregar();
  }
  async function salvarMov(e) {
    e.preventDefault();
    const q = num(f.qtd);
    if (!f.materia_id || !q || q <= 0) return setErro("Escolha o item e informe a quantidade.");
    const v = modal.tipo === "entrada" && f.valor !== "" ? num(f.valor) : null;
    if (v !== null && (isNaN(v) || v < 0)) return setErro("Valor inválido.");
    setBusy(true);
    const { error } = await supabase.rpc("movimentar_materia", { p_materia: f.materia_id, p_tipo: modal.tipo, p_qtd: q, p_valor: v, p_obs: f.obs, p_data: f.data || null });
    setBusy(false);
    if (error) return setErro(error.message);
    setModal(null); carregar();
  }
  function abrirGrupo(g) { setF({ gid: g?.id, gnome: g?.nome || "" }); setErro(""); setModal({ tipo: "grupo" }); }
  async function salvarGrupo(e) {
    e.preventDefault();
    if (!f.gnome.trim()) return setErro("Informe o nome do grupo.");
    setBusy(true);
    const { error } = f.gid
      ? await supabase.from("materia_grupos").update({ nome: f.gnome.trim() }).eq("id", f.gid)
      : await supabase.from("materia_grupos").insert({ nome: f.gnome.trim(), empresa_id: perfil.empresa_id });
    setBusy(false);
    if (error) return setErro(/duplicate|unique/i.test(error.message) ? "Já existe um grupo com esse nome." : error.message);
    setModal(null); carregar();
  }
  async function excluirGrupo() {
    const qtdItens = linhas.filter(m => m.grupo_id === f.gid).length;
    if (!confirm(`Excluir o grupo "${f.gnome}"? ${qtdItens ? `Os ${qtdItens} itens dele não serão apagados: ficam sem grupo.` : ""}`)) return;
    const { error } = await supabase.from("materia_grupos").delete().eq("id", f.gid);
    if (error) return setErro(error.message);
    setModal(null); setGrupoAberto(null); carregar();
  }
  async function desfazer(m) {
    if (!confirm("Desfazer este lançamento?")) return;
    const { error } = await supabase.rpc("excluir_materia_mov", { p_id: m.id });
    if (error) setErro(error.message); else { setErro(""); carregar(); }
  }

  const matForm = nomeMat(f.materia_id);

  return (
    <div className="card">
      <style>{css}</style>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h2 style={{ margin: 0 }}>Estoque de matéria-prima</h2><div className="muted">Itens, unidade de medida, valor e movimentações</div></div>
        {!admin && <div className="row"><button className="btn" onClick={() => abrirGrupo(null)}><FolderPlus size={14} /> Novo grupo</button><button className="btn primary" onClick={() => abrirItem(null)}><Plus size={14} /> Novo item</button></div>}
      </div>
      <div className="subtabs" style={{ marginTop: 12 }}>
        <button className={aba === "estoque" ? "on" : ""} onClick={() => setAba("estoque")}>Estoque</button>
        <button className={aba === "historico" ? "on" : ""} onClick={() => setAba("historico")}>Histórico</button>
      </div>
      {erro && !modal && <div className="err" style={{ marginBottom: 10 }}>{erro}</div>}

      {aba === "estoque" && (
        <>
          <div className="kpis">
            <div className="kpi"><small>Itens cadastrados</small><b>{ativos.length}</b></div>
            <div className="kpi"><small>Valor em estoque</small><b>{brl(kValor)}</b></div>
            <div className={"kpi " + (kBaixo ? "bad" : "good")}><small>Abaixo do mínimo</small><b>{kBaixo}</b></div>
          </div>
          <div className="bar">
            <div className="busca"><Search size={15} color="#6b7385" /><input placeholder="Buscar item..." value={busca} onChange={e => setBusca(e.target.value)} /></div>
            <select value={fUn} onChange={e => setFUn(e.target.value)}><option value="">Todas as unidades</option>{unidadesUsadas.map(u => <option key={u} value={u}>{u}</option>)}</select>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><input type="checkbox" checked={soBaixo} onChange={e => setSoBaixo(e.target.checked)} />Abaixo do mínimo</label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><input type="checkbox" checked={soComEstoque} onChange={e => setSoComEstoque(e.target.checked)} />Só com estoque</label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><input type="checkbox" checked={verInativos} onChange={e => setVerInativos(e.target.checked)} />Inativos</label>
          </div>
          {grupoSel && (
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn sm" onClick={() => setGrupoAberto(null)}>← Todos os itens</button>
              <Folder size={16} color="#d97706" /><strong style={{ fontSize: 16 }}>{grupoSel.nome}</strong>
              {!admin && <button className="btn sm" onClick={() => abrirGrupo(grupoSel)}><Pencil size={13} /> Renomear / excluir grupo</button>}
            </div>
          )}
          {!itensTabela.length && !gruposTabela.length && <p className="muted">{grupoSel ? "Nenhum item neste grupo." : "Nenhum item."} {!admin && "Use “+ Novo item” para cadastrar."}</p>}
          <div style={{ overflowX: "auto" }}>
            {(!!itensTabela.length || !!gruposTabela.length) && (
              <table>
                <thead><tr><th>Item</th>{admin && <th>Empresa</th>}<th>Unidade</th><th style={{ textAlign: "right" }}>Valor unit.</th><th style={{ textAlign: "right" }}>Em estoque</th><th style={{ textAlign: "right" }}>Valor em estoque</th><th>Situação</th>{!admin && <th></th>}</tr></thead>
                <tbody>
                  {gruposTabela.map(g => {
                    const r = resumoGrupo(g);
                    return (
                      <tr key={g.id} className="rowclick" onClick={() => setGrupoAberto(g.id)}>
                        <td><Folder size={15} color="#d97706" style={{ verticalAlign: "-2px" }} /> <strong>{g.nome}</strong></td>
                        {admin && <td>{emp(g.empresa_id)}</td>}
                        <td className="muted">{r.n} {r.n === 1 ? "item" : "itens"}</td><td></td><td></td>
                        <td style={{ textAlign: "right" }}>{brl(r.total)}</td>
                        <td>{r.baixo ? <span className="pill falta">{r.baixo} abaixo do mínimo</span> : <span className="pill ok">OK</span>}</td>
                        {!admin && <td />}
                      </tr>
                    );
                  })}
                  {itensTabela.map(m => (
                    <tr key={m.id} className="rowclick" onClick={() => setSel(m.id)} style={m.ativo ? undefined : { opacity: .5 }}>
                      <td><strong>{m.nome}</strong>{!m.ativo && <span className="muted"> (inativo)</span>}{filtrando && m.grupo_id && <div className="muted" style={{ fontSize: 12 }}><Folder size={11} /> {nomeGrupo(m.grupo_id)}</div>}</td>
                      {admin && <td>{emp(m.empresa_id)}</td>}
                      <td>{m.unidade}</td>
                      <td style={{ textAlign: "right" }}>{brl(m.valor)}</td>
                      <td style={{ textAlign: "right" }}><strong>{qtd(m.saldo)}</strong></td>
                      <td style={{ textAlign: "right" }}>{brl(m.total)}</td>
                      <td>{m.baixo ? <span className="pill falta">Abaixo do mínimo ({qtd(m.minimo)})</span> : <span className="pill ok">{Number(m.minimo) > 0 ? "OK" : "—"}</span>}</td>
                      {!admin && <td onClick={e => e.stopPropagation()}><span className="row" style={{ flexWrap: "nowrap" }}>
                        <button className="btn sm" title="Entrada" onClick={() => abrirMov("entrada", m)}><ArrowDownToLine size={14} /></button>
                        <button className="btn sm" title="Saída" onClick={() => abrirMov("saida", m)}><ArrowUpFromLine size={14} /></button>
                        <button className="btn sm" title="Editar" onClick={() => abrirItem(m)}><Pencil size={14} /></button>
                      </span></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {aba === "historico" && (
        <>
          <div className="bar">
            <div className="busca"><Search size={15} color="#6b7385" /><input placeholder="Buscar item..." value={hBusca} onChange={e => setHBusca(e.target.value)} /></div>
            <select value={hTipo} onChange={e => setHTipo(e.target.value)}><option value="">Entradas e saídas</option><option value="entrada">Só entradas</option><option value="saida">Só saídas</option></select>
          </div>
          {!movs.length && <p className="muted">Nenhuma movimentação ainda.</p>}
          <div style={{ overflowX: "auto" }}>
            <table><tbody>
              {movs.filter(m => (!hTipo || m.tipo === hTipo) && (!hBusca.trim() || (nomeMat(m.materia_id)?.nome || "").toLowerCase().includes(hBusca.trim().toLowerCase()))).map(m => {
                const it = nomeMat(m.materia_id);
                return (
                  <tr key={m.id}>
                    <td>{fmtData(m.data)}</td>
                    {admin && <td>{emp(m.empresa_id)}</td>}
                    <td><span className={"badge " + (m.tipo === "entrada" ? "ok" : "")}>{m.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
                    <td>{it?.nome || "—"}</td>
                    <td>{m.tipo === "entrada" ? "+" : "−"}{qtd(m.quantidade)} {it?.unidade}<div className="muted">{brl(m.valor_unit)} / {it?.unidade} · {brl(m.valor_unit * m.quantidade)}{m.observacao ? ` · ${m.observacao}` : ""}</div></td>
                    {!admin && <td><button className="btn sm" onClick={() => desfazer(m)}>Desfazer</button></td>}
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        </>
      )}

      {selM && (
        <>
          <div className="modal-bg" style={{ background: "rgba(0,0,0,.3)", zIndex: 55 }} onClick={() => setSel(null)} />
          <div className="sidep">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><h2 style={{ margin: 0 }}>{selM.nome}</h2><div className="muted">{selM.grupo_id ? `${nomeGrupo(selM.grupo_id)} · ` : ""}Unidade: {selM.unidade}{admin && ` · ${emp(selM.empresa_id)}`}</div></div>
              <button className="btn sm" onClick={() => setSel(null)}><X size={16} /></button>
            </div>
            <div className="big3">
              <div><small>Em estoque</small><b>{qtd(selM.saldo)} {selM.unidade}</b></div>
              <div><small>Valor unitário</small><b>{brl(selM.valor)}</b></div>
              <div><small>Valor em estoque</small><b>{brl(selM.total)}</b></div>
            </div>
            {selM.baixo && <div className="err" style={{ marginBottom: 10 }}>Abaixo do mínimo ({qtd(selM.minimo)} {selM.unidade}). Faltam {qtd(Number(selM.minimo) - selM.saldo)} para chegar ao mínimo.</div>}
            <strong>Últimas movimentações</strong>
            {!movs.filter(m => m.materia_id === selM.id).length && <p className="muted">Nenhuma movimentação.</p>}
            {movs.filter(m => m.materia_id === selM.id).slice(0, 12).map(m => (
              <div key={m.id} className="muted" style={{ fontSize: 13, padding: "3px 0" }}>{fmtData(m.data)} · {m.tipo === "entrada" ? "Entrada +" : "Saída −"}{qtd(m.quantidade)} {selM.unidade} · {brl(m.valor_unit)}{m.observacao ? ` · ${m.observacao}` : ""}</div>
            ))}
            {!admin && (
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => { setSel(null); abrirMov("entrada", selM); }}>Entrada</button>
                <button className="btn primary" onClick={() => { setSel(null); abrirMov("saida", selM); }}>Saída</button>
                <button className="btn" onClick={() => { setSel(null); abrirItem(selM); }}>Editar item</button>
              </div>
            )}
          </div>
        </>
      )}

      {modal?.tipo === "item" && (
        <div className="modal-bg"><form onSubmit={salvarItem} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>{f.id ? "Editar item" : "Novo item de matéria-prima"}</h2>
          <label>Nome do item<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Espuma D28, Cola, Grampo..." /></label>
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
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              <option value="__outra">Outra...</option>
            </select>
          </label>
          {f.un === "__outra" && <input placeholder="Digite a unidade" value={f.outra} onChange={e => setF({ ...f, outra: e.target.value })} />}
          <div className="row">
            <label style={{ flex: 1 }}>Valor unitário (R$)<input type="number" step="any" min="0" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></label>
            <label style={{ flex: 1 }}>Estoque mínimo (opcional)<input type="number" step="any" min="0" value={f.minimo} onChange={e => setF({ ...f, minimo: e.target.value })} /></label>
          </div>
          {f.id && <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={f.ativo} onChange={e => setF({ ...f, ativo: e.target.checked })} />Item ativo</label>}
          {erro && <div className="err">{erro}</div>}
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button></div>
        </form></div>
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
          <h2 style={{ margin: 0 }}>{modal.tipo === "entrada" ? "Entrada — compra / reposição" : "Saída — consumo"}</h2>
          <label>Item
            <select value={f.materia_id} onChange={e => { const m = nomeMat(e.target.value); setF({ ...f, materia_id: e.target.value, valor: modal.tipo === "entrada" && m ? String(m.valor) : f.valor }); }}>
              <option value="">— escolha —</option>
              {materias.filter(m => m.ativo).map(m => <option key={m.id} value={m.id}>{m.nome} ({m.unidade})</option>)}
            </select>
          </label>
          <label>Quantidade{matForm ? ` (${matForm.unidade})` : ""}<input type="number" step="any" min="0" value={f.qtd} onChange={e => setF({ ...f, qtd: e.target.value })} /></label>
          {modal.tipo === "saida" && matForm && <div className="muted">Em estoque: {qtd(linhas.find(l => l.id === matForm.id)?.saldo)} {matForm.unidade}</div>}
          {modal.tipo === "entrada" && <label>Valor unitário pago (R$) — atualiza o valor do item<input type="number" step="any" min="0" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></label>}
          <label>Data<input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
          <label>Observação (opcional)<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
          {erro && <div className="err">{erro}</div>}
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Salvando..." : modal.tipo === "entrada" ? "Registrar entrada" : "Registrar saída"}</button><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button></div>
        </form></div>
      )}
    </div>
  );
}
