import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import pinoHttp from 'pino-http'
import { createServer } from 'http'
import { PrismaClient } from '@prisma/client'
import config from './config'
import { deploymentMode, getDeploymentConfig, getDeploymentInfo } from './config/deployment-mode'
import { initializeLicense, licenseStatusHandler, attachLicenseInfo } from './license'
import { initializeSocketServer } from './services/notificationService'
import { seedDemoData } from './utils/seedData'
import { seedDefaultConfigs } from './utils/seedDefaultConfigs'
import { logger, httpLoggerOptions } from './utils/logger'

// Inicializa Prisma Client
export const prisma = new PrismaClient()

// Inicializa Express + HTTP Server (necessário para Socket.io)
const app = express()
const httpServer = createServer(app)

// Disponibiliza prisma para rotas via app.get('prisma')
app.set('prisma', prisma)

// ===== CORS PRIMEIRO (necessário para preflight OPTIONS) =====
// CORS DEVE vir antes de outros middlewares que possam bloquear requisições
const corsOrigins = config.corsOrigin.split(',').map(origin => origin.trim())
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true)

    // Allow wildcard in development
    if (corsOrigins.includes('*')) return callback(null, true)

    // Check if origin is in allowed list
    if (corsOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  // Métodos e headers permitidos para preflight
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// ===== SECURITY MIDDLEWARES =====

// Helmet: HTTP security headers (CSP, X-Frame-Options, etc.)
app.use(helmet({
  // Desabilita CSP em dev para permitir HMR do Vite
  contentSecurityPolicy: config.isDevelopment ? false : undefined,
}))

// Rate limiting global: 100 requests por 15 minutos por IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Muitas requisições. Aguarde alguns minutos.' },
  // Não aplica rate limit em dev para facilitar debugging
  // Ignora OPTIONS para não bloquear preflight CORS
  skip: (req) => config.isDevelopment || req.method === 'OPTIONS',
})
app.use(globalLimiter)

// Rate limiting específico para auth: 5 tentativas por 15 minutos
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts', message: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  // Não aplica rate limit em dev para facilitar debugging
  // Ignora OPTIONS para não bloquear preflight CORS
  skip: (req) => config.isDevelopment || req.method === 'OPTIONS',
})
// Aplica apenas em login (registrado antes da rota de auth)
app.use('/api/auth/login', authLimiter)

// ===== STANDARD MIDDLEWARES =====
app.use(express.json())

// Structured logging com Pino (substitui console.log manual)
app.use(pinoHttp(httpLoggerOptions))

// Adiciona info de licença nos headers (on-premise)
app.use(attachLicenseInfo)

// ===== IMPORT ROUTES =====
import authRoutes from './routes/auth'
import requirementsRoutes from './routes/requirements'
import crossMatrixRoutes from './routes/crossMatrix'
import commentsRoutes from './routes/comments'
import changelogRoutes from './routes/changelog'
import exportRoutes from './routes/export'
import metricsRoutes from './routes/metrics'
import projectMembersRoutes from './routes/projectMembers'
import projectsRoutes from './routes/projects'
import projectListsRoutes from './routes/projectLists'
import configRoutes from './routes/config'
import demoRoutes from './routes/demo'
import evidencesRoutes from './routes/evidences'

// ===== ROUTES =====

// Health check com info de ambiente
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Ancoro API',
    environment: config.env,
    isDemoMode: config.isDemo,
    deploymentMode,
  })
})

// License status endpoint (disponível em qualquer modo)
app.get('/api/license/status', licenseStatusHandler)

