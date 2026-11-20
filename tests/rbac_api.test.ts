import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/server/index.ts';
import { store } from '../src/server/db/store.ts';

describe('RBAC API & User Management', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    store.reset();

    // Login as admin
    const adminLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'AdminTest@2026' }),
    });
    const adminData = (await adminLoginRes.json()) as any;
    adminToken = adminData.token;

    // Login as user
    const userLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user', password: 'UserTest@2026' }),
    });
    const userData = (await userLoginRes.json()) as any;
    userToken = userData.token;
  });

  it('allows both Admin and User to GET documents and contracts', async () => {
    // Admin GET documents
    const adminDocRes = await app.request('/api/documents', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminDocRes.status).toBe(200);

    // User GET documents
    const userDocRes = await app.request('/api/documents', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(userDocRes.status).toBe(200);

    // User GET contracts
    const userContractRes = await app.request('/api/contracts', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(userContractRes.status).toBe(200);
  });

  it('prevents normal User from creating documents (403 Forbidden)', async () => {
    const res = await app.request('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        document_number: 'DOC-ILLEGAL',
        title: 'User Trying to Create Document',
        doc_type: 'incoming',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('allows Admin to create documents and logs audit event', async () => {
    const res = await app.request('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        document_number: 'DOC-LEGAL-2026',
        title: 'Admin Created Document',
        doc_type: 'incoming',
      }),
    });
    expect(res.status).toBe(201);

    const logs = store.getAuditLogs();
    expect(logs.some(l => l.action === 'create' && l.entity_type === 'document')).toBe(true);
  });

  it('prevents normal User from deleting or updating contracts', async () => {
    const contracts = store.getContracts();
    const target = contracts[0];
    expect(target).toBeDefined();

    // User PUT
    const putRes = await app.request(`/api/contracts/${target.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ title: 'Hacked Title' }),
    });
    expect(putRes.status).toBe(403);

    // User DELETE
    const delRes = await app.request(`/api/contracts/${target.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(delRes.status).toBe(403);
  });

  it('allows Admin to manage users via /api/users', async () => {
    // Non-admin cannot access /api/users
    const userAccess = await app.request('/api/users', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(userAccess.status).toBe(403);

    // Admin can get users
    const adminGet = await app.request('/api/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminGet.status).toBe(200);
    const users = (await adminGet.json()) as any[];
    expect(users.length).toBeGreaterThanOrEqual(2);

    // Admin creates new user
    const createRes = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        username: 'nhanvien1',
        password: 'Password@123',
        name: 'Nguyen Van A',
        email: 'nva@sgii.vn',
        role: 'user',
        department: 'HCNS',
      }),
    });
    expect(createRes.status).toBe(201);
  });
});
