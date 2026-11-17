import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { useRh, Estilos, Kpi, Pill, Modal, fmtData, hoje, diasEntre, tempoEmpresa, situacao, experiencia, minToTime, timeToMin, TIPOS_DESLIG, epiStatus, examesAtuais, exameStatus, toDate, parseMoney } from "./rhLib.jsx";
import RhMovimentos from "./RhMovimentos.jsx";
import RhExperiencia from "./RhExperiencia.jsx";
import RhAusencias from "./RhAusencias.jsx";
import RhExames from "./RhExames.jsx";
import RhEpi from "./RhEpi.jsx";
import RhPonto from "./RhPonto.jsx";
import RhFinanceiro from "./RhFinanceiro.jsx";

const SECOES = [["visao", "Visão geral"], ["func", "Funcionários"], ["mov", "Contratações e demissões"], ["exp", "Experiência"], ["aus", "Atestados e faltas"], ["exames", "Exames"], ["epi", "EPI"], ["ponto", "Cartão de ponto"], ["fin", "Salário e vales"]];

export default function Rh({ perfil }) {
  const rh = useRh(perfil);
  const [sec, setSec] = useState("visao");
  if (!rh.carregado) return <div className="card"><span className="muted">{rh.erro ? "" : "Carregando..."}</span>{rh.erro && <div className="err">{rh.erro}</div>}</div>;
  const p = { rh, perfil, irPara: setSec };
  return (
    <div className="card">
      <Estilos />
      <h1>RH</h1>
      <div className="muted" style={{ marginBottom: 10 }}>Funcionários, ponto, EPI e documentos da sua equipe.</div>
      <div className="rhnav no-print">{SECOES.map(([k, n]) => <button key={k} className={sec === k ? "on" : ""} onClick={() => setSec(k)}>{n}</button>)}</div>
      {sec === "visao" && <Visao {...p} />}
      {sec === "func" && <Funcionarios {...p} />}
      {sec === "mov" && <RhMovimentos {...p} />}
      {sec === "exp" && <RhExperiencia {...p} />}
      {sec === "aus" && <RhAusencias {...p} />}
      {sec === "exames" && <RhExames {...p} />}
      {sec === "epi" && <RhEpi {...p} />}
      {sec === "ponto" && <RhPonto {...p} />}
      {sec === "fin" && <RhFinanceiro {...p} />}
    </div>
  );
}

