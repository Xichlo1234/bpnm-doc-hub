import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/server/index.ts';
import { store } from '../src/server/db/store.ts';
import { adminToken } from './setup.ts';
import { getDatabase } from '../src/server/db/database.ts';

// app.fetch bypasses the test helper that injects an admin session into app.request
const anon = (path: string, init?: RequestInit) => app.fetch(new Request(`http://localhost${path}`, init));
const withToken = (path: string, token: string, init: RequestInit = {}) =>
  anon(path, { ...init, headers: { ...(init.headers as any), Authorization: `Bearer ${token}` } });

async function login(username: string, password: string) {
  return anon('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

async function uploadFile(name: string, content: string, type = 'application/octet-stream') {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  return app.request('/api/files/upload', { method: 'POST', body: form });
}

describe('Security: authentication', () => {
  beforeEach(() => store.reset());

  it('rejects anonymous access to data and file endpoints', async () => {
    for (const path of ['/api/documents', '/api/contracts', '/api/partners', '/api/search?q=a', '/api/stats', '/api/notifications']) {
      expect((await anon(path)).status, path).toBe(401);
    }
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.pdf');
    expect((await anon('/api/files/upload', { method: 'POST', body: form })).status).toBe(401);
    const sync = await anon('/api/files/sync-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'x', type: 'contract', drive_url: 'https://evil.example' }),
    });
    expect(sync.status).toBe(401);
    expect((await anon('/api/health')).status).toBe(200);
  });

  it('rejects the old hardcoded backdoor tokens', async () => {
    for (const token of ['admin_test_token', 'test_admin_token']) {
      expect((await withToken('/api/users', token)).status).toBe(401);
    }
  });

  it('rejects forged tokens (legacy unsigned format and tampered signature)', async () => {
    const legacyPayload = Buffer.from(
      JSON.stringify({ user: { id: 'ghost', role: 'admin' }, expiresAt: Date.now() + 1e9, sig: 'sgii_doc_mgr_jwt_key_2026' })
    ).toString('base64url');
    expect((await withToken('/api/users', `sgii_token.${legacyPayload}`)).status).toBe(401);

    const [prefix, , sig] = (await adminToken()).split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: 'admin_root', tv: 0, sid: 'x', iat: 0, exp: Date.now() + 1e9, extra: 1 })
    ).toString('base64url');
    expect((await withToken('/api/users', `${prefix}.${forgedBody}.${sig}`)).status).toBe(401);
  });

  it('hashes passwords on login and never returns them', async () => {
    expect((await login('admin', 'AdminTest@2026')).status).toBe(200);
    expect(store.getUser('admin_root')!.password).toMatch(/^pbkdf2\$/);
    // Hashed password still verifies
    expect((await login('admin', 'AdminTest@2026')).status).toBe(200);

    const users = (await (await app.request('/api/users')).json()) as any[];
    expect(users.every((u) => u.password === undefined)).toBe(true);
  });

  it('rejects weak passwords when creating users', async () => {
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'weak', password: '123456', name: 'W', email: 'w@x.vn' }),
    });
    expect(res.status).toBe(400);
  });

  it('forces a password change at the backend while must_change_password is set', async () => {
    store.updateUser('user_viewer', { must_change_password: true });
    const res = await login('user', 'UserTest@2026');
    const { token, user } = (await res.json()) as any;
    expect(user.must_change_password).toBe(true);
    for (const path of ['/api/documents', '/api/contracts', '/api/notifications', '/api/files/samples/x.pdf']) {
      const blocked = await withToken(path, token);
      expect(blocked.status, path).toBe(403);
      expect(((await blocked.json()) as any).code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    expect((await withToken('/api/auth/me', token)).status).toBe(200);
    const changed = await withToken('/api/auth/change-password', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'UserTest@2026', new_password: 'UserNew@2026' }),
    });
    expect(changed.status).toBe(200);
    const fresh = (await changed.json()) as any;
    expect(fresh.user.must_change_password).toBe(false);
    expect((await withToken('/api/documents', fresh.token)).status).toBe(200);
    // The pre-change session is revoked
    expect((await withToken('/api/auth/me', token)).status).toBe(401);
  });

  it('flags accounts that still use a published default password', async () => {
    store.updateUser('admin_root', { password: 'Admin@6868', must_change_password: false });
    const res = await login('admin', 'Admin@6868');
    expect(res.status).toBe(200);
    const { token, user } = (await res.json()) as any;
    expect(user.must_change_password).toBe(true);
    expect(store.getUser('admin_root')!.must_change_password).toBe(true);
    expect((await withToken('/api/users', token)).status).toBe(403);
    const reuse = await withToken('/api/auth/change-password', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'Admin@6868', new_password: 'User@123456' }),
    });
    expect(reuse.status).toBe(400);
  });

  it('makes admin-assigned passwords temporary', async () => {
    const created = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'temp_pw', password: 'Temp@2026x', name: 'T', email: 't@x.vn' }),
    });
    expect(created.status).toBe(201);
    expect(store.getUserByUsername('temp_pw')!.must_change_password).toBe(true);
    await app.request('/api/users/user_viewer', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'Reset@2026x' }),
    });
    expect(store.getUser('user_viewer')!.must_change_password).toBe(true);
  });

  it('new installs ship bootstrap accounts that must change their password', async () => {
    const { defaultUsers } = await import('../src/server/db/persistence.ts');
    expect(defaultUsers.every((u) => u.must_change_password === true)).toBe(true);
  });

  it('revokes existing sessions when an admin resets the password', async () => {
    const { token } = (await (await login('user', 'UserTest@2026')).json()) as any;
    expect((await withToken('/api/documents', token)).status).toBe(200);
    const reset = await app.request('/api/users/user_viewer', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'NewPass@2026' }),
    });
    expect(reset.status).toBe(200);
    expect((await withToken('/api/documents', token)).status).toBe(401);
  });

  it('invalidates the session when an admin locks an account, even after unlocking it', async () => {
    const { token } = (await (await login('user', 'UserTest@2026')).json()) as any;
    const setStatus = (status: 'active' | 'locked') => app.request('/api/users/user_viewer', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    expect((await setStatus('locked')).status).toBe(200);
    expect((await withToken('/api/documents', token)).status).toBe(401);
    expect((await setStatus('active')).status).toBe(200);
    expect((await withToken('/api/documents', token)).status).toBe(401);
    const fresh = await login('user', 'UserTest@2026');
    expect(fresh.status).toBe(200);
    expect((await withToken('/api/documents', ((await fresh.json()) as { token: string }).token)).status).toBe(200);
  });

  it('stores logout revocations and login failures in the database (shared by all isolates)', async () => {
    const db = await getDatabase();
    const { token } = (await (await login('user', 'UserTest@2026')).json()) as any;
    await withToken('/api/auth/logout', token, { method: 'POST' });
    const sid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;
    expect(await db.prepare('SELECT sid FROM auth_revoked_sessions WHERE sid = ?').bind(sid).first()).toBeTruthy();

    await login('user', 'wrong-password');
    const row = await db.prepare("SELECT count FROM auth_login_failures WHERE key LIKE '%|user'").first<any>();
    expect(row.count).toBe(1);
  });

  it('throttles repeated failed logins', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login('admin', 'wrong-password')).status).toBe(401);
    }
    expect((await login('admin', 'AdminTest@2026')).status).toBe(429);
  });
});

