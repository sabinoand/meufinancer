import { useState } from "react";
import { Barras, Kpi, MESES, fmtData, tempoEmpresa, TIPOS_DESLIG, pad } from "./rhLib.jsx";

export default function RhMovimentos({ rh, sub }) {
  const aba = sub || "turn"; const hojeD = new Date();
  const [ano, setAno] = useState(hojeD.getFullYear());
  const nomeSetor = (id) => rh.setores.find(s => s.id === id)?.nome || "Sem setor";
  const ate = ano === hojeD.getFullYear() ? hojeD.getMonth() + 1 : 12;
  const ativoEm = (f, d) => f.admissao <= d && (!f.demissao || f.demissao > d);
  const fimMes = (m) => { const u = new Date(ano, m, 0).getDate(); return `${ano}-${pad(m)}-${pad(u)}`; };
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const adm = (m) => rh.funcs.filter(f => f.admissao.startsWith(`${ano}-${pad(m)}`)).length;
  const des = (m) => rh.funcs.filter(f => f.demissao && f.demissao.startsWith(`${ano}-${pad(m)}`)).length;
  const hc = (m) => rh.funcs.filter(f => ativoEm(f, fimMes(m))).length;
  const admAno = rh.funcs.filter(f => f.admissao.startsWith(String(ano)));
  const desAno = rh.funcs.filter(f => f.demissao && f.demissao.startsWith(String(ano)));
  const hcMedio = meses.slice(0, ate).reduce((s, m) => s + hc(m), 0) / ate;
  const turnover = hcMedio ? ((admAno.length + desAno.length) / 2 / hcMedio) * 100 : 0;
  const turnoverDesl = hcMedio ? (desAno.length / hcMedio) * 100 : 0;
  const motivos = {}; for (const f of desAno) motivos[f.tipo_deslig || "outro"] = (motivos[f.tipo_deslig || "outro"] || 0) + 1;
  const porSetor = {}; for (const f of rh.funcs) { const k = nomeSetor(f.setor_id); porSetor[k] = porSetor[k] || { hc: 0, adm: 0, des: 0 };
    if (!f.demissao) porSetor[k].hc++; if (f.admissao.startsWith(String(ano))) porSetor[k].adm++; if (f.demissao?.startsWith(String(ano))) porSetor[k].des++; }
  const anos = [...new Set([hojeD.getFullYear(), ...rh.funcs.flatMap(f => [Number(f.admissao.slice(0, 4)), f.demissao ? Number(f.demissao.slice(0, 4)) : null]).filter(Boolean)])].sort((a, b) => b - a);
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div style={{ flex: 1 }} />
        <select value={ano} onChange={e => setAno(Number(e.target.value))}>{anos.map(a => <option key={a}>{a}</option>)}</select>
      </div>
      <div className="kpis">
        <Kpi t={`Admissões em ${ano}`} v={admAno.length} c="verd" /><Kpi t={`Desligamentos em ${ano}`} v={desAno.length} c={desAno.length ? "verm" : ""} />
        <Kpi t="Headcount médio" v={hcMedio.toFixed(1).replace(".", ",")} /><Kpi t="Turnover do ano" v={turnover.toFixed(1).replace(".", ",") + "%"} s={`só saídas: ${turnoverDesl.toFixed(1).replace(".", ",")}%`} />
      </div>
      {aba === "turn" && <>
        <h2>Admitidos × desligados por mês</h2>
        <Barras dados={meses.map(m => ({ rot: MESES[m - 1].slice(0, 3), vals: [adm(m), des(m)] }))} series={[{ nome: "Admitidos", cor: "#16a34a" }, { nome: "Desligados", cor: "#dc2626" }]} />
        <h2 style={{ marginTop: 18 }}>Por setor</h2>
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Setor</th><th>Ativos</th><th>Admitidos</th><th>Desligados</th></tr></thead>
          <tbody>{Object.entries(porSetor).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.hc}</td><td>{v.adm}</td><td>{v.des}</td></tr>)}</tbody></table></div>
        <h2 style={{ marginTop: 18 }}>Motivos de desligamento</h2>
        {Object.keys(motivos).length === 0 ? <p className="muted">Nenhum desligamento em {ano}.</p> :
          Object.entries(motivos).map(([k, n]) => <div key={k} className="item"><span>{TIPOS_DESLIG[k]}</span><b>{n}</b></div>)}
      </>}
      {aba === "adm" && (admAno.length === 0 ? <p className="muted">Nenhuma contratação em {ano}.</p> :
        [...admAno].sort((a, b) => b.admissao.localeCompare(a.admissao)).map(f => <div className="item" key={f.id}><div><b>{f.nome}</b><div className="muted">{f.funcao || "—"} · {nomeSetor(f.setor_id)}</div></div><div className="muted">Admitido em {fmtData(f.admissao)}</div></div>))}
      {aba === "des" && (desAno.length === 0 ? <p className="muted">Nenhum desligamento em {ano}.</p> :
        [...desAno].sort((a, b) => b.demissao.localeCompare(a.demissao)).map(f => <div className="item" key={f.id}><div><b>{f.nome}</b><div className="muted">{f.funcao || "—"} · {nomeSetor(f.setor_id)}</div></div>
          <div className="muted">Saiu em {fmtData(f.demissao)} · {tempoEmpresa(f.admissao, f.demissao)} de casa<br />{TIPOS_DESLIG[f.tipo_deslig] || "—"}{f.motivo ? ` — ${f.motivo}` : ""}</div></div>))}
    </div>
  );
}
