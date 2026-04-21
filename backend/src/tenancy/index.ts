// Módulo de Multi-Tenancy para Ancoro
// Ver: docs/INFRASTRUCTURE_GUIDE.md
//
// Este módulo implementa:
// - Criptografia AES-256-GCM para URLs de banco
// - Cache LRU de Prisma Clients (evita memory leak)
// - Middleware de resolução de tenant baseado em JWT
//
// Uso em desenvolvimento (single-tenant):
//   import { singleTenantMiddleware } from './tenancy'
//   app.use(singleTenantMiddleware(prisma))
//
// Uso em produção (multi-tenant):
//   import { createTenantResolver } from './tenancy'
//   app.use(createTenantResolver())

export { encrypt, decrypt, generateKey } from './crypto'
export { tenantPrismaCache } from './tenant-prisma-cache'
export {
  createTenantResolver,
  singleTenantMiddleware,
  disconnectRegistry,
} from './tenant-resolver.middleware'
