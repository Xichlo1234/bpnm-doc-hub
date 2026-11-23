import { Hono, type Context, type Next } from 'hono';
import { store } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { getDatabase } from '../db/database.ts';
import { canReadContract, canReadDocument } from '../utils/access.ts';
import { canAttachFile } from '../utils/fileAccess.ts';
import { readRecordRequest, storeAttachment, applyCloudLink } from '../utils/recordRequest.ts';
import { syncPrimaryAttachment, canWriteRecord } from '../utils/attachments.ts';
import { contractInput, parseInput, withoutUnchangedLinks, revisionConflict } from '../utils/validation.ts';
import { isLaborContract, canAccessLaborContracts, type ContractRecord } from '../types.ts';
import { importPreviewHandler, importCommitHandler } from './imports.ts';
import { contractNumberTaken, checkContractDates, type ContractRuleError, type Appendix } from '../utils/contractRules.ts';
import { vietnamToday } from '../utils/workflow.ts';
import { CommitOutcomeUnknownError } from '../db/repository.ts';

export const contractsRouter = new Hono();

async function requireAdminOrLaborAccess(c: Context, next: Next) {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Yêu cầu đăng nhập.', code: 'AUTH_REQUIRED' }, 401);
  }
  if (user.role !== 'admin' && !canAccessLaborContracts(user)) {
    return c.json({ error: 'Truy cập bị từ chối: Bạn không có quyền thực hiện thao tác này.', code: 'FORBIDDEN' }, 403);
  }
  await next();
}

const ruleResponse = (c: Context, e: ContractRuleError) => c.json({ error: e.error, code: e.code, params: e.params }, e.status);
const notFound = (c: Context) => c.json({ error: 'Contract not found', code: 'CONTRACT_NOT_FOUND' }, 404);
const numberTaken = (c: Context, number: string) =>
  c.json({ error: `Số hợp đồng "${number}" đã tồn tại.`, code: 'CONTRACT_NUMBER_TAKEN', params: { number } }, 409);
const str = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function audit(c: Context, contract: ContractRecord, action: 'create' | 'update' | 'delete' | 'status_change', details: string) {
  const user = getAuthUser(c)!;
  store.recordAuditLog({
    user_id: user.id,
    username: user.username,
    action,
    entity_type: 'contract',
    entity_id: contract.id,
    entity_title: contract.contract_number,
    details,
  });
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
  const contract = store.getContract(c.req.param('id') || '');
  if (!contract) return notFound(c);
  if (!canReadContract(getAuthUser(c), contract)) {
    return c.json({ error: 'Hợp đồng lao động bảo mật: Bạn không có quyền xem hồ sơ này.', code: 'LABOR_CONTRACT_FORBIDDEN' }, 403);
  }
  return c.json(contract);
});

