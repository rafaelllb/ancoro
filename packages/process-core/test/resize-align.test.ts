// [2026-10-15] Criado: redimensionar para qualquer lado e ímã de alinhamento (movimento livre) — Rafael Brito
import { describe, expect, it } from 'vitest';
import { alignMove, addNode, isResizable, moveNodes, resizeNode, resizedBounds, validateModel } from '../src/index.js';
import { billingSample } from '../src/samples/billing.js';

const task = (m: ReturnType<typeof billingSample>) => m.nodes.find((n) => n.kind === 'task' && n.bounds)!;

describe('resizeNode', () => {
  it('cada alça move só as bordas certas e mantém a oposta fixa', () => {
    const b = { x: 100, y: 100, w: 120, h: 70 };
    const min = { w: 60, h: 40 };
    expect(resizedBounds(b, 'e', 30, 99, min)).toEqual({ x: 100, y: 100, w: 150, h: 70 });
    expect(resizedBounds(b, 'w', -30, 0, min)).toEqual({ x: 70, y: 100, w: 150, h: 70 });
    expect(resizedBounds(b, 'nw', -10, -20, min)).toEqual({ x: 90, y: 80, w: 130, h: 90 });
    expect(resizedBounds(b, 'se', 5, 5, min)).toEqual({ x: 100, y: 100, w: 125, h: 75 });
  });
  it('respeita o mínimo sem deslocar a borda oposta', () => {
    const r = resizedBounds({ x: 100, y: 100, w: 120, h: 70 }, 'w', 500, 0, { w: 60, h: 40 });
    expect(r.w).toBe(60);
    expect(r.x + r.w).toBe(220);
  });
  it('redimensiona tarefa, reroteia fluxos ligados e mantém o modelo íntegro', () => {
    const m = billingSample();
    const t = task(m);
    const out = resizeNode(m, t.id, 'se', 40, 20);
    const nb = out.nodes.find((n) => n.id === t.id)!.bounds!;
    expect(nb.w).toBe(t.bounds!.w + 40);
    expect(nb.h).toBe(t.bounds!.h + 20);
    const bad = validateModel(out).filter((i) => ['DUPLICATE_ID', 'FLOW_DANGLING', 'BOUNDARY_NO_HOST'].includes(i.code));
    expect(bad).toEqual([]);
    // todo fluxo que toca a tarefa continua com a ponta NA borda nova
    for (const f of out.flows.filter((f) => f.sourceId === t.id || f.targetId === t.id)) {
      const wp = f.waypoints!, p = f.sourceId === t.id ? wp[0]! : wp[wp.length - 1]!;
      const onEdge = (Math.abs(p[0] - nb.x) < 1 || Math.abs(p[0] - (nb.x + nb.w)) < 1 || Math.abs(p[1] - nb.y) < 1 || Math.abs(p[1] - (nb.y + nb.h)) < 1);
      expect(onEdge).toBe(true);
    }
  });
  it('eventos e gateways têm forma fixa', () => {
    const m = billingSample();
    const ev = m.nodes.find((n) => n.kind === 'start')!;
    expect(isResizable(m, ev.id)).toBe(false);
    expect(resizeNode(m, ev.id, 'e', 50, 0)).toBe(m);
    expect(isResizable(m, task(m).id)).toBe(true);
  });
  it('boundary acompanha a borda proporcionalmente', () => {
    const base = billingSample();
    const host = task(base);
    const a = addNode(base, { kind: 'boundary', attachedToId: host.id, at: { x: 0, y: 0 } });
    const before = a.model.nodes.find((n) => n.id === a.id)!.bounds!;
    const out = resizeNode(a.model, host.id, 'se', 60, 0);
    const after = out.nodes.find((n) => n.id === a.id)!.bounds!;
    const h0 = host.bounds!, h1 = out.nodes.find((n) => n.id === host.id)!.bounds!;
    const rel = (b: typeof before, h: typeof h0) => (b.x + b.w / 2 - h.x) / h.w;
    expect(rel(after, h1)).toBeCloseTo(rel(before, h0), 5);
  });
});

describe('alignMove', () => {
  it('encosta o centro no centro de outro elemento dentro do limiar e devolve a guia', () => {
    const m = billingSample();
    const [a, b] = m.nodes.filter((n) => n.kind === 'task' && n.bounds);
    const ca = a!.bounds!.y + a!.bounds!.h / 2, cb = b!.bounds!.y + b!.bounds!.h / 2;
    const raw = (cb - ca) + 3; // 3px de diferença do alinhamento perfeito
    const r = alignMove(m, a!.id, 0, raw, 6);
    expect(r.dy).toBeCloseTo(cb - ca, 5);
    expect(r.guides.some((g) => g.axis === 'y')).toBe(true);
    // e depois de mover, os centros batem (conexão reta)
    const moved = moveNodes(m, [a!.id], r.dx, r.dy).nodes.find((n) => n.id === a!.id)!.bounds!;
    expect(moved.y + moved.h / 2).toBeCloseTo(cb, 5);
  });
  it('fora do limiar não mexe', () => {
    const m = billingSample();
    const a = task(m);
    const r = alignMove(m, a.id, 1000.5, 777.5, 6);
    expect(r.dx).toBe(1000.5);
    expect(r.dy).toBe(777.5);
    expect(r.guides).toEqual([]);
  });
});
