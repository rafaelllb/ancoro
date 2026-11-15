/**
 * Testes: comentários de processo (interno) e link público de revisão (sem login).
 * [2026-11-10] Criado — Rafael Brito
 */
import express from 'express'
import request from 'supertest'
import { generateToken } from '../middleware/auth'

jest.mock('../index', () => {
  const { PrismaClient } = require('@prisma/client')
  return { prisma: new PrismaClient({ datasources: { db: { url: 'file:./test.db' } } }) }
})
// o Socket.io não sobe nos testes: só registramos o que seria emitido
const emitted: any[] = []
jest.mock('../services/notificationService', () => ({ emitToProject: (_p: string, e: unknown) => emitted.push(e) }))

import { prisma } from '../index'
import processCommentsRoutes, { publicShareRouter } from './processComments'

const app = express()
app.use(express.json())
app.use('/api/public', publicShareRouter)
app.use('/api', processCommentsRoutes)

type Role = 'ADMIN' | 'MANAGER' | 'CONSULTANT' | 'CLIENT'
const users: Record<string, { id: string; token: string }> = {}
let projectId = ''
let pid = ''
const as = (name: string) => ({ Authorization: `Bearer ${users[name]!.token}` })
const C = () => `/api/projects/${projectId}/processes/${pid}/comments`
const S = () => `/api/projects/${projectId}/processes/${pid}/share`

const MODEL = {
  id: 'Proc_Fat', name: 'Faturamento', version: 1,
  nodes: [{ id: 't1', kind: 'task', name: 'Calcular fatura' }, { id: 's1', kind: 'start', name: '' }],
  flows: [{ id: 'f1', kind: 'sequence', sourceId: 's1', targetId: 't1' }],
  lanes: [{ id: 'L1', name: 'Faturamento' }], participants: [],
}

beforeAll(async () => {
  const mk = async (name: string, role: Role, member = true) => {
    const u = await prisma.user.create({ data: { name: `Nome ${name}`, email: `${name}.cm@t.io`, password: 'x', role } })
    users[name] = { id: u.id, token: generateToken({ userId: u.id, email: u.email, role }) }
    if (member) await prisma.projectUser.create({ data: { userId: u.id, projectId } })
  }
  projectId = (await prisma.project.create({ data: { name: 'PC', client: 'C', startDate: new Date() } })).id
  await mk('manager', 'MANAGER')
  await mk('consultant', 'CONSULTANT')
  await mk('client', 'CLIENT')
  await mk('client2', 'CLIENT')
  await mk('outsider', 'MANAGER', false)
  pid = (await prisma.businessProcess.create({ data: { projectId, key: 'Proc_Fat', name: 'Faturamento', model: JSON.stringify(MODEL) } })).id
})

afterAll(async () => { await prisma.$disconnect() })

describe('comentários internos', () => {
  let rootId = ''

  it('CLIENT comenta uma atividade; nome do elemento é copiado; equipe é notificada', async () => {
    emitted.length = 0
    const r = await request(app).post(C()).set(as('client')).send({ elementId: 't1', type: 'CHANGE_REQUEST', content: 'Incluir a tarifa social' })
    expect(r.status).toBe(201)
    expect(r.body.comment).toMatchObject({ elementId: 't1', elementName: 'Calcular fatura', type: 'CHANGE_REQUEST', status: 'OPEN', authorName: 'Nome client', viaShare: false, mine: true })
    rootId = r.body.comment.id
    expect(emitted[0]).toMatchObject({ type: 'process:comment', projectId, data: { metadata: { processId: pid, elementId: 't1', kind: 'created' } } })
  })

  it('processo geral (__process) e elemento inexistente', async () => {
    const ok = await request(app).post(C()).set(as('client')).send({ elementId: '__process', content: 'Visão geral ok' })
    expect(ok.status).toBe(201)
    expect(ok.body.comment.elementName).toBe('Faturamento')
    const bad = await request(app).post(C()).set(as('client')).send({ elementId: 'nao_existe', content: 'x' })
    expect(bad.status).toBe(400)
    const html = await request(app).post(C()).set(as('client')).send({ elementId: '<script>', content: 'x' })
    expect(html.status).toBe(400)
  })

  it('resposta herda o elemento do raiz e reabre um tópico resolvido', async () => {
    const res = await request(app).patch(`${C()}/${rootId}`).set(as('consultant')).send({ status: 'RESOLVED' })
    expect(res.status).toBe(200)
    expect(res.body.comment.status).toBe('RESOLVED')
    const reply = await request(app).post(C()).set(as('client')).send({ elementId: 's1', parentId: rootId, content: 'Ainda falta o desconto' })
    expect(reply.status).toBe(201)
    expect(reply.body.comment).toMatchObject({ parentId: rootId, elementId: 't1' })
    const root = await prisma.processComment.findUnique({ where: { id: rootId } })
    expect(root?.status).toBe('OPEN')
  })

  it('CLIENT não modera; só apaga o próprio', async () => {
    expect((await request(app).patch(`${C()}/${rootId}`).set(as('client')).send({ status: 'RESOLVED' })).status).toBe(403)
    expect((await request(app).delete(`${C()}/${rootId}`).set(as('client2'))).status).toBe(403)
    const mine = await request(app).post(C()).set(as('client2')).send({ elementId: 'L1', content: 'apagar' })
    expect((await request(app).delete(`${C()}/${mine.body.comment.id}`).set(as('client2'))).status).toBe(204)
  })

  it('não-membro não lê', async () => {
    expect((await request(app).get(C()).set(as('outsider'))).status).toBe(403)
  })

  it('lista traz e-mail para a equipe interna e as permissões do papel', async () => {
    const r = await request(app).get(C()).set(as('consultant'))
    expect(r.status).toBe(200)
    expect(r.body.comments.length).toBeGreaterThanOrEqual(3)
    expect(r.body.comments[0].authorEmail).toBe('client.cm@t.io')
    expect(r.body.permissions).toEqual({ canComment: true, canModerate: true })
  })
})

