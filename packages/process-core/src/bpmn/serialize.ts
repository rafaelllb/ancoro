/**
 * ProcessModel -> BPMN 2.0 XML (com BPMNDI para o diagrama).
 *
 * [2026-10-14] Criado: serializer headless sobre bpmn-moddle — Rafael Brito
 * Decisões:
 * - Entrada é canonicalizada (ordenada por id) => XML determinístico e idempotente no round-trip.
 * - Lanes => 1 collaboration + 1 participant (pool) + laneSet; sem lanes => só <process>.
 * - Objeto de dados = DataObject + DataObjectReference ligado por Association (não dataInputAssociation,
 *   que exigiria ioSpecification/DataInput; Association é válida no schema e preserva o desenho).
 * - <incoming>/<outgoing> não são emitidos: são derivados dos sequenceFlow (BPMN permite omitir).
 *
 * TODO [ESTIGMERGIA]: subprocesso expandido (filhos) e boundary events
 * - Por que pendente: fora do MVP do modelo; subprocess é sempre colapsado aqui.
 * - Próximo passo: adicionar filhos em ProcessNode e emitir flowElements aninhados.
 */
import type { ModdleElement } from 'bpmn-moddle';
import { ITEM_LISTS, createModdle } from './moddle.js';
import { nodeLabel, flowLabel } from '../labels.js';
import { canonicalize, parseModel, type Bounds, type ProcessModel, type ProcessNode } from '../model.js';

const TARGET_NS = 'http://www.omg.org/spec/BPMN/20100524/';

const TASK_TYPE: Record<string, string> = {
  generic: 'bpmn:Task', user: 'bpmn:UserTask', service: 'bpmn:ServiceTask', manual: 'bpmn:ManualTask', script: 'bpmn:ScriptTask',
};
const GATEWAY_TYPE: Record<string, string> = {
  exclusive: 'bpmn:ExclusiveGateway', parallel: 'bpmn:ParallelGateway', inclusive: 'bpmn:InclusiveGateway',
  eventBased: 'bpmn:EventBasedGateway',
};
const EVENT_DEF_TYPE: Record<string, string> = {
  timer: 'bpmn:TimerEventDefinition', message: 'bpmn:MessageEventDefinition', error: 'bpmn:ErrorEventDefinition',
  // [2026-10-14] Alterado: + conditional/link/terminate (corpus BIIN) — Rafael Brito
  conditional: 'bpmn:ConditionalEventDefinition', link: 'bpmn:LinkEventDefinition', terminate: 'bpmn:TerminateEventDefinition',
};

