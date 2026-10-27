/**
 * Prepara o que o portal precisa a partir dos modelos: payload por processo (carregado sob demanda), árvore de navegação e índice de busca.
 *
 * [2026-10-14] Criado: Fase 3 — dados do portal — Rafael Brito
 * Princípios:
 * - Funções PURAS e determinísticas (mesma entrada => mesmos bytes): ordenação explícita, nenhuma data/aleatoriedade.
 * - O payload carrega TEXTO, nunca HTML: o viewer usa textContent. O único HTML é o SVG gerado por nós (renderToStaticMarkup escapa os nomes).
 * - Posição/waypoints ficam só no SVG; o payload leva o que o painel exibe (propriedades, atributos, ligações).
 */
import type { AttributeDef, AttrValue, ProcessModel, ProcessNode } from '@ancoro/process-core';

export interface AttrOut { name: string; type: AttributeDef['type'] | 'free'; value: AttrValue; columns?: string[]; columnTypes?: string[] }

export interface ElementInfo {
  id: string;
  kind: string;
  variant?: string;
  name: string;
  lane?: string;
  description?: string;
  documentation?: string;
  url?: string;
  performer?: string; accountable?: string; consulted?: string[]; informed?: string[]; systems?: string[];
  sla?: string; duration?: string; cost?: string; priority?: string; loop?: string; sapTransaction?: string;
  inputs?: string[]; outputs?: string[]; rules?: string[];
  requirements?: string[];
  attributes?: AttrOut[];
  /** subprocesso que chama outro processo do portal */
  called?: { id: string; name: string };
  /** ligações de/para (sequência) com o nome do outro extremo */
  in?: Array<{ id: string; name: string; label?: string }>;
  out?: Array<{ id: string; name: string; label?: string }>;
  /** fluxos */
  from?: string; to?: string; condition?: string; probability?: number; isDefault?: boolean;
  attached?: string;
}

export interface ProcessPayload {
  id: string;
  name: string;
  /** SVG pronto (gerado pelo renderer compartilhado) */
  svg: string;
  size: { w: number; h: number };
  meta: { description?: string; documentation?: string; author?: string; owner?: string; version?: string; tags: string[]; createdAt?: string; modifiedAt?: string };
  /** ids na ordem de leitura (esquerda->direita, cima->baixo) */
  order: string[];
  elements: Record<string, ElementInfo>;
  lanes: string[];
}

const opt = <T>(v: T | undefined | null | '' | never[]): T | undefined => (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ? undefined : (v as T));

/** Ordem de leitura estável: por linha de lane (y) e depois x; desempate por id. */
function readingOrder(m: ProcessModel): ProcessNode[] {
  return [...m.nodes].sort((a, b) => {
    const ay = a.bounds ? a.bounds.y + a.bounds.h / 2 : 0, by = b.bounds ? b.bounds.y + b.bounds.h / 2 : 0;
    const ax = a.bounds?.x ?? 0, bx = b.bounds?.x ?? 0;
    // agrupa por "faixa" de 60px para que elementos da mesma linha sejam ordenados por x
    const rowA = Math.round(ay / 60), rowB = Math.round(by / 60);
    return rowA - rowB || ax - bx || a.id.localeCompare(b.id);
  });
}

export function buildPayload(m: ProcessModel, svg: string, size: { w: number; h: number }, all: ReadonlyMap<string, ProcessModel>): ProcessPayload {
  const nameOf = (id: string): string => m.nodes.find((n) => n.id === id)?.name || m.participants.find((p) => p.id === id)?.name || (id === m.id ? m.name : id);
  const laneName = new Map(m.lanes.map((l) => [l.id, l.name]));
  const defs = new Map(m.attributeDefs.map((d) => [d.id, d]));
  const elements: Record<string, ElementInfo> = {};

  for (const n of m.nodes) {
    const called = n.calledProcessId ? all.get(n.calledProcessId) : undefined;
    const attrs: AttrOut[] = n.attributes.map((a) => {
      const d = a.defId ? defs.get(a.defId) : undefined;
      return d
        ? { name: d.name, type: d.type, value: a.value, ...(d.type === 'table' && { columns: d.columns.map((c) => c.name), columnTypes: d.columns.map((c) => c.type) }) }
        : { name: a.name, type: 'free' as const, value: a.value };
    });
    const ins = m.flows.filter((f) => f.kind === 'sequence' && f.targetId === n.id).map((f) => ({ id: f.sourceId, name: nameOf(f.sourceId), ...(f.name && { label: f.name }) }));
    const outs = m.flows.filter((f) => f.kind === 'sequence' && f.sourceId === n.id).map((f) => ({ id: f.targetId, name: nameOf(f.targetId), ...(f.name && { label: f.name }) }));
    const info: ElementInfo = {
      id: n.id, kind: n.kind, name: n.name,
      ...(n.variant && n.variant !== 'generic' && { variant: n.variant }),
      ...(n.laneId && laneName.get(n.laneId) && { lane: laneName.get(n.laneId) }),
      description: opt(n.description), documentation: opt(n.documentation), url: opt(n.url),
      performer: opt(n.performer), accountable: opt(n.accountable), consulted: opt(n.consulted), informed: opt(n.informed), systems: opt(n.systems),
      sla: opt(n.sla), duration: opt(n.duration), cost: opt(n.cost), priority: opt(n.priority), loop: n.loop !== 'none' ? n.loop : undefined, sapTransaction: opt(n.sapTransaction),
      inputs: opt(n.inputs), outputs: opt(n.outputs), rules: opt(n.rules), requirements: opt(n.requirementRefs),
      attributes: opt(attrs),
      called: called ? { id: called.id, name: called.name } : undefined,
      in: opt(ins), out: opt(outs),
      attached: n.attachedToId ? nameOf(n.attachedToId) : undefined,
    };
    elements[n.id] = stripUndefined(info);
  }
  for (const f of m.flows) {
    elements[f.id] = stripUndefined({
      id: f.id, kind: f.kind, name: f.name ?? '', from: nameOf(f.sourceId), to: nameOf(f.targetId),
      description: opt(f.description), documentation: opt(f.documentation), condition: opt(f.condition), probability: f.probability,
      isDefault: f.isDefault || undefined,
    } as ElementInfo);
  }
  for (const l of m.lanes) elements[l.id] = { id: l.id, kind: 'lane', name: l.name, ...(l.description && { description: l.description }) };
  for (const p of m.participants) elements[p.id] = { id: p.id, kind: 'participant', name: p.name, ...(p.description && { description: p.description }) };

  return {
    id: m.id, name: m.name, svg, size,
    meta: stripUndefined({ ...m.meta, tags: m.meta.tags }) as ProcessPayload['meta'],
    order: readingOrder(m).map((n) => n.id),
    elements,
    lanes: m.lanes.map((l) => l.name),
  };
}

