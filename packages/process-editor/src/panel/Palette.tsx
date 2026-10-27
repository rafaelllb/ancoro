/**
 * Paleta de elementos: clique para armar + clique no diagrama, ou arraste para o diagrama.
 * [2026-10-14] Criado: Fase 2 / etapa 3 — Rafael Brito
 * Os ícones são os PRÓPRIOS shapes do canvas (NodeShape) — a paleta nunca diverge do que será desenhado.
 */
import { NodeSchema, sizeOf, type ProcessNode } from '@ancoro/process-core';
import { NodeShape } from '@ancoro/process-render';
import { useT } from '../i18n';
import { useEditor } from '../store';
import { PALETTE, type ToolSpec } from '../tools';

export function ToolIcon({ tool }: { tool: ToolSpec }) {
  if (tool.type === 'lane') return <svg viewBox="0 0 60 40" className="ico"><rect x={4} y={6} width={52} height={28} fill="var(--lane-0)" stroke="var(--line)" strokeWidth={1.5} /><rect x={4} y={6} width={9} height={28} fill="var(--head)" stroke="var(--line)" strokeWidth={1.5} /></svg>;
  if (tool.type === 'participant') return <svg viewBox="0 0 60 40" className="ico"><rect x={4} y={10} width={52} height={20} fill="var(--bg)" stroke="var(--line)" strokeWidth={1.5} strokeDasharray="4 3" /></svg>;
  const kind = tool.kind!;
  const size = sizeOf({ kind } as ProcessNode);
  const node: ProcessNode = NodeSchema.parse({
    id: tool.id.replace(/[^\w-]/g, '_'), kind, variant: tool.variant, name: '', throw: tool.throw ?? false,
    ...(kind === 'boundary' && { attachedToId: 'icon_host' }), // o schema exige hospedeira; aqui é só o desenho do ícone
    bounds: { x: 0, y: 0, w: size.w, h: size.h },
  });
  const pad = 6;
  return (
    <svg viewBox={`${-pad} ${-pad} ${size.w + pad * 2} ${size.h + pad * 2}`} className="ico" preserveAspectRatio="xMidYMid meet">
      <NodeShape node={node} selected={false} drillable={false} />
    </svg>
  );
}

export function Palette() {
  const t = useT();
  const armed = useEditor((s) => s.armed);
  const arm = useEditor((s) => s.arm);
  const placeTool = useEditor((s) => s.placeTool);

  return (
    <div className="palette">
      <h3>{t.elements}</h3>
      {PALETTE.map((g) => (
        <section key={g.group}>
          <h4>{t.palette[g.group]}</h4>
          <div className="grid">
            {g.items.map((tool) => (
              <button key={tool.id} data-tool={tool.id} className={armed?.id === tool.id ? 'on' : ''} title={t.palette[tool.label]} aria-label={t.palette[tool.label]}
                draggable={tool.type === 'node'}
                onDragStart={(e) => { e.dataTransfer.setData('application/x-ps-tool', tool.id); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => (tool.type === 'node' ? arm(armed?.id === tool.id ? null : tool) : placeTool(tool, { x: 0, y: 0 }))}>
                <ToolIcon tool={tool} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
