/**
 * Geração automática de processos a partir de requisitos (README Process Studio §5.2).
 *
 * [2026-10-27] Criado: JSON intermediário (GenProcess) + conversor determinístico -> ProcessModel com auto-layout — Rafael Brito
 * Pipeline (decisão do README: NUNCA pedir XML/coordenadas ao LLM):
 *   requisitos --(LLM  OU  parser determinístico)--> GenProcess --(buildProcessSet)--> ProcessModel[] --(layoutModel)--> bounds/waypoints
 * Decisões:
 * - Este arquivo é puro (sem rede, sem Ancoro): o LLM mora no backend; aqui só o contrato (schema Zod) e a montagem.
 * - Raias = atores (`lane` dos passos). Cada elemento nasce com `laneId` e o layoutModel o centraliza no meio da raia;
 *   ramificações de uma decisão ficam empilhadas SIMÉTRICAS ao redor do centro quando caem na mesma raia, ou cada uma
 *   no centro da própria raia quando o destino é outra raia (ver test/generate.test.ts).
 * - Convergência: todo elemento com >1 entrada recebe um gateway exclusivo de junção antes dele (boa prática BPMN).
 * - Subprocesso = passo com `child`: vira um processo SEPARADO (drill-down por duplo clique) referenciado por calledProcessId.
 * - Rastreabilidade: cada passo guarda `requirementRefs` (reqId legível) -> projeção ProcessRequirementLink no backend.
 *
 * TODO [ESTIGMERGIA]: profundidade e paralelismo
 * - `child` tem UM nível (subprocesso dentro de subprocesso não é gerado). Gateways paralelos/inclusivos e eventos
 *   intermediários/borda não fazem parte do contrato ainda; o editor permite acrescentá-los depois (revisão humana).
 */
import { z } from 'zod';
import { layoutModel } from './layout.js';
import { parseModel, type ProcessModel } from './model.js';

// ---------------------------------------------------------------- contrato (JSON intermediário)

const Text = (max: number) => z.string().trim().min(1).max(max);

export const GenStepSchema = z.object({
  /** id local do passo (referenciado por `edges`); único dentro do processo */
  id: z.string().trim().min(1).max(40),
  kind: z.enum(['task', 'decision', 'subprocess', 'end']).default('task'),
  name: Text(120),
  /** ator/raia responsável (ex.: "Faturamento", "Sistema ERP"); ausente = herda do passo anterior */
  lane: z.string().trim().max(80).optional(),
  variant: z.enum(['generic', 'user', 'service', 'manual', 'script']).optional(),
  /** reqIds legíveis (ex.: "REQ-003") que originam o passo */
  requirementRefs: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});
export type GenStep = z.infer<typeof GenStepSchema>;

export const GenEdgeSchema = z.object({
  from: z.string().trim().min(1).max(40),
  to: z.string().trim().min(1).max(40),
  /** rótulo do ramo (ex.: "Sim", "Não", "Crédito reprovado") */
  label: z.string().trim().max(60).optional(),
});
export type GenEdge = z.infer<typeof GenEdgeSchema>;

const ProcessBody = {
  name: Text(200),
  steps: z.array(GenStepSchema).min(1).max(60),
  /** vazio => os passos são encadeados na ordem em que aparecem */
  edges: z.array(GenEdgeSchema).max(150).default([]),
};
/** Detalhe de um subprocesso (um nível). */
export const GenChildSchema = z.object(ProcessBody);
export const GenProcessSchema = z.object({
  ...ProcessBody,
  /** detalhe por passo `subprocess`: chave = id do passo */
  children: z.record(z.string(), GenChildSchema).default({}),
});
export type GenChild = z.infer<typeof GenChildSchema>;
export type GenProcess = z.infer<typeof GenProcessSchema>;

/** Valida a saída de um LLM/parser. Lança ZodError se a forma estiver errada. */
export const parseGenProcess = (input: unknown): GenProcess => GenProcessSchema.parse(input);

// ---------------------------------------------------------------- montagem

const SYSTEM_RE = /\b(sistema|sap|erp|crm|api|integra[cç][aã]o|autom[aá]tic|batch|job|interface|portal|middleware)\b/i;
const isNo = (label?: string) => !!label && /^(n[aã]o|sen[aã]o|se n[aã]o|caso contr[aá]rio|outros?|default|padr[aã]o)\b/i.test(label.trim());

