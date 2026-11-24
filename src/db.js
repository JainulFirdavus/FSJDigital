// Tiny database adapter: PostgreSQL when DATABASE_URL is set (Render + Neon),
// otherwise Node's built-in SQLite file (local development). SQL uses `?` placeholders
// and only TEXT/INTEGER columns so the same statements run on both engines.
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS products (
     id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, data TEXT NOT NULL,
     sort_order INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS media (
     id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inquiries (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, company TEXT, product TEXT,
     message TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS messages (
     id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, direction TEXT NOT NULL, body TEXT NOT NULL,
     email_status TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_inquiry ON messages (inquiry_id)`,
  `CREATE INDEX IF NOT EXISTS inquiries_created ON inquiries (created_at)`,
];

const clean = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

let impl;

export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
    const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
    impl = {
      kind: 'postgres',
      all: async (sql, p = []) => (await pool.query(toPg(sql), clean(p))).rows,
      run: async (sql, p = []) => ({ changes: (await pool.query(toPg(sql), clean(p))).rowCount }),
      exec: async (sql) => { await pool.query(sql); },
    };
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    const file = path.resolve(process.env.SQLITE_FILE || 'data/site.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL');
    impl = {
      kind: 'sqlite',
      all: async (sql, p = []) => db.prepare(sql).all(...clean(p)),
      run: async (sql, p = []) => ({ changes: Number(db.prepare(sql).run(...clean(p)).changes) }),
      exec: async (sql) => db.exec(sql),
    };
  }
  for (const stmt of SCHEMA) await impl.exec(stmt);
  return impl.kind;
}

export const all = (sql, params) => impl.all(sql, params);
export const get = async (sql, params) => (await impl.all(sql, params))[0];
export const run = (sql, params) => impl.run(sql, params);
