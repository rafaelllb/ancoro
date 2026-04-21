import { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'
import { decrypt } from './crypto'
import { tenantPrismaCache } from './tenant-prisma-cache'

// Middleware de resolução de tenant para multi-tenancy
// Ver: docs/INFRASTRUCTURE_GUIDE.md seção 3.5
//
// Fluxo:
// 1. Request chega com JWT contendo `userId` e `tenantSlug`
// 2. Middleware busca no tenant registry: `tenantSlug` → `database_url_encrypted`
// 3. Descriptografa a URL
// 4. Cria/recupera Prisma Client cacheado para aquela URL
// 5. Anexa o Prisma Client no `req.prisma`
// 6. Handler usa `req.prisma` normalmente

// Extensão do tipo Request para incluir tenant info
declare global {
  namespace Express {
    interface Request {
      prisma: PrismaClient
      tenantSlug?: string
      tenantId?: string
    }
  }
}

// Prisma Client do tenant registry (banco central de lookup)
// TODO [ESTIGMERGIA]: Configurar banco separado para tenant registry em produção
// Por enquanto, usa o mesmo banco (desenvolvimento)
let registryClient: PrismaClient | null = null

function getRegistryClient(): PrismaClient {
  if (!registryClient) {
    const registryUrl = process.env.TENANT_REGISTRY_DATABASE_URL || process.env.DATABASE_URL

    registryClient = new PrismaClient({
      datasources: {
        db: { url: registryUrl },
      },
      log: ['error'],
    })
  }
  return registryClient
}

interface TenantResolverOptions {
  // Se true, usa DEFAULT_TENANT_SLUG quando não há tenant no JWT
  // Útil para dev/demo/qa (single-tenant)
  allowDefaultTenant?: boolean
}

/**
 * Middleware factory para resolução de tenant
 *
 * Em ambientes single-tenant (dev, demo, qa), use com allowDefaultTenant: true
 * Em produção multi-tenant, use sem opções
 */
export function createTenantResolver(options: TenantResolverOptions = {}) {
  const { allowDefaultTenant = false } = options

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extrai tenant slug do JWT (deve ter sido setado pelo middleware de auth)
      // O JWT deve conter { userId, tenantSlug, ... }
      const tenantSlug = (req as any).user?.tenantSlug || req.headers['x-tenant-slug'] as string

      // Fallback para default tenant em ambientes de desenvolvimento
      const defaultSlug = process.env.DEFAULT_TENANT_SLUG
      const defaultDbUrl = process.env.DEFAULT_TENANT_DATABASE_URL

      if (!tenantSlug) {
        // Verifica se pode usar default tenant
        if (allowDefaultTenant && defaultSlug && defaultDbUrl) {
          logger.debug({ defaultSlug }, 'Using default tenant')
          req.tenantSlug = defaultSlug
          req.prisma = await tenantPrismaCache.getClient(defaultDbUrl, defaultSlug)
          return next()
        }

        // Sem tenant e sem fallback - erro
        logger.warn('No tenant slug in request and no default tenant configured')
        return res.status(400).json({
          error: 'Tenant not specified',
          message: 'Requisição deve incluir tenant no token ou header x-tenant-slug',
        })
      }

      // Busca tenant no registry
      const registry = getRegistryClient()
      const tenant = await (registry as any).tenant.findUnique({
        where: { slug: tenantSlug },
      })

      if (!tenant) {
        logger.warn({ tenantSlug }, 'Tenant not found in registry')
        return res.status(404).json({
          error: 'Tenant not found',
          message: `Tenant "${tenantSlug}" não encontrado`,
        })
      }

      if (tenant.status !== 'active') {
        logger.warn({ tenantSlug, status: tenant.status }, 'Tenant not active')
        return res.status(403).json({
          error: 'Tenant inactive',
          message: `Tenant "${tenantSlug}" está ${tenant.status}`,
        })
      }

      // Descriptografa URL do banco
      let databaseUrl: string
      try {
        databaseUrl = decrypt(tenant.databaseUrlEncrypted)
      } catch (err) {
        logger.error({ err, tenantSlug }, 'Failed to decrypt tenant database URL')
        return res.status(500).json({
          error: 'Internal error',
          message: 'Erro ao acessar configuração do tenant',
        })
      }

      // Obtém ou cria Prisma client para o tenant
      req.prisma = await tenantPrismaCache.getClient(databaseUrl, tenantSlug)
      req.tenantSlug = tenantSlug
      req.tenantId = tenant.id

      next()
    } catch (error) {
      logger.error({ err: error }, 'Tenant resolution failed')
      return res.status(500).json({
        error: 'Internal error',
        message: 'Erro na resolução de tenant',
      })
    }
  }
}

/**
 * Middleware simplificado para ambientes single-tenant (dev, demo, qa)
 * Usa o prisma client global, sem lookup no registry
 */
export function singleTenantMiddleware(globalPrisma: PrismaClient) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.prisma = globalPrisma
    req.tenantSlug = process.env.DEFAULT_TENANT_SLUG || 'default'
    next()
  }
}

/**
 * Desconecta o registry client (para graceful shutdown)
 */
export async function disconnectRegistry(): Promise<void> {
  if (registryClient) {
    await registryClient.$disconnect()
    registryClient = null
  }
}
