/**
 * Operações de edição PURAS sobre o ProcessModel (imutáveis: recebem um modelo, devolvem outro).
 *
 * [2026-10-14] Criado: Fase 2 — núcleo do editor visual — Rafael Brito
 * Decisões:
 * - Ficam no core (não no editor React) para serem testáveis sem DOM e reutilizáveis por quem não tem UI:
 *   a geração por IA (Fase 5) e o adaptador Ancoro (Fase 4) editam modelos pelas mesmas regras.
 * - Todas as operações mantêm o modelo consistente (lane do nó, contêineres, waypoints dos fluxos):
 *   o editor não precisa "consertar" nada depois.
 * - Regras de conexão (canConnect) vivem aqui: a UI só pergunta "pode?" e mostra o motivo.
 * - Grade de 10px (snap) é política do editor; as operações aceitam qualquer coordenada.
 *
 * TODO [ESTIGMERGIA]: waypoints manuais
 * - Fluxos são sempre auto-roteados quando um extremo se move. Waypoints editados à mão (ou importados) ficam
 *   intactos até um extremo mudar; depois são recalculados. Próximo passo: flag `manualRoute` no ProcessFlow.
 * TODO [ESTIGMERGIA]: kind-change e reordenar lanes
 * - Trocar kind (tarefa -> subprocesso) e reordenar lanes não existem; hoje: apagar e recriar.
 */
import { AttributeDefSchema, NodeSchema, parseModel, type AttributeDef, type AttrValue, type Bounds, type ProcessFlow, type ProcessLane, type ProcessModel, type ProcessNode, type NodeKind } from './model.js';
import { coerceAttrValue, isEmptyAttrValue } from './attributes.js';
import { routeFlows, sizeOf } from './layout.js';

export type Point = { x: number; y: number };

export const GRID = 10;
export const snap = (v: number, g = GRID): number => Math.round(v / g) * g;

const SATELLITES: ReadonlySet<NodeKind> = new Set(['dataObject', 'dataStore', 'annotation']);
export const isSatellite = (k: NodeKind): boolean => SATELLITES.has(k);
const HEADER = 36; // cabeçalho do pool (mesmo do layout/spike)
const LANE_MIN_H = 80;
const MARGIN_X = 60;

// ---------------------------------------------------------------- ids

/** Próximo id livre `prefix_N` considerando TODOS os ids do modelo (nós, fluxos, lanes, participantes, o próprio processo). */
export function nextId(m: ProcessModel, prefix: string): string {
  const used = new Set<string>([m.id, ...m.nodes.map((n) => n.id), ...m.flows.map((f) => f.id), ...m.lanes.map((l) => l.id), ...m.participants.map((p) => p.id), ...m.attributeDefs.map((d) => d.id)]);
  for (let i = 1; ; i++) if (!used.has(`${prefix}_${i}`)) return `${prefix}_${i}`;
}

const idPrefix = (k: NodeKind, v?: string): string => {
  if (k === 'task') return 'Task';
  if (k === 'gateway') return 'Gateway';
  if (k === 'subprocess') return 'Sub';
  if (k === 'start') return 'Start';
  if (k === 'end') return 'End';
  if (k === 'intermediate') return v === 'link' ? 'Link' : 'Event';
  if (k === 'boundary') return 'Boundary';
  if (k === 'dataObject') return 'Data';
  if (k === 'dataStore') return 'Store';
  return 'Note';
};

// ---------------------------------------------------------------- consultas

const center = (b: Bounds): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const nodeOf = (m: ProcessModel, id: string): ProcessNode | undefined => m.nodes.find((n) => n.id === id);

/** Lane cuja faixa vertical contém y; se nenhuma (ex.: fora do pool), a mais próxima. */
export function laneAtY(m: ProcessModel, y: number): ProcessLane | undefined {
  const withB = m.lanes.filter((l) => l.bounds);
  const hit = withB.find((l) => y >= l.bounds!.y && y < l.bounds!.y + l.bounds!.h);
  if (hit) return hit;
  return [...withB].sort((a, b) => dist(a, y) - dist(b, y))[0];
}
const dist = (l: ProcessLane, y: number) => Math.min(Math.abs(y - l.bounds!.y), Math.abs(y - (l.bounds!.y + l.bounds!.h)));

/** Elemento "alvo de clique" sob o ponto (ignora lanes/pools): nó com bounds contendo o ponto, o de cima vence. */
export function nodeAt(m: ProcessModel, p: Point): ProcessNode | undefined {
  return [...m.nodes].reverse().find((n) => n.bounds && p.x >= n.bounds.x && p.x <= n.bounds.x + n.bounds.w && p.y >= n.bounds.y && p.y <= n.bounds.y + n.bounds.h);
}

// ---------------------------------------------------------------- contêineres

/** Garante que lanes/pool cobrem horizontalmente todo o conteúdo (nós e boundaries). Vertical é por lane (resizeLane). */
export function fitContainers(m: ProcessModel): ProcessModel {
  if (!m.lanes.length) return m;
  const right = Math.max(0, ...m.nodes.map((n) => (n.bounds ? n.bounds.x + n.bounds.w : 0))) + MARGIN_X;
  const laneRight = Math.max(...m.lanes.map((l) => (l.bounds ? l.bounds.x + l.bounds.w : 0)));
  if (right <= laneRight) return m;
  const grow = right - laneRight;
  return {
    ...m,
    lanes: m.lanes.map((l) => (l.bounds ? { ...l, bounds: { ...l.bounds, w: l.bounds.w + grow } } : l)),
    pool: m.pool ? { ...m.pool, w: m.pool.w + grow } : m.pool,
    participants: m.participants.map((p) => (p.bounds ? { ...p, bounds: { ...p.bounds, w: p.bounds.w + grow } } : p)),
  };
}

// ---------------------------------------------------------------- adicionar nós

export interface AddNodeSpec {
  kind: NodeKind;
  variant?: string;
  name?: string;
  /** centro desejado do elemento (coordenadas do modelo). Ignorado para boundary (vai para a borda da hospedeira). */
  at: Point;
  /** obrigatório para boundary */
  attachedToId?: string;
  throw?: boolean;
}

const defaultVariant = (k: NodeKind): string | undefined =>
  k === 'task' ? 'generic' : k === 'gateway' ? 'exclusive' : ['start', 'end', 'intermediate', 'boundary'].includes(k) ? 'none' : undefined;

export function addNode(m: ProcessModel, spec: AddNodeSpec): { model: ProcessModel; id: string } {
  const id = nextId(m, idPrefix(spec.kind, spec.variant));
  const base = { id, kind: spec.kind, name: spec.name ?? '', requirementRefs: [] as string[], cancelActivity: true, throw: spec.throw ?? false };
  const variant = spec.variant ?? defaultVariant(spec.kind);
  const size = sizeOf({ kind: spec.kind } as ProcessNode);

  let bounds: Bounds;
  let extra: Partial<ProcessNode> = {};
  if (spec.kind === 'boundary') {
    const host = spec.attachedToId ? nodeOf(m, spec.attachedToId) : undefined;
    if (!host?.bounds || (host.kind !== 'task' && host.kind !== 'subprocess')) throw new Error('boundary precisa estar anexado a uma tarefa ou subprocesso');
    const siblings = m.nodes.filter((n) => n.kind === 'boundary' && n.attachedToId === host.id).length;
    // espaçados ao longo da borda inferior, a partir do canto esquerdo
    const cx = Math.min(host.bounds.x + 22 + siblings * 44, host.bounds.x + host.bounds.w - 22);
    bounds = { x: cx - size.w / 2, y: host.bounds.y + host.bounds.h - size.h / 2, w: size.w, h: size.h };
    extra = { attachedToId: host.id, ...(host.laneId && { laneId: host.laneId }) };
  } else {
    bounds = { x: snap(spec.at.x - size.w / 2), y: snap(spec.at.y - size.h / 2), w: size.w, h: size.h };
    if (m.lanes.length && !isSatellite(spec.kind)) {
      const lane = laneAtY(m, bounds.y + size.h / 2);
      if (lane) extra = { laneId: lane.id };
    }
  }
  // [2026-10-14] Alterado: passa pelo schema para receber TODOS os defaults (attributes, loop, listas...). Montar o objeto à mão
  // deixava campos novos `undefined` e quebrava o painel ("attributes is not iterable") — Rafael Brito
  const node: ProcessNode = NodeSchema.parse({ ...base, ...(variant && { variant }), bounds, ...extra });
  const next = fitContainers({ ...m, nodes: [...m.nodes, node] });
  return { model: next, id };
}

