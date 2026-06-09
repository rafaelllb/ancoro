import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireEditPermission, requireDeletePermission, requireProjectAccess, canEditResponsibleBusiness } from '../middleware/permissions'
import {
  createRequirementSchemaForProject,
  updateRequirementSchema,
  createBulkImportItemSchemaForProject,
} from '../schemas'
import { CreateRequirementRequest, UpdateRequirementRequest } from '../types'
import { regenerateCrossMatrix } from '../services/crossMatrixService'
import { patternFromProject } from '../utils/reqIdPattern'
import {
  emitRequirementCreate,
  emitRequirementUpdate,
  emitRequirementConflict,
} from '../services/notificationService'
import {
  logRequirementCreate,
  logRequirementChanges,
} from '../middleware/changelog'
import { hasCapability } from '../utils/roleCapabilities'

// Interface para resposta do bulk import
interface BulkImportError {
  row: number
  reqId?: string
  errors: string[]
}

interface BulkImportResponse {
  success: boolean
  created: number
  updated: number  // Quantidade de requisitos atualizados (upsert)
  message: string
  errors?: BulkImportError[]
  validCount?: number
  errorCount?: number
}

const router = Router()

async function validateResponsibleConsultant(projectId: string, responsibleConsultantId?: string | null) {
  if (!responsibleConsultantId) {
    return { valid: true as const }
  }

  const projectMember = await prisma.projectUser.findFirst({
    where: {
      projectId,
      userId: responsibleConsultantId,
      user: {
        is: {
          role: 'CONSULTANT',
        },
      },
    },
    include: {
      user: {
        select: { id: true, name: true, role: true },
      },
    },
  })

  if (!projectMember) {
    return {
      valid: false as const,
      message: 'Responsável consultor deve ser um consultor membro do projeto',
    }
  }

  return { valid: true as const, user: projectMember.user }
}

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
          responsibleConsultant: {
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
        responsibleConsultant: {
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

    if (req.user!.role !== 'ADMIN') {
      const isProjectMember = await prisma.projectUser.findFirst({
        where: {
          projectId: requirement.projectId,
          userId: req.user!.userId,
        },
      })

      if (!isProjectMember) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Você não tem acesso a este requisito',
        })
      }
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
 * Validação de reqId é dinâmica baseada no padrão configurado no projeto
 */
