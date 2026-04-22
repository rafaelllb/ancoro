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
import {
  detectAllConflicts,
  detectConflictsByType,
  ConflictType,
} from '../services/conflictDetectionService';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess, requireMatrixAccess, canViewProject } from '../middleware/permissions';
import { hasCapability } from '../utils/roleCapabilities';
import { prisma } from '../index';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticate);

/**
 * GET /api/projects/:id/cross-matrix
 * Lista a matriz de cruzamento de um projeto
 * Query params: module (opcional) - filtrar por módulo
 *
 * Permissões: ADMIN, MANAGER, CONSULTANT podem acessar; CLIENT bloqueado
 */
router.get(
  '/projects/:id/cross-matrix',
  requireProjectAccess,
  requireMatrixAccess,
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
 *
 * Permissões: ADMIN, MANAGER, CONSULTANT podem regenerar; CLIENT bloqueado
 */
router.post(
  '/projects/:id/cross-matrix/regenerate',
  requireProjectAccess,
  requireMatrixAccess,
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

    // Busca a entry para obter o projectId e verificar acesso
    const entry = await prisma.crossMatrixEntry.findUnique({
      where: { id: entryId },
      select: { projectId: true },
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry não encontrada',
      });
    }

    // CLIENT não pode editar a matriz
    if (!hasCapability(req.user!.role, 'canEditMatrix')) {
      return res.status(403).json({
        success: false,
        error: 'Clientes não podem editar a matriz de cruzamento',
      });
    }

    // Verifica se o usuário tem acesso ao projeto
    // CONSULTANT, MANAGER e ADMIN podem editar entries do projeto
    const hasAccess = await canViewProject(
      req.user!.userId,
      req.user!.role,
      entry.projectId
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para editar esta entry',
      });
    }

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

/**
 * GET /api/projects/:id/semantic-conflicts
 * Detecta conflitos semânticos entre requisitos do projeto
 * Query params: type (opcional) - WHO_OVERLAP | WHERE_INCOMPATIBLE | HOWMUCH_CONTRADICTORY
 *
 * Permissões: ADMIN, MANAGER, CONSULTANT podem acessar; CLIENT bloqueado
 */
router.get(
  '/projects/:id/semantic-conflicts',
  requireProjectAccess,
  requireMatrixAccess,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const { type } = req.query;

      if (type) {
        // Validar tipo
        const validTypes: ConflictType[] = ['WHO_OVERLAP', 'WHERE_INCOMPATIBLE', 'HOWMUCH_CONTRADICTORY'];
        if (!validTypes.includes(type as ConflictType)) {
          return res.status(400).json({
            success: false,
            error: `Tipo inválido. Valores aceitos: ${validTypes.join(', ')}`,
          });
        }

        const conflicts = await detectConflictsByType(projectId, type as ConflictType);

        return res.json({
          success: true,
          type,
          count: conflicts.length,
          conflicts,
        });
      }

      // Detecção completa
      const result = await detectAllConflicts(projectId);

      res.json({
        success: true,
        data: result,
        message: result.totalConflicts > 0
          ? `⚠️ ${result.totalConflicts} conflito(s) semântico(s) detectado(s)`
          : '✓ Nenhum conflito semântico detectado',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/projects/:id/validate-pipeline
 * Executa validação completa do pipeline ReqOps:
 * - Dependências circulares
 * - Conflitos semânticos
 * - Requisitos órfãos
 *
 * Permissões: ADMIN, MANAGER, CONSULTANT podem acessar; CLIENT bloqueado
 */
router.post(
  '/projects/:id/validate-pipeline',
  requireProjectAccess,
  requireMatrixAccess,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      // Executa todas as validações em paralelo
      const [matrixResult, conflictsResult] = await Promise.all([
        regenerateCrossMatrix(projectId),
        detectAllConflicts(projectId),
      ]);

      // Calcula resumo
      const hasCircularDeps = matrixResult.cycles.length > 0;
      const hasSemanticConflicts = conflictsResult.totalConflicts > 0;
      const pipelinePassed = !hasCircularDeps && !hasSemanticConflicts;

      res.json({
        success: true,
        pipelinePassed,
        summary: {
          circularDependencies: {
            count: matrixResult.circular,
            cycles: matrixResult.cycles.map((c) => ({
              path: c.cycle.join(' → '),
              affected: Array.from(c.affectedReqIds),
            })),
          },
          semanticConflicts: {
            total: conflictsResult.totalConflicts,
            byType: conflictsResult.conflictsByType,
            bySeverity: conflictsResult.conflictsBySeverity,
            highSeverity: conflictsResult.conflicts.filter((c) => c.severity === 'HIGH'),
          },
          matrixEntries: matrixResult.created,
        },
        message: pipelinePassed
          ? '✓ Pipeline de validação passou! Requisitos prontos para promoção.'
          : `⚠️ Pipeline falhou: ${hasCircularDeps ? 'dependências circulares detectadas' : ''}${hasCircularDeps && hasSemanticConflicts ? ' e ' : ''}${hasSemanticConflicts ? 'conflitos semânticos detectados' : ''}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
