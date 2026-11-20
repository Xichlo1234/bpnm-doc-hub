import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { app } from '../src/server/index.ts';
import { store } from '../src/server/db/store.ts';
import { tokenFor } from './setup.ts';
import { UPLOADS_DIR } from '../src/server/utils/fileStorage.ts';
import { isConfidentialLevel } from '../src/server/utils/access.ts';

// app.fetch bypasses the helper in setup.ts that injects an admin session into app.request
const as = async (userId: string, p: string, init: RequestInit = {}) =>
  app.fetch(
    new Request(`http://localhost${p}`, {
      ...init,
      headers: { ...(init.headers as any), Authorization: `Bearer ${await tokenFor(userId)}` },
    })
  );
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function makeUser(id: string, extra: Record<string, any> = {}) {
  const u = store.createUser({ username: id, password: 'x', name: `Người dùng ${id}`, email: `${id}@x.vn`, role: 'user', ...extra });
  // createUser assigns a random id; use it
  return u.id;
}

async function upload(userId: string, name = 'scan.pdf', content = '%PDF-1.4 test') {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return as(userId, '/api/files/upload', { method: 'POST', body: form });
}

function uploadsOnDisk(): string[] {
  return fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : [];
}

describe('Access policy helpers', () => {
  it('recognises confidential security levels', () => {
    for (const level of ['Mật', 'Tối mật', 'TUYỆT MẬT', 'Confidential', 'Secret']) expect(isConfidentialLevel(level), level).toBe(true);
    for (const level of ['Thường', 'Hạn chế (nội bộ)', '', null, 'Mặt bằng']) expect(isConfidentialLevel(level as any), String(level)).toBe(false);
  });
});

describe('Uploads require permission', () => {
  beforeEach(() => store.reset());

  it('rejects uploads from read-only users and leaves nothing on disk', async () => {
    const before = uploadsOnDisk().length;
    const res = await upload('user_viewer');
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).code).toBe('UPLOAD_FORBIDDEN');
    expect(uploadsOnDisk().length).toBe(before);
  });

  it('accepts uploads from labor-contract managers and admins, with a checksum', async () => {
    const hr = makeUser('hr1', { can_access_labor_contracts: true });
    const res = await upload(hr);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await upload('admin_root')).status).toBe(200);
  });

  it('does not store the file when a contract create is rejected', async () => {
    const hr = makeUser('hr2', { can_access_labor_contracts: true });
    const before = uploadsOnDisk().length;
    const form = new FormData();
    for (const [k, v] of Object.entries({
      contract_number: 'HĐ-X-1',
      title: 'Không phải HĐLĐ',
      contract_type: 'service',
      party_a: 'A',
      party_b: 'B',
      signed_date: '2026-01-01',
      start_date: '2026-01-01',
    }))
      form.append(k, v);
    form.append('file', new Blob(['%PDF x']), 'x.pdf');
    const res = await as(hr, '/api/contracts', { method: 'POST', body: form });
    expect(res.status).toBe(403);
    expect(uploadsOnDisk().length).toBe(before);
  });
});

describe('File reads are scoped to records the user can read', () => {
  beforeEach(() => store.reset());

  it('lets only the uploader (and admins) read a file that is not attached yet', async () => {
    const hr = makeUser('hr3', { can_access_labor_contracts: true });
    const { file_key } = (await (await upload(hr)).json()) as any;
    expect((await as(hr, `/api/files/${file_key}`)).status).toBe(200);
    expect((await as('admin_root', `/api/files/${file_key}`)).status).toBe(200);
    expect((await as('user_viewer', `/api/files/${file_key}`)).status).toBe(403);
  });

  it('hides attachments of confidential documents from users without clearance', async () => {
    const { file_key } = (await (await upload('admin_root')).json()) as any;
    const doc = store.getDocuments()[0];
    store.updateDocument(doc.id, { file_key, security_level: 'Mật' });
    expect((await as('user_viewer', `/api/files/${file_key}`)).status).toBe(403);
    const cleared = makeUser('sec1', { can_access_confidential_documents: true });
    expect((await as(cleared, `/api/files/${file_key}`)).status).toBe(200);
  });

  it('refuses to attach a file the user cannot read to a record they can edit', async () => {
    const { file_key } = (await (await upload('admin_root')).json()) as any;
    const doc = store.getDocuments()[0];
    store.updateDocument(doc.id, { file_key, security_level: 'Tối mật' });
    const hr = makeUser('hr4', { can_access_labor_contracts: true });
    const labor = store.createContract({
      contract_number: 'HĐLĐ-T-1',
      title: 'HĐLĐ thử',
      contract_type: 'labor',
      party_a: 'A',
      party_b: 'B',
      signed_date: '2026-01-01',
      start_date: '2026-01-01',
      end_date: null,
      value: 0,
      currency: 'VND',
      status: 'active',
    } as any);
    const res = await as(hr, `/api/contracts/${labor.id}`, json('PATCH', { file_key }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).code).toBe('FILE_ATTACH_FORBIDDEN');
    expect((await as(hr, `/api/files/${file_key}`)).status).toBe(403);

    // Their own fresh upload can be attached
    const own = (await (await upload(hr)).json()) as any;
    expect((await as(hr, `/api/contracts/${labor.id}`, json('PATCH', { file_key: own.file_key }))).status).toBe(200);
  });
});

