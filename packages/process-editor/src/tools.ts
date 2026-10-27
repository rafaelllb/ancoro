/**
 * Catálogo da paleta: cada item cria um nó (kind+variant) ou uma estrutura (lane/participante).
 * [2026-10-14] Criado: Fase 2 / etapa 3 — Rafael Brito
 * Fonte única: a paleta (UI) e o store (ação de inserir) leem daqui. Rótulos vêm do i18n (`palette.*`).
 */
import type { NodeKind } from '@ancoro/process-core';
import type { useT } from './i18n';

export type PaletteLabel = keyof ReturnType<typeof useT>['palette'];

export interface ToolSpec {
  id: string;
  /** 'node' cria um elemento; 'lane'/'participant' são ações imediatas (sem clicar no diagrama) */
  type: 'node' | 'lane' | 'participant';
  kind?: NodeKind;
  variant?: string;
  throw?: boolean;
  label: PaletteLabel;
}

const node = (id: string, kind: NodeKind, variant: string | undefined, label: PaletteLabel, extra: Partial<ToolSpec> = {}): ToolSpec =>
  ({ id, type: 'node', kind, variant, label, ...extra });

export const PALETTE: ReadonlyArray<{ group: Extract<PaletteLabel, 'events' | 'activities' | 'gateways' | 'data' | 'structure'>; items: ToolSpec[] }> = [
  { group: 'events', items: [
    node('start', 'start', 'none', 'start'),
    node('start-timer', 'start', 'timer', 'startTimer'),
    node('start-message', 'start', 'message', 'startMessage'),
    node('inter-timer', 'intermediate', 'timer', 'interTimer'),
    node('inter-message', 'intermediate', 'message', 'interMessage'),
    node('inter-link-throw', 'intermediate', 'link', 'interLinkThrow', { throw: true }),
    node('inter-link-catch', 'intermediate', 'link', 'interLinkCatch'),
    node('end', 'end', 'none', 'end'),
    node('end-message', 'end', 'message', 'endMessage'),
    node('end-terminate', 'end', 'terminate', 'endTerminate'),
    node('end-error', 'end', 'error', 'endError'),
    node('boundary-error', 'boundary', 'error', 'boundaryError'),
    node('boundary-timer', 'boundary', 'timer', 'boundaryTimer'),
    node('boundary-message', 'boundary', 'message', 'boundaryMessage'),
  ] },
  { group: 'activities', items: [
    node('task', 'task', 'generic', 'task'),
    node('task-user', 'task', 'user', 'taskUser'),
    node('task-service', 'task', 'service', 'taskService'),
    node('task-manual', 'task', 'manual', 'taskManual'),
    node('task-script', 'task', 'script', 'taskScript'),
    node('subprocess', 'subprocess', undefined, 'subprocess'),
  ] },
  { group: 'gateways', items: [
    node('gw-exclusive', 'gateway', 'exclusive', 'gwExclusive'),
    node('gw-parallel', 'gateway', 'parallel', 'gwParallel'),
    node('gw-inclusive', 'gateway', 'inclusive', 'gwInclusive'),
    node('gw-event', 'gateway', 'eventBased', 'gwEvent'),
  ] },
  { group: 'data', items: [
    node('data-object', 'dataObject', undefined, 'dataObject'),
    node('data-store', 'dataStore', undefined, 'dataStore'),
    node('annotation', 'annotation', undefined, 'annotation'),
  ] },
  { group: 'structure', items: [
    { id: 'lane', type: 'lane', label: 'lane' },
    { id: 'participant', type: 'participant', label: 'participant' },
  ] },
];

export const ALL_TOOLS: ReadonlyArray<ToolSpec> = PALETTE.flatMap((g) => g.items);
export const toolById = (id: string): ToolSpec | undefined => ALL_TOOLS.find((t) => t.id === id);
