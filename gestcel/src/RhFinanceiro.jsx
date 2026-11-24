import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { Kpi, Pill, Modal, brl, parseMoney, fmtData, hoje, hm, MESES, pad, diasDoMes, resumoPeriodo, buscarTudo, toDate } from "./rhLib.jsx";

const HORA_DIV = 220;           // horas mensais (padrão CLT)
const ADIC_EXTRA = 1.5;         // hora extra com 50%
export default function RhFinanceiro({ rh, sub }) {
  const aba = sub === "vales" ? "vales" : sub === "dec" ? "13" : "folha";
  return (
    <div>
      
      {aba === "folha" && <Folha rh={rh} />}
      {aba === "vales" && <Vales rh={rh} />}
      {aba === "13" && <Decimo rh={rh} />}
    </div>
  );
}

function Folha({ rh }) {
  const [mes, setMes] = useState(hoje().slice(0, 7)); const [ponto, setPonto] = useState([]); const [erro, setErro] = useState("");
  const dias = useMemo(() => diasDoMes(mes), [mes]); const [y, mo] = mes.split("-").map(Number);
  useEffect(() => { let v = true; buscarTudo(() => supabase.from("rh_ponto").select("*").gte("data", dias[0]).lte("data", dias[dias.length - 1]).order("data").order("id")).then(r => v && setPonto(r)).catch(e => setErro(e.message)); return () => { v = false; }; }, [mes]);
  const mapa = useMemo(() => new Map(ponto.map(p => [p.funcionario_id + "|" + p.data, p])), [ponto]);
  const lista = rh.funcs.filter(f => f.admissao.slice(0, 7) <= mes && (!f.demissao || f.demissao.slice(0, 7) >= mes));
  const comp = mes + "-01";
  const linhas = lista.map(f => {
    const r = resumoPeriodo(f, dias, mapa, rh.aus); const sal = Number(f.salario || 0); const hora = sal / HORA_DIV;
    const extras = (r.extras / 60) * hora * ADIC_EXTRA; const faltas = r.faltas * (sal / 30);
    const vales = rh.parcelas.filter(p => p.funcionario_id === f.id && p.competencia === comp).reduce((s, p) => s + Number(p.valor), 0);
    return { f, r, sal, extras, faltas, vales, liq: sal + extras - faltas - vales };
  });
  const tot = (k) => linhas.reduce((s, l) => s + l[k], 0);
  const semSal = lista.filter(f => f.salario == null).length;
  const navMes = (n) => { const d = new Date(y, mo - 1 + n, 1); setMes(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}><button className="btn sm" onClick={() => navMes(-1)}><ChevronLeft size={15} /></button><b style={{ minWidth: 130, textAlign: "center" }}>{MESES[mo - 1]} {y}</b><button className="btn sm" onClick={() => navMes(1)}><ChevronRight size={15} /></button></div>
      {erro && <div className="err">{erro}</div>}
      <div className="kpis"><Kpi t="Salários" v={brl(tot("sal"))} /><Kpi t="Horas extras (estimado)" v={brl(tot("extras"))} /><Kpi t="Descontos de faltas" v={brl(tot("faltas"))} c={tot("faltas") ? "verm" : ""} /><Kpi t="Vales a descontar" v={brl(tot("vales"))} /><Kpi t="Líquido estimado" v={brl(tot("liq"))} c="verd" /></div>
      {semSal > 0 && <div className="alerta"><span>{semSal} funcionário(s) sem salário cadastrado (edite em Funcionários).</span></div>}
      {linhas.length === 0 ? <p className="muted">Nenhum funcionário com vínculo neste mês.</p> :
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Funcionário</th><th>Salário</th><th>Extras</th><th>Faltas</th><th>Vales</th><th>Líquido est.</th></tr></thead>
          <tbody>{linhas.map(({ f, r, sal, extras, faltas, vales, liq }) => <tr key={f.id}><td><b>{f.nome}</b></td><td>{f.salario == null ? "—" : brl(sal)}</td>
            <td>{r.extras ? <>{brl(extras)}<div className="muted">{hm(r.extras)}</div></> : "—"}</td><td>{r.faltas ? <>−{brl(faltas)}<div className="muted">{r.faltas} dia(s)</div></> : "—"}</td>
            <td>{vales ? "−" + brl(vales) : "—"}</td><td><b>{brl(liq)}</b></td></tr>)}</tbody></table></div>}
      <p className="muted">Estimativa: hora = salário ÷ 220; extra com +50%; falta = salário ÷ 30 por dia. Não inclui INSS, IR, FGTS nem DSR — confira com sua contabilidade. As horas vêm do cartão de ponto e os vales das parcelas do mês.</p>
    </div>
  );
}

