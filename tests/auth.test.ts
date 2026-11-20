import { describe, it, expect } from 'vitest';
import { app } from '../src/server/index.ts';

describe('Authentication API', () => {
  it('POST /api/auth/login succeeds with admin / admin123', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@6868' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty('token');
    expect(data).toHaveProperty('user');
    expect(data.user.username).toBe('admin');
    expect(data.user.role).toBe('admin');
    expect(typeof data.token).toBe('string');
  });

  it('POST /api/auth/login fails with incorrect password', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty('error');
  });

  it('POST /api/auth/login fails with unknown username', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'unknown_user', password: 'password' }),
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data).toHaveProperty('error');
  });

  it('GET /api/auth/me returns current user when valid Bearer token is provided', async () => {
    // Login first
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@6868' }),
    });
    const loginData = (await loginRes.json()) as any;
    const token = loginData.token;

    // Verify /api/auth/me
    const meRes = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(200);
    const meData = (await meRes.json()) as any;
    expect(meData.user.username).toBe('admin');
  });

  it('GET /api/auth/me returns 401 when token is missing or invalid', async () => {
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: 'Bearer invalid_token_123' },
    });
    expect(res.status).toBe(401);

    const noAuthRes = await app.request('/api/auth/me');
    expect(noAuthRes.status).toBe(401);
  });

  it('POST /api/auth/logout invalidates token', async () => {
    // Login first
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@6868' }),
    });
    const { token } = (await loginRes.json()) as any;

    // Logout
    const logoutRes = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status).toBe(200);

    // Verify /me now fails
    const meRes = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(401);
  });
});
