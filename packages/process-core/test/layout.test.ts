// [2026-10-14] Criado: testes geométricos do auto-layout (Fase 1) — Rafael Brito
import { describe, expect, it } from 'vitest';
import { canonicalize, fromBpmnXml, layoutModel, parseModel, toBpmnXml, type Bounds, type ProcessModel } from '../src/index.js';
import { billingSample } from '../src/samples/billing.js';

/** Remove toda geometria: simula a saída da IA antes do layout. */
const stripGeometry = (m: ProcessModel): ProcessModel => ({
  ...m, pool: undefined,
  lanes: m.lanes.map(({ bounds: _b, ...l }) => l),
  nodes: m.nodes.map(({ bounds: _b, ...n }) => n),
  flows: m.flows.map(({ waypoints: _w, ...f }) => f),
});
const overlap = (a: Bounds, b: Bounds) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner: Bounds, outer: Bounds) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

describe('layoutModel', () => {
  const laid = layoutModel(stripGeometry(billingSample()));

  it('dá bounds a todos os nós e waypoints a todos os fluxos', () => {
    expect(laid.nodes.every((n) => n.bounds)).toBe(true);
    expect(laid.flows.every((f) => (f.waypoints?.length ?? 0) >= 2)).toBe(true);
    expect(laid.pool && laid.lanes.every((l) => l.bounds)).toBeTruthy();
  });

  it('nenhum par de elementos se sobrepõe', () => {
    const bs = laid.nodes.map((n) => [n.id, n.bounds!] as const);
    const clashes = bs.flatMap(([ia, a], i) => bs.slice(i + 1).filter(([, b]) => overlap(a, b)).map(([ib]) => `${ia}x${ib}`));
    expect(clashes).toEqual([]);
  });

  it('cada nó fica dentro da sua lane, e as lanes dentro do pool', () => {
    for (const n of laid.nodes.filter((x) => x.laneId)) {
      const lane = laid.lanes.find((l) => l.id === n.laneId)!;
      expect(inside(n.bounds!, lane.bounds!), `${n.id} fora de ${lane.id}`).toBe(true);
    }
    for (const l of laid.lanes) expect(inside(l.bounds!, laid.pool!)).toBe(true);
  });

  it('fluxos de sequência vão da esquerda para a direita e todos os segmentos são ortogonais', () => {
    const byId = new Map(laid.nodes.map((n) => [n.id, n.bounds!]));
    for (const f of laid.flows) {
      const w = f.waypoints!;
      w.slice(1).forEach(([x, y], i) => {
        const [px, py] = w[i]!;
        expect(px === x || py === y, `${f.id} tem segmento diagonal`).toBe(true);
      });
      if (f.kind === 'sequence') expect(byId.get(f.targetId)!.x).toBeGreaterThan(byId.get(f.sourceId)!.x);
    }
  });

  it('é determinístico (mesma entrada => mesma saída)', () => {
    expect(layoutModel(stripGeometry(billingSample()))).toEqual(laid);
  });

  it('resultado do layout faz round-trip BPMN sem perda', async () => {
    const { model, warnings } = await fromBpmnXml(await toBpmnXml(laid));
    expect(warnings).toEqual([]);
    expect(canonicalize(model)).toEqual(canonicalize(laid));
  });

  it('funciona sem lanes e trata laço (retorno) sem quebrar', () => {
    const m = layoutModel(parseModel({
      id: 'P', name: 'Laço',
      nodes: [
        { id: 'a', kind: 'start', name: '' }, { id: 'b', kind: 'task', variant: 'user', name: 'Revisar pedido' },
        { id: 'g', kind: 'gateway', variant: 'exclusive', name: 'Ok?' }, { id: 'c', kind: 'end', name: '' },
      ],
      flows: [
        { id: 'f1', sourceId: 'a', targetId: 'b' }, { id: 'f2', sourceId: 'b', targetId: 'g' },
        { id: 'f3', sourceId: 'g', targetId: 'c', name: 'Sim' }, { id: 'f4', sourceId: 'g', targetId: 'b', name: 'Não' },
      ],
    }));
    expect(m.pool).toBeUndefined();
    const back = m.flows.find((f) => f.id === 'f4')!.waypoints!;
    expect(back.length).toBe(4); // contorno por baixo
    expect(m.nodes.every((n) => n.bounds)).toBe(true);
  });
});
