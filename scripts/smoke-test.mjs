#!/usr/bin/env node
// End-to-end smoke test of every API feature against a running deployment.
//
//   SMOKE_BASE=https://... SMOKE_ADMIN_USER=... SMOKE_ADMIN_PASS=... node scripts/smoke-test.mjs
//   ... node scripts/smoke-test.mjs --write      # also exercises every write path
//
// Default mode only reads (safe on production). --write creates records tagged [SMOKE] / smoke_*,
// checks create/edit/permission/conflict/file flows on them, and deletes them again at the end.
// Optional SMOKE_USER / SMOKE_USER_PASS: an existing non-admin account for RBAC read checks.
// Without admin credentials only the public checks run (anonymous access, forged tokens).

const BASE = (process.env.SMOKE_BASE || 'http://localhost:5180').replace(/\/$/, '');
const ADMIN = { username: process.env.SMOKE_ADMIN_USER, password: process.env.SMOKE_ADMIN_PASS };
const USER = { username: process.env.SMOKE_USER, password: process.env.SMOKE_USER_PASS };
const WRITE = process.argv.includes('--write');
const TAG = `[SMOKE ${Date.now()}]`;
// Dates relative to today (Vietnam time) so the script keeps working as time passes
const daysFromToday = (n) => new Date(Date.now() + 7 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);

const PUBLIC_ONLY = !ADMIN.username || !ADMIN.password;
if (PUBLIC_ONLY && WRITE) {
  console.error('--write needs SMOKE_ADMIN_USER and SMOKE_ADMIN_PASS.');
  process.exit(1);
}

