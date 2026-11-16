import { useEffect, useState, useCallback, useMemo } from "react";
import QRCode from "qrcode";
import { Printer, Star, Search, LayoutGrid, AlignJustify, List, Table2, X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const corTxt = (c) => c ? `Tecido ${c.numero}${c.nome ? " – " + c.nome : ""}` : "—";
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const css = `
.pa-bar{display:flex;gap:8px;margin-bottom:12px}
.labels{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.label{border:1px dashed #888;padding:8px;text-align:center;break-inside:avoid;font-size:12px;background:#fff}
.label img{width:120px;height:120px}.label b{display:block;font-size:14px}
@media print{body *{visibility:hidden}.print-area,.print-area *{visibility:visible}
.print-area{position:absolute !important;left:0;top:0;width:100%;background:#fff;padding:0 !important;overflow:visible !important}.pa-bar{display:none}}
.subtabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #eceef3}
.subtabs button{border:0;background:none;padding:9px 14px;cursor:pointer;font-size:14px;color:#6b7385;border-bottom:2px solid transparent}
.subtabs button.on{color:#1d4ed8;border-color:#1d4ed8;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.kpi{border-radius:12px;padding:12px 14px;background:#f1f4fb}.kpi small{display:block;color:#6b7385;font-size:12px}.kpi b{font-size:22px}
.kpi.bad{background:#fee2e2}.kpi.bad b{color:#991b1b}.kpi.good{background:#dcfce7}.kpi.good b{color:#166534}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.bar .busca{display:flex;align-items:center;gap:6px;border:1px solid #d5d9e2;border-radius:8px;padding:0 10px;background:#fff;flex:1;min-width:180px}
.bar .busca input{border:0;outline:0;padding:9px 0;flex:1;font-size:14px;min-width:0}
.views{display:inline-flex;gap:4px}
.views button{border:1px solid #d5d9e2;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px;display:inline-flex;gap:5px;align-items:center}
.views button.on{border-color:#d97706;background:#fff7e6;color:#92400e}
.gridcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.icard{border:1px solid #eceef3;border-radius:12px;padding:12px;cursor:pointer;background:#fff}.icard:hover{border-color:#1d4ed8}
.rowclick{cursor:pointer}.rowclick:hover{background:#f7f9ff}
.pill{font-size:12px;padding:2px 9px;border-radius:99px;white-space:nowrap}
.pill.falta{background:#fee2e2;color:#991b1b}.pill.sobra{background:#dcfce7;color:#166534}.pill.ok{background:#e8ebf2;color:#4a5367}
.prog{height:8px;background:#e8ebf2;border-radius:99px;overflow:hidden;margin-top:6px}.prog i{display:block;height:100%;background:#1d4ed8}
.big3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.big3 div{background:#f1f4fb;border-radius:10px;padding:10px;text-align:center}.big3 small{display:block;color:#6b7385;font-size:11px}.big3 b{font-size:22px}
.veredito{padding:12px;border-radius:10px;font-weight:600;margin-bottom:12px}
.veredito.falta{background:#fee2e2;color:#991b1b}.veredito.sobra{background:#dcfce7;color:#166534}.veredito.ok{background:#e8ebf2}
.sidep{position:fixed;top:0;right:0;bottom:0;width:min(460px,100%);background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.15);z-index:60;overflow-y:auto;padding:18px}
@media(max-width:720px){.kpis{grid-template-columns:repeat(2,1fr)}}
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
  const [aba, setAba] = useState("estoque");
  const [visao, setVisao] = useState("detalhada");
  const [saldos, setSaldos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [cadeiras, setCadeiras] = useState([]);
  const [cores, setCores] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [itens, setItens] = useState([]);
  const [avals, setAvals] = useState([]);
  const [busca, setBusca] = useState("");
  const [fCad, setFCad] = useState("");
  const [fCor, setFCor] = useState("");
  const [fSit, setFSit] = useState("");
  const [soComEstoque, setSoComEstoque] = useState(false);
  const [sel, setSel] = useState(null);
  const [grupo, setGrupo] = useState(null); // "empresa|cadeira" aberto
  const [modo, setModo] = useState(null);
  const vazio = { cadeira_id: "", cor_id: "", caixas: "", item_id: "", obs: "", etiquetas: true };
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState("");
  const [imprimir, setImprimir] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hTipo, setHTipo] = useState("");

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("estoque_saldo").select("*"),
      supabase.from("estoque_mov").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("cadeiras").select("*").order("nome"),
      supabase.from("cores").select("*").order("numero"),
      supabase.from("empresas").select("id,nome"),
      supabase.from("pedidos").select("*"),
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
  const pedido = (id) => pedidos.find(p => p.id === id);
  const numPedido = (itemId) => pedido(itens.find(i => i.id === itemId)?.pedido_id)?.numero;

  // Linhas do estoque: junta o que há em estoque com o que há em pedidos abertos
  const linhas = useMemo(() => {
    const enviado = {};
    movs.forEach(m => { if (m.tipo === "saida" && m.item_id) enviado[m.item_id] = (enviado[m.item_id] || 0) + m.caixas; });
    const mapa = new Map();
    const get = (e, c, k) => {
      const key = `${e}|${c}|${k}`;
      if (!mapa.has(key)) mapa.set(key, { key, empresa_id: e, cadeira_id: c, cor_id: k, estoque: 0, pedidas: 0, faltaEnviar: 0, pend: [] });
      return mapa.get(key);
    };
    saldos.forEach(s => { get(s.empresa_id, s.cadeira_id, s.cor_id).estoque = s.saldo; });
    itens.forEach(i => {
      const p = pedido(i.pedido_id);
      if (!p || p.status === "cancelado" || p.status === "entregue") return;
      const atendido = Math.max(i.caixas_recebidas, enviado[i.id] || 0);
      const falta = Math.max(0, i.caixas - atendido);
      const l = get(p.empresa_id, i.cadeira_id, i.cor_id);
      l.pedidas += i.caixas; l.faltaEnviar += falta;
      l.pend.push({ item: i, p, enviado: enviado[i.id] || 0, falta });
    });
    return [...mapa.values()].map(l => {
      const dif = l.estoque - l.faltaEnviar;
      return { ...l, dif, sit: l.faltaEnviar === 0 && l.estoque === 0 ? "ok" : dif < 0 ? "falta" : dif > 0 ? "sobra" : "ok" };
    }).filter(l => l.estoque !== 0 || l.faltaEnviar > 0)
      .sort((a, b) => cad(a.cadeira_id).localeCompare(cad(b.cadeira_id)) || cor(a.cor_id).localeCompare(cor(b.cor_id), undefined, { numeric: true }));
  }, [saldos, movs, itens, pedidos, cadeiras, cores]); // eslint-disable-line

  const vis = linhas.filter(l => {
    const t = busca.trim().toLowerCase();
    if (t && !(`${cad(l.cadeira_id)} ${cor(l.cor_id)}`.toLowerCase().includes(t))) return false;
    if (fCad && l.cadeira_id !== fCad) return false;
    if (fCor && l.cor_id !== fCor) return false;
    if (fSit && l.sit !== fSit) return false;
    if (soComEstoque && l.estoque <= 0) return false;
    return true;
  });
  const chaveG = (l) => `${l.empresa_id}|${l.cadeira_id}`;
  const base = grupo ? linhas.filter(l => chaveG(l) === grupo) : linhas;
  const kEstoque = base.reduce((a, l) => a + Math.max(0, l.estoque), 0);
  const kPedidas = base.reduce((a, l) => a + l.faltaEnviar, 0);
  const kFalta = base.reduce((a, l) => a + Math.max(0, -l.dif), 0);
  const kSobra = base.reduce((a, l) => a + Math.max(0, l.dif), 0);
  const selLinha = sel && linhas.find(l => l.key === sel);
  const grupos = useMemo(() => {
    const m = new Map();
    linhas.forEach(l => {
      const k = chaveG(l);
      if (!m.has(k)) m.set(k, { key: k, empresa_id: l.empresa_id, cadeira_id: l.cadeira_id, estoque: 0, faltaEnviar: 0, falta: 0, sobra: 0, n: 0 });
      const g = m.get(k);
      g.estoque += l.estoque; g.faltaEnviar += l.faltaEnviar; g.n += 1;
      g.falta += Math.max(0, -l.dif); g.sobra += Math.max(0, l.dif);
    });
    return [...m.values()].map(g => ({ ...g, dif: g.falta > 0 ? -g.falta : g.sobra, sit: g.falta > 0 ? "falta" : g.sobra > 0 ? "sobra" : "ok" }));
  }, [linhas]);
  const visKeys = new Set(vis.map(chaveG));
  const gAberto = grupo && grupos.find(g => g.key === grupo);
  const nomeCadeiraAberta = grupo ? cad(grupo.split("|")[1]) : "";
  const cards = !grupo
    ? grupos.filter(g => visKeys.has(g.key)).sort((a, b) => cad(a.cadeira_id).localeCompare(cad(b.cadeira_id)))
        .map(g => ({ ...g, titulo: cad(g.cadeira_id), sub: `${g.n} tecido${g.n > 1 ? "s" : ""}${admin ? " · " + emp(g.empresa_id) : ""}`, abrir: () => setGrupo(g.key) }))
    : vis.filter(l => chaveG(l) === grupo).map(l => ({ ...l, titulo: cor(l.cor_id), sub: admin ? emp(l.empresa_id) : "", abrir: () => setSel(l.key) }));

  const textoSit = (l) => l.sit === "falta" ? `Faltam ${-l.dif} cx` : l.sit === "sobra" ? `Sobram ${l.dif} cx` : "Em dia";
  const Pill = ({ l }) => <span className={"pill " + l.sit}>{textoSit(l)}</span>;

  function abrirForm(tipo, l) {
    setF({ ...vazio, cadeira_id: l?.cadeira_id || "", cor_id: l?.cor_id || "" });
    setModo(tipo); setErro("");
  }
  const itensVinculo = itens.filter(i => i.cadeira_id === f.cadeira_id && i.cor_id === f.cor_id && i.caixas_recebidas < i.caixas
    && pedido(i.pedido_id) && !["entregue", "cancelado"].includes(pedido(i.pedido_id).status));
  const saldoForm = saldos.find(s => s.cadeira_id === f.cadeira_id && s.cor_id === f.cor_id)?.saldo || 0;

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
    setModo(null); carregar();
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
  const nomeLinha = (l) => <><strong>{cad(l.cadeira_id)}</strong><div className="muted">{cor(l.cor_id)}{admin && ` · ${emp(l.empresa_id)}`}</div></>;

  return (
    <div className="card">
      <style>{css}</style>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Estoque de caixas prontas</h2>
          <div className="muted">Entradas, saídas e etiquetas com QR code por caixa</div>
        </div>
        {!admin && <span className="muted"><Star size={14} color="#f59e0b" fill="#f59e0b" /> Nota média: <strong>{media ?? "—"}</strong>{avals.length > 0 && ` (${avals.length})`}</span>}
      </div>
      <div className="subtabs" style={{ marginTop: 12 }}>
        <button className={aba === "estoque" ? "on" : ""} onClick={() => setAba("estoque")}>Estoque</button>
        <button className={aba === "historico" ? "on" : ""} onClick={() => setAba("historico")}>Histórico</button>
      </div>
      {erro && !modo && <div className="err" style={{ marginBottom: 10 }}>{erro}</div>}

      {aba === "estoque" && (
        <>
          <div className="kpis">
            <div className="kpi"><small>{grupo ? "Tecidos" : "Cadeiras"}</small><b>{grupo ? base.length : grupos.length}</b></div>
            <div className="kpi"><small>Caixas em estoque</small><b>{kEstoque}</b></div>
            <div className="kpi"><small>Caixas ainda a entregar (pedidos)</small><b>{kPedidas}</b></div>
            <div className={"kpi " + (kFalta > 0 ? "bad" : "good")}><small>{kFalta > 0 ? "Faltando para concluir" : "Estoque cobre os pedidos"}</small><b>{kFalta > 0 ? kFalta : `+${kSobra}`}</b></div>
          </div>

          <div className="bar">
            <div className="busca"><Search size={15} color="#6b7385" /><input placeholder="Buscar cadeira ou tecido..." value={busca} onChange={e => setBusca(e.target.value)} /></div>
            {!grupo && <select value={fCad} onChange={e => setFCad(e.target.value)}><option value="">Todas as cadeiras</option>{cadeiras.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
            <select value={fCor} onChange={e => setFCor(e.target.value)}><option value="">Todos os tecidos</option>{cores.map(c => <option key={c.id} value={c.id}>{corTxt(c)}</option>)}</select>
            <select value={fSit} onChange={e => setFSit(e.target.value)}>
              <option value="">Todas as situações</option><option value="falta">Faltando</option><option value="sobra">Sobrando</option><option value="ok">Em dia</option>
            </select>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><input type="checkbox" checked={soComEstoque} onChange={e => setSoComEstoque(e.target.checked)} />Só com estoque</label>
          </div>
          <div className="bar">
            <span className="muted">Visualização:</span>
            <div className="views">
              <button className={visao === "grade" ? "on" : ""} onClick={() => setVisao("grade")}><LayoutGrid size={14} />Grade</button>
              <button className={visao === "compacta" ? "on" : ""} onClick={() => setVisao("compacta")}><AlignJustify size={14} />Compacta</button>
              <button className={visao === "linhas" ? "on" : ""} onClick={() => setVisao("linhas")}><List size={14} />Linhas</button>
              <button className={visao === "detalhada" ? "on" : ""} onClick={() => setVisao("detalhada")}><Table2 size={14} />Detalhada</button>
            </div>
            <div style={{ flex: 1 }} />
            {!admin && <>
              <button className="btn" onClick={() => abrirForm("entrada", grupo ? { cadeira_id: grupo.split("|")[1] } : undefined)}><ArrowDownToLine size={14} /> Entrada</button>
              <button className="btn primary" onClick={() => abrirForm("saida", grupo ? { cadeira_id: grupo.split("|")[1] } : undefined)}><ArrowUpFromLine size={14} /> Saída</button>
            </>}
          </div>

          {grupo && (
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn sm" onClick={() => setGrupo(null)}>← Todas as cadeiras</button>
              <strong style={{ fontSize: 16 }}>{nomeCadeiraAberta}</strong>
              <span className="muted">— estoque por tecido</span>
            </div>
          )}
          {!cards.length && <p className="muted">Nenhum item. {!admin && "Registre uma entrada quando as caixas ficarem prontas, ou lance um pedido pela Cel."}</p>}

          {visao === "grade" && (
            <div className="gridcards">
              {cards.map(l => (
                <div key={l.key} className="icard" onClick={l.abrir}>
                  <strong>{l.titulo}</strong>{l.sub && <div className="muted">{l.sub}</div>}
                  <div style={{ fontSize: 26, fontWeight: 700, margin: "6px 0" }}>{l.estoque} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>cx</span></div>
                  <Pill l={l} />
                </div>
              ))}
            </div>
          )}
          {visao === "compacta" && (
            <table><tbody>
              {cards.map(l => (
                <tr key={l.key} className="rowclick" onClick={l.abrir}>
                  <td>{l.titulo}{l.sub && <span className="muted"> · {l.sub}</span>}</td>
                  <td style={{ textAlign: "right" }}><strong>{l.estoque} cx</strong></td><td style={{ textAlign: "right" }}><Pill l={l} /></td>
                </tr>
              ))}
            </tbody></table>
          )}
          {visao === "linhas" && (
            <div style={{ display: "grid", gap: 8 }}>
              {cards.map(l => {
                const alvo = Math.max(l.faltaEnviar, 1);
                return (
                  <div key={l.key} className="icard" onClick={l.abrir}>
                    <div className="row" style={{ justifyContent: "space-between" }}><div><strong>{l.titulo}</strong>{l.sub && <div className="muted">{l.sub}</div>}</div><Pill l={l} /></div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{l.estoque} cx em estoque · {l.faltaEnviar} cx a entregar</div>
                    <div className="prog"><i style={{ width: `${Math.min(100, Math.max(0, l.estoque) / alvo * 100)}%`, background: l.sit === "falta" ? "#ef4444" : "#16a34a" }} /></div>
                  </div>
                );
              })}
            </div>
          )}
          {visao === "detalhada" && (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>{grupo ? "Tecido" : "Cadeira"}</th><th style={{ textAlign: "right" }}>Em estoque</th><th style={{ textAlign: "right" }}>Pedidas (a entregar)</th><th style={{ textAlign: "right" }}>Diferença</th><th>Situação</th></tr></thead>
                <tbody>
                  {cards.map(l => (
                    <tr key={l.key} className="rowclick" onClick={l.abrir}>
                      <td><strong>{l.titulo}</strong>{l.sub && <div className="muted">{l.sub}</div>}</td>
                      <td style={{ textAlign: "right" }}><strong>{l.estoque}</strong></td>
                      <td style={{ textAlign: "right" }}>{l.faltaEnviar}</td>
                      <td style={{ textAlign: "right" }}>{l.dif > 0 ? "+" : ""}{l.dif}</td>
                      <td><Pill l={l} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {aba === "historico" && (
        <>
          <div className="bar">
            <select value={hTipo} onChange={e => setHTipo(e.target.value)}><option value="">Entradas e saídas</option><option value="entrada">Só entradas</option><option value="saida">Só saídas</option></select>
          </div>
          {!movs.length && <p className="muted">Nenhuma movimentação ainda.</p>}
          <div style={{ overflowX: "auto" }}>
            <table><tbody>
              {movs.filter(m => !hTipo || m.tipo === hTipo).map(m => (
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
        </>
      )}

      {selLinha && (
        <>
          <div className="modal-bg" style={{ background: "rgba(0,0,0,.3)", zIndex: 55 }} onClick={() => setSel(null)} />
          <div className="sidep">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><h2 style={{ margin: 0 }}>{cad(selLinha.cadeira_id)}</h2><div className="muted">{cor(selLinha.cor_id)}{admin && ` · ${emp(selLinha.empresa_id)}`}</div></div>
              <button className="btn sm" onClick={() => setSel(null)}><X size={16} /></button>
            </div>
            <div className="big3">
              <div><small>Em estoque</small><b>{selLinha.estoque}</b></div>
              <div><small>Pedidas (a entregar)</small><b>{selLinha.faltaEnviar}</b></div>
              <div><small>Diferença</small><b>{selLinha.dif > 0 ? "+" : ""}{selLinha.dif}</b></div>
            </div>
            <div className={"veredito " + selLinha.sit}>
              {selLinha.sit === "falta" && `Faltam ${-selLinha.dif} caixas para concluir o que está pedido.`}
              {selLinha.sit === "sobra" && (selLinha.faltaEnviar > 0 ? `Estoque cobre os pedidos e ainda sobram ${selLinha.dif} caixas.` : `Sem pedidos em aberto para este item — ${selLinha.dif} caixas sobrando.`)}
              {selLinha.sit === "ok" && "Estoque exatamente igual ao que está pedido."}
            </div>
            <strong>Pedidos em aberto</strong>
            {!selLinha.pend.length && <p className="muted">Nenhum pedido em aberto para este item.</p>}
            {selLinha.pend.map(({ item, p, enviado, falta }) => (
              <div key={item.id} className="item" style={{ borderTop: "1px solid #eceef3", padding: "8px 0", fontSize: 14 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>Pedido #{p.numero}{admin ? "" : ""}</span>
                  <span className="muted">entrega {fmtData(p.data_entrega)}{p.data_entrega < hojeIso() && <> <span className="badge off">Atrasado</span></>}</span>
                </div>
                <div className="muted">Pedidas {item.caixas} · recebidas pela Cel {item.caixas_recebidas} · já enviadas {enviado} → <strong>faltam enviar {falta}</strong></div>
              </div>
            ))}
            <strong style={{ display: "block", marginTop: 12 }}>Últimas movimentações</strong>
            {movs.filter(m => m.empresa_id === selLinha.empresa_id && m.cadeira_id === selLinha.cadeira_id && m.cor_id === selLinha.cor_id).slice(0, 8).map(m => (
              <div key={m.id} className="muted" style={{ fontSize: 13, padding: "3px 0" }}>{fmtData(m.data)} · {m.tipo === "entrada" ? "Entrada" : "Saída"} {m.tipo === "entrada" ? "+" : "−"}{m.caixas} cx</div>
            ))}
            {!admin && (
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => { setSel(null); abrirForm("entrada", selLinha); }}>Entrada</button>
                <button className="btn primary" onClick={() => { setSel(null); abrirForm("saida", selLinha); }}>Saída</button>
              </div>
            )}
          </div>
        </>
      )}

      {modo && (
        <div className="modal-bg"><form onSubmit={salvar} className="card modal" style={{ display: "grid", gap: 10, maxHeight: "90vh", overflowY: "auto" }}>
          <h2 style={{ margin: 0 }}>{modo === "entrada" ? "Entrada — caixas que ficaram prontas" : "Saída — carregando para entrega"}</h2>
          <label>Cadeira
            <select value={f.cadeira_id} onChange={e => setF({ ...f, cadeira_id: e.target.value, item_id: "" })}>
              <option value="">— escolha —</option>{cadeiras.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label>Tecido
            <select value={f.cor_id} onChange={e => setF({ ...f, cor_id: e.target.value, item_id: "" })}>
              <option value="">— escolha —</option>{cores.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{corTxt(c)}</option>)}
            </select>
          </label>
          <label>Caixas<input type="number" min="1" value={f.caixas} onChange={e => setF({ ...f, caixas: e.target.value })} /></label>
          {modo === "saida" && f.cadeira_id && f.cor_id && <div className="muted">Em estoque: {saldoForm} caixas</div>}
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
                Gerar etiquetas com QR code (uma por caixa) e imprimir
              </label>
            </>
          )}
          <label>Observação (opcional)<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
          {erro && <div className="err">{erro}</div>}
          <div className="row">
            <button className="btn primary" disabled={busy}>{busy ? "Salvando..." : modo === "entrada" ? "Registrar entrada" : f.etiquetas ? "Registrar saída e gerar etiquetas" : "Registrar saída"}</button>
            <button type="button" className="btn" onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </form></div>
      )}

      {imprimir && (
        <div className="print-area" style={{ position: "fixed", inset: 0, overflow: "auto", background: "#fff", zIndex: 90, padding: 16 }}>
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
