/**
 * Modelo de domínio do Process Studio (independente do Ancoro).
 *
 * [2026-10-14] Criado: modelo + schema Zod — Rafael Brito
 * Este é também o "JSON intermediário" do pipeline de geração por IA (README §5.2): o LLM
 * produz este JSON (sem bounds), código determinístico faz layout, e o serializer gera o BPMN XML.
 * Por isso `bounds`/`waypoints` são opcionais: dependem de layout, não de semântica.
 */
import { z } from 'zod';
import { ATTR_TYPES, COLUMN_TYPES } from './attributes.js';

// IDs viram atributos xsd:ID no BPMN XML => precisam ser NCName (sem espaço/':' e não iniciam com dígito).
const Id = z.string().regex(/^[A-Za-z_][\w.-]*$/, 'id deve ser um NCName válido (XML ID)');

// [2026-10-14] Criado: cor em #rrggbb (aparência por elemento, estilo Bizagi) — Rafael Brito
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser #rrggbb');
export const LOOP_TYPES = ['none', 'standard', 'parallel', 'sequential'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;

export const BoundsSchema = z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() });
export type Bounds = z.infer<typeof BoundsSchema>;

// [2026-10-14] Alterado: + 'boundary' (evento anexado a tarefa) e 'dataStore' (repositório de dados) — vistos no corpus real BIIN — Rafael Brito
export const NODE_KINDS = ['start', 'end', 'intermediate', 'boundary', 'task', 'gateway', 'subprocess', 'dataObject', 'dataStore', 'annotation'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

// Variantes por kind. Eventos: definição do evento. Task: tipo. Gateway: tipo.
// [2026-10-14] Alterado: + conditional, link, terminate (corpus BIIN usa os três) — Rafael Brito
export const EVENT_VARIANTS = ['none', 'timer', 'message', 'error', 'conditional', 'link', 'terminate'] as const;
export const TASK_VARIANTS = ['generic', 'user', 'service', 'manual', 'script'] as const;
export const GATEWAY_VARIANTS = ['exclusive', 'parallel', 'inclusive', 'eventBased'] as const;

const VARIANTS_BY_KIND: Partial<Record<NodeKind, readonly string[]>> = {
  start: EVENT_VARIANTS,
  end: EVENT_VARIANTS,
  intermediate: EVENT_VARIANTS,
  boundary: EVENT_VARIANTS,
  task: TASK_VARIANTS,
  gateway: GATEWAY_VARIANTS,
};

// [2026-10-14] Criado: atributos estendidos TIPADOS (estilo Bizagi): definição no processo, valor por elemento — Rafael Brito
export const AttributeColumnSchema = z.object({ id: Id, name: z.string().min(1), type: z.enum(COLUMN_TYPES).default('text') });
export const AttributeDefSchema = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(ATTR_TYPES),
  /** select / radio / multiselect */
  options: z.array(z.string()).default([]),
  /** table */
  columns: z.array(AttributeColumnSchema).default([]),
  /** tipos de elemento em que o atributo aparece; ausente = todos */
  appliesTo: z.array(z.enum(NODE_KINDS)).optional(),
});
export type AttributeDef = z.infer<typeof AttributeDefSchema>;
/** texto | seleção múltipla | tabela (linhas de células, na ordem das colunas) */
export const AttrValueSchema = z.union([z.string(), z.array(z.string()), z.array(z.array(z.string()))]);
export type AttrValue = z.infer<typeof AttrValueSchema>;
/** `defId` ausente = atributo livre (legado/rápido), sempre texto */
export const NodeAttributeSchema = z.object({ name: z.string(), defId: Id.optional(), value: AttrValueSchema });
export type NodeAttribute = z.infer<typeof NodeAttributeSchema>;

const LabelOffset = z.object({ dx: z.number(), dy: z.number() });

