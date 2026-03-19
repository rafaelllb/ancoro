import { z } from 'zod'
import dotenv from 'dotenv'
import path from 'path'

// Determina qual arquivo .env carregar baseado em NODE_ENV
// Permite override via ENV_FILE para casos especiais
const envFile = process.env.ENV_FILE || `.env.${process.env.NODE_ENV || 'development'}`
dotenv.config({ path: path.resolve(__dirname, '../../..', envFile) })

// Fallback para .env padrão se o específico não existir
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') })

// Schema de validação para variáveis de ambiente
// Falha rápido se configuração inválida - evita erros em runtime
const envSchema = z.object({
  NODE_ENV: z.enum(['demo', 'development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database - SQLite para dev/demo, PostgreSQL para staging/prod
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),

  // Auth - JWT secret deve ter mínimo 32 chars em produção
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter no mínimo 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Demo mode - controle explícito além do NODE_ENV
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

// Configurações específicas por ambiente
// Cada ambiente define features permitidas e comportamentos
const environmentConfigs = {
  demo: {
    features: {
      allowSeed: true,
      allowDatabaseReset: true,
      showDebugInfo: true,
    },
    ui: {
      showEnvironmentBanner: true,
      bannerMessage: 'MODO DEMO - Dados podem ser resetados a qualquer momento',
      bannerColor: 'purple',
    },
  },
  development: {
    features: {
      allowSeed: true,
      allowDatabaseReset: true,
      showDebugInfo: true,
    },
    ui: {
      showEnvironmentBanner: true,
      bannerMessage: 'Ambiente de Desenvolvimento',
      bannerColor: 'blue',
    },
  },
  staging: {
    features: {
      allowSeed: false,
      allowDatabaseReset: false,
      showDebugInfo: true,
    },
    ui: {
      showEnvironmentBanner: true,
      bannerMessage: 'Ambiente de Qualidade (Staging)',
      bannerColor: 'yellow',
    },
  },
  production: {
    features: {
      allowSeed: false,
      allowDatabaseReset: false,
      showDebugInfo: false,
    },
    ui: {
      showEnvironmentBanner: false,
      bannerMessage: null,
      bannerColor: null,
    },
  },
} as const

// Config final exportado - single source of truth
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

  // Demo mode - true se NODE_ENV=demo OU DEMO_MODE=true
  demo: {
    enabled: env.DEMO_MODE || env.NODE_ENV === 'demo',
    autoSeed: env.DEMO_AUTO_SEED,
  },

  // Logging
  logLevel: env.LOG_LEVEL,

  // CORS
  corsOrigin: env.CORS_ORIGIN,

  // Features do ambiente atual
  ...environmentConfigs[env.NODE_ENV],

  // Helpers para checagem rápida
  isDemo: env.DEMO_MODE || env.NODE_ENV === 'demo',
  isDevelopment: env.NODE_ENV === 'development',
  isStaging: env.NODE_ENV === 'staging',
  isProduction: env.NODE_ENV === 'production',

  // Método para obter info do ambiente (usado pela API /demo/status)
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
