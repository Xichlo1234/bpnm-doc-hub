import { describe, it, expect } from 'vitest';
import { app } from '../src/server/index.ts';

describe('Partners REST API (Full CRUD)', () => {
  it('GET /api/partners returns all 27 partners initially', async () => {
    const res = await app.request('/api/partners');
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(27);
  });

  it('POST /api/partners creates a new partner and rejects duplicates', async () => {
    // 1. Create unique partner
    const newPartner = {
      code: 'NEWCO',
      name_vn: 'Công ty Cổ phần Tân Thời Đại',
      name_en: 'New Era Joint Stock Company',
      category: 'Nhà cung cấp',
      tax_id: '0108889999',
      representative: 'Nguyễn Văn Tân',
      contact_person: 'Trần Thị Mai',
      contact: '0912 345 678',
      address: 'Tầng 5, Tòa nhà Landmark, Hà Nội',
      notes: 'Đối tác cung ứng vật tư mới',
    };

    const res = await app.request('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPartner),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as any;
    expect(created.code).toBe('NEWCO');
    expect(created.name_vn).toBe('Công ty Cổ phần Tân Thời Đại');
    expect(created.id).toBeDefined();

    // 2. Reject duplicate code
    const resDup = await app.request('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPartner),
    });
    expect(resDup.status).toBe(409);

    // 3. PATCH /api/partners/:id updates partner info
    const updateRes = await app.request(`/api/partners/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        representative: 'Nguyễn Văn Tân (TGĐ)',
        is_locked: true,
      }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as any;
    expect(updated.representative).toBe('Nguyễn Văn Tân (TGĐ)');
    expect(updated.is_locked).toBe(true);

    // 4. DELETE /api/partners/:id removes partner
    const delRes = await app.request(`/api/partners/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);

    // 5. Verify partner is removed
    const getRes = await app.request(`/api/partners/${created.id}`);
    expect(getRes.status).toBe(404);
  });
});