function Visao({ rh, irPara }) {
  const h = hoje(); const mes = h.slice(0, 7);
  const ativos = rh.funcs.filter(f => !f.demissao);
  const admMes = rh.funcs.filter(f => f.admissao.startsWith(mes)).length;
  const desMes = rh.funcs.filter(f => f.demissao && f.demissao.startsWith(mes)).length;
  const exp = ativos.filter(f => situacao(f).k === "exp");
  const expVence = exp.filter(f => experiencia(f).dias <= 10);
  const expVenc = ativos.filter(f => f.exp_status === "pendente" && experiencia(f).venc);
  const fora = rh.aus.filter(a => a.data_ini <= h && a.data_fim >= h && ativos.some(f => f.id === a.funcionario_id));
  let epiVenc = 0, epiAv = 0;
  for (const f of ativos) for (const e of rh.epis.filter(x => x.ativo)) { const s = epiStatus(rh, f, e).st; if (s === "venc") epiVenc++; if (s === "avenc") epiAv++; }
  const ex = examesAtuais(rh).filter(e => ativos.some(f => f.id === e.funcionario_id));
  const exVenc = ex.filter(e => exameStatus(e) === "venc").length, exAv = ex.filter(e => exameStatus(e) === "avenc").length;
  const semExame = ativos.filter(f => !rh.exames.some(e => e.funcionario_id === f.id));
  const aniv = ativos.filter(f => f.nascimento && f.nascimento.slice(5, 7) === mes.slice(5)).sort((a, b) => a.nascimento.slice(8) - b.nascimento.slice(8));
  const A = ({ n, cls, txt, ir }) => n > 0 ? <div className={"alerta " + (cls || "")}><span>{txt}</span><button className="btn sm" onClick={() => irPara(ir)}>Ver</button></div> : null;
  return (
    <div>
      <div className="kpis">
        <Kpi t="Funcionários ativos" v={ativos.length} />
        <Kpi t="Admitidos no mês" v={admMes} c="verd" />
        <Kpi t="Desligados no mês" v={desMes} c={desMes ? "verm" : ""} />
        <Kpi t="Em experiência" v={exp.length} />
        <Kpi t="Fora hoje" v={fora.length} s="atestado, férias, folga..." />
      </div>
      {rh.funcs.length === 0 && <p className="muted">Comece cadastrando os setores e funcionários na aba <b>Funcionários</b>.</p>}
      <A n={expVenc.length} cls="verm" txt={`${expVenc.length} experiência(s) com prazo encerrado sem avaliação`} ir="exp" />
      <A n={expVence.length} txt={`${expVence.length} experiência(s) terminando em até 10 dias`} ir="exp" />
      <A n={epiVenc} cls="verm" txt={`${epiVenc} troca(s) de EPI vencida(s)`} ir="epi" />
      <A n={epiAv} txt={`${epiAv} troca(s) de EPI nos próximos 15 dias`} ir="epi" />
      <A n={exVenc} cls="verm" txt={`${exVenc} exame(s) vencido(s)`} ir="exames" />
      <A n={exAv} txt={`${exAv} exame(s) vencendo em 30 dias`} ir="exames" />
      <A n={semExame.length} txt={`${semExame.length} funcionário(s) sem nenhum exame registrado`} ir="exames" />
      {aniv.length > 0 && <div className="alerta" style={{ borderColor: "#60a5fa", background: "#eff6ff" }}><span>🎂 Aniversariantes do mês: {aniv.map(f => `${f.nome.split(" ")[0]} (dia ${Number(f.nascimento.slice(8))})`).join(", ")}</span></div>}
    </div>
  );
}

