import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireCommentPermission, canCommentRequirement } from '../middleware/permissions'
import { createCommentSchema, validate } from '../schemas'
import { UserRole } from '../types'
import { emitNewComment } from '../services/notificationService'

const router = Router()

/**
 * GET /api/requirements/:id/comments
 * Lista todos os comentários de um requisito
 *
 * Regras de acesso:
 * - Qualquer membro do projeto pode ver os comentários
 */
router.get(
  '/requirements/:id/comments',
  authenticate,
  requireCommentPermission, // Reutiliza a verificação de membro do projeto
  async (req: Request, res: Response) => {
    try {
      const requirementId = req.params.id

      const comments = await prisma.comment.findMany({
        where: { requirementId },
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
        orderBy: { createdAt: 'asc' }, // Thread cronológica (mais antigos primeiro)
      })

      return res.json(comments)
    } catch (error) {
      console.error('Error fetching comments:', error)
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao buscar comentários',
      })
    }
  }
)

/**
 * POST /api/requirements/:id/comments
 * Cria um novo comentário em um requisito
 *
 * Body: { content: string, type: 'QUESTION' | 'ANSWER' | 'OBSERVATION' | 'CONFLICT' }
 *
 * Regras:
 * - User deve ser membro do projeto
 * - Content não pode ser vazio
 * - Type deve ser um dos valores permitidos
 */
router.post(
  '/requirements/:id/comments',
  authenticate,
  requireCommentPermission,
  async (req: Request, res: Response) => {
    try {
      const requirementId = req.params.id
      const userId = req.user!.userId

      // Valida o body com Zod
      const data = validate(createCommentSchema, req.body)

      // Verifica se o requisito existe
      const requirement = await prisma.requirement.findUnique({
        where: { id: requirementId },
        select: { id: true, projectId: true, reqId: true },
      })

      if (!requirement) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Requisito não encontrado',
        })
      }

      // Cria o comentário
      const comment = await prisma.comment.create({
        data: {
          requirementId,
          userId,
          content: data.content,
          type: data.type,
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

      // Registra no changelog que um comentário foi adicionado
      await prisma.changeLog.create({
        data: {
          requirementId,
          userId,
          field: 'comments',
          oldValue: null,
          newValue: `[${data.type}] ${data.content.substring(0, 100)}...`,
          changeType: 'COMMENT_ADDED',
        },
      })

      // Emite notificação real-time para membros do projeto
      const userName = comment.user.name || req.user?.email?.split('@')[0] || 'Usuário'
      emitNewComment(
        requirement.projectId,
        requirement.reqId,
        requirementId,
        data.type,
        userId,
        userName
      )

      return res.status(201).json(comment)
    } catch (error) {
      console.error('Error creating comment:', error)

      // Erro de validação Zod
      if (error instanceof Error && error.message.startsWith('Validation failed:')) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message,
        })
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao criar comentário',
      })
    }
  }
)

/**
 * DELETE /api/comments/:id
 * Deleta um comentário
 *
 * Regras:
 * - Autor do comentário pode deletar
 * - Admin pode deletar qualquer comentário
 * - Manager pode deletar comentários do seu projeto
 */
router.delete(
  '/comments/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const commentId = req.params.id
      const userId = req.user!.userId
      const userRole = req.user!.role

      // Busca o comentário com info do requisito/projeto
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: {
          requirement: {
            select: { projectId: true },
          },
        },
      })

      if (!comment) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Comentário não encontrado',
        })
      }

      // Verifica permissão de deleção
      let canDelete = false

      // Admin pode tudo
      if (userRole === UserRole.ADMIN) {
        canDelete = true
      }
      // Autor pode deletar seu próprio comentário
      else if (comment.userId === userId) {
        canDelete = true
      }
      // Manager pode deletar se for membro do projeto
      else if (userRole === UserRole.MANAGER) {
        const isProjectMember = await prisma.projectUser.findFirst({
          where: {
            projectId: comment.requirement.projectId,
            userId: userId,
          },
        })
        canDelete = !!isProjectMember
      }

      if (!canDelete) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Você não tem permissão para deletar este comentário',
        })
      }

      // Deleta o comentário
      await prisma.comment.delete({
        where: { id: commentId },
      })

      return res.json({ message: 'Comentário deletado com sucesso' })
    } catch (error) {
      console.error('Error deleting comment:', error)
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao deletar comentário',
      })
    }
  }
)

/**
 * GET /api/requirements/:id/comments/count
 * Retorna apenas o count de comentários (útil para badge na grid)
 */
router.get(
  '/requirements/:id/comments/count',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const requirementId = req.params.id

      // Verifica se o usuário tem acesso ao requisito
      const hasAccess = await canCommentRequirement(req.user!.userId, requirementId)
      if (!hasAccess) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Você não tem acesso a este requisito',
        })
      }

      const count = await prisma.comment.count({
        where: { requirementId },
      })

      // Também retorna counts por tipo para métricas rápidas
      const byType = await prisma.comment.groupBy({
        by: ['type'],
        where: { requirementId },
        _count: { type: true },
      })

      const typeCounts = byType.reduce(
        (acc, item) => {
          acc[item.type] = item._count.type
          return acc
        },
        {} as Record<string, number>
      )

      return res.json({
        total: count,
        byType: typeCounts,
      })
    } catch (error) {
      console.error('Error counting comments:', error)
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao contar comentários',
      })
    }
  }
)

export default router
