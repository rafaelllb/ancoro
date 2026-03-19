import express, { Request, Response } from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { PrismaClient } from '@prisma/client'
import config from './config'
import { initializeSocketServer } from './services/notificationService'
import { seedDemoData } from './utils/seedData'

// Inicializa Prisma Client
export const prisma = new PrismaClient()

// Inicializa Express + HTTP Server (necessário para Socket.io)
const app = express()
const httpServer = createServer(app)

// Disponibiliza prisma para rotas via app.get('prisma')
app.set('prisma', prisma)

// Middlewares
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}))
app.use(express.json())

// Logger middleware - nível baseado em config
app.use((req, _res, next) => {
  if (config.logLevel === 'debug') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  }
  next()
})

// ===== IMPORT ROUTES =====
import authRoutes from './routes/auth'
import requirementsRoutes from './routes/requirements'
import crossMatrixRoutes from './routes/crossMatrix'
import commentsRoutes from './routes/comments'
import changelogRoutes from './routes/changelog'
import exportRoutes from './routes/export'
import metricsRoutes from './routes/metrics'
import projectMembersRoutes from './routes/projectMembers'
import demoRoutes from './routes/demo'

// ===== ROUTES =====

// Health check com info de ambiente
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Ancoro API',
    environment: config.env,
    isDemoMode: config.isDemo,
  })
})

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
app.use('/api/auth', authRoutes)
app.use('/api', requirementsRoutes)
app.use('/api', crossMatrixRoutes)
app.use('/api', commentsRoutes)
app.use('/api', changelogRoutes)
app.use('/api', exportRoutes)
app.use('/api', metricsRoutes)
app.use('/api', projectMembersRoutes)
app.use('/api/demo', demoRoutes)

// ===== PROJECTS ROUTES (manter por enquanto para compatibilidade) =====
app.get('/api/projects', async (_req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        _count: {
          select: { requirements: true, users: true },
        },
      },
    })
    res.json(projects)
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// ===== ERROR HANDLER =====
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  console.error('Error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: config.features.showDebugInfo ? err.message : 'Erro interno do servidor',
  })
})

// ===== AUTO-SEED PARA MODO DEMO =====
async function autoSeedIfDemo(): Promise<void> {
  if (!config.demo.enabled || !config.demo.autoSeed) {
    return
  }

  try {
    // Verifica se já tem dados
    const userCount = await prisma.user.count()

    if (userCount === 0) {
      console.log('[Demo] Banco vazio, executando auto-seed...')
      await seedDemoData(prisma)
      console.log('[Demo] Auto-seed concluído')
    } else {
      console.log(`[Demo] Banco já tem ${userCount} usuários, pulando auto-seed`)
    }
  } catch (error) {
    console.error('[Demo] Erro no auto-seed:', error)
    // Não falha o startup por erro de seed
  }
}

// ===== START SERVER =====
async function main() {
  try {
    // Testa conexão com database
    await prisma.$connect()
    console.log('✓ Database connected successfully')

    // Auto-seed em modo demo
    await autoSeedIfDemo()

    // Inicializa Socket.io server (real-time notifications)
    initializeSocketServer(httpServer)
    console.log('✓ Socket.io server initialized')

    // Inicia servidor HTTP (Express + Socket.io)
    httpServer.listen(config.port, () => {
      console.log(`✓ Server running on http://localhost:${config.port}`)
      console.log(`✓ Environment: ${config.env}${config.isDemo ? ' (DEMO MODE)' : ''}`)
      console.log(`✓ Health check: http://localhost:${config.port}/health`)
      console.log(`✓ WebSocket: ws://localhost:${config.port}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

main()
