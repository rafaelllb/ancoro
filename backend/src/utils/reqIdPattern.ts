/**
 * Utilitário para manipulação de padrões de ID de requisitos
 *
 * Cada projeto pode definir seu próprio padrão de ID no formato:
 * {prefix}{separator}{número com zero-padding}
 *
 * Exemplos:
 * - REQ-001, REQ-002... (prefix: "REQ", separator: "-", digitCount: 3)
 * - US-0001, US-0002... (prefix: "US", separator: "-", digitCount: 4)
 * - PROJ1_001...        (prefix: "PROJ1", separator: "_", digitCount: 3)
 * - R00001...           (prefix: "R", separator: "", digitCount: 5)
 */

/**
 * Interface que define o padrão de ID de requisitos de um projeto
 */
export interface RequirementIdPattern {
  /** Prefixo do ID (ex: REQ, US, PROJ1). 1-10 caracteres alfanuméricos */
  prefix: string
  /** Separador entre prefixo e número (ex: "-", "_", ou "" vazio) */
  separator: string
  /** Quantidade de dígitos com zero-padding (2-6) */
  digitCount: number
}

/**
 * Padrão default usado quando projeto não especifica (retrocompatibilidade)
 */
export const DEFAULT_PATTERN: RequirementIdPattern = {
  prefix: 'REQ',
  separator: '-',
  digitCount: 3,
}

/**
 * Escapa caracteres especiais de regex em uma string
 * Necessário para usar o separator e prefix de forma segura no regex
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Constrói uma expressão regular para validar IDs no padrão especificado
 *
 * @example
 * buildRegex({ prefix: 'REQ', separator: '-', digitCount: 3 })
 * // Retorna: /^REQ-\d{3,}$/
 *
 * buildRegex({ prefix: 'US', separator: '', digitCount: 4 })
 * // Retorna: /^US\d{4,}$/
 */
export function buildRegex(pattern: RequirementIdPattern): RegExp {
  const prefix = escapeRegex(pattern.prefix)
  const separator = escapeRegex(pattern.separator)
  // Permite dígitos >= digitCount (aceita REQ-0001 mesmo com digitCount 3)
  return new RegExp(`^${prefix}${separator}\\d{${pattern.digitCount},}$`)
}

/**
 * Valida se um reqId segue o padrão especificado
 *
 * @param reqId - ID a validar (ex: "REQ-001")
 * @param pattern - Padrão do projeto
 * @returns true se válido, false caso contrário
 */
export function validateReqId(reqId: string, pattern: RequirementIdPattern): boolean {
  const regex = buildRegex(pattern)
  return regex.test(reqId)
}

/**
 * Extrai o número de um reqId baseado no padrão
 *
 * @example
 * extractNumber('REQ-042', { prefix: 'REQ', separator: '-', digitCount: 3 })
 * // Retorna: 42
 *
 * extractNumber('US0005', { prefix: 'US', separator: '', digitCount: 4 })
 * // Retorna: 5
 *
 * @returns O número extraído, ou null se o reqId não seguir o padrão
 */
export function extractNumber(reqId: string, pattern: RequirementIdPattern): number | null {
  const prefix = escapeRegex(pattern.prefix)
  const separator = escapeRegex(pattern.separator)
  const regex = new RegExp(`^${prefix}${separator}(\\d+)$`)

  const match = reqId.match(regex)
  if (!match) return null

  return parseInt(match[1], 10)
}

/**
 * Gera o próximo reqId baseado nos IDs existentes e no padrão do projeto
 *
 * Estratégia: encontra o maior número entre os IDs existentes e incrementa por 1
 * Se não houver IDs existentes, começa em 1
 *
 * @param pattern - Padrão do projeto
 * @param existingIds - Array de reqIds existentes no projeto
 * @returns Próximo reqId formatado (ex: "REQ-003")
 *
 * @example
 * generateNextId(
 *   { prefix: 'REQ', separator: '-', digitCount: 3 },
 *   ['REQ-001', 'REQ-002', 'REQ-010']
 * )
 * // Retorna: "REQ-011"
 */
export function generateNextId(
  pattern: RequirementIdPattern,
  existingIds: string[]
): string {
  // Extrai números de todos os IDs existentes
  const numbers = existingIds
    .map((id) => extractNumber(id, pattern))
    .filter((n): n is number => n !== null)

  // Encontra o maior número, ou 0 se não houver nenhum
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0

  // Próximo número é max + 1
  const nextNumber = maxNumber + 1

  // Formata com zero-padding conforme digitCount
  const paddedNumber = String(nextNumber).padStart(pattern.digitCount, '0')

  return `${pattern.prefix}${pattern.separator}${paddedNumber}`
}

/**
 * Gera um exemplo de ID válido para exibição em mensagens de erro/ajuda
 *
 * @param pattern - Padrão do projeto
 * @returns Exemplo de ID formatado (ex: "REQ-001")
 */
export function generateExample(pattern: RequirementIdPattern): string {
  const paddedNumber = '1'.padStart(pattern.digitCount, '0')
  return `${pattern.prefix}${pattern.separator}${paddedNumber}`
}

/**
 * Valida se um padrão de ID é válido
 * Usado para validar input do usuário ao configurar o padrão do projeto
 *
 * @param pattern - Padrão a validar
 * @returns Objeto com isValid e mensagem de erro se inválido
 */
export function validatePattern(pattern: RequirementIdPattern): {
  isValid: boolean
  error?: string
} {
  // Valida prefix: 1-10 caracteres alfanuméricos
  if (!pattern.prefix || !/^[A-Za-z0-9]{1,10}$/.test(pattern.prefix)) {
    return {
      isValid: false,
      error: 'Prefixo deve ter 1-10 caracteres alfanuméricos',
    }
  }

  // Valida separator: vazio, "-" ou "_"
  if (!['-', '_', ''].includes(pattern.separator)) {
    return {
      isValid: false,
      error: 'Separador deve ser "-", "_" ou vazio',
    }
  }

  // Valida digitCount: 2-6
  if (
    !Number.isInteger(pattern.digitCount) ||
    pattern.digitCount < 2 ||
    pattern.digitCount > 6
  ) {
    return {
      isValid: false,
      error: 'Quantidade de dígitos deve ser entre 2 e 6',
    }
  }

  return { isValid: true }
}

/**
 * Cria um padrão a partir dos campos do projeto (com fallback para defaults)
 * Útil para extrair o padrão de um objeto Project do Prisma
 */
export function patternFromProject(project: {
  reqIdPrefix?: string | null
  reqIdSeparator?: string | null
  reqIdDigitCount?: number | null
}): RequirementIdPattern {
  return {
    prefix: project.reqIdPrefix ?? DEFAULT_PATTERN.prefix,
    separator: project.reqIdSeparator ?? DEFAULT_PATTERN.separator,
    digitCount: project.reqIdDigitCount ?? DEFAULT_PATTERN.digitCount,
  }
}
