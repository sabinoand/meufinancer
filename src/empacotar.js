// Planejador de carregamento: encaixa caixas retangulares dentro de um baú/carroceria.
// Medidas em cm. Eixos: x = comprimento (da cabine para a porta), y = largura, z = altura.
// Regras: nada sai do baú, nada se sobrepõe, caixa em cima precisa estar apoiada (>= 80% da base)
// e o limite de empilhamento de cada tipo é respeitado. Heurística de "pontos extremos".

const EPS = 1e-6;
const TOL = 1.5; // cm: encostar de leve numa caixa vizinha não conta como estar em cima/dentro dela
const APOIO_MIN = 0.8;
const APOIO_MANUAL = 0.08; // edição manual: basta uma pontinha de apoio; quem decide o resto é o usuário
const APOIO_MIN_FORA = 0.55; // cálculo automático: caixa que sobra para fora da carroceria precisa de 55% da base apoiada (no máximo 45% pendurado) e o centro sobre o apoio

// Limites onde a caixa pode ficar. No piso vale a carroceria; da 2ª camada para cima, carroceria aberta
// pode sobrar para os lados e para trás (cam.sobraLado / cam.sobraTras, em cm). Nunca sobra na frente (cabine).
export function limites(cam, z) {
  if (cam.aberta && z > EPS) return { x1: cam.c + (cam.sobraTras || 0), y0: -(cam.sobraLado || 0), y1: cam.l + (cam.sobraLado || 0) };
  return { x1: cam.c, y0: 0, y1: cam.l };
}
const saiDoPiso = (cam, x, y, dx, dy) => x + dx > cam.c + EPS || y < -EPS || y + dy > cam.l + EPS;

// Orientações permitidas: sempre pode girar sobre o próprio eixo (troca comprimento por largura);
// só pode deitar a caixa se o tipo permitir.
export function orientacoes(t) {
  const lista = t.deitar
    ? [[t.c, t.l, t.a], [t.l, t.c, t.a], [t.c, t.a, t.l], [t.a, t.c, t.l], [t.l, t.a, t.c], [t.a, t.l, t.c]]
    : [[t.c, t.l, t.a], [t.l, t.c, t.a]];
  const vistas = new Set();
  return lista.filter(o => { const k = o.join("x"); if (vistas.has(k)) return false; vistas.add(k); return true; });
}

// Carroceria aberta: caixa de cima precisa ficar "amarrada", cruzada em 90° com a de baixo,
// senão a pilha tomba. Caixa quadrada não tem como cruzar, então fica livre.
const sentido = (dx, dy) => dx === dy ? 0 : (dx > dy ? 1 : -1);
// Devolve null se não tem apoio suficiente / passa do limite; senão { nivel, cap }.
function apoioDe(cam, colocadas, x, y, z, dx, dy, tipo) {
  if (z < EPS) return { nivel: 1, cap: tipo.max };
  let area = 0, nivel = 0, cap = tipo.max, iguais = 0, apoios = 0;
  const apo = [];
  let ax0 = Infinity, ax1 = -Infinity, ay0 = Infinity, ay1 = -Infinity;
  for (const b of colocadas) {
    if (Math.abs(b.z + b.dz - z) > EPS) continue;
    const ox = Math.min(x + dx, b.x + b.dx) - Math.max(x, b.x);
    const oy = Math.min(y + dy, b.y + b.dy) - Math.max(y, b.y);
    if (ox > EPS && oy > EPS) {
      ax0 = Math.min(ax0, b.x); ax1 = Math.max(ax1, b.x + b.dx); ay0 = Math.min(ay0, b.y); ay1 = Math.max(ay1, b.y + b.dy);
      apoios++; if (sentido(dx, dy) !== 0 && sentido(dx, dy) === sentido(b.dx, b.dy)) iguais++;
      apo.push(b); area += ox * oy; nivel = Math.max(nivel, b.nivel); cap = Math.min(cap, b.cap); }
  }
  const fora = saiDoPiso(cam, x, y, dx, dy);
  if (area < (fora ? APOIO_MIN_FORA : APOIO_MIN) * dx * dy - EPS) return null;
  if (fora && (x + dx / 2 < ax0 - 0.5 || x + dx / 2 > ax1 + 0.5 || y + dy / 2 < ay0 - 0.5 || y + dy / 2 > ay1 + 0.5)) return null;
  // amarrado = cruza pelo menos uma das caixas de baixo (ou apoia em várias); alinhado com todas, tomba
  // (mesmo sentido em todas: só amarra se a caixa pisa em duas ou mais, em posições diferentes no eixo curto, como tijolo)
  if (cam.aberta && sentido(dx, dy) !== 0 && apoios > 0 && iguais === apoios) {
    const curto = sentido(dx, dy) === 1 ? (q) => q.y : (q) => q.x;
    const pos = apo.map(curto).sort((m, n) => m - n);
    if (!pos.some((v, i) => i > 0 && v - pos[i - 1] > 2)) return null;
  }
  if (nivel + 1 > cap) return null;
  return { nivel: nivel + 1, cap };
}