let passed = 0;
const failures = [];
const cleanups = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function api(path, { token, method = 'GET', body, headers = {}, raw = false } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  if (raw) return res;
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

function expectStatus(res, status, what) {
  assert(res.status === status, `${what}: expected ${status}, got ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
}

async function login(creds) {
  const res = await api('/api/auth/login', { method: 'POST', body: creds });
  expectStatus(res, 200, `login ${creds.username}`);
  return { token: res.data.token, user: res.data.user, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

const section = (title) => console.log(`\n${title}`);

async function main() {
  console.log(`Smoke test against ${BASE} (${PUBLIC_ONLY ? 'public checks only' : WRITE ? 'read + write' : 'read-only'})`);

  // ------------------------------------------------------------------
  section('Public endpoints & anonymous access');
  await check('health is up', async () => expectStatus(await api('/api/health'), 200, 'health'));
  await check('SPA shell is served', async () => {
    const res = await api('/', { raw: true });
    assert(res.status === 200 && (await res.text()).includes('<div id="root"'), 'index.html missing');
  });
  for (const path of ['/api/documents', '/api/contracts', '/api/partners', '/api/stats', '/api/search?q=a', '/api/notifications', '/api/categories', '/api/users', '/api/audit-logs']) {
    await check(`anonymous ${path} → 401`, async () => expectStatus(await api(path), 401, path));
  }
  await check('forged legacy token → 401', async () => {
    const forged = Buffer.from(JSON.stringify({ user: { id: 'x', role: 'admin' }, expiresAt: Date.now() + 1e9, sig: 'sgii_doc_mgr_jwt_key_2026' })).toString('base64url');
    expectStatus(await api('/api/users', { token: `sgii_token.${forged}` }), 401, 'forged');
  });

  await check('path traversal on files → 401/404', async () => {
    const res = await api('/api/files/..%2Fwrangler.jsonc');
    assert([401, 404].includes(res.status), `status ${res.status}`);
  });
  if (PUBLIC_ONLY) return;

  // ------------------------------------------------------------------
  section('Authentication');
  const admin = await login(ADMIN);
  await check('admin login returns profile', async () => assert(admin.user.role === 'admin' && !admin.user.must_change_password, JSON.stringify(admin.user)));
  await check('login sets HttpOnly SameSite=Strict file cookie', async () => assert(admin.cookie?.startsWith('sgii_session='), 'no session cookie'));
  await check('wrong password → 401', async () => expectStatus(await api('/api/auth/login', { method: 'POST', body: { username: ADMIN.username, password: 'definitely-wrong-1' } }), 401, 'wrong pw'));
  await check('GET /auth/me', async () => {
    const res = await api('/api/auth/me', { token: admin.token });
    expectStatus(res, 200, 'me');
    assert(res.data.user.username === ADMIN.username, 'wrong user');
  });

  // ------------------------------------------------------------------
  section('Read features');
  const docs = (await api('/api/documents', { token: admin.token })).data;
  const contracts = (await api('/api/contracts', { token: admin.token })).data;
  await check('documents list', async () => assert(Array.isArray(docs) && docs.length > 0, 'no documents'));
  await check('documents carry computed deadline_status', async () => assert(docs.every((d) => d.deadline_status?.level), 'missing deadline_status'));
  await check('contracts list with urgency', async () => assert(Array.isArray(contracts) && contracts.every((c) => c.urgency?.level), 'missing urgency'));
  await check('contracts urgency filter', async () => {
    const res = await api('/api/contracts?urgency=active', { token: admin.token });
    expectStatus(res, 200, 'filter');
    assert(res.data.every((c) => c.urgency.level === 'active'), 'filter returned other levels');
  });
  await check('document detail', async () => expectStatus(await api(`/api/documents/${encodeURIComponent(docs[0].id)}`, { token: admin.token }), 200, 'doc detail'));
  await check('contract detail', async () => expectStatus(await api(`/api/contracts/${encodeURIComponent(contracts[0].id)}`, { token: admin.token }), 200, 'contract detail'));
  await check('unknown id → 404', async () => expectStatus(await api('/api/contracts/does-not-exist', { token: admin.token }), 404, '404'));
  await check('document categories', async () => expectStatus(await api('/api/documents/categories', { token: admin.token }), 200, 'doc categories'));
  await check('next incoming number', async () => {
    const res = await api('/api/documents/next-number?type=incoming', { token: admin.token });
    assert(/^ĐẾN-\d{4}-\d{4}$/.test(res.data.nextNumber), `got ${res.data.nextNumber}`);
  });
  await check('next outgoing number', async () => {
    const res = await api('/api/documents/next-number?type=outgoing&category=CV&department=HCNS', { token: admin.token });
    assert(/^\d{4}\/\d{4}\/CV-HCNS$/.test(res.data.nextNumber), `got ${res.data.nextNumber}`);
  });
  await check('partners list', async () => assert(Array.isArray((await api('/api/partners', { token: admin.token })).data), 'not a list'));
  await check('categories, settings, currencies', async () => {
    const cats = await api('/api/categories', { token: admin.token });
    assert(Array.isArray(cats.data.doc_types) && cats.data.doc_types.length > 0, 'doc_types missing');
    expectStatus(await api('/api/categories/settings', { token: admin.token }), 200, 'settings');
    const cur = await api('/api/categories/currencies', { token: admin.token });
    assert(cur.data.some((c) => c.code === 'USD'), 'USD missing');
  });
  await check('stats', async () => {
    const res = await api('/api/stats', { token: admin.token });
    assert(typeof res.data.totalContracts === 'number', 'no totalContracts');
  });
  await check('search (Vietnamese, accent-insensitive)', async () => {
    const res = await api(`/api/search?q=${encodeURIComponent('hop dong')}`, { token: admin.token });
    expectStatus(res, 200, 'search');
    assert(Array.isArray(res.data.contracts) && Array.isArray(res.data.documents), 'bad shape');
  });
  await check('notifications', async () => assert(typeof (await api('/api/notifications', { token: admin.token })).data.unreadCount === 'number', 'no unreadCount'));
  await check('users list hides password hashes', async () => {
    const res = await api('/api/users', { token: admin.token });
    expectStatus(res, 200, 'users');
    assert(res.data.every((u) => u.password === undefined && u.token_version === undefined), 'secret fields leaked');
  });
  await check('audit log', async () => assert(Array.isArray((await api('/api/audit-logs?limit=5', { token: admin.token })).data), 'not a list'));

  const withFile = [...contracts, ...docs].find((r) => r.file_key?.startsWith('uploads/'));
  if (withFile) {
    await check(`download attachment (${withFile.file_key.slice(0, 50)})`, async () => {
      const res = await api(`/api/files/${withFile.file_key}`, { token: admin.token, raw: true });
      assert(res.status === 200, `status ${res.status}`);
      assert((await res.arrayBuffer()).byteLength > 0, 'empty body');
      assert(res.headers.get('cache-control')?.startsWith('private'), 'file cacheable publicly');
    });
    await check('download attachment via cookie (as <img>/<iframe> do)', async () => {
      expectStatus(await api(`/api/files/${withFile.file_key}`, { headers: { Cookie: admin.cookie }, raw: false }), 200, 'cookie download');
    });
    await check('cookie is not accepted for other APIs', async () => expectStatus(await api('/api/documents', { headers: { Cookie: admin.cookie } }), 401, 'cookie api'));
  }
  await check('path traversal on files → 404', async () => expectStatus(await api('/api/files/..%2Fwrangler.jsonc', { token: admin.token }), 404, 'traversal'));

  if (USER.username && USER.password) {
    section('Non-admin account');
    const user = await login(USER);
    await check('user can read documents', async () => expectStatus(await api('/api/documents', { token: user.token }), 200, 'user docs'));
    await check('user cannot manage users', async () => expectStatus(await api('/api/users', { token: user.token }), 403, 'user users'));
    await check('user cannot read audit log', async () => expectStatus(await api('/api/audit-logs', { token: user.token }), 403, 'user audit'));
    await check('user cannot delete documents', async () => expectStatus(await api(`/api/documents/${encodeURIComponent(docs[0].id)}`, { token: user.token, method: 'DELETE' }), 403, 'user delete'));
    if (!user.user.can_access_labor_contracts) {
      await check('labor contracts hidden from user without access', async () => {
        const list = (await api('/api/contracts', { token: user.token })).data;
        assert(!list.some((c) => c.contract_type === 'labor'), 'labor contract visible');
        const stats = (await api('/api/stats', { token: user.token })).data;
        assert(stats.totalLaborContracts === 0, 'labor stats visible');
      });
    }
  }

  if (WRITE) await writeTests(admin);

  section('Logout');
  await check('logout revokes the token', async () => {
    const s = await login(ADMIN);
    expectStatus(await api('/api/auth/logout', { token: s.token, method: 'POST' }), 200, 'logout');
    expectStatus(await api('/api/auth/me', { token: s.token }), 401, 'me after logout');
  });
}

async function writeTests(admin) {
  const T = admin.token;

  // ------------------------------------------------------------------
  section('Documents (write)');
  let doc;
  await check('create incoming document with PDF attachment', async () => {
    const form = new FormData();
    form.append('document_number', `${TAG}-DOC`);
    form.append('title', `${TAG} Công văn kiểm thử`);
    form.append('doc_type', 'incoming');
    form.append('issue_date', '2026-10-27');
    form.append('handler', 'Smoke Tester');
    form.append('directive', 'Kiểm tra tự động');
    form.append('file', new Blob(['%PDF-1.4 smoke'], { type: 'application/pdf' }), 'Công văn kiểm thử.pdf');
    const res = await api('/api/documents', { token: T, method: 'POST', body: form });
    expectStatus(res, 201, 'create doc');
    doc = res.data;
    cleanups.push(() => api(`/api/documents/${encodeURIComponent(doc.id)}`, { token: T, method: 'DELETE' }));
    assert(doc.file_key?.startsWith('uploads/') && doc.revision === 1, JSON.stringify(doc).slice(0, 200));
  });
  await check('attachment downloads with original Vietnamese name', async () => {
    const res = await api(`/api/files/${doc.file_key}`, { token: T, raw: true });
    assert(res.status === 200, `status ${res.status}`);
    assert((await res.text()) === '%PDF-1.4 smoke', 'content differs');
    assert(decodeURIComponent(res.headers.get('content-disposition') || '').includes('Công văn kiểm thử.pdf'), res.headers.get('content-disposition'));
  });
  await check('directive created a notification', async () => {
    const res = await api('/api/notifications', { token: T });
    assert(res.data.notifications.some((n) => n.target_id === doc.id), 'no notification');
  });
  await check('edit document (PATCH) bumps revision', async () => {
    const res = await api(`/api/documents/${encodeURIComponent(doc.id)}`, { token: T, method: 'PATCH', body: { ...doc, title: `${TAG} đã sửa`, expected_revision: doc.revision } });
    expectStatus(res, 200, 'patch');
    assert(res.data.revision === doc.revision + 1, `revision ${res.data.revision}`);
  });
  await check('stale edit → 409 conflict', async () => {
    const res = await api(`/api/documents/${encodeURIComponent(doc.id)}`, { token: T, method: 'PATCH', body: { title: 'stale', expected_revision: doc.revision } });
    expectStatus(res, 409, 'conflict');
    assert(res.data.code === 'REVISION_CONFLICT', res.data.code);
  });
  await check('validation rejects javascript: links', async () => expectStatus(await api(`/api/documents/${encodeURIComponent(doc.id)}`, { token: T, method: 'PATCH', body: { google_drive_url: 'javascript:alert(1)' } }), 400, 'js url'));
  await check('link Google Drive (sync-drive)', async () => {
    const res = await api('/api/files/sync-drive', { token: T, method: 'POST', body: { id: doc.id, type: 'document', drive_url: 'drive.google.com/file/d/smoke' } });
    expectStatus(res, 200, 'sync-drive');
    assert(res.data.google_drive_url === 'https://drive.google.com/file/d/smoke', res.data.google_drive_url);
  });
  await check('accent-insensitive search finds the edited document', async () => {
    // Title is now "… đã sửa"; typing it without diacritics must still match
    const res = await api(`/api/search?q=${encodeURIComponent('da sua')}`, { token: T });
    assert(res.data.documents.some((d) => d.id === doc.id), 'not found by search');
  });
  await check('Excel bulk import (documents)', async () => {
    const res = await api('/api/documents/bulk-import', { token: T, method: 'POST', body: { documents: [{ document_number: `${TAG}-XLS`, title: `${TAG} dòng Excel`, doc_type: 'outgoing', issue_date: '2026-10-27' }] } });
    expectStatus(res, 200, 'bulk docs');
    const created = (await api('/api/documents', { token: T })).data.find((d) => d.document_number === `${TAG}-XLS`);
    assert(created, 'imported row missing');
    cleanups.push(() => api(`/api/documents/${encodeURIComponent(created.id)}`, { token: T, method: 'DELETE' }));
  });

  // ------------------------------------------------------------------
  section('Files (write)');
  await check('upload rejects HTML and oversize files', async () => {
    const html = new FormData();
    html.append('file', new Blob(['<script>x</script>'], { type: 'text/html' }), 'x.html');
    expectStatus(await api('/api/files/upload', { token: T, method: 'POST', body: html }), 400, 'html');
    const big = new FormData();
    big.append('file', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]), 'big.pdf');
    expectStatus(await api('/api/files/upload', { token: T, method: 'POST', body: big }), 400, 'big');
  });
  await check('SVG is served as a sandboxed download', async () => {
    const form = new FormData();
    form.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }), 'logo.svg');
    const up = await api('/api/files/upload', { token: T, method: 'POST', body: form });
    expectStatus(up, 200, 'svg upload');
    const res = await api(`/api/files/${up.data.file_key}`, { token: T, raw: true });
    assert(res.headers.get('content-disposition')?.startsWith('attachment'), 'svg inline');
    assert(res.headers.get('content-security-policy')?.includes('sandbox'), 'no sandbox CSP');
  });

  // ------------------------------------------------------------------
  section('Contracts (write)');
  let contract;
  await check('create economic contract', async () => {
    const res = await api('/api/contracts', { token: T, method: 'POST', body: { contract_number: `${TAG}-HĐ`, title: `${TAG} Hợp đồng dịch vụ`, contract_type: 'service', party_a: 'SGII', party_b: 'Đối tác Smoke', value: 1500, currency: 'USD', signed_date: daysFromToday(-5), start_date: daysFromToday(-5), end_date: daysFromToday(5) } });
    expectStatus(res, 201, 'create contract');
    contract = res.data;
    cleanups.push(() => api(`/api/contracts/${encodeURIComponent(contract.id)}`, { token: T, method: 'DELETE' }));
    assert(contract.urgency?.level === 'urgent', `urgency ${contract.urgency?.level}`);
  });
  await check('numeric strings are coerced, wrong types rejected', async () => {
    const ok = await api(`/api/contracts/${encodeURIComponent(contract.id)}`, { token: T, method: 'PATCH', body: { value: '2500' } });
    expectStatus(ok, 200, 'coerce');
    assert(ok.data.value === 2500, `value ${ok.data.value}`);
    expectStatus(await api(`/api/contracts/${encodeURIComponent(contract.id)}`, { token: T, method: 'PATCH', body: { value: 'abc' } }), 400, 'bad type');
  });
  await check('liquidate contract', async () => {
    const res = await api(`/api/contracts/${encodeURIComponent(contract.id)}/liquidate`, { token: T, method: 'PATCH' });
    expectStatus(res, 200, 'liquidate');
    assert(res.data.status === 'liquidated', res.data.status);
  });
  await check('Excel bulk import (contracts) with extra columns', async () => {
    const res = await api('/api/contracts/bulk-import', { token: T, method: 'POST', body: { contracts: [{ contract_number: `${TAG}-XLS`, title: `${TAG} dòng Excel`, value: '12000', partner_tax_id: 123456789, 'Cột thêm': 'x' }] } });
    expectStatus(res, 200, 'bulk contracts');
    const created = (await api('/api/contracts', { token: T })).data.find((c) => c.contract_number === `${TAG}-XLS`);
    assert(created && created['Cột thêm'] === 'x' && created.partner_tax_id === '123456789', JSON.stringify(created).slice(0, 200));
    cleanups.push(() => api(`/api/contracts/${encodeURIComponent(created.id)}`, { token: T, method: 'DELETE' }));
  });

  // ------------------------------------------------------------------
  section('Users, passwords & labor-contract RBAC (write)');
  const staffName = `smoke_${Date.now()}`;
  const initialPw = `Init${Date.now()}a`;
  let staff;
  await check('weak password rejected', async () => expectStatus(await api('/api/users', { token: T, method: 'POST', body: { username: `${staffName}_w`, password: '123456', name: 'W', email: 'w@example.com' } }), 400, 'weak'));
  await check('admin creates user', async () => {
    const res = await api('/api/users', { token: T, method: 'POST', body: { username: staffName, password: initialPw, name: 'Smoke Staff', email: 'smoke@example.com', role: 'user', can_access_labor_contracts: false } });
    expectStatus(res, 201, 'create user');
    staff = res.data;
    cleanups.push(() => api(`/api/users/${staff.id}`, { token: T, method: 'DELETE' }));
    assert(staff.password === undefined, 'password returned');
  });
  let staffToken;
  await check('new user must replace the admin-assigned password first', async () => {
    const s = await login({ username: staffName, password: initialPw });
    expectStatus(await api('/api/documents', { token: s.token }), 403, 'blocked until changed');
    const ch = await api('/api/auth/change-password', { token: s.token, method: 'POST', body: { current_password: initialPw, new_password: `${initialPw}New1` } });
    expectStatus(ch, 200, 'change');
    staffToken = ch.data.token;
    expectStatus(await api('/api/documents', { token: staffToken }), 200, 'after change');
    expectStatus(await api('/api/auth/me', { token: s.token }), 401, 'old token revoked');
  });
  let labor;
  await check('admin creates labor contract with attachment', async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ contract_number: `${TAG}-HĐLĐ`, title: `${TAG} HĐLĐ mật`, contract_type: 'labor', contract_category: 'Hợp đồng lao động', party_a: 'SGII', party_b: 'Nhân viên Smoke', value: '1000', signed_date: daysFromToday(-5), start_date: daysFromToday(-5) })) form.append(k, v);
    form.append('file', new Blob(['salary 1000'], { type: 'application/pdf' }), 'luong.pdf');
    const res = await api('/api/contracts', { token: T, method: 'POST', body: form });
    expectStatus(res, 201, 'labor create');
    labor = res.data;
    cleanups.push(() => api(`/api/contracts/${encodeURIComponent(labor.id)}`, { token: T, method: 'DELETE' }));
  });
  await check('user without labor access cannot see it or its file', async () => {
    const list = (await api('/api/contracts', { token: staffToken })).data;
    assert(!list.some((c) => c.id === labor.id), 'visible in list');
    expectStatus(await api(`/api/contracts/${encodeURIComponent(labor.id)}`, { token: staffToken }), 403, 'detail');
    expectStatus(await api(`/api/files/${labor.file_key}`, { token: staffToken }), 403, 'file');
  });
  await check('granting labor access applies immediately', async () => {
    expectStatus(await api(`/api/users/${staff.id}`, { token: T, method: 'PATCH', body: { can_access_labor_contracts: true } }), 200, 'grant');
    expectStatus(await api(`/api/contracts/${encodeURIComponent(labor.id)}`, { token: staffToken }), 200, 'detail after grant');
    expectStatus(await api(`/api/files/${labor.file_key}`, { token: staffToken }), 200, 'file after grant');
  });
  await check('labor-only user cannot turn an economic contract into labor', async () => {
    expectStatus(await api(`/api/contracts/${encodeURIComponent(contract.id)}`, { token: staffToken, method: 'PATCH', body: { contract_type: 'labor' } }), 403, 'convert');
  });
  await check('locking a user cuts off the session', async () => {
    expectStatus(await api(`/api/users/${staff.id}`, { token: T, method: 'PATCH', body: { status: 'locked' } }), 200, 'lock');
    expectStatus(await api('/api/documents', { token: staffToken }), 401, 'locked session');
  });
  await check('root admin cannot be locked or demoted', async () => {
    const users = (await api('/api/users', { token: T })).data;
    const root = users.find((u) => u.username === 'admin');
    if (root) expectStatus(await api(`/api/users/${root.id}`, { token: T, method: 'PATCH', body: { status: 'locked' } }), 400, 'lock root');
  });
  await check('failed logins are throttled', async () => {
    const ghost = { username: `${staffName}_ghost`, password: 'wrong-password-1' };
    for (let i = 0; i < 5; i++) await api('/api/auth/login', { method: 'POST', body: ghost });
    expectStatus(await api('/api/auth/login', { method: 'POST', body: ghost }), 429, 'throttle');
  });

  // ------------------------------------------------------------------
  section('Partners, categories, settings, currencies (write)');
  await check('partner create / duplicate / edit / delete', async () => {
    const code = `SMK${Date.now() % 100000}`;
    const res = await api('/api/partners', { token: T, method: 'POST', body: { code, name_vn: `${TAG} Đối tác` } });
    expectStatus(res, 201, 'create partner');
    cleanups.push(() => api(`/api/partners/${res.data.id}`, { token: T, method: 'DELETE' }));
    expectStatus(await api('/api/partners', { token: T, method: 'POST', body: { code, name_vn: 'dup' } }), 400, 'duplicate');
    expectStatus(await api(`/api/partners/${res.data.id}`, { token: T, method: 'PATCH', body: { notes: 'smoke' } }), 200, 'edit partner');
  });
  await check('category item add / edit / delete', async () => {
    const add = await api('/api/categories/agencies', { token: T, method: 'POST', body: { item: `${TAG} Cơ quan` } });
    expectStatus(add, 201, 'add');
    const index = add.data.length - 1;
    expectStatus(await api(`/api/categories/agencies/${index}`, { token: T, method: 'PATCH', body: { item: `${TAG} Cơ quan 2` } }), 200, 'edit');
    expectStatus(await api(`/api/categories/agencies/${index}`, { token: T, method: 'DELETE' }), 200, 'delete');
    expectStatus(await api('/api/categories/__proto__', { token: T, method: 'POST', body: { item: 'x' } }), 400, 'proto');
  });
  await check('settings round-trip and validation', async () => {
    const current = (await api('/api/categories/settings', { token: T })).data;
    const settings = current.settings || current;
    expectStatus(await api('/api/categories/settings', { token: T, method: 'PATCH', body: settings }), 200, 'save same');
    expectStatus(await api('/api/categories/settings', { token: T, method: 'PATCH', body: { alert_level_1_days: -1 } }), 400, 'invalid');
  });
  await check('currency add and restore', async () => {
    const original = (await api('/api/categories/currencies', { token: T })).data;
    expectStatus(await api('/api/categories/currencies', { token: T, method: 'POST', body: { code: 'XTS', name: 'Smoke test code', symbol: 'X', decimals: 2 } }), 201, 'add');
    expectStatus(await api('/api/categories/currencies', { token: T, method: 'PUT', body: original }), 200, 'restore');
  });
  await check('mark notifications read', async () => {
    const list = (await api('/api/notifications', { token: T })).data.notifications;
    if (list[0]) expectStatus(await api(`/api/notifications/${list[0].id}/read`, { token: T, method: 'PATCH' }), 200, 'read one');
  });
  await check('audit log recorded the smoke actions', async () => {
    const logs = (await api('/api/audit-logs?limit=200', { token: T })).data;
    assert(logs.some((l) => (l.entity_title || '').includes(TAG) || (l.details || '').includes(TAG)), 'no audit entries for smoke records');
  });
}

try {
  await main();
} finally {
  if (cleanups.length > 0) {
    section('Cleanup');
    const admin = await login(ADMIN).catch(() => null);
    for (const undo of cleanups.reverse()) {
      try {
        await undo(admin);
      } catch (err) {
        console.log(`  cleanup failed: ${err.message}`);
      }
    }
    console.log(`  removed ${cleanups.length} smoke record(s)`);
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exitCode = 1;
  }
}
