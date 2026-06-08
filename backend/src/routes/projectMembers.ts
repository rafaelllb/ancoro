/**
 * Project Members Routes
 *
 * API REST para gerenciamento de membros do projeto
 * Apenas ADMIN ou MANAGER podem acessar estas rotas
 */

import express from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireAdminOrManager, requireProjectAccess } from '../middleware/permissions'
import { getProjectModuleLabel } from '../utils/projectTerminology'
import { UserRole } from '../types'
import {
  listPendingProjectMembershipsByProject,
  upsertPendingProjectMembership,
} from '../utils/pendingProjectMemberships'

const router = express.Router()

router.use(authenticate)

const roleSchema = z.enum(['ADMIN', 'MANAGER', 'CONSULTANT', 'CLIENT'])

const addMemberSchema = z.object({
  userId: z.string().min(1, 'User ID é obrigatório').optional(),
  email: z.string().email('Email inválido').optional(),
  role: roleSchema,
  module: z.string().nullable().optional(),
}).refine((data) => !!data.userId || !!data.email, {
  message: 'Informe um usuário existente ou um e-mail',
})

const updateMemberSchema = z.object({
  role: roleSchema.optional(),
  module: z.string().nullable().optional(),
})

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function canAssignRole(actorRole: string, targetRole: string) {
  if (actorRole === UserRole.ADMIN) {
    return true
  }

  if (actorRole === UserRole.MANAGER) {
    return targetRole === UserRole.CONSULTANT || targetRole === UserRole.CLIENT
  }

  return false
}

function canManageExistingUser(
  actorRole: string,
  actorUserId: string | undefined,
  targetUser: { id: string; role: string }
) {
  if (actorRole === UserRole.ADMIN) {
    return targetUser.id !== actorUserId
  }

  if (actorRole === UserRole.MANAGER) {
    if (targetUser.id === actorUserId) return false
    return targetUser.role === UserRole.CONSULTANT || targetUser.role === UserRole.CLIENT
  }

  return false
}

router.get('/projects/:projectId/members', requireProjectAccess, async (req, res, next) => {
  try {
    const { projectId } = req.params

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Projeto não encontrado',
      })
    }

    let members = await prisma.projectUser.findMany({
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
        { user: { role: 'asc' } },
        { user: { name: 'asc' } },
      ],
    })

    if (req.user?.role === UserRole.MANAGER) {
      members = members.filter((member) =>
        member.user.id === req.user?.userId ||
        member.user.role === UserRole.CONSULTANT ||
        member.user.role === UserRole.CLIENT
      )
    }

    const pendingAssignments = await listPendingProjectMembershipsByProject(prisma, projectId)

    const visiblePendingAssignments = req.user?.role === UserRole.MANAGER
      ? pendingAssignments.filter((assignment: { role: string }) =>
          assignment.role === UserRole.CONSULTANT || assignment.role === UserRole.CLIENT
        )
      : pendingAssignments

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
      pendingAssignments: visiblePendingAssignments,
      count: formattedMembers.length,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/users/available', requireAdminOrManager, async (req, res, next) => {
  try {
    const { projectId } = req.query

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query param projectId é obrigatório',
      })
    }

    const existingMembers = await prisma.projectUser.findMany({
      where: { projectId },
      select: { userId: true },
    })

    const existingUserIds = existingMembers.map((m) => m.userId)

    let availableUsers = await prisma.user.findMany({
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

    if (req.user?.role === UserRole.MANAGER) {
      availableUsers = availableUsers.filter((user) =>
        user.role === UserRole.CONSULTANT || user.role === UserRole.CLIENT
      )
    }

    res.json({
      success: true,
      data: availableUsers,
      count: availableUsers.length,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/projects/:projectId/members', requireAdminOrManager, async (req, res, next) => {
  try {
    const { projectId } = req.params
    const validatedData = addMemberSchema.parse(req.body)

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Projeto não encontrado',
      })
    }

    if (!canAssignRole(req.user!.role, validatedData.role)) {
      return res.status(403).json({
        success: false,
        error: 'Você não pode atribuir este perfil',
      })
    }

    const normalizedEmail = validatedData.email ? normalizeEmail(validatedData.email) : undefined

    const user = validatedData.userId
      ? await prisma.user.findUnique({ where: { id: validatedData.userId } })
      : normalizedEmail
      ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
      : null

    if (user) {
      if (!canManageExistingUser(req.user!.role, req.user?.userId, user)) {
        return res.status(403).json({
          success: false,
          error: 'Você não pode administrar este usuário',
        })
      }

      const existingMember = await prisma.projectUser.findFirst({
        where: {
          projectId,
          userId: user.id,
        },
      })

      if (existingMember) {
        return res.status(409).json({
          success: false,
          error: 'Usuário já é membro deste projeto',
        })
      }

      const updatedMember = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { role: validatedData.role },
        })

        return tx.projectUser.create({
          data: {
            projectId,
            userId: user.id,
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
      })

      return res.status(201).json({
        success: true,
        data: {
          id: updatedMember.id,
          projectId: updatedMember.projectId,
          userId: updatedMember.userId,
          module: updatedMember.module,
          createdAt: updatedMember.createdAt,
          user: updatedMember.user,
        },
        message: `${updatedMember.user.name} adicionado ao projeto com sucesso`,
      })
    }

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email é obrigatório quando o usuário ainda não existe',
      })
    }

    const pendingAssignment = await upsertPendingProjectMembership(prisma, {
        projectId,
        email: normalizedEmail,
        role: validatedData.role,
        module: validatedData.module || null,
        createdBy: req.user?.userId || null,
    })

    return res.status(201).json({
      success: true,
      pendingAssignment,
      message: `E-mail ${normalizedEmail} vinculado ao perfil ${validatedData.role}. O vínculo será aplicado quando o usuário for criado.`,
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

router.patch('/projects/:projectId/members/:userId', requireAdminOrManager, async (req, res, next) => {
  try {
    const { projectId, userId } = req.params
    await getProjectModuleLabel(prisma, projectId)
    const validatedData = updateMemberSchema.parse(req.body)

    const existingMember = await prisma.projectUser.findFirst({
      where: { projectId, userId },
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

    if (!existingMember) {
      return res.status(404).json({
        success: false,
        error: 'Membro não encontrado neste projeto',
      })
    }

    if (!canManageExistingUser(req.user!.role, req.user?.userId, existingMember.user)) {
      return res.status(403).json({
        success: false,
        error: 'Você não pode administrar este usuário',
      })
    }

    if (validatedData.role && !canAssignRole(req.user!.role, validatedData.role)) {
      return res.status(403).json({
        success: false,
        error: 'Você não pode atribuir este perfil',
      })
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (validatedData.role) {
        await tx.user.update({
          where: { id: userId },
          data: { role: validatedData.role },
        })
      }

      return tx.projectUser.update({
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
      message: 'Perfil e associação atualizados com sucesso',
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

router.delete('/projects/:projectId/members/:userId', requireAdminOrManager, async (req, res, next) => {
  try {
    const { projectId, userId } = req.params
    const currentUserId = req.user?.userId

    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        error: 'Você não pode remover a si mesmo do projeto',
      })
    }

    const existingMember = await prisma.projectUser.findFirst({
      where: { projectId, userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    })

    if (!existingMember) {
      return res.status(404).json({
        success: false,
        error: 'Membro não encontrado neste projeto',
      })
    }

    if (!canManageExistingUser(req.user!.role, req.user?.userId, existingMember.user)) {
      return res.status(403).json({
        success: false,
        error: 'Você não pode administrar este usuário',
      })
    }

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
