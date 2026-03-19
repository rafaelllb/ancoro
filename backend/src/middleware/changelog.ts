/**
 * ChangeLog Middleware
 * Intercepta mutations no Prisma para criar registros de histórico
 *
 * Arquitetura:
 * - Captura updates/deletes em Requirements
 * - Registra cada campo alterado com oldValue → newValue
 * - Armazena userId do autor da mudança (via contexto)
 *
 * NOTA: Prisma middleware $use() está deprecated em favor de extensions.
 * Aqui usamos uma abordagem manual via funções wrapper por clareza e controle.
 */

import { PrismaClient, Requirement, ChangeLog } from '@prisma/client'
import { ChangeType } from '../types'

// Tipo para contexto de usuário passado nas operações
export interface ChangeContext {
  userId: string
}

// Campos que devem ser rastreados (exclui campos técnicos)
const TRACKED_FIELDS: (keyof Requirement)[] = [
  'shortDesc',
  'module',
  'what',
  'why',
  'who',
  'when',
  'where',
  'howToday',
  'howMuch',
  'dependsOn',
  'providesFor',
  'consultantNotes',
  'status',
  'observations',
]

/**
 * Compara dois objetos e retorna lista de campos alterados
 */
export function diffObjects(
  oldObj: Partial<Requirement>,
  newObj: Partial<Requirement>
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = []

  for (const field of TRACKED_FIELDS) {
    const oldValue = oldObj[field]
    const newValue = newObj[field]

    // Compara valores (converte para string para comparação consistente)
    const oldStr = oldValue != null ? String(oldValue) : null
    const newStr = newValue != null ? String(newValue) : null

    if (oldStr !== newStr) {
      changes.push({
        field,
        oldValue: oldStr,
        newValue: newStr,
      })
    }
  }

  return changes
}

/**
 * Determina o tipo de mudança baseado nos campos alterados
 */
export function determineChangeType(changes: Array<{ field: string }>): string {
  if (changes.length === 0) return ChangeType.UPDATE

  // Se apenas status mudou, é STATUS_CHANGE
  if (changes.length === 1 && changes[0].field === 'status') {
    return ChangeType.STATUS_CHANGE
  }

  return ChangeType.UPDATE
}

/**
 * Cria entradas de ChangeLog para um update de requisito
 *
 * @param prisma - Cliente Prisma
 * @param requirementId - ID do requisito alterado
 * @param oldData - Dados antes da alteração
 * @param newData - Dados após a alteração
 * @param context - Contexto com userId
 */
export async function logRequirementChanges(
  prisma: PrismaClient,
  requirementId: string,
  oldData: Partial<Requirement>,
  newData: Partial<Requirement>,
  context: ChangeContext
): Promise<ChangeLog[]> {
  const changes = diffObjects(oldData, newData)

  if (changes.length === 0) {
    return []
  }

  const changeType = determineChangeType(changes)

  // Cria uma entrada de ChangeLog para cada campo alterado
  const createdLogs = await Promise.all(
    changes.map((change) =>
      prisma.changeLog.create({
        data: {
          requirementId,
          userId: context.userId,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          changeType,
        },
      })
    )
  )

  return createdLogs
}

/**
 * Cria entrada de ChangeLog para criação de requisito
 */
export async function logRequirementCreate(
  prisma: PrismaClient,
  requirementId: string,
  reqId: string,
  context: ChangeContext
): Promise<ChangeLog> {
  return prisma.changeLog.create({
    data: {
      requirementId,
      userId: context.userId,
      field: 'requirement',
      oldValue: null,
      newValue: reqId,
      changeType: ChangeType.CREATE,
    },
  })
}

/**
 * Cria entrada de ChangeLog para deleção de requisito
 * NOTA: Deve ser chamada ANTES de deletar o requisito
 */
export async function logRequirementDelete(
  prisma: PrismaClient,
  requirement: Requirement,
  context: ChangeContext
): Promise<ChangeLog> {
  return prisma.changeLog.create({
    data: {
      requirementId: requirement.id,
      userId: context.userId,
      field: 'requirement',
      oldValue: requirement.reqId,
      newValue: null,
      changeType: ChangeType.DELETE,
    },
  })
}

/**
 * Busca histórico de mudanças de um requisito
 */
export async function getRequirementChanges(
  prisma: PrismaClient,
  requirementId: string,
  options?: {
    field?: string
    userId?: string
    startDate?: Date
    endDate?: Date
    limit?: number
    offset?: number
  }
): Promise<{
  changes: Array<ChangeLog & { user: { id: string; name: string; email: string } }>
  total: number
}> {
  const where: any = { requirementId }

  if (options?.field) {
    where.field = options.field
  }

  if (options?.userId) {
    where.userId = options.userId
  }

  if (options?.startDate || options?.endDate) {
    where.createdAt = {}
    if (options.startDate) {
      where.createdAt.gte = options.startDate
    }
    if (options.endDate) {
      where.createdAt.lte = options.endDate
    }
  }

  const [changes, total] = await Promise.all([
    prisma.changeLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.changeLog.count({ where }),
  ])

  return { changes, total }
}

/**
 * Rollback de uma mudança específica
 * Reverte o campo para o valor anterior
 *
 * @returns O requisito atualizado ou null se rollback não aplicável
 */
export async function rollbackChange(
  prisma: PrismaClient,
  changeId: string,
  context: ChangeContext
): Promise<Requirement | null> {
  // Busca a mudança original
  const change = await prisma.changeLog.findUnique({
    where: { id: changeId },
    include: {
      requirement: true,
    },
  })

  if (!change) {
    throw new Error('Change not found')
  }

  // Não permite rollback de CREATE ou DELETE
  if (change.changeType === ChangeType.CREATE || change.changeType === ChangeType.DELETE) {
    throw new Error('Cannot rollback CREATE or DELETE operations')
  }

  // Verifica se o campo ainda existe e pode ser revertido
  const currentValue = (change.requirement as any)[change.field]

  // Atualiza o requisito com o valor antigo
  const updated = await prisma.requirement.update({
    where: { id: change.requirementId },
    data: {
      [change.field]: change.oldValue,
    },
  })

  // Registra o rollback como uma nova mudança
  await prisma.changeLog.create({
    data: {
      requirementId: change.requirementId,
      userId: context.userId,
      field: change.field,
      oldValue: currentValue != null ? String(currentValue) : null,
      newValue: change.oldValue,
      changeType: ChangeType.UPDATE,
    },
  })

  return updated
}
