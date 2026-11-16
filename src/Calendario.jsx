import { useEffect, useState, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, X } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hojeIso = () => iso(new Date());
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const corTxt = (c) => c ? `Cor ${c.numero}${c.nome ? " – " + c.nome : ""}` : "—";

// cor do evento: aberto=amarelo, parcial=azul, atrasado=vermelho, entregue=verde, cancelado=cinza
function visual(p) {
  if (p.status === "cancelado") return "cancelado";
  if (p.status === "entregue") return "entregue";
  if (p.data_entrega < hojeIso()) return "atrasado";
  return p.status === "parcial" ? "parcial" : "lancado";
}
const NOMES = { lancado: "Pedido lançado", parcial: "Recebido parcial", atrasado: "Atrasado", entregue: "Entregue", cancelado: "Cancelado" };

const css = `
.cal-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.cal-title{font-weight:600;color:#1d4ed8;font-size:17px;min-width:150px;text-align:center}
.seg{display:inline-flex;border:1px solid #d5d9e2;border-radius:999px;padding:3px;background:#fff}
.seg button{border:0;background:none;padding:5px 14px;border-radius:999px;cursor:pointer;font-size:13px}
.seg button.on{background:#1d4ed8;color:#fff}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.chip{border:1px solid #d5d9e2;background:#fff;border-radius:999px;padding:5px 12px;font-size:13px;cursor:pointer}
.chip.on{border-color:#1d4ed8;background:#e8efff;color:#1d4ed8}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#4a5367;margin-bottom:10px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
.lancado .dot,.dot.lancado{background:#f59e0b}.parcial .dot,.dot.parcial{background:#3b82f6}.atrasado .dot,.dot.atrasado{background:#ef4444}.entregue .dot,.dot.entregue{background:#16a34a}
.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid #e3e6ee;border-radius:12px;overflow:hidden;background:#fff}
.gh{background:#eef1f7;text-align:center;font-size:12px;font-weight:600;padding:8px 0;color:#4a5367}
.cell{min-height:92px;border-top:1px solid #eceef3;border-left:1px solid #eceef3;padding:4px;cursor:pointer;overflow:hidden}
.cell:nth-child(7n+8){border-left:0}
.cell.fora{background:#f5f6f9;color:#aab0bf}
.cell.week{min-height:260px}
.cell:hover{background:#f7f9ff}
.dnum{font-size:11px;color:#6b7385;margin-bottom:3px}
.dnum.hoje{color:#1d4ed8;font-weight:700}
.ev{font-size:11px;border-radius:5px;padding:2px 5px;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev.lancado{background:#fef3c7;color:#92400e}.ev.parcial{background:#dbeafe;color:#1e40af}.ev.atrasado{background:#fee2e2;color:#991b1b}.ev.entregue{background:#dcfce7;color:#166534}.ev.cancelado{background:#eceef3;color:#6b7385;text-decoration:line-through}
.mais{font-size:10px;color:#6b7385}
.side-panel{position:fixed;top:0;right:0;bottom:0;width:min(460px,100%);background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.15);z-index:60;overflow-y:auto;padding:18px}
.ped{border:1px solid #eceef3;border-radius:12px;padding:12px;margin-bottom:12px}
.item{border-top:1px solid #eceef3;padding:8px 0;font-size:14px}
.mini{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}
.mini input{padding:6px 8px;font-size:13px;width:90px}
@media(max-width:720px){.cell{min-height:64px}.ev{font-size:10px}.cal-title{min-width:120px}}
`;

