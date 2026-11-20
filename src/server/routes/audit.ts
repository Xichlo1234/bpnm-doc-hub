import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { requireAdmin } from './auth.ts';

export const auditRouter = new Hono();

// Protect audit logs for Admin only
auditRouter.use('*', requireAdmin);

// GET /api/audit-logs
auditRouter.get('/', (c) => {
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 100;
  const logs = store.getAuditLogs(limit);
  return c.json(logs);
});
