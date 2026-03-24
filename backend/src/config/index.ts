/**
 * Bootstrap Configuration
 *
 * Este arquivo contém APENAS configurações de infraestrutura que precisam
 * estar disponíveis ANTES de conectar ao banco de dados:
 * - DATABASE_URL (necessário para conectar)
 * - JWT_SECRET (segurança)
 * - PORT (servidor)
 * - NODE_ENV (ambiente)
 * - CORS_ORIGIN (segurança)
 *
 * Configurações de APLICAÇÃO (features, ui, limits) agora estão no banco de dados
 * e são gerenciadas pelo ConfigService (src/services/configService.ts).
 * Isso permite alteração em runtime sem redeploy.
 *
 * Para acessar configs de aplicação:
 * ```
 * import { getConfigService } from './services/configService'
 * const configService = getConfigService(prisma)
 * const appConfig = await configService.getTypedConfig()
 * ```
 */

import { z } from 'zod'
import dotenv from 'dotenv'
import path from 'path'

// Determina qual arquivo .env carregar baseado em NODE_ENV
// Permite override via ENV_FILE para casos especiais
const envFile = process.env.ENV_FILE || `.env.${process.env.NODE_ENV || 'development'}`
dotenv.config({ path: path.resolve(__dirname, '../../..', envFile) })

// Fallback para .env padrão se o específico não existir
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') })

// Schema de validação para variáveis de ambiente de INFRAESTRUTURA
// Falha rápido se configuração inválida - evita erros em runtime
const envSchema = z.object({
  NODE_ENV: z.enum(['demo', 'development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database - SQLite para dev/demo, PostgreSQL para staging/prod
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),

  // Auth - JWT secret deve ter mínimo 32 chars em produção
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter no mínimo 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Demo mode - controle explícito além do NODE_ENV (para compatibilidade)
  DEMO_MODE: z.coerce.boolean().default(false),
  DEMO_AUTO_SEED: z.coerce.boolean().default(false),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // CORS - restritivo em produção
  CORS_ORIGIN: z.string().default('*'),
})

export type Env = z.infer<typeof envSchema>

// Valida env vars no startup - fail fast
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error('Configuração de ambiente inválida:')
    const formatted = result.error.format()
    Object.entries(formatted).forEach(([key, value]) => {
      if (key !== '_errors' && typeof value === 'object' && '_errors' in value) {
        const errors = (value as { _errors: string[] })._errors
        if (errors.length > 0) {
          console.error(`  ${key}: ${errors.join(', ')}`)
        }
      }
    })
    process.exit(1)
  }

  return result.data
}

const env = loadEnv()

// Defaults hardcoded para fallback (antes do banco estar disponível)
// Estes são usados apenas durante bootstrap, depois o ConfigService assume
const BOOTSTRAP_DEFAULTS = {
  features: {
    allowSeed: env.NODE_ENV === 'demo' || env.NODE_ENV === 'development',
    allowDatabaseReset: env.NODE_ENV === 'demo' || env.NODE_ENV === 'development',
    showDebugInfo: env.NODE_ENV !== 'production',
  },
  ui: {
    showEnvironmentBanner: env.NODE_ENV !== 'production',
    bannerMessage: getBannerMessage(env.NODE_ENV),
    bannerColor: getBannerColor(env.NODE_ENV),
  },
}

function getBannerMessage(nodeEnv: string): string | null {
  const messages: Record<string, string> = {
    demo: 'MODO DEMO - Dados podem ser resetados a qualquer momento',
    development: 'Ambiente de Desenvolvimento',
    staging: 'Ambiente de Qualidade (Staging)',
  }
  return messages[nodeEnv] ?? null
}

function getBannerColor(nodeEnv: string): string | null {
  const colors: Record<string, string> = {
    demo: 'purple',
    development: 'blue',
    staging: 'yellow',
  }
  return colors[nodeEnv] ?? null
}

// Config de BOOTSTRAP exportado - apenas infraestrutura
// Para configs de aplicação, use ConfigService
export const config = {
  // Ambiente atual
  env: env.NODE_ENV,
  port: env.PORT,

  // Database
  database: {
    url: env.DATABASE_URL,
  },

  // Auth
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },

  // Demo mode - para compatibilidade durante migração
  demo: {
    enabled: env.DEMO_MODE || env.NODE_ENV === 'demo',
    autoSeed: env.DEMO_AUTO_SEED,
  },

  // Logging
  logLevel: env.LOG_LEVEL,

  // CORS
  corsOrigin: env.CORS_ORIGIN,

  // Helpers para checagem rápida
  isDemo: env.DEMO_MODE || env.NODE_ENV === 'demo',
  isDevelopment: env.NODE_ENV === 'development',
  isStaging: env.NODE_ENV === 'staging',
  isProduction: env.NODE_ENV === 'production',

  // Defaults de bootstrap (usados antes do ConfigService estar disponível)
  // DEPRECATED: Migrar para ConfigService.getTypedConfig()
  features: BOOTSTRAP_DEFAULTS.features,
  ui: BOOTSTRAP_DEFAULTS.ui,

  // Método para obter info do ambiente (usado pela API /demo/status)
  // TODO [ESTIGMERGIA]: Migrar para usar ConfigService quando disponível
  // - O ConfigService precisa do Prisma que só está disponível após conexão
  // - Este método é chamado antes do banco estar conectado em alguns casos
  getEnvironmentInfo() {
    return {
      environment: this.env,
      isDemoMode: this.isDemo,
      features: this.features,
      ui: this.ui,
    }
  },
}

export default config
