/**
 * Gera um HTML com o resultado do auto-layout para inspeção visual (npm run preview).
 *
 * [2026-10-14] Criado: preview do layout (modelo sem geometria -> layoutModel -> SVG simples) — Rafael Brito
 * Não é o renderer final (esse é o do design spike / editor da Fase 2); serve só para olhar o layout.
 */
import { writeFileSync } from 'node:fs';
import { layoutModel, type ProcessModel } from '../src/index.js';
import { billingSample } from '../src/samples/billing.js';

const src = billingSample();
const bare: ProcessModel = {
  ...src, pool: undefined,
  lanes: src.lanes.map(({ bounds: _b, ...l }) => l),
  nodes: src.nodes.map(({ bounds: _b, ...n }) => n),
  flows: src.flows.map(({ waypoints: _w, ...f }) => f),
};
const m = layoutModel(bare);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const parts: string[] = [];
for (const l of m.lanes) {
  const b = l.bounds!;
  parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#bbb"/>`,
    `<text transform="translate(${b.x - 12},${b.y + b.h / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#666">${esc(l.name)}</text>`);
}
for (const f of m.flows) {
  const d = f.waypoints!.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  parts.push(f.kind === 'association'
    ? `<path d="${d}" stroke="#888" stroke-dasharray="3 3" fill="none"/>`
    : `<path d="${d}" stroke="#444" stroke-width="1.6" fill="none" marker-end="url(#a)"/>`);
  if (f.name) { const [x, y] = f.waypoints![1]!; parts.push(`<text x="${x + 4}" y="${y - 5}" font-size="11" fill="#666">${esc(f.name)}</text>`); }
}
for (const n of m.nodes) {
  const b = n.bounds!, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const label = (dy: number) => `<text x="${cx}" y="${cy + dy}" text-anchor="middle" font-size="11">${esc(n.name)}</text>`;
  if (n.kind === 'task' || n.kind === 'subprocess') parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#eef3fd" stroke="#2f6fe4" stroke-width="1.6"/>`, label(4));
  else if (n.kind === 'gateway') parts.push(`<path d="M${cx} ${b.y}L${b.x + b.w} ${cy}L${cx} ${b.y + b.h}L${b.x} ${cy}Z" fill="#fdf3df" stroke="#d98a0b" stroke-width="1.6"/>`, label(-32));
  else if (n.kind === 'dataObject') parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#fff" stroke="#888"/>`, label(b.h / 2 + 12));
  else if (n.kind === 'annotation') parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#888" stroke-dasharray="3 3"/>`, label(4));
  else parts.push(`<circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="${n.kind === 'end' ? '#d6453d' : n.kind === 'start' ? '#2e9d57' : '#d98a0b'}" stroke-width="${n.kind === 'end' ? 4 : 1.8}"/>`, label(34));
}
const p = m.pool!;
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Layout Preview</title></head>
<body style="margin:0;background:#fff;font-family:system-ui,sans-serif">
<h3 style="margin:12px 16px">Auto-layout (modelo sem geometria → layoutModel) — ${esc(m.name)}</h3>
<svg viewBox="-20 -10 ${p.w + 40} ${p.h + 40}" style="width:100%;max-width:${p.w + 40}px">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#444"/></marker></defs>
${parts.join('\n')}
</svg></body></html>`;
const out = new URL('../../../docs/process-studio/spike/layout-preview.html', import.meta.url);
writeFileSync(out, html, 'utf-8');
console.log('Preview gerado em', out.pathname);
