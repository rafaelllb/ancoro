/**
 * Graph Layout Routes
 *
 * Persistência de posições do grafo de dependências no backend.
 * Um layout por projeto — posições indexadas por dbId do requisito.
 *
 * @author Rafael Brito
 */

import express from 'express'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireProjectAccess } from '../middleware/permissions'
import { graphLayoutSchema } from '../schemas'

const router = express.Router()

// Todas as rotas requerem autenticação
router.use(authenticate)

/**
 * GET /api/projects/:projectId/graph-layout
 * Retorna posições salvas dos nós do grafo.
 * Se não existir layout, retorna { positions: {} } — sem 404.
 */
router.get(
  '/projects/:projectId/graph-layout',
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const { projectId } = req.params

      const layout = await prisma.graphLayout.findUnique({
        where: { projectId },
      })

      // Parse do JSON armazenado. Se não existir, retorna mapa vazio.
      let positions: Record<string, { x: number; y: number }> = {}
      if (layout?.positions) {
        try {
          positions = JSON.parse(layout.positions)
        } catch {
          // JSON corrompido — retorna vazio e deixa o frontend regravar
          positions = {}
        }
      }

      res.json({ positions })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * PUT /api/projects/:projectId/graph-layout
 * Salva (upsert) posições dos nós do grafo.
 * Body: { positions: { [dbId]: { x, y } } }
 */
router.put(
  '/projects/:projectId/graph-layout',
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const { projectId } = req.params

      // Validação Zod
      const parseResult = graphLayoutSchema.safeParse(req.body)
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map(
          (e) => `${e.path.join('.')}: ${e.message}`
        )
        return res.status(400).json({
          error: 'Validation failed',
          message: errors.join(', '),
        })
      }

      const { positions } = parseResult.data
      const positionsJson = JSON.stringify(positions)

      // Upsert: cria se não existe, atualiza se já existe
      const layout = await prisma.graphLayout.upsert({
        where: { projectId },
        create: {
          projectId,
          positions: positionsJson,
        },
        update: {
          positions: positionsJson,
        },
      })

      // Retorna posições parseadas para consistência com GET
      res.json({
        positions: JSON.parse(layout.positions),
      })
    } catch (error) {
      next(error)
    }
  }
)

export default router
