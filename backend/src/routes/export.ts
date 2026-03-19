/**
 * Export Routes
 *
 * API REST para exportação de documentos BPD
 * Suporta formatos: Markdown (.md) e Word (.docx)
 *
 * @author Rafael Brito
 */

import express from 'express';
import { z } from 'zod';
import {
  generateBPDMarkdown,
  generateBPDDocx,
  validateExportReadiness,
} from '../services/bpdGenerator';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess } from '../middleware/permissions';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticate);

// Schema de validação para query params
const exportQuerySchema = z.object({
  module: z.string().optional(),
  format: z.enum(['md', 'docx']).default('md'),
});

/**
 * GET /api/projects/:id/export/bpd
 * Exporta BPD (Business Process Design) do projeto
 *
 * Query params:
 *   - module: (opcional) Filtrar por módulo SAP (ISU, CRM, FICA, etc.)
 *   - format: 'md' | 'docx' (default: 'md')
 *
 * Response:
 *   - md: text/markdown com o conteúdo
 *   - docx: application/vnd.openxmlformats... com download do arquivo
 */
router.get(
  '/projects/:id/export/bpd',
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;

      // Validar query params
      const query = exportQuerySchema.parse(req.query);
      const { module: moduleFilter, format } = query;

      if (format === 'md') {
        // Gera Markdown
        const markdown = await generateBPDMarkdown(projectId, moduleFilter);

        // Define nome do arquivo
        const timestamp = new Date().toISOString().split('T')[0];
        const moduleSuffix = moduleFilter ? `_${moduleFilter}` : '';
        const filename = `BPD${moduleSuffix}_${timestamp}.md`;

        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(markdown);
      } else {
        // Gera Word (.docx)
        const buffer = await generateBPDDocx(projectId, moduleFilter);

        // Define nome do arquivo
        const timestamp = new Date().toISOString().split('T')[0];
        const moduleSuffix = moduleFilter ? `_${moduleFilter}` : '';
        const filename = `BPD${moduleSuffix}_${timestamp}.docx`;

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:id/export/bpd/preview
 * Preview do BPD em formato Markdown (para exibir no frontend)
 *
 * Query params:
 *   - module: (opcional) Filtrar por módulo SAP
 *
 * Response: JSON com o markdown
 */
router.get(
  '/projects/:id/export/bpd/preview',
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const moduleFilter = req.query.module as string | undefined;

      const markdown = await generateBPDMarkdown(projectId, moduleFilter);

      res.json({
        success: true,
        data: {
          markdown,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/projects/:id/export/validate
 * Valida se o projeto está pronto para exportação
 * Retorna warnings sobre requisitos não validados ou conflitos
 *
 * Query params:
 *   - module: (opcional) Filtrar por módulo SAP
 *
 * Response: JSON com status de validação e warnings
 */
router.get(
  '/projects/:id/export/validate',
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const { id: projectId } = req.params;
      const moduleFilter = req.query.module as string | undefined;

      const validation = await validateExportReadiness(projectId, moduleFilter);

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
