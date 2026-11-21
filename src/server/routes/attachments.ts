import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { getDatabase } from '../db/database.ts';
import { getAuthUser } from './auth.ts';
import { canUploadFiles } from '../utils/access.ts';
import { storeAttachment } from '../utils/recordRequest.ts';
import { validateUpload, UploadValidationError } from '../utils/fileStorage.ts';
import {
  getRecord,
  canReadRecord,
  canWriteRecord,
  ensureLegacyAttachment,
  setPrimaryFile,
} from '../utils/attachments.ts';
import type { AttachmentRecordType } from '../types.ts';
import { revisionConflict } from '../utils/validation.ts';

export const attachmentsRouter = new Hono();

const RECORD_TYPES = new Set(['document', 'contract']);

function parseType(raw: string | undefined): AttachmentRecordType | null {
  return raw && RECORD_TYPES.has(raw) ? (raw as AttachmentRecordType) : null;
}

const notFound = (c: any) => c.json({ error: 'Không tìm thấy hồ sơ', code: 'RECORD_NOT_FOUND' }, 404);
const forbidden = (c: any) =>
  c.json({ error: 'Truy cập bị từ chối: Bạn không có quyền thực hiện thao tác này.', code: 'FORBIDDEN' }, 403);

// GET /api/attachments/:type/:id?versions=1 — current files of a record (and older versions)
attachmentsRouter.get('/:type/:id', async (c) => {
  const type = parseType(c.req.param('type'));
  const record = type ? getRecord(type, c.req.param('id')) : null;
  if (!type || !record) return notFound(c);
  if (!canReadRecord(getAuthUser(c), type, record)) return forbidden(c);
  const includeVersions = c.req.query('versions') === '1';
  // Records from before multi-file support show their single file as version 1
  const hasRows = store.getAttachments(type, record.id, { includeVersions: true, includeDeleted: true }).length > 0;
  if (!hasRows && record.file_key) {
    await ensureLegacyAttachment(await getDatabase(c.env), type, record);
  }
  return c.json({ attachments: store.getAttachments(type, record.id, { includeVersions }) });
});

// POST /api/attachments/:type/:id (multipart: file, replaces?, note?) — add a file or a new version
attachmentsRouter.post('/:type/:id', async (c) => {
  const user = getAuthUser(c)!;
  const type = parseType(c.req.param('type'));
  const record = type ? getRecord(type, c.req.param('id')) : null;
  if (!type || !record) return notFound(c);
  if (!canUploadFiles(user) || !canWriteRecord(user, type, record)) return forbidden(c);

  const form = await c.req.formData();
  const conflict = revisionConflict(c, record, form.get('expected_revision'));
  if (conflict) return conflict;
  const file = form.get('file');
  if (!file || typeof file !== 'object' || !('name' in file) || (file as File).size === 0) {
    return c.json({ error: 'Vui lòng chọn tệp để tải lên', code: 'FILE_REQUIRED' }, 400);
  }
  try {
    validateUpload(file as File);
  } catch (err) {
    if (err instanceof UploadValidationError) return c.json({ error: err.message, code: err.code, params: err.params }, 400);
    throw err;
  }
  const db = await getDatabase(c.env);
  await ensureLegacyAttachment(db, type, record);
  const replacesId = typeof form.get('replaces') === 'string' ? String(form.get('replaces')) : '';
  const replaced = replacesId ? store.getAttachment(replacesId) : null;
  if (replacesId && (!replaced || replaced.record_id !== record.id || replaced.record_type !== type || replaced.deleted_at || !replaced.is_current)) {
    return c.json({ error: 'Không tìm thấy tệp cần thay thế', code: 'ATTACHMENT_NOT_FOUND' }, 404);
  }
  const note = typeof form.get('note') === 'string' ? String(form.get('note')).slice(0, 500) : null;

  const stored = await storeAttachment(c, file as File, user.id);
  const sha256 = stored.sha256;
  const att = store.addAttachment({
    record_type: type,
    record_id: record.id,
    file_key: stored.fields.file_key,
    original_name: stored.fields.file_name,
    size: stored.fields.file_size,
    mime_type: stored.fields.file_type,
    sha256,
    note,
    uploaded_by: user.id,
    replaces: replaced?.id ?? null,
  });

  // The record's primary file follows: first file, or a new version of the primary one
  const isPrimary = !record.file_key || Boolean(replaced && replaced.file_key === record.file_key);
  const updated = isPrimary ? setPrimaryFile(type, record.id, att) : null;
  store.recordHistory({
    record_type: type,
    record_id: record.id,
    action: replaced ? 'replace_file' : 'attach',
    user,
    before: replaced ? { file: `${replaced.original_name} (v${replaced.version})` } : null,
    after: { file: `${att.original_name} (v${att.version})`, sha256: att.sha256 },
    revision: (updated ?? record).revision ?? null,
  });
  store.recordAuditLog({
    user_id: user.id,
    username: user.username,
    action: 'update',
    entity_type: type,
    entity_id: record.id,
    entity_title: type === 'document' ? (record as any).document_number : (record as any).contract_number,
    details: `${replaced ? 'Thay thế' : 'Đính kèm'} tệp ${att.original_name} (phiên bản ${att.version})`,
  });

  try {
    await store.persistAsync();
  } catch (err) {
    await stored.rollback();
    throw err;
  }
  return c.json({ attachment: att, record: updated ?? getRecord(type, record.id) }, 201);
});

// DELETE /api/attachments/:attId — removes an attachment (all its versions) from the record.
// The rows are kept (deleted_at) and the files stay in R2 until the record is purged.
attachmentsRouter.delete('/:attId', async (c) => {
  const user = getAuthUser(c)!;
  const att = store.getAttachment(c.req.param('attId'));
  if (!att || att.deleted_at) return c.json({ error: 'Không tìm thấy tệp', code: 'ATTACHMENT_NOT_FOUND' }, 404);
  const record = getRecord(att.record_type, att.record_id);
  if (!record) return notFound(c);
  if (!canWriteRecord(user, att.record_type, record)) return forbidden(c);
  const conflict = revisionConflict(c, record, c.req.query('expected_revision'));
  if (conflict) return conflict;

  const seriesKeys = new Set(
    store.getAttachments(att.record_type, att.record_id, { includeVersions: true }).filter((a) => a.series_id === att.series_id).map((a) => a.file_key)
  );
  store.softDeleteAttachment(att.id, user.id);
  let updated = null;
  if (record.file_key && seriesKeys.has(record.file_key)) {
    const next = store.getAttachments(att.record_type, att.record_id)[0] ?? null;
    updated = setPrimaryFile(att.record_type, att.record_id, next);
  }
  store.recordHistory({
    record_type: att.record_type,
    record_id: att.record_id,
    action: 'detach',
    user,
    before: { file: `${att.original_name} (v${att.version})` },
    after: null,
    revision: (updated ?? record).revision ?? null,
  });
  await store.persistAsync();
  return c.json({ success: true, record: updated ?? getRecord(att.record_type, att.record_id) });
});