function tentar(cam, unidades, modo, pref, rnd) {
  const colocadas = [];
  const sobrou = [];
  let pontos = [[0, 0, 0]];
  const falhou = new Set(); // tipos que já não cabem mais (estado só piora)

  const sobrepoe = (x, y, z, dx, dy, dz) => {
    for (const b of colocadas) {
      if (x < b.x + b.dx - EPS && x + dx > b.x + EPS &&
          y < b.y + b.dy - EPS && y + dy > b.y + EPS &&
          z < b.z + b.dz - EPS && z + dz > b.z + EPS) return true;
    }
    return false;
  };
  // devolve null se não tem apoio suficiente / passa do limite; senão { nivel, cap }
  // Carroceria aberta: caixa de cima precisa ficar "amarrada", cruzada em 90° com a de baixo,
  // senão a pilha tomba. Caixa quadrada não tem como cruzar, então fica livre.
  const apoio = (x, y, z, dx, dy, tipo) => apoioDe(cam, colocadas, x, y, z, dx, dy, tipo);

  for (const u of unidades) {
    if (falhou.has(u.tipo.id)) { sobrou.push(u); continue; }
    const ors = orientacoes(u.tipo);
    let achou = null;
    for (const p of pontos) {
      let melhor = null;
      const servem = [];
      for (const [dx, dy, dz] of ors) {
        const L = limites(cam, p[2]);
        if (p[0] + dx > L.x1 + EPS || p[1] < L.y0 - EPS || p[1] + dy > L.y1 + EPS || p[2] + dz > cam.a + EPS) continue;
        if (sobrepoe(p[0], p[1], p[2], dx, dy, dz)) continue;
        const ap = apoio(p[0], p[1], p[2], dx, dy, u.tipo);
        if (!ap) continue;
        // entre as orientações que servem neste ponto, a que ocupa menos comprimento e deixa a base mais larga
        const nota = pref * dx * 1000 - dy;
        servem.push({ dx, dy, dz, ap, nota });
        if (!melhor || nota < melhor.nota) melhor = { dx, dy, dz, ap, nota };
      }
      // nas tentativas sorteadas, às vezes cruza a caixa (mistura sentidos na mesma camada)
      if (melhor && rnd && servem.length > 1 && rnd() < 0.3) melhor = servem[Math.floor(rnd() * servem.length)];
      if (melhor) { achou = { p, ...melhor }; break; }
    }
    if (!achou) { falhou.add(u.tipo.id); sobrou.push(u); continue; }
    const [x, y, z] = achou.p;
    const cx = { x, y, z, dx: achou.dx, dy: achou.dy, dz: achou.dz, tipo: u.tipo, nivel: achou.ap.nivel, cap: achou.ap.cap };
    colocadas.push(cx);
    // novos pontos extremos; remove os que ficaram dentro de alguma caixa
    const novos = [[x + cx.dx, y, z], [x, y + cx.dy, z], [x, y, z + cx.dz]];
    // com sobra lateral, a camada de cima também pode começar para fora da lateral
    if (cam.aberta && cam.sobraLado > 0) novos.push([x, -cam.sobraLado, z + cx.dz]);
    // projeções para encostar nas paredes/caixas vizinhas (evita buracos)
    pontos = pontos.concat(novos).filter(q => {
      const L = limites(cam, q[2]);
      return q[0] < L.x1 - EPS && q[1] < L.y1 - EPS && q[2] < cam.a - EPS &&
      !colocadas.some(b => q[0] >= b.x - EPS && q[0] < b.x + b.dx - EPS && q[1] >= b.y - EPS && q[1] < b.y + b.dy - EPS && q[2] >= b.z - EPS && q[2] < b.z + b.dz - EPS);
    });
    const vistos = new Set();
    pontos = pontos.filter(q => { const k = q.map(v => v.toFixed(3)).join(","); if (vistos.has(k)) return false; vistos.add(k); return true; });
    pontos.sort(modo === "parede" ? (a, b) => (a[0] - b[0]) || (a[2] - b[2]) || (a[1] - b[1]) : (a, b) => (a[2] - b[2]) || (a[0] - b[0]) || (a[1] - b[1]));
  }
  return { colocadas, sobrou };
}


