import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, Printer, Save, AlertTriangle, Truck } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { planejar } from "./empacotar.js";

const num = (v) => parseFloat(String(v).replace(",", "."));
const fmt = (n, d = 0) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtData = (s) => s ? s.split("-").reverse().join("/") : "";
const hoje = () => new Date().toISOString().slice(0, 10);
const CORES = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#be185d", "#65a30d", "#7c3aed", "#ca8a04"];
const TIPOS_CAM = { bau: "Baú", sider: "Sider (lona)", carroceria: "Carroceria aberta" };
const CATS_CAM = { vuc: "VUC", tres_quartos: "3/4", toco: "Toco", truck: "Truck", bitruck: "Bitruck", carreta: "Carreta", outro: "Outro" };
const descCam = (c) => [TIPOS_CAM[c.tipo] || "Baú", CATS_CAM[c.categoria]].filter(Boolean).join(" · ");
const ALT_ABERTA = 400; // altura "de enfeite" gravada na carroceria aberta; quem manda é o limite de caixas empilhadas
const medCam = (c) => c.tipo === "carroceria" ? `${fmt(c.comp_cm, 1)} × ${fmt(c.larg_cm, 1)} cm · empilha até ${c.max_pilha || "?"}` : medidas(c);
const medidas = (o) => `${fmt(o.comp_cm, 1)} × ${fmt(o.larg_cm, 1)} × ${fmt(o.alt_cm, 1)} cm`;

const css = `
.cg-resumo{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0}
.cg-resumo div{border:1px solid #eceef3;border-radius:12px;padding:10px 12px;background:#fff}
.cg-resumo b{display:block;font-size:20px}.cg-resumo span{font-size:12px;color:#5a6478}
.cg-aviso{background:#fef3c7;color:#92400e;border-radius:10px;padding:10px 12px;font-size:14px;margin:10px 0;display:flex;gap:8px;align-items:flex-start}
.cg-item{display:grid;grid-template-columns:1fr 100px auto;gap:8px;align-items:end;margin-bottom:8px}
.cg-leg{display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin:8px 0}
.cg-leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.cg-camadas{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.cg-camadas button{border:1px solid #d5d9e2;background:#fff;border-radius:99px;padding:5px 12px;cursor:pointer;font-size:13px}
.cg-camadas button.on{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
.cg-vista{border:1px solid #eceef3;border-radius:12px;background:#fff;padding:8px;overflow-x:auto}
.cg-vista svg{display:block;width:100%;height:auto;min-width:420px}
.cg-3d{border:1px solid #eceef3;border-radius:12px;background:#f7f9ff;touch-action:none;cursor:grab;width:100%}
.cg-3d:active{cursor:grabbing}
.cg-print{display:none}
.cg-print svg{width:100%;height:auto}
@media print{.cg-print{display:block !important}.cg-print .pag{page-break-inside:avoid;margin-bottom:14px}}
@media(max-width:560px){.cg-item{grid-template-columns:1fr 80px auto}}
`;

// miniatura isométrica da caixa (proporcional às medidas), no estilo de caixa de papelão
function CaixaIcone({ t, cor }) {
  const c = Number(t.comp_cm), l = Number(t.larg_cm), a = Number(t.alt_cm);
  const m = Math.max(c, l, a) || 1, k = 22 / m, ang = Math.PI / 6;
  const X = c * k, Y = l * k, Z = a * k, cx = Math.cos(ang), sx = Math.sin(ang);
  const pt = (x, y, z) => [30 + (x - y) * cx, 40 + (x + y) * sx - z];
  const poly = (ps, f) => <polygon points={ps.map(p => p.join(",")).join(" ")} fill={f} stroke="rgba(70,45,20,.55)" strokeWidth=".8" strokeLinejoin="round" />;
  return (
    <svg width="44" height="44" viewBox="0 0 60 60" aria-hidden="true" style={{ flex: "none" }}>
      {poly([pt(0, Y, 0), pt(X, Y, 0), pt(X, Y, Z), pt(0, Y, Z)], escurece("#c8a06a", 0.85))}
      {poly([pt(X, 0, 0), pt(X, Y, 0), pt(X, Y, Z), pt(X, 0, Z)], escurece("#c8a06a", 0.7))}
      {poly([pt(0, 0, Z), pt(X, 0, Z), pt(X, Y, Z), pt(0, Y, Z)], "#c8a06a")}
      {poly([pt(X * 0.1, Y * 0.5 - Y * 0.06, Z), pt(X * 0.9, Y * 0.5 - Y * 0.06, Z), pt(X * 0.9, Y * 0.5 + Y * 0.06, Z), pt(X * 0.1, Y * 0.5 + Y * 0.06, Z)], "#dcc392")}
      {poly([pt(X * 0.12, Y, Z * 0.2), pt(X * 0.88, Y, Z * 0.2), pt(X * 0.88, Y, Z * 0.5), pt(X * 0.12, Y, Z * 0.5)], escurece(cor, 0.85))}
    </svg>
  );
}

