import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../src/server/db/store.ts';

describe('Store Upgrades: RBAC, Audit Log, Multi-currency', () => {
  beforeEach(() => {
    store.reset();
  });

  it('initializes default users with admin and user', () => {
    const users = store.getUsers();
    expect(users.length).toBeGreaterThanOrEqual(2);
    const admin = users.find(u => u.username === 'admin');
    const normalUser = users.find(u => u.username === 'user');
    expect(admin).toBeDefined();
    expect(admin?.role).toBe('admin');
    expect(normalUser).toBeDefined();
    expect(normalUser?.role).toBe('user');
  });

  it('can create, update and lock a user account', () => {
    const newUser = store.createUser({
      username: 'tester',
      password: 'Password@123',
      name: 'Nguyen Van Tester',
      email: 'tester@sgii.vn',
      role: 'user',
      department: 'IT',
    });
    expect(newUser.id).toBeDefined();
    expect(newUser.username).toBe('tester');
    expect(newUser.status).toBe('active');

    // Update user
    const updated = store.updateUser(newUser.id, {
      name: 'Nguyen Van Tester Updated',
      status: 'locked',
    });
    expect(updated?.name).toBe('Nguyen Van Tester Updated');
    expect(updated?.status).toBe('locked');

    // Lock verification
    const found = store.getUser(newUser.id);
    expect(found?.status).toBe('locked');
  });

  it('records and retrieves audit logs', () => {
    store.recordAuditLog({
      user_id: 'admin_root',
      username: 'admin',
      action: 'create',
      entity_type: 'contract',
      entity_id: 'HĐ-2026-TEST',
      entity_title: 'Hợp đồng mua bán thiết bị',
      details: 'Tạo mới hợp đồng kiểm thử',
    });

    const logs = store.getAuditLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const lastLog = logs[0];
    expect(lastLog.username).toBe('admin');
    expect(lastLog.action).toBe('create');
    expect(lastLog.entity_type).toBe('contract');
  });

  it('initializes and manages currencies', () => {
    const currencies = store.getCurrencies();
    expect(currencies.length).toBeGreaterThanOrEqual(5);
    const usd = currencies.find(c => c.code === 'USD');
    const khr = currencies.find(c => c.code === 'KHR');
    const vnd = currencies.find(c => c.code === 'VND');

    expect(usd?.decimals).toBe(2);
    expect(khr?.decimals).toBe(0);
    expect(vnd?.decimals).toBe(0);

    // Add new currency
    store.addCurrency({
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: 'C$',
      decimals: 2,
      active: true,
    });

    const updated = store.getCurrencies();
    expect(updated.find(c => c.code === 'CAD')).toBeDefined();
  });
});