/** Participante externo (pool caixa-preta) abaixo do desenho atual. */
export function addParticipant(m: ProcessModel, name = ''): { model: ProcessModel; id: string } {
  const id = nextId(m, 'Ext');
  const all = [m.pool, ...m.lanes.map((l) => l.bounds), ...m.participants.map((p) => p.bounds), ...m.nodes.map((n) => n.bounds)].filter((b): b is Bounds => !!b);
  const bottom = all.length ? Math.max(...all.map((b) => b.y + b.h)) : 0;
  const left = m.pool?.x ?? (all.length ? Math.min(...all.map((b) => b.x)) : 0);
  const width = m.pool?.w ?? Math.max(400, ...all.map((b) => b.x + b.w - left));
  const p = { id, name, bounds: { x: left, y: snap(bottom + 40), w: width, h: 70 } };
  return { model: { ...m, participants: [...m.participants, p] }, id };
}

// ---------------------------------------------------------------- mover

/** Dados necessários para mover: ids de nós; boundaries anexados acompanham a hospedeira. */
export function moveNodes(m: ProcessModel, ids: ReadonlyArray<string>, dx: number, dy: number): ProcessModel {
  if (!dx && !dy) return m;
  const moving = new Set(ids);
  for (const n of m.nodes) if (n.kind === 'boundary' && n.attachedToId && moving.has(n.attachedToId)) moving.add(n.id);
  // boundary só se move junto com a hospedeira (nunca sozinho)
  for (const id of ids) if (nodeOf(m, id)?.kind === 'boundary' && !moving.has(nodeOf(m, id)!.attachedToId ?? '')) moving.delete(id);

  let nodes = m.nodes.map((n) => (moving.has(n.id) && n.bounds ? { ...n, bounds: { ...n.bounds, x: n.bounds.x + dx, y: n.bounds.y + dy } } : n));
  // lane acompanha a posição do centro (só nós de fluxo)
  if (m.lanes.length) {
    nodes = nodes.map((n) => {
      if (!moving.has(n.id) || !n.bounds || isSatellite(n.kind)) return n;
      const lane = laneAtY({ ...m, nodes }, center(n.bounds).y);
      return lane && lane.id !== n.laneId ? { ...n, laneId: lane.id } : n;
    });
  }
  const moved = new Map<string, { dx: number; dy: number }>([...moving].map((id) => [id, { dx, dy }]));
  return reflow(fitContainers({ ...m, nodes }), moved);
}

// ---------------------------------------------------------------- redimensionar / alinhar

/** Tamanho mínimo por tipo; kinds ausentes (eventos, gateways, boundary) têm forma fixa e não são redimensionáveis. */
const MIN_SIZE: Partial<Record<NodeKind, { w: number; h: number }>> = {
  task: { w: 60, h: 40 }, subprocess: { w: 80, h: 50 }, annotation: { w: 60, h: 24 }, dataObject: { w: 20, h: 24 }, dataStore: { w: 30, h: 30 },
};
const PARTICIPANT_MIN = { w: 80, h: 40 };

/** Este id (nó ou participante externo) aceita redimensionar? */
export function isResizable(m: ProcessModel, id: string): boolean {
  const n = nodeOf(m, id);
  return n ? !!MIN_SIZE[n.kind] && !!n.bounds : m.participants.some((p) => p.id === id && p.bounds);
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Novos bounds ao arrastar a alça `handle` por (dx,dy): a borda oposta fica fixa e o tamanho respeita o mínimo. */
export function resizedBounds(b: Bounds, handle: ResizeHandle, dx: number, dy: number, min: { w: number; h: number }): Bounds {
  let { x, y, w, h } = b;
  if (handle.includes('e')) w = Math.max(min.w, b.w + dx);
  if (handle.includes('s')) h = Math.max(min.h, b.h + dy);
  if (handle.includes('w')) { w = Math.max(min.w, b.w - dx); x = b.x + b.w - w; }
  if (handle.includes('n')) { h = Math.max(min.h, b.h - dy); y = b.y + b.h - h; }
  return { x, y, w, h };
}

/** Tamanho mínimo do elemento (undefined = forma fixa, não redimensionável). */
export function minSizeOf(m: ProcessModel, id: string): { w: number; h: number } | undefined {
  const n = nodeOf(m, id);
  return n ? MIN_SIZE[n.kind] : m.participants.some((p) => p.id === id) ? PARTICIPANT_MIN : undefined;
}

/**
 * [2026-10-15] Criado: redimensiona um elemento para QUALQUER lado (alça + deslocamento, sempre sobre o modelo-base do arrasto) — Rafael Brito
 * - Sem grade: o tamanho é livre (o editor oferece guias de alinhamento).
 * - Boundary events presos à tarefa mantêm a posição RELATIVA na borda (proporcional ao novo tamanho).
 * - Fluxos ligados voltam ao traçado automático: um traçado manual não faz mais sentido quando a borda mudou de lugar.
 */
export function resizeNode(m: ProcessModel, id: string, handle: ResizeHandle, dx: number, dy: number): ProcessModel {
  const node = nodeOf(m, id);
  const part = node ? undefined : m.participants.find((p) => p.id === id);
  const old = node?.bounds ?? part?.bounds;
  const min = minSizeOf(m, id);
  if (!old || !min) return m;
  const nb = resizedBounds(old, handle, dx, dy, min);
  const moved = new Set<string>([id]);
  const nodes = m.nodes.map((n) => {
    if (n.id === id) return { ...n, bounds: nb };
    if (n.kind === 'boundary' && n.attachedToId === id && n.bounds) {
      const c = center(n.bounds);
      const fx = (c.x - old.x) / old.w, fy = (c.y - old.y) / old.h;
      moved.add(n.id);
      return { ...n, bounds: { ...n.bounds, x: nb.x + fx * nb.w - n.bounds.w / 2, y: nb.y + fy * nb.h - n.bounds.h / 2 } };
    }
    return n;
  });
  const participants = part ? m.participants.map((p) => (p.id === id ? { ...p, bounds: nb } : p)) : m.participants;
  const flows = m.flows.map((f) => (moved.has(f.sourceId) || moved.has(f.targetId) ? { ...f, manualRoute: undefined } : f));
  return reflow(fitContainers({ ...m, nodes, participants, flows }), new Map([...moved].map((i) => [i, { dx: 0, dy: 0 }])));
}

export interface AlignGuide { axis: 'x' | 'y'; pos: number; from: number; to: number }

/**
 * [2026-10-15] Criado: movimento livre com "ímã" de alinhamento — Rafael Brito
 * Dado o deslocamento bruto (dx,dy) do elemento `id`, encosta suas bordas/centro nas bordas/centros dos outros elementos quando
 * a distância é <= `threshold`. Objetivo: deixar as conexões retas (centro com centro) sem forçar uma grade.
 * Devolve o deslocamento ajustado e as guias a desenhar.
 */
export function alignMove(m: ProcessModel, id: string, dx: number, dy: number, threshold: number): { dx: number; dy: number; guides: AlignGuide[] } {
  const me = nodeOf(m, id)?.bounds;
  if (!me) return { dx, dy, guides: [] };
  const others = m.nodes.filter((n) => n.id !== id && n.bounds && n.attachedToId !== id && n.kind !== 'boundary').map((n) => n.bounds!);
  const box = { x: me.x + dx, y: me.y + dy, w: me.w, h: me.h };
  const pick = (mine: number[], theirs: number[]) => {
    let best: { d: number; at: number } | null = null;
    for (const a of mine) for (const b of theirs) {
      const d = b - a;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: b };
    }
    return best;
  };
  const xs = (b: Bounds) => [b.x, b.x + b.w / 2, b.x + b.w], ys = (b: Bounds) => [b.y, b.y + b.h / 2, b.y + b.h];
  const bx = pick(xs(box), others.flatMap(xs)), by = pick(ys(box), others.flatMap(ys));
  const adj = { dx: dx + (bx?.d ?? 0), dy: dy + (by?.d ?? 0) };
  const fin = { x: me.x + adj.dx, y: me.y + adj.dy, w: me.w, h: me.h };
  const guides: AlignGuide[] = [];
  const near = 0.5;
  if (bx) {
    const hit = others.filter((o) => xs(o).some((v) => Math.abs(v - bx.at) < near));
    const ys2 = [fin.y, fin.y + fin.h, ...hit.flatMap((o) => [o.y, o.y + o.h])];
    guides.push({ axis: 'x', pos: bx.at, from: Math.min(...ys2) - 10, to: Math.max(...ys2) + 10 });
  }
  if (by) {
    const hit = others.filter((o) => ys(o).some((v) => Math.abs(v - by.at) < near));
    const xs2 = [fin.x, fin.x + fin.w, ...hit.flatMap((o) => [o.x, o.x + o.w])];
    guides.push({ axis: 'y', pos: by.at, from: Math.min(...xs2) - 10, to: Math.max(...xs2) + 10 });
  }
  return { ...adj, guides };
}

