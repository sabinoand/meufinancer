import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { Kpi, Pill, Modal, fmtData, hoje, diasEntre, TIPOS_AUS } from "./rhLib.jsx";

const ABAS = { todos: ["Todos", null], atestado: ["Atestados", ["atestado"]], fer: ["Férias e folgas", ["ferias", "folga"]], falta: ["Faltas", ["falta", "falta_just"]], afast: ["Afastamentos", ["afastamento"]] };
const COR = { atestado: "amar", ferias: "ok", folga: "ok", falta: "falta", falta_just: "cinza", afastamento: "sem" };

export default function RhAusencias({ rh }) {
  const [aba, setAba] = useState("todos"); const [mes, setMes] = useState(hoje().slice(0, 7)); const [func, setFunc] = useState("");
  const [m, setM] = useState(false); const [f, setF] = useState({}); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  const nome = (id) => rh.funcs.find(x => x.id === id)?.nome || "?";
  const dias = (a) => diasEntre(a.data_ini, a.data_fim) + 1;
  const h = hoje();
  const doMes = rh.aus.filter(a => a.data_ini.slice(0, 7) <= mes && a.data_fim.slice(0, 7) >= mes);
  const lista = doMes.filter(a => (!ABAS[aba][1] || ABAS[aba][1].includes(a.tipo)) && (!func || a.funcionario_id === func)).sort((a, b) => b.data_ini.localeCompare(a.data_ini));
  const hoje_ = rh.aus.filter(a => a.data_ini <= h && a.data_fim >= h).length;
  function abrir(a) {
    setErro("");
    setF(a ? { id: a.id, funcionario_id: a.funcionario_id, tipo: a.tipo, data_ini: a.data_ini, data_fim: a.data_fim, cid: a.cid || "", obs: a.observacao || "" }
      : { funcionario_id: "", tipo: aba === "fer" ? "ferias" : aba === "falta" ? "falta" : aba === "afast" ? "afastamento" : "atestado", data_ini: h, data_fim: h, cid: "", obs: "" });
    setM(true);
  }
  async function salvar() {
    if (!f.funcionario_id) return setErro("Escolha o funcionário.");
    if (!f.data_ini || !f.data_fim || f.data_fim < f.data_ini) return setErro("Confira as datas.");
    setBusy(true);
    const d = { funcionario_id: f.funcionario_id, tipo: f.tipo, data_ini: f.data_ini, data_fim: f.data_fim, cid: f.tipo === "atestado" || f.tipo === "afastamento" ? (f.cid.trim() || null) : null, observacao: f.obs.trim() || null };
    const { error } = f.id ? await supabase.from("rh_ausencias").update(d).eq("id", f.id) : await supabase.from("rh_ausencias").insert({ ...d, empresa_id: rh.empresa_id });
    setBusy(false); if (error) return setErro(error.message); setM(false); rh.recarregar();
  }
  async function excluir(a) {
    if (!confirm("Excluir este registro?")) return;
    const { error } = await supabase.from("rh_ausencias").delete().eq("id", a.id); if (error) alert(error.message); else rh.recarregar();
  }
  const cont = (tipos) => doMes.filter(a => tipos.includes(a.tipo)).length;
  return (
    <div>
      <div className="kpis"><Kpi t="Atestados no mês" v={cont(["atestado"])} /><Kpi t="Faltas no mês" v={cont(["falta", "falta_just"])} c={cont(["falta"]) ? "verm" : ""} /><Kpi t="Férias/folgas no mês" v={cont(["ferias", "folga"])} /><Kpi t="Fora hoje" v={hoje_} /></div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} />
        <select value={func} onChange={e => setFunc(e.target.value)}><option value="">Todos os funcionários</option>{rh.funcs.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        <button className="btn primary" onClick={() => abrir(null)}><Plus size={14} /> Novo registro</button>
      </div>
      <div className="chips">{Object.entries(ABAS).map(([k, [n]]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{n}</button>)}</div>
      {lista.length === 0 && <p className="muted">Nenhum registro neste mês.</p>}
      {lista.map(a => (
        <div className="item" key={a.id}>
          <div><b>{nome(a.funcionario_id)}</b><div className="muted">{fmtData(a.data_ini)}{a.data_fim !== a.data_ini ? ` a ${fmtData(a.data_fim)}` : ""} · {dias(a)} {dias(a) === 1 ? "dia" : "dias"}{a.cid ? ` · CID ${a.cid}` : ""}{a.observacao ? ` · ${a.observacao}` : ""}</div></div>
          <div className="row"><Pill cls={COR[a.tipo]}>{TIPOS_AUS[a.tipo]}</Pill><button className="btn sm" onClick={() => abrir(a)} aria-label="Editar"><Pencil size={13} /></button><button className="btn sm" onClick={() => excluir(a)} aria-label="Excluir"><Trash2 size={13} /></button></div>
        </div>))}
      {m && <Modal titulo={f.id ? "Editar registro" : "Novo registro"} onClose={() => setM(false)} onSubmit={salvar} erro={erro} busy={busy}>
        <label>Funcionário<select value={f.funcionario_id} onChange={e => setF({ ...f, funcionario_id: e.target.value })}><option value="">Selecione</option>{rh.funcs.filter(x => !x.demissao || x.id === f.funcionario_id).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label>Tipo<select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS_AUS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <div className="g2"><label>Início<input type="date" value={f.data_ini} onChange={e => setF({ ...f, data_ini: e.target.value, data_fim: f.data_fim < e.target.value ? e.target.value : f.data_fim })} /></label><label>Fim<input type="date" value={f.data_fim} onChange={e => setF({ ...f, data_fim: e.target.value })} /></label></div>
        {(f.tipo === "atestado" || f.tipo === "afastamento") && <label>CID (opcional)<input value={f.cid} onChange={e => setF({ ...f, cid: e.target.value })} /><span className="muted" style={{ fontSize: 12 }}>É um dado de saúde (sensível pela LGPD). Preencha só se for realmente necessário.</span></label>}
        <label>Observação<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
        <div className="muted">Os dias deste registro aparecem automaticamente no cartão de ponto.</div>
      </Modal>}
    </div>
  );
}
