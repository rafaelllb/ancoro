/**
 * BPMN 2.0 XML -> ProcessModel.
 *
 * [2026-10-14] Criado: parser headless sobre bpmn-moddle — Rafael Brito
 * Política: NUNCA descartar em silêncio. Tudo que o modelo não suporta (boundary events, filhos de
 * subprocesso, pools extras, lanes aninhadas) vira um `warning` explícito no resultado, para o import
 * de arquivos reais (Bizagi/Signavio/Camunda) ser auditável.
 *
 * TODO [ESTIGMERGIA]: multi-pool (colaboração com mais de um participant)
 * - Hoje só o primeiro participant com processRef é importado (warning emitido).
 * - Próximo passo: ProcessModel -> coleção de processos + message flows entre pools.
 */
import type { ModdleElement } from 'bpmn-moddle';
import { ITEM_LISTS, createModdle } from './moddle.js';
import { coerceAttrValue } from '../attributes.js';
import { flowLabel, nodeLabel, offsetFrom } from '../labels.js';
import { parseModel, type Bounds, type ProcessFlow, type ProcessLane, type ProcessModel, type ProcessNode } from '../model.js';

export interface ParseResult {
  model: ProcessModel;
  warnings: string[];
}

interface Mapped { kind: ProcessNode['kind']; variant?: string; warn?: string; extra?: Partial<ProcessNode> }

const TASK_MAP: Record<string, Mapped> = {
  'bpmn:Task': { kind: 'task', variant: 'generic' },
  'bpmn:UserTask': { kind: 'task', variant: 'user' },
  'bpmn:ServiceTask': { kind: 'task', variant: 'service' },
  'bpmn:ManualTask': { kind: 'task', variant: 'manual' },
  'bpmn:ScriptTask': { kind: 'task', variant: 'script' },
  // Tipos sem equivalente no modelo: degradam, sempre com aviso
  'bpmn:SendTask': { kind: 'task', variant: 'generic', warn: 'convertido para tarefa genérica' },
  'bpmn:ReceiveTask': { kind: 'task', variant: 'generic', warn: 'convertido para tarefa genérica' },
  'bpmn:BusinessRuleTask': { kind: 'task', variant: 'generic', warn: 'convertido para tarefa genérica' },
};
const GATEWAY_MAP: Record<string, string> = {
  'bpmn:ExclusiveGateway': 'exclusive', 'bpmn:ParallelGateway': 'parallel',
  'bpmn:InclusiveGateway': 'inclusive', 'bpmn:EventBasedGateway': 'eventBased',
};
const EVENT_DEF_MAP: Record<string, string> = {
  'bpmn:TimerEventDefinition': 'timer', 'bpmn:MessageEventDefinition': 'message', 'bpmn:ErrorEventDefinition': 'error',
  'bpmn:ConditionalEventDefinition': 'conditional', 'bpmn:LinkEventDefinition': 'link', 'bpmn:TerminateEventDefinition': 'terminate',
};

