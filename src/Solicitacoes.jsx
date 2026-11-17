import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, X, Trash2, Truck, PackageCheck, Bell } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const qtd = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const fmtHora = (s) => s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const num = (v) => parseFloat(String(v).replace(",", "."));
const linhaVazia = () => ({ k: Math.random(), item_id: "", qtd: "" });

const STATUS = {
  solicitado: { t: "Aguardando confirmação", c: "#92400e", bg: "#fef3c7" },
  confirmado: { t: "Confirmada", c: "#1e40af", bg: "#dbeafe" },
  em_separacao: { t: "Em separação", c: "#6b21a8", bg: "#f3e8ff" },
  concluido: { t: "Separado e concluído", c: "#166534", bg: "#dcfce7" },
  recusado: { t: "Recusada", c: "#991b1b", bg: "#fee2e2" },
  cancelado: { t: "Cancelada", c: "#4a5367", bg: "#e8ebf2" }
};
const TIPO = { coleta: "Coleta", entrega: "Entrega" };
const ABERTOS = ["solicitado", "confirmado", "em_separacao"];

const css = `
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.chip{border:1px solid #d5d9e2;background:#fff;border-radius:99px;padding:5px 12px;font-size:13px;cursor:pointer;color:#4a5367}
.chip.on{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
.spill{font-size:12px;padding:2px 10px;border-radius:99px;white-space:nowrap;font-weight:600}
.solrow{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #eceef3;border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer;background:#fff}
.solrow:hover{border-color:#1d4ed8;background:#f7f9ff}.solrow.nova{border-left:4px solid #f59e0b}
.sidep{position:fixed;top:0;right:0;bottom:0;width:min(520px,100%);background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.15);z-index:60;overflow-y:auto;padding:18px}
.linha{border:1px solid #eceef3;border-radius:10px;padding:10px;background:#fff;display:grid;gap:8px}
.tipos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tipos button{border:2px solid #d5d9e2;background:#fff;border-radius:12px;padding:12px;cursor:pointer;text-align:left;font-size:14px}
.tipos button.on{border-color:#1d4ed8;background:#eff4ff}.tipos small{display:block;color:#6b7385;margin-top:2px}
.wide{max-width:560px !important;max-height:92vh;overflow-y:auto}
.aviso{display:flex;align-items:center;gap:8px;background:#fef3c7;color:#92400e;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:14px}
.tl{font-size:13px;color:#6b7385;display:grid;gap:2px;margin:10px 0}
`;

