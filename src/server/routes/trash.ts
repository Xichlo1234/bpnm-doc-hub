import { Hono } from 'hono';
import { store, type TrashRecordType } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { getDatabase } from '../db/database.ts';
import { referencedFileKeys } from '../utils/attachments.ts';
import { enqueueCleanupStatement, processCleanup } from '../utils/storageCleanup.ts';

// Trash (soft-deleted records). Admin only: deleting is admin-only too.
export const trashRouter = new Hono();
trashRouter.use('*', requireAdmin);

const TYPES = new Set(['document', 'contract', 'partner']);
const parseType = (raw?: string) => (raw && TYPES.has(raw) ? (raw as TrashRecordType) : null);
const titleOf = (rec: any) => rec?.document_number || rec?.contract_number || rec?.code || rec?.id;

// GET /api/trash
trashRouter.get('/', (c) => c.json(store.getTrash()));

// POST /api/trash/:type/:id/restore
trashRouter.post('/:type/:id/restore', async (c) => {
  const type = parseType(c.req.param('type'));
  const id = c.req.param('id');
  const user = getAuthUser(c)!;
  if (type === 'partner') {
    // A new partner may have taken this code while it was in the trash
    const trashed = store.getPartner(id, { includeDeleted: true });
    const clash = trashed && store.getPartners().find((p) => p.id !== id && p.code.trim().toUpperCase() === trashed.code.trim().toUpperCase());
    if (clash) {
      return c.json({ error: `Mã đối tác '${trashed!.code}' đã được dùng cho đối tác khác.`, code: 'PARTNER_CODE_TAKEN', params: { code: trashed!.code } }, 409);
    }
  }
  const restored = type ? store.restoreRecord(type, id) : null;
  if (!type || !restored) return c.json({ error: 'Không tìm thấy hồ sơ trong thùng rác', code: 'TRASH_ITEM_NOT_FOUND' }, 404);
  if (type !== 'partner') {
    store.recordHistory({ record_type: type, record_id: id, action: 'restore', user, before: { deleted: true }, after: { deleted: false } });
  }
  store.recordAuditLog({
    user_id: user.id,
    username: user.username,
    action: 'update',
    entity_type: type,
    entity_id: id,
    entity_title: titleOf(restored),
    details: `Khôi phục từ thùng rác: ${titleOf(restored)}`,
  });
  await store.persistAsync();
  return c.json({ success: true, record: restored });
});

// DELETE /api/trash/:type/:id — permanent. Stored files the record held are enqueued for deletion
// in the same transaction (storage_cleanup); after the commit they are deleted only if the database
// shows no other record or attachment still uses them. A failed deletion is recorded and retried
// (POST /api/admin/storage-cleanup); the file stays retired either way.
trashRouter.delete('/:type/:id', async (c) => {
  const type = parseType(c.req.param('type'));
  const id = c.req.param('id');
  const user = getAuthUser(c)!;
  const record = type ? store.getTrash()[`${type}s` as 'documents'].find((r: any) => r.id === id) : null;
  const keys = type && record ? store.purgeRecord(type, id) : null;
  if (!type || !keys) return c.json({ error: 'Không tìm thấy hồ sơ trong thùng rác', code: 'TRASH_ITEM_NOT_FOUND' }, 404);
  if (type !== 'partner') store.recordHistory({ record_type: type, record_id: id, action: 'purge', user, before: { deleted: true }, after: null });
  store.recordAuditLog({
    user_id: user.id,
    username: user.username,
    action: 'delete',
    entity_type: type,
    entity_id: id,
    entity_title: titleOf(record),
    details: `Xóa vĩnh viễn: ${titleOf(record)}`,
  });
  const stillUsed = referencedFileKeys();
  const candidates = keys.filter((key) => key.startsWith('uploads/') && !stillUsed.has(key));
  for (const key of candidates) store.queueStatement((db) => enqueueCleanupStatement(db, key, `purge ${type}:${id}`, user.id));
  await store.persistAsync();

  const cleanup = await processCleanup(await getDatabase(c.env), c.env, candidates);
  return c.json({ success: true, removed_files: cleanup.deleted, kept_files: cleanup.kept, failed_files: cleanup.failed });
});
