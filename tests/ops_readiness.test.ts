import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/server/index.ts';
import { store } from '../src/server/db/store.ts';
import { tokenFor } from './setup.ts';

const as = async (userId: string | null, p: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${p}`, {
      ...init,
      headers: { ...(init.headers as any), ...(userId ? { Authorization: `Bearer ${await tokenFor(userId)}` } : {}) },
    })
  );
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json()) as any;

// Every API route registered on the app, discovered from Hono itself so new routes are covered automatically
function apiRoutes(): Array<{ method: string; path: string }> {
  const seen = new Set<string>();
  return (app.routes as Array<{ method: string; path: string }>)
    .filter((r) => r.path.startsWith('/api/') && r.method !== 'ALL')
    .filter((r) => (seen.has(`${r.method} ${r.path}`) ? false : (seen.add(`${r.method} ${r.path}`), true)));
}

const PUBLIC = new Set(['GET /api/health', 'POST /api/auth/login', 'POST /api/auth/logout']);
// Routes any signed-in user may call to change their own state
const SELF_SERVICE = new Set(['POST /api/auth/change-password', 'PATCH /api/notifications/:id/read', 'POST /api/notifications/read-all']);

function concretePath(path: string): string {
  const doc = store.getDocuments()[0];
  const contract = store.getContracts().find((c) => c.contract_type !== 'labor')!;
  const partner = store.getPartners()[0];
  return path
    .replace(/\/:key\{[^}]+\}/, '/uploads/none.pdf')
    .replace(/\/documents\/:id/, `/documents/${doc.id}`)
    .replace(/\/contracts\/:id/, `/contracts/${contract.id}`)
    .replace(/\/partners\/:id/, `/partners/${partner.id}`)
    .replace(/\/users\/:id/, '/users/admin_root')
    .replace(/:type\/:id/, `document/${doc.id}`)
    .replace(/:type\/:index/, 'agencies/0')
    .replace(/:type/, 'agencies')
    .replace(/:attId|:id/g, 'x');
}

describe('Security regression: every API route', () => {
  beforeEach(() => store.reset());

  it('discovers the API surface', () => {
    expect(apiRoutes().length).toBeGreaterThan(50);
  });

  it('refuses anonymous calls (except login/logout/health)', async () => {
    for (const r of apiRoutes()) {
      if (PUBLIC.has(`${r.method} ${r.path}`)) continue;
      const res = await as(null, concretePath(r.path), r.method === 'GET' ? {} : send(r.method, {}));
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it('never lets a read-only user change anything', async () => {
    for (const r of apiRoutes()) {
      const key = `${r.method} ${r.path}`;
      if (r.method === 'GET' || PUBLIC.has(key) || SELF_SERVICE.has(key)) continue;
      const res = await as('user_viewer', concretePath(r.path), send(r.method, { title: 'x', to: 'assigned', handler: 'x', links: [], rows: [{}] }));
      expect(res.status < 200 || res.status >= 300, `${key} returned ${res.status}`).toBe(true);
      expect(res.status < 500, `${key} returned ${res.status}`).toBe(true);
    }
  });

  it('keeps admin-only reads away from regular users', async () => {
    for (const p of ['/api/users', '/api/audit-logs', '/api/trash', '/api/imports', '/api/admin/storage-check']) {
      expect((await as('user_viewer', p)).status, p).toBe(403);
    }
  });

  it('rejects oversized requests before reading them', async () => {
    const big = 'x'.repeat(13 * 1024 * 1024);
    const res = await as('admin_root', '/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(big.length) }, body: big });
    expect(res.status).toBe(413);
    expect((await json(res)).code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('Many users at once', () => {
  beforeEach(() => store.reset());

  it('saves concurrent edits of different records', async () => {
    const docs = store.getDocuments().slice(0, 10);
    const results = await Promise.all(
      docs.map((d, i) => as('admin_root', `/api/documents/${d.id}`, send('PATCH', { notes: `ghi chú ${i}`, expected_revision: d.revision ?? 0 })))
    );
    expect(results.map((r) => r.status)).toEqual(docs.map(() => 200));
    docs.forEach((d, i) => expect(store.getDocument(d.id)!.notes).toBe(`ghi chú ${i}`));
  });

  it('lets exactly one of several simultaneous edits of the same record win', async () => {
    const d = store.getDocuments()[0];
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => as('admin_root', `/api/documents/${d.id}`, send('PATCH', { title: `Bản ${i}`, expected_revision: d.revision ?? 0 })))
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
  });

  it('gives simultaneous new outgoing documents distinct numbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        as('admin_root', '/api/documents', send('POST', { doc_type: 'outgoing', document_number: '0900/2026/CV-HCNS', title: `CV ${i}` }))
      )
    );
    const numbers = await Promise.all(results.map(async (r) => (await json(r)).document_number));
    expect(new Set(numbers).size).toBe(8);
  });
});

describe('End-to-end record lifecycle (API)', () => {
  beforeEach(() => store.reset());

  it('receive → upload → assign → complete → archive → delete → restore, all in the history', async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ doc_type: 'incoming', document_number: 'ĐẾN-2026-0901', original_doc_number: '12/UBND', title: 'Công văn E2E' })) form.append(k, v);
    form.append('file', new Blob(['%PDF e2e']), 'scan.pdf');
    const created = await json(await as('admin_root', '/api/documents', { method: 'POST', body: form }));
    expect(created.status).toBe('Chưa phân công');

    const v2 = new FormData();
    v2.append('file', new Blob(['%PDF e2e v2']), 'scan-v2.pdf');
    const atts = (await json(await as('admin_root', `/api/attachments/document/${created.id}`))).attachments;
    v2.append('replaces', atts[0].id);
    expect((await as('admin_root', `/api/attachments/document/${created.id}`, { method: 'POST', body: v2 })).status).toBe(201);

    for (const step of [{ to: 'assigned', handler: 'Người dùng X' }, { to: 'processing' }, { to: 'completed' }, { to: 'archived' }]) {
      expect((await as('admin_root', `/api/documents/${created.id}/transition`, send('POST', step))).status, step.to).toBe(200);
    }
    const archive = (await json(await as('admin_root', '/api/documents'))).find((d: any) => d.id === created.id);
    expect(archive.status).toBe('Lưu trữ');

    expect((await as('admin_root', `/api/documents/${created.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await as('admin_root', `/api/trash/document/${created.id}/restore`, { method: 'POST' })).status).toBe(200);

    const { history } = await json(await as('admin_root', `/api/history/document/${created.id}`));
    const actions = history.map((h: any) => h.action);
    for (const a of ['create', 'replace_file', 'update', 'delete', 'restore']) expect(actions, a).toContain(a);
    // The new version is the record's file; the original stays downloadable
    const restored = await json(await as('admin_root', `/api/documents/${created.id}`));
    expect(restored.file_name).toBe('scan-v2.pdf');
    expect((await as('admin_root', `/api/files/${atts[0].file_key}`)).status).toBe(200);
  });
});