/** Lê <ancoro:props> de um elemento BPMN para um objeto de campos do modelo (somente o que está presente). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readProps(el: ModdleElement): Record<string, any> {
  const props = (el.extensionElements?.values ?? []).find((v: ModdleElement) => v.$type === 'ancoro:Props') as ModdleElement | undefined;
  if (!props) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {};
  for (const k of ['performer', 'sla', 'sapTransaction', 'source', 'description', 'url', 'duration', 'cost', 'priority', 'accountable', 'author', 'owner', 'version', 'createdAt', 'modifiedAt']) {
    if (props[k]) out[k] = props[k];
  }
  if (props.probability !== undefined && props.probability !== '') out.probability = Number(props.probability);
  if (props.manualRoute === 'true') out.manualRoute = true;
  const reqs = (props.requirements ?? []).map((r: ModdleElement) => r.ref as string);
  if (reqs.length) out.requirementRefs = reqs;
  for (const list of [...ITEM_LISTS, 'tags']) {
    const vals = (props.items ?? []).filter((i: ModdleElement) => i.list === list).map((i: ModdleElement) => i.value as string);
    if (vals.length) out[list] = vals;
  }
  const attrs = (props.attributes ?? []).map((a: ModdleElement) => {
    const rows = (a.rows ?? []).map((r: ModdleElement) => (r.cells ?? []).map((c: ModdleElement) => (c.text as string | undefined) ?? ''));
    const items = (a.items ?? []).map((i: ModdleElement) => (i.text as string | undefined) ?? '');
    const value = rows.length ? rows : items.length ? items : ((a.value as string | undefined) ?? '');
    return { name: (a.name as string) ?? '', ...(a.def && { defId: a.def as string }), value };
  });
  if (attrs.length) out.attributes = attrs;
  const defs = (props.attributeDefs ?? []).map((d: ModdleElement) => ({
    id: d.key as string, name: d.name as string, type: d.type as string,
    ...(d.description && { description: d.description as string }),
    ...(d.appliesTo && { appliesTo: String(d.appliesTo).split(',').filter(Boolean) }),
    options: (d.options ?? []).map((o: ModdleElement) => (o.text as string | undefined) ?? ''),
    columns: (d.columns ?? []).map((c: ModdleElement) => ({ id: c.key as string, name: c.name as string, type: (c.type as string | undefined) ?? 'text' })),
  }));
  if (defs.length) out.attributeDefs = defs;
  return out;
}
const docText = (el: ModdleElement): string | undefined => (el.documentation?.[0]?.text as string | undefined) || undefined;

export async function fromBpmnXml(xml: string): Promise<ParseResult> {
  const moddle = createModdle();
  const { rootElement: defs, warnings: moddleWarnings } = await moddle.fromXML(xml);
  const warnings = moddleWarnings.map((w) => `moddle: ${w.message}`);

  const roots: ModdleElement[] = defs.rootElements ?? [];
  const collab = roots.find((r) => r.$type === 'bpmn:Collaboration');
  const participants: ModdleElement[] = (collab?.participants ?? []).filter((p: ModdleElement) => p.processRef);
  if (participants.length > 1) {
    warnings.push(`Colaboração com ${participants.length} pools: apenas o primeiro ('${participants[0]!.name ?? participants[0]!.id}') foi importado`);
  }
  const participant: ModdleElement | undefined = participants[0];
  // [2026-10-14] Criado: pools sem processRef = sistemas/atores externos (caixa-preta) — Rafael Brito
  const blackBoxEls: ModdleElement[] = (collab?.participants ?? []).filter((p: ModdleElement) => !p.processRef);
  const process: ModdleElement | undefined = participant?.processRef ?? roots.find((r) => r.$type === 'bpmn:Process');
  if (!process) throw new Error('Arquivo BPMN sem <process>: nada para importar');
  if (!participant && roots.filter((r) => r.$type === 'bpmn:Process').length > 1) {
    warnings.push('Múltiplos <process> sem collaboration: apenas o primeiro foi importado');
  }

  // ---- geometria (DI): bpmnElement.id -> bounds / waypoints
  const boundsById = new Map<string, Bounds>();
  const waypointsById = new Map<string, Array<[number, number]>>();
  // [2026-10-14] Criado: cores (bioc:fill/stroke) por elemento — Rafael Brito
  const colorsById = new Map<string, { fill?: string; stroke?: string }>();
  // [2026-10-14] Criado: posição absoluta dos rótulos (BPMNLabel) -> labelOffset relativo ao padrão — Rafael Brito
  const labelPosById = new Map<string, { x: number; y: number }>();
  for (const d of defs.diagrams ?? []) {
    for (const pe of d.plane?.planeElement ?? []) {
      const id: string | undefined = pe.bpmnElement?.id;
      if (!id) continue;
      if (pe.$type === 'bpmndi:BPMNShape' && pe.bounds) {
        boundsById.set(id, { x: pe.bounds.x, y: pe.bounds.y, w: pe.bounds.width, h: pe.bounds.height });
        const fill = pe.fill as string | undefined, stroke = pe.stroke as string | undefined; // bioc:fill / bioc:stroke
        if (fill || stroke) colorsById.set(id, { ...(fill && { fill }), ...(stroke && { stroke }) });
        if (pe.label?.bounds) labelPosById.set(id, { x: pe.label.bounds.x, y: pe.label.bounds.y });
      } else if (pe.$type === 'bpmndi:BPMNEdge' && pe.waypoint) {
        waypointsById.set(id, pe.waypoint.map((p: ModdleElement) => [p.x, p.y] as [number, number]));
        if (pe.label?.bounds) labelPosById.set(id, { x: pe.label.bounds.x, y: pe.label.bounds.y });
      }
    }
  }

  // ---- lanes
  const lanes: ProcessLane[] = [];
  const laneOf = new Map<string, string>(); // nodeId -> laneId
  const walkLanes = (lanesEl: ModdleElement[], nested: boolean) => {
    for (const l of lanesEl) {
      if (nested) warnings.push(`Lane aninhada '${l.name ?? l.id}' achatada (hierarquia de lanes não suportada)`);
      const b = boundsById.get(l.id);
      const ld = docText(l);
      lanes.push({ id: l.id, name: l.name ?? '', ...(b && { bounds: b }), ...(ld && { description: ld }), ...(colorsById.get(l.id)?.fill && { fill: colorsById.get(l.id)!.fill }) });
      for (const ref of l.flowNodeRef ?? []) laneOf.set(ref.id, l.id);
      if (l.childLaneSet?.lanes) walkLanes(l.childLaneSet.lanes, true);
    }
  };
  for (const ls of process.laneSets ?? []) walkLanes(ls.lanes ?? [], false);

  // ---- nós
  const nodes: ProcessNode[] = [];
  const seen = new Set<string>();
  const addNode = (el: ModdleElement, m: Mapped, name: string) => {
    if (m.warn) warnings.push(`${el.$type} '${el.id}': ${m.warn}`);
    const b = boundsById.get(el.id);
    const col = colorsById.get(el.id);
    const loopT = el.loopCharacteristics?.$type as string | undefined;
    const loop = loopT === 'bpmn:StandardLoopCharacteristics' ? 'standard'
      : loopT === 'bpmn:MultiInstanceLoopCharacteristics' ? (el.loopCharacteristics.isSequential ? 'sequential' : 'parallel') : undefined;
    nodes.push({
      id: el.id, kind: m.kind, name,
      ...(m.variant && { variant: m.variant }),
      ...(laneOf.has(el.id) && { laneId: laneOf.get(el.id) }),
      ...(docText(el) && { documentation: docText(el) }),
      ...readProps(el),
      ...(loop && { loop }),
      ...(col?.fill && { fill: col.fill }),
      ...(col?.stroke && { stroke: col.stroke }),
      ...(b && { bounds: b }),
      ...m.extra,
    } as ProcessNode);
    seen.add(el.id);
  };

  const flowEls: ModdleElement[] = process.flowElements ?? [];
  for (const el of flowEls) {
    const t: string = el.$type;
    const name: string = el.name ?? '';
    const task = TASK_MAP[t];
    const gw = GATEWAY_MAP[t];
    if (task) addNode(el, task, name);
    else if (gw) addNode(el, { kind: 'gateway', variant: gw }, name);
    else if (['bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:IntermediateCatchEvent', 'bpmn:IntermediateThrowEvent', 'bpmn:BoundaryEvent'].includes(t)) {
      const kind = t === 'bpmn:StartEvent' ? 'start' : t === 'bpmn:EndEvent' ? 'end' : t === 'bpmn:BoundaryEvent' ? 'boundary' : 'intermediate';
      const defs0: ModdleElement[] = el.eventDefinitions ?? [];
      const def = defs0[0]?.$type as string | undefined;
      if (defs0.length > 1) warnings.push(`${t} '${el.id}': múltiplas definições de evento; mantida só a primeira`);
      if (def && !EVENT_DEF_MAP[def]) warnings.push(`${t} '${el.id}': definição ${def} não suportada; tratada como evento sem definição`);
      addNode(el, {
        kind, variant: (def && EVENT_DEF_MAP[def]) || 'none',
        extra: {
          ...(kind === 'intermediate' && { throw: t === 'bpmn:IntermediateThrowEvent' }),
          ...(kind === 'boundary' && { attachedToId: el.attachedToRef?.id as string, cancelActivity: el.cancelActivity !== false }),
        },
      }, name);
    } else if (t === 'bpmn:CallActivity') {
      addNode(el, { kind: 'subprocess', extra: el.calledElement ? { calledProcessId: el.calledElement as string } : {} }, name);
    } else if (t === 'bpmn:DataStoreReference') {
      addNode(el, { kind: 'dataStore' }, name || (el.dataStoreRef?.name as string | undefined) || '');
    } else if (t === 'bpmn:SubProcess') {
      const inner = el.flowElements?.length ?? 0;
      if (inner > 0) warnings.push(`SubProcess '${el.id}': ${inner} elementos internos ignorados (modelo só suporta subprocesso colapsado)`);
      addNode(el, { kind: 'subprocess' }, name);
    } else if (t === 'bpmn:DataObjectReference') addNode(el, { kind: 'dataObject' }, name);
    else if (t === 'bpmn:DataObject' || t === 'bpmn:SequenceFlow') continue; // DataObject é só a definição; fluxos abaixo
    else warnings.push(`${t} '${el.id ?? '?'}' não suportado — ignorado`);
  }
  for (const a of (process.artifacts ?? []) as ModdleElement[]) {
    if (a.$type === 'bpmn:TextAnnotation') addNode(a, { kind: 'annotation' }, a.text ?? '');
    else if (a.$type !== 'bpmn:Association') warnings.push(`${a.$type} '${a.id ?? '?'}' não suportado — ignorado`);
  }

  // ---- fluxos
  const flows: ProcessFlow[] = [];
  // Endereçamento de pools: participantes externos pelo próprio id; o pool do processo por `process.id` (convenção do modelo)
  const endpoint = (ref?: ModdleElement): string | undefined =>
    !ref ? undefined : participant && ref.id === participant.id ? (process.id as string) : (ref.id as string);
  const known = new Set<string>([...seen, process.id as string, ...blackBoxEls.map((p) => p.id as string)]);
  const addFlow = (el: ModdleElement, kind: 'sequence' | 'association' | 'message') => {
    const s = endpoint(el.sourceRef);
    const t = endpoint(el.targetRef);
    if (!s || !t || !known.has(s) || !known.has(t)) {
      warnings.push(`${el.$type} '${el.id}' descartado: origem/destino não importado (${s ?? '?'} -> ${t ?? '?'})`);
      return;
    }
    const isDefault = kind === 'sequence' && flowEls.some((g) => g.id === s && g.default?.id === el.id);
    const wp = waypointsById.get(el.id);
    const fp = readProps(el);
    const cond = el.conditionExpression?.body as string | undefined;
    flows.push({
      id: el.id, kind, sourceId: s, targetId: t, isDefault,
      ...(el.name && { name: el.name as string }),
      ...(wp && { waypoints: wp }),
      ...(cond && { condition: cond }),
      ...(docText(el) && { documentation: docText(el) }),
      ...(fp.description && { description: fp.description as string }),
      ...(typeof fp.probability === 'number' && { probability: fp.probability }),
      ...(fp.manualRoute && { manualRoute: true }),
    });
  };
  for (const el of flowEls) if (el.$type === 'bpmn:SequenceFlow') addFlow(el, 'sequence');
  for (const a of (process.artifacts ?? []) as ModdleElement[]) if (a.$type === 'bpmn:Association') addFlow(a, 'association');
  for (const mf of (collab?.messageFlows ?? []) as ModdleElement[]) addFlow(mf, 'message');

  const pool = participant ? boundsById.get(participant.id) : undefined;
  // ---- definições de atributos + coerção dos valores ao tipo da definição
  const procProps = readProps(process);
  const attrDefs = (procProps.attributeDefs ?? []) as Array<{ id: string; type: string }>;
  const defById = new Map(attrDefs.map((d) => [d.id, d]));
  const coerceNode = (n: ProcessNode): ProcessNode => ({
    ...n,
    attributes: (n.attributes ?? []).map((a) => {
      const d = a.defId ? defById.get(a.defId) : undefined;
      return d ? { ...a, value: coerceAttrValue(d as never, a.value) } : a;
    }),
  });
  // ---- rótulos: offset = posição absoluta lida - posição padrão calculada pelo core
  const withOffsets = nodes.map((n) => {
    const pos = labelPosById.get(n.id);
    const lay = pos ? nodeLabel(n) : null;
    const off = pos && lay ? offsetFrom(lay.home, pos) : undefined;
    return off ? { ...n, labelOffset: off } : n;
  });
  const flowsWithOffsets = flows.map((f) => {
    const pos = labelPosById.get(f.id);
    const lay = pos ? flowLabel(f) : null;
    const off = pos && lay ? offsetFrom(lay.home, pos) : undefined;
    return off ? { ...f, labelOffset: off } : f;
  });

  const model: ProcessModel = parseModel({
    id: process.id,
    name: participant?.name ?? process.name ?? process.id,
    lanes, nodes: withOffsets.map(coerceNode), flows: flowsWithOffsets,
    participants: blackBoxEls.map((p) => ({ id: p.id as string, name: (p.name as string) ?? '', ...(boundsById.get(p.id) && { bounds: boundsById.get(p.id) }), ...(docText(p) && { description: docText(p) }) })),
    meta: (() => {
      const mp = procProps;
      return { ...(mp.description && { description: mp.description }), ...(docText(process) && { documentation: docText(process) }),
        ...(mp.author && { author: mp.author }), ...(mp.owner && { owner: mp.owner }), ...(mp.version && { version: mp.version }),
        ...(mp.createdAt && { createdAt: mp.createdAt }), ...(mp.modifiedAt && { modifiedAt: mp.modifiedAt }), tags: (mp.tags as string[] | undefined) ?? [] };
    })(),
    attributeDefs: attrDefs,
    ...(pool && { pool }),
  });
  return { model, warnings };
}
