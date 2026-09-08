import { Request, Response, NextFunction } from 'express'
import { prisma } from '../index'
import { UserRole } from '../types'
import { hasCapability } from '../utils/roleCapabilities'

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
 * Regras atualizadas:
 * - ADMIN: qualquer requisito
 * - MANAGER: qualquer requisito do projeto que participa
 * - CONSULTANT: apenas requisitos em que é o responsável consultor
 * - CLIENT: pode editar (campo responsibleBusiness sempre; outros campos apenas se não houver responsável)
 *
 * Nota: A validação de campos específicos é feita na rota, este middleware apenas
 * verifica se o usuário pode potencialmente editar algo no requisito.
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

  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { responsibleConsultantId: true, projectId: true },
  })

  if (!requirement) {
    return false
  }

  // Verifica se é membro do projeto
  const isProjectMember = await prisma.projectUser.findFirst({
    where: {
      projectId: requirement.projectId,
      userId: userId,
    },
  })

  if (!isProjectMember) {
    return false
  }

  // MANAGER pode editar qualquer requisito do projeto
  if (userRole === UserRole.MANAGER) {
    return true
  }

  // CLIENT pode acessar a rota de edição (validação de campos é feita na rota)
  // Permite editar responsibleBusiness sempre; outros campos apenas se não houver responsável
  if (userRole === UserRole.CLIENT) {
    return true
  }

  // CONSULTANT pode editar apenas requisitos em que é o responsável
  if (userRole === UserRole.CONSULTANT) {
    return requirement.responsibleConsultantId === userId
  }

  return false
}

/**
 * Verifica se o usuário pode excluir um requisito
 *
 * Regras conforme ANALISE_PERMISSOES_POR_ROLE.md:
 * - ADMIN: qualquer requisito
 * - CONSULTANT: apenas requisitos em que é o responsável consultor
 * - MANAGER: NÃO pode excluir
 * - CLIENT: NÃO pode excluir
 */
export async function canDeleteRequirement(
  userId: string,
  userRole: string,
  requirementId: string
): Promise<boolean> {
  // Admin pode excluir qualquer requisito
  if (userRole === UserRole.ADMIN) {
    return true
  }

  // Manager e Client NÃO podem excluir
  if (userRole === UserRole.MANAGER || userRole === UserRole.CLIENT) {
    return false
  }

  // Consultant pode excluir apenas seus próprios requisitos
  if (userRole === UserRole.CONSULTANT) {
    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { responsibleConsultantId: true, projectId: true },
    })

    if (!requirement) {
      return false
    }

    // Verifica se é membro do projeto
    const isProjectMember = await prisma.projectUser.findFirst({
      where: {
        projectId: requirement.projectId,
        userId: userId,
      },
    })

    if (!isProjectMember) {
      return false
    }

    return requirement.responsibleConsultantId === userId
  }

  return false
}

/**
 * Verifica se o usuário pode comentar em um requisito
 *
 * Regras:
 * - ADMIN: acesso global a qualquer requisito
 * - Outros: qualquer membro do projeto pode comentar
 */