const touchingFlows = (m: ProcessModel, ids: ReadonlySet<string>): Set<string> =>
  new Set(m.flows.filter((f) => ids.has(f.sourceId) || ids.has(f.targetId)).map((f) => f.id));

// ---------------------------------------------------------------- conectar

export type ConnectKind = ProcessFlow['kind'];

/** Tipo de fluxo implícito pelos extremos (a UI não pede ao usuário). */
export function inferConnectKind(m: ProcessModel, sourceId: string, targetId: string): ConnectKind {
  const isPool = (id: string) => id === m.id || m.participants.some((p) => p.id === id);
  if (isPool(sourceId) || isPool(targetId)) return 'message';
  const s = nodeOf(m, sourceId), t = nodeOf(m, targetId);
  if ((s && isSatellite(s.kind)) || (t && isSatellite(t.kind))) return 'association';
  return 'sequence';
}

/** Retorna o motivo da recusa (chave estável p/ i18n) ou null se a conexão é válida. */
export function canConnect(m: ProcessModel, sourceId: string, targetId: string, kind?: ConnectKind): string | null {
  if (sourceId === targetId) return 'self';
  const k = kind ?? inferConnectKind(m, sourceId, targetId);
  const isPool = (id: string) => id === m.id || m.participants.some((p) => p.id === id);
  const s = nodeOf(m, sourceId), t = nodeOf(m, targetId);
  if (!s && !isPool(sourceId)) return 'unknown';
  if (!t && !isPool(targetId)) return 'unknown';
  if (m.flows.some((f) => f.kind === k && f.sourceId === sourceId && f.targetId === targetId)) return 'duplicate';
  if (k === 'sequence') {
    if (!s || !t || isSatellite(s.kind) || isSatellite(t.kind)) return 'sequence-needs-flow-nodes';
    if (s.kind === 'end') return 'end-no-outgoing';
    if (t.kind === 'start' || t.kind === 'boundary') return 'start-no-incoming';
    if (s.kind === 'boundary' && m.flows.some((f) => f.kind === 'sequence' && f.sourceId === s.id)) return 'boundary-single-outgoing';
  } else if (k === 'association') {
    if (!((s && isSatellite(s.kind)) || (t && isSatellite(t.kind)))) return 'association-needs-satellite';
  } else if (k === 'message') {
    // mensagem cruza pools: dois nós do mesmo processo não trocam mensagem. [2026-10-14] pool->pool É válido (corpus BIIN tem) — Rafael Brito
    if (s && t) return 'message-same-pool';
    if ((s && isSatellite(s.kind)) || (t && isSatellite(t.kind))) return 'message-needs-flow-nodes';
  }
  return null;
}

export function addFlow(m: ProcessModel, spec: { sourceId: string; targetId: string; kind?: ConnectKind; name?: string }): { model: ProcessModel; id: string } {
  const kind = spec.kind ?? inferConnectKind(m, spec.sourceId, spec.targetId);
  const why = canConnect(m, spec.sourceId, spec.targetId, kind);
  if (why) throw new Error(`conexão inválida: ${why}`);
  const id = nextId(m, kind === 'sequence' ? 'Flow' : kind === 'message' ? 'Msg' : 'Assoc');
  const flow: ProcessFlow = { id, kind, sourceId: spec.sourceId, targetId: spec.targetId, isDefault: false, ...(spec.name && { name: spec.name }) };
  return { model: routeFlows({ ...m, flows: [...m.flows, flow] }, new Set([id])), id };
}

// [2026-10-27] Criado: "adicionar a partir de" — cria um nó já conectado a um elemento existente do canvas
// (equivalente ao context pad do bpmn.io/Bizagi) — Rafael Brito
// Decisões:
// - Atômico e puro: nó + fluxo saem juntos ou nada muda (lança se a conexão for inválida), então desfazer é um passo só.
// - Nós de fluxo entram à DIREITA do origem (mesmo eixo => linha reta); satélites (dados/anotação) entram ABAIXO.
// - Se o ponto candidato colide com outro nó, desce em passos até achar vaga (não sobrepõe o desenho existente).
export function addNodeAfter(m: ProcessModel, sourceId: string, spec: Omit<AddNodeSpec, 'at' | 'attachedToId'>): { model: ProcessModel; id: string; flowId: string } {
  const src = nodeOf(m, sourceId);
  if (!src?.bounds) throw new Error('origem sem geometria');
  if (spec.kind === 'boundary') throw new Error('boundary só pode ser criado sobre uma tarefa ou subprocesso');
  const size = sizeOf({ kind: spec.kind } as ProcessNode);
  const sat = isSatellite(spec.kind);
  const GAP = 60;
  const sb = src.bounds;
  let at: Point = sat
    ? { x: sb.x + sb.w / 2, y: sb.y + sb.h + GAP / 2 + size.h / 2 }
    : { x: sb.x + sb.w + GAP + size.w / 2, y: sb.y + sb.h / 2 };
  const collides = (p: Point) => m.nodes.some((n) => n.bounds && n.kind !== 'boundary'
    && p.x - size.w / 2 < n.bounds.x + n.bounds.w + 10 && p.x + size.w / 2 > n.bounds.x - 10
    && p.y - size.h / 2 < n.bounds.y + n.bounds.h + 10 && p.y + size.h / 2 > n.bounds.y - 10);
  for (let i = 0; i < 12 && collides(at); i++) at = { x: at.x, y: at.y + size.h + 30 };

  const added = addNode(m, { ...spec, at });
  const flow = addFlow(added.model, { sourceId, targetId: added.id });
  return { model: flow.model, id: added.id, flowId: flow.id };
}

/** Motivo (chave de i18n do canConnect) pelo qual `kind` não pode ser adicionado após `sourceId`; null se pode. */
export function whyCannotAddAfter(m: ProcessModel, sourceId: string, kind: NodeKind): string | null {
  const src = nodeOf(m, sourceId);
  if (!src?.bounds) return 'unknown';
  if (kind === 'boundary') return 'boundary-needs-host';
  try {
    const added = addNode(m, { kind, at: { x: 0, y: 0 } });
    return canConnect(added.model, sourceId, added.id);
  } catch {
    return 'invalid';
  }
}

// ---------------------------------------------------------------- remover

/** Remove elementos (nós, fluxos, lanes, participantes) e tudo que depende deles. */
export function deleteElements(m: ProcessModel, ids: ReadonlyArray<string>): ProcessModel {
  let cur = m;
  // lanes primeiro (mudam geometria e removem nós contidos)
  for (const id of ids) if (cur.lanes.some((l) => l.id === id)) cur = removeLane(cur, id);
  const del = new Set(ids);
  for (const n of cur.nodes) if (n.kind === 'boundary' && n.attachedToId && del.has(n.attachedToId)) del.add(n.id);
  const nodes = cur.nodes.filter((n) => !del.has(n.id));
  const participants = cur.participants.filter((p) => !del.has(p.id));
  const gone = new Set([...del, ...cur.nodes.filter((n) => !nodes.includes(n)).map((n) => n.id), ...cur.participants.filter((p) => !participants.includes(p)).map((p) => p.id)]);
  const flows = cur.flows.filter((f) => !del.has(f.id) && !gone.has(f.sourceId) && !gone.has(f.targetId));
  return { ...cur, nodes, participants, flows };
}

