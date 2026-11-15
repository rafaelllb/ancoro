/**
 * Comentários de processo + link público de revisão.
 *
 * [2026-11-10] Criado — Rafael Brito
 *
 * Interno (JWT, membro do projeto):
 *   GET    /api/projects/:projectId/processes/:pid/comments            canViewProcesses
 *   POST   /api/projects/:projectId/processes/:pid/comments            canCommentProcesses
 *   PATCH  /api/projects/:projectId/processes/:pid/comments/:cid       canModerateProcessComments  {status}
 *   DELETE /api/projects/:projectId/processes/:pid/comments/:cid       autor ou canModerateProcessComments
 *   GET    /api/projects/:projectId/processes/:pid/share               canViewProcesses (vê se há link)
 *   POST   /api/projects/:projectId/processes/:pid/share               canShareProcesses  {regenerate?}
 *   DELETE /api/projects/:projectId/processes/:pid/share               canShareProcesses  (desativa)
 *
 * Público (SEM login; o token do link é a credencial):
 *   GET    /api/public/share/:token            processo (nome, rev, modelo) + comentários
 *   GET    /api/public/share/:token/state      { rev, stamp } — polling barato do "ao vivo"
 *   GET    /api/public/share/:token/comments   comentários
 *   POST   /api/public/share/:token/comments   novo comentário/resposta, identificado por nome (+e-mail opcional)
 *
 * Segurança do público: token aleatório de 256 bits; link desativável/regenerável; Process Studio precisa estar na assinatura;
 * rate limit próprio (leitura x escrita); Zod com limites de tamanho; honeypot; e-mail do visitante nunca é devolvido;
 * respostas de erro iguais para "token inexistente" e "link desativado" (não revela quais tokens já existiram).
 */
import { NextFunction, Request, Response, Router } from 'express'
import rateLimit from 'express-rate-limit'
import { ZodError } from 'zod'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireCapability, requireProjectAccess } from '../middleware/permissions'
import { processCommentCreateSchema, processCommentStatusSchema, publicProcessCommentSchema } from '../schemas'
import { hasCapability } from '../utils/roleCapabilities'
import { isProcessStudioEnabled } from '../config/entitlements'
import {
  CommentInputError, commentsStamp, createComment, listComments, newShareToken, notifyComment, serializeComment,
} from '../services/processCommentService'
import { logger } from '../utils/logger'

const h = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res)
  } catch (e) {
    if (e instanceof ZodError) {
      return res.status(400).json({ error: 'Validation failed', message: e.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') })
    }
    if (e instanceof CommentInputError) return res.status(400).json({ error: 'Validation failed', message: e.message })
    next(e)
  }
}
const gate = (_req: Request, res: Response, next: NextFunction) => {
  if (isProcessStudioEnabled()) return next()
  res.status(403).json({ error: 'PROCESS_STUDIO_DISABLED', message: 'O Process Studio não está incluído na sua assinatura' })
}
const notFound = (res: Response, message = 'Processo não encontrado') => res.status(404).json({ error: 'Not Found', message })

// ================================================================ interno
const router = Router()
const BASE = '/projects/:projectId/processes/:pid'
router.use([`${BASE}/comments`, `${BASE}/share`], authenticate, gate)

const view = [requireProjectAccess, requireCapability('canViewProcesses')]
const loadProcess = (projectId: string, id: string) => prisma.businessProcess.findFirst({ where: { id, projectId } })

router.get(`${BASE}/comments`, ...view, h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const rows = await listComments(p.id)
  res.json({
    comments: rows.map((c) => serializeComment(c, 'internal', req.user?.userId)),
    permissions: {
      canComment: hasCapability(req.user?.role, 'canCommentProcesses'),
      canModerate: hasCapability(req.user?.role, 'canModerateProcessComments'),
    },
  })
}))

router.post(`${BASE}/comments`, requireProjectAccess, requireCapability('canCommentProcesses'), h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const body = processCommentCreateSchema.parse(req.body)
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true, email: true } })
  const c = await createComment({
    process: p, elementId: body.elementId, type: body.type, content: body.content, parentId: body.parentId,
    author: { userId: req.user!.userId, name: user?.name ?? req.user!.email, email: user?.email, viaShare: false },
  })
  res.status(201).json({ comment: serializeComment(c, 'internal', req.user?.userId) })
}))

router.patch(`${BASE}/comments/:cid`, requireProjectAccess, requireCapability('canModerateProcessComments'), h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const { status } = processCommentStatusSchema.parse(req.body)
  const c = await prisma.processComment.findFirst({ where: { id: req.params.cid, processId: p.id, parentId: null } })
  if (!c) return notFound(res, 'Comentário não encontrado')
  const upd = await prisma.processComment.update({
    where: { id: c.id },
    data: status === 'RESOLVED' ? { status, resolvedAt: new Date(), resolvedById: req.user!.userId } : { status, resolvedAt: null, resolvedById: null },
  })
  notifyComment(p, upd, 'updated')
  res.json({ comment: serializeComment(upd, 'internal', req.user?.userId) })
}))

