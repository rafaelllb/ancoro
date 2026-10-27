/**
 * App Express do Process Studio standalone (Fase 6). Fábrica pura: recebe config, banco, mailer e kit → testável sem rede.
 *
 * Mesmo contrato HTTP/semântica do adaptador Ancoro (backend/src/routes/processes.ts), com duas diferenças deliberadas:
 *  - sem "projeto": a instância é um único repositório de processos (multi-repositório fica como evolução);
 *  - sem requisitos: o catálogo de referências é a projeção `process_refs` (qualquer código, ex.: "REQ-014", "RF-3").
 *
 * [2026-10-16] Criado: Fase 6 — adaptador standalone (docs/process-studio/README.md §6.5) — Rafael Brito
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import {
  authenticate, can, canDelete, clearSessionCookie, createAuth, csrfGuard, normalizeEmail, requireCap, setSessionCookie, COOKIE, readCookie,
  type Role,
} from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import type { KitModel, ProcessKit } from './kit.js';
import type { Mailer } from './mailer.js';

export interface AppDeps { cfg: Config; db: Db; mailer: Mailer; kit: ProcessKit }

const zmsg = (e: ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
const bad = (res: Response, message: string) => res.status(400).json({ error: 'Validation failed', message });
const notFound = (res: Response, what = 'Processo') => res.status(404).json({ error: 'Not Found', message: `${what} não encontrado` });
const nowIso = () => new Date().toISOString();

// O `model` é validado em profundidade pelo processkit (mesmo schema do editor); aqui só garantimos o envelope.
const envelope = z.object({ id: z.string().min(1) }).passthrough();
const createSchema = z.object({ name: z.string().trim().min(1).max(200), model: envelope.optional() });
const saveSchema = z.object({ baseRev: z.number().int().min(1), model: envelope });
const snapshotSchema = z.object({ label: z.string().trim().max(120).optional() });
const importSchema = z.object({ kind: z.enum(['bpm', 'bpmn']), data: z.string().min(1) });
const publishSchema = z.object({
  label: z.string().trim().max(120).optional(),
  password: z.string().min(6).max(200).optional(),
  brand: z.record(z.string(), z.unknown()).optional(),
});
const requestSchema = z.object({ email: z.string().email().max(254) });
const verifySchema = z.union([
  z.object({ email: z.string().email().max(254), code: z.string().regex(/^\d{6}$/) }),
  z.object({ token: z.string().min(20).max(200) }),
]);
const inviteSchema = z.object({ email: z.string().email().max(254), name: z.string().trim().max(120).optional(), role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']) });
const patchUserSchema = z.object({ name: z.string().trim().max(120).optional(), role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).optional(), disabled: z.boolean().optional() });

interface ProcRow { id: string; key: string; name: string; model: string; rev: number; created_by: string | null; created_at: string; updated_at: string }

export function createApp({ cfg, db, mailer, kit }: AppDeps) {
  const auth = createAuth(db, cfg, mailer);
  auth.bootstrapAdmin();

  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // O editor roda num iframe MESMA origem; script só do próprio host. TODO [ESTIGMERGIA]: portal publicado tem inline script (não é servido por aqui).
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
    next();
  });

  // ---- estáticos (shell + editor compilado)
  app.use(express.static(cfg.publicDir, { index: 'index.html', maxAge: cfg.production ? '1h' : 0 }));

  // ---- parsing: limites distintos (import/save de modelos grandes vs. o resto)
  app.use('/api/processes', express.json({ limit: '25mb' }));
  app.use('/api', express.json({ limit: '32kb' }));
  app.use('/api', csrfGuard);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', kit: kit.KIT_VERSION }));

  // ---------------------------------------------------------------- auth
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'Too Many Requests', message: 'Muitas tentativas; aguarde alguns minutos' } });

  app.post('/api/auth/request', authLimiter, async (req, res, next) => {
    try {
      const p = requestSchema.safeParse(req.body);
      if (!p.success) return bad(res, 'E-mail inválido');
      await auth.requestLogin(p.data.email);
      res.status(202).json({ message: 'Se o e-mail estiver cadastrado, enviamos um código e um link de acesso.' });
    } catch (e) { next(e); }
  });

  app.post('/api/auth/verify', authLimiter, (req, res) => {
    const p = verifySchema.safeParse(req.body);
    if (!p.success) return bad(res, 'Dados inválidos');
    const s = auth.verify(p.data);
    if (!s) return res.status(401).json({ error: 'Unauthorized', message: 'Código ou link inválido, expirado ou já utilizado' });
    setSessionCookie(res, cfg, s.id, s.expires);
    res.json({ user: s.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    auth.destroySession(readCookie(req, COOKIE));
    clearSessionCookie(res, cfg);
    res.status(204).end();
  });

  const needAuth = authenticate(auth);

  app.get('/api/me', needAuth, (req, res) => {
    const role = req.user!.role;
    res.json({ user: req.user, permissions: { canEdit: can(role, 'process:edit'), canPublish: can(role, 'process:publish'), canManageUsers: can(role, 'users:manage') } });
  });

  // ---------------------------------------------------------------- usuários (ADMIN)
  const activeAdmins = () => (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND disabled = 0").get() as { n: number }).n;

  app.get('/api/users', needAuth, requireCap('users:manage'), (_req, res) => {
    res.json({ users: db.prepare('SELECT id, email, name, role, disabled, created_at AS createdAt, last_login_at AS lastLoginAt FROM users ORDER BY email').all() });
  });

  app.post('/api/users', needAuth, requireCap('users:manage'), (req, res) => {
    const p = inviteSchema.safeParse(req.body);
    if (!p.success) return bad(res, zmsg(p.error));
    const email = normalizeEmail(p.data.email);
    if (auth.findUserByEmail(email)) return res.status(409).json({ error: 'Conflict', message: 'Este e-mail já está cadastrado' });
    const id = randomUUID();
    db.prepare('INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, email, p.data.name ?? '', p.data.role, nowIso());
    res.status(201).json({ id, email, role: p.data.role });
  });

  app.patch('/api/users/:id', needAuth, requireCap('users:manage'), (req, res) => {
    const p = patchUserSchema.safeParse(req.body);
    if (!p.success) return bad(res, zmsg(p.error));
    const u = db.prepare('SELECT id, role, disabled FROM users WHERE id = ?').get(String(req.params.id)) as { id: string; role: Role; disabled: number } | undefined;
    if (!u) return notFound(res, 'Usuário');
    const nextRole = p.data.role ?? u.role;
    const nextDisabled = p.data.disabled ?? !!u.disabled;
    // nunca deixar a instância sem administrador ativo
    if (u.role === 'ADMIN' && !u.disabled && (nextRole !== 'ADMIN' || nextDisabled) && activeAdmins() <= 1) {
      return res.status(409).json({ error: 'Conflict', message: 'Deve existir ao menos um administrador ativo' });
    }
    db.prepare('UPDATE users SET role = ?, disabled = ?, name = COALESCE(?, name) WHERE id = ?').run(nextRole, nextDisabled ? 1 : 0, p.data.name ?? null, u.id);
    if (nextDisabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // revoga acesso na hora
    res.status(204).end();
  });

  // ---------------------------------------------------------------- processos
  const read = [needAuth, requireCap('process:read')];
  const edit = [needAuth, requireCap('process:edit')];
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => async (req: Request, res: Response, next: NextFunction) => {
    try { await fn(req, res); } catch (e) {
      if (e instanceof ZodError) return bad(res, zmsg(e));
      next(e);
    }
  };

  const loadProc = (id: string) => db.prepare('SELECT * FROM processes WHERE id = ?').get(id) as ProcRow | undefined;
  const permsOf = (req: Request) => ({ canEdit: can(req.user!.role, 'process:edit'), canPublish: can(req.user!.role, 'process:publish') });
  const describe = (p: ProcRow, req: Request) => ({
    id: p.id, key: p.key, name: p.name, rev: p.rev, createdById: p.created_by, updatedAt: p.updated_at, createdAt: p.created_at,
    canDelete: canDelete(req.user!.role, req.user!.id, p.created_by),
  });

  /** Valida (schema + integridade). Integridade quebrada => 422 (o servidor não grava modelo inconsistente). */
  function checkModel(input: unknown, key: string) {
    const model = kit.normalizeModel({ ...(input as object), id: key });
    return { model, integrity: kit.integrityIssues(model) };
  }

  const rebuildRefs = (processId: string, model: KitModel) => {
    db.prepare('DELETE FROM process_refs WHERE process_id = ?').run(processId);
    const ins = db.prepare('INSERT INTO process_refs (process_id, element_id, element_name, ref) VALUES (?, ?, ?, ?)');
    for (const r of kit.requirementRefsOf(model)) ins.run(processId, r.elementId, r.elementName, r.ref);
  };

  const uniqueKey = (base: string, taken: string[]) => { let k = base; for (let i = 2; taken.includes(k); i++) k = `${base}_${i}`; return k; };
  const allKeys = () => (db.prepare('SELECT key FROM processes').all() as Array<{ key: string }>).map((r) => r.key);

  const insertProcess = db.transaction((key: string, model: KitModel, userId: string): ProcRow => {
    const id = randomUUID();
    const t = nowIso();
    db.prepare('INSERT INTO processes (id, key, name, model, rev, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)')
      .run(id, key, model.name, JSON.stringify(model), userId, userId, t, t);
    rebuildRefs(id, model);
    return loadProc(id)!;
  });

  /** Save com concorrência otimista: null se baseRev != rev atual (conflito). */
  const saveModel = db.transaction((p: ProcRow, baseRev: number, model: KitModel, userId: string) => {
    const t = nowIso();
    const upd = db.prepare('UPDATE processes SET model = ?, name = ?, rev = rev + 1, updated_by = ?, updated_at = ? WHERE id = ? AND rev = ?')
      .run(JSON.stringify(model), model.name, userId, t, p.id, baseRev);
    if (upd.changes === 0) return null;
    rebuildRefs(p.id, model);
    // todo save grava versão (mesma transação: ou salva e versiona, ou nada)
    snapshot(p.id, JSON.stringify(model), undefined, userId);
    return { rev: baseRev + 1, updatedAt: t };
  });

  // [2026-10-17] Alterado: conteúdo idêntico ao da última versão não gera duplicata (só aplica o rótulo). Todo save grava versão — Rafael Brito
  const snapshot = db.transaction((processId: string, model: string, label: string | undefined, userId: string) => {
    const prev = db.prepare('SELECT version, label, model, created_at AS createdAt FROM process_versions WHERE process_id = ? ORDER BY version DESC LIMIT 1').get(processId) as
      { version: number; label: string | null; model: string; createdAt: string } | undefined;
    if (prev && prev.model === model) {
      if (label && !prev.label) db.prepare('UPDATE process_versions SET label = ? WHERE process_id = ? AND version = ?').run(label, processId, prev.version);
      return { version: prev.version, label: prev.label || label || null, createdAt: prev.createdAt };
    }
    const version = (prev?.version ?? 0) + 1;
    const createdAt = nowIso();
    db.prepare('INSERT INTO process_versions (process_id, version, label, model, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(processId, version, label || null, model, userId, createdAt);
    return { version, label: label || null, createdAt };
  });

  app.get('/api/processes', ...read, wrap((req, res) => {
    const rows = db.prepare('SELECT * FROM processes ORDER BY name COLLATE NOCASE').all() as ProcRow[];
    const links = new Map((db.prepare('SELECT process_id AS id, COUNT(*) AS n FROM process_refs GROUP BY process_id').all() as Array<{ id: string; n: number }>).map((r) => [r.id, r.n]));
    const vers = new Map((db.prepare('SELECT process_id AS id, COUNT(*) AS n FROM process_versions GROUP BY process_id').all() as Array<{ id: string; n: number }>).map((r) => [r.id, r.n]));
    res.json({ processes: rows.map((p) => ({ ...describe(p, req), linkCount: links.get(p.id) ?? 0, versionCount: vers.get(p.id) ?? 0 })), permissions: permsOf(req) });
  }));

  /** Catálogo de referências (substitui a busca de requisitos do Ancoro): refs já usadas + o texto digitado como "novo". */
  app.get('/api/processes/references', ...read, wrap((req, res) => {
    const q = String(req.query.q ?? '').trim();
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = db.prepare(
      `SELECT ref, MIN(element_name) AS used FROM process_refs WHERE ref LIKE ? ESCAPE '\\' OR element_name LIKE ? ESCAPE '\\' GROUP BY ref ORDER BY ref LIMIT 30`,
    ).all(like, like) as Array<{ ref: string; used: string }>;
    const requirements = rows.map((r) => ({ id: r.ref, reqId: r.ref, shortDesc: r.used, module: '' }));
    if (q && /^[\w.\-/]{1,40}$/.test(q) && !requirements.some((r) => r.reqId.toLowerCase() === q.toLowerCase())) {
      requirements.unshift({ id: q, reqId: q, shortDesc: '(novo)', module: '' });
    }
    res.json({ requirements });
  }));

  /** "Em quais processos esta referência aparece?" */
  app.get('/api/processes/by-reference/:ref', ...read, wrap((req, res) => {
    const links = db.prepare(
      `SELECT p.id AS processId, p.name AS processName, r.element_id AS elementId, r.element_name AS elementName
       FROM process_refs r JOIN processes p ON p.id = r.process_id WHERE r.ref = ? ORDER BY p.name COLLATE NOCASE`,
    ).all(req.params.ref);
    res.json({ links });
  }));

  app.post('/api/processes', ...edit, wrap((req, res) => {
    const p = createSchema.safeParse(req.body);
    if (!p.success) return bad(res, zmsg(p.error));
    const existing = allKeys();
    const draft: Record<string, unknown> = p.data.model ? { ...p.data.model } : { ...kit.newProcessModel(existing, p.data.name) };
    const key = uniqueKey(String(draft.id), existing);
    const { model, integrity } = checkModel({ ...draft, name: p.data.name }, key);
    if (integrity.length) return res.status(422).json({ error: 'Invalid model', message: integrity[0]!.message, issues: integrity });
    res.status(201).json({ ...describe(insertProcess(key, model, req.user!.id), req), unresolvedRefs: [] });
  }));

  app.get('/api/processes/:pid', ...read, wrap((req, res) => {
    const p = loadProc(String(req.params.pid));
    if (!p) return notFound(res);
    res.json({ ...describe(p, req), model: JSON.parse(p.model), permissions: permsOf(req) });
  }));

  app.put('/api/processes/:pid', ...edit, wrap((req, res) => {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, zmsg(parsed.error));
    const p = loadProc(String(req.params.pid));
    if (!p) return notFound(res);
    const { model, integrity } = checkModel(parsed.data.model, p.key);
    if (integrity.length) return res.status(422).json({ error: 'Invalid model', message: integrity[0]!.message, issues: integrity });
    const saved = saveModel(p, parsed.data.baseRev, model, req.user!.id);
    if (!saved) {
      const cur = loadProc(p.id);
      return res.status(409).json({ error: 'Conflict', message: 'O processo foi alterado por outra pessoa desde que você o abriu', currentRev: cur?.rev, updatedAt: cur?.updated_at });
    }
    res.json({ rev: saved.rev, updatedAt: saved.updatedAt, unresolvedRefs: [], issues: kit.qualityIssues(model) });
  }));

  app.delete('/api/processes/:pid', needAuth, wrap((req, res) => {
    const p = loadProc(String(req.params.pid));
    if (!p) return notFound(res);
    if (!canDelete(req.user!.role, req.user!.id, p.created_by)) return res.status(403).json({ error: 'Forbidden', message: 'Você só pode excluir processos que você criou' });
    db.prepare('DELETE FROM processes WHERE id = ?').run(p.id);
    res.status(204).end();
  }));

  // ---- versões
  app.get('/api/processes/:pid/versions', ...read, wrap((req, res) => {
    const p = loadProc(String(req.params.pid));
    if (!p) return notFound(res);
    res.json({ versions: db.prepare('SELECT version, label, created_by AS createdById, created_at AS createdAt FROM process_versions WHERE process_id = ? ORDER BY version DESC').all(p.id) });
  }));

  app.post('/api/processes/:pid/versions', ...edit, wrap((req, res) => {
    const parsed = snapshotSchema.safeParse(req.body ?? {});
    if (!parsed.success) return bad(res, zmsg(parsed.error));
    const p = loadProc(String(req.params.pid));
    if (!p) return notFound(res);
    res.status(201).json(snapshot(p.id, p.model, parsed.data.label, req.user!.id));
  }));

  const loadVersion = (pid: string, v: string) =>
    db.prepare('SELECT version, label, model, created_at AS createdAt FROM process_versions WHERE process_id = ? AND version = ?').get(pid, Number(v)) as
      { version: number; label: string | null; model: string; createdAt: string } | undefined;

  app.get('/api/processes/:pid/versions/:version', ...read, wrap((req, res) => {
    const p = loadProc(String(req.params.pid));
    if (!p) return notFound(res);
    const v = loadVersion(p.id, String(req.params.version));
    if (!v) return notFound(res, 'Versão');
    res.json({ version: v.version, label: v.label, createdAt: v.createdAt, model: JSON.parse(v.model) });
  }));

  /** Restaurar = novo save com o conteúdo da versão (histórico nunca é reescrito); guarda snapshot do estado atual antes. */
  app.post('/api/processes/:pid/versions/:version/restore', ...edit, wrap((req, res) => {
    const p = loadProc(String(req.params.pid));
    if (!p) return notFound(res);
    const v = loadVersion(p.id, String(req.params.version));
    if (!v) return notFound(res, 'Versão');
    const { model, integrity } = checkModel(JSON.parse(v.model), p.key);
    if (integrity.length) return res.status(422).json({ error: 'Invalid model', message: integrity[0]!.message, issues: integrity });
    snapshot(p.id, p.model, `Antes de restaurar v${v.version}`, req.user!.id);
    const saved = saveModel(p, p.rev, model, req.user!.id);
    if (!saved) return res.status(409).json({ error: 'Conflict', message: 'O processo foi alterado durante a restauração; tente novamente' });
    res.json({ rev: saved.rev, updatedAt: saved.updatedAt, unresolvedRefs: [] });
  }));

  // ---- import / export / publicação
  app.get('/api/processes/:pid/bpmn', ...read, wrap(async (req, res) => {
    const p = loadProc(String(req.params.pid));
    if (!p) return notFound(res);
    const xml = await kit.exportBpmn(kit.normalizeModel(JSON.parse(p.model)));
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${p.key.replace(/[^A-Za-z0-9_.-]/g, '_')}.bpmn"`);
    res.send(xml);
  }));

  app.post('/api/processes/import', ...edit, wrap(async (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, zmsg(parsed.error));
    let imported: Awaited<ReturnType<ProcessKit['importFile']>>;
    try { imported = await kit.importFile(parsed.data.kind, Buffer.from(parsed.data.data, 'base64')); }
    catch (e) { return bad(res, `Arquivo inválido: ${e instanceof Error ? e.message : 'não foi possível ler'}`); }
    const existing = allKeys();
    // chaves únicas; chamadas entre processos do mesmo arquivo (calledProcessId) são remapeadas junto
    const remap = new Map<string, string>();
    for (const m of imported.models) { const k = uniqueKey(m.id, existing); existing.push(k); remap.set(m.id, k); }
    const created: Array<ReturnType<typeof describe> & { unresolvedRefs: unknown[] }> = [];
    for (const m of imported.models) {
      const key = remap.get(m.id)!;
      const nodes = m.nodes.map((n) => (n.calledProcessId && remap.has(n.calledProcessId) ? { ...n, calledProcessId: remap.get(n.calledProcessId) } : n));
      const { model, integrity } = checkModel({ ...m, nodes }, key);
      if (integrity.length) { imported.warnings.push(`${m.name}: ignorado — ${integrity[0]!.message}`); continue; }
      created.push({ ...describe(insertProcess(key, model, req.user!.id), req), unresolvedRefs: [] });
    }
    res.status(201).json({ processes: created, warnings: imported.warnings });
  }));

  app.post('/api/processes/publish', needAuth, requireCap('process:publish'), wrap(async (req, res) => {
    const parsed = publishSchema.safeParse(req.body ?? {});
    if (!parsed.success) return bad(res, zmsg(parsed.error));
    const rows = db.prepare('SELECT * FROM processes ORDER BY name COLLATE NOCASE').all() as ProcRow[];
    if (!rows.length) return bad(res, 'Não há processos para publicar');
    const portal = db.prepare('SELECT versions_json AS v, publish_count AS n FROM portal WHERE id = 1').get() as { v: string; n: number } | undefined;
    let previousVersions: unknown;
    if (portal?.v) { try { previousVersions = JSON.parse(portal.v); } catch { previousVersions = undefined; } }
    const out = await kit.publishPortal({
      models: rows.map((r) => kit.normalizeModel(JSON.parse(r.model))),
      versionLabel: parsed.data.label, password: parsed.data.password, brand: parsed.data.brand, previousVersions,
    });
    const suffix = parsed.data.label ? `: ${parsed.data.label}` : '';
    const count = db.transaction(() => {
      // snapshot automático só dos processos que mudaram desde o último snapshot
      for (const r of rows) {
        const last = db.prepare('SELECT model FROM process_versions WHERE process_id = ? ORDER BY version DESC LIMIT 1').get(r.id) as { model: string } | undefined;
        if (last?.model !== r.model) snapshot(r.id, r.model, `Publicação${suffix}`, req.user!.id);
      }
      const n = (portal?.n ?? 0) + 1;
      db.prepare(
        `INSERT INTO portal (id, versions_json, publish_count, last_label, last_published_at) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET versions_json = excluded.versions_json, publish_count = excluded.publish_count, last_label = excluded.last_label, last_published_at = excluded.last_published_at`,
      ).run(out.versionsFile, n, parsed.data.label ?? null, nowIso());
      return n;
    })();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="portal-processos-v${count}.zip"`);
    res.setHeader('X-Portal-Publish-Count', String(count));
    res.send(Buffer.from(out.zip));
  }));

  // ---- SPA fallback (só se o shell existir) e erros
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not Found', message: 'Rota não encontrada' }));
  const indexHtml = join(cfg.publicDir, 'index.html');
  app.get('/{*splat}', (_req, res) => (existsSync(indexHtml) ? res.sendFile(indexHtml) : res.status(404).send('Shell não encontrado (pasta public/)')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (err as { type?: string })?.type;
    if (type === 'entity.too.large') return void res.status(413).json({ error: 'Payload Too Large', message: 'Arquivo grande demais' });
    if (type === 'entity.parse.failed') return bad(res, 'JSON inválido');
    console.error('[erro]', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Erro inesperado' });
  });

  return { app, auth };
}
