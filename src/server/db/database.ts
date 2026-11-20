import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './persistence.ts';

// The subset of the Cloudflare D1 API the app uses. Production passes the real D1 binding;
// local dev and tests use the node:sqlite adapter below, so both run the same SQL.
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  all<T = Record<string, any>>(): Promise<{ results: T[] }>;
  first<T = Record<string, any>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  // Runs all statements in one transaction (all-or-nothing), like D1's batch().
  batch(statements: SqlStatement[]): Promise<Array<{ results: any[] }>>;
}

// ---------------------------------------------------------------------------
// node:sqlite adapter (local dev / tests)
// ---------------------------------------------------------------------------

// Plain fields instead of TS parameter properties so this file also runs under Node's type stripping.
class NodeStatement implements SqlStatement {
  private readonly db: any;
  private readonly sql: string;
  private readonly params: unknown[];

  constructor(db: any, sql: string, params: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...values: unknown[]): SqlStatement {
    return new NodeStatement(this.db, this.sql, values);
  }

  execute(): any[] {
    return this.db.prepare(this.sql).all(...this.params);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.execute() as T[] };
  }

  async first<T>(): Promise<T | null> {
    return ((this.db.prepare(this.sql).get(...this.params) as T) ?? null);
  }

  async run(): Promise<unknown> {
    return this.db.prepare(this.sql).run(...this.params);
  }
}

class NodeSqliteDatabase implements SqlDatabase {
  private readonly db: any;

  constructor(db: any) {
    this.db = db;
  }

  prepare(sql: string): SqlStatement {
    return new NodeStatement(this.db, sql);
  }

  async batch(statements: SqlStatement[]): Promise<Array<{ results: any[] }>> {
    this.db.exec('BEGIN');
    try {
      const results = (statements as NodeStatement[]).map((s) => ({ results: s.execute() }));
      this.db.exec('COMMIT');
      return results;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** Wraps an existing node:sqlite DatabaseSync (tests use in-memory databases). */
export function __createNodeDatabaseForTests(db: any): SqlDatabase {
  return new NodeSqliteDatabase(db);
}

export const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

/**
 * Applies pending migrations/*.sql files, tracked in the same `d1_migrations` table wrangler uses.
 * Production migrations are applied by `wrangler d1 migrations apply` (see scripts/db-migrate.mjs).
 */
export function applyLocalMigrations(db: any, migrationsDir = MIGRATIONS_DIR) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );
  const applied = new Set(db.prepare('SELECT name FROM d1_migrations').all().map((r: any) => r.name));
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
}

let localDatabase: Promise<SqlDatabase> | null = null;

export const LOCAL_DB_FILE = 'app.db';

async function openLocalDatabase(): Promise<SqlDatabase> {
  // getBuiltinModule instead of import: Vite's SSR loader mangles `node:sqlite`, and the Workers
  // bundler must never try to resolve it.
  const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, LOCAL_DB_FILE));
  db.exec('PRAGMA journal_mode = WAL');
  applyLocalMigrations(db);
  return new NodeSqliteDatabase(db);
}

/** Returns the D1 binding on Cloudflare, otherwise a local SQLite file in DATA_DIR. */
export function getDatabase(env?: any): Promise<SqlDatabase> {
  if (env?.DB) return Promise.resolve(env.DB as SqlDatabase);
  if (!localDatabase) {
    localDatabase = openLocalDatabase().catch((err) => {
      localDatabase = null;
      throw err;
    });
  }
  return localDatabase;
}
