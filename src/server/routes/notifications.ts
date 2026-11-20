import { Hono } from 'hono';
import { store } from '../db/store.ts';

export const notificationsRouter = new Hono();

// GET /api/notifications
notificationsRouter.get('/', (c) => {
  const notifs = store.getNotifications();
  const unreadCount = notifs.filter(n => !n.read).length;
  return c.json({
    notifications: notifs,
    unreadCount,
  });
});

// PATCH /api/notifications/:id/read
notificationsRouter.patch('/:id/read', async (c) => {
  const id = c.req.param('id');
  const success = store.markNotificationAsRead(id);
  await store.persistAsync();
  return c.json({ success });
});

// POST /api/notifications/read-all
notificationsRouter.post('/read-all', async (c) => {
  store.markAllNotificationsAsRead();
  await store.persistAsync();
  return c.json({ success: true });
});
