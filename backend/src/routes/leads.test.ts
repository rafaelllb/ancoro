/**
 * Testes de leads comerciais e do fechamento do auto-cadastro como ADMIN.
 *
 * [2026-10-24] Criado: POST público de lead (validação, consentimento, honeypot), listagem só ADMIN e
 * regressão da escalada de privilégio em /auth/register — Rafael Brito
 */
import express from 'express'
import request from 'supertest'
import { generateToken } from '../middleware/auth'

jest.mock('../index', () => {
  const { PrismaClient } = require('@prisma/client')
  return { prisma: new PrismaClient({ datasources: { db: { url: 'file:./test.db' } } }) }
})
import { prisma } from '../index'
import leadsRoutes from './leads'
import authRoutes from './auth'

const app = express()
app.use(express.json())
app.use('/api/auth', authRoutes)
app.use('/api', leadsRoutes)

const valid = {
  interest: 'ENTERPRISE',
  name: 'Maria Souza',
  email: 'Maria@Empresa.com',
  company: 'Empresa SA',
  teamSize: '21-100',
  deployment: 'ONPREMISE',
  message: 'Queremos uma demo',
  consent: true,
}
let adminToken = ''
let consultantToken = ''

beforeAll(async () => {
  const admin = await prisma.user.create({ data: { name: 'a', email: 'lead-admin@t.io', password: 'x', role: 'ADMIN' } })
  const cons = await prisma.user.create({ data: { name: 'c', email: 'lead-cons@t.io', password: 'x', role: 'CONSULTANT' } })
  adminToken = generateToken({ userId: admin.id, email: admin.email, role: 'ADMIN' })
  consultantToken = generateToken({ userId: cons.id, email: cons.email, role: 'CONSULTANT' })
})
afterAll(async () => { await prisma.$disconnect() })

describe('POST /api/leads', () => {
  it('grava lead válido, normaliza e-mail e registra consentimento', async () => {
    const r = await request(app).post('/api/leads').send(valid)
    expect(r.status).toBe(201)
    const saved = await prisma.lead.findFirst({ where: { company: 'Empresa SA' } })
    expect(saved?.email).toBe('maria@empresa.com')
    expect(saved?.status).toBe('NEW')
    expect(saved?.consentAt).toBeInstanceOf(Date)
  })

  it('recusa sem consentimento (LGPD) e e-mail inválido', async () => {
    expect((await request(app).post('/api/leads').send({ ...valid, consent: false })).status).toBe(400)
    expect((await request(app).post('/api/leads').send({ ...valid, email: 'nao-e-email' })).status).toBe(400)
  })

  it('honeypot preenchido responde 201 mas não grava', async () => {
    const before = await prisma.lead.count()
    const r = await request(app).post('/api/leads').send({ ...valid, email: 'bot@spam.io', website: 'http://spam' })
    expect(r.status).toBe(201)
    expect(await prisma.lead.count()).toBe(before)
  })
})

describe('GET/PATCH /api/leads (ADMIN)', () => {
  it('anônimo 401, não-admin 403, admin 200', async () => {
    expect((await request(app).get('/api/leads')).status).toBe(401)
    expect((await request(app).get('/api/leads').set('Authorization', `Bearer ${consultantToken}`)).status).toBe(403)
    const r = await request(app).get('/api/leads').set('Authorization', `Bearer ${adminToken}`)
    expect(r.status).toBe(200)
    expect(r.body.leads.length).toBeGreaterThan(0)
  })

  it('admin atualiza status; status inválido 400', async () => {
    const lead = await prisma.lead.findFirst()
    const ok = await request(app).patch(`/api/leads/${lead!.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'CONTACTED' })
    expect(ok.status).toBe(200)
    const bad = await request(app).patch(`/api/leads/${lead!.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'XYZ' })
    expect(bad.status).toBe(400)
  })
})

describe('POST /api/auth/register — sem escalada de privilégio', () => {
  const body = { name: 'Intruso', email: 'intruso@x.io', password: 'senha123', role: 'ADMIN' }

  it('anônimo pedindo ADMIN é recusado e nada é criado', async () => {
    const r = await request(app).post('/api/auth/register').send(body)
    expect(r.status).toBe(403)
    expect(await prisma.user.findUnique({ where: { email: 'intruso@x.io' } })).toBeNull()
  })

  it('CONSULTANT autenticado também não cria usuário com papel livre', async () => {
    const r = await request(app).post('/api/auth/register').set('Authorization', `Bearer ${consultantToken}`).send(body)
    expect(r.status).toBe(403)
  })

  it('ADMIN autenticado cria usuário com o papel pedido', async () => {
    const r = await request(app).post('/api/auth/register').set('Authorization', `Bearer ${adminToken}`).send({ ...body, email: 'novo@x.io', role: 'MANAGER' })
    expect(r.status).toBe(201)
    expect(r.body.user.role).toBe('MANAGER')
  })
})