router.delete(`${BASE}/comments/:cid`, requireProjectAccess, requireCapability('canViewProcesses'), h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const c = await prisma.processComment.findFirst({ where: { id: req.params.cid, processId: p.id } })
  if (!c) return notFound(res, 'Comentário não encontrado')
  const own = !!c.userId && c.userId === req.user?.userId
  if (!own && !hasCapability(req.user?.role, 'canModerateProcessComments')) {
    return res.status(403).json({ error: 'Forbidden', message: 'Só o autor ou a equipe do projeto pode excluir este comentário' })
  }
  await prisma.processComment.delete({ where: { id: c.id } }) // respostas saem em cascata
  notifyComment(p, c, 'deleted')
  res.status(204).end()
}))

// ---------------------------------------------------------------- link público (gestão)
const describeLink = (l: { token: string; enabled: boolean; createdAt: Date; updatedAt: Date } | null) =>
  l ? { token: l.enabled ? l.token : null, enabled: l.enabled, createdAt: l.createdAt, updatedAt: l.updatedAt } : { token: null, enabled: false }

router.get(`${BASE}/share`, ...view, h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const link = await prisma.processShareLink.findUnique({ where: { processId: p.id } })
  res.json({ ...describeLink(link), canShare: hasCapability(req.user?.role, 'canShareProcesses') })
}))

router.post(`${BASE}/share`, requireProjectAccess, requireCapability('canShareProcesses'), h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const regenerate = req.body?.regenerate === true
  const cur = await prisma.processShareLink.findUnique({ where: { processId: p.id } })
  // reativar mantém o mesmo link (quem já recebeu volta a entrar); regenerar invalida o anterior
  const link = cur
    ? await prisma.processShareLink.update({ where: { id: cur.id }, data: { enabled: true, ...(regenerate && { token: newShareToken() }) } })
    : await prisma.processShareLink.create({ data: { processId: p.id, token: newShareToken(), createdById: req.user!.userId } })
  logger.info({ processId: p.id, userId: req.user!.userId, regenerate }, 'Process share link enabled')
  res.json({ ...describeLink(link), canShare: true })
}))

router.delete(`${BASE}/share`, requireProjectAccess, requireCapability('canShareProcesses'), h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  await prisma.processShareLink.updateMany({ where: { processId: p.id }, data: { enabled: false } })
  logger.info({ processId: p.id, userId: req.user!.userId }, 'Process share link disabled')
  res.json({ token: null, enabled: false, canShare: true })
}))

export default router

// ================================================================ público
export const publicShareRouter = Router()

const isDevOrTest = () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
// leitura: o "ao vivo" consulta /state a cada ~4s por aba => 75/5min; folga para algumas abas no mesmo IP (ex.: escritório com NAT)
const readLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: (req) => isDevOrTest() || req.method === 'OPTIONS',
})
const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Muitos comentários em pouco tempo. Aguarde alguns minutos.' },
  skip: (req) => process.env.NODE_ENV === 'test' || req.method === 'OPTIONS',
})

/** Resolve o link; 404 genérico para inexistente/desativado/processo sumido. */
async function shared(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null
  const link = await prisma.processShareLink.findUnique({ where: { token }, include: { process: true } })
  return link?.enabled ? link.process : null
}
const gone = (res: Response) => res.status(404).json({ error: 'Not Found', message: 'Link inválido ou desativado' })

publicShareRouter.use('/share/:token', gate, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store') // o conteúdo muda ao vivo e o link pode ser desativado a qualquer momento
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  next()
})

publicShareRouter.get('/share/:token', readLimiter, h(async (req, res) => {
  const p = await shared(req.params.token)
  if (!p) return gone(res)
  const [rows, stamp] = await Promise.all([listComments(p.id), commentsStamp(p.id)])
  res.json({
    process: { name: p.name, rev: p.rev, updatedAt: p.updatedAt, model: JSON.parse(p.model) as unknown },
    comments: rows.map((c) => serializeComment(c, 'public')),
    stamp,
  })
}))

publicShareRouter.get('/share/:token/state', readLimiter, h(async (req, res) => {
  const p = await shared(req.params.token)
  if (!p) return gone(res)
  res.json({ rev: p.rev, stamp: await commentsStamp(p.id) })
}))

publicShareRouter.get('/share/:token/comments', readLimiter, h(async (req, res) => {
  const p = await shared(req.params.token)
  if (!p) return gone(res)
  const [rows, stamp] = await Promise.all([listComments(p.id), commentsStamp(p.id)])
  res.json({ comments: rows.map((c) => serializeComment(c, 'public')), stamp })
}))

publicShareRouter.post('/share/:token/comments', writeLimiter, h(async (req, res) => {
  const p = await shared(req.params.token)
  if (!p) return gone(res)
  const body = publicProcessCommentSchema.parse(req.body)
  if (body.website) { // honeypot: finge sucesso, não grava
    logger.info({ processId: p.id }, 'Share comment honeypot triggered, discarding')
    return res.status(201).json({ comment: null })
  }
  const c = await createComment({
    process: p, elementId: body.elementId, type: body.type, content: body.content, parentId: body.parentId,
    author: { name: body.authorName, email: body.authorEmail, viaShare: true },
  })
  res.status(201).json({ comment: serializeComment(c, 'public') })
}))
