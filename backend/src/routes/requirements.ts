import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireEditPermission, requireProjectAccess } from '../middleware/permissions'
import { createRequirementSchema, updateRequirementSchema, bulkImportItemSchema } from '../schemas'
import { CreateRequirementRequest, UpdateRequirementRequest } from '../types'
import { regenerateCrossMatrix } from '../services/crossMatrixService'
import {
  emitRequirementCreate,
  emitRequirementUpdate,
  emitRequirementConflict,
} from '../services/notificationService'
import {
  logRequirementCreate,
  logRequirementChanges,
} from '../middleware/changelog'

// Interface para resposta do bulk import
interface BulkImportError {
  row: number
  reqId?: string
  errors: string[]
}

interface BulkImportResponse {
  success: boolean
  created: number
  message: string
  errors?: BulkImportError[]
  validCount?: number
  errorCount?: number
}

const router = Router()

/**
 * GET /api/projects/:projectId/requirements
 * Lista todos os requisitos de um projeto
 * Requer: autenticação + permissão de visualizar projeto
 */
router.get(
  '/projects/:projectId/requirements',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params
      const { module, status } = req.query

      // Construir filtros dinâmicos
      const where: any = { projectId }
      if (module && typeof module === 'string') {
        where.module = module
      }
      if (status && typeof status === 'string') {
        where.status = status
      }

      const requirements = await prisma.requirement.findMany({
        where,
        include: {
          consultant: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { comments: true },
          },
        },
        orderBy: { reqId: 'asc' },
      })

      // Parse dependsOn e providesFor de JSON string para array
      const requirementsFormatted = requirements.map((req) => ({
        ...req,
        dependsOn: req.dependsOn ? JSON.parse(req.dependsOn) : [],
        providesFor: req.providesFor ? JSON.parse(req.providesFor) : [],
      }))

      res.json(requirementsFormatted)
    } catch (error) {
      console.error('Error fetching requirements:', error)
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao buscar requisitos',
      })
    }
  }
)

/**
 * GET /api/requirements/:id
 * Busca um requisito específico
 * Requer: autenticação + permissão de visualizar projeto
 */
router.get('/requirements/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const requirement = await prisma.requirement.findUnique({
      where: { id },
      include: {
        consultant: {
          select: { id: true, name: true, email: true },
        },
        comments: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { comments: true, changes: true },
        },
      },
    })

    if (!requirement) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Requisito não encontrado',
      })
    }

    // Parse arrays
    const formatted = {
      ...requirement,
      dependsOn: requirement.dependsOn ? JSON.parse(requirement.dependsOn) : [],
      providesFor: requirement.providesFor ? JSON.parse(requirement.providesFor) : [],
    }

    res.json(formatted)
  } catch (error) {
    console.error('Error fetching requirement:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao buscar requisito',
    })
  }
})

/**
 * POST /api/requirements
 * Cria um novo requisito
 * Requer: autenticação
 *
 * NOTA: consultantId é definido automaticamente como o usuário logado
 * (a não ser que seja Manager/Admin criando para outro consultor)
 */
