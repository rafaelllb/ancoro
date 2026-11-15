/**
 * Motor de simulação do processo (Fase 7) — puro, determinístico, sem DOM e sem relógio real.
 *
 * [2026-11-07] Criado: motor de eventos discretos + KPIs + Monte Carlo — Rafael Brito
 * [2026-11-07] Alterado: subprocessos chamados (drill-down), esperas de eventos (timer/mensagem/sinal/condicional),
 *   timer de borda, eventos de lançamento e salto de link visível no trace — Rafael Brito
 *
 * Visão (Rafael Brito, 2026-11-07): tornar o processo dinâmico, apoiando o ciclo de vida BPM
 * (modelar → SIMULAR/analisar → executar → MONITORAR → otimizar). Por isso o contrato é uma sequência de
 * EVENTOS (`SimEvent[]`) + um resumo de KPIs calculado A PARTIR dos eventos (`summarize`). Qualquer fonte que
 * produza o mesmo formato de eventos — inclusive um event log real do ERP — reaproveita KPIs, gargalos e a
 * animação do editor (fase "monitorar"). `simulateBatch` roda N casos e dá as distribuições (fase "planejar melhorias").
 *
 * Semântica suportada: início, tarefa, XOR/evento-base (sorteio por probabilidade, escolha de cenário ou manual),
 * AND (fork/join), tarefa com várias saídas (AND implícito), link throw→catch, message flow (registrado), fim e terminate.
 * - SUBPROCESSO CHAMADO (`calledProcessId` resolvido por `cfg.resolve`): o token MERGULHA no processo chamado, executa-o
 *   (com fork/join próprios) e volta. A duração/custo do próprio nó passa a ser só um PISO de tempo (o tempo real é o do
 *   que foi executado lá dentro) — o custo do nó é ignorado para não contar em dobro.
 * - ESPERAS: evento intermediário de captura (timer, mensagem, sinal, condicional, escalonamento) consome `duration` como
 *   TEMPO DE ESPERA. A simulação não espera de verdade: o relógio simulado avança e o tempo entra nos KPIs como espera.
 *   Evento de início não espera (ele marca a chegada do caso).
 * - TIMER DE BORDA: se `boundary.duration` < duração da tarefa, o timer dispara — interrompendo (a tarefa é cortada e o
 *   fluxo segue pela borda) ou não (o ramo da borda corre em paralelo).
 * Tempo simulado em MINUTOS (dia = 24 h corridas).
 *
 * Limitações (listadas em `limitations` quando se aplicam ao modelo — nunca silenciosas):
 * - Gateway inclusivo divergente é tratado como exclusivo; convergente passa direto (join OR é sutil em BPMN).
 * - Boundary que não seja timer, loops/multi-instância: NÃO simulados. Subprocesso não carregado vira tarefa atômica.
 * - Sinal/escalonamento lançados são REGISTRADOS (aparecem no trace) mas não acordam capturas em outros pontos do modelo.
 * - Sem recursos/filas: cada caso roda isolado (sem contenção entre casos).
 *
 * TODO [ESTIGMERGIA]: recursos e filas
 * - Hoje a espera é só a de join e a de eventos. Próximo passo: capacidade por `performer`/lane e fila (gargalo por contenção).
 * TODO [ESTIGMERGIA]: distribuições de duração
 * - Duração é fixa (texto livre parseado). Evoluir para uniforme/triangular em campo numérico dedicado.
 * TODO [ESTIGMERGIA]: boundary de mensagem/sinal/erro
 * - Precisam de uma "probabilidade de disparo" no nó (hoje só o fluxo tem `probability`). Adicionar o campo ao modelo
 *   (e ao BPMN via extensão ancoro:) e então tratar como o timer, sorteando o disparo.
 */
import type { ProcessFlow, ProcessModel, ProcessNode } from './model.js';
import { validateModel, type Issue } from './validate.js';

// ------------------------------------------------------------------------------------------------ parsers
const UNIT_MIN: Array<[RegExp, number]> = [
  [/^(dias?|days?|d)$/i, 1440],
  [/^(horas?|hours?|hrs?|h)$/i, 60],
  [/^(minutos?|minutes?|mins?|m)$/i, 1],
  [/^(segundos?|seconds?|secs?|s)$/i, 1 / 60],
];
const num = (s: string) => Number(s.replace(',', '.'));

/** "2 h", "1 h 30 min", "PT2H30M", "P1D", "3 dias" → minutos. `undefined` se não reconhecer (texto livre sem número+unidade). */
export function parseDuration(text?: string): number | undefined {
  const s = text?.trim();
  if (!s) return undefined;
  const iso = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(s);
  if (iso && iso.slice(1).some(Boolean)) {
    const [, d, h, m, sec] = iso;
    return num(d ?? '0') * 1440 + num(h ?? '0') * 60 + num(m ?? '0') + num(sec ?? '0') / 60;
  }
  let total = 0, found = false;
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-zA-Zçã]+)/g)) {
    const unit = UNIT_MIN.find(([re]) => re.test(m[2]!));
    if (!unit) continue;
    total += num(m[1]!) * unit[1];
    found = true;
  }
  return found ? total : undefined;
}

