import { useEffect, useState, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Trash2, CheckCircle2, PackagePlus } from "lucide-react";
import { supabase } from "./supabaseClient.js";

const UNIDADES = ["un", "m", "m²", "kg", "g", "L", "mL", "rolo", "pacote", "caixa", "lata", "par", "folha"];
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const num = (v) => parseFloat(String(v).replace(",", "."));
const nomeMes = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MESES[m - 1]} ${y}`; };
const somaMes = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const linhaVazia = () => ({ k: Math.random(), descricao: "", qtd: "", un: "un", outra: "", valor: "", est: false, destino: "__novo", grupo: "" });

const css = `
.kpis3{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.kpi{border-radius:12px;padding:12px 14px;background:#f1f4fb}.kpi small{display:block;color:#6b7385;font-size:12px}.kpi b{font-size:20px}
.kpi.bad{background:#fee2e2}.kpi.bad b{color:#991b1b}.kpi.good{background:#dcfce7}.kpi.good b{color:#166534}.kpi.warn{background:#fef3c7}.kpi.warn b{color:#92400e}
.mesbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.mesbar .tit{font-weight:700;font-size:18px;min-width:170px;text-align:center}
.reqrow{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #eceef3;border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer;background:#fff}
.reqrow:hover{border-color:#1d4ed8;background:#f7f9ff}
.sidep{position:fixed;top:0;right:0;bottom:0;width:min(520px,100%);background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,.15);z-index:60;overflow-y:auto;padding:18px}
.linha{border:1px solid #eceef3;border-radius:10px;padding:10px;background:#fff;display:grid;gap:8px}
.wide{max-width:640px !important}
@media(max-width:720px){.kpis3{grid-template-columns:repeat(2,1fr)}}
`;

export default function Requisicoes({ perfil }) {
  const [reqs, setReqs] = useState([]);
  const [itens, setItens] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [mes, setMes] = useState(hojeIso().slice(0, 7));
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null); // {tipo:"form"|"estoque", ...}
  const [f, setF] = useState({});
  const [passo, setPasso] = useState(1);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataPgto, setDataPgto] = useState(hojeIso());

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("requisicoes").select("*").order("data", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("requisicao_itens").select("*").order("created_at"),
      supabase.from("materias").select("*").order("nome"),
      supabase.from("materia_grupos").select("*").order("nome")
    ]);
    const er = rs.find(r => r.error);
    if (er) return setErro(er.error.message);
    setReqs(rs[0].data); setItens(rs[1].data); setMaterias(rs[2].data); setGrupos(rs[3].data);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const itensDe = (id) => itens.filter(i => i.requisicao_id === id);
  const totalReq = (id) => itensDe(id).reduce((a, i) => a + Number(i.total), 0);
  const noMes = useMemo(() => reqs.filter(r => r.data.slice(0, 7) === mes), [reqs, mes]);
  const kMes = noMes.reduce((a, r) => a + totalReq(r.id), 0);
  const kPago = noMes.filter(r => r.paga_em).reduce((a, r) => a + totalReq(r.id), 0);
  const kAberto = kMes - kPago;
  const devendoTotal = reqs.filter(r => !r.paga_em).reduce((a, r) => a + totalReq(r.id), 0);
  const selReq = sel && reqs.find(r => r.id === sel);
  const selItens = selReq ? itensDe(selReq.id) : [];
  const algumNoEstoque = selItens.some(i => i.no_estoque);

  function abrirForm(r) {
    setErro(""); setPasso(1);
    if (r) {
      const its = itensDe(r.id);
      setF({ id: r.id, numero: r.numero, data: r.data, obs: r.observacao || "", linhas: its.map(i => ({
        k: Math.random(), descricao: i.descricao, qtd: String(i.quantidade), un: UNIDADES.includes(i.unidade) ? i.unidade : "__outra",
        outra: UNIDADES.includes(i.unidade) ? "" : i.unidade, valor: String(i.valor_unit), est: false, destino: "__novo", grupo: "" })) });
    } else setF({ numero: "", data: hojeIso(), obs: "", linhas: [linhaVazia()] });
    setModal({ tipo: "form" });
  }
  const setLinha = (k, patch) => setF(x => ({ ...x, linhas: x.linhas.map(l => l.k === k ? { ...l, ...patch } : l) }));
  const unidadeDe = (l) => l.un === "__outra" ? l.outra.trim() : l.un;
  const totalLinha = (l) => { const q = num(l.qtd), v = num(l.valor); return isNaN(q) || isNaN(v) ? 0 : Math.round(q * v * 100) / 100; };
  const totalForm = (f.linhas || []).reduce((a, l) => a + totalLinha(l), 0);

  function validar() {
    if (!f.numero.trim()) return "Informe o número da requisição.";
    if (!f.data) return "Informe a data.";
    for (const l of f.linhas) {
      if (!l.descricao.trim()) return "Preencha a descrição de todos os itens (ou remova a linha vazia).";
      const q = num(l.qtd), v = num(l.valor);
      if (isNaN(q) || q <= 0) return `Informe a quantidade de "${l.descricao}".`;
      if (isNaN(v) || v < 0) return `Informe o valor unitário de "${l.descricao}".`;
      if (!unidadeDe(l)) return `Informe a unidade de "${l.descricao}".`;
    }
    return "";
  }
  function continuar(e) {
    e.preventDefault();
    const m = validar(); if (m) return setErro(m);
    setErro("");
    if (f.id) return salvar(false);
    // pré-seleciona item de estoque com o mesmo nome, se existir
    setF(x => ({ ...x, linhas: x.linhas.map(l => {
      const igual = materias.find(m => m.ativo && m.nome.trim().toLowerCase() === l.descricao.trim().toLowerCase());
      return { ...l, destino: igual ? igual.id : "__novo" };
    }) }));
    setPasso(2);
  }

  async function enviarParaEstoque(item, destino, grupo) {
    let materiaId = destino;
    if (destino === "__novo") {
      const ja = materias.find(m => m.nome.trim().toLowerCase() === item.descricao.trim().toLowerCase());
      if (ja) materiaId = ja.id;
      else {
        const { data, error } = await supabase.from("materias").insert({
          empresa_id: perfil.empresa_id, nome: item.descricao.trim(), unidade: item.unidade, valor: item.valor_unit, minimo: 0, grupo_id: grupo || null
        }).select().single();
        if (error) return `“${item.descricao}”: ${error.message}`;
        materiaId = data.id;
      }
    }
    const { error } = await supabase.rpc("requisicao_item_para_estoque", { p_item: item.id, p_materia: materiaId });
    return error ? `“${item.descricao}”: ${error.message}` : null;
  }

  async function salvar(comEstoque) {
    const m = validar(); if (m) return setErro(m);
    setBusy(true); setErro("");
    const cab = { numero: f.numero.trim(), data: f.data, observacao: f.obs.trim() || null };
    let reqId = f.id;
    if (f.id) {
      const { error } = await supabase.from("requisicoes").update(cab).eq("id", f.id);
      if (error) { setBusy(false); return setErro(/duplicate|unique/i.test(error.message) ? "Já existe uma requisição com esse número." : error.message); }
      const { error: ed } = await supabase.from("requisicao_itens").delete().eq("requisicao_id", f.id);
      if (ed) { setBusy(false); return setErro(ed.message); }
    } else {
      const { data, error } = await supabase.from("requisicoes").insert({ ...cab, empresa_id: perfil.empresa_id }).select().single();
      if (error) { setBusy(false); setPasso(1); return setErro(/duplicate|unique/i.test(error.message) ? "Já existe uma requisição com esse número." : error.message); }
      reqId = data.id;
    }
    const { data: novos, error: ei } = await supabase.from("requisicao_itens").insert(
      f.linhas.map(l => ({ requisicao_id: reqId, empresa_id: perfil.empresa_id, descricao: l.descricao.trim(), quantidade: num(l.qtd), unidade: unidadeDe(l), valor_unit: num(l.valor) }))
    ).select();
    if (ei) { setBusy(false); return setErro(ei.message); }
    const falhas = []; let enviados = 0;
    if (comEstoque) {
      // o insert devolve os itens na mesma ordem das linhas
      for (let idx = 0; idx < f.linhas.length; idx++) {
        const l = f.linhas[idx]; if (!l.est) continue;
        const r = await enviarParaEstoque(novos[idx], l.destino, l.grupo);
        if (r) falhas.push(r); else enviados++;
      }
    }
    setBusy(false); setModal(null); setMes(f.data.slice(0, 7)); setSel(reqId);
    setAviso(falhas.length ? `Requisição salva, mas alguns itens não entraram no estoque: ${falhas.join(" · ")}` : enviados ? `Requisição salva e ${enviados} ${enviados === 1 ? "item lançado" : "itens lançados"} no estoque.` : "Requisição salva.");
    carregar();
  }

  function abrirEstoque(item) {
    const igual = materias.find(m => m.ativo && m.nome.trim().toLowerCase() === item.descricao.trim().toLowerCase());
    setF({ item, destino: igual ? igual.id : "__novo", grupo: "" }); setErro(""); setModal({ tipo: "estoque" });
  }
  async function confirmarEstoque(e) {
    e.preventDefault(); setBusy(true);
    const r = await enviarParaEstoque(f.item, f.destino, f.grupo);
    setBusy(false);
    if (r) return setErro(r);
    setModal(null); setAviso(`“${f.item.descricao}” lançado no estoque.`); carregar();
  }
  async function pagar(pago) {
    const { error } = await supabase.from("requisicoes").update({ paga_em: pago ? dataPgto : null }).eq("id", selReq.id);
    if (error) setErro(error.message); else { setErro(""); carregar(); }
  }
  async function excluir() {
    if (!confirm(`Excluir a requisição ${selReq.numero}? Não dá para desfazer.`)) return;
    const { error } = await supabase.from("requisicoes").delete().eq("id", selReq.id);
    if (error) return setErro(error.message);
    setSel(null); setErro(""); carregar();
  }

  const seletorDestino = (valor, onChange, itemNome, grupo, onGrupo) => (
    <>
      <select value={valor} onChange={e => onChange(e.target.value)}>
        <option value="__novo">Criar novo item “{itemNome}” no estoque</option>
        {materias.filter(m => m.ativo).map(m => <option key={m.id} value={m.id}>Somar em: {m.nome} ({m.unidade})</option>)}
      </select>
      {valor === "__novo" && grupos.length > 0 && (
        <select value={grupo} onChange={e => onGrupo(e.target.value)}>
          <option value="">Sem grupo</option>{grupos.map(g => <option key={g.id} value={g.id}>Grupo: {g.nome}</option>)}
        </select>
      )}
    </>
  );

  return (
    <div className="card">
      <style>{css}</style>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h2 style={{ margin: 0 }}>Requisições</h2><div className="muted">Material retirado na Cel Móveis e o valor devido</div></div>
        <button className="btn primary" onClick={() => abrirForm(null)}><Plus size={14} /> Nova requisição</button>
      </div>
      {aviso && <div className="ok" style={{ background: "#dcfce7", color: "#166534", padding: "8px 12px", borderRadius: 8, margin: "12px 0" }}>{aviso} <button className="link" onClick={() => setAviso("")}>fechar</button></div>}
      {erro && !modal && <div className="err" style={{ margin: "12px 0" }}>{erro}</div>}

      <div className="kpis3" style={{ marginTop: 14 }}>
        <div className={"kpi " + (devendoTotal > 0 ? "bad" : "good")}><small>Total devendo à Cel (todos os meses)</small><b>{brl(devendoTotal)}</b></div>
        <div className="kpi"><small>Requisitado em {nomeMes(mes)}</small><b>{brl(kMes)}</b></div>
        <div className="kpi good"><small>Pago no mês</small><b>{brl(kPago)}</b></div>
        <div className={"kpi " + (kAberto > 0 ? "warn" : "")}><small>Em aberto no mês</small><b>{brl(kAberto)}</b></div>
      </div>

      <div className="mesbar">
        <button className="btn sm" onClick={() => setMes(somaMes(mes, -1))}><ChevronLeft size={16} /></button>
        <div className="tit">{nomeMes(mes)}</div>
        <button className="btn sm" onClick={() => setMes(somaMes(mes, 1))}><ChevronRight size={16} /></button>
        <button className="btn sm" onClick={() => setMes(hojeIso().slice(0, 7))}>Mês atual</button>
        <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} style={{ padding: "5px 8px" }} />
      </div>

      {!noMes.length && <p className="muted">Nenhuma requisição neste mês.</p>}
      {noMes.map(r => (
        <div key={r.id} className="reqrow" onClick={() => { setSel(r.id); setErro(""); }}>
          <div>
            <strong>Requisição {r.numero}</strong>
            <div className="muted">{fmtData(r.data)} · {itensDe(r.id).length} {itensDe(r.id).length === 1 ? "item" : "itens"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>{brl(totalReq(r.id))}</strong>
            <div><span className={"badge " + (r.paga_em ? "ok" : "off")}>{r.paga_em ? `Paga em ${fmtData(r.paga_em)}` : "Em aberto"}</span></div>
          </div>
        </div>
      ))}

      {selReq && (
        <>
          <div className="modal-bg" style={{ background: "rgba(0,0,0,.3)", zIndex: 55 }} onClick={() => setSel(null)} />
          <div className="sidep">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><h2 style={{ margin: 0 }}>Requisição {selReq.numero}</h2><div className="muted">{fmtData(selReq.data)}</div></div>
              <button className="btn sm" onClick={() => setSel(null)}><X size={16} /></button>
            </div>
            {erro && <div className="err" style={{ marginTop: 10 }}>{erro}</div>}
            <table style={{ marginTop: 12 }}>
              <thead><tr><th>Descrição</th><th style={{ textAlign: "right" }}>Qtd</th><th style={{ textAlign: "right" }}>Unit.</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {selItens.map(i => (
                  <tr key={i.id}>
                    <td>{i.descricao}
                      <div style={{ marginTop: 3 }}>{i.no_estoque
                        ? <span className="badge ok">✓ No estoque</span>
                        : <button className="btn sm" onClick={() => abrirEstoque(i)}><PackagePlus size={13} /> Adicionar ao estoque</button>}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>{qtd(i.quantidade)} {i.unidade}</td>
                    <td style={{ textAlign: "right" }}>{brl(i.valor_unit)}</td>
                    <td style={{ textAlign: "right" }}>{brl(i.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan="3" style={{ textAlign: "right" }}><strong>Total da requisição</strong></td><td style={{ textAlign: "right" }}><strong>{brl(totalReq(selReq.id))}</strong></td></tr></tfoot>
            </table>
            {selReq.observacao && <p className="muted">Obs.: {selReq.observacao}</p>}

            <div className="card" style={{ background: "#f8f9fc", boxShadow: "none", marginTop: 12 }}>
              {selReq.paga_em ? (
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span><CheckCircle2 size={16} color="#16a34a" style={{ verticalAlign: "-3px" }} /> Paga em {fmtData(selReq.paga_em)}</span>
                  <button className="btn sm" onClick={() => pagar(false)}>Desmarcar pagamento</button>
                </div>
              ) : (
                <div className="row">
                  <span>Pago à Cel em:</span>
                  <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)} style={{ padding: "6px 8px" }} />
                  <button className="btn sm primary" onClick={() => pagar(true)}>Marcar como paga</button>
                </div>
              )}
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn" disabled={algumNoEstoque} title={algumNoEstoque ? "Há itens já lançados no estoque" : ""} onClick={() => abrirForm(selReq)}><Pencil size={14} /> Editar</button>
              <button className="btn" style={{ color: "#b42318" }} disabled={algumNoEstoque} onClick={excluir}><Trash2 size={14} /> Excluir</button>
            </div>
            {algumNoEstoque && <p className="muted" style={{ fontSize: 12 }}>Para editar ou excluir, antes desfaça a entrada desses itens no Estoque de matéria-prima.</p>}
          </div>
        </>
      )}

      {modal?.tipo === "form" && (
        <div className="modal-bg"><form onSubmit={passo === 1 ? continuar : e => e.preventDefault()} className="card modal wide" style={{ display: "grid", gap: 10, maxHeight: "92vh", overflowY: "auto" }}>
          <h2 style={{ margin: 0 }}>{f.id ? `Editar requisição ${f.numero}` : passo === 1 ? "Nova requisição" : "Colocar no estoque?"}</h2>

          {passo === 1 && (
            <>
              <div className="row">
                <label style={{ flex: 1, minWidth: 140 }}>Nº da requisição<input value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} placeholder="Ex.: 14044" autoFocus /></label>
                <label style={{ flex: 1, minWidth: 140 }}>Data<input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
              </div>
              <strong>Itens da requisição</strong>
              {f.linhas.map(l => (
                <div key={l.k} className="linha">
                  <input placeholder="Descrição (ex.: Lata de cola)" value={l.descricao} onChange={e => setLinha(l.k, { descricao: e.target.value })} />
                  <div className="row">
                    <input type="number" step="any" min="0" placeholder="Qtd" style={{ width: 90 }} value={l.qtd} onChange={e => setLinha(l.k, { qtd: e.target.value })} />
                    <select value={l.un} onChange={e => setLinha(l.k, { un: e.target.value })}>{UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}<option value="__outra">Outra...</option></select>
                    {l.un === "__outra" && <input placeholder="Unidade" style={{ width: 90 }} value={l.outra} onChange={e => setLinha(l.k, { outra: e.target.value })} />}
                    <input type="number" step="any" min="0" placeholder="Valor unit. R$" style={{ width: 130 }} value={l.valor} onChange={e => setLinha(l.k, { valor: e.target.value })} />
                    <strong style={{ marginLeft: "auto" }}>{brl(totalLinha(l))}</strong>
                    {f.linhas.length > 1 && <button type="button" className="btn sm" onClick={() => setF(x => ({ ...x, linhas: x.linhas.filter(y => y.k !== l.k) }))}>Remover</button>}
                  </div>
                </div>
              ))}
              <div><button type="button" className="btn sm" onClick={() => setF(x => ({ ...x, linhas: [...x.linhas, linhaVazia()] }))}>+ Adicionar item</button></div>
              <label>Observação (opcional)<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
              <div className="kpi" style={{ textAlign: "right" }}><small>Total da requisição</small><b>{brl(totalForm)}</b></div>
              {erro && <div className="err">{erro}</div>}
              <div className="row">
                <button className="btn primary">{f.id ? "Salvar alterações" : "Continuar"}</button>
                <button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button>
              </div>
            </>
          )}

          {passo === 2 && (
            <>
              <div className="kpi"><small>Requisição {f.numero} · {fmtData(f.data)}</small><b>Total: {brl(totalForm)}</b></div>
              <p className="muted" style={{ margin: 0 }}>Marque os itens que você quer colocar no estoque de matéria-prima. Os que não marcar ficam só na requisição (dá para adicionar depois).</p>
              {f.linhas.map(l => (
                <div key={l.k} className="linha">
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={l.est} onChange={e => setLinha(l.k, { est: e.target.checked })} />
                    <span><strong>{l.descricao}</strong> — {qtd(num(l.qtd))} {unidadeDe(l)} · {brl(totalLinha(l))}</span>
                  </label>
                  {l.est && seletorDestino(l.destino, v => setLinha(l.k, { destino: v }), l.descricao, l.grupo, v => setLinha(l.k, { grupo: v }))}
                </div>
              ))}
              {erro && <div className="err">{erro}</div>}
              <div className="row">
                <button type="button" className="btn primary" disabled={busy || !f.linhas.some(l => l.est)} onClick={() => salvar(true)}>{busy ? "Salvando..." : "Salvar e adicionar marcados ao estoque"}</button>
                <button type="button" className="btn" disabled={busy} onClick={() => salvar(false)}>Salvar sem adicionar ao estoque</button>
                <button type="button" className="btn" disabled={busy} onClick={() => setPasso(1)}>Voltar</button>
              </div>
            </>
          )}
        </form></div>
      )}

      {modal?.tipo === "estoque" && (
        <div className="modal-bg"><form onSubmit={confirmarEstoque} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Adicionar ao estoque</h2>
          <div><strong>{f.item.descricao}</strong><div className="muted">{qtd(f.item.quantidade)} {f.item.unidade} · {brl(f.item.valor_unit)} cada</div></div>
          {seletorDestino(f.destino, v => setF({ ...f, destino: v }), f.item.descricao, f.grupo, v => setF({ ...f, grupo: v }))}
          <div className="muted" style={{ fontSize: 12 }}>Entra como compra: soma a quantidade e atualiza o valor do item para {brl(f.item.valor_unit)}.</div>
          {erro && <div className="err">{erro}</div>}
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? "Salvando..." : "Adicionar"}</button><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button></div>
        </form></div>
      )}
    </div>
  );
}