describe('Security: files', () => {
  beforeEach(() => store.reset());

  it('rejects disallowed extensions and oversized files', async () => {
    expect((await uploadFile('evil.html', '<script>alert(1)</script>', 'text/html')).status).toBe(400);
    expect((await uploadFile('big.pdf', 'x'.repeat(5 * 1024 * 1024 + 1))).status).toBe(400);
  });

  it('serves SVG as a sandboxed download and keeps files out of shared caches', async () => {
    const { file_key } = (await (await uploadFile('logo.svg', '<svg><script>alert(1)</script></svg>', 'text/html')).json()) as any;
    const res = await app.request(`/api/files/${file_key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml'); // derived from extension, not client type
    expect(res.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(res.headers.get('cache-control')).toMatch(/^private/);
  });

  it('refuses keys outside uploads/ and samples/ (path traversal)', async () => {
    for (const key of ['users.json', '../package.json', 'uploads/../users.json', 'src/server/index.ts']) {
      expect((await app.request(`/api/files/${key}`)).status, key).toBe(404);
    }
  });

  it('accepts the session cookie for file downloads only', async () => {
    const loginRes = await login('admin', 'AdminTest@2026');
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0];
    expect(cookie).toMatch(/^sgii_session=/);
    const { file_key } = (await (await uploadFile('a.pdf', 'pdf')).json()) as any;

    expect((await anon(`/api/files/${file_key}`, { headers: { Cookie: cookie } })).status).toBe(200);
    expect((await anon('/api/documents', { headers: { Cookie: cookie } })).status).toBe(401);
  });

  it('hides labor contract attachments from users without labor access', async () => {
    const { file_key } = (await (await uploadFile('hdld.pdf', 'salary')).json()) as any;
    const contract = store.getContracts()[0];
    store.updateContract(contract.id, { contract_type: 'labor', file_key });

    const { token } = (await (await login('user', 'UserTest@2026')).json()) as any;
    expect((await withToken(`/api/files/${file_key}`, token)).status).toBe(403);
    expect((await app.request(`/api/files/${file_key}`)).status).toBe(200);
  });

  it('only lets admins re-link records to Google Drive', async () => {
    const { token } = (await (await login('user', 'UserTest@2026')).json()) as any;
    const doc = store.getDocuments()[0];
    const res = await withToken('/api/files/sync-drive', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: doc.id, type: 'document', drive_url: 'https://evil.example' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('Security: input validation', () => {
  beforeEach(() => store.reset());

  const json = (method: string, body: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('rejects javascript: links and arbitrary file keys on records', async () => {
    const doc = store.getDocuments()[0];
    const bad = await app.request(`/api/documents/${doc.id}`, json('PATCH', { google_drive_url: 'javascript:alert(1)' }));
    expect(bad.status).toBe(400);
    const badKey = await app.request(`/api/documents/${doc.id}`, json('PATCH', { file_key: '../users.json' }));
    expect(badKey.status).toBe(400);

    const ok = await app.request(`/api/documents/${doc.id}`, json('PATCH', { google_drive_url: 'drive.google.com/file/d/abc' }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).google_drive_url).toBe('https://drive.google.com/file/d/abc');
  });

  it('ignores attempts to overwrite server-managed fields such as id', async () => {
    const doc = store.getDocuments()[0];
    const res = await app.request(`/api/documents/${doc.id}`, json('PATCH', { id: 'hijacked', title: 'Mới' }));
    const body = (await res.json()) as any;
    expect(body.id).toBe(doc.id);
    expect(store.getDocument('hijacked')).toBeNull();
  });

  it('rejects nested objects and wrong types in record bodies', async () => {
    const c = store.getContracts()[0];
    expect((await app.request(`/api/contracts/${c.id}`, json('PATCH', { value: 'abc' }))).status).toBe(400);
    expect((await app.request(`/api/contracts/${c.id}`, json('PATCH', { custom: { $gt: 1 } }))).status).toBe(400);
    expect((await app.request(`/api/contracts/${c.id}`, json('PATCH', { value: '1500' }))).status).toBe(200);
    expect(store.getContract(c.id)!.value).toBe(1500);
  });

  it('validates users, settings, currencies and category types', async () => {
    const badEmail = await app.request('/api/users', json('POST', { username: 'ok_user', password: 'Valid@2026', name: 'A', email: 'not-an-email' }));
    expect(badEmail.status).toBe(400);
    const badRole = await app.request('/api/users/user_viewer', json('PATCH', { role: 'superadmin' }));
    expect(badRole.status).toBe(400);
    expect((await app.request('/api/categories/settings', json('PATCH', { alert_level_1_days: -5 }))).status).toBe(400);
    expect((await app.request('/api/categories/currencies', json('POST', { code: 'US', name: 'x' }))).status).toBe(400);
    expect((await app.request('/api/categories/__proto__', json('POST', { item: 'x' }))).status).toBe(400);
    expect((await app.request('/api/categories/agencies', json('POST', { item: 'Sở Tư pháp' }))).status).toBe(201);
  });

  it('stops labor-only users from converting other contracts into labor contracts', async () => {
    store.updateUser('user_viewer', { can_access_labor_contracts: true });
    const { token } = (await (await login('user', 'UserTest@2026')).json()) as any;
    const economic = store.getContracts().find((ct) => ct.contract_type !== 'labor')!;
    const res = await withToken(`/api/contracts/${economic.id}`, token, json('PATCH', { contract_type: 'labor', title: 'x' }));
    expect(res.status).toBe(403);
  });
});

describe('Security: legacy values stay editable', () => {
  beforeEach(() => store.reset());

  it('accepts an unchanged legacy free-text file_key when the record is edited', async () => {
    const doc = store.getDocuments()[0];
    store.updateDocument(doc.id, { file_key: 'SGII Project Delivery (External) - Documents' });
    const full = store.getDocument(doc.id)!;
    const res = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...full, title: 'Sửa tiêu đề' }),
    });
    expect(res.status).toBe(200);
    expect(store.getDocument(doc.id)!.file_key).toBe('SGII Project Delivery (External) - Documents');
  });
});

describe('Bulk import keeps legacy values importable', () => {
  beforeEach(() => store.reset());

  it('accepts re-importing exported documents that carry a legacy file_key', async () => {
    const doc = store.getDocuments()[0];
    store.updateDocument(doc.id, { file_key: 'SGII Project Delivery (External) - Documents' });
    const exported = store.getDocuments();
    const res = await app.request('/api/documents/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: exported }),
    });
    expect(res.status).toBe(200);
  });
});

describe('Optimistic concurrency', () => {
  beforeEach(() => store.reset());
  const patch = (path: string, body: unknown) =>
    app.request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('rejects a save based on an outdated revision with 409 and keeps the newer data', async () => {
    const doc = store.getDocuments()[0];
    const loaded = doc.revision ?? 0;

    // Two people open the same record; the first one saves
    const first = await patch(`/api/documents/${doc.id}`, { title: 'Bản của A', expected_revision: loaded });
    expect(first.status).toBe(200);
    expect(((await first.json()) as any).revision).toBe(loaded + 1);

    // The second one saves from the stale form
    const second = await patch(`/api/documents/${doc.id}`, { title: 'Bản của B', expected_revision: loaded });
    expect(second.status).toBe(409);
    const body = (await second.json()) as any;
    expect(body.code).toBe('REVISION_CONFLICT');
    expect(body.current.title).toBe('Bản của A');
    expect(store.getDocument(doc.id)!.title).toBe('Bản của A');
  });

  it('applies to contracts, and clients without expected_revision are not blocked', async () => {
    const c = store.getContracts()[0];
    expect((await patch(`/api/contracts/${c.id}`, { notes: 'x', expected_revision: (c.revision ?? 0) + 5 })).status).toBe(409);
    expect((await patch(`/api/contracts/${c.id}`, { notes: 'y' })).status).toBe(200);
    expect(store.getContract(c.id)!.revision).toBe((c.revision ?? 0) + 1);
  });

  it('does not store expected_revision or let clients set revision directly', async () => {
    const c = store.getContracts()[0];
    await patch(`/api/contracts/${c.id}`, { revision: 999, expected_revision: c.revision ?? 0 });
    const saved = store.getContract(c.id) as any;
    expect(saved.revision).toBe((c.revision ?? 0) + 1);
    expect('expected_revision' in saved).toBe(false);
  });

  it('bumps revisions on bulk import so open edit forms detect it', async () => {
    const c = store.getContracts()[0];
    const rows = [{ id: c.id, contract_number: c.contract_number, notes: 'import' }];
    const preview = await app.request('/api/contracts/import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const { preview_fingerprint } = await preview.json() as { preview_fingerprint: string };
    const written = await app.request('/api/contracts/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contracts: rows, confirm_updates: true, preview_fingerprint }),
    });
    expect(written.status).toBe(200);
    expect(store.getContract(c.id)!.revision).toBe((c.revision ?? 0) + 1);
  });
});
