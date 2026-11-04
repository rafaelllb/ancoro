/**
 * Testes das rotas do Process Studio (Fase 4) — SQLite descartável + processkit real.
 * Pré-requisito: `npm run build:processkit` (backend/vendor/processkit.cjs).
 *
 * [2026-10-15] Criado: CRUD, concorrência otimista, vínculos, versões, permissões por papel, import/export, publicação — Rafael Brito
 */
import express from 'express'
import request from 'supertest'
import { generateToken } from '../middleware/auth'

// `../index` sobe o servidor ao ser importado: substituímos por um PrismaClient apontando para o SQLite de teste.
jest.mock('../index', () => {
  const { PrismaClient } = require('@prisma/client')
  return { prisma: new PrismaClient({ datasources: { db: { url: 'file:./test.db' } } }) }
})
import { prisma } from '../index'
import processesRoutes from './processes'

const app = express()
app.use(express.json({ limit: '25mb' }))
app.use('/api', processesRoutes)

type Role = 'ADMIN' | 'MANAGER' | 'CONSULTANT' | 'CLIENT'
const users: Record<string, { id: string; token: string }> = {}
let projectId = ''
let otherProjectId = ''

const req5w2h = (reqId: string) => ({
  reqId, projectId, shortDesc: `Requisito ${reqId}`, module: 'ISU', what: 'x', why: 'x', who: 'x', when: 'x', where: 'x', howToday: 'x', howMuch: 'x',
})
const as = (name: string) => ({ Authorization: `Bearer ${users[name]!.token}` })
const P = () => `/api/projects/${projectId}/processes`

beforeAll(async () => {
  const mk = async (name: string, role: Role, member = true, proj = () => projectId) => {
    const u = await prisma.user.create({ data: { name, email: `${name}@t.io`, password: 'x', role } })
    users[name] = { id: u.id, token: generateToken({ userId: u.id, email: u.email, role }) }
    if (member) await prisma.projectUser.create({ data: { userId: u.id, projectId: proj() } })
  }
  projectId = (await prisma.project.create({ data: { name: 'P1', client: 'C', startDate: new Date() } })).id
  otherProjectId = (await prisma.project.create({ data: { name: 'P2', client: 'C', startDate: new Date() } })).id
  await mk('admin', 'ADMIN', false)
  await mk('manager', 'MANAGER')
  await mk('consultant', 'CONSULTANT')
  await mk('consultant2', 'CONSULTANT')
  await mk('client', 'CLIENT')
  await mk('outsider', 'CONSULTANT', false)
  for (const id of ['REQ-001', 'REQ-002', 'REQ-003']) await prisma.requirement.create({ data: req5w2h(id) })
})

afterAll(async () => { await prisma.$disconnect() })