function Vales({ rh }) {
  const [func, setFunc] = useState(""); const [aberto, setAberto] = useState(null);
  const [m, setM] = useState(false); const [f, setF] = useState({}); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  const nome = (id) => rh.funcs.find(x => x.id === id)?.nome || "?";
  const mesAtual = hoje().slice(0, 7);
  const parcs = (v) => rh.parcelas.filter(p => p.vale_id === v.id).sort((a, b) => a.numero - b.numero);
  const emAberto = rh.parcelas.filter(p => !p.descontada).reduce((s, p) => s + Number(p.valor), 0);
  const nesteMes = rh.parcelas.filter(p => !p.descontada && p.competencia.slice(0, 7) === mesAtual).reduce((s, p) => s + Number(p.valor), 0);
  const atrasadas = rh.parcelas.filter(p => !p.descontada && p.competencia.slice(0, 7) < mesAtual).length;
  const lista = rh.vales.filter(v => !func || v.funcionario_id === func).sort((a, b) => b.data.localeCompare(a.data));
  function abrir() { setErro(""); setF({ funcionario_id: func || "", desc: "Vale", valor: "", data: hoje(), parcelas: "1", primeira: mesAtual, obs: "" }); setM(true); }
  const valor = parseMoney(f.valor || ""); const n = parseInt(f.parcelas, 10);
  const previa = valor > 0 && n > 0 ? (() => { const c = Math.round(valor * 100), b = Math.floor(c / n), ult = c - b * (n - 1); return ult === b ? `${n}× de ${brl(b / 100)}` : `${n - 1}× de ${brl(b / 100)} + 1× de ${brl(ult / 100)}`; })() : "";
  async function salvar() {
    if (!f.funcionario_id) return setErro("Escolha o funcionário."); if (!f.desc.trim()) return setErro("Informe o que é (vale, adiantamento...).");
    if (!valor || valor <= 0) return setErro("Informe o valor."); if (!n || n < 1 || n > 60) return setErro("Informe em quantas vezes será descontado (1 a 60).");
    setBusy(true);
    const { error } = await supabase.rpc("rh_criar_vale", { p_func: f.funcionario_id, p_desc: f.desc, p_valor: valor, p_data: f.data, p_parcelas: n, p_primeira: f.primeira + "-01", p_obs: f.obs });
    setBusy(false); if (error) return setErro(error.message); setM(false); rh.recarregar();
  }
  async function toggle(p) { const { error } = await supabase.from("rh_vale_parcelas").update({ descontada: !p.descontada }).eq("id", p.id); if (error) alert(error.message); else rh.recarregar(); }
  async function excluir(v) { if (!confirm(`Excluir o vale "${v.descricao}" de ${nome(v.funcionario_id)} e todas as parcelas dele?`)) return; const { error } = await supabase.from("rh_vales").delete().eq("id", v.id); if (error) alert(error.message); else rh.recarregar(); }
  return (
    <div>
      <div className="kpis"><Kpi t="Total a descontar" v={brl(emAberto)} /><Kpi t="A descontar neste mês" v={brl(nesteMes)} /><Kpi t="Parcelas atrasadas" v={atrasadas} s="mês passou e não marcou descontada" c={atrasadas ? "amar" : ""} /></div>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={func} onChange={e => setFunc(e.target.value)}><option value="">Todos os funcionários</option>{rh.funcs.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        <button className="btn primary" onClick={abrir}><Plus size={14} /> Novo vale</button>
      </div>
      {lista.length === 0 && <p className="muted">Nenhum vale lançado.</p>}
      {lista.map(v => { const ps = parcs(v); const rest = ps.filter(p => !p.descontada).reduce((s, p) => s + Number(p.valor), 0); return (
        <div key={v.id} className="item" style={{ display: "block" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div><b>{nome(v.funcionario_id)}</b> · {v.descricao}<div className="muted">{fmtData(v.data)} · {brl(v.valor)} em {v.parcelas}× · falta descontar {brl(rest)}{v.observacao ? ` · ${v.observacao}` : ""}</div></div>
            <div className="row"><Pill cls={rest === 0 ? "ok" : "amar"}>{rest === 0 ? "Quitado" : "Em aberto"}</Pill><button className="btn sm" onClick={() => setAberto(aberto === v.id ? null : v.id)}>{aberto === v.id ? "Ocultar" : "Parcelas"}</button><button className="btn sm" onClick={() => excluir(v)} aria-label="Excluir"><Trash2 size={13} /></button></div>
          </div>
          {aberto === v.id && <div style={{ marginTop: 8 }}>{ps.map(p => <label key={p.id} className="row" style={{ flexDirection: "row", alignItems: "center", padding: "4px 0", fontSize: 14 }}><input type="checkbox" checked={p.descontada} onChange={() => toggle(p)} /> {p.numero}/{v.parcelas} · {MESES[Number(p.competencia.slice(5, 7)) - 1]}/{p.competencia.slice(0, 4)} · {brl(p.valor)} {p.descontada ? <Pill cls="ok">descontada</Pill> : p.competencia.slice(0, 7) < mesAtual ? <Pill cls="amar">atrasada</Pill> : null}</label>)}</div>}
        </div>); })}
      {m && <Modal titulo="Novo vale" onClose={() => setM(false)} onSubmit={salvar} erro={erro} busy={busy}>
        <label>Funcionário<select value={f.funcionario_id} onChange={e => setF({ ...f, funcionario_id: e.target.value })}><option value="">Selecione</option>{rh.funcs.filter(x => !x.demissao).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <div className="g2"><label>O que é<input list="tvale" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} /><datalist id="tvale"><option value="Vale" /><option value="Adiantamento" /><option value="Empréstimo" /></datalist></label>
          <label>Valor (R$)<input inputMode="decimal" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} autoFocus /></label>
          <label>Data do vale<input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
          <label>Em quantas vezes será descontado?<input type="number" min="1" max="60" value={f.parcelas} onChange={e => setF({ ...f, parcelas: e.target.value })} /></label></div>
        <label>Primeiro desconto em<input type="month" value={f.primeira} onChange={e => setF({ ...f, primeira: e.target.value })} /></label>
        {previa && <div className="pre" style={{ background: "#f7f9ff", borderRadius: 8, padding: 10, fontSize: 14 }}>{previa}, a partir de {MESES[Number(f.primeira.slice(5, 7)) - 1]}/{f.primeira.slice(0, 4)}.</div>}
        <label>Observação<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
      </Modal>}
    </div>
  );
}

function avos(f, ano, ateHoje) {
  const h = hoje(); let n = 0;
  for (let m = 1; m <= 12; m++) {
    const ini = `${ano}-${pad(m)}-01`; const ult = new Date(ano, m, 0).getDate(); let fim = `${ano}-${pad(m)}-${pad(ult)}`;
    if (ateHoje && fim > h) fim = h;
    const a = f.admissao > ini ? f.admissao : ini; const b = f.demissao && f.demissao < fim ? f.demissao : fim;
    if (b < a) continue;
    if (Math.round((toDate(b) - toDate(a)) / 864e5) + 1 >= 15) n++;
  }
  return n;
}
function Decimo({ rh }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const lista = rh.funcs.filter(f => f.admissao.slice(0, 4) <= String(ano) && (!f.demissao || f.demissao.slice(0, 4) >= String(ano)));
  const linhas = lista.map(f => { const sal = Number(f.salario || 0); const a1 = avos(f, ano, ano === new Date().getFullYear()), a2 = avos(f, ano, false); return { f, sal, a1, a2, v1: sal / 12 * a1, v2: sal / 12 * a2 }; });
  const t1 = linhas.reduce((s, l) => s + l.v1, 0), t2 = linhas.reduce((s, l) => s + l.v2, 0);
  const anos = [...new Set([new Date().getFullYear(), ...rh.funcs.map(f => Number(f.admissao.slice(0, 4)))])].sort((a, b) => b - a);
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}><label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>Ano<select value={ano} onChange={e => setAno(Number(e.target.value))}>{anos.map(a => <option key={a}>{a}</option>)}</select></label></div>
      <div className="kpis"><Kpi t="13º acumulado até hoje" v={brl(t1)} s="soma de todos" /><Kpi t={`13º previsto em ${ano}`} v={brl(t2)} s="se todos ficarem até dezembro" c="verd" /></div>
      {linhas.length === 0 ? <p className="muted">Nenhum funcionário neste ano.</p> :
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Funcionário</th><th>Salário</th><th>Avos até hoje</th><th>13º acumulado</th><th>Avos no ano</th><th>13º previsto</th></tr></thead>
          <tbody>{linhas.map(l => <tr key={l.f.id}><td><b>{l.f.nome}</b>{l.f.demissao ? <div className="muted">saiu em {fmtData(l.f.demissao)}</div> : null}</td><td>{l.f.salario == null ? "—" : brl(l.sal)}</td><td>{l.a1}/12</td><td>{brl(l.v1)}</td><td>{l.a2}/12</td><td><b>{brl(l.v2)}</b></td></tr>)}</tbody></table></div>}
      <p className="muted">Cálculo: salário ÷ 12 × meses trabalhados no ano (mês com 15 dias ou mais de trabalho conta como 1/12). Considera só o salário base — médias de extras, INSS e IR não entram. Pagamento: 1ª parcela até 30/11 e 2ª até 20/12.</p>
    </div>
  );
}