// Excel import: preview first, then commit (Admin Only)
contractsRouter.post('/import/preview', requireAdmin, importPreviewHandler('contract'));
contractsRouter.post('/bulk-import', requireAdmin, importCommitHandler('contract'));

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
  if (!body.status) body.status = 'active';

  if (!body.contract_number || !body.title || !body.party_a || !body.party_b || !body.signed_date || !body.start_date) {
    return c.json({ error: 'Missing required contract fields', code: 'CONTRACT_FIELDS_REQUIRED' }, 400);
  }
  const dateError = checkContractDates(body);
  if (dateError) return ruleResponse(c, dateError);
  if (contractNumberTaken(body.contract_number)) return numberTaken(c, body.contract_number);

  const currentUser = getAuthUser(c)!;
  if (currentUser.role !== 'admin' && !isLaborContract(body)) {
    return c.json({ error: 'Bạn chỉ được phân quyền quản lý mục Hợp đồng Lao động.', code: 'LABOR_ONLY_MANAGE' }, 403);
  }
  const db = await getDatabase(c.env);
  if (!(await canAttachFile(db, currentUser, body.file_key))) {
    return c.json({ error: 'Bạn không có quyền gắn tệp này vào hồ sơ.', code: 'FILE_ATTACH_FORBIDDEN' }, 403);
  }

  const attachment = request.file ? await storeAttachment(c, request.file, currentUser.id) : null;
  if (attachment) Object.assign(body, attachment.fields);
  // A concurrent request may have taken the number while the file was being stored
  if (contractNumberTaken(body.contract_number)) {
    await attachment?.rollback();
    return numberTaken(c, body.contract_number);
  }
  try {
    const newContract = store.createContract(body);
    await syncPrimaryAttachment(db, 'contract', null, newContract, currentUser.id);
    store.recordHistory({ record_type: 'contract', record_id: newContract.id, action: 'create', user: currentUser, before: null, after: newContract });
    audit(c, newContract, 'create', `Tạo hợp đồng ${newContract.contract_number} - ${newContract.title}`);

    await store.persistAsync();
    return c.json(newContract, 201);
  } catch (err) {
    // Unknown outcome: the contract may be saved and reference the file, keep it
    if (!(err instanceof CommitOutcomeUnknownError)) await attachment?.rollback();
    throw err;
  }
});

// PUT /api/contracts/:id (Admin Only) and PATCH (Admin, or labor managers for labor contracts)
async function updateContractHandler(c: Context) {
  const id = c.req.param('id') || '';
  const existing = store.getContract(id);
  const rawBody = await c.req.json().catch(() => null);
  const parsed = parseInput(c, contractInput.update, withoutUnchangedLinks(rawBody, existing));
  if (!parsed.ok) return parsed.response;
  const { expected_revision, ...body } = parsed.data as Record<string, any>;
  if (!existing) return notFound(c);

  const currentUser = getAuthUser(c)!;
  // Permission first (never reveal revision state to someone who may not edit), then the revision
  // Non-admins may only edit labor contracts, and may not turn them into (or out of) another type
  if (currentUser.role !== 'admin' && !(isLaborContract(existing) && isLaborContract({ ...existing, ...body }))) {
    return c.json({ error: 'Bạn chỉ được phân quyền chỉnh sửa mục Hợp đồng Lao động.', code: 'LABOR_ONLY_EDIT' }, 403);
  }
  const conflict = revisionConflict(c, existing, expected_revision);
  if (conflict) return conflict;
  if (body.file_key !== undefined && !(await canAttachFile(await getDatabase(c.env), currentUser, body.file_key, existing.file_key))) {
    return c.json({ error: 'Bạn không có quyền gắn tệp này vào hồ sơ.', code: 'FILE_ATTACH_FORBIDDEN' }, 403);
  }
  // Another request of this worker may have saved the contract during the await above: check the
  // revision again against the live cache, then change it without awaiting in between
  const recheck = revisionConflict(c, store.getContract(id), expected_revision);
  if (recheck) return recheck;
  if (body.contract_number !== undefined && contractNumberTaken(body.contract_number, id)) return numberTaken(c, body.contract_number);
  const dateError = checkContractDates({ ...existing, ...body });
  if (dateError) return ruleResponse(c, dateError);

  const updated = store.updateContract(id, body)!;
  await syncPrimaryAttachment(await getDatabase(c.env), 'contract', existing, updated, currentUser.id);
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'update', user: currentUser, before: existing, after: updated });
  audit(c, updated, 'update', `Cập nhật hợp đồng ${updated.contract_number}`);
  await store.persistAsync();
  return c.json(updated);
}
contractsRouter.put('/:id', requireAdmin, updateContractHandler);
contractsRouter.patch('/:id', requireAdminOrLaborAccess, updateContractHandler);

