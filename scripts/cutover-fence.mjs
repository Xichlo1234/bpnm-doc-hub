#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { planCutoverFence } from './lib/cutover-fence.mjs';

const [mode, path] = process.argv.slice(2);
if (!['--fence', '--unfence', '--inspect'].includes(mode) || !path) {
  console.error('Usage: node scripts/cutover-fence.mjs <--fence | --unfence | --inspect> <local SQLite snapshot>');
  process.exit(2);
}
const db = new DatabaseSync(path, { readOnly: true });
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);
  const plan = planCutoverFence(tables);
  if (mode === '--inspect') {
    const installed = new Map(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all().map(row => [row.name, row.sql]));
    const normalize = sql => String(sql ?? '').trim().replace(/;$/, '').replace(/\s+/g, ' ');
    const mismatched = plan.triggers.filter(trigger => normalize(installed.get(trigger.name)) !== normalize(trigger.sql)).map(trigger => trigger.name);
    console.log(JSON.stringify({ expected: plan.triggers.length, mismatched }, null, 2));
    process.exitCode = mismatched.length > 0 ? 1 : 0;
  } else {
    console.log(mode === '--fence' ? plan.apply : plan.release);
  }
} finally {
  db.close();
}
