/**
 * Entrada do Process Studio standalone: `npm start` (ou `npm run dev`).
 *
 * [2026-10-16] Criado: Fase 6 — sobe SQLite + e-mail + app; encerra limpo em SIGTERM/SIGINT (Docker) — Rafael Brito
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { loadKit } from './kit.js';
import { consoleMailer, smtpMailer } from './mailer.js';

const cfg = loadConfig();
mkdirSync(cfg.dataDir, { recursive: true });
const db = openDb(join(cfg.dataDir, 'process-studio.db'));
const kit = loadKit(cfg.kitPath);
const mailer = cfg.smtpUrl ? smtpMailer(cfg) : consoleMailer();
if (!cfg.smtpUrl) console.warn('[aviso] PS_SMTP_URL ausente: códigos de login serão impressos no console (apenas desenvolvimento).');

const { app, auth } = createApp({ cfg, db, mailer, kit });
const purge = setInterval(() => auth.purgeExpired(), 3_600_000);
purge.unref();
auth.purgeExpired();

const server = app.listen(cfg.port, () => console.log(`Process Studio em ${cfg.baseUrl} (porta ${cfg.port}, dados em ${cfg.dataDir})`));
const shutdown = () => { clearInterval(purge); server.close(() => { db.close(); process.exit(0); }); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