const corDe = (tipos, id) => CORES[Math.max(0, tipos.findIndex(t => t.id === id)) % CORES.length];
function escurece(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------- vista de cima de uma camada ----------
function VistaCima({ cam, plano, tipos, camada }) {
  const W = cam.comp_cm, H = cam.larg_cm;
  const pad = 14, fs = Math.max(8, Math.min(H / 7, W / 40));
  return (
    <svg viewBox={`${-pad} ${-pad - fs} ${W + pad * 2} ${H + pad * 2 + fs * 2}`} role="img" aria-label={`Vista de cima, camada ${camada}`}>
      <text x="0" y={-fs * 0.4} fontSize={fs} fill="#5a6478">◀ cabine</text>
      <text x={W} y={-fs * 0.4} fontSize={fs} fill="#5a6478" textAnchor="end">porta ▶</text>
      <rect x="0" y="0" width={W} height={H} fill="#f1f4fa" stroke="#4a5367" strokeWidth={Math.max(1, W / 400)} />
      {plano.caixas.filter(b => b.nivel < camada).map(b => (
        <rect key={"f" + b.seq} x={b.x} y={b.y} width={b.dx} height={b.dy} fill="#dde2ec" stroke="#c3cad8" strokeWidth={Math.max(0.5, W / 900)} />
      ))}
      {plano.caixas.filter(b => b.nivel === camada).map(b => {
        const cor = corDe(tipos, b.tipo.id);
        const t = Math.min(b.dx, b.dy) * 0.38;
        return (
          <g key={b.seq}>
            <rect x={b.x} y={b.y} width={b.dx} height={b.dy} fill={cor} fillOpacity="0.85" stroke="#fff" strokeWidth={Math.max(0.6, W / 700)} />
            <text x={b.x + b.dx / 2} y={b.y + b.dy / 2} fontSize={Math.max(5, t)} fill="#fff" textAnchor="middle" dominantBaseline="central" fontWeight="700">{b.seq}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- vista 3D (canvas, sem biblioteca) ----------
function Vista3D({ cam, plano, tipos, camada }) {
  const ref = useRef(null);
  const [yaw, setYaw] = useState(-0.6);
  const [papelao, setPapelao] = useState(true);
  const drag = useRef(null);
  const PITCH = 0.55;

  const desenhar = useCallback(() => {
    const cv = ref.current; if (!cv) return;
    const w = cv.clientWidth, h = 360, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const cx0 = cam.comp_cm / 2, cy0 = cam.larg_cm / 2, cz0 = cam.alt_cm / 2;
    const rot = (x, y, z) => { x -= cx0; y -= cy0; z -= cz0; const x1 = x * cy - y * sy, y1 = x * sy + y * cy; return { x: x1, u: z * cp + y1 * sp, d: y1 * cp - z * sp }; };
    // escala para caber o baú inteiro
    const cantos = []; for (const x of [0, cam.comp_cm]) for (const y of [0, cam.larg_cm]) for (const z of [0, cam.alt_cm]) cantos.push(rot(x, y, z));
    const minX = Math.min(...cantos.map(c => c.x)), maxX = Math.max(...cantos.map(c => c.x));
    const minU = Math.min(...cantos.map(c => c.u)), maxU = Math.max(...cantos.map(c => c.u));
    const esc = Math.min((w - 24) / (maxX - minX || 1), (h - 24) / (maxU - minU || 1));
    const ox = w / 2 - ((minX + maxX) / 2) * esc, oy = h / 2 + ((minU + maxU) / 2) * esc;
    const P = (x, y, z) => { const r = rot(x, y, z); return [ox + r.x * esc, oy - r.u * esc]; };
    // direção para a câmera no referencial girado: (0, -cp, sp)
    const visivel = (nx, ny, nz) => { const x1 = nx * cy - ny * sy, y1 = nx * sy + ny * cy; return (y1 * -cp + nz * sp) > 0.0001; };

    // contorno: baú/sider = caixa fechada; carroceria = piso com bordas baixas e linha do limite de altura
    const C = (x, y, z) => P(x * cam.comp_cm, y * cam.larg_cm, z * cam.alt_cm);
    const arestas = [[[0,0,0],[1,0,0]],[[0,1,0],[1,1,0]],[[0,0,1],[1,0,1]],[[0,1,1],[1,1,1]],[[0,0,0],[0,1,0]],[[1,0,0],[1,1,0]],[[0,0,1],[0,1,1]],[[1,0,1],[1,1,1]],[[0,0,0],[0,0,1]],[[1,0,0],[1,0,1]],[[0,1,0],[0,1,1]],[[1,1,0],[1,1,1]]];
    const traco = (lista) => { g.beginPath(); for (const [a, b] of lista) { const p = C(...a), q = C(...b); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); } g.stroke(); };
    const aberta = cam.tipo === "carroceria";
    g.strokeStyle = "#8a94a8"; g.lineWidth = 1; g.setLineDash([4, 3]);
    if (!aberta) traco(arestas);
    g.setLineDash([]);
    if (aberta) {
      // grades baixas nas laterais e na frente (40 cm) e quatro postes
      const hb = Math.min(0.2, 40 / cam.alt_cm);
      g.strokeStyle = "#5a6478"; g.lineWidth = 1.6;
      traco([[[0,0,0],[1,0,0]],[[0,1,0],[1,1,0]],[[0,0,0],[0,1,0]],[[1,0,0],[1,1,0]],[[0,0,hb],[1,0,hb]],[[0,1,hb],[1,1,hb]],[[0,0,hb],[0,1,hb]],
        [[0,0,0],[0,0,hb]],[[1,0,0],[1,0,hb]],[[0,1,0],[0,1,hb]],[[1,1,0],[1,1,hb]]]);
      g.lineWidth = 1;
    } else if (cam.tipo === "sider") {
      g.strokeStyle = "#8a94a8"; g.fillStyle = "rgba(90,110,150,.07)";
      for (const y of [0, 1]) { g.beginPath(); [[0,0],[1,0],[1,1],[0,1]].forEach(([a, b], i) => { const p = C(a, y, b); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath(); g.fill(); }
    }
    // piso
    g.fillStyle = "rgba(120,130,150,.15)"; g.beginPath();
    [[0,0],[1,0],[1,1],[0,1]].forEach(([a, b], i) => { const p = C(a, b, 0); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath(); g.fill();
    // marca da cabine (parede x=0)
    g.fillStyle = "#5a6478"; g.font = "12px system-ui"; g.textAlign = "center";
    const cab = P(0, cam.larg_cm / 2, cam.alt_cm); g.fillText("cabine", cab[0], cab[1] - 6);

    const lista = plano.caixas.filter(b => b.nivel <= camada).map(b => ({ b, d: rot(b.x + b.dx / 2, b.y + b.dy / 2, b.z + b.dz / 2).d }));
    lista.sort((p, q) => q.d - p.d); // mais longe primeiro
    const KRAFT = "#c8a06a";
    for (const { b } of lista) {
      const cor = corDe(tipos, b.tipo.id);
      const { x, y, z, dx, dy, dz } = b;
      // cada face: origem + dois vetores; sub(u0,u1,v0,v1) devolve um retângulo dentro dela
      const faces = [
        { n: [0, 0, 1], f: 1.0, topo: true, o: [x, y, z + dz], a: [dx, 0, 0], e: [0, dy, 0] },
        { n: [-1, 0, 0], f: 0.72, o: [x, y, z], a: [0, dy, 0], e: [0, 0, dz] },
        { n: [1, 0, 0], f: 0.72, o: [x + dx, y, z], a: [0, dy, 0], e: [0, 0, dz] },
        { n: [0, -1, 0], f: 0.85, o: [x, y, z], a: [dx, 0, 0], e: [0, 0, dz] },
        { n: [0, 1, 0], f: 0.85, o: [x, y + dy, z], a: [dx, 0, 0], e: [0, 0, dz] },
      ];
      const sub = (fc, u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => fc.o.map((o, k) => o + fc.a[k] * u + fc.e[k] * v));
      const poli = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => { const q = P(...p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fillStyle = fill; g.fill(); };
      for (const fc of faces) {
        if (!visivel(...fc.n)) continue;
        poli(sub(fc, 0, 1, 0, 1), escurece(papelao ? KRAFT : cor, fc.f));
        if (papelao) {
          if (fc.topo) { // fita da caixa, no sentido do comprimento
            const fita = dx >= dy ? sub(fc, 0, 1, 0.45, 0.55) : sub(fc, 0.45, 0.55, 0, 1);
            poli(fita, escurece("#dcc392", fc.f));
          } else {
            // etiqueta na cor do tipo, só nas faces mais largas (onde fica a marca da caixa)
            const larga = fc.n[1] !== 0 ? dx >= dy : dy >= dx;
            if (larga) poli(sub(fc, 0.12, 0.88, 0.16, 0.46), escurece(cor, fc.f));
          }
        }
        g.beginPath(); sub(fc, 0, 1, 0, 1).forEach((p, i) => { const q = P(...p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath();
        g.strokeStyle = papelao ? "rgba(70,45,20,.55)" : "rgba(255,255,255,.75)"; g.lineWidth = 0.8; g.stroke();
      }
    }
  }, [cam, plano, tipos, camada, yaw, papelao]);

  useEffect(() => { desenhar(); const f = () => desenhar(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [desenhar]);

  return (
    <div>
      <canvas ref={ref} className="cg-3d" style={{ height: 360 }} aria-label="Vista 3D do carregamento. Arraste para girar."
        onPointerDown={(e) => { drag.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current == null) return; setYaw(y => y + (e.clientX - drag.current) * 0.01); drag.current = e.clientX; }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      <div className="row" style={{ marginTop: 8 }}>
        <span className="muted">Arraste para girar</span>
        <input type="range" min="-3.15" max="3.15" step="0.05" value={yaw} onChange={(e) => setYaw(Number(e.target.value))} aria-label="Girar o carregamento" style={{ flex: 1, minWidth: 120, padding: 0 }} />
        <button type="button" className="btn sm" onClick={() => setYaw(-0.6)}>Voltar</button>
        <button type="button" className="btn sm" onClick={() => setPapelao(v => !v)}>{papelao ? "Ver colorido" : "Ver caixa de papelão"}</button>
      </div>
    </div>
  );
}

export default function Carregamento({ perfil, secao, irPara }) {
  const aba = secao || "plano";
  const [caminhoes, setCaminhoes] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [salvos, setSalvos] = useState([]);
  const [salvosItens, setSalvosItens] = useState([]);
  const [camId, setCamId] = useState("");
  const [itens, setItens] = useState([{ tipoId: "", qtd: "" }]);
  const [vista, setVista] = useState("cima");
  const [camada, setCamada] = useState(1);
  const [todas, setTodas] = useState(true);
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({});
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const rs = await Promise.all([
      supabase.from("caminhoes").select("*").order("nome"),
      supabase.from("caixas_tipo").select("*").order("nome"),
      supabase.from("carregamentos").select("*").order("data", { ascending: false }),
      supabase.from("carregamento_itens").select("*"),
    ]);
    const er = rs.find(r => r.error);
    if (er) { setErro(er.error.message); setCarregando(false); return; }
    setCaminhoes(rs[0].data); setTipos(rs[1].data); setSalvos(rs[2].data); setSalvosItens(rs[3].data); setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setErro(""); setOk(""); }, [aba]);

  const cam = caminhoes.find(c => c.id === camId) || null;
  const limiteCam = cam && cam.tipo === "carroceria" ? (cam.max_pilha || 1) : 99;
  const tiposP = useMemo(() => tipos.map(t => ({ id: t.id, nome: t.nome, c: Number(t.comp_cm), l: Number(t.larg_cm), a: Number(t.alt_cm), max: Math.min(t.max_pilha, limiteCam), deitar: t.pode_deitar })), [tipos, limiteCam]);
  const pedido = useMemo(() => itens.map(i => ({ tipoId: i.tipoId, qtd: Math.floor(num(i.qtd)) })).filter(i => i.tipoId && i.qtd > 0), [itens]);
  const plano = useMemo(() => {
    if (!cam || !pedido.length) return null;
    return planejar({ c: Number(cam.comp_cm), l: Number(cam.larg_cm), a: cam.tipo === "carroceria" ? 1000 : Number(cam.alt_cm), aberta: cam.tipo === "carroceria" }, tiposP, pedido);
  }, [cam, tiposP, pedido]);
  const aberta = !!cam && cam.tipo === "carroceria";
  const planoAlt = plano ? plano.caixas.reduce((m, b) => Math.max(m, b.z + b.dz), 0) : 100;
  const camP = cam && { comp_cm: Number(cam.comp_cm), larg_cm: Number(cam.larg_cm), alt_cm: aberta ? Math.max(100, Math.round(planoAlt)) : Number(cam.alt_cm), tipo: cam.tipo || "bau" };
  const camadaEf = plano ? Math.min(Math.max(1, camada), Math.max(1, plano.niveis)) : 1;
  const camada3d = todas && plano ? plano.niveis : camadaEf;
  const naoCabem = plano ? plano.porTipo.filter(p => p.cabem < p.pedido) : [];
  const tiposVazios = !carregando && (caminhoes.length === 0 || tipos.length === 0);

  // ---------- cadastros ----------
  function abrirCam(c) {
    setF(c ? { id: c.id, nome: c.nome, comp: String(c.comp_cm).replace(".", ","), larg: String(c.larg_cm).replace(".", ","), alt: String(c.alt_cm).replace(".", ","), obs: c.observacao || "", tipo: c.tipo || "bau", cat: c.categoria || "", pilha: String(c.max_pilha || 3) }
           : { nome: "", comp: "", larg: "", alt: "", obs: "", tipo: "bau", cat: "", pilha: "3" });
    setErro(""); setModal("cam");
  }
  async function salvarCam(e) {
    e.preventDefault();
    const ab = f.tipo === "carroceria";
    const [c, l, a, p] = [num(f.comp), num(f.larg), ab ? ALT_ABERTA : num(f.alt), Math.floor(num(f.pilha))];
    if (!f.nome.trim()) return setErro("Dê um nome para o caminhão.");
    if (!(c > 0 && l > 0 && a > 0)) return setErro(ab ? "Informe comprimento e largura da carroceria, em centímetros." : "Informe comprimento, largura e altura, em centímetros.");
    if (ab && !(p >= 1 && p <= 30)) return setErro("Informe quantas caixas podem ser empilhadas (de 1 a 30).");
    setBusy(true);
    const dados = { nome: f.nome.trim(), comp_cm: c, larg_cm: l, alt_cm: a, observacao: f.obs.trim() || null, tipo: f.tipo, categoria: f.cat || null, max_pilha: ab ? p : null };
    const { error } = f.id ? await supabase.from("caminhoes").update(dados).eq("id", f.id) : await supabase.from("caminhoes").insert({ ...dados, empresa_id: perfil.empresa_id });
    setBusy(false);
    if (error) return setErro(error.message);
    setModal(null); carregar();
  }
  async function excluirCam(c) {
    if (!confirm(`Excluir o caminhão "${c.nome}"?`)) return;
    const { error } = await supabase.from("caminhoes").delete().eq("id", c.id);
    if (error) setErro(error.message.includes("violates foreign key") ? "Esse caminhão tem carregamentos salvos. Exclua esses carregamentos primeiro." : error.message); else { if (camId === c.id) setCamId(""); carregar(); }
  }
  function abrirTipo(t) {
    setF(t ? { id: t.id, nome: t.nome, comp: String(t.comp_cm).replace(".", ","), larg: String(t.larg_cm).replace(".", ","), alt: String(t.alt_cm).replace(".", ","), pilha: String(t.max_pilha), deitar: t.pode_deitar }
           : { nome: "", comp: "", larg: "", alt: "", pilha: "2", deitar: false });
    setErro(""); setModal("tipo");
  }
  async function salvarTipo(e) {
    e.preventDefault();
    const [c, l, a, p] = [num(f.comp), num(f.larg), num(f.alt), Math.floor(num(f.pilha))];
    if (!f.nome.trim()) return setErro("Dê um nome para o tipo de caixa.");
    if (!(c > 0 && l > 0 && a > 0)) return setErro("Informe comprimento, largura e altura da caixa, em centímetros.");
    if (!(p >= 1 && p <= 30)) return setErro("O limite de caixas empilhadas deve ficar entre 1 e 30.");
    setBusy(true);
    const dados = { nome: f.nome.trim(), comp_cm: c, larg_cm: l, alt_cm: a, max_pilha: p, pode_deitar: !!f.deitar };
    const { error } = f.id ? await supabase.from("caixas_tipo").update(dados).eq("id", f.id) : await supabase.from("caixas_tipo").insert({ ...dados, empresa_id: perfil.empresa_id });
    setBusy(false);
    if (error) return setErro(error.message);
    setModal(null); carregar();
  }
  async function excluirTipo(t) {
    if (!confirm(`Excluir o tipo de caixa "${t.nome}"?`)) return;
    const { error } = await supabase.from("caixas_tipo").delete().eq("id", t.id);
    if (error) setErro(error.message.includes("violates foreign key") ? "Esse tipo está em carregamentos salvos. Exclua esses carregamentos primeiro." : error.message); else carregar();
  }

  // ---------- carregamentos salvos ----------
  function abrirSalvar() { setF({ nome: "", data: hoje(), obs: "" }); setErro(""); setModal("salvar"); }
  async function salvarCarregamento(e) {
    e.preventDefault();
    if (!f.nome.trim()) return setErro("Dê um nome para o carregamento (ex.: Entrega Cel 28/11).");
    setBusy(true);
    try {
      const { data: g, error } = await supabase.from("carregamentos").insert({ empresa_id: perfil.empresa_id, caminhao_id: camId, nome: f.nome.trim(), data: f.data || hoje(), observacao: f.obs.trim() || null }).select().single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("carregamento_itens").insert(pedido.map(p => ({ carregamento_id: g.id, empresa_id: perfil.empresa_id, tipo_id: p.tipoId, quantidade: p.qtd })));
      if (e2) { await supabase.from("carregamentos").delete().eq("id", g.id); throw e2; }
      setModal(null); setOk("Carregamento salvo."); carregar();
    } catch (er) { setErro(er.message); }
    setBusy(false);
  }
  function abrirSalvo(g) {
    setCamId(g.caminhao_id);
    setItens(salvosItens.filter(i => i.carregamento_id === g.id).map(i => ({ tipoId: i.tipo_id, qtd: String(i.quantidade) })));
    setCamada(1); setTodas(true); setErro(""); setOk("");
    irPara && irPara("plano");
  }
  async function excluirSalvo(g) {
    if (!confirm(`Excluir o carregamento "${g.nome}"?`)) return;
    const { error } = await supabase.from("carregamentos").delete().eq("id", g.id);
    if (error) setErro(error.message); else carregar();
  }

  const setItem = (i, k, v) => setItens(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const msg = (<>{erro && <div className="err" style={{ margin: "10px 0" }}>{erro}</div>}{ok && <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "8px 12px", margin: "10px 0", fontSize: 14 }}>{ok}</div>}</>);

  // ---------- telas ----------
  if (aba === "cam") return (
    <div className="card"><style>{css}</style>
      <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Caminhões</h2><button className="btn primary sm" onClick={() => abrirCam(null)}><Plus size={14} /> Novo caminhão</button></div>
      <p className="muted">Cadastre as medidas internas do baú ou da carroceria.</p>{msg}
      {!caminhoes.length && !carregando && <p className="muted">Nenhum caminhão cadastrado ainda.</p>}
      {caminhoes.map(c => (
        <div className="cadrow" key={c.id} onClick={() => abrirCam(c)}>
          <div><b>{c.nome}</b><div className="muted">{descCam(c)} · {medCam(c)}{c.tipo === "carroceria" ? "" : ` · ${fmt(c.comp_cm * c.larg_cm * c.alt_cm / 1e6, 1)} m³`}</div></div>
          <button className="btn sm" aria-label={"Excluir " + c.nome} onClick={(e) => { e.stopPropagation(); excluirCam(c); }}><Trash2 size={14} /></button>
        </div>))}
      {modal === "cam" && (
        <div className="modal-bg"><form onSubmit={salvarCam} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2>{f.id ? "Editar caminhão" : "Novo caminhão"}</h2>
          <label>Tipo de carroceria
            <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS_CAM).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label>Tipo de caminhão (opcional)
            <select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="">Não informar</option>{Object.entries(CATS_CAM).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label>Nome ou placa<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} maxLength={80} placeholder="Ex.: Baú 7 m – ABC1D23" autoFocus /></label>
          <label>{f.tipo === "carroceria" ? "Comprimento da carroceria (cm)" : "Comprimento do baú (cm)"}<input inputMode="decimal" value={f.comp} onChange={e => setF({ ...f, comp: e.target.value })} placeholder="Ex.: 700" /></label>
          <label>Largura (cm)<input inputMode="decimal" value={f.larg} onChange={e => setF({ ...f, larg: e.target.value })} placeholder="Ex.: 240" /></label>
          {f.tipo === "carroceria"
            ? <label>Quantas caixas empilhar, no máximo<input inputMode="numeric" value={f.pilha} onChange={e => setF({ ...f, pilha: e.target.value })} placeholder="Ex.: 3" />
                <span className="muted">Carroceria aberta não tem teto: o que limita a altura é a pilha de caixas.</span></label>
            : <label>Altura (cm)<input inputMode="decimal" value={f.alt} onChange={e => setF({ ...f, alt: e.target.value })} placeholder="Ex.: 260" /></label>}
          <label>Observação (opcional)<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} maxLength={300} /></label>
          {erro && <div className="err">{erro}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><button className="btn primary" disabled={busy}>Salvar</button></div>
        </form></div>)}
    </div>);

  if (aba === "cx") return (
    <div className="card"><style>{css}</style>
      <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Tipos de caixa</h2><button className="btn primary sm" onClick={() => abrirTipo(null)}><Plus size={14} /> Novo tipo</button></div>
      <p className="muted">Medidas da caixa em pé, do jeito que ela fica no chão do baú.</p>{msg}
      {!tipos.length && !carregando && <p className="muted">Nenhum tipo de caixa cadastrado ainda.</p>}
      {tipos.map((t, i) => (
        <div className="cadrow" key={t.id} onClick={() => abrirTipo(t)}>
          <div className="row" style={{ flexWrap: "nowrap", gap: 12 }}><CaixaIcone t={t} cor={CORES[i % CORES.length]} />
            <div><b>{t.nome}</b>
              <div className="muted">{medidas(t)} · {t.max_pilha === 1 ? "não empilha" : `até ${t.max_pilha} na pilha`}{t.pode_deitar ? " · pode deitar" : ""}</div></div></div>
          <button className="btn sm" aria-label={"Excluir " + t.nome} onClick={(e) => { e.stopPropagation(); excluirTipo(t); }}><Trash2 size={14} /></button>
        </div>))}
      {modal === "tipo" && (
        <div className="modal-bg"><form onSubmit={salvarTipo} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2>{f.id ? "Editar tipo de caixa" : "Novo tipo de caixa"}</h2>
          <label>Nome<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} maxLength={80} placeholder="Ex.: Caixa cadeira Júlia" autoFocus /></label>
          <label>Comprimento (cm)<input inputMode="decimal" value={f.comp} onChange={e => setF({ ...f, comp: e.target.value })} /></label>
          <label>Largura (cm)<input inputMode="decimal" value={f.larg} onChange={e => setF({ ...f, larg: e.target.value })} /></label>
          <label>Altura (cm)<input inputMode="decimal" value={f.alt} onChange={e => setF({ ...f, alt: e.target.value })} /></label>
          <label>Quantas caixas podem ficar empilhadas<input inputMode="numeric" value={f.pilha} onChange={e => setF({ ...f, pilha: e.target.value })} />
            <span className="muted">Conte a caixa de baixo. 1 = não pode empilhar nada em cima.</span></label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={!!f.deitar} onChange={e => setF({ ...f, deitar: e.target.checked })} style={{ width: 18, height: 18 }} /> Pode ficar deitada</label>
          {erro && <div className="err">{erro}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><button className="btn primary" disabled={busy}>Salvar</button></div>
        </form></div>)}
    </div>);

  if (aba === "hist") return (
    <div className="card"><style>{css}</style>
      <h2>Carregamentos salvos</h2>{msg}
      {!salvos.length && !carregando && <p className="muted">Nenhum carregamento salvo ainda. Monte um em “Planejar” e clique em Salvar.</p>}
      {salvos.map(g => {
        const its = salvosItens.filter(i => i.carregamento_id === g.id);
        const total = its.reduce((s, i) => s + i.quantidade, 0);
        return (
          <div className="cadrow" key={g.id} onClick={() => abrirSalvo(g)}>
            <div><b>{g.nome}</b><div className="muted">{fmtData(g.data)} · {caminhoes.find(c => c.id === g.caminhao_id)?.nome || "Caminhão"} · {total} caixa{total === 1 ? "" : "s"}</div></div>
            <button className="btn sm" aria-label={"Excluir " + g.nome} onClick={(e) => { e.stopPropagation(); excluirSalvo(g); }}><Trash2 size={14} /></button>
          </div>);
      })}
    </div>);

  // ----- planejar -----
  return (
    <div><style>{css}</style>
      <div className="card no-print">
        <h2>Planejar carregamento</h2>{msg}
        {tiposVazios && (
          <div className="cg-aviso"><AlertTriangle size={18} /><span>Antes de planejar, cadastre {caminhoes.length === 0 ? "pelo menos um caminhão (menu Caminhões)" : ""}{caminhoes.length === 0 && tipos.length === 0 ? " e " : ""}{tipos.length === 0 ? "pelo menos um tipo de caixa (menu Tipos de caixa)" : ""}.</span></div>)}
        <label>Caminhão
          <select value={camId} onChange={e => setCamId(e.target.value)}>
            <option value="">Escolha o caminhão…</option>
            {caminhoes.map(c => <option key={c.id} value={c.id}>{c.nome} — {descCam(c)} · {medCam(c)}</option>)}
          </select></label>
        <h3 style={{ margin: "16px 0 8px", fontSize: 15 }}>O que vai no caminhão</h3>
        {itens.map((it, i) => (
          <div className="cg-item" key={i}>
            <label>Tipo de caixa
              <select value={it.tipoId} onChange={e => setItem(i, "tipoId", e.target.value)}>
                <option value="">Escolha…</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.nome} — {medidas(t)}</option>)}
              </select></label>
            <label>Quantidade<input inputMode="numeric" value={it.qtd} onChange={e => setItem(i, "qtd", e.target.value)} placeholder="0" /></label>
            <button type="button" className="btn sm" aria-label="Remover linha" disabled={itens.length === 1} onClick={() => setItens(l => l.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>))}
        <button type="button" className="btn sm" onClick={() => setItens(l => [...l, { tipoId: "", qtd: "" }])}><Plus size={14} /> Outro tipo de caixa</button>
      </div>

      {plano && cam && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="no-print">
            <div className="cg-resumo">
              <div><b>{plano.caixas.length} de {pedido.reduce((s, p) => s + p.qtd, 0)}</b><span>caixas cabem</span></div>
              <div><b>{fmt(plano.ocupacao * 100, 1)}%</b><span>{aberta ? "do piso ocupado" : "do volume do baú"}</span></div>
              <div><b>{fmt(plano.compOcupado / 100, 2)} m</b><span>de {fmt(cam.comp_cm / 100, 2)} m ocupados</span></div>
              <div><b>{plano.niveis}</b><span>camada{plano.niveis === 1 ? "" : "s"} de altura</span></div>
            </div>
            {naoCabem.length > 0 && (
              <div className="cg-aviso"><AlertTriangle size={18} /><span><b>Não cabem tudo.</b> {naoCabem.map(p => `${p.pedido - p.cabem} de ${p.tipo.nome}`).join(", ")} ficam de fora. Use outro caminhão ou divida em duas viagens.</span></div>)}
            <div className="cg-leg">{plano.porTipo.map(p => <span key={p.tipo.id}><i style={{ background: corDe(tiposP, p.tipo.id) }} />{p.tipo.nome}: {p.cabem}{p.cabem < p.pedido ? ` de ${p.pedido}` : ""}</span>)}</div>

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="cg-camadas" role="tablist" aria-label="Tipo de vista">
                <button className={vista === "cima" ? "on" : ""} onClick={() => setVista("cima")}>Vista de cima</button>
                <button className={vista === "3d" ? "on" : ""} onClick={() => setVista("3d")}>3D</button>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
                <button className="btn primary sm" onClick={abrirSalvar}><Save size={14} /> Salvar carregamento</button>
              </div>
            </div>

            {vista === "cima" ? (
              <>
                <div className="cg-camadas">
                  {Array.from({ length: plano.niveis }, (_, i) => i + 1).map(n => <button key={n} className={camadaEf === n ? "on" : ""} onClick={() => setCamada(n)}>Camada {n}</button>)}
                </div>
                <div className="cg-vista"><VistaCima cam={camP} plano={plano} tipos={tiposP} camada={camadaEf} /></div>
                <p className="muted">Os números são a ordem de carga: comece pelo fundo, perto da cabine. As caixas cinzas são a camada de baixo.</p>
              </>
            ) : (
              <>
                {plano.niveis > 1 && (
                  <div className="cg-camadas">
                    <button className={todas ? "on" : ""} onClick={() => setTodas(true)}>Todas as camadas</button>
                    {Array.from({ length: plano.niveis - 1 }, (_, i) => i + 1).map(n => <button key={n} className={!todas && camadaEf === n ? "on" : ""} onClick={() => { setTodas(false); setCamada(n); }}>Até a camada {n}</button>)}
                  </div>)}
                <Vista3D cam={camP} plano={plano} tipos={tiposP} camada={camada3d} />
              </>
            )}

            <h3 style={{ margin: "18px 0 6px", fontSize: 15 }}>Ordem de carga</h3>
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              <table><thead><tr><th>Nº</th><th>Caixa</th><th>Camada</th><th>Distância da cabine</th></tr></thead>
                <tbody>{plano.caixas.slice(0, 400).map(b => (
                  <tr key={b.seq}><td>{b.seq}</td><td><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: corDe(tiposP, b.tipo.id), marginRight: 6 }} />{b.tipo.nome}</td><td>{b.nivel}</td><td>{fmt(b.x, 0)} cm</td></tr>))}</tbody></table>
            </div>
            {plano.caixas.length > 400 && <p className="muted">Mostrando as 400 primeiras. A impressão traz o desenho completo.</p>}
          </div>

          <div className="cg-print print-area">
            <h1>Carregamento — {cam.nome}</h1>
            <p>{descCam(cam)} {medCam(cam)} · {plano.caixas.length} caixas · {fmt(plano.ocupacao * 100, 1)}% {aberta ? "do piso" : "do volume"} · emitido em {fmtData(hoje())}</p>
            <p>{plano.porTipo.map(p => `${p.tipo.nome}: ${p.cabem}${p.cabem < p.pedido ? ` de ${p.pedido}` : ""}`).join(" · ")}</p>
            {naoCabem.length > 0 && <p><b>Não cabem:</b> {naoCabem.map(p => `${p.pedido - p.cabem} de ${p.tipo.nome}`).join(", ")}</p>}
            {Array.from({ length: plano.niveis }, (_, i) => i + 1).map(n => (
              <div className="pag" key={n}><h3>Camada {n} — vista de cima (cabine à esquerda, porta à direita)</h3><VistaCima cam={camP} plano={plano} tipos={tiposP} camada={n} /></div>))}
          </div>
        </div>
      )}

      {!plano && !tiposVazios && !carregando && <p className="muted" style={{ marginTop: 14 }}><Truck size={14} style={{ verticalAlign: -2 }} /> Escolha o caminhão e informe as quantidades para ver como carregar.</p>}

      {modal === "salvar" && (
        <div className="modal-bg"><form onSubmit={salvarCarregamento} className="card modal" style={{ display: "grid", gap: 10 }}>
          <h2>Salvar carregamento</h2>
          <label>Nome<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} maxLength={80} placeholder="Ex.: Entrega Cel 28/11" autoFocus /></label>
          <label>Data<input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
          <label>Observação (opcional)<input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} maxLength={300} /></label>
          {erro && <div className="err">{erro}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button><button className="btn primary" disabled={busy}>Salvar</button></div>
        </form></div>)}
    </div>
  );
}
