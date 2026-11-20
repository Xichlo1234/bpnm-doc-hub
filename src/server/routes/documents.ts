import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { saveUploadedFile } from '../utils/fileStorage.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { documentInput, parseInput, withoutUnchangedLinks, revisionConflict } from '../utils/validation.ts';

export const documentsRouter = new Hono();

// GET /api/documents?type=incoming|outgoing|decision|internal|all
documentsRouter.get('/', (c) => {
  const type = c.req.query('type');
  const docs = store.getDocuments(type);
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

  const currentUser = getAuthUser(c);
  const result = store.bulkUpsertDocuments(docsList);
  await store.persistAsync();

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'import',
    entity_type: 'document',
    details: `Nhập file Excel văn bản: Thêm mới ${result.added}, Cập nhật ${result.updated}`,
  });

  return c.json({
    success: true,
    message: `Đã cập nhật ${result.updated} văn bản và thêm mới ${result.added} văn bản thành công. Tổng số: ${result.total}`,
    ...result,
  });
});

// POST /api/documents (Admin Only)
documentsRouter.post('/', requireAdmin, async (c) => {
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
    body.doc_type = body.doc_type || 'internal';
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

  const parsed = parseInput(c, documentInput.create, body);
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

  if (!body.document_number || !body.title) {
    return c.json({ error: 'Missing required fields (document_number, title)', code: 'DOCUMENT_FIELDS_REQUIRED' }, 400);
  }
  if (!body.issue_date) {
    body.issue_date = new Date().toISOString().substring(0, 10);
  }

  const currentUser = getAuthUser(c);
  const newDoc = store.createDocument(body);

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'create',
    entity_type: 'document',
    entity_id: newDoc.id,
    entity_title: newDoc.document_number,
    details: `Tạo văn bản ${newDoc.document_number} - ${newDoc.title}`,
  });

  await store.persistAsync();
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
  const currentUser = getAuthUser(c);
  const updated = store.updateDocument(id, changes);
  if (!updated) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }

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
  const currentUser = getAuthUser(c);
  const updated = store.updateDocument(id, changes);
  if (!updated) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }

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

// DELETE /api/documents/:id (Admin Only)
documentsRouter.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const doc = store.getDocument(id);
  const currentUser = getAuthUser(c);
  const success = store.deleteDocument(id);
  if (!success) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'delete',
    entity_type: 'document',
    entity_id: id,
    entity_title: doc?.document_number || id,
    details: `Xóa văn bản ${doc?.document_number || id}`,
  });

  await store.persistAsync();
  return c.json({ success: true });
});
