import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { hashPassword, validatePasswordStrength } from '../utils/security.ts';
import type { UserAccount } from '../types.ts';
import { userInput, parseInput, revisionConflict } from '../utils/validation.ts';

const EDITABLE_USER_FIELDS = [
  'name',
  'email',
  'role',
  'status',
  'department',
  'preferred_language',
  'can_access_labor_contracts',
  'can_access_confidential_documents',
] as const;

function toSafeUser(user: UserAccount) {
  const { password, token_version, ...safe } = user;
  return safe;
}

export const usersRouter = new Hono();

// Protect all /api/users routes with requireAdmin
usersRouter.use('*', requireAdmin);

// GET /api/users
usersRouter.get('/', (c) => {
  const users = store.getUsers();
  return c.json(users);
});

// GET /api/users/:id
usersRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const user = store.getUser(id);
  if (!user) {
    return c.json({ error: 'Không tìm thấy người dùng', code: 'USER_NOT_FOUND' }, 404);
  }
  return c.json(toSafeUser(user));
});

// POST /api/users
usersRouter.post('/', async (c) => {
  const parsed = parseInput(c, userInput.create, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { username, password, name, email, role, department, can_access_labor_contracts, can_access_confidential_documents } =
    parsed.data;
  const weakness = validatePasswordStrength(password);
  if (weakness) {
    return c.json({ error: weakness.message, code: weakness.code, params: weakness.params }, 400);
  }

  const existing = store.getUserByUsername(username);
  if (existing) {
    return c.json({ error: 'Tên đăng nhập đã tồn tại trong hệ thống', code: 'USERNAME_TAKEN' }, 409);
  }

  const currentUser = getAuthUser(c);
  const newUser = store.createUser({
    username,
    password: await hashPassword(password),
    name,
    email,
    role: role || 'user',
    department: department || '',
    can_access_labor_contracts: role === 'admin' ? true : Boolean(can_access_labor_contracts),
    can_access_confidential_documents: role === 'admin' ? true : Boolean(can_access_confidential_documents),
    // The admin chose this password, so the user must replace it at first login
    must_change_password: true,
  });

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'create',
    entity_type: 'user',
    entity_id: newUser.id,
    entity_title: newUser.username,
    details: `Tạo tài khoản ${newUser.username} (${newUser.role})`,
  });

  await store.persistAsync();
  return c.json(toSafeUser(newUser), 201);
});

// PATCH /api/users/:id
usersRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const parsed = parseInput(c, userInput.update, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const body: Record<string, any> = parsed.data;
  const currentUser = getAuthUser(c);

  const existing = store.getUser(id);
  if (!existing) {
    return c.json({ error: 'Không tìm thấy người dùng', code: 'USER_NOT_FOUND' }, 404);
  }
  // Permissions, lock state and passwords are never overwritten from a stale view
  const conflict = revisionConflict(c, existing, body.expected_revision);
  if (conflict) return conflict;

  const updates: Partial<UserAccount> = {};
  for (const field of EDITABLE_USER_FIELDS) {
    if (body[field] !== undefined) (updates as any)[field] = body[field];
  }
  if (existing.username === 'admin' && ((updates.role && updates.role !== 'admin') || updates.status === 'locked')) {
    return c.json({ error: 'Không thể hạ quyền hoặc khóa tài khoản Quản trị viên gốc', code: 'PRIMARY_ADMIN_PROTECTED' }, 400);
  }
  if (body.password !== undefined) {
    const weakness = validatePasswordStrength(body.password);
    if (weakness) {
      return c.json({ error: weakness.message, code: weakness.code, params: weakness.params }, 400);
    }
    updates.password = await hashPassword(body.password);
    // A password set by an admin is temporary unless the admin is changing their own
    updates.must_change_password = currentUser?.id !== id;
  }
  // A password reset or a new lock invalidates prior sessions, including after an unlock.
  if (body.password !== undefined || (updates.status === 'locked' && existing.status !== 'locked')) {
    updates.token_version = (existing.token_version || 0) + 1;
  }

  // hashPassword awaited above: another request may have changed the account meanwhile
  const recheck = revisionConflict(c, store.getUser(id), body.expected_revision);
  if (recheck) return recheck;
  const updated = store.updateUser(id, updates)!;

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'update',
    entity_type: 'user',
    entity_id: id,
    entity_title: updated.username,
    details: `Cập nhật thông tin tài khoản ${updated.username}`,
  });

  await store.persistAsync();
  return c.json(toSafeUser(updated));
});

// DELETE /api/users/:id
usersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const currentUser = getAuthUser(c);
  const user = store.getUser(id);

  if (!user) {
    return c.json({ error: 'Không tìm thấy người dùng', code: 'USER_NOT_FOUND' }, 404);
  }
  if (user.username === 'admin') {
    return c.json({ error: 'Không thể xóa tài khoản Quản trị viên gốc', code: 'PRIMARY_ADMIN_DELETE' }, 400);
  }
  const conflict = revisionConflict(c, user, c.req.query('expected_revision'));
  if (conflict) return conflict;

  const success = store.deleteUser(id);
  if (success) {
    store.recordAuditLog({
      user_id: currentUser?.id || 'admin',
      username: currentUser?.username || 'admin',
      action: 'delete',
      entity_type: 'user',
      entity_id: id,
      entity_title: user.username,
      details: `Xóa tài khoản ${user.username}`,
    });
    await store.persistAsync();
  }

  return c.json({ success });
});
