/**
 * Auto-layout determinístico: ProcessModel (sem geometria) -> ProcessModel (com bounds/waypoints).
 *
 * [2026-10-14] Criado: layout em camadas + raias — Rafael Brito
 * Estratégia (híbrida, porque dagre/ELK não conhecem swimlanes):
 *  1. dagre (rankdir LR) resolve as COLUNAS (camadas por caminho mais longo, ciclos tratados) e a ORDEM
 *     vertical de cada nó (minimização de cruzamentos). Só usamos x e a ordem de y dele.
 *  2. As LANES viram faixas horizontais; dentro de cada lane, nós da mesma coluna são empilhados
 *     na ordem que o dagre calculou. A altura da lane cresce conforme a maior pilha.
 *  3. Roteamento ortogonal próprio (saída pela direita, entrada pela esquerda; retorno por baixo).
 * Por que não ELK: elkjs não tem raias nativas e traria o mesmo passo de remapeamento, com ~1MB a mais.
 * Determinismo: mesma entrada => mesma saída (ordenação por id em todos os empates), essencial para
 * diffs de versão e para a geração por IA ser testável.
 *
 * TODO [ESTIGMERGIA]: limites conhecidos do layout
 * - Objetos de dados/anotações são posicionados relativos ao nó associado (abaixo/acima) sem checar
 *   colisão com nós empilhados na mesma lane; lanes com esses itens ganham altura extra para reduzir o risco.
 * - Arestas de retorno passam por baixo do nó sem desviar de outros elementos da faixa.
 * - Próximo passo (se doer no corpus real): trocar o roteador por libavoid/ELK edge routing mantendo
 *   as posições de nó calculadas aqui.
 */
import dagre from '@dagrejs/dagre';
import type { Bounds, ProcessFlow, ProcessModel, ProcessNode } from './model.js';

export interface LayoutOptions {
  /** Largura do cabeçalho do pool/lane (rótulo vertical). Default 36, como no design spike. */
  headerWidth?: number;
  /** Altura de cada "slot" de empilhamento dentro de uma lane. */
  slotHeight?: number;
  /** Espaço horizontal entre colunas. */
  columnGap?: number;
  /** Margem horizontal entre o cabeçalho e a primeira coluna / após a última. */
  marginX?: number;
}

const DEFAULTS: Required<LayoutOptions> = { headerWidth: 36, slotHeight: 100, columnGap: 70, marginX: 60 };

/** Tamanho por tipo de elemento (px) — alinhado ao design spike. */
export function sizeOf(n: ProcessNode): { w: number; h: number } {
  switch (n.kind) {
    case 'task': return { w: 120, h: 70 };
    case 'subprocess': return { w: 140, h: 80 };
    case 'gateway': return { w: 50, h: 50 };
    case 'start': case 'end': case 'intermediate': case 'boundary': return { w: 36, h: 36 };
    case 'dataStore': return { w: 50, h: 50 };
    case 'dataObject': return { w: 28, h: 36 };
    case 'annotation': return { w: 170, h: 46 };
  }
}

