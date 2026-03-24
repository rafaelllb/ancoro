/**
 * Rotas de Configuração da Aplicação
 *
 * Endpoints para gerenciar configurações armazenadas em banco de dados.
 * Permite alteração de configs em runtime sem redeploy.
 *
 * Acesso:
 * - GET /api/config → Público (frontend)
 * - Demais endpoints → ADMIN only
 */

import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { authenticate } from '../middleware/auth'
import { getConfigService } from '../services/configService'
import { ConfigValueType, ConfigCategory } from '../types'

const router = Router()

// Schema de validação para criar config
const createConfigSchema = z.object({
  key: z
    .string()
    .min(1, 'Key é obrigatório')
    .max(100, 'Key deve ter no máximo 100 caracteres')
    .regex(/^[a-z][a-z0-9.]*$/, 'Key deve iniciar com letra minúscula e conter apenas letras, números e pontos'),
  value: z.unknown(),
  valueType: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENUM']),
  category: z.enum(['FEATURE', 'UI', 'LIMIT', 'NOTIFICATION', 'INTEGRATION']),
  description: z.string().max(500).optional(),
  environment: z.enum(['production', 'staging', 'development', 'demo']).nullable().optional(),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
      enumValues: z.array(z.string()).optional(),
      required: z.boolean().optional(),
    })
    .optional(),
})

// Schema para atualizar config
const updateConfigSchema = z.object({
  value: z.unknown().optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  reason: z.string().max(500).optional(),
})

/**
 * Middleware: requer role ADMIN
 */
function requireAdmin(req: Request, res: Response, next: () => void) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Apenas administradores podem gerenciar configurações da aplicação',
    })
  }
  next()
}

/**
 * GET /api/config
 * Público - retorna config tipado para frontend.
 * Não expõe metadata sensível (validation, environment, etc.).
 */
router.get('/', async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma')

  if (!prisma) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Cliente Prisma não disponível',
    })
  }

  try {
    const configService = getConfigService(prisma)
    const typedConfig = await configService.getTypedConfig()

    res.json({
      success: true,
      data: typedConfig,
    })
  } catch (error) {
    console.error('[Config] Erro ao carregar configurações:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Falha ao carregar configurações',
    })
  }
})

/**
 * GET /api/config/admin
 * ADMIN only - lista todas configs com metadata completo.
 * Query params: ?category=FEATURE
 */
router.get('/admin', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma')
  const { category, export: exportParam } = req.query

  if (!prisma) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Cliente Prisma não disponível',
    })
  }

  try {
    const configService = getConfigService(prisma)
    const configs = await configService.listAll(category as string | undefined)

    // Se export=true, retorna formato para importação
    if (exportParam === 'true') {
      return res.json({
        success: true,
        exportedAt: new Date().toISOString(),
        configs: configs.map(c => ({
          key: c.key,
          value: c.value,
          valueType: c.valueType,
          category: c.category,
          description: c.description,
          environment: c.environment,
          validation: c.validation,
        })),
      })
    }

    res.json({
      success: true,
      data: configs,
      count: configs.length,
      categories: Object.values(ConfigCategory),
      valueTypes: Object.values(ConfigValueType),
    })
  } catch (error) {
    console.error('[Config] Erro ao listar configurações:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Falha ao listar configurações',
    })
  }
})

/**
 * POST /api/config
 * ADMIN only - cria nova configuração.
 */
router.post('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma')

  if (!prisma) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Cliente Prisma não disponível',
    })
  }

  try {
    const validation = createConfigSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      })
    }

    const data = validation.data
    const configService = getConfigService(prisma)

    const created = await configService.create(
      {
        key: data.key,
        value: data.value,
        valueType: data.valueType,
        category: data.category,
        description: data.description,
        environment: data.environment ?? null,
        validation: data.validation,
      },
      req.user!.userId
    )

    res.status(201).json({
      success: true,
      data: created,
      message: 'Configuração criada com sucesso',
    })
  } catch (error) {
    console.error('[Config] Erro ao criar configuração:', error)

    // Verifica se é erro de duplicata
    if (error instanceof Error && error.message.includes('já existe')) {
      return res.status(409).json({
        error: 'Conflict',
        message: error.message,
      })
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Falha ao criar configuração',
    })
  }
})

