/**
 * Autenticação sem senha: código de 6 dígitos OU link, ambos enviados por e-mail (decisão Rafael Brito, 2026-10-16).
 *
 * Decisões de segurança (não óbvias):
 *  - Resposta de /auth/request é SEMPRE a mesma (202), exista o e-mail ou não → não enumera usuários.
 *    Só e-mails previamente cadastrados (convite do ADMIN) recebem algo.
 *  - Código e token ficam no banco apenas como HMAC (segredo gerado no 1º start, guardado em `meta`): um dump do banco
 *    não entrega códigos válidos.
 *  - Código: máx. 5 tentativas por desafio, validade curta, uso único. Pedidos: 1 a cada 30 s e 5 por hora por e-mail.
 *  - O link NÃO loga ao ser aberto (GET): leva a uma tela com botão "Entrar", porque scanners de e-mail pré-visitam links
 *    e consumiriam o token. O login acontece no POST /auth/verify.
 *  - Sessão = id opaco aleatório em cookie HttpOnly + SameSite=Strict; no banco só o SHA-256 dele.
 *
 * [2026-10-16] Criado: Fase 6 — auth própria do standalone (AuthPort por papéis em `can`) — Rafael Brito
 */
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Config } from './config.js';
import type { Db } from './db.js';
import type { Mailer } from './mailer.js';

export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER';
export interface User { id: string; email: string; name: string; role: Role; disabled: boolean }

export const COOKIE = 'ps_session';
const MAX_ATTEMPTS = 5;
const MIN_INTERVAL_MS = 30_000;
const MAX_PER_HOUR = 5;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const now = () => new Date();
const iso = (d: Date) => d.toISOString();
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

// ---- permissões (AuthPort do núcleo: process:read | process:edit | process:publish) + gestão de usuários
export type Capability = 'process:read' | 'process:edit' | 'process:publish' | 'users:manage';
const CAPS: Record<Role, Capability[]> = {
  ADMIN: ['process:read', 'process:edit', 'process:publish', 'users:manage'],
  EDITOR: ['process:read', 'process:edit', 'process:publish'],
  VIEWER: ['process:read'],
};
export const can = (role: Role, cap: Capability): boolean => CAPS[role].includes(cap);
/** Excluir: ADMIN qualquer; EDITOR só o que criou; VIEWER nunca. */
export const canDelete = (role: Role, userId: string, createdBy: string | null): boolean =>
  role === 'ADMIN' || (role === 'EDITOR' && createdBy === userId);

const rowToUser = (r: { id: string; email: string; name: string; role: Role; disabled: number }): User =>
  ({ id: r.id, email: r.email, name: r.name, role: r.role, disabled: !!r.disabled });