// ---------- planejamento por camadas (um só tipo de caixa) ----------
// Cada camada é um "mosaico" de fileiras: programação dinâmica de cortes (guilhotina) acha a melhor mistura de
// caixas retas e atravessadas num retângulo. Da 2ª camada para cima, em carroceria aberta, o retângulo pode ser
// maior (sobra para os lados e atrás). As camadas alternam o desenho para ficarem amarradas.
const memoTab = new Map();
function tabela(Xmax, Ymax, ors) {
  const chave = Xmax + "x" + Ymax + ":" + ors.map(o => o[0] + "," + o[1]).join(";");
  if (memoTab.has(chave)) return memoTab.get(chave);
  const sy = Ymax + 1, f = new Int16Array((Xmax + 1) * sy), gk = new Uint8Array((Xmax + 1) * sy), gp = new Int16Array((Xmax + 1) * sy);
  const alcance = (lim, tam) => { const r = new Uint8Array(lim + 1); r[0] = 1; for (let i = 0; i <= lim; i++) if (r[i]) for (const t of tam) if (i + t <= lim) r[i + t] = 1; const l = []; for (let i = 1; i < lim; i++) if (r[i]) l.push(i); return l; };
  const Rx = alcance(Xmax, ors.map(o => o[0])), Ry = alcance(Ymax, ors.map(o => o[1]));
  for (let X = 0; X <= Xmax; X++) for (let Y = 0; Y <= Ymax; Y++) {
    const i = X * sy + Y; let best = 0, k = 0, p = 0;
    for (let j = 0; j < ors.length; j++) if (X >= ors[j][0] && Y >= ors[j][1]) { best = 1; k = 1; p = j; break; }
    if (X > 0 && f[i - sy] > best) { best = f[i - sy]; k = 3; }
    if (Y > 0 && f[i - 1] > best) { best = f[i - 1]; k = 4; }
    for (const c of Rx) { if (c >= X) break; const v = f[c * sy + Y] + f[(X - c) * sy + Y]; if (v > best) { best = v; k = 2; p = c; } }
    for (const c of Ry) { if (c >= Y) break; const v = f[X * sy + c] + f[X * sy + Y - c]; if (v > best) { best = v; k = 5; p = c; } }
    f[i] = best; gk[i] = k; gp[i] = p;
  }
  const t = { f, gk, gp, sy, ors };
  if (memoTab.size > 12) memoTab.clear();
  memoTab.set(chave, t); return t;
}
function recortar(t, X, Y, ox, oy, out) {
  const i = X * t.sy + Y;
  if (!t.f[i]) return;
  const k = t.gk[i], p = t.gp[i];
  if (k === 1) out.push([ox, oy, t.ors[p]]);
  else if (k === 3) recortar(t, X - 1, Y, ox, oy, out);
  else if (k === 4) recortar(t, X, Y - 1, ox, oy, out);
  else if (k === 2) { recortar(t, p, Y, ox, oy, out); recortar(t, X - p, Y, ox + p, oy, out); }
  else if (k === 5) { recortar(t, X, p, ox, oy, out); recortar(t, X, Y - p, ox, oy + p, out); }
}

