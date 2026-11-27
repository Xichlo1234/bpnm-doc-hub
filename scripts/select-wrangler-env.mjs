// Flattens one `env.<name>` block of wrangler.jsonc into a generated wrangler.json, which
// Wrangler 3 reads in preference to wrangler.jsonc. Used by the Cloudflare Workers Builds
// build command of a tenant whose dashboard offers no "Deploy command" field, so the default
// `npx wrangler deploy` targets that tenant's Worker, domain, D1 and R2.
//
//   node scripts/select-wrangler-env.mjs document-manage
//
// Refuses to run outside Workers Builds (WORKERS_CI=1): a stray wrangler.json on a developer
// machine would silently redirect every local wrangler command to that tenant. Pass --force
// only to inspect the output locally, and delete wrangler.json afterwards.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const envName = args.find((a) => !a.startsWith('--'));
const force = args.includes('--force');

if (!envName) {
  console.error('usage: node scripts/select-wrangler-env.mjs <env-name> [--force]');
  process.exit(2);
}
if (process.env.WORKERS_CI !== '1' && !force) {
  console.error('Refusing to write wrangler.json outside Cloudflare Workers Builds (WORKERS_CI is not 1).');
  process.exit(2);
}

/** Removes // and /* *\/ comments and trailing commas, leaving string contents intact. */
function stripJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const source = JSON.parse(stripJsonc(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8')));
const envBlock = source.env?.[envName];
if (!envBlock) {
  console.error(`wrangler.jsonc has no env "${envName}"`);
  process.exit(2);
}
if (!envBlock.name) {
  console.error(`env "${envName}" must set "name" explicitly`);
  process.exit(2);
}

const { env: _envs, $schema: _schema, ...base } = source;
const flat = { ...base, ...envBlock };
fs.writeFileSync(path.join(root, 'wrangler.json'), JSON.stringify(flat, null, 2) + '\n');

const d1 = (flat.d1_databases ?? []).map((d) => `${d.binding}=${d.database_name}`).join(', ');
const r2 = (flat.r2_buckets ?? []).map((b) => `${b.binding}=${b.bucket_name}`).join(', ');
const routes = (flat.routes ?? []).map((r) => r.pattern ?? r).join(', ');
console.log(`wrangler.json written for env "${envName}": worker=${flat.name} routes=${routes} d1=[${d1}] r2=[${r2}]`);
