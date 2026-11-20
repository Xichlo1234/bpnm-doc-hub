import { describe, it, expect } from 'vitest';
import { app } from '../src/server/index.ts';

describe('Categories & System Settings REST API (Full CRUD)', () => {
  it('GET /api/categories returns reference categories and settings', async () => {
    const res = await app.request('/api/categories');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('doc_types');
    expect(data).toHaveProperty('agencies');
    expect(data).toHaveProperty('departments');
    expect(data).toHaveProperty('personnel');
    expect(data).toHaveProperty('contract_types');
  });

  it('POST /api/categories/:type adds an item, PATCH updates, DELETE removes', async () => {
    // 1. Add new agency
    const addRes = await app.request('/api/categories/agencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'Sở Kế hoạch và Đầu tư' }),
    });
    expect(addRes.status).toBe(201);
    const agencies = (await addRes.json()) as any[];
    expect(agencies.includes('Sở Kế hoạch và Đầu tư')).toBe(true);

    const index = agencies.indexOf('Sở Kế hoạch và Đầu tư');

    // 2. Update item
    const updateRes = await app.request(`/api/categories/agencies/${index}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'Sở Kế hoạch và Đầu tư TP.HCM' }),
    });
    expect(updateRes.status).toBe(200);

    // 3. Delete item
    const delRes = await app.request(`/api/categories/agencies/${index}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
  });

  it('GET and PATCH /api/categories/settings manages alert thresholds', async () => {
    // 1. Get settings
    const getRes = await app.request('/api/categories/settings');
    expect(getRes.status).toBe(200);
    const settings = await getRes.json();
    expect(settings).toHaveProperty('alert_level_1_days');
    expect(settings).toHaveProperty('alert_level_2_days');

    // 2. Update settings
    const patchRes = await app.request('/api/categories/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert_level_1_days: 45,
        report_currency: 'USD',
      }),
    });
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as any;
    expect(updated.alert_level_1_days).toBe(45);

    // Reset back to 30
    await app.request('/api/categories/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_level_1_days: 30 }),
    });
  });
});