export const NodeSchema = z
  .object({
    id: Id,
    kind: z.enum(NODE_KINDS),
    variant: z.string().optional(),
    name: z.string().default(''),
    laneId: Id.optional(),
    documentation: z.string().optional(),
    // Propriedades ricas (README §5.1) — persistidas em extensionElements (namespace ancoro:)
    performer: z.string().optional(),
    sla: z.string().optional(),
    // [2026-10-17] Nota: o NOME `sapTransaction` é legado e fica por compatibilidade (JSON salvo no banco, atributo `ancoro:sapTransaction` nos
    // .bpmn e portais já publicados). Semanticamente é "código/transação do sistema", de qualquer sistema; a UI já usa rótulo neutro.
    // TODO [ESTIGMERGIA]: renomear para `systemCode` com migração: aceitar o nome antigo no parse (alias), gravar o novo, e
    // migrar BusinessProcess.model no banco. Risco: quebra de .bpmn exportados antes — por isso não foi feito junto com a troca de rótulos.
    sapTransaction: z.string().optional(),
    requirementRefs: z.array(z.string()).default([]),
    /** Rastreabilidade da geração por IA: origem do elemento (requisito/trecho). README §5.2 */
    source: z.string().optional(),
    bounds: BoundsSchema.optional(),
    /** boundary: id da tarefa/subprocesso ao qual o evento está anexado */
    attachedToId: Id.optional(),
    /** boundary: true = interrompe a atividade (padrão BPMN) */
    cancelActivity: z.boolean().default(true),
    /** intermediate: true = evento de lançamento (throw); false = captura (catch). Link/mensagem usam isso. */
    throw: z.boolean().default(false),
    /** subprocess: id de OUTRO processo do repositório chamado (call activity) — base do drill-down entre diagramas */
    calledProcessId: Id.optional(),

    // ---- [2026-10-14] Criado: propriedades completas estilo Bizagi (descrição, RACI, execução, dados, atributos, aparência) — Rafael Brito
    /** Descrição curta (a documentação longa fica em `documentation`) */
    description: z.string().optional(),
    /** Hyperlink associado ao elemento (Bizagi: "Link") */
    url: z.string().optional(),
    /** Repetição da atividade: padrão (loop), multi-instância paralela ou sequencial. Só task/subprocess. */
    loop: z.enum(LOOP_TYPES).default('none'),
    /** Duração estimada (texto livre, ex.: "2 h", "PT2H") — o SLA continua sendo o compromisso; isto é a estimativa */
    duration: z.string().optional(),
    cost: z.string().optional(),
    priority: z.enum(PRIORITIES).optional(),
    /** RACI: `performer` = Responsible; os demais abaixo */
    accountable: z.string().optional(),
    consulted: z.array(z.string()).default([]),
    informed: z.array(z.string()).default([]),
    /** Sistemas/módulos envolvidos (ex.: "ERP", "CRM", "portal do cliente") */
    systems: z.array(z.string()).default([]),
    /** Dados de entrada/saída e regras de negócio/controles aplicáveis */
    inputs: z.array(z.string()).default([]),
    outputs: z.array(z.string()).default([]),
    rules: z.array(z.string()).default([]),
    /** Atributos estendidos definidos pelo usuário (Bizagi: "Extended Attributes") */
    attributes: z.array(NodeAttributeSchema).default([]),
    /** Deslocamento do rótulo (nome fora da forma) em relação à posição padrão — ver labels.ts */
    labelOffset: LabelOffset.optional(),
    /** Aparência (bioc:fill/bioc:stroke no BPMN — lido também pelo bpmn.io) */
    fill: Color.optional(),
    stroke: Color.optional(),
  })
  .superRefine((n, ctx) => {
    if (n.kind === 'boundary' && !n.attachedToId) {
      ctx.addIssue({ code: 'custom', path: ['attachedToId'], message: 'boundary exige attachedToId' });
    }
    const allowed = VARIANTS_BY_KIND[n.kind];
    if (allowed && n.variant !== undefined && !allowed.includes(n.variant)) {
      ctx.addIssue({ code: 'custom', path: ['variant'], message: `variant '${n.variant}' inválida para kind '${n.kind}'` });
    }
    if (!allowed && n.variant !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['variant'], message: `kind '${n.kind}' não aceita variant` });
    }
  });
