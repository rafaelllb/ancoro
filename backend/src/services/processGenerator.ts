/**
 * Geração automática de processos — etapa "LLM" do pipeline híbrido (README Process Studio §5.2).
 *
 * [2026-10-27] Criado: Claude extrai um JSON intermediário (atores, passos, decisões, subprocessos) via tool use; o código
 * determinístico do kit (buildGeneratedModels) converte em BPMN + layout — o LLM NUNCA devolve XML nem coordenadas — Rafael Brito
 * Decisões:
 * - Sem ANTHROPIC_API_KEY o módulo reporta "não configurado" e a rota usa o gerador determinístico: nenhum dado do requisito sai do servidor.
 * - fetch direto na Messages API (Node >= 18): evita nova dependência; a saída estruturada vem do tool use (`tool_choice: auto` + instrução).
 * - Qualquer falha (rede, timeout, JSON fora do contrato) lança; quem chama cai no determinístico e avisa o usuário.
 * - Só viajam os campos necessários do requisito (reqId, descrição curta, quem/o quê/como), truncados.
 *
 * TODO [ESTIGMERGIA]: custo e limites
 * - Sem cache nem contagem de custo por projeto; o limite é de 25 requisitos por chamada (schema da rota). Próximo passo:
 *   registrar tokens usados (response.usage) em tabela de auditoria e cota mensal por assinatura.
 */
import { getProcessKit, GenProcessLike, GenRequirementInput } from './processKit'

const API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-5-5'
const TIMEOUT_MS = 90_000
const FIELD_MAX = 1500

export const isLlmConfigured = (): boolean => !!process.env.ANTHROPIC_API_KEY?.trim()
export const llmModel = (): string => process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL

const stepSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'id curto e único dentro do processo (ex.: s1, s2)' },
    kind: { type: 'string', enum: ['task', 'decision', 'subprocess', 'end'] },
    name: { type: 'string', description: 'Tarefa: verbo no infinitivo + objeto (ex.: "Validar cadastro"). Decisão: pergunta (ex.: "Crédito aprovado?")' },
    lane: { type: 'string', description: 'Ator/área/sistema responsável (vira raia). Reutilize SEMPRE o mesmo nome para o mesmo ator' },
    variant: { type: 'string', enum: ['generic', 'user', 'service', 'manual', 'script'], description: 'service = executada por sistema' },
    requirementRefs: { type: 'array', items: { type: 'string' }, description: 'reqIds (ex.: REQ-003) que originam o passo' },
  },
  required: ['id', 'kind', 'name', 'lane', 'requirementRefs'],
}
const edgeSchema = {
  type: 'object',
  properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string', description: 'rótulo do ramo; obrigatório nas saídas de decisão' } },
  required: ['from', 'to'],
}
const bodyProps = {
  name: { type: 'string' },
  steps: { type: 'array', items: stepSchema },
  edges: { type: 'array', items: edgeSchema },
}
const TOOL = {
  name: 'emit_process',
  description: 'Entrega o processo de negócio modelado (passos, decisões, subprocessos e ligações).',
  input_schema: {
    type: 'object',
    properties: {
      ...bodyProps,
      children: {
        type: 'object',
        description: 'Detalhe dos passos kind=subprocess: chave = id do passo; valor = { name, steps, edges } (um nível, sem subprocessos dentro)',
        additionalProperties: { type: 'object', properties: bodyProps, required: ['name', 'steps', 'edges'] },
      },
    },
    required: ['name', 'steps', 'edges'],
  },
}

const SYSTEM = [
  'Você é um analista de processos BPMN (SAP S/4HANA Utilities). Converta requisitos de negócio (5W2H) em UM processo coerente.',
  'Regras:',
  '- Cada ATOR/área/sistema vira uma raia (campo lane). Reutilize o mesmo nome de raia para o mesmo ator.',
  '- Tarefas: verbo no infinitivo + objeto, curtas (até 6 palavras). Não invente atores, sistemas ou regras ausentes dos requisitos.',
  '- Toda condição vira um passo kind=decision com >=2 saídas rotuladas (ex.: Sim/Não ou o nome do resultado). Ramos devem convergir ou terminar.',
  '- Quando um passo tem 3 ou mais sub-etapas detalhadas, use kind=subprocess e detalhe em children[<id do passo>].',
  '- Liste TODAS as ligações em edges (from/to com ids dos passos). Não crie início/fim implícitos: o sistema os adiciona; use kind=end só para finais alternativos (ex.: cancelado).',
  '- requirementRefs de cada passo = reqIds que o originam (rastreabilidade). Use somente reqIds fornecidos.',
  '- Responda SOMENTE chamando a ferramenta emit_process, em português.',
].join('\n')

const trunc = (s?: string | null) => (s ?? '').trim().slice(0, FIELD_MAX)

function userPrompt(reqs: GenRequirementInput[], view: 'AS_IS' | 'TO_BE', name?: string): string {
  const toBe = view === 'TO_BE'
  const blocks = reqs.map((r) => [
    `### ${r.reqId} — ${trunc(r.shortDesc)}`,
    `Quem: ${trunc(toBe ? r.whoToBe || r.who : r.who)}`,
    `O quê: ${trunc(toBe ? r.whatToBe || r.what : r.what)}`,
    `Como (${toBe ? 'TO-BE' : 'AS-IS'}): ${trunc(toBe ? r.howToBe || r.howAsIs || r.howToday : r.howAsIs || r.howToday || r.howToBe)}`,
  ].join('\n'))
  return [
    `Visão a modelar: ${toBe ? 'TO-BE (processo futuro)' : 'AS-IS (processo atual)'}.`,
    name ? `Nome desejado do processo: ${name}` : 'Escolha um nome curto para o processo.',
    '', ...blocks,
    '', 'Entregue o processo chamando a ferramenta emit_process (não responda com texto).',
  ].join('\n')
}

/** Chama o Claude e devolve o JSON intermediário JÁ validado pelo contrato do kit. Lança em qualquer falha. */
export async function generateWithLlm(reqs: GenRequirementInput[], view: 'AS_IS' | 'TO_BE', name?: string): Promise<GenProcessLike> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: llmModel(), max_tokens: 8000, system: SYSTEM,
        // [2026-10-27] Alterado: tool_choice 'auto' (não forçado) — Sonnet 5.5 devolve 400 para tool_choice any/tool (descoberto no teste real).
        // A saída estruturada vem da instrução explícita (SYSTEM + último parágrafo do prompt) e é validada por Zod; sem tool_use => cai nas regras.
        // effort 'medium': extração de passos não precisa de 'high' (padrão do modelo) e reduz custo/latência.
        output_config: { effort: 'medium' },
        tools: [TOOL], tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: userPrompt(reqs, view, name) }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown }> }
    const call = data.content?.find((c) => c.type === 'tool_use' && c.name === TOOL.name)
    if (!call?.input) throw new Error('resposta sem tool_use')
    return getProcessKit().parseGenerated(call.input)
  } finally {
    clearTimeout(timer)
  }
}
