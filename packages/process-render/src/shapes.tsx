/**
 * Renderer SVG dos elementos BPMN (estética do design spike). Puro: modelo -> markup, sem estado.
 *
 * [2026-10-14] Criado: Fase 2 / etapa 1 — shapes de todos os kinds do modelo — Rafael Brito
 * Cores vêm de tokens CSS (styles.css) => tema/marca por configuração, sem script de rebrand.
 *
 * TODO [ESTIGMERGIA]: renderer ainda não é "plugável" por configuração
 * - Hoje o set visual é fixo neste arquivo. Para a Fase 3 (portal publicado) extrair um `ShapeSet`
 *   (mapa kind->componente) e permitir o tema do cliente trocar ícones, não só cores.
 */
import type { ReactElement } from 'react';
import { flowLabel, nodeLabel, type Bounds, type LabelLayout, type ProcessFlow, type ProcessNode } from '@ancoro/process-core';
import { center, toPath, wrapText } from './geometry';

const v = (name: string) => `var(--${name})`;

/** Marcador de repetição (BPMN): ↻ loop, ||| multi-instância paralela, ≡ sequencial */
function LoopMarker({ loop, cx, y, color }: { loop: string; cx: number; y: number; color: string }) {
  if (loop === 'none') return null;
  const common = { fill: 'none', stroke: color, strokeWidth: 1.4, strokeLinecap: 'round' as const };
  return (
    <g transform={`translate(${cx},${y})`}>
      {loop === 'standard' && <g {...common}><path d="M-4 -3a4.5 4.5 0 1 0 5 1" /><path d="M1 -6l1 3l-3 0" fill={color} /></g>}
      {loop === 'parallel' && <path {...common} d="M-4 -5v8M0 -5v8M4 -5v8" />}
      {loop === 'sequential' && <path {...common} d="M-5 -4h10M-5 -1h10M-5 2h10" />}
    </g>
  );
}

// ---- ícones de evento (centrados em 0,0; ~±9px). `filled` = evento de fim ou lançamento (throw) no BPMN.
function EventIcon({ variant, filled, color }: { variant: string; filled: boolean; color: string }): ReactElement | null {
  const fill = filled ? color : 'none';
  const inv = filled ? 'var(--surface)' : color; // traço "invertido" sobre ícone preenchido
  switch (variant) {
    case 'timer':
      return <g fill="none" stroke={color} strokeWidth={1.3}><circle r={8.5} /><path d="M0 -5.5V0l3.5 2.5" /></g>;
    case 'message':
      return <g><rect x={-7} y={-5} width={14} height={10} rx={1} fill={fill} stroke={color} strokeWidth={1.2} /><path d="M-7 -5L0 1L7 -5" fill="none" stroke={inv} strokeWidth={1.2} /></g>;
    case 'error':
      return <path d="M-6 7L-2 -4L2 1L6 -7L2.5 -1L-1.5 -6Z" fill={fill} stroke={color} strokeWidth={1.1} strokeLinejoin="round" />;
    case 'conditional':
      return <g fill="none" stroke={color} strokeWidth={1.2}><rect x={-6} y={-7} width={12} height={14} /><path d="M-3 -3H3M-3 0H3M-3 3H3" /></g>;
    case 'link':
      return <path d="M-7 -3.5H1V-7.5L8 0L1 7.5V3.5H-7Z" fill={fill} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />;
    case 'terminate':
      return <circle r={7.5} fill={color} />;
    default:
      return null;
  }
}

