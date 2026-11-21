import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { getAuthUser, requireAdmin } from './auth.ts';
import { canReadDocument, canReadContract, isAdmin } from '../utils/access.ts';
import type { NotificationRecord } from '../types.ts';
import type { UserProfile } from './auth.ts';

export const notificationsRouter = new Hono();

/**
 * A notification is shown only when the user is its recipient (unassigned legacy ones: admins only)
 * AND may read the record it is about, checked now — so revoked access, confidential documents and
 * records in the trash never leak through old notifications. A notification about a record that no
 * longer exists (purged) or is in the trash is shown to admins only.
 */
export function canSeeNotification(user: UserProfile, n: NotificationRecord): boolean {
  const mine = n.recipient_user_id ? n.recipient_user_id === user.id : isAdmin(user);
  if (!mine) return false;
  if (!n.target_id) return true;
  if (n.target_type === 'contract') {
    const live = store.getContract(n.target_id);
    return live ? canReadContract(user, live) : isAdmin(user);
  }
  // 'document' and legacy notifications without a target_type point at documents
  const live = store.getDocument(n.target_id);
  return live ? canReadDocument(user, live) : isAdmin(user);
}

function visibleNotifications(user: UserProfile): NotificationRecord[] {
  return store.getNotifications().filter((n) => canSeeNotification(user, n));
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
  const success = visibleNotifications(user).some((n) => n.id === id) && store.markNotificationAsRead(id);
  if (!success) return c.json({ error: 'Không tìm thấy thông báo', code: 'NOTIFICATION_NOT_FOUND' }, 404);
  await store.persistAsync();
  return c.json({ success });
});

// POST /api/notifications/read-all
notificationsRouter.post('/read-all', async (c) => {
  const user = getAuthUser(c)!;
  for (const n of visibleNotifications(user)) store.markNotificationAsRead(n.id);
  await store.persistAsync();
  return c.json({ success: true });
});

/**
 * POST /api/notifications/assign-legacy?apply=1 (admin) — notifications created before per-user
 * delivery have no recipient_user_id. A recipient is assigned only when the stored recipient name
 * matches exactly one active account; everything else stays admin-only. Without apply=1 this is a
 * dry run that only reports what would change.
 */
notificationsRouter.post('/assign-legacy', requireAdmin, async (c) => {
  const apply = c.req.query('apply') === '1';
  const legacy = store.getNotifications().filter((n) => !n.recipient_user_id);
  const assigned: Array<{ id: string; recipient: string | null; user_id: string }> = [];
  const unresolved: Array<{ id: string; recipient: string | null; reason: 'no_match' | 'ambiguous' | 'no_recipient' }> = [];
  for (const n of legacy) {
    if (!n.recipient) {
      unresolved.push({ id: n.id, recipient: null, reason: 'no_recipient' });
      continue;
    }
    const matches = store.findUsersByName(n.recipient);
    if (matches.length === 1) assigned.push({ id: n.id, recipient: n.recipient, user_id: matches[0].id });
    else unresolved.push({ id: n.id, recipient: n.recipient, reason: matches.length === 0 ? 'no_match' : 'ambiguous' });
  }
  if (apply && assigned.length > 0) {
    for (const a of assigned) store.setNotificationRecipient(a.id, a.user_id);
    const user = getAuthUser(c)!;
    store.recordAuditLog({
      user_id: user.id,
      username: user.username,
      action: 'update',
      entity_type: 'user',
      details: `Gán người nhận cho ${assigned.length} thông báo cũ (chỉ khi khớp duy nhất một tài khoản)`,
    });
    await store.persistAsync();
  }
  return c.json({ applied: apply, assigned, unresolved });
});
