/**
 * Process Studio — rotas de processos BPMN do projeto (Fase 4, docs/process-studio/README.md §6.4).
 *
 * Fonte da verdade = JSON do ProcessModel (BusinessProcess.model). ProcessRequirementLink é uma projeção
 * reconstruída a cada save. Concorrência otimista por `rev`/`baseRev` (409). Validação profunda via processkit.
 *
 * [2026-10-15] Criado: CRUD, versões, import/export, cobertura e publicação do portal — Rafael Brito
 */
import express, { NextFunction, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { requireCapability, requireProjectAccess } from '../middleware/permissions'
import {
  processCreateSchema, processGenerateSchema, processImportSchema, processPublishSchema, processSaveSchema, processSnapshotSchema,
} from '../schemas'
import { canDeleteProcess, hasCapability } from '../utils/roleCapabilities'
import { isProcessStudioEnabled } from '../config/entitlements'
import { getProcessKit, KitModel, ProcessKitUnavailableError } from '../services/processKit'
import { generateWithLlm, isLlmConfigured } from '../services/processGenerator'
import { createHash, randomUUID } from 'crypto'
import { getAttachmentStorage } from '../services/attachmentStorage'
import { classify, limits, sanitizeFileName } from '../services/attachmentPolicy'

const router = express.Router()
router.use(authenticate)

const BASE = '/projects/:projectId/processes'

// [2026-10-16] Criado: gate de assinatura — sem direito ao módulo, nenhuma rota de processo existe (403 estável
// para o frontend distinguir de permissão por papel). Cobre também as rotas do requisito/cobertura — Rafael Brito
router.use(
  ['/projects/:projectId/processes', '/projects/:projectId/process-requirements', '/projects/:projectId/requirements/:requirementId/processes'],
  (_req: Request, res: Response, next: NextFunction) => {
    if (isProcessStudioEnabled()) return next()
    res.status(403).json({ error: 'PROCESS_STUDIO_DISABLED', message: 'O Process Studio não está incluído na sua assinatura' })
  },
)

/** Wrapper async + mapeamento de erros do kit/Zod para HTTP. */
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res)
  } catch (e) {
    if (e instanceof ProcessKitUnavailableError) return res.status(503).json({ error: 'Service Unavailable', message: e.message })
    if (e instanceof ZodError) {
      return res.status(400).json({ error: 'Validation failed', message: e.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') })
    }
    next(e)
  }
}

const bad = (res: Response, message: string) => res.status(400).json({ error: 'Validation failed', message })
const notFound = (res: Response) => res.status(404).json({ error: 'Not Found', message: 'Processo não encontrado' })
const parseJson = (s: string): unknown => JSON.parse(s)
const zmsg = (e: ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')

/** Carrega um processo garantindo que pertence ao projeto da URL (evita acesso cruzado entre projetos). */
const loadProcess = (projectId: string, id: string) => prisma.businessProcess.findFirst({ where: { id, projectId } })

/**
 * Valida o modelo (schema + integridade) e devolve o modelo normalizado com `id` = chave do processo.
 * Erros de integridade tornam o modelo inconsistente: o servidor recusa (422). Qualidade vira `issues` informativos.
 */
function checkModel(input: unknown, key: string) {
  const kit = getProcessKit()
  const model = kit.normalizeModel({ ...(input as object), id: key })
  const integrity = kit.integrityIssues(model)
  return { kit, model, integrity }
}

type Tx = Prisma.TransactionClient

/** Reconstrói a projeção de vínculos. Devolve as referências que não casam com nenhum requisito do projeto. */
async function rebuildLinks(tx: Tx, processId: string, projectId: string, model: KitModel) {
  const kit = getProcessKit()
  const refs = kit.requirementRefsOf(model)
  const reqs = refs.length
    ? await tx.requirement.findMany({ where: { projectId, reqId: { in: [...new Set(refs.map((r) => r.ref))] } }, select: { id: true, reqId: true } })
    : []
  const byReqId = new Map(reqs.map((r) => [r.reqId, r.id]))
  await tx.processRequirementLink.deleteMany({ where: { processId } })
  const unresolved: Array<{ elementId: string; ref: string }> = []
  for (const r of refs) {
    const requirementId = byReqId.get(r.ref)
    if (!requirementId) { unresolved.push({ elementId: r.elementId, ref: r.ref }); continue }
    await tx.processRequirementLink.create({ data: { processId, elementId: r.elementId, elementName: r.elementName, requirementId } })
  }
  return unresolved
}

/** Save com concorrência otimista. Devolve null se baseRev != rev atual (conflito). */
async function saveModel(processId: string, projectId: string, baseRev: number, model: KitModel, userId: string) {
  return prisma.$transaction(async (tx) => {
    const upd = await tx.businessProcess.updateMany({
      where: { id: processId, rev: baseRev },
      data: { model: JSON.stringify(model), name: model.name, rev: { increment: 1 }, updatedById: userId },
    })
    if (upd.count === 0) return null
    const unresolved = await rebuildLinks(tx, processId, projectId, model)
    const row = await tx.businessProcess.findUniqueOrThrow({ where: { id: processId }, select: { rev: true, updatedAt: true } })
    return { rev: row.rev, updatedAt: row.updatedAt, unresolved }
  })
}

// [2026-10-27] Removido: saveAndVersion (todo save virava versão) — Rafael Brito. Motivo: "r" é o processo SALVO (concorrência otimista);
// versão é um marco criado de propósito (Versões > Salvar versão) e registra o r em que foi tirada. Misturar os dois inflava o histórico.

/**
 * Próximo número de versão + criação (a unique [processId, version] protege de corrida; o cliente pode repetir).
 * [2026-10-17] Alterado: se o conteúdo é idêntico ao da última versão NÃO cria duplicata — só aplica o rótulo (se a última não tinha).
 * Assim "Salvar" e "Versões > Salvar versão" são o mesmo mecanismo: todo save grava versão; o rótulo é opcional — Rafael Brito
 */
async function snapshot(processId: string, model: string, label: string | undefined, userId: string, rev: number) {
  const last = await prisma.processVersion.findFirst({ where: { processId }, orderBy: { version: 'desc' }, select: { version: true, model: true, label: true, createdAt: true, rev: true } })
  if (last && last.model === model) {
    if (label && !last.label) await prisma.processVersion.update({ where: { processId_version: { processId, version: last.version } }, data: { label } })
    return { version: last.version, label: last.label || label || null, createdAt: last.createdAt, rev: last.rev }
  }
  const v = await prisma.processVersion.create({ data: { processId, version: (last?.version ?? 0) + 1, label: label || null, rev, model, createdById: userId } })
  return { version: v.version, label: v.label, createdAt: v.createdAt, rev: v.rev }
}

const describe = (p: { id: string; key: string; name: string; rev: number; createdById: string | null; updatedAt: Date; createdAt: Date }, req: Request) => ({
  id: p.id, key: p.key, name: p.name, rev: p.rev, createdById: p.createdById, updatedAt: p.updatedAt, createdAt: p.createdAt,
  canDelete: canDeleteProcess(req.user?.role, req.user?.userId, p.createdById),
})

const access = [requireProjectAccess, requireCapability('canViewProcesses')]
const editing = [requireProjectAccess, requireCapability('canEditProcesses')]

// ---------------------------------------------------------------- listagem / cobertura / busca

router.get(BASE, ...access, h(async (req, res) => {
  const rows = await prisma.businessProcess.findMany({
    where: { projectId: req.params.projectId }, orderBy: { name: 'asc' },
    include: { _count: { select: { links: true, versions: true } } },
  })
  res.json({
    processes: rows.map((p) => ({ ...describe(p, req), linkCount: p._count.links, versionCount: p._count.versions })),
    permissions: {
      canEdit: hasCapability(req.user?.role, 'canEditProcesses'),
      canPublish: hasCapability(req.user?.role, 'canPublishProcesses'),
    },
  })
}))

/** Análise de lacunas: requisitos do projeto sem nenhum elemento de processo vinculado. */
router.get(`${BASE}/coverage`, ...access, h(async (req, res) => {
  const { projectId } = req.params
  const [reqs, links] = await Promise.all([
    prisma.requirement.findMany({ where: { projectId }, select: { id: true, reqId: true, shortDesc: true, module: true }, orderBy: { reqId: 'asc' } }),
    prisma.processRequirementLink.findMany({ where: { process: { projectId } }, select: { requirementId: true } }),
  ])
  const covered = new Set(links.map((l) => l.requirementId))
  const uncovered = reqs.filter((r) => !covered.has(r.id))
  res.json({ total: reqs.length, covered: reqs.length - uncovered.length, uncovered })
}))

/** "Em quais processos este requisito aparece?" */
router.get('/projects/:projectId/requirements/:requirementId/processes', ...access, h(async (req, res) => {
  const { projectId, requirementId } = req.params
  const reqRow = await prisma.requirement.findFirst({ where: { id: requirementId, projectId }, select: { id: true } })
  if (!reqRow) return res.status(404).json({ error: 'Not Found', message: 'Requisito não encontrado' })
  const links = await prisma.processRequirementLink.findMany({
    where: { requirementId }, include: { process: { select: { id: true, name: true, key: true } } }, orderBy: { process: { name: 'asc' } },
  })
  res.json({ links: links.map((l) => ({ processId: l.process.id, processName: l.process.name, elementId: l.elementId, elementName: l.elementName })) })
}))

/** Busca de requisitos para o seletor do editor (por reqId/descrição). */
router.get('/projects/:projectId/process-requirements', ...access, h(async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  // [2026-10-27] limit opcional (padrão 30, máx. 200): o diálogo de geração lista os requisitos do projeto
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 30))
  const rows = await prisma.requirement.findMany({
    where: { projectId: req.params.projectId, ...(q && { OR: [{ reqId: { contains: q } }, { shortDesc: { contains: q } }] }) },
    select: { id: true, reqId: true, shortDesc: true, module: true }, orderBy: { reqId: 'asc' }, take: limit,
  })
  res.json({ requirements: rows })
}))

