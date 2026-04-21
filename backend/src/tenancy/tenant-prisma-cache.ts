import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

// LRU Cache de Prisma Clients para multi-tenancy
// Ver: docs/INFRASTRUCTURE_GUIDE.md seção 3.5
//
// Crítico: nunca instancie `new PrismaClient()` por request.
// Use este cache LRU com tamanho limitado para evitar memory leak.

interface CacheEntry {
  client: PrismaClient
  lastUsed: number
  slug: string
}

// Configuração do cache
const MAX_CLIENTS = parseInt(process.env.TENANT_PRISMA_CACHE_SIZE || '10', 10)
const EVICTION_CHECK_INTERVAL = 60_000 // 1 minuto
const CLIENT_IDLE_TIMEOUT = 300_000    // 5 minutos sem uso = elegível para eviction

class TenantPrismaCache {
  private cache: Map<string, CacheEntry> = new Map()
  private evictionTimer: NodeJS.Timeout | null = null

  constructor() {
    this.startEvictionTimer()
  }

  /**
   * Obtém ou cria um PrismaClient para a URL de banco especificada
   * @param databaseUrl URL de conexão PostgreSQL
   * @param tenantSlug Slug do tenant (para logging)
   */
  async getClient(databaseUrl: string, tenantSlug: string): Promise<PrismaClient> {
    // Usa a URL como chave (normalizada)
    const cacheKey = this.normalizeUrl(databaseUrl)

    const existing = this.cache.get(cacheKey)
    if (existing) {
      existing.lastUsed = Date.now()
      logger.debug({ tenantSlug }, 'Prisma client cache hit')
      return existing.client
    }

    // Verifica se precisa fazer eviction antes de criar novo
    if (this.cache.size >= MAX_CLIENTS) {
      await this.evictLeastRecentlyUsed()
    }

    // Cria novo client
    logger.info({ tenantSlug }, 'Creating new Prisma client')
    const client = new PrismaClient({
      datasources: {
        db: { url: databaseUrl },
      },
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    })

    // Conecta ao banco
    await client.$connect()

    this.cache.set(cacheKey, {
      client,
      lastUsed: Date.now(),
      slug: tenantSlug,
    })

    logger.info({ tenantSlug, cacheSize: this.cache.size }, 'Prisma client created and cached')
    return client
  }

  /**
   * Remove o client menos recentemente usado
   */
  private async evictLeastRecentlyUsed(): Promise<void> {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed
        oldestKey = key
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)
      if (entry) {
        logger.info({ tenantSlug: entry.slug }, 'Evicting Prisma client from cache')
        await entry.client.$disconnect()
        this.cache.delete(oldestKey)
      }
    }
  }

  /**
   * Timer de eviction periódica para clients inativos
   */
  private startEvictionTimer(): void {
    this.evictionTimer = setInterval(async () => {
      const now = Date.now()
      const toEvict: string[] = []

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.lastUsed > CLIENT_IDLE_TIMEOUT) {
          toEvict.push(key)
        }
      }

      for (const key of toEvict) {
        const entry = this.cache.get(key)
        if (entry) {
          logger.info({ tenantSlug: entry.slug }, 'Evicting idle Prisma client')
          await entry.client.$disconnect()
          this.cache.delete(key)
        }
      }

      if (toEvict.length > 0) {
        logger.debug({ evicted: toEvict.length, remaining: this.cache.size }, 'Prisma cache eviction completed')
      }
    }, EVICTION_CHECK_INTERVAL)

    // Não bloqueia shutdown do processo
    this.evictionTimer.unref()
  }

  /**
   * Normaliza URL para uso como cache key
   * Remove parâmetros de query que podem variar (pooling, etc)
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url)
      // Remove parâmetros de query para normalização
      parsed.search = ''
      return parsed.toString()
    } catch {
      // Se não for URL válida, usa como está
      return url
    }
  }

  /**
   * Estatísticas do cache para debugging
   */
  getStats(): { size: number; maxSize: number; entries: Array<{ slug: string; lastUsed: Date }> } {
    return {
      size: this.cache.size,
      maxSize: MAX_CLIENTS,
      entries: Array.from(this.cache.values()).map(e => ({
        slug: e.slug,
        lastUsed: new Date(e.lastUsed),
      })),
    }
  }

  /**
   * Desconecta todos os clients (para shutdown graceful)
   */
  async disconnectAll(): Promise<void> {
    logger.info({ count: this.cache.size }, 'Disconnecting all cached Prisma clients')

    if (this.evictionTimer) {
      clearInterval(this.evictionTimer)
    }

    const disconnectPromises = Array.from(this.cache.values()).map(entry =>
      entry.client.$disconnect().catch(err =>
        logger.error({ err, tenantSlug: entry.slug }, 'Error disconnecting Prisma client')
      )
    )

    await Promise.all(disconnectPromises)
    this.cache.clear()
  }
}

// Singleton instance
export const tenantPrismaCache = new TenantPrismaCache()
