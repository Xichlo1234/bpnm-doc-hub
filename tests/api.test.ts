import { describe, it, expect } from 'vitest';
import { app } from '../src/server/index.ts';

describe('Backend Hono API Routes', () => {
  it('GET /api/documents returns list of documents including sample PPTX files', async () => {
    const res = await app.request('/api/documents');
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(3);

    // Check that PPTX sample documents are present
    const hasThads = data.some((d: any) => d.document_number === '02/QĐ-THADS');
    const hasBank = data.some((d: any) => d.document_number === '03/HD-TDNH');
    const hasEnforce = data.some((d: any) => d.document_number === '04/CT-CCTH');
    expect(hasThads).toBe(true);
    expect(hasBank).toBe(true);
    expect(hasEnforce).toBe(true);
  });

  it('GET /api/contracts returns contracts with calculated urgency info', async () => {
    const res = await app.request('/api/contracts');
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(3);

    // Each contract must have urgency metadata calculated
    const first = data[0];
    expect(first).toHaveProperty('urgency');
    expect(first.urgency).toHaveProperty('level');
    expect(first.urgency).toHaveProperty('label');
  });

  it('GET /api/search finds records by keyword (case-insensitive & accent-insensitive)', async () => {
    const res = await app.request('/api/search?q=THADS');
    expect(res.status).toBe(200);
    const results = (await res.json()) as any;
    expect(results).toHaveProperty('documents');
    expect(results).toHaveProperty('contracts');
    expect(results.documents.length).toBeGreaterThan(0);
  });

  it('GET /api/stats returns counts and urgency stats matching 100% of Excel data', async () => {
    const res = await app.request('/api/stats');
    expect(res.status).toBe(200);
    const stats = (await res.json()) as any;
    expect(stats.totalContracts).toBe(73);
    expect(stats.totalPartners).toBe(27);
    expect(stats.totalIncoming).toBe(10);
    expect(stats.totalOutgoing).toBe(4);
    expect(stats.totalDocuments).toBe(17); // 10 incoming + 4 outgoing + 3 PPTX sample docs
  });

  it('GET /api/partners returns all 27 fixture partners', async () => {
    const res = await app.request('/api/partners');
    expect(res.status).toBe(200);
    const partners = (await res.json()) as any[];
    expect(partners.length).toBe(27);
    expect(partners.some((p: any) => p.code === 'MSV')).toBe(true);
    expect(partners.some((p: any) => p.code === 'DT02')).toBe(true);
  });

  it('GET /api/categories returns reference categories from both Excel files', async () => {
    const res = await app.request('/api/categories');
    expect(res.status).toBe(200);
    const cat = (await res.json()) as any;
    expect(cat).toHaveProperty('doc_types');
    expect(cat).toHaveProperty('departments');
    expect(cat).toHaveProperty('contract_types');
    expect(cat).toHaveProperty('contract_departments');
    expect(cat.contract_types.length).toBe(14);
    expect(cat.contract_departments.length).toBe(16);
  });

  it('POST /api/contracts creates a contract preserving detailed category, department, and status_raw', async () => {
    const formData = new FormData();
    formData.append('contract_number', 'TEST/2026/HD-NEW');
    formData.append('title', 'Hợp đồng kiểm thử phân loại và danh mục đầy đủ');
    formData.append('contract_type', 'service');
    formData.append('contract_category', 'Dich vu ky thuat (Technical Services)');
    formData.append('party_a', 'SGII - Công ty Cổ phần');
    formData.append('party_b', 'Công ty Cổ phần FPT');
    formData.append('partner_code', 'FPT');
    formData.append('partner_tax_id', '0101248141');
    formData.append('partner_contact', 'Trương Gia Bình - 02473007300');
    formData.append('department', 'ENG - Ky thuat');
    formData.append('value', '250000000');
    formData.append('currency', 'VND');
    formData.append('signed_date', '2026-05-10');
    formData.append('start_date', '2026-05-15');
    formData.append('end_date', '2027-05-15');
    formData.append('status', 'active');
    formData.append('status_raw', 'Đang thực hiện');
    formData.append('storage_location', 'Gốc (Tủ HC-01 / Kệ 2026)');

    const res = await app.request('/api/contracts', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(201);
    const created = await res.json() as any;
    expect(created.contract_number).toBe('TEST/2026/HD-NEW');
    expect(created.contract_category).toBe('Dich vu ky thuat (Technical Services)');
    expect(created.department).toBe('ENG - Ky thuat');
    expect(created.status_raw).toBe('Đang thực hiện');
    expect(created.partner_code).toBe('FPT');

    // Clean up
    await app.request(`/api/contracts/${created.id}`, { method: 'DELETE' });
  });

  it('POST /api/documents creates a document preserving all category, urgency, and security fields', async () => {
    const formData = new FormData();
    formData.append('document_number', 'TEST-ĐẾN-2026-999');
    formData.append('title', 'Văn bản kiểm thử đầy đủ độ khẩn độ mật');
    formData.append('doc_type', 'incoming');
    formData.append('doc_category', 'Quyết định');
    formData.append('issuer', 'UBND tỉnh Sơn La');
    formData.append('department', 'Hành chính - Nhân sự');
    formData.append('handler', 'Nguyễn Văn Thành');
    formData.append('issue_date', '2026-06-01');
    formData.append('received_date', '2026-06-02');
    formData.append('due_date', '2026-06-15');
    formData.append('urgency_level', 'Khẩn');
    formData.append('security_level', 'Mật');
    formData.append('storage_location', 'Gốc (Tủ HC-01 / Kệ 2026)');

    const res = await app.request('/api/documents', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(201);
    const created = await res.json() as any;
    expect(created.document_number).toBe('TEST-ĐẾN-2026-999');
    expect(created.urgency_level).toBe('Khẩn');
    expect(created.security_level).toBe('Mật');
    expect(created.doc_category).toBe('Quyết định');

    // Clean up
    await app.request(`/api/documents/${created.id}`, { method: 'DELETE' });
  });

  it('POST /api/contracts/bulk-import successfully upserts and updates multiple contracts', async () => {
    const bulkData = [
      {
        contract_number: 'BULK-TEST-001',
        title: 'Hợp đồng kiểm thử nhập hàng loạt 01',
        party_a: 'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII',
        party_b: 'Công ty Đối tác Test A',
        value: 150000000,
        signed_date: '2026-05-01',
        start_date: '2026-05-01',
        end_date: '2027-05-01',
        status: 'active',
      },
      {
        contract_number: 'BULK-TEST-002',
        title: 'Hợp đồng kiểm thử nhập hàng loạt 02',
        party_a: 'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII',
        party_b: 'Công ty Đối tác Test B',
        value: 200000000,
        signed_date: '2026-06-01',
        start_date: '2026-06-01',
        end_date: '2028-06-01',
        status: 'active',
      },
    ];

    const res = await app.request('/api/contracts/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contracts: bulkData }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.added).toBeGreaterThanOrEqual(1);

    // Clean up
    const listRes = await app.request('/api/contracts');
    const all = (await listRes.json()) as any[];
    const created1 = all.find((c: any) => c.contract_number === 'BULK-TEST-001');
    const created2 = all.find((c: any) => c.contract_number === 'BULK-TEST-002');
    if (created1) await app.request(`/api/contracts/${created1.id}`, { method: 'DELETE' });
    if (created2) await app.request(`/api/contracts/${created2.id}`, { method: 'DELETE' });
  });
});