// ---------------------------------------------------------------- CRUD

// [2026-10-27] Criado: geração automática de processo a partir de requisitos — Rafael Brito
// Híbrido: LLM (Claude) se houver ANTHROPIC_API_KEY, senão gerador determinístico. A saída é sempre um RASCUNHO editável
// (um processo novo por geração; subprocessos viram processos filhos). O texto dos requisitos só sai do servidor no modo LLM.
router.get(`${BASE}/generation-info`, ...editing, h(async (_req, res) => {
  // [2026-10-27] sem `model`: o nome do modelo/fornecedor não sai do servidor (a UI não o exibe)
  res.json({ llm: isLlmConfigured() })
}))

router.post(`${BASE}/generate`, ...editing, h(async (req, res) => {
  const parsed = processGenerateSchema.safeParse(req.body)
  if (!parsed.success) return bad(res, zmsg(parsed.error))
  const { projectId } = req.params
  const { requirementIds, view, name, engine } = parsed.data
  const ids = [...new Set(requirementIds)]
  const reqs = await prisma.requirement.findMany({
    where: { projectId, id: { in: ids } },
    select: { reqId: true, shortDesc: true, who: true, what: true, howAsIs: true, howToday: true, whoToBe: true, whatToBe: true, howToBe: true },
  })
  if (reqs.length !== ids.length) return res.status(404).json({ error: 'Not Found', message: 'Algum requisito não pertence a este projeto' })

  const kit = getProcessKit()
  const warnings: string[] = []
  let used: 'llm' | 'deterministic' = 'deterministic'
  let gen: ReturnType<typeof kit.generateFromRequirements> | null = null
  if (engine === 'auto' && isLlmConfigured()) {
    try {
      gen = await generateWithLlm(reqs, view, name)
      used = 'llm'
    } catch (e) {
      console.error('[processes.generate] LLM falhou, usando o gerador determinístico:', e instanceof Error ? e.message : e)
      warnings.push('llm-failed')
    }
  }
  if (!gen) gen = kit.generateFromRequirements(reqs, view, name)
  if (name) gen = { ...gen, name }

  const existing = (await prisma.businessProcess.findMany({ where: { projectId }, select: { key: true } })).map((p) => p.key)
  const checked = kit.buildGeneratedModels(gen, existing).map((m) => checkModel(m, String(m.id)))
  const broken = checked.find((c) => c.integrity.length)
  if (broken) return res.status(422).json({ error: 'Invalid model', message: broken.integrity[0]!.message, issues: broken.integrity })

  const created = await prisma.$transaction(async (tx) => {
    const rows = []
    let unresolved = 0
    for (const { model } of checked) {
      const p = await tx.businessProcess.create({
        data: { projectId, key: String(model.id), name: model.name, model: JSON.stringify(model), createdById: req.user!.userId, updatedById: req.user!.userId },
      })
      unresolved += (await rebuildLinks(tx, p.id, projectId, model)).length
      rows.push(p)
    }
    return { rows, unresolved }
  })
  const [main, ...children] = created.rows
  res.status(201).json({
    process: describe(main!, req), children: children.map((c) => describe(c, req)),
    engine: used, warnings, unresolvedRefs: created.unresolved,
    issues: kit.qualityIssues(checked[0]!.model),
  })
}))


