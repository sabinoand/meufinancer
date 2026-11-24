import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient.js";

export const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoje = () => iso(new Date());
export const fmtData = (s) => (s ? s.split("-").reverse().join("/") : "");
export const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const diasEntre = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
export const addDias = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
export const addMeses = (s, n) => {
  const d = toDate(s); const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d);
};
export const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const parseMoney = (v) => { const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? null : n; };
export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const minToTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const timeToMin = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const hm = (m) => { const a = Math.abs(Math.round(m)); return `${Math.floor(a / 60)}h${pad(a % 60)}`; };
export const hmS = (m) => (m === 0 ? "0h00" : (m > 0 ? "+" : "−") + hm(m));

export function tempoEmpresa(adm, fim) {
  const f = fim || hoje(); const a = toDate(adm); const b = toDate(f);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); if (b.getDate() < a.getDate()) m--;
  if (m < 0) return "—";
  if (m === 0) { const d = diasEntre(adm, f); return `${d} ${d === 1 ? "dia" : "dias"}`; }
  const an = Math.floor(m / 12), me = m % 12;
  return [an ? `${an} ${an === 1 ? "ano" : "anos"}` : "", me ? `${me} ${me === 1 ? "mês" : "meses"}` : ""].filter(Boolean).join(" e ");
}

export const TIPOS_DESLIG = { pediu_conta: "Pediu demissão", demitido: "Dispensado pela empresa", fim_experiencia: "Fim da experiência", outro: "Outro" };
export const TIPOS_AUS = { atestado: "Atestado", ferias: "Férias", folga: "Folga", falta_just: "Falta justificada", falta: "Falta sem justificativa", afastamento: "Afastamento" };

export function situacao(f) {
  if (f.demissao) return { k: "desl", t: "Desligado", cls: "cinza" };
  if (f.exp_status === "pendente" && diasEntre(f.admissao, hoje()) < 90) return { k: "exp", t: "Em experiência", cls: "amar" };
  return { k: "ativo", t: "Ativo", cls: "ok" };
}
export function experiencia(f) {
  const h = hoje(); const e1 = addDias(f.admissao, 44), e2 = addDias(f.admissao, 89);
  if (h <= e1) return { fase: "1º período (45 dias)", fim: e1, dias: diasEntre(h, e1), venc: false };
  if (h <= e2) return { fase: "2º período (90 dias)", fim: e2, dias: diasEntre(h, e2), venc: false };
  return { fase: "Prazo encerrado", fim: e2, dias: diasEntre(h, e2), venc: true };
}

export function epiStatus(rh, f, epi) {
  if (rh.naoUsa.some(n => n.funcionario_id === f.id && n.epi_id === epi.id)) return { st: "nao" };
  let ult = null;
  for (const t of rh.trocas) if (t.funcionario_id === f.id && t.epi_id === epi.id && (!ult || t.data_troca > ult.data_troca)) ult = t;
  if (!ult) return { st: "sem" };
  const prox = addMeses(ult.data_troca, epi.periodo_meses); const dias = diasEntre(hoje(), prox);
  return { st: dias < 0 ? "venc" : dias <= 15 ? "avenc" : "ok", ultimo: ult.data_troca, prox, dias };
}
export function exameStatus(e) {
  if (!e.validade) return "semval";
  const d = diasEntre(hoje(), e.validade); return d < 0 ? "venc" : d <= 30 ? "avenc" : "ok";
}
export function examesAtuais(rh) {
  const m = new Map();
  for (const e of rh.exames) { const k = e.funcionario_id + "|" + e.tipo.toLowerCase(); const o = m.get(k); if (!o || e.realizado_em > o.realizado_em) m.set(k, e); }
  return [...m.values()];
}