function camadasPara(cam, tipo, qtd, dz, pares) {
  const sl = cam.aberta ? (cam.sobraLado || 0) : 0, st = cam.aberta ? (cam.sobraTras || 0) : 0;
  const nCam = Math.min(tipo.max || 99, Math.floor((cam.a + EPS) / dz));
  if (nCam < 1) return null;
  const ors = pares.map(([w, h]) => [Math.ceil(w - 1e-9), Math.ceil(h - 1e-9), w, h]);
  const Xmax = Math.floor(cam.c + st), Ymax = Math.floor(cam.l + 2 * sl);
  if (!ors.some(o => o[0] <= Xmax && o[1] <= Ymax)) return null;
  const tabs = [tabela(Xmax, Ymax, ors)];
  if (ors.length > 1) for (const o of ors) tabs.push(tabela(Xmax, Ymax, [o]));

  const bases = new Map();
  const baseDe = (ti, Xp, Yp) => { const k = ti + ":" + Xp + ":" + Yp; if (!bases.has(k)) { const o = []; recortar(tabs[ti], Xp, Yp, 0, 0, o); bases.set(k, o); } return bases.get(k); };
  // todas as formas de montar a camada k (apoiada na camada de baixo), da que leva mais caixas para a que leva menos
  const candidatos = (k, Lc, ultima) => {
    const alto = k > 0, z = k * dz, cheio = Lc >= Math.floor(cam.c);
    const xs = alto && st > 0 && cheio ? [Math.floor(Lc + st), Math.floor(Lc)] : [Math.floor(Lc)];
    const H = Math.floor(cam.l + (alto ? 2 * sl : 0));
    const yps = alto && sl > 0 ? [H, Math.floor(cam.l + sl), Math.floor(cam.l)] : [H];
    const L = limites(cam, z), lista = [], vistos = new Set();
    for (let ti = 0; ti < tabs.length; ti++) for (const Xp of xs) for (const Yp of yps) {
      const folga = H - Yp, ts = folga > 0 ? [0, Math.floor(folga / 2), folga] : [0];
      const base = baseDe(ti, Xp, Yp);
      if (!base.length) continue;
      for (const tt of ts) for (const fx of [0, 1]) for (const fy of [0, 1]) {
        const y0 = (alto ? -sl : 0) + tt, colocadas = []; let fora = 0, h = 0;
        for (const [px, py, o] of base) {
          const x = fx ? Xp - px - o[0] : px, y = y0 + (fy ? Yp - py - o[1] : py);
          if (x < -EPS || x + o[2] > L.x1 + EPS || y < L.y0 - EPS || y + o[3] > L.y1 + EPS) continue;
          const ap = apoioDe(cam, ultima, x, y, z, o[2], o[3], tipo);
          if (!ap) continue;
          if (saiDoPiso(cam, x, y, o[2], o[3])) fora++;
          h = (h + Math.round(x * 10) * 31 + Math.round(y * 10) * 17 + o[2] * 7) % 1000000007;
          colocadas.push({ x, y, z, dx: o[2], dy: o[3], dz, tipo, nivel: ap.nivel, cap: ap.cap });
        }
        if (!colocadas.length) continue;
        const chave = colocadas.length + ":" + h; if (vistos.has(chave)) continue; vistos.add(chave);
        lista.push({ c: colocadas, fora, sig: ti });
      }
    }
    lista.sort((p, q) => q.c.length - p.c.length || p.fora - q.fora);
    return lista;
  };
  // monta as camadas de baixo para cima. Largura 1 = escolhe sempre a melhor camada; maior = guarda alternativas
  // (pode compensar uma camada um pouco menor para a de cima cruzar melhor)
  const montar = (Lc, largura) => {
    let estados = [{ camadas: [], ultima: [], tot: 0 }], finais = [];
    for (let k = 0; k < nCam && estados.length; k++) {
      const novos = [];
      for (const e of estados) {
        const cs = candidatos(k, Lc, e.ultima);
        if (!cs.length) { finais.push(e); continue; }
        const pegos = new Set(cs.slice(0, largura > 1 ? 3 : 1));
        if (largura > 1) for (let s = 0; s < tabs.length; s++) { const c = cs.find(q => q.sig === s); if (c) pegos.add(c); }
        for (const c of pegos) novos.push({ camadas: e.camadas.concat([c.c]), ultima: c.c, tot: e.tot + c.c.length, sig: c.sig });
      }
      novos.sort((p, q) => q.tot - p.tot);
      const guarda = new Set(novos.slice(0, largura));
      if (largura > 1) for (let s = 0; s < tabs.length; s++) { const c = novos.find(q => q.sig === s); if (c) guarda.add(c); }
      estados = [...guarda];
    }
    const todos = finais.concat(estados);
    return todos.reduce((m, e) => (!m || e.tot > m.tot ? e : m), null).camadas;
  };
  const memo = new Map();
  const total = (Lc) => { if (!memo.has(Lc)) memo.set(Lc, montar(Lc, 1)); return memo.get(Lc).reduce((sm, c) => sm + c.length, 0); };
  let hi = Math.floor(cam.c), lo = Math.max(1, Math.min(...ors.map(o => Math.min(o[2], o[3]))));
  if (total(hi) === 0) return null;
  if (total(hi) > qtd) {
    // cabe com folga: acha o menor comprimento que ainda leva tudo (bloco do fundo da cabine até onde precisar)
    let a = Math.ceil(lo), b = hi;
    while (a < b) { const m = Math.floor((a + b) / 2); if (total(m) >= qtd) b = m; else a = m + 1; }
    hi = b;
    total(hi);
  }
  let camadas = montar(hi, 4);
  if (camadas.reduce((sm, c) => sm + c.length, 0) < total(hi)) camadas = memo.get(hi);
  // sobrou lugar: tira o excesso do topo, das caixas mais longe da cabine, sem desapoiar nenhuma
  let colocadas = camadas.flat();
  let excesso = colocadas.length - qtd;
  for (let k = camadas.length - 1; k >= 0 && excesso > 0; k--) {
    const c = camadas[k].slice().sort((p, q) => q.x - p.x || q.y - p.y);
    const tira = new Set(c.slice(0, Math.min(excesso, c.length)));
    excesso -= tira.size;
    camadas[k] = camadas[k].filter(b => !tira.has(b));
  }
  colocadas = camadas.flat();
  return { colocadas };
}