router.post(BASE, ...editing, h(async (req, res) => {
  const parsed = processCreateSchema.safeParse(req.body)
  if (!parsed.success) return bad(res, zmsg(parsed.error))
  const { projectId } = req.params
  const kit = getProcessKit()
  const existing = (await prisma.businessProcess.findMany({ where: { projectId }, select: { key: true } })).map((p) => p.key)
  const draft: Record<string, unknown> = parsed.data.model ? { ...parsed.data.model } : { ...kit.newProcessModel(existing, parsed.data.name) }
  let key = String(draft.id)
  for (let i = 2; existing.includes(key); i++) key = `${String(draft.id)}_${i}`
  const { model, integrity } = checkModel({ ...draft, name: parsed.data.name }, key)
  if (integrity.length) return res.status(422).json({ error: 'Invalid model', message: integrity[0]!.message, issues: integrity })
  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.businessProcess.create({
      data: { projectId, key, name: model.name, model: JSON.stringify(model), createdById: req.user!.userId, updatedById: req.user!.userId },
    })
    const unresolved = await rebuildLinks(tx, p.id, projectId, model)
    return { p, unresolved }
  })
  res.status(201).json({ ...describe(created.p, req), unresolvedRefs: created.unresolved })
}))

router.get(`${BASE}/:pid`, ...access, h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  res.json({
    ...describe(p, req), model: parseJson(p.model),
    permissions: { canEdit: hasCapability(req.user?.role, 'canEditProcesses'), canPublish: hasCapability(req.user?.role, 'canPublishProcesses') },
  })
}))