function TaskIcon({ variant, color }: { variant: string; color: string }): ReactElement | null {
  switch (variant) {
    case 'user':
      return <g fill="none" stroke={color} strokeWidth={1.4}><circle cx={8} cy={5} r={3} /><path d="M2 15c0-3.5 2.5-5 6-5s6 1.5 6 5z" fill={color} fillOpacity={0.15} /></g>;
    case 'service':
      return <g fill="none" stroke={color}><circle cx={8} cy={8} r={5.6} strokeWidth={3} strokeDasharray="2.2 2.2" /><circle cx={8} cy={8} r={4} strokeWidth={1.4} /><circle cx={8} cy={8} r={1.6} strokeWidth={1.3} /></g>;
    case 'manual':
      return <path d="M2 9V5.5a1 1 0 012 0V8m0-3V3.5a1 1 0 012 0V8m0-4.5a1 1 0 012 0V8m0-3a1 1 0 012 0v6c0 2.5-1.8 4-4 4S2 13.5 2 11" fill="none" stroke={color} strokeWidth={1.3} strokeLinecap="round" />;
    case 'script':
      return <g fill="none" stroke={color} strokeWidth={1.2}><path d="M4 1h9v14H4z" /><path d="M6 5h5M6 8h5M6 11h5" /></g>;
    default:
      return null;
  }
}

const TASK_COLORS: Record<string, [string, string]> = {
  user: ['user', 'user-bg'], service: ['service', 'service-bg'], manual: ['manual', 'manual-bg'], script: ['service', 'service-bg'],
  generic: ['task', 'task-bg'],
};

export interface NodeViewProps {
  node: ProcessNode;
  selected: boolean;
  /** true quando o nó tem drill-down disponível (call activity cujo processo está carregado) */
  drillable: boolean;
  /** o texto deste elemento está sendo editado no próprio desenho: o texto estático some para não duplicar */
  editing?: boolean;
}

/**
 * Rótulo (texto fora da forma) como ELEMENTO: caixa clicável cobrindo todo o texto (duplo clique edita em qualquer ponto dele)
 * e arrastável (data-label). A posição vem do core (labels.ts): padrão + deslocamento do usuário.
 * [2026-10-14] Criado — Rafael Brito
 */
export function LabelView({ layout, flow }: { layout: LabelLayout | null; flow?: boolean }) {
  if (!layout) return null;
  const { box, lines, size } = layout;
  return (
    <g className={`label${flow ? ' flow-label' : ''}`} data-label="">
      <rect className="label-hit" x={box.x - 2} y={box.y - 1} width={box.w + 4} height={box.h + 2} rx={3} />
      <text className="lbl" fontSize={size} textAnchor="middle">
        {lines.map((l, i) => <tspan key={i} x={box.x + box.w / 2} y={box.y + 11 + i * 13}>{l}</tspan>)}
      </text>
    </g>
  );
}

/** Texto multilinha centralizado em (cx, y0). */
function Lines({ lines, cx, y0, lh = 13, size = 12, className = 'lbl' }: { lines: string[]; cx: number; y0: number; lh?: number; size?: number; className?: string }) {
  return (
    <text className={className} fontSize={size} textAnchor="middle">
      {lines.map((l, i) => <tspan key={i} x={cx} y={y0 + i * lh}>{l}</tspan>)}
    </text>
  );
}