/** "R$ 40", "1.250,50", "$ 12.5" → número (moeda ignorada). `undefined` se não houver número. */
export function parseCost(text?: string): number | undefined {
  const m = text && /-?\d[\d.,]*/.exec(text);
  if (!m) return undefined;
  let s = m[0].replace(/[.,]$/, '');
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // o ÚLTIMO separador é o decimal; o outro é milhar
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0 && !/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** PRNG determinístico (mulberry32): mesma semente ⇒ mesmo caminho, em qualquer máquina. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------------ tipos
/** link ou arquivo que o usuário precisa abrir/preencher para o caso seguir naquele elemento */
export interface ArtifactRef { kind: 'link' | 'file'; name: string; /** link: URL http(s) */ url?: string; /** arquivo: id do anexo no repositório */ id?: string; mimeType?: string }

/**
 * Artefatos que exigem ação num elemento: o hiperlink do próprio elemento (`url`, só http/https) + anexos informados pelo host.
 * [2026-11-07] Criado: "elemento com anexo/link para preencher ou executar" entra na simulação — Rafael Brito
 */
export function artifactsOf(n: ProcessNode, attached: readonly ArtifactRef[] = []): ArtifactRef[] {
  const link = n.url && /^https?:\/\//i.test(n.url.trim()) ? [{ kind: 'link' as const, name: n.url.trim(), url: n.url.trim() }] : [];
  return [...link, ...attached];
}

export type DecisionReason = 'probability' | 'uniform' | 'choice' | 'manual';
export interface DecisionOption { flowId: string; name?: string; weight: number }
export type EndKind = 'completed' | 'terminated' | 'deadlock' | 'stuck' | 'aborted' | 'awaiting-choice';
/** eventos de captura que fazem o caso ESPERAR por algo externo */
export const WAIT_VARIANTS = ['timer', 'message', 'signal', 'conditional', 'escalation'] as const;

/**
 * Evento do trace. `t` = minutos simulados desde o início; `seq` = ordem total (índice no trace);
 * `pid` = id do PROCESSO a que `nodeId`/`flowId` pertencem (muda quando o token mergulha num subprocesso chamado).
 */
export type SimEvent = { seq: number; t: number; pid?: string } & (
  | { type: 'token-created'; tokenId: string; nodeId: string }
  | { type: 'node-entered'; tokenId: string; nodeId: string }
  | { type: 'node-exited'; tokenId: string; nodeId: string; durationMin: number; interrupted?: boolean }
  | { type: 'token-moved'; tokenId: string; flowId: string; from: string; to: string }
  | { type: 'gateway-decided'; tokenId: string; nodeId: string; flowId: string; reason: DecisionReason; options: DecisionOption[] }
  | { type: 'fork'; tokenId: string; nodeId: string; flowIds: string[]; tokenIds: string[] }
  | { type: 'join-wait'; tokenId: string; nodeId: string; arrived: number; expected: number }
  | { type: 'join-fired'; tokenId: string; nodeId: string; mergedTokenIds: string[] }
  | { type: 'message-sent'; tokenId: string; nodeId: string; flowId: string; targetId: string }
  | { type: 'link-jump'; tokenId: string; from: string; to: string; name: string }
  | { type: 'action-required'; tokenId: string; nodeId: string; items: ArtifactRef[] }
  | { type: 'wait-started'; tokenId: string; nodeId: string; variant: string; minutes: number }
  | { type: 'event-thrown'; tokenId: string; nodeId: string; variant: string }
  | { type: 'subprocess-entered'; tokenId: string; nodeId: string; calledId: string }
  | { type: 'subprocess-exited'; tokenId: string; nodeId: string; calledId: string }
  | { type: 'boundary-fired'; tokenId: string; hostId: string; boundaryId: string; interrupting: boolean; minutes: number }
  | { type: 'token-consumed'; tokenId: string; nodeId: string }
  | { type: 'ended'; kind: EndKind; nodeId?: string; message: string }
);

export interface SimConfig {
  /** semente do sorteio de ramos (padrão 1) */
  seed?: number;
  /** `manual`: para em cada decisão sem escolha prévia e devolve `pending` (a UI escolhe e re-simula) */
  mode?: 'probabilistic' | 'manual';
  /**
   * Escolhas já feitas, em ORDEM DE DECISÃO (ids de fluxo). Serve a "cenário salvo" e ao modo manual.
   * Por ordem (e não por gateway) porque um loop passa pelo mesmo gateway várias vezes.
   */
  choices?: string[];
  /** início a usar (padrão: primeiro `start` sem variante, senão o primeiro) */
  startId?: string;
  /** teto de eventos (anti-loop infinito); padrão 600 */
  maxEvents?: number;
  /** devolve o processo chamado por um subprocesso (`calledProcessId`); sem isso, subprocesso é tarefa atômica */
  resolve?: (processId: string) => ProcessModel | undefined;
  /** anexos por elemento (o link `url` já é lido do modelo). Vem do host; o motor não faz I/O. */
  artifacts?: (processId: string, nodeId: string) => readonly ArtifactRef[];
}

export interface Pending { nodeId: string; tokenId: string; pid?: string; options: DecisionOption[] }

export interface LaneKpi { key: string; label: string; minutes: number; cost: number; tasks: number }
export interface SimSummary {
  endKind: EndKind;
  totalMinutes: number;
  totalCost: number;
  /** nós na ordem da 1ª visita; de processo chamado vêm como `processId/nodeId` (ver `nodeRef`) */
  path: string[];
  flowsTaken: string[];
  byResponsible: LaneKpi[];
  /** tarefa com maior tempo acumulado */
  bottleneck?: { nodeId: string; name: string; minutes: number };
  slaBreaches: Array<{ nodeId: string; name: string; sla: string; slaMinutes: number; actualMinutes: number }>;
  /** tempo parado ESPERANDO (timers, mensagens, sinais) — separado do tempo de trabalho */
  /** quantas vezes o caso parou numa ação que exige abrir um link/anexo */
  actionsRequired: number;
  waitMinutes: number;
  waits: Array<{ nodeId: string; name: string; variant: string; minutes: number }>;
  /** honestidade dos dados: simulação com lacunas PARECE precisa mas não é (README §6.2 risco c) */
  coverage: {
    tasksTotal: number; tasksWithDuration: number; tasksWithCost: number;
    waitsTotal: number; waitsWithDuration: number;
    decisionsTotal: number; decisionsWithProbability: number;
    nodesTotal: number; nodesExercised: number;
  };
}

export interface SimResult {
  ok: boolean;
  /** problemas que impedem rodar (severity error) — `elementId` aponta o elemento */
  blocking: Issue[];
  events: SimEvent[];
  summary: SimSummary;
  pending?: Pending;
  limitations: string[];
  /** processos envolvidos (raiz + chamados resolvidos), por id — a UI precisa deles para animar o mergulho */
  models: ReadonlyMap<string, ProcessModel>;
}

/** referência estável de um nó no resumo: id puro se é do processo raiz, `pid/id` se é de um processo chamado */
export const nodeRef = (rootId: string, pid: string | undefined, nodeId: string) => (!pid || pid === rootId ? nodeId : `${pid}/${nodeId}`);

// ------------------------------------------------------------------------------------------------ preparo
const NON_FLOW = new Set(['dataObject', 'dataStore', 'annotation']);
const isXor = (n: ProcessNode) => n.kind === 'gateway' && n.variant !== 'parallel';
const isWaitCatch = (n: ProcessNode) => n.kind === 'intermediate' && !n.throw && (WAIT_VARIANTS as readonly string[]).includes(n.variant ?? '');
const MAX_DEPTH = 4;

interface Ctx {
  model: ProcessModel;
  nodes: Map<string, ProcessNode>;
  outs: Map<string, ProcessFlow[]>;
  ins: Map<string, number>;
  messages: Map<string, ProcessFlow[]>;
}
interface Prepared {
  root: Ctx;
  registry: Map<string, Ctx>;
  blocking: Issue[];
  limitations: string[];
  models: ReadonlyMap<string, ProcessModel>;
}

function build(model: ProcessModel): Ctx {
  const outs = new Map<string, ProcessFlow[]>(), ins = new Map<string, number>(), messages = new Map<string, ProcessFlow[]>();
  for (const f of model.flows) {
    if (f.kind === 'sequence') {
      outs.set(f.sourceId, [...(outs.get(f.sourceId) ?? []), f]);
      ins.set(f.targetId, (ins.get(f.targetId) ?? 0) + 1);
    } else if (f.kind === 'message') {
      messages.set(f.sourceId, [...(messages.get(f.sourceId) ?? []), f]);
    }
  }
  return { model, nodes: new Map(model.nodes.map((n) => [n.id, n])), outs, ins, messages };
}

function prepare(model: ProcessModel, resolve?: SimConfig['resolve']): Prepared {
  const registry = new Map<string, Ctx>();
  const blocking: Issue[] = [], limitations = new Set<string>();
  const visit = (m: ProcessModel, chain: string[]) => {
    registry.set(m.id, build(m));
    for (const i of validateModel(m).filter((x) => x.severity === 'error')) {
      blocking.push(chain.length ? { ...i, message: `[${m.name}] ${i.message}` } : i);
    }
    const has = (p: (n: ProcessNode) => boolean) => m.nodes.some(p);
    if (has((n) => n.kind === 'gateway' && n.variant === 'inclusive')) limitations.add('inclusive-gateway');
    if (has((n) => n.kind === 'boundary' && n.variant !== 'timer')) limitations.add('boundary-events');
    if (has((n) => (n.kind === 'task' || n.kind === 'subprocess') && n.loop !== 'none')) limitations.add('loops');
    for (const n of m.nodes.filter((x) => x.kind === 'subprocess' && x.calledProcessId)) {
      const child = resolve?.(n.calledProcessId!);
      if (!child) { limitations.add('call-activity'); continue; }
      if (chain.includes(child.id) || child.id === m.id || chain.length >= MAX_DEPTH) { limitations.add('call-cycle'); continue; }
      if (!registry.has(child.id)) visit(child, [...chain, m.id]);
    }
  };
  visit(model, []);
  return {
    root: registry.get(model.id)!, registry, blocking, limitations: [...limitations],
    models: new Map([...registry].map(([id, c]) => [id, c.model])),
  };
}

// ------------------------------------------------------------------------------------------------ motor
interface Inst {
  id: string;
  ctx: Ctx;
  /** tokens vivos nesta execução do processo (o subprocesso termina quando chega a 0) */
  live: number;
  /** como voltar ao processo que chamou */
  ret?: { tokenId: string; parent: Inst; nodeId: string; enteredAt: number; minExit: number };
}
interface QItem { t: number; order: number; phase: 'enter' | 'exit' | 'boundary'; tokenId: string; nodeId: string; boundaryId?: string }

function weights(outs: ProcessFlow[]): { options: DecisionOption[]; specified: boolean } {
  const spec = outs.filter((f) => f.probability !== undefined);
  const sum = spec.reduce((a, f) => a + (f.probability ?? 0), 0);
  const unspec = outs.length - spec.length;
  const rest = unspec ? Math.max(0, 100 - sum) / unspec : 0;
  let w = outs.map((f) => f.probability ?? rest);
  if (w.every((x) => x <= 0)) w = outs.map(() => 1); // tudo zerado/sem dado: uniforme
  return { options: outs.map((f, i) => ({ flowId: f.id, ...(f.name && { name: f.name }), weight: w[i]! })), specified: spec.length > 0 };
}

const pickStart = (ctx: Ctx, id?: string) => {
  const starts = ctx.model.nodes.filter((n) => n.kind === 'start');
  return ctx.nodes.get(id ?? '') ?? starts.find((n) => !n.variant || n.variant === 'none') ?? starts[0];
};

function run(prep: Prepared, cfg: SimConfig): SimResult {
  const events: SimEvent[] = [];
  const done = (extra: Partial<SimResult> = {}): SimResult => ({
    ok: true, blocking: [], events, summary: summarize(prep.root.model, events, prep.models), limitations: prep.limitations, models: prep.models, ...extra,
  });
  if (prep.blocking.length) return done({ ok: false, blocking: prep.blocking });

  const rand = rng(cfg.seed ?? 1);
  const max = cfg.maxEvents ?? 600;
  const choices = cfg.choices ?? [];
  let decisionIdx = 0, tokenSeq = 0, instSeq = 0, order = 0, now = 0;
  let pending: Pending | undefined;
  let finished = false;
  let queue: QItem[] = [];
  const enteredAt = new Map<string, number>();
  const tokenInst = new Map<string, Inst>();
  const joins = new Map<string, { tokens: string[]; pid: string; nodeId: string }>(); // AND convergente → tokens que já chegaram

  // [2026-11-07] Omit distributivo: Omit<União> colapsa as variantes e perde os campos de cada evento
  type Draft = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, 'seq' | 't' | 'pid'> : never) : never;
  const emit = (e: Draft) => {
    const pid = 'tokenId' in e ? tokenInst.get(e.tokenId)?.ctx.model.id : undefined;
    events.push({ ...e, seq: events.length, t: now, ...(pid && { pid }) } as SimEvent);
  };
  const end = (kind: EndKind, message: string, nodeId?: string) => {
    if (finished) return;
    finished = true;
    emit({ type: 'ended', kind, message, ...(nodeId && { nodeId }) });
  };
  const schedule = (phase: QItem['phase'], t: number, tokenId: string, nodeId: string, boundaryId?: string) =>
    queue.push({ t, order: order++, phase, tokenId, nodeId, ...(boundaryId && { boundaryId }) });
  const newToken = (inst: Inst) => { const k = `k${++tokenSeq}`; tokenInst.set(k, inst); inst.live++; return k; };
  const move = (tokenId: string, f: ProcessFlow) => {
    emit({ type: 'token-moved', tokenId, flowId: f.id, from: f.sourceId, to: f.targetId });
    schedule('enter', now, tokenId, f.targetId);
  };

  const rootInst: Inst = { id: `i${instSeq++}`, ctx: prep.root, live: 0 };
  const start = pickStart(prep.root, cfg.startId);
  if (!start) return done({ ok: false, blocking: [{ severity: 'error', code: 'NO_START', message: 'Processo sem evento de início' }] });
  const t0 = newToken(rootInst);
  emit({ type: 'token-created', tokenId: t0, nodeId: start.id });
  schedule('enter', 0, t0, start.id);

  /** devolve o fluxo escolhido, ou null se a simulação parou aguardando escolha manual */
  const decide = (tokenId: string, node: ProcessNode, flows: ProcessFlow[]): ProcessFlow | null => {
    const { options, specified } = weights(flows);
    const queued = choices[decisionIdx];
    let picked: ProcessFlow | undefined, reason: DecisionReason = specified ? 'probability' : 'uniform';
    if (queued !== undefined) {
      picked = flows.find((f) => f.id === queued);
      if (picked) reason = (cfg.mode === 'manual') ? 'manual' : 'choice';
    }
    if (!picked && cfg.mode === 'manual') {
      const pid = tokenInst.get(tokenId)!.ctx.model.id;
      pending = { nodeId: node.id, tokenId, pid, options };
      end('awaiting-choice', `Escolha o caminho em '${node.name || node.id}'`, node.id);
      return null;
    }
    if (!picked) {
      const total = options.reduce((a, o) => a + o.weight, 0);
      let r = rand() * total;
      picked = flows[flows.length - 1]!;
      for (let i = 0; i < flows.length; i++) { r -= options[i]!.weight; if (r < 0) { picked = flows[i]!; break; } }
    }
    decisionIdx++;
    emit({ type: 'gateway-decided', tokenId, nodeId: node.id, flowId: picked.id, reason, options });
    return picked;
  };

  /** o subprocesso chamado acabou: o token volta ao processo pai e o nó chamador sai (no mínimo após a duração própria dele) */
  const returnFromCall = (inst: Inst) => {
    const r = inst.ret!;
    const calledId = inst.ctx.model.id;
    tokenInst.set(r.tokenId, r.parent);
    emit({ type: 'subprocess-exited', tokenId: r.tokenId, nodeId: r.nodeId, calledId });
    enteredAt.set(r.tokenId, r.enteredAt);
    schedule('exit', Math.max(now, r.minExit), r.tokenId, r.nodeId);
  };

  /** ao consumir um token numa execução: se era o último de um subprocesso chamado, volta ao pai */
  const release = (inst: Inst) => {
    inst.live--;
    if (inst.live <= 0 && inst.ret) returnFromCall(inst);
  };

  const onEnter = (it: QItem) => {
    const inst = tokenInst.get(it.tokenId)!;
    const { ctx } = inst;
    const n = ctx.nodes.get(it.nodeId)!;
    emit({ type: 'node-entered', tokenId: it.tokenId, nodeId: n.id });
    enteredAt.set(it.tokenId, now);

    if (n.kind === 'gateway' && n.variant === 'parallel' && (ctx.ins.get(n.id) ?? 0) > 1) {
      const key = `${inst.id}:${n.id}`;
      const arrived = [...(joins.get(key)?.tokens ?? []), it.tokenId];
      const expected = ctx.ins.get(n.id)!;
      if (arrived.length < expected) {
        joins.set(key, { tokens: arrived, pid: ctx.model.id, nodeId: n.id });
        emit({ type: 'join-wait', tokenId: it.tokenId, nodeId: n.id, arrived: arrived.length, expected });
        return; // o token fica parado no gateway até o último chegar
      }
      joins.delete(key);
      const merged = arrived.slice(0, -1);
      emit({ type: 'join-fired', tokenId: it.tokenId, nodeId: n.id, mergedTokenIds: merged });
      for (const k of merged) { emit({ type: 'token-consumed', tokenId: k, nodeId: n.id }); inst.live--; }
    }

    // ação exigida (link/anexo para preencher ou executar): registrada no trace; a UI pode pausar a animação até o usuário concluir
    if (!['gateway', 'dataObject', 'dataStore', 'annotation'].includes(n.kind)) {
      const items = artifactsOf(n, cfg.artifacts?.(ctx.model.id, n.id));
      if (items.length) emit({ type: 'action-required', tokenId: it.tokenId, nodeId: n.id, items });
    }

    const isAct = n.kind === 'task' || n.kind === 'subprocess';
    const ownDur = isAct ? parseDuration(n.duration) ?? 0 : 0;

    // ---- mergulho no subprocesso chamado
    if (n.kind === 'subprocess' && n.calledProcessId) {
      const child = prep.registry.get(n.calledProcessId);
      let depth = 0, cyc = false;
      for (let x: Inst | undefined = inst; x; x = x.ret?.parent) { depth++; if (x.ctx.model.id === n.calledProcessId) cyc = true; }
      const cStart = child && pickStart(child);
      if (child && cStart && !cyc && depth <= MAX_DEPTH) {
        emit({ type: 'subprocess-entered', tokenId: it.tokenId, nodeId: n.id, calledId: child.model.id });
        const ci: Inst = { id: `i${instSeq++}`, ctx: child, live: 1, ret: { tokenId: it.tokenId, parent: inst, nodeId: n.id, enteredAt: now, minExit: now + ownDur } };
        tokenInst.set(it.tokenId, ci);
        schedule('enter', now, it.tokenId, cStart.id);
        return;
      }
    }

    // ---- espera de evento (timer/mensagem/sinal…): não espera de verdade; só avança o relógio simulado
    let dur = ownDur;
    if (isWaitCatch(n)) {
      dur = parseDuration(n.duration) ?? 0;
      emit({ type: 'wait-started', tokenId: it.tokenId, nodeId: n.id, variant: n.variant!, minutes: dur });
    }

    // ---- timer de borda: dispara se vencer a tarefa
    let cut = false;
    if (isAct && ownDur > 0) {
      const timers = ctx.model.nodes
        .filter((b) => b.kind === 'boundary' && b.attachedToId === n.id && b.variant === 'timer')
        .map((b) => ({ b, at: parseDuration(b.duration) }))
        .filter((x): x is { b: ProcessNode; at: number } => x.at !== undefined && x.at < ownDur)
        .sort((a, c) => a.at - c.at);
      const cutter = timers.find((x) => x.b.cancelActivity);
      for (const x of timers) {
        if (cutter && x.at > cutter.at) break; // depois do corte a tarefa não existe mais
        schedule('boundary', now + x.at, it.tokenId, n.id, x.b.id);
      }
      cut = !!cutter;
    }
    if (!cut) schedule('exit', now + dur, it.tokenId, n.id);
  };

  /** dispara um timer de borda anexado à tarefa em que o token está */
  const onBoundary = (it: QItem) => {
    const inst = tokenInst.get(it.tokenId)!;
    const b = inst.ctx.nodes.get(it.boundaryId!)!;
    const minutes = now - (enteredAt.get(it.tokenId) ?? now);
    if (b.cancelActivity) {
      emit({ type: 'node-exited', tokenId: it.tokenId, nodeId: it.nodeId, durationMin: minutes, interrupted: true });
      emit({ type: 'boundary-fired', tokenId: it.tokenId, hostId: it.nodeId, boundaryId: b.id, interrupting: true, minutes });
      schedule('enter', now, it.tokenId, b.id);
    } else {
      const k = newToken(inst); // ramo da borda corre em paralelo à tarefa, que continua
      emit({ type: 'boundary-fired', tokenId: k, hostId: it.nodeId, boundaryId: b.id, interrupting: false, minutes });
      emit({ type: 'token-created', tokenId: k, nodeId: b.id });
      schedule('enter', now, k, b.id);
    }
  };

  const onExit = (it: QItem) => {
    const inst = tokenInst.get(it.tokenId)!;
    const { ctx } = inst;
    const n = ctx.nodes.get(it.nodeId)!;
    emit({ type: 'node-exited', tokenId: it.tokenId, nodeId: n.id, durationMin: now - (enteredAt.get(it.tokenId) ?? now) });
    for (const m of ctx.messages.get(n.id) ?? []) emit({ type: 'message-sent', tokenId: it.tokenId, nodeId: n.id, flowId: m.id, targetId: m.targetId });

    // evento de lançamento (mensagem/sinal/escalonamento/erro): registrado no trace
    if ((n.kind === 'intermediate' && n.throw || n.kind === 'end') && n.variant && ['message', 'signal', 'escalation', 'error'].includes(n.variant)) {
      emit({ type: 'event-thrown', tokenId: it.tokenId, nodeId: n.id, variant: n.variant });
    }

    if (n.kind === 'end') {
      emit({ type: 'token-consumed', tokenId: it.tokenId, nodeId: n.id });
      if (n.variant === 'terminate') {
        // encerra TODOS os tokens da execução atual (no subprocesso: só ele; no raiz: o caso inteiro)
        queue = queue.filter((q) => tokenInst.get(q.tokenId) !== inst);
        for (const [k, j] of joins) if (k.startsWith(`${inst.id}:`)) joins.delete(k), j.tokens.forEach((id) => emit({ type: 'token-consumed', tokenId: id, nodeId: j.nodeId }));
        if (inst.ret) { inst.live = 0; returnFromCall(inst); } else { queue.length = 0; end('terminated', `Encerrado por '${n.name || n.id}'`, n.id); }
        return;
      }
      release(inst);
      return;
    }
    if (n.kind === 'intermediate' && n.variant === 'link' && n.throw) {
      const target = ctx.model.nodes.find((x) => x.kind === 'intermediate' && x.variant === 'link' && !x.throw && x.name === n.name);
      if (target) {
        emit({ type: 'link-jump', tokenId: it.tokenId, from: n.id, to: target.id, name: n.name });
        schedule('enter', now, it.tokenId, target.id);
        return;
      }
    }
    const flows = ctx.outs.get(n.id) ?? [];
    if (!flows.length) {
      emit({ type: 'token-consumed', tokenId: it.tokenId, nodeId: n.id });
      end('stuck', `'${n.name || n.id}' não tem saída: o caso travou`, n.id);
      return;
    }
    if (flows.length === 1) { move(it.tokenId, flows[0]!); return; }
    if (isXor(n)) {
      const f = decide(it.tokenId, n, flows);
      if (f) move(it.tokenId, f);
      return;
    }
    // AND explícito ou tarefa com várias saídas (AND implícito): um token por saída
    const ids = [it.tokenId, ...flows.slice(1).map(() => newToken(inst))];
    emit({ type: 'fork', tokenId: it.tokenId, nodeId: n.id, flowIds: flows.map((f) => f.id), tokenIds: ids });
    ids.slice(1).forEach((k) => emit({ type: 'token-created', tokenId: k, nodeId: n.id }));
    flows.forEach((f, i) => move(ids[i]!, f));
  };

  while (queue.length && !finished) {
    if (events.length >= max) { end('aborted', `Limite de ${max} eventos atingido (loop sem saída?)`); break; }
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.t < queue[best]!.t || (queue[i]!.t === queue[best]!.t && queue[i]!.order < queue[best]!.order)) best = i;
    const it = queue.splice(best, 1)[0]!;
    now = it.t;
    if (it.phase === 'enter') onEnter(it);
    else if (it.phase === 'boundary') onBoundary(it);
    else onExit(it);
  }
  if (!finished) {
    const waiting = [...joins.values()][0];
    if (waiting) end('deadlock', `Deadlock: '${prep.registry.get(waiting.pid)?.nodes.get(waiting.nodeId)?.name || waiting.nodeId}' espera ramos que nunca chegam`, waiting.nodeId);
    else end('completed', 'Processo concluído');
  }
  return done({ ...(pending && { pending }) });
}

