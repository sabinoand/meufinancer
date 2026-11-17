import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Plus, ArrowDownToLine, ArrowUpFromLine, Pencil } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const UNIDADES = ["un", "m", "m²", "kg", "g", "L", "mL", "rolo", "pacote", "caixa", "lata", "par", "folha"];
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
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.chip{border:1px solid #d5d9e2;background:#fff;border-radius:99px;padding:5px 12px;font-size:13px;cursor:pointer;color:#4a5367}
.chip.on{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
.pill{font-size:12px;padding:2px 9px;border-radius:99px;white-space:nowrap}
.pill.falta{background:#fee2e2;color:#991b1b}.pill.ok{background:#e8ebf2;color:#4a5367}
@media(max-width:720px){.kpis{grid-template-columns:1fr}}
`;

export default function Almoxarifado({ perfil }) {
  const admin = perfil.papel === "admin";
  const [aba, setAba] = useState("estoque");
  const [itens, setItens] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [busca, setBusca] = useState("");
  const [fGrupo, setFGrupo] = useState("");
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
      supabase.from("almox_mov").select("*").order("created_at", { ascending: false }).limit(500)
    ]);
    const er = rs.find(r => r.error);
    if (er) return setErro(er.error.message);
    setItens(rs[0].data); setSaldos(rs[1].data); setMovs(rs[2].data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const linhas = useMemo(() => itens.map(i => {
    const saldo = Number(saldos.find(s => s.item_id === i.id)?.saldo || 0);
    return { ...i, saldo, baixo: i.ativo && Number(i.minimo) > 0 && saldo < Number(i.minimo) };
  }), [itens, saldos]);
  const ativos = linhas.filter(i => i.ativo);
  const grupos = [...new Set(itens.map(i => i.grupo).filter(Boolean))].sort();
  const vis = linhas.filter(i => {
    if (!verInativos && !i.ativo) return false;
    const t = busca.trim().toLowerCase();
    if (t && !i.nome.toLowerCase().includes(t)) return false;
    if (fGrupo === "__sem" ? !!i.grupo : fGrupo && i.grupo !== fGrupo) return false;
    if (soBaixo && !i.baixo) return false;
    return true;
  });
  const kValor = ativos.reduce((a, i) => a + i.saldo * Number(i.valor), 0);
  const kBaixo = ativos.filter(i => i.baixo).length;
  const nome = (id) => itens.find(i => i.id === id);

  function abrirItem(i) {
    const un = i && !UNIDADES.includes(i.unidade) ? "__outra" : (i?.unidade || "un");
    setF(i ? { id: i.id, nome: i.nome, un, outra: un === "__outra" ? i.unidade : "", grupo: i.grupo || "", valor: String(i.valor), minimo: String(i.minimo), ativo: i.ativo }
           : { nome: "", un: "un", outra: "", grupo: fGrupo && fGrupo !== "__sem" ? fGrupo : "", valor: "", minimo: "", ativo: true });
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
    setBusy(true);
    const dados = { nome: f.nome.trim(), unidade, valor, minimo, grupo: f.grupo.trim() || null };
    const { error } = f.id
      ? await supabase.from("almox_itens").update({ ...dados, ativo: f.ativo }).eq("id", f.id)
      : await supabase.from("almox_itens").insert(dados);
    setBusy(false);
    if (error) return setErro(/duplicate|unique/i.test(error.message) ? "Já existe um item com esse nome." : error.message);
    setModal(null); carregar();
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
          <button className="btn" onClick={() => abrirMov("entrada", null)}><ArrowDownToLine size={14} /> Entrada</button>
          <button className="btn" onClick={() => abrirMov("saida", null)}><ArrowUpFromLine size={14} /> Saída</button>
          <button className="btn primary" onClick={() => abrirItem(null)}><Plus size={14} /> Novo item</button>
        </div>}
      </div>
      <div className="subtabs" style={{ marginTop: 12 }}>
        <button className={aba === "estoque" ? "on" : ""} onClick={() => setAba("estoque")}>Estoque</button>
        <button className={aba === "historico" ? "on" : ""} onClick={() => setAba("historico")}>Histórico</button>
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
        {grupos.length > 0 && (
          <div className="chips">
            <button className={"chip" + (!fGrupo ? " on" : "")} onClick={() => setFGrupo("")}>Todos</button>
            {grupos.map(g => <button key={g} className={"chip" + (fGrupo === g ? " on" : "")} onClick={() => setFGrupo(g)}>{g}</button>)}
            <button className={"chip" + (fGrupo === "__sem" ? " on" : "")} onClick={() => setFGrupo("__sem")}>Sem grupo</button>
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Item</th><th>Grupo</th><th>Em estoque</th><th className="hide-m">Valor un.</th>{!admin && <th></th>}</tr></thead>
            <tbody>
              {vis.map(i => (
                <tr key={i.id} style={i.ativo ? undefined : { opacity: .5 }}>
                  <td><b>{i.nome}</b>{!i.ativo && <span className="badge off" style={{ marginLeft: 6 }}>inativo</span>}</td>
                  <td className="muted">{i.grupo || "—"}</td>
                  <td>{qtd(i.saldo)} {i.unidade} {i.baixo && <span className="pill falta">abaixo do mínimo</span>}</td>
                  <td className="hide-m">{brl(i.valor)}</td>
                  {!admin && <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn sm" title="Entrada" onClick={() => abrirMov("entrada", i)}><ArrowDownToLine size={13} /></button>{" "}
                    <button className="btn sm" title="Saída" onClick={() => abrirMov("saida", i)}><ArrowUpFromLine size={13} /></button>{" "}
                    <button className="btn sm" title="Editar" onClick={() => abrirItem(i)}><Pencil size={13} /></button>
                  </td>}
                </tr>
              ))}
              {vis.length === 0 && <tr><td colSpan={5} className="muted">{itens.length ? "Nenhum item encontrado." : admin ? "Nenhum item cadastrado ainda." : "Nenhum item ainda. Clique em \"Novo item\" para começar."}</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}

      {aba === "historico" && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Data</th><th>Item</th><th>Tipo</th><th>Qtd</th><th className="hide-m">Observação</th>{!admin && <th></th>}</tr></thead>
            <tbody>
              {movs.map(m => { const it = nome(m.item_id); return (
                <tr key={m.id}>
                  <td>{fmtData(m.data)}</td><td>{it?.nome || "—"}</td>
                  <td><span className={"badge " + (m.tipo === "entrada" ? "ok" : "")}>{m.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
                  <td>{qtd(m.quantidade)} {it?.unidade}</td><td className="hide-m muted">{m.observacao}</td>
                  {!admin && <td><button className="btn sm" onClick={() => desfazer(m)}>Desfazer</button></td>}
                </tr>); })}
              {movs.length === 0 && <tr><td colSpan={6} className="muted">Sem movimentações.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal?.tipo === "item" && (
        <div className="modal-bg"><form onSubmit={salvarItem} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>{f.id ? "Editar item" : "Novo item do almoxarifado"}</h2>
          <label>Nome do item<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Cola 18kg, Espuma D28, Grampo..." autoFocus /></label>
          <label>Grupo (opcional)<input list="almox-grupos" value={f.grupo} onChange={e => setF({ ...f, grupo: e.target.value })} placeholder="Ex.: Tecido, Espuma, Colas" /></label>
          <datalist id="almox-grupos">{grupos.map(g => <option key={g} value={g} />)}</datalist>
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
