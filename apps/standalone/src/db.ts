/**
 * SQLite (better-sqlite3, síncrono) + migrações por PRAGMA user_version.
 * Datas em ISO-8601 (TEXT). O modelo do processo é guardado como JSON (fonte da verdade); `process_refs` é projeção.
 *
 * [2026-10-16] Criado: Fase 6 — schema do adaptador standalone — Rafael Brito
 */
import Database from 'better-sqlite3';

export type Db = Database.Database;

/** Cada item roda uma vez, em ordem, dentro de transação. NUNCA edite um item já publicado: acrescente outro. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('ADMIN','EDITOR','VIEWER')),
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE login_challenges (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX idx_challenges_email ON login_challenges(email, created_at);
  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE processes (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE process_versions (
    process_id TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    label TEXT,
    model TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (process_id, version)
  );
  CREATE TABLE process_refs (
    process_id TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    element_id TEXT NOT NULL,
    element_name TEXT NOT NULL,
    ref TEXT NOT NULL
  );
  CREATE INDEX idx_refs_ref ON process_refs(ref);
  CREATE TABLE portal (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    versions_json TEXT NOT NULL,
    publish_count INTEGER NOT NULL,
    last_label TEXT,
    last_published_at TEXT NOT NULL
  );
  `,
];

export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
}
