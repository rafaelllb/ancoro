import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import config from '../config'
import { seedDemoData, loadSeedDataset } from '../utils/seedData'

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
 *
 * Carrega dados do dataset JSON - sem hardcoded no código
 */
router.get('/credentials', requireDemoMode, async (_req: Request, res: Response) => {
  try {
    // Carrega dataset para obter credenciais atualizadas dos arquivos JSON
    const dataset = await loadSeedDataset('demo')

    // Mapeia users com seus módulos (extraído do projectUsers)
    const usersWithModules = dataset.users.map(user => {
      const projectUser = dataset.projectUsers.find(pu => pu.userKey === user.key)
      return {
        email: user.email,
        role: user.role,
        module: projectUser?.module ?? null,
      }
    })

    res.json({
      message: 'Credenciais de demonstração',
      password: dataset.metadata.defaultPassword,
      users: usersWithModules,
    })
  } catch (error) {
    console.error('[Demo] Erro ao carregar credenciais:', error)

    res.status(500).json({
      error: 'Falha ao carregar credenciais',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
})

export default router
