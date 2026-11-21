#!/usr/bin/env node
// Installs / removes / checks the D1 write fence (see scripts/lib/write-fence-core.mjs).
//
//   node scripts/write-fence.mjs status --remote        # read-only: lists fence triggers
//   node scripts/write-fence.mjs on     --remote        # maintenance step 2 (needs owner approval)
//   node scripts/write-fence.mjs verify --remote        # a test write must be refused (nothing is changed)
//   node scripts/write-fence.mjs off    --remote        # maintenance step 6, before opening writes
//   ... --file path/to.db                               # same on a SQLite file (rehearsal, restored copy)

import { execFileSync } from 'node:child_process';
import { fenceOnSql, fenceOffSql, FENCE_STATUS_SQL, TABLES_SQL, FENCED_TABLES } from './lib/write-fence-core.mjs';

const DB_NAME = 'bpnm-doc-hub-db';
const [command, ...args] = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const target = fileIdx >= 0 ? 'file' : args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null;
if (!['status', 'on', 'off', 'verify'].includes(command) || !target) {
  console.error('Usage: node scripts/write-fence.mjs <status|on|verify|off> <--remote | --local | --file path>');
  process.exit(2);
}

let query, exec;
if (target === 'file') {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(args[fileIdx + 1]);
  query = (sql) => db.prepare(sql).all();
  exec = (sql) => db.exec(sql);
} else {
  const wr = (extra) =>
    execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, target, '--json', ...extra], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: 'true' } });
  query = (sql) => JSON.parse(wr(['--command', sql]))[0]?.results ?? [];
  exec = (sql) => wr(['--command', sql]);
}

const status = () => query(FENCE_STATUS_SQL);
if (command === 'on') {
  const tables = query(TABLES_SQL).map((r) => r.name);
  exec(fenceOnSql(tables).join('\n'));
} else if (command === 'off') {
  exec(fenceOffSql().join('\n'));
} else if (command === 'verify') {
  // A no-op UPDATE on meta must be refused by the fence; if it is accepted it changes nothing.
  let refused = false;
  try {
    exec("UPDATE meta SET value = value WHERE key = 'data_version'");
  } catch (err) {
    refused = /WRITE_FENCE/.test(String(err?.stderr || err?.message || err));
  }
  const n = status().length;
  console.log(refused ? `PASS: D1 từ chối ghi (${n} trigger).` : 'FAIL: D1 vẫn nhận ghi — rào chắn chưa hoạt động.');
  process.exit(refused ? 0 : 1);
}
const triggers = status();
const expected = FENCED_TABLES.length;
console.log(`Rào chắn ghi: ${triggers.length} trigger${triggers.length ? ` trên ${new Set(triggers.map((t) => t.tbl_name)).size} bảng` : ''} (tối đa ${expected * 3}).`);
process.exit(0);