router.post('/requirements', authenticate, async (req: Request, res: Response) => {
  try {
    // Primeiro busca o projeto para obter o padrão de ID
    const projectId = req.body.projectId
    if (!projectId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'projectId é obrigatório',
      })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { reqIdPrefix: true, reqIdSeparator: true, reqIdDigitCount: true },
    })

    if (!project) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Projeto não encontrado',
      })
    }

    // Cria schema dinâmico baseado no padrão do projeto
    const pattern = patternFromProject(project)
    const schema = createRequirementSchemaForProject(pattern)

    // Validar request body com schema dinâmico
    const validationResult = schema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      })
    }

    const data = validationResult.data as CreateRequirementRequest

    const responsibleConsultantValidation = await validateResponsibleConsultant(
      data.projectId,
      data.responsibleConsultantId
    )
    if (!responsibleConsultantValidation.valid) {
      return res.status(400).json({
        error: 'Validation Error',
        message: responsibleConsultantValidation.message,
      })
    }

    // Verificar se o usuário tem acesso ao projeto
    // ADMIN tem acesso global a todos os projetos
    if (req.user!.role !== 'ADMIN') {
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
        responsibleConsultantId: data.responsibleConsultantId ?? null,
        responsibleBusiness: data.responsibleBusiness?.trim() || null,
        dependsOn: JSON.stringify(data.dependsOn || []),
        providesFor: JSON.stringify(data.providesFor || []),
      },
      include: {
        responsibleConsultant: {
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

      if (
        data.responsibleConsultantId !== undefined &&
        !(
          hasCapability(req.user!.role, 'canAssignRequirementResponsible') ||
          (req.user!.role === 'CONSULTANT' &&
            oldRequirement.responsibleConsultantId === req.user!.userId)
        )
      ) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Você não tem permissão para alocar responsáveis a requisitos',
        })
      }

      // Validação específica para CLIENT quando há responsável consultor atribuído
      // CLIENT pode editar qualquer campo se não houver responsável, mas apenas
      // responsibleBusiness se já houver um responsável consultor
      if (req.user!.role === 'CLIENT' && oldRequirement.responsibleConsultantId) {
        const allowedFieldsForClient = ['responsibleBusiness']
        const fieldsBeingEdited = Object.keys(data)
        const unauthorizedFields = fieldsBeingEdited.filter(
          (field) => !allowedFieldsForClient.includes(field)
        )

        if (unauthorizedFields.length > 0) {
          return res.status(403).json({
            error: 'Forbidden',
            message: `Você não tem permissão para editar os campos: ${unauthorizedFields.join(', ')}. Apenas o campo "Responsável Negócio" pode ser editado quando há um consultor responsável.`,
          })
        }
      }

      const targetResponsibleConsultantId =
        data.responsibleConsultantId === undefined
          ? oldRequirement.responsibleConsultantId
          : data.responsibleConsultantId

      const responsibleConsultantValidation = await validateResponsibleConsultant(
        oldRequirement.projectId,
        targetResponsibleConsultantId
      )
      if (!responsibleConsultantValidation.valid) {
        return res.status(400).json({
          error: 'Validation Error',
          message: responsibleConsultantValidation.message,
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
      if (data.responsibleBusiness !== undefined) {
        updateData.responsibleBusiness = data.responsibleBusiness?.trim() || null
      }
      if (data.responsibleConsultantId !== undefined) {
        updateData.responsibleConsultantId = data.responsibleConsultantId || null
      }

      const requirement = await prisma.requirement.update({
        where: { id },
        data: updateData,
        include: {
          responsibleConsultant: {
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
 * Requer: autenticação + permissão de exclusão
 *
 * Regras de permissão (conforme ANALISE_PERMISSOES_POR_ROLE.md):
 * - ADMIN: pode excluir qualquer requisito
 * - CONSULTANT: pode excluir apenas seus próprios requisitos
 * - MANAGER: NÃO pode excluir
 * - CLIENT: NÃO pode excluir
 */
router.delete(
  '/requirements/:id',
  authenticate,
  requireDeletePermission,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params

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
 * DELETE /api/projects/:projectId/requirements/bulk
 * Deleção em massa de requisitos
 * Requer: autenticação + acesso ao projeto
 *
 * Body: { ids: string[] }
 *
 * Comportamento:
 * - Valida permissão individualmente para cada requisito
 * - Verifica dependências na CrossMatrix para cada um
 * - Deleta os válidos em transação
 * - Retorna resultado consolidado com falhas detalhadas
 *
 * Regras de permissão:
 * - ADMIN: pode excluir qualquer requisito do projeto
 * - CONSULTANT: pode excluir apenas seus próprios requisitos
 * - MANAGER/CLIENT: NÃO podem excluir (retorna todos como failure)
 */
router.delete(
  '/projects/:projectId/requirements/bulk',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params
      const { ids } = req.body as { ids: string[] }
      const userId = req.user!.id
      const userRole = req.user!.role

      // Validação básica do payload
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'É necessário fornecer um array de IDs para deletar.',
        })
      }

      // Busca todos os requisitos solicitados para validação
      const requirements = await prisma.requirement.findMany({
        where: {
          id: { in: ids },
          projectId: projectId, // Garante que pertencem ao projeto
        },
        select: {
          id: true,
          reqId: true,
          responsibleConsultantId: true,
        },
      })

      // Identifica IDs não encontrados no projeto
      const foundIds = new Set(requirements.map((r) => r.id))
      const notFoundIds = ids.filter((id) => !foundIds.has(id))

      // Classifica requisitos: permitidos vs negados
      const allowed: string[] = []
      const failures: Array<{ id: string; reqId: string; reason: string }> = []

      // IDs não encontrados vão para failures
      notFoundIds.forEach((id) => {
        failures.push({
          id,
          reqId: 'N/A',
          reason: 'Requisito não encontrado neste projeto',
        })
      })

      // Verifica permissão para cada requisito encontrado
      for (const req of requirements) {
        // ADMIN pode deletar qualquer um
        if (userRole === 'ADMIN') {
          allowed.push(req.id)
          continue
        }

        // MANAGER e CLIENT não podem deletar
        if (userRole === 'MANAGER' || userRole === 'CLIENT') {
          failures.push({
            id: req.id,
            reqId: req.reqId,
            reason: 'Seu perfil não tem permissão para deletar requisitos',
          })
          continue
        }

        // CONSULTANT: apenas seus próprios
        if (userRole === 'CONSULTANT') {
          if (req.responsibleConsultantId === userId) {
            allowed.push(req.id)
          } else {
            failures.push({
              id: req.id,
              reqId: req.reqId,
              reason: 'Você só pode deletar requisitos onde é o consultor responsável',
            })
          }
          continue
        }

        // Qualquer outro role: não pode
        failures.push({
          id: req.id,
          reqId: req.reqId,
          reason: 'Permissão negada',
        })
      }

      // Verifica CrossMatrix para os requisitos permitidos
      const allowedWithCrossMatrix: string[] = []
      for (const id of allowed) {
        const crossMatrixCount = await prisma.crossMatrixEntry.count({
          where: {
            OR: [{ fromReqId: id }, { toReqId: id }],
          },
        })

        if (crossMatrixCount > 0) {
          const req = requirements.find((r) => r.id === id)!
          failures.push({
            id,
            reqId: req.reqId,
            reason: `Possui ${crossMatrixCount} entrada(s) na matriz cruzada. Remova as dependências primeiro.`,
          })
        } else {
          allowedWithCrossMatrix.push(id)
        }
      }

      // Se não há nada para deletar, retorna resultado vazio
      if (allowedWithCrossMatrix.length === 0) {
        return res.status(200).json({
          success: failures.length === 0,
          deleted: 0,
          failed: failures.length,
          message:
            failures.length > 0
              ? 'Nenhum requisito pôde ser deletado'
              : 'Nenhum requisito para deletar',
          failures: failures.length > 0 ? failures : undefined,
        })
      }

      // Deleta os requisitos válidos em transação
      await prisma.$transaction(
        allowedWithCrossMatrix.map((id) =>
          prisma.requirement.delete({ where: { id } })
        )
      )

      // Resultado final
      const result = {
        success: failures.length === 0,
        deleted: allowedWithCrossMatrix.length,
        failed: failures.length,
        message:
          failures.length === 0
            ? `${allowedWithCrossMatrix.length} requisito(s) deletado(s) com sucesso`
            : `${allowedWithCrossMatrix.length} deletado(s), ${failures.length} não puderam ser deletados`,
        failures: failures.length > 0 ? failures : undefined,
      }

      res.status(200).json(result)
    } catch (error) {
      console.error('Error bulk deleting requirements:', error)
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao deletar requisitos em massa',
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

      // Buscar projeto para obter o padrão de ID
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { reqIdPrefix: true, reqIdSeparator: true, reqIdDigitCount: true },
      })

      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Projeto não encontrado',
        })
      }

      // Cria schema dinâmico baseado no padrão do projeto
      const pattern = patternFromProject(project)
      const bulkItemSchema = createBulkImportItemSchemaForProject(pattern)

      // Buscar reqIds existentes no projeto para identificar updates vs creates
      const existingReqs = await prisma.requirement.findMany({
        where: { projectId },
        select: { id: true, reqId: true },
      })
      // Mapa reqId -> id do registro existente
      const existingReqMap = new Map(existingReqs.map((r) => [r.reqId, r.id]))

      // Validar cada item
      const errors: BulkImportError[] = []
      const itemsToCreate: any[] = []
      const itemsToUpdate: { id: string; data: any }[] = []
      const seenReqIds = new Set<string>() // Para detectar duplicatas no próprio batch

      for (const [index, item] of requirements.entries()) {
        const rowNumber = index + 1
        const rowErrors: string[] = []

        // Validar com Zod usando schema dinâmico do projeto
        const result = bulkItemSchema.safeParse(item)
        if (!result.success) {
          rowErrors.push(
            ...result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`)
          )
        }

        const reqId = item.reqId?.toString() || ''

        // Verificar duplicata no próprio batch
        if (seenReqIds.has(reqId)) {
          rowErrors.push(`reqId "${reqId}" duplicado na planilha`)
        }
        seenReqIds.add(reqId)

        if (result.success) {
          const consultantValidation = await validateResponsibleConsultant(
            projectId,
            result.data.responsibleConsultantId
          )

          if (!consultantValidation.valid) {
            rowErrors.push(consultantValidation.message)
          }
        }

        if (rowErrors.length > 0) {
          errors.push({
            row: rowNumber,
            reqId: reqId || undefined,
            errors: rowErrors,
          })
        } else {
          // Upsert: se existe, atualiza; se não, cria
          const existingId = existingReqMap.get(reqId)
          if (existingId) {
            itemsToUpdate.push({ id: existingId, data: result.data })
          } else {
            itemsToCreate.push(result.data)
          }
        }
      }

      // Se houver erros de validação, retorna sem processar
      if (errors.length > 0) {
        const response: BulkImportResponse = {
          success: false,
          created: 0,
          updated: 0,
          message: `Encontrados ${errors.length} erro(s) de validação`,
          errors,
          validCount: itemsToCreate.length + itemsToUpdate.length,
          errorCount: errors.length,
        }
        return res.status(400).json(response)
      }

      // Execução transacional (all-or-nothing) com creates e updates
      // Timeout aumentado para suportar operações bulk (default é 5s)
      await prisma.$transaction(
        async (tx) => {
          // Criar novos requisitos em batch (1 round-trip ao invés de N)
          if (itemsToCreate.length > 0) {
            await tx.requirement.createMany({
              data: itemsToCreate.map((data) => ({
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
                responsibleConsultantId: data.responsibleConsultantId || null,
                responsibleBusiness: data.responsibleBusiness?.trim() || null,
                consultantNotes: data.consultantNotes,
              })),
              skipDuplicates: true,
            })
          }

          // Atualizar requisitos existentes (update individual necessário pois cada registro tem valores diferentes)
          for (const { id, data } of itemsToUpdate) {
            await tx.requirement.update({
              where: { id },
              data: {
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
                responsibleConsultantId: data.responsibleConsultantId || null,
                responsibleBusiness: data.responsibleBusiness?.trim() || null,
                status: data.status || 'PENDING',
                observations: data.observations,
                consultantNotes: data.consultantNotes,
              },
            })
          }
        },
        {
          timeout: 60000, // 60 segundos para operações bulk
          maxWait: 10000, // Aguarda até 10s para iniciar a transação
        }
      )

      // Trigger regeneração da matriz em background
      regenerateCrossMatrix(projectId).catch((err) =>
        console.error('Error regenerating cross matrix after bulk import:', err)
      )

      // Monta mensagem de resultado
      const parts: string[] = []
      if (itemsToCreate.length > 0) {
        parts.push(`${itemsToCreate.length} criado(s)`)
      }
      if (itemsToUpdate.length > 0) {
        parts.push(`${itemsToUpdate.length} atualizado(s)`)
      }
      const message = parts.length > 0 ? parts.join(', ') : 'Nenhuma alteração'

      const response: BulkImportResponse = {
        success: true,
        created: itemsToCreate.length,
        updated: itemsToUpdate.length,
        message,
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

// =============================================================================
// TODO [ESTIGMERGIA]: Template Library de Requisitos por Vertical
// =============================================================================
// CONTEXTO:
//   Diferencial competitivo identificado - consultores não deveriam começar
//   do zero em cada projeto. Templates reduzem tempo de discovery em ~50%.
//
// O QUE IMPLEMENTAR:
//   Biblioteca de requisitos pré-definidos organizados por vertical:
//   - Utilities: leitura, faturamento, corte/religação, medição, perdas
//   - Financeiro: contas a pagar/receber, conciliação, fechamento
//   - Varejo: PDV, estoque, pricing, promoções
//   - Manufatura: MRP, chão de fábrica, qualidade
//
// MODELO DE DADOS SUGERIDO:
//   Template {
//     id, name, vertical, module,
//     shortDesc, what, why, who, when, where, howToday, howMuch,
//     typicalDependencies: string[],  // Padrões comuns de dependência
//     tags: string[],
//     createdBy, isPublic
//   }
//
// ENDPOINTS:
//   GET  /api/templates                    - Lista templates (filtro por vertical/module)
//   GET  /api/templates/:id                - Detalhes de um template
//   POST /api/templates                    - Cria template (ADMIN only)
//   POST /api/projects/:projectId/requirements/from-template
//        Body: { templateId, overrides?: Partial<Requirement> }
//        → Cria requisito a partir de template com customizações opcionais
//
// UI SUGERIDA:
//   - Modal "Criar de Template" no botão + de requisitos
//   - Filtros: vertical, módulo, tags
//   - Preview antes de criar
//   - Batch: selecionar múltiplos templates de uma vez
//
// DECISÃO PENDENTE:
//   - Templates globais (Ancoro mantém) vs. por organização (cada cliente cria os seus)
//   - Monetização: templates premium? marketplace?
//
// REFERÊNCIAS:
//   - Bulk import já existe como referência de criação em massa
//   - Plano estratégico: C:\Users\rafae\.claude\plans\reactive-bouncing-ripple.md
// =============================================================================

export default router