router.put(`${BASE}/:pid`, ...editing, h(async (req, res) => {
  const parsed = processSaveSchema.safeParse(req.body)
  if (!parsed.success) return bad(res, zmsg(parsed.error))
  const { projectId, pid } = req.params
  const p = await loadProcess(projectId, pid)
  if (!p) return notFound(res)
  const { kit, model, integrity } = checkModel(parsed.data.model, p.key)
  if (integrity.length) return res.status(422).json({ error: 'Invalid model', message: integrity[0]!.message, issues: integrity })
  const saved = await saveModel(p.id, projectId, parsed.data.baseRev, model, req.user!.userId)
  if (!saved) {
    const cur = await prisma.businessProcess.findUnique({ where: { id: p.id }, select: { rev: true, updatedAt: true } })
    return res.status(409).json({ error: 'Conflict', message: 'O processo foi alterado por outra pessoa desde que você o abriu', currentRev: cur?.rev, updatedAt: cur?.updatedAt })
  }
  res.json({ rev: saved.rev, updatedAt: saved.updatedAt, unresolvedRefs: saved.unresolved, issues: kit.qualityIssues(model) })
}))

router.delete(`${BASE}/:pid`, requireProjectAccess, h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  if (!canDeleteProcess(req.user?.role, req.user?.userId, p.createdById)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Você só pode excluir processos que você criou' })
  }
  // [2026-10-30] Alterado: a cascata do banco apaga as linhas de anexo mas não os bytes — coleta as chaves antes e remove os blobs depois
  const blobKeys = (await prisma.processAttachment.findMany({ where: { processId: p.id }, select: { storageKey: true } })).map((a) => a.storageKey)
  await prisma.businessProcess.delete({ where: { id: p.id } })
  await purgeBlobs(blobKeys)
  res.status(204).end()
}))

