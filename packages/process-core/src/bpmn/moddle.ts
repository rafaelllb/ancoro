/**
 * Instância do bpmn-moddle com a extensão `ancoro:` para propriedades ricas.
 *
 * [2026-10-14] Criado: extensão de namespace ancoro (performer, SLA, código/transação do sistema, requisitos, origem) — Rafael Brito
 * Decisão: propriedades de negócio vão em <extensionElements><ancoro:props/></extensionElements>,
 * mantendo o arquivo BPMN 2.0 puro e legível por qualquer ferramenta (Camunda Modeler, Signavio, bpmn.io);
 * ferramentas que não conhecem o namespace simplesmente o ignoram.
 */
import { BpmnModdle } from 'bpmn-moddle';

export const ANCORO_NS = 'http://ancoro.app/schema/bpmn/ext/1.0';

const ancoroDescriptor = {
  name: 'Ancoro Process Studio extensions',
  uri: ANCORO_NS,
  prefix: 'ancoro',
  xml: { tagAlias: 'lowerCase' },
  types: [
    {
      name: 'Props',
      superClass: ['Element'],
      properties: [
        { name: 'performer', isAttr: true, type: 'String' },
        { name: 'sla', isAttr: true, type: 'String' },
        { name: 'sapTransaction', isAttr: true, type: 'String' },
        { name: 'source', isAttr: true, type: 'String' },
        // [2026-10-14] Criado: propriedades completas (descrição, execução, RACI, metadados do processo) — Rafael Brito
        { name: 'description', isAttr: true, type: 'String' },
        { name: 'url', isAttr: true, type: 'String' },
        { name: 'duration', isAttr: true, type: 'String' },
        { name: 'cost', isAttr: true, type: 'String' },
        { name: 'priority', isAttr: true, type: 'String' },
        { name: 'accountable', isAttr: true, type: 'String' },
        { name: 'probability', isAttr: true, type: 'String' },
        { name: 'manualRoute', isAttr: true, type: 'String' },
        { name: 'author', isAttr: true, type: 'String' },
        { name: 'owner', isAttr: true, type: 'String' },
        { name: 'version', isAttr: true, type: 'String' },
        { name: 'createdAt', isAttr: true, type: 'String' },
        { name: 'modifiedAt', isAttr: true, type: 'String' },
        { name: 'requirements', type: 'Requirement', isMany: true },
        // listas de texto (consulted, informed, systems, inputs, outputs, rules, tags) e atributos estendidos
        { name: 'items', type: 'Item', isMany: true },
        { name: 'attributes', type: 'Attribute', isMany: true },
        // [2026-10-14] Criado: definições de atributos estendidos tipados (só no <ancoro:props> do processo) — Rafael Brito
        { name: 'attributeDefs', type: 'AttributeDef', isMany: true },
      ],
    },
    {
      name: 'Requirement',
      superClass: ['Element'],
      properties: [{ name: 'ref', isAttr: true, type: 'String' }],
    },
    { name: 'Item', superClass: ['Element'], properties: [{ name: 'list', isAttr: true, type: 'String' }, { name: 'value', isAttr: true, type: 'String' }] },
    {
      name: 'Attribute',
      superClass: ['Element'],
      properties: [
        { name: 'name', isAttr: true, type: 'String' },
        { name: 'def', isAttr: true, type: 'String' },
        { name: 'value', isAttr: true, type: 'String' },
        { name: 'items', type: 'Text', isMany: true }, // seleção múltipla
        { name: 'rows', type: 'Row', isMany: true }, // tabela
      ],
    },
    { name: 'Text', superClass: ['Element'], properties: [{ name: 'text', isBody: true, type: 'String' }] },
    { name: 'Row', superClass: ['Element'], properties: [{ name: 'cells', type: 'Text', isMany: true }] },
    {
      name: 'AttributeDef',
      superClass: ['Element'],
      properties: [
        { name: 'key', isAttr: true, type: 'String' },
        { name: 'name', isAttr: true, type: 'String' },
        { name: 'description', isAttr: true, type: 'String' },
        { name: 'type', isAttr: true, type: 'String' },
        { name: 'appliesTo', isAttr: true, type: 'String' },
        { name: 'options', type: 'Text', isMany: true },
        { name: 'columns', type: 'Column', isMany: true },
      ],
    },
    {
      name: 'Column',
      superClass: ['Element'],
      properties: [{ name: 'key', isAttr: true, type: 'String' }, { name: 'name', isAttr: true, type: 'String' }, { name: 'type', isAttr: true, type: 'String' }],
    },
  ],
};

/** Listas de texto guardadas como <ancoro:item list="..."> (ordem preservada). */
export const ITEM_LISTS = ['consulted', 'informed', 'systems', 'inputs', 'outputs', 'rules'] as const;

export const createModdle = (): BpmnModdle => new BpmnModdle({ ancoro: ancoroDescriptor });