// ----- cartão de ponto -----
export const OCORR = { normal: "Normal", falta: "Falta (sem justif.)", atestado: "Atestado", ferias: "Férias", folga: "Folga", feriado: "Feriado", compensacao: "Compensação (banco)", falta_just: "Falta justificada" };
const ABONADO = ["atestado", "ferias", "folga", "feriado", "falta_just"];
export function ausDoDia(fid, data, aus) { return aus.find(x => x.funcionario_id === fid && x.data_ini <= data && x.data_fim >= data); }
export const ocDeAus = (a) => (a ? (a.tipo === "afastamento" ? "atestado" : a.tipo) : null);
export function calcDia(f, data, p, aus) {
  if (data < f.admissao || (f.demissao && data > f.demissao)) return { fora: true };
  const dow = toDate(data).getDay();
  const jorn = dow === 0 ? 0 : dow === 6 ? f.jornada_sabado : f.jornada_semana;
  let oc = p?.ocorrencia || "normal", derivada = false;
  if (oc === "normal") {
    const a = aus.find(x => x.funcionario_id === f.id && x.data_ini <= data && x.data_fim >= data);
    if (a) { oc = a.tipo === "afastamento" ? "atestado" : a.tipo; derivada = true; }
  }
  let trab = 0, incompleto = false, temPonto = false;
  for (const [a, b] of [[p?.e1, p?.s1], [p?.e2, p?.s2]]) {
    if (a || b) temPonto = true;
    if (a && b) { let x = timeToMin(b) - timeToMin(a); if (x < 0) x += 1440; trab += x; } else if (a || b) incompleto = true;
  }
  const prev = ABONADO.includes(oc) ? 0 : jorn;
  const semLanc = oc === "normal" && !temPonto && prev > 0 && data <= hoje();
  const futuro = oc === "normal" && !temPonto && data > hoje();
  const saldo = semLanc || futuro ? 0 : trab - prev;
  return { oc, derivada, trab, prev, saldo, incompleto, semLanc, futuro, jorn };
}
export function diasDoMes(mes) { const [y, m] = mes.split("-").map(Number); const n = new Date(y, m, 0).getDate(); return Array.from({ length: n }, (_, i) => `${mes}-${pad(i + 1)}`); }
export function resumoPeriodo(f, dias, mapa, aus) {
  const r = { trab: 0, prev: 0, saldo: 0, extras: 0, devidas: 0, faltas: 0, semLanc: 0 };
  for (const d of dias) {
    const c = calcDia(f, d, mapa.get(f.id + "|" + d), aus); if (c.fora) continue;
    if (c.semLanc) { r.semLanc++; continue; }
    if (c.futuro) continue;
    r.trab += c.trab; r.prev += c.prev; r.saldo += c.saldo;
    if (c.saldo > 0) r.extras += c.saldo; if (c.saldo < 0) r.devidas -= c.saldo;
    if (c.oc === "falta") r.faltas++;
  }
  return r;
}

// ----- dados -----
export async function buscarTudo(mk) {
  let out = [], from = 0;
  for (;;) { const { data, error } = await mk().range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; }
  return out;
}
export function useRh(perfil) {
  const [d, setD] = useState(null); const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      const q = (t, o) => supabase.from(t).select("*").order(o);
      const rs = await Promise.all([q("rh_setores", "nome"), q("rh_funcionarios", "nome"), q("rh_ausencias", "data_ini"), q("rh_exames", "realizado_em"), q("rh_epi_tipos", "nome"), supabase.from("rh_epi_nao_usa").select("*"), q("rh_vales", "data")]);
      const er = rs.find(r => r.error); if (er) throw er.error;
      const parcelas = await buscarTudo(() => supabase.from("rh_vale_parcelas").select("*").order("competencia").order("id"));
      const trocas = await buscarTudo(() => supabase.from("rh_epi_trocas").select("*").order("data_troca", { ascending: false }).order("id"));
      setD({ setores: rs[0].data, funcs: rs[1].data, aus: rs[2].data, exames: rs[3].data, epis: rs[4].data, naoUsa: rs[5].data, vales: rs[6].data, parcelas, trocas });
      setErro("");
    } catch (e) { setErro(e.message); }
  }, [perfil.empresa_id]);
  useEffect(() => { carregar(); }, [carregar]);
  return { ...(d || {}), carregado: !!d, erro, recarregar: carregar, empresa_id: perfil.empresa_id };
}

