import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { Printer, Star } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const corTxt = (c) => c ? `Cor ${c.numero}${c.nome ? " – " + c.nome : ""}` : "—";

const css = `
.print-area{display:none}
.pa-bar{display:flex;gap:8px;margin-bottom:12px}
.labels{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.label{border:1px dashed #888;padding:8px;text-align:center;break-inside:avoid;font-size:12px;background:#fff}
.label img{width:120px;height:120px}
.label b{display:block;font-size:14px}
@media print{
  body *{visibility:hidden}
  .print-area,.print-area *{visibility:visible}
  .print-area{display:block;position:absolute;left:0;top:0;width:100%;background:#fff;padding:0}
  .pa-bar{display:none}
}
`;

function Rotulo({ e }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/?q=${e.token}`, { margin: 1, width: 300 }).then(setSrc);
  }, [e.token]);
  return (
    <div className="label">
      {src && <img src={src} alt="QR" />}
      <b>{e.empresa}</b>
      <div>{e.cadeira} · {e.cor}</div>
      <div>Pedido #{e.pedido} · cód. {e.token.slice(-6).toUpperCase()}</div>
    </div>
  );
}

export default function Etiquetas({ perfil }) {
  const [pedidos, setPedidos] = useState([]);
  const [itens, setItens] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [cadeiras, setCadeiras] = useState([]);
  const [cores, setCores] = useState([]);
  const [etqs, setEtqs] = useState([]);
  const [avals, setAvals] = useState([]);
  const [qtds, setQtds] = useState({});
  const [imprimir, setImprimir] = useState(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("pedidos").select("*").neq("status", "cancelado").order("numero", { ascending: false }),
      supabase.from("pedido_itens").select("*"),
      supabase.from("empresas").select("id,nome"),
      supabase.from("cadeiras").select("*"),
      supabase.from("cores").select("*"),
      supabase.from("etiquetas").select("*").order("created_at"),
      supabase.from("avaliacoes").select("*")
    ]);
    const er = rs.find(r => r.error);
    if (er) return setErro(er.error.message);
    setPedidos(rs[0].data); setItens(rs[1].data); setEmpresas(rs[2].data); setCadeiras(rs[3].data); setCores(rs[4].data); setEtqs(rs[5].data); setAvals(rs[6].data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const emp = (id) => empresas.find(e => e.id === id)?.nome || "—";
  const montar = (lista, item, ped) => lista.map(e => ({
    token: e.token, empresa: emp(e.empresa_id),
    cadeira: cadeiras.find(c => c.id === item.cadeira_id)?.nome || "—",
    cor: corTxt(cores.find(c => c.id === item.cor_id)), pedido: ped.numero
  }));

  async function gerar(item, ped) {
    const n = parseInt(qtds[item.id], 10);
    if (!n || n < 1) return setErro("Digite quantas etiquetas gerar.");
    const { data, error } = await supabase.rpc("gerar_etiquetas", { p_item: item.id, p_qtd: n });
    if (error) return setErro(error.message);
    setErro(""); setQtds({ ...qtds, [item.id]: "" });
    setImprimir(montar(data, item, ped));
    carregar();
  }
  function reimprimir(item, ped, soSemAvaliacao) {
    const avaliadas = new Set(avals.map(a => a.etiqueta_id));
    const lista = etqs.filter(e => e.item_id === item.id && (!soSemAvaliacao || !avaliadas.has(e.id)));
    if (!lista.length) return setErro("Não há etiquetas para imprimir.");
    setImprimir(montar(lista, item, ped));
  }

  const media = avals.length ? (avals.reduce((a, x) => a + x.nota, 0) / avals.length).toFixed(1) : null;

  return (
    <div className="card">
      <style>{css}</style>
      <h2>Etiquetas (QR code)</h2>
      <p className="muted">Gere as etiquetas dos itens de cada pedido e cole nas caixas prontas. Quem ler o QR vê quem fabricou e pode avaliar o produto.</p>
      {perfil.papel === "fornecedor" && (
        <p><Star size={14} color="#f59e0b" fill="#f59e0b" /> Sua nota média: <strong>{media ?? "—"}</strong> {avals.length > 0 && <span className="muted">({avals.length} avaliações)</span>}</p>
      )}
      {erro && <div className="err" style={{ marginBottom: 10 }}>{erro}</div>}
      {!pedidos.length && <p className="muted">Nenhum pedido disponível.</p>}
      {pedidos.map(p => {
        const its = itens.filter(i => i.pedido_id === p.id);
        return (
          <div key={p.id} className="card" style={{ border: "1px solid #eceef3", boxShadow: "none", marginBottom: 10 }}>
            <strong>Pedido #{p.numero}{perfil.papel === "admin" ? ` — ${emp(p.empresa_id)}` : ""}</strong>
            {its.map(i => {
              const ge = etqs.filter(e => e.item_id === i.id);
              const av = ge.filter(e => avals.some(a => a.etiqueta_id === e.id)).length;
              return (
                <div key={i.id} className="item" style={{ borderTop: "1px solid #eceef3", padding: "8px 0" }}>
                  <div>{cadeiras.find(c => c.id === i.cadeira_id)?.nome} · {corTxt(cores.find(c => c.id === i.cor_id))} — {i.caixas} cx
                    <span className="muted"> · {ge.length} etiquetas geradas, {av} avaliadas</span></div>
                  <div className="row" style={{ marginTop: 6 }}>
                    <input type="number" min="1" max="300" placeholder="Qtd" style={{ width: 80 }} value={qtds[i.id] || ""} onChange={e => setQtds({ ...qtds, [i.id]: e.target.value })} />
                    <button className="btn sm primary" onClick={() => gerar(i, p)}>Gerar e imprimir</button>
                    {ge.length > 0 && <button className="btn sm" onClick={() => reimprimir(i, p, true)}>Reimprimir sem avaliação</button>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {imprimir && (
        <div className="print-area" style={{ display: "block", position: "fixed", inset: 0, overflow: "auto", background: "#fff", zIndex: 80, padding: 16 }}>
          <div className="pa-bar">
            <button className="btn primary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
            <button className="btn" onClick={() => setImprimir(null)}>Fechar</button>
          </div>
          <div className="labels">{imprimir.map(e => <Rotulo key={e.token} e={e} />)}</div>
        </div>
      )}
    </div>
  );
}
