#!/usr/bin/env node
// Applies migrations/*.sql to the D1 database via wrangler, with a pre-flight check and a backup.
//
//   node scripts/db-migrate.mjs migrate --remote   # production (backup → check → apply)
//   node scripts/db-migrate.mjs migrate --local    # wrangler's local D1 (wrangler dev)
//   node scripts/db-migrate.mjs status  --remote   # row counts + legacy import marker
//
// The legacy JSON blob (system_data) is copied into the new tables by the Worker itself on the first
// request after deploy (MemoryStore.sync → importLegacyDataset); system_data is kept as a backup.
// Local `npm run dev` needs none of this: it applies migrations to data/app.db automatically.

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseWranglerJson } from './lib/write-fence-core.mjs';

const DB_NAME = 'bpnm-doc-hub-db';
const [command = 'status', ...flags] = process.argv.slice(2);
const target = flags.includes('--local') ? '--local' : flags.includes('--remote') ? '--remote' : null;

if (!['migrate', 'status'].includes(command) || !target) {
  console.error('Usage: node scripts/db-migrate.mjs <migrate|status> <--remote|--local>');
  process.exit(1);
}

function wrangler(args, { json = false } = {}) {
  const output = execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf-8',
    stdio: json ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: { ...process.env, CI: 'true' }, // skip interactive confirmations
  });
  return json ? parseWranglerJson(output) : output;
}

function query(sql) {
  const result = wrangler(['d1', 'execute', DB_NAME, target, '--json', '--command', sql], { json: true });
  return result[0]?.results ?? [];
}

function tableNames() {
  return new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name));
}

function count(table) {
  return Number(query(`SELECT COUNT(*) AS n FROM ${table}`)[0]?.n ?? 0);
}

function status() {
  const tables = tableNames();
  if (!tables.has('meta')) {
    console.log('Migration 0001 has not been applied yet.');
    if (tables.has('system_data')) console.log('Legacy system_data blob is present and will be imported after migrating.');
    return;
  }
  const marker = query("SELECT value FROM meta WHERE key = 'legacy_import'")[0]?.value;
  console.log(`Legacy import: ${marker ? marker : 'not yet (happens on the first API request after deploy)'}`);
  for (const t of ['documents', 'contracts', 'partners', 'users', 'notifications', 'audit_logs']) {
    console.log(`  ${t.padEnd(14)} ${count(t)}`);
  }
}

function migrate() {
  const tables = tableNames();
  const appliedMigrations = tables.has('d1_migrations')
    ? new Set(query('SELECT name FROM d1_migrations').map((r) => r.name))
    : new Set();

  // 0001 drops the v1 tables from schema.sql. The app never wrote to them, but refuse if anyone did.
  if (!appliedMigrations.has('0001_normalized_tables.sql')) {
    for (const legacy of ['documents', 'contracts', 'contract_appendices']) {
      if (tables.has(legacy) && count(legacy) > 0) {
        console.error(
          `Refusing to migrate: legacy table "${legacy}" from schema.sql contains rows that 0001 would drop. ` +
            'Inspect and move that data first.'
        );
        process.exit(1);
      }
    }
  }

  if (target === '--remote') {
    const backupDir = path.join(process.cwd(), 'backups');
    mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `d1-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
    console.log(`Backing up ${DB_NAME} to ${backupFile} ...`);
    wrangler(['d1', 'export', DB_NAME, '--remote', '--output', backupFile]);
  }

  wrangler(['d1', 'migrations', 'apply', DB_NAME, target]);
  console.log('\nMigrations applied. Current state:');
  status();
}

if (command === 'migrate') migrate();
else status();