export type ProcessNode = z.infer<typeof NodeSchema>;

export const FlowSchema = z.object({
  id: Id,
  /** sequence = fluxo de sequência; association = ligação tracejada (anotação/objeto/tabela); message = entre pools (nó ou participante) */
  kind: z.enum(['sequence', 'association', 'message']).default('sequence'),
  sourceId: Id,
  targetId: Id,
  name: z.string().optional(),
  /** Fluxo padrão do gateway de origem (atributo `default` do BPMN) */
  isDefault: z.boolean().default(false),
  waypoints: z.array(z.tuple([z.number(), z.number()])).optional(),
  // [2026-10-14] Criado: propriedades de fluxo (Bizagi: condição, descrição, probabilidade) — Rafael Brito
  /** Condição de saída (expressão em texto livre; BPMN conditionExpression) */
  condition: z.string().optional(),
  description: z.string().optional(),
  documentation: z.string().optional(),
  /** Probabilidade (%) de seguir este ramo — usada em simulação */
  probability: z.number().min(0).max(100).optional(),
  labelOffset: LabelOffset.optional(),
  /** true = o usuário ajustou o traçado à mão: ao mover os extremos adaptamos os waypoints em vez de re-rotear (ver edit.ts) */
  manualRoute: z.boolean().optional(),
});
export type ProcessFlow = z.infer<typeof FlowSchema>;

export const LaneSchema = z.object({ id: Id, name: z.string(), bounds: BoundsSchema.optional(), description: z.string().optional(), fill: Color.optional() });
export type ProcessLane = z.infer<typeof LaneSchema>;

/** Pool "caixa-preta" (sistema/ator externo sem processo modelado). Alvo/origem de message flows. */
export const ParticipantSchema = z.object({ id: Id, name: z.string(), bounds: BoundsSchema.optional(), description: z.string().optional() });
export type ProcessParticipant = z.infer<typeof ParticipantSchema>;

/** Metadados do processo (Bizagi: autor, versão, datas, descrição). Datas em ISO-8601. */
export const MetaSchema = z.object({
  description: z.string().optional(),
  documentation: z.string().optional(),
  author: z.string().optional(),
  owner: z.string().optional(),
  version: z.string().optional(),
  createdAt: z.string().optional(),
  modifiedAt: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type ProcessMeta = z.infer<typeof MetaSchema>;

export const ProcessModelSchema = z.object({
  id: Id,
  name: z.string(),
  lanes: z.array(LaneSchema).default([]),
  /** [2026-10-14] Criado: pools externos (caixa-preta) — Rafael Brito */
  participants: z.array(ParticipantSchema).default([]),
  nodes: z.array(NodeSchema),
  flows: z.array(FlowSchema),
  /** Bounds do pool (participant). Se ausente e houver lanes, é derivado das lanes. */
  pool: BoundsSchema.optional(),
  meta: MetaSchema.default({ tags: [] }),
  attributeDefs: z.array(AttributeDefSchema).default([]),
});
export type ProcessModel = z.infer<typeof ProcessModelSchema>;
/** Entrada (pré-defaults) — o que um LLM/usuário pode fornecer. */
export type ProcessModelInput = z.input<typeof ProcessModelSchema>;

/** Valida e aplica defaults. Lança ZodError se inválido. */
export const parseModel = (input: unknown): ProcessModel => ProcessModelSchema.parse(input);

/**
 * Ordena por id para forma canônica. Usado pelo serializer (XML determinístico/idempotente)
 * e pelos testes de round-trip (a ordem de elementos não é semântica em BPMN).
 */
export function canonicalize(m: ProcessModel): ProcessModel {
  const byId = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));
  return { ...m, lanes: byId(m.lanes), participants: byId(m.participants), nodes: byId(m.nodes), flows: byId(m.flows), attributeDefs: byId(m.attributeDefs) };
}