describe('link público de revisão', () => {
  let token = ''
  const PUB = () => `/api/public/share/${token}`

  it('só quem pode compartilhar cria o link', async () => {
    expect((await request(app).post(S()).set(as('consultant')).send({})).status).toBe(403)
    expect((await request(app).post(S()).set(as('client')).send({})).status).toBe(403)
    const r = await request(app).post(S()).set(as('manager')).send({})
    expect(r.status).toBe(200)
    expect(r.body.enabled).toBe(true)
    token = r.body.token
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
  })

  it('SEM login: vê o processo e os comentários, sem e-mails', async () => {
    const r = await request(app).get(PUB())
    expect(r.status).toBe(200)
    expect(r.body.process.name).toBe('Faturamento')
    expect(r.body.process.model.nodes.map((n: any) => n.id)).toContain('t1')
    expect(r.body.comments.length).toBeGreaterThan(0)
    expect(JSON.stringify(r.body)).not.toContain('@t.io')
    expect(r.headers['cache-control']).toBe('no-store')
  })

  it('SEM login: comenta identificando-se; nome é obrigatório; e-mail não volta', async () => {
    expect((await request(app).post(`${PUB()}/comments`).send({ elementId: 't1', content: 'x' })).status).toBe(400)
    const r = await request(app).post(`${PUB()}/comments`).send({ elementId: 't1', type: 'QUESTION', content: 'Qual o prazo?', authorName: 'Maria (cliente)', authorEmail: 'maria@cliente.com' })
    expect(r.status).toBe(201)
    expect(r.body.comment).toMatchObject({ authorName: 'Maria (cliente)', viaShare: true, type: 'QUESTION' })
    expect(r.body.comment.authorEmail).toBeUndefined()
    const row = await prisma.processComment.findUnique({ where: { id: r.body.comment.id } })
    expect(row?.authorEmail).toBe('maria@cliente.com')
    expect(row?.userId).toBeNull()
  })

  it('honeypot finge sucesso e não grava', async () => {
    const before = await prisma.processComment.count({ where: { processId: pid } })
    const r = await request(app).post(`${PUB()}/comments`).send({ elementId: 't1', content: 'spam', authorName: 'Bot', website: 'http://spam' })
    expect(r.status).toBe(201)
    expect(await prisma.processComment.count({ where: { processId: pid } })).toBe(before)
  })

  it('/state muda o carimbo quando entra comentário (base do "ao vivo")', async () => {
    const a = (await request(app).get(`${PUB()}/state`)).body
    await request(app).post(C()).set(as('consultant')).send({ elementId: 't1', content: 'Prazo: D+3' })
    const b = (await request(app).get(`${PUB()}/state`)).body
    expect(a.rev).toBe(b.rev)
    expect(a.stamp).not.toBe(b.stamp)
  })

  it('desativar derruba o link; reativar volta o MESMO; regenerar invalida o anterior', async () => {
    expect((await request(app).delete(S()).set(as('manager'))).status).toBe(200)
    expect((await request(app).get(PUB())).status).toBe(404)
    expect((await request(app).post(`${PUB()}/comments`).send({ elementId: 't1', content: 'x', authorName: 'Maria' })).status).toBe(404)
    const re = await request(app).post(S()).set(as('manager')).send({})
    expect(re.body.token).toBe(token)
    expect((await request(app).get(PUB())).status).toBe(200)
    const old = token
    const rg = await request(app).post(S()).set(as('manager')).send({ regenerate: true })
    token = rg.body.token
    expect(token).not.toBe(old)
    expect((await request(app).get(`/api/public/share/${old}`)).status).toBe(404)
    expect((await request(app).get(PUB())).status).toBe(200)
  })

  it('token malformado ou inexistente => 404 genérico', async () => {
    expect((await request(app).get('/api/public/share/abc')).status).toBe(404)
    expect((await request(app).get(`/api/public/share/${'x'.repeat(43)}`)).status).toBe(404)
  })

  it('CLIENT vê se existe link mas não recebe o token para gerir', async () => {
    const r = await request(app).get(S()).set(as('client'))
    expect(r.status).toBe(200)
    expect(r.body.canShare).toBe(false)
  })
})