/** Roda UM caso. Recusa-se (`ok:false`) se o modelo (ou um processo chamado) tem erros de integridade — `blocking` aponta os elementos. */
export function simulate(model: ProcessModel, cfg: SimConfig = {}): SimResult {
  return run(prepare(model, cfg.resolve), cfg);
}

// ------------------------------------------------------------------------------------------------ KPIs
/**
 * KPIs a partir de eventos. Funciona com o trace do simulador OU com eventos reconstruídos de um log real
 * (fase "monitorar"): só precisa de node-entered/node-exited/token-moved/ended (+ `pid` se houver subprocessos).
 * `models` = processos envolvidos por id (raiz + chamados); sem ele só o processo raiz é conhecido.
 */
export function summarize(model: ProcessModel, events: readonly SimEvent[], models?: ReadonlyMap<string, ProcessModel>): SimSummary {
  const all = new Map<string, ProcessModel>(models ?? []);
  all.set(model.id, model);
  const nodeOf = (pid: string | undefined, id: string) => all.get(pid ?? model.id)?.nodes.find((n) => n.id === id);
  const ref = (pid: string | undefined, id: string) => nodeRef(model.id, pid, id);

  const path: string[] = [], seen = new Set<string>(), flowsTaken: string[] = [];
  const byKey = new Map<string, LaneKpi>();
  const perTask = new Map<string, { minutes: number; name: string }>();
  const waits = new Map<string, { nodeId: string; name: string; variant: string; minutes: number }>();
  const slaBreaches: SimSummary['slaBreaches'] = [];
  const calls = new Set<string>(); // subprocessos que mergulharam: a duração/custo próprios viram só piso (ver cabeçalho)
  let totalCost = 0, endKind: EndKind = 'completed';

  for (const e of events) {
    if (e.type === 'subprocess-entered') calls.add(ref(e.pid, e.nodeId));
  }
  for (const e of events) {
    if (e.type === 'node-entered') {
      const r = ref(e.pid, e.nodeId);
      if (!seen.has(r)) { seen.add(r); path.push(r); }
    } else if (e.type === 'token-moved') flowsTaken.push(e.flowId);
    else if (e.type === 'ended') endKind = e.kind;
    else if (e.type === 'node-exited') {
      const n = nodeOf(e.pid, e.nodeId);
      if (!n) continue;
      const r = ref(e.pid, n.id);
      if (isWaitCatch(n)) {
        const w = waits.get(r) ?? { nodeId: r, name: n.name || n.id, variant: n.variant!, minutes: 0 };
        w.minutes += e.durationMin;
        waits.set(r, w);
        continue;
      }
      if ((n.kind !== 'task' && n.kind !== 'subprocess') || calls.has(r)) continue;
      const cost = parseCost(n.cost) ?? 0;
      totalCost += cost;
      const pt = perTask.get(r) ?? { minutes: 0, name: n.name || n.id };
      pt.minutes += e.durationMin;
      perTask.set(r, pt);
      const laneName = all.get(e.pid ?? model.id)?.lanes.find((l) => l.id === n.laneId)?.name;
      const key = n.laneId ?? n.performer ?? '—';
      const k = byKey.get(key) ?? { key, label: laneName || n.performer || '—', minutes: 0, cost: 0, tasks: 0 };
      k.minutes += e.durationMin; k.cost += cost; k.tasks++;
      byKey.set(key, k);
      const slaMin = parseDuration(n.sla);
      if (slaMin !== undefined && e.durationMin > slaMin) {
        slaBreaches.push({ nodeId: r, name: n.name || n.id, sla: n.sla!, slaMinutes: slaMin, actualMinutes: e.durationMin });
      }
    }
  }
  let bottleneck: SimSummary['bottleneck'];
  for (const [id, v] of perTask) if (v.minutes > 0 && (!bottleneck || v.minutes > bottleneck.minutes)) bottleneck = { nodeId: id, name: v.name, minutes: v.minutes };

  // cobertura: sobre TODOS os processos envolvidos (raiz + chamados)
  let tasksTotal = 0, tasksWithDuration = 0, tasksWithCost = 0, waitsTotal = 0, waitsWithDuration = 0, decisionsTotal = 0, decisionsWithProbability = 0, nodesTotal = 0, nodesExercised = 0;
  for (const m of all.values()) {
    const outsOf = new Map<string, ProcessFlow[]>();
    m.flows.filter((f) => f.kind === 'sequence').forEach((f) => outsOf.set(f.sourceId, [...(outsOf.get(f.sourceId) ?? []), f]));
    for (const n of m.nodes) {
      const r = ref(m.id, n.id);
      if ((n.kind === 'task' || n.kind === 'subprocess') && !calls.has(r) && !(n.kind === 'subprocess' && n.calledProcessId && all.has(n.calledProcessId))) {
        tasksTotal++;
        if (parseDuration(n.duration) !== undefined) tasksWithDuration++;
        if (parseCost(n.cost) !== undefined) tasksWithCost++;
      }
      if (isWaitCatch(n)) { waitsTotal++; if (parseDuration(n.duration) !== undefined) waitsWithDuration++; }
      if (isXor(n) && (outsOf.get(n.id)?.length ?? 0) > 1) {
        decisionsTotal++;
        if (outsOf.get(n.id)!.every((f) => f.probability !== undefined)) decisionsWithProbability++;
      }
      if (!NON_FLOW.has(n.kind) && n.kind !== 'boundary') { nodesTotal++; if (seen.has(r)) nodesExercised++; }
    }
  }
  const waitList = [...waits.values()].sort((a, b) => b.minutes - a.minutes);
  return {
    endKind,
    totalMinutes: events.length ? events[events.length - 1]!.t : 0,
    totalCost,
    path,
    flowsTaken,
    byResponsible: [...byKey.values()].sort((a, b) => b.minutes - a.minutes),
    ...(bottleneck && { bottleneck }),
    slaBreaches,
    actionsRequired: events.filter((e) => e.type === 'action-required').length,
    waitMinutes: waitList.reduce((a, w) => a + w.minutes, 0),
    waits: waitList,
    coverage: { tasksTotal, tasksWithDuration, tasksWithCost, waitsTotal, waitsWithDuration, decisionsTotal, decisionsWithProbability, nodesTotal, nodesExercised },
  };
}