// [2026-10-14] Alterado: dataStore também é satélite; boundary é posicionado na borda da tarefa hospedeira — Rafael Brito
const isSatellite = (n: ProcessNode) => n.kind === 'dataObject' || n.kind === 'dataStore' || n.kind === 'annotation';
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export function layoutModel(model: ProcessModel, options: LayoutOptions = {}): ProcessModel {
  const o = { ...DEFAULTS, ...options };
  const nodes = [...model.nodes].sort(byId);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const seqFlows = model.flows.filter((f) => f.kind === 'sequence').sort(byId);
  const boundaries = nodes.filter((n) => n.kind === 'boundary' && n.attachedToId && nodeById.has(n.attachedToId));
  const boundaryIds = new Set(boundaries.map((n) => n.id));
  const core = nodes.filter((n) => !isSatellite(n) && !boundaryIds.has(n.id));

  // ---- 1. dagre: colunas e ordem
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: o.columnGap, nodesep: 30, marginx: 0, marginy: 0, ranker: 'longest-path' });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of core) g.setNode(n.id, sizeOf(n));
  // fluxo que sai de um boundary conta, para ranking, como saída da tarefa hospedeira
  const rankSource = (id: string) => nodeById.get(id)?.kind === 'boundary' ? nodeById.get(id)!.attachedToId! : id;
  for (const f of seqFlows) {
    const src = rankSource(f.sourceId);
    if (g.hasNode(src) && g.hasNode(f.targetId) && src !== f.targetId) g.setEdge(src, f.targetId);
  }
  dagre.layout(g);

  // ---- 2. lanes: mapa nó -> lane (nós sem lane herdam a do vizinho; sem lanes => faixa única virtual)
  const lanes = model.lanes.length ? model.lanes : [{ id: '__single', name: '' }];
  const laneIdx = new Map(lanes.map((l, i) => [l.id, i]));
  const laneOf = new Map<string, number>();
  for (const n of core) if (n.laneId && laneIdx.has(n.laneId)) laneOf.set(n.id, laneIdx.get(n.laneId)!);
  // herança: propaga lane de vizinhos já conhecidos (predecessor primeiro); fallback = lane 0
  for (let pass = 0; pass < core.length; pass++) {
    let changed = false;
    for (const f of seqFlows) {
      for (const [a, b] of [[f.sourceId, f.targetId], [f.targetId, f.sourceId]] as const) {
        if (laneOf.has(a) && !laneOf.has(b) && g.hasNode(b)) { laneOf.set(b, laneOf.get(a)!); changed = true; }
      }
    }
    if (!changed) break;
  }
  for (const n of core) if (!laneOf.has(n.id)) laneOf.set(n.id, 0);

  // colunas: dagre devolve o mesmo x (centro) para todos os nós de uma camada, mas espaça os CENTROS por
  // `ranksep` sem considerar a largura dos nós (observado em @dagrejs/dagre 3.1.1 com rankdir LR) => nós
  // adjacentes se sobrepunham. Por isso usamos o dagre só para saber a CAMADA e recalculamos o x aqui,
  // somando a largura da maior coluna + columnGap.
  const rankX = [...new Set(core.map((n) => Math.round(g.node(n.id).x)))].sort((a, b) => a - b);
  const rankOf = new Map(core.map((n) => [n.id, rankX.indexOf(Math.round(g.node(n.id).x))]));
  const colWidth = rankX.map((_, r) => Math.max(0, ...core.filter((n) => rankOf.get(n.id) === r).map((n) => sizeOf(n).w)));
  const colCenter: number[] = [];
  colWidth.reduce((left, w, r) => { colCenter[r] = left + w / 2; return left + w + o.columnGap; }, o.headerWidth + o.marginX);

  // Agrupa por (lane, camada) preservando a ordem vertical do dagre.
  const stacks = new Map<string, ProcessNode[]>(); // `${lane}|${rank}`
  for (const n of core) {
    const key = `${laneOf.get(n.id)}|${rankOf.get(n.id)}`;
    stacks.set(key, [...(stacks.get(key) ?? []), n]);
  }
  for (const list of stacks.values()) list.sort((a, b) => g.node(a.id).y - g.node(b.id).y || a.id.localeCompare(b.id));

  // satélites ficam junto do nó associado (via associação), em lane desse nó
  const satelliteAnchor = new Map<string, { anchor: ProcessNode; assoc: ProcessFlow }>();
  for (const f of model.flows.filter((x) => x.kind === 'association').sort(byId)) {
    const s = nodeById.get(f.sourceId), t = nodeById.get(f.targetId);
    if (s && t && isSatellite(s) && !isSatellite(t) && !satelliteAnchor.has(s.id)) satelliteAnchor.set(s.id, { anchor: t, assoc: f });
    else if (s && t && isSatellite(t) && !isSatellite(s) && !satelliteAnchor.has(t.id)) satelliteAnchor.set(t.id, { anchor: s, assoc: f });
  }
  const laneHasSatellite = new Set<number>();
  for (const { anchor } of satelliteAnchor.values()) laneHasSatellite.add(laneOf.get(anchor.id) ?? 0);

  // ---- altura de cada lane
  const maxStack = lanes.map((_, i) =>
    Math.max(1, ...[...stacks.entries()].filter(([k]) => k.startsWith(`${i}|`)).map(([, v]) => v.length)));
  const laneH = lanes.map((_, i) => Math.max(maxStack[i]! * o.slotHeight + 40, laneHasSatellite.has(i) ? 190 : 0));
  const laneTop: number[] = [];
  laneH.reduce((acc, h, i) => { laneTop[i] = acc; return acc + h; }, 0);

  // ---- posições
  const centers = new Map<string, { cx: number; cy: number }>();
  for (const [key, list] of stacks) {
    const li = Number(key.split('|')[0]);
    const mid = laneTop[li]! + laneH[li]! / 2;
    list.forEach((n, i) => {
      centers.set(n.id, { cx: colCenter[rankOf.get(n.id)!]!, cy: mid + (i - (list.length - 1) / 2) * o.slotHeight });
    });
  }
  const boundsOf = new Map<string, Bounds>();
  for (const n of core) {
    const c = centers.get(n.id)!, s = sizeOf(n);
    boundsOf.set(n.id, { x: c.cx - s.w / 2, y: c.cy - s.h / 2, w: s.w, h: s.h });
  }
  for (const [sid, { anchor }] of satelliteAnchor) {
    const sat = nodeById.get(sid)!, ab = boundsOf.get(anchor.id)!, s = sizeOf(sat);
    const above = sat.kind === 'annotation';
    const cy = above ? ab.y - 45 : ab.y + ab.h + 45;
    // anotação centrada acima; objeto de dados deslocado p/ a esquerda do nó (evita cobrir o fluxo de saída)
    const cx = above ? ab.x + ab.w / 2 : ab.x + ab.w / 2 - 70;
    boundsOf.set(sid, { x: cx - s.w / 2, y: cy - s.h / 2, w: s.w, h: s.h });
  }
  // boundary: centro na borda inferior da hospedeira, espaçados entre si
  const perHost = new Map<string, ProcessNode[]>();
  for (const b of boundaries) perHost.set(b.attachedToId!, [...(perHost.get(b.attachedToId!) ?? []), b]);
  for (const [hostId, list] of perHost) {
    const hb = boundsOf.get(hostId);
    if (!hb) continue;
    list.forEach((b, i) => {
      const cx = hb.x + hb.w / 2 + (i - (list.length - 1) / 2) * 44;
      boundsOf.set(b.id, { x: cx - 18, y: hb.y + hb.h - 18, w: 36, h: 36 });
    });
  }
  // satélites sem âncora: coluna à esquerda da lane 0 (não deveriam existir; validate acusa associação ausente no futuro)
  let orphanY = 20;
  for (const n of nodes.filter((x) => isSatellite(x) || boundaryIds.has(x.id))) {
    if (boundsOf.has(n.id)) continue;
    const s = sizeOf(n);
    boundsOf.set(n.id, { x: o.headerWidth + 10, y: orphanY, w: s.w, h: s.h });
    orphanY += s.h + 10;
  }

  const allRight = [...boundsOf.values()].map((b) => b.x + b.w);
  const totalW = (allRight.length ? Math.max(...allRight) : o.headerWidth) + o.marginX;
  const lanesH = laneH.reduce((a, b) => a + b, 0);
  // pools externos (caixa-preta): faixas abaixo do pool principal, uma por participante
  const partBounds = new Map<string, Bounds>();
  model.participants.forEach((p, i) => partBounds.set(p.id, { x: 0, y: lanesH + 40 + i * 100, w: totalW, h: 70 }));
  const totalH = lanesH;

  // ---- 3. roteamento ortogonal (reutilizado pelo editor ao mover elementos: ver routeFlows)
  const poolB: Bounds = { x: 0, y: 0, w: totalW, h: totalH };
  return routeFlows({
    ...model,
    pool: model.lanes.length ? poolB : undefined,
    participants: model.participants.map((p) => ({ ...p, bounds: partBounds.get(p.id) })),
    lanes: model.lanes.map((l, i) => ({ ...l, bounds: { x: o.headerWidth, y: laneTop[i]!, w: totalW - o.headerWidth, h: laneH[i]! } })),
    nodes: model.nodes.map((n) => ({ ...n, bounds: boundsOf.get(n.id) })),
  });
}