interface Draft { id: string; kind: 'start' | 'end' | 'task' | 'gateway' | 'subprocess'; name: string; lane?: string; variant?: string; refs: string[]; child?: string }
interface Link { from: string; to: string; label?: string; isDefault?: boolean }

/** Normaliza o grafo de um GenProcess: encadeia se não há arestas, remove arestas inválidas, decide início/fim, insere junções. */
function normalizeGraph(p: GenChild): { nodes: Draft[]; links: Link[] } {
  const steps = p.steps;
  const ids = new Set(steps.map((s) => s.id));
  let edges = p.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  if (!edges.length) edges = steps.slice(1).map((s, i) => ({ from: steps[i]!.id, to: s.id }));
  const dedup = new Map(edges.map((e) => [`${e.from}>${e.to}`, e]));
  edges = [...dedup.values()];

  const out = (id: string) => edges.filter((e) => e.from === id);
  const nodes: Draft[] = steps.map((s) => ({
    id: s.id, name: s.name, lane: s.lane, refs: s.requirementRefs, variant: s.variant,
    // decisão com <2 saídas é só uma tarefa (gateway de uma saída não decide nada)
    kind: s.kind === 'decision' ? (out(s.id).length >= 2 ? 'gateway' : 'task') : s.kind === 'subprocess' ? 'subprocess' : s.kind === 'end' ? 'end' : 'task',
  }));

  const hasIn = new Set(edges.map((e) => e.to));
  const entry = steps.find((s) => !hasIn.has(s.id))?.id ?? steps[0]!.id; // sem origem clara (ciclo): o 1º passo
  const links: Link[] = edges.map((e) => ({ from: e.from, to: e.to, label: e.label }));
  links.push({ from: '__start', to: entry });

  // fins: passos sem saída (e que não são "end") ligam ao fim único
  const needEnd = nodes.filter((n) => n.kind !== 'end' && !links.some((l) => l.from === n.id));
  const hasExplicitEnd = nodes.some((n) => n.kind === 'end');
  if (needEnd.length || !hasExplicitEnd) {
    nodes.push({ id: '__end', kind: 'end', name: '', refs: [] });
    for (const n of needEnd) links.push({ from: n.id, to: '__end' });
  }
  nodes.unshift({ id: '__start', kind: 'start', name: '', refs: [] });

  // junção: elemento com >1 entrada de sequência ganha gateway exclusivo antes
  let merge = 0;
  for (const n of [...nodes]) {
    const incoming = links.filter((l) => l.to === n.id);
    if (incoming.length < 2 || n.kind === 'start') continue;
    const m: Draft = { id: `__merge${++merge}`, kind: 'gateway', name: '', refs: [] };
    nodes.splice(nodes.indexOf(n), 0, m);
    for (const l of incoming) l.to = m.id;
    links.push({ from: m.id, to: n.id });
  }

  // fluxo padrão das decisões: o ramo "não/senão" ou, na falta, o último
  for (const n of nodes.filter((x) => x.kind === 'gateway' && x.name)) {
    const outs = links.filter((l) => l.from === n.id);
    (outs.find((l) => isNo(l.label)) ?? outs[outs.length - 1])!.isDefault = true;
  }
  return { nodes, links };
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 12) || 'X';