// ---------------------------------------------------------------- lanes

export function addLane(m: ProcessModel, name = '', height = 160): { model: ProcessModel; id: string } {
  const id = nextId(m, 'Lane');
  const withB = m.lanes.filter((l) => l.bounds);
  if (withB.length) {
    const last = withB[withB.length - 1]!.bounds!;
    const lane: ProcessLane = { id, name, bounds: { x: last.x, y: last.y + last.h, w: last.w, h: height } };
    // participantes ficam abaixo do pool: empurra pelo mesmo delta
    const shifted = shiftBelow({ ...m, lanes: [...m.lanes, lane] }, last.y + last.h - 0.5, height, id);
    return { model: { ...shifted, pool: m.pool ? { ...m.pool, h: m.pool.h + height } : m.pool }, id };
  }
  // primeira lane: cria pool + lane cobrindo todo o conteúdo existente (que passa a pertencer a ela)
  const boxes = m.nodes.map((n) => n.bounds).filter((b): b is Bounds => !!b);
  const minX = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0;
  const maxX = boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) : 600;
  const minY = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const maxY = boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) : height;
  const poolX = minX - MARGIN_X - HEADER, laneY = minY - 40;
  const laneH = Math.max(height, maxY + 40 - laneY);
  const lane: ProcessLane = { id, name, bounds: { x: poolX + HEADER, y: laneY, w: maxX + MARGIN_X - (poolX + HEADER), h: laneH } };
  const nodes = m.nodes.map((n) => (isSatellite(n.kind) ? n : { ...n, laneId: id }));
  return { model: { ...m, nodes, lanes: [lane], pool: { x: poolX, y: laneY, w: maxX + MARGIN_X - poolX, h: laneH } }, id };
}

/** Empurra para baixo (delta) tudo que está abaixo de `y`: lanes seguintes, nós, participantes. `skipLane` não é empurrada. */
function shiftBelow(m: ProcessModel, y: number, delta: number, skipLane?: string): ProcessModel {
  const below = (b?: Bounds) => !!b && b.y + b.h / 2 > y;
  const mv = (b: Bounds): Bounds => ({ ...b, y: b.y + delta });
  const moved = new Set<string>();
  const next: ProcessModel = {
    ...m,
    lanes: m.lanes.map((l) => (l.id !== skipLane && below(l.bounds) ? { ...l, bounds: mv(l.bounds!) } : l)),
    nodes: m.nodes.map((n) => (below(n.bounds) ? (moved.add(n.id), { ...n, bounds: mv(n.bounds!) }) : n)),
    participants: m.participants.map((p) => (below(p.bounds) ? (moved.add(p.id), { ...p, bounds: mv(p.bounds!) }) : p)),
  };
  // só religa os fluxos que tocam algo que andou; os demais mantêm waypoints (inclusive importados e manuais)
  return reflow(next, new Map([...moved].map((id) => [id, { dx: 0, dy: delta }])));
}

/** Muda a altura de uma lane; tudo que está abaixo desce/sobe junto, e o pool acompanha. */
export function resizeLane(m: ProcessModel, laneId: string, newHeight: number): ProcessModel {
  const lane = m.lanes.find((l) => l.id === laneId);
  if (!lane?.bounds) return m;
  const h = Math.max(LANE_MIN_H, snap(newHeight));
  const delta = h - lane.bounds.h;
  if (!delta) return m;
  const bottom = lane.bounds.y + lane.bounds.h;
  const resized: ProcessModel = { ...m, lanes: m.lanes.map((l) => (l.id === laneId ? { ...l, bounds: { ...l.bounds!, h } } : l)) };
  const shifted = shiftBelow(resized, bottom - 0.5, delta, laneId);
  return { ...shifted, pool: m.pool ? { ...m.pool, h: m.pool.h + delta } : m.pool };
}

// [2026-10-27] Criado: redimensionar o POOL por qualquer lado/canto — Rafael Brito
// Decisões:
// - Os nós NÃO se mexem: o pool cresce/encolhe ao redor deles e nunca corta conteúdo (cada lado tem um limite = conteúdo + folga).
// - Leste/oeste: pool, lanes e participantes externos mudam x/largura juntos (todos têm a largura do pool).
// - Norte: a primeira lane cresce para cima. Sul: a última lane cresce para baixo (resizeLane empurra participantes).
// - Fluxos ligados ao pool/participantes são re-roteados (a borda deles mudou de lugar).
export function resizePool(m: ProcessModel, handle: ResizeHandle, dx: number, dy: number): ProcessModel {
  const pool = m.pool;
  const lanes = m.lanes.filter((l) => l.bounds);
  if (!pool || !lanes.length || (!dx && !dy)) return m;
  const MIN_W = 200, PAD = 20;
  let out = m;

  if (handle.includes('e') || handle.includes('w')) {
    const boxes = m.nodes.map((n) => n.bounds).filter((b): b is Bounds => !!b);
    const right0 = pool.x + pool.w;
    let left = pool.x, right = right0;
    if (handle.includes('e')) {
      const floor = Math.min(right0, Math.max(pool.x + HEADER + MIN_W, boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) + PAD : 0));
      right = Math.max(floor, right0 + dx);
    }
    if (handle.includes('w')) {
      const limit = Math.min(right - HEADER - MIN_W, boxes.length ? Math.min(...boxes.map((b) => b.x)) - PAD - HEADER : Infinity);
      left = Math.min(Math.max(pool.x, limit), pool.x + dx);
    }
    const w = right - left;
    out = {
      ...out,
      pool: { ...pool, x: left, w },
      lanes: out.lanes.map((l) => (l.bounds ? { ...l, bounds: { ...l.bounds, x: left + HEADER, w: w - HEADER } } : l)),
      participants: out.participants.map((p) => (p.bounds ? { ...p, bounds: { ...p.bounds, x: left, w } } : p)),
    };
  }

  const inBand = (l: ProcessLane) => out.nodes.filter((n) => n.bounds && center(n.bounds).y >= l.bounds!.y && center(n.bounds).y < l.bounds!.y + l.bounds!.h);
  if (handle.includes('n')) {
    const first = out.lanes.filter((l) => l.bounds)[0]!;
    const fb = first.bounds!;
    const tops = inBand(first).map((n) => n.bounds!.y);
    const limit = Math.min(fb.y + fb.h - LANE_MIN_H, tops.length ? Math.min(...tops) - PAD : Infinity);
    const top = Math.min(Math.max(fb.y, limit), fb.y + dy);
    if (top !== fb.y) {
      const grow = fb.y - top;
      out = {
        ...out,
        lanes: out.lanes.map((l) => (l.id === first.id ? { ...l, bounds: { ...fb, y: top, h: fb.h + grow } } : l)),
        pool: { ...out.pool!, y: out.pool!.y - grow, h: out.pool!.h + grow },
      };
    }
  }
  if (handle.includes('s')) {
    const last = [...out.lanes].reverse().find((l) => l.bounds)!;
    const lb = last.bounds!;
    const bottoms = inBand(last).map((n) => n.bounds!.y + n.bounds!.h);
    const floor = Math.min(lb.h, Math.max(LANE_MIN_H, bottoms.length ? Math.max(...bottoms) + PAD - lb.y : 0));
    out = resizeLane(out, last.id, Math.max(floor, lb.h + dy));
  }

  const ext = new Set([m.id, ...m.participants.map((p) => p.id)]);
  const touched = out.flows.filter((f) => ext.has(f.sourceId) || ext.has(f.targetId)).map((f) => f.id);
  return touched.length ? routeFlows(out, new Set(touched)) : out;
}

