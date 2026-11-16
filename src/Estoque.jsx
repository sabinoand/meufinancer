import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { Printer, Star } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const corTxt = (c) => c ? `Cor ${c.numero}${c.nome ? " – " + c.nome : ""}` : "—";
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const css = `
.pa-bar{display:flex;gap:8px;margin-bottom:12px}
.labels{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.label{border:1px dashed #888;padding:8px;text-align:center;break-inside:avoid;font-size:12px;background:#fff}
.label img{width:120px;height:120px}
.label b{display:block;font-size:14px}
@media print{
  body *{visibility:hidden}
  .print-area,.print-area *{visibility:visible}
  .print-area{position:absolute !important;left:0;top:0;width:100%;background:#fff;padding:0 !important;overflow:visible !important}
  .pa-bar{display:none}
}
`;

function Rotulo({ e }) {
  const [src, setSrc] = useState("");
  useEffect(() => { QRCode.toDataURL(`${window.location.origin}/?q=${e.token}`, { margin: 1, width: 300 }).then(setSrc); }, [e.token]);
  return (
    <div className="label">
      {src && <img src={src} alt="QR" />}
      <b>{e.empresa}</b>
      <div>{e.cadeira} · {e.cor}</div>
      <div>{e.pedido ? `Pedido #${e.pedido} · ` : ""}cód. {e.token.slice(-6).toUpperCase()}</div>
    </div>
  );
}

