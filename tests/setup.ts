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

const originalRequest = app.request.bind(app);
(app as any).request = async (input: any, init: RequestInit = {}, ...rest: any[]) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
  const pathname = url.startsWith('http') ? new URL(url).pathname : url;
  const headers = new Headers(init.headers || {});
  if (!headers.has('Authorization') && !pathname.startsWith('/api/auth/')) {
    headers.set('Authorization', `Bearer ${await adminToken()}`);
  }
  return originalRequest(input, { ...init, headers }, ...rest);
};