// Test database connection
app.get('/api/test-db', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      status: 'ok',
      message: 'Database connection successful',
      environment: config.env,
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// ===== API ROUTES =====
// Config e Demo routes PRIMEIRO - não requerem autenticação (parcialmente)
// IMPORTANTE: deve vir antes de routers que usam router.use(authenticate)
app.use('/api/config', configRoutes)
app.use('/api/demo', demoRoutes)
app.use('/api/auth', authRoutes)
app.use('/api', requirementsRoutes)
app.use('/api', crossMatrixRoutes)
app.use('/api', commentsRoutes)
app.use('/api', changelogRoutes)
app.use('/api', exportRoutes)
app.use('/api', metricsRoutes)
app.use('/api', projectListsRoutes)    // ANTES de projectMembersRoutes para evitar conflito de middleware
app.use('/api', projectMembersRoutes)
app.use('/api', projectsRoutes)
app.use('/api', evidencesRoutes)

// ===== ERROR HANDLER =====
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  logger.error({ err }, 'Unhandled error')
  res.status(500).json({
    error: 'Internal server error',
    message: config.features.showDebugInfo ? err.message : 'Erro interno do servidor',
  })
})

// ===== SEED DE CONFIGURAÇÕES DEFAULT =====
async function seedConfigsIfNeeded(): Promise<void> {
  try {
    // Sempre executa seed de configs (usa upsert, não sobrescreve existentes)
    const result = await seedDefaultConfigs(prisma, config.env)
    if (result.globals > 0 || result.overrides > 0) {
      logger.info({ globals: result.globals, overrides: result.overrides, env: config.env }, 'AppConfig seed completed')
    }
  } catch (error) {
    logger.error({ err: error }, 'Config seed failed')
    // Não falha o startup - ConfigService tem fallback para defaults
  }
}

// ===== AUTO-SEED PARA MODO DEMO =====
async function autoSeedIfDemo(): Promise<void> {
  if (!config.demo.enabled || !config.demo.autoSeed) {
    return
  }

  try {
    // Verifica se já tem dados
    const userCount = await prisma.user.count()

    if (userCount === 0) {
      logger.info('Demo database empty, running auto-seed')
      await seedDemoData(prisma)
      logger.info('Demo auto-seed completed')
    } else {
      logger.debug({ userCount }, 'Demo database already seeded, skipping')
    }
  } catch (error) {
    logger.error({ err: error }, 'Demo auto-seed failed')
    // Não falha o startup por erro de seed
  }
}

// ===== INICIALIZA LICENÇA (on-premise) =====
function initializeLicenseIfNeeded(): void {
  const deploymentInfo = getDeploymentInfo()
  logger.info({
    mode: deploymentInfo.mode,
    description: deploymentInfo.description,
  }, 'Deployment mode')

  const deployConfig = getDeploymentConfig()

  if (deployConfig.requireLicenseFile) {
    const result = initializeLicense()

    if (!result.valid) {
      // Em produção on-premise, licença inválida é fatal
      if (config.isProduction) {
        logger.fatal({
          error: result.error,
        }, 'Licença inválida - servidor não pode iniciar')
        process.exit(1)
      }

      // Em dev/staging, apenas warning
      logger.warn({
        error: result.error,
      }, 'Licença inválida - continuando em modo restrito')
    }
  } else {
    logger.debug('Modo SaaS - licenciamento gerenciado centralmente')
  }
}

// ===== START SERVER =====
async function main() {
  try {
    // Verifica licença antes de qualquer coisa (on-premise)
    initializeLicenseIfNeeded()

    // Testa conexão com database
    await prisma.$connect()
    logger.info('Database connected successfully')

    // Seed de configurações default (sempre executa, usa upsert)
    await seedConfigsIfNeeded()

    // Auto-seed em modo demo
    await autoSeedIfDemo()

    // Inicializa Socket.io server (real-time notifications)
    initializeSocketServer(httpServer)
    logger.info('Socket.io server initialized')

    // Inicia servidor HTTP (Express + Socket.io)
    httpServer.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.env,
        demo: config.isDemo,
        health: `http://localhost:${config.port}/health`,
        websocket: `ws://localhost:${config.port}`,
      }, 'Server started')
    })
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully')
  await prisma.$disconnect()
  process.exit(0)
})

main()
