import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import config from '../config'
import { seedDemoData } from '../utils/seedData'

const router = Router()

/**
 * Middleware: bloqueia acesso fora de modo demo
 * Retorna 403 Forbidden se não estiver em demo mode
 */
function requireDemoMode(req: Request, res: Response, next: () => void) {
  if (!config.isDemo) {
    return res.status(403).json({
      error: 'Acesso negado',
      message: 'Esta funcionalidade está disponível apenas em modo DEMO',
      currentEnvironment: config.env,
    })
  }
  next()
}

/**
 * GET /api/demo/status
 * Retorna informações sobre o ambiente atual
 * Útil para frontend saber qual ambiente está rodando
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json(config.getEnvironmentInfo())
})

/**
 * POST /api/demo/reset
 * Reseta o banco de dados e repopula com dados demo
 * APENAS disponível em modo demo
 *
 * Use case: Apresentações onde você quer voltar ao estado inicial
 */
router.post('/reset', requireDemoMode, async (req: Request, res: Response) => {
  // Obtém prisma do app (injetado no index.ts)
  const prisma: PrismaClient = req.app.get('prisma')

  if (!prisma) {
    return res.status(500).json({
      error: 'Erro interno',
      message: 'Cliente Prisma não disponível',
    })
  }

  try {
    console.log('[Demo] Iniciando reset do banco de dados...')

    // Executa seed (já inclui limpeza)
    await seedDemoData(prisma)

    console.log('[Demo] Reset concluído com sucesso')

    res.json({
      success: true,
      message: 'Banco de dados resetado com sucesso',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Demo] Erro no reset:', error)

    res.status(500).json({
      error: 'Falha no reset',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
})

/**
 * GET /api/demo/credentials
 * Retorna credenciais de login para demonstração
 * APENAS disponível em modo demo
 */
router.get('/credentials', requireDemoMode, (_req: Request, res: Response) => {
  res.json({
    message: 'Credenciais de demonstração',
    password: 'demo123',
    users: [
      { email: 'joao.silva@seidor.com', role: 'CONSULTANT', module: 'ISU' },
      { email: 'maria.santos@seidor.com', role: 'CONSULTANT', module: 'CRM' },
      { email: 'pedro.oliveira@seidor.com', role: 'CONSULTANT', module: 'FICA' },
      { email: 'rafael.brito@seidor.com', role: 'MANAGER', module: null },
      { email: 'ana.costa@cliente.com', role: 'CLIENT', module: null },
    ],
  })
})

export default router
