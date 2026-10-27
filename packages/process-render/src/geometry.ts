/**
 * Utilitários geométricos/textuais do canvas.
 * [2026-10-14] Criado: Fase 2 / etapa 1 (renderizador somente leitura) — Rafael Brito
 */
import type { Bounds, ProcessModel } from '@ancoro/process-core';

// [2026-10-14] Alterado: wrapText/midpoint vivem no core (labels.ts) — a mesma conta serve ao serializer BPMN e ao renderer — Rafael Brito
export { wrapText, midpoint } from '@ancoro/process-core';

export const center = (b: Bounds): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];

/** Caixa que envolve todo o desenho (nós, lanes, pools, participantes, waypoints), com margem. */
export function contentBounds(m: ProcessModel, margin = 40): Bounds {
  const xs: number[] = [], ys: number[] = [];
  const add = (b?: Bounds) => { if (b) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); } };
  add(m.pool);
  m.lanes.forEach((l) => add(l.bounds));
  m.participants.forEach((p) => add(p.bounds));
  m.nodes.forEach((n) => add(n.bounds));
  m.flows.forEach((f) => f.waypoints?.forEach(([x, y]) => { xs.push(x); ys.push(y); }));
  if (!xs.length) return { x: 0, y: 0, w: 800, h: 600 };
  const x = Math.min(...xs) - margin, y = Math.min(...ys) - margin;
  return { x, y, w: Math.max(...xs) + margin - x, h: Math.max(...ys) + margin - y };
}

/** Polilinha como atributo `d` de path SVG. */
export const toPath = (pts: ReadonlyArray<readonly [number, number]>): string =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