// Ending a contract: liquidation (thanh lý) or termination (chấm dứt), with date and reason.
async function endContract(c: Context, kind: 'liquidated' | 'terminated') {
  const id = c.req.param('id') || '';
  const before = store.getContract(id);
  if (!before) return notFound(c);
  // Records imported without a status are in force
  if ((before.status || 'active') !== 'active') {
    return c.json({ error: 'Hợp đồng đã thanh lý hoặc chấm dứt.', code: 'CONTRACT_ALREADY_ENDED' }, 400);
  }
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const conflict = revisionConflict(c, before, body.expected_revision);
  if (conflict) return conflict;
  const date = body.date ?? vietnamToday();
  const reason = str(body.reason);
  if (!isDay(date)) return c.json({ error: 'Ngày không hợp lệ (YYYY-MM-DD).', code: 'VALIDATION_FAILED', params: { fields: 'date' } }, 400);
  if (kind === 'terminated' && !reason) {
    return c.json({ error: 'Cần nhập lý do chấm dứt hợp đồng.', code: 'TERMINATION_REASON_REQUIRED' }, 400);
  }
  const changes: Record<string, any> =
    kind === 'liquidated'
      ? { status: 'liquidated', status_raw: 'Thanh lý', liquidation_date: date, liquidation_note: reason }
      : { status: 'terminated', status_raw: 'Chấm dứt', termination_date: date, termination_reason: reason };
  const dateError = checkContractDates({ ...before, ...changes });
  if (dateError) return ruleResponse(c, dateError);

  const user = getAuthUser(c)!;
  const updated = store.updateContract(id, changes)!;
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'update', user, before, after: updated });
  audit(
    c,
    updated,
    'status_change',
    kind === 'liquidated' ? `Thanh lý hợp đồng ${updated.contract_number} (${date})` : `Chấm dứt hợp đồng ${updated.contract_number} (${date}): ${reason}`
  );
  await store.persistAsync();
  return c.json(updated);
}
contractsRouter.patch('/:id/liquidate', requireAdmin, (c) => endContract(c, 'liquidated'));
contractsRouter.post('/:id/terminate', requireAdmin, (c) => endContract(c, 'terminated'));