// ----- UI -----
export const css = `
.rhnav{display:flex;gap:4px;overflow-x:auto;margin-bottom:14px;padding-bottom:2px;border-bottom:1px solid #eceef3}
.rhnav button{border:0;background:none;padding:10px 13px;cursor:pointer;font-size:14px;color:#6b7385;border-bottom:2px solid transparent;white-space:nowrap}
.rhnav button.on{color:#1d4ed8;border-color:#1d4ed8;font-weight:600}
.subtabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #eceef3;overflow-x:auto}
.subtabs button{border:0;background:none;padding:9px 14px;cursor:pointer;font-size:14px;color:#6b7385;border-bottom:2px solid transparent;white-space:nowrap}
.subtabs button.on{color:#1d4ed8;border-color:#1d4ed8;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.kpi{border:1px solid #eceef3;border-radius:12px;padding:12px 14px;background:#fff}
.kpi .t{font-size:12px;color:#6b7385}.kpi .v{font-size:24px;font-weight:700;margin-top:2px}.kpi .s{font-size:12px;color:#6b7385}
.kpi.verm .v{color:#b42318}.kpi.verd .v{color:#166534}.kpi.amar .v{color:#b45309}
.pill{font-size:12px;padding:2px 9px;border-radius:99px;white-space:nowrap;display:inline-block}
.pill.falta,.pill.venc{background:#fee2e2;color:#991b1b}.pill.ok{background:#dcfce7;color:#166534}.pill.cinza,.pill.nao{background:#e8ebf2;color:#4a5367}.pill.amar,.pill.avenc{background:#fef3c7;color:#92400e}.pill.sem{background:#e0e7ff;color:#3730a3}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.chips button{border:1px solid #d5d9e2;background:#fff;border-radius:99px;padding:5px 12px;font-size:13px;cursor:pointer}
.chips button.on{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
.wide{max-width:560px !important;max-height:92vh;overflow-y:auto}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.item{border:1px solid #eceef3;border-radius:12px;padding:12px 14px;margin-bottom:8px;background:#fff;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.alerta{border-left:4px solid #f59e0b;background:#fffbeb;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px}
.alerta.verm{border-color:#ef4444;background:#fef2f2}
.ponto td,.ponto th{padding:5px 4px;font-size:13px}.ponto input[type=time]{width:92px;padding:5px 4px;font-size:13px}.ponto select{padding:5px 4px;font-size:13px;max-width:130px}
.ponto tr.fds{background:#f7f8fb}.ponto tr.fora{opacity:.35}.ponto tr.mod{background:#fffbea}
.folha{border:1px solid #d5d9e2;border-radius:10px;padding:16px;background:#fff;margin-top:12px}
@media(max-width:560px){.g2{grid-template-columns:1fr}}
@media print{body *{visibility:hidden}.print-area,.print-area *{visibility:visible}.print-area{position:absolute;left0;top:0;width:100%;border:0}.no-print{display:none !important}}
`.replace("left0", "left:0");
export const Estilos = () => <style>{css}</style>;
export const Kpi = ({ t, v, s, c }) => <div className={"kpi " + (c || "")}><div className="t">{t}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>;
export const Pill = ({ cls, children }) => <span className={"pill " + cls}>{children}</span>;
export function Modal({ titulo, onClose, onSubmit, children, erro, busy, salvar = "Salvar" }) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label={titulo}><form onSubmit={(e) => { e.preventDefault(); onSubmit && onSubmit(); }} className="card modal wide" style={{ display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0 }}>{titulo}</h2>
      {children}
      {erro && <div className="err">{erro}</div>}
      <div className="row">{onSubmit && <button className="btn primary" disabled={busy}>{busy ? "Salvando..." : salvar}</button>}<button type="button" className="btn" onClick={onClose}>{onSubmit ? "Cancelar" : "Fechar"}</button></div>
    </form></div>
  );
}
export function Barras({ dados, series }) {
  const W = 640, H = 190, base = 150, max = Math.max(1, ...dados.flatMap(d => d.vals));
  const gw = W / dados.length, bw = Math.min(18, (gw - 8) / series.length);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <line x1="0" y1={base} x2={W} y2={base} stroke="#d5d9e2" />
        {dados.map((d, i) => (
          <g key={d.rot}>
            {d.vals.map((v, j) => { const h = (v / max) * 110; const x = i * gw + gw / 2 - (series.length * bw) / 2 + j * bw; return (
              <g key={j}><rect x={x} y={base - h} width={bw - 2} height={h} rx="2" fill={series[j].cor} />
                {v > 0 && <text x={x + (bw - 2) / 2} y={base - h - 4} fontSize="11" textAnchor="middle" fill="#4a5367">{v}</text>}</g>); })}
            <text x={i * gw + gw / 2} y={base + 16} fontSize="11" textAnchor="middle" fill="#6b7385">{d.rot}</text>
          </g>))}
      </svg>
      <div className="row" style={{ fontSize: 13 }}>{series.map(s => <span key={s.nome}><span style={{ display: "inline-block", width: 10, height: 10, background: s.cor, borderRadius: 2, marginRight: 5 }} />{s.nome}</span>)}</div>
    </div>
  );
}
