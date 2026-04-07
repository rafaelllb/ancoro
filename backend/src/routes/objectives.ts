/**
 * Routes: Project Objectives
 *
 * Rotas para gerenciamento de objetivos de projeto (Ancora Method v2).
 * Implementa CRUD e validação de requisitos órfãos.
 *
 * @author Rafael Brito
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess } from '../middleware/permissions';
import {
  getProjectObjectives,
  getObjectiveById,
  createObjective,
  updateObjective,
  deleteObjective,
  validateAllRequirements,
  getOrphanRequirements,
  countOrphanRequirements,
} from '../services/objectiveService';
import { z } from 'zod';

const router = Router();

// Schema de validação para criar objetivo
const createObjectiveSchema = z.object({
  code: z
    .string()
    .min(2, 'Código deve ter no mínimo 2 caracteres')
    .max(20, 'Código deve ter no máximo 20 caracteres')
    .regex(/^[A-Z0-9_-]+$/i, 'Código deve conter apenas letras, números, _ e -'),
  title: z
    .string()
    .min(5, 'Título deve ter no mínimo 5 caracteres')
    .max(200, 'Título deve ter no máximo 200 caracteres'),
  description: z.string().max(2000).optional(),
  activatePhase: z.enum(['DISCOVER', 'EXPLORE', 'REALIZE', 'DEPLOY', 'RUN']).optional(),
  keywords: z.array(z.string().min(2).max(50)).max(20).optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

// Schema de validação para atualizar objetivo
const updateObjectiveSchema = createObjectiveSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/**
 * GET /api/projects/:projectId/objectives
 * Lista objetivos de um projeto
 *
 * Query params:
 * - includeInactive: boolean (opcional, default: false)
 */
router.get(
  '/projects/:projectId/objectives',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const includeInactive = req.query.includeInactive === 'true';

      const objectives = await getProjectObjectives(projectId, includeInactive);

      return res.json({
        projectId,
        objectives,
        count: objectives.length,
      });
    } catch (error) {
      console.error('Erro ao listar objetivos:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao listar objetivos do projeto',
      });
    }
  }
);

/**
 * GET /api/projects/:projectId/objectives/:objectiveId
 * Busca um objetivo específico
 */
router.get(
  '/projects/:projectId/objectives/:objectiveId',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { objectiveId } = req.params;

      const objective = await getObjectiveById(objectiveId);

      if (!objective) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Objetivo não encontrado',
        });
      }

      return res.json(objective);
    } catch (error) {
      console.error('Erro ao buscar objetivo:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao buscar objetivo',
      });
    }
  }
);

/**
 * POST /api/projects/:projectId/objectives
 * Cria um novo objetivo
 *
 * Requer: ADMIN ou MANAGER
 */
router.post(
  '/projects/:projectId/objectives',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      // Apenas ADMIN ou MANAGER podem criar objetivos
      if (!['ADMIN', 'MANAGER'].includes(req.user!.role)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Apenas administradores e gerentes podem criar objetivos',
        });
      }

      // Validar body
      const validationResult = createObjectiveSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Validation Error',
          message: validationResult.error.issues
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', '),
        });
      }

      const objective = await createObjective(projectId, validationResult.data);

      return res.status(201).json(objective);
    } catch (error: unknown) {
      console.error('Erro ao criar objetivo:', error);

      // Erro de código duplicado
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Já existe um objetivo com este código no projeto',
        });
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao criar objetivo',
      });
    }
  }
);

/**
 * PUT /api/projects/:projectId/objectives/:objectiveId
 * Atualiza um objetivo existente
 *
 * Requer: ADMIN ou MANAGER
 */
router.put(
  '/projects/:projectId/objectives/:objectiveId',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { objectiveId } = req.params;

      // Apenas ADMIN ou MANAGER podem atualizar objetivos
      if (!['ADMIN', 'MANAGER'].includes(req.user!.role)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Apenas administradores e gerentes podem atualizar objetivos',
        });
      }

      // Validar body
      const validationResult = updateObjectiveSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Validation Error',
          message: validationResult.error.issues
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', '),
        });
      }

      const objective = await updateObjective(objectiveId, validationResult.data);

      return res.json(objective);
    } catch (error: unknown) {
      console.error('Erro ao atualizar objetivo:', error);

      if (error instanceof Error && error.message.includes('Record to update not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Objetivo não encontrado',
        });
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao atualizar objetivo',
      });
    }
  }
);

/**
 * DELETE /api/projects/:projectId/objectives/:objectiveId
 * Remove um objetivo (soft delete)
 *
 * Requer: ADMIN
 */
router.delete(
  '/projects/:projectId/objectives/:objectiveId',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { objectiveId } = req.params;

      // Apenas ADMIN pode deletar objetivos
      if (req.user!.role !== 'ADMIN') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Apenas administradores podem remover objetivos',
        });
      }

      await deleteObjective(objectiveId);

      return res.status(204).send();
    } catch (error) {
      console.error('Erro ao deletar objetivo:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao remover objetivo',
      });
    }
  }
);

/**
 * POST /api/projects/:projectId/objectives/validate-requirements
 * Valida todos os requisitos do projeto contra os objetivos
 * Atualiza flags isOrphan de cada requisito
 *
 * Requer: ADMIN ou MANAGER
 *
 * Query params:
 * - threshold: number (opcional, default: 0.15 = 15% de match)
 */
router.post(
  '/projects/:projectId/objectives/validate-requirements',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      // Apenas ADMIN ou MANAGER podem rodar validação
      if (!['ADMIN', 'MANAGER'].includes(req.user!.role)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Apenas administradores e gerentes podem validar requisitos',
        });
      }

      const threshold = req.query.threshold
        ? parseFloat(req.query.threshold as string)
        : 0.15;

      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Threshold deve ser um número entre 0 e 1',
        });
      }

      const results = await validateAllRequirements(projectId, threshold);

      const orphanCount = results.filter((r) => r.isOrphan).length;
      const linkedCount = results.length - orphanCount;

      return res.json({
        projectId,
        threshold,
        totalRequirements: results.length,
        orphanCount,
        linkedCount,
        orphanRate: results.length > 0 ? orphanCount / results.length : 0,
        results,
      });
    } catch (error) {
      console.error('Erro ao validar requisitos:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao validar requisitos contra objetivos',
      });
    }
  }
);

/**
 * GET /api/projects/:projectId/orphan-requirements
 * Lista requisitos órfãos do projeto
 */
router.get(
  '/projects/:projectId/orphan-requirements',
  authenticate,
  requireProjectAccess,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      const orphans = await getOrphanRequirements(projectId);
      const count = await countOrphanRequirements(projectId);

      return res.json({
        projectId,
        count,
        requirements: orphans,
      });
    } catch (error) {
      console.error('Erro ao listar requisitos órfãos:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao listar requisitos órfãos',
      });
    }
  }
);

export default router;