/** Remove a lane E os nós dentro dela; fecha o vão (o que estava abaixo sobe). */
export function removeLane(m: ProcessModel, laneId: string): ProcessModel {
  const lane = m.lanes.find((l) => l.id === laneId);
  if (!lane) return m;
  const inLane = new Set(m.nodes.filter((n) => n.laneId === laneId).map((n) => n.id));
  for (const n of m.nodes) if (n.kind === 'boundary' && n.attachedToId && inLane.has(n.attachedToId)) inLane.add(n.id);
  // satélites (sem laneId) cujo centro cai na faixa da lane também saem
  if (lane.bounds) for (const n of m.nodes) if (isSatellite(n.kind) && n.bounds && center(n.bounds).y >= lane.bounds.y && center(n.bounds).y < lane.bounds.y + lane.bounds.h) inLane.add(n.id);
  const nodes = m.nodes.filter((n) => !inLane.has(n.id));
  const flows = m.flows.filter((f) => !inLane.has(f.sourceId) && !inLane.has(f.targetId));
  const lanes = m.lanes.filter((l) => l.id !== laneId);
  let out: ProcessModel = { ...m, nodes, flows, lanes };
  if (lane.bounds) {
    out = shiftBelow(out, lane.bounds.y + lane.bounds.h - 0.5, -lane.bounds.h);
    out = { ...out, pool: m.pool ? { ...m.pool, h: m.pool.h - lane.bounds.h } : m.pool };
  }
  if (!lanes.length) out = { ...out, pool: undefined }; // sem lanes, o pool deixa de existir (volta a ser só <process>)
  return out;
}

// ---------------------------------------------------------------- propriedades

// [2026-10-14] Alterado: + propriedades completas (descrição, loop, duração, custo, prioridade, RACI, sistemas, dados, regras, atributos, cores) — Rafael Brito
const NODE_PATCHABLE = [
  'name', 'variant', 'documentation', 'performer', 'sla', 'sapTransaction', 'requirementRefs', 'source', 'cancelActivity', 'throw', 'calledProcessId',
  'description', 'url', 'loop', 'duration', 'cost', 'priority', 'accountable', 'consulted', 'informed', 'systems', 'inputs', 'outputs', 'rules', 'attributes', 'fill', 'stroke',
] as const;
export type NodePatch = Partial<Pick<ProcessNode, (typeof NODE_PATCHABLE)[number]>>;

/** Edita propriedades do nó. Strings vazias removem o campo opcional. Revalida pelo schema (variant x kind etc.). */
export function updateNode(m: ProcessModel, id: string, patch: NodePatch): ProcessModel {
  const n = nodeOf(m, id);
  if (!n) throw new Error(`nó '${id}' não existe`);
  const merged: Record<string, unknown> = { ...n };
  for (const key of Object.keys(patch) as Array<keyof NodePatch>) {
    if (!(NODE_PATCHABLE as readonly string[]).includes(key)) throw new Error(`propriedade '${key}' não editável`);
    const v = patch[key];
    if (v === '' || v === undefined) delete merged[key];
    else merged[key] = v;
  }
  if (merged.name === undefined) merged.name = '';
  const validated = parseModel({ ...m, nodes: m.nodes.map((x) => (x.id === id ? merged : x)) });
  return { ...m, nodes: validated.nodes };
}

/** Move o nó para a lane indicada (centro vertical da lane, mantendo x), preservando a grade. */
export function setNodeLane(m: ProcessModel, id: string, laneId: string): ProcessModel {
  const n = nodeOf(m, id), lane = m.lanes.find((l) => l.id === laneId);
  if (!n?.bounds || !lane?.bounds || n.laneId === laneId) return m;
  const dy = snap(lane.bounds.y + lane.bounds.h / 2 - (n.bounds.y + n.bounds.h / 2));
  return moveNodes(m, [id], 0, dy);
}

export type FlowPatch = Partial<Pick<ProcessFlow, 'name' | 'isDefault' | 'condition' | 'description' | 'documentation' | 'probability'>>;

export function updateFlow(m: ProcessModel, id: string, patch: FlowPatch): ProcessModel {
  const f = m.flows.find((x) => x.id === id);
  if (!f) throw new Error(`fluxo '${id}' não existe`);
  if (patch.isDefault) {
    const src = nodeOf(m, f.sourceId);
    if (f.kind !== 'sequence' || !src || src.kind !== 'gateway' || !['exclusive', 'inclusive'].includes(src.variant ?? '')) {
      throw new Error('fluxo padrão só existe em saída de gateway exclusivo/inclusivo');
    }
  }
  if (patch.condition && f.kind !== 'sequence') throw new Error('condição só existe em fluxo de sequência');
  const { isDefault, ...rest } = patch;
  const merged: Record<string, unknown> = { ...f };
  for (const [k, v] of Object.entries(rest)) {
    if (v === '' || v === undefined) delete merged[k];
    else merged[k] = v;
  }
  if (isDefault !== undefined) merged.isDefault = isDefault;
  const validated = parseModel({ ...m, flows: m.flows.map((x) => (x.id === id ? merged : x)) });
  return {
    ...m,
    flows: validated.flows.map((x) => {
      // um único fluxo padrão por gateway
      return patch.isDefault && x.id !== id && x.sourceId === f.sourceId && x.isDefault ? { ...x, isDefault: false } : x;
    }),
  };
}

export function updateLane(m: ProcessModel, id: string, patch: { name?: string; description?: string; fill?: string }): ProcessModel {
  const validated = parseModel({ ...m, lanes: m.lanes.map((l) => (l.id === id ? clean({ ...l, ...patch }) : l)) });
  return { ...m, lanes: validated.lanes };
}
export function updateParticipant(m: ProcessModel, id: string, patch: { name?: string; description?: string }): ProcessModel {
  const validated = parseModel({ ...m, participants: m.participants.map((p) => (p.id === id ? clean({ ...p, ...patch }) : p)) });
  return { ...m, participants: validated.participants };
}
/** Metadados do processo (autor, versão, descrição...). Campos vazios são removidos; modifiedAt é carimbado por quem chama. */
export function updateMeta(m: ProcessModel, patch: Partial<ProcessModel['meta']>): ProcessModel {
  const validated = parseModel({ ...m, meta: clean({ ...m.meta, ...patch }) });
  return { ...m, meta: validated.meta };
}
/** remove chaves com string vazia/undefined (campo opcional "limpo") */
function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== '' && v !== undefined) out[k] = v;
  return out as T;
}
export const renameProcess = (m: ProcessModel, name: string): ProcessModel => ({ ...m, name });

/** Processo novo mínimo: um evento de início, pronto para o usuário continuar. */
export function newProcess(existingIds: ReadonlyArray<string>, name: string, startName = ''): ProcessModel {
  let i = 1;
  while (existingIds.includes(`Process_${i}`)) i++;
  const id = `Process_${i}`;
  const start: ProcessNode = parseModel({ id, name, nodes: [{ id: 'Start_1', kind: 'start', variant: 'none', name: startName, bounds: { x: 160, y: 160, w: 36, h: 36 } }], flows: [] }).nodes[0]!;
  // createdAt/modifiedAt: ISO-8601 (metadados do processo, Bizagi: data de criação/modificação)
  const now = new Date().toISOString();
  return { id, name, lanes: [], participants: [], nodes: [start], flows: [], meta: { tags: [], createdAt: now, modifiedAt: now }, attributeDefs: [] };
}


// ---------------------------------------------------------------- rótulos (texto fora da forma)

/**
 * Posiciona o rótulo de um nó/fluxo por DESLOCAMENTO em relação à posição padrão (labels.ts).
 * Offsets menores que 1px viram "padrão" (remove o campo). Inteiros: sem ruído de ponto flutuante no BPMN.
 */
export function setLabelOffset(m: ProcessModel, id: string, offset: { dx: number; dy: number } | undefined): ProcessModel {
  const o = offset && (Math.abs(offset.dx) >= 1 || Math.abs(offset.dy) >= 1) ? { dx: Math.round(offset.dx), dy: Math.round(offset.dy) } : undefined;
  const apply = <T extends { id: string; labelOffset?: { dx: number; dy: number } }>(list: T[]): T[] =>
    list.map((x) => {
      if (x.id !== id) return x;
      const { labelOffset: _drop, ...rest } = x;
      return (o ? { ...rest, labelOffset: o } : rest) as T;
    });
  if (m.nodes.some((n) => n.id === id)) return { ...m, nodes: apply(m.nodes) };
  if (m.flows.some((f) => f.id === id)) return { ...m, flows: apply(m.flows) };
  throw new Error(`rótulo '${id}': elemento não existe`);
}

// ---------------------------------------------------------------- atributos estendidos tipados

export interface AttributeDefSpec {
  name: string;
  description?: string;
  type: AttributeDef['type'];
  options?: string[];
  columns?: Array<{ id?: string; name: string; type?: 'text' | 'number' | 'date' | 'url' }>;
  appliesTo?: NodeKind[];
}

