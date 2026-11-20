// Runs before every test file (see vitest.config.ts).
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeAll, beforeEach } from 'vitest';

// 1. Point the server at a throwaway copy of data/ so tests never touch real records.
//    Must happen before any server module is imported, hence the dynamic imports below.
const sourceDir = path.join(process.cwd(), 'data');
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgii-test-data-'));
for (const name of fs.readdirSync(sourceDir)) {
  if (name.endsWith('.json')) fs.copyFileSync(path.join(sourceDir, name), path.join(testDataDir, name));
}
process.env.DATA_DIR = testDataDir;

const { app } = await import('../src/server/index.ts');
const { store } = await import('../src/server/db/store.ts');
const { getDatabase } = await import('../src/server/db/database.ts');
const { resetLoginThrottle } = await import('../src/server/routes/auth.ts');
const { getAuthSecret, signSessionToken } = await import('../src/server/utils/security.ts');

beforeAll(async () => {
  // Creates data/app.db in the temp DATA_DIR, applies migrations and imports the copied JSON files
  await store.sync(await getDatabase(), 'json');
});

beforeEach(async () => {
  await resetLoginThrottle();
});

// 2. Legacy suites call app.request() without credentials. Give those calls a real, signed admin
//    session so they exercise the production auth path. Auth endpoints are left untouched, and
//    tests that need an anonymous request use app.fetch() directly.
export async function adminToken(): Promise<string> {
  const admin = store.getUser('admin_root')!;
  const now = Date.now();
  return signSessionToken(
    { sub: admin.id, tv: admin.token_version || 0, sid: 'test-session', iat: now, exp: now + 3600_000 },
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
