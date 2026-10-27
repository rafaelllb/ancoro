/**
 * Camadas do diagrama (pool, lanes, participantes, fluxos, nós) como componentes PUROS.
 * Usado pelo canvas do editor (com seleção/edição) e pelo publisher do portal (renderToStaticMarkup, sem estado).
 *
 * [2026-10-14] Criado: extraído do ProcessCanvas — mesma saída visual no editor e no portal — Rafael Brito
 * Contrato do DOM (o viewer do portal depende dele): cada elemento clicável é um <g data-id="..." data-kind="...">.
 */
import type { Bounds, ProcessModel } from '@ancoro/process-core';
import { contentBounds } from './geometry';
import { FlowPath, NodeShape } from './shapes';

export function DiagramDefs() {
  return (
    <defs>
      <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--flow)" /></marker>
      <marker id="arr-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--surface)" stroke="var(--flow)" strokeWidth={1.2} /></marker>
      <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6"><circle cx={5} cy={5} r={3.5} fill="var(--surface)" stroke="var(--flow)" strokeWidth={1.2} /></marker>
    </defs>
  );
}

export interface DiagramLayersProps {
  model: ProcessModel;
  selectedId?: string | null;
  editingId?: string | null;
  /** ids de processos que existem no repositório/portal — habilita o drill-down das call activities */
  loadedProcessIds?: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

export function DiagramLayers({ model, selectedId = null, editingId = null, loadedProcessIds = NONE }: DiagramLayersProps) {
  // Sem hooks de propósito: este componente também é renderizado no servidor (publisher, react-dom/server), possivelmente com OUTRA cópia
  // do React; hook de uma cópia sem dispatcher quebraria. O cálculo é barato (O(nós)).
  const boundsById = new Map<string, Bounds>();
  model.nodes.forEach((n) => n.bounds && boundsById.set(n.id, n.bounds));
  model.participants.forEach((p) => p.bounds && boundsById.set(p.id, p.bounds));
  if (model.pool) boundsById.set(model.id, model.pool);

  const regular = model.nodes.filter((n) => n.kind !== 'boundary');
  const boundary = model.nodes.filter((n) => n.kind === 'boundary');
  const pool = model.pool;
  const laneHeader = pool && model.lanes[0]?.bounds ? model.lanes[0].bounds.x - pool.x : 0;
  const cls = (base: string, id: string) => `${base}${selectedId === id ? ' sel' : ''}${editingId === id ? ' editing' : ''}`;

  return (
    <>
      {pool && (
        <g data-id={model.id} data-kind="pool" className={cls('pool', model.id)}>
          <rect x={pool.x} y={pool.y} width={pool.w} height={pool.h} className="pool-box" />
          {laneHeader >= 16 ? (
            <>
              <rect x={pool.x} y={pool.y} width={laneHeader} height={pool.h} className="head" />
              <text className="pool-label" transform={`translate(${pool.x + laneHeader / 2 + 4},${pool.y + pool.h / 2}) rotate(-90)`} textAnchor="middle">{model.name}</text>
            </>
          ) : <text className="pool-label" x={pool.x + 10} y={pool.y + 18}>{model.name}</text>}
        </g>
      )}
      {model.lanes.map((l, i) => l.bounds && (
        <g key={l.id} data-id={l.id} data-kind="lane" className={cls(`lane lane-${i % 3}`, l.id)}>
          <rect x={l.bounds.x} y={l.bounds.y} width={l.bounds.w} height={l.bounds.h} className="lane-box" style={l.fill ? { fill: l.fill } : undefined} />
          <rect x={l.bounds.x} y={l.bounds.y} width={22} height={l.bounds.h} className="head" />
          <text className="lane-label" transform={`translate(${l.bounds.x + 15},${l.bounds.y + l.bounds.h / 2}) rotate(-90)`} textAnchor="middle">{l.name}</text>
        </g>
      ))}
      {model.participants.map((p) => p.bounds && (
        <g key={p.id} data-id={p.id} data-kind="participant" className={cls('participant', p.id)}>
          <rect x={p.bounds.x} y={p.bounds.y} width={p.bounds.w} height={p.bounds.h} className="pool-box ext" />
          <text className="pool-label" x={p.bounds.x + p.bounds.w / 2} y={p.bounds.y + 20} textAnchor="middle">{p.name}</text>
        </g>
      ))}
      {model.flows.map((f) => <FlowPath key={f.id} flow={f} nodes={boundsById} selected={f.id === selectedId} editing={f.id === editingId} />)}
      {regular.map((n) => (
        <NodeShape key={n.id} node={n} selected={n.id === selectedId} editing={n.id === editingId} drillable={!!n.calledProcessId && loadedProcessIds.has(n.calledProcessId)} />
      ))}
      {boundary.map((n) => <NodeShape key={n.id} node={n} selected={n.id === selectedId} editing={n.id === editingId} drillable={false} />)}
    </>
  );
}

/** SVG autocontido de um processo (viewBox = conteúdo + margem). Usado pelo publisher e pelas páginas estáticas do portal. */
export function StaticDiagram({ model, loadedProcessIds, className = 'ps-diagram' }: { model: ProcessModel; loadedProcessIds?: ReadonlySet<string>; className?: string }) {
  const c = contentBounds(model);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox={`${c.x} ${c.y} ${c.w} ${c.h}`} width={Math.round(c.w)} height={Math.round(c.h)} role="img" aria-label={model.name} data-process={model.id}>
      <DiagramDefs />
      <DiagramLayers model={model} loadedProcessIds={loadedProcessIds} />
    </svg>
  );
}
