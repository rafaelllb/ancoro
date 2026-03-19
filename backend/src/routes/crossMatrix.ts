/**
 * Cross Matrix Routes
 *
 * API REST para matriz de cruzamento
 *
 * @author Rafael Brito
 */

import express from 'express';
import { z } from 'zod';
import {
  regenerateCrossMatrix,
  getCrossMatrix,
  updateCrossMatrixEntry,
} from '../services/crossMatrixService';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess } from '../middleware/permissions';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticate);

/**
 * GET /api/projects/:id/cross-matrix
 * Lista a matriz de cruzamento de um projeto
 * Query params: module (opcional) - filtrar por módulo
 */
router.get(
  '/projects/:id/cross-matrix',
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const { module } = req.query;

      const entries = await getCrossMatrix(
        projectId,
        module as string | undefined
      );

      res.json({
        success: true,
        data: entries,
        count: entries.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/projects/:id/cross-matrix/regenerate
 * Force regeneration da matriz
 * Útil quando dados foram alterados manualmente ou para refresh
 */
router.post(
  '/projects/:id/cross-matrix/regenerate',
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      const result = await regenerateCrossMatrix(projectId);

      // Retornar informações sobre ciclos detectados
      const hasCycles = result.cycles.length > 0;

      res.json({
        success: true,
        data: {
          created: result.created,
          circular: result.circular,
          hasCycles,
          cycles: result.cycles.map((cycle) => ({
            cycle: cycle.cycle,
            affected: Array.from(cycle.affectedReqIds),
          })),
        },
        message: hasCycles
          ? `Matriz regenerada com ${result.created} entries. ⚠️ ${result.cycles.length} dependência(s) circular(es) detectada(s)!`
          : `Matriz regenerada com sucesso. ${result.created} entries criadas.`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/cross-matrix/:id
 * Atualiza campos de validação manual de uma entry
 */
const updateSchema = z.object({
  dataFlow: z.string().optional(),
  integrationType: z
    .enum(['BAPI', 'IDOC', 'FILE', 'API', 'BATCH', 'OTHER'])
    .optional(),
  trigger: z.string().optional(),
  timing: z.enum(['SYNC', 'ASYNC', 'BATCH', 'EVENT', 'REALTIME']).optional(),
  ownerId: z.string().optional(),
  status: z.enum(['PENDING', 'OK', 'CONFLICT', 'CIRCULAR']).optional(),
  manualNotes: z.string().optional(),
});

router.patch('/cross-matrix/:id', async (req, res, next) => {
  try {
    const { id: entryId } = req.params;

    // Validar dados
    const validatedData = updateSchema.parse(req.body);

    // Atualizar entry
    const updated = await updateCrossMatrixEntry(entryId, validatedData);

    res.json({
      success: true,
      data: updated,
      message: 'Entry atualizada com sucesso',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: error.issues,
      });
    }
    next(error);
  }
});

export default router;