// ---------------------------------------------------------------- versões

router.get(`${BASE}/:pid/versions`, ...access, h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const rows = await prisma.processVersion.findMany({ where: { processId: p.id }, orderBy: { version: 'desc' }, select: { version: true, label: true, rev: true, createdById: true, createdAt: true } })
  res.json({ versions: rows })
}))

router.post(`${BASE}/:pid/versions`, ...editing, h(async (req, res) => {
  const parsed = processSnapshotSchema.safeParse(req.body ?? {})
  if (!parsed.success) return bad(res, zmsg(parsed.error))
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  res.status(201).json(await snapshot(p.id, p.model, parsed.data.label, req.user!.userId, p.rev))
}))

router.get(`${BASE}/:pid/versions/:version`, ...access, h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const v = await prisma.processVersion.findUnique({ where: { processId_version: { processId: p.id, version: Number(req.params.version) } } })
  if (!v) return res.status(404).json({ error: 'Not Found', message: 'Versão não encontrada' })
  res.json({ version: v.version, label: v.label, rev: v.rev, createdAt: v.createdAt, model: parseJson(v.model) })
}))

/** Restaurar = novo save com o conteúdo da versão (o histórico nunca é reescrito). Guarda um snapshot do estado atual antes. */
router.post(`${BASE}/:pid/versions/:version/restore`, ...editing, h(async (req, res) => {
  const { projectId, pid } = req.params
  const p = await loadProcess(projectId, pid)
  if (!p) return notFound(res)
  const v = await prisma.processVersion.findUnique({ where: { processId_version: { processId: p.id, version: Number(req.params.version) } } })
  if (!v) return res.status(404).json({ error: 'Not Found', message: 'Versão não encontrada' })
  const { model, integrity } = checkModel(parseJson(v.model), p.key)
  if (integrity.length) return res.status(422).json({ error: 'Invalid model', message: integrity[0]!.message, issues: integrity })
  await snapshot(p.id, p.model, `Antes de restaurar v${v.version}`, req.user!.userId, p.rev)
  const saved = await saveModel(p.id, projectId, p.rev, model, req.user!.userId)
  if (!saved) return res.status(409).json({ error: 'Conflict', message: 'O processo foi alterado durante a restauração; tente novamente' })
  res.json({ rev: saved.rev, updatedAt: saved.updatedAt, unresolvedRefs: saved.unresolved })
}))

// ---------------------------------------------------------------- import / export / publicação

router.get(`${BASE}/:pid/bpmn`, ...access, h(async (req, res) => {
  const p = await loadProcess(req.params.projectId, req.params.pid)
  if (!p) return notFound(res)
  const kit = getProcessKit()
  const xml = await kit.exportBpmn(kit.normalizeModel(parseJson(p.model)))
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${p.key.replace(/[^A-Za-z0-9_.-]/g, '_')}.bpmn"`)
  res.send(xml)
}))