describe('Edit forms send whole records back', () => {
  beforeEach(() => store.reset());

  it('accepts a PATCH of the record exactly as GET returned it (with logs and computed fields)', async () => {
    const created = await json(
      await as('admin_root', '/api/documents', send('POST', { doc_type: 'incoming', document_number: 'ĐẾN-2026-0950', title: 'Vòng lặp', handler: 'A', directive: 'B' }))
    );
    const current = await json(await as('admin_root', `/api/documents/${created.id}`));
    expect(current.directive_log).toHaveLength(1);
    expect(current.allowed_transitions.length).toBeGreaterThan(0);
    const res = await as('admin_root', `/api/documents/${created.id}`, send('PATCH', { ...current, title: 'Đã sửa', expected_revision: current.revision }));
    expect(res.status).toBe(200);
    const saved = await json(res);
    expect(saved.title).toBe('Đã sửa');
    // The server-maintained log was not replaced by the client copy
    expect(saved.directive_log).toHaveLength(1);

    const c = store.getContracts()[0];
    const fullContract = await json(await as('admin_root', `/api/contracts/${c.id}`));
    expect((await as('admin_root', `/api/contracts/${c.id}`, send('PATCH', { ...fullContract, notes: 'x', expected_revision: fullContract.revision ?? 0 }))).status).toBe(200);
  });
});
