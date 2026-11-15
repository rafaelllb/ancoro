// [2026-11-10] Criado: seleção múltipla — mover/alinhar um GRUPO de nós e redimensionar pela borda — Rafael Brito
import { describe, expect, it } from 'vitest';
import { alignMove, idsBetween, idsInBox, layoutModel, moveNodes, resizeLane, resizePool, type ProcessModel } from '../src/index.js';
import { billingSample } from '../src/samples/billing.js';

const model = (): ProcessModel => {
  const m = billingSample();
  return m.nodes.every((n) => n.bounds) ? m : layoutModel(m);
};
const flowNodes = (m: ProcessModel) => m.nodes.filter((n) => n.bounds && n.kind !== 'boundary');

describe('seleção múltipla', () => {
  it('moveNodes desloca todos os nós do grupo pelo mesmo delta', () => {
    const m = model();
    const [a, b] = flowNodes(m);
    const out = moveNodes(m, [a!.id, b!.id], 30, 0);
    const na = out.nodes.find((n) => n.id === a!.id)!.bounds!, nb = out.nodes.find((n) => n.id === b!.id)!.bounds!;
    expect(na.x - a!.bounds!.x).toBe(30);
    expect(nb.x - b!.bounds!.x).toBe(30);
  });

  it('alignMove com grupo não "gruda" nos próprios membros', () => {
    const m = model();
    const [a, b] = flowNodes(m);
    // sem deslocamento, o grupo coincide consigo mesmo: se os membros contassem como "outros", haveria guia em d=0 sempre
    const r = alignMove(m, [a!.id, b!.id], 1, 1, 0.5);
    expect(r.dx).toBe(1);
    expect(r.dy).toBe(1);
  });

  it('alignMove aceita id único (compatível com a assinatura antiga)', () => {
    const m = model();
    const [a] = flowNodes(m);
    expect(alignMove(m, a!.id, 0, 0, 0).dx).toBe(0);
  });
});

describe('Shift+clique (intervalo)', () => {
  it('idsBetween inclui os dois extremos e tudo que está no retângulo entre eles', () => {
    const m = model();
    const nodes = flowNodes(m).sort((p, q) => p.bounds!.x - q.bounds!.x);
    const a = nodes[0]!, b = nodes[nodes.length - 1]!;
    const ids = idsBetween(m, a.id, b.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    // todo nó cujo retângulo cabe na caixa envolvente de a e b entra
    const x = Math.min(a.bounds!.x, b.bounds!.x), y = Math.min(a.bounds!.y, b.bounds!.y);
    const box = { x, y, w: Math.max(a.bounds!.x + a.bounds!.w, b.bounds!.x + b.bounds!.w) - x, h: Math.max(a.bounds!.y + a.bounds!.h, b.bounds!.y + b.bounds!.h) - y };
    for (const id of idsInBox(m, box)) expect(ids).toContain(id);
  });

  it('idsInBox nunca devolve lanes nem o pool', () => {
    const m = model();
    const all = idsInBox(m, { x: -1e6, y: -1e6, w: 2e6, h: 2e6 });
    expect(all.some((id) => id === m.id || m.lanes.some((l) => l.id === id))).toBe(false);
    expect(all.length).toBe(m.nodes.filter((n) => n.bounds).length + m.flows.filter((f) => f.waypoints?.length).length + m.participants.filter((p) => p.bounds).length);
  });
});

describe('redimensionar pela borda', () => {
  it('divisória entre lanes muda a lane de cima e o pool acompanha', () => {
    const m = model();
    const lane = m.lanes.find((l) => l.bounds)!;
    const out = resizeLane(m, lane.id, lane.bounds!.h + 40);
    expect(out.lanes.find((l) => l.id === lane.id)!.bounds!.h).toBe(lane.bounds!.h + 40);
    expect(out.pool!.h).toBe(m.pool!.h + 40);
  });

  it('borda leste do pool alarga pool e lanes', () => {
    const m = model();
    const out = resizePool(m, 'e', 50, 0);
    expect(out.pool!.w).toBe(m.pool!.w + 50);
    out.lanes.forEach((l, i) => l.bounds && expect(l.bounds.w).toBe(m.lanes[i]!.bounds!.w + 50));
  });
});