export function createAuth(db: Db, cfg: Config, mailer: Mailer) {
  // segredo do HMAC: gerado uma vez e persistido
  const secret = (() => {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'hmac_secret'").get() as { value: string } | undefined;
    if (row) return row.value;
    const v = randomBytes(32).toString('hex');
    db.prepare("INSERT INTO meta (key, value) VALUES ('hmac_secret', ?)").run(v);
    return v;
  })();
  const hmac = (s: string) => createHmac('sha256', secret).update(s).digest('hex');
  const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  const findUserByEmail = (email: string): User | null => {
    const r = db.prepare('SELECT id, email, name, role, disabled FROM users WHERE email = ?').get(email) as Parameters<typeof rowToUser>[0] | undefined;
    return r ? rowToUser(r) : null;
  };

  /** Cria o 1º administrador (PS_ADMIN_EMAIL) se não houver nenhum usuário. Sem admin e sem usuários o sistema fica inacessível → erro claro. */
  function bootstrapAdmin(): void {
    const n = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    if (n > 0) return;
    if (!cfg.adminEmail) throw new Error('Banco vazio: defina PS_ADMIN_EMAIL para criar o primeiro administrador');
    db.prepare('INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), cfg.adminEmail, 'Administrador', 'ADMIN', iso(now()));
  }

  /** Gera e envia o desafio. Nunca revela se o e-mail existe. */
  async function requestLogin(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const user = findUserByEmail(email);
    if (!user || user.disabled) return;
    const recent = db.prepare('SELECT created_at FROM login_challenges WHERE email = ? AND created_at > ? ORDER BY created_at DESC')
      .all(email, iso(new Date(Date.now() - 3_600_000))) as Array<{ created_at: string }>;
    if (recent.length >= MAX_PER_HOUR) return;
    if (recent[0] && Date.now() - Date.parse(recent[0].created_at) < MIN_INTERVAL_MS) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO login_challenges (id, email, code_hash, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), email, hmac(`${email}:${code}`), hmac(`token:${token}`), iso(now()), iso(new Date(Date.now() + cfg.codeMinutes * 60_000)));
    const link = `${cfg.baseUrl}/#/entrar?token=${encodeURIComponent(token)}`;
    await mailer.sendLogin({ to: email, code, link, minutes: cfg.codeMinutes });
  }

  function openSession(user: User): { id: string; expires: Date } {
    const id = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + cfg.sessionDays * 86_400_000);
    db.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(id), user.id, iso(now()), iso(expires));
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(iso(now()), user.id);
    return { id, expires };
  }

  interface Challenge { id: string; email: string; code_hash: string; attempts: number; used: number; expires_at: string }

  /** Confirma por código (com e-mail) ou por token do link. Devolve a sessão ou null (mensagem única para qualquer falha). */
  function verify(input: { email: string; code: string } | { token: string }): { id: string; expires: Date; user: User } | null {
    let ch: Challenge | undefined;
    if ('token' in input) {
      ch = db.prepare('SELECT * FROM login_challenges WHERE token_hash = ?').get(hmac(`token:${input.token}`)) as Challenge | undefined;
      if (!ch || ch.used || Date.parse(ch.expires_at) < Date.now()) return null;
    } else {
      const email = normalizeEmail(input.email);
      ch = db.prepare('SELECT * FROM login_challenges WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
        .get(email, iso(now())) as Challenge | undefined;
      if (!ch) return null;
      if (ch.attempts >= MAX_ATTEMPTS) return null;
      if (!safeEq(ch.code_hash, hmac(`${email}:${input.code.trim()}`))) {
        db.prepare('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?').run(ch.id);
        return null;
      }
    }
    // uso único atômico: se outra requisição consumiu antes, changes = 0
    const upd = db.prepare('UPDATE login_challenges SET used = 1 WHERE id = ? AND used = 0').run(ch.id);
    if (upd.changes === 0) return null;
    const user = findUserByEmail(ch.email);
    if (!user || user.disabled) return null;
    const s = openSession(user);
    return { ...s, user };
  }

  function userFromSession(rawId: string | undefined): User | null {
    if (!rawId) return null;
    const r = db.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.disabled, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`,
    ).get(sha256(rawId)) as (Parameters<typeof rowToUser>[0] & { expires_at: string }) | undefined;
    if (!r || Date.parse(r.expires_at) < Date.now() || r.disabled) return null;
    return rowToUser(r);
  }

  const destroySession = (rawId: string | undefined) => { if (rawId) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(rawId)); };
  const purgeExpired = () => {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(iso(now()));
    db.prepare('DELETE FROM login_challenges WHERE expires_at < ?').run(iso(new Date(Date.now() - 86_400_000)));
  };

  return { bootstrapAdmin, requestLogin, verify, userFromSession, destroySession, purgeExpired, findUserByEmail };
}
export type Auth = ReturnType<typeof createAuth>;

// ---- Express

declare module 'express-serve-static-core' {
  interface Request { user?: User }
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, cfg: Config, id: string, expires: Date): void {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}${cfg.cookieSecure ? '; Secure' : ''}`);
}
export function clearSessionCookie(res: Response, cfg: Config): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cfg.cookieSecure ? '; Secure' : ''}`);
}

/** Anexa req.user ou responde 401. */
export const authenticate = (auth: Auth) => (req: Request, res: Response, next: NextFunction) => {
  const user = auth.userFromSession(readCookie(req, COOKIE));
  if (!user) return void res.status(401).json({ error: 'Unauthorized', message: 'Sessão ausente ou expirada' });
  req.user = user;
  next();
};

export const requireCap = (cap: Capability) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !can(req.user.role, cap)) return void res.status(403).json({ error: 'Forbidden', message: 'Seu papel não permite esta ação' });
  next();
};

/**
 * Defesa em profundidade contra CSRF além do SameSite=Strict: métodos que alteram estado exigem o cabeçalho
 * `x-ps-csrf: 1` (um formulário/`<img>` de outro site não consegue enviá-lo) e, se houver `Origin`, ele deve ser o mesmo host.
 */
export const csrfGuard = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch { ok = false; }
    if (!ok) return void res.status(403).json({ error: 'Forbidden', message: 'Origem não permitida' });
  }
  if (req.headers['x-ps-csrf'] !== '1') return void res.status(403).json({ error: 'Forbidden', message: 'Cabeçalho anti-CSRF ausente' });
  next();
};
