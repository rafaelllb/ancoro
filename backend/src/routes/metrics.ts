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
} from '../services/metricsService';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess } from '../middleware/permissions';

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

export default router;
