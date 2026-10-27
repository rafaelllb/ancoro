/**
 * Geometria dos RÓTULOS (texto de elementos cujo nome fica FORA da forma: eventos, gateways, dados e fluxos).
 *
 * [2026-10-14] Criado: rótulo como elemento próprio — editável por duplo clique em qualquer ponto do texto e arrastável — Rafael Brito
 * Decisões:
 * - A posição padrão é uma função do elemento (abaixo/acima/meio do fluxo). O usuário só persiste um DESLOCAMENTO (`labelOffset`),
 *   então mover o elemento leva o rótulo junto e "resetar" é apagar o offset.
 * - Fica no core porque serializer/parser (BPMNLabel em coordenadas absolutas do BPMN DI) e o renderer precisam da MESMA conta.
 * - A largura do rótulo é estimada (6,2px/caractere a 12px); o texto real é desenhado centrado nessa caixa.
 */
import type { Bounds, ProcessFlow, ProcessNode } from './model.js';

export const CHAR_W = 6.2;
export const LINE_H = 13;

/** Quebra texto em linhas por largura aproximada de caracteres; trunca com reticências além de maxLines. */
export function wrapText(text: string, maxChars: number, maxLines = 4): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1]!.replace(/.{0,2}$/, '…');
    return kept;
  }
  return lines;
}

/** Ponto no meio (em comprimento) de uma polilinha. */
export function midpoint(pts: ReadonlyArray<readonly [number, number]>): { x: number; y: number } {
  let total = 0;
  const segs = pts.slice(1).map(([x, y], i) => { const [px, py] = pts[i]!; const len = Math.hypot(x - px, y - py); total += len; return { px, py, x, y, len }; });
  let acc = total / 2;
  for (const s of segs) {
    if (acc <= s.len || s === segs[segs.length - 1]) {
      const t = s.len ? acc / s.len : 0;
      return { x: s.px + (s.x - s.px) * t, y: s.py + (s.y - s.py) * t };
    }
    acc -= s.len;
  }
  return { x: pts[0]![0], y: pts[0]![1] };
}

export interface LabelLayout {
  /** caixa do rótulo (já com o deslocamento do usuário aplicado) */
  box: Bounds;
  /** posição padrão (sem deslocamento) — base para calcular/zerar o offset */
  home: Bounds;
  lines: string[];
  /** tamanho da fonte (px) */
  size: number;
}

const OUTSIDE = new Set(['start', 'end', 'intermediate', 'boundary', 'gateway', 'dataObject', 'dataStore']);
export const hasOutsideLabel = (kind: ProcessNode['kind']): boolean => OUTSIDE.has(kind);

const boxSize = (lines: string[], size: number) => ({
  w: Math.max(...lines.map((l) => l.length), 1) * (size === 11 ? 5.7 : CHAR_W) + 8,
  h: lines.length * LINE_H + 4,
});

/** Rótulo de um nó (null se o nome fica dentro da forma, está vazio ou o nó não tem bounds). */
export function nodeLabel(n: ProcessNode): LabelLayout | null {
  if (!hasOutsideLabel(n.kind) || !n.name || !n.bounds) return null;
  const b = n.bounds;
  const cx = b.x + b.w / 2;
  const size = n.kind === 'dataStore' ? 11 : 12;
  const lines = wrapText(n.name, n.kind === 'gateway' ? 20 : n.kind === 'dataStore' ? 26 : 18, n.kind === 'dataStore' ? 4 : 3);
  const { w, h } = boxSize(lines, size);
  const y = n.kind === 'gateway' ? b.y - 6 - LINE_H * lines.length : b.y + b.h + 3; // gateway: acima; demais: abaixo
  const home: Bounds = { x: cx - w / 2, y, w, h };
  const o = n.labelOffset;
  return { home, box: o ? { ...home, x: home.x + o.dx, y: home.y + o.dy } : home, lines, size };
}

/** Rótulo de um fluxo: logo acima do ponto médio da linha. */
export function flowLabel(f: ProcessFlow): LabelLayout | null {
  if (!f.name || !f.waypoints || f.waypoints.length < 2) return null;
  const m = midpoint(f.waypoints);
  const w = f.name.length * CHAR_W + 8;
  const home: Bounds = { x: m.x - w / 2, y: m.y - 17, w, h: 17 };
  const o = f.labelOffset;
  return { home, box: o ? { ...home, x: home.x + o.dx, y: home.y + o.dy } : home, lines: [f.name], size: 11 };
}

/** Deslocamento (arredondado a 0,01) entre uma posição absoluta e a posição padrão; undefined se ~0. */
export function offsetFrom(home: Bounds, abs: { x: number; y: number }): { dx: number; dy: number } | undefined {
  const r = (v: number) => Math.round(v * 100) / 100;
  const dx = r(abs.x - home.x), dy = r(abs.y - home.y);
  return Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 ? undefined : { dx, dy };
}
