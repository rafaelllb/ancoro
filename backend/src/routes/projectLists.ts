import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { createListItemSchema, updateListItemSchema, LIST_TYPES, ListTypeEnum } from '../schemas'

const router = Router()

/**
 * Valida se o listType é válido
 */
function isValidListType(listType: string): listType is ListTypeEnum {
  return (LIST_TYPES as readonly string[]).includes(listType)
}

/**
 * GET /api/projects/:projectId/lists/:listType
 * Lista itens de uma lista configurável do projeto
 * Requer: autenticação
 *
 * Params:
 * - projectId: ID do projeto
 * - listType: MODULE | REQ_STATUS | INTEGRATION_TYPE | INTEGRATION_TIMING
 *
 * Query:
 * - includeInactive: boolean (default false) - incluir itens desativados
 */
router.get('/projects/:projectId/lists/:listType', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, listType } = req.params
    const includeInactive = req.query.includeInactive === 'true'

    // Valida listType
    if (!isValidListType(listType)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Tipo de lista inválido. Valores permitidos: ${LIST_TYPES.join(', ')}`,
      })
    }

    // Verifica se projeto existe
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Projeto não encontrado',
      })
    }

    // Busca itens da lista
    const items = await prisma.projectListItem.findMany({
      where: {
        projectId,
        listType,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { sortOrder: 'asc' },
    })

    res.json({
      success: true,
      listType,
      data: items,
      count: items.length,
    })
  } catch (error) {
    console.error('Error fetching list items:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao buscar itens da lista',
    })
  }
})

/**
 * POST /api/projects/:projectId/lists/:listType
 * Adiciona um item a uma lista configurável
 * Requer: autenticação + role ADMIN ou MANAGER
 *
 * Body:
 * - code: string (obrigatório, maiúsculas/números/underscore)
 * - name: string (obrigatório)
 * - color: string hex (opcional)
 * - icon: string (opcional)
 * - sortOrder: number (opcional, default 0)
 * - isDefault: boolean (opcional, default false)
 */
router.post('/projects/:projectId/lists/:listType', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, listType } = req.params

    // Verifica permissão (ADMIN ou MANAGER)
    const allowedRoles = ['ADMIN', 'MANAGER']
    if (!allowedRoles.includes(req.user!.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas administradores e gerentes podem adicionar itens às listas',
      })
    }

    // Valida listType
    if (!isValidListType(listType)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Tipo de lista inválido. Valores permitidos: ${LIST_TYPES.join(', ')}`,
      })
    }

    // Verifica se projeto existe
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Projeto não encontrado',
      })
    }

    // Valida body
    const validationResult = createListItemSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      })
    }

    const data = validationResult.data

    // Verifica se código já existe para este listType
    const existing = await prisma.projectListItem.findUnique({
      where: {
        projectId_listType_code: { projectId, listType, code: data.code },
      },
    })

    if (existing) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Código "${data.code}" já existe para esta lista`,
      })
    }

    // Se isDefault=true, remove default de outros itens
    if (data.isDefault) {
      await prisma.projectListItem.updateMany({
        where: { projectId, listType, isDefault: true },
        data: { isDefault: false },
      })
    }

    // Cria o item
    const item = await prisma.projectListItem.create({
      data: {
        projectId,
        listType,
        code: data.code,
        name: data.name,
        color: data.color ?? null,
        icon: data.icon ?? null,
        sortOrder: data.sortOrder,
        isDefault: data.isDefault,
      },
    })

    res.status(201).json({
      success: true,
      data: item,
      message: 'Item adicionado com sucesso',
    })
  } catch (error) {
    console.error('Error creating list item:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao criar item',
    })
  }
})

/**
 * PATCH /api/projects/:projectId/lists/:listType/:itemId
 * Atualiza um item da lista
 * Requer: autenticação + role ADMIN ou MANAGER
 *
 * Body (todos opcionais):
 * - name: string
 * - color: string hex
 * - icon: string
 * - sortOrder: number
 * - isActive: boolean
 * - isDefault: boolean
 */
router.patch('/projects/:projectId/lists/:listType/:itemId', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, listType, itemId } = req.params

    // Verifica permissão
    const allowedRoles = ['ADMIN', 'MANAGER']
    if (!allowedRoles.includes(req.user!.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas administradores e gerentes podem editar itens das listas',
      })
    }

    // Valida listType
    if (!isValidListType(listType)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Tipo de lista inválido. Valores permitidos: ${LIST_TYPES.join(', ')}`,
      })
    }

    // Verifica se item existe
    const existing = await prisma.projectListItem.findFirst({
      where: { id: itemId, projectId, listType },
    })

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Item não encontrado',
      })
    }

    // Valida body
    const validationResult = updateListItemSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      })
    }

    const data = validationResult.data

    // Se setando isDefault=true, remove de outros
    if (data.isDefault === true) {
      await prisma.projectListItem.updateMany({
        where: { projectId, listType, isDefault: true, id: { not: itemId } },
        data: { isDefault: false },
      })
    }

    // Atualiza o item
    const item = await prisma.projectListItem.update({
      where: { id: itemId },
      data: {
        name: data.name,
        color: data.color,
        icon: data.icon,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
        isDefault: data.isDefault,
      },
    })

    res.json({
      success: true,
      data: item,
      message: 'Item atualizado com sucesso',
    })
  } catch (error) {
    console.error('Error updating list item:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao atualizar item',
    })
  }
})

/**
 * DELETE /api/projects/:projectId/lists/:listType/:itemId
 * Desativa um item da lista (soft delete)
 * Requer: autenticação + role ADMIN ou MANAGER
 *
 * Não remove fisicamente, apenas seta isActive=false.
 * Itens em uso por requisitos/integrações não podem ser desativados.
 */
router.delete('/projects/:projectId/lists/:listType/:itemId', authenticate, async (req: Request, res: Response) => {
  try {
    const { projectId, listType, itemId } = req.params

    // Verifica permissão
    const allowedRoles = ['ADMIN', 'MANAGER']
    if (!allowedRoles.includes(req.user!.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas administradores e gerentes podem remover itens das listas',
      })
    }

    // Valida listType
    if (!isValidListType(listType)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Tipo de lista inválido. Valores permitidos: ${LIST_TYPES.join(', ')}`,
      })
    }

    // Verifica se item existe
    const existing = await prisma.projectListItem.findFirst({
      where: { id: itemId, projectId, listType },
    })

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Item não encontrado',
      })
    }

    // Verifica se item está em uso (depende do listType)
    let inUseCount = 0
    if (listType === 'MODULE') {
      inUseCount = await prisma.requirement.count({
        where: { projectId, module: existing.code },
      })
    } else if (listType === 'REQ_STATUS') {
      inUseCount = await prisma.requirement.count({
        where: { projectId, status: existing.code },
      })
    } else if (listType === 'INTEGRATION_TYPE') {
      inUseCount = await prisma.crossMatrixEntry.count({
        where: { projectId, integrationType: existing.code },
      })
    } else if (listType === 'INTEGRATION_TIMING') {
      inUseCount = await prisma.crossMatrixEntry.count({
        where: { projectId, timing: existing.code },
      })
    }

    if (inUseCount > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Este item está em uso por ${inUseCount} registro(s). Remova as referências antes de desativar.`,
        inUseCount,
      })
    }

    // Desativa o item (soft delete)
    await prisma.projectListItem.update({
      where: { id: itemId },
      data: { isActive: false },
    })

    res.json({
      success: true,
      message: 'Item desativado com sucesso',
    })
  } catch (error) {
    console.error('Error deleting list item:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao remover item',
    })
  }
})

export default router
