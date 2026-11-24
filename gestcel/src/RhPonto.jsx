import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Printer, Save } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { ausDoDia, ocDeAus, Kpi, Pill, fmtData, hoje, hm, hmS, toDate, DIAS, MESES, OCORR, calcDia, diasDoMes, resumoPeriodo, buscarTudo, pad, iso, addDias, minToTime, tempoEmpresa } from "./rhLib.jsx";

const OPCOES = ["normal", "falta", "falta_just", "atestado", "ferias", "folga", "feriado", "compensacao"];
const AUS_OC = ["falta", "falta_just", "atestado", "ferias", "folga"];
const vazio = (r) => !r.e1 && !r.s1 && !r.e2 && !r.s2 && r.ocorrencia === "normal" && !r.observacao;

export default function RhPonto({ rh, sub, irPara }) {
  const aba = sub === "ponto_res" ? "res" : "ind"; const [mes, setMes] = useState(hoje().slice(0, 7));
  const ativosMes = (m) => rh.funcs.filter(f => f.admissao.slice(0, 7) <= m && (!f.demissao || f.demissao.slice(0, 7) >= m));
  const lista = ativosMes(mes);
  const [fid, setFid] = useState("");
  const func = rh.funcs.find(x => x.id === fid) || lista[0];
  const [pontoMes, setPontoMes] = useState([]); const [acum, setAcum] = useState(null); const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState({}); const [busy, setBusy] = useState(false); const [erro, setErro] = useState(""); const [ok, setOk] = useState("");
  const [pad4, setPad4] = useState({ e1: "07:30", s1: "11:30", e2: "12:30", s2: "17:18" }); const [fer, setFer] = useState(hoje());
  const dias = useMemo(() => diasDoMes(mes), [mes]);
  const [y, mo] = mes.split("-").map(Number);

  useEffect(() => { // ponto do mês de todos
    let vivo = true;
    buscarTudo(() => supabase.from("rh_ponto").select("*").gte("data", dias[0]).lte("data", dias[dias.length - 1]).order("data").order("id"))
      .then(r => { if (vivo) setPontoMes(r); }).catch(e => setErro(e.message));
    return () => { vivo = false; };
  }, [mes, tick]);
  useEffect(() => { // banco acumulado do funcionário
    if (!func) return; let vivo = true; setAcum(null);
    buscarTudo(() => supabase.from("rh_ponto").select("*").eq("funcionario_id", func.id).lte("data", dias[dias.length - 1]).order("data").order("id"))
      .then(r => { if (!vivo) return; const mapa = new Map(r.map(p => [p.funcionario_id + "|" + p.data, p]));
        const fim = dias[dias.length - 1] < hoje() ? dias[dias.length - 1] : hoje(); const ds = []; for (let d = func.admissao; d <= fim; d = addDias(d, 1)) ds.push(d);
        setAcum(resumoPeriodo(func, ds, mapa, rh.aus).saldo); }).catch(() => {});
    return () => { vivo = false; };
  }, [func?.id, mes, tick, rh.aus]);
  useEffect(() => { setEdit({}); setOk(""); }, [func?.id, mes]);

  const mapa = useMemo(() => new Map(pontoMes.map(p => [p.funcionario_id + "|" + p.data, p])), [pontoMes]);
  const salvo = (d) => mapa.get(func.id + "|" + d);
  const linha = (d) => { const s = salvo(d); const base = { e1: s?.e1 || "", s1: s?.s1 || "", e2: s?.e2 || "", s2: s?.s2 || "", ocorrencia: (s?.ocorrencia && s.ocorrencia !== "normal") ? s.ocorrencia : (ocDeAus(ausDoDia(func.id, d, rh.aus)) || "normal"), observacao: s?.observacao || "" }; return edit[d] ? { ...base, ...edit[d] } : base; };
  const toRow = (l) => ({ e1: l.e1 || null, s1: l.s1 || null, e2: l.e2 || null, s2: l.s2 || null, ocorrencia: l.ocorrencia, observacao: l.observacao.trim() || null });
  const set = (d, k, v) => setEdit(e => ({ ...e, [d]: { ...(e[d] || {}), [k]: v } })); 
  const mudou = Object.keys(edit).length;

  const calc = (d) => func ? calcDia(func, d, { ...toRow(linha(d)) }, rh.aus) : {};
  const res = func ? resumoPeriodo(func, dias, new Map(dias.map(d => [func.id + "|" + d, toRow(linha(d))])), rh.aus) : null;

  async function tirarDia(a, d) { // remove um dia de dentro de um registro de ausência
    if (a.data_ini === d && a.data_fim === d) return supabase.from("rh_ausencias").delete().eq("id", a.id);
    if (a.data_ini === d) return supabase.from("rh_ausencias").update({ data_ini: addDias(d, 1) }).eq("id", a.id);
    if (a.data_fim === d) return supabase.from("rh_ausencias").update({ data_fim: addDias(d, -1) }).eq("id", a.id);
    const r1 = await supabase.from("rh_ausencias").update({ data_fim: addDias(d, -1) }).eq("id", a.id); if (r1.error) return r1;
    return supabase.from("rh_ausencias").insert({ empresa_id: a.empresa_id, funcionario_id: a.funcionario_id, tipo: a.tipo, data_ini: addDias(d, 1), data_fim: a.data_fim, cid: a.cid, observacao: a.observacao });
  }
  async function salvar() {
    setBusy(true); setErro(""); setOk("");
    const up = [], del = []; let er = null; let mexeuAus = false;
    try {
      for (const d of Object.keys(edit)) {
        const r = toRow(linha(d)); const querOc = r.ocorrencia;
        // atestado / falta / férias / folga ficam no cadastro de Atestados e faltas (fonte única)
        const a = ausDoDia(func.id, d, rh.aus);
        if (AUS_OC.includes(querOc)) {
          if (!a || ocDeAus(a) !== querOc) {
            if (a) { const x = await tirarDia(a, d); if (x.error) throw x.error; }
            const x = await supabase.from("rh_ausencias").insert({ empresa_id: rh.empresa_id, funcionario_id: func.id, tipo: querOc, data_ini: d, data_fim: d }); if (x.error) throw x.error;
            mexeuAus = true;
          }
          r.ocorrencia = "normal";
        } else if (a) { const x = await tirarDia(a, d); if (x.error) throw x.error; mexeuAus = true; }
        if (vazio(r)) { if (salvo(d)) del.push(d); } else up.push({ ...r, empresa_id: rh.empresa_id, funcionario_id: func.id, data: d });
      }
      if (up.length) { const { error } = await supabase.from("rh_ponto").upsert(up, { onConflict: "funcionario_id,data" }); if (error) throw error; }
      for (const d of del) { const { error } = await supabase.from("rh_ponto").delete().eq("funcionario_id", func.id).eq("data", d); if (error) throw error; }
    } catch (e) { er = e; }
    setBusy(false);
    if (mexeuAus) rh.recarregar();
    if (er) return setErro(er.message);
    setEdit({}); setTick(t => t + 1); setOk("Salvo.");
  }
  function preencher() {
    const novo = {};
    for (const d of dias) { const c = calc(d); const l = linha(d); if (c.fora || c.prev <= 0 || d > hoje() || l.ocorrencia !== "normal" || c.oc !== "normal" || l.e1 || l.s1 || l.e2 || l.s2) continue; novo[d] = { ...pad4 }; }
    setEdit(e => ({ ...e, ...Object.fromEntries(Object.entries(novo).map(([d, v]) => [d, { ...(e[d] || {}), ...v }])) }));
    setOk(`${Object.keys(novo).length} dia(s) preenchidos — confira e clique em Salvar.`);
  }
  async function feriadoTodos() {
    if (!fer) return; if (!confirm(`Marcar ${fmtData(fer)} como feriado para todos os funcionários ativos?`)) return;
    const alvo = rh.funcs.filter(f => f.admissao <= fer && (!f.demissao || f.demissao >= fer));
    const { error } = await supabase.from("rh_ponto").upsert(alvo.map(f => ({ empresa_id: rh.empresa_id, funcionario_id: f.id, data: fer, ocorrencia: "feriado" })), { onConflict: "funcionario_id,data" });
    if (error) return setErro(error.message); setTick(t => t + 1); setOk("Feriado marcado.");
  }
  const navMes = (n) => { const d = new Date(y, mo - 1 + n, 1); setMes(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  const resumoTodos = lista.map(f => ({ f, r: resumoPeriodo(f, dias, mapa, rh.aus) }));

  if (rh.funcs.length === 0) return <p className="muted">Cadastre os funcionários primeiro.</p>;
  return (
    <div>
      <div className="row no-print" style={{ marginBottom: 10, justifyContent: "space-between" }}>
        <div className="row"><button className="btn sm" onClick={() => navMes(-1)}><ChevronLeft size={15} /></button><b style={{ minWidth: 130, textAlign: "center" }}>{MESES[mo - 1]} {y}</b><button className="btn sm" onClick={() => navMes(1)}><ChevronRight size={15} /></button></div>
        
      </div>
      {erro && <div className="err no-print" style={{ marginBottom: 8 }}>{erro}</div>}
      {aba === "res" && <div style={{ overflowX: "auto" }}>
        <table><thead><tr><th>Funcionário</th><th>Trabalhado</th><th>Previsto</th><th>Saldo</th><th>Extras</th><th>Devidas</th><th>Faltas</th><th>Sem lançamento</th></tr></thead>
          <tbody>{resumoTodos.map(({ f, r }) => <tr key={f.id} style={{ cursor: "pointer" }} onClick={() => { setFid(f.id); irPara("ponto"); }}><td><b>{f.nome}</b></td><td>{hm(r.trab)}</td><td>{hm(r.prev)}</td><td style={{ color: r.saldo < 0 ? "#b42318" : "#166534", fontWeight: 600 }}>{hmS(r.saldo)}</td><td>{hm(r.extras)}</td><td>{hm(r.devidas)}</td><td>{r.faltas}</td><td>{r.semLanc ? <Pill cls="amar">{r.semLanc} dia(s)</Pill> : "—"}</td></tr>)}</tbody></table>
        {lista.length === 0 && <p className="muted">Nenhum funcionário com vínculo neste mês.</p>}
        <p className="muted">Clique em um funcionário para abrir o cartão dele.</p>
      </div>}
      {aba === "ind" && (!func ? <p className="muted">Nenhum funcionário com vínculo neste mês.</p> : <>
        <div className="row no-print" style={{ marginBottom: 10 }}>
          <select value={func.id} onChange={e => setFid(e.target.value)}>{lista.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          <button className="btn" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
        </div>
        <div className="kpis no-print">
          <Kpi t="Trabalhado" v={hm(res.trab)} s={`previsto ${hm(res.prev)}`} />
          <Kpi t="Saldo do mês" v={hmS(res.saldo)} c={res.saldo < 0 ? "verm" : res.saldo > 0 ? "verd" : ""} />
          <Kpi t="Horas extras" v={hm(res.extras)} s={`devidas ${hm(res.devidas)}`} />
          <Kpi t="Banco de horas" v={acum == null ? "…" : hmS(acum)} s="acumulado até o fim do mês" c={acum < 0 ? "verm" : acum > 0 ? "verd" : ""} />
          <Kpi t="Faltas" v={res.faltas} s={res.semLanc ? `${res.semLanc} dia(s) sem lançamento` : ""} c={res.faltas ? "verm" : ""} />
        </div>
        <div className="card no-print" style={{ padding: 12, marginBottom: 12, background: "#f7f9ff", boxShadow: "none", border: "1px solid #e0e7ff" }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            {[["e1", "Entrada"], ["s1", "Saída almoço"], ["e2", "Volta"], ["s2", "Saída"]].map(([k, n]) => <label key={k} style={{ fontSize: 12 }}>{n}<input type="time" value={pad4[k]} onChange={e => setPad4({ ...pad4, [k]: e.target.value })} style={{ width: 100, padding: 6 }} /></label>)}
            <button className="btn sm" onClick={preencher}>Preencher dias úteis sem lançamento</button>
          </div>
          <div className="row" style={{ alignItems: "flex-end", marginTop: 8 }}>
            <label style={{ fontSize: 12 }}>Feriado para todos<input type="date" value={fer} onChange={e => setFer(e.target.value)} style={{ padding: 6 }} /></label>
            <button className="btn sm" onClick={feriadoTodos}>Marcar feriado</button>
          </div>
        </div>
        <div className="print-area folha" style={{ marginTop: 0 }}>
          <div className="print-only-head" style={{ marginBottom: 8 }}><h3 style={{ margin: 0, fontSize: 13, letterSpacing: ".06em", color: "#4a5367" }}>CARTÃO DE PONTO · {MESES[mo - 1].toUpperCase()} {y}</h3><h1 style={{ margin: "2px 0" }}>{func.nome}</h1><div className="muted">{func.funcao || ""} · admissão {fmtData(func.admissao)} · jornada {hm(func.jornada_semana)}/dia{func.jornada_sabado ? ` · sábado ${hm(func.jornada_sabado)}` : ""}</div></div>
          <div style={{ overflowX: "auto" }}>
            <table className="ponto"><thead><tr><th>Dia</th><th>Entrada</th><th>Saída alm.</th><th>Volta</th><th>Saída</th><th>Ocorrência</th><th>Trab.</th><th>Prev.</th><th>Saldo</th></tr></thead>
              <tbody>{dias.map(d => { const c = calc(d); const l = linha(d); const dow = toDate(d).getDay(); const dis = c.fora;
                return (<tr key={d} className={(dow === 0 || dow === 6 ? "fds " : "") + (c.fora ? "fora " : "") + (edit[d] ? "mod" : "")}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{d.slice(8)}</b> <span className="muted">{DIAS[dow]}</span></td>
                  {["e1", "s1", "e2", "s2"].map(k => <td key={k}><input type="time" disabled={dis} value={l[k]} onChange={e => set(d, k, e.target.value)} /></td>)}
                  <td><select disabled={dis} value={l.ocorrencia} onChange={e => set(d, "ocorrencia", e.target.value)}>{OPCOES.map(o => <option key={o} value={o}>{o === "normal" ? "—" : OCORR[o]}</option>)}</select></td>
                  <td>{c.fora ? "" : c.trab ? hm(c.trab) : ""}{c.incompleto && <span title="Batida incompleta" style={{ color: "#b45309" }}> ⚠</span>}</td>
                  <td className="muted">{c.fora || !c.prev ? "" : hm(c.prev)}</td>
                  <td style={{ fontWeight: 600, color: c.saldo < 0 ? "#b42318" : c.saldo > 0 ? "#166534" : undefined }}>{c.fora ? "" : c.semLanc ? <span className="muted" style={{ fontWeight: 400 }}>sem lanç.</span> : c.saldo ? hmS(c.saldo) : ""}</td>
                </tr>); })}</tbody>
              <tfoot><tr><td colSpan={6}><b>Totais</b></td><td><b>{hm(res.trab)}</b></td><td><b>{hm(res.prev)}</b></td><td><b>{hmS(res.saldo)}</b></td></tr></tfoot></table>
          </div>
          <div style={{ marginTop: 36, borderTop: "1px solid #333", width: 280, paddingTop: 4, fontSize: 13 }}>Assinatura do funcionário</div>
        </div>
        <div className="row no-print" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!mudou || busy} onClick={salvar}><Save size={14} /> {busy ? "Salvando..." : `Salvar alterações${mudou ? ` (${mudou} dia${mudou > 1 ? "s" : ""})` : ""}`}</button>
          {mudou > 0 && <button className="btn" onClick={() => { setEdit({}); setOk(""); }}>Descartar</button>}
          {ok && <span className="muted">{ok}</span>}
        </div>
        <p className="muted no-print">Previsto = jornada do funcionário (seg–sex e sábado). Atestado, falta, férias e folga marcados aqui aparecem também em Atestados e faltas (e vice-versa). Atestado, férias, folga e feriado não geram desconto. "Falta" e "Compensação" descontam a jornada do dia (compensação usa o banco de horas). Dias úteis sem nenhuma batida aparecem como "sem lançamento" e não entram no saldo.</p>
      </>)}
    </div>
  );
}