/**
 * PATCH /api/config/:key
 * ADMIN only - atualiza valor de configuração.
 * Key usa notação de ponto, então precisa URL encode: features.allowSeed → features%2EallowSeed
 */
router.patch('/:key', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma')
  // Decodifica key da URL (pontos podem estar encoded)
  const key = decodeURIComponent(req.params.key)

  if (!prisma) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Cliente Prisma não disponível',
    })
  }

  try {
    const validation = updateConfigSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validation.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      })
    }

    const data = validation.data

    // Busca usuário para audit log
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Usuário não encontrado',
      })
    }

    const configService = getConfigService(prisma)
    const updated = await configService.set(
      key,
      data.value,
      req.user!.userId,
      user.name,
      user.email,
      data.reason
    )

    res.json({
      success: true,
      data: updated,
      message: 'Configuração atualizada com sucesso',
    })
  } catch (error) {
    console.error('[Config] Erro ao atualizar configuração:', error)

    // Verifica se é erro de não encontrado
    if (error instanceof Error && error.message.includes('não encontrada')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      })
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Falha ao atualizar configuração',
    })
  }
})

/**
 * GET /api/config/:key/history
 * ADMIN only - histórico de alterações de uma config.
 * Query params: ?limit=50&offset=0
 */
router.get('/:key/history', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma')
  const key = decodeURIComponent(req.params.key)
  const { limit = '50', offset = '0' } = req.query

  if (!prisma) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Cliente Prisma não disponível',
    })
  }

  try {
    const configService = getConfigService(prisma)
    const result = await configService.getHistory(key, Number(limit), Number(offset))

    res.json({
      success: true,
      data: result.history,
      pagination: {
        total: result.total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: result.hasMore,
      },
    })
  } catch (error) {
    console.error('[Config] Erro ao buscar histórico:', error)

    if (error instanceof Error && error.message.includes('não encontrada')) {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
      })
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Falha ao buscar histórico',
    })
  }
})

/**
 * POST /api/config/invalidate-cache
 * ADMIN only - força invalidação do cache.
 * Útil após alterações diretas no banco.
 */
router.post('/invalidate-cache', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma')

  if (!prisma) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Cliente Prisma não disponível',
    })
  }

  try {
    const configService = getConfigService(prisma)
    configService.invalidateCache()

    res.json({
      success: true,
      message: 'Cache invalidado com sucesso',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Config] Erro ao invalidar cache:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Falha ao invalidar cache',
    })
  }
})

/**
 * POST /api/config/import
 * ADMIN only - importa configs de outro ambiente.
 * Body: { configs: [...], overwrite: boolean }
 */
router.post('/import', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const prisma: PrismaClient = req.app.get('prisma')

  if (!prisma) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Cliente Prisma não disponível',
    })
  }

  try {
    const { configs, overwrite = false } = req.body

    if (!Array.isArray(configs)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'configs deve ser um array',
      })
    }

    const configService = getConfigService(prisma)
    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] }

    for (const cfg of configs) {
      try {
        const validation = createConfigSchema.safeParse(cfg)
        if (!validation.success) {
          results.errors.push(`${cfg.key}: ${validation.error.issues[0]?.message}`)
          continue
        }

        const existing = await prisma.appConfig.findUnique({ where: { key: cfg.key } })

        if (existing) {
          if (overwrite) {
            // Busca usuário para audit
            const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
            await configService.set(
              cfg.key,
              cfg.value,
              req.user!.userId,
              user?.name ?? 'System',
              user?.email ?? 'system@ancoro.com',
              'Import de configurações'
            )
            results.updated++
          } else {
            results.skipped++
          }
        } else {
          await configService.create(
            {
              key: cfg.key,
              value: cfg.value,
              valueType: cfg.valueType,
              category: cfg.category,
              description: cfg.description,
              environment: cfg.environment,
              validation: cfg.validation,
            },
            req.user!.userId
          )
          results.created++
        }
      } catch (err) {
        results.errors.push(`${cfg.key}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
      }
    }

    res.json({
      success: true,
      message: 'Importação concluída',
      results,
    })
  } catch (error) {
    console.error('[Config] Erro na importação:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Falha na importação',
    })
  }
})

export default router
