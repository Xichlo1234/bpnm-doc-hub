#!/usr/bin/env node
// Read-only pre-deployment check of the D1 database: migration ledger, schema, legacy data and
// duplicate business numbers. Never writes. Exit code 1 when a blocking problem is found.
//
//   node scripts/preflight.mjs --remote          # production D1 via wrangler (needs approval to read prod)
//   node scripts/preflight.mjs --local           # wrangler's local D1
//   node scripts/preflight.mjs --file data/app.db  # a SQLite file (local dev / restored backup copy)

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { runPreflight } from './lib/preflight-core.mjs';

const DB_NAME = 'bpnm-doc-hub-db';
const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const target = fileIdx >= 0 ? 'file' : args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null;
if (!target) {
  console.error('Usage: node scripts/preflight.mjs <--remote | --local | --file path/to.db> [--json]');
  process.exit(2);
}

let query;
if (target === 'file') {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(args[fileIdx + 1], { readOnly: true });
  query = async (sql) => db.prepare(sql).all();
} else {
  query = async (sql) => {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, target, '--json', '--command', sql], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, CI: 'true' },
    });
    return JSON.parse(out)[0]?.results ?? [];
  };
}

const migrations = readdirSync(path.join(process.cwd(), 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const report = await runPreflight(query, migrations);

if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Đã áp dụng:', report.info.applied_migrations?.join(', ') || '(không có)');
  console.log('Chờ áp dụng:', report.info.pending_migrations?.join(', ') || '(không có)');
  console.log('Số bản ghi:', JSON.stringify(report.info.records));
  console.log('Revision NULL:', JSON.stringify(report.info.null_revision), '· HĐ không trạng thái:', report.info.contracts_without_status);
  console.log('Thông báo chưa có người nhận:', report.info.notifications_without_recipient, '· file_key cũ (không chuẩn):', report.info.legacy_file_keys);
  console.log('Số trùng:', (report.info.duplicate_numbers || []).length);
  for (const w of report.warnings) console.log('CẢNH BÁO:', w);
  for (const b of report.blocking) console.log('CHẶN:', b);
}
process.exit(report.blocking.length > 0 ? 1 : 0);