// ------------------------------------------------------------------------------------------------ Monte Carlo
export interface Distribution { min: number; mean: number; p50: number; p90: number; p95: number; max: number }
export interface BatchResult {
  ok: boolean;
  blocking: Issue[];
  runs: number;
  endKinds: Partial<Record<EndKind, number>>;
  minutes: Distribution;
  cost: Distribution;
  /** por nó (ver `nodeRef`): % dos casos que passaram por ele */
  visitRate: Record<string, number>;
  /** por tarefa: % dos casos em que estourou o SLA (apenas tarefas com SLA parseável) */
  slaBreachRate: Record<string, number>;
  /** tarefa que mais aparece como gargalo (maior tempo acumulado no caso) */
  bottlenecks: Array<{ nodeId: string; name: string; share: number }>;
  /** variantes de caminho (sequência de nós) mais frequentes */
  variants: Array<{ path: string[]; count: number; share: number }>;
  limitations: string[];
  models: ReadonlyMap<string, ProcessModel>;
}

const dist = (xs: number[]): Distribution => {
  if (!xs.length) return { min: 0, mean: 0, p50: 0, p90: 0, p95: 0, max: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  return { min: s[0]!, mean: s.reduce((a, b) => a + b, 0) / s.length, p50: q(0.5), p90: q(0.9), p95: q(0.95), max: s[s.length - 1]! };
};

/** N casos com sementes `seed..seed+N-1` (reprodutível). Fase "planejar melhorias": compare o resultado antes/depois de mudar o modelo. */
export function simulateBatch(model: ProcessModel, opts: { runs?: number; seed?: number; resolve?: SimConfig['resolve'] } = {}): BatchResult {
  const prep = prepare(model, opts.resolve);
  const runs = Math.max(1, Math.min(opts.runs ?? 500, 20000));
  const base: BatchResult = {
    ok: false, blocking: prep.blocking, runs, endKinds: {}, minutes: dist([]), cost: dist([]),
    visitRate: {}, slaBreachRate: {}, bottlenecks: [], variants: [], limitations: prep.limitations, models: prep.models,
  };
  if (prep.blocking.length) return base;
  const seed = opts.seed ?? 1;
  const mins: number[] = [], costs: number[] = [];
  const visits = new Map<string, number>(), breaches = new Map<string, number>(), bn = new Map<string, { n: number; name: string }>(), var_ = new Map<string, { path: string[]; count: number }>();
  for (let i = 0; i < runs; i++) {
    const r = run(prep, { seed: seed + i, maxEvents: 2000 });
    if (!r.ok) return { ...base, blocking: r.blocking };
    const s = r.summary;
    base.endKinds[s.endKind] = (base.endKinds[s.endKind] ?? 0) + 1;
    mins.push(s.totalMinutes); costs.push(s.totalCost);
    s.path.forEach((id) => visits.set(id, (visits.get(id) ?? 0) + 1));
    new Set(s.slaBreaches.map((b) => b.nodeId)).forEach((id) => breaches.set(id, (breaches.get(id) ?? 0) + 1));
    if (s.bottleneck) { const b = bn.get(s.bottleneck.nodeId); bn.set(s.bottleneck.nodeId, { n: (b?.n ?? 0) + 1, name: s.bottleneck.name }); }
    const key = s.path.join('>');
    const v = var_.get(key) ?? { path: s.path, count: 0 };
    v.count++; var_.set(key, v);
  }
  const rate = (m: Map<string, number>) => Object.fromEntries([...m].map(([k, v]) => [k, v / runs]));
  return {
    ...base, ok: true, blocking: [],
    minutes: dist(mins), cost: dist(costs),
    visitRate: rate(visits), slaBreachRate: rate(breaches),
    bottlenecks: [...bn].map(([nodeId, b]) => ({ nodeId, name: b.name, share: b.n / runs })).sort((a, b) => b.share - a.share),
    variants: [...var_.values()].sort((a, b) => b.count - a.count).slice(0, 10).map((v) => ({ ...v, share: v.count / runs })),
  };
}

/** Formata minutos simulados como "1 d 2 h 30 min" (para UI/relatórios). */
export function formatMinutes(min: number): string {
  if (!(min > 0)) return '0 min';
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = Math.round(min % 60);
  return [d && `${d} d`, h && `${h} h`, (m || (!d && !h)) && `${m} min`].filter(Boolean).join(' ');
}
