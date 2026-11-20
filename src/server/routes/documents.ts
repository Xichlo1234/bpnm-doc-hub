import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { canReadDocument } from '../utils/access.ts';
import { readRecordRequest, storeAttachment, applyCloudLink } from '../utils/recordRequest.ts';
import { syncPrimaryAttachment } from '../utils/attachments.ts';
import { getDatabase } from '../db/database.ts';
import { documentInput, parseInput, withoutUnchangedLinks, revisionConflict } from '../utils/validation.ts';

export const documentsRouter = new Hono();

// GET /api/documents?type=incoming|outgoing|decision|internal|all
documentsRouter.get('/', (c) => {
  const type = c.req.query('type');
  const user = getAuthUser(c);
  const docs = store.getDocuments(type).filter((d) => canReadDocument(user, d));
  return c.json(docs);
});

// GET /api/documents/categories
documentsRouter.get('/categories', (c) => {
  return c.json(store.getCategories());
});

// GET /api/documents/next-number?type=incoming|outgoing&category=CV&department=HCNS
documentsRouter.get('/next-number', (c) => {
  const type = (c.req.query('type') as 'incoming' | 'outgoing') || 'incoming';
  const category = c.req.query('category') || 'CV';
  const department = c.req.query('department') || 'HCNS';
  const nextNum = store.getNextDocumentNumber(type, category, department);
  return c.json({ nextNumber: nextNum });
});

// GET /api/documents/:id
documentsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const doc = store.getDocument(id);
  if (!doc) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }
  if (!canReadDocument(getAuthUser(c), doc)) {
    return c.json({ error: 'Văn bản mật: Bạn không có quyền xem hồ sơ này.', code: 'DOCUMENT_FORBIDDEN' }, 403);
  }
  return c.json(doc);
});

// POST /api/documents/bulk-import (Import / Bulk Update Documents from Excel/CSV - Admin Only)
documentsRouter.post('/bulk-import', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawList = Array.isArray(body) ? body : body.documents;
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return c.json({ error: 'Danh sách văn bản không hợp lệ hoặc rỗng', code: 'DOCUMENT_LIST_INVALID' }, 400);
  }
  // Rows re-imported from an export carry legacy link values unchanged; match rows like the store does
  const byNumber = new Map(store.getDocuments().map((r) => [String(r.document_number).trim().toLowerCase(), r]));
  const rows = rawList.map((row: any) =>
    withoutUnchangedLinks(row, (row?.id && store.getDocument(row.id)) || byNumber.get(String(row?.document_number ?? '').trim().toLowerCase()) || null)
  );
  const parsed = parseInput(c, documentInput.bulk, rows);
  if (!parsed.ok) return parsed.response;
  const docsList = parsed.data;

  const currentUser = getAuthUser(c)!;
  const result = store.bulkUpsertDocuments(docsList);
  for (const ch of result.changes) {
    store.recordHistory({ record_type: 'document', record_id: ch.id, action: 'import', user: currentUser, before: ch.before, after: ch.after });
  }

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'import',
    entity_type: 'document',
    details: `Nhập file Excel văn bản: Thêm mới ${result.added}, Cập nhật ${result.updated}`,
  });
  await store.persistAsync();

  const { changes, ...counts } = result;
  return c.json({
    success: true,
    message: `Đã cập nhật ${result.updated} văn bản và thêm mới ${result.added} văn bản thành công. Tổng số: ${result.total}`,
    ...counts,
  });
});

