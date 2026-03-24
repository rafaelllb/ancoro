import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { updateProjectSettingsSchema, createProjectSchema, updateProjectSchema } from '../schemas'
import { generateExample, patternFromProject } from '../utils/reqIdPattern'
import { generateDefaultListItemsData } from '../utils/defaultLists'

const router = Router()

/**
 * POST /api/projects
 * Cria um novo projeto com listas configuráveis default
 * Requer: autenticação + role ADMIN
 *
 * Body:
 * - name: string (obrigatório)
 * - client: string (obrigatório)
 * - startDate: string ISO 8601 (obrigatório)
 * - status: string (opcional, default: DISCOVERY)
 * - reqIdPrefix: string (opcional, default: REQ)
 * - reqIdSeparator: string (opcional, default: -)
 * - reqIdDigitCount: number (opcional, default: 3)
 */
router.post('/projects', authenticate, async (req: Request, res: Response) => {
  try {
    // Apenas ADMIN pode criar projetos
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas administradores podem criar projetos',
      })
    }

    // Validar request body
    const validationResult = createProjectSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      })
    }

    const data = validationResult.data

    // Criar projeto com listas default em uma transação
    const project = await prisma.$transaction(async (tx) => {
      // Cria o projeto
      const newProject = await tx.project.create({
        data: {
          name: data.name,
          client: data.client,
          startDate: new Date(data.startDate),
          status: data.status,
          reqIdPrefix: data.reqIdPrefix,
          reqIdSeparator: data.reqIdSeparator,
          reqIdDigitCount: data.reqIdDigitCount,
        },
      })

      // Cria as listas default (módulos, status, tipos integração, timing)
      const listItems = generateDefaultListItemsData(newProject.id)
      await tx.projectListItem.createMany({ data: listItems })

      // Adiciona o criador como membro do projeto (ADMIN)
      await tx.projectUser.create({
        data: {
          projectId: newProject.id,
          userId: req.user!.userId,
          module: null, // Admin não tem módulo específico
        },
      })

      return newProject
    })

    // Calcula exemplo de ID
    const pattern = patternFromProject(project)
    const reqIdExample = generateExample(pattern)

    res.status(201).json({
      ...project,
      reqIdExample,
      message: 'Projeto criado com sucesso',
    })
  } catch (error) {
    console.error('Error creating project:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao criar projeto',
    })
  }
})

/**
 * GET /api/projects
 * Lista todos os projetos do usuário
 * Requer: autenticação
 */
router.get('/projects', authenticate, async (req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        _count: {
          select: { requirements: true, users: true },
        },
      },
    })
    res.json(projects)
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/projects/:id
 * Retorna detalhes de um projeto específico
 * Inclui configurações de padrão de ID de requisitos
 * Requer: autenticação
 */
router.get('/projects/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: { requirements: true, users: true },
        },
      },
    })

    if (!project) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Projeto não encontrado',
      })
    }

    // Adiciona exemplo de ID formatado baseado no padrão
    const pattern = patternFromProject(project)
    const reqIdExample = generateExample(pattern)

    res.json({
      ...project,
      reqIdExample, // Ex: "REQ-001" ou "US-0001"
    })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/projects/:id/settings
 * Retorna configurações do projeto (padrão de ID de requisitos)
 * Requer: autenticação
 */
router.get('/projects/:id/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        reqIdPrefix: true,
        reqIdSeparator: true,
        reqIdDigitCount: true,
      },
    })

    if (!project) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Projeto não encontrado',
      })
    }

    // Calcula exemplo e regex
    const pattern = patternFromProject(project)
    const reqIdExample = generateExample(pattern)

    // Conta requisitos existentes para warning
    const requirementCount = await prisma.requirement.count({
      where: { projectId: id },
    })

    res.json({
      reqIdPrefix: project.reqIdPrefix,
      reqIdSeparator: project.reqIdSeparator,
      reqIdDigitCount: project.reqIdDigitCount,
      reqIdExample,
      hasExistingRequirements: requirementCount > 0,
      requirementCount,
    })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * PATCH /api/projects/:id/settings
 * Atualiza configurações do projeto (padrão de ID de requisitos)
 * Requer: autenticação + role ADMIN ou MANAGER
 *
 * Body (todos opcionais):
 * - reqIdPrefix: string (1-10 chars alfanumérico)
 * - reqIdSeparator: string ("-", "_" ou "")
 * - reqIdDigitCount: number (2-6)
 *
 * AVISO: Alterar padrão com requisitos existentes pode causar inconsistências
 * (requisitos antigos não serão renomeados automaticamente)
 */
router.patch('/projects/:id/settings', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Apenas ADMIN ou MANAGER podem alterar configurações
    const allowedRoles = ['ADMIN', 'MANAGER']
    if (!allowedRoles.includes(req.user!.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas gerentes e administradores podem alterar configurações do projeto',
      })
    }

    // Validar request body
    const validationResult = updateProjectSettingsSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      })
    }

    const data = validationResult.data

    // Verifica se projeto existe
    const existingProject = await prisma.project.findUnique({
      where: { id },
    })

    if (!existingProject) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Projeto não encontrado',
      })
    }

    // Atualiza apenas campos fornecidos
    const updateData: Record<string, any> = {}
    if (data.reqIdPrefix !== undefined) updateData.reqIdPrefix = data.reqIdPrefix
    if (data.reqIdSeparator !== undefined) updateData.reqIdSeparator = data.reqIdSeparator
    if (data.reqIdDigitCount !== undefined) updateData.reqIdDigitCount = data.reqIdDigitCount

    // Se nenhum campo foi fornecido, retorna erro
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Nenhum campo de configuração fornecido',
      })
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        reqIdPrefix: true,
        reqIdSeparator: true,
        reqIdDigitCount: true,
      },
    })

    // Calcula novo exemplo
    const pattern = patternFromProject(project)
    const reqIdExample = generateExample(pattern)

    res.json({
      ...project,
      reqIdExample,
      message: 'Configurações atualizadas com sucesso',
    })
  } catch (error) {
    console.error('Error updating project settings:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao atualizar configurações',
    })
  }
})

