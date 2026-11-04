/**
 * Carrega o "processkit" (backend/vendor/processkit.cjs), gerado por `npm run build:processkit` a partir dos
 * pacotes process-core + process-publisher (README Process Studio §6.4, decisão 2).
 *
 * [2026-10-15] Criado: carga preguiçosa + erro 503 amigável — o resto do Ancoro sobe mesmo sem o artefato gerado — Rafael Brito
 */
export interface KitIssue { code: string; message: string; elementId?: string }
export interface KitModel {
  id: string; name: string
  nodes: Array<{ id: string; name: string; requirementRefs: string[]; calledProcessId?: string }>
  [k: string]: unknown
}
/** Passo/processo no contrato do JSON intermediário (ver packages/process-core/src/generate.ts) */
export interface GenProcessLike { name: string; steps: unknown[]; edges: unknown[]; children: Record<string, unknown> }
export interface GenRequirementInput {
  reqId: string; shortDesc: string; who?: string | null; what?: string | null; howAsIs?: string | null; howToday?: string | null
  whoToBe?: string | null; whatToBe?: string | null; howToBe?: string | null
}
export interface ProcessKit {
  KIT_VERSION: number
  normalizeModel(input: unknown): KitModel
  integrityIssues(model: KitModel): KitIssue[]
  qualityIssues(model: KitModel): Array<KitIssue & { severity: string }>
  requirementRefsOf(model: KitModel): Array<{ elementId: string; elementName: string; ref: string }>
  importFile(kind: 'bpm' | 'bpmn', bytes: Uint8Array): Promise<{ models: KitModel[]; warnings: string[] }>
  newProcessModel(existingKeys: string[], name: string): KitModel
  exportBpmn(model: KitModel): Promise<string>
  demoProcess(reqIds: string[], id?: string, name?: string): KitModel
  /** [2026-10-27] geração automática: valida a saída do LLM / gera determinístico / monta os modelos (principal + subprocessos) */
  parseGenerated(input: unknown): GenProcessLike
  generateFromRequirements(reqs: GenRequirementInput[], view: 'AS_IS' | 'TO_BE', name?: string): GenProcessLike
  buildGeneratedModels(gen: GenProcessLike, existingKeys: string[]): KitModel[]
  publishPortal(opts: Record<string, unknown>): Promise<{ zip: Uint8Array; report: unknown; versionsFile: string; manifest: unknown }>
}

export class ProcessKitUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Process Studio indisponível: rode `npm run build:processkit` na raiz do projeto.')
    this.name = 'ProcessKitUnavailableError'
    this.cause = cause
  }
}

let cached: ProcessKit | undefined

export function getProcessKit(): ProcessKit {
  if (cached) return cached
  try {
    // require dinâmico: o arquivo é gerado (gitignored) e fica fora do rootDir do tsc
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('../../vendor/processkit.cjs') as ProcessKit
    return cached
  } catch (e) {
    throw new ProcessKitUnavailableError(e)
  }
}