/** Monta UM processo (sem geometria => layoutModel) a partir do grafo normalizado. `childKeys`: id do passo -> chave do processo filho. */
function buildOne(id: string, name: string, p: GenChild, childKeys: Map<string, string>): ProcessModel {
  const { nodes, links } = normalizeGraph(p);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // raias: ordem de 1ª aparição; passo sem ator herda do predecessor (propagação) e, no fim, da 1ª raia
  const laneOf = new Map<string, string>();
  for (const n of nodes) if (n.lane) laneOf.set(n.id, n.lane);
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const l of links) {
      if (laneOf.has(l.from) && !laneOf.has(l.to) && byId.get(l.to)!.kind !== 'start') { laneOf.set(l.to, laneOf.get(l.from)!); changed = true; }
    }
    if (!changed) break;
  }
  // [2026-10-27] junção (gateway sem nome) fica na raia do elemento que ela alimenta: o fluxo principal segue reto no centro
  // da raia e só o ramo que vem de outra raia "sobe/desce" até ela — em vez de a junção cair na raia do ramo
  for (const n of nodes) {
    if (!n.id.startsWith('__merge')) continue;
    const target = links.find((l) => l.from === n.id)?.to;
    if (target && laneOf.has(target)) laneOf.set(n.id, laneOf.get(target)!);
  }
  // início herda do 1º destino; o que ainda faltar (ciclos/órfãos) herda da 1ª raia conhecida
  const firstTarget = links.find((l) => l.from === '__start')!.to;
  if (!laneOf.has('__start') && laneOf.has(firstTarget)) laneOf.set('__start', laneOf.get(firstTarget)!);
  const fallback = [...laneOf.values()][0] ?? 'Processo';
  const laneNames = [...new Set(nodes.map((n) => laneOf.get(n.id) ?? fallback))];
  const laneId = new Map(laneNames.map((l, i) => [l, `Lane_${i + 1}_${slug(l)}`]));

  // ids legíveis e únicos por tipo
  const count: Record<string, number> = {};
  const newId = (prefix: string) => `${prefix}_${(count[prefix] = (count[prefix] ?? 0) + 1)}`;
  const idMap = new Map<string, string>();
  for (const n of nodes) idMap.set(n.id, n.kind === 'start' ? newId('Start') : n.kind === 'end' ? newId('End') : n.kind === 'gateway' ? newId('Gateway') : n.kind === 'subprocess' ? newId('Sub') : newId('Task'));

  const raw = {
    id, name,
    lanes: laneNames.map((l) => ({ id: laneId.get(l)!, name: l })),
    nodes: nodes.map((n) => {
      const lane = laneOf.get(n.id) ?? fallback;
      const base = { id: idMap.get(n.id)!, name: n.name, laneId: laneId.get(lane)!, requirementRefs: n.refs };
      if (n.kind === 'start') return { ...base, kind: 'start', variant: 'none' };
      if (n.kind === 'end') return { ...base, kind: 'end', variant: 'none' };
      if (n.kind === 'gateway') return { ...base, kind: 'gateway', variant: 'exclusive' };
      if (n.kind === 'subprocess') return { ...base, kind: 'subprocess', ...(childKeys.has(n.id) && { calledProcessId: childKeys.get(n.id) }) };
      return { ...base, kind: 'task', variant: n.variant ?? (SYSTEM_RE.test(lane) || SYSTEM_RE.test(n.name) ? 'service' : 'user') };
    }),
    flows: links.map((l, i) => ({
      id: `Flow_${i + 1}`, kind: 'sequence', sourceId: idMap.get(l.from)!, targetId: idMap.get(l.to)!,
      ...(l.label && { name: l.label }), isDefault: !!l.isDefault,
    })),
  };
  return layoutModel(parseModel(raw));
}

export interface BuildOptions {
  /** chaves (ids) de processos já existentes no projeto — as novas nunca colidem */
  existingKeys: ReadonlyArray<string>;
}

/**
 * Converte um GenProcess em modelos prontos para salvar: o principal (índice 0) seguido dos subprocessos detalhados.
 * Chaves `Process_N` livres; calledProcessId do pai aponta para a chave do filho.
 */
export function buildProcessSet(gen: GenProcess, { existingKeys }: BuildOptions): ProcessModel[] {
  const used = new Set(existingKeys);
  const alloc = () => { let i = 1; while (used.has(`Process_${i}`)) i++; const k = `Process_${i}`; used.add(k); return k; };
  const mainKey = alloc();
  const childKeys = new Map<string, string>();
  const childModels: ProcessModel[] = [];
  for (const s of gen.steps) {
    const detail = s.kind === 'subprocess' ? gen.children[s.id] : undefined;
    if (!detail) continue;
    const key = alloc();
    childKeys.set(s.id, key);
    childModels.push(buildOne(key, detail.name || s.name, detail, new Map()));
  }
  return [buildOne(mainKey, gen.name, gen, childKeys), ...childModels];
}
