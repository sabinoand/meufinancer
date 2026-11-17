import { useState } from "react";
import { Plus, Pencil, Trash2, Printer } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { Kpi, Pill, Modal, fmtData, hoje, epiStatus } from "./rhLib.jsx";

const ST = { venc: ["falta", "Vencido"], avenc: ["amar", "A vencer"], ok: ["ok", "Em dia"], sem: ["sem", "Sem registro"], nao: ["nao", "Não usa"] };

export default function RhEpi({ rh }) {
  const [aba, setAba] = useState("ctrl"); const [fil, setFil] = useState("todos"); const [fSel, setFSel] = useState("");
  const [m, setM] = useState(null); const [f, setF] = useState({}); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  const ativos = rh.funcs.filter(x => !x.demissao); const tipos = rh.epis.filter(e => e.ativo);
  const celulas = ativos.flatMap(fu => tipos.map(e => ({ fu, e, ...epiStatus(rh, fu, e) })));
  const cnt = (s) => celulas.filter(c => c.st === s).length;
  const nomeF = (id) => rh.funcs.find(x => x.id === id)?.nome || "?"; const nomeE = (id) => rh.epis.find(x => x.id === id)?.nome || "?";

  async function guardar(fn) { setBusy(true); const { error } = await fn(); setBusy(false); if (error) return setErro(error.message); setM(null); rh.recarregar(); }
  const salvarTroca = () => guardar(() => supabase.from("rh_epi_trocas").insert({ empresa_id: rh.empresa_id, funcionario_id: m.fu.id, epi_id: m.e.id, data_troca: f.data, assinado: f.assinado, observacao: f.obs.trim() || null }));
  const marcarNaoUsa = () => guardar(() => supabase.from("rh_epi_nao_usa").upsert({ empresa_id: rh.empresa_id, funcionario_id: m.fu.id, epi_id: m.e.id }, { onConflict: "funcionario_id,epi_id" }));
  const voltarUsa = () => guardar(() => supabase.from("rh_epi_nao_usa").delete().eq("funcionario_id", m.fu.id).eq("epi_id", m.e.id));
  function abrirTroca(c) { setErro(""); setF({ data: hoje(), assinado: true, obs: "" }); setM({ k: "troca", fu: c.fu, e: c.e, st: c.st }); }
  function abrirTipo(t) { setErro(""); setF(t ? { id: t.id, nome: t.nome, per: String(t.periodo_meses), ativo: t.ativo } : { nome: "", per: "6", ativo: true }); setM({ k: "tipo" }); }
  async function salvarTipo() {
    const per = parseInt(f.per, 10); if (!f.nome.trim()) return setErro("Informe o nome do EPI."); if (!per || per < 1) return setErro("Informe o período de troca em meses.");
    await guardar(() => f.id ? supabase.from("rh_epi_tipos").update({ nome: f.nome.trim(), periodo_meses: per, ativo: f.ativo }).eq("id", f.id) : supabase.from("rh_epi_tipos").insert({ empresa_id: rh.empresa_id, nome: f.nome.trim(), periodo_meses: per }));
  }
  async function excTipo(t) { if (!confirm(`Excluir o EPI "${t.nome}" e todo o histórico de trocas dele?`)) return; const { error } = await supabase.from("rh_epi_tipos").delete().eq("id", t.id); if (error) alert(error.message); else rh.recarregar(); }
  async function excTroca(t) { if (!confirm("Excluir esta troca?")) return; const { error } = await supabase.from("rh_epi_trocas").delete().eq("id", t.id); if (error) alert(error.message); else rh.recarregar(); }

  const funcsVis = ativos.filter(fu => fil === "todos" || celulas.some(c => c.fu.id === fu.id && c.st === fil));
  const fichaF = rh.funcs.find(x => x.id === fSel);
  return (
    <div>
      <div className="subtabs no-print">{[["ctrl", "Controle"], ["fichas", "Fichas de entrega"], ["tipos", "Tipos de EPI"]].map(([k, n]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{n}</button>)}</div>
      {aba === "ctrl" && <>
        {tipos.length === 0 ? <p className="muted">Cadastre os EPIs (luva, máscara, protetor auricular...) na aba <b>Tipos de EPI</b>, com o período de troca de cada um.</p> : <>
          <div className="kpis"><Kpi t="Vencidos" v={cnt("venc")} c={cnt("venc") ? "verm" : ""} /><Kpi t="A vencer (15 dias)" v={cnt("avenc")} c={cnt("avenc") ? "amar" : ""} /><Kpi t="Sem registro" v={cnt("sem")} /><Kpi t="Em dia" v={cnt("ok")} c="verd" /></div>
          <div className="chips">{[["todos", "Todos"], ["venc", "Vencidos"], ["avenc", "A vencer"], ["sem", "Sem registro"], ["ok", "Em dia"]].map(([k, n]) => <button key={k} className={fil === k ? "on" : ""} onClick={() => setFil(k)}>{n}</button>)}</div>
          {funcsVis.length === 0 && <p className="muted">Nada nesta visão.</p>}
          {funcsVis.map(fu => (
            <div className="item" key={fu.id} style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 150 }}><b>{fu.nome}</b><div className="muted">{fu.funcao || ""}</div></div>
              <div style={{ flex: 1, display: "grid", gap: 6, minWidth: 240 }}>
                {celulas.filter(c => c.fu.id === fu.id && (fil === "todos" || c.st === fil)).map(c => (
                  <div className="row" key={c.e.id} style={{ justifyContent: "space-between" }}>
                    <span>{c.e.nome} <span className="muted">{c.ultimo ? `· última ${fmtData(c.ultimo)} · próxima ${fmtData(c.prox)}` : ""}</span></span>
                    <span className="row"><Pill cls={ST[c.st][0]}>{ST[c.st][1]}</Pill><button className="btn sm" onClick={() => abrirTroca(c)}>{c.st === "nao" ? "Alterar" : "Registrar troca"}</button></span>
                  </div>))}
              </div>
            </div>))}
        </>}
      </>}
      {aba === "fichas" && <>
        <div className="row no-print" style={{ marginBottom: 10 }}><select value={fSel} onChange={e => setFSel(e.target.value)}><option value="">Escolha o funcionário</option>{rh.funcs.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>{fichaF && <button className="btn" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>}</div>
        {fichaF && <div className="folha print-area">
          <h3>FICHA DE ENTREGA DE EPI</h3><h1>{fichaF.nome}</h1><div className="muted">{fichaF.funcao || ""} · admissão {fmtData(fichaF.admissao)}</div>
          <table style={{ marginTop: 10 }}><thead><tr><th>Data</th><th>EPI</th><th>Assinou?</th><th>Obs.</th><th className="no-print"></th></tr></thead>
            <tbody>{rh.trocas.filter(t => t.funcionario_id === fichaF.id).map(t => <tr key={t.id}><td>{fmtData(t.data_troca)}</td><td>{nomeE(t.epi_id)}</td><td>{t.assinado ? "Sim" : "Não"}</td><td>{t.observacao || ""}</td><td className="no-print"><button className="btn sm" onClick={() => excTroca(t)}><Trash2 size={13} /></button></td></tr>)}</tbody></table>
          {!rh.trocas.some(t => t.funcionario_id === fichaF.id) && <p className="muted">Nenhuma entrega registrada.</p>}
          <div style={{ marginTop: 40, borderTop: "1px solid #333", width: 280, paddingTop: 4, fontSize: 13 }}>Assinatura do funcionário</div>
        </div>}
      </>}
      {aba === "tipos" && <>
        <div style={{ marginBottom: 10 }}><button className="btn primary" onClick={() => abrirTipo(null)}><Plus size={14} /> Novo EPI</button></div>
        {rh.epis.length === 0 && <p className="muted">Nenhum EPI cadastrado.</p>}
        {rh.epis.map(t => <div className="item" key={t.id}><div><b>{t.nome}</b><div className="muted">Troca a cada {t.periodo_meses} {t.periodo_meses === 1 ? "mês" : "meses"}{t.ativo ? "" : " · inativo"}</div></div><div className="row"><button className="btn sm" onClick={() => abrirTipo(t)}><Pencil size={13} /></button><button className="btn sm" onClick={() => excTipo(t)}><Trash2 size={13} /></button></div></div>)}
      </>}
      {m?.k === "troca" && <Modal titulo={`${m.e.nome} — ${m.fu.nome}`} onClose={() => setM(null)} onSubmit={m.st === "nao" ? null : salvarTroca} erro={erro} busy={busy} salvar="Registrar troca">
        {m.st === "nao" ? <><div className="muted">Este funcionário está marcado como "não usa" este EPI.</div><button type="button" className="btn" disabled={busy} onClick={voltarUsa}>Voltar a controlar</button></> : <>
          <label>Data da entrega/troca<input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
          <label className="row" style={{ flexDirection: "row", alignItems: "center" }}><input type="checkbox" checked={f.assinado} onChange={e => setF({ ...f, assinado: e.target.checked })} /> Funcionário assinou o recebimento</label>
          <label>Observação<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
          <button type="button" className="link" disabled={busy} onClick={marcarNaoUsa} style={{ textAlign: "left" }}>Este funcionário não usa este EPI</button></>}
      </Modal>}
      {m?.k === "tipo" && <Modal titulo={f.id ? "Editar EPI" : "Novo EPI"} onClose={() => setM(null)} onSubmit={salvarTipo} erro={erro} busy={busy}>
        <label>Nome<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} autoFocus /></label>
        <label>Trocar a cada (meses)<input type="number" min="1" value={f.per} onChange={e => setF({ ...f, per: e.target.value })} /></label>
        {f.id && <label className="row" style={{ flexDirection: "row", alignItems: "center" }}><input type="checkbox" checked={f.ativo} onChange={e => setF({ ...f, ativo: e.target.checked })} /> Ativo</label>}
      </Modal>}
    </div>
  );
}