/** Garante ids únicos nas colunas (as existentes mantêm o id; novas ganham `${defId}_cN`). */
function withColumnIds(defId: string, cols: AttributeDefSpec['columns'], reserved: string[] = []): AttributeDef['columns'] {
  // `reserved` = ids que a definição já usou: reaproveitar o id de uma coluna REMOVIDA faria as linhas antigas "pertencerem" à coluna nova
  const used = new Set([...(cols ?? []).map((c) => c.id).filter(Boolean) as string[], ...reserved]);
  let n = 0;
  return (cols ?? []).map((c) => {
    let id = c.id;
    while (!id) { n++; const cand = `${defId}_c${n}`; if (!used.has(cand)) { id = cand; used.add(cand); } }
    return { id, name: c.name, type: c.type ?? 'text' };
  });
}

/** Cria a definição de um atributo (Bizagi: "Add New Extended Attribute"). Valida pelo schema (nome, tipo, opções/colunas). */
export function addAttributeDef(m: ProcessModel, spec: AttributeDefSpec): { model: ProcessModel; id: string } {
  const id = nextId(m, 'Attr');
  if (m.attributeDefs.some((d) => d.name.trim().toLowerCase() === spec.name.trim().toLowerCase())) throw new Error(`já existe um atributo chamado '${spec.name}'`);
  const def = AttributeDefSchema.parse({
    id, name: spec.name.trim(), ...(spec.description && { description: spec.description }), type: spec.type,
    options: (spec.options ?? []).map((o) => o.trim()).filter(Boolean),
    columns: spec.type === 'table' ? withColumnIds(id, spec.columns) : [],
    ...(spec.appliesTo?.length && { appliesTo: spec.appliesTo }),
  });
  if (['select', 'radio', 'multiselect'].includes(def.type) && def.options.length === 0) throw new Error('informe ao menos uma opção');
  if (def.type === 'table' && def.columns.length === 0) throw new Error('informe ao menos uma coluna');
  return { model: { ...m, attributeDefs: [...m.attributeDefs, def] }, id };
}

/**
 * Altera uma definição e MANTÉM os valores que ainda fazem sentido:
 * - mudou o tipo -> valores desse atributo são descartados (não há conversão segura entre, p.ex., tabela e data);
 * - mudaram as opções -> valores fora das novas opções são removidos;
 * - mudaram as colunas -> as linhas são remontadas pelo id da coluna (colunas novas ficam vazias, removidas somem).
 */
export function updateAttributeDef(m: ProcessModel, id: string, patch: Partial<AttributeDefSpec>): ProcessModel {
  const old = m.attributeDefs.find((d) => d.id === id);
  if (!old) throw new Error(`atributo '${id}' não existe`);
  const type = patch.type ?? old.type;
  const merged = AttributeDefSchema.parse({
    ...old, ...patch, id, type,
    description: patch.description === undefined ? old.description : patch.description || undefined,
    options: (patch.options ?? old.options).map((o) => o.trim()).filter(Boolean),
    columns: type === 'table' ? withColumnIds(id, patch.columns ?? old.columns, old.columns.map((c) => c.id)) : [],
    appliesTo: patch.appliesTo === undefined ? old.appliesTo : patch.appliesTo.length ? patch.appliesTo : undefined,
  });
  if (m.attributeDefs.some((d) => d.id !== id && d.name.trim().toLowerCase() === merged.name.trim().toLowerCase())) throw new Error(`já existe um atributo chamado '${merged.name}'`);

  const fix = (v: AttrValue): AttrValue | null => {
    if (merged.type !== old.type) return null;
    if (merged.type === 'select' || merged.type === 'radio') return typeof v === 'string' && merged.options.includes(v) ? v : null;
    if (merged.type === 'multiselect') { const k = (v as string[]).filter((x) => merged.options.includes(x)); return k.length ? k : null; }
    if (merged.type === 'table') {
      const idx = merged.columns.map((c) => old.columns.findIndex((oc) => oc.id === c.id));
      const rows = (v as string[][]).map((r) => idx.map((i) => (i >= 0 ? r[i] ?? '' : '')));
      return rows.length ? rows : null;
    }
    return v;
  };
  const nodes = m.nodes.map((n) => {
    if (!n.attributes.some((a) => a.defId === id)) return n;
    const attributes = n.attributes.flatMap((a) => {
      if (a.defId !== id) return [a];
      const nv = fix(a.value);
      return nv === null || isEmptyAttrValue(nv) ? [] : [{ ...a, name: merged.name, value: nv }];
    });
    return { ...n, attributes };
  });
  return { ...m, nodes, attributeDefs: m.attributeDefs.map((d) => (d.id === id ? merged : d)) };
}

/** Remove a definição e todos os valores dela nos elementos. */
export function deleteAttributeDef(m: ProcessModel, id: string): ProcessModel {
  if (!m.attributeDefs.some((d) => d.id === id)) return m;
  return {
    ...m,
    attributeDefs: m.attributeDefs.filter((d) => d.id !== id),
    nodes: m.nodes.map((n) => (n.attributes.some((a) => a.defId === id) ? { ...n, attributes: n.attributes.filter((a) => a.defId !== id) } : n)),
  };
}

/** Define (ou limpa, se vazio) o valor de um atributo definido, normalizando ao tipo. */
export function setNodeAttribute(m: ProcessModel, nodeId: string, defId: string, value: AttrValue): ProcessModel {
  const def = m.attributeDefs.find((d) => d.id === defId);
  if (!def) throw new Error(`atributo '${defId}' não existe`);
  if (!nodeOf(m, nodeId)) throw new Error(`nó '${nodeId}' não existe`);
  const v = coerceAttrValue(def, value);
  return {
    ...m,
    nodes: m.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const rest = n.attributes.filter((a) => a.defId !== defId);
      return { ...n, attributes: isEmptyAttrValue(v) ? rest : [...n.attributes.filter((a) => a.defId !== defId), { name: def.name, defId, value: v }] };
    }),
  };
}


// ---------------------------------------------------------------- trocar o TIPO do elemento (tarefa <-> subprocesso)

/**
 * Converte tarefa em subprocesso e vice-versa, como o campo "Variante" do Bizagi.
 * - Preserva nome, lane, documentação, responsáveis, atributos, aparência e vínculos; o centro do elemento fica no lugar
 *   (o desenho muda de 120x70 para 140x80 e vice-versa), boundary events acompanham a nova borda e os fluxos são re-roteados.
 * - subprocesso -> tarefa descarta `calledProcessId` (o vínculo com outro diagrama não existe em tarefa).
 * - tarefa -> subprocesso descarta a variante (usuário/serviço/...), que só existe em tarefa.
 * Só esse par é permitido: outros pares (ex.: evento <-> gateway) mudam a semântica do fluxo e exigem decisão do modelador.
 */
export function changeNodeKind(m: ProcessModel, id: string, kind: 'task' | 'subprocess', variant?: string): ProcessModel {
  const n = nodeOf(m, id);
  if (!n) throw new Error(`nó '${id}' não existe`);
  if (n.kind !== 'task' && n.kind !== 'subprocess') throw new Error(`só tarefa e subprocesso são intercambiáveis (era '${n.kind}')`);
  if (n.kind === kind) return variant && kind === 'task' ? updateNode(m, id, { variant }) : m;

  const { variant: _v, calledProcessId: _c, ...rest } = n;
  const old = n.bounds;
  const size = sizeOf({ kind } as ProcessNode);
  const bounds: Bounds | undefined = old
    ? { x: Math.round(old.x + old.w / 2 - size.w / 2), y: Math.round(old.y + old.h / 2 - size.h / 2), w: size.w, h: size.h }
    : undefined;
  const converted = NodeSchema.parse({ ...rest, kind, ...(kind === 'task' && { variant: variant ?? 'generic' }), ...(bounds && { bounds }) });

  const touched = new Set<string>([id]);
  const nodes = m.nodes.map((x) => {
    if (x.id === id) return converted;
    // boundary events ficam na borda inferior da nova forma, mantendo a posição horizontal (limitada à largura nova)
    if (x.kind === 'boundary' && x.attachedToId === id && x.bounds && bounds) {
      touched.add(x.id);
      const cx = Math.min(Math.max(x.bounds.x + x.bounds.w / 2, bounds.x + 22), bounds.x + bounds.w - 22);
      return { ...x, bounds: { ...x.bounds, x: cx - x.bounds.w / 2, y: bounds.y + bounds.h - x.bounds.h / 2 } };
    }
    return x;
  });
  return routeFlows(fitContainers({ ...m, nodes }), touchingFlows(m, touched));
}


