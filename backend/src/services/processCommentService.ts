/**
 * Comentários de processo (por elemento) e link público de revisão.
 *
 * [2026-11-10] Criado: o cliente valida o processo por um link público (sem login/senha) e comenta cada atividade ou o processo
 * geral, identificando-se por nome; a equipe vê ao vivo (Socket.io) e responde/resolve no editor — Rafael Brito
 *
 * Decisões:
 * - O elemento comentado precisa EXISTIR no modelo atual (ou ser "__process"): o link público não vira depósito de ids arbitrários.
 * - `elementName` é copiado na criação: o comentário continua legível se a atividade for renomeada/excluída depois.
 * - Respostas são de UM nível (parentId sempre aponta para um comentário raiz do mesmo processo). Status só vale no raiz.
 * - O e-mail do visitante nunca sai pela API pública (só a equipe interna vê).
 */
import { randomBytes } from 'crypto'
import type { ProcessComment } from '@prisma/client'
import { prisma } from '../index'
import { emitToProject } from './notificationService'

export const PROCESS_ELEMENT = '__process'

interface ModelLike {
  name?: string
  nodes?: Array<{ id: string; name?: string }>
  flows?: Array<{ id: string; name?: string }>
  lanes?: Array<{ id: string; name?: string }>
  participants?: Array<{ id: string; name?: string }>
}

/** Nome do elemento no modelo (string vazia se não tem nome) ou null se o elemento não existe. */
export function elementNameOf(modelJson: string, elementId: string): string | null {
  let m: ModelLike
  try { m = JSON.parse(modelJson) as ModelLike } catch { return null }
  if (elementId === PROCESS_ELEMENT) return m.name ?? ''
  for (const list of [m.nodes, m.flows, m.lanes, m.participants]) {
    const hit = list?.find((x) => x.id === elementId)
    if (hit) return hit.name ?? ''
  }
  return null
}

export const newShareToken = (): string => randomBytes(32).toString('base64url')

export type CommentAudience = 'internal' | 'public'

/** Representação na API. `public` omite e-mail e ids de usuário. */
export function serializeComment(c: ProcessComment, audience: CommentAudience, viewerUserId?: string) {
  const base = {
    id: c.id, elementId: c.elementId, elementName: c.elementName, type: c.type, content: c.content, status: c.status,
    parentId: c.parentId, authorName: c.authorName, viaShare: c.viaShare, createdAt: c.createdAt, updatedAt: c.updatedAt, resolvedAt: c.resolvedAt,
  }
  if (audience === 'public') return base
  return { ...base, authorEmail: c.authorEmail, userId: c.userId, mine: !!viewerUserId && c.userId === viewerUserId }
}

export const listComments = (processId: string) =>
  prisma.processComment.findMany({ where: { processId }, orderBy: { createdAt: 'asc' } })

/**
 * Carimbo barato de "algo mudou": quantidade + última atualização. O link público consulta isso a cada poucos segundos
 * e só baixa a lista quando o carimbo muda.
 */
export async function commentsStamp(processId: string): Promise<string> {
  const agg = await prisma.processComment.aggregate({ where: { processId }, _count: { _all: true }, _max: { updatedAt: true } })
  return `${agg._count._all}:${agg._max.updatedAt?.getTime() ?? 0}`
}

export class CommentInputError extends Error {}

interface CreateInput {
  process: { id: string; projectId: string; name: string; model: string }
  elementId: string
  type: string
  content: string
  parentId?: string
  author: { userId?: string; name: string; email?: string | null; viaShare: boolean }
}

export async function createComment(input: CreateInput): Promise<ProcessComment> {
  const { process: p, author } = input
  let elementId = input.elementId
  let elementName = elementNameOf(p.model, elementId)
  let parentId: string | null = null
  if (input.parentId) {
    const parent = await prisma.processComment.findFirst({ where: { id: input.parentId, processId: p.id } })
    if (!parent) throw new CommentInputError('Comentário respondido não existe neste processo')
    // resposta a resposta vira resposta ao raiz (um nível só); o elemento é o do raiz
    parentId = parent.parentId ?? parent.id
    elementId = parent.elementId
    elementName = parent.elementName
  } else if (elementName === null) {
    throw new CommentInputError('Elemento não existe no processo')
  }
  const c = await prisma.processComment.create({
    data: {
      processId: p.id, elementId, elementName: elementName ?? '', type: input.type, content: input.content, parentId,
      userId: author.userId ?? null, authorName: author.name, authorEmail: author.email || null, viaShare: author.viaShare,
    },
  })
  // reabrir: uma resposta nova num tópico resolvido o devolve para "aberto" (alguém ainda está falando dele)
  if (parentId) await prisma.processComment.updateMany({ where: { id: parentId, status: 'RESOLVED' }, data: { status: 'OPEN', resolvedAt: null, resolvedById: null } })
  notifyComment(p, c)
  return c
}

/** Avisa a equipe do projeto (sino de notificações + editor aberto recarrega os comentários). Melhor-esforço. */
export function notifyComment(p: { id: string; projectId: string; name: string }, c: ProcessComment, kind: 'created' | 'updated' | 'deleted' = 'created') {
  try {
    emitToProject(p.projectId, {
      type: 'process:comment',
      projectId: p.projectId,
      data: {
        id: c.id,
        title: p.name,
        message: kind === 'created' ? `${c.authorName}: ${c.content.slice(0, 140)}` : '',
        userId: c.userId ?? undefined,
        userName: c.authorName,
        severity: c.type === 'CHANGE_REQUEST' && kind === 'created' ? 'warning' : 'info',
        timestamp: new Date(),
        metadata: { processId: p.id, elementId: c.elementId, elementName: c.elementName, kind, viaShare: c.viaShare, silent: kind !== 'created' },
      },
    })
  } catch { /* socket indisponível não pode derrubar o comentário */ }
}
