import { describe, it, expect } from 'vitest';
import { app } from '../src/server/index.ts';

describe('Contracts & Documents Full Edit Endpoints', () => {
  it('PATCH /api/contracts/:id updates all contract fields accurately', async () => {
    // 1. Get first contract
    const listRes = await app.request('/api/contracts');
    const contracts = (await listRes.json()) as any[];
    const contract = contracts[0];

    // 2. Update contract
    const updateRes = await app.request(`/api/contracts/${contract.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Hợp đồng cập nhật thử nghiệm',
        original_contract_number: 'TEST-HD-999',
        value: 999000000,
        currency: 'USD',
        exchange_rate: 25400,
        storage_location: 'Tủ Pháp chế - Kệ 01',
        renewal_terms: 'Gia hạn thêm 2 năm nếu đạt KPI',
        notes: 'Ghi chú kiểm tra sửa đổi',
      }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as any;
    expect(updated.title).toBe('Hợp đồng cập nhật thử nghiệm');
    expect(updated.original_contract_number).toBe('TEST-HD-999');
    expect(updated.value).toBe(999000000);
    expect(updated.currency).toBe('USD');
    expect(updated.storage_location).toBe('Tủ Pháp chế - Kệ 01');

    // Restore original title
    await app.request(`/api/contracts/${contract.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: contract.title }),
    });
  });

  it('PATCH /api/documents/:id updates all document fields accurately', async () => {
    // 1. Get incoming document
    const listRes = await app.request('/api/documents?type=incoming');
    const docs = (await listRes.json()) as any[];
    const doc = docs[0];

    // 2. Update document
    const updateRes = await app.request(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directive: 'Giao anh Thành kiểm tra gấp và báo cáo trước ngày 28/10',
        handler: 'Nguyễn Văn Thành',
        status: 'Đang xử lý',
        storage_location: 'Tủ Ban Giám Đốc / Kệ A',
        due_date: '2026-10-28',
      }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as any;
    expect(updated.directive).toBe('Giao anh Thành kiểm tra gấp và báo cáo trước ngày 28/10');
    expect(updated.handler).toBe('Nguyễn Văn Thành');
    expect(updated.status).toBe('Đang xử lý');
    expect(updated.storage_location).toBe('Tủ Ban Giám Đốc / Kệ A');
    expect(updated.due_date).toBe('2026-10-28');
  });
});