export default function Solicitacoes({ perfil, onMudou }) {
  const fornecedor = perfil.papel === "fornecedor";
  const almox = perfil.papel === "almoxarife";
  const [sols, setSols] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [filtro, setFiltro] = useState("abertos");
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(false);
  const [f, setF] = useState({});
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("solicitacoes").select("*, solicitacao_itens(*)").order("created_at", { ascending: false }).limit(500),
      supabase.from("empresas").select("id,nome"),
      supabase.from("almox_itens").select("*").order("nome"),
      fornecedor ? Promise.resolve({ data: [] }) : supabase.from("almox_saldo").select("*")
    ]);
    const er = rs.find(r => r.error);
    if (er) return setErro(er.error.message);
    setSols(rs[0].data); setEmpresas(rs[1].data); setCatalogo(rs[2].data); setSaldos(rs[3].data);
    onMudou && onMudou();
  }, [fornecedor, onMudou]);
  useEffect(() => { carregar(); const t = setInterval(carregar, 30000); return () => clearInterval(t); }, [carregar]);

  const emp = (id) => empresas.find(e => e.id === id)?.nome || "—";
  const saldoDe = (id) => Number(saldos.find(s => s.item_id === id)?.saldo || 0);
  const lista = useMemo(() => sols.filter(s =>
    filtro === "todas" ? true : filtro === "abertos" ? ABERTOS.includes(s.status)
      : filtro === "concluidas" ? s.status === "concluido" : ["recusado", "cancelado"].includes(s.status)), [sols, filtro]);
  const novas = sols.filter(s => s.status === "solicitado").length;
  const selS = sel && sols.find(s => s.id === sel);
  const grupos = [...new Set(catalogo.filter(i => i.ativo).map(i => i.grupo || ""))].sort();

  function abrirNova() {
    setF({ tipo: "coleta", data: "", obs: "", linhas: [linhaVazia()] });
    setErro(""); setModal(true);
  }
  const setLinha = (k, patch) => setF(x => ({ ...x, linhas: x.linhas.map(l => l.k === k ? { ...l, ...patch } : l) }));

  async function enviar(e) {
    e.preventDefault();
    const itens = f.linhas.filter(l => l.item_id || l.qtd);
    if (!itens.length) return setErro("Adicione ao menos um item.");
    for (const l of itens) { const q = num(l.qtd); if (!l.item_id || !q || q <= 0) return setErro("Escolha o item e a quantidade em todas as linhas."); }
    setBusy(true);
    const { error } = await supabase.rpc("criar_solicitacao", {
      p_tipo: f.tipo, p_data: f.data || null, p_obs: f.obs,
      p_itens: itens.map(l => ({ item_id: l.item_id, quantidade: num(l.qtd) }))
    });
    setBusy(false);
    if (error) return setErro(error.message);
    setModal(false); setOk("Solicitação enviada! O almoxarife foi avisado."); setTimeout(() => setOk(""), 5000);
    carregar();
  }

  async function acao(a, m) {
    setBusy(true); setErro("");
    const { error } = await supabase.rpc("atualizar_solicitacao", { p_id: selS.id, p_acao: a, p_motivo: m || null });
    setBusy(false);
    if (error) return setErro(error.message);
    setRecusando(false); setMotivo(""); carregar();
  }

  async function lancarEstoque() {
    if (!confirm("Adicionar os itens desta solicitação ao seu estoque de matéria-prima?")) return;
    setBusy(true); setErro("");
    const { error } = await supabase.rpc("solicitacao_para_estoque", { p_id: selS.id });
    setBusy(false);
    if (error) return setErro(error.message);
    setOk("Itens lançados no seu estoque de matéria-prima."); setTimeout(() => setOk(""), 5000); carregar();
  }

  const contar = (fn) => sols.filter(fn).length;

  return (
    <div className="card">
      <style>{css}</style>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Solicitações de material</h2>
          <div className="muted">{fornecedor ? "Peça material ao almoxarife: para coletar ou para entregarem" : "Pedidos de material das terceirizadas"}</div>
        </div>
        {fornecedor && <button className="btn primary" onClick={abrirNova}><Plus size={14} /> Nova solicitação</button>}
      </div>

      {almox && novas > 0 && (
        <div className="aviso" style={{ marginTop: 12 }}><Bell size={16} /> {novas === 1 ? "Você tem 1 solicitação nova aguardando confirmação." : `Você tem ${novas} solicitações novas aguardando confirmação.`}</div>
      )}
      {ok && <div className="ok" style={{ background: "#dcfce7", color: "#166534", padding: "8px 12px", borderRadius: 8, margin: "12px 0", fontSize: 14 }}>{ok}</div>}
      {erro && !modal && <div className="err" style={{ margin: "12px 0" }}>{erro}</div>}

      <div className="chips" style={{ marginTop: 12 }}>
        <button className={"chip" + (filtro === "abertos" ? " on" : "")} onClick={() => setFiltro("abertos")}>Em andamento ({contar(s => ABERTOS.includes(s.status))})</button>
        <button className={"chip" + (filtro === "concluidas" ? " on" : "")} onClick={() => setFiltro("concluidas")}>Concluídas ({contar(s => s.status === "concluido")})</button>
        <button className={"chip" + (filtro === "encerradas" ? " on" : "")} onClick={() => setFiltro("encerradas")}>Recusadas / canceladas ({contar(s => ["recusado", "cancelado"].includes(s.status))})</button>
        <button className={"chip" + (filtro === "todas" ? " on" : "")} onClick={() => setFiltro("todas")}>Todas</button>
      </div>

      {lista.map(s => {
        const st = STATUS[s.status];
        return (
          <div key={s.id} className={"solrow" + (almox && s.status === "solicitado" ? " nova" : "")} onClick={() => { setSel(s.id); setRecusando(false); setMotivo(""); setErro(""); }}>
            <div>
              <div><b>#{s.numero}</b> {!fornecedor && <>· {emp(s.empresa_id)} </>}· {TIPO[s.tipo]}</div>
              <div className="muted">{s.solicitacao_itens.length} {s.solicitacao_itens.length === 1 ? "item" : "itens"} · pedida em {fmtHora(s.created_at)}{s.data_desejada ? ` · para ${fmtData(s.data_desejada)}` : ""}</div>
            </div>
            <span className="spill" style={{ background: st.bg, color: st.c }}>{st.t}</span>
          </div>
        );
      })}
      {lista.length === 0 && <p className="muted">{sols.length ? "Nenhuma solicitação neste filtro." : fornecedor ? "Você ainda não fez nenhuma solicitação." : "Nenhuma solicitação ainda."}</p>}

      {selS && (
        <div className="sidep">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Solicitação #{selS.numero}</h2>
            <button className="btn sm" onClick={() => setSel(null)}><X size={14} /></button>
          </div>
          <div style={{ margin: "10px 0" }}>
            <span className="spill" style={{ background: STATUS[selS.status].bg, color: STATUS[selS.status].c }}>{STATUS[selS.status].t}</span>{" "}
            <span className="badge">{selS.tipo === "coleta" ? <><PackageCheck size={11} /> Coleta — a terceirizada busca</> : <><Truck size={11} /> Entrega — mandar entregar</>}</span>
          </div>
          {!fornecedor && <div><b>{emp(selS.empresa_id)}</b></div>}
          {selS.data_desejada && <div className="muted">Para o dia {fmtData(selS.data_desejada)}</div>}
          {selS.observacao && <p style={{ background: "#f7f9ff", padding: 10, borderRadius: 8 }}>{selS.observacao}</p>}
          {selS.status === "recusado" && <div className="err" style={{ margin: "10px 0" }}>Recusada{selS.motivo ? `: ${selS.motivo}` : "."}</div>}

          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Item</th><th>Pedido</th>{!fornecedor && <th>No estoque</th>}</tr></thead>
            <tbody>
              {selS.solicitacao_itens.map(i => {
                const sd = saldoDe(i.item_id); const falta = !fornecedor && sd < Number(i.quantidade);
                return (
                  <tr key={i.id}>
                    <td>{i.descricao}</td><td>{qtd(i.quantidade)} {i.unidade}</td>
                    {!fornecedor && <td style={{ color: falta ? "#991b1b" : undefined }}>{qtd(sd)} {i.unidade}{falta && " ⚠"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="tl">
            <div>Pedida: {fmtHora(selS.created_at)}</div>
            {selS.confirmado_em && <div>Confirmada: {fmtHora(selS.confirmado_em)}</div>}
            {selS.separacao_em && <div>Em separação desde: {fmtHora(selS.separacao_em)}</div>}
            {selS.concluido_em && <div>Concluída: {fmtHora(selS.concluido_em)}</div>}
          </div>

          {erro && <div className="err" style={{ marginBottom: 8 }}>{erro}</div>}

          {almox && (
            <div style={{ display: "grid", gap: 8 }}>
              {selS.status === "solicitado" && <button className="btn primary" disabled={busy} onClick={() => acao("confirmar")}>Confirmar solicitação</button>}
              {selS.status === "confirmado" && <button className="btn primary" disabled={busy} onClick={() => acao("separar")}>Iniciar separação</button>}
              {selS.status === "em_separacao" && <button className="btn primary" disabled={busy} onClick={() => confirm("Concluir? Os itens serão baixados do estoque do almoxarifado.") && acao("concluir")}>Marcar como separado e concluído</button>}
              {["solicitado", "confirmado"].includes(selS.status) && !recusando && <button className="btn" onClick={() => setRecusando(true)}>Recusar</button>}
              {recusando && (
                <div className="linha">
                  <label>Motivo (opcional)<input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: item em falta" autoFocus /></label>
                  <div className="row"><button className="btn" style={{ color: "#b42318" }} disabled={busy} onClick={() => acao("recusar", motivo)}>Confirmar recusa</button><button className="btn" onClick={() => setRecusando(false)}>Voltar</button></div>
                </div>
              )}
            </div>
          )}
          {fornecedor && selS.status === "concluido" && (
            selS.no_estoque_em
              ? <div className="muted">✔ Já lançada no seu estoque de matéria-prima em {fmtHora(selS.no_estoque_em)}.</div>
              : <button className="btn primary" disabled={busy} onClick={lancarEstoque}>Lançar no meu estoque</button>
          )}
          {fornecedor && ["solicitado", "confirmado"].includes(selS.status) && (
            <button className="btn" style={{ color: "#b42318" }} disabled={busy} onClick={() => confirm("Cancelar esta solicitação?") && acao("cancelar")}>Cancelar solicitação</button>
          )}
        </div>
      )}

      {modal && (
        <div className="modal-bg"><form onSubmit={enviar} className="card modal wide" style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Nova solicitação de material</h2>
          <div className="tipos">
            <button type="button" className={f.tipo === "coleta" ? "on" : ""} onClick={() => setF({ ...f, tipo: "coleta" })}><b><PackageCheck size={14} /> Solicitar coleta</b><small>Eu vou buscar o material</small></button>
            <button type="button" className={f.tipo === "entrega" ? "on" : ""} onClick={() => setF({ ...f, tipo: "entrega" })}><b><Truck size={14} /> Mandar entregar</b><small>Vocês levam até a nossa empresa</small></button>
          </div>
          <label>Para quando? (opcional)<input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>

          <div style={{ display: "grid", gap: 8 }}>
            {catalogo.filter(i => i.ativo).length === 0 && <div className="muted">O almoxarife ainda não cadastrou itens.</div>}
            {f.linhas.map(l => {
              const it = catalogo.find(i => i.id === l.item_id);
              return (
                <div className="linha" key={l.k}>
                  <select value={l.item_id} onChange={e => setLinha(l.k, { item_id: e.target.value })}>
                    <option value="">— escolha o item —</option>
                    {grupos.map(g => (
                      <optgroup key={g || "_"} label={g || "Sem grupo"}>
                        {catalogo.filter(i => i.ativo && (i.grupo || "") === g).map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div className="row">
                    <input type="number" step="any" min="0" placeholder="Quantidade" value={l.qtd} onChange={e => setLinha(l.k, { qtd: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                    <span className="muted" style={{ minWidth: 34 }}>{it?.unidade}</span>
                    {f.linhas.length > 1 && <button type="button" className="btn sm" onClick={() => setF({ ...f, linhas: f.linhas.filter(x => x.k !== l.k) })}><Trash2 size={13} /></button>}
                  </div>
                </div>
              );
            })}
            <button type="button" className="btn sm" style={{ justifySelf: "start" }} onClick={() => setF({ ...f, linhas: [...f.linhas, linhaVazia()] })}>+ Adicionar item</button>
          </div>

          <label>Observação (opcional)<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} placeholder="Ex.: preciso até quinta de manhã" /></label>
          {erro && <div className="err">{erro}</div>}
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Enviando..." : "Enviar solicitação"}</button><button type="button" className="btn" onClick={() => setModal(false)}>Cancelar</button></div>
        </form></div>
      )}
    </div>
  );
}
