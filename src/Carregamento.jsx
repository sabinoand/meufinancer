import { useEffect, useState, useCallback, useMemo, useRef, useDeferredValue } from "react";
import { Plus, Pencil, Trash2, Printer, Save, AlertTriangle, Truck } from "lucide-react";
import { supabase } from "./supabaseClient.js";
import { planejar, orientacoes, resumir, conferirCaixa, encostar, temCaixaEmCima, alturaApoio } from "./empacotar.js";

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
.cg-edicao{background:#f5f8ff;border:1px solid #cdd9f5;border-radius:12px;padding:10px 12px;margin:8px 0}
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
function VistaCima({ cam, plano, tipos, camada, ponteiro, fantasma, sel, marq, oculta }) {
  const caixas = oculta && oculta.length ? plano.caixas.filter(b => !oculta.includes(b)) : plano.caixas;
  const W = cam.comp_cm, H = cam.larg_cm, sl = cam.sobraLado || 0, st = cam.sobraTras || 0;
  const pad = 14, fs = Math.max(8, Math.min(H / 7, W / 40));
  const arrasto = useRef(false);
  const pos = (e) => { const sv = e.currentTarget; const pt = sv.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(sv.getScreenCTM().inverse()); return [q.x, q.y]; };
  const eventos = ponteiro ? {
    onPointerDown: (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); arrasto.current = true; ponteiro.down(...pos(e)); },
    onPointerMove: (e) => { if (arrasto.current) ponteiro.move(...pos(e)); },
    onPointerUp: (e) => { if (arrasto.current) { arrasto.current = false; ponteiro.up(...pos(e)); } },
    onPointerCancel: () => { arrasto.current = false; },
  } : {};
  const selecionada = (b) => !!sel && sel.includes(b);
  return (
    <svg viewBox={`${-pad} ${-pad - fs - sl} ${W + st + pad * 2} ${H + sl * 2 + pad * 2 + fs * 2}`} role="img" aria-label={`Vista de cima, camada ${camada}`}
      style={ponteiro ? { cursor: "crosshair", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" } : undefined} {...eventos}>
      <text x="0" y={-fs * 0.4 - sl} fontSize={fs} fill="#5a6478">◀ cabine</text>
      <text x={W + st} y={-fs * 0.4 - sl} fontSize={fs} fill="#5a6478" textAnchor="end">porta ▶</text>
      {(sl > 0 || st > 0) && <rect x="0" y={-sl} width={W + st} height={H + sl * 2} fill="none" stroke="#b6bfd0" strokeWidth={Math.max(0.8, W / 600)} strokeDasharray={`${W / 70} ${W / 110}`} pointerEvents="none" />}
      <rect x="0" y="0" width={W} height={H} fill="#f1f4fa" stroke="#4a5367" strokeWidth={Math.max(1, W / 400)} />
      {caixas.filter(b => b.nivel < camada).map(b => (
        <rect key={"f" + b.seq} x={b.x} y={b.y} width={b.dx} height={b.dy} fill="#dde2ec" stroke={selecionada(b) ? "#f97316" : "#c3cad8"} strokeWidth={selecionada(b) ? Math.max(1.5, W / 250) : Math.max(0.5, W / 900)} />
      ))}
      {caixas.filter(b => b.nivel === camada).map(b => {
        const cor = corDe(tipos, b.tipo.id);
        const t = Math.min(b.dx, b.dy) * 0.38;
        const s = selecionada(b);
        return (
          <g key={b.seq}>
            <rect x={b.x} y={b.y} width={b.dx} height={b.dy} fill={cor} fillOpacity="0.85" stroke={s ? "#f97316" : "#fff"} strokeWidth={s ? Math.max(1.8, W / 200) : Math.max(0.6, W / 700)} />
            <text x={b.x + b.dx / 2} y={b.y + b.dy / 2} fontSize={Math.max(5, t)} fill="#fff" textAnchor="middle" dominantBaseline="central" fontWeight="700" pointerEvents="none">{b.seq}</text>
          </g>
        );
      })}
      {fantasma && fantasma.caixas.map((c, i) => <rect key={"g" + i} x={c.x} y={c.y} width={c.dx} height={c.dy} fill={fantasma.ok ? "#3b82f6" : "#ef4444"} fillOpacity="0.4" stroke={fantasma.ok ? "#1d4ed8" : "#b91c1c"} strokeWidth={Math.max(1, W / 350)} strokeDasharray={`${W / 90} ${W / 140}`} pointerEvents="none" />)}
      {marq && <rect x={Math.min(marq.x0, marq.x1)} y={Math.min(marq.y0, marq.y1)} width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)} fill="#f97316" fillOpacity="0.15" stroke="#ea580c" strokeWidth={Math.max(1, W / 450)} strokeDasharray={`${W / 120} ${W / 180}`} pointerEvents="none" />}
    </svg>
  );
}

