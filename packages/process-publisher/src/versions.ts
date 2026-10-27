/**
 * Histórico de publicações e DIFF entre elas ("o que mudou desde a última publicação").
 *
 * [2026-10-14] Criado: Fase 3 — versionamento do portal — Rafael Brito
 * Como funciona sem guardar modelos antigos: cada publicação grava no `versions.json` um SNAPSHOT semântico compacto
 * (por elemento: tipo, nome e os campos relevantes como texto). Na publicação seguinte comparamos o snapshot novo com o último.
 * - Só mudança SEMÂNTICA conta: mover um elemento/ajustar uma linha (geometria) não gera versão nova.
 * - Republicar sem mudanças é idempotente: nenhuma versão nova, mesmos bytes.
 *
 * TODO [ESTIGMERGIA]: diff estrutural de modelos no core
 * - Este diff compara snapshots textuais. Para a Fase 4 (versões no Ancoro) promover para `diffModels(prev,next)` no process-core,
 *   reaproveitando `semanticFields` abaixo, e mostrar o diff VISUAL no editor (elementos adicionados/removidos/alterados coloridos).
 */
import type { ProcessModel } from '@ancoro/process-core';

export interface ElementSnap { k: string; n: string; f: Record<string, string> }
export interface ProcessSnap { name: string; elements: Record<string, ElementSnap> }
export type Snapshot = Record<string, ProcessSnap>;

export interface ProcessChange {
  id: string; name: string; status: 'added' | 'removed' | 'changed';
  added: Array<{ id: string; name: string; kind: string }>;
  removed: Array<{ id: string; name: string; kind: string }>;
  changed: Array<{ id: string; name: string; kind: string; fields: string[] }>;
}
export interface VersionEntry {
  version: number;
  label?: string;
  publishedAt?: string;
  summary: { processesAdded: number; processesRemoved: number; elementsAdded: number; elementsRemoved: number; elementsChanged: number };
  changes: ProcessChange[];
}
export interface VersionsFile { v: 1; snapshot: Snapshot; versions: VersionEntry[] }

const MAX_LEN = 600;
const str = (v: unknown): string => {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN)}…#${s.length}` : s; // texto muito longo: guarda o começo + tamanho (suficiente p/ detectar mudança na maioria dos casos)
};

/** Campos semânticos (sem geometria) de cada elemento, como texto. */
export function snapshotOf(models: ProcessModel[]): Snapshot {
  const out: Snapshot = {};
  for (const m of [...models].sort((a, b) => a.id.localeCompare(b.id))) {
    const lane = new Map(m.lanes.map((l) => [l.id, l.name]));
    const nameOf = (id: string) => m.nodes.find((n) => n.id === id)?.name || m.participants.find((p) => p.id === id)?.name || id;
    const defs = new Map(m.attributeDefs.map((d) => [d.id, d.name]));
    const els: Record<string, ElementSnap> = {};
    for (const n of m.nodes) {
      els[n.id] = {
        k: n.kind, n: n.name,
        f: Object.fromEntries(Object.entries({
          name: n.name, kind: n.kind, variant: n.variant, lane: n.laneId ? lane.get(n.laneId) : '', description: n.description, documentation: n.documentation, url: n.url,
          performer: n.performer, accountable: n.accountable, consulted: n.consulted, informed: n.informed, systems: n.systems,
          sla: n.sla, duration: n.duration, cost: n.cost, priority: n.priority, loop: n.loop === 'none' ? '' : n.loop, sapTransaction: n.sapTransaction,
          inputs: n.inputs, outputs: n.outputs, rules: n.rules, requirements: n.requirementRefs, calls: n.calledProcessId, attachedTo: n.attachedToId ? nameOf(n.attachedToId) : '',
          attributes: n.attributes.map((a) => [a.defId ? defs.get(a.defId) ?? a.name : a.name, a.value]),
        }).map(([k, v]) => [k, str(v)]).filter(([, v]) => v !== '')),
      };
    }
    for (const f of m.flows) {
      els[f.id] = {
        k: f.kind, n: f.name ?? '',
        f: Object.fromEntries(Object.entries({ name: f.name, from: nameOf(f.sourceId), to: nameOf(f.targetId), condition: f.condition, probability: f.probability, default: f.isDefault ? 'sim' : '', description: f.description, documentation: f.documentation })
          .map(([k, v]) => [k, str(v)]).filter(([, v]) => v !== '')),
      };
    }
    for (const l of m.lanes) els[l.id] = { k: 'lane', n: l.name, f: { name: l.name, ...(l.description && { description: l.description }) } };
    for (const p of m.participants) els[p.id] = { k: 'participant', n: p.name, f: { name: p.name, ...(p.description && { description: p.description }) } };
    out[m.id] = { name: m.name, elements: els };
  }
  return out;
}