describe('processos — ciclo básico', () => {
  let pid = ''
  let model: any

  it('CONSULTANT cria um processo; ele nasce com o evento de início', async () => {
    const r = await request(app).post(P()).set(as('consultant')).send({ name: 'Faturamento' })
    expect(r.status).toBe(201)
    expect(r.body.rev).toBe(1)
    pid = r.body.id
    const g = await request(app).get(`${P()}/${pid}`).set(as('client'))
    expect(g.status).toBe(200)
    model = g.body.model
    expect(model.nodes.length).toBeGreaterThan(0)
    expect(g.body.permissions.canEdit).toBe(false)
  })

  it('save com baseRev correto incrementa rev e projeta vínculos; ref inexistente volta em unresolvedRefs', async () => {
    const start = model.nodes[0]
    const next = { ...model, nodes: [{ ...start, requirementRefs: ['REQ-001', 'REQ-999'] }, ...model.nodes.slice(1)] }
    const r = await request(app).put(`${P()}/${pid}`).set(as('consultant')).send({ baseRev: 1, model: next })
    expect(r.status).toBe(200)
    expect(r.body.rev).toBe(2)
    expect(r.body.unresolvedRefs).toEqual([{ elementId: start.id, ref: 'REQ-999' }])
    expect(await prisma.processRequirementLink.count({ where: { processId: pid } })).toBe(1)
    model = { ...next }
  })

  it('save com baseRev velho => 409 e nada muda', async () => {
    const r = await request(app).put(`${P()}/${pid}`).set(as('consultant2')).send({ baseRev: 1, model })
    expect(r.status).toBe(409)
    expect(r.body.currentRev).toBe(2)
  })

  it('modelo com id duplicado é recusado (422) sem alterar o processo', async () => {
    const dup = { ...model, nodes: [model.nodes[0], model.nodes[0]] }
    const r = await request(app).put(`${P()}/${pid}`).set(as('consultant')).send({ baseRev: 2, model: dup })
    expect(r.status).toBe(422)
    expect((await prisma.businessProcess.findUnique({ where: { id: pid } }))!.rev).toBe(2)
  })

  it('cobertura e "processos do requisito"', async () => {
    const cov = await request(app).get(`${P()}/coverage`).set(as('client'))
    expect(cov.body.total).toBe(3)
    expect(cov.body.covered).toBe(1)
    expect(cov.body.uncovered.map((x: any) => x.reqId)).toEqual(['REQ-002', 'REQ-003'])
    const r1 = await prisma.requirement.findFirstOrThrow({ where: { projectId, reqId: 'REQ-001' } })
    const rp = await request(app).get(`/api/projects/${projectId}/requirements/${r1.id}/processes`).set(as('client'))
    expect(rp.body.links).toHaveLength(1)
    expect(rp.body.links[0].processId).toBe(pid)
  })

  it('busca de requisitos para o seletor', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/process-requirements?q=REQ-00`).set(as('consultant'))
    expect(r.body.requirements).toHaveLength(3)
  })

  it('versões: snapshot, restore (novo save) e guarda do estado anterior', async () => {
    const s = await request(app).post(`${P()}/${pid}/versions`).set(as('consultant')).send({ label: 'v-inicial' })
    expect(s.status).toBe(201)
    expect(s.body.version).toBe(1)
    const cleared = { ...model, nodes: [{ ...model.nodes[0], requirementRefs: [] }, ...model.nodes.slice(1)] }
    expect((await request(app).put(`${P()}/${pid}`).set(as('consultant')).send({ baseRev: 2, model: cleared })).status).toBe(200)
    expect(await prisma.processRequirementLink.count({ where: { processId: pid } })).toBe(0)
    const rs = await request(app).post(`${P()}/${pid}/versions/1/restore`).set(as('consultant'))
    expect(rs.status).toBe(200)
    expect(rs.body.rev).toBe(4)
    expect(await prisma.processRequirementLink.count({ where: { processId: pid } })).toBe(1)
    const list = await request(app).get(`${P()}/${pid}/versions`).set(as('client'))
    // [2026-10-27] Alterado: salvar NÃO cria versão; só "Salvar versão" (e o snapshot de segurança antes de restaurar). Cada versão guarda o r.
    expect(list.body.versions.map((v: any) => v.version)).toEqual([2, 1])
    expect(list.body.versions.map((v: any) => v.label)).toEqual(['Antes de restaurar v1', 'v-inicial'])
    expect(list.body.versions.map((v: any) => v.rev)).toEqual([3, 2])
  })

  it('export BPMN devolve XML', async () => {
    const r = await request(app).get(`${P()}/${pid}/bpmn`).set(as('client'))
    expect(r.status).toBe(200)
    expect(r.text).toContain('<bpmn:definitions')
  })
})

describe('permissões por papel', () => {
  let pid = ''
  beforeAll(async () => {
    pid = (await request(app).post(P()).set(as('consultant')).send({ name: 'Do consultor' })).body.id
  })

  it('CLIENT: lê mas não cria/edita/versiona/importa/publica', async () => {
    expect((await request(app).get(P()).set(as('client'))).status).toBe(200)
    expect((await request(app).post(P()).set(as('client')).send({ name: 'x' })).status).toBe(403)
    expect((await request(app).put(`${P()}/${pid}`).set(as('client')).send({ baseRev: 1, model: { id: 'x' } })).status).toBe(403)
    expect((await request(app).post(`${P()}/${pid}/versions`).set(as('client')).send({})).status).toBe(403)
    expect((await request(app).post(`${P()}/import`).set(as('client')).send({ kind: 'bpmn', data: 'eA==' })).status).toBe(403)
    expect((await request(app).post(`${P()}/publish`).set(as('client')).send({})).status).toBe(403)
    expect((await request(app).delete(`${P()}/${pid}`).set(as('client'))).status).toBe(403)
  })

  it('CONSULTANT não publica; não exclui processo de outro; exclui o próprio', async () => {
    expect((await request(app).post(`${P()}/publish`).set(as('consultant')).send({})).status).toBe(403)
    expect((await request(app).delete(`${P()}/${pid}`).set(as('consultant2'))).status).toBe(403)
    expect((await request(app).delete(`${P()}/${pid}`).set(as('manager'))).status).toBe(403) // MANAGER só exclui os próprios
    expect((await request(app).delete(`${P()}/${pid}`).set(as('consultant'))).status).toBe(204)
  })

  it('ADMIN exclui qualquer processo', async () => {
    const id = (await request(app).post(P()).set(as('consultant')).send({ name: 'Outro' })).body.id
    expect((await request(app).delete(`${P()}/${id}`).set(as('admin'))).status).toBe(204)
  })

  it('quem não é membro do projeto não acessa; processo de outro projeto dá 404', async () => {
    expect((await request(app).get(P()).set(as('outsider'))).status).toBe(403)
    const id = (await request(app).post(P()).set(as('consultant')).send({ name: 'Isolado' })).body.id
    expect((await request(app).get(`/api/projects/${otherProjectId}/processes/${id}`).set(as('admin'))).status).toBe(404)
  })

  it('sem token => 401', async () => {
    expect((await request(app).get(P())).status).toBe(401)
  })
})

describe('importação e publicação', () => {
  it('importa BPMN (round-trip do export) com chave única e vínculo resolvido', async () => {
    const created = (await request(app).post(P()).set(as('manager')).send({ name: 'Origem' })).body
    const xml = (await request(app).get(`${P()}/${created.id}/bpmn`).set(as('manager'))).text
    const r = await request(app).post(`${P()}/import`).set(as('manager')).send({ kind: 'bpmn', data: Buffer.from(xml).toString('base64') })
    expect(r.status).toBe(201)
    expect(r.body.processes).toHaveLength(1)
    expect(r.body.processes[0].key).not.toBe(created.key)
  })

  it('arquivo inválido => 400', async () => {
    const r = await request(app).post(`${P()}/import`).set(as('manager')).send({ kind: 'bpm', data: Buffer.from('lixo').toString('base64') })
    expect(r.status).toBe(400)
  })

  it('MANAGER publica: ZIP válido, contador sobe e histórico guarda versions.json', async () => {
    const r = await request(app).post(`${P()}/publish`).set(as('manager')).send({ label: 'Release 1' }).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => cb(null, Buffer.concat(chunks)))
    })
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toContain('application/zip')
    expect((r.body as Buffer).subarray(0, 2).toString()).toBe('PK')
    const portal = await prisma.processPortal.findUniqueOrThrow({ where: { projectId } })
    expect(portal.publishCount).toBe(1)
    expect(portal.versionsJson.length).toBeGreaterThan(2)
    const again = await request(app).post(`${P()}/publish`).set(as('admin')).send({ label: 'Release 2' }).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => cb(null, Buffer.concat(chunks)))
    })
    expect(again.headers['x-portal-publish-count']).toBe('2')
  })
})

// [2026-10-16] Criado: gate de assinatura (PROCESS_STUDIO_ENABLED) — sem assinatura nenhuma rota de processo responde — Rafael Brito
describe('assinatura (liga/desliga)', () => {
  const prev = process.env.PROCESS_STUDIO_ENABLED
  afterEach(() => { if (prev === undefined) delete process.env.PROCESS_STUDIO_ENABLED; else process.env.PROCESS_STUDIO_ENABLED = prev })

  it('desligado: 403 PROCESS_STUDIO_DISABLED em lista, criação e rota do requisito — até para ADMIN', async () => {
    process.env.PROCESS_STUDIO_ENABLED = 'false'
    for (const r of [
      await request(app).get(P()).set(as('admin')),
      await request(app).post(P()).set(as('admin')).send({ name: 'X' }),
      await request(app).get(`/api/projects/${projectId}/requirements/REQ-001/processes`).set(as('admin')),
      await request(app).get(`/api/projects/${projectId}/process-requirements`).set(as('admin')),
    ]) {
      expect(r.status).toBe(403)
      expect(r.body.error).toBe('PROCESS_STUDIO_DISABLED')
    }
  })

  it('ligado: volta a responder', async () => {
    process.env.PROCESS_STUDIO_ENABLED = 'true'
    expect((await request(app).get(P()).set(as('admin'))).status).toBe(200)
  })
})

// [2026-10-27] Criado: geração automática de processo a partir de requisitos (motor determinístico; o LLM é mockado por ausência de chave) — Rafael Brito
describe('geração automática a partir de requisitos', () => {
  let ids: string[] = []
  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY
    await prisma.requirement.update({
      where: { projectId_reqId: { projectId, reqId: 'REQ-001' } },
      data: { who: 'Comercial', howToBe: '1. Consultar crédito\n2. Se crédito aprovado, criar contrato; senão, encerrar proposta\n3. Notificar cliente' },
    })
    ids = (await prisma.requirement.findMany({ where: { projectId, reqId: { in: ['REQ-001', 'REQ-002'] } }, select: { id: true } })).map((r) => r.id)
  })

  it('generation-info: sem chave => llm=false', async () => {
    const r = await request(app).get(`${P()}/generation-info`).set(as('consultant'))
    expect(r.status).toBe(200)
    expect(r.body.llm).toBe(false)
  })

  it('gera processo com raias, decisão e vínculos aos requisitos; projeção de links criada', async () => {
    const r = await request(app).post(`${P()}/generate`).set(as('consultant')).send({ requirementIds: ids, view: 'TO_BE' })
    expect(r.status).toBe(201)
    expect(r.body.engine).toBe('deterministic')
    const got = await request(app).get(`${P()}/${r.body.process.id}`).set(as('consultant'))
    expect(got.body.model.lanes.length).toBeGreaterThanOrEqual(1)
    expect(got.body.model.nodes.some((n: any) => n.kind === 'gateway' && n.name === 'Crédito aprovado?')).toBe(true)
    expect(got.body.model.nodes.every((n: any) => n.bounds)).toBe(true) // já vem com layout
    expect(await prisma.processRequirementLink.count({ where: { processId: r.body.process.id } })).toBeGreaterThan(0)
    expect(r.body.unresolvedRefs).toBe(0)
  })

  it('requisito de outro projeto => 404; CLIENT => 403; sem ids => 400', async () => {
    const foreign = await prisma.requirement.create({ data: { ...req5w2h('REQ-X'), projectId: otherProjectId } })
    expect((await request(app).post(`${P()}/generate`).set(as('consultant')).send({ requirementIds: [foreign.id] })).status).toBe(404)
    expect((await request(app).post(`${P()}/generate`).set(as('client')).send({ requirementIds: ids })).status).toBe(403)
    expect((await request(app).post(`${P()}/generate`).set(as('consultant')).send({ requirementIds: [] })).status).toBe(400)
  })
})

// [2026-10-30] Criado: anexos por elemento BPMN — upload/validação/isolamento/permissões/limpeza de blobs — Rafael Brito
describe('anexos por elemento', () => {
  // PNG 1x1 válido e PDF mínimo; os "falsos" provam que a assinatura binária manda, não a extensão
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
  let pid = ''
  let elementId = ''
  let dir = ''
  const A = () => `${P()}/${pid}/attachments`
  const up = (who: string, name: string, body: Buffer, el = elementId, proc = () => pid) =>
    request(app).post(`${P()}/${proc()}/attachments?elementId=${encodeURIComponent(el)}&name=${encodeURIComponent(name)}`)
      .set(as(who)).set('Content-Type', 'application/octet-stream').send(body)
  const firstNode = async (id: string) => (await request(app).get(`${P()}/${id}`).set(as('consultant'))).body.model.nodes[0].id as string

  beforeAll(async () => {
    const { mkdtempSync } = require('fs'); const { tmpdir } = require('os'); const { join } = require('path')
    dir = mkdtempSync(join(tmpdir(), 'att-'))
    const { LocalDiskStorage, setAttachmentStorage } = require('../services/attachmentStorage')
    setAttachmentStorage(new LocalDiskStorage(dir))
    pid = (await request(app).post(P()).set(as('consultant')).send({ name: 'Com anexos' })).body.id
    elementId = await firstNode(pid)
  })
  afterAll(() => {
    require('fs').rmSync(dir, { recursive: true, force: true })
    require('../services/attachmentStorage').setAttachmentStorage(null)
  })

  let imgId = ''
  it('anexa imagem a um elemento, lista e baixa os mesmos bytes (inline, nosniff, sandbox)', async () => {
    const r = await up('consultant', 'tela.png', PNG)
    expect(r.status).toBe(201)
    expect(r.body.mimeType).toBe('image/png')
    imgId = r.body.id
    const l = await request(app).get(`${A()}?elementId=${elementId}`).set(as('client'))
    expect(l.status).toBe(200)
    expect(l.body.attachments).toHaveLength(1)
    expect(l.body.attachments[0].canDelete).toBe(false)
    const d = await request(app).get(`${A()}/${imgId}/content`).set(as('client'))
      .buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))) })
    expect(d.status).toBe(200)
    expect(Buffer.compare(d.body, PNG)).toBe(0)
    expect(d.headers['content-disposition']).toMatch(/^inline/)
    expect(d.headers['x-content-type-options']).toBe('nosniff')
    expect(d.headers['content-security-policy']).toContain('sandbox')
  })

  it('PDF baixa como attachment; anexo ao processo inteiro (__process) é aceito', async () => {
    const r = await up('consultant', 'norma.pdf', PDF, '__process')
    expect(r.status).toBe(201)
    const d = await request(app).get(`${A()}/${r.body.id}/content`).set(as('client'))
    expect(d.headers['content-disposition']).toMatch(/^attachment/)
  })

  it('recusa: conteúdo que não bate com a extensão, SVG/HTML/EXE, vazio, elemento inexistente', async () => {
    expect((await up('consultant', 'falso.png', Buffer.from('MZ\x90\x00 executavel'))).status).toBe(415)
    expect((await up('consultant', 'x.svg', Buffer.from('<svg onload="alert(1)"/>'))).status).toBe(415)
    expect((await up('consultant', 'x.html', Buffer.from('<script>1</script>'))).status).toBe(415)
    expect((await up('consultant', 'x.png', PDF)).status).toBe(415) // PDF com extensão de imagem
    expect((await up('consultant', 'vazio.txt', Buffer.alloc(0))).status).toBe(415)
    expect((await up('consultant', 'a.png', PNG, 'nao-existe')).status).toBe(400)
  })

  it('nome malicioso é neutralizado (sem caminho) e a chave no storage nunca deriva dele', async () => {
    const r = await up('consultant', '../../etc/passwd.png', PNG)
    expect(r.status).toBe(201)
    expect(r.body.fileName).toBe('passwd.png')
    const row = await prisma.processAttachment.findUniqueOrThrow({ where: { id: r.body.id } })
    expect(row.storageKey).not.toContain('passwd')
  })

  it('CLIENT não envia; não-membro não lê; outro projeto dá 404; sem token 401', async () => {
    expect((await up('client', 'a.png', PNG)).status).toBe(403)
    expect((await request(app).get(A()).set(as('outsider'))).status).toBe(403)
    expect((await request(app).get(`/api/projects/${otherProjectId}/processes/${pid}/attachments`).set(as('admin'))).status).toBe(404)
    expect((await request(app).get(`${A()}/${imgId}/content`)).status).toBe(401)
  })

  it('exclusão: só quem enviou (ou ADMIN); remove linha E blob', async () => {
    expect((await request(app).delete(`${A()}/${imgId}`).set(as('consultant2'))).status).toBe(403)
    const key = (await prisma.processAttachment.findUniqueOrThrow({ where: { id: imgId } })).storageKey
    const { existsSync } = require('fs'); const { join } = require('path')
    expect(existsSync(join(dir, key))).toBe(true)
    expect((await request(app).delete(`${A()}/${imgId}`).set(as('consultant'))).status).toBe(204)
    expect(existsSync(join(dir, key))).toBe(false)
    expect(await prisma.processAttachment.count({ where: { id: imgId } })).toBe(0)
  })

  it('arquivo adulterado no storage => 500 de integridade (hash não confere)', async () => {
    const r = await up('consultant', 'ok.png', PNG)
    const row = await prisma.processAttachment.findUniqueOrThrow({ where: { id: r.body.id } })
    require('fs').writeFileSync(require('path').join(dir, row.storageKey), Buffer.concat([PNG, Buffer.from('x')]))
    expect((await request(app).get(`${A()}/${r.body.id}/content`).set(as('client'))).status).toBe(500)
  })

  it('excluir o processo apaga os blobs também', async () => {
    const id = (await request(app).post(P()).set(as('consultant')).send({ name: 'Descartável' })).body.id
    const r = await up('consultant', 'a.png', PNG, await firstNode(id), () => id)
    const key = (await prisma.processAttachment.findUniqueOrThrow({ where: { id: r.body.id } })).storageKey
    expect((await request(app).delete(`${P()}/${id}`).set(as('consultant'))).status).toBe(204)
    expect(require('fs').existsSync(require('path').join(dir, key))).toBe(false)
  })

  it('limites: por arquivo (413) e por elemento (409)', async () => {
    process.env.ATTACHMENT_MAX_FILE_MB = '1'
    process.env.ATTACHMENT_MAX_PER_ELEMENT = '2'
    try {
      const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024 * 1024 + 10, 0x41)])
      expect((await up('consultant', 'grande.pdf', big)).status).toBe(413)
      const fresh = (await request(app).post(P()).set(as('consultant')).send({ name: 'Limite' })).body.id
      const fel = await firstNode(fresh)
      expect((await up('consultant', '1.png', PNG, fel, () => fresh)).status).toBe(201)
      expect((await up('consultant', '2.png', PNG, fel, () => fresh)).status).toBe(201)
      expect((await up('consultant', '3.png', PNG, fel, () => fresh)).status).toBe(409)
    } finally {
      delete process.env.ATTACHMENT_MAX_FILE_MB
      delete process.env.ATTACHMENT_MAX_PER_ELEMENT
    }
  })
})