/**
 * Recalcula os waypoints dos fluxos a partir das bounds atuais do modelo.
 * [2026-10-14] Criado: extraído do layoutModel para o editor religar fluxos ao mover/criar elementos (Fase 2) — Rafael Brito
 * @param only se informado, só os fluxos com esses ids são re-roteados (os demais mantêm waypoints manuais/importados).
 */
export function routeFlows(model: ProcessModel, only?: ReadonlySet<string>): ProcessModel {
  const boundsOf = new Map<string, Bounds>();
  for (const n of model.nodes) if (n.bounds) boundsOf.set(n.id, n.bounds);
  for (const p of model.participants) if (p.bounds) boundsOf.set(p.id, p.bounds);
  if (model.pool) boundsOf.set(model.id, model.pool);
  const kindOf = new Map(model.nodes.map((n) => [n.id, n.kind]));
  const outCount = new Map<string, number>();
  for (const f of model.flows) if (f.kind === 'sequence') outCount.set(f.sourceId, (outCount.get(f.sourceId) ?? 0) + 1);
  const flows = model.flows.map((f): ProcessFlow => {
    if (only && !only.has(f.id)) return f;
    const s = boundsOf.get(f.sourceId), t = boundsOf.get(f.targetId);
    if (!s || !t) return f;
    // rota automática => deixa de ser "manual" (marca removida)
    const { manualRoute: _manual, ...auto } = f;
    if (f.kind === 'message') return { ...auto, waypoints: routeMessage(s, t) };
    if (f.kind === 'association') return { ...auto, waypoints: routeAssociation(s, t) };
    if (kindOf.get(f.sourceId) === 'boundary') return { ...auto, waypoints: routeFromBoundary(s, t) };
    return { ...auto, waypoints: routeSequence(s, t, (outCount.get(f.sourceId) ?? 0) > 1) };
  });
  return { ...model, flows };
}

