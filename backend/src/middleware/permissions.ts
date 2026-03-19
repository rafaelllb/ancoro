import { Request, Response, NextFunction } from 'express'
import { prisma } from '../index'
import { UserRole } from '../types'

/**
 * Middleware para verificar se o usuário é ADMIN ou MANAGER
 * Usado para rotas de gerenciamento de membros do projeto
 */
export async function requireAdminOrManager(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuário não autenticado' })
    }

    const role = req.user.role
    if (role !== UserRole.ADMIN && role !== UserRole.MANAGER) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas administradores ou gerentes podem realizar esta ação',
      })
    }

    next()
  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao verificar permissão',
    })
  }
}

/**
 * Verifica se o usuário pode editar um requisito
 *
 * Regras:
 * - CONSULTANT: apenas seus próprios requisitos (consultantId === user.id)
 * - MANAGER/ADMIN: todos os requisitos do projeto
 * - CLIENT: não pode editar
 */
export async function canEditRequirement(
  userId: string,
  userRole: string,
  requirementId: string
): Promise<boolean> {
  // Admin pode tudo
  if (userRole === UserRole.ADMIN) {
    return true
  }

  // Cliente não pode editar
  if (userRole === UserRole.CLIENT) {
    return false
  }

  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { consultantId: true, projectId: true },
  })

  if (!requirement) {
    return false
  }

  // Manager pode editar qualquer requisito do projeto que participa
  if (userRole === UserRole.MANAGER) {
    const isProjectMember = await prisma.projectUser.findFirst({
      where: {
        projectId: requirement.projectId,
        userId: userId,
      },
    })
    return !!isProjectMember
  }

  // Consultor pode editar apenas seus próprios requisitos
  if (userRole === UserRole.CONSULTANT) {
    return requirement.consultantId === userId
  }

  return false
}

/**
 * Verifica se o usuário pode comentar em um requisito
 *
 * Regras:
 * - Qualquer membro do projeto pode comentar
 */
export async function canCommentRequirement(
  userId: string,
  requirementId: string
): Promise<boolean> {
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { projectId: true },
  })

  if (!requirement) {
    return false
  }

  const isProjectMember = await prisma.projectUser.findFirst({
    where: {
      projectId: requirement.projectId,
      userId: userId,
    },
  })

  return !!isProjectMember
}

/**
 * Verifica se o usuário pode ver um requisito
 *
 * Regras:
 * - Qualquer membro do projeto pode ver todos os requisitos (cross-module visibility)
 */
export async function canViewRequirement(
  userId: string,
  requirementId: string
): Promise<boolean> {
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { projectId: true },
  })

  if (!requirement) {
    return false
  }

  const isProjectMember = await prisma.projectUser.findFirst({
    where: {
      projectId: requirement.projectId,
      userId: userId,
    },
  })

  return !!isProjectMember
}

/**
 * Verifica se o usuário pode ver todos os requisitos de um projeto
 */
export async function canViewProject(userId: string, projectId: string): Promise<boolean> {
  const isProjectMember = await prisma.projectUser.findFirst({
    where: {
      projectId: projectId,
      userId: userId,
    },
  })

  return !!isProjectMember
}

/**
 * Middleware para verificar permissão de edição de requisito
 * Usa requirementId da rota (req.params.id)
 */
export async function requireEditPermission(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuário não autenticado' })
    }

    const requirementId = req.params.id
    if (!requirementId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Requirement ID não fornecido' })
    }

    const hasPermission = await canEditRequirement(req.user.userId, req.user.role, requirementId)

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Você não tem permissão para editar este requisito',
      })
    }

    next()
  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao verificar permissão',
    })
  }
}

/**
 * Middleware para verificar permissão de comentar em requisito
 */
export async function requireCommentPermission(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuário não autenticado' })
    }

    const requirementId = req.params.id
    if (!requirementId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Requirement ID não fornecido' })
    }

    const hasPermission = await canCommentRequirement(req.user.userId, requirementId)

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Você não tem permissão para comentar neste requisito',
      })
    }

    next()
  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao verificar permissão',
    })
  }
}

/**
 * Middleware para verificar permissão de visualizar projeto
 */
export async function requireProjectAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuário não autenticado' })
    }

    const projectId = req.params.projectId || req.params.id
    if (!projectId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Project ID não fornecido' })
    }

    const hasPermission = await canViewProject(req.user.userId, projectId)

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Você não tem permissão para acessar este projeto',
      })
    }

    next()
  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao verificar permissão',
    })
  }
}
