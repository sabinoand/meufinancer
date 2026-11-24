import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { Kpi, Pill, Modal, fmtData, hoje, addMeses, examesAtuais, exameStatus, diasEntre } from "./rhLib.jsx";

const TIPOS = ["Admissional", "Periódico", "Retorno ao trabalho", "Mudança de função", "Demissional"];
const ST = { venc: ["falta", "Vencido"], avenc: ["amar", "Vence em breve"], ok: ["ok", "Em dia"], semval: ["cinza", "Sem validade"] };

export default function RhExames({ rh }) {
  const [fil, setFil] = useState("todos"); const [m, setM] = useState(false); const [f, setF] = useState({}); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  const nome = (id) => rh.funcs.find(x => x.id === id)?.nome || "?";
  const atuais = examesAtuais(rh).filter(e => { const fu = rh.funcs.find(x => x.id === e.funcionario_id); return fu && !fu.demissao; });
  const ids = new Set(atuais.map(e => e.id));
  const ativos = rh.funcs.filter(x => !x.demissao);
  const sem = ativos.filter(x => !rh.exames.some(e => e.funcionario_id === x.id));
  const cnt = (s) => atuais.filter(e => exameStatus(e) === s).length;
  const lista = [...rh.exames].filter(e => ids.has(e.id) && (fil === "todos" || exameStatus(e) === fil)).sort((a, b) => (a.validade || "9999").localeCompare(b.validade || "9999"));
  function abrir(fid) { setErro(""); setF({ funcionario_id: fid || "", tipo: "Periódico", realizado_em: hoje(), validade: addMeses(hoje(), 12), obs: "" }); setM(true); }
  function mudaTipo(t, data) { setF(x => ({ ...x, tipo: t, validade: ["Periódico", "Admissional"].includes(t) ? addMeses(data || x.realizado_em, 12) : x.validade })); }
  async function salvar() {
    if (!f.funcionario_id) return setErro("Escolha o funcionário.");
    if (!f.tipo.trim()) return setErro("Informe o tipo do exame.");
    if (f.validade && f.validade < f.realizado_em) return setErro("A validade não pode ser antes da realização.");
    setBusy(true);
    const { error } = await supabase.from("rh_exames").insert({ empresa_id: rh.empresa_id, funcionario_id: f.funcionario_id, tipo: f.tipo.trim(), realizado_em: f.realizado_em, validade: f.validade || null, observacao: f.obs.trim() || null });
    setBusy(false); if (error) return setErro(error.message); setM(false); rh.recarregar();
  }
  async function excluir(e) { if (!confirm("Excluir este exame?")) return; const { error } = await supabase.from("rh_exames").delete().eq("id", e.id); if (error) alert(error.message); else rh.recarregar(); }
  return (
    <div>
      <div className="kpis"><Kpi t="Vencidos" v={cnt("venc")} c={cnt("venc") ? "verm" : ""} /><Kpi t="Vencem em 30 dias" v={cnt("avenc")} c={cnt("avenc") ? "amar" : ""} /><Kpi t="Em dia" v={cnt("ok")} c="verd" /><Kpi t="Sem exame registrado" v={sem.length} /></div>
      <div className="row" style={{ marginBottom: 10, justifyContent: "space-between" }}>
        <div className="chips" style={{ margin: 0 }}>{[["todos", "Todos"], ["venc", "Vencidos"], ["avenc", "A vencer"], ["ok", "Em dia"]].map(([k, n]) => <button key={k} className={fil === k ? "on" : ""} onClick={() => setFil(k)}>{n}</button>)}</div>
        <button className="btn primary" onClick={() => abrir("")}><Plus size={14} /> Registrar exame</button>
      </div>
      {sem.length > 0 && <div className="alerta"><span>Sem exame registrado: {sem.map(x => x.nome).join(", ")}</span></div>}
      {lista.length === 0 && <p className="muted">Nenhum exame nesta visão.</p>}
      {lista.map(e => { const s = exameStatus(e); return (
        <div className="item" key={e.id}>
          <div><b>{nome(e.funcionario_id)}</b><div className="muted">{e.tipo} · realizado em {fmtData(e.realizado_em)}{e.observacao ? ` · ${e.observacao}` : ""}</div></div>
          <div className="row"><span className="muted">{e.validade ? `Validade ${fmtData(e.validade)}${s === "venc" ? ` (${-diasEntre(hoje(), e.validade)} dias atrás)` : ""}` : ""}</span><Pill cls={ST[s][0]}>{ST[s][1]}</Pill>
            <button className="btn sm" onClick={() => excluir(e)} aria-label="Excluir"><Trash2 size={13} /></button></div>
        </div>); })}
      {m && <Modal titulo="Registrar exame" onClose={() => setM(false)} onSubmit={salvar} erro={erro} busy={busy}>
        <label>Funcionário<select value={f.funcionario_id} onChange={e => setF({ ...f, funcionario_id: e.target.value })}><option value="">Selecione</option>{ativos.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label>Tipo<input list="tiposex" value={f.tipo} onChange={e => mudaTipo(e.target.value)} /><datalist id="tiposex">{TIPOS.map(t => <option key={t} value={t} />)}</datalist></label>
        <div className="g2"><label>Realizado em<input type="date" value={f.realizado_em} onChange={e => { setF({ ...f, realizado_em: e.target.value }); mudaTipo(f.tipo, e.target.value); }} /></label><label>Validade<input type="date" value={f.validade} onChange={e => setF({ ...f, validade: e.target.value })} /></label></div>
        <label>Observação<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
        <div className="muted">Um novo exame do mesmo tipo substitui o anterior no controle de vencimento.</div>
      </Modal>}
    </div>
  );
}
