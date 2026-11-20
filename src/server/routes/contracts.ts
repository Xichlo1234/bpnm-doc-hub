import { Hono, type Context, type Next } from 'hono';
import { store } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { getDatabase } from '../db/database.ts';
import { canReadContract } from '../utils/access.ts';
import { canAttachFile } from '../utils/fileAccess.ts';
import { readRecordRequest, storeAttachment, applyCloudLink } from '../utils/recordRequest.ts';
import { syncPrimaryAttachment } from '../utils/attachments.ts';
import { contractInput, parseInput, withoutUnchangedLinks, revisionConflict } from '../utils/validation.ts';
import { isLaborContract, canAccessLaborContracts } from '../types.ts';

export const contractsRouter = new Hono();

async function requireAdminOrLaborAccess(c: Context, next: Next) {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Yêu cầu đăng nhập.', code: 'AUTH_REQUIRED' }, 401);
  }
  if (user.role !== 'admin' && !canAccessLaborContracts(user)) {
    return c.json({ error: 'Truy cập bị từ chối: Bạn không có quyền thực hiện thao tác này.', code: 'FORBIDDEN' }, 403);
  }
  c.set('user', user);
  await next();
}

// GET /api/contracts?urgency=all|urgent|warning|expiring_soon|active|expired|liquidated
contractsRouter.get('/', (c) => {
  const urgency = c.req.query('urgency');
  const currentUser = getAuthUser(c);
  const contracts = store.getContracts(urgency).filter((ct) => canReadContract(currentUser, ct));
  return c.json(contracts);
});

// GET /api/contracts/:id
contractsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const contract = store.getContract(id);
  if (!contract) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }
  const currentUser = getAuthUser(c);
  if (!canReadContract(currentUser, contract)) {
    return c.json({ error: 'Hợp đồng lao động bảo mật: Bạn không có quyền xem hồ sơ này.', code: 'LABOR_CONTRACT_FORBIDDEN' }, 403);
  }
  return c.json(contract);
});

// POST /api/contracts/bulk-import (Import / Bulk Update Contracts from Excel/CSV - Admin Only)
contractsRouter.post('/bulk-import', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawList = Array.isArray(body) ? body : body.contracts;
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return c.json({ error: 'Danh sách hợp đồng không hợp lệ hoặc rỗng', code: 'CONTRACT_LIST_INVALID' }, 400);
  }
  // Rows re-imported from an export carry legacy link values unchanged; match rows like the store does
  const byNumber = new Map(store.getContracts().map((r) => [String(r.contract_number).trim().toLowerCase(), r]));
  const rows = rawList.map((row: any) =>
    withoutUnchangedLinks(row, (row?.id && store.getContract(row.id)) || byNumber.get(String(row?.contract_number ?? '').trim().toLowerCase()) || null)
  );
  const parsed = parseInput(c, contractInput.bulk, rows);
  if (!parsed.ok) return parsed.response;
  const contractsList = parsed.data;

  const currentUser = getAuthUser(c)!;
  const result = store.bulkUpsertContracts(contractsList);
  for (const ch of result.changes) {
    store.recordHistory({ record_type: 'contract', record_id: ch.id, action: 'import', user: currentUser, before: ch.before, after: ch.after });
  }

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'import',
    entity_type: 'contract',
    details: `Nhập file Excel hợp đồng: Thêm mới ${result.added}, Cập nhật ${result.updated}`,
  });
  await store.persistAsync();

  const { changes, ...counts } = result;
  return c.json({
    success: true,
    message: `Đã cập nhật ${result.updated} hợp đồng và thêm mới ${result.added} hợp đồng thành công. Tổng số: ${result.total}`,
    ...counts,
  });
});

// POST /api/contracts (Admin or Labor-Contract Authorized User)
contractsRouter.post('/', requireAdminOrLaborAccess, async (c) => {
  const request = await readRecordRequest(c);
  if (c.req.header('content-type')?.includes('multipart/form-data')) {
    const raw = request.body;
    raw.value = Number(raw.value) || 0;
    raw.contract_type = raw.contract_type || 'service';
    raw.status = raw.status || 'active';
    raw.currency = raw.currency || 'USD';
  }

  const parsed = parseInput(c, contractInput.create, request.body);
  if (!parsed.ok) return parsed.response;
  const body: any = parsed.data;
  applyCloudLink(body);

  if (!body.contract_number || !body.title || !body.party_a || !body.party_b || !body.signed_date || !body.start_date) {
    return c.json({ error: 'Missing required contract fields', code: 'CONTRACT_FIELDS_REQUIRED' }, 400);
  }

  const currentUser = getAuthUser(c)!;
  if (currentUser.role !== 'admin' && !isLaborContract(body)) {
    return c.json({ error: 'Bạn chỉ được phân quyền quản lý mục Hợp đồng Lao động.', code: 'LABOR_ONLY_MANAGE' }, 403);
  }
  if (!(await canAttachFile(await getDatabase(c.env), currentUser, body.file_key))) {
    return c.json({ error: 'Bạn không có quyền gắn tệp này vào hồ sơ.', code: 'FILE_ATTACH_FORBIDDEN' }, 403);
  }

  const attachment = request.file ? await storeAttachment(c, request.file, currentUser.id) : null;
  if (attachment) Object.assign(body, attachment.fields);
  const newContract = store.createContract(body);
  await syncPrimaryAttachment(await getDatabase(c.env), 'contract', null, newContract, currentUser.id);
  store.recordHistory({ record_type: 'contract', record_id: newContract.id, action: 'create', user: currentUser, before: null, after: newContract });

  store.recordAuditLog({
    user_id: currentUser.id,
    username: currentUser.username,
    action: 'create',
    entity_type: 'contract',
    entity_id: newContract.id,
    entity_title: newContract.contract_number,
    details: `Tạo hợp đồng ${newContract.contract_number} - ${newContract.title}`,
  });

  try {
    await store.persistAsync();
  } catch (err) {
    await attachment?.rollback();
    throw err;
  }
  return c.json(newContract, 201);
});