export default function Calendario({ perfil }) {
  const podeReceber = perfil.papel === "admin" || perfil.papel === "cel";
  const hoje = new Date();
  const [modo, setModo] = useState("mes");
  const [ref, setRef] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const [pedidos, setPedidos] = useState([]);
  const [itens, setItens] = useState([]);
  const [recs, setRecs] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [cadeiras, setCadeiras] = useState([]);
  const [cores, setCores] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [dia, setDia] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [p, i, r, e, c, co] = await Promise.all([
      supabase.from("pedidos").select("*").order("numero"),
      supabase.from("pedido_itens").select("*"),
      supabase.from("recebimentos").select("*").order("created_at"),
      supabase.from("empresas").select("id,nome").eq("tipo", "terceirizada").order("nome"),
      supabase.from("cadeiras").select("*"),
      supabase.from("cores").select("*")
    ]);
    setCarregando(false);
    const er = [p, i, r, e, c, co].find(x => x.error);
    if (er) return setErro(er.error.message);
    setErro("");
    setPedidos(p.data); setItens(i.data); setRecs(r.data); setEmpresas(e.data); setCadeiras(c.data); setCores(co.data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const nomeEmp = (id) => empresas.find(e => e.id === id)?.nome || "—";
  const caixasDe = (p) => itens.filter(i => i.pedido_id === p.id).reduce((a, i) => a + i.caixas, 0);
  const visiveis = useMemo(() => pedidos.filter(p => !filtro || p.empresa_id === filtro), [pedidos, filtro]);
  const porDia = useMemo(() => {
    const m = {};
    visiveis.forEach(p => { (m[p.data_entrega] ||= []).push(p); });
    return m;
  }, [visiveis]);
  const atrasados = visiveis.filter(p => visual(p) === "atrasado").length;

  // dias exibidos
  let dias = [];
  if (modo === "mes") {
    const ini = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const start = new Date(ini); start.setDate(1 - ini.getDay());
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const total = Math.ceil((ini.getDay() + fim.getDate()) / 7) * 7;
    for (let k = 0; k < total; k++) { const d = new Date(start); d.setDate(start.getDate() + k); dias.push(d); }
  } else {
    const start = new Date(ref); start.setDate(ref.getDate() - ref.getDay());
    for (let k = 0; k < 7; k++) { const d = new Date(start); d.setDate(start.getDate() + k); dias.push(d); }
  }
  const titulo = modo === "mes"
    ? `${MESES[ref.getMonth()]} ${ref.getFullYear()}`
    : `${fmtData(iso(dias[0])).slice(0, 5)} – ${fmtData(iso(dias[6])).slice(0, 5)}/${dias[6].getFullYear()}`;
  const mover = (n) => {
    const d = new Date(ref);
    if (modo === "mes") d.setMonth(d.getMonth() + n, 1); else d.setDate(d.getDate() + 7 * n);
    setRef(d);
  };
  const limite = modo === "mes" ? 3 : 50;

  return (
    <div>
      <style>{css}</style>
      <div className="cal-top">
        <button className="btn sm" onClick={() => mover(-1)}><ChevronLeft size={16} /></button>
        <div className="cal-title">{titulo}</div>
        <button className="btn sm" onClick={() => mover(1)}><ChevronRight size={16} /></button>
        <button className="btn sm" onClick={() => setRef(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))}>Hoje</button>
        <div className="seg">
          <button className={modo === "semana" ? "on" : ""} onClick={() => setModo("semana")}>Semana</button>
          <button className={modo === "mes" ? "on" : ""} onClick={() => setModo("mes")}>Mês</button>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn sm" onClick={carregar}><RefreshCw size={14} /> {carregando ? "..." : "Atualizar"}</button>
        {atrasados > 0 && <span className="badge off"><AlertTriangle size={11} /> {atrasados} atrasado{atrasados > 1 ? "s" : ""}</span>}
      </div>

      {podeReceber && empresas.length > 0 && (
        <div className="chips">
          <button className={"chip" + (!filtro ? " on" : "")} onClick={() => setFiltro("")}>Todos</button>
          {empresas.map(e => <button key={e.id} className={"chip" + (filtro === e.id ? " on" : "")} onClick={() => setFiltro(e.id)}>{e.nome}</button>)}
        </div>
      )}
      <div className="legend">
        {["lancado", "parcial", "atrasado", "entregue"].map(k => <span key={k}><i className={"dot " + k} />{NOMES[k]}</span>)}
      </div>
      {erro && <div className="err" style={{ marginBottom: 10 }}>{erro}</div>}

      <div className="grid">
        {DIAS.map(d => <div key={d} className="gh">{d}</div>)}
        {dias.map(d => {
          const k = iso(d);
          const lista = porDia[k] || [];
          const fora = modo === "mes" && d.getMonth() !== ref.getMonth();
          return (
            <div key={k} className={"cell" + (fora ? " fora" : "") + (modo === "semana" ? " week" : "")} onClick={() => setDia(k)}>
              <div className={"dnum" + (k === hojeIso() ? " hoje" : "")}>{d.getDate()}</div>
              {lista.slice(0, limite).map(p => (
                <div key={p.id} className={"ev " + visual(p)} title={`${nomeEmp(p.empresa_id)} #${p.numero}`}>
                  {podeReceber ? nomeEmp(p.empresa_id) : "Pedido"} #{p.numero} · {caixasDe(p)} cx
                </div>
              ))}
              {lista.length > limite && <div className="mais">+{lista.length - limite} mais — clique para ver</div>}
            </div>
          );
        })}
      </div>

      {dia && (
        <>
          <div className="modal-bg" style={{ background: "rgba(0,0,0,.3)", zIndex: 55 }} onClick={() => setDia(null)} />
          <div className="side-panel">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Entregas de {fmtData(dia)}</h2>
              <button className="btn sm" onClick={() => setDia(null)}><X size={16} /></button>
            </div>
            {!(porDia[dia] || []).length && <p className="muted">Nenhum pedido com entrega neste dia.</p>}
            {(porDia[dia] || []).map(p => (
              <PedidoCard key={p.id} p={p} podeReceber={podeReceber} nomeEmp={nomeEmp}
                itens={itens.filter(i => i.pedido_id === p.id)} recs={recs} cadeiras={cadeiras} cores={cores}
                onMudou={carregar} setErro={setErro} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PedidoCard({ p, podeReceber, nomeEmp, itens, recs, cadeiras, cores, onMudou, setErro }) {
  const [msg, setMsg] = useState("");
  const [novaData, setNovaData] = useState("");
  const v = visual(p);

  async function chamar(fn, args) {
    setMsg("");
    const { error } = await supabase.rpc(fn, args);
    if (error) return setMsg(error.message);
    onMudou();
  }
  async function reagendar() {
    if (!novaData) return;
    const { error } = await supabase.from("pedidos").update({ data_entrega: novaData }).eq("id", p.id);
    if (error) return setMsg(error.message);
    setNovaData(""); onMudou();
  }

  return (
    <div className="ped">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>#{p.numero}{podeReceber && ` — ${nomeEmp(p.empresa_id)}`}</strong>
        <span className={"badge " + (v === "entregue" ? "ok" : v === "atrasado" || v === "cancelado" ? "off" : "")}>{NOMES[v]}</span>
      </div>
      {p.observacao && <div className="muted">Obs.: {p.observacao}</div>}
      {itens.map(i => (
        <ItemLinha key={i.id} i={i} p={p} podeReceber={podeReceber}
          cadeira={cadeiras.find(c => c.id === i.cadeira_id)?.nome || "—"}
          cor={corTxt(cores.find(c => c.id === i.cor_id))}
          recs={recs.filter(r => r.item_id === i.id)} chamar={chamar} />
      ))}
      {msg && <div className="err" style={{ marginTop: 8 }}>{msg}</div>}
      {podeReceber && p.status !== "cancelado" && p.status !== "entregue" && (
        <div className="mini">
          <span className="muted">Nova data de entrega:</span>
          <input type="date" style={{ width: 140 }} value={novaData} onChange={e => setNovaData(e.target.value)} />
          <button className="btn sm" onClick={reagendar}>Alterar</button>
        </div>
      )}
    </div>
  );
}

function ItemLinha({ i, p, podeReceber, cadeira, cor, recs, chamar }) {
  const falta = i.caixas - i.caixas_recebidas;
  const [qtd, setQtd] = useState("");
  const [data, setData] = useState(hojeIso());
  const podeLancar = podeReceber && falta > 0 && p.status !== "cancelado";
  return (
    <div className="item">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span><strong>{cadeira}</strong> · {cor}</span>
        <span>{i.caixas_recebidas}/{i.caixas} cx {falta > 0 && p.status !== "cancelado" && <span className="muted">(faltam {falta})</span>}</span>
      </div>
      {recs.map(r => (
        <div key={r.id} className="muted" style={{ fontSize: 12 }}>
          ✔ {fmtData(r.data_recebimento)}: chegaram {r.caixas} cx{r.observacao ? ` — ${r.observacao}` : ""}
          {podeReceber && <button className="link" style={{ fontSize: 12, marginLeft: 6 }} onClick={() => confirm("Desfazer este recebimento?") && chamar("desfazer_recebimento", { p_id: r.id })}>desfazer</button>}
        </div>
      ))}
      {podeLancar && (
        <div className="mini">
          <input type="number" min="1" max={falta} placeholder="Caixas" value={qtd} onChange={e => setQtd(e.target.value)} />
          <input type="date" style={{ width: 140 }} value={data} onChange={e => setData(e.target.value)} />
          <button className="btn sm primary" onClick={async () => {
            await chamar("registrar_recebimento", { p_item: i.id, p_caixas: parseInt(qtd, 10), p_data: data, p_obs: null });
            setQtd("");
          }}>Registrar chegada</button>
        </div>
      )}
    </div>
  );
}
