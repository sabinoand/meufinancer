import { useState } from "react";
import { supabase } from "./supabaseClient.js";
import { Kpi, Pill, Modal, fmtData, hoje, situacao, experiencia, addDias } from "./rhLib.jsx";

export default function RhExperiencia({ rh, sub }) {
  const aba = sub === "exp_hist" ? "hist" : "pend"; const [m, setM] = useState(null); const [f, setF] = useState({}); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  const pend = rh.funcs.filter(x => !x.demissao && x.exp_status === "pendente").sort((a, b) => experiencia(a).dias - experiencia(b).dias);
  const aval = rh.funcs.filter(x => x.exp_nota || x.exp_obs).sort((a, b) => b.admissao.localeCompare(a.admissao));
  const venc = pend.filter(x => experiencia(x).venc).length, perto = pend.filter(x => !experiencia(x).venc && experiencia(x).dias <= 10).length;
  function abrir(x) { setErro(""); setF({ nota: x.exp_nota || 5, obs: x.exp_obs || "", saida: hoje() }); setM(x); }
  async function efetivar() {
    setBusy(true);
    const { error } = await supabase.from("rh_funcionarios").update({ exp_status: "efetivado", exp_nota: Number(f.nota), exp_obs: f.obs.trim() || null }).eq("id", m.id);
    setBusy(false); if (error) return setErro(error.message); setM(null); rh.recarregar();
  }
  async function encerrar() {
    if (!f.saida || f.saida < m.admissao) return setErro("Informe uma data de saída válida.");
    if (!confirm(`Encerrar o contrato de ${m.nome} em ${fmtData(f.saida)} (fim da experiência)?`)) return;
    setBusy(true);
    const { error } = await supabase.from("rh_funcionarios").update({ demissao: f.saida, tipo_deslig: "fim_experiencia", motivo: f.obs.trim() || null, exp_nota: Number(f.nota), exp_obs: f.obs.trim() || null }).eq("id", m.id);
    setBusy(false); if (error) return setErro(error.message); setM(null); rh.recarregar();
  }
  return (
    <div>
      <div className="kpis"><Kpi t="Em experiência" v={pend.length} /><Kpi t="Terminando em 10 dias" v={perto} c={perto ? "amar" : ""} /><Kpi t="Prazo encerrado s/ avaliação" v={venc} c={venc ? "verm" : ""} /></div>
      
      <p className="muted">Contrato de experiência: 45 dias + 45 dias (total 90).</p>
      {aba === "pend" && (pend.length === 0 ? <p className="muted">Ninguém em experiência.</p> : pend.map(x => { const e = experiencia(x); return (
        <div className="item" key={x.id}>
          <div><b>{x.nome}</b><div className="muted">Admissão {fmtData(x.admissao)} · {e.fase}</div></div>
          <div className="muted">{e.venc ? <Pill cls="falta">Avaliar agora</Pill> : <>Vence em {fmtData(e.fim)} <Pill cls={e.dias <= 10 ? "amar" : "ok"}>{e.dias} {e.dias === 1 ? "dia" : "dias"}</Pill></>}</div>
          <button className="btn sm primary" onClick={() => abrir(x)}>Avaliar</button>
        </div>); }))}
      {aba === "hist" && (aval.length === 0 ? <p className="muted">Nenhuma avaliação ainda.</p> : aval.map(x => <div className="item" key={x.id}><div><b>{x.nome}</b><div className="muted">{x.exp_obs || "Sem observação"}</div></div><div>{"★".repeat(x.exp_nota || 0)}{"☆".repeat(5 - (x.exp_nota || 0))} <Pill cls={situacao(x).cls}>{x.demissao ? "Encerrado" : "Efetivado"}</Pill></div><button className="btn sm" onClick={() => abrir(x)}>Ver</button></div>))}
      {m && <Modal titulo={`Avaliar ${m.nome}`} onClose={() => setM(null)} erro={erro}>
        <label>Nota (1 a 5)<select value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} — {"★".repeat(n)}</option>)}</select></label>
        <label>Observações<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
        <label>Data de saída (só se for encerrar)<input type="date" value={f.saida} onChange={e => setF({ ...f, saida: e.target.value })} /></label>
        <div className="row"><button type="button" className="btn primary" disabled={busy} onClick={efetivar}>Efetivar</button><button type="button" className="btn" disabled={busy} onClick={encerrar}>Encerrar contrato</button></div>
      </Modal>}
    </div>
  );
}
