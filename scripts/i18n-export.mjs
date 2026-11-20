#!/usr/bin/env node
// Writes every UI string as one CSV row (key, vi, en, km) so translations can be reviewed in Excel.
//
//   node scripts/i18n-export.mjs                      # -> docs/i18n/translations.csv
//   node scripts/i18n-export.mjs path/to/out.csv
//
// Also appends the display labels for stored default values (src/client/src/i18n/seedLabels.ts) as
// rows keyed "seed:<value>". Khmer texts were drafted without a native speaker and need review.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I18N = path.join(ROOT, 'src/client/src/i18n');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'docs/i18n/translations.csv'));

const unquote = (s) => s.replace(/\\(.)/g, '$1');

// Dictionary files are flat `  key: 'value',` lines.
function readDictionary(lang) {
  const text = readFileSync(path.join(I18N, `${lang}.ts`), 'utf-8');
  const entries = new Map();
  for (const m of text.matchAll(/^ {2}(\w+): '((?:[^'\\]|\\.)*)',$/gm)) entries.set(m[1], unquote(m[2]));
  return entries;
}

function readSeedLabels() {
  const text = readFileSync(path.join(I18N, 'seedLabels.ts'), 'utf-8');
  const q = "'((?:[^'\\\\]|\\\\.)*)'";
  const re = new RegExp(`^ {2}${q}: \\{ en: ${q}, km: ${q} \\},$`, 'gm');
  return [...text.matchAll(re)].map((m) => [unquote(m[1]), unquote(m[2]), unquote(m[3])]);
}

const csvCell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const vi = readDictionary('vi');
const en = readDictionary('en');
const km = readDictionary('km');

const rows = [['key', 'vi', 'en', 'km']];
for (const [key, value] of vi) rows.push([key, value, en.get(key) ?? '', km.get(key) ?? '']);
for (const [value, enLabel, kmLabel] of readSeedLabels()) rows.push([`seed:${value}`, value, enLabel, kmLabel]);

const missing = rows.slice(1).filter((r) => !r[2] || !r[3]).map((r) => r[0]);
if (missing.length) {
  console.error(`Missing en/km for: ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(path.dirname(out), { recursive: true });
// BOM so Excel opens the file as UTF-8 (Vietnamese and Khmer text).
writeFileSync(out, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
console.log(`Wrote ${rows.length - 1} rows (${vi.size} keys + ${rows.length - 1 - vi.size} seed labels) to ${path.relative(ROOT, out)}`);
