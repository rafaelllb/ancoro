/**
 * ChangeLog Routes
 * API para visualizar histórico de mudanças e fazer rollback
 *
 * Endpoints:
 * - GET /api/requirements/:id/changes - Lista histórico de mudanças
 * - POST /api/requirements/:id/rollback/:changeId - Reverte uma mudança (admin only)
 * - GET /api/projects/:projectId/changes - Lista mudanças do projeto (timeline geral)
 */

import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { UserRole } from '../types'
import { getRequirementChanges, rollbackChange } from '../middleware/changelog'

const router = Router()

/**
 * GET /api/requirements/:id/changes
 * Lista histórico de mudanças de um requisito
 *
 * Query params:
 * - field: filtrar por campo específico
 * - userId: filtrar por usuário
 * - startDate: data inicial (ISO string)
 * - endDate: data final (ISO string)
 * - limit: máximo de resultados (default 50)
 * - offset: paginação
 */
router.get(
  '/requirements/:id/changes',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const requirementId = req.params.id
      const { field, userId, startDate, endDate, limit, offset } = req.query

      // Verifica se o requisito existe
      const requirement = await prisma.requirement.findUnique({
        where: { id: requirementId },
        select: { id: true, projectId: true },
      })

      if (!requirement) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Requisito não encontrado',
        })
      }

      // Verifica acesso ao projeto
      const hasAccess = await prisma.projectUser.findFirst({
        where: {
          projectId: requirement.projectId,
          userId: req.user!.userId,
        },
      })

      if (!hasAccess && req.user!.role !== UserRole.ADMIN) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Você não tem acesso a este requisito',
        })
      }

      const result = await getRequirementChanges(prisma, requirementId, {
        field: field as string | undefined,
        userId: userId as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      })

      return res.json({
        changes: result.changes,
        total: result.total,
        pagination: {
          limit: limit ? parseInt(limit as string, 10) : 50,
          offset: offset ? parseInt(offset as string, 10) : 0,
          hasMore: result.total > (offset ? parseInt(offset as string, 10) : 0) + result.changes.length,
        },
      })
    } catch (error) {
      console.error('Error fetching changes:', error)
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao buscar histórico',
      })
    }
  }
)

/**
 * POST /api/requirements/:id/rollback/:changeId
 * Reverte uma mudança específica
 *
 * Apenas ADMIN pode fazer rollback
 */
router.post(
  '/requirements/:id/rollback/:changeId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: requirementId, changeId } = req.params

      // Apenas ADMIN pode fazer rollback
      if (req.user!.role !== UserRole.ADMIN) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Apenas administradores podem reverter mudanças',
        })
      }

      // Verifica se o requisito existe
      const requirement = await prisma.requirement.findUnique({
        where: { id: requirementId },
      })

      if (!requirement) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Requisito não encontrado',
        })
      }

      // Verifica se a mudança existe e pertence ao requisito
      const change = await prisma.changeLog.findUnique({
        where: { id: changeId },
      })

      if (!change || change.requirementId !== requirementId) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Mudança não encontrada',
        })
      }

      // Executa rollback
      const updated = await rollbackChange(prisma, changeId, {
        userId: req.user!.userId,
      })

      return res.json({
        message: 'Rollback realizado com sucesso',
        requirement: updated,
        rolledBack: {
          field: change.field,
          from: change.newValue,
          to: change.oldValue,
        },
      })
    } catch (error) {
      console.error('Error rolling back change:', error)

      // Erros específicos do rollback
      if (error instanceof Error) {
        if (error.message === 'Change not found') {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Mudança não encontrada',
          })
        }
        if (error.message.includes('Cannot rollback')) {
          return res.status(400).json({
            error: 'Bad Request',
            message: error.message,
          })
        }
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao reverter mudança',
      })
    }
  }
)

/**
 * GET /api/projects/:projectId/changes
 * Lista todas as mudanças de um projeto (timeline geral)
 *
 * Query params:
 * - limit: máximo de resultados (default 100)
 * - offset: paginação
 * - changeType: filtrar por tipo (CREATE | UPDATE | DELETE | STATUS_CHANGE | COMMENT_ADDED)
 */
router.get(
  '/projects/:projectId/changes',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params
      const { limit, offset, changeType } = req.query

      // Verifica acesso ao projeto
      const hasAccess = await prisma.projectUser.findFirst({
        where: {
          projectId,
          userId: req.user!.userId,
        },
      })

      if (!hasAccess && req.user!.role !== UserRole.ADMIN) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Você não tem acesso a este projeto',
        })
      }

      // Busca mudanças de todos os requisitos do projeto
      const where: any = {
        requirement: {
          projectId,
        },
      }

      if (changeType) {
        where.changeType = changeType
      }

      const [changes, total] = await Promise.all([
        prisma.changeLog.findMany({
          where,
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            requirement: {
              select: { id: true, reqId: true, shortDesc: true, module: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit ? parseInt(limit as string, 10) : 100,
          skip: offset ? parseInt(offset as string, 10) : 0,
        }),
        prisma.changeLog.count({ where }),
      ])

      return res.json({
        changes,
        total,
        pagination: {
          limit: limit ? parseInt(limit as string, 10) : 100,
          offset: offset ? parseInt(offset as string, 10) : 0,
          hasMore: total > (offset ? parseInt(offset as string, 10) : 0) + changes.length,
        },
      })
    } catch (error) {
      console.error('Error fetching project changes:', error)
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao buscar histórico do projeto',
      })
    }
  }
)

/**
 * GET /api/changes/:id
 * Busca detalhes de uma mudança específica
 */
router.get(
  '/changes/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params

      const change = await prisma.changeLog.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          requirement: {
            select: { id: true, reqId: true, shortDesc: true, module: true, projectId: true },
          },
        },
      })

      if (!change) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Mudança não encontrada',
        })
      }

      // Verifica acesso ao projeto
      const hasAccess = await prisma.projectUser.findFirst({
        where: {
          projectId: change.requirement.projectId,
          userId: req.user!.userId,
        },
      })

      if (!hasAccess && req.user!.role !== UserRole.ADMIN) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Você não tem acesso a esta mudança',
        })
      }

      return res.json(change)
    } catch (error) {
      console.error('Error fetching change:', error)
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao buscar mudança',
      })
    }
  }
)

export default router
