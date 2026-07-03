/**
 * Helpers para funcionalidade AS-IS / TO-BE de requisitos
 *
 * Mapeamento entre campos originais (AS-IS) e campos TO-BE,
 * com labels 5W2H e utilitário para detectar se um requisito
 * tem visão futura preenchida.
 */

import { Requirement } from '../services/api'

/** Mapeamento campo TO-BE → campo AS-IS correspondente + label 5W2H */
export const TO_BE_FIELD_MAP = {
  whatToBe:     { asIs: 'what'     as const, label: 'What (O Que)',     isLong: true },
  whyToBe:     { asIs: 'why'      as const, label: 'Why (Por Quê)',    isLong: true },
  whoToBe:     { asIs: 'who'      as const, label: 'Who (Quem)',       isLong: false },
  whenToBe:    { asIs: 'when'     as const, label: 'When (Quando)',    isLong: false },
  whereToBe:   { asIs: 'where'    as const, label: 'Where (Onde)',     isLong: false },
  howToBe:     { asIs: 'howToday' as const, label: 'How (Como)',       isLong: true },
  howMuchToBe: { asIs: 'howMuch'  as const, label: 'How Much (Quanto)', isLong: false },
} as const

export type ToBeFieldKey = keyof typeof TO_BE_FIELD_MAP
export type AsIsFieldKey = (typeof TO_BE_FIELD_MAP)[ToBeFieldKey]['asIs']

/** Todos os pares AS-IS/TO-BE como array para iteração */
export const FIELD_PAIRS = Object.entries(TO_BE_FIELD_MAP).map(([toBeKey, config]) => ({
  toBeKey: toBeKey as ToBeFieldKey,
  asIsKey: config.asIs,
  label: config.label,
  isLong: config.isLong,
}))

/**
 * Retorna true se o requisito tem pelo menos um campo TO-BE preenchido.
 * Usado para exibir badge "TO-BE" na tabela e habilitar botão "Comparar".
 */
export function hasToBe(req: Requirement): boolean {
  return FIELD_PAIRS.some((pair) => {
    const value = req[pair.toBeKey as keyof Requirement]
    return value != null && value !== ''
  })
}

/**
 * Conta quantos campos TO-BE estão preenchidos no requisito.
 * Útil para exibir indicador de progresso na comparação.
 */
export function countToBeFields(req: Requirement): number {
  return FIELD_PAIRS.reduce((count, pair) => {
    const value = req[pair.toBeKey as keyof Requirement]
    return count + (value != null && value !== '' ? 1 : 0)
  }, 0)
}

/**
 * Classifica a diferença entre AS-IS e TO-BE para um campo específico.
 * Usado na DiffView para aplicar cores:
 * - 'changed': ambos preenchidos e diferentes → amber
 * - 'added': AS-IS vazio, TO-BE preenchido → verde
 * - 'removed': AS-IS preenchido, TO-BE vazio → vermelho
 * - 'unchanged': sem TO-BE definido → cinza
 * - 'same': ambos preenchidos e iguais → sem destaque
 */
export type DiffStatus = 'changed' | 'added' | 'removed' | 'unchanged' | 'same'

export function getFieldDiffStatus(
  asIsValue: string | null | undefined,
  toBeValue: string | null | undefined
): DiffStatus {
  const hasAsIs = asIsValue != null && asIsValue !== ''
  const hasToBe = toBeValue != null && toBeValue !== ''

  if (!hasToBe) return 'unchanged'
  if (!hasAsIs && hasToBe) return 'added'
  if (hasAsIs && !hasToBe) return 'removed'
  if (asIsValue === toBeValue) return 'same'
  return 'changed'
}
