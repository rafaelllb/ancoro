/**
 * Validação de integridade e boas práticas (README §5.1).
 *
 * [2026-10-14] Criado: regras determinísticas, sem IA — Rafael Brito
 * Severidades: error = modelo inconsistente (serializer pode falhar); warning = boa prática violada;
 * info = lacuna de governança/documentação.
 *
 * TODO [ESTIGMERGIA]: regra "nome = verbo + objeto"
 * - Hoje só checa >= 2 palavras (heurística). Detectar verbo exige NLP por idioma (PT/EN).
 * - Próximo passo: lista de verbos de ação por idioma ou classificação via LLM na etapa de geração.
 */
import type { ProcessModel } from './model.js';
import { attrValueProblem } from './attributes.js';

export type Severity = 'error' | 'warning' | 'info';
export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  /** Id do nó/fluxo/lane afetado, quando aplicável */
  elementId?: string;
}

export function validateModel(m: ProcessModel): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Severity, code: string, message: string, elementId?: string) =>
    issues.push({ severity, code, message, ...(elementId && { elementId }) });

  // ---- integridade (errors)
  const ids = new Map<string, number>();
  for (const id of [m.id, ...m.lanes.map((l) => l.id), ...m.participants.map((p) => p.id), ...m.nodes.map((n) => n.id), ...m.flows.map((f) => f.id)]) {
    ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  for (const [id, count] of ids) if (count > 1) add('error', 'DUPLICATE_ID', `Id '${id}' usado ${count} vezes`, id);

  const nodeById = new Map(m.nodes.map((n) => [n.id, n]));
  const laneIds = new Set(m.lanes.map((l) => l.id));
  // [2026-10-14] Alterado: message flows podem apontar para participantes externos ou para o pool do processo (m.id) — Rafael Brito
  const poolIds = new Set([m.id, ...m.participants.map((p) => p.id)]);
  for (const f of m.flows) {
    for (const end of [f.sourceId, f.targetId]) {
      if (!nodeById.has(end) && !(f.kind === 'message' && poolIds.has(end))) {
        add('error', 'FLOW_DANGLING', `Fluxo '${f.id}' referencia nó inexistente '${end}'`, f.id);
      }
    }
  }
  for (const n of m.nodes) {
    if (n.kind !== 'boundary') continue;
    const host = nodeById.get(n.attachedToId ?? '');
    if (!host) add('error', 'BOUNDARY_NO_HOST', `Boundary '${n.name || n.id}' anexado a nó inexistente '${n.attachedToId}'`, n.id);
    else if (host.kind !== 'task' && host.kind !== 'subprocess') add('error', 'BOUNDARY_BAD_HOST', `Boundary '${n.id}' só pode ser anexado a tarefa/subprocesso`, n.id);
  }
  for (const n of m.nodes) {
    if (n.laneId && !laneIds.has(n.laneId)) add('error', 'LANE_UNKNOWN', `Nó '${n.id}' referencia lane inexistente '${n.laneId}'`, n.id);
  }

  // ---- estrutura do fluxo (sequence flows apenas)
  const seq = m.flows.filter((f) => f.kind === 'sequence');
  const inc = new Map<string, number>(), out = new Map<string, typeof seq>();
  for (const f of seq) {
    inc.set(f.targetId, (inc.get(f.targetId) ?? 0) + 1);
    out.set(f.sourceId, [...(out.get(f.sourceId) ?? []), f]);
  }
  const flowNodes = m.nodes.filter((n) => !['dataObject', 'dataStore', 'annotation'].includes(n.kind));
  if (flowNodes.length && !flowNodes.some((n) => n.kind === 'start')) add('error', 'NO_START', 'Processo sem evento de início');
  if (flowNodes.length && !flowNodes.some((n) => n.kind === 'end')) add('error', 'NO_END', 'Processo sem evento de fim');

  for (const n of flowNodes) {
    const nIn = inc.get(n.id) ?? 0, outs = out.get(n.id) ?? [];
    const label = n.name || n.id;
    // boundary nasce da tarefa hospedeira (sem entrada); link catch pareia com um throw (sem entrada)
    const entersByItself = n.kind === 'start' || n.kind === 'boundary' || (n.kind === 'intermediate' && n.variant === 'link' && !n.throw);
    if (!entersByItself && nIn === 0) add('warning', 'NO_INCOMING', `'${label}' não tem fluxo de entrada (fluxo solto)`, n.id);
    const endsByItself = n.kind === 'end' || (n.kind === 'intermediate' && n.variant === 'link' && n.throw);
    if (!endsByItself && outs.length === 0) add('warning', 'NO_OUTGOING', `'${label}' não tem fluxo de saída (sem fim)`, n.id);
    if (n.kind === 'start' && nIn > 0) add('warning', 'START_HAS_INCOMING', `Início '${label}' recebe fluxo`, n.id);
    if (n.kind === 'end' && outs.length > 0) add('error', 'END_HAS_OUTGOING', `Fim '${label}' tem fluxo de saída`, n.id);

    // Gateways divergentes exclusivos/inclusivos: precisam de condição nomeada em cada saída ou de um fluxo padrão
    const isDecision = n.kind === 'gateway' && (n.variant === 'exclusive' || n.variant === 'inclusive' || n.variant === undefined);
    if (isDecision && outs.length > 1) {
      const hasDefault = outs.some((f) => f.isDefault);
      const unnamed = outs.filter((f) => !f.name && !f.isDefault);
      if (!hasDefault && unnamed.length > 0) {
        add('warning', 'GATEWAY_NO_DEFAULT', `Gateway '${label}' tem ${unnamed.length} saída(s) sem condição e sem fluxo padrão`, n.id);
      }
    }
    if (n.kind === 'gateway' && !n.name && (n.variant === 'exclusive' || n.variant === undefined) && outs.length > 1) {
      add('info', 'GATEWAY_UNNAMED', 'Gateway de decisão sem pergunta (nome)', n.id);
    }
  }
  for (const f of seq) {
    const s = nodeById.get(f.sourceId);
    if (f.isDefault && s && !(s.kind === 'gateway' && (s.variant === 'exclusive' || s.variant === 'inclusive'))) {
      add('warning', 'DEFAULT_ON_NON_GATEWAY', `Fluxo padrão '${f.id}' só é válido em gateway exclusivo/inclusivo`, f.id);
    }
  }

  // ---- boas práticas de nomenclatura e governança
  for (const n of m.nodes.filter((x) => x.kind === 'task' || x.kind === 'subprocess')) {
    if (n.name.trim().split(/\s+/).filter(Boolean).length < 2) {
      add('warning', 'TASK_NAME_FORMAT', `Nome '${n.name || n.id}' deveria ser verbo + objeto (ex.: "Validar leitura")`, n.id);
    }
    if ((n.variant === 'user' || n.variant === 'manual') && !n.performer && !n.laneId) {
      add('info', 'NO_PERFORMER', `Tarefa '${n.name || n.id}' sem responsável (performer/lane)`, n.id);
    }
  }
  // Atributos estendidos: definição existente, valor coerente com o tipo, elemento dentro do escopo da definição
  const defById = new Map(m.attributeDefs.map((d) => [d.id, d]));
  for (const n of m.nodes) {
    for (const a of n.attributes) {
      if (!a.defId) continue;
      const d = defById.get(a.defId);
      if (!d) { add('error', 'ATTR_DEF_MISSING', `'${n.name || n.id}' tem o atributo '${a.name}' sem definição no processo`, n.id); continue; }
      const why = attrValueProblem(d, a.value);
      if (why) add('warning', 'ATTR_VALUE', `'${n.name || n.id}' · ${d.name}: ${why}`, n.id);
      if (d.appliesTo && !d.appliesTo.includes(n.kind)) add('info', 'ATTR_NOT_APPLICABLE', `Atributo '${d.name}' não se aplica a ${n.kind} ('${n.name || n.id}')`, n.id);
    }
  }
  // Link events: cada nome de throw precisa de um catch correspondente (e vice-versa)
  const links = m.nodes.filter((n) => n.kind === 'intermediate' && n.variant === 'link');
  for (const l of links) {
    if (!links.some((o) => o.name === l.name && o.throw !== l.throw)) {
      add('warning', 'LINK_UNPAIRED', `Evento de link '${l.name || l.id}' (${l.throw ? 'lançamento' : 'captura'}) sem par de mesmo nome`, l.id);
    }
  }
  for (const l of m.lanes) if (!l.name.trim()) add('warning', 'LANE_NO_NAME', `Lane '${l.id}' sem nome/responsável`, l.id);
  // Lane vazia = responsável modelado mas sem atividade
  for (const l of m.lanes) {
    if (!m.nodes.some((n) => n.laneId === l.id)) add('info', 'LANE_EMPTY', `Lane '${l.name || l.id}' sem nenhum elemento`, l.id);
  }
  return issues;
}