export async function canCommentRequirement(
  userId: string,
  userRole: string,
  requirementId: string
): Promise<boolean> {
  // ADMIN tem acesso global
  if (userRole === UserRole.ADMIN) {
    return true
  }

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
 * - ADMIN: acesso global a qualquer requisito
 * - Outros: qualquer membro do projeto pode ver todos os requisitos (cross-module visibility)
 */
export async function canViewRequirement(
  userId: string,
  userRole: string,
  requirementId: string
): Promise<boolean> {
  // ADMIN tem acesso global
  if (userRole === UserRole.ADMIN) {
    return true
  }

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
 *
 * Regras:
 * - ADMIN: acesso global a qualquer projeto
 * - Outros: apenas se for membro do projeto
 */
export async function canViewProject(userId: string, userRole: string, projectId: string): Promise<boolean> {
  // ADMIN tem acesso global
  if (userRole === UserRole.ADMIN) {
    return true
  }

  const isProjectMember = await prisma.projectUser.findFirst({
    where: {
      projectId: projectId,
      userId: userId,
    },
  })

  return !!isProjectMember
}

/**
 * Verifica se o usuário pode editar o campo "Responsável Negócio"
 *
 * Regras:
 * - ADMIN, MANAGER, CLIENT: sempre podem editar
 * - CONSULTANT: apenas se for o responsável do requisito
 */
export async function canEditResponsibleBusiness(
  userId: string,
  userRole: string,
  requirementId: string
): Promise<boolean> {
  // Admin, Manager e Client podem editar qualquer responsável negócio
  if (userRole === UserRole.ADMIN || userRole === UserRole.MANAGER || userRole === UserRole.CLIENT) {
    return true
  }

  // Consultant só pode editar se for o responsável do requisito
  if (userRole === UserRole.CONSULTANT) {
    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { responsibleConsultantId: true, projectId: true },
    })

    if (!requirement) return false

    // Verifica se é membro do projeto
    const isProjectMember = await prisma.projectUser.findFirst({
      where: {
        projectId: requirement.projectId,
        userId: userId,
      },
    })

    if (!isProjectMember) return false

    return requirement.responsibleConsultantId === userId
  }

  return false
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
 * Verifica se o usuário pode criar/remover uma conexão entre dois requisitos.
 *
 * Uma conexão altera SEMPRE os dois lados (from.providesFor + to.dependsOn), que podem
 * pertencer a consultores diferentes. Regra de negócio (decisão Rafael Brito):
 * - ADMIN: qualquer conexão
 * - MANAGER: qualquer conexão do projeto que participa
 * - CONSULTANT: basta ser responsável por UM dos lados (from OU to)
 * - CLIENT: não pode editar conexões (não é "dono" de requisito)
 *
 * Ambos os requisitos devem pertencer ao mesmo projeto e o usuário deve ser membro dele.
 */
export async function canEditConnection(
  userId: string,
  userRole: string,
  fromRequirementId: string,
  toRequirementId: string
): Promise<boolean> {
  const [from, to] = await Promise.all([
    prisma.requirement.findUnique({
      where: { id: fromRequirementId },
      select: { responsibleConsultantId: true, projectId: true },
    }),
    prisma.requirement.findUnique({
      where: { id: toRequirementId },
      select: { responsibleConsultantId: true, projectId: true },
    }),
  ])

  if (!from || !to) {
    return false
  }

  // Conexão só faz sentido dentro do mesmo projeto
  if (from.projectId !== to.projectId) {
    return false
  }

  // Admin tem acesso global
  if (userRole === UserRole.ADMIN) {
    return true
  }

  // Demais roles precisam ser membros do projeto
  const isProjectMember = await prisma.projectUser.findFirst({
    where: { projectId: from.projectId, userId },
  })

  if (!isProjectMember) {
    return false
  }

  // MANAGER edita qualquer conexão do projeto
  if (userRole === UserRole.MANAGER) {
    return true
  }

  // CONSULTANT: dono de ao menos um dos lados
  if (userRole === UserRole.CONSULTANT) {
    return (
      from.responsibleConsultantId === userId ||
      to.responsibleConsultantId === userId
    )
  }

  // CLIENT e demais: não podem editar conexões
  return false
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

    const hasPermission = await canCommentRequirement(req.user.userId, req.user.role, requirementId)

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

    // ADMIN tem acesso global a todos os projetos
    if (req.user.role === UserRole.ADMIN) {
      return next()
    }

    const projectId = req.params.projectId || req.params.id
    if (!projectId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Project ID não fornecido' })
    }

    const hasPermission = await canViewProject(req.user.userId, req.user.role, projectId)

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

/**
 * Middleware para verificar permissão de exclusão de requisito
 * Usa requirementId da rota (req.params.id)
 */
export async function requireDeletePermission(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuário não autenticado' })
    }

    const requirementId = req.params.id
    if (!requirementId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Requirement ID não fornecido' })
    }

    const hasPermission = await canDeleteRequirement(req.user.userId, req.user.role, requirementId)

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Você não tem permissão para excluir este requisito',
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
 * Middleware para verificar acesso à matriz de cruzamento
 * Bloqueia CLIENT de acessar a matriz
 */
export async function requireMatrixAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuário não autenticado' })
    }

    // CLIENT não pode acessar a matriz
    if (!hasCapability(req.user.role, 'canViewMatrix')) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Clientes não podem acessar a matriz de cruzamento',
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
 * Middleware para verificar acesso às métricas
 * Permite ADMIN, MANAGER e CONSULTANT; bloqueia CLIENT
 */
export async function requireMetricsAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuário não autenticado' })
    }

    // Apenas quem tem capacidade canViewMetrics pode acessar
    if (!hasCapability(req.user.role, 'canViewMetrics')) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Você não tem permissão para visualizar métricas',
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
 * Middleware para verificar se usuário pode configurar padrão de ID
 * Apenas ADMIN
 */
export async function requireIdPatternAccess(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuário não autenticado' })
    }

    if (!hasCapability(req.user.role, 'canConfigureIdPattern')) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Apenas administradores podem alterar o padrão de ID',
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