// PUT /api/contracts/:id (Admin Only)
contractsRouter.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const rawBody = await c.req.json().catch(() => null);
  const current = store.getContract(id);
  const parsed = parseInput(c, contractInput.update, withoutUnchangedLinks(rawBody, current));
  if (!parsed.ok) return parsed.response;
  const { expected_revision, ...changes } = parsed.data as Record<string, any>;
  const conflict = revisionConflict(c, current, expected_revision);
  if (conflict) return conflict;
  const currentUser = getAuthUser(c)!;
  const updated = store.updateContract(id, changes);
  if (!updated) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }
  await syncPrimaryAttachment(await getDatabase(c.env), 'contract', current, updated, currentUser.id);
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'update', user: currentUser, before: current, after: updated });

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'update',
    entity_type: 'contract',
    entity_id: id,
    entity_title: updated.contract_number,
    details: `Cập nhật hợp đồng ${updated.contract_number}`,
  });

  await store.persistAsync();
  return c.json(updated);
});

// PATCH /api/contracts/:id (Admin or Labor-Contract Authorized User)
contractsRouter.patch('/:id', requireAdminOrLaborAccess, async (c) => {
  const id = c.req.param('id') || '';
  const existing = store.getContract(id);
  if (!existing) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }
  const currentUser = getAuthUser(c);
  const rawBody = await c.req.json().catch(() => null);
  const parsed = parseInput(c, contractInput.update, withoutUnchangedLinks(rawBody, existing));
  if (!parsed.ok) return parsed.response;
  const { expected_revision, ...body } = parsed.data as Record<string, any>;
  const conflict = revisionConflict(c, existing, expected_revision);
  if (conflict) return conflict;
  // Non-admins may only edit labor contracts, and may not turn them into (or out of) another type
  if (currentUser?.role !== 'admin' && !(isLaborContract(existing) && isLaborContract({ ...existing, ...body }))) {
    return c.json({ error: 'Bạn chỉ được phân quyền chỉnh sửa mục Hợp đồng Lao động.', code: 'LABOR_ONLY_EDIT' }, 403);
  }
  if (body.file_key !== undefined && !(await canAttachFile(await getDatabase(c.env), currentUser, body.file_key, existing.file_key))) {
    return c.json({ error: 'Bạn không có quyền gắn tệp này vào hồ sơ.', code: 'FILE_ATTACH_FORBIDDEN' }, 403);
  }
  const updated = store.updateContract(id, body);
  if (!updated) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }
  await syncPrimaryAttachment(await getDatabase(c.env), 'contract', existing, updated, currentUser!.id);
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'update', user: currentUser!, before: existing, after: updated });

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'update',
    entity_type: 'contract',
    entity_id: id,
    entity_title: updated.contract_number,
    details: `Chỉnh sửa hợp đồng ${updated.contract_number}`,
  });

  await store.persistAsync();
  return c.json(updated);
});

// PATCH /api/contracts/:id/liquidate (Admin Only)
contractsRouter.patch('/:id/liquidate', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const currentUser = getAuthUser(c)!;
  const before = store.getContract(id);
  const updated = before ? store.liquidateContract(id) : null;
  if (!updated) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'update', user: currentUser, before, after: updated });

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'status_change',
    entity_type: 'contract',
    entity_id: id,
    entity_title: updated.contract_number,
    details: `Thanh lý hợp đồng ${updated.contract_number}`,
  });

  await store.persistAsync();
  return c.json(updated);
});

// DELETE /api/contracts/:id (Admin Only) — moves the contract to the trash (restorable)
contractsRouter.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const currentUser = getAuthUser(c)!;
  const contract = store.getContract(id);
  const trashed = contract ? store.trashRecord('contract', id, currentUser.id) : null;
  if (!contract || !trashed) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'delete', user: currentUser, before: { deleted: false }, after: { deleted: true } });
  store.recordAuditLog({
    user_id: currentUser.id,
    username: currentUser.username,
    action: 'delete',
    entity_type: 'contract',
    entity_id: id,
    entity_title: contract.contract_number,
    details: `Chuyển hợp đồng ${contract.contract_number} vào thùng rác`,
  });

  await store.persistAsync();
  return c.json({ success: true, trashed: true });
});
