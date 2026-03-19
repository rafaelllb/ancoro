/**
 * Project Members Routes
 *
 * API REST para gerenciamento de membros do projeto
 * Apenas ADMIN ou MANAGER podem acessar estas rotas
 *
 * @author Rafael Brito
 */

import express from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireAdminOrManager } from '../middleware/permissions'

const router = express.Router()

// Todas as rotas requerem autenticação + permissão de admin/manager
router.use(authenticate)
router.use(requireAdminOrManager)

// Schema de validação para adicionar membro
const addMemberSchema = z.object({
  userId: z.string().min(1, 'User ID é obrigatório'),
  module: z.string().nullable().optional(),
})

// Schema de validação para atualizar membro
const updateMemberSchema = z.object({
  module: z.string().nullable().optional(),
})

/**
 * GET /api/projects/:projectId/members
 * Lista todos os membros de um projeto
 */
router.get('/projects/:projectId/members', async (req, res, next) => {
  try {
    const { projectId } = req.params

    // Verifica se projeto existe
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Projeto não encontrado',
      })
    }

    // Busca membros com dados do usuário
    const members = await prisma.projectUser.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: [
        { user: { role: 'asc' } }, // ADMIN primeiro, depois MANAGER, etc
        { user: { name: 'asc' } },
      ],
    })

    // Formata resposta para facilitar uso no frontend
    const formattedMembers = members.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      userId: m.userId,
      module: m.module,
      createdAt: m.createdAt,
      user: m.user,
    }))

    res.json({
      success: true,
      data: formattedMembers,
      count: formattedMembers.length,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/users/available
 * Lista usuários que NÃO estão associados ao projeto
 * Query param: projectId (obrigatório)
 */
router.get('/users/available', async (req, res, next) => {
  try {
    const { projectId } = req.query

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query param projectId é obrigatório',
      })
    }

    // Busca IDs de usuários que já são membros do projeto
    const existingMembers = await prisma.projectUser.findMany({
      where: { projectId },
      select: { userId: true },
    })

    const existingUserIds = existingMembers.map((m) => m.userId)

    // Busca usuários que NÃO estão no projeto
    const availableUsers = await prisma.user.findMany({
      where: {
        id: { notIn: existingUserIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    })

    res.json({
      success: true,
      data: availableUsers,
      count: availableUsers.length,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/projects/:projectId/members
 * Adiciona um membro ao projeto
 */
router.post('/projects/:projectId/members', async (req, res, next) => {
  try {
    const { projectId } = req.params

    // Valida dados de entrada
    const validatedData = addMemberSchema.parse(req.body)

    // Verifica se projeto existe
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Projeto não encontrado',
      })
    }

    // Verifica se usuário existe
    const user = await prisma.user.findUnique({
      where: { id: validatedData.userId },
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado',
      })
    }

    // Verifica se já é membro
    const existingMember = await prisma.projectUser.findFirst({
      where: {
        projectId,
        userId: validatedData.userId,
      },
    })

    if (existingMember) {
      return res.status(409).json({
        success: false,
        error: 'Usuário já é membro deste projeto',
      })
    }

    // Cria associação
    const newMember = await prisma.projectUser.create({
      data: {
        projectId,
        userId: validatedData.userId,
        module: validatedData.module || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    })

    res.status(201).json({
      success: true,
      data: {
        id: newMember.id,
        projectId: newMember.projectId,
        userId: newMember.userId,
        module: newMember.module,
        createdAt: newMember.createdAt,
        user: newMember.user,
      },
      message: `${user.name} adicionado ao projeto com sucesso`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: error.issues,
      })
    }
    next(error)
  }
})

/**
 * PATCH /api/projects/:projectId/members/:userId
 * Atualiza módulo de um membro
 */
router.patch('/projects/:projectId/members/:userId', async (req, res, next) => {
  try {
    const { projectId, userId } = req.params

    // Valida dados de entrada
    const validatedData = updateMemberSchema.parse(req.body)

    // Busca associação existente
    const existingMember = await prisma.projectUser.findFirst({
      where: { projectId, userId },
    })

    if (!existingMember) {
      return res.status(404).json({
        success: false,
        error: 'Membro não encontrado neste projeto',
      })
    }

    // Atualiza
    const updated = await prisma.projectUser.update({
      where: { id: existingMember.id },
      data: {
        module: validatedData.module,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    })

    res.json({
      success: true,
      data: {
        id: updated.id,
        projectId: updated.projectId,
        userId: updated.userId,
        module: updated.module,
        createdAt: updated.createdAt,
        user: updated.user,
      },
      message: 'Módulo atualizado com sucesso',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: error.issues,
      })
    }
    next(error)
  }
})

/**
 * DELETE /api/projects/:projectId/members/:userId
 * Remove um membro do projeto
 */
router.delete('/projects/:projectId/members/:userId', async (req, res, next) => {
  try {
    const { projectId, userId } = req.params
    const currentUserId = req.user?.userId

    // Não pode remover a si mesmo
    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        error: 'Você não pode remover a si mesmo do projeto',
      })
    }

    // Busca associação existente
    const existingMember = await prisma.projectUser.findFirst({
      where: { projectId, userId },
      include: {
        user: {
          select: { name: true },
        },
      },
    })

    if (!existingMember) {
      return res.status(404).json({
        success: false,
        error: 'Membro não encontrado neste projeto',
      })
    }

    // Remove
    await prisma.projectUser.delete({
      where: { id: existingMember.id },
    })

    res.json({
      success: true,
      message: `${existingMember.user.name} removido do projeto com sucesso`,
    })
  } catch (error) {
    next(error)
  }
})

export default router