// POST /api/contracts/:id/appendices — phụ lục; with new_end_date it is a renewal (gia hạn)
contractsRouter.post('/:id/appendices', requireAdminOrLaborAccess, async (c) => {
  const id = c.req.param('id') || '';
  const contract = store.getContract(id);
  const user = getAuthUser(c)!;
  if (!contract) return notFound(c);
  if (!canWriteRecord(user, 'contract', contract)) {
    return c.json({ error: 'Bạn chỉ được phân quyền chỉnh sửa mục Hợp đồng Lao động.', code: 'LABOR_ONLY_EDIT' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const conflict = revisionConflict(c, contract, body.expected_revision);
  if (conflict) return conflict;
  const appendixNumber = str(body.appendix_number, 100);
  const title = str(body.title, 500);
  const signedDate = body.signed_date;
  const newEnd = body.new_end_date ?? null;
  const newValue = body.new_value === undefined || body.new_value === null || body.new_value === '' ? null : Number(body.new_value);
  const invalid = (fields: string, error: string) => c.json({ error, code: 'APPENDIX_INVALID', params: { fields } }, 400);
  if (!appendixNumber || !title) return invalid('appendix_number, title', 'Cần nhập số và tên phụ lục.');
  if (!isDay(signedDate)) return invalid('signed_date', 'Ngày ký phụ lục không hợp lệ (YYYY-MM-DD).');
  if (contract.signed_date && signedDate < String(contract.signed_date).slice(0, 10)) {
    return invalid('signed_date', 'Phụ lục không thể ký trước hợp đồng.');
  }
  if (newEnd !== null && (!isDay(newEnd) || (contract.end_date && newEnd <= String(contract.end_date).slice(0, 10)))) {
    return invalid('new_end_date', 'Ngày gia hạn phải sau ngày kết thúc hiện tại.');
  }
  if (newValue !== null && (!Number.isFinite(newValue) || newValue < 0)) return invalid('new_value', 'Giá trị không hợp lệ.');
  const list = ((contract as any).appendices as Appendix[]) || [];
  if (list.some((a) => a.appendix_number.toLowerCase() === appendixNumber.toLowerCase())) {
    return c.json({ error: `Số phụ lục "${appendixNumber}" đã tồn tại.`, code: 'APPENDIX_NUMBER_TAKEN', params: { number: appendixNumber } }, 409);
  }
  const appendix: Appendix = {
    id: `apx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    appendix_number: appendixNumber,
    title,
    signed_date: signedDate,
    new_end_date: newEnd,
    new_value: newValue,
    summary: str(body.summary),
    previous_end_date: contract.end_date ?? null,
    previous_value: contract.value ?? null,
    created_at: new Date().toISOString(),
    created_by: user.id,
  };
  const changes: Record<string, any> = { appendices: [...list, appendix] };
  if (newEnd) changes.end_date = newEnd;
  if (newValue !== null) changes.value = newValue;
  const updated = store.updateContract(id, changes)!;
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'update', user, before: contract, after: updated });
  audit(c, updated, 'update', `Thêm phụ lục ${appendixNumber}${newEnd ? ` (gia hạn đến ${newEnd})` : ''} cho hợp đồng ${updated.contract_number}`);
  await store.persistAsync();
  return c.json({ appendix, contract: updated }, 201);
});

// PUT /api/contracts/:id/links — related records: [{ type: 'document'|'contract', id }]
contractsRouter.put('/:id/links', requireAdminOrLaborAccess, async (c) => {
  const id = c.req.param('id') || '';
  const contract = store.getContract(id);
  const user = getAuthUser(c)!;
  if (!contract) return notFound(c);
  if (!canWriteRecord(user, 'contract', contract)) {
    return c.json({ error: 'Bạn chỉ được phân quyền chỉnh sửa mục Hợp đồng Lao động.', code: 'LABOR_ONLY_EDIT' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const conflict = revisionConflict(c, contract, body.expected_revision);
  if (conflict) return conflict;
  const raw = Array.isArray(body.links) ? body.links.slice(0, 50) : null;
  if (!raw) return c.json({ error: 'Danh sách liên kết không hợp lệ.', code: 'VALIDATION_FAILED', params: { fields: 'links' } }, 400);
  const links: Array<{ type: 'document' | 'contract'; id: string }> = [];
  for (const l of raw) {
    const type = l?.type;
    const target = type === 'document' ? store.getDocument(String(l.id)) : type === 'contract' ? store.getContract(String(l.id)) : null;
    const readable = type === 'document' ? canReadDocument(user, target as any) : canReadContract(user, target as any);
    if (!target || !readable || (type === 'contract' && target.id === id)) {
      return c.json({ error: 'Hồ sơ liên kết không tồn tại hoặc không có quyền.', code: 'LINK_TARGET_INVALID', params: { id: String(l?.id ?? '') } }, 400);
    }
    if (!links.some((x) => x.type === type && x.id === target.id)) links.push({ type, id: target.id });
  }
  const updated = store.updateContract(id, { linked_records: links } as any)!;
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'update', user, before: contract, after: updated });
  await store.persistAsync();
  return c.json(updated);
});

// DELETE /api/contracts/:id (Admin Only) — moves the contract to the trash (restorable)
contractsRouter.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const currentUser = getAuthUser(c)!;
  const contract = store.getContract(id);
  const trashed = contract ? store.trashRecord('contract', id, currentUser.id) : null;
  if (!contract || !trashed) return notFound(c);
  store.recordHistory({ record_type: 'contract', record_id: id, action: 'delete', user: currentUser, before: { deleted: false }, after: { deleted: true } });
  audit(c, contract, 'delete', `Chuyển hợp đồng ${contract.contract_number} vào thùng rác`);
  await store.persistAsync();
  return c.json({ success: true, trashed: true });
});
