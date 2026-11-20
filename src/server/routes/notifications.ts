import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { getAuthUser } from './auth.ts';
import { canReadDocument, canReadContract } from '../utils/access.ts';
import type { NotificationRecord } from '../types.ts';
import type { UserProfile } from './auth.ts';

export const notificationsRouter = new Hono();

// A user only sees their own notifications, and never one about a record they cannot open.
function visibleNotifications(user: UserProfile): NotificationRecord[] {
  return store.getNotificationsForUser(user).filter((n) => {
    if (!n.target_id) return true;
    if (n.target_type === 'document') return canReadDocument(user, store.getDocument(n.target_id)) || !store.getDocument(n.target_id);
    if (n.target_type === 'contract') return canReadContract(user, store.getContract(n.target_id)) || !store.getContract(n.target_id);
    return true;
  });
}

// GET /api/notifications
notificationsRouter.get('/', (c) => {
  const notifs = visibleNotifications(getAuthUser(c)!);
  return c.json({ notifications: notifs, unreadCount: notifs.filter((n) => !n.read).length });
});

// PATCH /api/notifications/:id/read
notificationsRouter.patch('/:id/read', async (c) => {
  const id = c.req.param('id');
  const user = getAuthUser(c)!;
  const success = visibleNotifications(user).some((n) => n.id === id) && store.markNotificationAsRead(id, user);
  if (!success) return c.json({ error: 'Không tìm thấy thông báo', code: 'NOTIFICATION_NOT_FOUND' }, 404);
  await store.persistAsync();
  return c.json({ success });
});

// POST /api/notifications/read-all
notificationsRouter.post('/read-all', async (c) => {
  store.markAllNotificationsAsRead(getAuthUser(c)!);
  await store.persistAsync();
  return c.json({ success: true });
});
