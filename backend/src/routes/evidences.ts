/**
 * Routes: Evidences
 *
 * Rotas para gerenciamento de evidências de implementação (Ancora Method v2).
 *
 * @author Rafael Brito
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import {
  getRequirementEvidences,
  getEvidenceById,
  createEvidence,
  updateEvidence,
  deleteEvidence,
  verifyEvidence,
  unverifyEvidence,
  countEvidences,
  validateStatusChangeToApproved,
  getRequirementsWithoutEvidences,
  EVIDENCE_TYPES,
} from '../services/evidenceService';
import { prisma } from '../index';

const router = Router();

// Schema de validação para criar evidência
const createEvidenceSchema = z.object({
  type: z.enum(EVIDENCE_TYPES as unknown as [string, ...string[]]),
  title: z.string().min(3, 'Título deve ter no mínimo 3 caracteres').max(200),
  description: z.string().max(2000).optional(),
  url: z.string().url('URL inválida').optional().or(z.literal('')),
  fileName: z.string().max(255).optional(),
  filePath: z.string().max(500).optional(),
  reference: z.string().max(100).optional(),
});

// Schema de validação para atualizar evidência
const updateEvidenceSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  url: z.string().url('URL inválida').optional().or(z.literal('')),
  reference: z.string().max(100).optional(),
});

/**
 * GET /api/requirements/:id/evidences
 * Lista evidências de um requisito
 */
router.get(
  '/requirements/:id/evidences',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: requirementId } = req.params;

      // Verifica se requisito existe
      const requirement = await prisma.requirement.findUnique({
        where: { id: requirementId },
        select: { id: true, reqId: true },
      });

      if (!requirement) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Requisito não encontrado',
        });
      }

      const evidences = await getRequirementEvidences(requirementId);
      const counts = await countEvidences(requirementId);

      return res.json({
        requirementId,
        reqId: requirement.reqId,
        ...counts,
        evidences,
      });
    } catch (error) {
      console.error('Erro ao listar evidências:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao listar evidências',
      });
    }
  }
);

/**
 * POST /api/requirements/:id/evidences
 * Cria uma nova evidência
 */
router.post(
  '/requirements/:id/evidences',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: requirementId } = req.params;

      // Validar body
      const validationResult = createEvidenceSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Validation Error',
          message: validationResult.error.issues
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', '),
        });
      }

      const evidence = await createEvidence(
        requirementId,
        req.user!.userId,
        validationResult.data as Parameters<typeof createEvidence>[2]
      );

      return res.status(201).json(evidence);
    } catch (error: unknown) {
      console.error('Erro ao criar evidência:', error);

      if (error instanceof Error && error.message === 'Requisito não encontrado') {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Erro ao criar evidência',
      });
    }
  }
);

/**
 * GET /api/evidences/:id
 * Busca uma evidência específica
 */
router.get(
  '/evidences/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: evidenceId } = req.params;

      const evidence = await getEvidenceById(evidenceId);

      if (!evidence) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Evidência não encontrada',
        });
      }

      return res.json(evidence);
    } catch (error) {
      console.error('Erro ao buscar evidência:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao buscar evidência',
      });
    }
  }
);

/**
 * PUT /api/evidences/:id
 * Atualiza uma evidência
 */
router.put(
  '/evidences/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: evidenceId } = req.params;

      // Validar body
      const validationResult = updateEvidenceSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Validation Error',
          message: validationResult.error.issues
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', '),
        });
      }

      const evidence = await updateEvidence(
        evidenceId,
        req.user!.userId,
        validationResult.data
      );

      return res.json(evidence);
    } catch (error: unknown) {
      console.error('Erro ao atualizar evidência:', error);

      if (error instanceof Error) {
        if (error.message === 'Evidência não encontrada') {
          return res.status(404).json({ error: 'Not Found', message: error.message });
        }
        if (error.message === 'Apenas o criador pode editar a evidência') {
          return res.status(403).json({ error: 'Forbidden', message: error.message });
        }
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao atualizar evidência',
      });
    }
  }
);

/**
 * DELETE /api/evidences/:id
 * Deleta uma evidência
 */
router.delete(
  '/evidences/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: evidenceId } = req.params;

      await deleteEvidence(evidenceId, req.user!.userId, req.user!.role);

      return res.status(204).send();
    } catch (error: unknown) {
      console.error('Erro ao deletar evidência:', error);

      if (error instanceof Error) {
        if (error.message === 'Evidência não encontrada') {
          return res.status(404).json({ error: 'Not Found', message: error.message });
        }
        if (error.message === 'Sem permissão para deletar esta evidência') {
          return res.status(403).json({ error: 'Forbidden', message: error.message });
        }
      }

      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao deletar evidência',
      });
    }
  }
);

/**
 * POST /api/evidences/:id/verify
 * Verifica/aprova uma evidência
 * Requer: MANAGER ou ADMIN
 */
router.post(
  '/evidences/:id/verify',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: evidenceId } = req.params;

      // Apenas MANAGER ou ADMIN podem verificar
      if (!['MANAGER', 'ADMIN'].includes(req.user!.role)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Apenas gerentes e administradores podem verificar evidências',
        });
      }

      const evidence = await verifyEvidence(evidenceId, req.user!.userId);

      return res.json({
        success: true,
        evidence,
        message: 'Evidência verificada com sucesso',
      });
    } catch (error) {
      console.error('Erro ao verificar evidência:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao verificar evidência',
      });
    }
  }
);

/**
 * DELETE /api/evidences/:id/verify
 * Remove verificação de uma evidência
 * Requer: ADMIN
 */
router.delete(
  '/evidences/:id/verify',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: evidenceId } = req.params;

      // Apenas ADMIN pode remover verificação
      if (req.user!.role !== 'ADMIN') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Apenas administradores podem remover verificação de evidências',
        });
      }

      const evidence = await unverifyEvidence(evidenceId);

      return res.json({
        success: true,
        evidence,
        message: 'Verificação removida',
      });
    } catch (error) {
      console.error('Erro ao remover verificação:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao remover verificação',
      });
    }
  }
);

/**
 * GET /api/requirements/:id/can-approve
 * Verifica se requisito pode ser aprovado (tem evidências)
 */
router.get(
  '/requirements/:id/can-approve',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id: requirementId } = req.params;

      const result = await validateStatusChangeToApproved(requirementId);

      return res.json(result);
    } catch (error) {
      console.error('Erro ao validar aprovação:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao validar aprovação',
      });
    }
  }
);

/**
 * GET /api/projects/:projectId/requirements-without-evidences
 * Lista requisitos sem evidências (para dashboard)
 */
router.get(
  '/projects/:projectId/requirements-without-evidences',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      const requirements = await getRequirementsWithoutEvidences(projectId);

      return res.json({
        projectId,
        count: requirements.length,
        requirements,
      });
    } catch (error) {
      console.error('Erro ao listar requisitos sem evidências:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Erro ao listar requisitos sem evidências',
      });
    }
  }
);

export default router;