type Pt = [number, number];
const right = (b: Bounds): Pt => [b.x + b.w, b.y + b.h / 2];
const left = (b: Bounds): Pt => [b.x, b.y + b.h / 2];
const bottom = (b: Bounds): Pt => [b.x + b.w / 2, b.y + b.h];

/** Fluxo de sequência: direita->esquerda; ramifica logo após a origem quando há divisão, senão junto ao destino. */
function routeSequence(s: Bounds, t: Bounds, splits: boolean): Pt[] {
  const [sx, sy] = right(s), [tx, ty] = left(t);
  if (tx > sx + 1) {
    if (Math.abs(sy - ty) < 1) return [[sx, sy], [tx, ty]];
    const midX = splits ? sx + 25 : tx - 25;
    return [[sx, sy], [midX, sy], [midX, ty], [tx, ty]];
  }
  // [2026-10-14] Alterado: alvo logo abaixo/acima (colunas sobrepostas, comum ao editar à mão) sai pela borda inferior/superior — Rafael Brito
  const scx = s.x + s.w / 2, tcx = t.x + t.w / 2;
  if (t.y > s.y + s.h + 4) {
    const my = (s.y + s.h + t.y) / 2;
    return [[scx, s.y + s.h], [scx, my], [tcx, my], [tcx, t.y]];
  }
  if (t.y + t.h < s.y - 4) {
    const my = (t.y + t.h + s.y) / 2;
    return [[scx, s.y], [scx, my], [tcx, my], [tcx, t.y + t.h]];
  }
  // retorno (alvo à esquerda na mesma faixa): contorna por baixo dos dois elementos
  const [bx, by] = bottom(s), [cx, cy] = bottom(t);
  const y = Math.max(by, cy) + 30;
  return [[bx, by], [bx, y], [cx, y], [cx, cy]];
}

/** Mensagem entre pools: vertical entre as bordas, alinhada ao centro horizontal do menor elemento. */
function routeMessage(s: Bounds, t: Bounds): Pt[] {
  const sc = s.x + s.w / 2, tc = t.x + t.w / 2;
  const x = s.w <= t.w ? sc : tc;
  const down = t.y > s.y;
  const sx = Math.min(Math.max(x, s.x + 4), s.x + s.w - 4), tx = Math.min(Math.max(x, t.x + 4), t.x + t.w - 4);
  return down ? [[sx, s.y + s.h], [tx, t.y]] : [[sx, s.y], [tx, t.y + t.h]];
}

/** Saída de um boundary event: desce da borda inferior e entra no alvo pela esquerda. */
function routeFromBoundary(s: Bounds, t: Bounds): Pt[] {
  const [bx, by] = bottom(s), [tx, ty] = left(t);
  if (ty > by + 10) return [[bx, by], [bx, ty], [tx, ty]];
  const y = by + 25;
  return [[bx, by], [bx, y], [tx - 25, y], [tx - 25, ty], [tx, ty]];
}

/** Associação (tracejada): reta vertical ou horizontal entre as bordas mais próximas. */
function routeAssociation(s: Bounds, t: Bounds): Pt[] {
  const sc: Pt = [s.x + s.w / 2, s.y + s.h / 2], tc: Pt = [t.x + t.w / 2, t.y + t.h / 2];
  const dx = tc[0] - sc[0], dy = tc[1] - sc[1];
  if (Math.abs(dy) >= Math.abs(dx)) {
    // vertical: alinha x ao do menor elemento para a reta ficar ortogonal
    const x = Math.abs(dx) < 1 ? sc[0] : Math.min(Math.max(sc[0], t.x + 8), t.x + t.w - 8);
    return dy > 0 ? [[x, s.y + s.h], [x, t.y]] : [[x, s.y], [x, t.y + t.h]];
  }
  const y = Math.min(Math.max(sc[1], t.y + 8), t.y + t.h - 8);
  return dx > 0 ? [[s.x + s.w, y], [t.x, y]] : [[s.x, y], [t.x + t.w, y]];
}