// ---------------------------------------------------------------- traçado das linhas (waypoints) à mão, como no Bizagi

type Pt = [number, number];
const EPS = 0.5;

/** Remove pontos repetidos e o vértice do meio de três pontos alinhados (mantém a forma, só limpa). */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < EPS && Math.abs(last[1] - p[1]) < EPS) continue;
    out.push([p[0], p[1]]);
    while (out.length >= 3) {
      const [a, b, c] = [out[out.length - 3]!, out[out.length - 2]!, out[out.length - 1]!];
      const colinear = (Math.abs(a[0] - b[0]) < EPS && Math.abs(b[0] - c[0]) < EPS) || (Math.abs(a[1] - b[1]) < EPS && Math.abs(b[1] - c[1]) < EPS);
      if (!colinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** 'h' | 'v' | null (segmento diagonal ou nulo: não é arrastável) */
export function segmentAxis(a: readonly [number, number], b: readonly [number, number]): 'h' | 'v' | null {
  const h = Math.abs(a[1] - b[1]) < EPS, v = Math.abs(a[0] - b[0]) < EPS;
  return h && !v ? 'h' : v && !h ? 'v' : null;
}

/**
 * Arrasta o segmento `index` (entre waypoints[index] e [index+1]) por `delta` px perpendicular a ele — o traçado continua ortogonal.
 * - segmento do MEIO: os dois vértices andam juntos (os vizinhos, perpendiculares, só esticam/encolhem);
 * - segmento da PONTA (encosta na forma): os extremos ficam presos nas formas, então inserimos um pequeno "degrau" (stub de até 15px)
 *   e o segmento sai do alinhamento — como o Bizagi/bpmn.io fazem ao puxar uma linha reta.
 * Marca o fluxo como manual: mover os elementos passa a ADAPTAR esse traçado (ver reflow) em vez de re-rotear.
 * Pura em relação a `m` e à posição inicial — o editor chama sempre com o modelo-base do arrasto e o delta total.
 */
export function moveFlowSegment(m: ProcessModel, flowId: string, index: number, delta: number): ProcessModel {
  const f = m.flows.find((x) => x.id === flowId);
  if (!f?.waypoints || f.waypoints.length < 2) throw new Error(`fluxo '${flowId}' sem traçado`);
  const wp = f.waypoints.map(([x, y]) => [x, y] as Pt);
  const n = wp.length;
  if (index < 0 || index > n - 2) throw new Error(`segmento ${index} inexistente`);
  const a = wp[index]!, b = wp[index + 1]!;
  const axis = segmentAxis(a, b);
  if (!axis) throw new Error('segmento diagonal não é ajustável');
  if (!delta) return m;
  const perp = (p: Pt, d: number): Pt => (axis === 'h' ? [p[0], p[1] + d] : [p[0] + d, p[1]]);
  const along = (p: Pt, d: number): Pt => (axis === 'h' ? [p[0] + d, p[1]] : [p[0], p[1] + d]);
  const len = axis === 'h' ? b[0] - a[0] : b[1] - a[1];
  const dir = Math.sign(len) || 1;
  const stub = Math.min(15, Math.abs(len) / 2) * dir;
  const first = index === 0, last = index === n - 2;

  // Ao puxar o segmento do meio, os segmentos de ponta (presos às formas) esticam/encolhem. Não deixamos encolher abaixo de 10px nem
  // inverter: senão a linha chegaria "de lado" na borda da forma (sem trecho de entrada para a seta).
  if (!first && !last) {
    const coord = (pt: Pt) => (axis === 'h' ? pt[1] : pt[0]);
    const limit = (pinned: Pt) => {
      const c0 = coord(a), P = coord(pinned), sgn = Math.sign(c0 - P);
      if (!sgn) return;
      const lim = P + sgn * 10, c = c0 + delta;
      if ((sgn > 0 && c < lim) || (sgn < 0 && c > lim)) delta = lim - c0;
    };
    if (index - 1 === 0) limit(wp[0]!);
    if (index + 1 === n - 2) limit(wp[n - 1]!);
    if (!delta) return m;
  }

  let next: Pt[];
  if (!first && !last) next = [...wp.slice(0, index), perp(a, delta), perp(b, delta), ...wp.slice(index + 2)];
  else if (first && last) next = [a, along(a, stub), perp(along(a, stub), delta), perp(along(b, -stub), delta), along(b, -stub), b];
  else if (first) next = [a, along(a, stub), perp(along(a, stub), delta), perp(b, delta), ...wp.slice(2)];
  else next = [...wp.slice(0, index), perp(a, delta), perp(along(b, -stub), delta), along(b, -stub), b];

  return { ...m, flows: m.flows.map((x) => (x.id === flowId ? { ...x, waypoints: simplify(next), manualRoute: true } : x)) };
}

/** Volta o fluxo ao roteamento automático. */
export function autoRouteFlow(m: ProcessModel, flowId: string): ProcessModel {
  if (!m.flows.some((f) => f.id === flowId)) throw new Error(`fluxo '${flowId}' não existe`);
  return routeFlows(m, new Set([flowId]));
}

/**
 * Acompanha o deslocamento (dx,dy) dos extremos de um traçado manual: o ponto do extremo anda junto (a forma andou rígida, então
 * continua na borda) e o vizinho desliza no eixo perpendicular para manter o segmento ortogonal. null = não dá para adaptar
 * (2 pontos, segmento invertido, diagonal) -> o chamador re-roteia automaticamente.
 */
function adaptWaypoints(wp: ReadonlyArray<readonly [number, number]>, dS: { dx: number; dy: number }, dT: { dx: number; dy: number }): Pt[] | null {
  const n = wp.length;
  if (n < 3) return null;
  const pts = wp.map(([x, y]) => [x, y] as Pt);
  const end = (iEnd: number, iNext: number, d: { dx: number; dy: number }): boolean => {
    if (!d.dx && !d.dy) return true;
    const a = pts[iEnd]!, b = pts[iNext]!;
    const axis = segmentAxis(a, b);
    if (!axis) return false;
    const before = axis === 'h' ? b[0] - a[0] : b[1] - a[1];
    a[0] += d.dx; a[1] += d.dy;
    if (axis === 'h') b[1] += d.dy; else b[0] += d.dx;
    const after = axis === 'h' ? b[0] - a[0] : b[1] - a[1];
    return Math.sign(before) === Math.sign(after) && Math.abs(after) >= 4; // a ponta não pode virar do avesso nem colar no vértice
  };
  if (!end(0, 1, dS) || !end(n - 1, n - 2, dT)) return null;
  return pts;
}

/**
 * Religa os fluxos que tocam elementos que andaram (`moved`: id -> deslocamento).
 * - fluxo automático -> re-roteia;
 * - fluxo MANUAL -> adapta o traçado do usuário (adaptWaypoints); se não der, volta ao automático.
 * Fluxos que não tocam nada que andou ficam intactos.
 */
function reflow(m: ProcessModel, moved: ReadonlyMap<string, { dx: number; dy: number }>): ProcessModel {
  const zero = { dx: 0, dy: 0 };
  const auto = new Set<string>();
  const flows = m.flows.map((f) => {
    const dS = moved.get(f.sourceId), dT = moved.get(f.targetId);
    if (!dS && !dT) return f;
    if (f.manualRoute && f.waypoints && dS && dT && dS.dx === dT.dx && dS.dy === dT.dy) {
      // os dois extremos andaram juntos: o traçado inteiro só se translada
      return { ...f, waypoints: f.waypoints.map(([x, y]) => [x + dS.dx, y + dS.dy] as [number, number]) };
    }
    if (f.manualRoute && f.waypoints) {
      const adapted = adaptWaypoints(f.waypoints, dS ?? zero, dT ?? zero);
      if (adapted) return { ...f, waypoints: adapted };
    }
    auto.add(f.id);
    return f;
  });
  return auto.size ? routeFlows({ ...m, flows }, auto) : { ...m, flows };
}


// ---------------------------------------------------------------- pontas da linha: mudar o ponto de encaixe e religar a outro elemento

export type Side = 'left' | 'right' | 'top' | 'bottom';
const DIR: Record<Side, readonly [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const CORNER_MARGIN = 8;
const STUB = 15;

/** Elementos de contorno redondo/losango só encostam no ponto médio de cada lado da caixa; os retangulares aceitam qualquer ponto do lado. */
const dockAnywhere = (kind: string | undefined): boolean => !kind || ['task', 'subprocess', 'annotation', 'dataObject', 'dataStore'].includes(kind);

/** Lado da caixa mais próximo do ponto (distância ao segmento do lado). */
export function nearestSide(b: Bounds, p: Point): Side {
  const dSeg = (x1: number, y1: number, x2: number, y2: number) => {
    const cx = Math.min(Math.max(p.x, Math.min(x1, x2)), Math.max(x1, x2)), cy = Math.min(Math.max(p.y, Math.min(y1, y2)), Math.max(y1, y2));
    return Math.hypot(p.x - cx, p.y - cy);
  };
  const d: Array<[Side, number]> = [
    ['left', dSeg(b.x, b.y, b.x, b.y + b.h)], ['right', dSeg(b.x + b.w, b.y, b.x + b.w, b.y + b.h)],
    ['top', dSeg(b.x, b.y, b.x + b.w, b.y)], ['bottom', dSeg(b.x, b.y + b.h, b.x + b.w, b.y + b.h)],
  ];
  return d.sort((a, c) => a[1] - c[1])[0]![0];
}

/** Ponto de encaixe na borda `side` perto de `p` (clampado, e fixo no meio para formas redondas/losango). */
export function dockPoint(b: Bounds, side: Side, p: Point, anywhere: boolean): Pt {
  const mx = b.x + b.w / 2, my = b.y + b.h / 2;
  const clampX = Math.min(Math.max(snap(p.x, 5), b.x + CORNER_MARGIN), b.x + b.w - CORNER_MARGIN);
  const clampY = Math.min(Math.max(snap(p.y, 5), b.y + CORNER_MARGIN), b.y + b.h - CORNER_MARGIN);
  switch (side) {
    case 'left': return [b.x, anywhere ? clampY : my];
    case 'right': return [b.x + b.w, anywhere ? clampY : my];
    case 'top': return [anywhere ? clampX : mx, b.y];
    case 'bottom': return [anywhere ? clampX : mx, b.y + b.h];
  }
}

/**
 * Traçado ortogonal entre dois encaixes: sai/entra perpendicular à borda (trecho curto de 15px) e liga os trechos com 1 ou 2 dobras.
 * Nunca "volta para dentro" da forma de origem: se o destino está atrás da direção de saída, contorna pelo lado de fora.
 * (Trechos colineares são fundidos, então o trecho curto só aparece quando há dobra logo depois.)
 */
export function routeDocked(from: Pt, fromSide: Side, to: Pt, toSide: Side): Pt[] {
  const [fx, fy] = DIR[fromSide], [tx, ty] = DIR[toSide];
  const a: Pt = [from[0] + fx * STUB, from[1] + fy * STUB];
  const z: Pt = [to[0] + tx * STUB, to[1] + ty * STUB];
  const fromH = fy === 0, toH = ty === 0;
  let mid: Pt[];
  if (fromH && toH) {
    // canal vertical entre os dois trechos; se ficaria "atrás" da saída, usa o ponto mais externo
    let mx = (a[0] + z[0]) / 2;
    if ((mx - a[0]) * fx < 0 || (mx - z[0]) * tx < 0) mx = fx > 0 ? Math.max(a[0], z[0]) : Math.min(a[0], z[0]);
    mid = [[mx, a[1]], [mx, z[1]]];
  } else if (!fromH && !toH) {
    let my = (a[1] + z[1]) / 2;
    if ((my - a[1]) * fy < 0 || (my - z[1]) * ty < 0) my = fy > 0 ? Math.max(a[1], z[1]) : Math.min(a[1], z[1]);
    mid = [[a[0], my], [z[0], my]];
  } else if (fromH) {
    // saída horizontal, entrada vertical: canto (z.x, a.y) se estiver à frente da saída; senão dá a volta por (a.x, z.y)
    mid = (z[0] - a[0]) * fx >= 0 ? [[z[0], a[1]]] : [[a[0], z[1]]];
  } else {
    mid = (z[1] - a[1]) * fy >= 0 ? [[a[0], z[1]]] : [[z[0], a[1]]];
  }
  return simplify([from, a, ...mid, z, to]);
}

const boundsOfEnd = (m: ProcessModel, id: string): Bounds | undefined =>
  nodeOf(m, id)?.bounds ?? m.participants.find((p) => p.id === id)?.bounds ?? (id === m.id ? m.pool : undefined);

/** Lado em que a linha encosta hoje (pelo ponto da ponta). */
function sideOfPoint(b: Bounds, p: readonly [number, number]): Side {
  return nearestSide(b, { x: p[0], y: p[1] });
}

/**
 * Move UMA ponta da linha para perto de `point`, ao longo da borda do elemento ao qual ela já está ligada
 * (muda o lado e/ou a posição no lado). A outra ponta fica onde está; o traçado é refeito ortogonal e a linha vira manual.
 * Pura em relação ao modelo-base (o editor chama a cada movimento do mouse com a base do arrasto).
 */
export function moveFlowEndpoint(m: ProcessModel, flowId: string, end: 'source' | 'target', point: Point): ProcessModel {
  const f = m.flows.find((x) => x.id === flowId);
  if (!f?.waypoints || f.waypoints.length < 2) throw new Error(`fluxo '${flowId}' sem traçado`);
  const ownId = end === 'source' ? f.sourceId : f.targetId;
  const otherId = end === 'source' ? f.targetId : f.sourceId;
  const own = boundsOfEnd(m, ownId), other = boundsOfEnd(m, otherId);
  if (!own || !other) throw new Error('elemento da ponta sem geometria');
  const wp = f.waypoints;
  const otherPt = (end === 'source' ? wp[wp.length - 1] : wp[0])!;
  const otherSide = sideOfPoint(other, otherPt);

  const side = nearestSide(own, point);
  const dock = dockPoint(own, side, point, dockAnywhere(nodeOf(m, ownId)?.kind));
  const path = end === 'source' ? routeDocked(dock, side, otherPt as Pt, otherSide) : routeDocked(otherPt as Pt, otherSide, dock, side);
  return { ...m, flows: m.flows.map((x) => (x.id === flowId ? { ...x, waypoints: path, manualRoute: true } : x)) };
}

/** Motivo da recusa (mesmas chaves de canConnect) ou null: pode religar a ponta `end` desta linha ao elemento `newId`? */
export function canReconnect(m: ProcessModel, flowId: string, end: 'source' | 'target', newId: string): string | null {
  const f = m.flows.find((x) => x.id === flowId);
  if (!f) return 'unknown';
  const s = end === 'source' ? newId : f.sourceId, t = end === 'target' ? newId : f.targetId;
  // sem a própria linha: religar a ela mesma não é "duplicata"
  return canConnect({ ...m, flows: m.flows.filter((x) => x.id !== flowId) }, s, t, f.kind);
}

/**
 * Religa uma ponta da linha a OUTRO elemento (arrastar a ponta até ele). Valida pelas regras de conexão; o traçado volta ao automático.
 * Se a origem muda, deixa de ser "fluxo padrão" do gateway anterior.
 */
export function reconnectFlow(m: ProcessModel, flowId: string, end: 'source' | 'target', newId: string): ProcessModel {
  const why = canReconnect(m, flowId, end, newId);
  if (why) throw new Error(`conexão inválida: ${why}`);
  const f = m.flows.find((x) => x.id === flowId)!;
  const changed = (end === 'source' ? f.sourceId : f.targetId) !== newId;
  if (!changed) return m;
  const { manualRoute: _drop, ...rest } = f;
  const moved: ProcessFlow = { ...rest, ...(end === 'source' ? { sourceId: newId, isDefault: false } : { targetId: newId }) };
  return routeFlows({ ...m, flows: m.flows.map((x) => (x.id === flowId ? moved : x)) }, new Set([flowId]));
}
