/**
 * Leads comerciais — formulário público de /planos.
 *
 *  POST  /api/leads            público; rate-limited; honeypot; exige consentimento (LGPD)
 *  GET   /api/leads            ADMIN
 *  PATCH /api/leads/:id/status ADMIN
 *
 * Onde roda: só no SaaS do fornecedor. Em on-premise o cliente não deve coletar lead do fornecedor
 * no próprio banco, então as rotas respondem 404 (ver `leadsEnabled`).
 *
 * [2026-10-24] Criado: captura de interesse de médio/grande porte e lista de espera do self-service — Rafael Brito
 */
import { Router, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { leadSchema, leadStatusSchema } from '../schemas'
import { notifyNewLead } from '../services/leadNotifier'
import { deploymentMode } from '../config/deployment-mode'
import { logger } from '../utils/logger'

const router = Router()

const leadsEnabled = deploymentMode !== 'onpremise'

// Rate limit próprio e mais estrito que o global: 5 envios/hora/IP. Em dev não limita (mesmo critério do index.ts).
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Muitos envios. Tente novamente mais tarde.' },
  skip: (req) => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || req.method === 'OPTIONS',
})

function requireEnabled(_req: Request, res: Response, next: NextFunction) {
  if (!leadsEnabled) return res.status(404).json({ error: 'Not Found' })
  next()
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden', message: 'Apenas ADMIN acessa os leads' })
  }
  next()
}

router.post('/leads', requireEnabled, leadLimiter, async (req: Request, res: Response) => {
  const parsed = leadSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
    })
  }
  const { consent: _consent, website, ...data } = parsed.data

  // Honeypot: finge sucesso para o bot não aprender a contornar, mas não grava nada
  if (website) {
    logger.info('Lead honeypot triggered, discarding')
    return res.status(201).json({ ok: true })
  }

  try {
    const lead = await prisma.lead.create({ data: { ...data, consentAt: new Date() } })

    // Melhor-esforço e fora do caminho crítico: o usuário não espera o SMTP
    void notifyNewLead(lead)
      .then((delivered) => (delivered
        ? prisma.lead.update({ where: { id: lead.id }, data: { notifiedAt: new Date() } })
        : null))
      .catch((err) => logger.error({ err, leadId: lead.id }, 'Failed to mark lead as notified'))

    return res.status(201).json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Lead creation failed')
    return res.status(500).json({ error: 'Internal Server Error', message: 'Não foi possível registrar seu contato agora' })
  }
})

router.get('/leads', requireEnabled, authenticate, requireAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const leads = await prisma.lead.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  res.json({ leads })
})

router.patch('/leads/:id/status', requireEnabled, authenticate, requireAdmin, async (req: Request, res: Response) => {
  const parsed = leadStatusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation Error', message: 'Status inválido' })
  }
  try {
    const lead = await prisma.lead.update({ where: { id: String(req.params.id) }, data: { status: parsed.data.status } })
    res.json({ lead })
  } catch {
    res.status(404).json({ error: 'Not Found', message: 'Lead não encontrado' })
  }
})

// TODO [ESTIGMERGIA]: reenvio de notificações pendentes
// - Leads com notifiedAt = null e status NEW ficaram sem aviso (SMTP/webhook fora do ar ou não configurado).
// - Sugestão: job simples (setInterval no boot ou cron externo) que chama notifyNewLead para esses leads.

export default router