router.post(`${BASE}/import`, ...editing, h(async (req, res) => {
  const parsed = processImportSchema.safeParse(req.body)
  if (!parsed.success) return bad(res, zmsg(parsed.error))
  const { projectId } = req.params
  const kit = getProcessKit()
  let imported: Awaited<ReturnType<typeof kit.importFile>>
  try {
    imported = await kit.importFile(parsed.data.kind, Buffer.from(parsed.data.data, 'base64'))
  } catch (e) {
    return bad(res, `Arquivo inválido: ${e instanceof Error ? e.message : 'não foi possível ler'}`)
  }
  const existing = (await prisma.businessProcess.findMany({ where: { projectId }, select: { key: true } })).map((p) => p.key)
  // Chaves únicas no projeto; chamadas entre processos do mesmo arquivo (calledProcessId) são remapeadas junto.
  const remap = new Map<string, string>()
  for (const m of imported.models) {
    let key = m.id
    for (let i = 2; existing.includes(key); i++) key = `${m.id}_${i}`
    existing.push(key)
    remap.set(m.id, key)
  }
  const created: Array<ReturnType<typeof describe> & { unresolvedRefs: unknown[] }> = []
  for (const m of imported.models) {
    const key = remap.get(m.id)!
    const nodes = m.nodes.map((n) => (n.calledProcessId && remap.has(n.calledProcessId) ? { ...n, calledProcessId: remap.get(n.calledProcessId) } : n))
    const { model, integrity } = checkModel({ ...m, nodes }, key)
    if (integrity.length) { imported.warnings.push(`${m.name}: ignorado — ${integrity[0]!.message}`); continue }
    const r = await prisma.$transaction(async (tx) => {
      const p = await tx.businessProcess.create({ data: { projectId, key, name: model.name, model: JSON.stringify(model), createdById: req.user!.userId, updatedById: req.user!.userId } })
      return { p, unresolved: await rebuildLinks(tx, p.id, projectId, model) }
    })
    created.push({ ...describe(r.p, req), unresolvedRefs: r.unresolved })
  }
  res.status(201).json({ processes: created, warnings: imported.warnings })
}))