export function NodeShape({ node: n, selected, drillable, editing }: NodeViewProps) {
  const b = n.bounds;
  if (!b) return null;
  const [cx, cy] = center(b);
  const sel = selected ? 3 : undefined;
  // [2026-10-14] Criado: cores personalizadas por elemento (n.fill / n.stroke) sobrepõem os tokens do tema — Rafael Brito
  const F = (def: string) => n.fill ?? def;
  const S = (def: string) => n.stroke ?? def;
  let body: ReactElement | null = null;
  let label: ReactElement | null = null;

  switch (n.kind) {
    case 'task': {
      const [c, bg] = TASK_COLORS[n.variant ?? 'generic'] ?? TASK_COLORS.generic!;
      const lines = wrapText(n.name, Math.max(6, Math.floor((b.w - 14) / 6.2)), Math.max(1, Math.floor((b.h - 14) / 13)));
      body = (
        <>
          <rect className="shape" x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={F(v(bg))} stroke={S(v(c))} strokeWidth={sel ?? 1.8} />
          <g transform={`translate(${b.x + 6},${b.y + 5})`}><TaskIcon variant={n.variant ?? 'generic'} color={v(c)} /></g>
          <Lines lines={lines} cx={cx} y0={cy - ((lines.length - 1) * 13) / 2 + 5} />
          <LoopMarker loop={n.loop} cx={cx} y={b.y + b.h - 6} color={v(c)} />
          {n.sapTransaction && <text x={b.x + b.w - 7} y={b.y + b.h - 6} textAnchor="end" className="tx" fill={v(c)}>{n.sapTransaction}</text>}
        </>
      );
      break;
    }
    case 'subprocess': {
      const call = !!n.calledProcessId;
      const lines = wrapText(n.name, Math.max(6, Math.floor((b.w - 14) / 6.2)), Math.max(1, Math.floor((b.h - 28) / 13)));
      body = (
        <>
          <rect className="shape" x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={F(v('sub-bg'))} stroke={S(v('sub'))} strokeWidth={sel ?? (call ? 3.4 : 1.8)} />
          <Lines lines={lines} cx={cx} y0={cy - ((lines.length - 1) * 13) / 2 - 3} />
          <rect x={cx - 8} y={b.y + b.h - 19} width={16} height={14} rx={2} fill="none" stroke={v('sub')} strokeWidth={1.3} />
          <path d={`M${cx - 4} ${b.y + b.h - 12}h8M${cx} ${b.y + b.h - 16}v8`} stroke={v('sub')} strokeWidth={1.3} />
          <LoopMarker loop={n.loop} cx={cx + 22} y={b.y + b.h - 6} color={v('sub')} />
          {drillable && <text x={b.x + b.w - 6} y={b.y + 13} textAnchor="end" fontSize={11} fill={v('accent')}>↗</text>}
        </>
      );
      break;
    }
    case 'gateway': {
      const r = Math.min(b.w, b.h) / 2, c = v('gateway');
      const mark = n.variant === 'parallel' ? <path d={`M${cx - 10} ${cy}H${cx + 10}M${cx} ${cy - 10}V${cy + 10}`} stroke={c} strokeWidth={3} strokeLinecap="round" />
        : n.variant === 'inclusive' ? <circle cx={cx} cy={cy} r={9} fill="none" stroke={c} strokeWidth={2.6} />
        : n.variant === 'eventBased' ? <g fill="none" stroke={c} strokeWidth={1.4}><circle cx={cx} cy={cy} r={10} /><circle cx={cx} cy={cy} r={7.5} /></g>
        : <path d={`M${cx - 8} ${cy - 8}L${cx + 8} ${cy + 8}M${cx + 8} ${cy - 8}L${cx - 8} ${cy + 8}`} stroke={c} strokeWidth={3} strokeLinecap="round" />;
      body = (
        <>
          <path className="shape" d={`M${cx} ${b.y}L${b.x + b.w} ${cy}L${cx} ${b.y + b.h}L${b.x} ${cy}Z`} fill={F(v('gateway-bg'))} stroke={S(c)} strokeWidth={sel ?? 1.8} strokeLinejoin="round" />
          {mark}
        </>
      );
      label = <LabelView layout={nodeLabel(n)} />;
      break;
    }
    case 'start': case 'end': case 'intermediate': case 'boundary': {
      const r = Math.min(b.w, b.h) / 2;
      const col = n.kind === 'start' ? 'start' : n.kind === 'end' ? 'end' : 'inter';
      const filled = n.kind === 'end' || (n.kind === 'intermediate' && n.throw);
      const sc = r / 18;
      body = (
        <>
          <circle className="shape" cx={cx} cy={cy} r={r} fill={F(v(n.kind === 'boundary' || n.kind === 'intermediate' ? 'surface' : `${col}-bg`))}
            stroke={S(v(col))} strokeWidth={sel ?? (n.kind === 'end' ? 4 : 1.8)} strokeDasharray={n.kind === 'boundary' && !n.cancelActivity ? '4 3' : undefined} />
          {(n.kind === 'intermediate' || n.kind === 'boundary') && (
            <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={v(col)} strokeWidth={1.2} strokeDasharray={n.kind === 'boundary' && !n.cancelActivity ? '4 3' : undefined} />
          )}
          <g transform={`translate(${cx},${cy}) scale(${sc * 0.9})`}><EventIcon variant={n.variant ?? 'none'} filled={filled} color={v(col)} /></g>
        </>
      );
      label = <LabelView layout={nodeLabel(n)} />;
      break;
    }
    case 'dataObject':
      body = (
        <>
          <path className="shape" d={`M${b.x} ${b.y}h${b.w - 10}l10 10v${b.h - 10}h${-b.w}z`} fill={F(v('surface'))} stroke={S(v('data'))} strokeWidth={sel ?? 1.5} strokeLinejoin="round" />
          <path d={`M${b.x + b.w - 10} ${b.y}v10h10`} fill="none" stroke={v('data')} strokeWidth={1.3} />
        </>
      );
      label = <LabelView layout={nodeLabel(n)} />;
      break;
    case 'dataStore': {
      const ry = Math.max(4, b.h * 0.14);
      body = (
        <>
          <path className="shape" d={`M${b.x} ${b.y + ry}v${b.h - 2 * ry}a${b.w / 2} ${ry} 0 0 0 ${b.w} 0v${-(b.h - 2 * ry)}`} fill={F(v('store-bg'))} stroke={S(v('data'))} strokeWidth={sel ?? 1.5} />
          <ellipse cx={cx} cy={b.y + ry} rx={b.w / 2} ry={ry} fill={F(v('store-bg'))} stroke={S(v('data'))} strokeWidth={sel ?? 1.5} />
          <path d={`M${b.x} ${b.y + ry + (b.h - 2 * ry) / 3}a${b.w / 2} ${ry} 0 0 0 ${b.w} 0`} fill="none" stroke={v('data')} strokeWidth={1} />
        </>
      );
      // Nome de repositório de dados costuma ser longo (ex.: lista de tabelas): rótulo mais largo
      label = <LabelView layout={nodeLabel(n)} />;
      break;
    }
    case 'annotation': {
      const lines = wrapText(n.name, Math.max(8, Math.floor((b.w - 20) / 6.2)), Math.max(1, Math.floor(b.h / 13)));
      body = (
        <>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />
          <path className="shape" d={`M${b.x + 10} ${b.y}H${b.x}V${b.y + b.h}H${b.x + 10}`} fill="none" stroke={S(v('data'))} strokeWidth={sel ?? 1.5} />
          <text className="lbl" fontSize={12} textAnchor="start">{lines.map((l, i) => <tspan key={i} x={b.x + 14} y={cy - ((lines.length - 1) * 13) / 2 + 4 + i * 13}>{l}</tspan>)}</text>
        </>
      );
      break;
    }
  }
  return <g className={`node${selected ? ' sel' : ''}${editing ? ' editing' : ''}`} data-id={n.id} data-kind={n.kind}>{body}{label}</g>;
}