export async function toBpmnXml(input: ProcessModel): Promise<string> {
  // parseModel revalida (defaults + variants) caso o chamador monte o objeto à mão.
  const model = canonicalize(parseModel(input));
  const moddle = createModdle();
  const create = moddle.create.bind(moddle);

  /** <ancoro:props> a partir de qualquer objeto com os campos conhecidos; undefined se não há nada a gravar */
  function buildProps(o: Record<string, unknown>): ModdleElement | undefined {
    const attrs: Record<string, unknown> = {};
    for (const k of ['performer', 'sla', 'sapTransaction', 'source', 'description', 'url', 'duration', 'cost', 'priority', 'accountable', 'author', 'owner', 'version', 'createdAt', 'modifiedAt']) {
      if (o[k]) attrs[k] = o[k];
    }
    if (typeof o.probability === 'number') attrs.probability = String(o.probability);
    if (o.manualRoute === true) attrs.manualRoute = 'true';
    const reqs = (o.requirementRefs as string[] | undefined) ?? [];
    if (reqs.length) attrs.requirements = reqs.map((ref) => create('ancoro:Requirement', { ref }));
    const items = [...ITEM_LISTS, 'tags'].flatMap((list) => ((o[list] as string[] | undefined) ?? []).map((value) => create('ancoro:Item', { list, value })));
    if (items.length) attrs.items = items;
    const custom = (o.attributes as Array<{ name: string; defId?: string; value: string | string[] | string[][] }> | undefined) ?? [];
    if (custom.length) {
      attrs.attributes = custom.map((a) => {
        const base: Record<string, unknown> = { name: a.name, ...(a.defId && { def: a.defId }) };
        const text = (t: string) => create('ancoro:Text', { text: t });
        if (typeof a.value === 'string') base.value = a.value;
        else if (a.value.length && Array.isArray(a.value[0])) base.rows = (a.value as string[][]).map((r) => create('ancoro:Row', { cells: r.map(text) })); // tabela
        else base.items = (a.value as string[]).map(text); // seleção múltipla
        return create('ancoro:Attribute', base);
      });
    }
    const defs = (o.attributeDefs as Array<Record<string, unknown>> | undefined) ?? [];
    if (defs.length) {
      attrs.attributeDefs = defs.map((d) => create('ancoro:AttributeDef', {
        key: d.id, name: d.name, type: d.type, ...(d.description ? { description: d.description } : {}),
        ...((d.appliesTo as string[] | undefined)?.length ? { appliesTo: (d.appliesTo as string[]).join(',') } : {}),
        ...((d.options as string[]).length ? { options: (d.options as string[]).map((t) => create('ancoro:Text', { text: t })) } : {}),
        ...((d.columns as Array<{ id: string; name: string; type: string }>).length
          ? { columns: (d.columns as Array<{ id: string; name: string; type: string }>).map((c) => create('ancoro:Column', { key: c.id, name: c.name, type: c.type })) } : {}),
      }));
    }
    return Object.keys(attrs).length ? create('ancoro:Props', attrs) : undefined;
  }

  const els = new Map<string, ModdleElement>(); // id do modelo -> elemento BPMN (alvo de sourceRef/targetRef/DI)
  const flowElements: ModdleElement[] = [];
  const artifacts: ModdleElement[] = [];
  const dataStores: ModdleElement[] = []; // bpmn:DataStore (definições) -> rootElements
  const messageFlows: ModdleElement[] = [];
  // [2026-10-14] Criado: pools externos (caixa-preta) precisam existir antes dos fluxos (alvo de message flow) — Rafael Brito
  // O pool do próprio processo é endereçável como `model.id` em message flows (convenção do modelo).
  const hasPools = model.lanes.length > 0 || model.participants.length > 0 || model.pool !== undefined;
  const mainPool = hasPools ? create('bpmn:Participant', { id: `${model.id}_pool`, name: model.name }) : undefined;
  if (mainPool) els.set(model.id, mainPool);
  const blackBoxes = model.participants.map((p) => {
    const el = create('bpmn:Participant', { id: p.id, name: p.name });
    if (p.description) el.documentation = [create('bpmn:Documentation', { text: p.description })];
    els.set(p.id, el);
    return el;
  });

  function createNode(n: ProcessNode): ModdleElement {
    const attrs: Record<string, unknown> = { id: n.id };
    if (n.name && n.kind !== 'annotation') attrs.name = n.name;
    let el: ModdleElement;
    switch (n.kind) {
      case 'start': el = create('bpmn:StartEvent', attrs); break;
      case 'end': el = create('bpmn:EndEvent', attrs); break;
      case 'intermediate': el = create(n.throw ? 'bpmn:IntermediateThrowEvent' : 'bpmn:IntermediateCatchEvent', attrs); break;
      case 'boundary': el = create('bpmn:BoundaryEvent', { ...attrs, cancelActivity: n.cancelActivity }); break; // attachedToRef: após criar todos os nós
      case 'task': el = create(TASK_TYPE[n.variant ?? 'generic']!, attrs); break;
      case 'gateway': el = create(GATEWAY_TYPE[n.variant ?? 'exclusive']!, attrs); break;
      case 'subprocess':
        // call activity quando aponta para outro processo do repositório; senão subprocesso colapsado
        el = n.calledProcessId ? create('bpmn:CallActivity', { ...attrs, calledElement: n.calledProcessId }) : create('bpmn:SubProcess', attrs);
        break;
      case 'dataStore': el = create('bpmn:DataStoreReference', attrs); break;
      case 'dataObject': el = create('bpmn:DataObjectReference', attrs); break;
      case 'annotation': el = create('bpmn:TextAnnotation', { ...attrs, text: n.name }); break;
    }
    const defType = n.variant ? EVENT_DEF_TYPE[n.variant] : undefined;
    if ((n.kind === 'start' || n.kind === 'end' || n.kind === 'intermediate' || n.kind === 'boundary') && defType) {
      const defAttrs: Record<string, unknown> = { id: `${n.id}_def` };
      if (n.variant === 'link') defAttrs.name = n.name || n.id; // BPMN exige name no link; pares throw/catch casam por nome
      if (n.variant === 'conditional') defAttrs.condition = create('bpmn:FormalExpression', { body: '' });
      el.eventDefinitions = [create(defType, defAttrs)];
    }
    if (n.documentation) el.documentation = [create('bpmn:Documentation', { text: n.documentation })];
    const props = buildProps(n);
    if (props) el.extensionElements = create('bpmn:ExtensionElements', { values: [props] });
    if ((n.kind === 'task' || n.kind === 'subprocess') && n.loop !== 'none') {
      el.loopCharacteristics = n.loop === 'standard'
        ? create('bpmn:StandardLoopCharacteristics')
        : create('bpmn:MultiInstanceLoopCharacteristics', { isSequential: n.loop === 'sequential' });
    }
    return el;
  }

  // ---- nós
  for (const n of model.nodes) {
    const el = createNode(n);
    els.set(n.id, el);
    if (n.kind === 'dataObject') {
      // DataObject (definição) + DataObjectReference (o que aparece no diagrama)
      const def = create('bpmn:DataObject', { id: `${n.id}_obj` });
      el.dataObjectRef = def;
      flowElements.push(def, el);
    } else if (n.kind === 'dataStore') {
      const def = create('bpmn:DataStore', { id: `${n.id}_store`, name: n.name });
      el.dataStoreRef = def;
      dataStores.push(def);
      flowElements.push(el);
    } else if (n.kind === 'annotation') {
      artifacts.push(el);
    } else {
      flowElements.push(el);
    }
  }

  for (const n of model.nodes) {
    if (n.kind !== 'boundary') continue;
    const host = els.get(n.attachedToId!);
    if (!host) throw new Error(`Boundary '${n.id}' anexado a nó inexistente '${n.attachedToId}'. Rode validateModel antes.`);
    els.get(n.id)!.attachedToRef = host;
  }

  // ---- fluxos
  for (const f of model.flows) {
    const source = els.get(f.sourceId);
    const target = els.get(f.targetId);
    if (!source || !target) {
      throw new Error(`Fluxo '${f.id}' referencia nó inexistente (${f.sourceId} -> ${f.targetId}). Rode validateModel antes.`);
    }
    // [2026-10-14] Alterado: documentação, condição e props (descrição/probabilidade) também nos fluxos — Rafael Brito
    const decorate = (el: ModdleElement) => {
      if (f.documentation) el.documentation = [create('bpmn:Documentation', { text: f.documentation })];
      const props = buildProps({ description: f.description, probability: f.probability, manualRoute: f.manualRoute });
      if (props) el.extensionElements = create('bpmn:ExtensionElements', { values: [props] });
      return el;
    };
    if (f.kind === 'message') {
      const mf = decorate(create('bpmn:MessageFlow', { id: f.id, sourceRef: source, targetRef: target, ...(f.name && { name: f.name }) }));
      els.set(f.id, mf);
      messageFlows.push(mf);
    } else if (f.kind === 'association') {
      const a = decorate(create('bpmn:Association', { id: f.id, sourceRef: source, targetRef: target, associationDirection: 'None' }));
      els.set(f.id, a);
      artifacts.push(a);
    } else {
      const sf = decorate(create('bpmn:SequenceFlow', { id: f.id, sourceRef: source, targetRef: target, ...(f.name && { name: f.name }) }));
      if (f.condition) sf.conditionExpression = create('bpmn:FormalExpression', { body: f.condition });
      els.set(f.id, sf);
      flowElements.push(sf);
      if (f.isDefault) source.default = sf;
    }
  }

  // ---- processo, lanes, pool
  const process = create('bpmn:Process', { id: model.id, isExecutable: false, flowElements, artifacts });
  // [2026-10-14] Criado: metadados do processo (autor, versão, datas, tags, descrição) em ancoro:props do <process> — Rafael Brito
  const metaProps = buildProps({ ...model.meta, tags: model.meta.tags, attributeDefs: model.attributeDefs });
  if (metaProps) process.extensionElements = create('bpmn:ExtensionElements', { values: [metaProps] });
  if (model.meta.documentation) process.documentation = [create('bpmn:Documentation', { text: model.meta.documentation })];
  if (model.lanes.length) {
    const lanes = model.lanes.map((l) => {
      const members = model.nodes.filter((n) => n.laneId === l.id && !['dataObject', 'dataStore', 'annotation'].includes(n.kind));
      const lane = create('bpmn:Lane', { id: l.id, name: l.name, flowNodeRef: members.map((n) => els.get(n.id)) });
      if (l.description) lane.documentation = [create('bpmn:Documentation', { text: l.description })];
      els.set(l.id, lane);
      return lane;
    });
    process.laneSets = [create('bpmn:LaneSet', { id: `${model.id}_laneset`, lanes })];
  }

  const rootElements: ModdleElement[] = [];
  let planeTarget: ModdleElement = process;
  let participant: ModdleElement | undefined;
  if (mainPool) {
    participant = mainPool;
    participant.processRef = process;
    const collab = create('bpmn:Collaboration', {
      id: `${model.id}_collab`, participants: [participant, ...blackBoxes],
      ...(messageFlows.length && { messageFlows }),
    });
    rootElements.push(collab, process, ...dataStores);
    planeTarget = collab;
  } else {
    process.name = model.name;
    rootElements.push(process, ...dataStores);
  }

  // ---- DI (só se houver alguma geometria)
  const planeElements: ModdleElement[] = [];
  const shape = (id: string, bpmnEl: ModdleElement, b: Bounds, extra: Record<string, unknown> = {}, colors: { fill?: string; stroke?: string } = {}) => {
    // [2026-10-14] cores: o descriptor do bpmn-moddle já conhece bioc:fill/stroke (props `fill`/`stroke` do BPMNShape);
    // ferramentas que não conhecem o namespace ignoram. O bpmn.io/Camunda Modeler desenham a cor.
    const sh = create('bpmndi:BPMNShape', {
      id: `${id}_di`, bpmnElement: bpmnEl, ...extra, ...(colors.fill && { fill: colors.fill }), ...(colors.stroke && { stroke: colors.stroke }),
      bounds: create('dc:Bounds', { x: b.x, y: b.y, width: b.w, height: b.h }),
    });
    planeElements.push(sh);
  };

  const poolBounds = model.pool ?? unionOfLanes(model);
  if (participant && poolBounds) shape(`${model.id}_pool`, participant, poolBounds, { isHorizontal: true });
  for (const p of model.participants) if (p.bounds) shape(p.id, els.get(p.id)!, p.bounds, { isHorizontal: true });
  for (const l of model.lanes) if (l.bounds) shape(l.id, els.get(l.id)!, l.bounds, { isHorizontal: true }, { fill: l.fill });
  for (const n of model.nodes) {
    if (!n.bounds) continue;
    // [2026-10-14] Criado: posição customizada do rótulo -> <bpmndi:BPMNLabel> (absoluto), só quando o usuário mexeu (offset) — Rafael Brito
    const lab = n.labelOffset ? nodeLabel(n) : null;
    shape(n.id, els.get(n.id)!, n.bounds, {
      ...(n.kind === 'subprocess' ? { isExpanded: false } : {}),
      ...(lab && { label: create('bpmndi:BPMNLabel', { bounds: create('dc:Bounds', { x: lab.box.x, y: lab.box.y, width: lab.box.w, height: lab.box.h }) }) }),
    }, { fill: n.fill, stroke: n.stroke });
  }
  for (const f of model.flows) {
    if (!f.waypoints?.length) continue;
    const fl = f.labelOffset ? flowLabel(f) : null;
    planeElements.push(create('bpmndi:BPMNEdge', {
      id: `${f.id}_di`, bpmnElement: els.get(f.id),
      waypoint: f.waypoints.map(([x, y]) => create('dc:Point', { x, y })),
      ...(fl && { label: create('bpmndi:BPMNLabel', { bounds: create('dc:Bounds', { x: fl.box.x, y: fl.box.y, width: fl.box.w, height: fl.box.h }) }) }),
    }));
  }

  const definitions = create('bpmn:Definitions', {
    id: `${model.id}_defs`, targetNamespace: TARGET_NS, rootElements,
    ...(planeElements.length && {
      diagrams: [create('bpmndi:BPMNDiagram', {
        id: `${model.id}_diagram`,
        plane: create('bpmndi:BPMNPlane', { id: `${model.id}_plane`, bpmnElement: planeTarget, planeElement: planeElements }),
      })],
    }),
  });

  const { xml } = await moddle.toXML(definitions, { format: true });
  return xml;
}

/** Pool derivado das lanes quando não informado: lanes ficam à direita do cabeçalho do pool (30px, convenção bpmn-js). */
function unionOfLanes(m: ProcessModel): Bounds | undefined {
  const bs = m.lanes.map((l) => l.bounds).filter((b): b is Bounds => !!b);
  if (!bs.length) return undefined;
  const x1 = Math.min(...bs.map((b) => b.x)), y1 = Math.min(...bs.map((b) => b.y));
  const x2 = Math.max(...bs.map((b) => b.x + b.w)), y2 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x1 - 30, y: y1, w: x2 - x1 + 30, h: y2 - y1 };
}
