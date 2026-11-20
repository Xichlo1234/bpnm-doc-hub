#!/usr/bin/env node
// Moves uploads stored base64-encoded in D1 (uploaded_files + file_chunks) into the R2 bucket.
//
//   node scripts/migrate-files-to-r2.mjs --remote                    # copy + verify only
//   node scripts/migrate-files-to-r2.mjs --remote --delete-from-d1   # then drop verified D1 copies
//   (--local targets wrangler's local D1/R2 for a dry run)
//
// Each object is downloaded back from R2 and compared by SHA-256 before it counts as verified;
// D1 rows are only deleted when every file verified. The original file name is stored in the
// object's Content-Disposition (wrangler cannot set custom metadata); the Worker reads it from there.
// Files that are not migrated keep working: the Worker copies them to R2 on first download.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB_NAME = 'bpnm-doc-hub-db';
const BUCKET = 'bpnm-doc-hub-files';
const flags = process.argv.slice(2);
const target = flags.includes('--local') ? '--local' : flags.includes('--remote') ? '--remote' : null;
const deleteFromD1 = flags.includes('--delete-from-d1');

if (!target) {
  console.error('Usage: node scripts/migrate-files-to-r2.mjs <--remote|--local> [--delete-from-d1]');
  process.exit(1);
}

// wrangler 3's `r2 object put/get` percent-encodes keys (a file "Quyết định.pdf" would be stored as
// "Quy%E1%BA%BFt%20..." and the Worker could not find it), so R2 commands use a pinned wrangler 4.
const R2_WRANGLER = 'wrangler@4.150.0';

function wrangler(args, { binary = false, cli = 'wrangler' } = {}) {
  return execFileSync('npx', ['-y', cli, ...args], {
    encoding: binary ? 'buffer' : 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, CI: 'true' },
  });
}

function query(sql) {
  const out = wrangler(['d1', 'execute', DB_NAME, target, '--json', '--command', sql]);
  return JSON.parse(out)[0]?.results ?? [];
}

const sqlString = (v) => `'${String(v).replace(/'/g, "''")}'`;
// wrangler 4 defaults to local storage, so the target is always explicit
const r2Target = [target];
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function readD1File(row) {
  let base64 = '';
  if (row.inline_len > 0) {
    base64 = query(`SELECT data FROM uploaded_files WHERE key = ${sqlString(row.key)}`)[0]?.data || '';
  } else {
    const chunks = query(`SELECT data FROM file_chunks WHERE key = ${sqlString(row.key)} ORDER BY chunk_index`);
    base64 = chunks.map((c) => c.data).join('');
  }
  return Buffer.from(base64, 'base64');
}

const rows = query('SELECT key, filename, mime_type, size, length(data) AS inline_len FROM uploaded_files ORDER BY key');
console.log(`${rows.length} file(s) in D1 uploaded_files (${target})`);

const workDir = mkdtempSync(path.join(os.tmpdir(), 'r2-migrate-'));
const verified = [];
const failed = [];

for (const [i, row] of rows.entries()) {
  const label = `[${i + 1}/${rows.length}] ${row.key}`;
  try {
    const data = readD1File(row);
    if (data.length === 0) throw new Error('no data in D1');
    if (row.size && Number(row.size) !== data.length) {
      throw new Error(`size mismatch: D1 says ${row.size}, decoded ${data.length}`);
    }

    const localFile = path.join(workDir, `${i}.bin`);
    writeFileSync(localFile, data);
    const filename = row.filename || row.key.split('/').pop();
    wrangler([
      'r2', 'object', 'put', `${BUCKET}/${row.key}`,
      '--file', localFile,
      '--content-type', row.mime_type || 'application/octet-stream',
      '--content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      ...r2Target,
    ], { cli: R2_WRANGLER });

    const roundTrip = wrangler(['r2', 'object', 'get', `${BUCKET}/${row.key}`, '--pipe', ...r2Target], { binary: true, cli: R2_WRANGLER });
    if (sha256(roundTrip) !== sha256(data)) {
      throw new Error(`R2 copy differs (got ${roundTrip.length} bytes, expected ${data.length})`);
    }
    verified.push(row.key);
    console.log(`${label}  ✓ ${data.length} bytes`);
  } catch (err) {
    failed.push(row.key);
    console.error(`${label}  ✗ ${err.message.split('\n')[0]}`);
  }
}

console.log(`\nVerified in R2: ${verified.length}/${rows.length}${failed.length ? `, failed: ${failed.length}` : ''}`);

if (deleteFromD1) {
  if (failed.length > 0) {
    console.error('Not deleting anything from D1 because some files failed. Re-run after fixing them.');
    process.exit(1);
  }
  for (let i = 0; i < verified.length; i += 20) {
    const keys = verified.slice(i, i + 20).map(sqlString).join(', ');
    query(`DELETE FROM file_chunks WHERE key IN (${keys})`);
    query(`DELETE FROM uploaded_files WHERE key IN (${keys})`);
  }
  const left = query('SELECT (SELECT COUNT(*) FROM uploaded_files) AS files, (SELECT COUNT(*) FROM file_chunks) AS chunks')[0];
  console.log(`Deleted ${verified.length} verified file(s) from D1. Remaining: ${left.files} file(s), ${left.chunks} chunk(s).`);
} else if (failed.length > 0) {
  process.exit(1);
}