// POST /api/documents (Admin Only)
documentsRouter.post('/', requireAdmin, async (c) => {
  const request = await readRecordRequest(c);
  if (request.file) request.body.doc_type = request.body.doc_type || 'internal';

  const parsed = parseInput(c, documentInput.create, request.body);
  if (!parsed.ok) return parsed.response;
  const body: any = parsed.data;
  applyCloudLink(body);

  if (!body.document_number || !body.title) {
    return c.json({ error: 'Missing required fields (document_number, title)', code: 'DOCUMENT_FIELDS_REQUIRED' }, 400);
  }
  if (!body.issue_date) {
    body.issue_date = new Date().toISOString().substring(0, 10);
  }

  const currentUser = getAuthUser(c)!;
  const attachment = request.file ? await storeAttachment(c, request.file, currentUser.id) : null;
  if (attachment) Object.assign(body, attachment.fields);

  const newDoc = store.createDocument(body);
  await syncPrimaryAttachment(await getDatabase(c.env), 'document', null, newDoc, currentUser.id);
  store.recordHistory({ record_type: 'document', record_id: newDoc.id, action: 'create', user: currentUser, before: null, after: newDoc });
  store.recordAuditLog({
    user_id: currentUser.id,
    username: currentUser.username,
    action: 'create',
    entity_type: 'document',
    entity_id: newDoc.id,
    entity_title: newDoc.document_number,
    details: `Tạo văn bản ${newDoc.document_number} - ${newDoc.title}`,
  });

  try {
    await store.persistAsync();
  } catch (err) {
    // The record was not saved: do not keep its file
    await attachment?.rollback();
    throw err;
  }
  return c.json(newDoc, 201);
});

// PUT /api/documents/:id (Admin Only)
documentsRouter.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const rawBody = await c.req.json().catch(() => null);
  const current = store.getDocument(id);
  const parsed = parseInput(c, documentInput.update, withoutUnchangedLinks(rawBody, current));
  if (!parsed.ok) return parsed.response;
  const { expected_revision, ...changes } = parsed.data as Record<string, any>;
  const conflict = revisionConflict(c, current, expected_revision);
  if (conflict) return conflict;
  const currentUser = getAuthUser(c)!;
  const updated = store.updateDocument(id, changes);
  if (!updated) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }
  await syncPrimaryAttachment(await getDatabase(c.env), 'document', current, updated, currentUser.id);
  store.recordHistory({ record_type: 'document', record_id: id, action: 'update', user: currentUser, before: current, after: updated });

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'update',
    entity_type: 'document',
    entity_id: id,
    entity_title: updated.document_number,
    details: `Cập nhật văn bản ${updated.document_number}`,
  });

  await store.persistAsync();
  return c.json(updated);
});

// PATCH /api/documents/:id (Admin Only)
documentsRouter.patch('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const rawBody = await c.req.json().catch(() => null);
  const current = store.getDocument(id);
  const parsed = parseInput(c, documentInput.update, withoutUnchangedLinks(rawBody, current));
  if (!parsed.ok) return parsed.response;
  const { expected_revision, ...changes } = parsed.data as Record<string, any>;
  const conflict = revisionConflict(c, current, expected_revision);
  if (conflict) return conflict;
  const currentUser = getAuthUser(c)!;
  const updated = store.updateDocument(id, changes);
  if (!updated) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }
  await syncPrimaryAttachment(await getDatabase(c.env), 'document', current, updated, currentUser.id);
  store.recordHistory({ record_type: 'document', record_id: id, action: 'update', user: currentUser, before: current, after: updated });

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'update',
    entity_type: 'document',
    entity_id: id,
    entity_title: updated.document_number,
    details: `Chỉnh sửa văn bản ${updated.document_number}`,
  });

  await store.persistAsync();
  return c.json(updated);
});

// DELETE /api/documents/:id (Admin Only) — moves the document to the trash (restorable)
documentsRouter.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const currentUser = getAuthUser(c)!;
  const doc = store.getDocument(id);
  const trashed = doc ? store.trashRecord('document', id, currentUser.id) : null;
  if (!doc || !trashed) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }
  store.recordHistory({ record_type: 'document', record_id: id, action: 'delete', user: currentUser, before: { deleted: false }, after: { deleted: true } });
  store.recordAuditLog({
    user_id: currentUser.id,
    username: currentUser.username,
    action: 'delete',
    entity_type: 'document',
    entity_id: id,
    entity_title: doc.document_number,
    details: `Chuyển văn bản ${doc.document_number} vào thùng rác`,
  });

  await store.persistAsync();
  return c.json({ success: true, trashed: true });
});
