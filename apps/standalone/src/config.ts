/**
 * Configuração do Process Studio standalone, 100% por variáveis de ambiente (12-factor).
 *
 * [2026-10-16] Criado: Fase 6 — adaptador standalone, roda sem o Ancoro (docs/process-studio/README.md §6.5) — Rafael Brito
 */
import { resolve } from 'node:path';
import { z } from 'zod';

const bool = (d: boolean) => z.enum(['true', 'false', '1', '0']).optional().transform((v) => (v === undefined ? d : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PS_PORT: z.coerce.number().int().min(1).max(65535).default(3200),
  /** URL pública (usada no link do e-mail e para decidir cookie Secure). Ex.: https://processos.cliente.com */
  PS_BASE_URL: z.string().url().default('http://localhost:3200'),
  PS_DATA_DIR: z.string().default('./data'),
  /** E-mail do primeiro administrador (criado no primeiro start se o banco estiver vazio) */
  PS_ADMIN_EMAIL: z.string().email().optional(),
  /** smtp://user:pass@host:587 — obrigatório em produção; em dev, sem SMTP o código sai no console */
  PS_SMTP_URL: z.string().optional(),
  PS_MAIL_FROM: z.string().default('Process Studio <no-reply@localhost>'),
  PS_SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  /** minutos de validade do código/link de login */
  PS_CODE_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  PS_TRUST_PROXY: bool(false),
  PS_PROCESSKIT: z.string().optional(),
  PS_PUBLIC_DIR: z.string().optional(),
});

export interface Config {
  production: boolean;
  port: number;
  baseUrl: string;
  dataDir: string;
  adminEmail?: string;
  smtpUrl?: string;
  mailFrom: string;
  sessionDays: number;
  codeMinutes: number;
  trustProxy: boolean;
  cookieSecure: boolean;
  kitPath: string;
  publicDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = schema.parse(env);
  const production = e.NODE_ENV === 'production';
  const cfg: Config = {
    production,
    port: e.PS_PORT,
    baseUrl: e.PS_BASE_URL.replace(/\/$/, ''),
    dataDir: resolve(e.PS_DATA_DIR),
    ...(e.PS_ADMIN_EMAIL && { adminEmail: e.PS_ADMIN_EMAIL.toLowerCase() }),
    ...(e.PS_SMTP_URL && { smtpUrl: e.PS_SMTP_URL }),
    mailFrom: e.PS_MAIL_FROM,
    sessionDays: e.PS_SESSION_DAYS,
    codeMinutes: e.PS_CODE_MINUTES,
    trustProxy: e.PS_TRUST_PROXY,
    cookieSecure: e.PS_BASE_URL.startsWith('https://'),
    kitPath: resolve(e.PS_PROCESSKIT ?? 'vendor/processkit.cjs'),
    publicDir: resolve(e.PS_PUBLIC_DIR ?? 'public'),
  };
  // Fail-closed: em produção sem SMTP o login por e-mail não funcionaria e o código vazaria para o log.
  if (production && !cfg.smtpUrl) throw new Error('PS_SMTP_URL é obrigatório em produção (login por código/link enviado por e-mail)');
  if (production && !cfg.baseUrl.startsWith('https://')) throw new Error('PS_BASE_URL deve ser https:// em produção (cookie de sessão Secure)');
  return cfg;
}