export default function Estoque({ perfil }) {
  const admin = perfil.papel === "admin";
  const [saldos, setSaldos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [cadeiras, setCadeiras] = useState([]);
  const [cores, setCores] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [itens, setItens] = useState([]);
  const [avals, setAvals] = useState([]);
  const [modo, setModo] = useState(null); // "entrada" | "saida"
  const vazio = { cadeira_id: "", cor_id: "", caixas: "", item_id: "", obs: "", etiquetas: true };
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState("");
  const [imprimir, setImprimir] = useState(null);
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("estoque_saldo").select("*"),
      supabase.from("estoque_mov").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("cadeiras").select("*").order("nome"),
      supabase.from("cores").select("*").order("numero"),
      supabase.from("empresas").select("id,nome"),
      supabase.from("pedidos").select("*").neq("status", "cancelado"),
      supabase.from("pedido_itens").select("*"),
      supabase.from("avaliacoes").select("nota")
    ]);
    const er = rs.find(r => r.error);
    if (er) return setErro(er.error.message);
    setSaldos(rs[0].data); setMovs(rs[1].data); setCadeiras(rs[2].data); setCores(rs[3].data);
    setEmpresas(rs[4].data); setPedidos(rs[5].data); setItens(rs[6].data); setAvals(rs[7].data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const emp = (id) => empresas.find(e => e.id === id)?.nome || "—";
  const cad = (id) => cadeiras.find(c => c.id === id)?.nome || "—";
  const cor = (id) => corTxt(cores.find(c => c.id === id));
  const saldoDe = (c, k) => saldos.find(s => s.cadeira_id === c && s.cor_id === k)?.saldo || 0;

  // itens de pedido da mesma cadeira/cor que ainda faltam chegar
  const itensVinculo = itens.filter(i => i.cadeira_id === f.cadeira_id && i.cor_id === f.cor_id && i.caixas_recebidas < i.caixas
    && pedidos.some(p => p.id === i.pedido_id && p.status !== "entregue"));
  const numPedido = (itemId) => pedidos.find(p => p.id === itens.find(i => i.id === itemId)?.pedido_id)?.numero;

  async function salvar(e) {
    e.preventDefault();
    const n = parseInt(f.caixas, 10);
    if (!f.cadeira_id || !f.cor_id || !n || n < 1) return setErro("Escolha a cadeira, a cor e a quantidade de caixas.");
    setBusy(true);
    const { data, error } = await supabase.rpc("movimentar_estoque", {
      p_cadeira: f.cadeira_id, p_cor: f.cor_id, p_tipo: modo, p_caixas: n,
      p_item: modo === "saida" && f.item_id ? f.item_id : null, p_obs: f.obs, p_etiquetas: modo === "saida" && f.etiquetas
    });
    setBusy(false);
    if (error) return setErro(error.message);
    setErro("");
    if (data?.tokens?.length) {
      setImprimir(data.tokens.map(t => ({ token: t, empresa: emp(perfil.empresa_id), cadeira: cad(f.cadeira_id), cor: cor(f.cor_id), pedido: f.item_id ? numPedido(f.item_id) : null })));
    }
    setF(vazio); setModo(null); carregar();
  }
  async function reimprimir(m) {
    const { data, error } = await supabase.from("etiquetas").select("token").eq("mov_id", m.id);
    if (error) return setErro(error.message);
    if (!data.length) return setErro("Esta saída não tem etiquetas.");
    setImprimir(data.map(x => ({ token: x.token, empresa: emp(m.empresa_id), cadeira: cad(m.cadeira_id), cor: cor(m.cor_id), pedido: m.item_id ? numPedido(m.item_id) : null })));
  }
  async function desfazer(m) {
    if (!confirm("Desfazer este lançamento? Se tiver etiquetas, elas serão apagadas.")) return;
    const { error } = await supabase.rpc("excluir_movimento", { p_id: m.id });
    if (error) setErro(error.message); else { setErro(""); carregar(); }
  }

  const media = avals.length ? (avals.reduce((a, x) => a + x.nota, 0) / avals.length).toFixed(1) : null;
  const total = saldos.reduce((a, s) => a + s.saldo, 0);

  return (
    <div className="card">
      <style>{css}</style>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Estoque — caixas prontas</h2>
        {!admin && (
          <div className="row">
            <button className="btn primary" onClick={() => { setModo("entrada"); setF(vazio); setErro(""); }}>+ Entrada (produzi)</button>
            <button className="btn" onClick={() => { setModo("saida"); setF(vazio); setErro(""); }}>Saída (carregar)</button>
          </div>
        )}
      </div>
      {!admin && <p className="muted"><Star size={14} color="#f59e0b" fill="#f59e0b" /> Sua nota média: <strong>{media ?? "—"}</strong>{avals.length > 0 && ` (${avals.length} avaliações)`}</p>}
      {erro && <div className="err" style={{ marginBottom: 10 }}>{erro}</div>}

      {modo && (
        <form onSubmit={salvar} className="card" style={{ background: "#f8f9fc", marginBottom: 14, display: "grid", gap: 10 }}>
          <strong>{modo === "entrada" ? "Entrada no estoque (caixas que ficaram prontas)" : "Saída do estoque (carregando para entrega)"}</strong>
          <div className="row">
            <label style={{ flex: 1, minWidth: 150 }}>Cadeira
              <select value={f.cadeira_id} onChange={e => setF({ ...f, cadeira_id: e.target.value, item_id: "" })}>
                <option value="">— escolha —</option>
                {cadeiras.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label style={{ flex: 1, minWidth: 150 }}>Cor
              <select value={f.cor_id} onChange={e => setF({ ...f, cor_id: e.target.value, item_id: "" })}>
                <option value="">— escolha —</option>
                {cores.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{corTxt(c)}</option>)}
              </select>
            </label>
            <label style={{ width: 110 }}>Caixas<input type="number" min="1" value={f.caixas} onChange={e => setF({ ...f, caixas: e.target.value })} /></label>
          </div>
          {modo === "saida" && f.cadeira_id && f.cor_id && <div className="muted">Em estoque: {saldoDe(f.cadeira_id, f.cor_id)} caixas</div>}
          {modo === "saida" && (
            <>
              <label>Vincular a um pedido (opcional)
                <select value={f.item_id} onChange={e => setF({ ...f, item_id: e.target.value })}>
                  <option value="">Sem pedido</option>
                  {itensVinculo.map(i => <option key={i.id} value={i.id}>Pedido #{numPedido(i.id)} — faltam {i.caixas - i.caixas_recebidas} cx</option>)}
                </select>
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={f.etiquetas} onChange={e => setF({ ...f, etiquetas: e.target.checked })} />
                Gerar etiquetas com QR code (uma para cada caixa) e imprimir
              </label>
            </>
          )}
          <label>Observação (opcional)<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
          <div className="row">
            <button className="btn primary" disabled={busy}>{busy ? "Salvando..." : modo === "entrada" ? "Registrar entrada" : f.etiquetas ? "Registrar saída e gerar etiquetas" : "Registrar saída"}</button>
            <button type="button" className="btn" onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <h3 style={{ marginBottom: 6 }}>Em estoque agora {!admin && <span className="muted">— {total} caixas</span>}</h3>
      {!saldos.filter(s => s.saldo !== 0).length && <p className="muted">Nada em estoque. Registre uma entrada quando as caixas ficarem prontas.</p>}
      <div style={{ overflowX: "auto" }}>
        <table><tbody>
          {saldos.filter(s => s.saldo !== 0).map(s => (
            <tr key={s.empresa_id + s.cadeira_id + s.cor_id}>
              {admin && <td>{emp(s.empresa_id)}</td>}
              <td>{cad(s.cadeira_id)}</td><td>{cor(s.cor_id)}</td><td><strong>{s.saldo} cx</strong></td>
            </tr>
          ))}
        </tbody></table>
      </div>

      <h3 style={{ margin: "18px 0 6px" }}>Movimentações</h3>
      {!movs.length && <p className="muted">Nenhuma movimentação ainda.</p>}
      <div style={{ overflowX: "auto" }}>
        <table><tbody>
          {movs.map(m => (
            <tr key={m.id}>
              <td>{fmtData(m.data)}</td>
              {admin && <td>{emp(m.empresa_id)}</td>}
              <td><span className={"badge " + (m.tipo === "entrada" ? "ok" : "")}>{m.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
              <td>{cad(m.cadeira_id)} · {cor(m.cor_id)}</td>
              <td>{m.tipo === "entrada" ? "+" : "−"}{m.caixas} cx{m.item_id && <span className="muted"> · Pedido #{numPedido(m.item_id)}</span>}{m.observacao && <div className="muted">{m.observacao}</div>}</td>
              {!admin && <td className="row">
                {m.tipo === "saida" && <button className="btn sm" onClick={() => reimprimir(m)}>Etiquetas</button>}
                <button className="btn sm" onClick={() => desfazer(m)}>Desfazer</button>
              </td>}
            </tr>
          ))}
        </tbody></table>
      </div>

      {imprimir && (
        <div className="print-area" style={{ position: "fixed", inset: 0, overflow: "auto", background: "#fff", zIndex: 80, padding: 16 }}>
          <div className="pa-bar">
            <button className="btn primary" onClick={() => window.print()}><Printer size={16} /> Imprimir {imprimir.length} etiquetas</button>
            <button className="btn" onClick={() => setImprimir(null)}>Fechar</button>
          </div>
          <div className="labels">{imprimir.map(e => <Rotulo key={e.token} e={e} />)}</div>
        </div>
      )}
    </div>
  );
}