function planejarCamadas(cam, tipo, qtd) {
  const grupos = new Map();
  for (const [dx, dy, dz] of orientacoes(tipo)) { if (!grupos.has(dz)) grupos.set(dz, []); grupos.get(dz).push([dx, dy]); }
  let melhor = null;
  for (const [dz, pares] of grupos) {
    const r = camadasPara(cam, tipo, qtd, dz, pares);
    if (!r) continue;
    const v = r.colocadas.length, comp = r.colocadas.reduce((m, b) => Math.max(m, b.x + b.dx), 0);
    if (!melhor || v > melhor.v || (v === melhor.v && comp < melhor.comp - EPS)) melhor = { r, v, comp };
  }
  return melhor && melhor.r;
}

// tipos: [{ id, nome, c, l, a, max (caixas por pilha), deitar }], pedido: [{ tipoId, qtd }]
export function planejar(caminhao, tipos, pedido) {
  const porId = new Map(tipos.map(t => [t.id, t]));
  const unidades = [];
  for (const it of pedido) {
    const t = porId.get(it.tipoId);
    if (!t) continue;
    for (let i = 0; i < it.qtd; i++) unidades.push({ tipo: t });
  }
  const base = (u) => u.tipo.c * u.tipo.l;
  const vol = (u) => u.tipo.c * u.tipo.l * u.tipo.a;
  const ordens = [
    (a, b) => base(b) - base(a) || b.tipo.a - a.tipo.a || a.tipo.id.localeCompare(b.tipo.id),
    (a, b) => vol(b) - vol(a) || a.tipo.id.localeCompare(b.tipo.id),
    (a, b) => b.tipo.a - a.tipo.a || base(b) - base(a) || a.tipo.id.localeCompare(b.tipo.id),
    (a, b) => Math.max(b.tipo.c, b.tipo.l) - Math.max(a.tipo.c, a.tipo.l) || base(b) - base(a) || a.tipo.id.localeCompare(b.tipo.id),
  ];
  // um só tipo de caixa: o planejamento por camadas aproveita bem mais; se já leva tudo, é a resposta
  const unico = unidades.length > 0 && unidades.every(u => u.tipo === unidades[0].tipo);
  const pc = unico ? planejarCamadas(caminhao, unidades[0].tipo, unidades.length) : null;
  if (pc && pc.colocadas.length === unidades.length) return resumir(caminhao, tipos, pedido, pc.colocadas);
  let melhor = null;
  // "parede": monta do fundo para a porta, subindo as pilhas; "chao": completa o piso antes de empilhar.
  // Vale a que levar mais caixas; no empate, a que usa menos comprimento do baú.
  for (const modo of ["parede", "chao"]) for (const ord of ordens) for (const pref of [1, -1]) {
    const r = tentar(caminhao, unidades.slice().sort(ord), modo, pref);
    const v = r.colocadas.reduce((sm, b) => sm + b.dx * b.dy * b.dz, 0);
    const comp = r.colocadas.reduce((m, b) => Math.max(m, b.x + b.dx), 0);
    if (!melhor || v > melhor.v + EPS || (Math.abs(v - melhor.v) <= EPS && comp < melhor.comp - EPS)) melhor = { r, v, comp };
  }
  // Busca extra: várias tentativas com sorteio de sentido das caixas (mistura sentidos para
  // aproveitar sobras), dentro de um limite de tempo. Só se o carregamento ainda não coube tudo.
  if (!pc && unidades.length <= 700 && melhor.r.sobrou.length > 0) {
    let semente = unidades.length * 7919 + Math.round(caminhao.c * 3 + caminhao.l);
    const rnd = () => { semente = (semente + 0x6D2B79F5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ordBase = ordens[0];
    const ini = Date.now();
    for (let i = 0; i < 40 && Date.now() - ini < 900; i++) {
      const modo = i % 2 ? "chao" : "parede", pref = i % 4 < 2 ? 1 : -1;
      const r = tentar(caminhao, unidades.slice().sort(ordBase), modo, pref, rnd);
      const v = r.colocadas.reduce((sm, b) => sm + b.dx * b.dy * b.dz, 0);
      const comp = r.colocadas.reduce((m, b) => Math.max(m, b.x + b.dx), 0);
      if (v > melhor.v + EPS || (Math.abs(v - melhor.v) <= EPS && comp < melhor.comp - EPS)) melhor = { r, v, comp };
    }
  }
  if (pc) {
    const v = pc.colocadas.reduce((sm, b) => sm + b.dx * b.dy * b.dz, 0);
    const comp = pc.colocadas.reduce((m, b) => Math.max(m, b.x + b.dx), 0);
    if (v > melhor.v + EPS || (Math.abs(v - melhor.v) <= EPS && comp < melhor.comp - EPS)) melhor = { r: { colocadas: pc.colocadas }, v, comp };
  }
  return resumir(caminhao, tipos, pedido, melhor.r.colocadas);
}

// Monta o resultado (ordem de carga, ocupação, totais) a partir de qualquer lista de caixas colocadas,
// seja a do cálculo automático ou a editada à mão. Caixas colocadas além do pedido contam como pedidas.
export function resumir(caminhao, tipos, pedido, colocadas) {
  const ordem = colocadas.slice().sort((a, b) => (a.x - b.x) || (a.z - b.z) || (a.y - b.y));
  ordem.forEach((b, i) => { b.seq = i + 1; });
  // carroceria aberta não tem teto: mede-se pelo piso coberto; baú/sider, pelo volume
  const volCam = caminhao.aberta ? caminhao.c * caminhao.l : caminhao.c * caminhao.l * caminhao.a;
  const volUsado = caminhao.aberta ? colocadas.filter(b => b.z < EPS).reduce((sm, b) => sm + b.dx * b.dy, 0) : colocadas.reduce((sm, b) => sm + b.dx * b.dy * b.dz, 0);
  const porTipo = tipos.map(t => {
    const cabem = colocadas.filter(b => b.tipo.id === t.id).length;
    const ped = pedido.filter(p => p.tipoId === t.id).reduce((sm, p) => sm + p.qtd, 0);
    return { tipo: t, pedido: Math.max(ped, cabem), cabem };
  }).filter(x => x.pedido > 0);
  const niveis = colocadas.reduce((m, b) => Math.max(m, b.nivel), 0);
  const compOcupado = colocadas.reduce((m, b) => Math.max(m, b.x + b.dx), 0);
  const sobrou = porTipo.reduce((sm, x) => sm + (x.pedido - x.cabem), 0);
  return { caixas: ordem, sobrou, porTipo, ocupacao: volCam ? volUsado / volCam : 0, volUsado, volCam, niveis, compOcupado };
}

// ---------- edição manual ----------
// Altura em que uma caixa com essa base ficaria: em cima da mais alta que ela pisa (ou no chão).
export function alturaApoio(colocadas, x, y, dx, dy) {
  let z = 0;
  for (const b of colocadas) {
    if (x < b.x + b.dx - TOL && x + dx > b.x + TOL && y < b.y + b.dy - TOL && y + dy > b.y + TOL) z = Math.max(z, b.z + b.dz);
  }
  return z;
}
// Confere se a caixa pode ficar ali. Devolve { ok:true, caixa } ou { ok:false, motivo }.
export function conferirCaixa(caminhao, colocadas, tipo, x, y, dx, dy, dz, zForcado) {
  const z = zForcado != null ? zForcado : alturaApoio(colocadas, x, y, dx, dy);
  const L = limites(caminhao, z);
  if (x < -EPS || y < L.y0 - EPS || x + dx > L.x1 + EPS || y + dy > L.y1 + EPS) return { ok: false, motivo: z > EPS && caminhao.aberta ? (caminhao.sobraLado || caminhao.sobraTras ? "Passa do que pode sobrar para fora." : "A caixa sai da carroceria. Para deixar sobrar, defina a sobra no cadastro do caminhão.") : "A caixa sai do caminhão." };
  if (z + dz > caminhao.a + EPS) return { ok: false, motivo: "Passa da altura do caminhão." };
  let area = 0, nivel = 0, cap = tipo.max;
  let ax0 = Infinity, ax1 = -Infinity, ay0 = Infinity, ay1 = -Infinity;
  for (const b of colocadas) {
    if (x < b.x + b.dx - TOL && x + dx > b.x + TOL && y < b.y + b.dy - TOL && y + dy > b.y + TOL) {
      if (z < b.z + b.dz - EPS && z + dz > b.z + EPS) return { ok: false, motivo: "Já tem caixa nesse lugar." };
    }
    if (z > EPS && Math.abs(b.z + b.dz - z) < EPS) {
      const ox = Math.min(x + dx, b.x + b.dx) - Math.max(x, b.x), oy = Math.min(y + dy, b.y + b.dy) - Math.max(y, b.y);
      if (ox > EPS && oy > EPS) { area += ox * oy; nivel = Math.max(nivel, b.nivel); cap = Math.min(cap, b.cap); ax0 = Math.min(ax0, b.x); ax1 = Math.max(ax1, b.x + b.dx); ay0 = Math.min(ay0, b.y); ay1 = Math.max(ay1, b.y + b.dy); }
    }
  }
  // Na edição manual quem manda é o usuário: basta a caixa pousar em alguma coisa (até só pelas pontas,
  // por cima de duas caixas, ou com o centro para fora do apoio).
  if (z > EPS && area < APOIO_MANUAL * dx * dy - EPS) return { ok: false, motivo: "Falta apoio embaixo: a caixa ficaria no ar." };
  if (z > EPS && nivel + 1 > cap) return { ok: false, motivo: `Limite de ${cap} caixas empilhadas.` };
  return { ok: true, caixa: { x, y, z, dx, dy, dz, tipo, nivel: z > EPS ? nivel + 1 : 1, cap: Math.min(cap, tipo.max) } };
}
// Gruda a caixa nas paredes e nas caixas vizinhas, para não ficarem frestas ao clicar.
export function encostar(caminhao, colocadas, x, y, dx, dy, folga = 8, z = 0) {
  const L = limites(caminhao, z);
  const cx = [0, L.x1 - dx, caminhao.c - dx], cy = [L.y0, L.y1 - dy, 0, caminhao.l - dy];
  for (const b of colocadas) { cx.push(b.x + b.dx, b.x - dx, b.x, b.x + b.dx - dx); cy.push(b.y + b.dy, b.y - dy, b.y, b.y + b.dy - dy); }
  const perto = (v, lista) => { let m = v, d = folga + 1; for (const c of lista) { const dd = Math.abs(c - v); if (dd < d) { d = dd; m = c; } } return d <= folga ? m : v; };
  return [Math.max(0, Math.min(L.x1 - dx, perto(x, cx))), Math.max(L.y0, Math.min(L.y1 - dy, perto(y, cy)))];
}
// Caixas que estão apoiadas em cima dessa (impede tirar a de baixo).
export function temCaixaEmCima(colocadas, b) {
  return colocadas.some(q => q !== b && Math.abs(q.z - (b.z + b.dz)) < EPS && q.x < b.x + b.dx - EPS && q.x + q.dx > b.x + EPS && q.y < b.y + b.dy - EPS && q.y + q.dy > b.y + EPS);
}