function Funcionarios({ rh, perfil }) {
  const [aba, setAba] = useState("func");
  const [busca, setBusca] = useState(""); const [fil, setFil] = useState("ativos"); const [setorF, setSetorF] = useState("");
  const [modal, setModal] = useState(false); const [f, setF] = useState({}); const [erro, setErro] = useState(""); const [busy, setBusy] = useState(false);
  const [novoSetor, setNovoSetor] = useState("");
  const setorNome = (id) => rh.setores.find(s => s.id === id)?.nome || "—";
  const lista = useMemo(() => rh.funcs.filter(x =>
    (fil === "todos" || (fil === "ativos" ? !x.demissao : !!x.demissao)) && (!setorF || x.setor_id === setorF) &&
    (!busca.trim() || (x.nome + " " + (x.funcao || "")).toLowerCase().includes(busca.trim().toLowerCase()))), [rh.funcs, fil, setorF, busca]);

  function abrir(x) {
    setErro("");
    setF(x ? { id: x.id, nome: x.nome, funcao: x.funcao || "", setor_id: x.setor_id || "", admissao: x.admissao, nascimento: x.nascimento || "", sexo: x.sexo || "",
        salario: x.salario != null ? String(x.salario).replace(".", ",") : "", jsem: minToTime(x.jornada_semana), jsab: minToTime(x.jornada_sabado), obs: x.observacao || "", demissao: x.demissao || "", tipo_deslig: x.tipo_deslig || "", motivo: x.motivo || "" }
      : { nome: "", funcao: "", setor_id: "", admissao: hoje(), nascimento: "", sexo: "", salario: "", jsem: "08:48", jsab: "00:00", obs: "", demissao: "", tipo_deslig: "", motivo: "" });
    setModal(true);
  }
  async function salvar() {
    if (!f.nome.trim()) return setErro("Informe o nome.");
    if (!f.admissao) return setErro("Informe a data de admissão.");
    if (f.demissao && f.demissao < f.admissao) return setErro("A demissão não pode ser antes da admissão.");
    if (f.demissao && !f.tipo_deslig) return setErro("Informe o tipo de desligamento.");
    setBusy(true);
    const dados = { nome: f.nome.trim(), funcao: f.funcao.trim() || null, setor_id: f.setor_id || null, admissao: f.admissao, nascimento: f.nascimento || null, sexo: f.sexo || null,
      salario: f.salario.trim() ? parseMoney(f.salario) : null, jornada_semana: timeToMin(f.jsem) ?? 528, jornada_sabado: timeToMin(f.jsab) ?? 0, observacao: f.obs.trim() || null,
      demissao: f.demissao || null, tipo_deslig: f.demissao ? f.tipo_deslig : null, motivo: f.demissao ? (f.motivo.trim() || null) : null };
    const { error } = f.id ? await supabase.from("rh_funcionarios").update(dados).eq("id", f.id)
      : await supabase.from("rh_funcionarios").insert({ ...dados, empresa_id: rh.empresa_id, exp_status: diasEntre(f.admissao, hoje()) >= 90 ? "efetivado" : "pendente" });
    setBusy(false);
    if (error) return setErro(error.message);
    setModal(false); rh.recarregar();
  }
  async function excluir(x) {
    if (!confirm(`Excluir ${x.nome} e TODO o histórico dele (ponto, atestados, EPI)? Não dá para desfazer.\n\nSe ele só saiu da empresa, prefira registrar o desligamento.`)) return;
    const { error } = await supabase.from("rh_funcionarios").delete().eq("id", x.id);
    if (error) setErro(error.message); else { setModal(false); rh.recarregar(); }
  }
  async function reativar(x) {
    if (!confirm(`Reativar ${x.nome}? A data de desligamento será removida.`)) return;
    const { error } = await supabase.from("rh_funcionarios").update({ demissao: null, tipo_deslig: null, motivo: null }).eq("id", x.id);
    if (error) alert(error.message); else rh.recarregar();
  }
  async function addSetor(e) {
    e.preventDefault(); if (!novoSetor.trim()) return;
    const { error } = await supabase.from("rh_setores").insert({ empresa_id: rh.empresa_id, nome: novoSetor.trim() });
    if (error) return alert(error.message.includes("duplicate") ? "Já existe um setor com esse nome." : error.message);
    setNovoSetor(""); rh.recarregar();
  }
  async function renomear(s) {
    const n = prompt("Novo nome do setor:", s.nome); if (!n || !n.trim() || n.trim() === s.nome) return;
    const { error } = await supabase.from("rh_setores").update({ nome: n.trim() }).eq("id", s.id);
    if (error) alert(error.message); else rh.recarregar();
  }
  async function excSetor(s) {
    if (!confirm(`Excluir o setor "${s.nome}"? Os funcionários ficam sem setor.`)) return;
    const { error } = await supabase.from("rh_setores").delete().eq("id", s.id);
    if (error) alert(error.message); else rh.recarregar();
  }

  return (
    <div>
      <div className="subtabs"><button className={aba === "func" ? "on" : ""} onClick={() => setAba("func")}>Funcionários</button><button className={aba === "setores" ? "on" : ""} onClick={() => setAba("setores")}>Setores</button></div>
      {aba === "func" && <>
        <div className="row" style={{ marginBottom: 10 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}><Search size={15} style={{ position: "absolute", left: 10, top: 12, color: "#9aa3b5" }} /><input style={{ width: "100%", paddingLeft: 32 }} placeholder="Buscar nome ou função" value={busca} onChange={e => setBusca(e.target.value)} /></div>
          <select value={setorF} onChange={e => setSetorF(e.target.value)}><option value="">Todos os setores</option>{rh.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
          <button className="btn primary" onClick={() => abrir(null)}><Plus size={14} /> Novo funcionário</button>
        </div>
        <div className="chips">{[["ativos", "Ativos"], ["inativos", "Desligados"], ["todos", "Todos"]].map(([k, n]) => <button key={k} className={fil === k ? "on" : ""} onClick={() => setFil(k)}>{n}</button>)}</div>
        {lista.length === 0 && <p className="muted">Nenhum funcionário encontrado.</p>}
        {lista.map(x => { const s = situacao(x); return (
          <div className="item" key={x.id}>
            <div style={{ minWidth: 180 }}><b>{x.nome}</b><div className="muted">{x.funcao || "Sem função"} · {setorNome(x.setor_id)}</div></div>
            <div className="muted">Admissão {fmtData(x.admissao)}<br />{x.demissao ? `Saiu ${fmtData(x.demissao)} · ` : ""}{tempoEmpresa(x.admissao, x.demissao)}</div>
            <div className="row"><Pill cls={s.cls}>{s.t}</Pill>
              {x.demissao && <button className="btn sm" onClick={() => reativar(x)}>Reativar</button>}
              <button className="btn sm" onClick={() => abrir(x)}><Pencil size={13} /> Editar</button></div>
          </div>); })}
      </>}
      {aba === "setores" && <>
        <form className="row" onSubmit={addSetor} style={{ marginBottom: 12 }}><input placeholder="Nome do novo setor (ex.: Costura, Estofaria)" value={novoSetor} onChange={e => setNovoSetor(e.target.value)} style={{ flex: 1, minWidth: 200 }} /><button className="btn primary"><Plus size={14} /> Adicionar setor</button></form>
        {rh.setores.length === 0 && <p className="muted">Nenhum setor ainda.</p>}
        {rh.setores.map(s => <div className="item" key={s.id}><div><b>{s.nome}</b><div className="muted">{rh.funcs.filter(x => x.setor_id === s.id && !x.demissao).length} ativo(s)</div></div>
          <div className="row"><button className="btn sm" onClick={() => renomear(s)}><Pencil size={13} /></button><button className="btn sm" onClick={() => excSetor(s)}><Trash2 size={13} /></button></div></div>)}
      </>}
      {modal && (
        <Modal titulo={f.id ? "Editar funcionário" : "Novo funcionário"} onClose={() => setModal(false)} onSubmit={salvar} erro={erro} busy={busy}>
          <label>Nome completo<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} autoFocus /></label>
          <div className="g2">
            <label>Função<input value={f.funcao} onChange={e => setF({ ...f, funcao: e.target.value })} /></label>
            <label>Setor<select value={f.setor_id} onChange={e => setF({ ...f, setor_id: e.target.value })}><option value="">—</option>{rh.setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
            <label>Admissão<input type="date" value={f.admissao} onChange={e => setF({ ...f, admissao: e.target.value })} /></label>
            <label>Nascimento<input type="date" value={f.nascimento} onChange={e => setF({ ...f, nascimento: e.target.value })} /></label>
            <label>Sexo<select value={f.sexo} onChange={e => setF({ ...f, sexo: e.target.value })}><option value="">—</option><option value="M">Masculino</option><option value="F">Feminino</option></select></label>
          </div>
          <label>Salário mensal (R$)<input inputMode="decimal" placeholder="Ex.: 2200,00" value={f.salario} onChange={e => setF({ ...f, salario: e.target.value })} /></label>
          <div className="muted" style={{ marginTop: 4 }}>Jornada diária (usada no cartão de ponto)</div>
          <div className="g2">
            <label>Segunda a sexta<input type="time" value={f.jsem} onChange={e => setF({ ...f, jsem: e.target.value })} /></label>
            <label>Sábado<input type="time" value={f.jsab} onChange={e => setF({ ...f, jsab: e.target.value })} /></label>
          </div>
          <label>Observação<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
          <div style={{ borderTop: "1px solid #eceef3", paddingTop: 10 }} className="muted">Desligamento (deixe em branco se continua na empresa)</div>
          <div className="g2">
            <label>Data de saída<input type="date" value={f.demissao} onChange={e => setF({ ...f, demissao: e.target.value })} /></label>
            <label>Tipo<select value={f.tipo_deslig} onChange={e => setF({ ...f, tipo_deslig: e.target.value })}><option value="">—</option>{Object.entries(TIPOS_DESLIG).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          </div>
          <label>Motivo<input value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} /></label>
          {f.id && <button type="button" className="link" style={{ color: "#b42318", textAlign: "left" }} onClick={() => excluir(rh.funcs.find(x => x.id === f.id))}>Excluir funcionário e todo o histórico</button>}
        </Modal>)}
    </div>
  );
}
