/**
 * Metrics Routes
 *
 * API REST para métricas e KPIs do projeto.
 * Alimenta o dashboard de métricas do frontend.
 *
 * @author Rafael Brito
 */

import express from 'express';
import { z } from 'zod';
import {
  getProjectMetrics,
  getConsultantsPendencies,
  getProgressTimeline,
  getIntegrationHeatmap,
  getCommentStats,
  getLeadTimeDetails,
  getRejectedRequirements,
  getRefinementIterations,
} from '../services/metricsService';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess, requireAdminOrManager } from '../middleware/permissions';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticate);

/**
 * GET /api/projects/:id/metrics
 * Retorna métricas gerais do projeto (KPIs principais)
 */
router.get(
  '/projects/:id/metrics',
  requireProjectAccess,
  requireAdminOrManager,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      const metrics = await getProjectMetrics(projectId);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:id/metrics/consultants
 * Retorna lista de consultores com pendências
 * Útil para identificar gargalos e responsáveis
 */
router.get(
  '/projects/:id/metrics/consultants',
  requireProjectAccess,
  requireAdminOrManager,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      const consultants = await getConsultantsPendencies(projectId);

      res.json({
        success: true,
        data: consultants,
        count: consultants.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Schema de validação para query params de timeline
const timelineQuerySchema = z.object({
  weeks: z.coerce.number().min(1).max(52).default(12),
});

/**
 * GET /api/projects/:id/metrics/timeline
 * Retorna dados de progressão temporal (para line chart)
 *
 * Query params:
 *   - weeks: número de semanas para trás (default: 12)
 */
router.get(
  '/projects/:id/metrics/timeline',
  requireProjectAccess,
  requireAdminOrManager,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const { weeks } = timelineQuerySchema.parse(req.query);

      const timeline = await getProgressTimeline(projectId, weeks);

      res.json({
        success: true,
        data: timeline,
        count: timeline.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos',
          details: error.issues,
        });
      }
      next(error);
    }
  }
);

/**
 * GET /api/projects/:id/metrics/heatmap
 * Retorna matriz de integrações módulo × módulo (para heatmap)
 */
router.get(
  '/projects/:id/metrics/heatmap',
  requireProjectAccess,
  requireAdminOrManager,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      const heatmap = await getIntegrationHeatmap(projectId);

      // Também retorna lista de módulos únicos para facilitar renderização
      const modules = new Set<string>();
      heatmap.forEach((cell) => {
        modules.add(cell.fromModule);
        modules.add(cell.toModule);
      });

      res.json({
        success: true,
        data: {
          cells: heatmap,
          modules: Array.from(modules).sort(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:id/metrics/comments
 * Retorna estatísticas de comentários por tipo
 */
router.get(
  '/projects/:id/metrics/comments',
  requireProjectAccess,
  requireAdminOrManager,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      const stats = await getCommentStats(projectId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:id/metrics/lead-time
 * Retorna detalhes de lead time por requisito (ReqOps)
 */
router.get(
  '/projects/:id/metrics/lead-time',
  requireProjectAccess,
  requireAdminOrManager,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      const leadTimes = await getLeadTimeDetails(projectId);

      // Calcula estatísticas
      const approved = leadTimes.filter((r) => r.leadTimeDays !== null);
      const avgDays = approved.length > 0
        ? Math.round((approved.reduce((sum, r) => sum + (r.leadTimeDays || 0), 0) / approved.length) * 10) / 10
        : null;
      const minDays = approved.length > 0
        ? Math.min(...approved.map((r) => r.leadTimeDays || Infinity))
        : null;
      const maxDays = approved.length > 0
        ? Math.max(...approved.map((r) => r.leadTimeDays || 0))
        : null;

      res.json({
        success: true,
        summary: {
          totalRequirements: leadTimes.length,
          approvedCount: approved.length,
          avgLeadTimeDays: avgDays,
          minLeadTimeDays: minDays,
          maxLeadTimeDays: maxDays,
        },
        data: leadTimes,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:id/metrics/rejections
 * Retorna requisitos que foram rejeitados no pipeline (ReqOps)
 */
router.get(
  '/projects/:id/metrics/rejections',
  requireProjectAccess,
  requireAdminOrManager,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      const rejections = await getRejectedRequirements(projectId);

      res.json({
        success: true,
        summary: {
          totalRejected: rejections.length,
          totalRejectionEvents: rejections.reduce((sum, r) => sum + r.rejectionCount, 0),
        },
        data: rejections,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:id/metrics/refinements
 * Retorna iterações de refinamento por requisito (ReqOps)
 */
router.get(
  '/projects/:id/metrics/refinements',
  requireProjectAccess,
  requireAdminOrManager,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      const refinements = await getRefinementIterations(projectId);

      // Calcula estatísticas
      const totalIterations = refinements.reduce((sum, r) => sum + r.iterations, 0);
      const avgIterations = refinements.length > 0
        ? Math.round((totalIterations / refinements.length) * 10) / 10
        : 0;

      res.json({
        success: true,
        summary: {
          requirementsWithRefinements: refinements.length,
          totalIterations,
          avgIterations,
          maxIterations: refinements.length > 0 ? refinements[0].iterations : 0,
        },
        data: refinements,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
