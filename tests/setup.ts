// Runs before every test file (see vitest.config.ts).
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeAll, beforeEach } from 'vitest';

// 1. Point the server at an empty throwaway DATA_DIR so tests never touch real records, and seed
//    the store with the synthetic fixtures. Must happen before any server module is imported,
//    hence the dynamic imports below.
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-test-data-'));
process.env.DATA_DIR = testDataDir;

const { setSeedDataset } = await import('../src/server/db/seed.ts');
const { fixtureDataset } = await import('./fixtures/index.ts');
setSeedDataset(fixtureDataset);

const { app } = await import('../src/server/index.ts');
const { store } = await import('../src/server/db/store.ts');
const { getDatabase } = await import('../src/server/db/database.ts');
const { resetLoginThrottle } = await import('../src/server/routes/auth.ts');
const { getAuthSecret, signSessionToken } = await import('../src/server/utils/security.ts');

beforeAll(async () => {
  // Creates app.db in the temp DATA_DIR, applies migrations and imports the fixture dataset
  await store.sync(await getDatabase(), 'json');
});

beforeEach(async () => {
  await resetLoginThrottle();
});

// 2. Legacy suites call app.request() without credentials. Give those calls a real, signed admin
//    session so they exercise the production auth path. Auth endpoints are left untouched, and
//    tests that need an anonymous request use app.fetch() directly.
export async function adminToken(): Promise<string> {
  return tokenFor('admin_root');
}

/** A signed session for any account in the store (it must exist and be active to be accepted). */
export async function tokenFor(userId: string): Promise<string> {
  const account = store.getUser(userId)!;
  const now = Date.now();
  return signSessionToken(
    { sub: account.id, tv: account.token_version || 0, sid: `test-session-${userId}`, iat: now, exp: now + 3600_000 },
    getAuthSecret()!
  );
}

/**
 * Test clients behave like the real UI: a change to a document/contract carries the revision the
 * client loaded (expected_revision). This helper adds the current stored revision to such requests
 * when a test does not set one itself. Requests that must omit it (tests of REVISION_REQUIRED) use
 * app.fetch directly.
 */
export function withLoadedRevision(url: string, init: RequestInit = {}): RequestInit {
  const method = (init.method || 'GET').toUpperCase();
  if (method === 'GET') return init;
  const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];
  let m = /^\/api\/(documents|contracts)\/([^/]+)(?:\/(transition|appendices|links|terminate|liquidate))?$/.exec(path);
  let type = m?.[1] === 'documents' ? 'document' : m ? 'contract' : null;
  let id = m ? decodeURIComponent(m[2]) : null;
  if (m && method === 'DELETE') return init;
  // Admin edits of accounts and partners carry the revision too (migration 0009)
  const acct = /^\/api\/(users|partners)\/([^/]+)$/.exec(path);
  if (acct) {
    const rec: any = acct[1] === 'users' ? store.getUser(decodeURIComponent(acct[2])) : store.getPartner(decodeURIComponent(acct[2]));
    if (!rec) return init;
    if (method === 'DELETE') {
      if (url.includes('expected_revision=')) return init;
      return { ...init, __url: `${url}${url.includes('?') ? '&' : '?'}expected_revision=${rec.revision ?? 0}` } as any;
    }
    if (typeof init.body === 'string') {
      const body = JSON.parse(init.body);
      if (body && typeof body === 'object' && body.expected_revision === undefined) body.expected_revision = rec.revision ?? 0;
      return { ...init, body: JSON.stringify(body) };
    }
    return init;
  }
  const att = /^\/api\/attachments\/(document|contract)\/([^/]+)$/.exec(path);
  if (att) {
    type = att[1];
    id = decodeURIComponent(att[2]);
  }
  const detach = /^\/api\/attachments\/([^/]+)$/.exec(path);
  if (detach && method === 'DELETE') {
    const a = store.getAttachment(decodeURIComponent(detach[1]));
    if (!a) return init;
    const rec = a.record_type === 'document' ? store.getDocument(a.record_id) : store.getContract(a.record_id);
    if (!rec || url.includes('expected_revision=')) return init;
    return { ...init, __url: `${url}${url.includes('?') ? '&' : '?'}expected_revision=${rec.revision ?? 0}` } as any;
  }
  if (path === '/api/files/sync-drive' && typeof init.body === 'string') {
    const body = JSON.parse(init.body);
    const rec = body.type === 'document' ? store.getDocument(body.id) : store.getContract(body.id);
    if (rec && body.expected_revision === undefined) body.expected_revision = rec.revision ?? 0;
    return { ...init, body: JSON.stringify(body) };
  }
  if (!type || !id || ['bulk-import', 'import'].includes(id)) return init;
  const rec = type === 'document' ? store.getDocument(id) : store.getContract(id);
  if (!rec) return init;
  if (init.body instanceof FormData) {
    if (!init.body.has('expected_revision')) init.body.append('expected_revision', String(rec.revision ?? 0));
    return init;
  }
  if (typeof init.body === 'string' || init.body === undefined) {
    let body: any = {};
    try {
      body = init.body ? JSON.parse(init.body as string) : {};
    } catch {
      return init;
    }
    if (body && typeof body === 'object' && !Array.isArray(body) && body.expected_revision === undefined) {
      body.expected_revision = rec.revision ?? 0;
      const headers = new Headers(init.headers || {});
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      return { ...init, headers, body: JSON.stringify(body) };
    }
  }
  return init;
}

/** app.fetch with a signed session for `userId` (or anonymous) and the loaded revision added. */
export async function fetchAs(userId: string | null, url: string, init: RequestInit & { rawRevision?: boolean } = {}) {
  const { rawRevision, ...rest } = init;
  const prepared: any = rawRevision ? rest : withLoadedRevision(url, rest);
  const finalUrl = prepared.__url || url;
  delete prepared.__url;
  const headers = new Headers(prepared.headers || {});
  if (userId) headers.set('Authorization', `Bearer ${await tokenFor(userId)}`);
  return app.fetch(new Request(`http://localhost${finalUrl}`, { ...prepared, headers }));
}

const originalRequest = app.request.bind(app);
(app as any).request = async (input: any, init: RequestInit = {}, ...rest: any[]) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
  const pathname = url.startsWith('http') ? new URL(url).pathname : url;
  const headers = new Headers(init.headers || {});
  if (!headers.has('Authorization') && !pathname.startsWith('/api/auth/')) {
    headers.set('Authorization', `Bearer ${await adminToken()}`);
  }
  const prepared: any = withLoadedRevision(url, { ...init, headers });
  const finalUrl = prepared.__url;
  delete prepared.__url;
  return originalRequest(finalUrl || input, prepared, ...rest);
};