router.post('/requirements', authenticate, async (req: Request, res: Response) => {
  try {
    // Validar request body
    const validationResult = createRequirementSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      })
    }

    const data = validationResult.data as CreateRequirementRequest

    // Verificar se o usuário tem acesso ao projeto
    const isProjectMember = await prisma.projectUser.findFirst({
      where: {
        projectId: data.projectId,
        userId: req.user!.userId,
      },
    })

    if (!isProjectMember) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Você não tem permissão para criar requisitos neste projeto',
      })
    }

    // Verificar se reqId já existe neste projeto
    const existingReq = await prisma.requirement.findUnique({
      where: {
        projectId_reqId: {
          projectId: data.projectId,
          reqId: data.reqId,
        },
      },
    })

    if (existingReq) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Requisito ${data.reqId} já existe neste projeto`,
      })
    }

    // Converter arrays para JSON strings (SQLite não suporta arrays nativamente)
    const requirement = await prisma.requirement.create({
      data: {
        ...data,
        consultantId: req.user!.userId, // Sempre o usuário logado por padrão
        dependsOn: JSON.stringify(data.dependsOn || []),
        providesFor: JSON.stringify(data.providesFor || []),
      },
      include: {
        consultant: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    // Parse arrays antes de retornar
    const formatted = {
      ...requirement,
      dependsOn: JSON.parse(requirement.dependsOn),
      providesFor: JSON.parse(requirement.providesFor),
    }

    // Trigger automático: regenerar matriz de cruzamento
    // Executa em background para não bloquear resposta
    regenerateCrossMatrix(data.projectId).catch((err) =>
      console.error('Error regenerating cross matrix:', err)
    )

    // Registra criação no changelog
    logRequirementCreate(prisma, requirement.id, requirement.reqId, {
      userId: req.user!.userId,
    }).catch((err) => console.error('Error logging requirement create:', err))

    // Emite notificação real-time para membros do projeto
    const userName = req.user?.email?.split('@')[0] || 'Usuário'
    emitRequirementCreate(
      data.projectId,
      requirement.reqId,
      requirement.id,
      data.shortDesc,
      req.user!.userId,
      userName
    )

    res.status(201).json(formatted)
  } catch (error) {
    console.error('Error creating requirement:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao criar requisito',
    })
  }
})

/**
 * PATCH /api/requirements/:id
 * Atualiza um requisito existente
 * Requer: autenticação + permissão de editar requisito
 */
router.patch(
  '/requirements/:id',
  authenticate,
  requireEditPermission,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params

      // Validar request body
      const validationResult = updateRequirementSchema.safeParse(req.body)
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Validation Error',
          message: validationResult.error.issues
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', '),
        })
      }

      const data = validationResult.data as UpdateRequirementRequest

      // Busca estado atual ANTES do update para comparar no changelog
      const oldRequirement = await prisma.requirement.findUnique({
        where: { id },
      })

      if (!oldRequirement) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Requisito não encontrado',
        })
      }

      // Converter arrays para JSON strings se fornecidos
      const updateData: any = { ...data }
      if (data.dependsOn) {
        updateData.dependsOn = JSON.stringify(data.dependsOn)
      }
      if (data.providesFor) {
        updateData.providesFor = JSON.stringify(data.providesFor)
      }

      const requirement = await prisma.requirement.update({
        where: { id },
        data: updateData,
        include: {
          consultant: {
            select: { id: true, name: true, email: true },
          },
        },
      })

      // Registra mudanças no changelog (compara old vs new)
      logRequirementChanges(prisma, id, oldRequirement, requirement, {
        userId: req.user!.userId,
      }).catch((err) => console.error('Error logging requirement changes:', err))

      // Parse arrays antes de retornar
      const formatted = {
        ...requirement,
        dependsOn: JSON.parse(requirement.dependsOn),
        providesFor: JSON.parse(requirement.providesFor),
      }

      // Trigger automático: regenerar matriz de cruzamento
      // Executa em background para não bloquear resposta
      regenerateCrossMatrix(requirement.projectId).catch((err) =>
        console.error('Error regenerating cross matrix:', err)
      )

      // Emite notificações real-time
      const userName = req.user?.email?.split('@')[0] || 'Usuário'
      const changedFields = Object.keys(data)

      // Se status mudou para CONFLICT, emite notificação específica
      if (data.status === 'CONFLICT') {
        emitRequirementConflict(
          requirement.projectId,
          requirement.reqId,
          requirement.id,
          requirement.shortDesc,
          req.user!.userId,
          userName
        )
      } else if (changedFields.length > 0) {
        // Notificação genérica de update
        emitRequirementUpdate(
          requirement.projectId,
          requirement.reqId,
          requirement.id,
          changedFields,
          req.user!.userId,
          userName
        )
      }

      res.json(formatted)
    } catch (error) {
      console.error('Error updating requirement:', error)
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao atualizar requisito',
      })
    }
  }
)

/**
 * DELETE /api/requirements/:id
 * Deleta um requisito
 * Requer: autenticação + permissão de editar requisito
 *
 * NOTA: apenas ADMIN ou MANAGER podem deletar requisitos
 */
router.delete(
  '/requirements/:id',
  authenticate,
  requireEditPermission,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params

      // Apenas ADMIN ou MANAGER podem deletar
      const allowedRoles = ['ADMIN', 'MANAGER']
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Apenas gerentes e administradores podem deletar requisitos',
        })
      }

      // Verifica dependências na matriz cruzada antes de deletar
      // Se existirem entradas referenciando este requisito, bloqueia a exclusão
      // com mensagem explicativa ao invés de erro genérico de constraint
      const crossMatrixCount = await prisma.crossMatrixEntry.count({
        where: {
          OR: [
            { fromReqId: id },
            { toReqId: id }
          ]
        }
      })

      if (crossMatrixCount > 0) {
        return res.status(409).json({
          error: 'Conflict',
          message: `Requisito possui ${crossMatrixCount} entrada(s) na matriz cruzada. Remova as dependências antes de deletar.`
        })
      }

      await prisma.requirement.delete({
        where: { id },
      })

      res.status(204).send()
    } catch (error) {
      console.error('Error deleting requirement:', error)
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao deletar requisito',
      })
    }
  }
)

/**
 * POST /api/projects/:projectId/requirements/bulk
 * Importação em massa de requisitos a partir de planilha
 * Requer: autenticação + acesso ao projeto + role ADMIN ou MANAGER
 *
 * Body: { requirements: Array<RequirementData> }
 *
 * Comportamento:
 * - Valida cada item individualmente com Zod
 * - Se ALGUM item tiver erro de validação, retorna 400 com lista de erros
 * - Se todos válidos, insere transacionalmente (all-or-nothing)
 * - Dispara regeneração da matriz após sucesso
 */
router.post(
  '/projects/:projectId/requirements/bulk',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params
      const { requirements } = req.body

      // Apenas ADMIN ou MANAGER podem fazer bulk import
      const allowedRoles = ['ADMIN', 'MANAGER']
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Apenas gerentes e administradores podem importar requisitos em massa',
        })
      }

      // Validar que é um array
      if (!Array.isArray(requirements)) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Body deve conter um array "requirements"',
        })
      }

      if (requirements.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Array de requisitos não pode ser vazio',
        })
      }

      // Limite de segurança para evitar sobrecarga
      const MAX_BULK_SIZE = 500
      if (requirements.length > MAX_BULK_SIZE) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: `Máximo de ${MAX_BULK_SIZE} requisitos por importação`,
        })
      }

      // Buscar reqIds existentes no projeto para verificar duplicatas
      const existingReqs = await prisma.requirement.findMany({
        where: { projectId },
        select: { reqId: true },
      })
      const existingReqIds = new Set(existingReqs.map((r) => r.reqId))

      // Validar cada item
      const errors: BulkImportError[] = []
      const validItems: any[] = []
      const seenReqIds = new Set<string>() // Para detectar duplicatas no próprio batch

      requirements.forEach((item: any, index: number) => {
        const rowNumber = index + 1
        const rowErrors: string[] = []

        // Validar com Zod
        const result = bulkImportItemSchema.safeParse(item)
        if (!result.success) {
          rowErrors.push(
            ...result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`)
          )
        }

        // Verificar duplicata no banco
        const reqId = item.reqId?.toString() || ''
        if (existingReqIds.has(reqId)) {
          rowErrors.push(`reqId "${reqId}" já existe no projeto`)
        }

        // Verificar duplicata no próprio batch
        if (seenReqIds.has(reqId)) {
          rowErrors.push(`reqId "${reqId}" duplicado na planilha`)
        }
        seenReqIds.add(reqId)

        if (rowErrors.length > 0) {
          errors.push({
            row: rowNumber,
            reqId: reqId || undefined,
            errors: rowErrors,
          })
        } else {
          validItems.push(result.data)
        }
      })

      // Se houver erros, retorna sem inserir
      if (errors.length > 0) {
        const response: BulkImportResponse = {
          success: false,
          created: 0,
          message: `Encontrados ${errors.length} erro(s) de validação`,
          errors,
          validCount: validItems.length,
          errorCount: errors.length,
        }
        return res.status(400).json(response)
      }

      // Inserção transacional (all-or-nothing)
      const createdRequirements = await prisma.$transaction(
        validItems.map((data) =>
          prisma.requirement.create({
            data: {
              projectId,
              reqId: data.reqId,
              shortDesc: data.shortDesc,
              module: data.module,
              what: data.what,
              why: data.why,
              who: data.who,
              when: data.when,
              where: data.where,
              howToday: data.howToday,
              howMuch: data.howMuch,
              dependsOn: JSON.stringify(data.dependsOn || []),
              providesFor: JSON.stringify(data.providesFor || []),
              status: data.status || 'PENDING',
              observations: data.observations,
              consultantNotes: data.consultantNotes,
              consultantId: req.user!.userId,
            },
          })
        )
      )

      // Trigger regeneração da matriz em background
      regenerateCrossMatrix(projectId).catch((err) =>
        console.error('Error regenerating cross matrix after bulk import:', err)
      )

      const response: BulkImportResponse = {
        success: true,
        created: createdRequirements.length,
        message: `${createdRequirements.length} requisito(s) importado(s) com sucesso`,
      }

      res.status(201).json(response)
    } catch (error) {
      console.error('Error in bulk import:', error)
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro na importação em massa',
      })
    }
  }
)

export default router