/** Publica o portal estático do projeto (ZIP). Atualiza o histórico (versions.json) e tira snapshot dos processos alterados. */
router.post(`${BASE}/publish`, requireProjectAccess, requireCapability('canPublishProcesses'), h(async (req, res) => {
  const parsed = processPublishSchema.safeParse(req.body ?? {})
  if (!parsed.success) return bad(res, zmsg(parsed.error))
  const { projectId } = req.params
  const kit = getProcessKit()
  const rows = await prisma.businessProcess.findMany({ where: { projectId }, orderBy: { name: 'asc' } })
  if (!rows.length) return bad(res, 'O projeto não tem processos para publicar')
  const portal = await prisma.processPortal.findUnique({ where: { projectId } })
  let previousVersions: unknown
  if (portal?.versionsJson) { try { previousVersions = JSON.parse(portal.versionsJson) } catch { previousVersions = undefined } }
  const out = await kit.publishPortal({
    models: rows.map((r) => kit.normalizeModel(parseJson(r.model))),
    versionLabel: parsed.data.label, password: parsed.data.password, brand: parsed.data.brand, previousVersions,
  })
  // Snapshot automático (só dos que mudaram desde o último snapshot) — README §6.4, decisão 5
  const suffix = parsed.data.label ? `: ${parsed.data.label}` : ''
  for (const r of rows) {
    const last = await prisma.processVersion.findFirst({ where: { processId: r.id }, orderBy: { version: 'desc' }, select: { model: true } })
    if (last?.model !== r.model) await snapshot(r.id, r.model, `Publicação${suffix}`, req.user!.userId, r.rev)
  }
  const now = new Date()
  const row = await prisma.processPortal.upsert({
    where: { projectId },
    update: { versionsJson: out.versionsFile, publishCount: { increment: 1 }, lastLabel: parsed.data.label ?? null, lastPublishedAt: now, lastPublishedById: req.user!.userId },
    create: { projectId, versionsJson: out.versionsFile, publishCount: 1, lastLabel: parsed.data.label ?? null, lastPublishedAt: now, lastPublishedById: req.user!.userId },
  })
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="portal-processos-v${row.publishCount}.zip"`)
  res.setHeader('X-Portal-Publish-Count', String(row.publishCount))
  res.send(Buffer.from(out.zip))
}))

// ---------------------------------------------------------------- anexos por elemento (repositório)
// [2026-10-30] Criado: arquivos/imagens anexados a elementos BPMN — Rafael Brito
// Upload = corpo BINÁRIO cru (sem multipart: evita dependência e buffer duplo) com ?elementId=&name=. Os metadados vão no query string
// (e não em header customizado) porque o CORS do backend só libera Content-Type/Authorization. Download sempre pela API autenticada:
// não existe URL pública do arquivo (o editor roda em iframe sem token; o host busca e repassa os bytes).

const WHOLE_PROCESS = '__process'
const ATT = `${BASE}/:pid/attachments`

/** Remove blobs sem derrubar a requisição: uma falha aqui deixa objeto órfão (custo), nunca dado exposto. */
async function purgeBlobs(keys: string[]) {
  const storage = getAttachmentStorage()
  await Promise.all(keys.map((k) => storage.delete(k).catch((e) => console.error('[attachments] falha ao remover blob', k, e instanceof Error ? e.message : e))))
}

/** ids de elementos aceitos como alvo de anexo: nós, fluxos, lanes, participantes e o processo inteiro. */
function elementIdsOf(modelJson: string): Set<string> {
  const m = parseJson(modelJson) as Record<string, Array<{ id?: string }> | undefined>
  const ids = new Set<string>([WHOLE_PROCESS])
  for (const k of ['nodes', 'flows', 'lanes', 'participants']) for (const e of m[k] ?? []) if (e?.id) ids.add(e.id)
  return ids
}

/** Lê o corpo cru com limite próprio; estouro vira 413 JSON (e não o HTML padrão do Express). */
const rawBody = (req: Request, res: Response, next: NextFunction) => {
  express.raw({ type: () => true, limit: limits().maxFileBytes })(req, res, (err?: unknown) => {
    if ((err as { type?: string } | undefined)?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload Too Large', message: `Arquivo acima do limite de ${limits().maxFileBytes / 1024 / 1024} MB` })
    }
    next(err)
  })
}

router.get(ATT, ...access, h(async (req, res) => {
  const { projectId, pid } = req.params
  const p = await loadProcess(projectId, pid)
  if (!p) return notFound(res)
  const elementId = typeof req.query.elementId === 'string' ? req.query.elementId : undefined
  const [rows, used] = await Promise.all([
    prisma.processAttachment.findMany({ where: { processId: p.id, ...(elementId && { elementId }) }, orderBy: { createdAt: 'desc' } }),
    prisma.processAttachment.aggregate({ where: { process: { projectId } }, _sum: { size: true } }),
  ])
  const names = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.uploadedById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  )
  const lim = limits()
  res.json({
    attachments: rows.map((a) => ({
      id: a.id, elementId: a.elementId, fileName: a.fileName, mimeType: a.mimeType, size: a.size, sha256: a.sha256,
      uploadedById: a.uploadedById, uploadedByName: a.uploadedById ? names.get(a.uploadedById) ?? null : null, createdAt: a.createdAt,
      canDelete: canDeleteProcess(req.user?.role, req.user?.userId, a.uploadedById),
    })),
    quota: { usedBytes: used._sum.size ?? 0, maxBytes: lim.maxProjectBytes, maxFileBytes: lim.maxFileBytes, maxPerElement: lim.maxPerElement },
  })
}))

router.post(ATT, ...editing, rawBody, h(async (req, res) => {
  const { projectId, pid } = req.params
  const p = await loadProcess(projectId, pid)
  if (!p) return notFound(res)
  const elementId = String(req.query.elementId ?? '')
  const fileName = sanitizeFileName(String(req.query.name ?? ''))
  if (!elementId || !elementIdsOf(p.model).has(elementId)) return bad(res, 'Elemento inexistente neste processo (salve o processo antes de anexar a elementos novos)')
  const body = req.body
  if (!Buffer.isBuffer(body)) return bad(res, 'Envie o arquivo como corpo binário (application/octet-stream)')
  const verdict = classify(body, fileName)
  if (!verdict.ok) return res.status(415).json({ error: 'Unsupported Media Type', message: verdict.reason })

  const lim = limits()
  const [perElement, used] = await Promise.all([
    prisma.processAttachment.count({ where: { processId: p.id, elementId } }),
    prisma.processAttachment.aggregate({ where: { process: { projectId } }, _sum: { size: true } }),
  ])
  if (perElement >= lim.maxPerElement) return res.status(409).json({ error: 'Limit', message: `Limite de ${lim.maxPerElement} anexos por elemento atingido` })
  if ((used._sum.size ?? 0) + body.length > lim.maxProjectBytes) return res.status(413).json({ error: 'Quota', message: 'Cota de armazenamento do projeto excedida' })

  const storageKey = `${projectId}/${p.id}/${randomUUID()}`
  await getAttachmentStorage().put(storageKey, body, verdict.type.mime)
  try {
    const row = await prisma.processAttachment.create({
      data: {
        processId: p.id, elementId, fileName, mimeType: verdict.type.mime, size: body.length,
        sha256: createHash('sha256').update(body).digest('hex'), storageKey, uploadedById: req.user!.userId,
      },
    })
    res.status(201).json({ id: row.id, elementId, fileName, mimeType: row.mimeType, size: row.size, sha256: row.sha256, createdAt: row.createdAt })
  } catch (e) {
    await purgeBlobs([storageKey]) // sem linha no banco o blob seria inalcançável
    throw e
  }
}))

router.get(`${ATT}/:aid/content`, ...access, h(async (req, res) => {
  const { projectId, pid, aid } = req.params
  const p = await loadProcess(projectId, pid)
  if (!p) return notFound(res)
  const a = await prisma.processAttachment.findFirst({ where: { id: aid, processId: p.id } })
  if (!a) return res.status(404).json({ error: 'Not Found', message: 'Anexo não encontrado' })
  const data = await getAttachmentStorage().get(a.storageKey)
  if (createHash('sha256').update(data).digest('hex') !== a.sha256) {
    console.error('[attachments] integridade violada', a.id)
    return res.status(500).json({ error: 'Integrity', message: 'O arquivo armazenado não confere com o registro (integridade violada)' })
  }
  // Entrega defensiva: tipo vem do servidor, nosniff, sandbox total e, exceto imagens raster, sempre como download.
  const inline = a.mimeType.startsWith('image/') && req.query.download !== '1'
  res.setHeader('Content-Type', a.mimeType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`)
  res.send(data)
}))

router.delete(`${ATT}/:aid`, ...editing, h(async (req, res) => {
  const { projectId, pid, aid } = req.params
  const p = await loadProcess(projectId, pid)
  if (!p) return notFound(res)
  const a = await prisma.processAttachment.findFirst({ where: { id: aid, processId: p.id } })
  if (!a) return res.status(404).json({ error: 'Not Found', message: 'Anexo não encontrado' })
  if (!canDeleteProcess(req.user?.role, req.user?.userId, a.uploadedById)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Você só pode excluir anexos que você enviou' })
  }
  await prisma.processAttachment.delete({ where: { id: a.id } })
  await purgeBlobs([a.storageKey])
  res.status(204).end()
}))

export default router

