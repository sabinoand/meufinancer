// Planejador de carregamento: encaixa caixas retangulares dentro de um baú/carroceria.
// Medidas em cm. Eixos: x = comprimento (da cabine para a porta), y = largura, z = altura.
// Regras: nada sai do baú, nada se sobrepõe, caixa em cima precisa estar apoiada (>= 80% da base)
// e o limite de empilhamento de cada tipo é respeitado. Heurística de "pontos extremos".

const EPS = 1e-6;
const APOIO_MIN = 0.8;

// Orientações permitidas: sempre pode girar sobre o próprio eixo (troca comprimento por largura);
// só pode deitar a caixa se o tipo permitir.
function orientacoes(t) {
  const lista = t.deitar
    ? [[t.c, t.l, t.a], [t.l, t.c, t.a], [t.c, t.a, t.l], [t.a, t.c, t.l], [t.l, t.a, t.c], [t.a, t.l, t.c]]
    : [[t.c, t.l, t.a], [t.l, t.c, t.a]];
  const vistas = new Set();
  return lista.filter(o => { const k = o.join("x"); if (vistas.has(k)) return false; vistas.add(k); return true; });
}

function tentar(cam, unidades, modo, pref) {
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
  const sentido = (dx, dy) => dx === dy ? 0 : (dx > dy ? 1 : -1);
  const apoio = (x, y, z, dx, dy, tipo) => {
    if (z < EPS) return { nivel: 1, cap: tipo.max };
    let area = 0, nivel = 0, cap = tipo.max, iguais = 0, apoios = 0;
    for (const b of colocadas) {
      if (Math.abs(b.z + b.dz - z) > EPS) continue;
      const ox = Math.min(x + dx, b.x + b.dx) - Math.max(x, b.x);
      const oy = Math.min(y + dy, b.y + b.dy) - Math.max(y, b.y);
      if (ox > EPS && oy > EPS) {
        apoios++; if (sentido(dx, dy) !== 0 && sentido(dx, dy) === sentido(b.dx, b.dy)) iguais++;
        area += ox * oy; nivel = Math.max(nivel, b.nivel); cap = Math.min(cap, b.cap); }
    }
    if (area < APOIO_MIN * dx * dy - EPS) return null;
    // amarrado = cruza pelo menos uma das caixas de baixo (ou apoia em várias); alinhado com todas, tomba
    if (cam.aberta && sentido(dx, dy) !== 0 && apoios > 0 && iguais === apoios) return null;
    if (nivel + 1 > cap) return null;
    return { nivel: nivel + 1, cap };
  };

  for (const u of unidades) {
    if (falhou.has(u.tipo.id)) { sobrou.push(u); continue; }
    const ors = orientacoes(u.tipo);
    let achou = null;
    for (const p of pontos) {
      let melhor = null;
      for (const [dx, dy, dz] of ors) {
        if (p[0] + dx > cam.c + EPS || p[1] + dy > cam.l + EPS || p[2] + dz > cam.a + EPS) continue;
        if (sobrepoe(p[0], p[1], p[2], dx, dy, dz)) continue;
        const ap = apoio(p[0], p[1], p[2], dx, dy, u.tipo);
        if (!ap) continue;
        // entre as orientações que servem neste ponto, a que ocupa menos comprimento e deixa a base mais larga
        const nota = pref * dx * 1000 - dy;
        if (!melhor || nota < melhor.nota) melhor = { dx, dy, dz, ap, nota };
      }
      if (melhor) { achou = { p, ...melhor }; break; }
    }
    if (!achou) { falhou.add(u.tipo.id); sobrou.push(u); continue; }
    const [x, y, z] = achou.p;
    const cx = { x, y, z, dx: achou.dx, dy: achou.dy, dz: achou.dz, tipo: u.tipo, nivel: achou.ap.nivel, cap: achou.ap.cap };
    colocadas.push(cx);
    // novos pontos extremos; remove os que ficaram dentro de alguma caixa
    const novos = [[x + cx.dx, y, z], [x, y + cx.dy, z], [x, y, z + cx.dz]];
    // projeções para encostar nas paredes/caixas vizinhas (evita buracos)
    pontos = pontos.concat(novos).filter(q =>
      q[0] < cam.c - EPS && q[1] < cam.l - EPS && q[2] < cam.a - EPS &&
      !colocadas.some(b => q[0] >= b.x - EPS && q[0] < b.x + b.dx - EPS && q[1] >= b.y - EPS && q[1] < b.y + b.dy - EPS && q[2] >= b.z - EPS && q[2] < b.z + b.dz - EPS));
    const vistos = new Set();
    pontos = pontos.filter(q => { const k = q.map(v => v.toFixed(3)).join(","); if (vistos.has(k)) return false; vistos.add(k); return true; });
    pontos.sort(modo === "parede" ? (a, b) => (a[0] - b[0]) || (a[2] - b[2]) || (a[1] - b[1]) : (a, b) => (a[2] - b[2]) || (a[0] - b[0]) || (a[1] - b[1]));
  }
  return { colocadas, sobrou };
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
  let melhor = null;
  // "parede": monta do fundo para a porta, subindo as pilhas; "chao": completa o piso antes de empilhar.
  // Vale a que levar mais caixas; no empate, a que usa menos comprimento do baú.
  for (const modo of ["parede", "chao"]) for (const ord of ordens) for (const pref of [1, -1]) {
    const r = tentar(caminhao, unidades.slice().sort(ord), modo, pref);
    const v = r.colocadas.reduce((sm, b) => sm + b.dx * b.dy * b.dz, 0);
    const comp = r.colocadas.reduce((m, b) => Math.max(m, b.x + b.dx), 0);
    if (!melhor || v > melhor.v + EPS || (Math.abs(v - melhor.v) <= EPS && comp < melhor.comp - EPS)) melhor = { r, v, comp };
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
    if (x < b.x + b.dx - EPS && x + dx > b.x + EPS && y < b.y + b.dy - EPS && y + dy > b.y + EPS) z = Math.max(z, b.z + b.dz);
  }
  return z;
}
// Confere se a caixa pode ficar ali. Devolve { ok:true, caixa } ou { ok:false, motivo }.
export function conferirCaixa(caminhao, colocadas, tipo, x, y, dx, dy, dz) {
  if (x < -EPS || y < -EPS || x + dx > caminhao.c + EPS || y + dy > caminhao.l + EPS) return { ok: false, motivo: "A caixa sai do caminhão." };
  const z = alturaApoio(colocadas, x, y, dx, dy);
  if (z + dz > caminhao.a + EPS) return { ok: false, motivo: "Passa da altura do caminhão." };
  let area = 0, nivel = 0, cap = tipo.max;
  for (const b of colocadas) {
    if (x < b.x + b.dx - EPS && x + dx > b.x + EPS && y < b.y + b.dy - EPS && y + dy > b.y + EPS) {
      if (z < b.z + b.dz - EPS) return { ok: false, motivo: "Já tem caixa nesse lugar." };
    }
    if (z > EPS && Math.abs(b.z + b.dz - z) < EPS) {
      const ox = Math.min(x + dx, b.x + b.dx) - Math.max(x, b.x), oy = Math.min(y + dy, b.y + b.dy) - Math.max(y, b.y);
      if (ox > EPS && oy > EPS) { area += ox * oy; nivel = Math.max(nivel, b.nivel); cap = Math.min(cap, b.cap); }
    }
  }
  if (z > EPS && area < APOIO_MIN * dx * dy - EPS) return { ok: false, motivo: "Falta apoio embaixo: a caixa ficaria no ar." };
  if (z > EPS && nivel + 1 > cap) return { ok: false, motivo: `Limite de ${cap} caixas empilhadas.` };
  return { ok: true, caixa: { x, y, z, dx, dy, dz, tipo, nivel: z > EPS ? nivel + 1 : 1, cap: Math.min(cap, tipo.max) } };
}
// Gruda a caixa nas paredes e nas caixas vizinhas, para não ficarem frestas ao clicar.
export function encostar(caminhao, colocadas, x, y, dx, dy, folga = 8) {
  const cx = [0, caminhao.c - dx], cy = [0, caminhao.l - dy];
  for (const b of colocadas) { cx.push(b.x + b.dx, b.x - dx, b.x, b.x + b.dx - dx); cy.push(b.y + b.dy, b.y - dy, b.y, b.y + b.dy - dy); }
  const perto = (v, lista) => { let m = v, d = folga + 1; for (const c of lista) { const dd = Math.abs(c - v); if (dd < d) { d = dd; m = c; } } return d <= folga ? m : v; };
  return [Math.max(0, Math.min(caminhao.c - dx, perto(x, cx))), Math.max(0, Math.min(caminhao.l - dy, perto(y, cy)))];
}
// Caixas que estão apoiadas em cima dessa (impede tirar a de baixo).
export function temCaixaEmCima(colocadas, b) {
  return colocadas.some(q => q !== b && Math.abs(q.z - (b.z + b.dz)) < EPS && q.x < b.x + b.dx - EPS && q.x + q.dx > b.x + EPS && q.y < b.y + b.dy - EPS && q.y + q.dy > b.y + EPS);
}
