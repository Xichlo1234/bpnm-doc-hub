import { Hono } from 'hono';
import { getDatabase } from '../db/database.ts';
import { queryHistory } from '../db/repository.ts';
import { getAuthUser } from './auth.ts';
import { store } from '../db/store.ts';
import { canReadRecord } from '../utils/attachments.ts';
import { isAdmin } from '../utils/access.ts';

export const historyRouter = new Hono();

// GET /api/history/:type/:id — field-level edit history of a document or contract
historyRouter.get('/:type/:id', async (c) => {
  const type = c.req.param('type');
  const id = c.req.param('id');
  if (type !== 'document' && type !== 'contract') {
    return c.json({ error: 'Loại hồ sơ không hợp lệ (hỗ trợ: contract, document)', code: 'RECORD_KIND_INVALID' }, 400);
  }
  const user = getAuthUser(c);
  const record = type === 'document' ? store.getDocument(id, { includeDeleted: true }) : store.getContract(id, { includeDeleted: true });
  if (!record || (record.deleted_at && !isAdmin(user))) {
    return c.json({ error: 'Không tìm thấy hồ sơ', code: 'RECORD_NOT_FOUND' }, 404);
  }
  if (!canReadRecord(user, type, record)) {
    return c.json({ error: 'Truy cập bị từ chối: Bạn không có quyền thực hiện thao tác này.', code: 'FORBIDDEN' }, 403);
  }
  return c.json({ history: await queryHistory(await getDatabase(c.env), type, id) });
});