// ---------- vista 3D (canvas, sem biblioteca) ----------
function Vista3D({ cam, plano, tipos, camada, edicao }) {
  const ref = useRef(null);
  const [yaw, setYaw] = useState(-0.6);
  const [vz, setVz] = useState({ k: 1, tx: 0, ty: 0 }); // zoom e deslocamento da vista
  const [mao, setMao] = useState(false);               // "mão": arrastar desloca a vista
  const [papelao, setPapelao] = useState(true);
  const drag = useRef(null);
  const geo = useRef(null);      // projeção da última pintura, para transformar clique em posição no baú
  const acertos = useRef([]);    // faces desenhadas (da mais longe para a mais perto), para saber onde clicou
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
    const cantos = []; for (const x of [0, cam.comp_cm + (cam.sobraTras || 0)]) for (const y of [-(cam.sobraLado || 0), cam.larg_cm + (cam.sobraLado || 0)]) for (const z of [0, cam.alt_cm]) cantos.push(rot(x, y, z));
    const minX = Math.min(...cantos.map(c => c.x)), maxX = Math.max(...cantos.map(c => c.x));
    const minU = Math.min(...cantos.map(c => c.u)), maxU = Math.max(...cantos.map(c => c.u));
    const esc0 = Math.min((w - 24) / (maxX - minX || 1), (h - 24) / (maxU - minU || 1));
    const ox0 = w / 2 - ((minX + maxX) / 2) * esc0, oy0 = h / 2 + ((minU + maxU) / 2) * esc0;
    // zoom em torno do centro da tela + deslocamento
    const esc = esc0 * vz.k, ox = w / 2 + (ox0 - w / 2) * vz.k + vz.tx, oy = h / 2 + (oy0 - h / 2) * vz.k + vz.ty;
    const P = (x, y, z) => { const r = rot(x, y, z); return [ox + r.x * esc, oy - r.u * esc]; };
    geo.current = { esc, ox, oy, cy, sy, cp, sp, cx0, cy0, cz0 };
    acertos.current = [];
    // direção para a câmera no referencial girado: (0, -cp, sp)
    const visivel = (nx, ny, nz) => { const x1 = nx * cy - ny * sy, y1 = nx * sy + ny * cy; return (y1 * -cp + nz * sp) > 0.0001; };

    // contorno: baú/sider = caixa fechada; carroceria = piso com bordas baixas
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

    const KRAFT = "#c8a06a";
    const poli = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => { const q = P(...p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fillStyle = fill; g.fill(); };
    // fantasma = caixa ainda não confirmada: desenhada transparente (azul se cabe, vermelha se não cabe)
    const desenharCaixa = (b, fantasma) => {
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
      for (const fc of faces) {
        if (!visivel(...fc.n)) continue;
        const quad = sub(fc, 0, 1, 0, 1);
        if (fantasma) {
          poli(quad, (fantasma.ok ? "rgba(59,130,246," : "rgba(239,68,68,") + (0.28 + (fc.f - 0.72) * 0.6) + ")");
          g.beginPath(); quad.forEach((p, i) => { const q = P(...p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath();
          g.strokeStyle = fantasma.ok ? "#1d4ed8" : "#b91c1c"; g.lineWidth = 1.6; g.setLineDash([5, 3]); g.stroke(); g.setLineDash([]);
          continue;
        }
        poli(quad, escurece(papelao ? KRAFT : cor, fc.f));
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
        g.beginPath(); quad.forEach((p, i) => { const q = P(...p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath();
        const selb = !!(edicao && edicao.sel && edicao.sel.includes(b));
        g.strokeStyle = selb ? "#f97316" : papelao ? "rgba(70,45,20,.55)" : "rgba(255,255,255,.75)"; g.lineWidth = selb ? 2.4 : 0.8; g.stroke();
        acertos.current.push({ b, n: fc.n, pts: quad.map(p => P(...p)) });
      }
    };
    const lista = plano.caixas.filter(b => b.nivel <= camada && !(edicao && edicao.oculta && edicao.oculta.includes(b))).map(b => ({ b, d: rot(b.x + b.dx / 2, b.y + b.dy / 2, b.z + b.dz / 2).d }));
    lista.sort((p, q) => q.d - p.d); // mais longe primeiro
    for (const { b } of lista) desenharCaixa(b, null);
    if (edicao && edicao.fantasma) for (const c of edicao.fantasma.caixas.slice().sort((p, q) => rot(q.x + q.dx / 2, q.y + q.dy / 2, q.z + q.dz / 2).d - rot(p.x + p.dx / 2, p.y + p.dy / 2, p.z + p.dz / 2).d)) desenharCaixa(c, edicao.fantasma);
  }, [cam, plano, tipos, camada, yaw, papelao, edicao, vz]);

  useEffect(() => { desenhar(); const f = () => desenhar(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [desenhar]);

  // descobre o que está sob o ponteiro: a caixa (face) e o ponto equivalente dentro do baú
  function localizar(e) {
    if (!geo.current || !ref.current) return null;
    const r = ref.current.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, G = geo.current;
    const dentro = (pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (((yi > sy) !== (yj > sy)) && (sx < (xj - xi) * (sy - yi) / (yj - yi) + xi)) c = !c; } return c; };
    let hit = null; for (let i = acertos.current.length - 1; i >= 0; i--) if (dentro(acertos.current[i].pts)) { hit = acertos.current[i]; break; }
    const noPlano = (zp) => { const x1 = (sx - G.ox) / G.esc, u = (G.oy - sy) / G.esc, y1 = (u - (zp - G.cz0) * G.cp) / G.sp; return [x1 * G.cy + y1 * G.sy + G.cx0, -x1 * G.sy + y1 * G.cy + G.cy0]; };
    let ponto = null;
    if (!hit) { const [x, y] = noPlano(0); ponto = [x, y, 0, 0, 0]; }
    else {
      const b = hit.b;
      if (hit.n[2] === 1) { const z = b.z + b.dz; const [x, y] = noPlano(z); ponto = [x, y, z, 0, 0]; }
      else {
        // lateral: ponto sobre a face, empurrado para fora, para a nova caixa ficar ao lado e na mesma altura
        const zr = b.z + b.dz / 2, [x0, y0] = noPlano(zr), vx = -G.cp * G.sy, vy = -G.cp * G.cy;
        let x = x0, y = y0;
        if (hit.n[0] !== 0) { if (Math.abs(vx) > 1e-6) { const xf = hit.n[0] > 0 ? b.x + b.dx : b.x; y = y0 + ((xf - x0) / vx) * vy; x = xf; ponto = [x, y, b.z, hit.n[0], hit.n[1]]; } }
        else if (Math.abs(vy) > 1e-6) { const yf = hit.n[1] > 0 ? b.y + b.dy : b.y; x = x0 + ((yf - y0) / vy) * vx; y = yf; ponto = [x, y, b.z, hit.n[0], hit.n[1]]; }
      }
    }
    return { caixa: hit ? hit.b : null, ponto, plano: noPlano };
  }
  const zoomEm = useCallback((fator, sx, sy) => setVz(v => {
    const w = ref.current ? ref.current.clientWidth : 0, c = [w / 2, 180];
    const k2 = Math.max(1, Math.min(8, v.k * fator));
    if (k2 === 1) return { k: 1, tx: 0, ty: 0 };
    const px = sx == null ? c[0] : sx, py = sy == null ? c[1] : sy;
    return { k: k2, tx: px - c[0] - (px - c[0] - v.tx) * k2 / v.k, ty: py - c[1] - (py - c[1] - v.ty) * k2 / v.k };
  }), []);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const f = (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomEm(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); };
    cv.addEventListener("wheel", f, { passive: false }); return () => cv.removeEventListener("wheel", f);
  }, [zoomEm]);
  const colocando = !!(edicao && edicao.ativo && (edicao.modo === "add" || edicao.modo === "col"));
  function clicar(e) {
    if (!edicao || !edicao.ativo) return;
    const l = localizar(e); if (!l || !l.caixa) return;
    if (edicao.modo === "rem") edicao.onRemover(l.caixa); else if (edicao.modo === "sel") edicao.onSel(l.caixa);
  }
  const ponteiro3d = (e, qual) => { const l = localizar(e); if (l && l.ponto) edicao.onPonteiro[qual](...l.ponto); else if (qual === "up") edicao.onPonteiro.cancel(); };

  return (
    <div>
      <canvas ref={ref} className="cg-3d" onContextMenu={(e) => e.preventDefault()} style={{ height: 360, cursor: mao ? "move" : edicao && edicao.ativo ? "crosshair" : undefined }} aria-label="Vista 3D do carregamento. Arraste para girar."
        onPointerDown={(e) => {
          e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
          if (mao || e.shiftKey || e.button === 1 || e.button === 2) { drag.current = { pan: true, x: e.clientX, y: e.clientY }; return; }
          if (colocando) { drag.current = { ponto: true }; ponteiro3d(e, "down"); return; }
          // modo selecionar: apertar numa caixa já selecionada e arrastar move o grupo
          const l = edicao && edicao.ativo && edicao.modo === "sel" ? localizar(e) : null;
          if (l && l.caixa && edicao.sel.includes(l.caixa)) { const z = l.caixa.z + l.caixa.dz; const [x, y] = l.plano(z); drag.current = { mover: true, z }; edicao.onMover.down(l.caixa, x, y); }
          else drag.current = { x: e.clientX, mov: 0 };
        }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; if (d.pan) { const ddx = e.clientX - d.x, ddy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; setVz(v => v.k === 1 ? v : { ...v, tx: v.tx + ddx, ty: v.ty + ddy }); return; } if (d.ponto) return ponteiro3d(e, "move"); if (d.mover) { const l = localizar(e); if (l) edicao.onMover.move(...l.plano(d.z)); return; } const dx = e.clientX - d.x; d.mov += Math.abs(dx); d.x = e.clientX; if (d.mov > 4) setYaw(y => y + dx * 0.01); }}
        onPointerUp={(e) => { const d = drag.current; drag.current = null; if (!d) return; if (d.pan) return; if (d.ponto) return ponteiro3d(e, "up"); if (d.mover) { const l = localizar(e); if (l) edicao.onMover.up(...l.plano(d.z)); return; } if (d.mov <= 4) clicar(e); }} onPointerCancel={() => { drag.current = null; }} />
      <div className="row" style={{ marginTop: 8 }}>
        <span className="muted">{colocando ? "Gire por aqui:" : "Arraste para girar"}</span>
        <input type="range" min="-3.15" max="3.15" step="0.05" value={yaw} onChange={(e) => setYaw(Number(e.target.value))} aria-label="Girar o carregamento" style={{ flex: 1, minWidth: 120, padding: 0 }} />
        <button type="button" className="btn sm" onClick={() => setYaw(-0.6)}>Voltar</button>
        <button type="button" className="btn sm" aria-label="Aproximar" onClick={() => zoomEm(1.4)}>＋</button>
        <button type="button" className="btn sm" aria-label="Afastar" onClick={() => zoomEm(1 / 1.4)}>－</button>
        <button type="button" className="btn sm" disabled={vz.k === 1} onClick={() => setVz({ k: 1, tx: 0, ty: 0 })}>Ajustar</button>
        <button type="button" className={"btn sm" + (mao ? " primary" : "")} aria-pressed={mao} onClick={() => setMao(v => !v)}>Mão</button>
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
  const [zoom2d, setZoom2d] = useState(1);
  const [camada, setCamada] = useState(1);
  const [todas, setTodas] = useState(true);
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({});
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [manual, setManual] = useState(null);       // caixas editadas à mão (null = cálculo automático)
  const [editando, setEditando] = useState(false);
  const [desfazer, setDesfazer] = useState([]);
  const [tipoAdd, setTipoAdd] = useState("");
  const [ori, setOri] = useState(0);   // posição da caixa: gira 90° e, se o tipo deixa, deita
  const [msgEd, setMsgEd] = useState("");
  const [pend, setPend] = useState(null);          // posição sob o ponteiro enquanto arrasta (caixa transparente)
  const [modoEd, setModoEd] = useState("add");     // add = colocar caixa, sel = selecionar, col = colar, rem = tirar caixa
  const [sel, setSel] = useState([]);              // caixas selecionadas
  const [copia, setCopia] = useState(null);        // grupo copiado (posições relativas)
  const [mov, setMov] = useState(null);            // grupo sendo movido: { grupo, org, start, base, b }
  const [copiaOrg, setCopiaOrg] = useState(null);  // onde o grupo estava (a colagem "gruda" nessa linha)
  const [marq, setMarq] = useState(null);          // retângulo de seleção (vista de cima)
  const marqRef = useRef(null);
  const arr = useRef(false);                       // ponteiro apertado, arrastando
  const cancelou = useRef(false);
  const [abertoId, setAbertoId] = useState(null);   // carregamento salvo que está aberto

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
  const pedidoAdiado = useDeferredValue(pedido); // o cálculo pesado não trava a digitação
  const camPlan = useMemo(() => cam && ({ c: Number(cam.comp_cm), l: Number(cam.larg_cm), a: cam.tipo === "carroceria" ? 1000 : Number(cam.alt_cm), aberta: cam.tipo === "carroceria", sobraLado: cam.tipo === "carroceria" ? Number(cam.sobra_lado_cm || 0) : 0, sobraTras: cam.tipo === "carroceria" ? Number(cam.sobra_tras_cm || 0) : 0 }), [cam]);
  const planoAuto = useMemo(() => {
    if (!cam || !pedidoAdiado.length) return null;
    return planejar(camPlan, tiposP, pedidoAdiado);
  }, [cam, camPlan, tiposP, pedidoAdiado]);
  const plano = useMemo(() => manual && camPlan ? resumir(camPlan, tiposP, pedido, manual) : planoAuto, [manual, camPlan, tiposP, pedido, planoAuto]);
  const aberta = !!cam && cam.tipo === "carroceria";
  const planoAlt = plano ? plano.caixas.reduce((m, b) => Math.max(m, b.z + b.dz), 0) : 100;
  const camP = cam && { comp_cm: Number(cam.comp_cm), larg_cm: Number(cam.larg_cm), alt_cm: aberta ? Math.max(100, Math.round(planoAlt)) : Number(cam.alt_cm), tipo: cam.tipo || "bau", sobraLado: camPlan.sobraLado, sobraTras: camPlan.sobraTras };
  const larguraCarga = plano && plano.caixas.length ? Math.max(...plano.caixas.map(b => b.y + b.dy)) - Math.min(...plano.caixas.map(b => b.y)) : 0;
  const camadaEf = plano ? Math.min(Math.max(1, camada), Math.max(1, plano.niveis) + (editando ? 1 : 0)) : 1;
  const camada3d = todas && plano ? plano.niveis : camadaEf;
  const naoCabem = plano ? plano.porTipo.filter(p => p.cabem < p.pedido) : [];
  const tiposVazios = !carregando && (caminhoes.length === 0 || tipos.length === 0);

  // ---------- cadastros ----------
  function abrirCam(c) {
    setF(c ? { id: c.id, nome: c.nome, comp: String(c.comp_cm).replace(".", ","), larg: String(c.larg_cm).replace(".", ","), alt: String(c.alt_cm).replace(".", ","), obs: c.observacao || "", tipo: c.tipo || "bau", cat: c.categoria || "", pilha: String(c.max_pilha || 3), sl: String(c.sobra_lado_cm || 0).replace(".", ","), st: String(c.sobra_tras_cm || 0).replace(".", ",") }
           : { nome: "", comp: "", larg: "", alt: "", obs: "", tipo: "bau", cat: "", pilha: "3", sl: "0", st: "0" });
    setErro(""); setModal("cam");
  }
  async function salvarCam(e) {
    e.preventDefault();
    const ab = f.tipo === "carroceria";
    const [c, l, a, p] = [num(f.comp), num(f.larg), ab ? ALT_ABERTA : num(f.alt), Math.floor(num(f.pilha))];
    if (!f.nome.trim()) return setErro("Dê um nome para o caminhão.");
    if (!(c > 0 && l > 0 && a > 0)) return setErro(ab ? "Informe comprimento e largura da carroceria, em centímetros." : "Informe comprimento, largura e altura, em centímetros.");
    if (ab && !(p >= 1 && p <= 30)) return setErro("Informe quantas caixas podem ser empilhadas (de 1 a 30).");
    const sl = ab ? (num(f.sl) || 0) : 0, st = ab ? (num(f.st) || 0) : 0;
    if (sl < 0 || sl > 100 || st < 0 || st > 200) return setErro("A sobra para fora vai de 0 a 100 cm nos lados e de 0 a 200 cm atrás.");
    setBusy(true);
    const dados = { nome: f.nome.trim(), comp_cm: c, larg_cm: l, alt_cm: a, observacao: f.obs.trim() || null, tipo: f.tipo, categoria: f.cat || null, max_pilha: ab ? p : null, sobra_lado_cm: sl, sobra_tras_cm: st };
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

  // ---------- edição manual do carregamento ----------
  const tAdd = tiposP.find(q => q.id === tipoAdd) || null;
  function tipoPadrao() { return (pedido.find(p => p.tipoId && manual && manual.filter(c => c.tipo.id === p.tipoId).length < p.qtd) || pedido[0] || {}).tipoId || (tiposP[0] && tiposP[0].id) || ""; }
  // caixa transparente: onde ficaria a caixa se o ponteiro fosse solto agora
  const oris = tAdd ? orientacoes(tAdd) : [];
  const oriAtual = () => oris[ori % oris.length];
  function calcUm(p) {
    if (!tAdd || !camPlan || !manual) return null;
    const [dx, dy, dz] = oriAtual();
    const ex = p.px + p.nx * dx / 2 - dx / 2, ey = p.py + p.ny * dy / 2 - dy / 2;
    const zE = p.z != null ? p.z : alturaApoio(manual, ex, ey, dx, dy);
    const [x1, y1] = encostar(camPlan, manual, ex, ey, dx, dy, 0, zE);
    let r = conferirCaixa(camPlan, manual, tAdd, x1, y1, dx, dy, dz, p.z);
    let x = x1, y = y1;
    const caixa = r.ok ? r.caixa : { x, y, z: p.z != null ? p.z : alturaApoio(manual, x, y, dx, dy), dx, dy, dz, tipo: tAdd, nivel: 1, cap: 1 };
    return { caixas: [caixa], ok: r.ok, motivo: r.motivo };
  }
  // grupo (colar ou mover): mantém a forma, só muda o lugar; cada caixa é conferida com as anteriores
  function calcGrupo(p, mover) {
    const g = mover ? mov && mov.grupo : copia, lista = mover ? mov && mov.base : manual;
    if (!g || !g.length || !camPlan || !lista) return null;
    const W = Math.max(...g.map(b => b.rx + b.dx)), D = Math.max(...g.map(b => b.ry + b.dy));
    const tx = mover ? mov.org.x + (p.px - mov.start.x) : p.px - W / 2, ty = mover ? mov.org.y + (p.py - mov.start.y) : p.py - D / 2;
    let [ox, oy] = encostar(camPlan, lista, tx, ty, W, D, 0, g.some(b => b.z0 > 0.001) ? 1 : 0);
    if (!mover && copiaOrg && Math.abs(oy - copiaOrg.y) < 30) oy = copiaOrg.y; // cola reto, só andando no comprimento
    const ord = g.slice().sort((a, b) => a.rz - b.rz || a.rx - b.rx || a.ry - b.ry);
    const rz0 = ord[0].rz;
    let base = 0; for (const b of ord) if (Math.abs(b.rz - rz0) < 0.001) base = Math.max(base, alturaApoio(lista, ox + b.rx, oy + b.ry, b.dx, b.dy));
    const acc = lista.slice(), caixas = []; let ok = true, motivo = "";
    for (const b of ord) {
      const z = base + b.rz - rz0;
      const r = conferirCaixa(camPlan, acc, b.tipo, ox + b.rx, oy + b.ry, b.dx, b.dy, b.dz, z);
      if (r.ok) { acc.push(r.caixa); caixas.push(r.caixa); }
      else { if (ok) { ok = false; motivo = r.motivo; } caixas.push({ x: ox + b.rx, y: oy + b.ry, z, dx: b.dx, dy: b.dy, dz: b.dz, tipo: b.tipo, nivel: 1, cap: 1 }); }
    }
    return { caixas, ok, motivo };
  }
  const calc = (p) => mov ? calcGrupo(p, true) : modoEd === "col" ? calcGrupo(p) : calcUm(p);
  const fantasma = useMemo(() => (editando && manual && pend && (modoEd === "add" || modoEd === "col" || (modoEd === "sel" && mov))) ? calc(pend) : null, [editando, manual, pend, modoEd, tAdd, ori, camPlan, copia, copiaOrg, mov]); // eslint-disable-line
  function comecarEdicao() {
    if (!planoAuto && !manual) return;
    if (!manual) setManual(planoAuto.caixas.map(b => ({ ...b })));
    setEditando(true); setDesfazer([]); setMsgEd(""); setPend(null); setModoEd("add");
    if (!tipoAdd) setTipoAdd(tipoPadrao());
  }
  // monta do zero, sem o cálculo automático: começa com o caminhão vazio
  function montarManual() {
    if (!cam) return;
    setManual([]); setEditando(true); setDesfazer([]); setMsgEd(""); setPend(null); setModoEd("add"); setAbertoId(null); setCamada(1);
    if (!tipoAdd) setTipoAdd(tipoPadrao());
  }
  function voltarAutomatico() { setManual(null); setEditando(false); setDesfazer([]); setMsgEd(""); setPend(null); }
  function aplicar(novas) { setDesfazer(h => [...h, manual]); setManual(novas); }
  function desfazerUltima() { if (!desfazer.length) return; setManual(desfazer[desfazer.length - 1]); setDesfazer(desfazer.slice(0, -1)); setMsgEd(""); setPend(null); }
  function removerCaixa(b) {
    if (temCaixaEmCima(manual, b)) return setMsgEd("Tem caixa em cima dessa. Tire primeiro as de cima.");
    aplicar(manual.filter(q => q !== b)); setMsgEd(`Caixa ${b.tipo.nome} removida.`);
  }
  // ----- ponteiro: arrastar para posicionar; soltar coloca -----
  const nivelMax = (cs) => cs.reduce((m, c) => Math.max(m, c.nivel), 1);
  function ptDown(px, py, nx = 0, ny = 0, z = null) {
    if (modoEd === "add" && !tAdd) return setMsgEd("Escolha o tipo de caixa para adicionar.");
    if (modoEd === "col" && !copia) return;
    cancelou.current = false; arr.current = true; setPend({ px, py, nx, ny, z }); setMsgEd("");
  }
  function ptMove(px, py, nx = 0, ny = 0, z = null) { if (arr.current) setPend({ px, py, nx, ny, z }); }
  function ptUp(px, py, nx = 0, ny = 0, z = null) {
    const ia = arr.current; arr.current = false; setPend(null);
    if (!ia || cancelou.current) { cancelou.current = false; return; }
    const f = calc({ px, py, nx, ny, z }); if (!f) return;
    if (!f.ok) return setMsgEd(f.motivo);
    aplicar([...manual, ...f.caixas]); setCamada(nivelMax(f.caixas));
    setMsgEd(modoEd === "col" ? `${f.caixas.length} caixa${f.caixas.length === 1 ? "" : "s"} colada${f.caixas.length === 1 ? "" : "s"}. Arraste de novo para colar mais.` : `Caixa ${tAdd.nome} colocada na camada ${nivelMax(f.caixas)}.`);
  }
  const ptCancel = () => { arr.current = false; setPend(null); };
  const selValida = sel.filter(b => manual && manual.includes(b));
  const alternarSel = (b) => setSel(v => v.includes(b) ? v.filter(q => q !== b) : [...v, b]);
  function grupoDe(bs) {
    const mx = Math.min(...bs.map(b => b.x)), my = Math.min(...bs.map(b => b.y)), mz = Math.min(...bs.map(b => b.z));
    return { org: { x: mx, y: my }, itens: bs.map(b => ({ rx: b.x - mx, ry: b.y - my, rz: b.z - mz, z0: b.z, dx: b.dx, dy: b.dy, dz: b.dz, tipo: b.tipo })) };
  }
  // mover: apertar numa caixa selecionada e arrastar leva a seleção junto; sem arrastar, só desmarca a caixa
  function movDown(b, x, y) {
    const g = grupoDe(selValida);
    cancelou.current = false; arr.current = true;
    setMov({ grupo: g.itens, org: g.org, start: { x, y }, base: manual.filter(q => !selValida.includes(q)), b, moveu: false });
    setPend({ px: x, py: y, nx: 0, ny: 0, z: null }); setMsgEd("");
  }
  function movMove(x, y) { if (arr.current) { setPend({ px: x, py: y, nx: 0, ny: 0, z: null }); setMov(m => m && (m.moveu || Math.hypot(x - m.start.x, y - m.start.y) >= 4) ? { ...m, moveu: true } : m); } }
  function movUp(x, y) {
    const ia = arr.current, m = mov; arr.current = false; setPend(null); setMov(null);
    if (!ia || !m) return;
    if (cancelou.current) { cancelou.current = false; return; }
    if (Math.hypot(x - m.start.x, y - m.start.y) < 4) return alternarSel(m.b);
    const f = calcGrupo({ px: x, py: y }, true) ;
    if (!f) return;
    if (!f.ok) return setMsgEd(`${f.motivo} As caixas ficaram onde estavam.`);
    aplicar([...m.base, ...f.caixas]); setSel(f.caixas); setCamada(nivelMax(f.caixas));
    setMsgEd(`${f.caixas.length} caixa${f.caixas.length === 1 ? "" : "s"} movida${f.caixas.length === 1 ? "" : "s"}.`);
  }
  function copiar() {
    if (!selValida.length) return setMsgEd("Selecione as caixas primeiro.");
    const g = grupoDe(selValida);
    setCopiaOrg(g.org); setCopia(g.itens);
    setModoEd("col"); setPend(null); setMsgEd("");
  }
  function excluirSel() {
    if (!selValida.length) return;
    aplicar(manual.filter(b => !selValida.includes(b))); setSel([]); setMsgEd(`${selValida.length} caixa${selValida.length === 1 ? "" : "s"} removida${selValida.length === 1 ? "" : "s"}.`);
  }
  const caixaNo = (x, y) => { const l = manual.filter(q => q.nivel === camadaEf && x >= q.x && x <= q.x + q.dx && y >= q.y && y <= q.y + q.dy); return l[0] || null; };
  // vista de cima: um só conjunto de eventos que muda conforme o modo
  const ponteiro2d = {
    down: (x, y) => {
      if (modoEd === "add" || modoEd === "col") return ptDown(x, y);
      if (modoEd === "sel") {
        const b = caixaNo(x, y); if (b && selValida.includes(b)) return movDown(b, x, y);
        arr.current = true; marqRef.current = { x0: x, y0: y, x1: x, y1: y }; setMarq(marqRef.current); return; }
      const b = caixaNo(x, y); if (b) removerCaixa(b);
    },
    move: (x, y) => {
      if (!arr.current) return;
      if (modoEd === "sel" && marqRef.current) { marqRef.current = { ...marqRef.current, x1: x, y1: y }; setMarq(marqRef.current); }
      else if (modoEd === "sel" && mov) movMove(x, y);
      else if (modoEd === "add" || modoEd === "col") ptMove(x, y);
    },
    up: (x, y) => {
      if (modoEd === "add" || modoEd === "col") return ptUp(x, y);
      if (modoEd !== "sel") return;
      if (mov) return movUp(x, y);
      const m = marqRef.current; arr.current = false; marqRef.current = null; setMarq(null);
      if (!m) return;
      if (Math.abs(m.x1 - m.x0) < 4 && Math.abs(m.y1 - m.y0) < 4) { const b = caixaNo(x, y); if (b) alternarSel(b); return; }
      const [xa, xb, ya, yb] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1), Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
      setSel(manual.filter(q => q.x + q.dx / 2 >= xa && q.x + q.dx / 2 <= xb && q.y + q.dy / 2 >= ya && q.y + q.dy / 2 <= yb));
    },
  };
  const ponteiro3d = { down: (x, y, z, nx, ny) => ptDown(x, y, nx, ny, z), move: (x, y, z, nx, ny) => ptMove(x, y, nx, ny, z), up: (x, y, z, nx, ny) => ptUp(x, y, nx, ny, z), cancel: ptCancel };
  // Esc cancela o que está sendo arrastado
  useEffect(() => {
    if (!pend) return;
    const f = (e) => { if (e.key === "Escape") { cancelou.current = true; arr.current = false; setPend(null); setMov(null); } };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  });
  const layoutSalvar = () => manual ? manual.map(b => ({ t: b.tipo.id, x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(1), dx: b.dx, dy: b.dy, dz: b.dz, n: b.nivel, c: b.cap })) : null;

  // ---------- carregamentos salvos ----------
  function abrirSalvar() {
    const g = abertoId && salvos.find(x => x.id === abertoId);
    setF(g ? { nome: g.nome, data: g.data, obs: g.observacao || "" } : { nome: "", data: hoje(), obs: "" }); setErro(""); setModal("salvar");
  }
  async function salvarCarregamento(e, comoNovo) {
    e.preventDefault();
    if (!f.nome.trim()) return setErro("Dê um nome para o carregamento (ex.: Entrega Cel 28/11).");
    setBusy(true);
    try {
      const itensSalvar = plano.porTipo.map(p => ({ tipo_id: p.tipo.id, quantidade: p.pedido }));
      const dados = { caminhao_id: camId, nome: f.nome.trim(), data: f.data || hoje(), observacao: f.obs.trim() || null, layout: layoutSalvar() };
      if (abertoId && !comoNovo) {
        const { error } = await supabase.from("carregamentos").update(dados).eq("id", abertoId);
        if (error) throw error;
        const { error: e1 } = await supabase.from("carregamento_itens").delete().eq("carregamento_id", abertoId);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("carregamento_itens").insert(itensSalvar.map(i => ({ ...i, carregamento_id: abertoId, empresa_id: perfil.empresa_id })));
        if (e2) throw e2;
        setOk("Carregamento atualizado.");
      } else {
        const { data: g, error } = await supabase.from("carregamentos").insert({ ...dados, empresa_id: perfil.empresa_id }).select().single();
        if (error) throw error;
        const { error: e2 } = await supabase.from("carregamento_itens").insert(itensSalvar.map(i => ({ ...i, carregamento_id: g.id, empresa_id: perfil.empresa_id })));
        if (e2) { await supabase.from("carregamentos").delete().eq("id", g.id); throw e2; }
        setAbertoId(g.id); setOk("Carregamento salvo.");
      }
      setModal(null); carregar();
    } catch (er) { setErro(er.message); }
    setBusy(false);
  }
  function abrirSalvo(g) {
    const camSalvo = caminhoes.find(c => c.id === g.caminhao_id);
    const lim = camSalvo && camSalvo.tipo === "carroceria" ? (camSalvo.max_pilha || 1) : 99;
    const tp = tipos.map(t => ({ id: t.id, nome: t.nome, c: Number(t.comp_cm), l: Number(t.larg_cm), a: Number(t.alt_cm), max: Math.min(t.max_pilha, lim), deitar: t.pode_deitar }));
    setCamId(g.caminhao_id);
    setItens(salvosItens.filter(i => i.carregamento_id === g.id).map(i => ({ tipoId: i.tipo_id, qtd: String(i.quantidade) })));
    setManual(Array.isArray(g.layout) && g.layout.length
      ? g.layout.map(l => ({ x: l.x, y: l.y, z: l.z, dx: l.dx, dy: l.dy, dz: l.dz, nivel: l.n, cap: l.c, tipo: tp.find(t => t.id === l.t) })).filter(b => b.tipo)
      : null);
    setEditando(false); setDesfazer([]); setMsgEd(""); setAbertoId(g.id);
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
          {f.tipo === "carroceria" && (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label>Sobra para os lados (cm, cada lado)<input inputMode="decimal" value={f.sl} onChange={e => setF({ ...f, sl: e.target.value })} placeholder="Ex.: 13" /></label>
              <label>Sobra atrás (cm)<input inputMode="decimal" value={f.st} onChange={e => setF({ ...f, st: e.target.value })} placeholder="Ex.: 0" /></label>
              <span className="muted" style={{ gridColumn: "1 / -1" }}>Quanto a carga pode passar para fora da carroceria a partir da 2ª camada. 0 = não pode sobrar. Atenção ao limite legal de largura com carga (2,60 m).</span>
            </div>)}
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
          <select value={camId} onChange={e => { setCamId(e.target.value); setManual(null); setEditando(false); setPend(null); setAbertoId(null); setSel([]); setCopia(null); setCopiaOrg(null); }}>
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
        {cam && <button type="button" className="btn sm" style={{ marginLeft: 8 }} onClick={montarManual}><Pencil size={14} /> Montar manualmente</button>}
      </div>

      {plano && cam && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="no-print">
            <div className="cg-resumo">
              <div><b>{plano.caixas.length} de {plano.porTipo.reduce((sm, p) => sm + p.pedido, 0)}</b><span>caixas cabem</span></div>
              <div><b>{fmt(plano.ocupacao * 100, 1)}%</b><span>{aberta ? "do piso ocupado" : "do volume do baú"}</span></div>
              <div><b>{fmt(plano.compOcupado / 100, 2)} m</b><span>de {fmt(cam.comp_cm / 100, 2)} m ocupados</span></div>
              <div><b>{plano.niveis}</b><span>camada{plano.niveis === 1 ? "" : "s"} de altura</span></div>
            </div>
            {naoCabem.length > 0 && (
              <div className="cg-aviso"><AlertTriangle size={18} /><span><b>Não cabem tudo.</b> {naoCabem.map(p => `${p.pedido - p.cabem} de ${p.tipo.nome}`).join(", ")} ficam de fora. Use outro caminhão ou divida em duas viagens.</span></div>)}
            <div className="cg-leg">{plano.porTipo.map(p => <span key={p.tipo.id}><i style={{ background: corDe(tiposP, p.tipo.id) }} />{p.tipo.nome}: {p.cabem}{p.cabem < p.pedido ? ` de ${p.pedido}` : ""}</span>)}</div>

            {manual && <div className="cg-aviso" style={{ background: "#e0e7ff", color: "#3730a3" }}><span>Carregamento <b>editado à mão</b>. Mudar as quantidades acima não refaz o encaixe automático.</span></div>}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="cg-camadas" role="tablist" aria-label="Tipo de vista">
                <button className={vista === "cima" ? "on" : ""} onClick={() => setVista("cima")}>Vista de cima</button>
                <button className={vista === "3d" ? "on" : ""} onClick={() => setVista("3d")}>3D</button>
              </div>
              <div className="row">
                {editando
                  ? <button className="btn sm" onClick={() => { setEditando(false); setMsgEd(""); setPend(null); }}>Concluir edição</button>
                  : <button className="btn sm" onClick={comecarEdicao}><Pencil size={14} /> Editar carregamento</button>}
                {manual && <button className="btn sm" onClick={voltarAutomatico}>Voltar ao automático</button>}
                <button className="btn sm" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
                <button className="btn primary sm" onClick={abrirSalvar}><Save size={14} /> Salvar carregamento</button>
              </div>
            </div>

            {aberta && larguraCarga > 260.5 && <div className="cg-aviso"><AlertTriangle size={18} style={{ flex: "none" }} /><span>A carga está com <b>{fmt(larguraCarga, 0)} cm</b> de largura. O limite legal de largura, com carga, costuma ser 260 cm: confira antes de sair.</span></div>}
            {editando && (
              <div className="cg-edicao">
                <div className="row">
                  <div className="cg-camadas" style={{ margin: 0 }}>
                    <button className={modoEd === "add" ? "on" : ""} onClick={() => { setModoEd("add"); setPend(null); }}>Adicionar caixa</button>
                    <button className={modoEd === "sel" ? "on" : ""} onClick={() => { setModoEd("sel"); setPend(null); }}>Selecionar</button>
                    <button className={modoEd === "col" ? "on" : ""} disabled={!copia} onClick={() => { setModoEd("col"); setPend(null); }}>Colar{copia ? ` (${copia.length})` : ""}</button>
                    <button className={modoEd === "rem" ? "on" : ""} onClick={() => { setModoEd("rem"); setPend(null); }}>Remover caixa</button>
                  </div>
                  <button type="button" className="btn sm" disabled={!desfazer.length} onClick={desfazerUltima}>Desfazer</button>
                </div>
                {modoEd === "add" && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <label style={{ flex: 1, minWidth: 180 }}>Caixa para adicionar
                      <select value={tipoAdd} onChange={e => { setTipoAdd(e.target.value); setOri(0); }}>{tiposP.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
                    {oris.length > 0 && <button type="button" className="btn sm" onClick={() => setOri(v => (v + 1) % oris.length)}>{oris.length > 2 ? "Girar ou deitar" : "Girar 90°"}: {oris[ori % oris.length].map(v => fmt(v, 1)).join(" × ")} cm</button>}
                  </div>)}
                {modoEd === "sel" && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <b style={{ fontSize: 14 }}>{selValida.length} selecionada{selValida.length === 1 ? "" : "s"}</b>
                    <button type="button" className="btn sm" onClick={() => setSel(manual.slice())}>Selecionar tudo</button>
                    <button type="button" className="btn sm" disabled={!selValida.length} onClick={() => setSel([])}>Limpar</button>
                    <button type="button" className="btn primary sm" disabled={!selValida.length} onClick={copiar}>Copiar</button>
                    <button type="button" className="btn sm" disabled={!selValida.length} onClick={excluirSel}><Trash2 size={14} /> Excluir selecionadas</button>
                  </div>)}
                <p className="muted" style={{ margin: "6px 0 0" }}>{
                  modoEd === "add" ? "Arraste a caixa até o lugar e solte: ela fica transparente enquanto você arrasta (azul = cabe, vermelha = não cabe). Um clique também coloca. Esc cancela."
                  : modoEd === "sel" ? (vista === "cima" ? "Arraste um retângulo para pegar várias caixas, ou clique numa caixa. Depois arraste as caixas marcadas para mudar de lugar, ou use Copiar." : "Clique nas caixas para marcar. Depois arraste uma caixa marcada para mudar o grupo de lugar, ou use Copiar.")
                  : modoEd === "col" ? `Arraste o grupo de ${copia ? copia.length : 0} caixa${copia && copia.length === 1 ? "" : "s"} até o lugar e solte para colar. Pode colar quantas vezes quiser.`
                  : "Clique numa caixa para tirá-la."}</p>
                {pend && fantasma && <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 600, color: fantasma.ok ? "#1d4ed8" : "#b91c1c" }} role="status">{fantasma.ok ? `Pode soltar: camada ${nivelMax(fantasma.caixas)}.` : fantasma.motivo}</p>}
                {msgEd && !pend && <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 600, color: "#1d4ed8" }} role="status">{msgEd}</p>}
              </div>)}

            {vista === "cima" ? (
              <>
                <div className="cg-camadas">
                  {Array.from({ length: Math.max(1, plano.niveis) + (editando ? 1 : 0) }, (_, i) => i + 1).map(n => <button key={n} className={camadaEf === n ? "on" : ""} onClick={() => setCamada(n)}>Camada {n}</button>)}
                </div>
                <div className="row" style={{ margin: "0 0 6px" }}>
                  <span className="muted">Zoom {Math.round(zoom2d * 100)}%</span>
                  <button type="button" className="btn sm" aria-label="Aproximar" onClick={() => setZoom2d(z => Math.min(6, +(z * 1.4).toFixed(2)))}>＋</button>
                  <button type="button" className="btn sm" aria-label="Afastar" onClick={() => setZoom2d(z => Math.max(1, +(z / 1.4).toFixed(2)))}>－</button>
                  <button type="button" className="btn sm" disabled={zoom2d === 1} onClick={() => setZoom2d(1)}>Ajustar</button>
                  {zoom2d > 1 && <span className="muted">Role a área para ver o resto.</span>}
                </div>
                <div className="cg-vista" style={{ overflow: "auto", maxHeight: zoom2d > 1 ? 560 : undefined }}><div style={{ width: `${zoom2d * 100}%` }}><VistaCima cam={camP} plano={plano} tipos={tiposP} camada={camadaEf} ponteiro={editando ? ponteiro2d : undefined} fantasma={editando ? fantasma : null} sel={editando ? selValida : undefined} marq={editando ? marq : null} oculta={mov && mov.moveu ? selValida : null} /></div></div>
                <p className="muted">Os números são a ordem de carga: comece pelo fundo, perto da cabine. As caixas cinzas são a camada de baixo.</p>
              </>
            ) : (
              <>
                {plano.niveis > 1 && (
                  <div className="cg-camadas">
                    <button className={todas ? "on" : ""} onClick={() => setTodas(true)}>Todas as camadas</button>
                    {Array.from({ length: plano.niveis - 1 }, (_, i) => i + 1).map(n => <button key={n} className={!todas && camadaEf === n ? "on" : ""} onClick={() => { setTodas(false); setCamada(n); }}>Até a camada {n}</button>)}
                  </div>)}
                <Vista3D cam={camP} plano={plano} tipos={tiposP} camada={camada3d} edicao={editando ? { ativo: true, modo: modoEd, fantasma, sel: selValida, onPonteiro: ponteiro3d, onRemover: removerCaixa, onSel: alternarSel, oculta: mov && mov.moveu ? selValida : null, onMover: { down: movDown, move: movMove, up: movUp } } : null} />
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
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button>
            {abertoId ? (<><button type="button" className="btn" disabled={busy} onClick={(e) => salvarCarregamento(e, true)}>Salvar como novo</button><button className="btn primary" disabled={busy}>Atualizar este</button></>) : <button className="btn primary" disabled={busy}>Salvar</button>}</div>
        </form></div>)}
    </div>
  );
}
