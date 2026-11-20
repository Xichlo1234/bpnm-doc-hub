import { Hono, type Context, type Next } from 'hono';
import { store } from '../db/store.ts';
import { saveUploadedFile } from '../utils/fileStorage.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
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
  let contracts = store.getContracts(urgency);
  if (!canAccessLaborContracts(currentUser)) {
    contracts = contracts.filter(ct => !isLaborContract(ct));
  }
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
  if (isLaborContract(contract) && !canAccessLaborContracts(currentUser)) {
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

  const currentUser = getAuthUser(c);
  const result = store.bulkUpsertContracts(contractsList);
  await store.persistAsync();

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'import',
    entity_type: 'contract',
    details: `Nhập file Excel hợp đồng: Thêm mới ${result.added}, Cập nhật ${result.updated}`,
  });

  return c.json({
    success: true,
    message: `Đã cập nhật ${result.updated} hợp đồng và thêm mới ${result.added} hợp đồng thành công. Tổng số: ${result.total}`,
    ...result,
  });
});

// POST /api/contracts (Admin or Labor-Contract Authorized User)
contractsRouter.post('/', requireAdminOrLaborAccess, async (c) => {
  const contentType = c.req.header('content-type') || '';
  let body: any;

  if (contentType.includes('application/json')) {
    body = await c.req.json();
  } else if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    body = {};
    for (const [key, value] of formData.entries()) {
      if (key !== 'file' && typeof value === 'string') {
        body[key] = value;
      }
    }
    body.value = Number(body.value) || 0;
    body.contract_type = body.contract_type || 'service';
    body.status = body.status || 'active';
    body.currency = body.currency || 'USD';
    const file = formData.get('file');
    if (file && typeof file === 'object' && 'name' in file && (file as File).size > 0) {
      const uploaded = await saveUploadedFile(file as File, c.env);
      body.file_name = uploaded.file_name;
      body.file_size = uploaded.file_size;
      body.file_type = uploaded.file_type;
      body.file_key = uploaded.file_key;
    }
  } else {
    body = await c.req.json().catch(() => ({}));
  }

  const parsed = parseInput(c, contractInput.create, body);
  if (!parsed.ok) return parsed.response;
  body = parsed.data;

  // Handle cloud drive link if provided
  if (body.google_drive_url && !body.file_key) {
    const driveUrl = String(body.google_drive_url).trim();
    if (driveUrl) {
      body.google_drive_url = driveUrl;
      body.google_drive_synced_at = new Date().toISOString();
      body.file_key = driveUrl;
      if (!body.file_name) {
        body.file_name = driveUrl.includes('onedrive') || driveUrl.includes('sharepoint')
          ? 'OneDrive / SharePoint Link'
          : 'Google Drive Link';
      }
    }
  }

  if (!body.contract_number || !body.title || !body.party_a || !body.party_b || !body.signed_date || !body.start_date) {
    return c.json({ error: 'Missing required contract fields', code: 'CONTRACT_FIELDS_REQUIRED' }, 400);
  }

  const currentUser = getAuthUser(c);
  if (currentUser?.role !== 'admin' && !isLaborContract(body)) {
    return c.json({ error: 'Bạn chỉ được phân quyền quản lý mục Hợp đồng Lao động.', code: 'LABOR_ONLY_MANAGE' }, 403);
  }
  const newContract = store.createContract(body);

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'create',
    entity_type: 'contract',
    entity_id: newContract.id,
    entity_title: newContract.contract_number,
    details: `Tạo hợp đồng ${newContract.contract_number} - ${newContract.title}`,
  });

  await store.persistAsync();
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
  const currentUser = getAuthUser(c);
  const updated = store.updateContract(id, changes);
  if (!updated) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }

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
  const updated = store.updateContract(id, body);
  if (!updated) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }

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
  const currentUser = getAuthUser(c);
  const updated = store.liquidateContract(id);
  if (!updated) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }

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

// DELETE /api/contracts/:id (Admin Only)
contractsRouter.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const contract = store.getContract(id);
  const currentUser = getAuthUser(c);
  const success = store.deleteContract(id);
  if (!success) {
    return c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
  }

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'delete',
    entity_type: 'contract',
    entity_id: id,
    entity_title: contract?.contract_number || id,
    details: `Xóa hợp đồng ${contract?.contract_number || id}`,
  });

  await store.persistAsync();
  return c.json({ success: true });
});