const MAX_ITEMS = 300; // por processo/lista: o portal não precisa de um catálogo infinito de mudanças

export function diffSnapshots(prev: Snapshot, next: Snapshot): ProcessChange[] {
  const changes: ProcessChange[] = [];
  for (const id of [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort()) {
    const a = prev[id], b = next[id];
    if (!a && b) { changes.push({ id, name: b.name, status: 'added', added: [], removed: [], changed: [] }); continue; }
    if (a && !b) { changes.push({ id, name: a.name, status: 'removed', added: [], removed: [], changed: [] }); continue; }
    if (!a || !b) continue;
    const added: ProcessChange['added'] = [], removed: ProcessChange['removed'] = [], changed: ProcessChange['changed'] = [];
    for (const eid of Object.keys(b.elements).sort()) {
      const nb = b.elements[eid]!, na = a.elements[eid];
      if (!na) { added.push({ id: eid, name: nb.n, kind: nb.k }); continue; }
      const keys = [...new Set([...Object.keys(na.f), ...Object.keys(nb.f)])].sort();
      const fields = keys.filter((k) => (na.f[k] ?? '') !== (nb.f[k] ?? ''));
      if (fields.length) changed.push({ id: eid, name: nb.n || na.n, kind: nb.k, fields });
    }
    for (const eid of Object.keys(a.elements).sort()) if (!b.elements[eid]) removed.push({ id: eid, name: a.elements[eid]!.n, kind: a.elements[eid]!.k });
    const renamed = a.name !== b.name;
    if (added.length || removed.length || changed.length || renamed) {
      changes.push({ id, name: b.name, status: 'changed', added: added.slice(0, MAX_ITEMS), removed: removed.slice(0, MAX_ITEMS), changed: changed.slice(0, MAX_ITEMS) });
    }
  }
  return changes;
}

const summarize = (c: ProcessChange[]): VersionEntry['summary'] => ({
  processesAdded: c.filter((x) => x.status === 'added').length, processesRemoved: c.filter((x) => x.status === 'removed').length,
  elementsAdded: c.reduce((a, x) => a + x.added.length, 0), elementsRemoved: c.reduce((a, x) => a + x.removed.length, 0), elementsChanged: c.reduce((a, x) => a + x.changed.length, 0),
});

/**
 * Próximo estado do histórico. Sem `previous` => versão 1 (linha de base, sem lista de mudanças).
 * Sem mudança semântica => devolve `previous` intacto (republicação idempotente).
 */
export function nextVersions(previous: VersionsFile | undefined, models: ProcessModel[], opts: { label?: string; publishedAt?: string } = {}): VersionsFile {
  const snapshot = snapshotOf(models);
  if (!previous) return { v: 1, snapshot, versions: [{ version: 1, ...(opts.label && { label: opts.label }), ...(opts.publishedAt && { publishedAt: opts.publishedAt }), summary: summarize([]), changes: [] }] };
  const changes = diffSnapshots(previous.snapshot, snapshot);
  if (!changes.length) return previous;
  const last = previous.versions[previous.versions.length - 1]?.version ?? 0;
  const entry: VersionEntry = { version: last + 1, ...(opts.label && { label: opts.label }), ...(opts.publishedAt && { publishedAt: opts.publishedAt }), summary: summarize(changes), changes };
  return { v: 1, snapshot, versions: [...previous.versions, entry].slice(-30) };
}