function stripUndefined<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

// ---------------------------------------------------------------------------------------------- árvore de navegação

export interface TreeNode { id: string; name: string; children: string[]; parent?: string }

/**
 * Hierarquia pelos subprocessos que chamam outros processos (calledProcessId). Raízes = processos que ninguém chama.
 * Ciclos são cortados (um processo aparece uma vez, sob o primeiro pai na ordem estável). Processos soltos viram raízes.
 */
export function buildTree(models: ProcessModel[]): { nodes: Record<string, TreeNode>; roots: string[] } {
  const ids = new Set(models.map((m) => m.id));
  const nodes: Record<string, TreeNode> = {};
  for (const m of models) nodes[m.id] = { id: m.id, name: m.name, children: [] };
  const called = new Set<string>();
  const sorted = [...models].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const attach = (parent: ProcessModel) => {
    for (const n of readingOrder(parent)) {
      const c = n.calledProcessId;
      if (!c || !ids.has(c) || c === parent.id) continue;
      if (nodes[c]!.parent || called.has(c)) continue; // já tem pai: primeiro vence
      // evita ciclo: o novo pai não pode ser descendente do filho
      let anc: string | undefined = parent.id;
      let cycle = false;
      while (anc) { if (anc === c) { cycle = true; break; } anc = nodes[anc]!.parent; }
      if (cycle) continue;
      nodes[c]!.parent = parent.id;
      nodes[parent.id]!.children.push(c);
      called.add(c);
    }
  };
  for (const m of sorted) attach(m);
  const roots = sorted.filter((m) => !nodes[m.id]!.parent).map((m) => m.id);
  return { nodes, roots };
}

// ---------------------------------------------------------------------------------------------- busca

export interface SearchIndex {
  /** [processId, elementId | '', título, tipo, trecho] */
  docs: Array<[string, string, string, string, string]>;
  /** token -> [docIdx, peso][] (ordenado) */
  terms: Record<string, Array<[number, number]>>;
}

/** minúsculas, sem acentos; separa por não-alfanumérico (mantém códigos como EA00, F2185). */
export function tokenize(text: string): string[] {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}

const W = { name: 5, code: 4, who: 3, desc: 2, text: 1 } as const;

export function buildSearchIndex(models: ProcessModel[], payloads: ReadonlyMap<string, ProcessPayload>): SearchIndex {
  const docs: SearchIndex['docs'] = [];
  const terms = new Map<string, Map<number, number>>();
  const add = (doc: number, text: string | undefined, w: number) => {
    if (!text) return;
    for (const t of new Set(tokenize(text))) {
      let m = terms.get(t);
      if (!m) terms.set(t, (m = new Map()));
      m.set(doc, Math.max(m.get(doc) ?? 0, w));
    }
  };
  const snippet = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const textOf = (v: AttrValue): string => (typeof v === 'string' ? (v.startsWith('data:') ? '' : v) : v.flat().join(' '));

  for (const m of [...models].sort((a, b) => a.id.localeCompare(b.id))) {
    const p = payloads.get(m.id)!;
    const pd = docs.push([m.id, '', m.name, 'process', snippet(m.meta.description)]) - 1;
    add(pd, m.name, W.name + 2); add(pd, m.meta.description, W.desc); // nome de PROCESSO pesa mais: "Meter Reading" deve achar o processo antes de uma tarefa que cita o termo add(pd, m.meta.tags.join(' '), W.who); add(pd, m.meta.documentation, W.text); add(pd, m.meta.author, W.who);
    for (const id of [...p.order, ...m.flows.map((f) => f.id)]) {
      const e = p.elements[id];
      if (!e || !(e.name || e.description || e.documentation)) continue;
      const d = docs.push([m.id, id, e.name || id, e.kind, snippet(e.description ?? e.documentation)]) - 1;
      add(d, e.name, W.name); add(d, e.sapTransaction, W.code);
      add(d, [e.performer, e.accountable, ...(e.consulted ?? []), ...(e.informed ?? []), ...(e.systems ?? [])].filter(Boolean).join(' '), W.who);
      add(d, (e.requirements ?? []).join(' '), W.code);
      add(d, e.description, W.desc); add(d, e.documentation, W.text);
      add(d, [...(e.inputs ?? []), ...(e.outputs ?? []), ...(e.rules ?? [])].join(' '), W.text);
      for (const a of e.attributes ?? []) { add(d, a.name, W.who); add(d, textOf(a.value), W.text); }
    }
  }
  const out: SearchIndex['terms'] = {};
  for (const t of [...terms.keys()].sort()) out[t] = [...terms.get(t)!.entries()].sort((a, b) => a[0] - b[0]);
  return { docs, terms: out };
}
