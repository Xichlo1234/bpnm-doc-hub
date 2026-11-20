import { Hono } from 'hono';
import { store, type TrashRecordType } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { deleteStoredFile } from '../utils/fileStorage.ts';
import { referencedFileKeys } from '../utils/attachments.ts';

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

// DELETE /api/trash/:type/:id — permanent. Files that nothing else references are removed from R2
// after the database commit, so a failed commit never loses a file.
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
  await store.persistAsync();

  const stillUsed = referencedFileKeys();
  const removed: string[] = [];
  for (const key of keys) {
    if (key.startsWith('uploads/') && !stillUsed.has(key)) {
      await deleteStoredFile(key, c.env).catch((err) => console.warn('Could not delete file', key, err));
      removed.push(key);
    }
  }
  return c.json({ success: true, removed_files: removed });
});