describe('Confidential documents', () => {
  beforeEach(() => store.reset());

  it('are hidden from list, detail and search for users without clearance', async () => {
    const doc = store.getDocuments()[0];
    store.updateDocument(doc.id, { security_level: 'Mật', title: 'Hồ sơ tuyệt đối riêng tư' });

    const list = (await (await as('user_viewer', '/api/documents')).json()) as any[];
    expect(list.some((d) => d.id === doc.id)).toBe(false);
    const detail = await as('user_viewer', `/api/documents/${doc.id}`);
    expect(detail.status).toBe(403);
    expect(((await detail.json()) as any).code).toBe('DOCUMENT_FORBIDDEN');
    const search = (await (await as('user_viewer', '/api/search?q=riêng tư')).json()) as any;
    expect(search.documents.some((d: any) => d.id === doc.id)).toBe(false);

    const adminList = (await (await as('admin_root', '/api/documents')).json()) as any[];
    expect(adminList.some((d) => d.id === doc.id)).toBe(true);
    const cleared = makeUser('sec2', { can_access_confidential_documents: true });
    expect((await as(cleared, `/api/documents/${doc.id}`)).status).toBe(200);
  });

  it('admins can grant and revoke clearance', async () => {
    const id = makeUser('sec3');
    const res = await as('admin_root', `/api/users/${id}`, json('PATCH', { can_access_confidential_documents: true }));
    expect(res.status).toBe(200);
    expect(store.getUser(id)!.can_access_confidential_documents).toBe(true);
  });
});

describe('Notifications are per user', () => {
  beforeEach(() => store.reset());

  it('delivers an assignment only to the matching account', async () => {
    const alice = makeUser('alice');
    const bob = makeUser('bob');
    store.createDocument({
      document_number: 'ĐẾN-2026-7777',
      title: 'Giao việc thử',
      doc_type: 'incoming',
      handler: 'Người dùng alice',
      directive: 'Xử lý gấp',
      issue_date: '2026-01-01',
    } as any);

    const aliceInbox = (await (await as(alice, '/api/notifications')).json()) as any;
    const bobInbox = (await (await as(bob, '/api/notifications')).json()) as any;
    expect(aliceInbox.notifications.some((n: any) => n.title.includes('ĐẾN-2026-7777'))).toBe(true);
    expect(bobInbox.notifications.some((n: any) => n.title.includes('ĐẾN-2026-7777'))).toBe(false);

    const notifId = aliceInbox.notifications.find((n: any) => n.title.includes('ĐẾN-2026-7777')).id;
    expect((await as(bob, `/api/notifications/${notifId}/read`, { method: 'PATCH' })).status).toBe(404);
    await as(bob, '/api/notifications/read-all', { method: 'POST' });
    expect(store.getNotifications().find((n) => n.id === notifId)!.read).toBe(false);
    expect((await as(alice, `/api/notifications/${notifId}/read`, { method: 'PATCH' })).status).toBe(200);
    expect(store.getNotifications().find((n) => n.id === notifId)!.read).toBe(true);
  });

  it('shows notifications for unknown handlers to admins only', async () => {
    store.createDocument({ document_number: 'ĐẾN-2026-7778', title: 'X', doc_type: 'incoming', handler: 'Ai đó không có tài khoản', issue_date: '2026-01-01' } as any);
    const admin = (await (await as('admin_root', '/api/notifications')).json()) as any;
    const user = (await (await as('user_viewer', '/api/notifications')).json()) as any;
    expect(admin.notifications.some((n: any) => n.title.includes('ĐẾN-2026-7778'))).toBe(true);
    expect(user.notifications.some((n: any) => n.title.includes('ĐẾN-2026-7778'))).toBe(false);
  });
});

describe('Shipped source contains no business data', () => {
  it('seeds no documents, contracts or partners outside tests', async () => {
    const seedSrc = fs.readFileSync(path.join(process.cwd(), 'src/server/db/seed.ts'), 'utf-8');
    expect(seedSrc).not.toMatch(/\.json'/);
    for (const f of ['excel_contracts.json', 'excel_documents.json', 'excel_partners.json']) {
      expect(fs.existsSync(path.join(process.cwd(), 'src/server/db', f)), f).toBe(false);
    }
  });
});

describe('Security headers', () => {
  it('are set on API and fallback responses', async () => {
    for (const p of ['/api/health', '/some/spa/route']) {
      const res = await app.fetch(new Request(`http://localhost${p}`));
      expect(res.headers.get('X-Frame-Options'), p).toBe('SAMEORIGIN');
      expect(res.headers.get('Content-Security-Policy'), p).toContain("script-src 'self'");
      expect(res.headers.get('X-Content-Type-Options'), p).toBe('nosniff');
    }
  });

  it('keeps the sandbox CSP on active-content downloads', async () => {
    const form = new FormData();
    form.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>']), 'x.svg');
    const up = (await (await as('admin_root', '/api/files/upload', { method: 'POST', body: form })).json()) as any;
    const res = await as('admin_root', `/api/files/${up.file_key}`);
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
  });
});