// ---- fluxos
export function FlowPath({ flow, nodes, selected, editing }: { flow: ProcessFlow; nodes: Map<string, Bounds>; selected: boolean; editing?: boolean }) {
  let pts = flow.waypoints;
  if (!pts?.length) {
    const s = nodes.get(flow.sourceId), t = nodes.get(flow.targetId);
    if (!s || !t) return null;
    pts = [center(s), center(t)]; // fallback sem geometria
  }
  const d = toPath(pts);
  const cls = `flow ${flow.kind}${selected ? ' sel' : ''}`;
  const lay = flowLabel({ ...flow, waypoints: pts as Array<[number, number]> });
  return (
    <g data-id={flow.id} data-flow className={`edge${editing ? ' editing' : ''}`}>
      <path d={d} className="hit" />
      <path d={d} className={cls} markerEnd={flow.kind === 'sequence' ? 'url(#arr)' : flow.kind === 'message' ? 'url(#arr-open)' : undefined}
        markerStart={flow.kind === 'message' ? 'url(#dot)' : undefined} />
      {flow.isDefault && flow.kind === 'sequence' && (
        // marca de fluxo padrão: barra diagonal curta perto da origem (convenção BPMN)
        <path d={`M${pts[0]![0] + 9} ${pts[0]![1] - 5}l6 10`} stroke={v('flow')} strokeWidth={1.4} />
      )}
      <LabelView layout={lay} flow />
    </g>
  );
}