/**
 * PUT /api/projects/:id
 * Atualiza dados gerais do projeto
 * Requer: autenticação + role ADMIN
 *
 * Body (todos opcionais):
 * - name: string (3-100 chars)
 * - client: string (2-100 chars)
 * - startDate: string ISO 8601
 * - status: DISCOVERY | REALIZATION | GOLIVE | HYPERCARE | CLOSED
 *
 * Nota: Para alterar padrão de ID de requisitos, use PATCH /projects/:id/settings
 */
router.put('/projects/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // Apenas ADMIN pode editar projetos
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas administradores podem editar projetos',
      })
    }

    // Validar request body
    const validationResult = updateProjectSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      })
    }

    const data = validationResult.data

    // Verifica se projeto existe
    const existingProject = await prisma.project.findUnique({
      where: { id },
    })

    if (!existingProject) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Projeto não encontrado',
      })
    }

    // Monta objeto de atualização apenas com campos fornecidos
    const updateData: Record<string, any> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.client !== undefined) updateData.client = data.client
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate)
    if (data.status !== undefined) updateData.status = data.status

    // Se nenhum campo foi fornecido, retorna erro
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Nenhum campo para atualização fornecido',
      })
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { requirements: true, users: true },
        },
      },
    })

    // Calcula exemplo de ID
    const pattern = patternFromProject(project)
    const reqIdExample = generateExample(pattern)

    res.json({
      ...project,
      reqIdExample,
      message: 'Projeto atualizado com sucesso',
    })
  } catch (error) {
    console.error('Error updating project:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao atualizar projeto',
    })
  }
})

/**
 * DELETE /api/projects/:id
 * Exclui um projeto e todos os dados relacionados
 * Requer: autenticação + role ADMIN + confirmação explícita
 *
 * Query params:
 * - confirm: "true" (obrigatório para evitar exclusões acidentais)
 *
 * Cascade delete:
 * - ProjectUsers (membros do projeto)
 * - ProjectListItems (listas configuráveis)
 * - Requirements (requisitos)
 * - Comments (comentários dos requisitos)
 * - CrossMatrixEntries (matriz de cruzamento)
 * - Sprints (sprints do projeto)
 * - ChangeLog (logs de alteração)
 */
router.delete('/projects/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { confirm } = req.query

    // Apenas ADMIN pode excluir projetos
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas administradores podem excluir projetos',
      })
    }

    // Requer confirmação explícita
    if (confirm !== 'true') {
      return res.status(400).json({
        error: 'Confirmation Required',
        message: 'Para excluir o projeto, adicione ?confirm=true à requisição. Esta ação é irreversível.',
      })
    }

    // Verifica se projeto existe
    const existingProject = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: { requirements: true, users: true },
        },
      },
    })

    if (!existingProject) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Projeto não encontrado',
      })
    }

    // Executa exclusão em cascata dentro de uma transação
    // Ordem importa devido a foreign keys
    await prisma.$transaction(async (tx) => {
      // 1. Busca IDs dos requisitos para deletar comentários e changelog
      const requirementIds = await tx.requirement.findMany({
        where: { projectId: id },
        select: { id: true },
      })
      const reqIds = requirementIds.map((r) => r.id)

      // 2. Deleta comentários dos requisitos do projeto
      if (reqIds.length > 0) {
        await tx.comment.deleteMany({
          where: { requirementId: { in: reqIds } },
        })
      }

      // 3. Deleta entradas da cross matrix
      await tx.crossMatrixEntry.deleteMany({
        where: { projectId: id },
      })

      // 4. Deleta changelog (se houver registros com requirementId)
      if (reqIds.length > 0) {
        await tx.changeLog.deleteMany({
          where: { requirementId: { in: reqIds } },
        })
      }

      // 5. Deleta requisitos
      await tx.requirement.deleteMany({
        where: { projectId: id },
      })

      // 6. Deleta sprints
      await tx.sprint.deleteMany({
        where: { projectId: id },
      })

      // 7. Deleta membros do projeto
      await tx.projectUser.deleteMany({
        where: { projectId: id },
      })

      // 8. Deleta listas configuráveis
      await tx.projectListItem.deleteMany({
        where: { projectId: id },
      })

      // 9. Finalmente, deleta o projeto
      await tx.project.delete({
        where: { id },
      })
    })

    res.json({
      message: 'Projeto excluído com sucesso',
      deletedProject: {
        id: existingProject.id,
        name: existingProject.name,
        requirementsDeleted: existingProject._count.requirements,
        usersRemoved: existingProject._count.users,
      },
    })
  } catch (error) {
    console.error('Error deleting project:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao excluir projeto',
    })
  }
})

export default router
